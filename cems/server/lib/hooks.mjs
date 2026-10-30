// Business rules attached to registers: derived fields, escalations, workflows and record actions.
import { rateRisk, expectedValue } from '../../shared/risk.js';
import { addBusinessDays, addDays, todayIn, diffDays } from '../../shared/dates.js';
import { fmtMoney } from '../../shared/format.js';
import { badRequest, forbidden, unprocessable } from '../http.mjs';

export function registerHooks(app) {
  const { entities, settings, notify, audit, repos } = app;
  const today = () => todayIn(settings.tz());
  const eng = (id) => repos.engagement.get(id);
  const proj = (id) => (id ? repos.project.get(id) : null);
  const sys = (ctx) => ({ ...ctx, system: true });
  const link = (rec, tab) => (rec.project_id ? `/projects/${rec.project_id}/${tab}?open=${rec.id}` : `/engagements/${rec.engagement_id}/${tab}?open=${rec.id}`);

  // ---------- Clients (CLI-001, CLI-007, ADM-006) ----------
  entities.register('client', {
    beforeSave(ctx, { next, isNew, input }) {
      if (!next.code) {
        const base = (next.trading_name || next.legal_name || 'CLIENT').replace(/\b(the|of|and|for|department|pty|ltd|limited)\b/gi, '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 4) || 'CLI';
        const taken = new Set(repos.client.find({}).filter((c) => c.id !== next.id).map((c) => c.code));
        let code = base;
        for (let i = 2; taken.has(code); i++) code = `${base}${i}`;
        next.code = code;
      }
      if (isNew && !input.force_duplicate) {
        const abn = String(next.abn || '').replace(/\D/g, '');
        const name = String(next.legal_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const dup = repos.client.find({}).find((c) => (abn && String(c.abn || '').replace(/\D/g, '') === abn) || String(c.legal_name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === name);
        if (dup) throw unprocessable(`A client with this ${abn && String(dup.abn || '').replace(/\D/g, '') === abn ? 'ABN' : 'name'} already exists: ${dup.legal_name} (${dup.code}).`, { legal_name: 'Possible duplicate (CLI-007)', _duplicate: dup.id });
      }
      return next;
    },
  });

  // ---------- Engagements (ENG-001, ENG-011, ACC-001) ----------
  entities.register('engagement', {
    beforeSave(ctx, { next, before, isNew }) {
      if (isNew && !next.code) {
        const client = repos.client.get(next.client_id);
        const n = app.sequence(`client:${next.client_id}`, 'engagement');
        next.code = `${client?.code || 'ENG'}-E${String(n).padStart(3, '0')}`;
      }
      if (!isNew && before.restricted !== next.restricted) {
        audit.record({ userId: ctx.user?.id, ip: ctx.ip, action: 'access', entity: 'engagement', entityId: next.id, engagementId: next.id, summary: `Engagement ${next.restricted ? 'restricted' : 'unrestricted'} (ACC-004)` });
      }
      if (next.restricted && before?.ai_enabled === undefined) next.ai_enabled = false; // AIA-004 default off for restricted
      return next;
    },
    afterSave(ctx, { before, after }) {
      // ACC-001: the named executive and manager hold those roles on the engagement.
      for (const [field, role] of [['executive_id', 'engagement_executive'], ['manager_id', 'engagement_manager']]) {
        if (after[field] && after[field] !== before?.[field]) {
          app.memberships.ensure(ctx, { engagementId: after.id, userId: after[field], role });
          if (before?.[field]) app.memberships.endRole(ctx, { engagementId: after.id, userId: before[field], role, reason: `Replaced as ${role.replace('_', ' ')}` });
        }
      }
    },
    decorate(ctx, rec) {
      rec.health = app.status?.engagementHealth?.(rec) ?? null;
      return rec;
    },
    actions: {
      override_health(ctx, rec, { rag, justification }) {
        if (!ctx.access.can(rec.id, 'setup', 'U') && !ctx.access.rolesOn(rec.id).includes('engagement_manager')) throw forbidden();
        if (rag && !String(justification || '').trim()) throw badRequest('A justification is required to override engagement health (ENG-011).');
        entities.patch(ctx, 'engagement', rec.id, { health_override: rag ? { rag, justification, by: ctx.user.id, at: new Date().toISOString() } : null }, rag ? `Health overridden to ${rag}` : 'Health override removed');
      },
      transition(ctx, rec, { to, reason }) {
        if (!ctx.access.can(rec.id, 'setup', 'U')) throw forbidden();
        return app.projects.engagementTransition(ctx, rec, to, reason);
      },
    },
  });

  // ---------- Funding allocations (ENG-006) ----------
  entities.register('funding', {
    beforeSave(ctx, { next }) {
      const instRepo = next.instrument_kind === 'po' ? repos.po : repos.contract;
      const inst = instRepo.get(next.instrument_id);
      if (!inst || inst.engagement_id !== next.engagement_id) throw unprocessable('The SOW or PO must belong to this engagement', { instrument_id: 'Invalid' });
      const project = proj(next.project_id);
      if (!project || project.engagement_id !== next.engagement_id) throw unprocessable('The project must belong to this engagement', { project_id: 'Invalid' });
      const others = repos.funding.find({ engagement_id: next.engagement_id }).filter((f) => f.instrument_id === next.instrument_id && f.id !== next.id);
      const gross = (v) => (next.instrument_kind === 'po' && inst.gst_basis === 'inclusive' ? v * (1 + settings.get('finance').gstRate) : v);
      const total = others.reduce((a, f) => a + Number(f.amount || 0), 0) + Number(next.amount || 0);
      const value = next.instrument_kind === 'contract' ? app.finance.contractValue(inst) : Number(inst.value);
      if (gross(total) > value + 0.005) {
        throw unprocessable(`Allocations would exceed the ${next.instrument_kind === 'po' ? `PO ${inst.number}` : `SOW ${inst.reference}`} value of ${fmtMoney(value)} by ${fmtMoney(gross(total) - value)} (ENG-006).`, { amount: 'Exceeds instrument value' });
      }
      return next;
    },
  });

  // ---------- Milestones (PLN-005, PLN-014) ----------
  entities.register('milestone', {
    beforeSave(ctx, { next, before }) {
      if (!before || before.forecast_date !== next.forecast_date) next.forecast_updated = today();
      if (!next.forecast_date) next.forecast_date = next.planned_date;
      return next;
    },
    afterSave(ctx, { before, after }) {
      if (after.actual_date && !before?.actual_date) app.finance?.onMilestoneAchieved?.(ctx, after);
    },
    decorate(ctx, rec) {
      rec.status = app.schedule.milestoneStatus(rec, today());
      return rec;
    },
  });

  // ---------- Work items (PLN-003, PLN-013) ----------
  entities.register('work_item', {
    beforeSave(ctx, { next, before }) {
      if (next.status === 'Done' && before?.status !== 'Done') { next.percent_complete = 1; next.remaining_hours = 0; next.completed_at = today(); }
      if (Number(next.percent_complete) >= 1 && next.status !== 'Done') { next.status = 'Done'; next.completed_at = next.completed_at || today(); }
      if (next.status === 'In progress' && !Number(next.percent_complete)) next.percent_complete = Math.max(Number(next.percent_complete) || 0, 0.05);
      if (next.percent_complete > 1) next.percent_complete = next.percent_complete / 100;
      if (next.parent_id === next.id) throw unprocessable('A work item cannot be its own parent', { parent_id: 'Invalid' });
      return next;
    },
  });

  // ---------- Deliverables (SCP-002..005, QLT-004) ----------
  const deliverableTransition = (ctx, rec, changes, summary) => entities.patch(ctx, 'deliverable', rec.id, changes, summary);
  const requirePlanWrite = (ctx, rec) => {
    if (!ctx.access.can(rec.engagement_id, 'plan', 'U', { projectId: rec.project_id, own: rec.owner_id === ctx.user.id })) throw forbidden();
  };
  entities.register('deliverable', {
    beforeSave(ctx, { next, isNew }) {
      const p = proj(next.project_id);
      // SCP-005: after the scope baseline, deliverables come only through change control.
      if (isNew && p?.baseline_approved && !next.change_id && !ctx.system) next.outside_change_control = true;
      if (!next.forecast_date) next.forecast_date = next.planned_date;
      return next;
    },
    beforeDelete(ctx, { rec }) {
      const p = proj(rec.project_id);
      if (p?.baseline_approved && !ctx.system) {
        app.notify.send([eng(rec.engagement_id)?.manager_id], { kind: 'scope', title: `Deliverable removed outside change control: ${rec.title}`, link: `/projects/${rec.project_id}/scope`, engagementId: rec.engagement_id, severity: 'high' });
      }
    },
    decorate(ctx, rec) {
      rec.overdue = !['Accepted', 'Withdrawn'].includes(rec.status) && rec.forecast_date && rec.forecast_date < today();
      return rec;
    },
    actions: {
      start(ctx, rec) { requirePlanWrite(ctx, rec); deliverableTransition(ctx, rec, { status: 'In progress' }, 'Deliverable started'); },
      internal_review(ctx, rec) {
        requirePlanWrite(ctx, rec);
        deliverableTransition(ctx, rec, { status: 'In internal review' }, 'Deliverable sent for internal quality review');
      },
      submit(ctx, rec, { version } = {}) {
        requirePlanWrite(ctx, rec);
        // QLT-004: an internal quality review must pass first; final reports need executive review.
        const reviews = repos.quality_review.find({ project_id: rec.project_id }).filter((q) => q.deliverable_id === rec.id && ['Pass', 'Pass with comments'].includes(q.result));
        const passedAfterRework = reviews.filter((q) => !rec.decided_at || (q.actual_date || '') >= String(rec.decided_at).slice(0, 10));
        if (!passedAfterRework.length) throw unprocessable('An internal quality review must pass before the deliverable can be submitted (QLT-004).');
        if (rec.deliverable_class === 'Final report' && !passedAfterRework.some((q) => q.kind === 'Engagement executive review')) {
          throw unprocessable('Final reports need a passed engagement executive review before submission (QLT-004).');
        }
        const due = addBusinessDays(today(), Number(rec.review_days) || settings.get('alerts').deliverableReviewDays, settings.holidays());
        deliverableTransition(ctx, rec, { status: 'Submitted', submitted_at: today(), review_due: due, version: version || rec.version }, 'Deliverable submitted to the client');
        const approverUsers = app.memberships.clientUsersForContact(rec.client_approver_id, rec.engagement_id);
        notify.send(approverUsers, { kind: 'acceptance', title: `Deliverable for acceptance: ${rec.title}`, body: `Please review by ${due}.`, link: `/portal/engagements/${rec.engagement_id}?deliverable=${rec.id}`, engagementId: rec.engagement_id, mandatory: true });
      },
      accept(ctx, rec, { comments = '', evidence_document_id = null, deemed = false } = {}) {
        if (rec.status !== 'Submitted') throw badRequest('Only submitted deliverables can be accepted.');
        const asClient = ctx.access.isExternal;
        if (asClient && !app.memberships.isClientApprover(ctx.user, rec)) throw forbidden('You are not the client approver for this deliverable.');
        if (!asClient && !ctx.system) {
          requirePlanWrite(ctx, rec);
          if (!evidence_document_id && !comments) throw badRequest('Record the client’s acceptance evidence or comments (SCP-003).');
        }
        deliverableTransition(sys(ctx), rec, {
          status: 'Accepted', actual_date: today(), decided_at: new Date().toISOString(), decided_by: ctx.user?.id || null,
          decision_comments: deemed ? `Deemed accepted: review period ended ${rec.review_due}` : comments, acceptance_evidence: evidence_document_id,
        }, deemed ? 'Deliverable deemed accepted (SCP-003)' : `Deliverable accepted${asClient ? ' by the client in the portal' : ''}`);
        app.finance?.onDeliverableAccepted?.(ctx, repos.deliverable.get(rec.id));
        notify.send([rec.owner_id, eng(rec.engagement_id)?.manager_id], { kind: 'acceptance', title: `Deliverable accepted: ${rec.title}`, link: link(rec, 'scope'), engagementId: rec.engagement_id });
      },
      reject(ctx, rec, { comments }) {
        if (rec.status !== 'Submitted') throw badRequest('Only submitted deliverables can be rejected.');
        if (!String(comments || '').trim()) throw badRequest('Comments are required when rejecting.');
        if (ctx.access.isExternal && !app.memberships.isClientApprover(ctx.user, rec)) throw forbidden();
        if (!ctx.access.isExternal) requirePlanWrite(ctx, rec);
        deliverableTransition(sys(ctx), rec, { status: 'Rejected', decided_at: new Date().toISOString(), decided_by: ctx.user.id, decision_comments: comments, rework_count: (rec.rework_count || 0) + 1 }, 'Deliverable rejected');
        notify.send([rec.owner_id, eng(rec.engagement_id)?.manager_id, proj(rec.project_id)?.manager_id], { kind: 'acceptance', title: `Deliverable rejected: ${rec.title}`, body: comments, link: link(rec, 'scope'), engagementId: rec.engagement_id, severity: 'high', mandatory: true });
      },
      rework(ctx, rec) { requirePlanWrite(ctx, rec); deliverableTransition(ctx, rec, { status: 'In progress' }, 'Deliverable returned to rework'); },
      withdraw(ctx, rec, { reason, change_id }) {
        requirePlanWrite(ctx, rec);
        if (!reason) throw badRequest('A reason is required.');
        const p = proj(rec.project_id);
        deliverableTransition(ctx, rec, { status: 'Withdrawn', decision_comments: reason, outside_change_control: Boolean(p?.baseline_approved && !change_id), change_id: change_id || rec.change_id }, 'Deliverable withdrawn');
      },
    },
  });

  // ---------- Quality register (QLT-003, QLT-005) ----------
  entities.register('quality_review', {
    afterSave(ctx, { after, before }) {
      if (after.result === 'Fail' && before?.result !== 'Fail') {
        const d = repos.deliverable.get(after.deliverable_id);
        notify.send([d?.owner_id, proj(after.project_id)?.manager_id], { kind: 'quality', title: `Quality review failed: ${d?.title}`, link: `/projects/${after.project_id}/scope`, engagementId: after.engagement_id, severity: 'high' });
      }
    },
    decorate(ctx, rec) {
      rec.overdue = rec.result === 'Pending' && rec.planned_date && rec.planned_date < today();
      return rec;
    },
  });

  // ---------- Risks (RSK-001..010, BR-15) ----------
  const reviewCycle = (level) => settings.get('alerts').riskReviewDays[level] || 14;
  entities.register('risk', {
    beforeSave(ctx, { next, before }) {
      Object.assign(next, rateRisk(next, settings.get('riskMatrix')));
      const ev = expectedValue(next);
      next.expected_cost = ev.cost;
      if (['Closed', 'Occurred'].includes(next.status) && !next.closed_at) next.closed_at = today();
      if (next.status === 'Open') next.closed_at = null;
      // RSK-009: keep a history of the rating to support trends.
      const hist = Array.isArray(next.score_history) ? [...next.score_history] : [];
      const score = next.residual_score || next.inherent_score;
      if (!before || before.residual_score !== next.residual_score || before.inherent_score !== next.inherent_score || before.status !== next.status) {
        hist.push({ date: today(), score, level: next.residual_level || next.inherent_level, status: next.status, owner_id: next.owner_id });
      }
      next.score_history = hist.slice(-60);
      const prior = [...hist].reverse().find((h) => diffDays(h.date, today()) >= 28) || hist[0];
      next.trend = !prior || prior === hist.at(-1) ? 'New' : score > prior.score ? 'Increasing' : score < prior.score ? 'Decreasing' : 'Stable';
      return next;
    },
    afterSave(ctx, { after, before }) {
      const level = after.residual_level || after.inherent_level;
      // RSK-007 / BR-15: Extreme risks escalate to the engagement and the engagement manager is notified.
      if (after.status === 'Open' && level === 'Extreme' && !after.escalated && after.project_id) {
        repos.risk.patch(after.id, { escalated: true, escalated_at: today() }, null);
        const e = eng(after.engagement_id);
        notify.send([e?.manager_id, e?.executive_id], {
          kind: 'escalation', title: `Extreme risk escalated: ${after.ref} ${after.title}`, body: `Raised on ${proj(after.project_id)?.name}.`, link: link(after, 'raid'),
          entity: 'risk', entityId: after.id, engagementId: after.engagement_id, mandatory: true, severity: 'high', dedupe: `risk-esc:${after.id}`, teamsWebhook: e?.teams_webhook,
        });
        audit.record({ userId: ctx.user?.id, action: 'escalate', entity: 'risk', entityId: after.id, engagementId: after.engagement_id, summary: `${after.ref} escalated to the engagement (BR-15)` });
      }
      if (before && before.owner_id !== after.owner_id && after.owner_id) {
        notify.send([after.owner_id], { kind: 'assignment', title: `You now own risk ${after.ref}: ${after.title}`, link: link(after, 'raid'), engagementId: after.engagement_id });
      }
    },
    decorate(ctx, rec) {
      const level = rec.residual_level || rec.inherent_level;
      const last = rec.last_reviewed || rec.raised_date || String(rec.created_at || '').slice(0, 10);
      rec.next_review = last ? addDays(last, reviewCycle(level)) : null;
      rec.review_overdue = rec.status === 'Open' && rec.next_review && rec.next_review < today(); // RSK-006, BR-17
      rec.age_days = rec.raised_date ? diffDays(rec.raised_date, rec.closed_at || today()) : null; // RAI-010
      rec.reportable = app.raid.reportable(rec);
      return rec;
    },
    actions: {
      review(ctx, rec, { comment } = {}) {
        if (!ctx.access.can(rec.engagement_id, 'raid', 'U', { projectId: rec.project_id }) && rec.owner_id !== ctx.user.id) throw forbidden();
        entities.patch(ctx, 'risk', rec.id, { last_reviewed: today(), last_review_comment: comment || null }, `Risk ${rec.ref} reviewed`);
      },
      escalate(ctx, rec, { reason }) {
        if (!ctx.access.can(rec.engagement_id, 'raid', 'U', { projectId: rec.project_id })) throw forbidden();
        entities.patch(ctx, 'risk', rec.id, { escalated: true, escalated_at: today(), escalation_reason: reason || null }, `Risk ${rec.ref} escalated to the engagement (ENG-009)`);
        const e = eng(rec.engagement_id);
        notify.send([e?.manager_id], { kind: 'escalation', title: `Risk escalated: ${rec.ref} ${rec.title}`, body: reason, link: link(rec, 'raid'), engagementId: rec.engagement_id, severity: 'high', mandatory: true });
      },
    },
  });

  // ---------- Issues (RAI-001..003) ----------
  entities.register('issue', {
    beforeSave(ctx, { next }) {
      if (['Resolved', 'Closed'].includes(next.status) && !next.closed_at) next.closed_at = today();
      if (!['Resolved', 'Closed'].includes(next.status)) next.closed_at = null;
      return next;
    },
    afterSave(ctx, { after, before }) {
      // RAI-003: severity beyond tolerance escalates to the engagement manager with an exception notification.
      if (['High', 'Critical'].includes(after.severity) && !['Resolved', 'Closed'].includes(after.status) && !after.escalated && after.project_id
        && (!before || !['High', 'Critical'].includes(before.severity))) {
        repos.issue.patch(after.id, { escalated: true, escalated_at: today() }, null);
        const e = eng(after.engagement_id);
        notify.send([e?.manager_id, ...(after.severity === 'Critical' ? [e?.executive_id] : [])], {
          kind: 'exception', title: `${after.severity} issue escalated: ${after.ref} ${after.title}`, link: link(after, 'raid'), engagementId: after.engagement_id,
          entity: 'issue', entityId: after.id, mandatory: true, severity: 'high', dedupe: `issue-esc:${after.id}`, teamsWebhook: e?.teams_webhook,
        });
      }
    },
    decorate(ctx, rec) {
      rec.overdue = !['Resolved', 'Closed'].includes(rec.status) && rec.target_date && rec.target_date < today();
      rec.age_days = rec.raised_date ? diffDays(rec.raised_date, rec.closed_at || today()) : null;
      const last = rec.last_reviewed || rec.raised_date;
      rec.review_overdue = !['Resolved', 'Closed'].includes(rec.status) && last && addDays(last, ['High', 'Critical'].includes(rec.severity) ? 7 : 14) < today();
      rec.reportable = app.raid.reportable(rec);
      return rec;
    },
    actions: {
      // RAI-002: a request for change or off-specification becomes a change request, keeping the link.
      convert_to_change(ctx, rec) {
        if (!['Request for change', 'Off-specification'].includes(rec.issue_type)) throw badRequest('Only requests for change and off-specifications convert to change requests.');
        if (rec.change_id) throw badRequest('This issue already has a change request.');
        if (!ctx.access.can(rec.engagement_id, 'change', 'C', { projectId: rec.project_id })) throw forbidden();
        const cr = entities.create(ctx, 'change', {
          engagement_id: rec.engagement_id, project_id: rec.project_id, title: rec.title, description: rec.description,
          reason: `Raised from issue ${rec.ref} (${rec.issue_type})`, change_type: rec.issue_type === 'Off-specification' ? 'Scope' : 'Scope',
          requester_kind: 'Client', priority: rec.priority, client_visible: rec.client_visible,
        });
        entities.patch(ctx, 'change', cr.id, { source_issue_id: rec.id, linked: [...(cr.linked || []), { entity: 'issue', id: rec.id }] });
        entities.patch(ctx, 'issue', rec.id, { change_id: cr.id, status: rec.status === 'Open' ? 'In progress' : rec.status, linked: [...(rec.linked || []), { entity: 'change', id: cr.id }] }, `Issue ${rec.ref} converted to ${cr.ref}`);
        return { change: entities.get(ctx, 'change', cr.id) };
      },
    },
  });

  // ---------- Assumptions (RAI-004) ----------
  entities.register('assumption', {
    decorate(ctx, rec) {
      rec.overdue = rec.status === 'Open' && rec.validate_by && rec.validate_by < today();
      rec.age_days = rec.raised_date ? diffDays(rec.raised_date, today()) : null;
      rec.reportable = app.raid.reportable(rec);
      return rec;
    },
    actions: {
      validate(ctx, rec) { entities.update(ctx, 'assumption', rec.id, { status: 'Validated', last_reviewed: today() }); },
      invalidate(ctx, rec, { follow_up }) {
        entities.update(ctx, 'assumption', rec.id, { status: 'Invalid', last_reviewed: today() });
        if (!follow_up) return { prompt: 'Invalid assumptions usually need a linked risk, issue or change. Create one?' };
        const base = { engagement_id: rec.engagement_id, project_id: rec.project_id, client_visible: rec.client_visible };
        const text = `Assumption ${rec.ref} found invalid: ${rec.title}`;
        let item;
        if (follow_up === 'risk') item = entities.create(ctx, 'risk', { ...base, title: text, event: text, effect: rec.impact_if_invalid, owner_id: rec.owner_id, likelihood: 3, consequence: 3 });
        else if (follow_up === 'issue') item = entities.create(ctx, 'issue', { ...base, title: text, description: rec.impact_if_invalid || text, owner_id: rec.owner_id, severity: 'Medium' });
        else if (follow_up === 'change') item = entities.create(ctx, 'change', { ...base, title: text, description: rec.impact_if_invalid || text, change_type: 'Scope', requester_kind: 'Firm' });
        else throw badRequest('Choose risk, issue or change');
        entities.patch(ctx, 'assumption', rec.id, { follow_up_id: item.id, linked: [...(rec.linked || []), { entity: follow_up, id: item.id }] });
        return { follow_up: { entity: follow_up, id: item.id, ref: item.ref } };
      },
    },
  });

  // ---------- Dependencies (RAI-005, ENG-008) ----------
  entities.register('dependency', {
    decorate(ctx, rec) {
      rec.overdue = ['Open', 'At risk'].includes(rec.status) && rec.need_by && rec.need_by < today();
      rec.flag = rec.overdue && rec.dep_type === 'Client' ? 'Overdue client dependency' : null;
      rec.age_days = rec.raised_date ? diffDays(rec.raised_date, today()) : null;
      rec.reportable = app.raid.reportable(rec);
      return rec;
    },
    afterSave(ctx, { after, before }) {
      if (after.status === 'At risk' && before?.status !== 'At risk') {
        const e = eng(after.engagement_id);
        notify.send([e?.manager_id, proj(after.project_id)?.manager_id], { kind: 'dependency', title: `Dependency at risk: ${after.ref} ${after.title}`, link: link(after, 'raid'), engagementId: after.engagement_id, severity: 'high' });
      }
    },
  });

  entities.register('decision', {
    decorate(ctx, rec) {
      rec.overdue = rec.status === 'Required' && rec.due_date && rec.due_date < today();
      rec.reportable = app.raid.reportable(rec);
      return rec;
    },
  });

  entities.register('action', {
    beforeSave(ctx, { next }) {
      if (['Done', 'Cancelled'].includes(next.status) && !next.closed_at) next.closed_at = today();
      if (next.owner_org === 'Client') next.client_visible = next.client_visible ?? true;
      return next;
    },
    afterSave(ctx, { before, after }) {
      if (after.owner_id && after.owner_id !== before?.owner_id && after.owner_id !== ctx.user?.id) {
        notify.send([after.owner_id], { kind: 'assignment', title: `Action assigned: ${after.ref} ${after.title}`, body: `Due ${after.due_date}`, link: link(after, 'raid'), engagementId: after.engagement_id });
      }
    },
    decorate(ctx, rec) {
      rec.overdue = ['Open', 'In progress'].includes(rec.status) && rec.due_date && rec.due_date < today();
      rec.age_days = rec.raised_date ? diffDays(rec.raised_date, rec.closed_at || today()) : null;
      rec.reportable = app.raid.reportable(rec);
      return rec;
    },
  });

  // ---------- Change requests (CHG-001..009) ----------
  entities.register('change', {
    beforeSave(ctx, { next }) {
      Object.assign(next, app.changes.price(next));
      return next;
    },
    decorate(ctx, rec) {
      rec.age_days = rec.raised_date ? diffDays(rec.raised_date, today()) : null;
      return rec;
    },
    actions: {
      submit: (ctx, rec, body) => app.changes.submit(ctx, rec, body),
      assess: (ctx, rec) => app.changes.setStatus(ctx, rec, 'Under assessment', 'Change under assessment'),
      defer: (ctx, rec, { reason }) => app.changes.setStatus(ctx, rec, 'Deferred', `Change deferred: ${reason || ''}`),
      implement: (ctx, rec, body) => app.changes.implement(ctx, rec, body),
      close: (ctx, rec) => app.changes.setStatus(ctx, rec, 'Closed', 'Change closed (CHG-009)'),
      record_client_approval: (ctx, rec, body) => app.changes.recordClientApproval(ctx, rec, body),
      variation_document: (ctx, rec) => app.changes.variationDocument(ctx, rec),
    },
  });

  // ---------- Lessons (LSN-003) ----------
  entities.register('lesson', {
    actions: {
      publish(ctx, rec, { summary }) {
        const text = String(summary || rec.published_summary || '').trim();
        if (!text) throw badRequest('Provide a published summary with client-confidential details removed (LSN-003).');
        if (!ctx.access.can(rec.engagement_id, 'raid', 'U', { projectId: rec.project_id })) throw forbidden();
        entities.patch(ctx, 'lesson', rec.id, { published: true, published_summary: text, published_at: today() }, 'Lesson published to the knowledge base');
      },
      unpublish(ctx, rec) { entities.patch(ctx, 'lesson', rec.id, { published: false }, 'Lesson withdrawn from the knowledge base'); },
    },
  });

  // ---------- Documents (DOC-005) ----------
  entities.register('document', {
    beforeSave(ctx, { next, before }) {
      if (before && (before.file_id !== next.file_id || before.version !== next.version || before.location !== next.location)) {
        next.versions = [...(before.versions || []), { version: before.version, file_id: before.file_id, location: before.location, at: before.updated_at, by: before.updated_by }];
      }
      return next;
    },
  });

  // ---------- Allocations and requests (RES-003, RES-010) ----------
  entities.register('allocation', {
    afterSave(ctx, { before, after }) {
      if (before?.key_person && (before.person_id !== after.person_id || (after.end_date < before.end_date))) {
        const e = eng(after.engagement_id);
        notify.send([e?.manager_id], { kind: 'key-person', title: 'Key person removed or reallocated (RES-010)', body: `${repos.person.get(before.person_id)?.name} on ${proj(after.project_id)?.name}`, link: `/projects/${after.project_id}/resources`, engagementId: after.engagement_id, severity: 'high', mandatory: true });
      }
    },
    beforeDelete(ctx, { rec }) {
      if (rec.key_person) {
        const e = eng(rec.engagement_id);
        notify.send([e?.manager_id], { kind: 'key-person', title: 'Key person allocation removed (RES-010)', body: repos.person.get(rec.person_id)?.name, link: `/projects/${rec.project_id}/resources`, engagementId: rec.engagement_id, severity: 'high', mandatory: true });
      }
    },
  });

  entities.register('resource_request', {
    afterSave(ctx, { isNew, after }) {
      if (isNew) {
        const rms = app.memberships.globalUsers('resource_manager');
        notify.send(rms, { kind: 'resource', title: `Resource request: ${after.role} for ${proj(after.project_id)?.name}`, body: `${after.hours_per_week} h/week from ${after.start_date}`, link: '/resources/requests', engagementId: after.engagement_id });
      }
    },
    actions: {
      propose(ctx, rec, { person_id }) {
        if (!ctx.access.can(rec.engagement_id, 'resources', 'U') && !ctx.access.hasGlobal('resource_manager')) throw forbidden();
        entities.patch(ctx, 'resource_request', rec.id, { status: 'Proposed', proposed_person_id: person_id }, 'Person proposed for resource request');
        notify.send([proj(rec.project_id)?.manager_id], { kind: 'resource', title: `${repos.person.get(person_id)?.name} proposed for ${rec.role}`, link: `/projects/${rec.project_id}/resources`, engagementId: rec.engagement_id });
      },
      fulfil(ctx, rec, { person_id }) {
        if (!ctx.access.hasGlobal('resource_manager') && !ctx.access.can(rec.engagement_id, 'resources', 'A')) throw forbidden('Resource managers fulfil requests (RES-003).');
        const pid = person_id || rec.proposed_person_id;
        if (!pid) throw badRequest('Choose a person');
        entities.create(sys(ctx), 'allocation', {
          project_id: rec.project_id, person_id: pid, rate_role: rec.grade || repos.person.get(pid)?.grade, start_date: rec.start_date, end_date: rec.end_date,
          hours_per_week: rec.hours_per_week, status: 'Confirmed', billable: true,
        });
        entities.patch(ctx, 'resource_request', rec.id, { status: 'Fulfilled', fulfilled_person_id: pid }, 'Resource request fulfilled');
        const user = repos.person.get(pid)?.user_id;
        if (user) app.memberships.ensure(ctx, { engagementId: rec.engagement_id, userId: user, role: 'team_member' });
        notify.send([proj(rec.project_id)?.manager_id], { kind: 'resource', title: `Resource request fulfilled: ${repos.person.get(pid)?.name}`, link: `/projects/${rec.project_id}/resources`, engagementId: rec.engagement_id });
      },
    },
  });

  // ---------- Expenses (TEX-008) ----------
  entities.register('expense', {
    beforeSave(ctx, { next, isNew }) {
      if (isNew && !ctx.system) next.person_id = ctx.personId;
      const code = settings.get('lists').taxCodes.find((t) => t.code === (next.tax_code || 'GST'));
      next.gst = Math.round(Number(next.amount || 0) * (code?.rate ?? 0.1) * 100) / 100;
      next.markup = Number(eng(next.engagement_id)?.expense_markup) || 0;
      next.period = app.finance.postingPeriod(next.date);
      if (!['Draft', 'Rejected'].includes(next.status || 'Draft') && !ctx.system) throw badRequest('Submitted expenses are locked.');
      return next;
    },
    actions: {
      submit(ctx, rec) { return app.time.submitExpense(ctx, rec); },
    },
  });

  // ---------- Write-ups and write-downs (FIN-038, FIN-044) ----------
  entities.register('wip_adjustment', {
    beforeSave(ctx, { next }) { next.period = app.finance.postingPeriod(next.date); return next; },
    afterSave(ctx, { isNew, after }) { if (isNew) app.finance.requestWipApproval(ctx, after); },
  });

  entities.register('drawdown', {
    afterSave(ctx, { isNew, after }) { if (isNew) app.finance.requestDrawdownApproval(ctx, after); },
  });

  entities.register('supplier_cost', {
    beforeSave(ctx, { next }) { next.period = app.finance.postingPeriod(next.date); return next; },
  });

  // ---------- Benefits ----------
  entities.register('benefit', {});

}
