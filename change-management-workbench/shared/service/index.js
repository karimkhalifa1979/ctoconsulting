// Domain service: every read and write goes through here, whether it arrives over the REST API
// (server mode) or directly from the browser (stand-alone demo mode). It enforces validation,
// access control (SEC-02), field-level security (STK-048), optimistic concurrency (WFL-007),
// the closed-initiative read-only rule (SUS-007) and audit logging (SEC-05).
import { ENTITIES, entity, fieldsOf, sensitiveKeys, INITIATIVE_TYPES } from '../schema.js';
import { validateRecord, normalise } from '../validate.js';
import { can, canSeeSensitive, redact, initiativeAccess, scopeContext, hasRole, ROLES } from '../access.js';
import { mergeSettings, buildModel } from '../model.js';
import { INTERVENTIONS, QUESTION_SETS, READINESS_CHECKLISTS, FOCUS_RULES, DEFAULT_LISTS } from '../refdata.js';
import { AppError, uid, pad, asArray, clone, isEmpty, personName, sortBy } from '../util.js';
import { todayIso } from '../dates.js';
import { ConflictError } from '../memoryDriver.js';
import { dataset, DATASETS } from '../reporting.js';
import { matchesRules } from '../rules/engagements.js';
import { HOOKS } from './hooks.js';
import { registerEngagementOps } from './ops/engagements.js';
import { registerWorkflowOps } from './ops/workflow.js';
import { registerStakeholderOps } from './ops/stakeholders.js';
import { registerPlanningOps } from './ops/planning.js';
import { registerInitiativeOps } from './ops/initiatives.js';
import { registerAdminOps } from './ops/admin.js';
import { registerArtefactOps } from './ops/artefacts.js';

export const SYSTEM = { id: 'system', name: 'System', roles: ['changeLead', 'admin'], system: true };

