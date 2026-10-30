// Approval workflow engine (WFL-001, WFL-006): sequential steps, each approved by any one or all
// of its approvers (parallel), delegation during leave, escalation on timeout, and completion
// handlers registered by each module (status updates, timesheets, changes, gates, reports...).
import { Repo } from './repo.mjs';
import { nowIso } from '../db.mjs';
import { addBusinessDays, todayIn } from '../../shared/dates.js';
import { badRequest, forbidden, notFound } from '../http.mjs';

export function createWorkflow(app) {
  const { db, settings, audit } = app;
  const repo = new Repo(db, 'approvals', { idPrefix: 'apv' });
  const delegations = new Repo(db, 'delegations', { idPrefix: 'dlg' });
  const handlers = new Map(); // kind -> { onApprove, onReject, onReturn, onStepApproved }

  const on = (kind, h) => handlers.set(kind, h);

  // Users who may currently act for `userId` (WFL-006), with the delegate's own id included.
  function actorsFor(userId) {
    const today = todayIn(settings.tz());
    const delegatedFrom = delegations.find({}).filter((d) => d.to_user === userId && d.from <= today && (!d.to || d.to >= today)).map((d) => d.from_user);
    return [userId, ...delegatedFrom];
  }

  function delegateOf(userId) {
    const today = todayIn(settings.tz());
    return delegations.find({ from_user: userId }).find((d) => d.from <= today && (!d.to || d.to >= today))?.to_user || null;
  }

  // steps: [{ name, mode: 'any' | 'all', approvers: [userId] }]
  function request(ctx, { kind, entity, entityId, engagementId = null, projectId = null, title, steps, link, data = {} }) {
    const cleanSteps = steps.map((s) => ({ ...s, approvers: [...new Set((s.approvers || []).filter(Boolean))], decisions: [] })).filter((s) => s.approvers.length);
    if (!cleanSteps.length) throw badRequest(`No approver is configured for this ${kind}. Check the engagement roles and delegations of authority.`);
    for (const p of repo.find({ entity, entity_id: entityId, status: 'Pending' })) cancel(ctx, p.id, 'Superseded by a new request');
    const holidays = settings.holidays();
    const due = addBusinessDays(todayIn(settings.tz()), settings.get('alerts').approvalEscalationDays || 3, holidays);
    const rec = repo.insert({
      kind, entity, entity_id: entityId, engagement_id: engagementId, project_id: projectId, title, link, data,
      steps: cleanSteps, current: 0, status: 'Pending', requested_by: ctx.user?.id || null, requested_at: nowIso(), due_date: due,
    }, ctx.user?.id);
    notifyStep(rec);
    audit.record({ userId: ctx.user?.id, ip: ctx.ip, action: 'approval-request', entity, entityId, engagementId, summary: `Approval requested: ${title}`, after: { steps: cleanSteps.map((s) => ({ name: s.name, approvers: s.approvers })) } });
    return rec;
  }

  function notifyStep(rec) {
    const step = rec.steps[rec.current];
    if (!step) return;
    const targets = step.approvers.flatMap((u) => [u, delegateOf(u)]).filter(Boolean);
    app.notify.send(targets, {
      kind: 'approval', title: `Approval needed: ${rec.title}`, body: `${step.name}. Due ${rec.due_date}.`, link: rec.link || '/my-work',
      entity: rec.entity, entityId: rec.entity_id, engagementId: rec.engagement_id, mandatory: true, severity: 'action', dedupe: `apv:${rec.id}:${rec.current}`,
    });
  }

  function canDecide(rec, userId) {
    const step = rec.steps[rec.current];
    if (!step || rec.status !== 'Pending') return null;
    const actors = actorsFor(userId);
    const pendingApprovers = step.approvers.filter((a) => !step.decisions.some((d) => d.for === a));
    const forUser = pendingApprovers.find((a) => actors.includes(a));
    return forUser || null;
  }

  // decision: 'approve' | 'reject' | 'return'
  function decide(ctx, id, { decision, comment = '' }) {
    const rec = repo.get(id);
    if (!rec) throw notFound('Approval not found');
    const forUser = canDecide(rec, ctx.user.id);
    if (!forUser) throw forbidden('You are not an approver for the current step of this request.');
    if (['reject', 'return'].includes(decision) && !String(comment).trim()) throw badRequest('Please give a reason.');
    const step = rec.steps[rec.current];
    step.decisions.push({ for: forUser, by: ctx.user.id, on_behalf: forUser !== ctx.user.id, decision, comment, at: nowIso() });
    const h = handlers.get(rec.kind) || {};
    let status = rec.status;
    let current = rec.current;
    if (decision === 'reject') status = 'Rejected';
    else if (decision === 'return') status = 'Returned';
    else {
      const approvedBy = new Set(step.decisions.filter((d) => d.decision === 'approve').map((d) => d.for));
      const stepDone = step.mode === 'all' ? step.approvers.every((a) => approvedBy.has(a)) : approvedBy.size > 0;
      if (stepDone) {
        current += 1;
        if (current >= rec.steps.length) status = 'Approved';
      }
    }
    const next = repo.replace(id, { ...rec, steps: rec.steps, current, status, completed_at: status !== 'Pending' ? nowIso() : null }, ctx.user.id);
    audit.record({
      userId: ctx.user.id, ip: ctx.ip, action: `approval-${decision}`, entity: rec.entity, entityId: rec.entity_id, engagementId: rec.engagement_id,
      summary: `${decision === 'approve' ? 'Approved' : decision === 'reject' ? 'Rejected' : 'Returned'}: ${rec.title}${forUser !== ctx.user.id ? ' (as delegate)' : ''}`,
      after: { step: step.name, comment, on_behalf_of: forUser !== ctx.user.id ? forUser : undefined },
    });
    if (status === 'Approved') h.onApprove?.(ctx, next, comment);
    else if (status === 'Rejected') h.onReject?.(ctx, next, comment);
    else if (status === 'Returned') h.onReturn?.(ctx, next, comment);
    else if (current !== rec.current) { h.onStepApproved?.(ctx, next); notifyStep(next); }
    if (status !== 'Pending' && rec.requested_by && rec.requested_by !== ctx.user.id) {
      app.notify.send([rec.requested_by], { kind: 'approval-result', title: `${status}: ${rec.title}`, body: comment, link: rec.link, entity: rec.entity, entityId: rec.entity_id, engagementId: rec.engagement_id });
    }
    return next;
  }

  function cancel(ctx, id, reason) {
    const rec = repo.get(id);
    if (!rec || rec.status !== 'Pending') return rec;
    return repo.replace(id, { ...rec, status: 'Cancelled', cancel_reason: reason, completed_at: nowIso() }, ctx?.user?.id);
  }

  const forEntity = (entity, entityId) => repo.find({ entity, entity_id: entityId }, { order: 'created_at DESC' });
  const pendingFor = (entity, entityId) => repo.find({ entity, entity_id: entityId, status: 'Pending' })[0] || null;

  function inbox(userId) {
    return repo.find({ status: 'Pending' }).filter((r) => canDecide(r, userId)).map((r) => ({ ...r, on_behalf_of: canDecide(r, userId) !== userId ? canDecide(r, userId) : null }));
  }

  // Escalation on timeout (WFL-001): notify the escalation contact and add them to the step.
  function escalateOverdue() {
    const today = todayIn(settings.tz());
    let n = 0;
    for (const rec of repo.find({ status: 'Pending' })) {
      if (!rec.due_date || rec.due_date >= today || rec.escalated) continue;
      const eng = rec.engagement_id ? app.repos.engagement.get(rec.engagement_id) : null;
      const target = eng?.executive_id && !rec.steps[rec.current].approvers.includes(eng.executive_id) ? eng.executive_id : eng?.manager_id;
      const steps = rec.steps.map((s, i) => (i === rec.current && target ? { ...s, approvers: [...new Set([...s.approvers, target])] } : s));
      repo.replace(rec.id, { ...rec, steps, escalated: true, escalated_to: target }, null);
      app.notify.send([target, ...rec.steps[rec.current].approvers], {
        kind: 'escalation', title: `Overdue approval escalated: ${rec.title}`, body: `Due ${rec.due_date}`, link: rec.link, mandatory: true, severity: 'high',
        entity: rec.entity, entityId: rec.entity_id, engagementId: rec.engagement_id, dedupe: `esc:${rec.id}`,
      });
      audit.record({ action: 'approval-escalate', entity: rec.entity, entityId: rec.entity_id, engagementId: rec.engagement_id, summary: `Escalated overdue approval: ${rec.title}`, after: { to: target } });
      n++;
    }
    return `${n} escalated`;
  }

  return { on, request, decide, cancel, forEntity, pendingFor, inbox, canDecide, escalateOverdue, delegateOf, delegations, repo };
}
