// Reporting API (section 8): template library, upload, validation, mapping, preview, approval,
// generation, readiness, narrative, review, issue, distribution, archive and comparison.
import { FileResponse, badRequest, forbidden, notFound } from '../http.mjs';
import { toXlsx } from '../lib/xlsx.mjs';
import { MIME } from '../lib/files.mjs';
import { docxToHtml } from '../lib/reports/pdf.mjs';

export function registerReportRoutes(r, app) {
  const { reports, files, repos } = app;
  const I = { internal: true };

  r.get('/api/templates', (ctx) => reports.listTemplates(ctx, ctx.query), I);
  r.post('/api/templates', (ctx) => reports.createTemplate(ctx, ctx.body), I);
  r.get('/api/templates/tokens', async (ctx) => {
    const rows = reports.tokenReference();
    if (ctx.query.format === 'xlsx') {
      return new FileResponse(await toXlsx([{ name: 'Token reference', columns: [{ key: 'token', label: 'Token', width: 48 }, { key: 'type', label: 'Type' }, { key: 'audience', label: 'Audience' }, { key: 'description', label: 'Description', width: 80 }, { key: 'example', label: 'Example', width: 40 }], rows }]), { type: MIME.xlsx, name: 'CEMS_token_reference.xlsx' });
    }
    return rows;
  }, I);
  r.get('/api/templates/:id', (ctx) => reports.getTemplate(ctx, ctx.params.id), I);
  r.patch('/api/templates/:id', (ctx) => reports.updateTemplate(ctx, ctx.params.id, ctx.body), I);
  r.post('/api/templates/:id/upload', (ctx) => reports.upload(ctx, ctx.params.id, ctx.body, ctx.fileName || 'template.docx'), { internal: true, raw: true });
  r.post('/api/templates/:id/retire', (ctx) => reports.retire(ctx, ctx.params.id), I);
  r.post('/api/templates/:id/clone', (ctx) => reports.cloneTemplate(ctx, ctx.params.id, ctx.body || {}), I);
  r.get('/api/template-versions/:id', (ctx) => {
    const v = repos.template_versions.get(ctx.params.id);
    if (!v) throw notFound();
    reports.getTemplate(ctx, v.template_id);
    return v;
  }, I);
  r.post('/api/template-versions/:id/mappings', (ctx) => reports.saveMappings(ctx, ctx.params.id, ctx.body.mappings), I);
  r.post('/api/template-versions/:id/submit', (ctx) => reports.submitTemplate(ctx, ctx.params.id), I);
  r.post('/api/template-versions/:id/revalidate', (ctx) => reports.revalidate(ctx, ctx.params.id), I);
  r.get('/api/template-versions/:id/download', (ctx) => {
    const v = repos.template_versions.get(ctx.params.id);
    if (!v) throw notFound();
    reports.getTemplate(ctx, v.template_id);
    const f = files.read(v.file_id);
    return new FileResponse(f.buffer, { type: MIME.docx, name: v.file_name });
  }, I);
  r.get('/api/template-versions/:id/preview', async (ctx) => {
    const out = await reports.preview(ctx, ctx.params.id, { project_id: ctx.query.project_id, format: ctx.query.format || 'html' });
    if (out.buffer) return new FileResponse(out.buffer, { type: out.type, name: out.name, inline: ctx.query.format === 'pdf' });
    return out;
  }, I);
  r.post('/api/engagements/:id/default-template', (ctx) => reports.setDefault(ctx, ctx.params.id, ctx.body.report_type, ctx.body.template_id), I);

  r.post('/api/reports/readiness', (ctx) => reports.readiness(ctx, ctx.body), I);
  r.post('/api/reports/generate', (ctx) => reports.generate(ctx, ctx.body), I);
  r.get('/api/reports', (ctx) => reports.listReports(ctx, ctx.query));
  r.get('/api/reports/compare', (ctx) => reports.compare(ctx, ctx.query.a, ctx.query.b), I);
  r.get('/api/reports/:id', (ctx) => reports.getReport(ctx, ctx.params.id));
  r.patch('/api/reports/:id/narrative', (ctx) => reports.saveNarrative(ctx, ctx.params.id, ctx.body), I);
  r.post('/api/reports/:id/regenerate', (ctx) => {
    const rep = repos.reports.get(ctx.params.id);
    if (!rep) throw notFound();
    return reports.generate(ctx, { engagement_id: rep.engagement_id, scope: rep.project_ids, report_type: rep.report_type, template_id: rep.template_id, period_end: rep.period_end, audience: rep.audience, narrative: rep.narrative, formats: rep.formats, report_id: rep.id, proceed: true });
  }, I);
  r.post('/api/reports/:id/submit', (ctx) => reports.submitForReview(ctx, ctx.params.id), I);
  r.post('/api/reports/:id/issue', (ctx) => reports.issue(ctx, ctx.params.id, ctx.body || {}), I);
  r.post('/api/reports/:id/distribute', (ctx) => reports.distributeReport(ctx, ctx.params.id, { channel: ctx.body.channel, message: ctx.body.message, extra: ctx.body.extra_recipients, exceptionReason: ctx.body.exception_reason }), I);
  r.post('/api/reports/:id/supersede', (ctx) => reports.supersede(ctx, ctx.params.id, ctx.body), I);
  r.post('/api/reports/:id/withdraw', (ctx) => reports.withdraw(ctx, ctx.params.id, ctx.body), I);
  r.get('/api/reports/:id/snapshot', (ctx) => reports.snapshotFor(ctx, ctx.params.id), I);
  r.get('/api/reports/:id/file/:kind', (ctx) => {
    if (!['docx', 'pdf'].includes(ctx.params.kind)) throw badRequest('Choose docx or pdf');
    const f = reports.reportFile(ctx, ctx.params.id, ctx.params.kind, ctx.query.draft);
    return new FileResponse(f.buffer, { type: f.meta.mime, name: f.meta.name, inline: ctx.query.inline === '1' });
  });
  r.get('/api/reports/:id/html', async (ctx) => {
    const f = reports.reportFile(ctx, ctx.params.id, 'docx', ctx.query.draft);
    return docxToHtml(f.buffer);
  });

  // Client portal home (CPT-002..004): engagements, issued reports, items awaiting the client.
  r.get('/api/portal', (ctx) => {
    if (!ctx.access.isExternal) throw forbidden('The portal is for client users.');
    const engs = ctx.access.visibleEngagementIds().map((id) => app.entities.get(ctx, 'engagement', id));
    const contactId = ctx.user.contact_id;
    const awaiting = engs.flatMap((e) => app.entities.list(ctx, 'deliverable', { engagement_id: e.id }).filter((d) => d.status === 'Submitted' && d.client_approver_id === contactId).map((d) => ({ ...d, engagement: e.name })));
    return {
      engagements: engs, reports: reports.listReports(ctx, {}), awaitingAcceptance: awaiting,
      approvals: app.workflow.inbox(ctx.user.id).map((a) => ({ id: a.id, title: a.title, kind: a.kind, entity: a.entity, entity_id: a.entity_id, due_date: a.due_date, engagement_id: a.engagement_id })),
      actions: engs.flatMap((e) => app.entities.list(ctx, 'action', { engagement_id: e.id }).filter((a) => a.owner_org === 'Client' && !['Done', 'Cancelled'].includes(a.status)).map((a) => ({ ...a, engagement: e.name }))),
    };
  });
}
