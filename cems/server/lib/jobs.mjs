// Scheduled jobs (ADM-008): reminders, alerts, escalations, closures, refreshes and integrations.
// Each job records its last run; administrators can run any job on demand.
import { todayIn, diffDays, dayOfWeek } from '../../shared/dates.js';
import { nowIso } from '../db.mjs';

export function createJobs(app) {
  const { db, settings, repos, notify, audit } = app;
  const today = () => todayIn(settings.tz());
  const local = (h) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: settings.tz(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    return parts >= h;
  };

  // PO and contract consumption alerts at 75%, 90%, 100% and early exhaustion (BR-05, FIN-027).
  function poAlerts() {
    let n = 0;
    for (const po of repos.po.find({}).filter((p) => p.status === 'Active')) {
      const st = app.finance.poStatus(po);
      const e = repos.engagement.get(po.engagement_id);
      if (!e || e.status === 'Closed') continue;
      if (st.thresholdCrossed) {
        notify.send([e.manager_id, e.executive_id, ...app.memberships.globalUsers('finance')], {
          kind: 'po', title: `PO ${po.number} is ${Math.round(st.consumedPct * 100)}% consumed`, body: `Remaining ${Math.round(st.remaining).toLocaleString('en-AU')} (${po.gst_basis} of GST).`,
          link: `/engagements/${e.id}/financials`, engagementId: e.id, mandatory: true, severity: st.thresholdCrossed >= 1 ? 'high' : 'warning', dedupe: `po:${po.id}:${st.thresholdCrossed}`, teamsWebhook: e.teams_webhook,
        });
        n++;
      }
      if (st.exhaustsBeforeEnd) {
        notify.send([e.manager_id, e.executive_id], {
          kind: 'po', title: `PO ${po.number} forecast to run out on ${st.exhaustionDate}`, body: `Before the planned end date ${st.plannedEnd} (FIN-027).`, link: `/engagements/${e.id}/financials`,
          engagementId: e.id, mandatory: true, severity: 'high', dedupe: `po-exh:${po.id}:${st.exhaustionDate.slice(0, 7)}`,
        });
        n++;
      }
    }
    return `${n} alerts`;
  }

  // ENG-013 contract key dates at 90/60/30 days; CLI-004 agreement expiry.
  function contractExpiry() {
    let n = 0;
    const windows = settings.get('alerts').contractExpiryDays;
    for (const c of repos.contract.find({})) {
      const e = repos.engagement.get(c.engagement_id);
      if (!e || e.status === 'Closed') continue;
      for (const kd of [{ label: 'Contract end', date: c.end_date }, ...(c.key_dates || [])]) {
        if (!kd.date) continue;
        const days = diffDays(today(), kd.date);
        const w = windows.find((x) => days <= x && days >= 0);
        if (w === undefined) continue;
        notify.send([e.manager_id], { kind: 'contract', title: `${c.reference}: ${kd.label} in ${days} days (${kd.date})`, link: `/engagements/${e.id}/contracts`, engagementId: e.id, mandatory: true, dedupe: `kd:${c.id}:${kd.label}:${w}` });
        n++;
      }
    }
    for (const a of repos.agreement.find({}).filter((x) => x.status === 'Active')) {
      const days = diffDays(today(), a.expiry_date);
      if (days < 0 || days > (a.alert_days || settings.get('alerts').agreementExpiryDays)) continue;
      const owner = repos.client.get(a.client_id)?.relationship_owner;
      const ems = repos.engagement.find({ client_id: a.client_id }).filter((e) => e.status !== 'Closed').map((e) => e.manager_id);
      notify.send([owner, ...ems], { kind: 'contract', title: `${a.kind} ${a.reference} expires in ${days} days`, link: `/clients/${a.client_id}`, mandatory: true, dedupe: `agr:${a.id}:${Math.ceil(days / 30)}` });
      n++;
    }
    return `${n} alerts`;
  }

  // RES-002 clearance and certification expiry.
  function clearanceExpiry() {
    let n = 0;
    for (const x of app.resources.expiries()) {
      const person = repos.person.get(x.person_id);
      const ems = repos.allocation.find({ person_id: x.person_id }).filter((a) => a.end_date >= today()).map((a) => repos.engagement.get(a.engagement_id)?.manager_id);
      notify.send([person?.user_id, ...ems, ...app.memberships.globalUsers('resource_manager')], { kind: 'clearance', title: `${x.kind} ${x.item} for ${x.name} ${x.expired ? 'expired' : 'expires'} ${x.expiry}`, link: `/resources/people/${x.person_id}`, dedupe: `clr:${x.person_id}:${x.item}:${x.expiry}` });
      n++;
    }
    return `${n} alerts`;
  }

  // RSK-006 / RAI-010 overdue reviews; RAI-007 overdue actions.
  function raidReviews() {
    let n = 0;
    for (const t of ['risk', 'issue']) {
      for (const r of repos[t].find({})) {
        const d = app.entities.hooks[t].decorate({ system: true }, { ...r });
        if (!d.review_overdue) continue;
        notify.send([r.owner_id], { kind: 'review', title: `Review overdue: ${r.ref} ${r.title}`, link: r.project_id ? `/projects/${r.project_id}/raid?open=${r.id}` : `/engagements/${r.engagement_id}/raid?open=${r.id}`, dedupe: `rev:${r.id}:${d.next_review}` });
        n++;
      }
    }
    for (const a of repos.action.find({}).filter((x) => ['Open', 'In progress'].includes(x.status) && x.due_date && x.due_date < today() && x.owner_id)) {
      notify.send([a.owner_id], { kind: 'action', title: `Action overdue: ${a.ref} ${a.title}`, body: `Due ${a.due_date}`, link: a.project_id ? `/projects/${a.project_id}/raid?open=${a.id}` : `/engagements/${a.engagement_id}/raid?open=${a.id}`, dedupe: `act:${a.id}:${a.due_date}` });
      n++;
    }
    return `${n} reminders`;
  }

  // SCP-003 deemed acceptance after the review period where the contract allows it.
  async function deemedAcceptance() {
    let n = 0;
    for (const d of repos.deliverable.find({}).filter((x) => x.status === 'Submitted' && x.deemed_acceptance && x.review_due && x.review_due < today())) {
      await app.entities.action({ system: true, user: null, access: app.access.contextFor(null) }, 'deliverable', d.id, 'accept', { deemed: true });
      n++;
    }
    return `${n} deemed accepted`;
  }

  function retention() {
    // DAT-001 / DAT-002: flag records past retention and de-identify departed people's personal information.
    const r = settings.get('retention');
    let deidentified = 0;
    for (const p of repos.person.find({}).filter((x) => x.departed && !x.deidentified)) {
      if (diffDays(p.departed, today()) < (r.personalInfoYears || 7) * 365) continue;
      repos.person.patch(p.id, { name: `Former staff ${p.id.slice(-4)}`, email: null, skills: [], certifications: [], clearances: [], deidentified: true }, null);
      audit.record({ action: 'deidentify', entity: 'person', entityId: p.id, summary: 'Personal information de-identified after the retention period (DAT-002, APP 11.2)' });
      deidentified++;
    }
    const due = repos.engagement.find({}).filter((e) => e.status === 'Closed' && e.closed_at && !e.legal_hold && diffDays(e.closed_at, today()) > (r.years || 7) * 365).length;
    return `${deidentified} de-identified; ${due} engagements past retention awaiting disposal review`;
  }

  const JOBS = [
    { name: 'status-cutoff', label: 'Status update reminders and late flags (STS-001, BR-17)', every: 60, run: () => app.status.cutoffJob() },
    { name: 'timesheet-deadline', label: 'Timesheet reminders and escalation (TEX-003)', every: 60, run: () => app.time.deadlineJob() },
    { name: 'po-alerts', label: 'PO burn and exhaustion alerts (BR-05, FIN-027)', every: 24 * 60, run: poAlerts },
    { name: 'contract-expiry', label: 'Contract and agreement expiry alerts (ENG-013, CLI-004)', every: 24 * 60, run: contractExpiry },
    { name: 'clearance-expiry', label: 'Clearance and certification expiry (RES-002)', every: 24 * 60, run: clearanceExpiry },
    { name: 'raid-reviews', label: 'Overdue RAID reviews and actions (RSK-006, RAI-007, RAI-010)', every: 24 * 60, run: raidReviews },
    { name: 'tolerance-monitor', label: 'Tolerance exceptions (STS-008)', every: 6 * 60, run: () => app.status.exceptionJob() },
    { name: 'deemed-acceptance', label: 'Deemed acceptance of deliverables (SCP-003)', every: 24 * 60, run: deemedAcceptance },
    { name: 'time-codes', label: 'Close time codes after the grace period (CLS-005)', every: 24 * 60, run: () => app.projects.closeTimeCodes() },
    { name: 'access-expiry', label: 'Remove expired time-bound access (ACC-006)', every: 60, run: () => app.memberships.expire() },
    { name: 'forecast-refresh', label: 'Weekly labour forecast refresh and EVM history (FIN-028)', every: 7 * 24 * 60, run: () => app.forecast.weeklyRefresh() },
    { name: 'approval-escalation', label: 'Escalate overdue approvals (WFL-001)', every: 60, run: () => app.workflow.escalateOverdue() },
    { name: 'scheduled-drafts', label: 'Scheduled weekly report drafts (RPT-037)', every: 60, run: async () => (dayOfWeek(today()) === settings.get('reporting').scheduledDraftDow && local(settings.get('reporting').scheduledDraftTime) ? app.reports.scheduledDrafts() : 'Not due') },
    { name: 'invoice-sync', label: 'Invoice status sync (FIN-036)', every: 6 * 60, run: () => app.billing.syncStatuses() },
    { name: 'outbox', label: 'Send queued email (INT-002)', every: 1, run: () => notify.processOutbox() },
    { name: 'digest', label: 'Daily notification digest (WFL-004)', every: 24 * 60, run: () => (local('07:00') ? notify.digest() : 'Not due') },
    { name: 'integration-retry', label: 'Retry failed integration messages (INT-014)', every: 5, run: () => app.integrations.retryDue() },
    { name: 'retention', label: 'Retention and de-identification (DAT-001, DAT-002)', every: 24 * 60, run: retention },
  ];

  const upsert = db.prepare('INSERT INTO jobs (name, last_run_at, last_status, last_message, next_run_at, runs) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(name) DO UPDATE SET last_run_at = excluded.last_run_at, last_status = excluded.last_status, last_message = excluded.last_message, next_run_at = excluded.next_run_at, runs = runs + 1');

  async function run(name) {
    const job = JOBS.find((j) => j.name === name);
    if (!job) throw Object.assign(new Error('Unknown job'), { status: 404 });
    const started = Date.now();
    let status = 'ok', message;
    try {
      message = String(await job.run());
    } catch (e) {
      status = 'error';
      message = e.message;
      console.error(`Job ${name} failed`, e);
    }
    upsert.run(name, nowIso(), status, `${message} (${Date.now() - started} ms)`, new Date(Date.now() + job.every * 60_000).toISOString());
    return { name, status, message };
  }

  function list() {
    const rows = new Map(db.prepare('SELECT * FROM jobs').all().map((r) => [r.name, r]));
    return JOBS.map((j) => ({ name: j.name, label: j.label, every_minutes: j.every, ...(rows.get(j.name) || {}) }));
  }

  let timer = null;
  function start() {
    if (timer) return;
    const tick = async () => {
      const rows = new Map(db.prepare('SELECT * FROM jobs').all().map((r) => [r.name, r]));
      for (const j of JOBS) {
        const r = rows.get(j.name);
        if (r && r.enabled === 0) continue;
        if (!r || !r.next_run_at || r.next_run_at <= nowIso()) await run(j.name);
      }
    };
    timer = setInterval(() => { tick().catch((e) => console.error('Scheduler error', e)); }, 60_000);
    timer.unref?.();
    setTimeout(() => tick().catch(() => {}), 5_000).unref?.();
  }
  const stop = () => { if (timer) clearInterval(timer); timer = null; };

  return { run, list, start, stop, JOBS };
}
