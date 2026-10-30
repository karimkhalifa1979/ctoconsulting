// Report data (section 8.2): the readiness check (RPT-029), the frozen snapshot (RPT-030),
// audience filtering (RPT-021, BR-11) and "changes since last report" (RPT-023).
import { addDays, todayIn, weekStart, fyOf, diffDays } from '../../../shared/dates.js';
import { trendOf, RAG_DEFINITIONS, DIMENSIONS } from '../../../shared/rag.js';
import { RAID_TYPES } from '../../../shared/schema.js';
import { isBlankRich } from '../../../shared/markdown.js';
import { fmtDate } from '../../../shared/format.js';
import { nowIso } from '../../db.mjs';

const CLOSED = { risk: ['Closed', 'Occurred'], issue: ['Resolved', 'Closed'], assumption: ['Validated', 'Invalid'], dependency: ['Delivered', 'Closed'], decision: ['Made', 'Superseded'], action: ['Done', 'Cancelled'] };
const DIM_TOKEN = { overall: 'overall', schedule: 'schedule', budget: 'budget', scope: 'scope', risk: 'risk', resource: 'resource', quality: 'quality' };
const FIN_INTERNAL = ['bac', 'actual_cost', 'eac', 'etc', 'vac', 'budget_consumed_pct', 'forecast_margin_pct', 'baseline_margin_pct', 'margin_erosion', 'wip', 'billed_in_advance', 'write_downs', 'realisation', 'burn_rate'];

