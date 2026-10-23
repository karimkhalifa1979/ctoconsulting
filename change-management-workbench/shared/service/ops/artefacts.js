// Artefact generation operations (Section 8; Figure 3; UC-07, UC-08; ART-001 to ART-030; RUL-16, RUL-17).
// The rendering engine is loaded on demand so the browser bundle stays small.
import { AppError, asArray, uid, sortBy, canonicalJson, sha256Hex, personName } from '../../util.js';
import { can, canSeeSensitive, hasRole } from '../../access.js';
import { CATALOGUE, catalogueEntry } from '../../artefacts/catalogue.js';
import { nextDraftVersion } from './workflow.js';
import { runReport, summariseReport } from '../../reportBuilder.js';
import { fmtDate, todayIso, zonedInstant, addDays, addMonths, maxIso, dayOfWeek } from '../../dates.js';

const engine = () => import('../../artefacts/engine.js');

export function registerArtefactOps(S) {
  S.op('artefactCatalogue', { area: 'artefacts', summary: 'The standard artefact catalogue (Table 11)' }, async () => CATALOGUE);

  async function resolveTemplate(artefactType, params) {
    const templates = await S.driver.list('template');
    if (params.templateId) {
      const t = templates.find((x) => x.id === params.templateId);
      if (!t) throw new AppError(404, 'Template not found.');
      return t;
    }
    const pick = (list) => sortBy(list, '-templateVersion')[0];
    return pick(templates.filter((t) => t.artefactType === artefactType && t.state === 'published' && (t.variant || 'full') === (params.variant || 'full')))
      || pick(templates.filter((t) => t.artefactType === artefactType && t.state === 'published'))
      || pick(templates.filter((t) => t.artefactType === '*' && t.state === 'published'))
      || null;
  }

  // The tagged Word template and the organisation's PowerPoint template, when the template has them.
  async function withFiles(t) {
    if (!t?.docxTemplateId && !t?.pptxThemeId) return t;
    const docx = t.docxTemplateId ? await S.driver.getBlob(t.docxTemplateId) : null;
    const pptx = t.pptxThemeId ? await S.driver.getBlob(t.pptxThemeId) : null;
    return { ...t, ...(docx ? { docxBytes: docx.bytes } : {}), ...(pptx ? { pptxBytes: pptx.bytes } : {}) };
  }

  // Template content as it was at a given version (ART-026).
  function templateAt(t, version) {
    if (!t || !version || version === t.templateVersion) return t;
    const old = asArray(t.versions).find((v) => v.templateVersion === version);
    return old ? { ...t, ...old } : t;
  }

  async function checkAccess(actor, initiativeId, params) {
    const initiative = await S.initiative(initiativeId);
    if (!initiative) throw new AppError(404, 'Initiative not found.');
    S.assertInitiative(actor, initiative);
    const ctx = await S.accessCtx(actor, initiativeId);
    const draft = { artefactType: params.artefactType, params, createdBy: actor.id };
    if (!actor.system && !can(actor, 'C', 'artefact', draft, ctx) && !(params.artefactType === 'managerBriefing' && hasRole(actor, 'peopleManager'))) {
      throw new AppError(403, 'You do not have permission to generate this artefact.');
    }
    // RUL-17: only users who may see sensitive fields can include them.
    if (params.includeSensitive && !actor.system && !(hasRole(actor, 'changeLead', 'practitioner') && canSeeSensitive(actor, 'profile', { relationshipOwnerId: actor.id }, { ...ctx, practitionerScope: 'all' }))) {
      throw new AppError(403, 'You do not have permission to include sensitive fields in artefacts (RUL-17).');
    }
    return initiative;
  }

  // ART-010: completeness check against the template's requirements.
  S.op('checkCompleteness', { area: 'artefacts', summary: 'Check completeness before generating an artefact (ART-010)' }, async (actor, { initiativeId, artefactType, params = {} }) => {
    await checkAccess(actor, initiativeId, { ...params, artefactType });
    const e = await engine();
    const model = await S.model(initiativeId);
    return { gaps: e.completeness(model, artefactType, params), entry: catalogueEntry(artefactType) };
  });

  // Live HTML preview of the document (UC-07 step 7).
  S.op('previewArtefact', { area: 'artefacts', summary: 'Preview an artefact as HTML without storing it' }, async (actor, { initiativeId, artefactType, params = {} }) => {
    await checkAccess(actor, initiativeId, { ...params, artefactType });
    const e = await engine();
    const model = await S.model(initiativeId);
    const template = await resolveTemplate(artefactType, params);
    const snapshot = e.buildSnapshot(model, { ...params, artefactType }, { includeSensitive: !!params.includeSensitive });
    const docControl = docControlFor(model.initiative, artefactType, params, { version: 'Preview', status: 'Draft', generatedBy: actor.name, snapshotAt: snapshot.takenAt });
    return { html: await e.renderHtml(snapshot, { artefactType, params, template, docControl }), gaps: e.completeness(model, artefactType, params) };
  });

  function docControlFor(initiative, artefactType, params, { version, status, generatedBy, snapshotAt, approvals = [], generatedAt }) {
    const entry = catalogueEntry(artefactType);
    return {
      title: params.title || entry?.title || artefactType,
      initiative: initiative.name,
      version,
      status,
      generatedAt: generatedAt || S.nowIso(),
      generatedBy,
      snapshotAt,
      classification: params.classification || (params.includeSensitive ? 'OFFICIAL: Sensitive' : initiative.classification || 'OFFICIAL'),
      approvals,
    };
  }

  async function storeFiles(files, meta) {
    const out = [];
    for (const f of files) {
      const blobId = uid('blob');
      await S.driver.putBlob(blobId, f.bytes, { filename: f.filename, mime: f.mime, ...meta });
      out.push({ format: f.format, filename: f.filename, mime: f.mime, size: f.bytes.length, blobId, fingerprint: f.fingerprint || null });
    }
    return out;
  }

  // Figure 3 steps 1–9: select, check, snapshot, merge, render, produce, convert, apply document control, store.
  S.op('generateArtefact', { area: 'artefacts', summary: 'Generate an artefact in Word, PowerPoint, PDF, Excel or HTML and store it in the library' }, async (actor, { initiativeId, artefactType, params = {}, proceed = false }) => {
    const entry = catalogueEntry(artefactType);
    if (!entry) throw new AppError(404, `Unknown artefact ${artefactType}.`);
    params = { ...params, artefactType };
    const initiative = await checkAccess(actor, initiativeId, params);
    const e = await engine();
    const model = await S.model(initiativeId);
    const config = await S.getConfig();
    const gaps = e.completeness(model, artefactType, params);
    const blocking = gaps.filter((g) => g.severity !== 'info');
    if (blocking.length && !proceed) return { needsDecision: true, gaps };
    const formats = asArray(params.formats).length ? asArray(params.formats).filter((f) => entry.formats.includes(f)) : entry.defaultFormats;
    if (!formats.length) throw new AppError(422, `Choose at least one of: ${entry.formats.join(', ')}.`);
    const template = await withFiles(await resolveTemplate(artefactType, params));
    const snapshot = e.buildSnapshot(model, params, { includeSensitive: !!params.includeSensitive });
    snapshot.gaps = gaps;
    const scopeKey = e.scopeKey(params);
    const previous = sortBy((await S.driver.list('artefact', { initiativeId })).filter((a) => a.artefactType === artefactType && JSON.stringify(a.params?.scopeKey ?? null) === JSON.stringify(scopeKey ?? null)), 'createdAt');
    const versionLabel = nextDraftVersion(previous.length ? previous[previous.length - 1].versionLabel : null);
    const approvals = previous.filter((a) => a.status === 'approved' || a.status === 'superseded').flatMap((a) => asArray(a.approvalHistory).map((h) => ({ ...h, version: a.versionLabel })));
    const docControl = docControlFor(initiative, artefactType, params, { version: versionLabel, status: 'Draft', generatedBy: actor.name, snapshotAt: snapshot.takenAt, approvals });
    const files = await e.render(snapshot, { artefactType, formats, template, docControl, params, settings: config.settings });
    const snapshotId = uid('blob');
    await S.driver.putBlob(snapshotId, new TextEncoder().encode(JSON.stringify(snapshot)), { filename: 'snapshot.json', mime: 'application/json', initiativeId, kind: 'snapshot' });
    const stored = await storeFiles(files, { initiativeId, kind: 'artefact' });
    const rec = await S.create(actor, 'artefact', {
      initiativeId, artefactType, title: docControl.title, versionLabel, status: 'draft', params: { ...params, scopeKey }, files: stored, templateId: template?.id || null, templateVersion: template?.templateVersion || null,
      snapshotId, snapshotAt: snapshot.takenAt, gaps, includesSensitive: !!params.includeSensitive, aiUnreviewed: !!snapshot.aiUnreviewed, approvalHistory: [], published: [], docControl, scheduleId: params.scheduleId || null,
    }, { raw: true, system: true });
    await S.audit(actor, { action: 'generate', type: 'artefact', recordId: rec.id, initiativeId, summary: `Generated ${docControl.title} v${versionLabel} (${formats.join(', ')})${gaps.length ? ` with ${gaps.length} placeholder(s)` : ''}` });
    if (params.includeSensitive) await S.audit(actor, { action: 'sensitiveInclude', type: 'artefact', recordId: rec.id, initiativeId, summary: `Sensitive fields included in ${docControl.title} v${versionLabel} (RUL-17)` });
    return { artefact: rec, gaps };
  });

  // After approval the stored files are re-rendered from the same snapshot with the approved status and version.
  S.op('_restampArtefact', { internal: true }, async (actor, id) => {
    const a = await S.driver.get('artefact', id);
    const e = await engine();
    const config = await S.getConfig();
    const blob = await S.driver.getBlob(a.snapshotId);
    const snapshot = JSON.parse(new TextDecoder().decode(blob.bytes));
    const t = await withFiles(templateAt(a.templateId ? await S.driver.get('template', a.templateId) : null, a.templateVersion));
    const docControl = { ...a.docControl, version: a.versionLabel, status: 'Approved', approvals: [...asArray(a.docControl?.approvals), ...asArray(a.approvalHistory).map((h) => ({ ...h, version: a.versionLabel }))] };
    const files = await e.render(snapshot, { artefactType: a.artefactType, formats: asArray(a.files).map((f) => f.format), template: t, docControl, params: a.params, settings: config.settings });
    for (const f of asArray(a.files)) await S.driver.deleteBlob(f.blobId);
    const stored = await storeFiles(files, { initiativeId: a.initiativeId, kind: 'artefact' });
    await S.driver.put({ ...a, files: stored, docControl, version: a.version + 1, updatedAt: S.nowIso() });
    S.touch(a.initiativeId);
  });

  // AC-10: regenerate from the stored snapshot and template version and confirm the content matches.
  S.op('reproduceArtefact', { area: 'artefacts', summary: 'Regenerate an artefact from its stored data snapshot and template version' }, async (actor, { id }) => {
    const a = await S.get(actor, 'artefact', id);
    const e = await engine();
    const config = await S.getConfig();
    const blob = await S.driver.getBlob(a.snapshotId);
    if (!blob) throw new AppError(410, 'The data snapshot for this artefact is no longer held (retention).');
    const snapshot = JSON.parse(new TextDecoder().decode(blob.bytes));
    const t = await withFiles(templateAt(a.templateId ? await S.driver.get('template', a.templateId) : null, a.templateVersion));
    const files = await e.render(snapshot, { artefactType: a.artefactType, formats: asArray(a.files).map((f) => f.format), template: t, docControl: a.docControl, params: a.params, settings: config.settings });
    const comparison = asArray(a.files).map((f) => {
      const again = files.find((x) => x.format === f.format);
      return { format: f.format, original: f.fingerprint, regenerated: again?.fingerprint || null, matches: !!f.fingerprint && f.fingerprint === again?.fingerprint };
    });
    const stored = await storeFiles(files, { initiativeId: a.initiativeId, kind: 'reproduction', artefactId: a.id });
    await S.audit(actor, { action: 'reproduce', type: 'artefact', recordId: id, initiativeId: a.initiativeId, summary: `Reproduced ${a.title} v${a.versionLabel}: ${comparison.every((c) => c.matches) ? 'content matches' : 'content differs'}` });
    return { comparison, files: stored, matches: comparison.every((c) => c.matches) };
  });

  // ART-013: compare two versions and summarise the underlying data changes.
  S.op('compareArtefacts', { area: 'artefacts', summary: 'Compare the data behind two artefact versions' }, async (actor, { aId, bId }) => {
    const [a, b] = [await S.get(actor, 'artefact', aId), await S.get(actor, 'artefact', bId)];
    const e = await engine();
    const read = async (x) => JSON.parse(new TextDecoder().decode((await S.driver.getBlob(x.snapshotId)).bytes));
    const [sa, sb] = [await read(a), await read(b)];
    const [older, newer] = a.createdAt <= b.createdAt ? [sa, sb] : [sb, sa];
    return { from: a.createdAt <= b.createdAt ? a.versionLabel : b.versionLabel, to: a.createdAt <= b.createdAt ? b.versionLabel : a.versionLabel, changes: e.diffSnapshots(older, newer) };
  });

  // ART-017: publish to a configured repository and record the location.
  S.op('publishArtefact', { area: 'artefacts', summary: 'Publish an artefact to a configured repository' }, async (actor, { id, destination = 'library' }) => {
    const a = await S.get(actor, 'artefact', id);
    if (!can(actor, 'A', 'artefact', a) && !hasRole(actor, 'changeLead')) throw new AppError(403, 'Only a change management lead can publish artefacts.');
    let location;
    if (destination !== 'library' && S.env.publish) location = await S.env.publish(a, destination, S);
    else location = { destination: 'library', path: `Artefact library / ${a.title} / v${a.versionLabel}` };
    const published = [...asArray(a.published), { ...location, at: S.nowIso(), by: actor.name }];
    await S.driver.put({ ...(await S.driver.get('artefact', id)), published, version: a.version + 1, updatedAt: S.nowIso() });
    await S.audit(actor, { action: 'publish', type: 'artefact', recordId: id, initiativeId: a.initiativeId, summary: `Published ${a.title} v${a.versionLabel} to ${location.path || location.destination}` });
    S.touch(a.initiativeId);
    return { published };
  });

  // ART-016: one artefact per manager or per priority stakeholder, delivered as a ZIP.
  S.op('bulkGenerate', { area: 'artefacts', summary: 'Generate one artefact per people manager or priority stakeholder as a ZIP' }, async (actor, { initiativeId, artefactType, scope, formats, params = {} }) => {
    const model = await S.model(initiativeId);
    const e = await engine();
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const targets = scope === 'managers'
      ? e.managersOf(model).map((m) => ({ key: m.id, name: m.name, params: { managerId: m.id } }))
      : model.profiles.filter((p) => p.person && p.isPriority).map((p) => ({ key: p.stakeholderId, name: p.name, params: { stakeholderId: p.stakeholderId } }));
    if (!targets.length) throw new AppError(422, scope === 'managers' ? 'No people managers of impacted employees were found.' : 'There are no priority stakeholders.');
    const made = [];
    for (const t of targets) {
      const res = await S.ops.generateArtefact(actor, { initiativeId, artefactType, params: { ...params, ...t.params, formats }, proceed: true });
      for (const f of res.artefact.files) {
        const blob = await S.driver.getBlob(f.blobId);
        zip.file(`${t.name.replace(/[^\w\- ]+/g, '').trim()} - ${f.filename}`, blob.bytes);
      }
      made.push({ name: t.name, artefactId: res.artefact.id });
    }
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const blobId = uid('blob');
    const filename = `${catalogueEntry(artefactType).title} - ${scope === 'managers' ? 'all managers' : 'priority stakeholders'}.zip`;
    await S.driver.putBlob(blobId, bytes, { filename, mime: 'application/zip', initiativeId, kind: 'bulk' });
    await S.audit(actor, { action: 'bulkGenerate', type: 'artefact', initiativeId, summary: `Bulk generated ${made.length} × ${catalogueEntry(artefactType).title}` });
    return { blobId, filename, count: made.length, items: made };
  });

  // ART-015 / RPT-006: scheduled generation and distribution.
  // RPT-006: a saved report run on a schedule, as the person who scheduled it, so it shows only what they
  // may see; recipients who can read the initiative are told it is ready, with a summary of the figures.
  async function runReportSchedule(sch) {
    const def = sch.reportId ? await S.driver.get('reportDefinition', sch.reportId) : null;
    if (!def || def.deleted) throw new AppError(404, 'The scheduled report no longer exists.');
    const owner = await S.driver.get('user', sch.createdBy);
    if (!owner || owner.status !== 'active') throw new AppError(409, 'The person who scheduled this report is no longer active; ask someone else to schedule it again.');
    const feed = await S.reportingFeed(owner, def.definition?.dataset, { initiativeId: sch.initiativeId || undefined });
    const result = runReport(feed.rows, def.definition || {});
    const users = await S.driver.list('user');
    const allowed = asArray(sch.recipients).filter((id) => { const u = users.find((x) => x.id === id); return u && u.status === 'active' && can(u, 'R', 'reportDefinition', def) && (!sch.initiativeId || u.roles?.includes('portfolio') || asArray(u.initiativeIds).includes(sch.initiativeId)); });
    await S.notify(allowed, { kind: 'report', initiativeId: sch.initiativeId, title: `${def.name} is ready`, body: summariseReport(result, def.name), link: { type: 'reportDefinition', id: def.id } });
    return { schedule: sch.name, reportId: def.id, rows: result.total, recipients: allowed.length };
  }

  // ART-015: scheduled generation. The scheduler runs this as the system; a person may run one of their
  // initiative's schedules now. Scheduled artefacts never include sensitive fields, because they are
  // distributed to recipients whose access to those fields has not been checked.
  S.op('runSchedules', { area: 'artefacts', summary: 'Run scheduled generation that is due', system: true }, async (actor, { force = false, id } = {}) => {
    if (!actor?.system) {
      if (!id) throw new AppError(403, 'Only the scheduler runs every due schedule.');
      const sch = await S.driver.get('schedule', id);
      if (!sch) throw new AppError(404, 'Schedule not found.');
      S.assertCan(actor, 'U', 'schedule', sch, { initiative: await S.initiative(sch.initiativeId) });
    }
    const now = S.now();
    const tz = (await S.getConfig()).settings?.timeZone;
    const results = [];
    for (const sch of await S.driver.list('schedule')) {
      if (id && sch.id !== id) continue;
      if (!sch.active && !force) continue;
      const due = force || !sch.nextRunAt || sch.nextRunAt <= now.toISOString();
      if (!due) continue;
      try {
        if (sch.kind === 'report') {
          results.push(await runReportSchedule(sch));
          const ran = { ...sch, lastRunAt: now.toISOString() };
          await S.driver.put({ ...ran, nextRunAt: nextRun(ran, now, tz), version: sch.version + 1 });
          continue;
        }
        const res = await S.ops.generateArtefact({ ...S.SYSTEM, name: `Schedule: ${sch.name}` }, { initiativeId: sch.initiativeId, artefactType: sch.artefactType, params: { ...(sch.params || {}), includeSensitive: false, scheduleId: sch.id }, proceed: true });
        if (sch.publishTo) await S.ops.publishArtefact(S.SYSTEM, { id: res.artefact.id, destination: sch.publishTo });
        // Distribution respects access rights: recipients must be able to read artefacts in the initiative.
        const users = await S.driver.list('user');
        const allowed = asArray(sch.recipients).filter((uidv) => { const u = users.find((x) => x.id === uidv); return u && can(u, 'R', 'artefact', res.artefact) && (u.roles?.includes('portfolio') || asArray(u.initiativeIds).includes(sch.initiativeId)); });
        await S.notify(allowed, { kind: 'artefact', initiativeId: sch.initiativeId, title: `${res.artefact.title} v${res.artefact.versionLabel} is ready`, body: `Generated by schedule "${sch.name}" on ${fmtDate(todayIso(tz, now))}.`, link: { type: 'artefact', id: res.artefact.id }, attachments: res.artefact.files });
        results.push({ schedule: sch.name, artefactId: res.artefact.id, recipients: allowed.length });
      } catch (err) {
        results.push({ schedule: sch.name, error: err.message });
      }
      const ran = { ...sch, lastRunAt: now.toISOString() };
      await S.driver.put({ ...ran, nextRunAt: nextRun(ran, now, tz), version: sch.version + 1 });
    }
    return results;
  });

  S.op('scheduleNextRun', { area: 'artefacts', summary: 'Compute a schedule\'s next run time' }, async (actor, { schedule }) => ({ nextRunAt: nextRun(schedule, S.now(), (await S.getConfig()).settings?.timeZone) }));

  // ART-029: field catalogue for template authors.
  S.op('fieldCatalogue', { area: 'templates', summary: 'Every merge field available to template authors (ART-029)' }, async () => (await engine()).fieldCatalogue(await S.getConfig()));

  // ART-025: a starting tagged Word template showing the tagging convention, in the organisation's branding.
  S.op('starterTemplate', { area: 'templates', summary: 'Download a starter tagged Word template' }, async (actor, { templateId } = {}) => {
    const t = templateId ? await S.driver.get('template', templateId) : null;
    const config = await S.getConfig();
    const bytes = await (await engine()).starterTemplate({ organisation: config.settings.organisationName, ...(t?.branding || {}) });
    const blobId = 'blob-starter-template';
    const filename = 'Change Workbench starter template.docx';
    await S.driver.putBlob(blobId, bytes, { filename, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'template' });
    return { blobId, filename };
  });

  // ART-028: validate a tagged Word template on upload.
  S.op('validateTemplate', { area: 'templates', summary: 'Validate a tagged Word template (ART-028)' }, async (actor, { blobId, templateId }) => {
    let bytes;
    if (blobId) bytes = (await S.driver.getBlob(blobId))?.bytes;
    else if (templateId) {
      const t = await S.driver.get('template', templateId);
      bytes = t?.docxTemplateId ? (await S.driver.getBlob(t.docxTemplateId))?.bytes : null;
    }
    if (!bytes) throw new AppError(404, 'Template file not found.');
    const report = await (await engine()).validateDocxTemplate(bytes, await S.getConfig());
    if (templateId) await S.update(actor, 'template', templateId, { docxValidation: report }, { skipValidation: true });
    return report;
  });

  S.op('uploadTemplateFile', { area: 'templates', summary: 'Upload a tagged Word or PowerPoint template file' }, async (actor, { templateId, filename, data }) => {
    if (!actor.system && !hasRole(actor, 'admin')) throw new AppError(403, 'Administrator access is required.');
    const { base64ToBytes } = await import('../../util.js');
    const bytes = data instanceof Uint8Array ? data : base64ToBytes(String(data || ''));
    const ext = String(filename).split('.').pop().toLowerCase();
    if (!['docx', 'pptx'].includes(ext)) throw new AppError(415, 'Upload a .docx or .pptx template.');
    const blobId = uid('blob');
    await S.driver.putBlob(blobId, bytes, { filename, mime: ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'template' });
    const e = await engine();
    if (ext === 'docx') {
      const report = await e.validateDocxTemplate(bytes, await S.getConfig());
      await S.update(actor, 'template', templateId, { docxTemplateId: blobId, docxValidation: report }, { skipValidation: true });
      return { blobId, report };
    }
    const theme = await e.extractPptxTheme(bytes);
    const t = await S.driver.get('template', templateId);
    await S.update(actor, 'template', templateId, { pptxThemeId: blobId, branding: { ...(t.branding || {}), ...theme } }, { skipValidation: true });
    return { blobId, theme };
  });

  // ART-026: test generation with sample data.
  S.op('testTemplate', { area: 'templates', summary: 'Generate a test document from a template with sample data' }, async (actor, { templateId, formats }) => {
    const t = await S.driver.get('template', templateId);
    if (!t) throw new AppError(404, 'Template not found.');
    const e = await engine();
    const config = await S.getConfig();
    const type = t.artefactType === '*' ? 'strategy' : t.artefactType;
    const sample = e.sampleSnapshot({ artefactType: type });
    const entry = catalogueEntry(type);
    const docControl = { title: `${entry.title} (template test)`, initiative: sample.initiative.name, version: 'Test', status: 'Draft', generatedAt: S.nowIso(), generatedBy: actor.name, snapshotAt: sample.takenAt, classification: 'UNOFFICIAL', approvals: [] };
    const files = await e.render(sample, { artefactType: type, formats: asArray(formats).length ? formats : entry.defaultFormats, template: await withFiles(t), docControl, params: { watermark: true }, settings: config.settings });
    const stored = await storeFiles(files, { kind: 'templateTest', templateId });
    const problems = files.flatMap((f) => asArray(f.problems));
    if (t.state === 'draft') await S.update(actor, 'template', templateId, { state: 'test' }, { skipValidation: true });
    return { files: stored, problems };
  });

  S.op('copyTemplate', { area: 'templates', summary: 'Copy a template (ART-027)' }, async (actor, { templateId, name, variant, businessUnit }) => {
    const t = await S.driver.get('template', templateId);
    if (!t) throw new AppError(404, 'Template not found.');
    return S.create(actor, 'template', { name: name || `${t.name} (copy)`, artefactType: t.artefactType, variant: variant || t.variant, businessUnit: businessUnit ?? t.businessUnit, state: 'draft', templateVersion: 1, branding: t.branding, sections: t.sections, docxTemplateId: t.docxTemplateId, pptxThemeId: t.pptxThemeId, basedOnId: t.id, notes: t.notes });
  });

  // Files (artefacts, attachments, bulk ZIPs) with access checks against the owning record.
  S.getFile = async (actor, blobId) => {
    const blob = await S.driver.getBlob(blobId);
    if (!blob) throw new AppError(404, 'File not found.');
    const m = blob.meta || {};
    if (m.initiativeId) S.assertInitiative(actor, await S.initiative(m.initiativeId));
    if (m.kind === 'snapshot' && !hasRole(actor, 'changeLead', 'admin', 'auditor')) throw new AppError(403, 'Data snapshots are restricted.');
    if (m.recordType && m.recordId) {
      const rec = await S.driver.get(m.recordType, m.recordId);
      if (rec) S.assertCan(actor, 'R', m.recordType, rec, await S.accessCtx(actor, rec.initiativeId));
    }
    await S.audit(actor, { action: 'download', type: m.kind || 'file', recordId: blobId, initiativeId: m.initiativeId || null, summary: `Downloaded ${m.filename || blobId}` });
    return blob;
  };
  S.op('getFile', { area: 'artefacts', summary: 'Download a stored file' }, async (actor, { blobId }) => {
    const b = await S.getFile(actor, blobId);
    return { meta: b.meta, bytes: b.bytes };
  });

  S.op('fingerprint', { internal: true }, async (actor, { value }) => sha256Hex(canonicalJson(value)));
  S.op('_personName', { internal: true }, async (actor, s) => personName(s));
}

