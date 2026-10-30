// Report templates and generated reports (section 8: RPT-001..048, UC-03, UC-04).
import { inspectPackage, sanitise, detectFields } from './docx.mjs';
import { renderDocx, validateDocx } from './engine.mjs';
import { chartSvg, svgToPng } from './charts.mjs';
import { createReportContext } from './context.mjs';
import { docxToPdf, docxToHtml, sofficeAvailable } from './pdf.mjs';
import { sniff, MIME } from '../files.mjs';
import { todayIn, weekEnding, addDays } from '../../../shared/dates.js';
import { allTokens, COLLECTIONS, HELPERS } from '../../../shared/tokens.js';
import { RAG_DEFINITIONS } from '../../../shared/rag.js';
import { badRequest, forbidden, notFound, unprocessable, HttpError } from '../../http.mjs';
import { nowIso } from '../../db.mjs';
import crypto from 'node:crypto';

export const REPORT_TYPES = ['Weekly status', 'Steering committee', 'Monthly financial', 'Exception', 'End stage', 'End project', 'PID', 'Change request'];
const ALLOWED_EXT = ['docx'];
const MACRO_EXT = ['docm', 'dotm', 'pptm', 'potm', 'xlsm', 'xltm', 'doc', 'xls', 'ppt'];

export function createReports(app) {
  const { repos, settings, audit, notify, files, config } = app;
  const ctxBuilder = createReportContext(app);
  const today = () => todayIn(settings.tz());
  const templates = repos.report_templates;
  const versions = repos.template_versions;
  const reports = repos.reports;
  const snapshots = repos.snapshots;
  const distributions = repos.distributions;

  // ---------- Template permissions (RPT-002) ----------
  function canManageTemplate(ctx, t) {
    if (ctx.access.isExternal) return false;
    if (t.scope === 'Engagement') return ctx.access.can(t.engagement_id, 'templates', 'U') || ctx.access.hasGlobal('pmo');
    return ctx.access.canGlobal('templates.library');
  }
  function canSeeTemplate(ctx, t) {
    if (ctx.access.isExternal) return false;
    if (t.scope === 'Engagement') return ctx.access.canSeeEngagement(t.engagement_id);
    if (t.scope === 'Client') return ctx.access.hasGlobal('pmo') || ctx.access.visibleEngagementIds().some((id) => repos.engagement.get(id)?.client_id === t.client_id);
    return true;
  }

  function templateView(ctx, t) {
    const vs = versions.find({ template_id: t.id }).sort((a, b) => b.version_no - a.version_no);
    const cur = vs.find((v) => v.id === t.current_version_id) || vs[0] || null;
    return {
      ...t, versions: vs.map((v) => ({ id: v.id, version_no: v.version_no, status: v.status, file_name: v.file_name, uploaded_at: v.uploaded_at, uploaded_by: v.uploaded_by, ok: v.validation?.ok, errors: v.validation?.errors?.length || 0, warnings: v.validation?.warnings?.length || 0, scan: v.scan?.status })),
      current: cur, can: { manage: canManageTemplate(ctx, t), approve: ctx.access.hasGlobal('pmo') },
      client: t.client_id ? repos.client.get(t.client_id)?.legal_name : null, engagement: t.engagement_id ? repos.engagement.get(t.engagement_id)?.name : null,
    };
  }

  function listTemplates(ctx, q = {}) {
    let list = templates.find({}).filter((t) => canSeeTemplate(ctx, t));
    if (q.engagement_id) {
      const e = repos.engagement.get(q.engagement_id);
      list = list.filter((t) => t.scope === 'Firm' || (t.scope === 'Client' && t.client_id === e.client_id) || (t.scope === 'Engagement' && t.engagement_id === e.id));
    }
    if (q.report_type) list = list.filter((t) => t.report_type === q.report_type);
    if (q.status) list = list.filter((t) => t.status === q.status);
    return list.map((t) => templateView(ctx, t)).sort((a, b) => a.name.localeCompare(b.name));
  }

  function getTemplate(ctx, id) {
    const t = templates.get(id);
    if (!t || !canSeeTemplate(ctx, t)) throw notFound('Template not found');
    return templateView(ctx, t);
  }

  function createTemplate(ctx, input) {
    const t = {
      name: String(input.name || '').trim(), description: input.description || '', report_type: input.report_type || 'Weekly status', scope: input.scope || 'Firm',
      client_id: input.scope === 'Client' ? input.client_id : input.scope === 'Engagement' ? repos.engagement.get(input.engagement_id)?.client_id : null,
      engagement_id: input.scope === 'Engagement' ? input.engagement_id : null, level: input.level || 'engagement', audience: input.audience || 'client',
      output_formats: input.output_formats || ['docx', 'pdf'], owner_id: ctx.user.id, status: 'Draft', current_version_id: null, cloned_from: input.cloned_from || null,
    };
    if (!t.name) throw unprocessable('Name is required', { name: 'Required' });
    if (!REPORT_TYPES.includes(t.report_type)) throw unprocessable('Unknown report type', { report_type: 'Invalid' });
    if (!canManageTemplate(ctx, t)) throw forbidden(t.scope === 'Engagement' ? 'Engagement managers manage templates for their own engagements.' : 'The PMO maintains the template library (RPT-002).');
    const rec = templates.insert(t, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'create', entity: 'report_template', entityId: rec.id, engagementId: rec.engagement_id, summary: `Template "${rec.name}" created` });
    return templateView(ctx, rec);
  }

  function updateTemplate(ctx, id, input) {
    const t = templates.get(id);
    if (!t || !canManageTemplate(ctx, t)) throw forbidden();
    const changes = {};
    for (const k of ['name', 'description', 'report_type', 'level', 'audience', 'output_formats']) if (k in input) changes[k] = input[k];
    const out = templates.patch(id, changes, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'update', entity: 'report_template', entityId: id, summary: `Template "${t.name}" updated`, before: Object.fromEntries(Object.keys(changes).map((k) => [k, t[k]])), after: changes });
    if ('audience' in changes || 'level' in changes) for (const v of versions.find({ template_id: id })) revalidate(ctx, v.id);
    return templateView(ctx, out);
  }

  // RPT-002, RPT-004, RPT-006, RPT-024..026, NFR-008: upload a new version.
  async function upload(ctx, templateId, buffer, fileName) {
    const t = templates.get(templateId);
    if (!t || !canManageTemplate(ctx, t)) throw forbidden();
    const ext = String(fileName || '').split('.').pop().toLowerCase();
    const maxMb = settings.get('security').uploadMaxMb || 20;
    if (buffer.length > maxMb * 1048576) throw new HttpError(413, `The file is larger than the ${maxMb} MB limit (RPT-004).`);
    if (MACRO_EXT.includes(ext)) throw unprocessable(`.${ext} files are not accepted: macro-enabled and legacy binary formats are rejected (RPT-004).`);
    if (!ALLOWED_EXT.includes(ext)) throw unprocessable('Upload a Word (.docx) template.');
    const magic = sniff(buffer);
    if (magic !== 'zip') throw unprocessable(`The file content is not a Word document (detected ${magic}); file types are validated by content, not extension (RPT-004).`);
    const pkg = await inspectPackage(buffer);
    const fatal = pkg.issues.filter((i) => i.severity === 'error');
    if (fatal.length) throw unprocessable(fatal.map((i) => i.message).join('; '));
    if (pkg.kind !== 'docx') throw unprocessable(`The file content is a ${pkg.kind} package, not a Word document.`);
    const scan = await app.integrations.scan(buffer);
    if (scan.status === 'infected') {
      audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'upload-blocked', entity: 'report_template', entityId: templateId, summary: `Malware detected in uploaded template: ${scan.detail}` });
      throw unprocessable('The file failed the malware scan and was rejected.');
    }
    if (scan.status !== 'clean' && settings.get('security').requireMalwareScan) throw unprocessable('Malware scanning is required but the scanner is unavailable; try again later.');
    const removed = await sanitise(pkg.zip);
    const clean = await pkg.zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const file = files.save(clean, { name: fileName, mime: MIME.docx, engagementId: t.engagement_id, purpose: 'template', userId: ctx.user.id, scan: scan.status });
    const vs = versions.find({ template_id: templateId });
    const fields = await detectFields(clean);
    const prior = vs.sort((a, b) => b.version_no - a.version_no)[0];
    const mappings = prior?.mappings?.filter((m) => fields.some((f) => f.kind === m.kind && f.key === m.key)) || [];
    const validation = await validateDocx(clean, { audience: t.audience, level: t.level, mappings, customFields: customFields(), clientShowsEvm: false });
    const v = versions.insert({
      template_id: templateId, version_no: vs.length + 1, file_id: file.id, file_name: fileName, size: clean.length, kind: 'docx', uploaded_by: ctx.user.id, uploaded_at: nowIso(),
      scan, sanitised: removed, fields, mappings, validation, status: 'Draft', sha256: file.sha256,
    }, ctx.user.id);
    templates.patch(templateId, { current_version_id: t.status === 'Published' ? t.current_version_id : v.id, draft_version_id: v.id }, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'upload', entity: 'report_template', entityId: templateId, summary: `Version ${v.version_no} uploaded (${validation.tokens.length} tokens, ${validation.errors.length} errors); scan: ${scan.status}${removed.length ? `; removed: ${removed.join(', ')}` : ''}` });
    return { template: getTemplate(ctx, templateId), version: v };
  }

  function customFields() {
    return repos.custom_fields.find({}).map((c) => ({ key: c.key, label: c.label, type: c.type, entity: c.entity, audience: c.audience }));
  }

  async function revalidate(ctx, versionId) {
    const v = versions.get(versionId);
    const t = templates.get(v.template_id);
    const f = files.read(v.file_id);
    const validation = await validateDocx(f.buffer, { audience: t.audience, level: t.level, mappings: v.mappings || [], customFields: customFields() });
    return versions.patch(versionId, { validation }, ctx?.user?.id);
  }

  // RPT-026: map content controls, bookmarks and placeholders to tokens; saved with the version.
  async function saveMappings(ctx, versionId, mappings) {
    const v = versions.get(versionId);
    const t = templates.get(v.template_id);
    if (!canManageTemplate(ctx, t)) throw forbidden();
    if (v.status === 'Published') throw badRequest('Published versions are fixed; upload a new version to change mappings.');
    versions.patch(versionId, { mappings: (mappings || []).filter((m) => m.token) }, ctx.user.id);
    const out = await revalidate(ctx, versionId);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'update', entity: 'report_template', entityId: t.id, summary: `Field mappings saved for version ${v.version_no} (${mappings.length})` });
    return out;
  }

  // RPT-007: PMO approval before publishing (configurable); templates with errors cannot be published (RPT-025).
  function submitTemplate(ctx, versionId) {
    const v = versions.get(versionId);
    const t = templates.get(v.template_id);
    if (!canManageTemplate(ctx, t)) throw forbidden();
    if (!v.validation?.ok) throw unprocessable(`Fix the ${v.validation?.errors?.length} validation error(s) before publishing (RPT-025).`);
    if (!settings.get('authority').templatePublishApproval) return publish(ctx, versionId);
    versions.patch(versionId, { status: 'Submitted' }, ctx.user.id);
    templates.patch(t.id, { status: t.status === 'Published' ? 'Published' : 'In approval' }, ctx.user.id);
    app.workflow.request(ctx, {
      kind: 'template', entity: 'template_version', entityId: versionId, engagementId: t.engagement_id, title: `Publish template: ${t.name} v${v.version_no}`, link: `/reports/templates/${t.id}`,
      steps: [{ name: 'PMO approval (RPT-007)', mode: 'any', approvers: app.memberships.globalUsers('pmo').filter((u) => u !== ctx.user.id).concat(app.memberships.globalUsers('pmo')).slice(0, 5) }],
    });
    return getTemplate(ctx, t.id);
  }

  function publish(ctx, versionId) {
    const v = versions.get(versionId);
    const t = templates.get(v.template_id);
    if (!v.validation?.ok) throw unprocessable('Templates with errors cannot be published (RPT-025).');
    for (const old of versions.find({ template_id: t.id }).filter((x) => x.status === 'Published' && x.id !== versionId)) versions.patch(old.id, { status: 'Superseded' }, ctx.user?.id);
    versions.patch(versionId, { status: 'Published', approved_by: ctx.user?.id || null, approved_at: nowIso() }, ctx.user?.id);
    templates.patch(t.id, { status: 'Published', current_version_id: versionId, draft_version_id: null }, ctx.user?.id);
    audit.record({ userId: ctx.user?.id, ip: ctx.ip, action: 'publish', entity: 'report_template', entityId: t.id, engagementId: t.engagement_id, summary: `Template "${t.name}" version ${v.version_no} published` });
    return getTemplate(ctx, t.id);
  }
  app.workflow.on('template', {
    onApprove: (ctx, apv) => publish(ctx, apv.entity_id),
    onReject: (ctx, apv, comment) => {
      const v = versions.patch(apv.entity_id, { status: 'Draft', rejection: comment }, ctx.user.id);
      const t = templates.get(v.template_id);
      templates.patch(t.id, { status: t.current_version_id && versions.get(t.current_version_id)?.status === 'Published' ? 'Published' : 'Draft' }, ctx.user.id);
    },
  });

  function retire(ctx, templateId) {
    const t = templates.get(templateId);
    if (!canManageTemplate(ctx, t)) throw forbidden();
    templates.patch(templateId, { status: 'Retired' }, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'retire', entity: 'report_template', entityId: templateId, summary: `Template "${t.name}" retired (kept in history, RPT-006)` });
    return getTemplate(ctx, templateId);
  }

  // RPT-011: clone a template for another client or engagement.
  function cloneTemplate(ctx, templateId, input) {
    const src = templates.get(templateId);
    if (!src || !canSeeTemplate(ctx, src)) throw notFound();
    const copy = createTemplate(ctx, { ...src, ...input, name: input.name || `${src.name} (copy)`, cloned_from: src.id });
    const cur = versions.get(src.current_version_id);
    if (cur) {
      const v = versions.insert({ ...stripMeta(cur), template_id: copy.id, version_no: 1, status: 'Draft', uploaded_by: ctx.user.id, uploaded_at: nowIso(), cloned_from_version: cur.id }, ctx.user.id);
      templates.patch(copy.id, { current_version_id: v.id, draft_version_id: v.id }, ctx.user.id);
      revalidate(ctx, v.id);
    }
    return getTemplate(ctx, copy.id);
  }
  const stripMeta = (r) => { const { id, rev, created_at, created_by, updated_at, updated_by, ...rest } = r; void id; void rev; void created_at; void created_by; void updated_at; void updated_by; return rest; };

  // RPT-008: default template per engagement and report type.
  function setDefault(ctx, engagementId, reportType, templateId) {
    if (!ctx.access.can(engagementId, 'report', 'U') && !ctx.access.can(engagementId, 'setup', 'U')) throw forbidden();
    const e = repos.engagement.get(engagementId);
    const t = templateId ? templates.get(templateId) : null;
    if (t && (t.status !== 'Published' || !permitted(t, e))) throw badRequest('Choose a published template available to this engagement.');
    const defaults = { ...(e.default_templates || {}), [reportType]: templateId || null };
    app.entities.patch(ctx, 'engagement', engagementId, { default_templates: defaults }, `Default ${reportType} template set to ${t?.name || 'none'} (RPT-008)`);
    return defaults;
  }

  const permitted = (t, e) => t.scope === 'Firm' || (t.scope === 'Client' && t.client_id === e.client_id) || (t.scope === 'Engagement' && t.engagement_id === e.id);

  // ---------- Rendering ----------
  function chartFn(audience) {
    return async (name, scope, { widthCm, heightCm }) => {
      let data = null;
      for (let s = scope; s && !data; s = s.parent) {
        const base = s.item ?? s.data;
        if (base?.chartdata?.[name]) data = base.chartdata[name];
      }
      if (!data) return null;
      const svg = chartSvg(name, data, { audience });
      if (!svg) return null;
      const png = svgToPng(svg.svg, widthCm);
      return png ? { png, alt: svg.alt, heightCm: heightCm || widthCm * svg.ratio } : null;
    };
  }

  function imageFn() {
    return async (path, scope, { widthCm }) => {
      let fileId = null;
      for (let s = scope; s && !fileId; s = s.parent) {
        const base = s.item ?? s.data;
        if (path === 'client.logo' && base?.client?.logo) fileId = base.client.logo;
      }
      if (!fileId) return null;
      const f = files.read(fileId);
      if (!f) return null;
      const kind = sniff(f.buffer);
      if (!['png', 'jpg', 'gif'].includes(kind)) return null;
      const ratio = imageRatio(f.buffer, kind) || 0.4;
      return { buffer: f.buffer, ext: kind === 'jpg' ? 'jpeg' : kind, heightCm: widthCm * ratio, alt: 'Client logo' };
    };
  }

  async function renderVersion(versionId, snap, audience, { name }) {
    const v = versions.get(versionId);
    const f = files.read(v.file_id);
    if (!f) throw notFound('Template file missing');
    const ctx = { tz: settings.tz(), periodEnd: snap.report.week_ending, periodStart: snap.report.period_start, lookaheadEnd: addDays(snap.report.week_ending, 28), fy: null };
    return renderDocx(f.buffer, snap, { mappings: v.mappings || [], ctx, charts: chartFn(audience), images: imageFn(), metadata: { title: name, classification: snap.report.classification, author: settings.get('firm').name } });
  }

  // RPT-005: preview with sample data or a live project the user can access.
  async function preview(ctx, versionId, { project_id: projectId, format = 'html' } = {}) {
    const v = versions.get(versionId);
    const t = templates.get(v.template_id);
    if (!canSeeTemplate(ctx, t)) throw notFound();
    let snap;
    if (projectId) {
      const p = repos.project.get(projectId);
      if (!p || !ctx.access.can(p.engagement_id, 'status', 'R', { projectId })) throw forbidden('Choose a project you can access.');
      const ids = t.level === 'project' ? [p.id] : repos.project.find({ engagement_id: p.engagement_id }).filter((x) => x.state !== 'Cancelled').map((x) => x.id);
      const period = app.status.currentPeriod(repos.engagement.get(p.engagement_id));
      snap = ctxBuilder.forAudience(ctxBuilder.build({ engagementId: p.engagement_id, projectIds: ids, periodEnd: period, reportType: t.report_type, audience: t.audience, narrative: sampleNarrative(), preparedBy: ctx.user.name, name: 'Preview', level: t.level }), t.audience);
    } else snap = sampleSnapshot(t);
    const out = await renderVersion(versionId, snap, t.audience, { name: `Preview — ${t.name}` });
    if (format === 'docx') return { buffer: out.buffer, type: MIME.docx, name: `${t.name} preview.docx` };
    if (format === 'pdf') {
      if (!(await sofficeAvailable(config.soffice))) throw badRequest('PDF rendering needs LibreOffice on the server.');
      return { buffer: await docxToPdf(out.buffer, { bin: config.soffice }), type: MIME.pdf, name: `${t.name} preview.pdf` };
    }
    return { html: (await docxToHtml(out.buffer)).html, warnings: out.warnings };
  }

  // ---------- Generation (RPT-028..039) ----------
  function canGenerate(ctx, engagementId, projectIds) {
    if (ctx.access.can(engagementId, 'report', 'C')) return true;
    return projectIds.length === 1 && ctx.access.can(engagementId, 'report', 'C', { projectId: projectIds[0] });
  }

  function resolveScope(engagementId, scope) {
    const all = repos.project.find({ engagement_id: engagementId }).filter((p) => !['Cancelled', 'Proposed'].includes(p.state));
    if (!scope || scope === 'all') return all.map((p) => p.id);
    const ids = Array.isArray(scope) ? scope : [scope];
    return ids.filter((id) => all.some((p) => p.id === id));
  }

  function fileName(e, type, periodEnd, version, draftNo) {
    const client = repos.client.get(e.client_id);
    const pattern = settings.get('reporting').fileName || '{ClientCode}_{EngagementCode}_{ReportType}_{WeekEnding}_v{n}';
    const base = pattern.replace('{ClientCode}', client.code || 'CLIENT').replace('{EngagementCode}', e.code || 'ENG').replace('{ReportType}', type.replace(/\s+/g, ''))
      .replace('{WeekEnding}', periodEnd).replace('{n}', String(version));
    return draftNo ? `${base}_draft${draftNo}` : base;
  }

  function readiness(ctx, input) {
    const e = repos.engagement.get(input.engagement_id);
    if (!e || !ctx.access.canSeeEngagement(e.id)) throw notFound();
    const projectIds = resolveScope(e.id, input.scope);
    const t = input.template_id ? templates.get(input.template_id) : null;
    const v = t ? versions.get(t.current_version_id) : null;
    const periodEnd = input.period_end || app.status.currentPeriod(e);
    return ctxBuilder.readiness({ engagementId: e.id, projectIds, periodEnd, templateTokens: (v?.validation?.tokens || []).map((x) => x.token), narrative: input.narrative || {} });
  }

  async function generate(ctx, input) {
    const e = repos.engagement.get(input.engagement_id);
    if (!e || !ctx.access.canSeeEngagement(e.id)) throw notFound();
    const projectIds = resolveScope(e.id, input.scope);
    if (!projectIds.length) throw unprocessable('Choose at least one project in delivery.');
    if (!canGenerate(ctx, e.id, projectIds)) throw forbidden('You cannot generate reports for this engagement.');
    const reportType = input.report_type || 'Weekly status';
    const audience = input.audience || 'client';
    const templateId = input.template_id || e.default_templates?.[reportType];
    const t = templateId ? templates.get(templateId) : null;
    if (!t || t.status !== 'Published' || !permitted(t, e)) throw unprocessable('Choose a published template permitted for this engagement (RPT-008).');
    if (t.audience !== audience && !(input.pair && audience === 'client')) throw unprocessable(`This template is for ${t.audience} audiences.`);
    if (t.level === 'project' && projectIds.length !== 1) throw unprocessable('This is a project-level template: choose one project.');
    const periodEnd = input.period_end || app.status.currentPeriod(e);
    const ready = readiness(ctx, { ...input, template_id: t.id, period_end: periodEnd });
    if (!ready.ok && !input.proceed) return { readiness: ready, generated: false };
    const started = Date.now();
    const existing = reports.find({ engagement_id: e.id }).filter((r) => r.report_type === reportType && r.period_end === periodEnd && r.audience === audience && !['Superseded', 'Withdrawn'].includes(r.status));
    const lineage = input.report_id ? reports.get(input.report_id) : existing.find((r) => ['Draft', 'In review'].includes(r.status));
    if (lineage && ['Issued', 'Approved'].includes(lineage.status)) throw badRequest('This report is approved or issued; supersede it to issue a correction (RPT-041).');
    const narrative = { ...(lineage?.narrative || {}), ...(input.narrative || {}) };
    const version = lineage?.version || (reports.find({ engagement_id: e.id }).filter((r) => r.report_type === reportType && r.period_end === periodEnd && r.audience === audience && ['Issued', 'Superseded'].includes(r.status)).length + 1);
    const draftNo = (lineage?.drafts?.length || 0) + 1;
    const name = fileName(e, reportType, periodEnd, version, draftNo);
    // RPT-030: one frozen snapshot; RPT-038: client and internal versions from the same snapshot.
    let full = ctxBuilder.build({ engagementId: e.id, projectIds, periodEnd, reportType, audience, narrative, version, preparedBy: userName(e.manager_id) || ctx.user.name, name, level: t.level });
    const prev = previousIssued(e.id, reportType, audience, periodEnd);
    if (prev) full = ctxBuilder.changesSinceLast(full, prev.snapshot, prev.report.name);
    const audienceSnap = ctxBuilder.forAudience(full, audience);
    // RPT-021: internal-only tokens are blocked again at generation.
    const tv = versions.get(t.current_version_id);
    const check = await validateDocx(files.read(tv.file_id).buffer, { audience, level: t.level, mappings: tv.mappings || [], customFields: customFields(), clientShowsEvm: Boolean(e.client_shows_evm) });
    if (!check.ok) throw unprocessable(`The template failed validation for a ${audience} audience: ${check.errors.slice(0, 3).map((x) => x.message).join('; ')}`);
    const json = JSON.stringify(audienceSnap);
    const snap = snapshots.insert({ engagement_id: e.id, report_id: null, as_at: audienceSnap.report.as_at, audience, data: audienceSnap, sha256: crypto.createHash('sha256').update(json).digest('hex'), locked: false, size: json.length }, ctx.user.id);
    const rendered = await renderVersion(tv.id, audienceSnap, audience, { name });
    const docx = files.save(rendered.buffer, { name: `${name}.docx`, mime: MIME.docx, engagementId: e.id, purpose: 'report', userId: ctx.user.id, scan: 'generated' });
    let pdf = null;
    let pdfError = null;
    if ((input.formats || t.output_formats || ['docx', 'pdf']).includes('pdf')) {
      try {
        if (await sofficeAvailable(config.soffice)) pdf = files.save(await docxToPdf(rendered.buffer, { bin: config.soffice }), { name: `${name}.pdf`, mime: MIME.pdf, engagementId: e.id, purpose: 'report', userId: ctx.user.id, scan: 'generated' });
        else pdfError = 'LibreOffice is not installed on the server';
      } catch (err) { pdfError = err.message; }
    }
    const draft = { no: draftNo, docx: docx.id, pdf: pdf?.id || null, pdf_error: pdfError, snapshot_id: snap.id, by: ctx.user.id, at: nowIso(), warnings: ready.ok ? [] : ready.warnings, render_warnings: rendered.warnings, ms: Date.now() - started };
    const history = [...(lineage?.history || []), { at: nowIso(), by: ctx.user.id, event: lineage ? `Draft ${draftNo} regenerated` : 'Draft generated', warnings: ready.ok ? [] : ready.warnings }];
    let rec;
    const base = {
      engagement_id: e.id, project_ids: projectIds, report_type: reportType, template_id: t.id, template_version_id: tv.id, period_end: periodEnd, audience, level: t.level,
      formats: input.formats || t.output_formats, name, version, narrative, readiness: ready, snapshot_id: snap.id, files: { docx: docx.id, pdf: pdf?.id || null }, generated_by: ctx.user.id, generated_at: nowIso(),
      generation_ms: draft.ms, pdf_error: pdfError, warnings_recorded: ready.ok ? [] : ready.warnings, status_update_ids: full.engagement.projects.map((p) => p.status._id).filter(Boolean),
    };
    if (lineage) rec = reports.patch(lineage.id, { ...base, drafts: [...(lineage.drafts || []), draft], history, status: 'Draft' }, ctx.user.id);
    else rec = reports.insert({ ...base, status: 'Draft', drafts: [draft], history, supersedes_id: input.supersedes_id || null, correction_reason: input.correction_reason || null, pair_id: input.pair_id || null }, ctx.user.id);
    snapshots.patch(snap.id, { report_id: rec.id }, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'generate', entity: 'report', entityId: rec.id, engagementId: e.id, summary: `${reportType} report draft ${draftNo} generated for week ending ${periodEnd} (${audience})${ready.ok ? '' : ` with warnings: ${ready.warnings.join('; ')}`}` });
    let pair = null;
    if (input.pair && audience === 'client') {
      const internalT = input.internal_template_id ? templates.get(input.internal_template_id) : null;
      if (internalT) pair = await generate(ctx, { ...input, audience: 'internal', template_id: internalT.id, pair: false, pair_id: rec.id, proceed: true });
    }
    if (input.ai_used) reports.patch(rec.id, { ai_used: true }, ctx.user.id);
    return { generated: true, report: getReport(ctx, rec.id), pair: pair?.report || null, readiness: ready };
  }

  function previousIssued(engagementId, type, audience, before) {
    const list = reports.find({ engagement_id: engagementId }).filter((r) => r.report_type === type && ['Issued', 'Superseded'].includes(r.status) && r.period_end < before)
      .sort((a, b) => b.period_end.localeCompare(a.period_end) || b.version - a.version);
    const r = list.find((x) => x.audience === audience) || list[0];
    if (!r) return null;
    const snap = snapshots.get(r.snapshot_id);
    return snap ? { report: r, snapshot: snap.data } : null;
  }

  const userName = (id) => (id ? app.auth.getUser(id)?.name : null);

  function canReadReport(ctx, r) {
    if (ctx.access.isExternal) return r.audience === 'client' && ['Issued'].includes(r.status) && ctx.access.rolesOn(r.engagement_id).includes('client');
    return ctx.access.can(r.engagement_id, 'report', 'R') || ctx.access.can(r.engagement_id, 'status', 'R');
  }

  function getReport(ctx, id) {
    const r = reports.get(id);
    if (!r || !canReadReport(ctx, r)) throw notFound('Report not found');
    const e = repos.engagement.get(r.engagement_id);
    const out = {
      ...r, engagement: { id: e.id, name: e.name, code: e.code }, template: templates.get(r.template_id)?.name,
      approval: app.workflow.forEntity('report', r.id)[0] || null, distributions: distributions.find({ report_id: r.id }),
      can: {
        edit: !ctx.access.isExternal && ['Draft', 'In review'].includes(r.status) && ctx.access.can(r.engagement_id, 'report', 'U'),
        issue: !ctx.access.isExternal && ctx.access.can(r.engagement_id, 'report', 'A') && (r.status === 'Approved' || (r.status === 'Draft' && !needsApproval(r))),
        submit: !ctx.access.isExternal && r.status === 'Draft' && needsApproval(r) && ctx.access.can(r.engagement_id, 'report', 'U'),
        supersede: !ctx.access.isExternal && r.status === 'Issued' && ctx.access.can(r.engagement_id, 'report', 'U'),
      },
    };
    if (ctx.access.isExternal) return { id: r.id, name: r.name, report_type: r.report_type, period_end: r.period_end, status: r.status, version: r.version, files: r.files, issued_at: r.issued_at, engagement: out.engagement };
    return out;
  }

  function listReports(ctx, q = {}) {
    const vis = new Set(ctx.access.visibleEngagementIds());
    let list = reports.find(q.engagement_id ? { engagement_id: q.engagement_id } : {}).filter((r) => vis.has(r.engagement_id) && canReadReport(ctx, r));
    if (q.project_id) list = list.filter((r) => (r.project_ids || []).includes(q.project_id));
    if (q.report_type) list = list.filter((r) => r.report_type === q.report_type);
    if (q.status) list = list.filter((r) => r.status === q.status);
    if (q.audience) list = list.filter((r) => r.audience === q.audience);
    if (q.from) list = list.filter((r) => r.period_end >= q.from);
    if (q.to) list = list.filter((r) => r.period_end <= q.to);
    if (q.q) list = list.filter((r) => r.name.toLowerCase().includes(String(q.q).toLowerCase()));
    return list.sort((a, b) => b.period_end.localeCompare(a.period_end) || String(b.generated_at).localeCompare(String(a.generated_at))).map((r) => {
      const e = repos.engagement.get(r.engagement_id);
      if (ctx.access.isExternal) return { id: r.id, name: r.name, report_type: r.report_type, period_end: r.period_end, status: r.status, version: r.version, files: r.files, issued_at: r.issued_at, engagement: e.name, engagement_id: e.id };
      return { id: r.id, name: r.name, report_type: r.report_type, period_end: r.period_end, status: r.status, audience: r.audience, version: r.version, engagement: e.name, engagement_id: e.id, generated_at: r.generated_at, issued_at: r.issued_at, drafts: (r.drafts || []).length, files: r.files, warnings: (r.warnings_recorded || []).length };
    });
  }

  // RPT-031: report-level narrative edits; optionally saved back to the status update.
  function saveNarrative(ctx, id, { narrative, save_back: saveBack }) {
    const r = reports.get(id);
    if (!r || !ctx.access.can(r.engagement_id, 'report', 'U')) throw forbidden();
    if (!['Draft', 'In review'].includes(r.status)) throw badRequest('Only draft reports can be edited.');
    reports.patch(id, { narrative: { ...(r.narrative || {}), ...narrative }, history: [...(r.history || []), { at: nowIso(), by: ctx.user.id, event: 'Narrative edited' }] }, ctx.user.id);
    for (const sb of saveBack || []) {
      const su = repos.status_updates.get(sb.status_update_id);
      if (!su || su.engagement_id !== r.engagement_id) continue;
      if (['Reported'].includes(su.status)) throw badRequest('That status update is locked; create a new version first (STS-011).');
      repos.status_updates.patch(su.id, { [sb.field]: sb.value }, ctx.user.id);
      audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'update', entity: 'status_update', entityId: su.id, engagementId: r.engagement_id, summary: `Report edit saved back to the status update: ${sb.field}` });
    }
    return getReport(ctx, id);
  }

  const needsApproval = (r) => {
    const e = repos.engagement.get(r.engagement_id);
    return r.audience === 'client' && e.report_approval !== false && (settings.get('authority').reportApproval?.client || []).length > 0;
  };

  // RPT-040: Draft → In review → Approved → Issued (plus Superseded and Withdrawn).
  function submitForReview(ctx, id) {
    const r = reports.get(id);
    if (!ctx.access.can(r.engagement_id, 'report', 'U')) throw forbidden();
    if (r.status !== 'Draft') throw badRequest('Only drafts go to review.');
    const e = repos.engagement.get(r.engagement_id);
    reports.patch(id, { status: 'In review', history: [...(r.history || []), { at: nowIso(), by: ctx.user.id, event: 'Submitted for review' }] }, ctx.user.id);
    app.workflow.request(ctx, { kind: 'report', entity: 'report', entityId: id, engagementId: e.id, title: `Approve report: ${r.name}`, link: `/reports/${id}`, steps: [{ name: 'Engagement executive approval (RPT-040)', mode: 'any', approvers: [e.executive_id] }] });
    return getReport(ctx, id);
  }
  app.workflow.on('report', {
    onApprove: (ctx, apv) => { const r = reports.get(apv.entity_id); reports.patch(r.id, { status: 'Approved', approved_by: ctx.user.id, approved_at: nowIso(), history: [...(r.history || []), { at: nowIso(), by: ctx.user.id, event: 'Approved' }] }, ctx.user.id); },
    onReject: (ctx, apv, comment) => { const r = reports.get(apv.entity_id); reports.patch(r.id, { status: 'Draft', history: [...(r.history || []), { at: nowIso(), by: ctx.user.id, event: `Returned: ${comment}` }] }, ctx.user.id); },
    onReturn: (ctx, apv, comment) => { const r = reports.get(apv.entity_id); reports.patch(r.id, { status: 'Draft', history: [...(r.history || []), { at: nowIso(), by: ctx.user.id, event: `Returned: ${comment}` }] }, ctx.user.id); },
  });

  // RPT-041, BR-07: issuing locks the report and snapshot and marks status updates as reported.
  async function issue(ctx, id, { distribute = true, channel = 'attachment', message, extra_recipients: extra = [], exception_reason: exceptionReason } = {}) {
    const r = reports.get(id);
    if (!r) throw notFound();
    if (!ctx.access.can(r.engagement_id, 'report', 'A')) throw forbidden('The engagement manager issues reports.');
    if (!(r.status === 'Approved' || (r.status === 'Draft' && !needsApproval(r)))) throw badRequest(needsApproval(r) ? 'This report needs approval before it is issued (RPT-040).' : 'Only drafts or approved reports can be issued.');
    const snap = snapshots.get(r.snapshot_id);
    snapshots.patch(snap.id, { locked: true }, ctx.user.id);
    reports.patch(id, { status: 'Issued', issued_at: nowIso(), issued_by: ctx.user.id, locked: true, history: [...(r.history || []), { at: nowIso(), by: ctx.user.id, event: 'Issued' }] }, ctx.user.id);
    app.status.markReported(r.status_update_ids || [], id);
    if (r.supersedes_id) {
      const old = reports.get(r.supersedes_id);
      reports.patch(old.id, { status: 'Superseded', superseded_by_id: id, history: [...(old.history || []), { at: nowIso(), by: ctx.user.id, event: `Superseded by ${r.name}: ${r.correction_reason}` }] }, ctx.user.id);
    }
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'issue', entity: 'report', entityId: id, engagementId: r.engagement_id, summary: `Report ${r.name} issued; snapshot ${snap.sha256.slice(0, 12)} locked (RPT-041)` });
    app.integrations.emitEvent('report.issued', { id, name: r.name });
    let dist = null;
    if (distribute) dist = await distributeReport(ctx, id, { channel, message, extra, exceptionReason });
    return { report: getReport(ctx, id), distribution: dist };
  }

  // RPT-043..046: email through Microsoft 365 to the distribution list; portal publication; communications log.
  async function distributeReport(ctx, id, { channel = 'attachment', message, extra = [], exceptionReason }) {
    const r = reports.get(id);
    if (r.status !== 'Issued') throw badRequest('Only issued reports are distributed.');
    if (!ctx.access.can(r.engagement_id, 'report', 'A')) throw forbidden();
    const e = repos.engagement.get(r.engagement_id);
    const list = repos.distribution_list.find({ engagement_id: e.id }).find((d) => (d.report_type || 'Weekly status') === r.report_type) || repos.distribution_list.find({ engagement_id: e.id })[0];
    const recipients = (list?.recipients || []).filter((x) => r.audience === 'client' || x.kind !== 'client').map((x) => ({ name: x.name, email: String(x.email || '').toLowerCase(), kind: x.kind }));
    const extraList = (extra || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
    const offList = extraList.filter((x) => !recipients.some((y) => y.email === x));
    const firmDomain = (app.auth.getUser(ctx.user.id)?.email || '').split('@')[1];
    const externalOffList = offList.filter((x) => x.split('@')[1] !== firmDomain);
    if (externalOffList.length && !exceptionReason) throw unprocessable(`External recipients not on the distribution list need an authorised exception (RPT-046): ${externalOffList.join(', ')}`);
    if (externalOffList.length && !ctx.access.rolesOn(e.id).some((x) => ['engagement_manager', 'engagement_executive'].includes(x))) throw forbidden('Only the engagement manager or executive can approve an exception.');
    const all = [...recipients, ...offList.map((email) => ({ email, name: email, kind: 'additional' }))];
    if (!all.length) throw unprocessable('The engagement has no distribution list for this report type (STK-004).');
    const link = `${config.baseUrl}/portal/reports/${id}`;
    const attachments = channel === 'link' ? [] : [{ file_id: r.files.pdf || r.files.docx, name: `${r.name}.${r.files.pdf ? 'pdf' : 'docx'}` }];
    const body = `${(message || defaultMessage(r, e)).replace(/\n/g, '<br>')}${channel !== 'attachment' ? `<p><a href="${link}">View the report securely in the client portal</a></p>` : ''}`;
    const html = notify.emailHtml(`${e.name}: ${r.report_type} report, week ending ${r.period_end}`, '', null).replace('</h2>', `</h2><div>${body}</div>`);
    const outboxId = notify.queueEmail({ to: all.map((x) => x.email), subject: `${repos.client.get(e.client_id).code} ${e.name} — ${r.report_type} report w/e ${r.period_end}`, html, attachments, kind: 'report', related: { report: id } });
    const rec = distributions.insert({ report_id: id, engagement_id: e.id, recipients: all, channel, sent_at: nowIso(), sent_by: ctx.user.id, outbox_id: outboxId, exception_reason: exceptionReason || null, off_list: offList }, ctx.user.id);
    if (r.audience === 'client') reports.patch(id, { portal_published: true }, ctx.user.id);
    for (const cp of repos.comm_plan.find({ engagement_id: e.id }).filter((c) => /report/i.test(c.channel || '') || /report/i.test(c.information || ''))) repos.comm_plan.patch(cp.id, { last_delivered: today() }, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'distribute', entity: 'report', entityId: id, engagementId: e.id, summary: `Report distributed by ${channel} to ${all.length} recipient(s)${offList.length ? ` including ${offList.length} off-list (${exceptionReason || 'internal'})` : ''} (RPT-045)`, after: { recipients: all.map((x) => x.email) } });
    await notify.processOutbox();
    return rec;
  }

  const defaultMessage = (r, e) => `Dear all,\n\nPlease find attached the ${r.report_type.toLowerCase()} report for ${e.name} for the week ending ${r.period_end}.\n\nKind regards,\n${userName(e.manager_id)}`;

  // RPT-041: corrections are issued as a new version that supersedes the earlier one, with a reason.
  async function supersede(ctx, id, { reason }) {
    const r = reports.get(id);
    if (!ctx.access.can(r.engagement_id, 'report', 'U')) throw forbidden();
    if (r.status !== 'Issued') throw badRequest('Only issued reports are superseded.');
    if (!String(reason || '').trim()) throw badRequest('Record the reason for the correction.');
    const out = await generate(ctx, {
      engagement_id: r.engagement_id, scope: r.project_ids, report_type: r.report_type, template_id: r.template_id, period_end: r.period_end, audience: r.audience,
      narrative: r.narrative, formats: r.formats, proceed: true, supersedes_id: id, correction_reason: reason, report_id: null, forceNew: true,
    });
    if (out.report) reports.patch(out.report.id, { version: (r.version || 1) + 1, supersedes_id: id, correction_reason: reason }, ctx.user.id);
    return out;
  }

  function withdraw(ctx, id, { reason }) {
    const r = reports.get(id);
    if (!ctx.access.can(r.engagement_id, 'report', 'U')) throw forbidden();
    if (!reason) throw badRequest('Give a reason.');
    reports.patch(id, { status: 'Withdrawn', withdrawn_reason: reason, history: [...(r.history || []), { at: nowIso(), by: ctx.user.id, event: `Withdrawn: ${reason}` }] }, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'withdraw', entity: 'report', entityId: id, engagementId: r.engagement_id, summary: `Report ${r.name} withdrawn: ${reason}` });
    return getReport(ctx, id);
  }

  function reportFile(ctx, id, kind = 'pdf', draftNo) {
    const r = reports.get(id);
    if (!r || !canReadReport(ctx, r)) throw notFound();
    const d = draftNo ? (r.drafts || []).find((x) => x.no === Number(draftNo)) : null;
    const fileId = d ? d[kind] : r.files?.[kind];
    if (!fileId) throw notFound(kind === 'pdf' ? `No PDF${r.pdf_error ? `: ${r.pdf_error}` : ''}` : 'File not found');
    const f = files.read(fileId);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'export', entity: 'report', entityId: id, engagementId: r.engagement_id, summary: `Downloaded ${f.meta.name}` });
    return f;
  }

  function snapshotFor(ctx, id) {
    const r = reports.get(id);
    if (!r || ctx.access.isExternal || !canReadReport(ctx, r)) throw notFound();
    const s = snapshots.get(r.snapshot_id);
    return { id: s.id, as_at: s.as_at, sha256: s.sha256, locked: s.locked, audience: s.audience, data: s.data };
  }

  // RPT-048: compare two report periods side by side.
  function compare(ctx, aId, bId) {
    const a = snapshotFor(ctx, aId).data, b = snapshotFor(ctx, bId).data;
    const proj = (s) => new Map((s.engagement.projects || []).map((p) => [p._project_id, p]));
    const pa = proj(a), pb = proj(b);
    const ids = [...new Set([...pa.keys(), ...pb.keys()])];
    return {
      a: { name: reports.get(aId).name, period: a.report.week_ending, overall: a.engagement.overall_rag, fin: a.fin },
      b: { name: reports.get(bId).name, period: b.report.week_ending, overall: b.engagement.overall_rag, fin: b.fin },
      projects: ids.map((id) => ({ project: (pa.get(id) || pb.get(id)).project.name, a: pa.get(id)?.status?._ratings || null, b: pb.get(id)?.status?._ratings || null, aOpenRisks: pa.get(id)?.risks?.filter((r) => !r.closed).length ?? null, bOpenRisks: pb.get(id)?.risks?.filter((r) => !r.closed).length ?? null })),
    };
  }

  // RPT-037: scheduled drafts for engagements with a default weekly template.
  async function scheduledDrafts() {
    let n = 0;
    for (const e of repos.engagement.find({}).filter((x) => x.status === 'Active' && x.default_templates?.['Weekly status'])) {
      const period = app.status.currentPeriod(e);
      if (reports.find({ engagement_id: e.id }).some((r) => r.report_type === 'Weekly status' && r.period_end === period)) continue;
      const manager = app.auth.getUser(e.manager_id);
      if (!manager) continue;
      const ctx = { user: manager, access: app.access.contextFor(manager), system: false, ip: 'scheduler' };
      try {
        const t = templates.get(e.default_templates['Weekly status']);
        const out = await generate(ctx, { engagement_id: e.id, scope: 'all', report_type: 'Weekly status', template_id: t.id, audience: t.audience, proceed: true });
        if (out.report) {
          notify.send([e.manager_id], { kind: 'report', title: `Scheduled draft ready: ${e.name}`, body: out.readiness.ok ? 'All checks passed.' : `Readiness warnings: ${out.readiness.warnings.join('; ')}`, link: `/reports/${out.report.id}`, engagementId: e.id });
          n++;
        }
      } catch (err) {
        notify.send([e.manager_id], { kind: 'report', title: `Scheduled draft failed: ${e.name}`, body: err.message, link: `/engagements/${e.id}/reports`, engagementId: e.id, severity: 'high' });
      }
    }
    return `${n} drafts`;
  }

  // CHG-005: change request / variation document from the Change request template.
  async function renderChangeDocument(ctx, change) {
    const t = templates.find({}).find((x) => x.report_type === 'Change request' && x.status === 'Published');
    if (!t) throw badRequest('No published Change request template in the library.');
    const e = repos.engagement.get(change.engagement_id);
    const p = change.project_id ? repos.project.get(change.project_id) : null;
    const snap = ctxBuilder.forAudience(ctxBuilder.build({ engagementId: e.id, projectIds: p ? [p.id] : [], periodEnd: weekEnding(today()), reportType: 'Change request', audience: 'client', preparedBy: userName(e.manager_id), name: `${change.ref} ${change.title}`, level: 'project' }), 'client');
    snap.change = {
      id: change.ref, title: change.title, description: change.description, reason: change.reason, type: change.change_type, requester: change.requester_name || change.requester_kind,
      raised_date: change.raised_date, price_impact: change.impact_price, schedule_impact_days: change.impact_schedule_days, scope_impact: change.impact_scope, status: change.status,
      variation_ref: change.variation_ref, estimate: (change.estimate || []).map((l) => ({ role: l.role, days: l.days, rate: l.rate, amount: (l.days || 0) * (l.rate || 0) })),
    };
    const out = await renderVersion(t.current_version_id, snap, 'client', { name: `${change.ref} variation` });
    const f = files.save(out.buffer, { name: `${change.ref}_variation.docx`, mime: MIME.docx, engagementId: e.id, purpose: 'variation', userId: ctx.user.id, scan: 'generated' });
    app.entities.patch(ctx, 'change', change.id, { variation_document_id: f.id }, 'Variation document generated (CHG-005)');
    return { file_id: f.id, name: f.name };
  }

  // RPT-009: downloadable token reference.
  function tokenReference() {
    const rows = [];
    for (const tk of allTokens(customFields())) rows.push({ token: `{{${tk.path}}}`, type: tk.type, audience: tk.audience, description: tk.desc, example: tk.example });
    for (const [name, c] of Object.entries(COLLECTIONS)) {
      rows.push({ token: `{{#each ${name}}} … {{/each}}`, type: 'collection', audience: c.audience, description: `${c.desc}. Filters: ${c.filters.join(', ')}. Sort by: ${c.sorts.join(', ') || '—'}.`, example: `{{#each ${name}${c.filters[0] && c.filters[0] !== 'all' ? ` filter="${c.filters[0]}"` : ''} limit=5}}` });
      for (const f of c.fields) rows.push({ token: `  {{${f.key}}}`, type: f.type, audience: f.audience, description: `${name} item: ${f.desc}`, example: '' });
    }
    for (const [h, d] of Object.entries(HELPERS)) rows.push({ token: `{{${h} …}}`, type: 'helper', audience: 'client', description: d.desc, example: '' });
    rows.push({ token: '{{#if path}} … {{else}} … {{/if}}', type: 'condition', audience: 'client', description: 'Show content only when data is present or true (RPT-014)', example: '{{#if exception.raised}}' });
    return rows;
  }

  return {
    REPORT_TYPES, listTemplates, getTemplate, createTemplate, updateTemplate, upload, saveMappings, submitTemplate, publish, retire, cloneTemplate, setDefault, preview, revalidate,
    readiness, generate, getReport, listReports, saveNarrative, submitForReview, issue, distributeReport, supersede, withdraw, reportFile, snapshotFor, compare, scheduledDrafts,
    renderChangeDocument, tokenReference, permitted, context: ctxBuilder,
  };
}

