// Weekly status updates and performance tracking (STS-001..011, BR-01, BR-03, BR-06, BR-16, BR-17).
import { deriveRag, engagementHealth as healthRule, isBetter, DIMENSIONS, worstRag, RAG_RANK } from '../../shared/rag.js';
import { weekEnding, addDays, todayIn, zonedToUtc, dayOfWeek, businessDayDiff } from '../../shared/dates.js';
import { badRequest, forbidden, unprocessable, notFound } from '../http.mjs';
import { nowIso } from '../db.mjs';
import { now as clockNow } from '../../shared/clock.js';

const NARRATIVE = ['executive_summary', 'achievements', 'next_period', 'decisions_required', 'escalations', 'client_actions'];
const REPORTABLE_STATES = ['Initiation', 'In delivery', 'Stage boundary', 'Closing'];

export function createStatus(app) {
  const { repos, settings, entities, notify, audit, finance, schedule } = app;
  const today = () => todayIn(settings.tz());
  const repo = repos.status_updates;

  // BR-01: the reporting week ends on Friday; cadence can be fortnightly or monthly.
  function currentPeriod(engagement, onDate = today()) {
    const r = settings.get('reporting');
    let pe = weekEnding(onDate, r.weekEndDow);
    if (engagement?.reporting_cadence === 'Monthly') {
      const lastDay = new Date(Date.UTC(Number(pe.slice(0, 4)), Number(pe.slice(5, 7)), 0)).toISOString().slice(0, 10);
      pe = weekEnding(addDays(lastDay, -6), r.weekEndDow);
    }
    return pe;
  }

  function cutoff(periodEnd) {
    const r = settings.get('reporting');
    const diff = (dayOfWeek(periodEnd) - r.statusCutoffDow + 7) % 7;
    return zonedToUtc(addDays(periodEnd, -diff), r.statusCutoffTime, settings.tz()).toISOString();
  }

  function isDue(project) {
    return REPORTABLE_STATES.includes(project.state);
  }

  // Metrics behind the suggested RAG (BR-03).
  function metrics(projectId) {
    const p = repos.project.get(projectId);
    const e = repos.engagement.get(p.engagement_id);
    const pos = finance.position(projectId);
    const plan = schedule.plan(projectId);
    const now = today();
    const tol = p.tolerances || settings.get('tolerances');
    const risks = repos.risk.find({ project_id: projectId }).filter((r) => r.status === 'Open').map((r) => ({ level: r.residual_level || r.inherent_level, response_actions: r.response_actions }));
    const issues = repos.issue.find({ project_id: projectId }).filter((i) => !['Resolved', 'Closed'].includes(i.status));
    const changes = repos.change.find({ engagement_id: p.engagement_id }).filter((c) => c.project_id === projectId);
    const deliverables = repos.deliverable.find({ project_id: projectId });
    const reviews = repos.quality_review.find({ project_id: projectId });
    const requests = repos.resource_request.find({ project_id: projectId });
    const horizon = addDays(now, settings.get('ragRules').resourceLookaheadWeeks * 7);
    const placeholders = repos.allocation.find({ project_id: projectId }).filter((a) => !a.person_id && a.start_date <= horizon && a.end_date >= now);
    const keyPersonLeft = repos.allocation.find({ project_id: projectId }).some((a) => a.key_person && a.person_id && repos.person.get(a.person_id)?.active === false);
    const rules = settings.get('ragRules');
    const pos0 = pos || {};
    const poList = repos.funding.find({ engagement_id: p.engagement_id }).filter((f) => f.project_id === projectId && f.instrument_kind === 'po').map((f) => finance.poStatus(repos.po.get(f.instrument_id)));
    const poShort = poList.find((x) => x.exhaustsBeforeEnd);
    return {
      today: now, holidays: settings.holidays(),
      keyMilestones: plan.milestones.filter((m) => m.key),
      timeToleranceDays: tol.time?.days ?? 10,
      spi: pos0.evm?.spi ?? null, evmApplies: Boolean(p.evm_required),
      overdueTasks: plan.items.filter((t) => t.overdue).length,
      bac: pos0.bac, eac: pos0.eac, costTolerancePct: tol.cost?.pct ?? 0.05,
      forecastMargin: pos0.forecastMargin, marginTarget: p.margin_target ?? rules.marginTarget, marginFloor: rules.marginFloor,
      poExhaustsBeforeEnd: Boolean(poShort), poExhaustionDate: poShort?.exhaustionDate,
      pendingScopeChanges: changes.filter((c) => ['Submitted', 'Under assessment', 'Awaiting approval'].includes(c.status)).length,
      unresolvedScopeQuestions: issues.filter((i) => ['Request for change', 'Off-specification'].includes(i.issue_type) && !i.change_id).length,
      disputedScope: deliverables.filter((d) => d.outside_change_control && !['Withdrawn'].includes(d.status)).length + (pos0.commercialRisk ? 1 : 0),
      openRisks: risks, openIssues: issues,
      unfilledCritical: requests.filter((r) => r.critical && ['Open', 'Proposed'].includes(r.status) && r.start_date <= addDays(now, 7)).length,
      keyPersonLoss: keyPersonLeft,
      resourceGaps: requests.filter((r) => ['Open', 'Proposed'].includes(r.status) && r.start_date <= horizon).length + placeholders.length,
      rejectedDeliverables: deliverables.filter((d) => d.status === 'Rejected').length,
      reworkDeliverables: deliverables.filter((d) => (d.rework_count || 0) > 0 && d.status !== 'Rejected').length,
      failedReviews: reviews.filter((q) => q.result === 'Fail' && q.planned_date >= addDays(now, -28)).length,
      overdueReviews: reviews.filter((q) => q.result === 'Pending' && q.planned_date < now).length,
      qualityToleranceBreached: deliverables.some((d) => (d.rework_count || 0) > 1),
      position: pos, plan,
    };
  }

  function suggested(projectId) {
    const m = metrics(projectId);
    return { rag: deriveRag(m, settings.get('ragRules')), metrics: m };
  }

  // STS-003: system data pre-populated into each update.
  function systemData(projectId, periodEnd, previous) {
    const { metrics: m, rag } = suggested(projectId);
    const periodStart = addDays(periodEnd, -6);
    const plan = m.plan;
    const pos = m.position || {};
    const look = schedule.lookahead(projectId, addDays(periodEnd, 1), 4);
    const since = previous?.submitted_at ? String(previous.submitted_at).slice(0, 10) : addDays(periodEnd, -7);
    const raidChanges = [];
    for (const t of ['risk', 'issue', 'action', 'dependency', 'decision']) {
      for (const r of repos[t].find({ project_id: projectId })) {
        if (String(r.created_at).slice(0, 10) > since) raidChanges.push({ type: t, ref: r.ref, title: r.title, change: 'New' });
        else if (r.closed_at && r.closed_at > since) raidChanges.push({ type: t, ref: r.ref, title: r.title, change: 'Closed' });
        else if (String(r.updated_at).slice(0, 10) > since) raidChanges.push({ type: t, ref: r.ref, title: r.title, change: 'Updated' });
      }
    }
    const p = repos.project.get(projectId);
    const changes = repos.change.find({ engagement_id: p.engagement_id }).filter((c) => c.project_id === projectId);
    const hours = repos.time_entries.find({ project_id: projectId }).filter((t) => t.date >= periodStart && t.date <= periodEnd).reduce((a, t) => a + Number(t.hours), 0);
    return {
      suggested: Object.fromEntries(Object.entries(rag).map(([k, v]) => [k, v])),
      milestones_achieved: plan.milestones.filter((x) => x.actual_date && x.actual_date >= periodStart && x.actual_date <= periodEnd).map((x) => ({ name: x.name, date: x.actual_date })),
      milestones_missed: plan.milestones.filter((x) => x.status === 'Missed').map((x) => ({ name: x.name, date: x.forecast_date || x.planned_date })),
      lookahead: { milestones: look.milestones.map((x) => ({ name: x.name, date: x.forecast_date || x.planned_date, status: x.status })), deliverables: look.deliverables.map((x) => ({ title: x.title, date: x.forecast_date || x.planned_date, status: x.status })), tasks: look.tasks.slice(0, 15).map((x) => ({ name: x.name, finish: x.finish_date, status: x.status })) },
      raid_changes: raidChanges,
      changes_raised: changes.filter((c) => c.raised_date >= periodStart && c.raised_date <= periodEnd).map((c) => ({ ref: c.ref, title: c.title, status: c.status })),
      changes_approved: changes.filter((c) => c.decided_at && c.decided_at >= periodStart && c.decided_at <= periodEnd && c.status === 'Approved').map((c) => ({ ref: c.ref, title: c.title })),
      financials: { as_at: pos.asAt, bac: pos.bac, ac: pos.ac, eac: pos.eac, forecast_margin: pos.forecastMargin, fees_at_completion: pos.eacRevenue, invoiced: pos.invoicedToDate },
      indices: { spi: pos.evm?.spi ?? null, cpi: pos.evm?.cpi ?? null, percent_complete: plan.percent },
      hours_recorded: hours,
    };
  }

  function strip(su, ctx) {
    if (!su) return su;
    const e = repos.engagement.get(su.engagement_id);
    if (ctx && !ctx.system && !ctx.access.canSeeCosts(e.id) && su.system_data?.financials) {
      su = { ...su, system_data: { ...su.system_data, financials: { ...su.system_data.financials, forecast_margin: undefined } } };
    }
    return su;
  }

  function list(ctx, projectId) {
    const p = repos.project.get(projectId);
    if (!p || !ctx.access.can(p.engagement_id, 'status', 'R', { projectId })) throw notFound();
    return repo.find({ project_id: projectId }).sort((a, b) => b.period_end.localeCompare(a.period_end) || (b.version || 1) - (a.version || 1)).map((s) => strip(s, ctx));
  }

  function latestFor(projectId, periodEnd) {
    return repo.find({ project_id: projectId, period_end: periodEnd }).sort((a, b) => (b.version || 1) - (a.version || 1))[0] || null;
  }

  // Opens (or returns) the update for a period: narrative rolled forward and system data pre-filled (STS-003, STS-005).
  function open(ctx, projectId, periodEnd) {
    const p = repos.project.get(projectId);
    if (!p) throw notFound();
    if (!ctx.access.can(p.engagement_id, 'status', 'R', { projectId })) throw forbidden();
    const e = repos.engagement.get(p.engagement_id);
    const pe = periodEnd || currentPeriod(e);
    const existing = latestFor(projectId, pe);
    if (existing) {
      if (['Draft', 'Returned'].includes(existing.status) && ctx.access.can(p.engagement_id, 'status', 'U', { projectId })) {
        const prev = previousApproved(projectId, pe);
        return strip(repo.patch(existing.id, { system_data: systemData(projectId, pe, prev) }, null), ctx);
      }
      return strip(existing, ctx);
    }
    if (!ctx.access.can(p.engagement_id, 'status', 'C', { projectId })) return null;
    const prev = previousApproved(projectId, pe) || repo.find({ project_id: projectId }).filter((s) => s.period_end < pe).sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
    const sd = systemData(projectId, pe, prev);
    const ratings = {};
    for (const d of [...DIMENSIONS.map((x) => x.key), 'overall']) {
      ratings[d] = { rag: prev?.ratings?.[d]?.rag || sd.suggested[d].rag, commentary: prev?.ratings?.[d]?.commentary || '', carried: Boolean(prev?.ratings?.[d]?.commentary) };
    }
    const narrative = Object.fromEntries(NARRATIVE.map((k) => [k, k === 'achievements' ? '' : prev?.[k] || '']));
    const carried = NARRATIVE.filter((k) => k !== 'achievements' && prev?.[k]);
    const rec = repo.insert({
      project_id: projectId, engagement_id: p.engagement_id, period_end: pe, version: 1, status: 'Draft', ratings, ...narrative,
      carried_over: carried, rolled_from: prev?.id || null, system_data: sd, raid_inclusions: null,
    }, ctx.user.id);
    return strip(rec, ctx);
  }

  function previousApproved(projectId, before) {
    return repo.find({ project_id: projectId }).filter((s) => s.period_end < before && ['Approved', 'Reported'].includes(s.status)).sort((a, b) => b.period_end.localeCompare(a.period_end) || (b.version || 1) - (a.version || 1))[0] || null;
  }

  // Saves the draft; fields edited are no longer marked as carried over (STS-005).
  function save(ctx, id, input) {
    const su = repo.get(id);
    if (!su) throw notFound();
    if (!ctx.access.can(su.engagement_id, 'status', 'U', { projectId: su.project_id })) throw forbidden();
    if (!['Draft', 'Returned'].includes(su.status)) throw badRequest(`This update is ${su.status.toLowerCase()} and locked${su.status === 'Reported' ? ' because it was used in an issued report; create a new version to correct it (STS-011)' : ''}.`);
    const next = { ...su };
    for (const k of NARRATIVE) if (k in input && input[k] !== su[k]) { next[k] = input[k]; next.carried_over = (next.carried_over || []).filter((x) => x !== k); }
    if (input.ratings) {
      next.ratings = { ...su.ratings };
      for (const [k, v] of Object.entries(input.ratings)) {
        const prev = su.ratings?.[k] || {};
        next.ratings[k] = { ...prev, ...v, carried: v.commentary !== undefined && v.commentary !== prev.commentary ? false : prev.carried };
      }
    }
    if ('raid_inclusions' in input) next.raid_inclusions = input.raid_inclusions;
    const out = repo.replace(id, next, ctx.user.id, { expectRev: input.rev });
    return strip(out, ctx);
  }

  // STS-004 / BR-06: a rating better than the calculated one needs a justification and is flagged.
  function overrides(su) {
    const out = [];
    for (const d of [...DIMENSIONS.map((x) => x.key), 'overall']) {
      const chosen = su.ratings?.[d]?.rag;
      const calc = su.system_data?.suggested?.[d]?.rag;
      if (isBetter(chosen, calc)) out.push({ dimension: d, chosen, calculated: calc, justification: su.ratings?.[d]?.justification || '' });
    }
    return out;
  }

  function submit(ctx, id) {
    let su = repo.get(id);
    if (!su) throw notFound();
    if (!ctx.access.can(su.engagement_id, 'status', 'U', { projectId: su.project_id })) throw forbidden();
    if (!['Draft', 'Returned'].includes(su.status)) throw badRequest('Already submitted.');
    su = repo.patch(id, { system_data: systemData(su.project_id, su.period_end, previousApproved(su.project_id, su.period_end)) }, null);
    const ov = overrides(su);
    const missing = ov.filter((o) => !String(o.justification).trim());
    if (missing.length) {
      throw unprocessable(`A justification is required where your rating is better than the calculated one (BR-06): ${missing.map((m) => `${m.dimension} (${m.chosen} vs calculated ${m.calculated})`).join(', ')}.`, Object.fromEntries(missing.map((m) => [`ratings.${m.dimension}.justification`, 'Required'])));
    }
    const errors = {};
    if (!String(su.executive_summary || '').trim()) errors.executive_summary = 'Required';
    if (!String(su.achievements || '').trim()) errors.achievements = 'Required';
    if (!String(su.next_period || '').trim()) errors.next_period = 'Required';
    for (const d of DIMENSIONS.map((x) => x.key)) if (su.ratings?.[d]?.rag !== 'Green' && !String(su.ratings?.[d]?.commentary || '').trim()) errors[`ratings.${d}.commentary`] = 'Commentary required for Amber and Red';
    if (Object.keys(errors).length) throw unprocessable('Complete the required fields (STS-002).', errors);
    const late = clockNow() > new Date(cutoff(su.period_end));
    const out = repo.patch(id, { status: 'Submitted', submitted_at: nowIso(), submitted_by: ctx.user.id, late, overrides: ov }, ctx.user.id);
    const e = repos.engagement.get(su.engagement_id);
    const p = repos.project.get(su.project_id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'submit', entity: 'status_update', entityId: id, engagementId: su.engagement_id, summary: `Status update submitted for ${p.name}, week ending ${su.period_end}${late ? ' (late)' : ''}${ov.length ? `; ${ov.length} rating(s) better than calculated` : ''}` });
    app.workflow.request(ctx, {
      kind: 'status_update', entity: 'status_update', entityId: id, engagementId: su.engagement_id, projectId: su.project_id,
      title: `Status update: ${p.name}, w/e ${su.period_end}${ov.length ? ` — ${ov.length} override${ov.length > 1 ? 's' : ''}` : ''}`, link: `/projects/${p.id}/status`,
      steps: [{ name: e.manager_id === ctx.user.id ? 'Engagement executive review (STS-006, own update)' : 'Engagement manager review (STS-006)', mode: 'any', approvers: [e.manager_id === ctx.user.id ? e.executive_id : e.manager_id] }],
    });
    if (ov.length) {
      notify.send([e.manager_id], {
        kind: 'override', title: `Watermelon check: ${p.name} rated better than calculated`, body: ov.map((o) => `${o.dimension}: ${o.chosen} (calculated ${o.calculated}) — ${o.justification}`).join('\n'),
        link: `/projects/${p.id}/status`, engagementId: e.id, severity: 'high', mandatory: true,
      });
    }
    app.integrations.emitEvent('status.submitted', { id, project: p.code, period_end: su.period_end });
    return strip(out, ctx);
  }

  app.workflow.on('status_update', {
    onApprove(ctx, apv, comment) { repo.patch(apv.entity_id, { status: 'Approved', approved_at: nowIso(), approved_by: ctx.user.id, review_comment: comment || null }, ctx.user.id); },
    onReturn(ctx, apv, comment) {
      const su = repo.patch(apv.entity_id, { status: 'Returned', review_comment: comment }, ctx.user.id);
      const p = repos.project.get(su.project_id);
      notify.send([p.manager_id], { kind: 'status', title: `Status update returned: ${p.name}`, body: comment, link: `/projects/${p.id}/status`, mandatory: true });
    },
    onReject(ctx, apv, comment) { repo.patch(apv.entity_id, { status: 'Returned', review_comment: comment }, ctx.user.id); },
  });

  // STS-011 / BR-07: once issued in a report an update is locked; corrections create a new version.
  function newVersion(ctx, id) {
    const su = repo.get(id);
    if (!ctx.access.can(su.engagement_id, 'status', 'U', { projectId: su.project_id })) throw forbidden();
    if (su.status !== 'Reported') throw badRequest('Only reported updates need a new version; edit drafts directly.');
    const { id: _id, rev, created_at, created_by, updated_at, updated_by, ...rest } = su; void _id; void rev; void created_at; void created_by; void updated_at; void updated_by;
    const rec = repo.insert({ ...rest, version: (su.version || 1) + 1, status: 'Draft', supersedes: su.id, submitted_at: null, approved_at: null, reported_in: [] }, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'version', entity: 'status_update', entityId: rec.id, engagementId: su.engagement_id, summary: `New version ${rec.version} of a reported status update (STS-011)` });
    return rec;
  }

  function markReported(ids, reportId) {
    for (const id of ids) {
      const su = repo.get(id);
      if (!su) continue;
      repo.patch(id, { status: 'Reported', locked: true, reported_in: [...(su.reported_in || []), reportId] }, null);
    }
  }

  // STS-010 submission tracker.
  function tracker(ctx, { engagementId, periodEnd } = {}) {
    const engIds = engagementId ? [engagementId] : ctx.access.visibleEngagementIds();
    const rows = [];
    for (const id of engIds) {
      const e = repos.engagement.get(id);
      if (!e || !['Active', 'Closing'].includes(e.status)) continue;
      const pe = periodEnd || currentPeriod(e);
      for (const p of repos.project.find({ engagement_id: id }).filter(isDue)) {
        if (!ctx.access.can(id, 'status', 'R', { projectId: p.id })) continue;
        const su = latestFor(p.id, pe);
        const past = clockNow() > new Date(cutoff(pe));
        let state = su ? su.status : 'Not started';
        if ((!su || ['Draft', 'Not started', 'Returned'].includes(su.status)) && past) state = 'Late';
        rows.push({
          engagement_id: id, engagement: e.name, project_id: p.id, project: p.name, manager_id: p.manager_id, period_end: pe, cutoff: cutoff(pe),
          status: state, update_status: su?.status || null, submitted_at: su?.submitted_at || null, late: su?.late || state === 'Late', overall: su?.ratings?.overall?.rag || null,
          overrides: su?.overrides?.length || 0, id: su?.id || null,
        });
      }
    }
    return rows;
  }

  // BR-17 / UC-02: reminders before the cut-off; late updates notified to PM and EM.
  function cutoffJob() {
    const at = clockNow();
    let reminded = 0, late = 0;
    for (const e of repos.engagement.find({}).filter((x) => x.status === 'Active')) {
      const pe = currentPeriod(e);
      const cut = new Date(cutoff(pe));
      const remindFrom = new Date(cut.getTime() - (settings.get('reporting').reminderHoursBefore || 24) * 3600_000);
      for (const p of repos.project.find({ engagement_id: e.id }).filter(isDue)) {
        const su = latestFor(p.id, pe);
        if (su && !['Draft', 'Returned'].includes(su.status)) continue;
        if (at >= remindFrom && at < cut) {
          notify.send([p.manager_id], { kind: 'status', title: `Status update due ${new Date(cut).toLocaleString('en-AU', { timeZone: settings.tz(), weekday: 'long', hour: 'numeric', minute: '2-digit' })}: ${p.name}`, link: `/projects/${p.id}/status`, dedupe: `su-remind:${p.id}:${pe}` });
          reminded++;
        } else if (at >= cut) {
          notify.send([p.manager_id, e.manager_id], { kind: 'status', title: `Late status update: ${p.name}, week ending ${pe}`, link: `/reports/tracker`, mandatory: true, severity: 'high', dedupe: `su-late:${p.id}:${pe}` });
          late++;
        }
      }
    }
    return `${reminded} reminded, ${late} late`;
  }

  // STS-008: continuous tolerance monitoring with exception alerts.
  function exceptions(projectId) {
    const p = repos.project.get(projectId);
    if (!p || !isDue(p)) return [];
    const m = metrics(projectId);
    const tol = p.tolerances || settings.get('tolerances');
    const out = [];
    if (m.bac && m.eac > m.bac * (1 + (tol.cost?.pct ?? 0.05))) out.push({ dimension: 'cost', text: `Forecast cost ${Math.round((m.eac / m.bac - 1) * 1000) / 10}% above BAC (tolerance ${(tol.cost?.pct ?? 0.05) * 100}%)` });
    const endSlip = p.baseline_end && m.plan.projectEnd ? businessDayDiff(p.baseline_end, m.plan.projectEnd > p.end_date ? m.plan.projectEnd : p.end_date, m.holidays) : 0;
    if (endSlip > (tol.time?.days ?? 10)) out.push({ dimension: 'time', text: `Forecast end ${endSlip} business days after baseline (tolerance ${tol.time?.days ?? 10})` });
    for (const ms of m.keyMilestones) {
      if (ms.actual_date || !ms.baseline_date || !ms.forecast_date) continue;
      const slip = businessDayDiff(ms.baseline_date, ms.forecast_date, m.holidays);
      if (slip > (tol.time?.days ?? 10)) out.push({ dimension: 'time', text: `Key milestone "${ms.name}" forecast ${slip} business days late` });
    }
    if (m.disputedScope > 0) out.push({ dimension: 'scope', text: 'Scope change outside change control' });
    if (m.qualityToleranceBreached) out.push({ dimension: 'quality', text: 'Deliverable rejected more than once' });
    if (m.openRisks.some((r) => r.level === 'Extreme' && !r.response_actions)) out.push({ dimension: 'risk', text: 'Extreme risk without an approved response' });
    if (m.forecastMargin != null && m.forecastMargin < m.marginFloor) out.push({ dimension: 'benefits', text: `Forecast margin below the floor` , internal: true });
    return out;
  }

  function exceptionJob() {
    let n = 0;
    for (const p of repos.project.find({}).filter(isDue)) {
      const ex = exceptions(p.id);
      const e = repos.engagement.get(p.engagement_id);
      for (const x of ex) {
        notify.send([p.manager_id, e.manager_id], {
          kind: 'exception', title: `Tolerance exception (${x.dimension}): ${p.name}`, body: x.text, link: `/projects/${p.id}`, engagementId: e.id,
          mandatory: true, severity: 'high', dedupe: `exc:${p.id}:${x.dimension}:${today().slice(0, 7)}`, teamsWebhook: e.teams_webhook,
        });
        n++;
      }
      if (ex.length) app.integrations.emitEvent('threshold.breached', { project: p.code, exceptions: ex.map((x) => x.text) });
    }
    return `${n} exception alerts`;
  }

  // Latest RAG per project (approved or submitted updates) for dashboards.
  function latestRag(projectId) {
    const su = repo.find({ project_id: projectId }).filter((s) => ['Submitted', 'Approved', 'Reported'].includes(s.status)).sort((a, b) => b.period_end.localeCompare(a.period_end) || (b.version || 1) - (a.version || 1))[0];
    return su ? { overall: su.ratings?.overall?.rag, ratings: Object.fromEntries(Object.entries(su.ratings || {}).map(([k, v]) => [k, v.rag])), period_end: su.period_end, status: su.status, id: su.id } : null;
  }

  // STS-007: RAG history for the last N periods.
  function history(projectId, n = settings.get('reporting').ragTrendPeriods || 12) {
    const byPeriod = new Map();
    for (const s of repo.find({ project_id: projectId }).filter((x) => ['Submitted', 'Approved', 'Reported'].includes(x.status)).sort((a, b) => (a.version || 1) - (b.version || 1))) byPeriod.set(s.period_end, s);
    return [...byPeriod.values()].sort((a, b) => a.period_end.localeCompare(b.period_end)).slice(-n).map((s) => ({ period_end: s.period_end, ...Object.fromEntries(Object.entries(s.ratings || {}).map(([k, v]) => [k, v.rag])) }));
  }

  // ENG-011 / BR-16: engagement health from project health, with justified override.
  function engagementHealth(e) {
    if (e.health_override?.rag) return { rag: e.health_override.rag, overridden: true, justification: e.health_override.justification };
    const projects = repos.project.find({ engagement_id: e.id }).filter((p) => ['In delivery', 'Stage boundary', 'Initiation', 'Closing'].includes(p.state));
    const rated = projects.map((p) => ({ rag: latestRag(p.id)?.overall, bac: finance.position(p.id)?.bac || 0 }));
    const rag = healthRule(rated, e.health_rule || settings.get('ragRules').engagementHealthRule);
    return rag ? { rag, overridden: false, rule: e.health_rule || 'worst' } : null;
  }

  return {
    currentPeriod, cutoff, metrics, suggested, systemData, list, open, save, submit, newVersion, markReported, overrides, tracker, cutoffJob,
    exceptions, exceptionJob, latestRag, history, engagementHealth, latestFor, isDue, worstRag, RAG_RANK,
  };
}