// Next run time for a weekly/fortnightly/monthly/daily schedule in UTC terms of the server.
// When a schedule next runs. Times are wall-clock times in the organisation's time zone; weekly and
// fortnightly schedules run on their day of the week, monthly ones on the same day of each month.
export function nextRun(sch, now = new Date(), timeZone = 'Australia/Sydney') {
  const time = sch.time || '15:00';
  const freq = sch.frequency || 'weekly';
  const at = (d) => zonedInstant(d, time, timeZone);
  let day = todayIso(timeZone, now);
  if (freq === 'weekly' || freq === 'fortnightly') {
    if (freq === 'fortnightly' && sch.lastRunAt) day = maxIso(day, addDays(todayIso(timeZone, new Date(sch.lastRunAt)), 8));
    const dow = Number(sch.dayOfWeek ?? 5);
    while (dayOfWeek(day) !== dow || at(day) <= now) day = addDays(day, 1);
  } else if (freq === 'monthly') {
    const dom = Number(sch.dayOfMonth || (sch.lastRunAt ? todayIso(timeZone, new Date(sch.lastRunAt)).slice(8) : day.slice(8)));
    const inMonth = (monthIso) => { const last = Number(addDays(addMonths(`${monthIso}-01`, 1), -1).slice(8)); return `${monthIso}-${String(Math.min(dom, last)).padStart(2, '0')}`; };
    day = inMonth(day.slice(0, 7));
    while (at(day) <= now) day = inMonth(addMonths(`${day.slice(0, 7)}-01`, 1).slice(0, 7));
  } else {
    while (at(day) <= now) day = addDays(day, 1);
  }
  return at(day).toISOString();
}
