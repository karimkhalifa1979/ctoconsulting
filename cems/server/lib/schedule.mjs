// Scheduling (PLN-001..016): WBS numbering, dependency scheduling with FS/SS/FF/SF and lags,
// critical path and total float, slippage flags, four-week look-ahead and percent complete.
import { addBusinessDays, businessDayDiff, isBusinessDay, addDays, todayIn } from '../../shared/dates.js';

// Business-day index helpers: tasks are scheduled on working days.
function toWorking(date, holidays) {
  let d = date;
  while (!isBusinessDay(d, holidays)) d = addDays(d, 1);
  return d;
}

export function wbsNumbers(items) {
  const byParent = new Map();
  for (const it of items) {
    const key = it.parent_id || `stage:${it.stage_id || ''}`;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(it);
  }
  const sorter = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.start_date || '').localeCompare(String(b.start_date || '')) || String(a.name).localeCompare(String(b.name));
  const out = new Map();
  const stageKeys = [...new Set(items.filter((i) => !i.parent_id).map((i) => i.stage_id || ''))];
  const walk = (parentKey, prefix) => {
    (byParent.get(parentKey) || []).sort(sorter).forEach((it, i) => {
      const code = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      out.set(it.id, code);
      walk(it.id, code);
    });
  };
  stageKeys.forEach((s, i) => walk(`stage:${s}`, String(i + 1)));
  return out;
}

// Critical path method. Tasks keep their planned dates as "start no earlier than" constraints;
// dependencies push successors later. Returns early/late dates, total float and critical flags.
export function criticalPath(items, holidays) {
  const tasks = items.filter((t) => t.start_date && t.finish_date && !['Epic', 'Feature'].includes(t.kind));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const parents = new Set(items.map((t) => t.parent_id).filter(Boolean));
  const leaves = tasks.filter((t) => !parents.has(t.id));
  const dur = (t) => Math.max(0, businessDayDiff(toWorking(t.start_date, holidays), toWorking(t.finish_date, holidays), holidays)) + 1;

  // Topological order (Kahn); cycles are reported, not looped.
  const preds = new Map(leaves.map((t) => [t.id, (t.predecessors || []).filter((p) => byId.has(p.id) && !parents.has(p.id))]));
  const succ = new Map(leaves.map((t) => [t.id, []]));
  for (const [id, ps] of preds) for (const p of ps) succ.get(p.id)?.push({ id, type: p.type || 'FS', lag: Number(p.lag) || 0 });
  const indeg = new Map(leaves.map((t) => [t.id, preds.get(t.id).length]));
  const queue = leaves.filter((t) => !indeg.get(t.id)).map((t) => t.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const s of succ.get(id) || []) {
      indeg.set(s.id, indeg.get(s.id) - 1);
      if (!indeg.get(s.id)) queue.push(s.id);
    }
  }
  const cycle = order.length < leaves.length ? leaves.filter((t) => !order.includes(t.id)).map((t) => t.id) : [];

  const ES = new Map(), EF = new Map();
  for (const id of order) {
    const t = byId.get(id);
    const d = dur(t);
    let es = toWorking(t.start_date, holidays);
    for (const p of preds.get(id)) {
      if (!EF.has(p.id)) continue;
      const lag = Number(p.lag) || 0;
      const type = p.type || 'FS';
      let candidate;
      if (type === 'FS') candidate = addBusinessDays(EF.get(p.id), 1 + lag, holidays);
      else if (type === 'SS') candidate = addBusinessDays(ES.get(p.id), lag, holidays);
      else if (type === 'FF') candidate = addBusinessDays(addBusinessDays(EF.get(p.id), lag, holidays), -(d - 1), holidays);
      else candidate = addBusinessDays(addBusinessDays(ES.get(p.id), lag, holidays), -(d - 1), holidays); // SF
      if (candidate > es) es = candidate;
    }
    ES.set(id, es);
    EF.set(id, addBusinessDays(es, d - 1, holidays));
  }
  const projectEnd = [...EF.values()].sort().at(-1);
  const LS = new Map(), LF = new Map();
  for (const id of [...order].reverse()) {
    const t = byId.get(id);
    const d = dur(t);
    let lf = projectEnd;
    for (const s of succ.get(id) || []) {
      if (!LS.has(s.id)) continue;
      let candidate;
      if (s.type === 'FS') candidate = addBusinessDays(LS.get(s.id), -(1 + s.lag), holidays);
      else if (s.type === 'SS') candidate = addBusinessDays(addBusinessDays(LS.get(s.id), -s.lag, holidays), d - 1, holidays);
      else if (s.type === 'FF') candidate = addBusinessDays(LF.get(s.id), -s.lag, holidays);
      else candidate = addBusinessDays(addBusinessDays(LF.get(s.id), -s.lag, holidays), d - 1, holidays); // SF
      if (candidate < lf) lf = candidate;
    }
    LF.set(id, lf);
    LS.set(id, addBusinessDays(lf, -(d - 1), holidays));
  }
  const result = new Map();
  for (const id of order) {
    const float = businessDayDiff(ES.get(id), LS.get(id), holidays);
    result.set(id, {
      early_start: ES.get(id), early_finish: EF.get(id), late_start: LS.get(id), late_finish: LF.get(id),
      total_float: float, critical: float <= 0, pushed: ES.get(id) > toWorking(byId.get(id).start_date, holidays),
    });
  }
  return { tasks: result, projectEnd, cycle };
}

