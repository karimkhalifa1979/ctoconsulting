// Generic entity service: list, read, create, update, delete, bulk update and record actions for
// every register in the schema registry, with engagement-scoped access control (NFR-002),
// field-level restrictions (ACC-003), client whitelists (CPT-005, BR-11), validation (DAT-008),
// read-only closed records (CLS-008, DAT-003) and a full audit trail (NFR-025).
import { ENTITIES } from '../../shared/schema.js';
import { isISODate, todayIn } from '../../shared/dates.js';
import { Repo } from './repo.mjs';
import { DOC_TABLES, nextSequence } from '../db.mjs';
import { HttpError, badRequest, forbidden, notFound, unprocessable } from '../http.mjs';

const BASE_KEYS = ['id', 'type', 'client_id', 'engagement_id', 'project_id', 'ref', 'rev', 'created_at', 'created_by', 'updated_at', 'updated_by'];
const CLOSED_PROJECT = ['Closed', 'Archived', 'Cancelled'];
const EMPTY = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

export function validAbn(abn) {
  const d = String(abn || '').replace(/\D/g, '');
  if (d.length !== 11) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = [...d].reduce((a, c, i) => a + (Number(c) - (i === 0 ? 1 : 0)) * w[i], 0);
  return sum % 89 === 0;
}

