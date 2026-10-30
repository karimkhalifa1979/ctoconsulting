// Change control (CHG-001..009, UC-06): priced impact from rate cards, routing by change authority,
// client approval, baseline and contract updates on approval, variation documents.
import { todayIn, addMonths, monthOf } from '../../shared/dates.js';
import { badRequest, forbidden, unprocessable } from '../http.mjs';

export function createChanges(app) {
  const { repos, settings, rates, entities, workflow, notify, audit } = app;
  const today = () => todayIn(settings.tz());

  // CHG-002: cost, price and margin from estimates by role and the applicable rate cards.
  function price(rec) {
    const est = Array.isArray(rec.estimate) ? rec.estimate : [];
    const date = rec.raised_date || today();
    const eng = repos.engagement.get(rec.engagement_id);
    const dayLength = Number(eng?.day_length) || 7.5;
    let cost = 0, priced = 0;
    const lines = est.map((l) => {
      const days = Number(l.days) || 0;
      const charge = rates.chargeRate({ engagementId: rec.engagement_id, role: l.role, personId: null, date });
      const dayRate = l.rate != null && l.rate !== '' ? Number(l.rate) : charge.daily;
      const costPerHour = rates.gradeCost(l.role, date);
      cost += days * dayLength * costPerHour;
      priced += days * dayRate;
      return { role: l.role, days, rate: Math.round(dayRate), rate_source: l.rate != null && l.rate !== '' ? 'Manual' : charge.source };
    });
    const out = { estimate: lines };
    if (est.length) {
      out.impact_cost = Math.round(cost);
      out.impact_price = Math.round(priced);
      out.impact_margin = priced ? (priced - cost) / priced : null;
    }
    const level = authority(rec.impact_price ?? out.impact_price, rec.impact_schedule_days);
    out.approval_level = level.label;
    if (rec.client_approval_required === undefined || rec.client_approval_required === null) {
      out.client_approval_required = Number(out.impact_price ?? rec.impact_price) > 0 || settings.get('authority').changeClientApprovalTypes.includes(String(rec.change_type || '').toLowerCase());
    }
    return out;
  }

  // CHG-003: project manager up to a value or days, engagement manager up to a higher value, then steering committee.
  function authority(priceImpact, days) {
    const tiers = settings.get('authority').change;
    const p = Math.abs(Number(priceImpact) || 0);
    const d = Math.abs(Number(days) || 0);
    return tiers.find((t) => p <= t.maxPrice && d <= t.maxDays) || tiers.at(-1);
  }

  function setStatus(ctx, rec, status, summary) {
    if (!ctx.access.can(rec.engagement_id, 'change', 'U', { projectId: rec.project_id })) throw forbidden();
    entities.patch(ctx, 'change', rec.id, { status }, summary);
  }

  function submit(ctx, rec) {
    if (!ctx.access.can(rec.engagement_id, 'change', 'U', { projectId: rec.project_id }) && rec.created_by !== ctx.user.id) throw forbidden();
    if (!['Draft', 'Submitted', 'Under assessment', 'Deferred'].includes(rec.status)) throw badRequest(`A change that is ${rec.status} cannot be submitted.`);
    if (!rec.impact_scope && !rec.impact_price && !rec.impact_schedule_days && !(rec.estimate || []).length) throw unprocessable('Assess the impact before submitting (CHG-002).');
    const e = repos.engagement.get(rec.engagement_id);
    const p = rec.project_id ? repos.project.get(rec.project_id) : null;
    const tier = authority(rec.impact_price, rec.impact_schedule_days);
    const steps = [];
    const pm = p?.manager_id;
    if (tier.role === 'project_manager') steps.push({ name: 'Project manager (within change authority)', mode: 'any', approvers: [pm || e.manager_id] });
    else if (tier.role === 'engagement_manager') steps.push({ name: 'Engagement manager (change authority)', mode: 'any', approvers: [e.manager_id] });
    else {
      steps.push({ name: 'Engagement manager review', mode: 'any', approvers: [e.manager_id] });
      steps.push({ name: 'Steering committee (engagement executive)', mode: 'any', approvers: [e.executive_id] });
    }
    // CPT-003: client approval through the portal where a client approver has a portal account.
    if (rec.client_approval_required) {
      const clientApprovers = app.memberships.clientApprovers(e.id);
      steps.push({ name: 'Client approval', mode: 'any', approvers: clientApprovers.length ? clientApprovers : [e.manager_id], client: true, recordOnly: !clientApprovers.length });
    }
    entities.patch(ctx, 'change', rec.id, { status: 'Awaiting approval', submitted_at: today() }, `Change ${rec.ref} submitted for approval: ${tier.label}`);
    workflow.request(ctx, {
      kind: 'change', entity: 'change', entityId: rec.id, engagementId: rec.engagement_id, projectId: rec.project_id,
      title: `${rec.ref} ${rec.title}${rec.impact_price ? ` ($${Number(rec.impact_price).toLocaleString('en-AU')})` : ''}`, link: `/projects/${rec.project_id}/changes?open=${rec.id}`, steps,
    });
    app.integrations.emitEvent('change.submitted', { id: rec.id, ref: rec.ref });
  }

  // Q-04: where the client has no portal account, the engagement manager records the client's decision with evidence.
  function recordClientApproval(ctx, rec, { decision, evidence, comment }) {
    const apv = workflow.pendingFor('change', rec.id);
    if (!apv) throw badRequest('No approval is pending.');
    const step = apv.steps[apv.current];
    if (!step?.client) throw badRequest('The pending step is not the client approval.');
    if (!evidence && !comment) throw badRequest('Attach or describe the client’s approval evidence.');
    return workflow.decide(ctx, apv.id, { decision: decision === 'reject' ? 'reject' : 'approve', comment: `Client decision recorded by ${ctx.user.name}: ${comment || ''}${evidence ? ` (evidence: ${evidence})` : ''}` });
  }

  workflow.on('change', {
    onApprove(ctx, apv) {
      const rec = repos.change.get(apv.entity_id);
      entities.patch(ctx, 'change', rec.id, { status: 'Approved', decided_at: today(), decision_comments: apv.steps.flatMap((s) => s.decisions).map((d) => d.comment).filter(Boolean).join(' | ') }, `Change ${rec.ref} approved`);
      applyApproved(ctx, repos.change.get(rec.id));
    },
    onReject(ctx, apv, comment) {
      const rec = repos.change.get(apv.entity_id);
      entities.patch(ctx, 'change', rec.id, { status: 'Rejected', decided_at: today(), decision_comments: comment }, `Change ${rec.ref} rejected`);
    },
    onReturn(ctx, apv, comment) {
      const rec = repos.change.get(apv.entity_id);
      entities.patch(ctx, 'change', rec.id, { status: 'Under assessment', decision_comments: comment }, `Change ${rec.ref} returned for reassessment`);
    },
  });

  // CHG-004, FIN-003, BR-10: on approval, update baselines with a link to the change, keeping prior baselines.
  function applyApproved(ctx, rec) {
    const sys = { ...ctx, system: true };
    const p = rec.project_id ? repos.project.get(rec.project_id) : null;
    if (p) {
      const cur = repos.budget_versions.find({ project_id: p.id }).filter((b) => b.status === 'Approved').at(-1);
      if (cur && (rec.impact_cost || rec.impact_price)) {
        const months = Math.max(1, Math.ceil(((new Date(p.end_date) - new Date(today())) / 86400000) / 30));
        const start = monthOf(today());
        const extra = Array.from({ length: Math.min(months, 12) }, (_, i) => ({
          stage_id: null, cost_type: 'labour', month: addMonths(start, i), cost: (Number(rec.impact_cost) || 0) / Math.min(months, 12), revenue: (Number(rec.impact_price) || 0) / Math.min(months, 12), note: `Change ${rec.ref}`,
        }));
        app.forecast.createBudgetVersion(sys, p.id, { lines: [...(cur.lines || []), ...extra], label: `Change ${rec.ref}`, reason: `Approved change ${rec.ref}: ${rec.title}`, change_id: rec.id, approved: true, contingency: cur.contingency });
      }
      app.projects.createBaseline(sys, p.id, { label: `Change ${rec.ref}`, reason: `Approved change ${rec.ref}`, changeId: rec.id });
      for (const d of repos.deliverable.find({ project_id: p.id }).filter((x) => x.change_id === rec.id && x.outside_change_control)) entities.patch(sys, 'deliverable', d.id, { outside_change_control: false });
      if (rec.impact_scope) entities.create(sys, 'scope_item', { engagement_id: rec.engagement_id, project_id: p.id, kind: 'In scope', text: `${rec.ref}: ${rec.impact_scope}`, change_id: rec.id });
    }
    // Contract value increases through an executed variation (FIN-003, CHG-005).
    if (Number(rec.impact_price) > 0) {
      const sow = p ? repos.funding.find({ engagement_id: rec.engagement_id }).filter((f) => f.project_id === p.id && f.instrument_kind === 'contract').map((f) => repos.contract.get(f.instrument_id))[0]
        : repos.contract.find({ engagement_id: rec.engagement_id }).find((c) => c.kind === 'SOW');
      if (sow) {
        const n = repos.contract.find({ engagement_id: rec.engagement_id }).filter((c) => c.kind === 'Variation' && c.parent_id === sow.id).length + 1;
        const variation = entities.create(sys, 'contract', {
          engagement_id: rec.engagement_id, kind: 'Variation', parent_id: sow.id, reference: rec.variation_ref || `${sow.reference}-V${n}`, title: `${rec.ref} ${rec.title}`,
          value: Number(rec.variation_value || rec.impact_price), start_date: today(), end_date: sow.end_date, commercial_model: sow.commercial_model, status: 'Draft', change_id: rec.id,
        });
        entities.patch(sys, 'change', rec.id, { variation_contract_id: variation.id });
      }
    }
    notify.send([p?.manager_id, repos.engagement.get(rec.engagement_id)?.manager_id], { kind: 'change', title: `Change approved: ${rec.ref} ${rec.title}`, body: 'Baselines updated; a draft variation was created for signature.', link: `/projects/${rec.project_id}/changes?open=${rec.id}`, engagementId: rec.engagement_id });
    app.integrations.emitEvent('change.approved', { id: rec.id, ref: rec.ref, price: rec.impact_price });
    audit.record({ userId: ctx.user?.id, action: 'baseline', entity: 'change', entityId: rec.id, engagementId: rec.engagement_id, summary: `Baselines updated for approved change ${rec.ref} (CHG-004)` });
    app.finance.clearMemo();
  }

  // The project's SOW funding grows when the variation is signed, not when the change is approved:
  // until then the contract value (FIN-003) does not include it (ENG-006).
  function onVariationSigned(ctx, variation) {
    const rec = variation.change_id ? repos.change.get(variation.change_id) : null;
    if (!rec?.project_id) return;
    const fund = repos.funding.find({ engagement_id: rec.engagement_id }).find((f) => f.project_id === rec.project_id && f.instrument_id === variation.parent_id);
    if (fund) entities.patch({ ...ctx, system: true }, 'funding', fund.id, { amount: Number(fund.amount) + Number(variation.value) }, `Funding increased by signed variation ${variation.reference}`);
    if (!rec.variation_ref) entities.patch({ ...ctx, system: true }, 'change', rec.id, { variation_ref: variation.reference, variation_value: variation.value, variation_date: variation.signed_date || today() });
    app.finance.clearMemo();
  }

  function implement(ctx, rec, { notes } = {}) {
    if (rec.status !== 'Approved') throw badRequest('Only approved changes can be marked implemented.');
    setStatus(ctx, rec, 'Implemented', `Change ${rec.ref} implemented`);
    if (notes) entities.patch(ctx, 'change', rec.id, { implementation_notes: notes });
  }

  // CHG-005: variation document generated from the change request template.
  async function variationDocument(ctx, rec) {
    if (!ctx.access.can(rec.engagement_id, 'change', 'R', { projectId: rec.project_id })) throw forbidden();
    return app.reports.renderChangeDocument(ctx, rec);
  }

  // CHG-007: cumulative approved variations against the original contract value.
  function changeLog(ctx, engagementId, projectId) {
    const list = entities.list(ctx, 'change', { engagement_id: engagementId, ...(projectId ? { project_id: projectId } : {}) }).sort((a, b) => String(a.raised_date).localeCompare(String(b.raised_date)));
    const contracts = repos.contract.find({ engagement_id: engagementId }).filter((c) => c.kind === 'SOW' && c.status === 'Signed');
    const original = projectId
      ? repos.funding.find({ engagement_id: engagementId }).filter((f) => f.project_id === projectId && f.instrument_kind === 'contract').reduce((a, f) => a + Number(f.amount), 0) - list.filter((c) => ['Approved', 'Implemented', 'Closed'].includes(c.status)).reduce((a, c) => a + Number(c.impact_price || 0), 0)
      : contracts.reduce((a, c) => a + Number(c.value), 0);
    let cumulative = 0;
    const rows = list.map((c) => {
      const approved = ['Approved', 'Implemented', 'Closed'].includes(c.status);
      if (approved) cumulative += Number(c.impact_price || 0);
      return { ...c, approved, cumulative, contract_value_after: original + cumulative };
    });
    return { original, approvedVariations: cumulative, current: original + cumulative, rows };
  }

  return { price, authority, setStatus, submit, recordClientApproval, implement, variationDocument, changeLog, applyApproved, onVariationSigned };
}