export function createSchedule(app) {
  const { repos, settings } = app;
  const today = () => todayIn(settings.tz());

  // PLN-005/PLN-014 milestone status.
  function milestoneStatus(m, onDate) {
    if (m.actual_date) return 'Achieved';
    const due = m.forecast_date || m.planned_date;
    if (due && due < onDate) return 'Missed';
    if (m.baseline_date && m.forecast_date && m.forecast_date > m.baseline_date) return 'Forecast late';
    if (m._at_risk) return 'At risk';
    return 'On track';
  }

  // Full plan for a project: WBS codes, roll-ups, critical path and slippage flags.
  function plan(projectId) {
    const holidays = settings.holidays();
    const items = repos.work_item.find({ project_id: projectId });
    const stages = repos.stage.find({ project_id: projectId }).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    const stageOrder = new Map(stages.map((s, i) => [s.id, i]));
    const sortedItems = [...items].sort((a, b) => (stageOrder.get(a.stage_id) ?? 99) - (stageOrder.get(b.stage_id) ?? 99) || (a.sort ?? 0) - (b.sort ?? 0));
    const wbs = wbsNumbers(sortedItems);
    const cpm = criticalPath(items, holidays);
    const now = today();
    const children = new Map();
    for (const it of items) if (it.parent_id) { if (!children.has(it.parent_id)) children.set(it.parent_id, []); children.get(it.parent_id).push(it); }
    const weight = (t) => Number(t.effort_hours) || Math.max(1, businessDayDiff(t.start_date || now, t.finish_date || now, holidays) + 1) * 7.5;
    // Roll-up: summary items take the effort-weighted % complete and date span of their children.
    const rolled = new Map();
    const roll = (it) => {
      if (rolled.has(it.id)) return rolled.get(it.id);
      const kids = children.get(it.id) || [];
      if (!kids.length) {
        const r = { start: it.start_date, finish: it.finish_date, pct: Number(it.percent_complete) || 0, w: weight(it), effort: Number(it.effort_hours) || 0 };
        rolled.set(it.id, r);
        return r;
      }
      const rs = kids.map(roll);
      const w = rs.reduce((a, r) => a + r.w, 0) || 1;
      const r = {
        start: rs.map((x) => x.start).filter(Boolean).sort()[0] || it.start_date,
        finish: rs.map((x) => x.finish).filter(Boolean).sort().at(-1) || it.finish_date,
        pct: rs.reduce((a, x) => a + x.pct * x.w, 0) / w, w, effort: rs.reduce((a, x) => a + x.effort, 0),
      };
      rolled.set(it.id, r);
      return r;
    };
    const out = sortedItems.map((it) => {
      const r = roll(it);
      const c = cpm.tasks.get(it.id);
      const summary = (children.get(it.id) || []).length > 0;
      const overdue = !summary && it.status !== 'Done' && it.finish_date && it.finish_date < now;
      const slip = it.baseline_finish && (summary ? r.finish : it.finish_date) ? businessDayDiff(it.baseline_finish, summary ? r.finish : it.finish_date, holidays) : null;
      return {
        ...it, wbs: wbs.get(it.id), summary, rollup_start: r.start, rollup_finish: r.finish, rollup_pct: r.pct,
        ...(c || {}), overdue, finish_variance_days: slip,
      };
    });
    const leaves = out.filter((x) => !x.summary);
    const totalW = leaves.reduce((a, t) => a + weight(t), 0) || 1;
    const percent = leaves.reduce((a, t) => a + (Number(t.percent_complete) || 0) * weight(t), 0) / totalW;

    // Milestones put at risk by late predecessors or dependencies (PLN-014, ENG-008).
    const deps = repos.dependency.find({ engagement_id: repos.project.get(projectId)?.engagement_id }).filter((d) => ['Open', 'At risk'].includes(d.status));
    const milestones = repos.milestone.find({ project_id: projectId }).map((m) => {
      const due = m.forecast_date || m.planned_date;
      const latePreds = (m.predecessors || []).map((id) => out.find((t) => t.id === id)).filter((t) => t && t.status !== 'Done' && ((t.early_finish && t.early_finish > due) || (t.finish_date && t.finish_date > due) || t.overdue));
      const lateDeps = deps.filter((d) => (d.milestone_ids || []).includes(m.id) && (d.status === 'At risk' || (d.need_by && d.need_by < now) || (d.need_by && due && d.need_by > due)));
      const atRisk = !m.actual_date && (latePreds.length > 0 || lateDeps.length > 0);
      const rec = { ...m, _at_risk: atRisk };
      const status = milestoneStatus(rec, now);
      const variance = m.baseline_date && due ? businessDayDiff(m.baseline_date, m.actual_date || due, holidays) : null;
      return { ...m, status, variance_days: variance, at_risk_reasons: [...latePreds.map((t) => `Predecessor "${t.name}" is late`), ...lateDeps.map((d) => `Dependency ${d.ref} ${d.status === 'At risk' ? 'at risk' : 'overdue'}`)] };
    }).sort((a, b) => String(a.forecast_date || a.planned_date).localeCompare(String(b.forecast_date || b.planned_date)));

    const flags = [
      ...milestones.filter((m) => m.status === 'Forecast late').map((m) => ({ kind: 'milestone-late', text: `Milestone "${m.name}" forecast ${m.variance_days} business days after baseline`, id: m.id })),
      ...milestones.filter((m) => m.status === 'Missed').map((m) => ({ kind: 'milestone-missed', text: `Milestone "${m.name}" missed`, id: m.id })),
      ...milestones.filter((m) => m.status === 'At risk').map((m) => ({ kind: 'milestone-risk', text: `Milestone "${m.name}" at risk: ${m.at_risk_reasons.join('; ')}`, id: m.id })),
      ...out.filter((t) => t.overdue).map((t) => ({ kind: 'task-overdue', text: `Task ${t.wbs} "${t.name}" overdue (finish ${t.finish_date})`, id: t.id })),
      ...(cpm.cycle.length ? [{ kind: 'cycle', text: 'Dependency loop detected; check predecessors' }] : []),
    ];
    return { items: out, stages, milestones, percent, projectEnd: cpm.projectEnd, cycle: cpm.cycle, flags };
  }

  // PLN-016 four-week look-ahead.
  function lookahead(projectId, from = today(), weeks = 4) {
    const to = addDays(from, weeks * 7);
    const p = plan(projectId);
    const inWindow = (d) => d && d >= from && d <= to;
    return {
      from, to,
      tasks: p.items.filter((t) => !t.summary && t.status !== 'Done' && (inWindow(t.start_date) || inWindow(t.finish_date) || (t.start_date <= from && t.finish_date >= from))),
      milestones: p.milestones.filter((m) => !m.actual_date && inWindow(m.forecast_date || m.planned_date)),
      deliverables: repos.deliverable.find({ project_id: projectId }).filter((d) => !['Accepted', 'Withdrawn'].includes(d.status) && inWindow(d.forecast_date || d.planned_date)),
    };
  }

  // Applies the critical-path early dates to tasks that dependencies push later ("Reschedule").
  function reschedulePreview(projectId) {
    const p = plan(projectId);
    return p.items.filter((t) => t.pushed).map((t) => ({ id: t.id, name: t.name, from: [t.start_date, t.finish_date], to: [t.early_start, t.early_finish] }));
  }

  return { plan, lookahead, milestoneStatus, reschedulePreview };
}
