// Project initiation, governance, lifecycle, baselines, stage gates and closure
// (GOV-001..011, PLN-006, PLN-015, CLS-001..008, ENG-003, UC-01).
import { DELIVERY_PROFILES, PROJECT_TEMPLATES, CLOSURE_CHECKLIST, ENGAGEMENT_CLOSURE } from '../../shared/defaults.js';
import { addBusinessDays, addDays, todayIn, monthOf, monthsBetween, businessDaysBetween } from '../../shared/dates.js';
import { badRequest, forbidden, unprocessable, notFound } from '../http.mjs';

const ACTIVE = ['Initiation', 'In delivery', 'Stage boundary'];

export function createProjects(app) {
  const { repos, settings, entities, workflow, notify, audit } = app;
  const today = () => todayIn(settings.tz());
  const sys = (ctx) => ({ ...ctx, system: true });

  const profiles = () => {
    const custom = repos.delivery_profiles.find({});
    return custom.length ? custom : DELIVERY_PROFILES;
  };
  const templates = () => {
    const custom = repos.project_templates.find({});
    return custom.length ? custom : PROJECT_TEMPLATES;
  };
  const profileOf = (id) => profiles().find((p) => p.id === id) || DELIVERY_PROFILES[0];

  function mustEdit(ctx, p, fn = 'plan') {
    if (!ctx.system && !ctx.access.can(p.engagement_id, fn, 'U', { projectId: p.id })) throw forbidden();
  }

  // GOV-001: a project created from a template gets its profile's stages and gates, standard tasks,
  // standard risks, mandatory artefacts and milestones. LSN-004 suggests relevant lessons.
  function createFromTemplate(ctx, input) {
    const tpl = templates().find((t) => t.id === input.template_id);
    const eng = repos.engagement.get(input.engagement_id);
    if (!eng) throw notFound('Engagement not found');
    const profile = profileOf(input.profile_id || tpl?.profile || 'prince2');
    const holidays = settings.holidays();
    const start = input.start_date || today();
    const durationDays = (tpl?.durationWeeks || 12) * 5;
    const end = input.end_date || addBusinessDays(start, durationDays - 1, holidays);
    const size = input.size || tpl?.size || 'medium';
    return app.db.tx(() => {
      const project = entities.create(ctx, 'project', {
        engagement_id: eng.id, name: input.name || tpl?.name, description: input.description, manager_id: input.manager_id, approach: input.approach || tpl?.approach || profile.approach,
        profile_id: profile.id, start_date: start, end_date: end, size, evm_required: size === 'large' || input.evm_required === true,
        commercial_model: input.commercial_model, fixed_price: input.fixed_price,
      });
      const s = sys(ctx);
      entities.patch(s, 'project', project.id, {
        template_id: tpl?.id || null, tolerances: defaultTolerances(size), closure: {},
        commercial: { status: 'Not submitted' }, governance_roles: profile.roleSet.map((r) => ({ role: r, name: '', org: /Senior user|Executive|Sponsor|Product owner|Business owner/.test(r) ? 'Client' : 'Firm' })),
        commercial_model: input.commercial_model || null, fixed_price: input.fixed_price || null,
      });
      // Stages from the delivery profile, spread across the project timeline.
      const stageCount = profile.stages.length;
      const span = businessDaysBetween(addDays(start, -1), end, holidays);
      const stages = profile.stages.map((st, i) => {
        const sStart = addBusinessDays(start, Math.floor((span * i) / stageCount), holidays);
        const sEnd = i === stageCount - 1 ? end : addBusinessDays(start, Math.floor((span * (i + 1)) / stageCount) - 1, holidays);
        return entities.create(s, 'stage', {
          project_id: project.id, seq: i + 1, name: st.name, kind: st.kind, start_date: i === 0 ? start : sStart, end_date: sEnd, status: i === 0 ? 'Active' : 'Not started',
          gate_criteria: (st.gate?.criteria || []).map((text) => ({ text, done: false })), gate_artefacts: (st.gate?.artefacts || []).map((text) => ({ text, done: false, approved: false, mandatory: true })),
          gate_approvers: [eng.manager_id],
        });
      });
      // Standard tasks and deliverables from the template (PLN-015).
      const offset = (n) => addBusinessDays(start, n, holidays);
      let prev = null;
      (tpl?.tasks || []).forEach((t, i) => {
        const stage = stages[Math.min(t.stage, stages.length - 1)];
        const task = entities.create(s, 'work_item', {
          project_id: project.id, stage_id: stage?.id, name: t.name, kind: 'Task', start_date: offset(t.start), finish_date: offset(t.start + t.days - 1),
          effort_hours: t.days * 7.5, initiation: Boolean(t.initiation), assignees: input.manager_id ? [input.manager_id] : [], sort: i + 1,
          predecessors: prev && t.start >= (prev.end || 0) ? [{ id: prev.id, type: 'FS', lag: 0 }] : [],
        });
        prev = { id: task.id, end: t.start + t.days };
        if (t.deliverable) {
          entities.create(s, 'deliverable', {
            project_id: project.id, title: t.name, owner_id: input.manager_id, planned_date: offset(t.start + t.days - 1),
            acceptance_criteria: 'Meets the agreed product description and quality criteria', deliverable_class: /report|case/i.test(t.name) ? 'Final report' : 'Standard',
          });
        }
      });
      for (const m of tpl?.milestones || []) {
        entities.create(s, 'milestone', { project_id: project.id, name: m.name, kind: m.kind === 'payment' ? 'Payment' : 'Delivery', key: Boolean(m.key), planned_date: offset(Math.min(m.offset, durationDays - 1)) });
      }
      // Standard risks seed the register (RSK-010).
      const library = settings.get('riskLibrary');
      for (const key of tpl?.risks || []) {
        const r = library.find((x) => x.key === key);
        if (!r) continue;
        entities.create(s, 'risk', {
          engagement_id: eng.id, project_id: project.id, title: r.title, cause: r.cause, event: r.event, effect: r.effect, category: r.category,
          owner_id: input.manager_id, likelihood: r.likelihood, consequence: r.consequence, response: r.response[0].toUpperCase() + r.response.slice(1), response_actions: r.actions,
        });
      }
      app.memberships.ensure(ctx, { engagementId: eng.id, userId: input.manager_id, role: 'project_manager' });
      audit.record({ userId: ctx.user?.id, ip: ctx.ip, action: 'create', entity: 'project', entityId: project.id, engagementId: eng.id, summary: `Project created from template "${tpl?.name || 'blank'}" with ${profile.name}` });
      return { project: repos.project.get(project.id), suggestedLessons: suggestLessons(ctx, eng, tpl) };
    });
  }

  function defaultTolerances(size) {
    const t = structuredClone(settings.get('tolerances'));
    if (size === 'large') { t.cost.pct = Math.min(t.cost.pct, 0.03); t.time.days = Math.min(t.time.days, 5); }
    return t;
  }

  // LSN-004: published lessons matched by engagement type, client, sector and tags.
  function suggestLessons(ctx, eng, tpl) {
    const client = repos.client.get(eng.client_id);
    const words = new Set(String(`${tpl?.name || ''} ${eng.type} ${client?.sector || ''}`).toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    return repos.lesson.find({}).filter((l) => l.published).map((l) => {
      const le = repos.engagement.get(l.engagement_id);
      const lc = le ? repos.client.get(le.client_id) : null;
      let score = 0;
      if (le?.type === eng.type) score += 2;
      if (lc?.id === client?.id) score += 2;
      if (lc?.sector === client?.sector) score += 1;
      for (const t of l.tags || []) if (words.has(String(t).toLowerCase())) score += 1;
      return { id: l.id, title: l.title, summary: l.published_summary, category: l.category, tags: l.tags, score };
    }).filter((l) => l.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  }

  // ---------- Governance (GOV-003, GOV-005..007) ----------
  function updateGovernance(ctx, projectId, { governance_roles, raci, tolerances }) {
    const p = repos.project.get(projectId);
    mustEdit(ctx, p, 'plan');
    const changes = {};
    if (governance_roles) changes.governance_roles = governance_roles;
    if (raci) changes.raci = raci;
    if (tolerances) {
      if (p.baseline_approved && !ctx.access.can(p.engagement_id, 'setup', 'U')) throw forbidden('After baselining, only the engagement manager changes tolerances.');
      changes.tolerances = tolerances;
    }
    return entities.patch(ctx, 'project', p.id, changes, 'Governance updated');
  }

  function submitCommercial(ctx, projectId, input) {
    const p = repos.project.get(projectId);
    const e = repos.engagement.get(p.engagement_id);
    if (!ctx.access.can(e.id, 'setup', 'U') && !ctx.access.can(e.id, 'budget', 'U', { projectId })) throw forbidden();
    const price = Number(input.price) || 0, cost = Number(input.cost) || 0;
    const margin = price ? (price - cost) / price : 0;
    const auth = settings.get('authority').commercial;
    const target = p.margin_target ?? auth.marginTarget;
    const steps = [];
    const needExec = price > auth.emMaxValue || margin < target;
    steps.push({ name: 'Engagement manager', mode: 'any', approvers: [e.manager_id] });
    if (needExec) steps.push({ name: `Engagement executive (${price > auth.emMaxValue ? 'value above threshold' : 'margin below target'})`, mode: 'any', approvers: [e.executive_id] });
    const commercial = { ...input, price, cost, margin, status: 'Submitted', submitted_at: today(), route: steps.map((s) => s.name) };
    entities.patch(ctx, 'project', p.id, { commercial }, `Commercial approval submitted: margin ${(margin * 100).toFixed(1)}%`);
    workflow.request(ctx, { kind: 'commercial', entity: 'project', entityId: p.id, engagementId: e.id, projectId: p.id, title: `Commercial approval: ${p.name} ($${price.toLocaleString('en-AU')}, ${(margin * 100).toFixed(1)}% margin)`, link: `/projects/${p.id}/governance`, steps });
    return repos.project.get(p.id);
  }
  workflow.on('commercial', {
    onApprove(ctx, apv) {
      const p = repos.project.get(apv.entity_id);
      entities.patch(ctx, 'project', p.id, { commercial: { ...p.commercial, status: 'Approved', approved_at: today(), approved_by: ctx.user.id }, margin_target: p.margin_target ?? settings.get('authority').commercial.marginTarget }, 'Commercial approval granted (GOV-003)');
      if (p.state === 'Proposed') transition(sys(ctx), p.id, { to: 'Initiation' });
    },
    onReject(ctx, apv, comment) {
      const p = repos.project.get(apv.entity_id);
      entities.patch(ctx, 'project', p.id, { commercial: { ...p.commercial, status: 'Rejected', comment } }, 'Commercial approval rejected');
    },
  });

  // ---------- Lifecycle (section 4.3) ----------
  const ALLOWED = {
    Proposed: ['Initiation', 'Cancelled', 'On hold'],
    Initiation: ['In delivery', 'On hold', 'Cancelled'],
    'In delivery': ['Stage boundary', 'On hold', 'Closing', 'Cancelled'],
    'Stage boundary': ['In delivery', 'On hold', 'Closing', 'Cancelled'],
    'On hold': ['Proposed', 'Initiation', 'In delivery', 'Stage boundary', 'Cancelled'],
    Closing: ['Closed', 'In delivery'],
    Closed: ['Archived'],
    Cancelled: ['Archived'],
    Archived: [],
  };

  function transition(ctx, projectId, { to, reason, expected_restart: restart }) {
    const p = repos.project.get(projectId);
    if (!p) throw notFound();
    if (!ctx.system && !ctx.access.can(p.engagement_id, 'setup', 'U') && !(ctx.access.can(p.engagement_id, 'plan', 'U', { projectId }) && ['Stage boundary', 'On hold', 'Closing'].includes(to))) throw forbidden();
    if (!(ALLOWED[p.state] || []).includes(to)) throw badRequest(`A project cannot move from ${p.state} to ${to}.`);
    const changes = { state: to };
    if (to === 'Initiation' && p.commercial?.status !== 'Approved' && !ctx.system) throw unprocessable('Commercial approval is needed before initiation (GOV-003).');
    if (to === 'In delivery' && !p.baseline_approved && !ctx.system) throw unprocessable('Approve the baseline first: submit it from the Governance tab (UC-01).');
    if (to === 'On hold') {
      if (!reason) throw badRequest('Give a reason and expected restart date.');
      Object.assign(changes, { on_hold_reason: reason, expected_restart: restart || null, state_before_hold: p.state });
    }
    if (to === 'Cancelled') {
      if (!reason) throw badRequest('Give a reason for the cancellation (CLS-006).');
      Object.assign(changes, { cancel_reason: reason, cancelled_at: today(), final_position: snapshotPosition(p.id), time_codes_close_on: addBusinessDays(today(), settings.get('alerts').timeCodeGraceDays, settings.holidays()) });
    }
    if (to === 'Closed') Object.assign(changes, { closed_at: today(), final_position: snapshotPosition(p.id), time_codes_close_on: addBusinessDays(today(), settings.get('alerts').timeCodeGraceDays, settings.holidays()) });
    const out = entities.patch(ctx, 'project', p.id, changes, `Lifecycle: ${p.state} → ${to}${reason ? ` (${reason})` : ''}`);
    notify.send([repos.engagement.get(p.engagement_id)?.manager_id, p.manager_id].filter((u) => u !== ctx.user?.id), { kind: 'lifecycle', title: `${p.name}: ${p.state} → ${to}`, body: reason, link: `/projects/${p.id}`, engagementId: p.engagement_id });
    return out;
  }

  function snapshotPosition(projectId) {
    const pos = app.finance.position(projectId);
    if (!pos) return null;
    const keys = ['asAt', 'contractValue', 'bac', 'ac', 'eac', 'recognised', 'invoicedToDate', 'wip', 'billedInAdvance', 'forecastMargin', 'baselineMargin', 'writeDowns', 'hours'];
    return Object.fromEntries(keys.map((k) => [k, pos[k]]));
  }

  // ---------- Baselines (PLN-006, FIN-010, BR-10) ----------
  function createBaseline(ctx, projectId, { label, reason, changeId = null, approvalId = null }) {
    const p = repos.project.get(projectId);
    const items = repos.work_item.find({ project_id: projectId });
    const milestones = repos.milestone.find({ project_id: projectId });
    const deliverables = repos.deliverable.find({ project_id: projectId });
    const existing = repos.baselines.find({ project_id: projectId });
    const budget = repos.budget_versions.find({ project_id: projectId }).filter((b) => b.status === 'Approved').at(-1);
    for (const b of existing.filter((x) => x.is_current)) repos.baselines.patch(b.id, { is_current: false }, ctx.user?.id);
    const rec = repos.baselines.insert({
      project_id: projectId, engagement_id: p.engagement_id, version_no: existing.length + 1, label: label || (existing.length ? `Re-baseline ${existing.length}` : 'Original'),
      reason: reason || null, change_id: changeId, approval_id: approvalId, approved_by: ctx.user?.id || null, approved_at: new Date().toISOString(), is_current: true, kind: 'all',
      data: {
        end_date: p.end_date, budget_version_id: budget?.id || null, bac: budget ? budget.lines.filter((l) => l.cost_type !== 'contingency').reduce((a, l) => a + Number(l.cost || 0), 0) : null,
        work_items: items.map((t) => ({ id: t.id, start: t.start_date, finish: t.finish_date })),
        milestones: milestones.map((m) => ({ id: m.id, date: m.forecast_date || m.planned_date })),
        deliverables: deliverables.map((d) => ({ id: d.id, date: d.forecast_date || d.planned_date })),
        scope: repos.scope_item.find({ engagement_id: p.engagement_id }).filter((x) => x.project_id === projectId).map((x) => ({ kind: x.kind, text: x.text })),
      },
    }, ctx.user?.id);
    const s = sys(ctx);
    for (const t of items) repos.work_item.patch(t.id, { baseline_start: t.start_date, baseline_finish: t.finish_date }, null);
    for (const m of milestones) repos.milestone.patch(m.id, { baseline_date: m.forecast_date || m.planned_date }, null);
    for (const d of deliverables) repos.deliverable.patch(d.id, { baseline_date: d.forecast_date || d.planned_date }, null);
    entities.patch(s, 'project', projectId, { baseline_approved: true, baseline_end: p.end_date, current_baseline_id: rec.id }, `Baseline ${rec.label} recorded`);
    audit.record({ userId: ctx.user?.id, action: 'baseline', entity: 'project', entityId: projectId, engagementId: p.engagement_id, summary: `Baseline ${rec.label} approved${reason ? `: ${reason}` : ''}` });
    return rec;
  }

  // UC-01 step 6–7: project manager submits baselines; engagement manager approves; delivery starts.
  function submitBaseline(ctx, projectId, { reason } = {}) {
    const p = repos.project.get(projectId);
    mustEdit(ctx, p, 'plan');
    const rebaseline = Boolean(p.baseline_approved);
    if (rebaseline && !String(reason || '').trim()) throw badRequest('A re-baseline needs a recorded reason (BR-10).');
    const draft = repos.budget_versions.find({ project_id: projectId }).filter((b) => b.status === 'Draft').at(-1);
    const approved = repos.budget_versions.find({ project_id: projectId }).filter((b) => b.status === 'Approved').at(-1);
    const problems = [];
    if (!draft && !approved) problems.push('Create a budget (Financials tab)');
    if (!repos.work_item.find({ project_id: projectId }).length) problems.push('Add the plan (work breakdown)');
    if (!repos.milestone.find({ project_id: projectId }).length) problems.push('Add at least one milestone');
    if (!p.tolerances) problems.push('Set tolerances');
    if (!repos.risk.find({ project_id: projectId }).length) problems.push('Start the risk register (OBJ-6)');
    if (problems.length) throw unprocessable(`Before submitting the baseline: ${problems.join('; ')}.`);
    const e = repos.engagement.get(p.engagement_id);
    const bacNew = draft ? draft.lines.filter((l) => l.cost_type !== 'contingency').reduce((a, l) => a + Number(l.cost || 0), 0) : 0;
    const bacOld = approved ? approved.lines.filter((l) => l.cost_type !== 'contingency').reduce((a, l) => a + Number(l.cost || 0), 0) : 0;
    const steps = [{ name: 'Engagement manager approval', mode: 'any', approvers: [e.manager_id] }];
    if (rebaseline && bacOld && Math.abs(bacNew - bacOld) / bacOld > settings.get('authority').rebaselinePctForExecutive) steps.push({ name: 'Engagement executive (re-baseline above threshold)', mode: 'any', approvers: [e.executive_id] });
    workflow.request(ctx, {
      kind: 'baseline', entity: 'project', entityId: p.id, engagementId: e.id, projectId: p.id, data: { reason, rebaseline, budgetVersionId: draft?.id || null },
      title: `${rebaseline ? 'Re-baseline' : 'Baseline'}: ${p.name}`, link: `/projects/${p.id}/governance`, steps,
    });
    entities.patch(ctx, 'project', p.id, { baseline_pending: true }, 'Baseline submitted for approval');
    return repos.project.get(p.id);
  }
  workflow.on('baseline', {
    onApprove(ctx, apv) {
      const p = repos.project.get(apv.entity_id);
      if (apv.data?.budgetVersionId) app.forecast.approveBudget(sys(ctx), apv.data.budgetVersionId);
      createBaseline(ctx, p.id, { reason: apv.data?.reason, approvalId: apv.id });
      entities.patch(sys(ctx), 'project', p.id, { baseline_pending: false, time_codes_closed: false }, 'Time codes opened');
      const fresh = repos.project.get(p.id);
      if (['Proposed', 'Initiation'].includes(fresh.state)) {
        if (fresh.state === 'Proposed') entities.patch(sys(ctx), 'project', p.id, { state: 'Initiation' });
        transition(sys(ctx), p.id, { to: 'In delivery' });
        const stages = repos.stage.find({ project_id: p.id }).sort((a, b) => a.seq - b.seq);
        if (stages[0]?.status === 'Active' && stages.length > 1) { repos.stage.patch(stages[0].id, { status: 'Complete' }, null); repos.stage.patch(stages[1].id, { status: 'Active' }, null); }
      }
      app.finance.clearMemo();
    },
    onReject(ctx, apv) { entities.patch(sys(ctx), 'project', apv.entity_id, { baseline_pending: false }, 'Baseline rejected'); },
    onReturn(ctx, apv) { entities.patch(sys(ctx), 'project', apv.entity_id, { baseline_pending: false }, 'Baseline returned'); },
  });

  // ---------- Stage gates (GOV-008, GOV-009, GOV-004, LSN-002) ----------
  function gateCheck(stage) {
    const missing = (stage.gate_artefacts || []).filter((a) => a.mandatory !== false && !(a.done && a.approved)).map((a) => a.text);
    const unmet = (stage.gate_criteria || []).filter((c) => !c.done).map((c) => c.text);
    return { missing, unmet, ok: !missing.length };
  }

  function submitGate(ctx, gate) {
    const p = repos.project.get(gate.project_id);
    mustEdit(ctx, p, 'plan');
    const stage = repos.stage.get(gate.stage_id);
    const check = gateCheck(stage);
    const enforcement = profileOf(p.profile_id).gateEnforcement || 'block';
    if (!check.ok && ['Proceed', 'Proceed with conditions'].includes(gate.decision) && enforcement === 'block') {
      throw unprocessable(`Mandatory gate artefacts are not complete and approved (GOV-009): ${check.missing.join('; ')}.`);
    }
    if (['Proceed', 'Proceed with conditions'].includes(gate.decision) && !gate.business_justification) {
      throw unprocessable('Confirm continued business justification before proceeding (GOV-004).');
    }
    const e = repos.engagement.get(p.engagement_id);
    entities.patch(ctx, 'gate_review', gate.id, { status: 'Submitted', gate_check: check }, 'Gate decision submitted');
    if (p.state === 'In delivery') transition(sys(ctx), p.id, { to: 'Stage boundary' });
    workflow.request(ctx, {
      kind: 'gate', entity: 'gate_review', entityId: gate.id, engagementId: p.engagement_id, projectId: p.id,
      title: `Gate: ${stage.name} — ${gate.decision} (${p.name})`, link: `/projects/${p.id}/governance`,
      steps: [{ name: 'Gate approvers', mode: 'all', approvers: stage.gate_approvers?.length ? stage.gate_approvers : [e.manager_id] }],
    });
    if (!check.ok) notify.send([e.manager_id], { kind: 'gate', title: `Gate submitted with incomplete artefacts: ${stage.name}`, body: check.missing.join('; '), link: `/projects/${p.id}/governance`, engagementId: e.id, severity: 'high' });
    return { gate: repos.gate_review.get(gate.id), check };
  }
  workflow.on('gate', {
    onApprove(ctx, apv) {
      const gate = repos.gate_review.get(apv.entity_id);
      const p = repos.project.get(gate.project_id);
      const s = sys(ctx);
      entities.patch(s, 'gate_review', gate.id, { status: 'Approved', approved_at: today() }, `Gate decision approved: ${gate.decision}`);
      // Conditions are tracked to closure as actions.
      for (const c of gate.conditions || []) {
        if (!c.text || c.action_id) continue;
        const a = entities.create(s, 'action', { engagement_id: p.engagement_id, project_id: p.id, title: c.text, owner_id: c.owner || p.manager_id, due_date: c.due || addDays(today(), 14), source: 'Gate condition', source_ref: gate.id });
        c.action_id = a.id;
      }
      entities.patch(s, 'gate_review', gate.id, { conditions: gate.conditions || [] });
      const stages = repos.stage.find({ project_id: p.id }).sort((a, b) => a.seq - b.seq);
      const idx = stages.findIndex((x) => x.id === gate.stage_id);
      if (['Proceed', 'Proceed with conditions'].includes(gate.decision)) {
        repos.stage.patch(gate.stage_id, { status: 'Complete' }, null);
        if (stages[idx + 1]) repos.stage.patch(stages[idx + 1].id, { status: 'Active' }, null);
        const fresh = repos.project.get(p.id);
        if (fresh.state === 'Stage boundary') transition(s, p.id, { to: stages[idx + 1] ? 'In delivery' : 'Closing' });
        else if (fresh.state === 'Initiation' && fresh.baseline_approved) transition(s, p.id, { to: 'In delivery' });
      } else if (gate.decision === 'Stop') {
        notify.send([repos.engagement.get(p.engagement_id).manager_id], { kind: 'gate', title: `Gate decision: stop ${p.name}`, body: 'Proceed to premature closure (CLS-006).', link: `/projects/${p.id}/closure`, mandatory: true });
      }
      // LSN-002: prompt lesson capture at every gate.
      notify.send([p.manager_id], { kind: 'lessons', title: `Capture lessons from the ${repos.stage.get(gate.stage_id)?.name} gate`, link: `/projects/${p.id}/lessons`, engagementId: p.engagement_id });
    },
    onReject(ctx, apv, comment) {
      entities.patch(sys(ctx), 'gate_review', apv.entity_id, { status: 'Rejected', rejection: comment }, 'Gate decision rejected');
    },
  });

  // ---------- Closure (CLS-001..008) ----------
  function closureStatus(projectId) {
    const p = repos.project.get(projectId);
    const state = p.closure || {};
    const config = settings.get('closureChecklist') || CLOSURE_CHECKLIST;
    const open = (t) => app.entities.repos[t].find({ project_id: projectId }).filter((r) => !(app.entities.def(t).closed || []).includes(r.status));
    const auto = {
      deliverables: repos.deliverable.find({ project_id: projectId }).every((d) => ['Accepted', 'Withdrawn'].includes(d.status)),
      raid: ['risk', 'issue', 'action', 'dependency', 'assumption'].every((t) => open(t).length === 0),
      invoice: (() => { const pos = app.finance.position(projectId); return pos ? pos.wip < 1 && !pos.billingForecast.some((b) => b.status === 'Ready to invoice') : true; })(),
      time: !repos.time_entries.find({ project_id: projectId }).some((t) => ['Draft', 'Submitted'].includes(t.status)),
      people: !repos.allocation.find({ project_id: projectId }).some((a) => a.end_date > today()),
      lessons: repos.lesson.find({ project_id: projectId }).length > 0,
    };
    const items = config.map((c) => ({ ...c, done: c.auto ? Boolean(auto[c.key]) : Boolean(state[c.key]?.done), note: state[c.key]?.note || null, manual: !c.auto }));
    const blocking = items.filter((i) => i.mandatory && !i.done);
    return { items, blocking, exception: p.closure_exception || null, canClose: !blocking.length || p.closure_exception?.status === 'Approved' };
  }

  function updateClosureItem(ctx, projectId, key, { done, note }) {
    const p = repos.project.get(projectId);
    mustEdit(ctx, p, 'plan');
    return entities.patch(ctx, 'project', projectId, { closure: { ...(p.closure || {}), [key]: { done: Boolean(done), note: note || null, by: ctx.user.id, at: today() } } }, `Closure checklist: ${key} ${done ? 'complete' : 'reopened'}`);
  }

  function requestClosureException(ctx, projectId, { reason }) {
    const p = repos.project.get(projectId);
    mustEdit(ctx, p, 'plan');
    if (!reason) throw badRequest('Give a reason for the exception.');
    const e = repos.engagement.get(p.engagement_id);
    entities.patch(ctx, 'project', p.id, { closure_exception: { reason, status: 'Pending', items: closureStatus(projectId).blocking.map((b) => b.label) } });
    workflow.request(ctx, { kind: 'closure-exception', entity: 'project', entityId: p.id, engagementId: e.id, projectId: p.id, title: `Closure exception: ${p.name}`, link: `/projects/${p.id}/closure`, steps: [{ name: 'Engagement executive', mode: 'any', approvers: [e.executive_id] }] });
  }
  workflow.on('closure-exception', {
    onApprove: (ctx, apv) => { const p = repos.project.get(apv.entity_id); entities.patch(sys(ctx), 'project', p.id, { closure_exception: { ...p.closure_exception, status: 'Approved' } }, 'Closure exception approved (CLS-002)'); },
    onReject: (ctx, apv) => { const p = repos.project.get(apv.entity_id); entities.patch(sys(ctx), 'project', p.id, { closure_exception: { ...p.closure_exception, status: 'Rejected' } }, 'Closure exception rejected'); },
  });

  function close(ctx, projectId) {
    const p = repos.project.get(projectId);
    if (!ctx.access.can(p.engagement_id, 'setup', 'U')) throw forbidden('The engagement manager closes projects.');
    const st = closureStatus(projectId);
    if (!st.canClose) throw unprocessable(`Complete the mandatory closure items or get an exception approved (CLS-002): ${st.blocking.map((b) => b.label).join('; ')}.`);
    if (p.state !== 'Closing') transition(sys(ctx), projectId, { to: 'Closing' });
    return transition(ctx, projectId, { to: 'Closed' });
  }

  // CLS-004: transfer open risks, issues and actions to the engagement, another project or an operational owner.
  function transferOpen(ctx, projectId, { target, target_project_id: targetProject, owner_note }) {
    const p = repos.project.get(projectId);
    mustEdit(ctx, p, 'raid');
    const moved = [];
    for (const t of ['risk', 'issue', 'action', 'dependency', 'assumption']) {
      for (const r of repos[t].find({ project_id: projectId }).filter((x) => !(app.entities.def(t).closed || []).includes(x.status))) {
        if (target === 'engagement') repos[t].replace(r.id, { ...r, project_id: null, transferred_from: projectId, escalated: true }, ctx.user.id);
        else if (target === 'project') {
          const tp = repos.project.get(targetProject);
          if (!tp || tp.engagement_id !== p.engagement_id) throw badRequest('Choose a project in the same engagement.');
          repos[t].replace(r.id, { ...r, project_id: tp.id, transferred_from: projectId }, ctx.user.id);
        } else repos[t].replace(r.id, { ...r, status: t === 'risk' ? 'Closed' : t === 'issue' ? 'Closed' : t === 'action' ? 'Done' : t === 'dependency' ? 'Closed' : 'Validated', handed_over_to: owner_note || 'Operational owner' }, ctx.user.id);
        moved.push(`${r.ref}`);
      }
    }
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'transfer', entity: 'project', entityId: projectId, engagementId: p.engagement_id, summary: `Transferred ${moved.length} open RAID items to ${target} (CLS-004)`, after: { items: moved } });
    return { moved };
  }

  // CLS-005: close time codes after the grace period for final timesheets.
  function closeTimeCodes() {
    let n = 0;
    for (const p of repos.project.find({})) {
      if (p.time_codes_close_on && p.time_codes_close_on <= today() && !p.time_codes_closed) {
        repos.project.patch(p.id, { time_codes_closed: true }, null);
        audit.record({ action: 'time-codes', entity: 'project', entityId: p.id, engagementId: p.engagement_id, summary: `Time codes closed after the grace period (CLS-005)` });
        n++;
      }
    }
    return `${n} closed`;
  }

  // ---------- Engagement lifecycle (CLS-007) ----------
  function engagementClosure(engId) {
    const e = repos.engagement.get(engId);
    const projects = repos.project.find({ engagement_id: engId });
    const state = e.closure || {};
    const auto = {
      projects: projects.every((p) => ['Closed', 'Cancelled', 'Archived'].includes(p.state)),
      final_invoice: projects.every((p) => { const pos = app.finance.position(p.id); return !pos || pos.wip < 1; }),
    };
    const items = (settings.get('engagementClosure') || ENGAGEMENT_CLOSURE).map((c) => ({ ...c, done: c.auto ? auto[c.key] : Boolean(state[c.key]?.done), note: state[c.key]?.note || null }));
    return { items, blocking: items.filter((i) => i.mandatory && !i.done) };
  }

  function engagementTransition(ctx, e, to, reason) {
    const allowed = { Proposed: ['Active'], Active: ['On hold', 'Closing'], 'On hold': ['Active'], Closing: ['Closed', 'Active'], Closed: [] };
    if (!(allowed[e.status] || []).includes(to)) throw badRequest(`An engagement cannot move from ${e.status} to ${to}.`);
    if (to === 'Closed') {
      const st = engagementClosure(e.id);
      if (st.blocking.length) throw unprocessable(`Close all projects and complete contractual obligations first (CLS-007): ${st.blocking.map((b) => b.label).join('; ')}.`);
    }
    if (to === 'On hold' && !reason) throw badRequest('Give a reason.');
    return entities.patch(ctx, 'engagement', e.id, { status: to, status_reason: reason || null, closed_at: to === 'Closed' ? today() : null }, `Engagement: ${e.status} → ${to}`);
  }

  function updateEngagementClosureItem(ctx, engId, key, { done, note }) {
    const e = repos.engagement.get(engId);
    if (!ctx.access.can(engId, 'setup', 'U')) throw forbidden();
    return entities.patch(ctx, 'engagement', engId, { closure: { ...(e.closure || {}), [key]: { done: Boolean(done), note, by: ctx.user.id, at: today() } } });
  }

  // ---------- ENG-003: move a project between engagements of the same client (audited) ----------
  function move(ctx, projectId, toEngagementId) {
    const p = repos.project.get(projectId);
    const from = repos.engagement.get(p.engagement_id);
    const to = repos.engagement.get(toEngagementId);
    if (!to || to.client_id !== from.client_id) throw badRequest('Projects move only between engagements of the same client.');
    if (!ctx.access.can(from.id, 'setup', 'U') || !ctx.access.can(to.id, 'setup', 'U')) throw forbidden('You need set-up rights on both engagements.');
    if (repos.funding.find({ engagement_id: from.id }).some((f) => f.project_id === projectId)) throw unprocessable('Remove the project’s funding allocations first; SOWs and POs stay with their engagement.');
    const tables = new Set(Object.values(app.entities.repos).map((r) => r.table));
    app.db.tx(() => {
      for (const t of tables) app.db.prepare(`UPDATE ${t} SET engagement_id = ? WHERE project_id = ?`).run(to.id, projectId);
      app.db.prepare('UPDATE projects SET engagement_id = ? WHERE id = ?').run(to.id, projectId);
    });
    app.memberships.ensure(ctx, { engagementId: to.id, userId: p.manager_id, role: 'project_manager' });
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'move', entity: 'project', entityId: projectId, engagementId: to.id, summary: `Project moved from ${from.code} to ${to.code} (ENG-003)`, before: { engagement: from.code }, after: { engagement: to.code } });
    app.finance.clearMemo();
    return repos.project.get(projectId);
  }

  // Budget months for a project (used by the budget editor).
  const budgetMonths = (p) => monthsBetween(monthOf(p.start_date), monthOf(p.end_date));

  return {
    profiles, templates, profileOf, createFromTemplate, suggestLessons, updateGovernance, submitCommercial, transition, createBaseline, submitBaseline,
    gateCheck, submitGate, closureStatus, updateClosureItem, requestClosureException, close, transferOpen, closeTimeCodes,
    engagementClosure, engagementTransition, updateEngagementClosureItem, move, budgetMonths, ACTIVE,
  };
}
