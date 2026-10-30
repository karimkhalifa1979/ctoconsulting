// Seed toolkit: a dated timeline replayed on the application clock, plus helpers that drive the real
// services (timesheets, status updates, approvals, invoices, forecast cycles, reports) as named users.
import { setClock, now } from '../../shared/clock.js';
import { addDays, addBusinessDays, weekStart, zonedToUtc, monthOf, monthEnd, addMonths, nthBusinessDay, diffDays, businessDaysBetween, isWeekend } from '../../shared/dates.js';
import { DIMENSIONS, worstRag } from '../../shared/rag.js';

// Small deterministic PRNG so the demo data is the same on every run.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const q4 = (h) => Math.max(0.25, Math.round(h * 4) / 4);

export function createKit(app, { T, users, people, log, onProgress = null }) {
  const { repos, entities, settings, auth } = app;
  const tz = settings.tz();
  const H = settings.holidays();
  const rnd = mulberry32(20261030);
  const events = [];
  let dirty = false;
  let seq = 0;

  // ---------- Timeline ----------
  // Events may schedule later events while the timeline runs; the queue stays in date order.
  const on = (date, time, label, fn) => { if (date && date <= T) { events.push({ date, time, label, fn, seq: seq++ }); dirty = true; } };
  const cmp = (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.seq - b.seq;

  async function run() {
    log(`Replaying ${events.length} dated events…`);
    for (let i = 0; i < events.length; i++) {
      if (dirty) { const rest = events.splice(i).sort(cmp); events.push(...rest); dirty = false; }
      const ev = events[i];
      // Lets a browser host repaint and show progress while the history replays.
      if (onProgress && i % 4 === 0) await onProgress(i / events.length, ev.label);
      let when = zonedToUtc(ev.date, ev.time, tz).getTime();
      const limit = Date.now() - (events.length - i) * 20; // never run an event in the future
      if (when > limit) when = limit;
      setClock(when);
      try {
        await ev.fn();
      } catch (err) {
        err.message = `Seed step "${ev.label}" (${ev.date} ${ev.time}): ${err.message}${err.details ? ` ${JSON.stringify(err.details)}` : ''}`;
        throw err;
      } finally {
        app.finance.clearMemo();
      }
    }
    setClock(null);
  }
  const at = (date, time = '09:00') => setClock(zonedToUtc(date, time, tz));

  // ---------- Dates ----------
  const bd = (start, n) => addBusinessDays(start, n, H);
  const bdays = (from, to) => businessDaysBetween(addDays(from, -1), to, H);
  const fridays = (from, to) => {
    const out = [];
    for (let d = addDays(weekStart(from), 4); d <= to; d = addDays(d, 7)) if (d >= from) out.push(d);
    return out;
  };
  const mondays = (from, to) => {
    const out = [];
    for (let d = weekStart(from); d <= to; d = addDays(d, 7)) if (d >= from) out.push(d);
    return out;
  };
  const monthsFrom = (fromMonth, toMonth) => {
    const out = [];
    for (let m = fromMonth; m <= toMonth; m = addMonths(m, 1)) out.push(m);
    return out;
  };

  // ---------- Users and contexts ----------
  const user = (key) => auth.getUser(users[key]);
  const as = (key) => app.contextFor(user(key), { ip: `10.20.0.${(Object.keys(users).indexOf(key) % 200) + 10}` });
  const sys = { system: true, user: null, access: app.access.contextFor(null), ip: 'seed' };

  function approve(key, entity, entityId, { comment = '', decision = 'approve', kind } = {}) {
    const apv = app.workflow.repo.find({ entity, entity_id: entityId, status: 'Pending' }).find((a) => !kind || a.kind === kind);
    if (!apv) throw new Error(`No pending ${kind || ''} approval for ${entity} ${entityId}`);
    return app.workflow.decide(as(key), apv.id, { decision, comment });
  }

  // ---------- Timesheets (TEX-001..004) ----------
  const tasksCache = new Map();
  function leafTasks(projectId) {
    const items = repos.work_item.find({ project_id: projectId });
    const parents = new Set(items.map((t) => t.parent_id).filter(Boolean));
    return items.filter((t) => !parents.has(t.id) && !['Epic', 'Feature'].includes(t.kind));
  }

  // Tasks the person can book to on a date: in progress on that date, preferring their own.
  function taskFor(projectId, date, personUserId, { real }) {
    const p = repos.project.get(projectId);
    let list = leafTasks(projectId).filter((t) => t.start_date <= date && (t.finish_date >= date || (t.status !== 'Done' && t.start_date <= date)));
    list = list.filter((t) => (real ? t.status !== 'Done' : !t.completed_at || t.completed_at >= date));
    if (!p.baseline_approved) list = list.filter((t) => t.initiation);
    const mine = list.filter((t) => (t.assignees || []).includes(personUserId));
    const pool = mine.length ? mine : list.filter((t) => !(t.assignees || []).length || p.manager_id === personUserId);
    if (!pool.length) return p.baseline_approved ? null : undefined;
    return pool[Math.floor(rnd() * pool.length)];
  }

  const factors = []; // { person, project, from, to, factor }
  const overrun = (personKey, projectId, from, to, factor) => factors.push({ person: people[personKey], project: projectId, from, to, factor });
  const factorFor = (personId, projectId, date) => factors.filter((f) => f.person === personId && f.project === projectId && f.from <= date && f.to >= date).reduce((a, f) => a * f.factor, 1);

  const WORK = { 'Project manager': 'Project management', Director: 'Project management', Partner: 'Quality review' };
  function personWeekLines(personKey, ws, { real = false } = {}) {
    const person = repos.person.get(people[personKey]);
    const hs = settings.holidays(person.location_state);
    const allocs = repos.allocation.find({ person_id: person.id }).filter((a) => a.start_date <= addDays(ws, 6) && a.end_date >= ws && a.status === 'Confirmed');
    if (!allocs.length) return [];
    const leave = repos.leave.find({ person_id: person.id });
    const lines = [];
    for (let i = 0; i < 5; i++) {
      const d = addDays(ws, i);
      if (d >= T && real) break;
      if (d > T) break;
      if (!allocs.some((a) => a.start_date <= d && a.end_date >= d)) continue;
      if (hs.has(d)) { lines.push({ date: d, code: 'PUBHOL', hours: 7.5 }); continue; }
      const lv = leave.find((l) => l.from <= d && l.to >= d);
      if (lv) { lines.push({ date: d, code: lv.kind === 'Personal' ? 'LEAVE-PL' : 'LEAVE-AL', hours: 7.5 }); continue; }
      for (const a of allocs.filter((x) => x.start_date <= d && x.end_date >= d)) {
        const p = repos.project.get(a.project_id);
        if (!['Initiation', 'In delivery', 'Stage boundary', 'Closing'].includes(p.state)) continue;
        const base = (Number(a.hours_per_week) / 5) * factorFor(person.id, p.id, d) * (0.95 + rnd() * 0.1);
        const task = taskFor(p.id, d, person.user_id, { real });
        if (task === undefined) continue; // pre-baseline and no initiation task: no time this day
        const pm = p.manager_id === person.user_id;
        lines.push({
          date: d, project_id: p.id, task_id: task?.id || null, hours: q4(base),
          work_type: pm ? 'Project management' : WORK[person.grade] || (task && /review|test/i.test(task.name) ? 'Quality review' : /workshop/i.test(task?.name || '') ? 'Workshop' : 'Delivery'),
          notes: rnd() < 0.08 ? 'Working session with the client team' : null,
        });
      }
    }
    return lines;
  }

  // Historic weeks are written directly in the shape the timesheet service produces.
  function bookHistoricWeek(ws) {
    const submitted = zonedToUtc(addDays(ws, 4), '16:30', tz).toISOString();
    const decided = now().toISOString(); // the event runs on the Monday after the week
    for (const key of Object.keys(people)) {
      const lines = personWeekLines(key, ws);
      if (!lines.length) continue;
      const person = repos.person.get(people[key]);
      for (const l of lines) {
        const p = l.project_id ? repos.project.get(l.project_id) : null;
        const e = p ? repos.engagement.get(p.engagement_id) : null;
        const approver = p ? [p.manager_id, e.manager_id, e.executive_id].find((u) => u && u !== person.user_id) : null;
        const task = l.task_id ? repos.work_item.get(l.task_id) : null;
        repos.time_entries.insert({
          person_id: person.id, user_id: person.user_id, date: l.date, project_id: l.project_id || null, engagement_id: p?.engagement_id || null, task_id: l.task_id || null,
          code: l.code || null, hours: l.hours, billable: l.code ? false : task ? task.billable !== false : true, work_type: l.work_type || null, notes: l.notes || null,
          status: 'Approved', period: app.finance.postingPeriod(l.date), submitted_at: submitted, approver_id: approver, decided_at: decided, locked: true,
          decision_comments: l.code ? 'Non-project time' : null,
        }, person.user_id);
      }
      repos.timesheets.insert({ person_id: person.id, user_id: person.user_id, week_start: ws, status: 'Approved', submitted_at: submitted, late_submission: rnd() < 0.04 }, person.user_id);
    }
    app.finance.clearMemo();
  }

  // Recent weeks go through the timesheet service: save, submit, then line approval.
  function submitWeek(key, ws) {
    const lines = personWeekLines(key, ws, { real: true });
    if (!lines.length) return null;
    app.time.saveWeek(as(key), { week_start: ws, entries: lines });
    return app.time.submitWeek(as(key), { week_start: ws });
  }
  function saveDraftWeek(key, ws) {
    const lines = personWeekLines(key, ws, { real: true });
    if (!lines.length) return null;
    return app.time.saveWeek(as(key), { week_start: ws, entries: lines });
  }
  function approveWeek(approverKey, ws, { exceptPeople = [] } = {}) {
    const queue = app.time.approvalQueue(as(approverKey));
    const skip = new Set(exceptPeople.map((k) => people[k]));
    const ids = queue.timesheets.filter((g) => g.week_start === ws && !skip.has(g.person_id)).flatMap((g) => g.lines.map((l) => l.id));
    if (ids.length) app.time.decide(as(approverKey), { approve: ids });
    return ids.length;
  }

  // ---------- Plan progress ----------
  // Physical % complete follows each task's current dates (slowed by any pace factor, for blocked
  // or struggling work); finished tasks are marked done.
  const paces = new Map();
  const pace = (taskId, factor) => paces.set(taskId, factor);
  function progress(projectId, date, pmKey) {
    const p = repos.project.get(projectId);
    if (!['In delivery', 'Stage boundary', 'Closing', 'Initiation'].includes(p.state)) return;
    for (const t of leafTasks(projectId)) {
      if (t.status === 'Done' || t.hold) continue;
      if (!t.start_date || t.start_date > date) continue;
      const total = Math.max(1, bdays(t.start_date, t.finish_date));
      const elapsed = Math.max(0, bdays(t.start_date, date));
      const pct = Math.min(1, (elapsed / total) * (paces.get(t.id) || 1));
      const target = t.finish_date <= date ? 1 : Math.round(pct * 20) / 20;
      if (target >= 1) entities.update(as(pmKey), 'work_item', t.id, { status: 'Done', percent_complete: 1, remaining_hours: 0 });
      else if (target > (Number(t.percent_complete) || 0) + 0.04) entities.update(as(pmKey), 'work_item', t.id, { status: 'In progress', percent_complete: target, remaining_hours: Math.round((1 - target) * (Number(t.effort_hours) || 0)) });
    }
  }

  // Cost accounts (FIN-030): the approved budget is spread over the leaf tasks by planned dates and
  // effort, so earned value tracks planned value when work runs to plan.
  function allocateBudget(projectId, pmKey) {
    const budget = repos.budget_versions.find({ project_id: projectId }).filter((b) => b.status === 'Approved').at(-1);
    if (!budget) return;
    const tasks = leafTasks(projectId).filter((t) => t.start_date && t.finish_date && !t.change_id);
    const share = new Map(tasks.map((t) => [t.id, 0]));
    const byMonth = {};
    for (const l of budget.lines.filter((x) => x.cost_type !== 'contingency')) byMonth[l.month] = (byMonth[l.month] || 0) + Number(l.cost || 0);
    for (const [m, cost] of Object.entries(byMonth)) {
      const from = `${m}-01`;
      const to = monthEnd(m);
      const weights = tasks.map((t) => {
        const s = t.start_date > from ? t.start_date : from;
        const f = t.finish_date < to ? t.finish_date : to;
        const days = s <= f ? bdays(s, f) : 0;
        return [t, days * ((Number(t.effort_hours) || 7.5) / Math.max(1, bdays(t.start_date, t.finish_date)))];
      });
      const total = weights.reduce((a, [, w]) => a + w, 0);
      if (!total) { const last = tasks.filter((t) => t.start_date <= to).at(-1) || tasks[0]; if (last) share.set(last.id, share.get(last.id) + cost); continue; }
      for (const [t, w] of weights) share.set(t.id, share.get(t.id) + (cost * w) / total);
    }
    for (const t of tasks) entities.update(as(pmKey), 'work_item', t.id, { budget_cost: Math.round(share.get(t.id)) });
  }

  // Builds a work breakdown: { key, name, kind, stage, parent, start, days, initiation, who, pred, effort }.
  function buildPlan(pmKey, projectId, spec, { start }) {
    const ids = {};
    const stages = repos.stage.find({ project_id: projectId });
    const stageId = (name) => (name ? stages.find((s) => s.name === name)?.id || null : null);
    let sort = 0;
    for (const t of spec) {
      const kids = spec.filter((c) => c.parent === t.key);
      const s = kids.length ? kids.map((c) => bd(start, c.start || 0)).sort()[0] : bd(start, t.start || 0);
      const f = kids.length ? kids.map((c) => bd(bd(start, c.start), c.days - 1)).sort().at(-1) : bd(s, (t.days || 1) - 1);
      const rec = entities.create(as(pmKey), 'work_item', {
        project_id: projectId, name: t.name, kind: t.kind || (kids.length ? 'Work package' : 'Task'), stage_id: stageId(t.stage), parent_id: t.parent ? ids[t.parent] : null,
        start_date: s, finish_date: f, effort_hours: kids.length ? null : t.effort ?? (t.days || 1) * 7.5 * Math.max(1, (t.who || []).length),
        assignees: (t.who || []).map((k) => users[k]), initiation: Boolean(t.initiation), sort: ++sort,
        predecessors: (t.pred || []).map((k) => ({ id: ids[k], type: 'FS', lag: 0 })).filter((x) => x.id),
        estimate_points: t.points, sprint_id: t.sprint || null, priority: t.priority, acceptance_criteria: t.ac, change_id: t.change || null, billable: t.billable ?? true,
      });
      ids[t.key] = rec.id;
    }
    return ids;
  }

  // ---------- Status updates (STS-001..011) ----------
  const GREEN_NOTE = {
    schedule: 'Key milestones on track against baseline.', budget: 'Spend in line with the approved budget.', scope: 'No scope changes pending.',
    risk: 'No Extreme risks or high-severity issues.', resource: 'Team fully allocated against the plan.', quality: 'Deliverables accepted first time.',
  };
  function statusNarrative(projectId, pe) {
    const ps = addDays(pe, -6);
    const items = leafTasks(projectId);
    const done = items.filter((t) => t.completed_at && t.completed_at >= ps && t.completed_at <= pe).map((t) => `Completed ${t.name.toLowerCase().startsWith('sprint') ? t.name : t.name.charAt(0).toLowerCase() + t.name.slice(1)}`);
    const ms = repos.milestone.find({ project_id: projectId }).filter((m) => m.actual_date && m.actual_date >= ps && m.actual_date <= pe).map((m) => `Milestone achieved: ${m.name}`);
    const dels = repos.deliverable.find({ project_id: projectId }).filter((d) => d.actual_date && d.actual_date >= ps && d.actual_date <= pe && d.status === 'Accepted').map((d) => `${d.title} accepted by the client`);
    const prog = items.filter((t) => t.status === 'In progress').slice(0, 3).map((t) => `Progressed ${t.name} to ${Math.round((Number(t.percent_complete) || 0) * 100)}%`);
    const next = items.filter((t) => t.status !== 'Done' && t.start_date <= addDays(pe, 10)).slice(0, 4).map((t) => (t.status === 'In progress' ? `Continue ${t.name}` : `Start ${t.name}`));
    const bullets = (xs) => xs.map((x) => `- ${x}`).join('\n');
    return {
      achievements: bullets([...ms, ...dels, ...done, ...prog].slice(0, 6)) || '- Work progressed to plan',
      next_period: bullets(next) || '- Continue delivery to plan',
    };
  }

  // Status preparation: review the RAID items that are due (RSK-006) and confirm milestone forecasts
  // (PLN-005). Items owned by someone else are left to their owner, so a few reviews do lapse.
  function prepareStatus(pmKey, projectId) {
    const today = now().toISOString().slice(0, 10);
    const pmUser = users[pmKey];
    for (const r of repos.risk.find({ project_id: projectId }).filter((x) => x.status === 'Open')) {
      const rec = entities.get(kit_ctx(pmKey), 'risk', r.id);
      if (rec.next_review && rec.next_review <= addDays(today, 3) && (r.owner_id === pmUser || r.actionee_id === pmUser)) act(pmKey, 'risk', r.id, 'review', { comment: 'Reviewed at the weekly status update' });
    }
    for (const r of repos.issue.find({ project_id: projectId }).filter((x) => !['Resolved', 'Closed'].includes(x.status) && x.owner_id === pmUser)) {
      const last = r.last_reviewed || r.raised_date;
      if (!last || diffDays(last, today) >= 6) entities.update(as(pmKey), 'issue', r.id, { last_reviewed: today });
    }
    for (const m of repos.milestone.find({ project_id: projectId }).filter((x) => !x.actual_date && x.forecast_updated && diffDays(x.forecast_updated, today) >= 14)) act(pmKey, 'milestone', m.id, 'confirm_forecast');
  }
  const kit_ctx = (key) => as(key);

  // PM drafts and submits the update with the calculated ratings unless told otherwise; EM approves.
  function statusUpdate(pmKey, projectId, pe, { ratings = {}, narrative = {}, summary, submit = true, late = false, commentary = {} } = {}) {
    prepareStatus(pmKey, projectId);
    let su = app.status.open(as(pmKey), projectId, pe);
    const sugg = su.system_data.suggested;
    const out = {};
    for (const d of DIMENSIONS.map((x) => x.key)) {
      const s = sugg[d];
      const chosen = ratings[d]?.rag || s.rag;
      out[d] = {
        rag: chosen,
        commentary: commentary[d] || ratings[d]?.commentary || (chosen === 'Green' ? GREEN_NOTE[d] : `${s.reasons.join('; ')}.`),
        justification: ratings[d]?.justification || '',
      };
    }
    const overall = ratings.overall?.rag || worstRag(...Object.values(out).map((x) => x.rag));
    const better = (a, b) => ['Green', 'Amber', 'Red'].indexOf(a) < ['Green', 'Amber', 'Red'].indexOf(b);
    const overallWhy = ratings.overall?.justification || (better(overall, sugg.overall.rag) ? Object.values(out).map((x) => x.justification).filter(Boolean).join(' ') : '');
    out.overall = { rag: overall, commentary: ratings.overall?.commentary || '', justification: overallWhy };
    const p = repos.project.get(projectId);
    const auto = statusNarrative(projectId, pe);
    su = app.status.save(as(pmKey), su.id, {
      executive_summary: summary || `${p.name} is ${overall.toLowerCase()} overall this week. ${overall === 'Green' ? 'Delivery is on track against the baseline.' : `Attention: ${DIMENSIONS.filter((x) => out[x.key].rag !== 'Green').map((x) => x.label.toLowerCase()).join(', ')}.`}`,
      achievements: auto.achievements, next_period: auto.next_period, decisions_required: '', escalations: '', client_actions: '',
      ...narrative, ratings: out,
    });
    if (!submit) return su;
    void late;
    return app.status.submit(as(pmKey), su.id);
  }

  // ---------- Invoices (FIN-034..036) ----------
  async function invoice(projectId, periodTo, { finance = 'daniel', em, emAfterHours = 3, issueAfterDays = 1, paidAfterDays = null, draftDate }) {
    let inv;
    try {
      inv = app.billing.draft(as(finance), { project_id: projectId, period_to: periodTo });
    } catch (err) {
      if (/nothing to invoice/i.test(err.message)) return null;
      throw err;
    }
    await app.billing.act(as(finance), inv.id, 'submit');
    const ref = { id: inv.id };
    on(draftDate, addHours('10:00', emAfterHours), 'Invoice EM review', async () => { await app.billing.act(as(em), ref.id, 'em_approve', { comment: 'Checked against the timesheet extract.' }); });
    const issueOn = bd(draftDate, issueAfterDays);
    on(issueOn, '10:30', 'Invoice approve and issue', async () => {
      await app.billing.act(as(finance), ref.id, 'finance_approve');
      inv = await app.billing.act(as(finance), ref.id, 'send');
    });
    if (paidAfterDays != null) {
      const paid = addDays(issueOn, paidAfterDays);
      on(isWeekend(paid) ? bd(paid, 1) : paid, '11:15', 'Invoice paid', async () => { await app.billing.act(as(finance), ref.id, 'mark_paid', { date: isWeekend(paid) ? bd(paid, 1) : paid }); });
    }
    return ref;
  }
  const addHours = (hhmm, h) => { const [a, b] = hhmm.split(':').map(Number); return `${String(Math.min(23, a + h)).padStart(2, '0')}:${String(b).padStart(2, '0')}`; };

  // ---------- Deliverables (SCP-002, SCP-003, QLT-003, QLT-004) ----------
  // Record actions run synchronously here (the service wraps them in a promise), so a failure stops
  // the seed at the step that caused it.
  function act(key, entity, id, action, body = {}) {
    const ctx = as(key);
    const d = entities.def(entity);
    const fn = entities.hooks[entity]?.actions?.[action];
    if (!fn) throw new Error(`Unknown action ${entity}.${action}`);
    const rec = entities.repos[entity].get(id);
    if (!rec || !entities.canRead(ctx, d, rec)) throw new Error(`${d.label} not found for ${key}`);
    const locked = entities.lockedReason(d, rec);
    if (locked && !fn.allowLocked) throw new Error(locked);
    return fn(ctx, rec, body, { def: d });
  }
  function qualityReview(pmKey, deliverableId, { kind = 'Peer review', reviewer, planned, actual = null, result = 'Pending', findings = [] }) {
    const d = repos.deliverable.get(deliverableId);
    return entities.create(as(pmKey), 'quality_review', { project_id: d.project_id, deliverable_id: d.id, kind, reviewer_id: users[reviewer], planned_date: planned, actual_date: actual, result, findings });
  }

  // ---------- Forecast cycle (FIN-022, UC-05) ----------
  function forecastCycle(period, { pmCommentary = () => 'Actuals rolled forward; labour forecast regenerated from confirmed allocations.', queryFor = () => null, emOf, pmOf }) {
    const dl = app.forecast.cycleDeadlines(period);
    const state = {};
    on(dl.open, '10:00', `Open forecast cycle ${period}`, () => { state.cycle = app.forecast.openCycle(as('daniel'), period); });
    on(dl.pm, '15:00', `PM forecasts ${period}`, () => {
      for (const v of repos.forecast_versions.find({ cycle_id: state.cycle.id })) {
        const pm = pmOf(v.project_id);
        app.forecast.save(as(pm), v.id, { commentary: pmCommentary(v.project_id, period) });
        app.forecast.submitPM(as(pm), v.id);
      }
    });
    on(dl.em, '15:00', `EM forecasts ${period}`, () => {
      const engs = [...new Set(repos.forecast_versions.find({ cycle_id: state.cycle.id }).map((v) => v.engagement_id))];
      for (const id of engs) app.forecast.submitEM(as(emOf(id)), { cycle_id: state.cycle.id, engagement_id: id, commentary: 'Reviewed project forecasts and roll-up; movements explained in project commentary.' });
    });
    on(dl.finance, '14:00', `Finance review ${period}`, () => {
      for (const v of repos.forecast_versions.find({ cycle_id: state.cycle.id })) {
        const qtext = queryFor(v.project_id);
        app.forecast.financeDecision(as('daniel'), v.id, qtext ? { decision: 'query', comment: qtext } : { decision: 'approve', comment: 'Approved.' });
      }
    });
    return state;
  }

  // ---------- Reports (RPT-028..046) ----------
  async function weeklyReport(emKey, engagementId, pe, { narrative, approver, pdf, pair, internalTemplateId, issue = true }) {
    const out = await app.reports.generate(as(emKey), {
      engagement_id: engagementId, scope: 'all', report_type: 'Weekly status', audience: 'client', period_end: pe, narrative, proceed: true,
      formats: pdf ? ['docx', 'pdf'] : ['docx'], pair: Boolean(pair), internal_template_id: internalTemplateId,
    });
    const r = out.report;
    if (!issue) return r;
    if (approver) {
      app.reports.submitForReview(as(emKey), r.id);
      approve(approver, 'report', r.id, { comment: 'Approved for issue.' });
    }
    await app.reports.issue(as(emKey), r.id, { distribute: true, channel: 'attachment' });
    if (out.pair) await app.reports.issue(as(emKey), out.pair.id, { distribute: false });
    return r;
  }

  return {
    on, run, at, bd, bdays, fridays, mondays, monthsFrom, rnd, H, tz,
    user, as, sys, approve, act,
    personWeekLines, bookHistoricWeek, submitWeek, saveDraftWeek, approveWeek, overrun, leafTasks,
    progress, pace, buildPlan, allocateBudget, statusUpdate, statusNarrative, invoice, qualityReview, forecastCycle, weeklyReport,
    monthOf, monthEnd, addMonths, nthBusinessDay, diffDays, tasksCache,
  };
}
