// Time and expenses (TEX-001..010, BR-08, BR-09): weekly timesheets, validation, line-level approval
// by the project manager (engagement manager as alternate, delegates during leave), locking, controlled
// adjustments and expense approval.
import { addDays, weekStart, todayIn, zonedToUtc, dayOfWeek } from '../../shared/dates.js';
import { LISTS } from '../../shared/defaults.js';
import { badRequest, forbidden, unprocessable } from '../http.mjs';
import { nowIso } from '../db.mjs';
import { now as clockNow } from '../../shared/clock.js';

const OPEN_STATES = ['In delivery', 'Stage boundary', 'Closing', 'On hold', 'Initiation', 'Proposed'];

export function createTime(app) {
  const { repos, settings, audit, notify, entities, finance } = app;
  const today = () => todayIn(settings.tz());
  const codes = () => settings.get('lists').nonProjectCodes || LISTS.nonProjectCodes;
  const cfg = () => settings.get('timesheets');

  function personFor(user) {
    return repos.person.findOne({ user_id: user.id });
  }

  // Deadline: Monday 10:00 local time after the week (TEX-003).
  function deadline(ws) {
    const c = cfg();
    const due = addDays(ws, 7 + ((c.deadlineDow - 1 + 7) % 7));
    return zonedToUtc(due, c.deadlineTime, settings.tz()).toISOString();
  }

  function timesheet(personId, ws) {
    return repos.timesheets.findOne({ person_id: personId, week_start: ws });
  }

  // Projects and tasks the person may book to this week (TEX-001), with closure and baseline rules.
  function timeCodes(person, ws) {
    const we = addDays(ws, 6);
    const allocs = repos.allocation.find({ person_id: person.id }).filter((a) => a.start_date <= we && a.end_date >= ws);
    const memberEngs = person.user_id ? app.memberships.forUser(person.user_id).map((m) => m.engagement_id) : [];
    const projectIds = new Set(allocs.map((a) => a.project_id));
    for (const engId of memberEngs) for (const p of repos.project.find({ engagement_id: engId })) if (OPEN_STATES.includes(p.state)) projectIds.add(p.id);
    const out = [];
    for (const pid of projectIds) {
      const p = repos.project.get(pid);
      if (!p) continue;
      const e = repos.engagement.get(p.engagement_id);
      const closed = !OPEN_STATES.includes(p.state) || p.time_codes_closed;
      const preBaseline = !p.baseline_approved;
      const tasks = repos.work_item.find({ project_id: pid }).filter((t) => !['Epic', 'Feature'].includes(t.kind));
      const parents = new Set(tasks.map((t) => t.parent_id).filter(Boolean));
      out.push({
        project_id: p.id, project: p.name, code: p.code, engagement: e?.name, engagement_id: e?.id, client: repos.client.get(e?.client_id)?.trading_name || repos.client.get(e?.client_id)?.legal_name,
        state: p.state, closed, preBaseline, allocated: allocs.some((a) => a.project_id === p.id),
        tasks: tasks.filter((t) => !parents.has(t.id)).map((t) => ({
          id: t.id, name: t.name, assigned: (t.assignees || []).includes(person.user_id) || (t.assignees || []).includes(person.id),
          closed: t.status === 'Done', initiation: Boolean(t.initiation), billable: t.billable !== false, change_id: t.change_id || null,
        })),
      });
    }
    return out.sort((a, b) => String(a.project).localeCompare(String(b.project)));
  }

  // TEX-005 and BR-08 validation. Returns { errors, warnings } keyed by entry index.
  function validateWeek(person, ws, entries, codesList) {
    const c = cfg();
    const errors = {}, warnings = {};
    const add = (bag, i, msg) => { (bag[i] ||= []).push(msg); };
    const currentWeekEnd = addDays(weekStart(today()), 6);
    const byDay = {};
    const projectChecks = new Map();
    entries.forEach((e, i) => {
      if (!e.date || e.date < ws || e.date > addDays(ws, 6)) add(errors, i, 'Date is outside this week');
      if (e.date > currentWeekEnd) add(errors, i, 'Time cannot be recorded for future weeks (BR-08)');
      const h = Number(e.hours);
      if (!(h > 0) || h > 24) add(errors, i, 'Enter hours between 0 and 24');
      byDay[e.date] = (byDay[e.date] || 0) + (h || 0);
      if (e.code) {
        if (!codes().some((x) => x.code === e.code)) add(errors, i, 'Unknown time code');
        return;
      }
      const tc = codesList.find((x) => x.project_id === e.project_id);
      if (!tc) { add(errors, i, 'You have no time code for this project'); return; }
      if (tc.closed) { add(errors, i, `${tc.project} is closed to time (BR-08)`); return; }
      const task = e.task_id ? tc.tasks.find((t) => t.id === e.task_id) : null;
      if (e.task_id && !task) add(errors, i, 'Task not found in this project');
      if (task?.closed) add(errors, i, `Task "${task.name}" is closed`);
      if (tc.preBaseline && c.preBaselineInitiationOnly && !task?.initiation) add(errors, i, 'Until the baseline is approved, only initiation tasks accept time (UC-01)');
      const mode = (k) => c.validation?.[k] || 'warn';
      if (task && !task.assigned) add(mode('unassignedTask') === 'block' ? errors : warnings, i, `You are not assigned to "${task.name}"`);
      if (task?.change_id) {
        const ch = repos.change.get(task.change_id);
        if (ch && !['Approved', 'Implemented', 'Closed'].includes(ch.status)) add(warnings, i, `Work linked to unapproved change ${ch.ref} is a commercial risk (CHG-008)`);
      }
      if (!projectChecks.has(e.project_id)) {
        const pos = finance.position(e.project_id);
        const poOver = (pos ? app.repos.funding.find({ engagement_id: tc.engagement_id }).filter((f) => f.project_id === e.project_id && f.instrument_kind === 'po') : [])
          .map((f) => finance.poStatus(app.repos.po.get(f.instrument_id))).find((p) => p.consumedPct >= 1);
        projectChecks.set(e.project_id, { pos, poOver });
      }
      const { pos, poOver } = projectChecks.get(e.project_id);
      if (pos?.bac && pos.ac >= pos.bac) add(mode('beyondBudget') === 'block' ? errors : warnings, i, 'The project has used its budget');
      if (poOver) add(mode('beyondPo') === 'block' ? errors : warnings, i, `PO ${poOver.number} is fully consumed`);
    });
    entries.forEach((e, i) => {
      if (byDay[e.date] > c.dailyMaxHours) add((c.validation?.aboveDailyMax || 'warn') === 'block' ? errors : warnings, i, `More than ${c.dailyMaxHours} hours on ${e.date} (TEX-005)`);
    });
    return { errors, warnings };
  }

  function week(ctx, ws, personId) {
    const person = personId ? repos.person.get(personId) : personFor(ctx.user);
    if (!person) throw badRequest('Your user account is not linked to a person in the resource pool.');
    if (personId && person.user_id !== ctx.user.id && !ctx.access.hasGlobal('resource_manager') && !ctx.access.hasGlobal('finance')) throw forbidden();
    const start = weekStart(ws || today());
    const entries = repos.time_entries.find({ person_id: person.id }).filter((t) => t.date >= start && t.date <= addDays(start, 6));
    const ts = timesheet(person.id, start);
    const list = timeCodes(person, start);
    return {
      person: { id: person.id, name: person.name, standard_hours: person.standard_hours },
      week_start: start, week_end: addDays(start, 6), deadline: deadline(start), late: !ts?.submitted_at && clockNow() > new Date(deadline(start)),
      status: ts?.status || (entries.length ? 'Draft' : 'Not started'), timesheet: ts, entries, codes: list, nonProject: codes(),
      validation: validateWeek(person, start, entries.filter((e) => !e.adjustment_of), list),
    };
  }

  // Saves draft lines; submitted and approved lines are locked (BR-09).
  function saveWeek(ctx, { week_start: ws, entries = [] }) {
    const person = personFor(ctx.user);
    if (!person) throw badRequest('Your user account is not linked to a person in the resource pool.');
    const start = weekStart(ws);
    const existing = repos.time_entries.find({ person_id: person.id }).filter((t) => t.date >= start && t.date <= addDays(start, 6));
    const editable = new Map(existing.filter((t) => ['Draft', 'Rejected'].includes(t.status)).map((t) => [t.id, t]));
    const list = timeCodes(person, start);
    const { errors } = validateWeek(person, start, entries, list);
    // Validate only the draft lines the user is changing; locked lines stay as they are.
    const lockedIds = new Set(existing.filter((t) => !['Draft', 'Rejected'].includes(t.status)).map((t) => t.id));
    const blocking = Object.entries(errors).filter(([i]) => !lockedIds.has(entries[i]?.id));
    if (blocking.length) throw unprocessable('Some lines cannot be saved.', Object.fromEntries(blocking));
    return app.db.tx(() => {
      const keep = new Set();
      for (const e of entries) {
        if (e.id && lockedIds.has(e.id)) { keep.add(e.id); continue; }
        const tc = list.find((x) => x.project_id === e.project_id);
        const task = tc?.tasks.find((t) => t.id === e.task_id);
        const project = e.project_id ? repos.project.get(e.project_id) : null;
        const rec = {
          person_id: person.id, user_id: ctx.user.id, date: e.date, project_id: e.code ? null : e.project_id, engagement_id: project?.engagement_id || null,
          task_id: e.code ? null : e.task_id || null, code: e.code || null, hours: Number(e.hours),
          billable: e.code ? false : e.billable !== undefined ? Boolean(e.billable) : task ? task.billable : true,
          work_type: e.work_type || null, notes: e.notes || null, status: 'Draft', period: finance.postingPeriod(e.date),
        };
        if (e.id && editable.has(e.id)) {
          repos.time_entries.replace(e.id, { ...editable.get(e.id), ...rec }, ctx.user.id);
          keep.add(e.id);
        } else keep.add(repos.time_entries.insert(rec, ctx.user.id).id);
      }
      for (const t of editable.values()) if (!keep.has(t.id)) repos.time_entries.softDelete(t.id, ctx.user.id);
      const ts = timesheet(person.id, start);
      if (!ts) repos.timesheets.insert({ person_id: person.id, user_id: ctx.user.id, week_start: start, status: 'Draft' }, ctx.user.id);
      return week(ctx, start);
    });
  }

  // The approver and anyone they have delegated to during leave (WFL-006).
  const actorsFor = (userId) => [userId, ...app.workflow.delegations.find({}).filter((d) => d.to_user === userId && d.from <= today() && (!d.to || d.to >= today())).map((d) => d.from_user)];

  // Project manager first, engagement manager as alternate; nobody approves their own time, so a
  // manager's own lines go to the other manager, or to the engagement executive when they are both.
  function approversFor(entry) {
    const p = repos.project.get(entry.project_id);
    const e = repos.engagement.get(p?.engagement_id);
    const list = [...new Set([p?.manager_id, e?.manager_id].filter(Boolean))].filter((u) => u !== entry.user_id);
    return list.length ? list : [e?.executive_id].filter(Boolean);
  }

  function submitWeek(ctx, { week_start: ws }) {
    const person = personFor(ctx.user);
    const start = weekStart(ws);
    const lines = repos.time_entries.find({ person_id: person.id }).filter((t) => t.date >= start && t.date <= addDays(start, 6) && ['Draft', 'Rejected'].includes(t.status));
    if (!lines.length) throw badRequest('There is nothing to submit for this week.');
    const { errors } = validateWeek(person, start, lines, timeCodes(person, start));
    if (Object.keys(errors).length) throw unprocessable('Fix the highlighted lines before submitting.', errors);
    return app.db.tx(() => {
      const notifyMap = new Map();
      for (const t of lines) {
        if (t.code) {
          repos.time_entries.patch(t.id, { status: 'Approved', approver_id: null, decided_at: nowIso(), decision_comments: 'Non-project time', locked: true }, ctx.user.id);
          continue;
        }
        repos.time_entries.patch(t.id, { status: 'Submitted', submitted_at: nowIso() }, ctx.user.id);
        for (const a of approversFor(t).slice(0, 1)) notifyMap.set(a, [...(notifyMap.get(a) || []), t]);
      }
      const ts = timesheet(person.id, start);
      const late = clockNow() > new Date(deadline(start));
      const rec = { status: 'Submitted', submitted_at: nowIso(), late_submission: late };
      if (ts) repos.timesheets.patch(ts.id, rec, ctx.user.id); else repos.timesheets.insert({ person_id: person.id, user_id: ctx.user.id, week_start: start, ...rec }, ctx.user.id);
      audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'submit', entity: 'timesheet', entityId: `${person.id}:${start}`, summary: `Timesheet submitted for week of ${start}${late ? ' (late)' : ''}` });
      for (const [approver, ls] of notifyMap) {
        const targets = [approver, app.workflow.delegateOf(approver)];
        notify.send(targets, { kind: 'approval', title: `Timesheet to approve: ${person.name}, week of ${start}`, body: `${ls.reduce((a, l) => a + Number(l.hours), 0)} hours`, link: '/time/approvals', mandatory: true, dedupe: `ts:${person.id}:${start}:${approver}` });
      }
      finance.clearMemo();
      return week(ctx, start);
    });
  }

  // Lines awaiting the user's approval: their projects, projects they are the alternate for, or as a delegate.
  function approvalQueue(ctx) {
    const actors = actorsFor(ctx.user.id);
    const submitted = repos.time_entries.find({ status: 'Submitted' });
    const mine = submitted.filter((t) => approversFor(t).some((a) => actors.includes(a)));
    const groups = new Map();
    for (const t of mine) {
      const k = `${t.person_id}|${weekStart(t.date)}`;
      if (!groups.has(k)) groups.set(k, { person: repos.person.get(t.person_id)?.name, person_id: t.person_id, week_start: weekStart(t.date), lines: [] });
      const p = repos.project.get(t.project_id);
      groups.get(k).lines.push({ ...t, project: p?.name, task: t.task_id ? repos.work_item.get(t.task_id)?.name : null, on_behalf: !approversFor(t).includes(ctx.user.id) });
    }
    const expenseApprovals = app.workflow.inbox(ctx.user.id).filter((a) => a.kind === 'expense');
    return { timesheets: [...groups.values()], expenses: expenseApprovals };
  }

  // TEX-004: line-level approval and rejection; approved time is locked.
  function decide(ctx, { approve = [], reject = [] }) {
    const actors = actorsFor(ctx.user.id);
    const result = { approved: 0, rejected: 0 };
    app.db.tx(() => {
      const check = (t) => {
        if (!t || t.status !== 'Submitted') throw badRequest('Line is not awaiting approval');
        const approvers = approversFor(t);
        if (!approvers.some((a) => actors.includes(a))) throw forbidden('You are not the approver for this line.');
        return approvers.includes(ctx.user.id) ? null : approvers.find((a) => actors.includes(a));
      };
      for (const id of approve) {
        const t = repos.time_entries.get(id);
        const onBehalf = check(t);
        repos.time_entries.patch(id, { status: 'Approved', approver_id: ctx.user.id, on_behalf_of: onBehalf, decided_at: nowIso(), locked: true, period: finance.postingPeriod(t.date) }, ctx.user.id);
        result.approved++;
      }
      for (const { id, reason } of reject) {
        if (!String(reason || '').trim()) throw badRequest('Give a reason for each rejected line.');
        const t = repos.time_entries.get(id);
        const onBehalf = check(t);
        repos.time_entries.patch(id, { status: 'Rejected', approver_id: ctx.user.id, on_behalf_of: onBehalf, decided_at: nowIso(), decision_comments: reason }, ctx.user.id);
        const u = repos.person.get(t.person_id)?.user_id;
        notify.send([u], { kind: 'timesheet', title: `Time rejected for ${t.date}`, body: reason, link: `/time?week=${weekStart(t.date)}`, mandatory: true });
        result.rejected++;
      }
      const touched = new Set([...approve, ...reject.map((r) => r.id)].map((id) => repos.time_entries.get(id)).filter(Boolean).map((t) => `${t.person_id}|${weekStart(t.date)}`));
      for (const k of touched) refreshTimesheetStatus(...k.split('|'));
      audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'approve', entity: 'timesheet', summary: `Timesheet lines approved: ${result.approved}, rejected: ${result.rejected}` });
    });
    finance.clearMemo();
    return result;
  }

  function refreshTimesheetStatus(personId, ws) {
    const lines = repos.time_entries.find({ person_id: personId }).filter((t) => t.date >= ws && t.date <= addDays(ws, 6));
    const ts = timesheet(personId, ws);
    if (!ts) return;
    const statuses = new Set(lines.map((l) => l.status));
    const status = statuses.has('Rejected') ? 'Rejected' : statuses.size === 1 && statuses.has('Approved') ? 'Approved' : statuses.has('Submitted') && statuses.has('Approved') ? 'Partially approved' : ts.status;
    repos.timesheets.patch(ts.id, { status }, null);
  }

  // TEX-010: approved time is corrected only by a controlled adjustment, posted to the open period.
  function adjust(ctx, id, { hours, reason, task_id }) {
    const t = repos.time_entries.get(id);
    if (!t || t.status !== 'Approved') throw badRequest('Only approved time is adjusted this way.');
    const p = repos.project.get(t.project_id);
    if (!ctx.access.can(p?.engagement_id, 'time_approve', 'A', { projectId: t.project_id }) && t.user_id !== ctx.user.id) throw forbidden();
    if (!String(reason || '').trim()) throw badRequest('A reason is required for an adjustment (TEX-010).');
    const period = finance.postingPeriod(today());
    return app.db.tx(() => {
      const reversal = repos.time_entries.insert({ ...stripMeta(t), hours: -Number(t.hours), status: 'Approved', adjustment_of: t.id, adjustment_reason: reason, period, locked: true, decided_at: nowIso(), approver_id: ctx.user.id }, ctx.user.id);
      const replacement = Number(hours) > 0 ? repos.time_entries.insert({ ...stripMeta(t), hours: Number(hours), task_id: task_id || t.task_id, status: 'Submitted', adjustment_of: t.id, adjustment_reason: reason, period, locked: false, submitted_at: nowIso() }, ctx.user.id) : null;
      repos.time_entries.patch(t.id, { adjusted: true }, ctx.user.id);
      audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'adjust', entity: 'time_entry', entityId: t.id, engagementId: t.engagement_id, summary: `Approved time adjusted: ${t.hours} h → ${hours} h (${reason}); posted to ${period}`, before: { hours: t.hours }, after: { hours: Number(hours), reason, period } });
      finance.clearMemo();
      return { reversal, replacement };
    });
  }
  const stripMeta = (t) => { const { id, rev, created_at, created_by, updated_at, updated_by, ...rest } = t; void id; void rev; void created_at; void created_by; void updated_at; void updated_by; return rest; };

  // TEX-008 expenses route to the project manager (engagement manager alternate).
  function submitExpense(ctx, rec) {
    if (rec.person_id !== ctx.personId) throw forbidden();
    if (!['Draft', 'Rejected'].includes(rec.status)) throw badRequest('Already submitted.');
    if (!rec.receipt_file_id && Number(rec.amount) > 82.5) throw badRequest('Attach a receipt image for expenses over $82.50 (ATO substantiation).');
    const p = repos.project.get(rec.project_id);
    const e = repos.engagement.get(rec.engagement_id);
    entities.patch(ctx, 'expense', rec.id, { status: 'Submitted' }, 'Expense submitted');
    app.workflow.request(ctx, {
      kind: 'expense', entity: 'expense', entityId: rec.id, engagementId: rec.engagement_id, projectId: rec.project_id,
      title: `Expense: ${rec.description} ($${Number(rec.amount).toFixed(2)})`, link: '/time/approvals',
      steps: [{ name: 'Project manager approval', mode: 'any', approvers: [p?.manager_id || e?.manager_id] }],
    });
  }
  app.workflow.on('expense', {
    onApprove: (ctx, apv) => { entities.patch(ctx, 'expense', apv.entity_id, { status: 'Approved', decision_comments: null }, 'Expense approved'); finance.clearMemo(); },
    onReject: (ctx, apv, comment) => entities.patch(ctx, 'expense', apv.entity_id, { status: 'Rejected', decision_comments: comment }, 'Expense rejected'),
    onReturn: (ctx, apv, comment) => entities.patch(ctx, 'expense', apv.entity_id, { status: 'Rejected', decision_comments: comment }, 'Expense returned'),
  });

  // TEX-003: reminders before the deadline and escalation for late timesheets.
  function deadlineJob() {
    const at = clockNow();
    const lastWeek = addDays(weekStart(today()), -7);
    const due = new Date(deadline(lastWeek));
    const people = repos.person.find({}).filter((p) => p.active !== false && p.user_id && p.employment_type !== 'Subcontractor');
    let reminded = 0, escalated = 0;
    for (const p of people) {
      const ts = timesheet(p.id, lastWeek);
      if (ts && ['Submitted', 'Approved', 'Partially approved'].includes(ts.status)) continue;
      const allocated = repos.allocation.find({ person_id: p.id }).some((a) => a.start_date <= addDays(lastWeek, 6) && a.end_date >= lastWeek);
      if (!allocated) continue;
      if (at < due) {
        notify.send([p.user_id], { kind: 'timesheet', title: `Timesheet due by Monday 10:00 am for week of ${lastWeek}`, link: `/time?week=${lastWeek}`, dedupe: `ts-remind:${p.id}:${lastWeek}` });
        reminded++;
      } else {
        notify.send([p.user_id], { kind: 'timesheet', title: `Your timesheet for week of ${lastWeek} is late`, link: `/time?week=${lastWeek}`, mandatory: true, severity: 'high', dedupe: `ts-late:${p.id}:${lastWeek}` });
        const managers = repos.allocation.find({ person_id: p.id }).filter((a) => a.start_date <= addDays(lastWeek, 6) && a.end_date >= lastWeek).map((a) => repos.project.get(a.project_id)?.manager_id);
        notify.send(managers, { kind: 'timesheet', title: `Late timesheet: ${p.name}, week of ${lastWeek}`, link: '/time/approvals', dedupe: `ts-late-mgr:${p.id}:${lastWeek}` });
        escalated++;
      }
    }
    // Friday afternoon reminder for the current week.
    if (dayOfWeek(today()) === 5) {
      for (const p of people) notify.send([p.user_id], { kind: 'timesheet', title: 'Reminder: complete this week’s timesheet', link: '/time', dedupe: `ts-friday:${p.id}:${today()}` });
    }
    return `${reminded} reminded, ${escalated} escalated`;
  }

  // TEX-007: client timesheet extract (person, day, hours, billable days).
  function extract(ctx, { engagement_id: engId, from, to }) {
    if (!ctx.access.can(engId, 'billing', 'R') && !ctx.access.can(engId, 'time_approve', 'A')) throw forbidden();
    const e = repos.engagement.get(engId);
    const dayLength = Number(e.day_length) || 7.5;
    const rounding = Number(e.rounding ?? 0.25);
    const rows = repos.time_entries.find({ engagement_id: engId }).filter((t) => t.status === 'Approved' && t.date >= from && t.date <= to && t.billable !== false);
    const groups = new Map();
    for (const t of rows) {
      const k = `${t.person_id}|${t.date}|${t.project_id}`;
      const g = groups.get(k) || { person: repos.person.get(t.person_id)?.name, date: t.date, project: repos.project.get(t.project_id)?.name, hours: 0, tasks: new Set() };
      g.hours += Number(t.hours);
      if (t.task_id) g.tasks.add(repos.work_item.get(t.task_id)?.name);
      groups.set(k, g);
    }
    return [...groups.values()].map((g) => ({ ...g, tasks: [...g.tasks].filter(Boolean).join('; '), days: Math.round((g.hours / dayLength) / rounding) * rounding }))
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.person).localeCompare(String(b.person)));
  }

  return { week, saveWeek, submitWeek, approvalQueue, decide, adjust, submitExpense, deadlineJob, extract, personFor, timeCodes, deadline };
}
