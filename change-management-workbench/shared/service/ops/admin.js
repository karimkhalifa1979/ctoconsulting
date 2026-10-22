// Administration operations: configuration (ADM-001 to ADM-010), audit (SEC-05, PRV-07), retention and
// disposal (ADM-006, PRV-06, REC-02, Section 10.5).
import { AppError, asArray, canonicalJson, sha256Hex, clone } from '../../util.js';
import { hasRole } from '../../access.js';
import { addMonths, diffDays } from '../../dates.js';

const CONFIG_KEYS = ['settings', 'lists', 'customFields', 'interventions', 'questionSets', 'readinessChecklists', 'focusRules', 'riskMatrix'];

export function registerAdminOps(S) {
  const requireAdmin = (actor) => {
    if (!actor.system && !hasRole(actor, 'admin')) throw new AppError(403, 'Administrator access is required.');
  };

  S.op('getConfig', { area: 'config', summary: 'Read the effective configuration' }, async () => S.getConfig());

  S.op('setConfig', { area: 'config', summary: 'Change a configuration area (administrators)' }, async (actor, { key, value }) => {
    requireAdmin(actor);
    if (!CONFIG_KEYS.includes(key)) throw new AppError(422, `Unknown configuration area ${key}.`);
    const before = await S.driver.getConfig(key);
    await S.driver.setConfig(key, value);
    S.invalidateConfig();
    const changed = key === 'settings' && before ? Object.keys({ ...before, ...value }).filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(value?.[k])) : [key];
    await S.audit(actor, { action: 'config', type: 'config', recordId: key, summary: `Configuration changed: ${key}${changed.length && key === 'settings' ? ` (${changed.join(', ')})` : ''}` });
    return S.getConfig();
  });

  // ADM-010: promote configuration between environments.
  S.op('exportConfig', { area: 'config', summary: 'Export configuration and templates for promotion to another environment' }, async (actor) => {
    requireAdmin(actor);
    const out = { format: 'cmw-config', version: 1, exportedAt: S.nowIso(), config: {}, templates: await S.driver.list('template') };
    for (const k of CONFIG_KEYS) out.config[k] = await S.driver.getConfig(k);
    await S.audit(actor, { action: 'export', type: 'config', summary: 'Configuration exported' });
    return out;
  });

  S.op('importConfig', { area: 'config', summary: 'Import configuration exported from another environment' }, async (actor, { bundle, includeTemplates = true }) => {
    requireAdmin(actor);
    if (bundle?.format !== 'cmw-config') throw new AppError(422, 'This is not a configuration export file.');
    for (const k of CONFIG_KEYS) if (bundle.config?.[k] != null) await S.driver.setConfig(k, bundle.config[k]);
    let templates = 0;
    if (includeTemplates) {
      for (const t of asArray(bundle.templates)) {
        const cur = await S.driver.get('template', t.id);
        await S.driver.put({ ...t, version: (cur?.version || 0) + 1, updatedAt: S.nowIso(), updatedBy: actor.id });
        templates++;
      }
    }
    S.invalidateConfig();
    await S.audit(actor, { action: 'config', type: 'config', summary: `Configuration imported (${templates} templates)` });
    return { ok: true, templates };
  });

  // SEC-05 / PRV-07: audit trail queries, verification of the hash chain and export to a SIEM.
  S.op('auditQuery', { area: 'audit', summary: 'Search the audit trail' }, async (actor, filter = {}) => {
    if (!actor.system && !hasRole(actor, 'admin', 'auditor', 'changeLead')) throw new AppError(403, 'You cannot view the audit trail.');
    if (hasRole(actor, 'changeLead') && !hasRole(actor, 'admin', 'auditor') && !filter.initiativeId) throw new AppError(422, 'Choose an initiative.');
    return S.driver.queryAudit(filter);
  });

  S.op('auditVerify', { area: 'audit', summary: 'Verify that the audit trail has not been altered' }, async (actor) => {
    if (!actor.system && !hasRole(actor, 'admin', 'auditor')) throw new AppError(403, 'You cannot verify the audit trail.');
    const events = await S.driver.allAudit();
    let prev = 'genesis';
    for (const e of events) {
      if (e.prevHash !== prev) return { ok: false, brokenAt: e.seq, reason: 'Chain link mismatch', checked: e.seq - 1 };
      const h = await sha256Hex(prev + canonicalJson({ ...e, hash: undefined }));
      if (h !== e.hash) return { ok: false, brokenAt: e.seq, reason: 'Event content does not match its hash', checked: e.seq - 1 };
      prev = e.hash;
    }
    return { ok: true, checked: events.length, lastHash: prev };
  });

  S.op('auditExport', { area: 'audit', summary: 'Export the audit trail as JSON lines for a SIEM' }, async (actor, filter = {}) => {
    if (!actor.system && !hasRole(actor, 'admin', 'auditor')) throw new AppError(403, 'You cannot export the audit trail.');
    const { rows } = await S.driver.queryAudit({ ...filter, limit: 1000000 });
    await S.audit(actor, { action: 'export', type: 'audit', summary: `Audit trail exported (${rows.length} events)` });
    return { jsonl: rows.reverse().map((r) => JSON.stringify(r)).join('\n') };
  });

  // ADM-006 / PRV-06 / REC-02: apply retention, de-identification and disposal rules.
  S.op('applyRetention', { area: 'config', summary: 'Apply retention and disposal rules (dry run by default)' }, async (actor, { dryRun = true } = {}) => {
    requireAdmin(actor);
    const config = await S.getConfig();
    const rules = config.settings.retention;
    const today = await S.today();
    const actions = [];
    const expired = (from, years) => from && addMonths(String(from).slice(0, 10), Math.round(years * 12)) <= today;
    const initiatives = await S.driver.list('initiative');
    for (const i of initiatives) {
      if (i.legalHold) { actions.push({ kind: 'skip', initiativeId: i.id, detail: `${i.name}: legal hold applies` }); continue; }
      if (i.status === 'closed' && expired(i.closedAt, rules.engagement.years) && rules.engagement.action === 'deidentify') {
        const engs = (await S.driver.list('engagement', { initiativeId: i.id })).filter((e) => !e.deidentified);
        if (engs.length) actions.push({ kind: 'deidentify', type: 'engagement', initiativeId: i.id, count: engs.length, detail: `${i.name}: de-identify ${engs.length} engagement records`, run: async () => { for (const e of engs) await S.driver.put({ ...e, summary: '<p>[De-identified under the retention schedule]</p>', questions: null, feedback: null, concerns: asArray(e.concerns).map((c) => ({ ...c, text: '[De-identified]' })), sentiments: [], keyMessagesText: null, deidentified: true, version: e.version + 1 }); } });
      }
    }
    // Stakeholder personal information: de-identify when every initiative referencing them has expired.
    if (rules.stakeholderPersonalInfo.action === 'deidentify') {
      const profiles = await S.driver.list('profile');
      for (const s of (await S.driver.list('stakeholder')).filter((x) => !x.deidentified && !x.mergedInto)) {
        const inits = profiles.filter((p) => p.stakeholderId === s.id).map((p) => initiatives.find((i) => i.id === p.initiativeId)).filter(Boolean);
        if (!inits.length || inits.some((i) => i.legalHold || i.status !== 'closed' || !expired(i.closedAt, rules.stakeholderPersonalInfo.years))) continue;
        actions.push({ kind: 'deidentify', type: 'stakeholder', recordId: s.id, detail: `De-identify stakeholder ${s.code}`, run: () => S.ops.deidentifyStakeholder(S.SYSTEM, { stakeholderId: s.id, reason: 'Retention period ended' }) });
      }
    }
    // Survey responses.
    if (rules.surveyResponse.action === 'delete') {
      const surveys = await S.driver.list('survey');
      for (const sv of surveys.filter((x) => x.status === 'closed' && expired(x.closesAt, rules.surveyResponse.years))) {
        const resp = (await S.driver.list('surveyResponse')).filter((r) => r.surveyId === sv.id);
        if (resp.length && !initiatives.find((i) => i.id === sv.initiativeId)?.legalHold) actions.push({ kind: 'delete', type: 'surveyResponse', count: resp.length, detail: `Delete ${resp.length} responses to "${sv.title}"`, run: async () => { for (const r of resp) await S.driver.hardDelete(r.id); } });
      }
    }
    // Draft and superseded artefacts.
    if (rules.artefactDraft.action === 'delete') {
      for (const a of (await S.driver.list('artefact')).filter((x) => ['draft', 'superseded'].includes(x.status) && expired(x.createdAt, rules.artefactDraft.years))) {
        if (initiatives.find((i) => i.id === a.initiativeId)?.legalHold) continue;
        actions.push({ kind: 'delete', type: 'artefact', recordId: a.id, detail: `Delete ${a.status} artefact ${a.title} v${a.versionLabel}`, run: async () => { for (const f of asArray(a.files)) await S.driver.deleteBlob(f.blobId); if (a.snapshotId) await S.driver.deleteBlob(a.snapshotId); await S.driver.hardDelete(a.id); } });
      }
    }
    if (!dryRun) {
      for (const a of actions) {
        if (!a.run) continue;
        await a.run();
        await S.audit(actor, { action: 'disposal', type: a.type, recordId: a.recordId || null, initiativeId: a.initiativeId || null, summary: a.detail });
      }
      S.invalidateConfig();
    }
    return { dryRun, today, actions: actions.map(({ run, ...a }) => a) };
  });

  S.op('disposalRecord', { area: 'audit', summary: 'Produce the disposal record (all disposal actions taken)' }, async (actor) => {
    if (!actor.system && !hasRole(actor, 'admin', 'auditor')) throw new AppError(403, 'Administrator or auditor access is required.');
    return (await S.driver.queryAudit({ action: 'disposal', limit: 100000 })).rows;
  });

  // MNT-03: health information for operators.
  S.op('systemHealth', { area: 'config', summary: 'Storage and service health' }, async (actor) => {
    requireAdmin(actor);
    const stats = await S.driver.stats?.();
    const verify = await S.ops.auditVerify(S.SYSTEM, {});
    return { mode: S.env.mode || 'server', storage: S.driver.kind, stats, audit: verify, time: S.nowIso(), version: S.env.version || '1.0.0' };
  });

  S.op('userDirectory', { area: 'users', summary: 'Users with roles and assignments (administrators)' }, async (actor) => {
    requireAdmin(actor);
    return (await S.driver.list('user')).map((u) => ({ ...clone(u) }));
  });

  S.op('aiLog', { area: 'audit', summary: 'AI prompts and outputs logged for audit (AIA-006)' }, async (actor, { limit = 200 } = {}) => {
    if (!actor.system && !hasRole(actor, 'admin', 'auditor')) throw new AppError(403, 'Administrator or auditor access is required.');
    return (await S.driver.queryAudit({ action: 'ai', limit })).rows;
  });

  S.op('daysBetween', { area: 'config', summary: 'Days between two dates' }, async (actor, { a, b }) => ({ days: diffDays(a, b) }));
}
