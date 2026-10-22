// Initiative lifecycle and enterprise operations: INI-001, INI-008 (create from template or copy),
// SUS-007 (close), INT-010 (export), INI-006/PLN-008 (milestone import), PRT (portfolio), SUS-004 (lessons).
import { AppError, asArray, uid, clone } from '../../util.js';
import { ENTITIES, INITIATIVE_TYPES, entity } from '../../schema.js';
import { hasRole, initiativeAccess } from '../../access.js';
import { portfolioView, initiativeComparison, sharedStakeholders } from '../../rules/portfolio.js';
import { parseMspdi, parseMilestoneCsv } from '../../integrations/msproject.js';
import { addMonths } from '../../dates.js';

// Registers copied when an initiative is created from another (INI-008). Stakeholder assessments are
// excluded unless explicitly selected.
export const COPYABLE = ['milestone', 'objective', 'measure', 'impactedGroup', 'impact', 'profile', 'blueprint', 'activity', 'keyMessage', 'faq', 'toolkitItem', 'tna', 'trainingIntervention', 'readinessChecklist', 'risk', 'coalitionMember', 'changeAgent', 'sustainmentItem', 'strategy', 'narrative'];

export function registerInitiativeOps(S) {
  S.op('createInitiative', { area: 'initiative', summary: 'Create a change initiative, optionally copying another initiative' }, async (actor, { data = {}, copyFrom }) => {
    if (!actor.system && !hasRole(actor, 'changeLead')) throw new AppError(403, 'Only a change management lead can create initiatives.');
    const init = await S.create(actor, 'initiative', { status: 'active', changeLeadId: actor.id, ...data, templateOf: copyFrom?.initiativeId || null }, { raw: true });
    // Give the creator access.
    const me = await S.driver.get('user', actor.id);
    if (me && !asArray(me.initiativeIds).includes(init.id)) await S.driver.put({ ...me, initiativeIds: [...asArray(me.initiativeIds), init.id], version: me.version + 1 });
    if (actor.initiativeIds && !actor.initiativeIds.includes(init.id)) actor.initiativeIds.push(init.id);
    let copied = {};
    if (copyFrom?.initiativeId) {
      const src = await S.initiative(copyFrom.initiativeId);
      if (!src) throw new AppError(404, 'Source initiative not found.');
      S.assertInitiative(actor, src);
      const include = new Set(asArray(copyFrom.include).filter((t) => COPYABLE.includes(t) || (t === 'assessment' && copyFrom.includeAssessments)));
      if (copyFrom.includeAssessments) include.add('assessment');
      const idMap = {};
      const rows = (await S.driver.listInitiative(src.id)).filter((r) => include.has(r.type));
      for (const r of rows) idMap[r.id] = uid();
      const remap = (v) => (Array.isArray(v) ? v.map(remap) : typeof v === 'string' && idMap[v] ? idMap[v] : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)])) : v);
      for (const r of rows) {
        if (r.type === 'assessment' && r.subjectType === 'stakeholder' && !copyFrom.includeAssessments) continue;
        const data2 = remap(clone(r));
        for (const k of ['id', 'type', 'initiativeId', 'code', 'version', 'seq', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy']) delete data2[k];
        if (r.type === 'activity') Object.assign(data2, { status: 'notStarted', percentComplete: 0, commsStatus: data2.kind === 'communication' ? 'draft' : data2.commsStatus, sentAt: null, confirmation: null });
        if (r.type === 'strategy') Object.assign(data2, { status: 'draft', approvedVersion: null, baselineAt: null });
        if (r.type === 'blueprint') data2.status = 'draft';
        if (r.type === 'keyMessage' || r.type === 'faq') data2.status = 'draft';
        if (r.type === 'profile') data2.ratingHistory = [];
        await S.create(actor, r.type, { ...data2, initiativeId: init.id }, { id: idMap[r.id], skipValidation: true, noAudit: true, system: true });
        copied[r.type] = (copied[r.type] || 0) + 1;
      }
      for (const k of ['selectedPlans', 'planRationale', 'customPlans', 'deliveryApproach', 'classification']) if (src[k] != null && data[k] == null) init[k] = src[k];
      await S.update(S.SYSTEM, 'initiative', init.id, { selectedPlans: src.selectedPlans || null, planRationale: src.planRationale || null, customPlans: src.customPlans || null }, { system: true, skipValidation: true });
      await S.audit(actor, { action: 'copy', type: 'initiative', recordId: init.id, initiativeId: init.id, summary: `Created from ${src.name}: ${Object.entries(copied).map(([t, n]) => `${n} ${t}`).join(', ')}` });
    }
    return { initiative: await S.driver.get('initiative', init.id), copied };
  });

  // SUS-007: closing makes the initiative read-only; records are retained under the retention rules.
  S.op('closeInitiative', { area: 'initiative', summary: 'Close an initiative (read-only thereafter)' }, async (actor, { id, reason }) => {
    if (!actor.system && !hasRole(actor, 'changeLead')) throw new AppError(403, 'Only a change management lead can close an initiative.');
    const model = await S.model(id);
    const open = [];
    if (model.closeout?.status !== 'approved') open.push('The Change Management Closeout has not been approved');
    if (model.handoverItems.some((h) => h.status !== 'accepted')) open.push('Not every handover item has been accepted');
    if (open.length && !String(reason || '').trim()) throw Object.assign(new AppError(422, `Before closing: ${open.join('; ')}. Give a reason to close anyway.`), { details: open });
    // Open engagements are cancelled so nothing is left dangling.
    for (const e of (await S.driver.list('engagement', { initiativeId: id })).filter((x) => ['planned', 'scheduled', 'rescheduled'].includes(x.status))) {
      await S.update(S.SYSTEM, 'engagement', e.id, { status: 'cancelled' }, { system: true, reason: 'Initiative closed', skipValidation: true });
    }
    const rec = await S.update(actor, 'initiative', id, { status: 'closed' }, { reason: reason || 'Initiative closed' });
    await S.audit(actor, { action: 'close', type: 'initiative', recordId: id, initiativeId: id, summary: 'Initiative closed and made read-only', reason });
    return rec;
  });

  S.op('reopenInitiative', { area: 'initiative', summary: 'Reopen a closed initiative (administrators)' }, async (actor, { id, reason }) => {
    if (!hasRole(actor, 'admin') && !actor.system) throw new AppError(403, 'Only an administrator can reopen a closed initiative.');
    if (!String(reason || '').trim()) throw new AppError(422, 'A reason is required.');
    return S.update(actor, 'initiative', id, { status: 'active', closedAt: null }, { reopen: true, reason, system: true });
  });

  S.op('setLegalHold', { area: 'initiative', summary: 'Place or release a legal hold on an initiative (REC-02)' }, async (actor, { id, hold, reason }) => {
    if (!hasRole(actor, 'admin', 'changeLead') && !actor.system) throw new AppError(403, 'Only an administrator or change management lead can set a legal hold.');
    if (!String(reason || '').trim()) throw new AppError(422, 'A reason is required.');
    return S.update(actor, 'initiative', id, { legalHold: !!hold }, { reason, reopen: true, system: true, skipValidation: true });
  });

  // INT-010: all of an initiative's data in an open, documented format.
  S.op('exportInitiative', { area: 'initiative', summary: 'Export all of an initiative\'s data as JSON' }, async (actor, { id }) => {
    const data = await S.loadInitiative(actor, id);
    await S.audit(actor, { action: 'export', type: 'initiative', recordId: id, initiativeId: id, summary: 'Exported all initiative data (JSON)' });
    const schema = Object.fromEntries(Object.entries(ENTITIES).map(([t, e]) => [t, { label: e.label, scope: e.scope, fields: e.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, ref: f.ref, list: f.list, sensitive: !!f.sensitive })) }]));
    return { format: 'change-management-workbench-export', version: 1, exportedAt: S.nowIso(), exportedBy: actor.name, initiative: data.initiative, records: data.records, schema };
  });

  // INI-006 / PLN-008: import releases and milestones from Microsoft Project XML or CSV.
  S.op('importMilestones', { area: 'initiative', summary: 'Import milestones from Microsoft Project XML (MSPDI) or CSV' }, async (actor, { initiativeId, format, content, mode = 'validate' }) => {
    S.assertInitiative(actor, await S.initiative(initiativeId));
    const items = format === 'mspdi' ? parseMspdi(content) : parseMilestoneCsv(content);
    const existing = await S.driver.list('milestone', { initiativeId });
    const report = items.map((it) => {
      const match = existing.find((m) => (it.externalRef && m.externalRef === it.externalRef) || m.name.toLowerCase() === it.name.toLowerCase());
      return { ...it, action: match ? (match.date === it.date ? 'unchanged' : 'update') : 'create', existingId: match?.id || null, from: match?.date || null };
    });
    if (mode !== 'commit') return { report };
    let created = 0, updated = 0;
    for (const r of report) {
      if (r.action === 'create') { await S.create(actor, 'milestone', { initiativeId, name: r.name, kind: r.kind || 'other', date: r.date, source: 'import', externalRef: r.externalRef || null, description: r.description || '' }); created++; }
      if (r.action === 'update') { await S.update(actor, 'milestone', r.existingId, { date: r.date, externalRef: r.externalRef || null }, { reason: 'Synchronised from project schedule' }); updated++; }
    }
    return { report, created, updated };
  });

  // PRT-001 to PRT-004: portfolio data across the initiatives the user can see.
  S.op('portfolio', { area: 'initiative', summary: 'Portfolio change heatmap, saturation, comparison and shared stakeholders' }, async (actor, { from, to, unit = 'month', includeClosed = false } = {}) => {
    const today = await S.today();
    const config = await S.getConfig();
    const initiatives = (await S.driver.list('initiative')).filter((i) => initiativeAccess(actor, i.id) && (includeClosed || i.status !== 'closed'));
    const models = [];
    for (const i of initiatives) models.push(await S.model(i.id));
    const start = from || addMonths(today, -2).slice(0, 8) + '01';
    const end = to || addMonths(today, 10);
    const view = portfolioView(models, { from: start, to: end, unit, settings: config.settings });
    return { from: start, to: end, unit, ...view, comparison: initiativeComparison(models), shared: sharedStakeholders(models, today) };
  });

  // SUS-004 / PRT-005: lessons learned searchable across initiatives.
  S.op('searchLessons', { area: 'lessons', summary: 'Search lessons learned across initiatives' }, async (actor, { q = '', category } = {}) => {
    const initiatives = await S.driver.list('initiative');
    const names = Object.fromEntries(initiatives.map((i) => [i.id, i.name]));
    const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
    return (await S.driver.list('lesson')).filter((l) => (!category || l.category === category) && words.every((w) => [l.title, l.whatWorked, l.whatDidNot, l.recommendation, l.tags].join(' ').toLowerCase().includes(w)))
      .map((l) => ({ ...l, initiativeName: names[l.initiativeId] || '' }));
  });

  // PRT-005: enterprise reuse of key messages across initiatives.
  S.op('enterpriseMessages', { area: 'plans', summary: 'Key messages shared for reuse across initiatives' }, async (actor) => {
    const initiatives = await S.driver.list('initiative');
    const names = Object.fromEntries(initiatives.map((i) => [i.id, i.name]));
    return (await S.driver.list('keyMessage')).filter((m) => m.enterprise && m.status === 'approved').map((m) => ({ ...m, initiativeName: names[m.initiativeId] || '' }));
  });

  // Singletons (strategy, closeout) are created on first use.
  S.op('ensureSingleton', { area: 'plans', summary: 'Get or create the strategy or closeout record for an initiative' }, async (actor, { initiativeId, type }) => {
    if (!['strategy', 'closeout'].includes(type)) throw new AppError(422, 'Only strategy and closeout are singletons.');
    const existing = (await S.driver.list(type, { initiativeId }))[0];
    if (existing) return S.redactFor(actor, type, existing);
    return S.create(actor, type, { initiativeId, status: 'draft' });
  });

  S.op('initiativeTypes', { area: 'config', summary: 'List initiative-level record types' }, async () => INITIATIVE_TYPES.map((t) => ({ type: t, label: entity(t).label })));
}
