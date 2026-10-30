// Financial engine (section 7). Every figure is derived by project and month from approved time,
// expenses, supplier costs, allocations, budgets and billing, and rolls up to engagement, client and
// portfolio (FIN-012, FIN-021). Amounts are exclusive of GST (BR-13).
import {
  addDays, addMonths, monthOf, monthStart, monthEnd, monthsBetween, todayIn, weekStart, diffDays, daysInMonth,
  businessDaysBetween, isBusinessDay, fyOf, fyMonths, nthBusinessDay, maxDate, minDate,
} from '../../shared/dates.js';
import { badRequest, forbidden } from '../http.mjs';

const ISSUED = ['Sent to accounting', 'Issued', 'Paid', 'Overdue', 'Disputed'];
const round2 = (v) => Math.round(v * 100) / 100;
const sum = (xs, f = (x) => x) => xs.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const div = (a, b) => (b ? a / b : null);
const roundTo = (v, step) => (step ? Math.round(v / step) * step : v);

export function createFinance(app) {
  const { repos, settings, rates, db } = app;
  const today = () => todayIn(settings.tz());
  const F = () => settings.get('finance');
  let memo = new Map();
  const clearMemo = () => { memo = new Map(); rates.clearCache(); };

  // ---------- Periods (FIN-041) ----------
  function periods() {
    return repos.periods.find({}).sort((a, b) => a.id.localeCompare(b.id));
  }
  const isLocked = (month) => repos.periods.get(month)?.status === 'locked';
  // Transactions dated in a locked period post to the current open period (BR-08, TEX-010).
  function postingPeriod(date) {
    const m = monthOf(date || today());
    if (!isLocked(m)) return m;
    let p = m;
    while (isLocked(p)) p = addMonths(p, 1);
    return p;
  }
  const latestLocked = () => periods().filter((p) => p.status === 'locked').map((p) => p.id).sort().at(-1) || null;

  // ---------- Contract value (FIN-003) ----------
  function contractValue(contract) {
    if (!contract) return 0;
    const variations = repos.contract.find({ engagement_id: contract.engagement_id }).filter((c) => c.kind === 'Variation' && c.parent_id === contract.id && c.status === 'Signed');
    return Number(contract.value || 0) + sum(variations, (v) => v.value);
  }

  // ---------- Loading ----------
  function load(projectId) {
    const p = repos.project.get(projectId);
    if (!p) return null;
    const e = repos.engagement.get(p.engagement_id);
    const all = (repo) => repo.find({ project_id: projectId });
    const engAll = (repo) => repo.find({ engagement_id: p.engagement_id });
    const budgets = repos.budget_versions.find({ project_id: projectId }).sort((a, b) => (a.version_no || 0) - (b.version_no || 0));
    return {
      p, e,
      stages: all(repos.stage),
      items: all(repos.work_item),
      entries: all(repos.time_entries),
      expenses: all(repos.expense),
      supplier: all(repos.supplier_cost),
      commitments: all(repos.commitment),
      allocations: all(repos.allocation),
      milestones: all(repos.milestone),
      billing: all(repos.billing_event),
      wipAdj: all(repos.wip_adjustment),
      drawdowns: all(repos.drawdown),
      invoices: engAll(repos.invoice).filter((i) => i.project_id === projectId),
      funding: engAll(repos.funding).filter((f) => f.project_id === projectId),
      contracts: engAll(repos.contract),
      pos: engAll(repos.po),
      changes: engAll(repos.change).filter((c) => c.project_id === projectId),
      budget: budgets.filter((b) => b.status === 'Approved').at(-1) || null,
      budgets,
      forecasts: repos.forecast_versions.find({ project_id: projectId }).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    };
  }

  // Primary commercial model: the project's own setting, else its main SOW's model (FIN-001).
  function projectModel(d) {
    if (d.p.commercial_model) return d.p.commercial_model;
    const sows = d.funding.filter((f) => f.instrument_kind === 'contract').sort((a, b) => b.amount - a.amount);
    const c = sows.length ? d.contracts.find((k) => k.id === sows[0].instrument_id) : null;
    return c?.commercial_model || 'T&M';
  }

  function projectContractValue(d) {
    const sow = sum(d.funding.filter((f) => f.instrument_kind === 'contract'), (f) => f.amount);
    if (sow) return sow;
    if (d.p.fixed_price) return Number(d.p.fixed_price);
    return sum(d.funding.filter((f) => f.instrument_kind === 'po'), (f) => f.amount) || null;
  }

  // Billing arrangements: the project's model plus any stage with its own model (FIN-001).
  function arrangements(d) {
    const model = projectModel(d);
    const own = d.stages.filter((s) => s.billing_model);
    const value = projectContractValue(d);
    const ownPrice = sum(own, (s) => s.price);
    const main = {
      key: 'project', label: 'Project', model, stageIds: new Set(d.stages.filter((s) => !s.billing_model).map((s) => s.id)), includeUnstaged: true,
      price: model.includes('Fixed') || model === 'Outcome-based' ? Number(d.p.fixed_price || (value ? value - ownPrice : 0)) : null,
      cap: model === 'Capped T&M' ? Number(d.p.cap || (value ? value - ownPrice : 0)) : null,
      fee: model === 'Retainer' ? Number(d.p.retainer_fee || 0) : null,
    };
    return [main, ...own.map((s) => ({ key: s.id, label: s.name, model: s.billing_model, stageIds: new Set([s.id]), price: Number(s.price || 0), cap: s.billing_model === 'Capped T&M' ? Number(s.price || 0) : null, fee: null }))];
  }

  function arrangementOf(arrs, stageId) {
    return arrs.find((a) => (stageId ? a.stageIds.has(stageId) : a.includeUnstaged)) || arrs[0];
  }

  // Role used for charge-out rates: the allocation's rate role covering the date, else the person's grade.
  function roleFor(d, personId, date) {
    const alloc = d.allocations.find((a) => a.person_id === personId && a.start_date <= date && a.end_date >= date);
    return alloc?.rate_role || repos.person.get(personId)?.grade || null;
  }

  // ---------- Actuals (FIN-013, FIN-014) ----------
  function valueEntries(d, asAt) {
    const taskStage = new Map(d.items.map((t) => [t.id, t.stage_id]));
    const dayLength = Number(d.e?.day_length) || settings.get('timesheets').dayLength;
    const rounding = Number(d.e?.rounding ?? settings.get('timesheets').rounding);
    const daily = (d.e?.billing_unit || 'day') === 'day';
    const approved = d.entries.filter((t) => t.status === 'Approved' && (!asAt || t.date <= asAt));
    // BR-12: billable days per person per day = hours ÷ day length, rounded per contract.
    const groups = new Map();
    for (const t of approved) {
      const k = `${t.person_id}|${t.date}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    const valued = [];
    for (const list of groups.values()) {
      const { person_id: personId, date } = list[0];
      const role = roleFor(d, personId, date);
      const rate = rates.chargeRate({ engagementId: d.e.id, role, personId, date });
      const std = rates.chargeRate({ engagementId: null, role, personId: null, date });
      const costRate = rates.personCost(personId, role, date);
      const billableHours = sum(list.filter((t) => t.billable !== false), (t) => t.hours);
      const billDays = daily ? roundTo(billableHours / dayLength, rounding) : null;
      const groupRevenue = daily ? billDays * rate.daily : billableHours * rate.hourly;
      for (const t of list) {
        const share = t.billable !== false && billableHours ? t.hours / billableHours : 0;
        valued.push({
          ...t, stage_id: taskStage.get(t.task_id) || null, role, month: t.period && t.period > monthOf(t.date) ? t.period : monthOf(t.date),
          cost: t.hours * costRate, revenueValue: groupRevenue * share, standardValue: t.hours * std.hourly * (t.billable !== false ? 1 : 0),
          billableDays: daily && share ? billDays * share : null,
        });
      }
    }
    return valued;
  }

  // BR-02: as at the end of the most recent fully approved timesheet week (Sunday).
  function approvedAsAt(d, onDate = today()) {
    let sunday = addDays(weekStart(onDate), -1);
    for (let i = 0; i < 10; i++) {
      const from = addDays(sunday, -6);
      const pending = d.entries.some((t) => t.date >= from && t.date <= sunday && t.status !== 'Approved');
      if (!pending) return sunday;
      sunday = addDays(sunday, -7);
    }
    return sunday;
  }

  // ---------- Labour forecast from allocations (FIN-019, RES-012) ----------
  function availableHoursInRange(person, from, to, holidays) {
    if (from > to) return 0;
    const weekly = Number(person?.standard_hours || 37.5) * (Number(person?.fte) || 1);
    const days = businessDaysBetween(addDays(from, -1), to, holidays);
    return (weekly / 5) * days;
  }

  function allocationHoursByMonth(a, from, to, holidays, leave = []) {
    const out = {};
    const start = maxDate(a.start_date, from);
    const end = minDate(a.end_date, to);
    if (!start || !end || start > end) return out;
    const perDay = Number(a.hours_per_week || 0) / 5;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (!isBusinessDay(d, holidays)) continue;
      if (leave.some((l) => l.from <= d && l.to >= d)) continue;
      const m = monthOf(d);
      out[m] = (out[m] || 0) + perDay;
    }
    return out;
  }

  function labourForecast(d, from, opts = {}) {
    const holidays = settings.holidays(d.e?.state);
    const to = d.p.end_date;
    const lines = [];
    const version = opts.version || latestVersion(d);
    for (const a of d.allocations) {
      if (opts.confirmedOnly && a.status !== 'Confirmed') continue;
      const person = a.person_id ? repos.person.get(a.person_id) : null;
      const leave = a.person_id ? repos.leave.find({ person_id: a.person_id }) : [];
      const byMonth = allocationHoursByMonth(a, from, to, holidays, leave);
      const role = a.rate_role || person?.grade;
      const key = a.person_id ? `person:${a.person_id}` : `role:${a.placeholder_role || role}:${a.id}`;
      for (const [month, hours] of Object.entries(byMonth)) {
        lines.push({ month, key, person_id: a.person_id || null, role, label: person?.name || `${a.placeholder_role || role} (placeholder)`, hours, billable: a.billable !== false, source: 'allocation', tentative: a.status !== 'Confirmed' });
      }
    }
    // PM adjustments: hours overrides per key and month, and added placeholder roles.
    for (const adj of version?.adjustments || []) {
      if (adj.month < monthOf(from)) continue;
      const existing = lines.filter((l) => l.key === adj.key && l.month === adj.month);
      if (existing.length) {
        const total = sum(existing, (l) => l.hours);
        for (const l of existing) { l.hours = total ? (l.hours / total) * adj.hours : adj.hours / existing.length; l.source = 'adjusted'; }
      } else lines.push({ month: adj.month, key: adj.key, person_id: adj.person_id || null, role: adj.role, label: adj.label || adj.role, hours: adj.hours, billable: adj.billable !== false, source: 'added' });
    }
    const date = (m) => maxDate(monthStart(m), from);
    for (const l of lines) {
      const cr = rates.personCost(l.person_id, l.role, date(l.month));
      const rr = rates.chargeRate({ engagementId: d.e.id, role: l.role, personId: l.person_id, date: date(l.month) });
      l.cost = l.hours * cr;
      l.revenueValue = l.billable ? l.hours * rr.hourly : 0;
    }
    return lines;
  }

  const latestVersion = (d) => d.forecasts.filter((v) => v.kind !== 'scenario').at(-1) || null;
  const approvedVersion = (d) => d.forecasts.filter((v) => v.status === 'Approved' && v.kind === 'cycle').at(-1) || null;

  function nonLabourForecast(d, from, version = latestVersion(d)) {
    const fromMonth = monthOf(from);
    const manual = (version?.non_labour || []).filter((l) => l.month >= fromMonth).map((l) => ({ ...l, source: 'manual' }));
    const commitments = d.commitments.filter((c) => c.status === 'Open').map((c) => ({ month: maxDate(monthOf(c.expected_date || from), fromMonth), category: 'Commitment', description: c.description, cost: Number(c.amount), revenue: 0, source: 'commitment' }));
    return [...manual, ...commitments];
  }

  // ---------- Position ----------
  function position(projectId, opts = {}) {
    const key = `${projectId}|${opts.asAt || ''}|${opts.versionId || ''}|${opts.scenario ? JSON.stringify(opts.scenario) : ''}`;
    if (memo.has(key)) return memo.get(key);
    const d = load(projectId);
    if (!d) return null;
    const asAt = opts.asAt || approvedAsAt(d);
    const nowMonth = monthOf(asAt);
    const fc = settings.get('finance');
    const valued = valueEntries(d, asAt);
    const pendingHours = sum(d.entries.filter((t) => ['Submitted', 'Draft'].includes(t.status) && t.date <= today()), (t) => t.hours);
    const expenses = d.expenses.filter((x) => x.status === 'Approved');
    const supplier = d.supplier;
    const arrs = arrangements(d);
    const version = opts.versionId ? repos.forecast_versions.get(opts.versionId) : latestVersion(d);

    // Actual cost (AC): approved hours × cost rate, plus expenses and third-party costs (to date).
    const labourCost = sum(valued, (t) => t.cost);
    const expenseCost = sum(expenses, (x) => x.amount);
    const supplierCost = sum(supplier, (x) => x.amount);
    const ac = labourCost + expenseCost + supplierCost;
    const hours = sum(valued, (t) => t.hours);
    const billableHours = sum(valued.filter((t) => t.billable !== false), (t) => t.hours);

    // Budget (FIN-008..011): contingency and management reserve sit outside the BAC.
    const lines = d.budget?.lines || [];
    const bac = sum(lines.filter((l) => l.cost_type !== 'contingency'), (l) => l.cost);
    const contingency = sum(lines.filter((l) => l.cost_type === 'contingency'), (l) => l.cost) + Number(d.budget?.contingency || 0);
    const revenueBudget = sum(lines, (l) => l.revenue);
    const drawn = sum(d.drawdowns.filter((x) => x.status === 'Approved'), (x) => x.amount);

    // ETC: labour from allocations (with PM adjustments) and non-labour forecasts, from the day after as-at.
    const from = addDays(asAt, 1);
    let labour = labourForecast(d, from, { version });
    let nonLabour = nonLabourForecast(d, from, version);
    if (opts.scenario) ({ labour, nonLabour } = applyScenario(d, opts.scenario, labour, nonLabour));
    const etcBottomUp = sum(labour, (l) => l.cost) + sum(nonLabour, (l) => l.cost);

    // Revenue recognition by arrangement (FIN-033).
    const months = monthsBetween(monthOf(minDate(d.p.start_date, valued.map((t) => t.date).sort()[0]) || d.p.start_date), monthOf(maxDate(d.p.end_date, asAt)));
    const byMonth = Object.fromEntries(months.map((m) => [m, {
      month: m, budgetCost: 0, budgetRevenue: 0, actualCost: 0, actualRevenue: 0, forecastCost: 0, forecastRevenue: 0, billing: 0, invoiced: 0, hours: 0,
    }]));
    const row = (m) => (byMonth[m] ||= { month: m, budgetCost: 0, budgetRevenue: 0, actualCost: 0, actualRevenue: 0, forecastCost: 0, forecastRevenue: 0, billing: 0, invoiced: 0, hours: 0 });
    for (const l of lines) if (l.cost_type !== 'contingency') { row(l.month).budgetCost += Number(l.cost) || 0; row(l.month).budgetRevenue += Number(l.revenue) || 0; }
    for (const t of valued) { row(t.month).actualCost += t.cost; row(t.month).hours += t.hours; }
    for (const x of expenses) row(x.period || monthOf(x.date)).actualCost += Number(x.amount) || 0;
    for (const x of supplier) row(x.period || monthOf(x.date)).actualCost += Number(x.amount) || 0;
    for (const l of labour) row(l.month).forecastCost += l.cost;
    for (const l of nonLabour) row(l.month).forecastCost += Number(l.cost) || 0;

    // Arrangement-level cost (actual and forecast) for cost-to-cost recognition.
    const arrCost = new Map(arrs.map((a) => [a.key, { actual: {}, forecast: {} }]));
    const addArr = (a, kind, m, v) => { const r = arrCost.get(a.key)[kind]; r[m] = (r[m] || 0) + v; };
    for (const t of valued) addArr(arrangementOf(arrs, t.stage_id), 'actual', t.month, t.cost);
    for (const x of [...expenses, ...supplier]) addArr(arrs[0], 'actual', x.period || monthOf(x.date), Number(x.amount) || 0);
    for (const l of labour) addArr(arrs[0], 'forecast', l.month, l.cost);
    for (const l of nonLabour) addArr(arrs[0], 'forecast', l.month, Number(l.cost) || 0);

    const markup = Number(d.e?.expense_markup) || 0;
    const billableExtras = (list) => list.filter((x) => x.billable).map((x) => ({ month: x.period || monthOf(x.date), amount: Number(x.amount) * (1 + markup) }));
    const addRev = (obj, m, v) => { obj[m] = (obj[m] || 0) + v; };
    const standardValue = sum(valued, (t) => t.standardValue);
    // Each arrangement keeps its own monthly recognised (actual) and forecast revenue.
    for (const a of arrs) {
      a.recog = {};
      a.fcRev = {};
      recognise(a, a.recog, a.fcRev);
    }
    const recog = {}; // month -> recognised revenue (actual), all arrangements
    const fcRev = {}; // month -> forecast revenue, all arrangements
    for (const a of arrs) {
      for (const [m, v] of Object.entries(a.recog)) addRev(recog, m, v);
      for (const [m, v] of Object.entries(a.fcRev)) addRev(fcRev, m, v);
    }
    function recognise(a, recog, fcRev) {
      const aValued = valued.filter((t) => arrangementOf(arrs, t.stage_id) === a);
      const aLabour = a === arrs[0] ? labour : [];
      if (a.model === 'T&M' || a.model === 'Capped T&M') {
        const actual = {};
        for (const t of aValued) addRev(actual, t.month, t.revenueValue);
        if (a === arrs[0]) for (const x of billableExtras([...expenses, ...supplier])) addRev(actual, x.month, x.amount);
        const forecast = {};
        for (const l of aLabour) addRev(forecast, l.month, l.revenueValue);
        if (a === arrs[0]) for (const l of nonLabour) addRev(forecast, l.month, Number(l.revenue) || 0);
        let cum = 0;
        const cap = a.model === 'Capped T&M' && a.cap ? a.cap : Infinity;
        for (const m of Object.keys({ ...actual, ...forecast }).sort()) {
          for (const [obj, target] of [[actual, recog], [forecast, fcRev]]) {
            const v = obj[m] || 0;
            const allowed = Math.max(0, Math.min(v, cap - cum));
            cum += allowed;
            addRev(target, m, allowed);
          }
        }
      } else if (a.model === 'Retainer') {
        const fee = a.fee || 0;
        for (const m of monthsBetween(monthOf(d.p.start_date), monthOf(d.p.end_date))) addRev(m <= nowMonth ? recog : fcRev, m, fee);
      } else if (a.model === 'Milestone fixed price' || a.model === 'Outcome-based') {
        for (const ms of d.milestones.filter((x) => x.kind === 'Payment' && Number(x.billing_amount))) {
          if (ms.actual_date && ms.actual_date <= asAt) addRev(recog, monthOf(ms.actual_date), Number(ms.billing_amount));
          else addRev(fcRev, maxDate(monthOf(ms.forecast_date || ms.planned_date), monthOf(from)), Number(ms.billing_amount));
        }
      } else {
        // Fixed price: cost-to-cost input method; cumulative revenue = price × cumulative cost ÷ EAC.
        const ac2 = arrCost.get(a.key);
        const actualTotal = sum(Object.values(ac2.actual));
        let eacA = actualTotal + sum(Object.values(ac2.forecast));
        if (a !== arrs[0]) {
          const stageBudget = sum(lines.filter((l) => a.stageIds.has(l.stage_id) && l.cost_type !== 'contingency'), (l) => l.cost);
          eacA = Math.max(actualTotal, stageBudget || actualTotal);
        }
        const price = a.price || 0;
        let cumCost = 0, cumRev = 0;
        for (const m of Object.keys({ ...ac2.actual, ...ac2.forecast }).sort()) {
          cumCost += (ac2.actual[m] || 0);
          let target = eacA ? price * Math.min(1, cumCost / eacA) : 0;
          addRev(recog, m, Math.max(0, target - cumRev));
          cumRev = Math.max(cumRev, target);
          cumCost += (ac2.forecast[m] || 0);
          target = eacA ? price * Math.min(1, cumCost / eacA) : 0;
          addRev(fcRev, m, Math.max(0, target - cumRev));
          cumRev = Math.max(cumRev, target);
        }
        if (price > cumRev && eacA) addRev(fcRev, monthOf(d.p.end_date), price - cumRev);
      }
    }
    for (const [m, v] of Object.entries(recog)) row(m).actualRevenue += v;
    for (const [m, v] of Object.entries(fcRev)) row(m).forecastRevenue += v;

    // WIP adjustments (FIN-038) reduce or increase recognised revenue.
    const adj = d.wipAdj.filter((x) => x.status === 'Approved');
    const writeDowns = sum(adj.filter((x) => x.kind === 'Write-down'), (x) => x.amount);
    const writeUps = sum(adj.filter((x) => x.kind === 'Write-up'), (x) => x.amount);
    for (const x of adj) row(x.period || monthOf(x.date)).actualRevenue += x.kind === 'Write-down' ? -Number(x.amount) : Number(x.amount);

    const recognised = sum(Object.values(recog)) - writeDowns + writeUps;
    const revenueForecastRemaining = sum(Object.values(fcRev));
    const eacRevenue = recognised + revenueForecastRemaining;

    // Billing (FIN-034, FIN-035) and WIP (FIN-037).
    const issued = d.invoices.filter((i) => ISSUED.includes(i.status));
    const invoicedToDate = sum(issued, (i) => i.amount);
    for (const i of issued) row(monthOf(i.issue_date || i.period_to || asAt)).invoiced += Number(i.amount) || 0;
    const billingForecast = billingSchedule(d, arrs, from);
    for (const b of billingForecast) row(monthOf(b.date)).billing += b.amount;
    const wip = Math.max(0, recognised - invoicedToDate);
    const billedInAdvance = Math.max(0, invoicedToDate - recognised);
    const ageing = wipAgeing(recog, adj, invoicedToDate, asAt);

    // EAC methods (FIN-020).
    const evm = earnedValue(d, { bac, ac, asAt, lines });
    const method = version?.eac_method || 'Bottom-up';
    const eacBottomUp = ac + etcBottomUp;
    const eacOptions = {
      'Bottom-up': eacBottomUp,
      'BAC ÷ CPI': evm.cpi ? bac / evm.cpi : null,
      'AC + (BAC − EV)': bac ? ac + (bac - evm.ev) : null,
      'AC + (BAC − EV) ÷ (CPI × SPI)': evm.cpi && evm.spi ? ac + (bac - evm.ev) / (evm.cpi * evm.spi) : null,
      Manual: version?.manual_eac ? Number(version.manual_eac) : null,
    };
    let eac = eacOptions[method] ?? eacBottomUp;
    if (opts.scenario?.eacFactor) eac *= opts.scenario.eacFactor;
    const etc = eac - ac;

    // Baseline margin and forecast margin.
    const baselineMargin = revenueBudget ? (revenueBudget - bac) / revenueBudget : null;
    const forecastMargin = eacRevenue ? (eacRevenue - eac) / eacRevenue : null;
    const contractValueP = projectContractValue(d);

    // Pending changes shown separately (CHG-006).
    const pending = d.changes.filter((c) => ['Submitted', 'Under assessment', 'Awaiting approval'].includes(c.status));
    // Time booked to work linked to unapproved changes is a commercial risk (CHG-008).
    const unapprovedChangeTasks = new Set(d.items.filter((t) => t.change_id && !['Approved', 'Implemented', 'Closed'].includes(d.changes.find((c) => c.id === t.change_id)?.status)).map((t) => t.id));
    const hoursOnUnapproved = sum(d.entries.filter((t) => unapprovedChangeTasks.has(t.task_id)), (t) => t.hours);

    // Burn rate: average weekly cost over the last four weeks.
    const weeks = fc.burnRateWeeks || 4;
    const since = addDays(asAt, -7 * weeks + 1);
    const recentCost = sum(valued.filter((t) => t.date >= since), (t) => t.cost) + sum([...expenses, ...supplier].filter((x) => x.date >= since && x.date <= asAt), (x) => x.amount);

    const out = {
      projectId, engagementId: d.p.engagement_id, asAt, model: projectModel(d), arrangements: arrs.map((a) => ({ key: a.key, label: a.label, model: a.model, price: a.price, cap: a.cap, fee: a.fee })),
      contractValue: contractValueP, bac, revenueBudget, budgetedMargin: baselineMargin, contingency, contingencyDrawn: drawn, contingencyRemaining: contingency - drawn,
      budgetApproved: Boolean(d.budget), budgetVersion: d.budget ? { id: d.budget.id, version_no: d.budget.version_no, label: d.budget.label } : null,
      ac, labourCost, expenseCost, supplierCost, hours, billableHours, pendingHours, standardValue,
      commitments: sum(d.commitments.filter((c) => c.status === 'Open'), (c) => c.amount),
      etc, eac, eacBottomUp, eacMethod: method, eacOptions, vac: bac ? bac - eac : null, budgetConsumedPct: div(ac, bac),
      recognised, writeDowns, writeUps, eacRevenue, forecastFeesAtCompletion: eacRevenue, feesToDate: recognised,
      invoicedToDate, remainingValue: contractValueP != null ? contractValueP - invoicedToDate : null,
      wip, billedInAdvance, wipAgeing: ageing,
      realisation: div(recognised, standardValue), effectiveRate: div(recognised, hours),
      baselineMargin, forecastMargin, marginErosion: baselineMargin != null && forecastMargin != null ? baselineMargin - forecastMargin : null,
      evm, burnRate: recentCost / weeks,
      pendingChanges: { count: pending.length, price: sum(pending, (c) => c.impact_price), cost: sum(pending, (c) => c.impact_cost), days: sum(pending, (c) => c.impact_schedule_days) },
      hoursOnUnapprovedChanges: hoursOnUnapproved, commercialRisk: hoursOnUnapproved > 0,
      months: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)),
      billingForecast, labourLines: labour, nonLabourLines: nonLabour, versionId: version?.id || null,
    };
    memo.set(key, out);
    return out;
  }

  function applyScenario(d, s, labour, nonLabour) {
    let L = labour.map((l) => ({ ...l, hours: l.hours * (s.hoursFactor || 1), cost: l.cost * (s.hoursFactor || 1), revenueValue: l.revenueValue * (s.hoursFactor || 1) }));
    let N = [...nonLabour];
    if (s.includePending) {
      for (const c of d.changes.filter((x) => ['Submitted', 'Under assessment', 'Awaiting approval'].includes(x.status))) {
        N.push({ month: monthOf(addDays(today(), 30)), category: 'Pending change', description: c.ref, cost: Number(c.impact_cost) || 0, revenue: Number(c.impact_price) || 0, source: 'scenario' });
      }
    }
    if (s.extensionMonths) {
      const last = monthOf(d.p.end_date);
      const lastMonth = L.filter((l) => l.month === last);
      for (let i = 1; i <= s.extensionMonths; i++) for (const l of lastMonth) L.push({ ...l, month: addMonths(last, i), source: 'scenario' });
    }
    return { labour: L, nonLabour: N };
  }

  // FIN-034: billing schedule — T&M monthly in arrears, retainers monthly, fixed price by instalment or
  // milestone billing events (progress billing when none are scheduled).
  function billingSchedule(d, arrs, from) {
    const out = [];
    const holidays = settings.holidays();
    const billedMonths = new Set(d.invoices.filter((i) => ISSUED.includes(i.status) || i.status === 'Approved').map((i) => monthOf(i.period_to || i.issue_date)));
    const hasEvents = d.billing.length > 0;
    for (const a of arrs) {
      if (a.model === 'T&M' || a.model === 'Capped T&M' || (a.model === 'Fixed price' && !hasEvents)) {
        for (const [m, v] of Object.entries(a.recog)) {
          if (billedMonths.has(m) || v <= 0.005) continue;
          out.push({ date: maxDate(nthBusinessDay(addMonths(m, 1), 1, holidays), from), amount: v, kind: 'T&M period', description: `${a.label}: ${m} (unbilled)` });
        }
        for (const [m, v] of Object.entries(a.fcRev)) if (v > 0.005) out.push({ date: nthBusinessDay(addMonths(m, 1), 1, holidays), amount: v, kind: a.model === 'Fixed price' ? 'Progress claim' : 'T&M period', description: `${a.label}: ${m} (forecast)` });
      } else if (a.model === 'Retainer') {
        for (const [m, v] of Object.entries(a.fcRev)) out.push({ date: monthStart(m), amount: v, kind: 'Recurring fee', description: `Retainer ${m}` });
      }
    }
    for (const b of d.billing.filter((x) => ['Planned', 'Ready to invoice'].includes(x.status))) out.push({ date: maxDate(b.planned_date, from), amount: Number(b.amount) || 0, kind: b.kind, description: b.description, id: b.id, status: b.status });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  // FIN-037: age unbilled revenue first-in-first-out against invoices.
  function wipAgeing(recog, adj, invoiced, asAt) {
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const months = Object.entries(recog).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ m, v }));
    for (const x of adj) {
      const r = months.find((y) => y.m === (x.period || monthOf(x.date)));
      if (r) r.v += x.kind === 'Write-down' ? -Number(x.amount) : Number(x.amount);
    }
    let left = invoiced;
    for (const r of months) {
      const take = Math.min(left, Math.max(0, r.v));
      r.v -= take;
      left -= take;
      if (r.v <= 0.005) continue;
      const age = diffDays(monthEnd(r.m) > asAt ? asAt : monthEnd(r.m), asAt);
      const b = age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '90+';
      buckets[b] += r.v;
    }
    return buckets;
  }

  // ---------- Earned value (FIN-029, FIN-030) ----------
  function earnedValue(d, { bac, ac, asAt, lines }) {
    const parents = new Set(d.items.map((t) => t.parent_id).filter(Boolean));
    const leaves = d.items.filter((t) => !parents.has(t.id) && !['Epic', 'Feature'].includes(t.kind));
    const weight = (t) => Number(t.budget_cost) || Number(t.effort_hours) || 1;
    const totalW = sum(leaves, weight) || 1;
    const earned = (t) => {
      const pct = Number(t.percent_complete) || 0;
      switch (t.earning_method) {
        case '0/100': return t.status === 'Done' ? 1 : 0;
        case '50/50': return t.status === 'Done' ? 1 : pct > 0 || t.status === 'In progress' ? 0.5 : 0;
        case 'Apportioned effort': {
          if (!t.start_date || !t.finish_date) return pct;
          const span = diffDays(t.start_date, t.finish_date) + 1;
          return Math.max(0, Math.min(1, (diffDays(t.start_date, asAt) + 1) / span));
        }
        default: return pct;
      }
    };
    const pctComplete = sum(leaves, (t) => weight(t) * earned(t)) / totalW;
    // PV from the time-phased budget, pro rata within the current month.
    let pv = 0;
    const am = monthOf(asAt);
    for (const l of lines.filter((x) => x.cost_type !== 'contingency')) {
      if (l.month < am) pv += Number(l.cost) || 0;
      else if (l.month === am) pv += (Number(l.cost) || 0) * (Number(asAt.slice(8, 10)) / daysInMonth(am));
    }
    if (!lines.length && bac && d.p.start_date && d.p.end_date) {
      const span = diffDays(d.p.start_date, d.p.end_date) + 1;
      pv = bac * Math.max(0, Math.min(1, (diffDays(d.p.start_date, asAt) + 1) / span));
    }
    const ev = bac * pctComplete;
    return {
      applies: Boolean(d.p.evm_required), pctComplete, pv, ev, ac, sv: ev - pv, cv: ev - ac,
      spi: pv ? ev / pv : null, cpi: ac ? ev / ac : null, tcpi: bac && bac - ac ? (bac - ev) / (bac - ac) : null,
      history: d.p.evm_history || [],
    };
  }

  // ---------- Roll-ups (FIN-012, FIN-021) ----------
  const ROLL = ['contractValue', 'bac', 'revenueBudget', 'ac', 'etc', 'eac', 'recognised', 'eacRevenue', 'invoicedToDate', 'wip', 'billedInAdvance', 'writeDowns', 'writeUps', 'hours', 'billableHours', 'standardValue', 'contingency', 'contingencyDrawn', 'commitments', 'burnRate', 'labourCost', 'expenseCost', 'supplierCost', 'pendingHours'];
  function rollup(positions) {
    const out = Object.fromEntries(ROLL.map((k) => [k, sum(positions, (p) => p[k])]));
    out.vac = out.bac ? out.bac - out.eac : null;
    out.budgetConsumedPct = div(out.ac, out.bac);
    out.baselineMargin = out.revenueBudget ? (out.revenueBudget - out.bac) / out.revenueBudget : null;
    out.forecastMargin = out.eacRevenue ? (out.eacRevenue - out.eac) / out.eacRevenue : null;
    out.marginErosion = out.baselineMargin != null && out.forecastMargin != null ? out.baselineMargin - out.forecastMargin : null;
    out.realisation = div(out.recognised, out.standardValue);
    out.forecastFeesAtCompletion = out.eacRevenue;
    out.feesToDate = out.recognised;
    out.remainingValue = out.contractValue - out.invoicedToDate;
    out.wipAgeing = ['0-30', '31-60', '61-90', '90+'].reduce((a, b) => ({ ...a, [b]: sum(positions, (p) => p.wipAgeing?.[b]) }), {});
    const pvs = sum(positions, (p) => p.evm?.pv), evs = sum(positions, (p) => p.evm?.ev);
    out.evm = { pv: pvs, ev: evs, ac: out.ac, spi: pvs ? evs / pvs : null, cpi: out.ac ? evs / out.ac : null };
    const months = {};
    for (const p of positions) for (const m of p.months || []) {
      const r = (months[m.month] ||= { month: m.month, budgetCost: 0, budgetRevenue: 0, actualCost: 0, actualRevenue: 0, forecastCost: 0, forecastRevenue: 0, billing: 0, invoiced: 0, hours: 0 });
      for (const k of Object.keys(r)) if (k !== 'month') r[k] += m[k] || 0;
    }
    out.months = Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
    out.pendingChanges = { count: sum(positions, (p) => p.pendingChanges?.count), price: sum(positions, (p) => p.pendingChanges?.price), cost: sum(positions, (p) => p.pendingChanges?.cost) };
    out.asAt = positions.map((p) => p.asAt).sort()[0] || null;
    return out;
  }

  // ---------- Purchase orders (ENG-005, BR-05, BR-13, FIN-027) ----------
  function poStatus(po, cache = {}) {
    const gst = F().gstRate;
    const funding = repos.funding.find({ engagement_id: po.engagement_id }).filter((f) => f.instrument_kind === 'po' && f.instrument_id === po.id);
    const factor = po.gst_basis === 'inclusive' ? 1 + gst : 1;
    const invoices = repos.invoice.find({ engagement_id: po.engagement_id }).filter((i) => i.po_id === po.id && ISSUED.includes(i.status));
    const invoiced = sum(invoices, (i) => i.amount);
    let unbilled = 0;
    const future = {};
    let plannedEnd = po.valid_to || null;
    for (const f of funding) {
      const pos = cache[f.project_id] || position(f.project_id);
      if (!pos) continue;
      const allPo = repos.funding.find({ engagement_id: po.engagement_id }).filter((x) => x.project_id === f.project_id && x.instrument_kind === 'po');
      const share = sum(allPo, (x) => x.amount) ? Number(f.amount) / sum(allPo, (x) => x.amount) : 1;
      unbilled += pos.wip * share;
      for (const b of pos.billingForecast) future[b.date] = (future[b.date] || 0) + b.amount * share;
      const pend = repos.project.get(f.project_id)?.end_date;
      if (pend && (!plannedEnd || pend > plannedEnd)) plannedEnd = pend;
    }
    const consumedEx = invoiced + unbilled;
    const consumed = consumedEx * factor;
    const value = Number(po.value) || 0;
    const consumedPct = value ? consumed / value : null;
    // Forecast exhaustion: walk the billing forecast until consumption reaches the PO value.
    let cum = consumed;
    let exhaustion = consumed >= value ? today() : null;
    for (const date of Object.keys(future).sort()) {
      if (exhaustion) break;
      const add = future[date] * factor;
      if (cum + add >= value) exhaustion = date;
      cum += add;
    }
    const thresholds = F().poAlerts;
    const crossed = thresholds.filter((t) => consumedPct >= t);
    return {
      id: po.id, number: po.number, value, gst_basis: po.gst_basis, invoiced: invoiced * factor, unbilled: unbilled * factor, consumed, consumedPct,
      remaining: value - consumed, exhaustionDate: exhaustion, plannedEnd, exhaustsBeforeEnd: Boolean(exhaustion && plannedEnd && exhaustion < plannedEnd),
      thresholdCrossed: crossed.length ? crossed.at(-1) : null, forecastAtCompletion: cum, valid_to: po.valid_to,
      fyLimits: Object.entries(po.fy_limits || {}).map(([fy, limit]) => ({ fy, limit: Number(limit), invoiced: sum(invoices.filter((i) => `FY${fyOf(i.issue_date || i.period_to)}` === fy || String(fyOf(i.issue_date || i.period_to)) === String(fy)), (i) => i.amount) * factor })),
    };
  }

  function engagementPosition(engagementId, opts = {}) {
    const projects = repos.project.find({ engagement_id: engagementId }).filter((p) => p.state !== 'Cancelled' || opts.includeCancelled);
    const positions = projects.map((p) => position(p.id)).filter(Boolean);
    const cache = Object.fromEntries(positions.map((p) => [p.projectId, p]));
    const roll = rollup(positions);
    const pos = repos.po.find({ engagement_id: engagementId }).filter((p) => p.status !== 'Closed').map((po) => poStatus(po, cache));
    const contracts = repos.contract.find({ engagement_id: engagementId }).filter((c) => c.kind !== 'Variation');
    const tcv = sum(contracts.filter((c) => c.status === 'Signed' && c.kind !== 'Master agreement reference'), (c) => contractValue(c));
    const original = sum(contracts.filter((c) => c.status === 'Signed' && c.kind !== 'Master agreement reference'), (c) => c.value);
    const poValue = sum(pos, (p) => p.value);
    const poConsumed = sum(pos, (p) => p.consumed);
    const earliest = pos.filter((p) => p.exhaustionDate).sort((a, b) => a.exhaustionDate.localeCompare(b.exhaustionDate))[0];
    return {
      ...roll, contractValue: tcv || roll.contractValue, originalContractValue: original, variations: tcv - original,
      remainingValue: (tcv || roll.contractValue) - roll.invoicedToDate,
      po: pos, poValue, poConsumed, poConsumedPct: poValue ? poConsumed / poValue : null, poRemaining: poValue - poConsumed,
      poExhaustionDate: earliest?.exhaustionDate || null, poExhaustionBeforeEnd: pos.some((p) => p.exhaustsBeforeEnd),
      projects: positions,
    };
  }

  // ---------- Hooks used by other modules ----------
  function onMilestoneAchieved(ctx, ms) {
    for (const b of repos.billing_event.find({ project_id: ms.project_id }).filter((x) => x.milestone_id === ms.id && x.status === 'Planned')) {
      app.entities.patch(ctx, 'billing_event', b.id, { status: 'Ready to invoice' }, 'Milestone achieved: ready to invoice (SCP-004)');
    }
  }
  function onDeliverableAccepted(ctx, del) {
    if (!del.billing_milestone_id) return;
    const ms = repos.milestone.get(del.billing_milestone_id);
    if (ms && !ms.actual_date) app.entities.patch(ctx, 'milestone', ms.id, { actual_date: del.actual_date || today() }, `Payment milestone achieved on acceptance of ${del.ref}`);
    else if (ms) onMilestoneAchieved(ctx, ms);
  }

  // FIN-038, FIN-044: write-downs route by delegation of financial authority.
  function requestWipApproval(ctx, adj) {
    const e = repos.engagement.get(adj.engagement_id);
    const tiers = settings.get('authority').writeDown;
    const amount = Number(adj.amount) || 0;
    const tier = tiers.find((t) => amount <= t.max) || tiers.at(-1);
    const approvers = tier.role === 'finance' ? app.memberships.globalUsers('finance') : tier.role === 'engagement_executive' ? [e.executive_id] : [e.manager_id];
    app.workflow.request(ctx, {
      kind: 'wip_adjustment', entity: 'wip_adjustment', entityId: adj.id, engagementId: adj.engagement_id, projectId: adj.project_id,
      title: `${adj.kind} of $${amount.toLocaleString('en-AU')} (${adj.reason_code})`, link: `/projects/${adj.project_id}/financials`,
      steps: [{ name: `${tier.role.replace('_', ' ')} approval (delegated authority up to ${Number.isFinite(tier.max) ? `$${tier.max.toLocaleString('en-AU')}` : 'any amount'})`, mode: 'any', approvers }],
    });
  }
  function requestDrawdownApproval(ctx, dd) {
    const e = repos.engagement.get(dd.engagement_id);
    app.workflow.request(ctx, {
      kind: 'drawdown', entity: 'drawdown', entityId: dd.id, engagementId: dd.engagement_id, projectId: dd.project_id,
      title: `${dd.reserve} drawdown $${Number(dd.amount).toLocaleString('en-AU')}`, link: `/projects/${dd.project_id}/financials`,
      steps: [{ name: dd.reserve === 'Management reserve' ? 'Engagement executive approval' : 'Engagement manager approval', mode: 'any', approvers: [dd.reserve === 'Management reserve' ? e.executive_id : e.manager_id] }],
    });
  }
  app.workflow.on('wip_adjustment', {
    onApprove: (ctx, apv) => app.entities.patch(ctx, 'wip_adjustment', apv.entity_id, { status: 'Approved' }, 'WIP adjustment approved'),
    onReject: (ctx, apv) => app.entities.patch(ctx, 'wip_adjustment', apv.entity_id, { status: 'Rejected' }, 'WIP adjustment rejected'),
  });
  app.workflow.on('drawdown', {
    onApprove: (ctx, apv) => app.entities.patch(ctx, 'drawdown', apv.entity_id, { status: 'Approved' }, 'Reserve drawdown approved'),
    onReject: (ctx, apv) => app.entities.patch(ctx, 'drawdown', apv.entity_id, { status: 'Rejected' }, 'Reserve drawdown rejected'),
  });

  // ---------- Period locking (FIN-041) ----------
  function lockPeriod(ctx, month) {
    if (!ctx.access.canGlobal('finance.periods')) throw forbidden('Finance locks periods.');
    if (month >= monthOf(today())) throw badRequest('Only past months can be locked.');
    const earlierOpen = periods().filter((p) => p.id < month && p.status !== 'locked');
    if (earlierOpen.length) throw badRequest(`Lock ${earlierOpen[0].id} first.`);
    const unapproved = repos.time_entries.find({}).filter((t) => monthOf(t.date) === month && t.status === 'Submitted').length;
    const cur = repos.periods.get(month);
    const rec = cur ? repos.periods.patch(month, { status: 'locked', locked_at: new Date().toISOString(), locked_by: ctx.user.id }, ctx.user.id)
      : repos.periods.insert({ id: month, status: 'locked', locked_at: new Date().toISOString(), locked_by: ctx.user.id }, ctx.user.id);
    app.audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'period-lock', entity: 'period', entityId: month, summary: `Locked financial period ${month}${unapproved ? ` with ${unapproved} unapproved entries (they will post to the next open period)` : ''}` });
    clearMemo();
    return rec;
  }
  function unlockPeriod(ctx, month) {
    if (!ctx.access.canGlobal('finance.periods')) throw forbidden();
    const later = periods().filter((p) => p.id > month && p.status === 'locked');
    if (later.length) throw badRequest(`Unlock ${later.at(-1).id} first.`);
    repos.periods.patch(month, { status: 'open' }, ctx.user.id);
    app.audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'period-unlock', entity: 'period', entityId: month, summary: `Reopened financial period ${month}` });
    clearMemo();
  }

  // ---------- Portfolio views ----------
  // FIN-025: revenue by month for the financial year, contracted vs signed-not-started vs weighted pipeline.
  function revenueForecast(ctx, fy = fyOf(today())) {
    const months = fyMonths(fy, F().fyStartMonth);
    const out = months.map((m) => ({ month: m, actual: 0, contracted: 0, unstarted: 0, pipeline: 0 }));
    const idx = Object.fromEntries(months.map((m, i) => [m, i]));
    for (const engId of ctx.access.visibleEngagementIds()) {
      const e = repos.engagement.get(engId);
      if (e.status === 'Closed') continue;
      for (const p of repos.project.find({ engagement_id: engId })) {
        if (['Cancelled'].includes(p.state)) continue;
        const pos = position(p.id);
        const unstarted = p.state === 'Proposed';
        for (const m of pos.months) {
          if (idx[m.month] === undefined) continue;
          out[idx[m.month]].actual += m.actualRevenue;
          out[idx[m.month]][unstarted ? 'unstarted' : 'contracted'] += m.forecastRevenue;
        }
      }
      for (const o of repos.opportunity.find({ engagement_id: engId }).filter((x) => x.status === 'Identified' || x.status === 'Passed to CRM')) {
        const start = monthOf(addDays(today(), 60));
        const spread = 6;
        for (let i = 0; i < spread; i++) {
          const m = addMonths(start, i);
          if (idx[m] !== undefined) out[idx[m]].pipeline += (Number(o.estimated_value) || 0) * (Number(o.probability) || 0.3) / spread;
        }
      }
    }
    for (const pl of db.prepare("SELECT data FROM imports WHERE json_extract(data, '$.kind') = 'crm-pipeline' AND deleted_at IS NULL").all().map((r) => JSON.parse(r.data))) {
      for (const o of pl.rows || []) {
        const m = monthOf(o.expected_start || today());
        const spread = Math.max(1, Number(o.months) || 6);
        for (let i = 0; i < spread; i++) {
          const mm = addMonths(m, i);
          if (idx[mm] !== undefined) out[idx[mm]].pipeline += (Number(o.value) || 0) * (Number(o.probability) || 0) / spread;
        }
      }
    }
    return { fy, months: out };
  }

  // FIN-040: cash receipts from the invoice forecast and payment terms; payments for third-party costs.
  function cashFlow(engagementIds) {
    const months = {};
    const row = (m) => (months[m] ||= { month: m, receipts: 0, payments: 0, net: 0 });
    for (const engId of engagementIds) {
      const e = repos.engagement.get(engId);
      const terms = Number(repos.client.get(e.client_id)?.payment_terms_days) || F().defaultPaymentTermsDays;
      for (const inv of repos.invoice.find({ engagement_id: engId }).filter((i) => ['Issued', 'Overdue', 'Sent to accounting'].includes(i.status))) {
        row(monthOf(maxDate(inv.due_date || addDays(inv.issue_date || today(), terms), today()))).receipts += Number(inv.total || inv.amount) || 0;
      }
      for (const p of repos.project.find({ engagement_id: engId })) {
        const pos = position(p.id);
        if (!pos) continue;
        for (const b of pos.billingForecast) row(monthOf(addDays(b.date, terms))).receipts += b.amount * (1 + F().gstRate);
        for (const l of pos.nonLabourLines) row(monthOf(addDays(monthEnd(l.month), 30))).payments += Number(l.cost) || 0;
        for (const x of repos.supplier_cost.find({ project_id: p.id }).filter((s) => s.date >= addDays(today(), -30))) row(monthOf(addDays(x.date, 30))).payments += Number(x.amount) || 0;
      }
    }
    const list = Object.values(months).filter((r) => r.month >= monthOf(today())).sort((a, b) => a.month.localeCompare(b.month)).slice(0, 12);
    let cum = 0;
    for (const r of list) { r.net = r.receipts - r.payments; cum += r.net; r.cumulative = cum; }
    return list;
  }

  // FIN-026: forecast accuracy — month revenue forecast in approved cycles vs actual.
  function forecastAccuracy(projectIds) {
    const rows = [];
    for (const pid of projectIds) {
      const pos = position(pid);
      const versions = repos.forecast_versions.find({ project_id: pid }).filter((v) => v.status === 'Approved' && v.kind === 'cycle');
      for (const m of pos.months.filter((x) => x.month < monthOf(today()) && x.actualRevenue)) {
        const v = versions.filter((x) => x.cycle_period && x.cycle_period < m.month).at(-1);
        const f = v?.snapshot?.months?.find((x) => x.month === m.month);
        if (!f) continue;
        const forecast = f.forecastRevenue || f.actualRevenue || 0;
        rows.push({ projectId: pid, month: m.month, forecast, actual: m.actualRevenue, accuracy: 1 - Math.abs(m.actualRevenue - forecast) / m.actualRevenue, manager: repos.engagement.get(repos.project.get(pid).engagement_id)?.manager_id });
      }
    }
    return rows;
  }

  // Debtors (FIN-036): receivables and debtor days.
  function debtors(engagementIds) {
    const invs = engagementIds.flatMap((id) => repos.invoice.find({ engagement_id: id })).filter((i) => ['Issued', 'Overdue', 'Disputed'].includes(i.status));
    const buckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const i of invs) {
      const over = i.due_date ? diffDays(i.due_date, today()) : 0;
      const k = over <= 0 ? 'current' : over <= 30 ? '1-30' : over <= 60 ? '31-60' : over <= 90 ? '61-90' : '90+';
      buckets[k] += Number(i.total || i.amount) || 0;
    }
    const receivables = sum(invs, (i) => i.total || i.amount);
    const since = addDays(today(), -90);
    const revenue90 = sum(engagementIds.flatMap((id) => repos.invoice.find({ engagement_id: id })).filter((i) => ISSUED.includes(i.status) && (i.issue_date || '') >= since), (i) => i.total || i.amount);
    return { receivables, buckets, debtorDays: revenue90 ? (receivables / revenue90) * 90 : null, invoices: invs };
  }

  return {
    postingPeriod, isLocked, latestLocked, periods, lockPeriod, unlockPeriod, contractValue, load, position, engagementPosition, rollup, poStatus,
    labourForecast, nonLabourForecast, approvedAsAt, valueEntries, arrangements, projectModel, revenueForecast, cashFlow, forecastAccuracy, debtors,
    onMilestoneAchieved, onDeliverableAccepted, requestWipApproval, requestDrawdownApproval, clearMemo, approvedVersion, latestVersion,
    availableHoursInRange, allocationHoursByMonth,
  };
}
