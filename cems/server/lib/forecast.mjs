// Budgets (FIN-008..012) and the monthly forecast cycle (FIN-018..028, UC-05, BR-14).
import { nthBusinessDay, addMonths } from '../../shared/dates.js';
import { badRequest, forbidden, unprocessable, notFound } from '../http.mjs';
import { nowIso } from '../db.mjs';

const sum = (xs, f = (x) => x) => xs.reduce((a, x) => a + (Number(f(x)) || 0), 0);

export function createForecast(app) {
  const { repos, settings, finance, audit, notify } = app;
  const versions = repos.forecast_versions;
  const cycles = repos.forecast_cycles;
  const budgets = repos.budget_versions;

  const canBudget = (ctx, p, action = 'U') => ctx.system || ctx.access.can(p.engagement_id, 'budget', action, { projectId: p.id });
  const isFinance = (ctx) => ctx.system || ctx.access.hasGlobal('finance');

  // ---------- Budgets ----------
  function budgetList(ctx, projectId) {
    const p = repos.project.get(projectId);
    if (!p || !ctx.access.can(p.engagement_id, 'budget', 'R', { projectId })) throw notFound();
    return budgets.find({ project_id: projectId }).sort((a, b) => (a.version_no || 0) - (b.version_no || 0)).map((b) => withTotals(b));
  }

  function withTotals(b) {
    const lines = b.lines || [];
    const cost = sum(lines.filter((l) => l.cost_type !== 'contingency'), (l) => l.cost);
    const revenue = sum(lines, (l) => l.revenue);
    return { ...b, totals: { cost, revenue, contingency: sum(lines.filter((l) => l.cost_type === 'contingency'), (l) => l.cost) + Number(b.contingency || 0), margin: revenue ? (revenue - cost) / revenue : null, hours: sum(lines, (l) => l.hours) } };
  }

  function createBudgetVersion(ctx, projectId, { lines, label, reason = null, change_id: changeId = null, approved = false, contingency = 0, management_reserve: reserve = 0 }) {
    const p = repos.project.get(projectId);
    const all = budgets.find({ project_id: projectId });
    if (approved) for (const b of all.filter((x) => x.status === 'Approved')) budgets.patch(b.id, { status: 'Superseded' }, ctx.user?.id);
    const rec = budgets.insert({
      project_id: projectId, engagement_id: p.engagement_id, version_no: all.length + 1, label: label || `Version ${all.length + 1}`, status: approved ? 'Approved' : 'Draft',
      lines: normaliseLines(lines), contingency: Number(contingency) || 0, management_reserve: Number(reserve) || 0, reason, change_id: changeId,
      approved_at: approved ? nowIso() : null, approved_by: approved ? ctx.user?.id || null : null,
    }, ctx.user?.id);
    audit.record({ userId: ctx.user?.id, ip: ctx.ip, action: approved ? 'baseline' : 'create', entity: 'budget', entityId: rec.id, engagementId: p.engagement_id, summary: `Budget ${rec.label} ${approved ? 'approved' : 'drafted'}${reason ? `: ${reason}` : ''}`, after: withTotals(rec).totals });
    finance.clearMemo();
    return withTotals(rec);
  }

  const normaliseLines = (lines) => (lines || []).filter((l) => l.month && (Number(l.cost) || Number(l.revenue) || Number(l.hours)))
    .map((l) => ({ stage_id: l.stage_id || null, cost_type: l.cost_type || 'labour', month: l.month, cost: Math.round((Number(l.cost) || 0) * 100) / 100, revenue: Math.round((Number(l.revenue) || 0) * 100) / 100, hours: Number(l.hours) || 0, role: l.role || null, note: l.note || null }));

  // Saves the working (draft) budget; it takes effect only through baseline approval or a change (BR-10).
  function saveDraft(ctx, projectId, { lines, contingency, management_reserve: reserve }) {
    const p = repos.project.get(projectId);
    if (!canBudget(ctx, p, 'U')) throw forbidden();
    const draft = budgets.find({ project_id: projectId }).filter((b) => b.status === 'Draft').at(-1);
    if (draft) {
      const rec = budgets.patch(draft.id, { lines: normaliseLines(lines), contingency: Number(contingency) || 0, management_reserve: Number(reserve) || 0 }, ctx.user.id);
      audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'update', entity: 'budget', entityId: rec.id, engagementId: p.engagement_id, summary: 'Draft budget updated', after: withTotals(rec).totals });
      return withTotals(rec);
    }
    return createBudgetVersion(ctx, projectId, { lines, contingency, management_reserve: reserve, label: budgets.find({ project_id: projectId }).length ? 'Re-baseline draft' : 'Original budget' });
  }

  function approveBudget(ctx, versionId) {
    const b = budgets.get(versionId);
    for (const x of budgets.find({ project_id: b.project_id }).filter((y) => y.status === 'Approved' && y.id !== versionId)) budgets.patch(x.id, { status: 'Superseded' }, ctx.user?.id);
    budgets.patch(versionId, { status: 'Approved', approved_at: nowIso(), approved_by: ctx.user?.id || null }, ctx.user?.id);
    finance.clearMemo();
  }

  // FIN-008 bottom-up: labour from the resource plan (hours × cost rate; revenue at charge-out rates).
  function bottomUp(ctx, projectId) {
    const p = repos.project.get(projectId);
    if (!canBudget(ctx, p, 'U')) throw forbidden();
    const d = finance.load(projectId);
    const lines = finance.labourForecast(d, p.start_date, { version: null });
    const byKey = new Map();
    for (const l of lines) {
      const k = `${l.month}|${l.role}`;
      const r = byKey.get(k) || { month: l.month, cost_type: 'labour', role: l.role, cost: 0, revenue: 0, hours: 0 };
      r.cost += l.cost; r.revenue += l.revenueValue; r.hours += l.hours;
      byKey.set(k, r);
    }
    return [...byKey.values()].sort((a, b) => a.month.localeCompare(b.month));
  }

  // ---------- Forecast cycle (FIN-022) ----------
  function cycleDeadlines(period) {
    const f = settings.get('finance').forecastCycle;
    const month = addMonths(period, 1);
    const h = settings.holidays();
    return { open: nthBusinessDay(month, f.openDay, h), pm: nthBusinessDay(month, f.pmDay, h), em: nthBusinessDay(month, f.emDay, h), finance: nthBusinessDay(month, f.financeDay, h) };
  }

  // Step 1–2: finance opens the cycle once the period is locked; forecasts roll forward.
  function openCycle(ctx, period) {
    if (!isFinance(ctx)) throw forbidden('Finance opens the forecast cycle.');
    if (!finance.isLocked(period)) throw badRequest(`Lock ${period} before opening its forecast cycle (FIN-022 step 1).`);
    if (cycles.findOne({ period })) throw badRequest('A cycle for this period already exists.');
    const cycle = cycles.insert({ period, status: 'Open', opened_at: nowIso(), opened_by: ctx.user?.id || null, deadlines: cycleDeadlines(period) }, ctx.user?.id);
    let n = 0;
    for (const p of repos.project.find({}).filter((x) => ['Initiation', 'In delivery', 'Stage boundary', 'Closing', 'On hold'].includes(x.state))) {
      rollForward(ctx, cycle, p);
      n++;
      notify.send([p.manager_id], { kind: 'forecast', title: `Forecast due by ${cycle.deadlines.pm}: ${p.name}`, body: `Monthly forecast cycle for ${period} is open.`, link: `/projects/${p.id}/financials?tab=forecast`, mandatory: true, dedupe: `fc:${cycle.id}:${p.id}` });
    }
    audit.record({ userId: ctx.user?.id, ip: ctx.ip, action: 'forecast-cycle', entity: 'forecast_cycle', entityId: cycle.id, summary: `Forecast cycle opened for ${period} with ${n} projects` });
    return cycle;
  }

  // Step 2: actuals replace the closed month and the labour forecast regenerates from allocations;
  // PM adjustments and non-labour forecasts for future months carry forward.
  function rollForward(ctx, cycle, p) {
    const prior = finance.approvedVersion(finance.load(p.id)) || versions.find({ project_id: p.id }).filter((v) => v.kind !== 'scenario').at(-1);
    const fromMonth = addMonths(cycle.period, 1);
    return versions.insert({
      project_id: p.id, engagement_id: p.engagement_id, cycle_id: cycle.id, cycle_period: cycle.period, kind: 'cycle', status: 'Draft', name: `Forecast ${cycle.period}`,
      adjustments: (prior?.adjustments || []).filter((a) => a.month >= fromMonth), non_labour: (prior?.non_labour || []).filter((l) => l.month >= fromMonth),
      eac_method: prior?.eac_method || 'Bottom-up', manual_eac: prior?.manual_eac || null, eac_justification: prior?.eac_justification || null,
      prior_version_id: prior?.id || null, commentary: '',
    }, ctx.user?.id);
  }

  function versionView(ctx, v) {
    const p = repos.project.get(v.project_id);
    const pos = finance.position(v.project_id, { versionId: v.id });
    const prior = v.prior_version_id ? versions.get(v.prior_version_id) : null;
    const costs = ctx.system || ctx.access.canSeeCosts(p.engagement_id);
    const movement = prior?.snapshot ? movementOf(prior.snapshot, pos) : null;
    const months = pos.months.map((m) => (costs ? m : { ...m, budgetCost: undefined, actualCost: undefined, forecastCost: undefined }));
    return {
      ...v, project: { id: p.id, name: p.name, code: p.code, manager_id: p.manager_id, end_date: p.end_date },
      totals: {
        asAt: pos.asAt, ac: pos.ac, etc: pos.etc, eac: pos.eac, bac: pos.bac, eacRevenue: pos.eacRevenue, recognised: pos.recognised, vac: pos.vac,
        forecastMargin: costs ? pos.forecastMargin : undefined, baselineMargin: costs ? pos.baselineMargin : undefined, eacOptions: pos.eacOptions, evm: pos.evm,
      },
      months, labourLines: pos.labourLines.map((l) => ({ ...l, cost: costs ? l.cost : undefined })), nonLabourLines: pos.nonLabourLines,
      prior: prior ? { id: prior.id, name: prior.name, snapshot: prior.snapshot ? { eac: prior.snapshot.eac, eacRevenue: prior.snapshot.eacRevenue, forecastMargin: costs ? prior.snapshot.forecastMargin : undefined } : null } : null,
      movement, commentaryRequired: movement?.requiresCommentary || false, marginBelowTarget: pos.forecastMargin != null && pos.forecastMargin < (p.margin_target ?? settings.get('ragRules').marginTarget),
    };
  }

  // BR-14: commentary is mandatory when EAC or margin moves by more than 5% or $10,000, whichever is lower.
  function movementOf(prior, pos) {
    const { pct, amount } = settings.get('finance').forecastCommentary;
    const eacMove = pos.eac - prior.eac;
    const marginPrior = (prior.eacRevenue || 0) - (prior.eac || 0);
    const marginNow = (pos.eacRevenue || 0) - (pos.eac || 0);
    const marginMove = marginNow - marginPrior;
    const eacLimit = Math.min(Math.abs(prior.eac || 0) * pct, amount);
    const marginLimit = Math.min(Math.abs(marginPrior) * pct, amount);
    return {
      eac: eacMove, eacPct: prior.eac ? eacMove / prior.eac : null, margin: marginMove, marginPct: marginPrior ? marginMove / Math.abs(marginPrior) : null,
      revenue: (pos.eacRevenue || 0) - (prior.eacRevenue || 0),
      requiresCommentary: Math.abs(eacMove) > eacLimit || Math.abs(marginMove) > marginLimit, eacLimit, marginLimit,
    };
  }

  function getVersion(ctx, id) {
    const v = versions.get(id);
    if (!v) throw notFound();
    const p = repos.project.get(v.project_id);
    if (!ctx.access.can(p.engagement_id, 'budget', 'R', { projectId: p.id })) throw notFound();
    return versionView(ctx, v);
  }

  // The version a project manager works on: the open cycle's draft, else a working version.
  function working(ctx, projectId) {
    const p = repos.project.get(projectId);
    if (!p || !ctx.access.can(p.engagement_id, 'budget', 'R', { projectId })) throw notFound();
    const list = versions.find({ project_id: projectId }).filter((v) => v.kind !== 'scenario');
    let v = list.filter((x) => x.kind === 'cycle' && !['Approved', 'Superseded'].includes(x.status)).at(-1);
    if (!v) v = list.filter((x) => x.kind === 'working').at(-1);
    if (!v && canBudget(ctx, p, 'U')) {
      const prior = list.filter((x) => x.status === 'Approved').at(-1);
      v = versions.insert({ project_id: p.id, engagement_id: p.engagement_id, kind: 'working', status: 'Draft', name: 'Working forecast', adjustments: prior?.adjustments || [], non_labour: prior?.non_labour || [], eac_method: prior?.eac_method || 'Bottom-up', prior_version_id: prior?.id || null }, ctx.user.id);
    }
    return v ? versionView(ctx, v) : null;
  }

  function save(ctx, id, input) {
    const v = versions.get(id);
    const p = repos.project.get(v.project_id);
    if (!canBudget(ctx, p, 'U')) throw forbidden();
    if (!['Draft', 'Queried'].includes(v.status)) throw badRequest(`This forecast is ${v.status.toLowerCase()} and locked.`);
    const changes = {};
    for (const k of ['adjustments', 'non_labour', 'eac_method', 'manual_eac', 'eac_justification', 'commentary']) if (k in input) changes[k] = input[k];
    if (changes.eac_method && changes.eac_method !== 'Bottom-up' && !String(changes.eac_justification ?? v.eac_justification ?? '').trim()) throw unprocessable('Record why this EAC method was chosen (FIN-020).', { eac_justification: 'Required' });
    const out = versions.patch(id, changes, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'update', entity: 'forecast', entityId: id, engagementId: p.engagement_id, summary: `Forecast updated for ${p.name}`, after: changes });
    finance.clearMemo();
    return versionView(ctx, out);
  }

  function snapshot(projectId, versionId) {
    finance.clearMemo();
    const pos = finance.position(projectId, { versionId });
    return { asAt: pos.asAt, ac: pos.ac, etc: pos.etc, eac: pos.eac, bac: pos.bac, eacRevenue: pos.eacRevenue, recognised: pos.recognised, forecastMargin: pos.forecastMargin, months: pos.months.map((m) => ({ month: m.month, actualRevenue: m.actualRevenue, forecastRevenue: m.forecastRevenue, actualCost: m.actualCost, forecastCost: m.forecastCost })) };
  }

  // Step 3: the project manager submits with commentary; BR-14 and margin tolerance rules apply (UC-05).
  function submitPM(ctx, id) {
    const v = versions.get(id);
    const p = repos.project.get(v.project_id);
    if (!canBudget(ctx, p, 'U')) throw forbidden();
    if (!['Draft', 'Queried'].includes(v.status)) throw badRequest('Already submitted.');
    const view = versionView(ctx, v);
    const e = repos.engagement.get(p.engagement_id);
    if (view.commentaryRequired && !String(v.commentary || '').trim()) {
      throw unprocessable(`Commentary is required: the forecast moved by more than 5% or $10,000 from the prior approved forecast (BR-14).`, { commentary: 'Required (BR-14)' });
    }
    const pos = finance.position(p.id, { versionId: id });
    const target = p.margin_target ?? settings.get('ragRules').marginTarget;
    if (pos.forecastMargin != null && pos.forecastMargin < target) {
      if (!String(v.commentary || '').trim()) throw unprocessable('Forecast margin is below target: commentary is mandatory (UC-05).', { commentary: 'Required: margin below target' });
      notify.send([e.manager_id, e.executive_id], { kind: 'forecast', title: `Forecast margin below target: ${p.name}`, body: `Forecast margin ${(pos.forecastMargin * 100).toFixed(1)}% against a target of ${(target * 100).toFixed(0)}%. ${v.commentary}`, link: `/projects/${p.id}/financials?tab=forecast`, engagementId: e.id, mandatory: true, severity: 'high' });
    }
    const out = versions.patch(id, { status: 'Submitted (PM)', submitted_pm_at: nowIso(), submitted_pm_by: ctx.user.id, snapshot: snapshot(p.id, id) }, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'submit', entity: 'forecast', entityId: id, engagementId: p.engagement_id, summary: `Forecast submitted by project manager: EAC $${Math.round(pos.eac).toLocaleString('en-AU')}` });
    notify.send([e.manager_id], { kind: 'forecast', title: `Forecast submitted: ${p.name}`, link: `/engagements/${e.id}/financials?tab=forecast`, engagementId: e.id });
    return versionView(ctx, out);
  }

  // Step 4: the engagement manager reviews the roll-up and submits the engagement.
  function submitEM(ctx, { cycle_id: cycleId, engagement_id: engId, commentary }) {
    if (!ctx.access.can(engId, 'budget', 'U')) throw forbidden();
    const list = versions.find({ cycle_id: cycleId }).filter((v) => v.engagement_id === engId);
    const notReady = list.filter((v) => !['Submitted (PM)', 'Submitted (EM)', 'Approved'].includes(v.status));
    if (notReady.length) throw unprocessable(`Waiting for project manager submissions: ${notReady.map((v) => repos.project.get(v.project_id)?.name).join(', ')}.`);
    for (const v of list.filter((x) => x.status === 'Submitted (PM)')) versions.patch(v.id, { status: 'Submitted (EM)', submitted_em_at: nowIso(), submitted_em_by: ctx.user.id, em_commentary: commentary || null }, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'submit', entity: 'forecast', entityId: cycleId, engagementId: engId, summary: 'Engagement forecast submitted by engagement manager' });
    notify.send(app.memberships.globalUsers('finance'), { kind: 'forecast', title: `Engagement forecast submitted: ${repos.engagement.get(engId)?.name}`, link: '/finance/forecast', mandatory: true });
    return { submitted: list.length };
  }

  // Step 5: finance reviews movements above threshold, queries or approves and locks the version.
  function financeDecision(ctx, id, { decision, comment }) {
    if (!isFinance(ctx)) throw forbidden('Finance approves forecasts.');
    const v = versions.get(id);
    if (v.status !== 'Submitted (EM)') throw badRequest('Only engagement-submitted forecasts can be approved.');
    const p = repos.project.get(v.project_id);
    if (decision === 'query') {
      if (!comment) throw badRequest('Add a query for the project manager.');
      versions.patch(id, { status: 'Queried', finance_query: comment }, ctx.user.id);
      notify.send([p.manager_id, repos.engagement.get(p.engagement_id)?.manager_id], { kind: 'forecast', title: `Finance query on the forecast: ${p.name}`, body: comment, link: `/projects/${p.id}/financials?tab=forecast`, mandatory: true });
    } else {
      for (const old of versions.find({ project_id: v.project_id }).filter((x) => x.status === 'Approved' && x.kind === 'cycle')) versions.patch(old.id, { superseded_by: id }, ctx.user.id);
      versions.patch(id, { status: 'Approved', locked: true, approved_at: nowIso(), approved_by: ctx.user.id, finance_comment: comment || null, snapshot: snapshot(p.id, id) }, ctx.user.id);
    }
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: decision === 'query' ? 'query' : 'approve', entity: 'forecast', entityId: id, engagementId: p.engagement_id, summary: `Forecast ${decision === 'query' ? 'queried' : 'approved and locked'} by finance` });
    const cycle = cycles.get(v.cycle_id);
    if (cycle && versions.find({ cycle_id: cycle.id }).every((x) => x.status === 'Approved')) cycles.patch(cycle.id, { status: 'Closed', closed_at: nowIso() }, ctx.user.id);
    finance.clearMemo();
    return versions.get(id);
  }

  function cycleView(ctx, cycleId) {
    const c = cycles.get(cycleId);
    if (!c) throw notFound();
    const vis = new Set(ctx.access.visibleEngagementIds());
    const list = versions.find({ cycle_id: cycleId }).filter((v) => vis.has(v.engagement_id)).map((v) => {
      const p = repos.project.get(v.project_id);
      const pos = finance.position(v.project_id, { versionId: v.id });
      const prior = v.prior_version_id ? versions.get(v.prior_version_id) : null;
      const mv = prior?.snapshot ? movementOf(prior.snapshot, pos) : null;
      const costs = ctx.access.canSeeCosts(v.engagement_id);
      return {
        id: v.id, status: v.status, project_id: p.id, project: p.name, engagement_id: v.engagement_id, engagement: repos.engagement.get(v.engagement_id)?.name, manager_id: p.manager_id,
        eac: pos.eac, eacRevenue: pos.eacRevenue, forecastMargin: costs ? pos.forecastMargin : undefined, movement: mv, commentary: v.commentary, eac_method: v.eac_method, finance_query: v.finance_query,
      };
    });
    return { ...c, versions: list };
  }

  // FIN-023: compare current forecast with the prior month and the baseline.
  function compare(ctx, projectId) {
    const p = repos.project.get(projectId);
    if (!ctx.access.can(p.engagement_id, 'budget', 'R', { projectId })) throw notFound();
    const list = versions.find({ project_id: projectId }).filter((v) => v.kind === 'cycle' && v.snapshot).sort((a, b) => String(a.cycle_period).localeCompare(String(b.cycle_period)));
    const current = finance.position(projectId);
    const baseline = budgets.find({ project_id: projectId }).filter((b) => b.status === 'Approved').at(-1);
    const costs = ctx.access.canSeeCosts(p.engagement_id);
    const row = (label, s) => ({ label, eac: s?.eac ?? null, eacRevenue: s?.eacRevenue ?? null, forecastMargin: costs ? s?.forecastMargin ?? null : undefined });
    return {
      rows: [
        row('Current (live)', current),
        ...list.slice(-3).reverse().map((v) => row(`${v.name} (${v.status})`, v.snapshot)),
        baseline ? { label: `Baseline (${baseline.label})`, eac: withTotals(baseline).totals.cost, eacRevenue: withTotals(baseline).totals.revenue, forecastMargin: costs ? withTotals(baseline).totals.margin : undefined } : null,
      ].filter(Boolean),
      trend: list.map((v) => ({ period: v.cycle_period, eac: v.snapshot.eac, eacRevenue: v.snapshot.eacRevenue, forecastMargin: costs ? v.snapshot.forecastMargin : undefined })),
    };
  }

  // FIN-024: scenarios without changing the approved forecast.
  function scenarios(ctx, projectId) {
    const p = repos.project.get(projectId);
    if (!ctx.access.can(p.engagement_id, 'budget', 'R', { projectId })) throw notFound();
    const costs = ctx.access.canSeeCosts(p.engagement_id);
    const defs = [
      { name: 'Base case', scenario: null },
      { name: 'Best case (−10% effort)', scenario: { hoursFactor: 0.9 } },
      { name: 'Worst case (+15% effort)', scenario: { hoursFactor: 1.15 } },
      { name: 'With pending changes', scenario: { includePending: true } },
      { name: 'With 2-month extension', scenario: { extensionMonths: 2 } },
    ];
    return defs.map((d) => {
      const pos = finance.position(projectId, d.scenario ? { scenario: d.scenario } : {});
      return { name: d.name, eac: pos.eac, eacRevenue: pos.eacRevenue, forecastMargin: costs ? pos.forecastMargin : undefined, etc: pos.etc };
    });
  }

  // FIN-028: weekly refresh so reports show a current EAC between cycles; also records EVM history.
  function weeklyRefresh() {
    finance.clearMemo();
    let n = 0;
    for (const p of repos.project.find({}).filter((x) => ['In delivery', 'Stage boundary', 'Closing', 'Initiation'].includes(x.state))) {
      const pos = finance.position(p.id);
      const hist = [...(p.evm_history || []).filter((h) => h.date !== pos.asAt), { date: pos.asAt, pv: pos.evm.pv, ev: pos.evm.ev, ac: pos.ac, eac: pos.eac, spi: pos.evm.spi, cpi: pos.evm.cpi }].slice(-104);
      repos.project.patch(p.id, { evm_history: hist, last_forecast_refresh: nowIso(), current_eac: pos.eac }, null);
      n++;
    }
    return `${n} projects refreshed`;
  }

  const listCycles = () => cycles.find({}).sort((a, b) => b.period.localeCompare(a.period));

  return {
    budgetList, createBudgetVersion, saveDraft, approveBudget, bottomUp, withTotals, openCycle, rollForward, working, getVersion, save, submitPM, submitEM,
    financeDecision, cycleView, compare, scenarios, weeklyRefresh, listCycles, cycleDeadlines, movementOf,
  };
}