// Fields that only the service sets.
const SYSTEM_KEYS = ['id', 'type', 'code', 'version', 'seq', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deleted', '_redacted'];

// Every id-like string held anywhere in the given records (record ids are unique, so these can be matched
// against the master).
function collectIds(value, out) {
  if (typeof value === 'string') { if (value.length >= 8 && value.length <= 64 && !/\s/.test(value)) out.add(value); }
  else if (Array.isArray(value)) for (const v of value) collectIds(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectIds(v, out);
  return out;
}

// The fields global search looks in for each record type (never sensitive ones).
const SEARCH_KEYS = {};
const searchKeys = (type) => (SEARCH_KEYS[type] ||= fieldsOf(type).filter((f) => ['text', 'textarea', 'richtext', 'email'].includes(f.type) && !f.sensitive).map((f) => f.key));

export function createService({ driver, env = {} }) {
  const now = env.now || (() => new Date());
  const nowIso = () => now().toISOString();
  let configCache = null;
  const ctxCache = new Map();
  const modelCache = new Map();
  // Large stakeholder masters (PER-04): above this many people, an initiative's working set holds only the
  // stakeholders it uses, and pickers search the master on the server.
  const SCOPE_AT = Number(env.scopeThreshold ?? 5000);
  const scopeCache = new Map();
  let enterpriseVersion = 0;
  let stakeholderIndex = null;

  const S = { driver, env, now, nowIso, SYSTEM, ops: {}, opMeta: {} };

  // --- Configuration (ADM-001 to ADM-010) -------------------------------------------------------------
  S.getConfig = async () => {
    if (configCache) return configCache;
    const keys = ['settings', 'lists', 'customFields', 'interventions', 'questionSets', 'readinessChecklists', 'focusRules', 'riskMatrix'];
    const vals = await Promise.all(keys.map((k) => driver.getConfig(k)));
    const raw = Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
    const settings = mergeSettings(raw.settings || {});
    if (raw.riskMatrix) settings.riskMatrix = raw.riskMatrix;
    configCache = {
      settings,
      lists: { ...DEFAULT_LISTS, ...(raw.lists || {}) },
      customFields: raw.customFields || {},
      interventions: raw.interventions || INTERVENTIONS,
      questionSets: { ...QUESTION_SETS, ...(raw.questionSets || {}) },
      readinessChecklists: raw.readinessChecklists || READINESS_CHECKLISTS,
      focusRules: raw.focusRules || FOCUS_RULES,
    };
    return configCache;
  };
  S.invalidateConfig = () => { configCache = null; ctxCache.clear(); modelCache.clear(); scopeCache.clear(); enterpriseVersion++; stakeholderIndex = null; };
  S.today = async () => todayIso((await S.getConfig()).settings.timeZone, now());

  // --- Audit (SEC-05: tamper-evident hash chain) ----------------------------------------------------------
  S.audit = (actor, evt) => driver.appendAudit({ ts: nowIso(), userId: actor?.id || 'system', userName: actor?.name || 'System', ...evt });

  // --- Notifications (WFL-003) -----------------------------------------------------------------------------
  // People may mute the kinds of notification they do not want; approvals, task assignments, mentions,
  // leavers and resistance escalations are always delivered.
  const ESSENTIAL = new Set(['approval', 'task', 'mention', 'leaver', 'resistance']);
  S.notify = async (userIds, n) => {
    const ids = [...new Set(asArray(userIds).filter((x) => x && x !== 'system'))];
    const out = [];
    for (const userId of ids) {
      if (!ESSENTIAL.has(n.kind) && asArray((await driver.get('user', userId))?.notify?.mute).includes(n.kind)) continue;
      const rec = { id: uid(), type: 'notification', initiativeId: n.initiativeId || null, code: null, version: 1, createdAt: nowIso(), createdBy: 'system', updatedAt: nowIso(), updatedBy: 'system', userId, kind: n.kind || 'info', title: n.title, body: n.body || '', link: n.link || null, read: false };
      await driver.put(rec);
      out.push(rec);
      try { await env.onNotify?.(rec, S); } catch (e) { env.log?.('warn', 'Notification delivery failed', e.message); }
    }
    return out;
  };

  S.emit = async (event, payload) => {
    try { await env.onEvent?.(event, payload, S); } catch (e) { env.log?.('warn', 'Event delivery failed', e.message); }
  };

  // --- Access helpers -----------------------------------------------------------------------------------
  S.initiative = async (id) => (id ? driver.get('initiative', id) : null);

  S.accessCtx = async (actor, initiativeId) => {
    if (!actor || actor.system) return { allSensitive: true };
    const config = await S.getConfig();
    const base = { practitionerScope: config.settings.privacy?.practitionerSensitiveScope || 'assigned' };
    if (!initiativeId || !hasRole(actor, 'peopleManager', 'changeAgent')) return base;
    const key = `${actor.id}:${initiativeId}`;
    const hit = ctxCache.get(key);
    if (hit && hit.at > Date.now() - 60000) return hit.ctx;
    const model = await S.model(initiativeId);
    const ctx = { ...base, ...scopeContext(actor, model, config.settings) };
    ctxCache.set(key, { at: Date.now(), ctx });
    return ctx;
  };

  const verb = { C: 'create', R: 'view', U: 'change', D: 'delete', A: 'approve' };
  S.assertCan = (actor, action, type, record, ctx) => {
    if (actor?.system) return;
    if (!can(actor, action, type, record, ctx)) throw new AppError(403, `You do not have permission to ${verb[action]} ${entity(type).plural.toLowerCase()}${record?.code ? ` (${record.code})` : ''}.`);
  };

  S.assertInitiative = (actor, initiative) => {
    if (!initiative || actor?.system) return;
    if (!initiativeAccess(actor, initiative.id)) throw new AppError(403, 'You are not assigned to this initiative.');
  };

  const POST_CLOSE_TYPES = new Set(['measureValue', 'task', 'comment', 'notification', 'artefact']);
  S.assertWritable = (initiative, type, actor) => {
    if (!initiative || actor?.system) return;
    if (initiative.status === 'closed' && !POST_CLOSE_TYPES.has(type)) throw new AppError(409, 'This initiative is closed and read-only (SUS-007).');
  };

  // Secrets (API client secret hashes, webhook signing secrets, password hashes) never leave the service.
  const SECRET_KEYS = Object.fromEntries(Object.entries(ENTITIES).map(([t, e]) => [t, e.fields.filter((f) => f.secret).map((f) => f.key)]).filter(([, ks]) => ks.length));
  S.redactFor = async (actor, type, rec, ctx) => {
    if (!rec || actor?.system) return rec;
    const config = await S.getConfig();
    let out = redact(actor, type, rec, config, ctx);
    if (SECRET_KEYS[type] || type === 'user') {
      out = { ...out };
      for (const k of SECRET_KEYS[type] || []) delete out[k];
      if (type === 'user') delete out.passwordHash;
    }
    if (type === 'profile' && out._redacted?.length) {
      const sens = new Set(sensitiveKeys('profile', config));
      out = { ...out, ratingHistory: asArray(out.ratingHistory).filter((h) => !sens.has(h.field)) };
    }
    return out;
  };

  // --- Generic record operations -----------------------------------------------------------------------------
  const scopeKeyOf = (meta, initiativeId) => (meta.scope === 'initiative' || (meta.scope === 'any' && initiativeId) ? initiativeId : 'global');

  S.makeCode = async (type, initiativeId) => {
    const meta = entity(type);
    if (!meta.prefix) return null;
    const n = await driver.nextCode(scopeKeyOf(meta, initiativeId), meta.prefix);
    return `${meta.prefix}-${pad(n, ['engagement', 'feedback', 'surveyResponse', 'notification', 'task'].includes(type) ? 4 : 3)}`;
  };

  function maskedChanges(type, before, after, config) {
    const sens = new Set(sensitiveKeys(type, config));
    const changes = [];
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    for (const k of keys) {
      if (SYSTEM_KEYS.includes(k) || k === 'statusHistory' || k === 'ratingHistory') continue;
      const a = before?.[k], b = after?.[k];
      if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
      const short = (v) => (v == null ? null : typeof v === 'string' ? (v.length > 200 ? `${v.slice(0, 200)}…` : v) : JSON.stringify(v).slice(0, 200));
      changes.push(sens.has(k) ? { field: k, sensitive: true } : { field: k, from: short(a), to: short(b) });
    }
    return changes;
  }

  // Writes through the public record API (the REST record routes and the browser client's equivalents)
  // cannot set read-only fields, which only the service's own operations and rules maintain, and cannot
  // create, change or delete records that only the workflow manages. Creating a record may still say where
  // it came from (for example the feedback an FAQ was drafted from).
  const PROVENANCE = new Set(['sourceType', 'sourceId', 'raisedFromType', 'raisedFromId', 'recordType', 'recordId']);
  const WORKFLOW_ONLY = new Set(['approval', 'notification', 'artefact', 'planBaseline', 'planChange', 'surveyResponse', 'apiClient', 'webhook']);
  const KEEP_ON_REMOVE = new Set(['approval', 'notification', 'planBaseline', 'planChange', 'surveyResponse']);
  const guardExternal = (type, data, config, action) => {
    if (action !== 'remove' && WORKFLOW_ONLY.has(type)) throw new AppError(403, `${entity(type).plural} are managed by the application's workflow and cannot be ${action === 'create' ? 'created' : 'changed'} directly.`);
    if (action === 'remove' && KEEP_ON_REMOVE.has(type)) throw new AppError(403, `${entity(type).plural} are kept as part of the record and cannot be deleted.`);
    if (data) for (const fd of fieldsOf(type, config)) if (fd.readOnly && !(action === 'create' && PROVENANCE.has(fd.key))) delete data[fd.key];
    return data;
  };

  S.create = async (actor, type, input, opts = {}) => {
    const meta = entity(type);
    const config = await S.getConfig();
    const initiativeId = meta.scope === 'initiative' ? input.initiativeId : meta.scope === 'any' ? input.initiativeId || null : null;
    if (meta.scope === 'initiative' && !initiativeId) throw new AppError(422, `${meta.label} must belong to an initiative.`);
    const initiative = initiativeId ? await S.initiative(initiativeId) : null;
    if (initiativeId && !initiative) throw new AppError(404, 'Initiative not found.');
    S.assertInitiative(actor, initiative);
    S.assertWritable(initiative, type, actor);
    const ctx = await S.accessCtx(actor, initiativeId);
    let data = {};
    for (const [k, v] of Object.entries(input || {})) if (!SYSTEM_KEYS.includes(k)) data[k] = v;
    delete data.initiativeId;
    if (opts.external) guardExternal(type, data, config, 'create');
    for (const fd of fieldsOf(type, config)) if (fd.default !== undefined && data[fd.key] === undefined) data[fd.key] = clone(fd.default);
    data = normalise(type, data, config);
    const draft = { ...data, type, initiativeId, createdBy: actor.id };
    if (!opts.system) S.assertCan(actor, 'C', type, draft, ctx);
    const sens = sensitiveKeys(type, config).filter((k) => !isEmpty(data[k]));
    if (sens.length && !actor.system && !canSeeSensitive(actor, type, draft, ctx)) throw new AppError(403, `You do not have permission to record ${sens.join(', ')}.`);
    const hooks = HOOKS[type] || {};
    if (hooks.beforeCreate) data = (await hooks.beforeCreate(S, { actor, data, initiative, config, opts })) || data;
    const errors = opts.skipValidation ? [] : validateRecord(type, data, config, { ctx: { customPlans: initiative?.customPlans, optional: opts.optional } });
    if (errors.length) throw new AppError(422, `${meta.label} could not be saved: ${errors.map((e) => e.message).join('; ')}`, errors);
    const ts = nowIso();
    const rec = { ...data, id: opts.id || uid(), type, initiativeId, code: opts.code || (await S.makeCode(type, initiativeId)), version: 1, createdAt: opts.createdAt || ts, createdBy: actor.id, updatedAt: opts.createdAt || ts, updatedBy: actor.id };
    const stored = await driver.put(rec);
    if (!opts.noAudit) await S.audit(actor, { action: 'create', type, recordId: rec.id, initiativeId, summary: `${meta.label} ${rec.code || ''} created`, changes: maskedChanges(type, {}, rec, config), reason: opts.reason });
    S.touch(initiativeId);
    if (hooks.afterCreate) await hooks.afterCreate(S, { actor, rec: stored, initiative, config, opts });
    return opts.raw ? stored : S.redactFor(actor, type, stored, ctx);
  };

  S.update = async (actor, type, id, patch, opts = {}) => {
    const meta = entity(type);
    const config = await S.getConfig();
    const cur = await driver.get(type, id);
    if (!cur || cur.deleted) throw new AppError(404, `${meta.label} not found.`);
    if (opts.version != null && Number(opts.version) !== cur.version) {
      throw Object.assign(new AppError(409, `${meta.label} ${cur.code || ''} was changed by ${cur.updatedBy === actor.id ? 'you in another window' : 'someone else'} since you opened it. Review the latest version and reapply your change.`), { current: await S.redactFor(actor, type, cur, await S.accessCtx(actor, cur.initiativeId)) });
    }
    const initiative = cur.initiativeId ? await S.initiative(cur.initiativeId) : null;
    S.assertInitiative(actor, type === 'initiative' ? cur : initiative);
    if (type === 'initiative') {
      if (cur.status === 'closed' && !opts.reopen && !actor.system) throw new AppError(409, 'This initiative is closed and read-only (SUS-007).');
    } else {
      S.assertWritable(initiative, type, actor);
    }
    const ctx = await S.accessCtx(actor, cur.initiativeId);
    if (!opts.system) S.assertCan(actor, 'U', type, cur, ctx);
    let clean = {};
    for (const [k, v] of Object.entries(patch || {})) if (!SYSTEM_KEYS.includes(k) && k !== 'initiativeId') clean[k] = v;
    if (opts.external) guardExternal(type, clean, config, 'update');
    clean = normalise(type, clean, config);
    const sens = sensitiveKeys(type, config).filter((k) => k in clean && JSON.stringify(clean[k] ?? null) !== JSON.stringify(cur[k] ?? null));
    if (sens.length && !actor.system && !canSeeSensitive(actor, type, cur, ctx)) throw new AppError(403, `You do not have permission to change ${sens.join(', ')}.`);
    let next = { ...cur, ...clean, id: cur.id, type, initiativeId: cur.initiativeId, version: cur.version + 1, updatedAt: nowIso(), updatedBy: actor.id };
    const hooks = HOOKS[type] || {};
    if (hooks.beforeUpdate) next = (await hooks.beforeUpdate(S, { actor, cur, next, initiative, config, opts })) || next;
    const errors = opts.skipValidation ? [] : validateRecord(type, next, config, { ctx: { customPlans: initiative?.customPlans, optional: opts.optional } });
    if (errors.length) throw new AppError(422, `${meta.label} could not be saved: ${errors.map((e) => e.message).join('; ')}`, errors);
    let stored;
    try {
      stored = await driver.put(next, { expectedVersion: cur.version });
    } catch (e) {
      if (e instanceof ConflictError || e.status === 409) throw Object.assign(new AppError(409, `${meta.label} was changed by someone else at the same moment. Reload and try again.`), { current: e.current });
      throw e;
    }
    const changes = maskedChanges(type, cur, stored, config);
    if (!opts.noAudit && changes.length) await S.audit(actor, { action: opts.auditAction || 'update', type, recordId: id, initiativeId: cur.initiativeId, summary: `${meta.label} ${cur.code || ''} changed`, changes, reason: opts.reason });
    S.touch(type === 'initiative' ? cur.id : cur.initiativeId);
    if (hooks.afterUpdate) await hooks.afterUpdate(S, { actor, cur, rec: stored, initiative, config, opts });
    return opts.raw ? stored : S.redactFor(actor, type, stored, ctx);
  };

  S.remove = async (actor, type, id, opts = {}) => {
    const meta = entity(type);
    const cur = await driver.get(type, id);
    if (!cur || cur.deleted) throw new AppError(404, `${meta.label} not found.`);
    if (opts.external) guardExternal(type, null, null, 'remove');
    if (type === 'artefact' && cur.status === 'approved' && !actor.system) throw new AppError(409, 'Approved artefacts are kept as business records (REC-03) and cannot be deleted.');
    const initiative = cur.initiativeId ? await S.initiative(cur.initiativeId) : null;
    S.assertInitiative(actor, initiative);
    S.assertWritable(initiative, type, actor);
    const ctx = await S.accessCtx(actor, cur.initiativeId);
    if (!opts.system) S.assertCan(actor, 'D', type, cur, ctx);
    const hooks = HOOKS[type] || {};
    if (hooks.beforeRemove) await hooks.beforeRemove(S, { actor, cur, initiative, opts });
    const stored = await driver.put({ ...cur, deleted: true, version: cur.version + 1, updatedAt: nowIso(), updatedBy: actor.id }, { expectedVersion: cur.version });
    await S.audit(actor, { action: 'delete', type, recordId: id, initiativeId: cur.initiativeId, summary: `${meta.label} ${cur.code || ''} deleted`, reason: opts.reason });
    S.touch(type === 'initiative' ? cur.id : cur.initiativeId);
    return { id, deleted: true, version: stored.version };
  };

  S.get = async (actor, type, id) => {
    const rec = await driver.get(type, id);
    if (!rec || rec.deleted) throw new AppError(404, `${entity(type).label} not found.`);
    const initiative = rec.initiativeId ? await S.initiative(rec.initiativeId) : null;
    S.assertInitiative(actor, initiative);
    const ctx = await S.accessCtx(actor, rec.initiativeId);
    S.assertCan(actor, 'R', type, rec, ctx);
    return S.redactFor(actor, type, rec, ctx);
  };

  // Lists records of a type, filtered by access. Enterprise registers support paging and search.
  S.list = async (actor, type, { initiativeId, q, limit, offset = 0, sort, filter } = {}) => {
    const meta = entity(type);
    if (initiativeId) S.assertInitiative(actor, await S.initiative(initiativeId));
    if (meta.scope === 'initiative' && !initiativeId) throw new AppError(422, 'initiativeId is required for this register.');
    S.assertCan(actor, 'R', type, null);
    const ctx = await S.accessCtx(actor, initiativeId);
    let rows = await driver.list(type, meta.scope === 'enterprise' ? {} : { initiativeId });
    if (type === 'initiative') rows = rows.filter((r) => actor.system || initiativeAccess(actor, r.id));
    rows = rows.filter((r) => actor.system || can(actor, 'R', type, r, ctx));
    if (type === 'notification') rows = rows.filter((r) => r.userId === actor.id);
    if (filter) for (const [k, v] of Object.entries(filter)) rows = rows.filter((r) => (Array.isArray(r[k]) ? r[k].includes(v) : r[k] === v));
    if (q) {
      const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
      const keys = meta.search || fieldsOf(type).filter((f) => ['text', 'textarea', 'email'].includes(f.type)).map((f) => f.key);
      rows = rows.filter((r) => {
        const hay = [r.code, ...keys.map((k) => r[k])].join(' ').toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }
    const total = rows.length;
    if (sort) rows = sortBy(rows, sort);
    if (limit) rows = rows.slice(offset, offset + Number(limit));
    const out = [];
    for (const r of rows) out.push(await S.redactFor(actor, type, r, ctx));
    return { rows: out, total };
  };

  // Bulk edit (USE-05).
  S.bulkUpdate = async (actor, type, ids, patch, opts = {}) => {
    const results = [];
    for (const id of asArray(ids)) {
      try {
        results.push({ id, ok: true, record: await S.update(actor, type, id, patch, { ...opts, version: undefined }) });
      } catch (e) {
        results.push({ id, ok: false, error: e.message });
      }
    }
    return results;
  };

  // --- Initiative data (client working set) and model ----------------------------------------------------------
  const versions = new Map();
  // Enterprise records (and an initiative's own record, which has no initiativeId) appear in every model, so a
  // change without an initiative clears them all.
  S.touch = (initiativeId) => {
    if (initiativeId) {
      versions.set(initiativeId, (versions.get(initiativeId) || 0) + 1);
      modelCache.delete(initiativeId);
      scopeCache.delete(initiativeId);
    } else {
      modelCache.clear();
      scopeCache.clear();
      enterpriseVersion++;
      stakeholderIndex = null;
    }
    ctxCache.clear();
  };

  // The stakeholder master with the text search runs over (PER-02), rebuilt after enterprise changes.
  S.stakeholderIndex = async () => {
    if (stakeholderIndex?.version === enterpriseVersion) return stakeholderIndex.rows;
    const version = enterpriseVersion;
    const keys = searchKeys('stakeholder');
    const rows = (await driver.list('stakeholder')).filter((s) => !s.mergedInto).map((s) => ({ s, hay: [s.code, ...keys.map((k) => s[k])].join(' ').toLowerCase() }));
    if (version === enterpriseVersion) stakeholderIndex = { version, rows };
    return rows;
  };

  // The enterprise records an initiative's working set and model need. With a small master that is all of
  // it; with a large one it is the stakeholders the initiative's records refer to, the members of the
  // stakeholder groups they refer to (and of their sub-groups), each of those people's direct manager
  // (PMG-002), the people linked to users, and the other ends of their recorded relationships.
  S.enterpriseScope = async (initiativeId, loadOwn) => {
    const key = `${versions.get(initiativeId) || 0}:${enterpriseVersion}`;
    const hit = scopeCache.get(initiativeId);
    if (hit?.key === key) return hit.scope;
    const stakeholder = (await driver.list('stakeholder')).filter((s) => !s.mergedInto);
    const membership = await driver.list('membership');
    const relationship = await driver.list('relationship');
    let scope = { stakeholder, membership, relationship, scoped: false };
    if (stakeholder.length > SCOPE_AT) {
      const refs = new Set();
      collectIds([await S.initiative(initiativeId), await loadOwn()], refs);
      for (const u of await driver.list('user')) if (u.stakeholderId) refs.add(u.stakeholderId);
      const byId = new Map(stakeholder.map((s) => [s.id, s]));
      const ids = new Set([...refs].filter((id) => byId.has(id)));
      const groups = await driver.list('stakeholderGroup');
      const groupIds = new Set(groups.filter((g) => refs.has(g.id)).map((g) => g.id));
      for (let grew = true; grew;) {
        grew = false;
        for (const g of groups) if (g.parentId && groupIds.has(g.parentId) && !groupIds.has(g.id)) { groupIds.add(g.id); grew = true; }
      }
      for (const m of membership) if (groupIds.has(m.groupId)) ids.add(m.stakeholderId);
      for (const g of groups) if (groupIds.has(g.id) && g.membershipType === 'dynamic') for (const s of stakeholder) if (matchesRules(s, g.rules)) ids.add(s.id);
      for (const id of [...ids]) { const mgr = byId.get(id)?.managerId; if (mgr && byId.has(mgr)) ids.add(mgr); }
      const rels = relationship.filter((r) => ids.has(r.fromId) || ids.has(r.toId));
      for (const r of rels) for (const id of [r.fromId, r.toId]) if (byId.has(id)) ids.add(id);
      scope = { stakeholder: [...ids].map((id) => byId.get(id)), membership: membership.filter((m) => ids.has(m.stakeholderId) || groupIds.has(m.groupId)), relationship: rels, scoped: true, ids };
    }
    scopeCache.set(initiativeId, { key, scope });
    return scope;
  };

  // Raw (unredacted) data for an initiative, including the enterprise records it references.
  S.rawInitiativeData = async (initiativeId) => {
    const initiative = await S.initiative(initiativeId);
    if (!initiative) throw new AppError(404, 'Initiative not found.');
    const own = await driver.listInitiative(initiativeId);
    const records = {};
    for (const r of own) (records[r.type] ||= []).push(r);
    for (const t of ['stakeholderGroup', 'user', 'container']) records[t] = await driver.list(t);
    const scope = await S.enterpriseScope(initiativeId, async () => own);
    Object.assign(records, { stakeholder: scope.stakeholder, membership: scope.membership, relationship: scope.relationship });
    return { initiative, records, scoped: scope.scoped };
  };

  S.model = async (initiativeId, { today } = {}) => {
    const key = `${initiativeId}:${versions.get(initiativeId) || 0}:${today || ''}`;
    const hit = modelCache.get(initiativeId);
    if (hit && hit.key === key && hit.at > Date.now() - 300000) return hit.model;
    const data = await S.rawInitiativeData(initiativeId);
    const config = await S.getConfig();
    const model = buildModel(data, { config, today: today || (await S.today()) });
    modelCache.set(initiativeId, { key, at: Date.now(), model });
    return model;
  };

  // Everything the client needs to work on one initiative, filtered and redacted for the user.
  S.loadInitiative = async (actor, initiativeId) => {
    const initiative = await S.initiative(initiativeId);
    if (!initiative || initiative.deleted) throw new AppError(404, 'Initiative not found.');
    S.assertInitiative(actor, initiative);
    const { records, scoped } = await S.rawInitiativeData(initiativeId);
    const ctx = await S.accessCtx(actor, initiativeId);
    const out = {};
    let sensitiveSeen = 0;
    for (const [type, rows] of Object.entries(records)) {
      if (!ENTITIES[type]) continue;
      if (['notification', 'apiClient', 'webhook'].includes(type)) continue;
      const list = [];
      for (const r of rows) {
        if (type === 'user') { list.push(publicUser(r)); continue; }
        if (!actor.system && !can(actor, 'R', type, r, ctx)) continue;
        const red = await S.redactFor(actor, type, r, ctx);
        if (!red._redacted?.length && sensitiveKeys(type, await S.getConfig()).some((k) => !isEmpty(r[k]))) sensitiveSeen++;
        list.push(red);
      }
      out[type] = list;
    }
    if (sensitiveSeen && !actor.system) await S.audit(actor, { action: 'sensitiveRead', type: 'initiative', recordId: initiativeId, initiativeId, summary: `Viewed sensitive fields on ${sensitiveSeen} records` });
    return { initiative: await S.redactFor(actor, 'initiative', initiative, ctx), records: out, seq: await driver.currentSeq(), scoped };
  };

  S.changes = async (actor, initiativeId, since) => {
    S.assertInitiative(actor, await S.initiative(initiativeId));
    const ctx = await S.accessCtx(actor, initiativeId);
    const { seq, records } = await driver.changesSince(Number(since) || 0, initiativeId);
    const scope = await S.enterpriseScope(initiativeId, () => driver.listInitiative(initiativeId));
    // With a large master, enterprise changes outside the initiative's scope are left out, and stakeholders
    // that changed records now refer to are added.
    const inScope = (r) => !scope.scoped || r.initiativeId || (r.type === 'stakeholder' ? scope.ids.has(r.id) : r.type === 'membership' ? scope.ids.has(r.stakeholderId) : r.type === 'relationship' ? scope.ids.has(r.fromId) || scope.ids.has(r.toId) : true);
    const out = [];
    const kept = [];
    for (const r of records) {
      if (!ENTITIES[r.type] || r.type === 'notification' || r.type === 'apiClient' || r.type === 'webhook') continue;
      if (r.deleted) { out.push({ id: r.id, type: r.type, deleted: true }); continue; }
      if (!inScope(r)) continue;
      if (r.type === 'user') { out.push(publicUser(r)); continue; }
      if (!can(actor, 'R', r.type, r, ctx)) continue;
      kept.push(r);
      out.push(await S.redactFor(actor, r.type, r, ctx));
    }
    if (scope.scoped) {
      const refs = new Set();
      collectIds(kept, refs);
      const sent = new Set(kept.map((r) => r.id));
      for (const id of refs) {
        if (sent.has(id) || !scope.ids.has(id)) continue;
        const st = await driver.get('stakeholder', id);
        if (st && can(actor, 'R', 'stakeholder', st, ctx)) out.push(await S.redactFor(actor, 'stakeholder', st, ctx));
      }
    }
    return { seq, records: out };
  };

  const publicUser = (u) => ({ id: u.id, type: 'user', name: u.name, email: u.email, roles: u.roles, status: u.status, stakeholderId: u.stakeholderId, initiativeIds: u.initiativeIds, timeZone: u.timeZone, version: u.version, code: u.code });
  S.publicUser = publicUser;

  // Session bootstrap: configuration, the user's initiatives and directory data.
  S.bootstrap = async (actor) => {
    const config = await S.getConfig();
    const initiatives = (await driver.list('initiative')).filter((i) => initiativeAccess(actor, i.id));
    const users = (await driver.list('user')).map(publicUser);
    const templates = await driver.list('template');
    const notifications = (await driver.list('notification')).filter((n) => n.userId === actor.id);
    return {
      user: { ...publicUser(actor), notify: actor.notify || {} },
      config,
      roles: ROLES,
      initiatives: sortBy(initiatives, 'name'),
      containers: await driver.list('container'),
      users,
      templates: templates.filter((t) => t.state !== 'retired'),
      notifications: sortBy(notifications, '-createdAt').slice(0, 100),
      mode: env.mode || 'server',
      features: { ai: !!env.aiAvailable && config.settings.ai?.enabled !== false, email: !!env.emailAvailable, sso: !!env.ssoAvailable },
    };
  };

  // RPT-005: the reporting feed behind the BI connection, report exports and the report builder. Rows come
  // from each initiative's model, so they agree with the screens and artefacts; the user must be able to
  // read the dataset's records, and sensitive columns appear only for those allowed to see them.
  const DATASET_TYPES = { initiatives: 'initiative', groups: 'impactedGroup', stakeholders: 'profile', engagements: 'engagement', activities: 'activity', communications: 'activity', training: 'trainingIntervention', resistance: 'resistance', actions: 'task', changeAgents: 'changeAgent', adkar: 'assessment', measures: 'measure', risks: 'risk' };
  S.reportingFeed = async (actor, name, { initiativeId } = {}) => {
    if (!DATASETS[name]) throw new AppError(404, 'Unknown dataset');
    S.assertCan(actor, 'R', DATASET_TYPES[name], null);
    const ids = initiativeId ? [initiativeId] : (await driver.list('initiative')).map((i) => i.id);
    const canSensitive = actor.system || canSeeSensitive(actor, 'profile', {}, { practitionerScope: 'all' });
    const rows = [];
    for (const id of ids) {
      const ini = await driver.get('initiative', id);
      if (!ini || ini.deleted || !(actor.system || initiativeAccess(actor, id))) continue;
      rows.push(...dataset(name, await S.model(id), { canSensitive }));
    }
    await S.audit(actor, { action: 'export', type: 'reporting', summary: `Reporting feed ${name}: ${rows.length} rows` });
    return { dataset: name, description: DATASETS[name], generatedAt: nowIso(), rows };
  };

  // Global search across records the user may view (WFL-006).
  S.search = async (actor, q, { limit = 40 } = {}) => {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const hits = [];
    const initiatives = (await driver.list('initiative')).filter((i) => initiativeAccess(actor, i.id));
    const titleOf = (r) => { try { return entity(r.type).title(r) || r.code; } catch { return r.code; } };
    const hit = (r) => hits.push({ id: r.id, type: r.type, code: r.code, title: r.type === 'stakeholder' ? personName(r) : titleOf(r), initiativeId: r.initiativeId || null });
    const matches = (hay) => words.every((w) => hay.includes(w));
    const consider = (r, ctx) => {
      if (!ENTITIES[r.type] || ['notification', 'apiClient', 'webhook', 'membership', 'savedView', 'measureValue', 'surveyResponse'].includes(r.type)) return;
      const hay = [r.code, ...searchKeys(r.type).map((k) => r[k])].join(' ').toLowerCase().replace(/<[^>]+>/g, ' ');
      if (matches(hay) && can(actor, 'R', r.type, r, ctx)) hit(r);
    };
    for (const { s, hay } of await S.stakeholderIndex()) {
      if (hits.length >= limit) break;
      if (matches(hay) && can(actor, 'R', 'stakeholder', s, {})) hit(s);
    }
    for (const i of initiatives) {
      if (hits.length >= limit) break;
      consider(i, {});
      const ctx = await S.accessCtx(actor, i.id);
      for (const r of await driver.listInitiative(i.id)) {
        if (hits.length >= limit) break;
        consider(r, ctx);
      }
    }
    return hits.slice(0, limit);
  };

  // --- Operations registry (exposed as POST /api/v1/ops/{name}) ---------------------------------------------
  S.op = (name, meta, fn) => {
    S.ops[name] = fn;
    S.opMeta[name] = meta;
  };
  S.runOp = async (actor, name, payload) => {
    const fn = S.ops[name];
    if (!fn) throw new AppError(404, `Unknown operation ${name}`);
    return fn(actor, payload || {});
  };

  registerEngagementOps(S);
  registerWorkflowOps(S);
  registerStakeholderOps(S);
  registerPlanningOps(S);
  registerInitiativeOps(S);
  registerAdminOps(S);
  registerArtefactOps(S);
  return S;
}

export { INITIATIVE_TYPES };