function sampleNarrative() {
  return {
    key_messages: '- Delivery remains on track for the March release\n- **Decision needed** on data migration scope by 14 November\n- PO funding is 78% consumed',
    summary: 'The engagement is progressing well across all three projects. Platform build has completed sprint 6.',
    decisions_required: '1. Approve CR-004 data migration scope\n2. Confirm UAT participants',
    escalations: 'None this period.',
  };
}

// Synthetic data for previewing a template without live data (RPT-005).
export function sampleSnapshot(t) {
  const proj = (n, rag) => ({
    _project_id: `p${n}`,
    project: { name: `Sample project ${n}`, code: `SMP-P0${n}`, manager: 'Priya Raman', stage: 'Build', state: 'In delivery', approach: 'hybrid', percent_complete: 0.45 + n / 10, start_date: '2026-07-01', end_baseline: '2027-03-19', end_forecast: '2027-03-26', next_milestone: 'Release 2', next_milestone_date: '2026-11-14' },
    status: {
      overall_rag: rag, schedule_rag: 'Green', budget_rag: rag, scope_rag: 'Green', risk_rag: 'Amber', resource_rag: 'Green', quality_rag: 'Green', overall_trend: 'Steady',
      overall_commentary: 'Tracking to plan with one budget pressure.', schedule_commentary: 'On track.', budget_commentary: 'EAC 3% above BAC.', scope_commentary: '', risk_commentary: 'SME availability.', resource_commentary: '', quality_commentary: '',
      executive_summary: 'Sprint 6 completed; release 2 planning under way.', achievements: '- Completed sprint 6\n- Signed off the data model', next_period: '- Start sprint 7\n- Run UAT planning workshop',
      decisions_required: 'Confirm UAT participants.', escalations: '', client_actions: '- Provide test accounts', approval_state: 'Approved', hours_this_period: 214, _ratings: { overall: rag },
    },
    milestones: [{ name: 'Design approved', kind: 'Delivery', key: true, baseline_date: '2026-08-21', forecast_date: '2026-08-21', actual_date: '2026-08-20', status: 'Achieved', variance_days: 0, project: `Sample project ${n}` }, { name: 'Release 2', kind: 'Payment', key: true, baseline_date: '2026-11-07', forecast_date: '2026-11-14', actual_date: null, status: 'Forecast late', variance_days: 5, project: `Sample project ${n}` }],
    deliverables: [{ id: 'DEL-001', title: 'Solution design', owner: 'Priya Raman', due_date: '2026-08-21', status: 'Accepted', acceptance_status: 'Accepted', version: '1.0', project: `Sample project ${n}` }],
    risks: [{ id: 'R-003', title: 'Client SMEs unavailable', rating: 'High', score: 12, trend: 'Stable', owner: 'Priya Raman', response: 'Reduce: agree SME calendar', due_date: '2026-11-06', status: 'Open', reportable: true, project: `Sample project ${n}` }],
    issues: [{ id: 'I-002', title: 'Test environment delayed', severity: 'High', priority: 'High', owner: 'Tom Walsh', due_date: '2026-11-07', status: 'Open', reportable: true, project: `Sample project ${n}` }],
    dependencies: [{ id: 'D-001', title: 'Client provides test accounts', type: 'Client', owner: 'Client PMO', due_date: '2026-11-03', status: 'Open', overdue: false, reportable: true, project: `Sample project ${n}` }],
    actions: [{ id: 'ACT-004', title: 'Confirm UAT participants', owner: 'Rachel Kim', owner_org: 'Client', due_date: '2026-11-10', status: 'Open', reportable: true, project: `Sample project ${n}` }],
    decisions: [{ id: 'DEC-002', title: 'Approve data migration scope', owner: 'Steering committee', due_date: '2026-11-14', status: 'Required', reportable: true, project: `Sample project ${n}` }],
    assumptions: [], changes: [{ id: 'CR-004', title: 'Additional data migration', type: 'Scope', status: 'Awaiting approval', raised_date: '2026-10-20', price_impact: 48000, schedule_impact_days: 10, cost_impact: 29000, margin: 0.39, project: `Sample project ${n}` }],
    people: [{ name: 'Aisha Mohammed', role: 'Senior Consultant', project: `Sample project ${n}`, hours_per_week: 37.5, fte: 1, status: 'Confirmed', start_date: '2026-07-01', end_date: '2027-03-26' }],
    fin: { contract_value: 640000, invoiced_to_date: 301000, remaining_value: 339000, po_value: 800000, po_consumed_pct: 0.784, po_remaining: 172800, po_exhaustion_date: '2027-02-12', po_exhaustion_before_end: true, forecast_fees_at_completion: 652000, fees_to_date: 322000, as_at: '2026-10-25', spi: 0.97, cpi: 0.94, bac: 390000, actual_cost: 201000, eac: 402000, etc: 201000, vac: -12000, budget_consumed_pct: 0.515, forecast_margin_pct: 0.383, baseline_margin_pct: 0.39, margin_erosion: 0.007, wip: 21000, billed_in_advance: 0, write_downs: 0, realisation: 0.95, burn_rate: 14200 },
    fin_lines: [], exception: { raised: false, summary: '' }, changes_since_last: { rag_movements: [], new_risks: [], closed_risks: [], milestone_movements: [] },
    chartdata: {
      budget_burn: { months: ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'].map((m, i) => ({ month: m, budgetCost: 43000, actualCost: i < 4 ? 50000 : 0, forecastCost: i >= 4 ? 40000 : 0, budgetRevenue: 71000, actualRevenue: i < 4 ? 80000 : 0, forecastRevenue: i >= 4 ? 66000 : 0 })), bac: 390000, contractValue: 640000, asAt: '2026-10-25', asAtMonth: '2026-10' },
      milestone_timeline: { milestones: [{ name: 'Design approved', baseline_date: '2026-08-21', forecast_date: '2026-08-21', actual_date: '2026-08-20', status: 'Achieved' }, { name: 'Release 2', baseline_date: '2026-11-07', forecast_date: '2026-11-14', status: 'Forecast late' }, { name: 'Go-live', baseline_date: '2027-03-19', forecast_date: '2027-03-26', status: 'Forecast late' }], today: '2026-10-30' },
      rag_trend: { history: ['2026-09-18', '2026-09-25', '2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30'].map((d, i) => ({ period_end: d, overall: i > 4 ? rag : 'Green', schedule: 'Green', budget: i > 3 ? 'Amber' : 'Green', scope: 'Green', risk: 'Amber', resource: 'Green', quality: 'Green' })) },
      risk_heatmap: { heatmap: [[1, 0, 0, 0, 0], [0, 2, 1, 0, 0], [0, 1, 2, 1, 0], [0, 0, 1, 1, 0], [0, 0, 0, 0, 0]], residual: true },
    },
    custom: {},
  });
  const projects = [proj(1, 'Amber'), proj(2, 'Green')];
  const first = projects[0];
  const snap = {
    report: { week_ending: '2026-10-30', period_start: '2026-10-24', as_at: new Date().toISOString(), financials_as_at: '2026-10-25', version: 1, prepared_by: 'Marcus Chen', classification: 'OFFICIAL: Sensitive', type: t.report_type, audience: t.audience === 'client' ? 'Client' : 'Internal', name: 'Preview' },
    firm: { name: 'CTO Consulting' },
    client: { name: 'Sample Client Department', code: 'SCD', logo: null },
    engagement: { name: 'Sample engagement', code: 'SCD-E001', manager: 'Marcus Chen', executive: 'Olivia Bennett', sponsor: 'Rachel Kim', start_date: '2026-07-01', end_date: '2027-06-30', overall_rag: 'Amber', rag_trend: 'Down', ...sampleNarrative(), project_count: 2, projects },
    fin: { ...first.fin, contract_value: 1250000, invoiced_to_date: 612300, remaining_value: 637700 },
    fin_lines: [], risks: first.risks, issues: first.issues, dependencies: first.dependencies, actions: first.actions, decisions: first.decisions, assumptions: [], changes: first.changes,
    milestones: first.milestones, deliverables: first.deliverables, people: first.people,
    meetings: [{ date: '2026-11-12', title: 'Steering committee', kind: 'Steering committee' }],
    rag_definitions: RAG_DEFINITIONS, exception: { raised: true, summary: '- **Sample project 1**: cost tolerance forecast to be exceeded' },
    changes_since_last: { rag_movements: [{ project: 'Sample project 1', dimension: 'Overall', from: 'Green', to: 'Amber', direction: 'Down' }], new_risks: [], closed_risks: [], milestone_movements: [{ project: 'Sample project 1', name: 'Release 2', from: '2026-11-07', to: '2026-11-14', days: 7 }], forecast_movement: 12000, previous_report: 'Sample v1' },
    chartdata: { ...first.chartdata, po_burn: { po: { number: 'PO-4500123', value: 800000, consumedPct: 0.78, exhaustionDate: '2027-02-12', consumedBefore: 0 }, months: first.chartdata.budget_burn.months.map((m) => ({ month: m.month, billing: m.actualRevenue || m.forecastRevenue })), asAtMonth: '2026-10' } },
    custom: {}, _meta: { level: t.level, client_shows_evm: false },
  };
  if (t.level === 'project') Object.assign(snap, { project: first.project, status: first.status });
  return t.audience === 'client' ? stripInternalSample(snap) : snap;
}

function stripInternalSample(s) {
  const clean = (f) => { for (const k of ['bac', 'actual_cost', 'eac', 'etc', 'vac', 'budget_consumed_pct', 'forecast_margin_pct', 'baseline_margin_pct', 'margin_erosion', 'wip', 'billed_in_advance', 'write_downs', 'realisation', 'burn_rate', 'spi', 'cpi']) delete f[k]; };
  clean(s.fin);
  for (const p of s.engagement.projects) { clean(p.fin); p.changes = p.changes.map(({ cost_impact, margin, ...r }) => r); } // eslint-disable-line no-unused-vars
  s.changes = s.changes.map(({ cost_impact, margin, ...r }) => r); // eslint-disable-line no-unused-vars
  delete s.changes_since_last.forecast_movement;
  return s;
}

// Height ÷ width for PNG and JPEG images, for aspect-correct logos.
function imageRatio(buf, kind) {
  try {
    if (kind === 'png') return buf.readUInt32BE(20) / buf.readUInt32BE(16);
    if (kind === 'jpg') {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xc3) return buf.readUInt16BE(i + 5) / buf.readUInt16BE(i + 7);
        i += 2 + len;
      }
    }
  } catch { /* unreadable header */ }
  return null;
}
