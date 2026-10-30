// Delivery API: dashboards, projects, governance, plans, status updates, time, resources and access.
import { forbidden, notFound, FileResponse } from '../http.mjs';
import { toXlsx, toCsv } from '../lib/xlsx.mjs';
import { MIME } from '../lib/files.mjs';
import { ROLE_LABEL } from '../../shared/permissions.js';

export function registerDeliveryRoutes(r, app) {
  const { repos, dashboards, projects, status, schedule, time, resources, memberships, entities, changes, audit } = app;
  const project = (ctx, id, fn = 'plan') => {
    const p = repos.project.get(id);
    if (!p || !ctx.access.canSeeEngagement(p.engagement_id)) throw notFound('Project not found');
    if (!ctx.access.can(p.engagement_id, fn, 'R', { projectId: id }) && !ctx.access.isExternal) throw notFound('Project not found');
    return p;
  };

  // ---------- Dashboards (DSH-001..007, WFL-005, CLI-006) ----------
  r.get('/api/dash/portfolio', (ctx) => dashboards.portfolio(ctx, ctx.query), { internal: true });
  r.get('/api/dash/exceptions', (ctx) => dashboards.exceptions(ctx), { internal: true });
  r.get('/api/dash/engagement/:id', (ctx) => dashboards.engagement(ctx, ctx.params.id), { internal: true });
  r.get('/api/dash/project/:id', (ctx) => dashboards.project(ctx, project(ctx, ctx.params.id).id), { internal: true });
  r.get('/api/dash/my-work', (ctx) => dashboards.myWork(ctx));
  r.get('/api/dash/client/:id', (ctx) => dashboards.client(ctx, ctx.params.id), { internal: true });
  r.get('/api/dash/data-quality', (ctx) => dashboards.dataQuality(ctx), { internal: true });
  r.get('/api/dash/trends/:id', (ctx) => dashboards.trends(ctx, ctx.params.id), { internal: true });

  // ---------- Projects (GOV, PLN, CLS, ENG-003) ----------
  r.get('/api/projects/templates', () => ({ templates: projects.templates(), profiles: projects.profiles() }), { internal: true });
  r.post('/api/projects', (ctx) => projects.createFromTemplate(ctx, ctx.body), { internal: true });
  r.post('/api/projects/:id/transition', (ctx) => projects.transition(ctx, ctx.params.id, ctx.body), { internal: true });
  r.put('/api/projects/:id/governance', (ctx) => projects.updateGovernance(ctx, ctx.params.id, ctx.body), { internal: true });
  r.post('/api/projects/:id/commercial', (ctx) => projects.submitCommercial(ctx, ctx.params.id, ctx.body), { internal: true });
  r.post('/api/projects/:id/baseline', (ctx) => projects.submitBaseline(ctx, ctx.params.id, ctx.body || {}), { internal: true });
  r.get('/api/projects/:id/baselines', (ctx) => { project(ctx, ctx.params.id); return repos.baselines.find({ project_id: ctx.params.id }).sort((a, b) => b.version_no - a.version_no).map(({ data, ...b }) => ({ ...b, bac: ctx.access.can(b.engagement_id, 'budget', 'R') ? data?.bac : undefined, end_date: data?.end_date, items: data?.work_items?.length })); }, { internal: true });
  r.get('/api/projects/:id/plan', (ctx) => { const p = project(ctx, ctx.params.id); return { ...schedule.plan(p.id), lookahead: schedule.lookahead(p.id), project: p }; });
  r.get('/api/projects/:id/reschedule', (ctx) => { project(ctx, ctx.params.id); return schedule.reschedulePreview(ctx.params.id); }, { internal: true });
  r.post('/api/projects/:id/reschedule', (ctx) => {
    const p = project(ctx, ctx.params.id);
    if (!ctx.access.can(p.engagement_id, 'plan', 'U', { projectId: p.id })) throw forbidden();
    const moves = schedule.reschedulePreview(p.id);
    for (const m of moves) entities.update(ctx, 'work_item', m.id, { start_date: m.to[0], finish_date: m.to[1] }, { summary: 'Rescheduled from dependencies (PLN-003)' });
    return { moved: moves.length };
  }, { internal: true });
  r.get('/api/projects/:id/lessons-suggest', (ctx) => {
    const p = project(ctx, ctx.params.id);
    return projects.suggestLessons(ctx, repos.engagement.get(p.engagement_id), projects.templates().find((t) => t.id === p.template_id));
  }, { internal: true });
  r.post('/api/gates/:id/submit', (ctx) => {
    const g = repos.gate_review.get(ctx.params.id);
    if (!g) throw notFound();
    return projects.submitGate(ctx, g);
  }, { internal: true });
  r.get('/api/stages/:id/gate-check', (ctx) => { const s = repos.stage.get(ctx.params.id); project(ctx, s.project_id); return projects.gateCheck(s); }, { internal: true });
  r.get('/api/projects/:id/closure', (ctx) => { project(ctx, ctx.params.id); return projects.closureStatus(ctx.params.id); }, { internal: true });
  r.put('/api/projects/:id/closure/:key', (ctx) => projects.updateClosureItem(ctx, ctx.params.id, ctx.params.key, ctx.body), { internal: true });
  r.post('/api/projects/:id/closure/exception', (ctx) => projects.requestClosureException(ctx, ctx.params.id, ctx.body), { internal: true });
  r.post('/api/projects/:id/close', (ctx) => projects.close(ctx, ctx.params.id), { internal: true });
  r.post('/api/projects/:id/transfer', (ctx) => projects.transferOpen(ctx, ctx.params.id, ctx.body), { internal: true });
  r.post('/api/projects/:id/move', (ctx) => projects.move(ctx, ctx.params.id, ctx.body.engagement_id), { internal: true });
  r.get('/api/projects/:id/change-log', (ctx) => { const p = project(ctx, ctx.params.id, 'change'); return changes.changeLog(ctx, p.engagement_id, p.id); }, { internal: true });
  r.get('/api/engagements/:id/change-log', (ctx) => changes.changeLog(ctx, ctx.params.id, null), { internal: true });
  r.get('/api/engagements/:id/closure', (ctx) => { if (!ctx.access.canSeeEngagement(ctx.params.id)) throw notFound(); return projects.engagementClosure(ctx.params.id); }, { internal: true });
  r.put('/api/engagements/:id/closure/:key', (ctx) => projects.updateEngagementClosureItem(ctx, ctx.params.id, ctx.params.key, ctx.body), { internal: true });

  // ---------- Membership and access (ACC-001, ACC-006..008) ----------
  const canManage = (ctx, engId) => ctx.access.can(engId, 'setup', 'U') || ctx.access.hasGlobal('sysadmin');
  r.get('/api/engagements/:id/members', (ctx) => {
    if (!ctx.access.canSeeEngagement(ctx.params.id) && !ctx.access.hasGlobal('sysadmin')) throw notFound();
    return memberships.list(ctx.params.id).map((m) => ({ ...m, user: app.auth.getUser(m.user_id)?.name, email: app.auth.getUser(m.user_id)?.email, role_label: ROLE_LABEL[m.role], external: app.auth.getUser(m.user_id)?.external }));
  }, { internal: true });
  r.post('/api/engagements/:id/members', (ctx) => {
    if (!canManage(ctx, ctx.params.id)) throw forbidden('The engagement manager manages membership.');
    const b = ctx.body;
    return memberships.add(ctx, { engagementId: ctx.params.id, userId: b.user_id, role: b.role, projectIds: b.project_ids, grants: b.grants, startDate: b.start_date, endDate: b.end_date });
  }, { internal: true });
  r.patch('/api/members/:id', (ctx) => {
    const m = app.db.prepare('SELECT * FROM memberships WHERE id = ?').get(ctx.params.id);
    if (!m || !canManage(ctx, m.engagement_id)) throw forbidden();
    return memberships.update(ctx, ctx.params.id, ctx.body);
  }, { internal: true });
  r.delete('/api/members/:id', (ctx) => {
    const m = app.db.prepare('SELECT * FROM memberships WHERE id = ?').get(ctx.params.id);
    if (!m || !canManage(ctx, m.engagement_id)) throw forbidden();
    return memberships.end(ctx, ctx.params.id, ctx.query.reason || 'Removed by engagement manager');
  }, { internal: true });
  r.get('/api/engagements/:id/access-review', async (ctx) => {
    if (!canManage(ctx, ctx.params.id) && !ctx.access.canGlobal('audit.read')) throw forbidden();
    const rows = memberships.accessReview(ctx.params.id).map((m) => ({ ...m, role: ROLE_LABEL[m.role], projects: (m.project_ids || []).map((id) => repos.project.get(id)?.name).join(', ') || 'All', grants: (m.grants || []).join(', ') }));
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'access-review', entity: 'engagement', entityId: ctx.params.id, engagementId: ctx.params.id, summary: 'Access review report generated (ACC-008)' });
    if (ctx.query.format === 'xlsx') {
      const cols = [['user_name', 'User'], ['email', 'Email'], ['role', 'Role'], ['projects', 'Projects'], ['grants', 'Extra grants'], ['start_date', 'Start'], ['end_date', 'End'], ['status', 'Status'], ['last_login', 'Last sign-in'], ['flags', 'Flags']].map(([key, label]) => ({ key, label }));
      return new FileResponse(await toXlsx([{ name: 'Access review', columns: cols, rows }]), { type: MIME.xlsx, name: `Access_review_${repos.engagement.get(ctx.params.id).code}.xlsx` });
    }
    return rows;
  }, { internal: true });

  // ---------- Team and onboarding (RES-009, RES-011) ----------
  r.get('/api/engagements/:id/team', (ctx) => { if (!ctx.access.canSeeEngagement(ctx.params.id)) throw notFound(); return resources.team(ctx, ctx.params.id); }, { internal: true });
  r.put('/api/allocations/:id/onboarding', (ctx) => {
    const a = repos.allocation.get(ctx.params.id);
    if (!a || !ctx.access.can(a.engagement_id, 'resources', 'U', { projectId: a.project_id })) throw forbidden();
    return entities.patch(ctx, 'allocation', a.id, { onboarding: { ...(a.onboarding || {}), [ctx.body.item]: Boolean(ctx.body.done) } }, `Onboarding: ${ctx.body.item} ${ctx.body.done ? 'complete' : 'reopened'}`);
  }, { internal: true });

  // ---------- Status updates (STS) ----------
  r.get('/api/projects/:id/status', (ctx) => status.list(ctx, ctx.params.id), { internal: true });
  r.post('/api/projects/:id/status/open', (ctx) => status.open(ctx, ctx.params.id, ctx.body?.period_end), { internal: true });
  r.get('/api/projects/:id/status/suggested', (ctx) => {
    const p = project(ctx, ctx.params.id, 'status');
    const { rag, metrics } = status.suggested(p.id);
    const costs = ctx.access.canSeeCosts(p.engagement_id);
    return { rag, metrics: { ...metrics, plan: undefined, position: undefined, holidays: undefined, forecastMargin: costs ? metrics.forecastMargin : undefined } };
  }, { internal: true });
  r.get('/api/projects/:id/status/history', (ctx) => { project(ctx, ctx.params.id, 'status'); return status.history(ctx.params.id); }, { internal: true });
  r.get('/api/status/tracker', (ctx) => status.tracker(ctx, { engagementId: ctx.query.engagement_id, periodEnd: ctx.query.period_end }), { internal: true });
  r.get('/api/status/:id', (ctx) => {
    const su = repos.status_updates.get(ctx.params.id);
    if (!su) throw notFound();
    project(ctx, su.project_id, 'status');
    return { ...su, overrides: status.overrides(su), approval: app.workflow.forEntity('status_update', su.id)[0] || null };
  }, { internal: true });
  r.patch('/api/status/:id', (ctx) => status.save(ctx, ctx.params.id, ctx.body || {}), { internal: true });
  r.post('/api/status/:id/submit', (ctx) => status.submit(ctx, ctx.params.id), { internal: true });
  r.post('/api/status/:id/version', (ctx) => status.newVersion(ctx, ctx.params.id), { internal: true });

  // ---------- Time and expenses (TEX) ----------
  r.get('/api/time/week', (ctx) => time.week(ctx, ctx.query.week_start, ctx.query.person_id), { internal: true });
  r.put('/api/time/week', (ctx) => time.saveWeek(ctx, ctx.body), { internal: true });
  r.post('/api/time/week/submit', (ctx) => time.submitWeek(ctx, ctx.body), { internal: true });
  r.get('/api/time/approvals', (ctx) => time.approvalQueue(ctx), { internal: true });
  r.post('/api/time/approvals', (ctx) => time.decide(ctx, ctx.body), { internal: true });
  r.post('/api/time/entries/:id/adjust', (ctx) => time.adjust(ctx, ctx.params.id, ctx.body), { internal: true });
  r.get('/api/time/history', (ctx) => {
    const person = time.personFor(ctx.user);
    if (!person) return [];
    return repos.timesheets.find({ person_id: person.id }).sort((a, b) => b.week_start.localeCompare(a.week_start)).slice(0, 26);
  }, { internal: true });
  r.get('/api/time/extract', async (ctx) => {
    const rows = time.extract(ctx, { engagement_id: ctx.query.engagement_id, from: ctx.query.from, to: ctx.query.to });
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'export', entity: 'timesheet', engagementId: ctx.query.engagement_id, summary: `Client timesheet extract ${ctx.query.from} to ${ctx.query.to} (TEX-007)` });
    const cols = [['date', 'Date'], ['person', 'Person'], ['project', 'Project'], ['tasks', 'Activities'], ['hours', 'Hours'], ['days', 'Billable days']].map(([key, label]) => ({ key, label }));
    const e = repos.engagement.get(ctx.query.engagement_id);
    if (ctx.query.format === 'csv') return new FileResponse(toCsv(cols, rows), { type: 'text/csv', name: `${e.code}_timesheets_${ctx.query.from}_${ctx.query.to}.csv` });
    if (ctx.query.format === 'xlsx') return new FileResponse(await toXlsx([{ name: 'Timesheets', columns: cols, rows }]), { type: MIME.xlsx, name: `${e.code}_timesheets_${ctx.query.from}_${ctx.query.to}.xlsx` });
    return rows;
  }, { internal: true });

  // ---------- Resources (RES) ----------
  r.get('/api/resources/capacity', (ctx) => resources.capacity(ctx, ctx.query), { internal: true });
  r.get('/api/resources/utilisation', (ctx) => resources.utilisation(ctx, ctx.query), { internal: true });
  r.get('/api/resources/expiries', () => resources.expiries(), { internal: true });
  r.get('/api/resources/requests/:id/match', (ctx) => {
    const req = repos.resource_request.get(ctx.params.id);
    if (!req) throw notFound();
    if (!ctx.access.hasGlobal('resource_manager') && !ctx.access.can(req.engagement_id, 'resources', 'R')) throw forbidden();
    return resources.match(ctx, req.id);
  }, { internal: true });

  // ---------- Knowledge base (LSN-003, RSK-010) ----------
  r.get('/api/knowledge/lessons', (ctx) => {
    if (ctx.access.isExternal) throw forbidden();
    const q = String(ctx.query.q || '').toLowerCase();
    return repos.lesson.find({}).filter((l) => l.published).map((l) => {
      const e = repos.engagement.get(l.engagement_id);
      const c = e ? repos.client.get(e.client_id) : null;
      const own = ctx.access.canSeeEngagement(l.engagement_id) && !e?.restricted;
      return { id: l.id, title: l.title, summary: l.published_summary, category: l.category, tags: l.tags, date: l.date, engagement_type: e?.type, sector: c?.sector, source: own ? `${e.name}` : 'Another engagement (details restricted)' };
    }).filter((l) => !q || [l.title, l.summary, ...(l.tags || [])].some((x) => String(x || '').toLowerCase().includes(q)));
  }, { internal: true });

}