export function createEntities(app) {
  const { db, audit, settings } = app;
  const repos = {};
  for (const [name, def] of Object.entries(ENTITIES)) repos[name] = new Repo(db, def.table, { type: def.type || null, idPrefix: name.slice(0, 4) });
  for (const table of Object.keys(DOC_TABLES)) if (!repos[table]) repos[table] = new Repo(db, table, { idPrefix: table.slice(0, 4) });
  app.repos = repos;

  const hooks = {};
  const register = (name, h) => { hooks[name] = { ...(hooks[name] || {}), ...h, actions: { ...(hooks[name]?.actions || {}), ...(h.actions || {}) } }; };

  const def = (name) => {
    const d = ENTITIES[name];
    if (!d) throw notFound(`Unknown register: ${name}`);
    return d;
  };

  function scopeOf(d, rec) {
    if (d.name === 'engagement') return { engId: rec.id, projectId: null };
    if (d.name === 'project') return { engId: rec.engagement_id, projectId: rec.id };
    return { engId: rec.engagement_id || null, projectId: rec.project_id || null };
  }

  function isOwn(ctx, d, rec) {
    const uid = ctx.user?.id;
    if (!uid) return false;
    if (rec.created_by === uid) return true;
    const field = d.ownerField;
    if (!field) return false;
    const v = rec[field];
    if (field === 'person_id') return v && v === ctx.personId;
    return Array.isArray(v) ? v.includes(uid) || v.includes(ctx.personId) : v === uid;
  }

  const engagementOf = (id) => (id ? repos.engagement.get(id) : null);
  const projectOf = (id) => (id ? repos.project.get(id) : null);

  // Read access for one record (service layer; the routes never bypass this).
  function canRead(ctx, d, rec) {
    const a = ctx.access;
    if (ctx.system) return true;
    if (d.scope === 'global') {
      if (a.isExternal) return false;
      if (d.name === 'cost_rate') return a.canGlobal('costrates.read');
      if (d.name === 'rate_card') return a.canGlobal('ratecards.read') || (rec.level === 'Engagement' && a.can(rec.engagement_ref, 'rates', 'R'));
      return true;
    }
    if (d.scope === 'client') {
      if (a.isExternal) return d.clientFields && rec.client_id === ctx.user.client_id;
      if (a.canGlobal('clients.write') || a.canGlobal('portfolio')) {
        if (a.visibleEngagementIds().some((id) => a.engagements.get(id)?.client_id === rec.client_id)) return true;
        return a.hasGlobal('finance') || a.hasGlobal('engagement_executive') || a.hasGlobal('pmo') || a.hasGlobal('auditor') || a.canGlobal('clients.write');
      }
      return a.visibleEngagementIds().some((id) => a.engagements.get(id)?.client_id === rec.client_id);
    }
    const { engId, projectId } = scopeOf(d, rec);
    if (!a.canSeeEngagement(engId)) return false;
    if (a.isExternal) {
      if (!d.clientFields || !a.rolesOn(engId).includes('client')) return false;
      if (d.clientFlag && rec[d.clientFlag] !== true) return false;
      if (d.clientWhen && !d.clientWhen(rec)) return false;
      return true;
    }
    if (d.sensitiveEntity && !a.canSeeCosts(engId)) return false;
    if (d.name === 'engagement') return true; // existence and basics are visible to anyone who can see it
    return a.can(engId, d.fn, 'R', { projectId, own: isOwn(ctx, d, rec), shared: rec.client_visible === true, issued: true });
  }

  function canWrite(ctx, d, rec, action) {
    const a = ctx.access;
    if (ctx.system) return true;
    if (a.isExternal) return false;
    if (d.scope === 'global') {
      if (d.name === 'cost_rate') return a.canGlobal('costrates.write');
      if (d.name === 'rate_card') return a.canGlobal('ratecards.write');
      if (d.name === 'leave') return a.canGlobal('people.write') || (rec.person_id && rec.person_id === ctx.personId);
      return a.canGlobal('people.write');
    }
    if (d.scope === 'client') return a.canGlobal('clients.write');
    const { engId, projectId } = scopeOf(d, rec);
    if (d.name === 'engagement' && action === 'C') return a.canGlobal('engagements.create');
    if (d.name === 'project' && action === 'C') return a.can(engId, 'setup', 'C') || a.can(engId, 'setup', 'U');
    if (d.name === 'engagement') return a.can(engId, 'setup', 'U');
    return a.can(engId, d.fn, action, { projectId, own: isOwn(ctx, d, rec) });
  }

  function lockedReason(d, rec) {
    const { engId, projectId } = scopeOf(d, rec);
    if (d.scope === 'global' || d.scope === 'client') return null;
    const eng = engagementOf(engId);
    if (eng && eng.status === 'Closed' && d.name !== 'engagement') return 'The engagement is closed and read-only (CLS-008).';
    const proj = projectId ? projectOf(projectId) : null;
    if (proj && CLOSED_PROJECT.includes(proj.state) && !['project', 'lesson', 'benefit'].includes(d.name)) return `The project is ${proj.state.toLowerCase()} and read-only (CLS-008).`;
    return null;
  }

  // Field-level filtering on the way out (ACC-003, CPT-005).
  function serialize(ctx, d, rec, { decorate = true } = {}) {
    let out = { ...rec };
    if (decorate && hooks[d.name]?.decorate) out = hooks[d.name].decorate(ctx, out) || out;
    if (ctx.system) return out;
    const a = ctx.access;
    if (a.isExternal) {
      const allowed = new Set([...BASE_KEYS, ...(d.clientFields || [])]);
      out = Object.fromEntries(Object.entries(out).filter(([k]) => allowed.has(k)));
      return out;
    }
    const { engId } = scopeOf(d, rec);
    const costs = d.scope === 'global' ? a.canGlobal('costrates.read') : a.canSeeCosts(engId);
    if (!costs) for (const fld of d.fields) if (fld.sensitive) delete out[fld.key];
    if (!costs) for (const k of Object.keys(out)) if (k.startsWith('_cost') || k.startsWith('_margin')) delete out[k];
    return out;
  }

  function normalise(d, input, { partial }) {
    const out = {};
    for (const fld of d.fields) {
      if (!(fld.key in input)) continue;
      let v = input[fld.key];
      if (typeof v === 'string' && !['markdown', 'textarea'].includes(fld.type)) v = v.trim();
      if (v === '') v = null;
      if (v !== null && ['int', 'number', 'money', 'percent', 'scale', 'scale5'].includes(fld.type)) {
        const n = Number(v);
        v = Number.isFinite(n) ? (fld.type === 'int' || fld.type.startsWith('scale') ? Math.round(n) : n) : v;
      }
      if (fld.type === 'bool') v = v === true || v === 'true' || v === 1 || v === '1';
      out[fld.key] = v;
    }
    void partial;
    return out;
  }

  function validate(d, rec) {
    const errors = {};
    for (const fld of d.fields) {
      const v = rec[fld.key];
      const visible = !fld.showIf || fld.showIf(rec);
      if (visible && !fld.readOnly && (fld.required || fld.requiredIf?.(rec)) && EMPTY(v)) { errors[fld.key] = `${fld.label} is required`; continue; }
      if (EMPTY(v)) continue;
      switch (fld.type) {
        case 'date': if (!isISODate(v)) errors[fld.key] = 'Use a valid date'; break;
        case 'int': case 'number': case 'money': case 'percent':
          if (typeof v !== 'number' || !Number.isFinite(v)) errors[fld.key] = 'Enter a number';
          else if (fld.min !== undefined && v < fld.min) errors[fld.key] = `Minimum ${fld.min}`;
          else if (fld.max !== undefined && v > fld.max) errors[fld.key] = `Maximum ${fld.max}`;
          break;
        case 'scale': case 'scale5': if (!(v >= 1 && v <= 5)) errors[fld.key] = 'Choose 1 to 5'; break;
        case 'enum': {
          const opts = fld.optionsFn ? fld.optionsFn(rec) : fld.options;
          if (opts && !opts.includes(v)) errors[fld.key] = `Choose one of: ${opts.join(', ')}`;
          break;
        }
        case 'email': if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors[fld.key] = 'Enter a valid email address'; break;
        case 'abn': if (!validAbn(v)) errors[fld.key] = 'Enter a valid 11-digit ABN'; break;
        case 'url': if (!/^https?:\/\//i.test(v)) errors[fld.key] = 'Enter a link starting with https://'; break;
        default:
      }
    }
    if (d.fieldMap.end_date && rec.start_date && rec.end_date && rec.end_date < rec.start_date) errors.end_date = 'End must be on or after start';
    if (d.fieldMap.finish_date && rec.start_date && rec.finish_date && rec.finish_date < rec.start_date) errors.finish_date = 'Finish must be on or after start';
    return errors;
  }

  // Ref fields must point at records in the same engagement (no cross-engagement leakage).
  function checkRefs(ctx, d, rec) {
    for (const fld of d.fields) {
      const v = rec[fld.key];
      if (EMPTY(v) || !['ref', 'refs'].includes(fld.type)) continue;
      const target = fld.ref || (fld.refByKind && fld.refByKind[rec[fld.kindField]]);
      if (!target || !ENTITIES[target]) continue;
      const td = ENTITIES[target];
      for (const id of Array.isArray(v) ? v : [v]) {
        const t = repos[target].get(id);
        if (!t) throw unprocessable(`${fld.label}: linked record not found`, { [fld.key]: 'Not found' });
        if (['engagement', 'project', 'raid'].includes(td.scope) && rec.engagement_id && t.engagement_id !== rec.engagement_id) {
          const sameClient = target === 'project' && fld.key === 'other_project_id' && engagementOf(t.engagement_id)?.client_id === engagementOf(rec.engagement_id)?.client_id;
          if (!sameClient) throw unprocessable(`${fld.label}: linked record belongs to another engagement`, { [fld.key]: 'Must be in this engagement' });
        }
      }
    }
  }

  function resolveScope(ctx, d, input) {
    const s = {};
    if (d.scope === 'client') {
      if (!input.client_id) throw unprocessable('Client is required', { client_id: 'Required' });
      if (!repos.client.get(input.client_id)) throw notFound('Client not found');
      s.client_id = input.client_id;
    } else if (d.name === 'engagement') {
      const c = repos.client.get(input.client_id);
      if (!c) throw unprocessable('Client is required', { client_id: 'Required' });
      s.client_id = c.id;
    } else if (d.name === 'project' || ((d.scope === 'engagement' || d.scope === 'raid') && !input.project_id)) {
      const e = engagementOf(input.engagement_id);
      if (!e) throw unprocessable('Engagement is required', { engagement_id: 'Required' });
      s.engagement_id = e.id;
      s.client_id = e.client_id;
      if (d.name !== 'project') s.project_id = null;
    } else if (d.scope === 'project' || d.scope === 'raid' || d.scope === 'engagement') {
      const p = projectOf(input.project_id);
      if (!p) throw unprocessable('Project is required', { project_id: 'Required' });
      if (input.engagement_id && input.engagement_id !== p.engagement_id) throw badRequest('Project does not belong to this engagement');
      s.project_id = p.id;
      s.engagement_id = p.engagement_id;
      s.client_id = engagementOf(p.engagement_id)?.client_id;
    }
    return s;
  }

  function nextRef(d, rec) {
    if (!d.refPrefix || !rec.engagement_id) return null;
    const n = nextSequence(db, rec.engagement_id, d.refPrefix);
    return `${d.refPrefix}-${String(n).padStart(3, '0')}`;
  }

  // Strips fields the caller may not write: read-only, cost-sensitive and, for "own" grants, non-assignee fields.
  function writableFields(ctx, d, rec, input) {
    if (ctx.system) return input;
    const a = ctx.access;
    const { engId, projectId } = scopeOf(d, rec);
    const costs = d.scope === 'global' ? a.canGlobal('costrates.write') : a.canSeeCosts(engId);
    const ownOnly = d.scope !== 'global' && d.scope !== 'client' && a.qualifier(engId, d.fn, 'U', projectId) === 'own';
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      const fld = d.fieldMap[k];
      if (!fld || fld.readOnly) continue;
      if (fld.sensitive && !costs) continue;
      if (ownOnly && d.name === 'work_item' && !fld.assigneeEditable) continue;
      out[k] = v;
    }
    return out;
  }

  function applyDefaults(ctx, d, rec) {
    const today = todayIn(settings.tz());
    for (const fld of d.fields) {
      if (rec[fld.key] !== undefined || fld.default === undefined) continue;
      rec[fld.key] = fld.default === 'today' ? today : fld.default === 'me' ? ctx.user?.id : structuredClone(fld.default);
    }
  }

  // ---- Public operations ----

  function list(ctx, name, query = {}) {
    const d = def(name);
    const where = {};
    if (query.engagement_id) where.engagement_id = query.engagement_id;
    if (query.project_id) where.project_id = query.project_id === 'none' ? null : query.project_id;
    if (query.client_id) where.client_id = query.client_id;
    if (d.scope !== 'global' && d.scope !== 'client' && !ctx.system) {
      const visible = ctx.access.visibleEngagementIds();
      if (where.engagement_id && !visible.includes(where.engagement_id)) throw forbidden();
      if (!where.engagement_id && d.name !== 'engagement') where.engagement_id = visible;
      if (d.name === 'engagement') where.id = visible;
    }
    for (const col of d.columns || []) if (query[col] !== undefined && query[col] !== '') where[col] = query[col];
    let rows = repos[name].find(where);
    rows = rows.filter((r) => canRead(ctx, d, r)).map((r) => serialize(ctx, d, r));
    if (query.q) {
      const q = String(query.q).toLowerCase();
      rows = rows.filter((r) => [r.ref, r[d.title], r.name, r.title, r.description, r.code].some((v) => v && String(v).toLowerCase().includes(q)));
    }
    if (query.status) {
      const set = new Set(String(query.status).split(','));
      rows = rows.filter((r) => set.has(r.status));
    }
    if (query.open === '1' && d.closed) rows = rows.filter((r) => !d.closed.includes(r.status));
    for (const [k, v] of Object.entries(query)) {
      if (!k.startsWith('f.') || v === '') continue;
      const key = k.slice(2);
      rows = rows.filter((r) => String(Array.isArray(r[key]) ? r[key].join(',') : r[key] ?? '') === String(v));
    }
    return rows;
  }

  function get(ctx, name, id) {
    const d = def(name);
    const rec = repos[name].get(id);
    if (!rec || !canRead(ctx, d, rec)) throw notFound(`${d.label} not found`);
    const out = serialize(ctx, d, rec);
    if (!ctx.system) {
      out._can = {
        update: !lockedReason(d, rec) && canWrite(ctx, d, rec, 'U'),
        delete: !lockedReason(d, rec) && canWrite(ctx, d, rec, 'U') && d.name !== 'engagement',
        locked: lockedReason(d, rec),
        costs: d.scope === 'global' ? ctx.access.canGlobal('costrates.read') : ctx.access.canSeeCosts(scopeOf(d, rec).engId),
      };
    }
    return out;
  }

  // Internal read without access checks, for services.
  const raw = (name, id) => repos[name].get(id);

  function create(ctx, name, input, { audit: doAudit = true } = {}) {
    const d = def(name);
    const scope = resolveScope(ctx, d, input);
    let rec = { ...normalise(d, input, { partial: false }), ...scope };
    const probe = { ...rec, id: null, created_by: ctx.user?.id };
    if (d.name === 'project') probe.engagement_id = scope.engagement_id;
    if (!canWrite(ctx, d, probe, 'C')) throw forbidden(`You cannot create ${d.plural.toLowerCase()} here.`);
    const locked = lockedReason(d, rec);
    if (locked) throw new HttpError(423, locked);
    rec = { ...writableFields(ctx, d, rec, rec), ...scope };
    if (ctx.system) Object.assign(rec, Object.fromEntries(Object.entries(input).filter(([k]) => (!d.fieldMap[k] || d.fieldMap[k].readOnly) && !['engagement_id', 'project_id', 'client_id'].includes(k))));
    applyDefaults(ctx, d, rec);
    return db.tx(() => {
      if (hooks[name]?.beforeSave) rec = hooks[name].beforeSave(ctx, { def: d, before: null, next: rec, isNew: true, input }) || rec;
      const errors = validate(d, rec);
      if (Object.keys(errors).length) throw unprocessable('Please correct the highlighted fields.', errors);
      checkRefs(ctx, d, rec);
      rec.ref = rec.ref || nextRef(d, rec);
      let saved = repos[name].insert(rec, ctx.user?.id || null);
      if (d.name === 'engagement') saved = repos[name].replace(saved.id, { ...saved, engagement_id: saved.id }, ctx.user?.id);
      if (d.name === 'project') saved = repos[name].replace(saved.id, { ...saved, project_id: saved.id }, ctx.user?.id);
      if (doAudit) audit.change(ctx, { action: 'create', entity: name, rec: saved, before: null, after: saved, summary: `Created ${d.label.toLowerCase()} ${saved.ref || saved[d.title] || ''}`.trim() });
      if (hooks[name]?.afterSave) hooks[name].afterSave(ctx, { def: d, before: null, after: saved, isNew: true, input });
      return repos[name].get(saved.id);
    });
  }

  function update(ctx, name, id, input, { rev, audit: doAudit = true, summary } = {}) {
    const d = def(name);
    const before = repos[name].get(id);
    if (!before || !canRead(ctx, d, before)) throw notFound(`${d.label} not found`);
    const locked = lockedReason(d, before);
    if (locked && !ctx.system) throw new HttpError(423, locked);
    let changes;
    if (ctx.access?.isExternal && !ctx.system) {
      // CPT-004: client users may update only whitelisted fields of client-owned items.
      if (!d.clientEditable || (d.name === 'action' && before.owner_org !== 'Client')) throw forbidden();
      changes = Object.fromEntries(Object.entries(normalise(d, input, { partial: true })).filter(([k]) => d.clientEditable.includes(k)));
    } else {
      if (!canWrite(ctx, d, before, 'U')) throw forbidden(`You cannot change this ${d.label.toLowerCase()}.`);
      changes = writableFields(ctx, d, before, normalise(d, input, { partial: true }));
      if (ctx.system) Object.assign(changes, Object.fromEntries(Object.entries(input).filter(([k]) => !d.fieldMap[k] || d.fieldMap[k].readOnly)));
    }
    let next = { ...before, ...changes };
    return db.tx(() => {
      if (hooks[name]?.beforeSave) next = hooks[name].beforeSave(ctx, { def: d, before, next, isNew: false, input }) || next;
      const errors = validate(d, next);
      if (Object.keys(errors).length) throw unprocessable('Please correct the highlighted fields.', errors);
      checkRefs(ctx, d, next);
      const after = repos[name].replace(id, next, ctx.user?.id || null, { expectRev: rev });
      if (doAudit) audit.change(ctx, { action: 'update', entity: name, rec: after, before, after, summary: summary || `Updated ${d.label.toLowerCase()} ${after.ref || after[d.title] || ''}`.trim() });
      if (hooks[name]?.afterSave) hooks[name].afterSave(ctx, { def: d, before, after, isNew: false, input });
      return repos[name].get(id);
    });
  }

  // System-level patch used by modules (bypasses field permissions, still audited).
  function patch(ctx, name, id, changes, summary) {
    return update({ ...ctx, system: true }, name, id, changes, { summary });
  }

  function remove(ctx, name, id) {
    const d = def(name);
    const rec = repos[name].get(id);
    if (!rec || !canRead(ctx, d, rec)) throw notFound(`${d.label} not found`);
    if (!ctx.system && (lockedReason(d, rec) || !canWrite(ctx, d, rec, 'U') || d.name === 'engagement')) throw forbidden(`You cannot delete this ${d.label.toLowerCase()}.`);
    return db.tx(() => {
      hooks[name]?.beforeDelete?.(ctx, { def: d, rec });
      repos[name].softDelete(id, ctx.user?.id);
      audit.change(ctx, { action: 'delete', entity: name, rec, before: rec, after: null, summary: `Deleted ${d.label.toLowerCase()} ${rec.ref || rec[d.title] || ''}`.trim() });
      hooks[name]?.afterDelete?.(ctx, { def: d, rec });
      return { ok: true };
    });
  }

  // RAI-008 bulk update: applies the same change to many records, each with its own checks.
  function bulk(ctx, name, ids, changes) {
    const results = [];
    for (const id of ids || []) {
      try {
        results.push({ id, ok: true, rec: update(ctx, name, id, changes) });
      } catch (e) {
        results.push({ id, ok: false, error: e.message });
      }
    }
    return results;
  }

  async function action(ctx, name, id, act, body = {}) {
    const d = def(name);
    const fn = hooks[name]?.actions?.[act];
    if (!fn) throw notFound(`Unknown action ${act}`);
    const rec = repos[name].get(id);
    if (!rec || !canRead(ctx, d, rec)) throw notFound(`${d.label} not found`);
    const locked = lockedReason(d, rec);
    if (locked && !fn.allowLocked) throw new HttpError(423, locked);
    const out = await fn(ctx, rec, body, { def: d });
    return out === undefined ? get(ctx, name, id) : out;
  }

  return {
    repos, hooks, register, def, list, get, raw, create, update, patch, remove, bulk, action,
    canRead, canWrite, serialize, scopeOf, lockedReason, engagementOf, projectOf, validate,
  };
}