export function createReportContext(app) {
  const { repos, settings, finance, status, schedule } = app;
  const today = () => todayIn(settings.tz());
  const userName = (id) => (id ? app.auth.getUser(id)?.name || null : null);
  const personName = (id) => (id ? repos.person.get(id)?.name || null : null);

  // ---------- Readiness (RPT-029, BR-18) ----------
  function readiness({ engagementId, projectIds, periodEnd, templateTokens = [], narrative = {} }) {
    const checks = [];
    const projects = projectIds.map((id) => repos.project.get(id)).filter(Boolean);
    const updates = projects.map((p) => ({ p, su: status.forReport(p.id, periodEnd) }));
    const notApproved = updates.filter(({ su }) => !su || !['Approved', 'Reported'].includes(su.status));
    checks.push({
      key: 'status', label: 'Status updates submitted and approved', ok: !notApproved.length,
      items: notApproved.map(({ p, su }) => ({ project_id: p.id, text: `${p.name}: ${su ? su.status : 'not started'}`, status_update_id: su?.id || null })),
    });
    // Financials are as at the last fully approved timesheet week (BR-02), so that week's timesheets
    // must be submitted and approved; the current week's are not due until Monday.
    const ws = addDays(weekStart(periodEnd), -7);
    const missingTs = [];
    for (const p of projects) {
      for (const a of repos.allocation.find({ project_id: p.id }).filter((x) => x.person_id && x.status === 'Confirmed' && x.start_date <= addDays(ws, 6) && x.end_date >= ws)) {
        const ts = repos.timesheets.findOne({ person_id: a.person_id, week_start: ws });
        if (!ts || !['Approved'].includes(ts.status)) missingTs.push({ text: `${personName(a.person_id)} (${p.name}): ${ts ? (ts.status === 'Submitted' ? 'awaiting approval' : ts.status.toLowerCase()) : 'not submitted'}` });
      }
    }
    const uniqueTs = [...new Map(missingTs.map((x) => [x.text.split(' (')[0], x])).values()];
    checks.push({ key: 'timesheets', label: `Timesheets for the week of ${fmtDate(ws)} approved (financials as at)`, ok: !uniqueTs.length, items: uniqueTs });
    const overdue = [];
    for (const t of RAID_TYPES) {
      for (const r of repos[t].find({ engagement_id: engagementId }).filter((x) => !x.project_id || projectIds.includes(x.project_id))) {
        const rec = app.entities.hooks[t]?.decorate ? app.entities.hooks[t].decorate({ system: true }, { ...r }) : r;
        if (rec.review_overdue) overdue.push({ text: `${r.ref} ${r.title} (review due ${fmtDate(rec.next_review)})` });
      }
    }
    checks.push({ key: 'raid', label: 'RAID items reviewed within their cycle', ok: !overdue.length, items: overdue });
    const stale = [];
    for (const p of projects) {
      for (const m of repos.milestone.find({ project_id: p.id }).filter((x) => !x.actual_date)) {
        const due = m.forecast_date || m.planned_date;
        if ((due && due < periodEnd) || (m.forecast_updated && diffDays(m.forecast_updated, periodEnd) > 28 && due <= addDays(periodEnd, 42))) stale.push({ text: `${p.name}: ${m.name} (forecast ${fmtDate(due)}${due < periodEnd ? ', in the past' : ', not confirmed for 4 weeks'})` });
      }
    }
    checks.push({ key: 'milestones', label: 'Milestones have current forecasts', ok: !stale.length, items: stale });
    const needs = [];
    const uses = (path) => templateTokens.some((t) => String(t).includes(path));
    for (const [key, label] of [['key_messages', 'Key messages'], ['summary', 'Engagement summary'], ['decisions_required', 'Decisions required'], ['escalations', 'Escalations']]) {
      if (uses(`engagement.${key}`) && isBlankRich(narrative[key])) needs.push({ text: `${label} (entered at generation)`, field: key });
    }
    for (const { p, su } of updates) {
      for (const k of ['executive_summary', 'achievements', 'next_period']) if (uses(`status.${k}`) && isBlankRich(su?.[k])) needs.push({ text: `${p.name}: ${k.replace('_', ' ')}` });
    }
    checks.push({ key: 'narrative', label: 'Narrative fields the template requires', ok: !needs.length, items: needs });
    return { checks, ok: checks.every((c) => c.ok), warnings: checks.filter((c) => !c.ok).map((c) => `${c.label}: ${c.items.length} gap${c.items.length > 1 ? 's' : ''}`) };
  }

  // ---------- Items ----------
  function raidItems(type, list, projectNames, inclusions) {
    return list.map((r) => {
      const dec = app.entities.hooks[type]?.decorate ? app.entities.hooks[type].decorate({ system: true }, { ...r }) : r;
      const closed = (CLOSED[type] || []).includes(r.status);
      let reportable = dec.reportable;
      if (inclusions?.include?.includes(r.id)) reportable = true;
      if (inclusions?.exclude?.includes(r.id)) reportable = false;
      const base = { _id: r.id, _client_visible: r.client_visible === true, id: r.ref, title: r.title, project: projectNames.get(r.project_id) || 'Engagement', status: r.status, closed, reportable: reportable && !closed, overdue: Boolean(dec.overdue) };
      switch (type) {
        case 'risk': return { ...base, description: [r.cause && `Cause: ${r.cause}`, r.event && `Event: ${r.event}`, r.effect && `Effect: ${r.effect}`].filter(Boolean).join(' '), category: r.category, rating: r.residual_level || r.inherent_level, inherent_rating: r.inherent_level, score: r.residual_score || r.inherent_score, trend: r.trend, owner: userName(r.owner_id), response: [r.response, r.response_actions].filter(Boolean).join(': '), due_date: dec.next_review, kind: r.kind, raised: String(r.raised_date || r.created_at).slice(0, 10) };
        case 'issue': return { ...base, description: r.description, severity: r.severity, priority: r.priority, owner: userName(r.owner_id), due_date: r.target_date, resolution: r.resolution };
        case 'dependency': return { ...base, direction: r.direction, type: r.dep_type, provider: r.provider, owner: userName(r.owner_id), due_date: r.need_by };
        case 'action': return { ...base, owner: r.owner_org === 'Client' ? r.owner_name : userName(r.owner_id), owner_org: r.owner_org, due_date: r.due_date };
        case 'decision': return { ...base, owner: r.decision_maker, due_date: r.due_date, decision_date: r.decision_date, rationale: r.rationale };
        case 'assumption': return { ...base, owner: userName(r.owner_id), due_date: r.validate_by };
        default: return base;
      }
    });
  }

  function projectContext(p, { periodEnd, periodStart, lookaheadEnd, costs }) {
    const plan = schedule.plan(p.id);
    const pos = finance.position(p.id);
    const su = status.forReport(p.id, periodEnd);
    const projectNames = new Map([[p.id, p.name]]);
    const next = plan.milestones.find((m) => !m.actual_date);
    const ratings = su?.ratings || {};
    const r = (k) => ratings[k]?.rag || null;
    const statusCtx = {
      overall_rag: r('overall'), schedule_rag: r('schedule'), budget_rag: r('budget'), scope_rag: r('scope'), risk_rag: r('risk'), resource_rag: r('resource'), quality_rag: r('quality'),
      ...Object.fromEntries(Object.keys(DIM_TOKEN).map((k) => [`${k}_commentary`, ratings[k]?.commentary || ''])),
      executive_summary: su?.executive_summary || '', achievements: su?.achievements || '', next_period: su?.next_period || '', decisions_required: su?.decisions_required || '',
      escalations: su?.escalations || '', client_actions: su?.client_actions || '', approval_state: su?.status || 'Not started', hours_this_period: su?.system_data?.hours_recorded ?? null,
      period_end: su?.period_end || periodEnd, _id: su?.id || null, _ratings: Object.fromEntries(Object.entries(ratings).map(([k, v]) => [k, v.rag])),
    };
    const raid = {};
    for (const t of RAID_TYPES) raid[t] = raidItems(t, repos[t].find({ project_id: p.id }), projectNames, su?.raid_inclusions);
    const changes = repos.change.find({ engagement_id: p.engagement_id }).filter((c) => c.project_id === p.id).map((c) => ({
      _id: c.id, _client_visible: c.client_visible !== false, id: c.ref, title: c.title, project: p.name, type: c.change_type, status: c.status, raised_date: c.raised_date, decided_at: c.decided_at || null,
      price_impact: c.impact_price ?? null, schedule_impact_days: c.impact_schedule_days ?? null, cost_impact: c.impact_cost ?? null, margin: c.impact_margin ?? null,
    }));
    const milestones = plan.milestones.map((m) => ({ _id: m.id, _client_visible: m.client_visible !== false, name: m.name, project: p.name, kind: m.kind, key: Boolean(m.key), planned_date: m.planned_date, baseline_date: m.baseline_date, forecast_date: m.forecast_date || m.planned_date, actual_date: m.actual_date, status: m.status, variance_days: m.variance_days }));
    const deliverables = repos.deliverable.find({ project_id: p.id }).map((d) => ({
      _id: d.id, _client_visible: d.client_visible !== false, id: d.ref, title: d.title, project: p.name, owner: userName(d.owner_id), due_date: d.actual_date || d.forecast_date || d.planned_date, baseline_date: d.baseline_date,
      status: d.status, acceptance_status: d.status === 'Accepted' ? 'Accepted' : d.status === 'Rejected' ? 'Rejected' : d.status === 'Submitted' ? `Awaiting client (due ${fmtDate(d.review_due)})` : '—', version: d.version, forecast_date: d.forecast_date, actual_date: d.actual_date,
    }));
    const people = repos.allocation.find({ project_id: p.id }).filter((a) => a.end_date >= periodStart).map((a) => {
      const person = a.person_id ? repos.person.get(a.person_id) : null;
      return { name: person?.name || `${a.placeholder_role} (to be confirmed)`, role: a.rate_role || person?.grade, project: p.name, hours_per_week: a.hours_per_week, fte: (Number(a.hours_per_week) || 0) / (Number(person?.standard_hours) || 37.5), status: a.status, start_date: a.start_date, end_date: a.end_date };
    });
    const exceptions = status.exceptions(p.id);
    return {
      _project_id: p.id,
      project: {
        name: p.name, code: p.code, manager: userName(p.manager_id), stage: plan.stages.find((s) => s.status === 'Active')?.name || null, state: p.state, approach: p.approach,
        percent_complete: plan.percent, start_date: p.start_date, end_baseline: p.baseline_end || null, end_forecast: plan.projectEnd && plan.projectEnd > p.end_date ? plan.projectEnd : p.end_date,
        next_milestone: next?.name || null, next_milestone_date: next ? next.forecast_date || next.planned_date : null,
      },
      status: statusCtx,
      milestones, deliverables, changes, people,
      risks: raid.risk, issues: raid.issue, dependencies: raid.dependency, actions: raid.action, decisions: raid.decision, assumptions: raid.assumption,
      fin: finTokens(pos, null),
      fin_lines: finLines(pos),
      exception: { raised: exceptions.some((x) => !x.internal), raised_internal: exceptions.length > 0, summary: exceptions.filter((x) => !x.internal).map((x) => `- ${x.text}`).join('\n'), summary_internal: exceptions.map((x) => `- ${x.text}`).join('\n') },
      chartdata: {
        budget_burn: { months: pos.months, bac: pos.bac, contractValue: pos.contractValue, eacRevenue: pos.eacRevenue, asAt: pos.asAt, asAtMonth: String(pos.asAt).slice(0, 7) },
        milestone_timeline: { milestones: plan.milestones.filter((m) => m.key || plan.milestones.length <= 10), today: periodEnd },
        rag_trend: { history: status.history(p.id) },
        risk_heatmap: { heatmap: app.dashboards.heat(repos.risk.find({ project_id: p.id }).filter((x) => x.status === 'Open')).residual, matrix: settings.get('riskMatrix').grid, residual: true },
      },
      custom: { ...(p.custom || {}) },
      changes_since_last: {},
      _costs: costs,
      _lookahead: lookaheadEnd,
    };
  }

  function finTokens(pos, eng) {
    if (!pos) return {};
    return {
      contract_value: pos.contractValue ?? null, invoiced_to_date: pos.invoicedToDate, remaining_value: pos.remainingValue ?? null,
      po_value: eng?.poValue ?? pos.poValue ?? null, po_consumed_pct: eng?.poConsumedPct ?? null, po_remaining: eng?.poRemaining ?? null,
      po_exhaustion_date: eng?.poExhaustionDate ?? null, po_exhaustion_before_end: eng?.poExhaustionBeforeEnd ?? false,
      forecast_fees_at_completion: pos.eacRevenue, fees_to_date: pos.recognised, as_at: pos.asAt,
      spi: pos.evm?.spi ?? null, cpi: pos.evm?.cpi ?? null,
      bac: pos.bac, actual_cost: pos.ac, eac: pos.eac, etc: pos.etc, vac: pos.vac, budget_consumed_pct: pos.budgetConsumedPct,
      forecast_margin_pct: pos.forecastMargin, baseline_margin_pct: pos.baselineMargin, margin_erosion: pos.marginErosion,
      wip: pos.wip, billed_in_advance: pos.billedInAdvance, write_downs: pos.writeDowns, realisation: pos.realisation, burn_rate: pos.burnRate,
    };
  }

  function finLines(pos) {
    return (pos?.months || []).map((m) => ({
      month: m.month, fy: fyOf(`${m.month}-01`), fees_budget: m.budgetRevenue, fees_actual: m.actualRevenue, fees_forecast: m.forecastRevenue,
      cost_budget: m.budgetCost, cost_actual: m.actualCost, cost_forecast: m.forecastCost,
    }));
  }

  // Builds the full (internal) snapshot for an engagement report.
  function build({ engagementId, projectIds, periodEnd, reportType, audience, narrative = {}, version = 1, preparedBy, name, level }) {
    const e = repos.engagement.get(engagementId);
    const client = repos.client.get(e.client_id);
    const periodStart = addDays(periodEnd, -6);
    const lookaheadEnd = addDays(periodEnd, 28);
    const projects = projectIds.map((id) => repos.project.get(id)).filter(Boolean);
    const projectCtxs = projects.map((p) => projectContext(p, { periodEnd, periodStart, lookaheadEnd, costs: true }));
    const projectNames = new Map(projects.map((p) => [p.id, p.name]));
    const engPos = finance.engagementPosition(engagementId);
    const engInScope = finance.rollup(projects.map((p) => finance.position(p.id)));
    const allProjects = projects.length === repos.project.find({ engagement_id: engagementId }).filter((p) => p.state !== 'Cancelled').length;
    const finEng = finTokens({ ...engInScope, contractValue: allProjects ? engPos.contractValue : engInScope.contractValue, remainingValue: allProjects ? engPos.remainingValue : engInScope.remainingValue }, engPos);
    const health = status.engagementHealth(e);
    const raidEng = {};
    for (const t of RAID_TYPES) {
      // Engagement RAID: engagement-level items plus items escalated from in-scope projects (RPT-019, ENG-009).
      const list = repos[t].find({ engagement_id: engagementId }).filter((r) => !r.project_id || (r.escalated && projectIds.includes(r.project_id)));
      raidEng[t] = raidItems(t, list, projectNames, null);
    }
    const crossDeps = repos.dependency.find({ engagement_id: engagementId }).filter((d) => ['Cross-project', 'Cross-engagement'].includes(d.dep_type) && (!d.project_id || projectIds.includes(d.project_id)));
    const meetings = repos.meeting.find({ engagement_id: engagementId }).filter((m) => m.date >= periodEnd).map((m) => ({ date: m.date, title: m.title, kind: m.kind }));
    const keyDates = repos.contract.find({ engagement_id: engagementId }).flatMap((c) => (c.key_dates || []).map((k) => ({ date: k.date, title: `${c.reference}: ${k.label}`, kind: 'Key date' }))).filter((k) => k.date >= periodEnd);
    const allMilestones = projectCtxs.flatMap((c) => c.milestones);
    const snap = {
      report: {
        week_ending: periodEnd, period_start: periodStart, as_at: nowIso(), financials_as_at: engInScope.asAt, version, prepared_by: preparedBy,
        classification: e.classification || 'Confidential', type: reportType, audience: audience === 'client' ? 'Client' : 'Internal', name,
      },
      firm: { name: settings.get('firm').name },
      client: { name: client.trading_name || client.legal_name, code: client.code, logo: client.logo_file_id || null },
      engagement: {
        name: e.name, code: e.code, manager: userName(e.manager_id), executive: userName(e.executive_id), sponsor: e.client_sponsor_id ? repos.contact.get(e.client_sponsor_id)?.name : null,
        start_date: e.start_date, end_date: e.end_date, overall_rag: health?.rag || null, rag_trend: 'New',
        key_messages: narrative.key_messages || '', summary: narrative.summary || '', decisions_required: narrative.decisions_required || '', escalations: narrative.escalations || '',
        project_count: projects.length, projects: projectCtxs,
      },
      fin: finEng,
      fin_lines: finLines(engInScope),
      risks: raidEng.risk, issues: raidEng.issue, dependencies: [...raidEng.dependency, ...raidItems('dependency', crossDeps.filter((d) => d.project_id), projectNames, null)].filter((v, i, a) => a.findIndex((x) => x._id === v._id) === i),
      actions: raidEng.action, decisions: raidEng.decision, assumptions: raidEng.assumption,
      changes: projectCtxs.flatMap((c) => c.changes).concat(repos.change.find({ engagement_id: engagementId }).filter((c) => !c.project_id).map((c) => ({ _id: c.id, _client_visible: c.client_visible !== false, id: c.ref, title: c.title, project: 'Engagement', type: c.change_type, status: c.status, raised_date: c.raised_date, price_impact: c.impact_price ?? null, schedule_impact_days: c.impact_schedule_days ?? null, cost_impact: c.impact_cost ?? null, margin: c.impact_margin ?? null }))),
      milestones: allMilestones.filter((m) => m.key || allMilestones.length <= 15),
      deliverables: projectCtxs.flatMap((c) => c.deliverables),
      people: projectCtxs.flatMap((c) => c.people),
      meetings: [...meetings, ...keyDates].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12),
      rag_definitions: RAG_DEFINITIONS,
      exception: { raised: projectCtxs.some((c) => c.exception.raised), raised_internal: projectCtxs.some((c) => c.exception.raised_internal), summary: projectCtxs.filter((c) => c.exception.raised).map((c) => `**${c.project.name}**\n${c.exception.summary}`).join('\n\n'), summary_internal: projectCtxs.filter((c) => c.exception.raised_internal).map((c) => `**${c.project.name}**\n${c.exception.summary_internal}`).join('\n\n') },
      changes_since_last: { rag_movements: [], new_risks: [], closed_risks: [], milestone_movements: [], forecast_movement: null, previous_report: null },
      chartdata: {
        budget_burn: { months: engInScope.months, bac: engInScope.bac, contractValue: finEng.contract_value, eacRevenue: engInScope.eacRevenue, asAt: engInScope.asAt, asAtMonth: String(engInScope.asAt).slice(0, 7) },
        milestone_timeline: { milestones: allMilestones.filter((m) => m.key).slice(0, 12), today: periodEnd },
        rag_trend: { history: projectCtxs.length === 1 ? projectCtxs[0].chartdata.rag_trend.history : engagementRagHistory(projects) },
        risk_heatmap: { heatmap: app.dashboards.heat(repos.risk.find({ engagement_id: engagementId }).filter((x) => x.status === 'Open' && (!x.project_id || projectIds.includes(x.project_id)))).residual, matrix: settings.get('riskMatrix').grid, residual: true },
        po_burn: engPos.po[0] ? { po: { ...engPos.po[0], consumedBefore: 0 }, months: engInScope.months, asAtMonth: String(engInScope.asAt).slice(0, 7) } : null,
      },
      custom: { ...(e.custom || {}) },
      _meta: { engagement_id: engagementId, project_ids: projectIds, period_end: periodEnd, report_type: reportType, level, client_shows_evm: Boolean(e.client_shows_evm) },
    };
    // Project-level templates read project tokens at the top level.
    if (level === 'project' && projectCtxs[0]) Object.assign(snap, { project: projectCtxs[0].project, status: projectCtxs[0].status, fin_project: projectCtxs[0].fin });
    if (level === 'project' && projectCtxs[0]) {
      const pc = projectCtxs[0];
      Object.assign(snap, { milestones: pc.milestones, deliverables: pc.deliverables, risks: pc.risks, issues: pc.issues, dependencies: pc.dependencies, actions: pc.actions, decisions: pc.decisions, assumptions: pc.assumptions, changes: pc.changes, people: pc.people, fin_lines: pc.fin_lines, exception: pc.exception, chartdata: { ...pc.chartdata, po_burn: snap.chartdata.po_burn } });
      snap.fin = { ...pc.fin, po_value: finEng.po_value, po_consumed_pct: finEng.po_consumed_pct, po_remaining: finEng.po_remaining, po_exhaustion_date: finEng.po_exhaustion_date, po_exhaustion_before_end: finEng.po_exhaustion_before_end };
    }
    return snap;
  }

  function engagementRagHistory(projects) {
    const byPeriod = new Map();
    for (const p of projects) for (const h of status.history(p.id)) {
      const cur = byPeriod.get(h.period_end) || { period_end: h.period_end };
      for (const d of [...DIMENSIONS.map((x) => x.key), 'overall']) {
        const order = { Green: 0, Amber: 1, Red: 2 };
        if (h[d] && (!cur[d] || order[h[d]] > order[cur[d]])) cur[d] = h[d];
      }
      byPeriod.set(h.period_end, cur);
    }
    return [...byPeriod.values()].sort((a, b) => a.period_end.localeCompare(b.period_end)).slice(-12);
  }

  // RPT-023: compares with the previous issued report's snapshot.
  function changesSinceLast(snap, prevSnap, prevName) {
    if (!prevSnap) return snap;
    const out = { rag_movements: [], new_risks: [], closed_risks: [], milestone_movements: [], forecast_movement: null, previous_report: prevName };
    const prevProjects = new Map((prevSnap.engagement?.projects || []).map((p) => [p._project_id, p]));
    for (const pc of snap.engagement.projects) {
      const pp = prevProjects.get(pc._project_id);
      const cur = pc.status._ratings || {};
      const prev = pp?.status?._ratings || {};
      const moves = [];
      for (const d of ['overall', ...DIMENSIONS.map((x) => x.key)]) {
        if (!cur[d]) continue;
        const dir = trendOf(prev[d], cur[d]);
        moves.push({ project: pc.project.name, dimension: d === 'risk' ? 'Risks and issues' : d === 'resource' ? 'Resources' : d[0].toUpperCase() + d.slice(1), from: prev[d] || null, to: cur[d], direction: dir });
      }
      out.rag_movements.push(...moves);
      pc.status.overall_trend = trendOf(prev.overall, cur.overall);
      const prevRisks = new Map((pp?.risks || []).map((r) => [r._id, r]));
      const curRisks = new Map(pc.risks.map((r) => [r._id, r]));
      const fresh = pc.risks.filter((r) => !r.closed && !prevRisks.has(r._id));
      const closed = (pp?.risks || []).filter((r) => !r.closed && (curRisks.get(r._id)?.closed || !curRisks.has(r._id))).map((r) => curRisks.get(r._id) || r);
      for (const r of fresh) r.is_new = true;
      const prevMs = new Map((pp?.milestones || []).map((m) => [m._id, m]));
      const msMoves = pc.milestones.map((m) => ({ m, p: prevMs.get(m._id) })).filter(({ m, p }) => p && (p.forecast_date || p.planned_date) !== (m.forecast_date || m.planned_date) && !m.actual_date)
        .map(({ m, p }) => ({ _id: m._id, _client_visible: m._client_visible, project: pc.project.name, name: m.name, from: p.forecast_date || p.planned_date, to: m.forecast_date || m.planned_date, days: diffDays(p.forecast_date || p.planned_date, m.forecast_date || m.planned_date) }));
      pc.changes_since_last = { rag_movements: moves, new_risks: fresh, closed_risks: closed, milestone_movements: msMoves, forecast_movement: pp?.fin?.eac != null ? pc.fin.eac - pp.fin.eac : null };
      out.new_risks.push(...fresh);
      out.closed_risks.push(...closed);
      out.milestone_movements.push(...msMoves);
    }
    if (prevSnap.fin?.eac != null && snap.fin?.eac != null) out.forecast_movement = snap.fin.eac - prevSnap.fin.eac;
    snap.engagement.rag_trend = trendOf(prevSnap.engagement?.overall_rag, snap.engagement.overall_rag);
    snap.changes_since_last = out;
    if (snap._meta.level === 'project' && snap.engagement.projects[0]) {
      snap.changes_since_last = { ...snap.engagement.projects[0].changes_since_last, previous_report: prevName };
      snap.status.overall_trend = snap.engagement.projects[0].status.overall_trend;
    }
    return snap;
  }

  // BR-11 / RPT-021 / CPT-005: client-audience data never contains internal-only content.
  function forAudience(snap, audience) {
    if (audience !== 'client') return snap;
    const s = structuredClone(snap);
    const evm = s._meta.client_shows_evm;
    const cleanFin = (f) => {
      if (!f) return f;
      for (const k of FIN_INTERNAL) delete f[k];
      if (!evm) { delete f.spi; delete f.cpi; }
      return f;
    };
    const cleanRaid = (list) => (list || []).filter((x) => x._client_visible);
    const cleanCtx = (c) => {
      cleanFin(c.fin);
      for (const k of ['risks', 'issues', 'dependencies', 'actions', 'decisions', 'assumptions']) c[k] = cleanRaid(c[k]);
      c.milestones = (c.milestones || []).filter((m) => m._client_visible);
      c.deliverables = (c.deliverables || []).filter((d) => d._client_visible);
      c.changes = (c.changes || []).filter((x) => x._client_visible).map(({ cost_impact, margin, ...rest }) => rest); // eslint-disable-line no-unused-vars
      c.fin_lines = (c.fin_lines || []).map(({ cost_budget, cost_actual, cost_forecast, ...rest }) => rest); // eslint-disable-line no-unused-vars
      if (c.status) { delete c.status.approval_state; delete c.status.hours_this_period; }
      if (c.exception) { delete c.exception.summary_internal; delete c.exception.raised_internal; }
      if (c.changes_since_last) {
        delete c.changes_since_last.forecast_movement;
        c.changes_since_last.new_risks = cleanRaid(c.changes_since_last.new_risks);
        c.changes_since_last.closed_risks = cleanRaid(c.changes_since_last.closed_risks);
        c.changes_since_last.milestone_movements = (c.changes_since_last.milestone_movements || []).filter((m) => m._client_visible !== false);
      }
      if (c.chartdata?.budget_burn) c.chartdata.budget_burn.months = c.chartdata.budget_burn.months.map((m) => ({ ...m, budgetCost: 0, actualCost: 0, forecastCost: 0 }));
      if (c.chartdata?.budget_burn) delete c.chartdata.budget_burn.bac;
      if (c.custom) for (const [k, v] of Object.entries(c.custom)) if (v?._internal) delete c.custom[k];
    };
    cleanCtx(s);
    for (const pc of s.engagement.projects) cleanCtx(pc);
    if (s.fin_project) cleanFin(s.fin_project);
    s.people = (s.people || []).map((p) => p);
    return s;
  }

  return { readiness, build, changesSinceLast, forAudience, projectContext };
}
