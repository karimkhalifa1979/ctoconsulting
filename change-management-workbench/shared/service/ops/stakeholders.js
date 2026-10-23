// Stakeholder data operations: duplicates and merge (STK-046), spreadsheet import with field mapping,
// validation and an import report (STK-047, INT-009, TRA-01, AC-06), leavers and movers (RUL-19), and
// privacy requests (STK-050, PRV-05, PRV-06).
import { AppError, asArray, personName, uniq, isEmpty } from '../../util.js';
import { ENTITIES, entity, fieldsOf, listOptions } from '../../schema.js';
import { validateRecord, normalise } from '../../validate.js';
import { findDuplicates, duplicateKey } from '../../rules/stakeholders.js';
import { groupMemberIds } from '../../rules/engagements.js';
import { parseAuDate } from '../../dates.js';
import { can, hasRole, initiativeAccess } from '../../access.js';

// Every field that holds a stakeholder id, including table columns.
function stakeholderRefFields(type) {
  const out = [];
  for (const fd of ENTITIES[type].fields) {
    if ((fd.type === 'ref' || fd.type === 'refs') && fd.ref === 'stakeholder') out.push({ key: fd.key, multi: fd.type === 'refs' });
    if (fd.type === 'table') for (const c of fd.columns || []) if (c.type === 'ref' && c.ref === 'stakeholder') out.push({ key: fd.key, column: c.key });
  }
  if (type === 'engagement') out.push({ key: 'sentiments', column: 'subjectId' });
  if (type === 'initiative') out.push({ key: 'primarySponsorId' }, { key: 'businessOwnerId' });
  return out;
}

