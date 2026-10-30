// Dashboards and work queues (DSH-001..007, ENG-010, ENG-015, CLI-006, WFL-005, DAT-009).
import { addDays, todayIn, weekStart, diffDays } from '../../shared/dates.js';
import { DIMENSIONS, worstRag, RAG_RANK } from '../../shared/rag.js';
import { RAID_TYPES, ENTITIES } from '../../shared/schema.js';
import { forbidden, notFound } from '../http.mjs';
import { now } from '../../shared/clock.js';

const pickFin = (pos, costs) => {
  if (!pos) return null;
  const base = {
    asAt: pos.asAt, contractValue: pos.contractValue, invoicedToDate: pos.invoicedToDate, remainingValue: pos.remainingValue, feesToDate: pos.recognised,
    forecastFeesAtCompletion: pos.eacRevenue, bac: pos.bac, ac: pos.ac, eac: pos.eac, etc: pos.etc, vac: pos.vac, budgetConsumedPct: pos.budgetConsumedPct,
    revenueBudget: pos.revenueBudget, spi: pos.evm?.spi ?? null, cpi: pos.evm?.cpi ?? null, hours: pos.hours, pendingHours: pos.pendingHours, burnRate: pos.burnRate,
    pendingChanges: pos.pendingChanges, model: pos.model, months: pos.months, po: pos.po, poConsumedPct: pos.poConsumedPct, poExhaustionDate: pos.poExhaustionDate, poExhaustionBeforeEnd: pos.poExhaustionBeforeEnd,
  };
  if (!costs) {
    base.months = (pos.months || []).map((m) => ({ ...m, budgetCost: undefined, actualCost: undefined, forecastCost: undefined }));
    return base;
  }
  return {
    ...base, forecastMargin: pos.forecastMargin, baselineMargin: pos.baselineMargin, marginErosion: pos.marginErosion, wip: pos.wip, billedInAdvance: pos.billedInAdvance,
    wipAgeing: pos.wipAgeing, writeDowns: pos.writeDowns, realisation: pos.realisation, labourCost: pos.labourCost, contingencyRemaining: pos.contingencyRemaining, evm: pos.evm,
  };
};

export function createDashboards(app) {
  const { repos, settings, finance, status, schedule, entities } = app;
  const today = () => todayIn(settings.tz());

  function projectSummary(ctx, p) {
    const costs = ctx.access.canSeeCosts(p.engagement_id);
    const rag = status.latestRag(p.id);
    const suggestion = status.isDue(p) ? status.suggested(p.id).rag : null;
    const plan = schedule.plan(p.id);
    const next = plan.milestones.find((m) => !m.actual_date);
    return {
      id: p.id, code: p.code, name: p.name, state: p.state, approach: p.approach, manager_id: p.manager_id, start_date: p.start_date, end_date: p.end_date,
      percent: plan.percent, rag: rag?.overall || null, ratings: rag?.ratings || null, rag_period: rag?.period_end || null, suggested: suggestion ? Object.fromEntries(Object.entries(suggestion).map(([k, v]) => [k, v.rag])) : null,
      next_milestone: next ? { name: next.name, date: next.forecast_date || next.planned_date, status: next.status } : null,
      flags: plan.flags.slice(0, 5), fin: pickFin(finance.position(p.id), costs), exceptions: status.exceptions(p.id).filter((x) => costs || !x.internal),
      stage: plan.stages.find((s) => s.status === 'Active')?.name || null,
    };
  }

  // ENG-010 / DSH-002 engagement dashboard rolling up all projects.
  function engagement(ctx, engId) {
    if (!ctx.access.canSeeEngagement(engId)) throw notFound();
    const e = repos.engagement.get(engId);
    const costs = ctx.access.canSeeCosts(engId);
    const projects = repos.project.find({ engagement_id: engId }).map((p) => projectSummary(ctx, p));
    const active = projects.filter((p) => ['In delivery', 'Stage boundary', 'Initiation', 'Closing'].includes(p.state));
    const dims = Object.fromEntries([...DIMENSIONS.map((d) => d.key), 'overall'].map((k) => [k, worstRag(...active.map((p) => p.ratings?.[k]).filter(Boolean))]));
    const now = today();
    const in4 = addDays(now, 28);
    const milestones = projects.flatMap((p) => schedule.plan(p.id).milestones.filter((m) => !m.actual_date && (m.forecast_date || m.planned_date) <= in4).map((m) => ({ ...m, project: p.name })))
      .sort((a, b) => String(a.forecast_date || a.planned_date).localeCompare(String(b.forecast_date || b.planned_date)));
    const risks = entities.list(ctx, 'risk', { engagement_id: engId }).filter((r) => r.status === 'Open').sort((a, b) => (b.residual_score || b.inherent_score) - (a.residual_score || a.inherent_score)).slice(0, 6);
    const issues = entities.list(ctx, 'issue', { engagement_id: engId }).filter((i) => !['Resolved', 'Closed'].includes(i.status)).sort((a, b) => RAG_RANK_SEV(b.severity) - RAG_RANK_SEV(a.severity)).slice(0, 6);
    const changes = ctx.access.can(engId, 'change', 'R') ? entities.list(ctx, 'change', { engagement_id: engId }).filter((c) => !['Rejected', 'Closed', 'Implemented'].includes(c.status)) : [];
    const fin = ctx.access.can(engId, 'budget', 'R') || ctx.access.can(engId, 'billing', 'R') ? pickFin(finance.engagementPosition(engId), costs) : null;
    const team = app.resources.team(ctx, engId);
    const health = status.engagementHealth(e);
    const deps = entities.list(ctx, 'dependency', { engagement_id: engId }).filter((d) => ['Open', 'At risk'].includes(d.status) && (d.dep_type === 'Cross-project' || d.dep_type === 'Cross-engagement' || d.overdue));
    return {
      engagement: { ...e, internal_notes: costs ? e.internal_notes : undefined }, health, dimensions: dims, projects, milestones, risks, issues, changes, fin, team: { count: team.rows.length, rows: team.rows }, dependencies: deps,
      roadmap: projects.map((p) => ({ id: p.id, name: p.name, start: p.start_date, end: p.end_date, state: p.state, stages: repos.stage.find({ project_id: p.id }).sort((a, b) => a.seq - b.seq).map((s) => ({ name: s.name, start: s.start_date, end: s.end_date, status: s.status })), milestones: schedule.plan(p.id).milestones.filter((m) => m.key).map((m) => ({ name: m.name, date: m.actual_date || m.forecast_date || m.planned_date, status: m.status })) })),
      obligations: obligations(e),
      costs,
    };
  }
  const SEV = { Low: 1, Medium: 2, High: 3, Critical: 4 };
  const RAG_RANK_SEV = (s) => SEV[s] || 0;

  // ENG-014: compliance with reporting obligations (issued reports per period, required meetings).
  function obligations(e) {
    const issued = repos.reports.find({ engagement_id: e.id }).filter((r) => ['Issued', 'Superseded'].includes(r.status));
    const lastIssued = issued.map((r) => r.period_end).sort().at(-1) || null;
    const expected = e.reporting_cadence === 'Monthly' ? 31 : e.reporting_cadence === 'Fortnightly' ? 14 : 7;
    const gap = lastIssued ? diffDays(lastIssued, today()) : null;
    const meetings = repos.meeting.find({ engagement_id: e.id }).filter((m) => m.kind === 'Steering committee').sort((a, b) => b.date.localeCompare(a.date));
    return {
      cadence: e.reporting_cadence || 'Weekly', lastIssued, compliant: lastIssued ? gap <= expected + 3 : false, reportsIssued: issued.length,
      lastSteerco: meetings.find((m) => m.date <= today())?.date || null, nextSteerco: [...meetings].reverse().find((m) => m.date > today())?.date || null,
    };
  }

  function project(ctx, projectId) {
    const p = repos.project.get(projectId);
    if (!p || !ctx.access.canSeeEngagement(p.engagement_id)) throw notFound();
    const sum = projectSummary(ctx, p);
    const costs = ctx.access.canSeeCosts(p.engagement_id);
    const pos = finance.position(projectId);
    const risks = entities.list(ctx, 'risk', { engagement_id: p.engagement_id, project_id: projectId });
    return {
      ...sum, project: p, history: status.history(projectId), plan: schedule.plan(projectId), lookahead: schedule.lookahead(projectId),
      heatmap: heat(risks.filter((r) => r.status === 'Open')), riskTrend: riskTrend(risks), fin: pickFin(pos, costs), evm: costs ? pos.evm : { spi: pos.evm.spi, cpi: pos.evm.cpi, pctComplete: pos.evm.pctComplete },
      costs,
    };
  }

  // RSK-008 heat maps (inherent and residual) and trend of open risk counts by level.
  function heat(risks) {
    const grid = (lk, ck) => {
      const g = Array.from({ length: 5 }, () => Array(5).fill(0));
      for (const r of risks) { const l = Number(r[lk] || r.likelihood), c = Number(r[ck] || r.consequence); if (l && c) g[l - 1][c - 1]++; }
      return g;
    };
    return { inherent: grid('likelihood', 'consequence'), residual: grid('residual_likelihood', 'residual_consequence') };
  }
  function riskTrend(risks) {
    const weeks = Array.from({ length: 12 }, (_, i) => addDays(weekStart(today()), -7 * (11 - i)));
    return weeks.map((w) => {
      const counts = { week: w, Low: 0, Medium: 0, High: 0, Extreme: 0 };
      for (const r of risks) {
        const h = (r.score_history || []).filter((x) => x.date <= addDays(w, 6)).at(-1);
        if (!h || h.status !== 'Open') continue;
        counts[h.level] = (counts[h.level] || 0) + 1;
      }
      return counts;
    });
  }

  // DSH-001 portfolio dashboard with filters; DSH-003 drill-down links come from ids.
  function portfolio(ctx, filters = {}) {
    if (ctx.access.isExternal) throw forbidden();
    const ids = ctx.access.visibleEngagementIds();
    const rows = [];
    for (const id of ids) {
      const e = repos.engagement.get(id);
      const client = repos.client.get(e.client_id);
      if (filters.client && e.client_id !== filters.client) continue;
      if (filters.manager && e.manager_id !== filters.manager) continue;
      if (filters.practice && e.practice !== filters.practice) continue;
      if (filters.sector && client?.sector !== filters.sector) continue;
      if (filters.status ? e.status !== filters.status : e.status === 'Closed') continue;
      const costs = ctx.access.canSeeCosts(id);
      const pos = ctx.access.can(id, 'budget', 'R') || ctx.access.can(id, 'billing', 'R') || ctx.access.can(id, 'dashboards', 'R') ? finance.engagementPosition(id) : null;
      const projects = repos.project.find({ engagement_id: id });
      const openRisks = repos.risk.find({ engagement_id: id }).filter((r) => r.status === 'Open');
      const next = projects.flatMap((p) => schedule.plan(p.id).milestones.filter((m) => !m.actual_date)).sort((a, b) => String(a.forecast_date || a.planned_date).localeCompare(String(b.forecast_date || b.planned_date)))[0];
      rows.push({
        id, code: e.code, name: e.name, client_id: e.client_id, client: client?.trading_name || client?.legal_name, sector: client?.sector, practice: e.practice, manager_id: e.manager_id, executive_id: e.executive_id,
        status: e.status, type: e.type, restricted: e.restricted, health: status.engagementHealth(e), projects: projects.length, activeProjects: projects.filter((p) => ['In delivery', 'Stage boundary', 'Initiation', 'Closing'].includes(p.state)).length,
        fin: pos ? pickFin(pos, costs) : null, costs,
        risks: { extreme: openRisks.filter((r) => (r.residual_level || r.inherent_level) === 'Extreme').length, high: openRisks.filter((r) => (r.residual_level || r.inherent_level) === 'High').length },
        next_milestone: next ? { name: next.name, date: next.forecast_date || next.planned_date } : null, end_date: e.end_date,
      });
    }
    const costRows = rows.filter((r) => r.costs && r.fin);
    const totals = {
      engagements: rows.length, projects: rows.reduce((a, r) => a + r.activeProjects, 0),
      contractValue: rows.reduce((a, r) => a + (r.fin?.contractValue || 0), 0), fees: rows.reduce((a, r) => a + (r.fin?.forecastFeesAtCompletion || 0), 0),
      invoiced: rows.reduce((a, r) => a + (r.fin?.invoicedToDate || 0), 0), wip: costRows.reduce((a, r) => a + (r.fin?.wip || 0), 0),
      margin: (() => { const rev = costRows.reduce((a, r) => a + (r.fin?.forecastFeesAtCompletion || 0), 0); const cost = costRows.reduce((a, r) => a + (r.fin?.eac || 0), 0); return rev && costRows.length ? (rev - cost) / rev : null; })(),
      health: { Green: rows.filter((r) => r.health?.rag === 'Green').length, Amber: rows.filter((r) => r.health?.rag === 'Amber').length, Red: rows.filter((r) => r.health?.rag === 'Red').length, None: rows.filter((r) => !r.health).length },
      showCosts: costRows.length > 0,
    };
    const util = app.resources.utilisation(ctx, { group: 'practice' });
    return { rows, totals, utilisation: util.rows, exceptions: exceptions(ctx), filters };
  }

  // DSH-004 exception lists.
  function exceptions(ctx) {
    const ids = ctx.access.visibleEngagementIds();
    const out = { atRisk: [], lateStatus: [], poAlerts: [], contractExpiries: [], clearanceExpiries: [], overdueReviews: [], agedWip: [] };
    const now = today();
    for (const id of ids) {
      const e = repos.engagement.get(id);
      if (e.status === 'Closed') continue;
      for (const p of repos.project.find({ engagement_id: id }).filter(status.isDue)) {
        const rag = status.latestRag(p.id);
        const ex = status.exceptions(p.id).filter((x) => ctx.access.canSeeCosts(id) || !x.internal);
        if (rag?.overall === 'Red' || ex.length) out.atRisk.push({ project_id: p.id, project: p.name, engagement: e.name, rag: rag?.overall || null, reasons: ex.map((x) => x.text) });
      }
      if (ctx.access.can(id, 'budget', 'R') || ctx.access.can(id, 'billing', 'R')) {
        for (const po of repos.po.find({ engagement_id: id }).filter((x) => x.status === 'Active')) {
          const st = finance.poStatus(po);
          if (st.thresholdCrossed || st.exhaustsBeforeEnd) out.poAlerts.push({ engagement_id: id, engagement: e.name, po: po.number, consumedPct: st.consumedPct, exhaustionDate: st.exhaustionDate, beforeEnd: st.exhaustsBeforeEnd, threshold: st.thresholdCrossed });
        }
        if (ctx.access.canSeeCosts(id)) {
          const pos = finance.engagementPosition(id);
          const aged = (pos.wipAgeing['61-90'] || 0) + (pos.wipAgeing['90+'] || 0);
          if (aged > settings.get('finance').agedWip.amount) out.agedWip.push({ engagement_id: id, engagement: e.name, amount: aged });
        }
      }
      for (const c of repos.contract.find({ engagement_id: id })) {
        for (const kd of [{ label: 'Contract end', date: c.end_date }, ...(c.key_dates || [])]) {
          if (!kd.date) continue;
          const days = diffDays(now, kd.date);
          if (days >= 0 && days <= 90) out.contractExpiries.push({ engagement_id: id, engagement: e.name, contract: c.reference, label: kd.label, date: kd.date, days });
        }
      }
      for (const t of RAID_TYPES) {
        for (const r of app.entities.list(ctx, t, { engagement_id: id }).filter((x) => x.review_overdue)) out.overdueReviews.push({ engagement_id: id, ref: r.ref, title: r.title, type: ENTITIES[t].label, owner_id: r.owner_id, project_id: r.project_id, next_review: r.next_review });
      }
    }
    for (const row of status.tracker(ctx)) if (row.status === 'Late') out.lateStatus.push(row);
    for (const x of app.resources.expiries()) out.clearanceExpiries.push(x);
    for (const a of repos.agreement.find({})) {
      const days = a.expiry_date ? diffDays(now, a.expiry_date) : null;
      if (days !== null && days >= 0 && days <= (a.alert_days || 90) && ids.some((id) => repos.engagement.get(id)?.client_id === a.client_id)) out.contractExpiries.push({ client: repos.client.get(a.client_id)?.legal_name, contract: a.reference, label: `${a.kind} expiry`, date: a.expiry_date, days });
    }
    return out;
  }

  // WFL-005 "My work": tasks, actions, approvals, owned RAID items, timesheets and status updates due.
  function myWork(ctx) {
    const uid = ctx.user.id;
    const now = today();
    const vis = ctx.access.visibleEngagementIds();
    const tasks = repos.work_item.find({ engagement_id: vis }).filter((t) => (t.assignees || []).includes(uid) && t.status !== 'Done')
      .map((t) => ({ ...t, project: repos.project.get(t.project_id)?.name, overdue: t.finish_date && t.finish_date < now }))
      .sort((a, b) => String(a.finish_date).localeCompare(String(b.finish_date))).slice(0, 30);
    const raid = [];
    for (const t of RAID_TYPES) {
      for (const r of app.entities.list(ctx, t, {}).filter((x) => x.owner_id === uid && !(ENTITIES[t].closed || []).includes(x.status))) {
        raid.push({ type: t, label: ENTITIES[t].label, id: r.id, ref: r.ref, title: r.title, project_id: r.project_id, engagement_id: r.engagement_id, due: r.due_date || r.target_date || r.need_by || r.validate_by || r.next_review, overdue: r.overdue || r.review_overdue, level: r.residual_level || r.inherent_level || r.severity });
      }
    }
    const approvals = app.workflow.inbox(uid);
    const person = repos.person.findOne({ user_id: uid });
    const timesheets = [];
    if (person) {
      for (let i = 1; i >= 0; i--) {
        const ws = addDays(weekStart(now), -7 * i);
        const ts = repos.timesheets.findOne({ person_id: person.id, week_start: ws });
        if (!ts || ['Draft', 'Rejected'].includes(ts.status)) timesheets.push({ week_start: ws, status: ts?.status || 'Not started', deadline: app.time.deadline(ws), late: now() > new Date(app.time.deadline(ws)) });
      }
    }
    const statusDue = status.tracker(ctx).filter((r) => r.manager_id === uid && ['Not started', 'Draft', 'Returned', 'Late'].includes(r.status));
    const timesheetApprovals = app.time.approvalQueue(ctx).timesheets;
    const deliverables = repos.deliverable.find({ engagement_id: vis }).filter((d) => d.owner_id === uid && !['Accepted', 'Withdrawn'].includes(d.status)).map((d) => ({ ...d, project: repos.project.get(d.project_id)?.name }));
    return { tasks, raid, approvals, timesheets, statusDue, timesheetApprovals, deliverables, notifications: app.notify.list(uid, { limit: 15 }) };
  }

  // CLI-006 client overview.
  function client(ctx, clientId) {
    const c = repos.client.get(clientId);
    if (!c) throw notFound();
    const engs = ctx.access.visibleEngagementIds().map((id) => repos.engagement.get(id)).filter((e) => e.client_id === clientId);
    if (!engs.length && !entities.canRead(ctx, entities.def('client'), c)) throw notFound();
    const fin = engs.map((e) => ({ e, costs: ctx.access.canSeeCosts(e.id), pos: ctx.access.can(e.id, 'billing', 'R') || ctx.access.can(e.id, 'budget', 'R') ? finance.engagementPosition(e.id) : null }));
    const revenue = fin.reduce((a, x) => a + (x.pos?.recognised || 0), 0);
    const wip = fin.filter((x) => x.costs).reduce((a, x) => a + (x.pos?.wip || 0), 0);
    const debt = finance.debtors(engs.filter((e) => ctx.access.can(e.id, 'billing', 'R')).map((e) => e.id));
    const risks = engs.flatMap((e) => entities.list(ctx, 'risk', { engagement_id: e.id }).filter((r) => r.status === 'Open' && ['High', 'Extreme'].includes(r.residual_level || r.inherent_level)));
    const issues = engs.flatMap((e) => entities.list(ctx, 'issue', { engagement_id: e.id }).filter((i) => !['Resolved', 'Closed'].includes(i.status) && ['High', 'Critical'].includes(i.severity)));
    const sat = engs.flatMap((e) => repos.satisfaction.find({ engagement_id: e.id }).map((s) => ({ ...s, engagement: e.name }))).sort((a, b) => a.date.localeCompare(b.date));
    return {
      client: entities.get(ctx, 'client', clientId), engagements: engs.map((e) => ({ id: e.id, code: e.code, name: e.name, status: e.status, start_date: e.start_date, end_date: e.end_date, manager_id: e.manager_id, health: status.engagementHealth(e) })),
      agreements: entities.list(ctx, 'agreement', { client_id: clientId }), contacts: entities.list(ctx, 'contact', { client_id: clientId }),
      revenueToDate: revenue, wip: fin.some((x) => x.costs) ? wip : null, debtors: debt.receivables, debtorBuckets: debt.buckets, risks, issues, satisfaction: sat,
      children: repos.client.find({}).filter((x) => x.parent_id === clientId).map((x) => ({ id: x.id, name: x.legal_name, code: x.code })),
    };
  }

  // DAT-009 data quality dashboard for the PMO.
  function dataQuality(ctx) {
    if (!ctx.access.hasGlobal('pmo') && !ctx.access.hasGlobal('sysadmin')) throw forbidden();
    const ids = ctx.access.visibleEngagementIds();
    const missingOwners = [];
    for (const t of RAID_TYPES) for (const r of repos[t].find({ engagement_id: ids })) if (!r.owner_id && !r.owner_name && !(ENTITIES[t].closed || []).includes(r.status) && t !== 'decision') missingOwners.push({ type: ENTITIES[t].label, ref: r.ref, title: r.title, engagement_id: r.engagement_id, project_id: r.project_id });
    const overdue = exceptions(ctx).overdueReviews;
    const projects = repos.project.find({ engagement_id: ids });
    const stale = projects.filter((p) => status.isDue(p)).filter((p) => { const v = repos.forecast_versions.find({ project_id: p.id }).at(-1); return !v || diffDays(String(v.updated_at).slice(0, 10), today()) > 35; }).map((p) => ({ project_id: p.id, project: p.name }));
    const noBaseline = projects.filter((p) => ['In delivery', 'Stage boundary', 'Closing'].includes(p.state) && !p.baseline_approved).map((p) => ({ project_id: p.id, project: p.name, state: p.state }));
    const noRaid = projects.filter((p) => ['In delivery', 'Stage boundary'].includes(p.state) && !repos.risk.find({ project_id: p.id }).length).map((p) => ({ project_id: p.id, project: p.name }));
    return { missingOwners, overdueReviews: overdue, staleForecasts: stale, noBaseline, noRaid };
  }

  // DSH-007 trends: RAG history, forecast movements, margin trend, RAID ageing.
  function trends(ctx, engId) {
    if (!ctx.access.canSeeEngagement(engId)) throw notFound();
    const costs = ctx.access.canSeeCosts(engId);
    const projects = repos.project.find({ engagement_id: engId });
    const rag = projects.map((p) => ({ project: p.name, history: status.history(p.id) }));
    const forecast = projects.map((p) => ({ project: p.name, cycles: repos.forecast_versions.find({ project_id: p.id }).filter((v) => v.snapshot && v.kind === 'cycle').map((v) => ({ period: v.cycle_period, eac: v.snapshot.eac, eacRevenue: v.snapshot.eacRevenue, margin: costs ? v.snapshot.forecastMargin : undefined })) }));
    const ageing = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const t of RAID_TYPES) for (const r of entities.list(ctx, t, { engagement_id: engId }).filter((x) => !(ENTITIES[t].closed || []).includes(x.status))) {
      const a = r.age_days ?? 0;
      ageing[a <= 30 ? '0-30' : a <= 60 ? '31-60' : a <= 90 ? '61-90' : '90+']++;
    }
    return { rag, forecast, raidAgeing: ageing };
  }

  return { engagement, project, portfolio, exceptions, myWork, client, dataQuality, trends, projectSummary, heat, worstRag, RAG_RANK };
}