export function registerStakeholderOps(S) {
  S.op('checkDuplicates', { area: 'stakeholder', summary: 'Find potential duplicate stakeholders' }, async (actor, { candidate }) => {
    S.assertCan(actor, 'R', 'stakeholder', null);
    const dups = findDuplicates(candidate || {}, await S.driver.list('stakeholder'));
    return dups.map((d) => ({ id: d.record.id, code: d.record.code, name: personName(d.record), email: d.record.email, organisation: d.record.organisation, reason: d.reason }));
  });

  // STK-047: possible duplicates across the whole stakeholder master, for review and merging. Records are
  // bucketed by email and by name and organisation, so the scan stays quick for large registers.
  S.op('duplicateScan', { area: 'stakeholder', summary: 'Find possible duplicate stakeholders across the master' }, async (actor) => {
    S.assertCan(actor, 'R', 'stakeholder', null);
    const all = (await S.driver.list('stakeholder')).filter((x) => !x.mergedInto && !x.deidentified);
    const buckets = new Map();
    for (const st of all) {
      const k = duplicateKey(st);
      if (k.email) (buckets.get(`e:${k.email}`) || buckets.set(`e:${k.email}`, []).get(`e:${k.email}`)).push(st);
      if (k.name !== '||') (buckets.get(`n:${k.name}`) || buckets.set(`n:${k.name}`, []).get(`n:${k.name}`)).push(st);
    }
    const brief = (x) => ({ id: x.id, code: x.code, name: personName(x), email: x.email || '', positionTitle: x.positionTitle || '', organisation: x.organisation || '', businessUnit: x.businessUnit || '', source: x.source || '', status: x.status, updatedAt: x.updatedAt });
    const pairs = new Map();
    for (const [key, list] of buckets) {
      if (list.length < 2) continue;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        if (asArray(list[i].notDuplicateOf).includes(list[j].id) || asArray(list[j].notDuplicateOf).includes(list[i].id)) continue;
        const id = [list[i].id, list[j].id].sort().join(':');
        const reason = key.startsWith('e:') ? 'Same email address' : 'Same name and organisation';
        if (pairs.has(id)) { if (!pairs.get(id).reasons.includes(reason)) pairs.get(id).reasons.push(reason); continue; }
        // Suggested to keep: the record from the system of record (HR or directory), then the one with an
        // email address, then the older one.
        const rank = (x) => `${['hr', 'directory'].includes(x.source) ? 0 : 1}${x.email ? 0 : 1}${x.createdAt || ''}`;
        const [a, b] = rank(list[i]) <= rank(list[j]) ? [list[i], list[j]] : [list[j], list[i]];
        pairs.set(id, { id, keep: brief(a), merge: brief(b), reasons: [reason] });
      }
    }
    return [...pairs.values()];
  });

  // A reviewed pair that is not a duplicate is not flagged again.
  S.op('dismissDuplicate', { area: 'stakeholder', summary: 'Record that two stakeholders are not duplicates' }, async (actor, { aId, bId }) => {
    const [a, b] = [await S.driver.get('stakeholder', aId), await S.driver.get('stakeholder', bId)];
    if (!a || !b) throw new AppError(404, 'Stakeholder not found.');
    S.assertCan(actor, 'U', 'stakeholder', a);
    for (const [x, other] of [[a, bId], [b, aId]]) await S.update(actor, 'stakeholder', x.id, { notDuplicateOf: uniq([...asArray(x.notDuplicateOf), other]) }, { system: true, skipValidation: true, auditAction: 'notDuplicate' });
    return { ok: true };
  });

  // Which initiatives each stakeholder takes part in, for the enterprise register (PRT-004, PRT-005).
  S.op('stakeholderInitiatives', { area: 'stakeholder', summary: 'The initiatives each stakeholder has a profile in' }, async (actor) => {
    S.assertCan(actor, 'R', 'stakeholder', null);
    const out = {};
    for (const i of await S.driver.list('initiative')) {
      if (!initiativeAccess(actor, i.id)) continue;
      for (const p of await S.driver.list('profile', { initiativeId: i.id })) if (p.stakeholderId) (out[p.stakeholderId] ||= []).push(i.id);
    }
    return out;
  });

  // Finds people in the stakeholder master for pickers, for when initiatives hold only the stakeholders they
  // use (PER-02, PER-04): by words in the name, email, code, position or organisation, or by id.
  S.op('findStakeholders', { area: 'stakeholder', summary: 'Find stakeholders in the master by name, email, code, position or organisation, or by id' }, async (actor, { q = '', ids, limit = 20 } = {}) => {
    S.assertCan(actor, 'R', 'stakeholder', null);
    const ctx = await S.accessCtx(actor, undefined);
    const max = Math.min(Number(limit) || 20, 100);
    let rows = [];
    if (ids) rows = (await Promise.all(asArray(ids).slice(0, 500).map((id) => S.driver.get('stakeholder', id)))).filter((s) => s && !s.deleted);
    else {
      const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.length) return [];
      for (const { s, hay } of await S.stakeholderIndex()) {
        if (rows.length >= max) break;
        if (s.status !== 'left' && words.every((w) => hay.includes(w)) && can(actor, 'R', 'stakeholder', s, ctx)) rows.push(s);
      }
    }
    return Promise.all(rows.filter((s) => can(actor, 'R', 'stakeholder', s, ctx)).map((s) => S.redactFor(actor, 'stakeholder', s, ctx)));
  });

  // A stakeholder's recorded relationships, group memberships and profiles in the initiatives the user can
  // open, with the names of the people at the other end, for the enterprise profile (STK-005, STK-006, STK-010).
  S.op('stakeholderLinks', { area: 'stakeholder', summary: "A stakeholder's relationships, group memberships and initiative profiles" }, async (actor, { stakeholderId }) => {
    S.assertCan(actor, 'R', 'stakeholder', null);
    const ctx = await S.accessCtx(actor, undefined);
    const visible = (type, rows, c = ctx) => Promise.all(rows.filter((r) => can(actor, 'R', type, r, c)).map((r) => S.redactFor(actor, type, r, c)));
    const relationships = await visible('relationship', (await S.driver.list('relationship')).filter((r) => r.fromId === stakeholderId || r.toId === stakeholderId));
    const memberships = await visible('membership', (await S.driver.list('membership')).filter((m) => m.stakeholderId === stakeholderId));
    const profiles = [];
    for (const i of await S.driver.list('initiative')) {
      if (!initiativeAccess(actor, i.id)) continue;
      const own = (await S.driver.list('profile', { initiativeId: i.id })).filter((p) => p.stakeholderId === stakeholderId);
      if (own.length) profiles.push(...(await visible('profile', own, await S.accessCtx(actor, i.id))));
    }
    const names = {};
    const self = await S.driver.get('stakeholder', stakeholderId);
    for (const id of uniq([self?.managerId, ...relationships.flatMap((r) => [r.fromId, r.toId])].filter(Boolean))) {
      const st = await S.driver.get('stakeholder', id);
      if (st) names[id] = st.deidentified ? 'De-identified stakeholder' : personName(st);
    }
    return { relationships, memberships, profiles, names };
  });

  // Current members of each stakeholder group, including its sub-groups and rule-based (dynamic) membership.
  S.op('groupMemberCounts', { area: 'stakeholder', summary: 'The number of current members of each stakeholder group' }, async (actor) => {
    S.assertCan(actor, 'R', 'stakeholderGroup', null);
    const ctx = { groups: await S.driver.list('stakeholderGroup'), memberships: await S.driver.list('membership'), stakeholders: (await S.driver.list('stakeholder')).filter((s) => !s.mergedInto), today: await S.today() };
    return Object.fromEntries(ctx.groups.map((g) => [g.id, groupMemberIds(g.id, ctx).size]));
  });

  // STK-046: merge preserves the history of both records by re-pointing every reference.
  S.op('mergeStakeholders', { area: 'stakeholder', summary: 'Merge a duplicate stakeholder into another, preserving history' }, async (actor, { keepId, mergeId }) => {
    if (!hasRole(actor, 'changeLead', 'admin') && !actor.system) throw new AppError(403, 'Only a change management lead or administrator can merge stakeholders.');
    if (keepId === mergeId) throw new AppError(422, 'Choose two different stakeholders.');
    const keep = await S.driver.get('stakeholder', keepId);
    const dup = await S.driver.get('stakeholder', mergeId);
    if (!keep || !dup) throw new AppError(404, 'Stakeholder not found.');
    let updated = 0;
    const swap = (v) => (v === mergeId ? keepId : v);
    for (const type of Object.keys(ENTITIES)) {
      const fields = stakeholderRefFields(type);
      if (!fields.length && type !== 'user' && type !== 'relationship' && type !== 'membership') continue;
      for (const r of await S.driver.list(type)) {
        let changed = false;
        const next = { ...r };
        for (const f of fields) {
          if (f.column) {
            const rows = asArray(r[f.key]);
            if (rows.some((row) => row?.[f.column] === mergeId)) { next[f.key] = rows.map((row) => (row?.[f.column] === mergeId ? { ...row, [f.column]: keepId } : row)); changed = true; }
          } else if (f.multi) {
            if (asArray(r[f.key]).includes(mergeId)) { next[f.key] = uniq(asArray(r[f.key]).map(swap)); changed = true; }
          } else if (r[f.key] === mergeId) { next[f.key] = keepId; changed = true; }
        }
        if (type === 'user' && r.stakeholderId === mergeId) { next.stakeholderId = keepId; changed = true; }
        if ((type === 'relationship') && (r.fromId === mergeId || r.toId === mergeId)) {
          next.fromId = swap(r.fromId); next.toId = swap(r.toId); changed = true;
          if (next.fromId === next.toId) next.deleted = true;
        }
        if (type === 'membership' && r.stakeholderId === mergeId) { next.stakeholderId = keepId; changed = true; }
        if (changed) { await S.driver.put({ ...next, version: r.version + 1, updatedAt: S.nowIso(), updatedBy: actor.id }); updated++; S.touch(r.initiativeId); }
      }
    }
    // Two profiles in the same initiative: keep one, filling gaps from the other.
    const profiles = (await S.driver.list('profile')).filter((p) => p.stakeholderId === keepId);
    const byInit = {};
    for (const p of profiles) (byInit[p.initiativeId] ||= []).push(p);
    for (const list of Object.values(byInit)) {
      if (list.length < 2) continue;
      const [a, b] = list.sort((x, y) => x.createdAt.localeCompare(y.createdAt));
      const merged = { ...a };
      for (const [k, v] of Object.entries(b)) if (isEmpty(merged[k]) && !isEmpty(v)) merged[k] = v;
      merged.ratingHistory = [...asArray(a.ratingHistory), ...asArray(b.ratingHistory)].sort((x, y) => String(x.at).localeCompare(String(y.at)));
      merged.changeRoles = uniq([...asArray(a.changeRoles), ...asArray(b.changeRoles)]);
      await S.driver.put({ ...merged, version: a.version + 1, updatedAt: S.nowIso(), updatedBy: actor.id });
      await S.driver.put({ ...b, deleted: true, version: b.version + 1, updatedAt: S.nowIso(), updatedBy: actor.id });
    }
    const filled = { ...keep };
    for (const [k, v] of Object.entries(dup)) if (isEmpty(filled[k]) && !isEmpty(v) && !['id', 'code', 'version', 'mergedInto', 'deleted'].includes(k)) filled[k] = v;
    await S.driver.put({ ...filled, version: keep.version + 1, updatedAt: S.nowIso(), updatedBy: actor.id });
    await S.driver.put({ ...dup, mergedInto: keepId, status: 'inactive', version: dup.version + 1, updatedAt: S.nowIso(), updatedBy: actor.id });
    await S.audit(actor, { action: 'merge', type: 'stakeholder', recordId: keepId, summary: `Merged ${dup.code} ${personName(dup)} into ${keep.code} ${personName(keep)}; ${updated} records re-pointed` });
    S.invalidateConfig();
    return { keepId, mergedId: mergeId, updated };
  });

  // Resolves a spreadsheet value to a stored value for one field.
  async function resolver() {
    const cache = {};
    const load = async (t) => (cache[t] ||= await S.driver.list(t));
    return async (fd, raw, initiativeId, config) => {
      if (raw == null || raw === '') return { value: null };
      const s = String(raw).trim();
      const matchList = (opts) => {
        const hit = opts.find((o) => o.id.toLowerCase() === s.toLowerCase() || o.label.toLowerCase() === s.toLowerCase());
        return hit ? { value: hit.id } : { error: `${fd.label}: "${s}" is not a recognised value` };
      };
      const opts = fd.list ? listOptions(fd.list, config) : fd.options || null;
      switch (fd.type) {
        case 'date': {
          const d = typeof raw === 'number' ? null : parseAuDate(s);
          return d ? { value: d } : { error: `${fd.label}: "${s}" is not a date (use DD/MM/YYYY)` };
        }
        case 'int':
        case 'number':
        case 'money':
          return Number.isNaN(Number(s)) ? { error: `${fd.label}: "${s}" is not a number` } : { value: Number(s) };
        case 'bool':
          return { value: /^(y|yes|true|1)$/i.test(s) };
        case 'select':
          return opts ? matchList(opts) : { value: s };
        case 'multi':
        case 'adkar': {
          const parts = s.split(/[;,]/).map((x) => x.trim()).filter(Boolean);
          const o = fd.type === 'adkar' ? ['awareness', 'desire', 'knowledge', 'ability', 'reinforcement'].map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })) : opts;
          if (!o) return { value: parts };
          const vals = [];
          for (const p of parts) {
            const r = o.find((x) => x.id.toLowerCase() === p.toLowerCase() || x.label.toLowerCase() === p.toLowerCase());
            if (!r) return { error: `${fd.label}: "${p}" is not a recognised value` };
            vals.push(r.id);
          }
          return { value: vals };
        }
        case 'ref':
        case 'refs': {
          const target = fd.ref;
          const rows = (await load(target)).filter((r) => ENTITIES[target].scope !== 'initiative' || r.initiativeId === initiativeId);
          const find = (p) => rows.find((r) => r.id === p || (r.code && r.code.toLowerCase() === p.toLowerCase()) || (r.email && r.email.toLowerCase() === p.toLowerCase())
            || (target === 'stakeholder' ? personName(r).toLowerCase() === p.toLowerCase() || personName(r, { formal: true }).toLowerCase() === p.toLowerCase() : String(entity(target).title(r) || '').toLowerCase() === p.toLowerCase()));
          const parts = fd.type === 'refs' ? s.split(/[;,]/).map((x) => x.trim()).filter(Boolean) : [s];
          const ids = [];
          for (const p of parts) {
            const r = find(p);
            if (!r) return { error: `${fd.label}: no ${entity(target).label.toLowerCase()} matches "${p}"` };
            ids.push(r.id);
          }
          return { value: fd.type === 'refs' ? ids : ids[0] };
        }
        case 'user':
        case 'users': {
          const users = await load('user');
          const parts = fd.type === 'users' ? s.split(/[;,]/).map((x) => x.trim()).filter(Boolean) : [s];
          const ids = [];
          for (const p of parts) {
            const u = users.find((x) => x.id === p || x.email?.toLowerCase() === p.toLowerCase() || x.name?.toLowerCase() === p.toLowerCase());
            if (!u) return { error: `${fd.label}: no user matches "${p}"` };
            ids.push(u.id);
          }
          return { value: fd.type === 'users' ? ids : ids[0] };
        }
        default:
          return { value: s };
      }
    };
  }

  // INT-009 / STK-047 / AC-06: validate, report and import rows for any register.
  S.op('importRecords', { area: 'stakeholder', summary: 'Validate or import spreadsheet rows into a register, with duplicate detection' }, async (actor, { type, initiativeId, rows = [], mode = 'validate', decisions = {} }) => {
    const meta = entity(type);
    if (meta.scope === 'initiative') S.assertInitiative(actor, await S.initiative(initiativeId));
    S.assertCan(actor, 'C', type, null);
    const config = await S.getConfig();
    const resolve = await resolver();
    const fields = fieldsOf(type, config).filter((f) => !f.system && !f.readOnly && !f.hidden && f.type !== 'json' && f.type !== 'table' && f.type !== 'richtext');
    const existingStakeholders = type === 'stakeholder' ? await S.driver.list('stakeholder') : [];
    const report = [];
    const seenInFile = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const data = {};
      const errors = [];
      for (const fd of fields) {
        if (!(fd.key in row)) continue;
        const r = await resolve(fd, row[fd.key], initiativeId, config);
        if (r.error) errors.push(r.error);
        else if (r.value != null) data[fd.key] = r.value;
      }
      for (const fd of fieldsOf(type, config)) if (fd.default !== undefined && data[fd.key] === undefined) data[fd.key] = fd.default;
      if (type === 'stakeholder') data.source = data.source || 'import';
      errors.push(...validateRecord(type, normalise(type, data, config), config).map((e) => e.message));
      let duplicateOf = null;
      if (type === 'stakeholder' && !errors.length) {
        const d = findDuplicates(data, [...existingStakeholders, ...seenInFile]);
        if (d.length) {
          const rec = d[0].record;
          duplicateOf = rec._row != null
            ? { inFile: true, row: rec._row + 1, name: personName(rec), reason: `${d[0].reason} as row ${rec._row + 1} of this file` }
            : { id: rec.id, code: rec.code, name: personName(rec), reason: d[0].reason };
        }
        seenInFile.push({ ...data, id: `row-${i}`, _row: i });
      }
      report.push({ row: i + 1, status: errors.length ? 'error' : duplicateOf ? 'duplicate' : 'ok', errors, duplicateOf, data });
    }
    const summary = { total: rows.length, ok: report.filter((r) => r.status === 'ok').length, duplicates: report.filter((r) => r.status === 'duplicate').length, errors: report.filter((r) => r.status === 'error').length };
    if (mode !== 'commit') return { mode, summary, report: report.map(({ data, ...r }) => r) };
    const result = { created: 0, merged: 0, skipped: 0, failed: 0, details: [] };
    for (const r of report) {
      try {
        if (r.status === 'error') { result.failed++; continue; }
        if (r.status === 'duplicate') {
          const decision = decisions[r.row] || decisions[String(r.row)] || 'skip';
          if (decision === 'skip' || (r.duplicateOf.inFile && decision === 'merge')) { result.skipped++; continue; }
          if (decision === 'merge') {
            const cur = await S.driver.get('stakeholder', r.duplicateOf.id);
            const patch = {};
            for (const [k, v] of Object.entries(r.data)) if (!isEmpty(v) && k !== 'source') patch[k] = v;
            await S.update(actor, 'stakeholder', cur.id, patch, { reason: 'Updated from import' });
            result.merged++;
            continue;
          }
        }
        await S.create(actor, type, { ...r.data, initiativeId }, { allowDuplicate: r.status === 'duplicate' });
        result.created++;
      } catch (e) {
        result.failed++;
        result.details.push({ row: r.row, error: e.message });
      }
    }
    await S.audit(actor, { action: 'import', type, initiativeId: initiativeId || null, summary: `Imported ${type}: ${result.created} created, ${result.merged} merged, ${result.skipped} skipped, ${result.failed} failed` });
    return { mode, summary, result, report: report.map(({ data, ...r }) => r) };
  });

  // Adds stakeholders or groups to an initiative with default analysis.
  S.op('addProfiles', { area: 'stakeholder', summary: 'Add stakeholders or groups to an initiative' }, async (actor, { initiativeId, stakeholderIds = [], groupIds = [], defaults = {} }) => {
    const existing = await S.driver.list('profile', { initiativeId });
    const out = [];
    for (const sid of stakeholderIds) {
      if (existing.some((p) => p.stakeholderId === sid)) continue;
      out.push(await S.create(actor, 'profile', { initiativeId, subjectType: 'person', stakeholderId: sid, changeRoles: defaults.changeRoles || ['impactedEmployee'], relationshipOwnerId: defaults.relationshipOwnerId || actor.id, influence: defaults.influence || 'low', interest: defaults.interest || 'medium', impactedGroupIds: defaults.impactedGroupIds || [] }));
    }
    for (const gid of groupIds) {
      if (existing.some((p) => p.groupId === gid)) continue;
      out.push(await S.create(actor, 'profile', { initiativeId, subjectType: 'group', groupId: gid, changeRoles: defaults.changeRoles || ['impactedEmployee'], relationshipOwnerId: defaults.relationshipOwnerId || actor.id, influence: defaults.influence || 'medium', interest: defaults.interest || 'high', impactedGroupIds: defaults.impactedGroupIds || [] }));
    }
    return out;
  });

  // RUL-19: a stakeholder who leaves has future engagements flagged for cancellation or reassignment.
  S.op('_stakeholderLeft', { internal: true }, async (actor, st) => {
    const today = await S.today();
    for (const i of await S.driver.list('initiative')) {
      const open = (await S.driver.list('engagement', { initiativeId: i.id })).filter((e) => ['planned', 'scheduled', 'rescheduled'].includes(e.status) && (e.plannedDate || '') >= today && asArray(e.stakeholderIds).includes(st.id));
      const profile = (await S.driver.list('profile', { initiativeId: i.id })).find((p) => p.stakeholderId === st.id);
      if (!open.length && !profile) continue;
      await S.create(S.SYSTEM, 'task', { initiativeId: i.id, title: `Stakeholder left: reassign or cancel engagements for ${personName(st)}`, description: `${open.length} future engagement(s): ${open.map((e) => e.code).join(', ') || 'none'}. Review their relationships and actions (RUL-19).`, assigneeId: i.changeLeadId || actor.id, priority: 'high', status: 'open', recordType: 'stakeholder', recordId: st.id }, { system: true });
      await S.notify([i.changeLeadId, profile?.relationshipOwnerId], { kind: 'leaver', initiativeId: i.id, title: `${personName(st)} has left the organisation`, body: `${open.length} future engagement(s) need cancellation or reassignment.`, link: { type: 'stakeholder', id: st.id } });
    }
  });

  // RUL-19: a user who leaves has relationships and actions reassigned to the change lead.
  S.op('_userLeft', { internal: true }, async (actor, user) => {
    let moved = 0;
    for (const i of await S.driver.list('initiative')) {
      const lead = i.changeLeadId && i.changeLeadId !== user.id ? i.changeLeadId : null;
      if (!lead) continue;
      for (const p of await S.driver.list('profile', { initiativeId: i.id })) {
        const patch = {};
        if (p.relationshipOwnerId === user.id) patch.relationshipOwnerId = lead;
        if (p.delegateId === user.id) patch.delegateId = null;
        if (Object.keys(patch).length) { await S.update(S.SYSTEM, 'profile', p.id, patch, { system: true, skipValidation: true, reason: `${user.name} left (RUL-19)` }); moved++; }
      }
      for (const t of (await S.driver.list('task', { initiativeId: i.id })).filter((t) => t.assigneeId === user.id && ['open', 'inProgress'].includes(t.status))) {
        await S.update(S.SYSTEM, 'task', t.id, { assigneeId: lead }, { system: true, reason: `${user.name} left (RUL-19)` });
        moved++;
      }
      if (moved) await S.notify([lead], { kind: 'leaver', initiativeId: i.id, title: `${user.name} has left: relationships and actions reassigned to you`, body: 'Reallocate them to the change team as needed.' });
    }
    return { moved };
  });

  // PRV-05: all personal information held about an individual, across initiatives.
  S.op('personalInformation', { area: 'stakeholder', summary: 'Find all personal information held about a stakeholder (access requests)' }, async (actor, { stakeholderId }) => {
    if (!hasRole(actor, 'changeLead', 'admin') && !actor.system) throw new AppError(403, 'Only a change management lead or administrator can run a personal information search.');
    const st = await S.driver.get('stakeholder', stakeholderId);
    if (!st) throw new AppError(404, 'Stakeholder not found.');
    const found = { stakeholder: st, records: [] };
    for (const type of Object.keys(ENTITIES)) {
      if (type === 'stakeholder') continue;
      const fields = stakeholderRefFields(type);
      for (const r of await S.driver.list(type)) {
        const hit = fields.some((f) => (f.column ? asArray(r[f.key]).some((row) => row?.[f.column] === stakeholderId) : f.multi ? asArray(r[f.key]).includes(stakeholderId) : r[f.key] === stakeholderId))
          || (type === 'assessment' && r.subjectType === 'stakeholder' && r.subjectId === stakeholderId)
          || (type === 'relationship' && (r.fromId === stakeholderId || r.toId === stakeholderId))
          || (type === 'membership' && r.stakeholderId === stakeholderId)
          || (type === 'user' && r.stakeholderId === stakeholderId);
        if (hit) found.records.push({ type, label: entity(type).label, id: r.id, code: r.code, initiativeId: r.initiativeId || null, record: r });
      }
    }
    await S.audit(actor, { action: 'privacySearch', type: 'stakeholder', recordId: stakeholderId, summary: `Personal information search for ${st.code}: ${found.records.length} records` });
    return found;
  });

  // STK-050 / PRV-06: de-identify a stakeholder's personal information.
  S.op('deidentifyStakeholder', { area: 'stakeholder', summary: 'De-identify a stakeholder record and related free text' }, async (actor, { stakeholderId, reason }) => {
    if (!hasRole(actor, 'changeLead', 'admin') && !actor.system) throw new AppError(403, 'Only a change management lead or administrator can de-identify records.');
    if (!String(reason || '').trim()) throw new AppError(422, 'Record the reason for de-identification.');
    const st = await S.driver.get('stakeholder', stakeholderId);
    if (!st) throw new AppError(404, 'Stakeholder not found.');
    const holds = (await S.driver.list('initiative')).filter((i) => i.legalHold);
    const profiles = (await S.driver.list('profile')).filter((p) => p.stakeholderId === stakeholderId);
    if (profiles.some((p) => holds.some((h) => h.id === p.initiativeId))) throw new AppError(409, 'A legal hold applies to an initiative that references this stakeholder (REC-02).');
    await S.driver.put({ ...st, givenName: 'De-identified', familyName: st.code, preferredName: null, email: null, phone: null, positionTitle: 'De-identified', sourceId: null, availability: null, language: null, engagementAdjustments: null, managerId: null, deidentified: true, version: st.version + 1, updatedAt: S.nowIso(), updatedBy: actor.id });
    for (const p of profiles) await S.driver.put({ ...p, interests: null, concerns: null, priorities: null, wiifm: null, privateNotes: null, version: p.version + 1, updatedAt: S.nowIso(), updatedBy: actor.id });
    for (const r of (await S.driver.list('surveyResponse')).filter((x) => x.stakeholderId === stakeholderId)) await S.driver.put({ ...r, stakeholderId: null, version: r.version + 1 });
    await S.audit(actor, { action: 'deidentify', type: 'stakeholder', recordId: stakeholderId, summary: `De-identified stakeholder ${st.code}`, reason });
    S.invalidateConfig();
    return { stakeholderId, profiles: profiles.length };
  });
}
