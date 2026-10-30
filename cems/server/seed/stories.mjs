// The demo engagements, written as dated events. Every date is relative to today, so the portfolio
// always looks current: a closed review from last year, a three-project transformation in build,
// an assurance engagement on milestones and a retainer, a restricted due diligence and a new win.
import fs from 'node:fs';
import path from 'node:path';
import { addDays, weekStart, monthOf, monthEnd, addMonths, nthBusinessDay, dayOfWeek } from '../../shared/dates.js';
import { fmtDate } from '../../shared/format.js';
import { svgToPng } from '../lib/reports/charts.mjs';

export async function buildStories(app, kit, S) {
  const { T, users, people, C, K, panel, T_, pdf, reports, tplDir } = S;
  const { on, bd, as, approve, act } = kit;
  const { repos, entities } = app;
  const W = (k) => addDays(weekStart(T), 7 * k); // Monday k weeks from this week
  const fri = (k) => addDays(W(k), 4);
  const E = {}; // engagement ids
  const P = {}; // project ids
  const R = {}; // other records by key
  const pmOf = {}; // project id -> PM key
  const emOf = {}; // engagement id -> EM key
  const D = (date) => fmtDate(date);

  // ---------- Shared builders ----------
  function engagement(key, date, emKey, data) {
    on(date, '09:00', `Create engagement ${data.name}`, () => {
      E[key] = entities.create(as('olivia'), 'engagement', { ...data, status: 'Proposed', manager_id: users[emKey], executive_id: users.olivia }).id;
      emOf[E[key]] = emKey;
    });
  }
  const activate = (key, date, emKey) => on(date, '10:00', 'Engagement active', () => act(emKey, 'engagement', E[key], 'transition', { to: 'Active' }));
  const member = (engKey, userKey, role, opts = {}) => app.memberships.list(E[engKey]).find((m) => m.user_id === users[userKey] && m.role === role)
    || app.memberships.add(as(emOf[E[engKey]] || 'olivia'), { engagementId: E[engKey], userId: users[userKey], role, ...opts });
  // ACC-001: a project manager's role is limited to the projects they manage.
  function scopePm(engKey, pmKey, projectId) {
    const m = app.memberships.list(E[engKey]).find((x) => x.user_id === users[pmKey] && x.role === 'project_manager');
    if (m) app.memberships.update(as(emOf[E[engKey]]), m.id, { project_ids: [...new Set([...(m.project_ids || []), projectId])] });
  }
  function project(key, engKey, date, emKey, input) {
    on(date, '11:00', `Create project ${input.name}`, () => {
      const { project: p } = app.projects.createFromTemplate(as(emKey), { engagement_id: E[engKey], ...input, manager_id: users[input.pm] });
      P[key] = p.id;
      pmOf[p.id] = input.pm;
      if (users[input.pm] !== repos.engagement.get(E[engKey]).manager_id) scopePm(engKey, input.pm, p.id);
      if (input.cap || input.retainer_fee) entities.patch(kit.sys, 'project', p.id, { cap: input.cap || null, retainer_fee: input.retainer_fee || null }, 'Commercial terms recorded');
      if (input.margin_target) entities.update(as(emKey), 'project', p.id, { margin_target: input.margin_target });
    });
  }
  function commercial(key, date, emKey, { price, cost, exec = false, notes }) {
    on(date, '14:00', 'Commercial approval request', () => app.projects.submitCommercial(as(emKey), P[key], { price, cost, notes, pricing_basis: notes }));
    on(date, '16:00', 'Commercial approval (EM)', () => approve(emKey, 'project', P[key], { kind: 'commercial', comment: 'Pricing and resourcing reviewed.' }));
    if (exec) on(bd(date, 1), '10:00', 'Commercial approval (EE)', () => approve('olivia', 'project', P[key], { kind: 'commercial', comment: 'Approved: margin and risk acceptable.' }));
  }
  const allocate = (pk, personKey, from, to, hours, extra = {}) => entities.create(as(pmOf[P[pk]]), 'allocation', {
    project_id: P[pk], person_id: people[personKey], rate_role: extra.role || repos.person.get(people[personKey]).grade, start_date: from, end_date: to, hours_per_week: hours,
    status: extra.status || 'Confirmed', billable: extra.billable ?? true, key_person: Boolean(extra.key), onboarding: extra.onboarding || [],
  });
  function baseline(pk, emKey, submitDate, approveDate, { scale = 1, contingency = 0, rebuild } = {}) {
    on(submitDate, '11:00', 'Budget and baseline submitted', () => {
      const pm = pmOf[P[pk]];
      let lines = app.forecast.bottomUp(as(pm), P[pk]).map((l) => ({ ...l, cost: l.cost * scale, revenue: l.revenue * scale, hours: l.hours * scale }));
      if (rebuild) lines = rebuild(lines);
      app.forecast.saveDraft(as(pm), P[pk], { lines, contingency });
      app.projects.submitBaseline(as(pm), P[pk], {});
    });
    on(approveDate, '15:00', 'Baseline approved', () => {
      approve(emKey, 'project', P[pk], { kind: 'baseline', comment: 'Plan, budget and tolerances agreed.' });
      kit.allocateBudget(P[pk], pmOf[P[pk]]);
    });
  }
  const create = (key, entity, data) => entities.create(as(key), entity, data);
  const update = (key, entity, id, data) => entities.update(as(key), entity, id, data);
  const raid = (byKey, entity, pk, data) => create(byKey, entity, { engagement_id: repos.project.get(P[pk])?.engagement_id, project_id: P[pk], ...data });
  function deliverable(pk, data) {
    return create(pmOf[P[pk]], 'deliverable', { project_id: P[pk], owner_id: users[pmOf[P[pk]]], acceptance_criteria: 'Meets the agreed product description and quality criteria; reviewed by the client approver', review_days: 5, ...data });
  }
  // Internal review → passed quality review(s) → submitted; the acceptance happens later.
  function readyAndSubmit(pk, delKey, date, { reviewer = 'marcus', kind = 'Peer review', exec = false, version = '1.0', findings = [] } = {}) {
    on(bd(date, -2), '10:00', 'Deliverable to internal review', () => act(pmOf[P[pk]], 'deliverable', R[delKey].id, 'internal_review'));
    on(bd(date, -1), '15:00', 'Quality review passed', () => {
      kit.qualityReview(pmOf[P[pk]], R[delKey].id, { kind, reviewer, planned: bd(date, -1), actual: bd(date, -1), result: findings.length ? 'Pass with comments' : 'Pass', findings });
      if (exec) kit.qualityReview(pmOf[P[pk]], R[delKey].id, { kind: 'Engagement executive review', reviewer: 'olivia', planned: bd(date, -1), actual: bd(date, -1), result: 'Pass with comments', findings: [{ severity: 'Minor', text: 'Sharpen the executive summary', resolution: 'Updated' }] });
    });
    on(date, '11:00', 'Deliverable submitted', () => act(pmOf[P[pk]], 'deliverable', R[delKey].id, 'submit', { version }));
  }
  const acceptByClient = (clientKey, delKey, date, comments) => on(date, '14:30', 'Client acceptance in the portal', () => act(clientKey, 'deliverable', R[delKey].id, 'accept', { comments }));
  const acceptRecorded = (pmKey, delKey, date, comments) => on(date, '14:30', 'Client acceptance recorded', () => act(pmKey, 'deliverable', R[delKey].id, 'accept', { comments }));
  const milestone = (pk, data) => create(pmOf[P[pk]], 'milestone', { project_id: P[pk], ...data });
  const achieve = (pmKey, msKey, date) => on(date, '16:00', 'Milestone achieved', () => update(pmKey, 'milestone', R[msKey].id, { actual_date: date }));
  const reforecast = (pmKey, msKey, date, to, note) => on(date, '13:00', 'Milestone reforecast', () => update(pmKey, 'milestone', R[msKey].id, { forecast_date: to, notes: note }));
  const taskId = (pk, name) => repos.work_item.find({ project_id: P[pk] }).find((t) => t.name === name)?.id;
  function moveTask(pmKey, pk, name, start, finish) {
    const id = taskId(pk, name);
    const t = repos.work_item.get(id);
    update(pmKey, 'work_item', id, { start_date: start || t.start_date, finish_date: finish });
  }
  const weekly = (from, to, fn) => { for (const f of kit.fridays(from, to)) fn(f); };
  const progressEvery = (pk, from, to) => weekly(from, to, (f) => on(f, '17:30', 'Plan progress', () => kit.progress(P[pk], f, pmOf[P[pk]])));
  const statusEvery = (pk, from, to, opts = () => ({})) => weekly(from, to, (f) => {
    on(addDays(f, -1), '15:00', 'Status update submitted', () => kit.statusUpdate(pmOf[P[pk]], P[pk], f, opts(f)));
    on(f, '09:30', 'Status update approved', () => {
      const su = app.status.latestFor(P[pk], f);
      if (su?.status === 'Submitted') {
        const e = repos.engagement.get(su.engagement_id);
        const approver = Object.keys(users).find((k) => users[k] === (e.manager_id === users[pmOf[P[pk]]] ? e.executive_id : e.manager_id));
        approve(approver, 'status_update', su.id, { comment: 'Reviewed.' });
      }
    });
  });
  const fundingOf = (engKey, kind, instrumentId, pk, amount, emKey) => create(emKey, 'funding', { engagement_id: E[engKey], instrument_kind: kind, instrument_id: instrumentId, project_id: P[pk], amount });
  const lessons = (byKey, pk, items) => items.map((l) => raid(byKey, 'lesson', pk, { raised_by: users[byKey], date: l.date, ...l }));

  // =====================================================================================
  // E4 — Coastal Councils Alliance: Shared Services Review (Capped T&M, closed last year)
  // =====================================================================================
  const e4s = W(-56);
  const e4end = bd(e4s, 59);
  engagement('e4', addDays(e4s, -14), 'jack', {
    client_id: C.cca.id, name: 'Shared Services Review', type: 'advisory', practice: 'Strategy & Advisory', start_date: e4s, end_date: addDays(e4end, 28),
    description: 'Review of corporate services across seven member councils and a business case for a shared services entity.', objectives: ['Recommend a shared services operating model', 'Quantify savings over five years'],
    client_sponsor_id: K.peter.id, classification: 'Confidential', reporting_cadence: 'Fortnightly', report_approval: true, day_length: 7.5, rounding: 0.25, billing_unit: 'day', health_rule: 'worst',
    steerco_members: 'Peter Grant (chair), council general managers, Olivia Bennett, Jack Thompson', meeting_cadence: 'Monthly',
  });
  on(addDays(e4s, -10), '10:00', 'E4 contract', () => {
    R.e4sow = create('jack', 'contract', { engagement_id: E.e4, kind: 'SOW', reference: 'CCA-SOW-001', title: 'Shared services review and business case', value: 220000, start_date: e4s, end_date: addDays(e4end, 28), commercial_model: 'Capped T&M', status: 'Signed', signed_date: addDays(e4s, -10), payment_terms: '30 days from invoice' });
    R.e4po = create('jack', 'po', { engagement_id: E.e4, number: 'CCA-PO-19', value: 220000, gst_basis: 'exclusive', contract_id: R.e4sow.id, valid_from: e4s, valid_to: addDays(e4end, 60), status: 'Active' });
    create('jack', 'distribution_list', { engagement_id: E.e4, name: 'Fortnightly status', report_type: 'Weekly status', recipients: [{ name: 'Peter Grant', email: K.peter.email, kind: 'client' }, { name: 'Jack Thompson', email: 'jack.thompson@ctoconsulting.com.au', kind: 'firm' }, { name: 'Olivia Bennett', email: 'olivia.bennett@ctoconsulting.com.au', kind: 'firm' }] });
  });
  activate('e4', addDays(e4s, -7), 'jack');
  project('e4p1', 'e4', addDays(e4s, -7), 'jack', { template_id: 'business-case', name: 'Shared services review', pm: 'tom', start_date: e4s, end_date: e4end, commercial_model: 'Capped T&M', cap: 220000 });
  commercial('e4p1', addDays(e4s, -6), 'jack', { price: 220000, cost: 112000, notes: 'Capped T&M at Firm standard rates; cap $220,000.' });
  on(addDays(e4s, -5), '09:30', 'E4 team', () => {
    fundingOf('e4', 'contract', R.e4sow.id, 'e4p1', 220000, 'jack');
    fundingOf('e4', 'po', R.e4po.id, 'e4p1', 220000, 'jack');
    allocate('e4p1', 'tom', e4s, e4end, 30);
    allocate('e4p1', 'ethan', e4s, e4end, 37.5);
    allocate('e4p1', 'mia', e4s, e4end, 30);
    allocate('e4p1', 'jack', e4s, e4end, 6);
    for (const k of ['ethan', 'mia']) member('e4', k, 'team_member');
  });
  on(addDays(e4s, -4), '10:00', 'E4 plan', () => {
    const ms = repos.milestone.find({ project_id: P.e4p1 });
    R.e4m1 = ms.find((m) => /Draft/.test(m.name));
    R.e4m2 = ms.find((m) => /Final/.test(m.name));
    const dels = repos.deliverable.find({ project_id: P.e4p1 });
    R.e4d1 = dels.find((d) => /Draft/.test(d.title));
    R.e4d2 = dels.find((d) => /Final/.test(d.title));
    for (const d of dels) update('tom', 'deliverable', d.id, { client_approver_id: K.peter.id, client_visible: true });
    for (const t of kit.leafTasks(P.e4p1)) update('tom', 'work_item', t.id, { assignees: [users.tom, users.ethan, users.mia] });
    app.reports.setDefault(as('jack'), E.e4, 'Weekly status', T_.weeklyClient);
  });
  baseline('e4p1', 'jack', bd(e4s, 2), bd(e4s, 3), { scale: 1.02, contingency: 8000 });
  on(bd(e4s, 6), '10:00', 'E4 RAID', () => {
    R.e4i1 = raid('tom', 'issue', 'e4p1', { title: 'Finance data from two councils incomplete', description: 'Two councils have not provided three years of corporate services cost data.', severity: 'Medium', priority: 'High', owner_id: users.tom, target_date: bd(e4s, 20), client_visible: true });
    R.e4a1 = raid('tom', 'action', 'e4p1', { title: 'Collect asset registers from member councils', owner_org: 'Client', owner_name: 'Council finance leads', due_date: bd(e4s, 15), client_visible: true });
    R.e4dec = raid('jack', 'decision', 'e4p1', { title: 'Shortlist three operating models for detailed analysis', status: 'Required', due_date: bd(e4s, 25), decision_maker: 'Steering committee', client_visible: true });
  });
  progressEvery('e4p1', bd(e4s, 3), e4end);
  const e4Fortnight = (f) => Math.round((new Date(f) - new Date(fri(-55))) / 86400000 / 7) % 2 === 1;
  weekly(bd(e4s, 8), e4end, (f) => {
    if (!e4Fortnight(f)) return;
    on(addDays(f, -1), '15:00', 'E4 status update', () => kit.statusUpdate('tom', P.e4p1, f));
    on(f, '09:30', 'E4 status approved', () => { const su = app.status.latestFor(P.e4p1, f); if (su?.status === 'Submitted') approve('jack', 'status_update', su.id, { comment: 'Reviewed.' }); });
  });
  on(bd(e4s, 19), '11:00', 'E4 issue resolved', () => {
    update('tom', 'issue', R.e4i1.id, { status: 'Resolved', resolution: 'Data received after the sponsor followed up with both general managers.' });
    update('tom', 'action', R.e4a1.id, { status: 'Done' });
  });
  on(bd(e4s, 24), '16:00', 'E4 decision made', () => update('jack', 'decision', R.e4dec.id, { status: 'Made', decision_date: bd(e4s, 24), forum: 'Steering committee', rationale: 'Hub-and-spoke, lead-council and new entity models carried forward.' }));
  readyAndSubmit('e4p1', 'e4d1', bd(e4s, 43), { reviewer: 'jack', exec: true });
  acceptRecorded('tom', 'e4d1', bd(e4s, 46), 'Accepted by the steering committee on the day; email from Peter Grant on file.');
  achieve('tom', 'e4m1', bd(e4s, 46));
  readyAndSubmit('e4p1', 'e4d2', bd(e4s, 55), { reviewer: 'jack', exec: true, version: '1.0' });
  acceptRecorded('tom', 'e4d2', bd(e4s, 58), 'Final business case endorsed by the Alliance board; resolution 2025/41 on file.');
  achieve('tom', 'e4m2', bd(e4s, 58));
  for (const m of kit.monthsFrom(monthOf(e4s), monthOf(e4end))) {
    const draftDate = nthBusinessDay(addMonths(m, 1), 1, kit.H);
    on(draftDate, '09:30', `E4 invoice ${m}`, () => kit.invoice(P.e4p1, monthEnd(m), { em: 'jack', draftDate, paidAfterDays: 24 }));
  }
  if (reports) {
    const pe = kit.fridays(bd(e4s, 44), bd(e4s, 56)).find(e4Fortnight);
    on(pe, '14:00', 'E4 fortnightly report', async () => {
      await kit.weeklyReport('jack', E.e4, pe, { approver: 'olivia', pdf, narrative: { key_messages: '- Draft business case accepted by the steering committee\n- Final business case on track for the Alliance board', summary: 'The review is on track. The draft business case recommends a lead-council shared services model with five-year net savings of $14.2m.', decisions_required: 'None this period.', escalations: 'None.' } });
    });
  }
  on(bd(e4end, 5), '10:00', 'E4 lessons and closure prep', () => {
    for (const r of repos.risk.find({ project_id: P.e4p1 }).filter((x) => x.status === 'Open')) update('tom', 'risk', r.id, { status: 'Closed' });
    const ls = lessons('tom', 'e4p1', [
      { title: 'Agree the data request schedule with every council in week one', what_happened: 'Two councils were six weeks late with cost data.', recommendation: 'Issue a data request schedule at mobilisation and track it as a client dependency.', category: 'Client relationship', tags: ['data', 'local government', 'business case'], date: bd(e4end, 5), impact: 'Analysis compressed into the final month.' },
      { title: 'Use a capped T&M model only with a weekly cap forecast', what_happened: 'Effort ran 15% above estimate; the cap absorbed it.', recommendation: 'Report cap headroom weekly and raise change requests before the cap is reached.', category: 'Commercial', tags: ['capped T&M', 'commercial'], date: bd(e4end, 5), impact: 'Write-off of effort above the cap.' },
      { title: 'Steering committee walkthroughs before formal submission', what_happened: 'Walking the committee through drafts avoided rework on the final business case.', recommendation: 'Hold a walkthrough before each formal submission.', category: 'Quality', tags: ['deliverables', 'governance'], date: bd(e4end, 5) },
    ]);
    act('tom', 'lesson', ls[0].id, 'publish', { summary: 'For multi-entity clients, issue a data request schedule at mobilisation and track it as a client dependency; late data compresses analysis.' });
    act('tom', 'lesson', ls[1].id, 'publish', { summary: 'On capped T&M work, forecast cap headroom weekly and raise changes before the cap is reached.' });
    create('jack', 'satisfaction', { engagement_id: E.e4, date: bd(e4end, 5), respondent: 'Peter Grant', score: 9, reporting_score: 8, comments: 'Clear, practical recommendations and excellent board materials.' });
  });
  on(bd(e4end, 20), '10:00', 'E4 project closed', () => {
    for (const key of ['feedback', 'documents', 'access']) app.projects.updateClosureItem(as('tom'), P.e4p1, key, { done: true, note: key === 'documents' ? 'Archived to the engagement SharePoint site' : key === 'access' ? 'Council data room access removed' : 'Survey score 9/10' });
    app.projects.close(as('jack'), P.e4p1);
  });
  on(bd(e4end, 25), '10:00', 'E4 engagement closing', () => {
    app.projects.updateEngagementClosureItem(as('jack'), E.e4, 'handover', { done: true, note: 'Implementation roadmap handed to the Alliance transition team' });
    app.projects.updateEngagementClosureItem(as('jack'), E.e4, 'client_data', { done: true, note: 'Council data destroyed; certificate of destruction on file' });
    act('jack', 'engagement', E.e4, 'transition', { to: 'Closing' });
  });
  on(bd(e4end, 30), '10:00', 'E4 engagement closed', () => act('jack', 'engagement', E.e4, 'transition', { to: 'Closed' }));

  // =====================================================================================
  // E1 — Department of Regional Services: Digital Services Transformation
  // =====================================================================================
  const e1s = W(-18);
  const e1end = addDays(e1s, 7 * 52 - 3);
  engagement('e1', addDays(e1s, -21), 'marcus', {
    client_id: C.drs.id, name: 'Digital Services Transformation', type: 'delivery', practice: 'Digital Delivery', start_date: e1s, end_date: e1end,
    description: 'Moves the Department’s grant programs onto a single digital platform and supports regional offices through the change.',
    objectives: ['Reduce grant processing time from 40 to 15 days', 'Move all grant programs onto one digital platform', 'Lift digital adoption across regional offices to 80%'],
    client_sponsor_id: K.rachel.id, classification: 'OFFICIAL: Sensitive', security_requirements: 'Baseline clearance for all team members; data hosted in Australia in an IRAP-assessed cloud; no offshore access.',
    reporting_cadence: 'Weekly', report_approval: true, required_meetings: 'Monthly steering committee; fortnightly project boards', client_shows_evm: false,
    steerco_members: 'Rachel Kim (chair), Dr Anika Rao, James Wilson, Olivia Bennett, Marcus Chen', meeting_cadence: 'Monthly, second Thursday',
    decision_rights: 'Steering committee approves changes above $50,000 or 15 business days; the engagement manager approves below that.', delegations: 'Engagement manager: changes to $50,000; project managers: changes to $10,000.',
    escalation_path: 'Project manager → engagement manager → steering committee → Deputy Secretary and Partner', day_length: 7.5, rounding: 0.25, billing_unit: 'day', expense_markup: 0,
    health_rule: 'worst', onboarding_requirements: ['Baseline clearance confirmed', 'Building pass issued', 'DRS network account', 'Security induction'],
    data_obligations: 'Return or securely destroy all Department data within 30 days of contract end (clause 18.4).', ai_enabled: false, internal_notes: 'Watch PO capacity: the Department needs a PO increase before the new year.',
  });
  on(addDays(e1s, -16), '10:00', 'E1 SOW drafted', () => {
    R.sow1 = create('marcus', 'contract', {
      engagement_id: E.e1, kind: 'SOW', reference: 'DRS-SOW-001', title: 'Digital services transformation: discovery, platform and adoption', value: 1900000, start_date: e1s, end_date: e1end, commercial_model: 'T&M', status: 'Draft', agreement_id: panel.id,
      payment_terms: '20 days from a correctly rendered invoice', deliverables: 'Discovery report and business case; grants platform releases; change and adoption program', key_personnel: 'Marcus Chen (engagement manager); Priya Raman (project manager); Aisha Mohammed (integration lead)',
      liability_cap: 4000000, special_conditions: 'Key personnel may only be replaced with the Department’s approval.', key_dates: [{ label: 'Extension option decision (6 months)', date: addDays(T, 45) }, { label: 'Contract end', date: e1end }],
    });
  });
  on(addDays(e1s, -10), '15:00', 'E1 SOW signed and POs received', () => {
    update('marcus', 'contract', R.sow1.id, { status: 'Signed', signed_date: addDays(e1s, -10) });
    R.po1 = create('marcus', 'po', { engagement_id: E.e1, number: '4500123', value: 990000, gst_basis: 'inclusive', contract_id: R.sow1.id, valid_from: e1s, valid_to: e1end, status: 'Active', notes: 'Platform and adoption; GST-inclusive per the Department’s purchasing system.' });
    R.po2 = create('marcus', 'po', { engagement_id: E.e1, number: '4500456', value: 620000, gst_basis: 'exclusive', contract_id: R.sow1.id, valid_from: e1s, valid_to: e1end, status: 'Active' });
    create('daniel', 'rate_card', { name: 'DSR engagement named rates', level: 'Engagement', engagement_ref: E.e1, client_id: C.drs.id, unit: 'day', currency: 'AUD', effective_from: e1s, status: 'Approved', rates: [{ person_id: people.aisha, role: 'Senior Consultant', rate: 1640, effective_from: e1s }] });
  });
  activate('e1', addDays(e1s, -9), 'marcus');
  on(addDays(e1s, -8), '09:00', 'E1 governance set-up', () => {
    member('e1', 'rachel', 'client', { endDate: e1end });
    member('e1', 'james', 'client', { endDate: e1end });
    const stake = (name, data) => create('marcus', 'stakeholder', { engagement_id: E.e1, name, organisation: 'Department of Regional Services', relationship_owner: users.marcus, ...data });
    stake('Rachel Kim', { contact_id: K.rachel.id, role: 'Sponsor; steering committee chair', influence: 5, interest: 5, attitude: 'Champion', current_level: 'Leading', desired_level: 'Leading', comm_preferences: 'Weekly report; fortnightly one-on-one', interactions: 'Values early warning on budget and PO capacity.' });
    stake('Dr Anika Rao', { contact_id: K.anika.id, role: 'CIO; senior supplier', influence: 5, interest: 3, attitude: 'Neutral', current_level: 'Neutral', desired_level: 'Supportive', comm_preferences: 'Monthly briefing; technical papers in advance', interactions: 'Concerned about platform security accreditation and DRS IT capacity.' });
    stake('James Wilson', { contact_id: K.james.id, role: 'Client PMO director', influence: 3, interest: 5, attitude: 'Supporter', current_level: 'Supportive', desired_level: 'Supportive', comm_preferences: 'Weekly status meeting' });
    stake('Regional office managers', { role: 'Business owners in 14 regional offices', influence: 3, interest: 4, attitude: 'Critic', current_level: 'Resistant', desired_level: 'Supportive', comm_preferences: 'Monthly town hall; champions network', organisation: 'DRS regional network' });
    stake('Sam Patel', { contact_id: K.sam.id, role: 'Finance business partner', influence: 2, interest: 3, attitude: 'Neutral', current_level: 'Neutral', desired_level: 'Supportive' });
    const comm = (audience, data) => create('marcus', 'comm_plan', { engagement_id: E.e1, audience, owner_id: users.marcus, ...data });
    comm('Sponsor and DRS PMO', { information: 'Weekly status report: RAG, milestones, RAID, financials', purpose: 'Inform and escalate', channel: 'Report', frequency: 'Weekly', template: 'Weekly engagement status (client)' });
    comm('Steering committee', { information: 'Progress, decisions, risks above tolerance, change requests', purpose: 'Decide', channel: 'Meeting', frequency: 'Monthly', template: 'Steering committee pack' });
    comm('Regional office managers', { information: 'Change impacts, training schedule, go-live readiness', purpose: 'Engage', channel: 'Workshop', frequency: 'Monthly', owner_id: users.tom });
    comm('Project board', { information: 'Project-level progress and issues', purpose: 'Direct', channel: 'Meeting', frequency: 'Fortnightly', owner_id: users.priya });
    create('marcus', 'distribution_list', { engagement_id: E.e1, name: 'Weekly status', report_type: 'Weekly status', recipients: [
      { name: 'Rachel Kim', email: K.rachel.email, kind: 'client' }, { name: 'James Wilson', email: K.james.email, kind: 'client' }, { name: 'Dr Anika Rao', email: K.anika.email, kind: 'client' },
      { name: 'Olivia Bennett', email: 'olivia.bennett@ctoconsulting.com.au', kind: 'firm' }, { name: 'Marcus Chen', email: 'marcus.chen@ctoconsulting.com.au', kind: 'firm' },
    ] });
    create('marcus', 'scope_item', { engagement_id: E.e1, kind: 'In scope', text: 'Grants lifecycle on one platform: application, assessment, approval, payment and acquittal.', contract_id: R.sow1.id });
    create('marcus', 'scope_item', { engagement_id: E.e1, kind: 'In scope', text: 'Integration with the Department’s payments system and identity platform.', contract_id: R.sow1.id });
    create('marcus', 'scope_item', { engagement_id: E.e1, kind: 'Out of scope', text: 'Changes to the finance system (SAP) other than the payments interface.', contract_id: R.sow1.id });
    create('marcus', 'document', { engagement_id: E.e1, title: 'Statement of work DRS-SOW-001', doc_type: 'Contract', version: '1.0', status: 'Final', owner_id: users.marcus, classification: 'OFFICIAL: Sensitive', location: 'https://ctoconsulting.sharepoint.com/sites/DRS-E001/Contracts/DRS-SOW-001.pdf' });
    app.reports.setDefault(as('marcus'), E.e1, 'Weekly status', T_.weeklyClient);
  });

  // ---------- P01 Discovery and business case (milestone fixed price, closed) ----------
  project('p01', 'e1', addDays(e1s, -7), 'marcus', { template_id: 'discovery', name: 'Discovery and business case', pm: 'priya', start_date: e1s, commercial_model: 'Milestone fixed price', fixed_price: 180000, description: 'Current state assessment, future state options and the business case for the grants platform.' });
  commercial('p01', addDays(e1s, -7), 'marcus', { price: 180000, cost: 104000, notes: 'Two payment milestones: current state assessment ($72,000) and discovery report ($108,000).' });
  on(addDays(e1s, -6), '10:00', 'P01 plan and team', () => {
    fundingOf('e1', 'contract', R.sow1.id, 'p01', 180000, 'marcus');
    fundingOf('e1', 'po', R.po2.id, 'p01', 180000, 'marcus');
    const end = repos.project.get(P.p01).end_date;
    allocate('p01', 'priya', e1s, end, 22.5);
    allocate('p01', 'aisha', e1s, end, 37.5);
    allocate('p01', 'hannah', e1s, end, 37.5);
    allocate('p01', 'emily', e1s, end, 15);
    allocate('p01', 'marcus', e1s, end, 6);
    for (const k of ['aisha', 'hannah', 'emily']) member('e1', k, 'team_member');
    for (const t of kit.leafTasks(P.p01)) update('priya', 'work_item', t.id, { assignees: [users.priya, users.aisha, users.hannah, ...(/interview|current/i.test(t.name) ? [users.emily] : [])] });
    const ms = repos.milestone.find({ project_id: P.p01 })[0];
    R.p01m2 = update('priya', 'milestone', ms.id, { name: 'Discovery report and business case accepted', billing_amount: 108000 });
    R.p01m1 = milestone('p01', { name: 'Current state assessment accepted', kind: 'Payment', key: true, planned_date: bd(e1s, 24), billing_amount: 72000 });
    R.p01d2 = repos.deliverable.find({ project_id: P.p01 })[0];
    update('priya', 'deliverable', R.p01d2.id, { title: 'Discovery report and business case', client_approver_id: K.rachel.id, billing_milestone_id: R.p01m2.id, description: 'Future state options, recommended option and business case.' });
    R.p01d1 = deliverable('p01', { title: 'Current state assessment', planned_date: bd(e1s, 22), client_approver_id: K.rachel.id, billing_milestone_id: R.p01m1.id, description: 'Assessment of the 23 grant programs, systems and processes.' });
    for (const [ms2, amt] of [[R.p01m1, 72000], [R.p01m2, 108000]]) create('daniel', 'billing_event', { project_id: P.p01, kind: 'Milestone', description: `${ms2.name} (payment milestone)`, planned_date: ms2.planned_date, amount: amt, milestone_id: ms2.id, po_id: R.po2.id, contract_id: R.sow1.id });
  });
  baseline('p01', 'marcus', bd(e1s, 2), bd(e1s, 4), { scale: 1.02, contingency: 10000 });
  progressEvery('p01', bd(e1s, 4), addDays(e1s, 7 * 8));
  statusEvery('p01', bd(e1s, 5), bd(e1s, 41));
  readyAndSubmit('p01', 'p01d1', bd(e1s, 22), { reviewer: 'marcus' });
  acceptByClient('rachel', 'p01d1', bd(e1s, 27), 'Accepted. A thorough baseline; please carry the regional office findings into the change plan.');
  readyAndSubmit('p01', 'p01d2', bd(e1s, 37), { reviewer: 'marcus', exec: true, findings: [{ severity: 'Minor', text: 'Benefits table needs sources', resolution: 'Sources added' }] });
  acceptByClient('rachel', 'p01d2', bd(e1s, 41), 'Accepted. The recommended option was endorsed by the steering committee.');
  on(bd(e1s, 28), '09:30', 'P01 invoice (milestone 1)', () => kit.invoice(P.p01, bd(e1s, 28), { em: 'marcus', draftDate: bd(e1s, 28), paidAfterDays: 19 }));
  on(bd(e1s, 42), '09:30', 'P01 invoice (milestone 2)', () => kit.invoice(P.p01, bd(e1s, 42), { em: 'marcus', draftDate: bd(e1s, 42), paidAfterDays: 20 }));
  on(bd(e1s, 3), '10:00', 'P01 RAID', () => {
    R.p01i1 = raid('priya', 'issue', 'p01', { title: 'Building passes delayed for two team members', description: 'Security office backlog; two team members working from the Firm office.', severity: 'Low', owner_id: users.priya, target_date: bd(e1s, 8), client_visible: false });
    R.p01dec = raid('marcus', 'decision', 'p01', { title: 'Adopt the Department’s identity platform for sign-in', status: 'Required', due_date: bd(e1s, 30), decision_maker: 'Steering committee', client_visible: true, context: 'Options: Department identity platform, platform-native accounts, myGovID.' });
  });
  on(bd(e1s, 7), '11:00', 'P01 issue resolved', () => update('priya', 'issue', R.p01i1.id, { status: 'Resolved', resolution: 'Passes issued after the security office cleared its backlog.' }));
  on(bd(e1s, 43), '10:00', 'P01 closure', () => {
    for (const r of repos.risk.find({ project_id: P.p01 }).filter((x) => x.status === 'Open')) update('priya', 'risk', r.id, { status: 'Closed' });
    update('marcus', 'decision', R.p01dec.id, { status: 'Made', decision_date: bd(e1s, 30), forum: 'Steering committee', rationale: 'Single sign-on for staff and an existing security accreditation.' });
    const ls = lessons('priya', 'p01', [
      { title: 'Interview regional managers in their offices, not by video', what_happened: 'In-person interviews surfaced workarounds video calls had missed.', recommendation: 'Budget travel for in-person discovery in regional programs.', category: 'Delivery', tags: ['discovery', 'regional', 'government'], date: bd(e1s, 43) },
      { title: 'Tie payment milestones to deliverables the client already plans to review', what_happened: 'Milestone acceptance aligned with steering committee dates, so invoices went out on time.', recommendation: 'Align payment milestones with governance meetings.', category: 'Commercial', tags: ['milestones', 'billing'], date: bd(e1s, 43) },
    ]);
    act('priya', 'lesson', ls[1].id, 'publish', { summary: 'Align payment milestones with the client’s governance calendar so acceptance and invoicing are not delayed.' });
    for (const key of ['feedback', 'documents', 'access']) app.projects.updateClosureItem(as('priya'), P.p01, key, { done: true, note: 'Complete' });
  });
  on(bd(e1s, 45), '10:00', 'P01 closed', () => app.projects.close(as('marcus'), P.p01));

  // ---------- P02 Platform implementation (T&M, hybrid, earned value) ----------
  const s2 = W(-14);
  const D2 = (n) => bd(s2, n);
  const p2end = D2(125);
  project('p02', 'e1', addDays(s2, -14), 'marcus', { name: 'Grants platform implementation', pm: 'priya', profile_id: 'hybrid', approach: 'hybrid', start_date: s2, end_date: p2end, size: 'large', evm_required: true, commercial_model: 'T&M', description: 'Configure and integrate the grants platform; migrate active grants; go live and hand over to operations.', margin_target: 0.4 });
  commercial('p02', addDays(s2, -13), 'marcus', { price: 1200000, cost: 560000, exec: true, notes: 'T&M at DRS panel rates, named rate for the integration lead.' });
  on(addDays(s2, -10), '10:00', 'P02 plan, team and RAID', () => {
    fundingOf('e1', 'contract', R.sow1.id, 'p02', 1200000, 'marcus');
    fundingOf('e1', 'po', R.po1.id, 'p02', 900000, 'marcus');
    const spec = [
      { key: 'wp1', name: 'Mobilisation and initiation', stage: 'Discovery' },
      { key: 't11', parent: 'wp1', stage: 'Discovery', name: 'Mobilise team and onboarding', start: 0, days: 5, initiation: true, who: ['priya', 'liam'], effort: 45 },
      { key: 't12', parent: 'wp1', stage: 'Discovery', name: 'Project initiation document and plan', start: 2, days: 8, initiation: true, who: ['priya'], effort: 60 },
      { key: 'wp2', name: 'Requirements and solution design', stage: 'Design' },
      { key: 't21', parent: 'wp2', stage: 'Design', name: 'Business requirements workshops', start: 10, days: 12, who: ['liam', 'hannah'], pred: ['t12'], effort: 200 },
      { key: 't22', parent: 'wp2', stage: 'Design', name: 'Solution architecture', start: 12, days: 15, who: ['aisha'], effort: 150 },
      { key: 't23', parent: 'wp2', stage: 'Design', name: 'Integration design: payments gateway', start: 18, days: 14, who: ['aisha', 'noah'], effort: 220 },
      { key: 't24', parent: 'wp2', stage: 'Design', name: 'Design authority review and approval', start: 32, days: 3, who: ['priya'], pred: ['t22', 't23'], effort: 40 },
      { key: 'wp3', name: 'Build', stage: 'Build' },
      { key: 't31', parent: 'wp3', stage: 'Build', name: 'Sprint 1: platform configuration', start: 35, days: 10, who: ['aisha', 'liam'], pred: ['t24'], effort: 300 },
      { key: 't32', parent: 'wp3', stage: 'Build', name: 'Sprint 2: grants workflow', start: 45, days: 10, who: ['aisha', 'liam', 'hannah'], pred: ['t31'], effort: 350 },
      { key: 't33', parent: 'wp3', stage: 'Build', name: 'Sprint 3: payments integration', start: 55, days: 10, who: ['noah', 'aisha'], pred: ['t32'], effort: 300 },
      { key: 't34', parent: 'wp3', stage: 'Build', name: 'Sprint 4: reporting and dashboards', start: 65, days: 10, who: ['liam', 'hannah'], pred: ['t33'], effort: 300 },
      { key: 't35', parent: 'wp3', stage: 'Build', name: 'Data migration build and trial loads', start: 50, days: 35, who: ['hannah', 'chloe'], effort: 450 },
      { key: 'wp4', name: 'Test and transition', stage: 'Transition' },
      { key: 't41', parent: 'wp4', stage: 'Transition', name: 'System integration testing', start: 75, days: 10, who: ['hannah', 'noah'], pred: ['t34'], effort: 350 },
      { key: 't42', parent: 'wp4', stage: 'Transition', name: 'User acceptance testing support', start: 85, days: 15, who: ['liam', 'hannah'], pred: ['t41'], effort: 500 },
      { key: 't43', parent: 'wp4', stage: 'Transition', name: 'Go-live and hypercare', start: 100, days: 15, who: ['aisha', 'noah'], pred: ['t42'], effort: 500 },
      { key: 't44', parent: 'wp4', stage: 'Transition', name: 'Handover to operations', start: 115, days: 8, who: ['priya', 'liam'], pred: ['t43'], effort: 250 },
    ];
    R.p02tasks = kit.buildPlan('priya', P.p02, spec, { start: s2 });
    const ms = (data) => milestone('p02', data);
    R.m2design = ms({ name: 'Design approved', kind: 'Delivery', key: true, planned_date: D2(34), predecessors: [R.p02tasks.t24] });
    R.m2api = ms({ name: 'DRS payments API access provided', kind: 'Client dependency', key: false, planned_date: D2(52), notes: 'Sandbox credentials and network route to the payments gateway.' });
    R.m2r1 = ms({ name: 'Release 1 accepted', kind: 'Delivery', key: true, planned_date: D2(56), predecessors: [R.p02tasks.t32] });
    R.m2uat = ms({ name: 'UAT complete', kind: 'Delivery', key: true, planned_date: D2(99), predecessors: [R.p02tasks.t42] });
    R.m2live = ms({ name: 'Go-live', kind: 'Delivery', key: true, planned_date: D2(101) });
    R.m2handover = ms({ name: 'Handover complete', kind: 'Delivery', key: true, planned_date: D2(123), predecessors: [R.p02tasks.t44] });
    R.d2sdd = deliverable('p02', { title: 'Solution design document', planned_date: D2(30), client_approver_id: K.rachel.id, contract_id: R.sow1.id, quality_criteria: 'Traceable to requirements; consistent with DRS security standards', quality_method: 'Peer review then QA review' });
    R.d2int = deliverable('p02', { title: 'Integration design: payments gateway', planned_date: D2(33), client_approver_id: K.rachel.id, contract_id: R.sow1.id });
    R.d2r1 = deliverable('p02', { title: 'Release 1 build and release notes', deliverable_class: 'Software release', planned_date: D2(55), client_approver_id: K.rachel.id, contract_id: R.sow1.id });
    R.d2dms = deliverable('p02', { title: 'Data migration strategy', planned_date: D2(67), client_approver_id: K.rachel.id, contract_id: R.sow1.id, review_days: 10 });
    R.d2uat = deliverable('p02', { title: 'UAT test plan', planned_date: D2(80), client_approver_id: K.rachel.id, contract_id: R.sow1.id });
    R.d2glr = deliverable('p02', { title: 'Go-live readiness report', deliverable_class: 'Final report', planned_date: D2(100), client_approver_id: K.rachel.id, contract_id: R.sow1.id });
    R.d2hp = deliverable('p02', { title: 'Handover pack', planned_date: D2(122), client_approver_id: K.rachel.id, contract_id: R.sow1.id });
    R.r2key = raid('priya', 'risk', 'p02', { title: 'Key person dependency: integration lead', cause: 'Integration knowledge sits with the integration lead', event: 'The integration lead is unavailable during build', effect: 'Payments integration slows and quality drops', category: 'Resourcing', owner_id: users.priya, likelihood: 3, consequence: 4, response: 'Reduce', response_actions: 'Pair the contractor with the integration lead; record decisions in the design log', proximity: '1–3 months', client_visible: false });
    R.r2scope = raid('priya', 'risk', 'p02', { title: 'Scope creep from regional office requests', cause: 'Regional offices see the platform as the fix for local processes', event: 'Unplanned configuration is absorbed without change control', effect: 'Effort overrun and margin erosion', category: 'Commercial', owner_id: users.priya, likelihood: 3, consequence: 3, response: 'Reduce', response_actions: 'Route all requests through the product backlog and change control', client_visible: true });
    R.r2opp = raid('priya', 'risk', 'p02', { title: 'Reuse GrantConnect integration components', kind: 'Opportunity', event: 'Components from the GrantConnect integration can be reused', effect: 'Lower build effort for the reporting feeds', category: 'Technical', owner_id: users.aisha, likelihood: 3, consequence: 3, response: 'Exploit', response_actions: 'Confirm licensing with DRS IT', client_visible: true });
    R.a2rules = raid('priya', 'assumption', 'p02', { title: 'Existing grant program rules are documented', source: 'SOW section 4', owner_id: users.priya, validate_by: D2(15), impact_if_invalid: 'Requirements workshops will take longer', client_visible: true });
    R.a2data = raid('priya', 'assumption', 'p02', { title: 'DRS provides production-like test data by Sprint 3', source: 'SOW section 6', owner_id: users.priya, validate_by: D2(64), impact_if_invalid: 'Integration and migration testing slip', client_visible: true });
    const end = p2end;
    allocate('p02', 'priya', s2, D2(19), 15);
    allocate('p02', 'priya', D2(20), end, 30);
    allocate('p02', 'liam', addDays(s2, 7), end, 37.5);
    allocate('p02', 'aisha', D2(20), end, 37.5, { key: true, onboarding: [{ item: 'Baseline clearance confirmed', done: true }, { item: 'Building pass issued', done: true }, { item: 'DRS network account', done: true }, { item: 'Security induction', done: true }] });
    allocate('p02', 'hannah', D2(20), end, 37.5);
    allocate('p02', 'noah', D2(25), D2(115), 37.5);
    allocate('p02', 'marcus', s2, end, 8);
    allocate('p02', 'olivia', s2, end, 2);
    for (const k of ['liam', 'noah']) member('e1', k, 'team_member');
    create('priya', 'document', { engagement_id: E.e1, project_id: P.p02, title: 'Project initiation document', doc_type: 'Plan', version: '1.0', status: 'Final', owner_id: users.priya, classification: 'OFFICIAL: Sensitive', location: 'https://ctoconsulting.sharepoint.com/sites/DRS-E001/P02/PID.docx' });
  });
  on(D2(9), '09:30', 'Validate assumption', () => act('priya', 'assumption', R.a2rules.id, 'validate'));
  baseline('p02', 'marcus', D2(7), D2(9), { contingency: 25000 });
  progressEvery('p02', D2(9), T);
  // Overrun from the build stage: integration and migration effort runs above plan.
  on(D2(35), '08:00', 'P02 effort pressure', () => {
    for (const k of ['aisha', 'noah', 'liam', 'hannah']) kit.overrun(k, P.p02, D2(35), T, 1.2);
  });
  // Chloe joins for data migration after the baseline: unbudgeted effort.
  on(D2(37), '10:00', 'Data migration specialist added', () => {
    allocate('p02', 'chloe', D2(38), D2(90), 30, { onboarding: [{ item: 'Baseline clearance confirmed', done: true }, { item: 'Security induction', done: true }] });
    member('e1', 'chloe', 'team_member');
  });
  // Deliverables.
  readyAndSubmit('p02', 'd2sdd', D2(28), { reviewer: 'marcus' });
  on(D2(31), '11:00', 'SDD rejected by the client', () => act('rachel', 'deliverable', R.d2sdd.id, 'reject', { comments: 'Section 5 integration patterns do not reflect the DRS cloud security standard (v3.2). Please revise and resubmit.' }));
  on(D2(31), '15:00', 'SDD rework', () => act('priya', 'deliverable', R.d2sdd.id, 'rework'));
  on(D2(33), '10:00', 'SDD internal review again', () => act('priya', 'deliverable', R.d2sdd.id, 'internal_review'));
  on(D2(34), '11:00', 'SDD QA passed', () => kit.qualityReview('priya', R.d2sdd.id, { kind: 'QA review', reviewer: 'olivia', planned: D2(34), actual: D2(34), result: 'Pass', findings: [{ severity: 'Major', text: 'Integration patterns updated to the DRS standard', resolution: 'Resolved in v1.1' }] }));
  on(D2(34), '14:00', 'SDD resubmitted', () => act('priya', 'deliverable', R.d2sdd.id, 'submit', { version: '1.1' }));
  acceptByClient('rachel', 'd2sdd', D2(37), 'Accepted. Thank you for the quick turnaround on the security patterns.');
  achieve('priya', 'm2design', D2(37));
  on(D2(37), '17:00', 'SDD document register', () => {
    R.doc2sdd = create('priya', 'document', { engagement_id: E.e1, project_id: P.p02, title: 'Solution design document', doc_type: 'Deliverable', version: '1.0', status: 'In review', owner_id: users.aisha, classification: 'OFFICIAL: Sensitive', location: 'https://ctoconsulting.sharepoint.com/sites/DRS-E001/P02/SDD-v1.0.docx', client_visible: true });
    update('priya', 'document', R.doc2sdd.id, { version: '1.1', status: 'Final', location: 'https://ctoconsulting.sharepoint.com/sites/DRS-E001/P02/SDD-v1.1.docx' });
  });
  readyAndSubmit('p02', 'd2int', D2(36), { reviewer: 'marcus' });
  acceptByClient('rachel', 'd2int', D2(40), 'Accepted.');
  readyAndSubmit('p02', 'd2r1', D2(56), { reviewer: 'hannah', kind: 'Testing' });
  acceptByClient('rachel', 'd2r1', D2(59), 'Release 1 accepted following the demonstration to regional managers.');
  achieve('priya', 'm2r1', D2(59));
  on(D2(66), '10:00', 'DMS internal review', () => act('priya', 'deliverable', R.d2dms.id, 'internal_review'));
  on(D2(68), '15:00', 'DMS QA', () => kit.qualityReview('priya', R.d2dms.id, { kind: 'QA review', reviewer: 'marcus', planned: D2(68), actual: D2(68), result: 'Pass with comments', findings: [{ severity: 'Minor', text: 'Clarify reconciliation sign-off roles', resolution: 'Added RACI' }] }));
  on(D2(69), '11:00', 'DMS submitted', () => act('priya', 'deliverable', R.d2dms.id, 'submit', { version: '1.0' }));
  on(D2(71), '10:00', 'UAT plan to review', () => {
    act('priya', 'deliverable', R.d2uat.id, 'internal_review');
    kit.qualityReview('priya', R.d2uat.id, { kind: 'Peer review', reviewer: 'marcus', planned: D2(75), result: 'Pending' });
  });
  // RAID during build.
  on(D2(40), '10:00', 'P02 risks', () => {
    R.r2dm = raid('priya', 'risk', 'p02', { title: 'Legacy grant data quality lower than expected', cause: 'Three legacy systems with inconsistent recipient records', event: 'Trial loads fail reconciliation', effect: 'Migration effort increases and cut-over is at risk', category: 'Technical', owner_id: users.chloe ? users.chloe : users.priya, likelihood: 3, consequence: 3, response: 'Reduce', response_actions: 'Data profiling in Sprint 2; cleansing rules agreed with DRS data owners', client_visible: true, cost_min: 15000, cost_ml: 30000, cost_max: 60000, schedule_min: 5, schedule_ml: 10, schedule_max: 20 });
    R.dec2id = raid('marcus', 'decision', 'p02', { title: 'Approve deferral of reporting dashboards to Release 2', status: 'Required', due_date: addDays(T, 7), decision_maker: 'Steering committee', forum: 'Steering committee', client_visible: true, context: 'Option A: keep dashboards in Sprint 4 and absorb the payments delay; Option B: defer dashboards to Release 2 and protect go-live.' });
  });
  on(D2(46), '11:00', 'Client dependency raised', () => {
    R.dep2api = raid('priya', 'dependency', 'p02', { title: 'DRS payments API sandbox credentials', direction: 'Inbound', dep_type: 'Client', provider: 'DRS IT (payments platform team)', receiver: 'Integration team', owner_id: users.priya, need_by: D2(52), milestone_ids: [R.m2api.id], impact: 'Sprint 3 cannot test against the real gateway; SIT start at risk.', client_visible: true });
    R.dep2gc = raid('priya', 'dependency', 'p02', { title: 'GrantConnect test data extract', direction: 'Inbound', dep_type: 'Third party', provider: 'GrantConnect support', receiver: 'Data migration team', owner_id: users.hannah, need_by: addDays(T, 7), impact: 'Needed for the second trial load.', client_visible: true });
  });
  on(D2(53), '16:00', 'Dependency at risk', () => update('priya', 'dependency', R.dep2api.id, { status: 'At risk', last_reviewed: D2(53) }));
  reforecast('priya', 'm2api', D2(53), D2(63), 'DRS IT expects credentials after their change freeze.');
  on(D2(57), '10:00', 'Extreme risk raised', () => {
    R.r2api = raid('priya', 'risk', 'p02', { title: 'Payments API access delayed by DRS IT', cause: 'DRS IT change freeze and competing priorities', event: 'Sandbox credentials and network route not provided before Sprint 3', effect: 'Integration testing and go-live slip; idle integration effort', category: 'Client dependency', owner_id: users.marcus, actionee_id: users.priya, likelihood: 4, consequence: 5, response: 'Reduce', response_actions: 'Escalated to the CIO through the steering committee; mock services built so Sprint 3 can continue; daily check-in with the payments platform team', proximity: 'Imminent', client_visible: true, cost_min: 20000, cost_ml: 45000, cost_max: 90000, schedule_min: 5, schedule_ml: 12, schedule_max: 25, linked: [{ entity: 'dependency', id: R.dep2api.id }] });
    R.act2api = raid('marcus', 'action', 'p02', { title: 'Escalate payments API access to the CIO', owner_org: 'Firm', owner_id: users.marcus, due_date: D2(59), source: 'RAID item', source_ref: R.r2api.ref, client_visible: true });
  });
  on(D2(59), '16:00', 'Escalation action done', () => update('marcus', 'action', R.act2api.id, { status: 'Done', notes: 'Raised with Dr Rao; DRS IT committed a named engineer.' }));
  on(D2(60), '10:00', 'Client action', () => {
    R.act2mig = raid('priya', 'action', 'p02', { title: 'Confirm data migration sign-off approach', owner_org: 'Client', owner_name: 'James Wilson', due_date: D2(67), source: 'Meeting', client_visible: true, notes: 'Who signs off each reconciliation report, and in what timeframe.' });
    R.act2demo = raid('priya', 'action', 'p02', { title: 'Book Release 1 demonstration with regional managers', owner_org: 'Firm', owner_id: users.liam, due_date: addDays(T, 6), source: 'Status update', client_visible: true });
  });
  on(D2(62), '11:00', 'UAT environment issue', () => {
    R.i2uat = raid('priya', 'issue', 'p02', { title: 'UAT environment not provisioned', description: 'The UAT environment request (lodged with DRS IT) has not been actioned; SIT and UAT dates are at risk.', issue_type: 'Problem or concern', severity: 'High', priority: 'High', owner_id: users.priya, target_date: D2(68), impacts: 'SIT start; UAT complete milestone', client_visible: true });
    R.act2env = raid('priya', 'action', 'p02', { title: 'Lodge the UAT environment request with DRS IT', owner_org: 'Firm', owner_id: users.priya, due_date: D2(63), source: 'RAID item', status: 'Done', client_visible: false });
  });
  on(D2(64), '14:00', 'Replan after the API delay', () => {
    moveTask('priya', 'p02', 'Sprint 3: payments integration', null, D2(76));
    moveTask('priya', 'p02', 'Sprint 4: reporting and dashboards', D2(66), D2(78));
    moveTask('priya', 'p02', 'System integration testing', D2(79), D2(90));
    moveTask('priya', 'p02', 'User acceptance testing support', D2(91), D2(106));
    moveTask('priya', 'p02', 'Go-live and hypercare', D2(108), D2(122));
    moveTask('priya', 'p02', 'Handover to operations', D2(123), D2(131));
    update('priya', 'assumption', R.a2data.id, { last_reviewed: D2(64), internal_notes: 'Test data now expected with the API credentials.' });
    kit.pace(taskId('p02', 'Sprint 3: payments integration'), 0.3);
    kit.pace(taskId('p02', 'Sprint 4: reporting and dashboards'), 0.5);
    kit.pace(taskId('p02', 'Data migration build and trial loads'), 0.55);
  });
  reforecast('priya', 'm2api', D2(64), addDays(T, 10), 'Named DRS engineer assigned; credentials promised after the release window.');
  reforecast('priya', 'm2uat', D2(64), D2(106), 'Follows the revised SIT window.');
  reforecast('priya', 'm2live', D2(64), D2(108), 'Go-live moves into the new year after the API delay and the Christmas change freeze.');
  reforecast('priya', 'm2handover', D2(64), D2(131), 'Follows go-live.');
  on(D2(66), '10:00', 'Hypercare issue', () => {
    R.i2freeze = raid('priya', 'issue', 'p02', { title: 'Christmas change freeze limits the go-live window', description: 'DRS IT change freeze runs from mid-December to mid-January.', severity: 'Medium', owner_id: users.priya, target_date: addDays(T, 14), client_visible: true });
  });
  // Change control (CHG-001..009).
  on(D2(23), '10:00', 'CR-001 raised', () => {
    R.cr1 = raid('priya', 'change', 'p02', {
      title: 'GrantConnect reporting interface', description: 'Add an outbound interface so grant awards are published to GrantConnect automatically.', reason: 'Commonwealth Grants Rules require publication within 21 days; the manual process is error-prone.',
      requester_kind: 'Client', requester_name: 'Rachel Kim', change_type: 'Scope', priority: 'High',
      estimate: [{ role: 'Senior Consultant', days: 45 }, { role: 'Consultant', days: 30 }, { role: 'Senior Manager', days: 5 }],
      impact_schedule_days: 0, impact_scope: 'New outbound interface to GrantConnect, with error handling and a reconciliation report.', impact_resources: 'Integration contractor extended by eight weeks.',
      impact_quality: 'Additional SIT scenarios.', impact_risk: 'Depends on GrantConnect test environment availability.', impact_contract: 'Variation to DRS-SOW-001.', client_visible: true,
    });
  });
  on(D2(24), '11:00', 'CR-001 submitted', () => act('priya', 'change', R.cr1.id, 'submit'));
  on(D2(25), '09:30', 'CR-001 EM review', () => approve('marcus', 'change', R.cr1.id, { comment: 'Estimate checked; recommend approval.' }));
  on(D2(26), '10:00', 'CR-001 steering committee', () => approve('olivia', 'change', R.cr1.id, { comment: 'Approved at steering committee; margin on the change is above target.' }));
  on(D2(28), '15:00', 'CR-001 client approval', () => approve('rachel', 'change', R.cr1.id, { comment: 'Approved for the Department. PO variation to follow.' }));
  on(D2(32), '11:00', 'Variation V1 signed', () => {
    const v = repos.contract.find({ engagement_id: E.e1 }).find((c) => c.kind === 'Variation' && c.change_id === R.cr1.id);
    update('marcus', 'contract', v.id, { status: 'Signed', signed_date: D2(32) });
    const wp = R.p02tasks.wp3;
    const gc = create('priya', 'work_item', { project_id: P.p02, name: 'GrantConnect interface (CR-001)', kind: 'Task', parent_id: wp, stage_id: repos.work_item.get(wp).stage_id, start_date: D2(58), finish_date: D2(80), effort_hours: 420, budget_cost: repos.change.get(R.cr1.id).impact_cost, assignees: [users.noah], change_id: R.cr1.id, sort: 99 });
    kit.pace(gc.id, 0.45);
    act('marcus', 'change', R.cr1.id, 'implement', { notes: 'Interface added to the Build stage plan.' });
  });
  on(addDays(T, -8), '10:00', 'CR-002 raised', () => {
    R.cr2 = raid('priya', 'change', 'p02', {
      title: 'Extend hypercare by two weeks', description: 'Extend post go-live hypercare from three to five weeks to cover the first payment run after the Christmas change freeze.', reason: 'Go-live has moved into January; the first full payment run falls outside the current hypercare window.',
      requester_kind: 'Firm', requester_name: 'Priya Raman', change_type: 'Schedule', priority: 'High', estimate: [{ role: 'Senior Consultant', days: 10 }, { role: 'Consultant', days: 10 }],
      impact_schedule_days: 10, impact_scope: 'Hypercare extended by two weeks; no new deliverables.', impact_resources: 'Integration lead and one consultant for two more weeks.', client_visible: true,
    });
    create('priya', 'commitment', { project_id: P.p02, supplier: 'Noah Singh Consulting', description: 'Contractor extension for hypercare (subject to CR-002)', amount: 18750, expected_date: addDays(T, 75), status: 'Open' });
  });
  on(addDays(T, -7), '11:00', 'CR-002 submitted', () => act('priya', 'change', R.cr2.id, 'submit'));
  on(addDays(T, -2), '10:00', 'CR-003 drafted', () => {
    R.cr3 = raid('tom', 'change', 'p03', { title: 'Additional regional training sessions', description: 'Six more face-to-face training sessions for the northern regional offices.', reason: 'Attendance at virtual sessions in the north was below 40%.', requester_kind: 'Client', requester_name: 'James Wilson', change_type: 'Scope', estimate: [{ role: 'Consultant', days: 9 }], client_visible: true });
  });
  // Write-down for the rejected design (FIN-038).
  on(D2(45), '10:00', 'Goodwill write-down', () => create('daniel', 'wip_adjustment', { project_id: P.p02, kind: 'Write-down', date: D2(45), amount: 4800, reason_code: 'Rework', reason: 'Solution design rework after the security standard finding: three days absorbed as goodwill.' }));
  on(D2(45), '15:00', 'Write-down approved', () => approve('marcus', 'wip_adjustment', repos.wip_adjustment.find({ project_id: P.p02 })[0].id, { comment: 'Agreed: rework on our side.' }));
  // Gate: Design to Build (GOV-008, GOV-009).
  on(D2(34), '16:00', 'Design gate', () => {
    const stage = repos.stage.find({ project_id: P.p02 }).find((s) => s.name === 'Design');
    update('priya', 'stage', stage.id, { gate_artefacts: (stage.gate_artefacts || []).map((a) => ({ ...a, done: true, approved: true })), gate_criteria: (stage.gate_criteria || []).map((c) => ({ ...c, done: true })) });
    const gate = create('priya', 'gate_review', { project_id: P.p02, stage_id: stage.id, date: D2(35), decision: 'Proceed with conditions', business_justification: true, conditions: [{ text: 'Confirm the payments API access date with DRS IT', owner: users.priya, due: D2(45) }], notes: 'Design approved subject to the security patterns update in SDD v1.1.', lessons_prompted: true });
    app.projects.submitGate(as('priya'), gate);
    R.gate2 = gate;
  });
  on(D2(35), '10:00', 'Design gate approved', () => approve('marcus', 'gate_review', R.gate2.id, { comment: 'Proceed to build; condition tracked as an action.' }));
  // Expenses (TEX-008).
  on(D2(21), '17:00', 'Travel expense', () => {
    const x = create('aisha', 'expense', { project_id: P.p02, date: D2(19), category: 'Airfare', description: 'Canberra–Sydney return for vendor workshop', amount: 412.73, tax_code: 'GST', billable: true, receipt_file_id: R.receipt });
    act('aisha', 'expense', x.id, 'submit');
  });
  on(D2(22), '10:00', 'Expense approved', () => approve('priya', 'expense', repos.expense.find({ project_id: P.p02 })[0].id));
  on(addDays(T, -2), '17:00', 'Expense submitted', () => {
    const x = create('liam', 'expense', { project_id: P.p02, date: addDays(T, -3), category: 'Accommodation', description: 'Dubbo regional office demonstration (one night)', amount: 189.09, tax_code: 'GST', billable: true, receipt_file_id: R.receipt });
    act('liam', 'expense', x.id, 'submit');
  });
  on(addDays(e1s, -20), '09:00', 'Receipt image', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420"><rect width="300" height="420" fill="#fff"/><text x="20" y="40" font-family="DejaVu Sans" font-size="18" font-weight="bold">TAX INVOICE</text><text x="20" y="70" font-family="DejaVu Sans" font-size="12">Qantas Airways Ltd ABN 16 009 661 901</text><text x="20" y="110" font-family="DejaVu Sans" font-size="12">CBR-SYD return, economy</text><text x="20" y="140" font-family="DejaVu Sans" font-size="12">Fare $412.73  GST $41.27</text><text x="20" y="170" font-family="DejaVu Sans" font-size="14" font-weight="bold">Total $454.00</text></svg>';
    const png = await svgToPng(svg, 8);
    R.receipt = png ? app.files.save(png, { name: 'receipt.png', mime: 'image/png', purpose: 'receipt', scan: 'generated' }).id : null;
  });
  on(D2(30), '10:00', 'Supplier cost', () => create('daniel', 'supplier_cost', { project_id: P.p02, supplier: 'Accessibility Partners Pty Ltd', invoice_ref: 'AP-2291', date: D2(30), cost_type: 'third-party', description: 'WCAG 2.2 accessibility audit of Release 1 designs', amount: 8400, billable: true }));
  // Leave, delegation and resourcing.
  on(addDays(T, -21), '09:00', 'Leave booked', () => {
    create('aisha', 'leave', { person_id: people.aisha, from: addDays(W(3), 0), to: addDays(W(3), 4), kind: 'Annual', status: 'Approved' });
    create('priya', 'leave', { person_id: people.priya, from: W(2), to: addDays(W(2), 4), kind: 'Annual', status: 'Approved' });
  });
  on(addDays(W(-5), 1), '08:00', 'Personal leave', () => create('liam', 'leave', { person_id: people.liam, from: addDays(W(-5), 1), to: addDays(W(-5), 2), kind: 'Personal', status: 'Approved' }));
  on(addDays(T, -3), '16:00', 'Delegation during leave', () => app.workflow.delegations.insert({ from_user: users.priya, to_user: users.marcus, from: W(2), to: addDays(W(2), 4), reason: 'Annual leave', created_by: users.priya }, users.priya));
  on(addDays(T, -6), '10:00', 'Resource request', () => {
    create('priya', 'resource_request', { project_id: P.p02, role: 'Data migration specialist', grade: 'Senior Consultant', skills: 'Data migration, SQL, reconciliation', clearance: 'Baseline', hours_per_week: 30, start_date: W(2), end_date: addDays(W(10), 4), location: 'ACT', critical: true, notes: 'Second trial load and cut-over rehearsals.' });
    create('priya', 'allocation', { project_id: P.p02, placeholder_role: 'Data migration specialist', rate_role: 'Senior Consultant', start_date: W(2), end_date: addDays(W(10), 4), hours_per_week: 30, status: 'Tentative', billable: true });
  });
  // Steering committees and boards (STK-005, GOV-005).
  for (const [k, n] of [[-16, 1], [-12, 2], [-7, 3], [-3, 4]]) {
    const date = addDays(W(k), 3);
    on(date, '16:30', 'Steering committee', () => {
      create('marcus', 'meeting', {
        engagement_id: E.e1, kind: 'Steering committee', title: `Steering committee ${n}`, date, attendees: 'Rachel Kim (chair), Dr Anika Rao, James Wilson, Olivia Bennett, Marcus Chen, Priya Raman',
        agenda: '1. Progress against plan\n2. Risks above tolerance\n3. Change requests\n4. Decisions required', minutes: n === 4
          ? '- Payments API access escalated to the CIO; DRS IT has assigned a named engineer\n- Go-live forecast moved into the new year; the committee asked for a recovery option\n- **Decision required** on deferring dashboards to Release 2 at the next meeting'
          : n === 3 ? '- Release 1 demonstration well received\n- CR-001 GrantConnect interface implemented in the build plan' : n === 2 ? '- Discovery report accepted and the recommended option endorsed\n- CR-001 approved' : '- Engagement mobilised; governance and reporting agreed',
      });
    });
  }
  on(addDays(T, -7), '10:00', 'Project board', () => create('priya', 'meeting', { engagement_id: E.e1, project_id: P.p02, kind: 'Project board', title: 'Project board: platform implementation', date: addDays(T, -7), attendees: 'James Wilson, Marcus Chen, Priya Raman, Aisha Mohammed', minutes: '- Reviewed the revised build plan\n- Agreed to submit CR-002 for the hypercare extension' }));
  on(D2(20), '10:00', 'Benefits register', () => {
    create('marcus', 'benefit', { engagement_id: E.e1, project_id: P.p02, title: 'Grant processing time reduced from 40 to 15 days', benefit_type: 'Non-financial', client_owner: 'Rachel Kim', measure: 'Average business days from application to decision', baseline: '40 days', target: '15 days', timing: addDays(e1end, 0), status: 'Planned', review_date: addDays(e1end, 90), review_owner: 'DRS PMO' });
    create('marcus', 'benefit', { engagement_id: E.e1, project_id: P.p02, title: 'Manual data entry reduced by 2.5 FTE', benefit_type: 'Financial', cashable: true, client_owner: 'Regional operations', measure: 'FTE on grant data entry', baseline: '6.0 FTE', target: '3.5 FTE ($310k a year)', timing: addDays(e1end, 180), status: 'Planned' });
    create('marcus', 'benefit', { engagement_id: E.e1, project_id: P.p03, title: 'Temporary productivity dip during transition', is_disbenefit: true, benefit_type: 'Non-financial', client_owner: 'Regional operations', measure: 'Applications processed per officer', baseline: '100%', target: 'No more than 15% dip for 6 weeks', timing: addDays(e1end, -60), status: 'Identified' });
  });
  on(addDays(T, -30), '10:00', 'Client satisfaction', () => create('marcus', 'satisfaction', { engagement_id: E.e1, date: addDays(T, -30), respondent: 'Rachel Kim', score: 8, reporting_score: 7, comments: 'Strong team. Earlier warning on the payments dependency would have helped.' }));
  on(addDays(T, -12), '10:00', 'Growth opportunity', () => create('marcus', 'opportunity', { engagement_id: E.e1, title: 'Grants analytics and AI triage pilot', description: 'Use platform data to triage low-risk applications.', estimated_value: 450000, probability: 0.4 }));
  statusEvery('p02', D2(10), fri(-1), (f) => p02Status(f));
  on(addDays(fri(0), -1), '15:00', 'P02 status this week', () => kit.statusUpdate('priya', P.p02, fri(0), p02Status(fri(0))));

  function p02Status(f) {
    const lastWeeks = f >= fri(-1);
    const out = {};
    if (lastWeeks) {
      out.ratings = { budget: { rag: 'Amber', commentary: 'EAC is above BAC beyond tolerance and PO 4500123 is forecast to run out before handover.', justification: 'A $150,000 PO increase is with DRS Finance (agreed in principle at the steering committee) and CR-002 adds funded scope; the overrun is being recovered by deferring dashboards to Release 2.' } };
      const po = app.finance.poStatus(repos.po.get(R.po1.id));
      out.summary = `Build continues, but the Department’s payments API access is now forecast for ${D(addDays(T, 10))}, which has moved go-live to ${D(D2(108))}. CR-002 extends hypercare to cover the first payment run.${po.exhaustsBeforeEnd ? ` PO 4500123 is forecast to run out on ${D(po.exhaustionDate)}, before handover; DRS Finance has a $150,000 increase request.` : ''}`;
      out.narrative = {
        decisions_required: '- Approve CR-002 (hypercare extension, $28,000)\n- Decide on deferring reporting dashboards to Release 2',
        escalations: '- Payments API access (risk escalated to the engagement; CIO engaged)\n- UAT environment still not provisioned',
        client_actions: '- DRS IT: provide payments API sandbox credentials\n- DRS PMO: confirm the data migration sign-off approach',
      };
    }
    return out;
  }

  // ---------- P03 Change and adoption (agile) ----------
  const s3 = W(-11);
  const D3 = (n) => bd(s3, n);
  project('p03', 'e1', addDays(s3, -14), 'marcus', { name: 'Change and adoption', pm: 'tom', profile_id: 'agile', approach: 'agile', start_date: s3, end_date: D3(150), size: 'medium', commercial_model: 'T&M', description: 'Change impact assessment, communications, training and adoption across 14 regional offices.' });
  commercial('p03', addDays(s3, -13), 'marcus', { price: 520000, cost: 245000, exec: true, notes: 'T&M at panel rates.' });
  on(addDays(s3, -10), '10:00', 'P03 backlog and team', () => {
    fundingOf('e1', 'contract', R.sow1.id, 'p03', 520000, 'marcus');
    fundingOf('e1', 'po', R.po2.id, 'p03', 440000, 'marcus');
    const stages = repos.stage.find({ project_id: P.p03 }).sort((a, b) => a.seq - b.seq);
    const rel1 = stages.find((s) => s.name === 'Release 1');
    const sprints = [];
    const rel2 = stages.find((s) => s.name === 'Release 2');
    const goals = ['Impact assessment complete', 'Stakeholder and communications plan', 'Training needs analysis', 'Champions network launch', 'Training materials (release 1)', 'Training delivery wave 1',
      'Training delivery wave 2', 'Adoption measures live', 'Release 2 impact update', 'Release 2 training materials', 'Release 2 training delivery', 'Embedding and sustainment', 'Benefits baseline', 'Handover to DRS change team'];
    for (let i = 0; i < goals.length; i++) {
      const st = D3(10 + i * 10);
      sprints.push(create('tom', 'stage', { project_id: P.p03, seq: 10 + i, name: `Sprint ${i + 1}`, kind: 'sprint', start_date: st, end_date: D3(19 + i * 10), status: 'Not started', parent_stage_id: (i < 7 ? rel1 : rel2)?.id, sprint_goal: goals[i], capacity_points: 30, committed_points: [26, 28, 27, 30, 29, 28, 27, 28, 26, 30, 28, 27, 25, 24][i] }));
    }
    R.p03sprints = sprints;
    const story = (key, epic, name, sprint, points, who) => ({ key, parent: epic, name, kind: 'User story', start: 10 + sprint * 10, days: 10, sprint: sprints[sprint].id, points, who, priority: 'Must', ac: 'Reviewed with the DRS change lead', effort: points * 7.5 });
    R.p03items = kit.buildPlan('tom', P.p03, [
      { key: 'inc', name: 'Inception: vision, backlog and ways of working', start: 0, days: 10, initiation: true, who: ['tom', 'emily'], stage: 'Inception' },
      { key: 'e1', name: 'Change impact assessment', kind: 'Epic' },
      story('s11', 'e1', 'Map impacts for each regional office role', 0, 13, ['emily']),
      story('s12', 'e1', 'Validate impacts with regional managers', 0, 8, ['emily', 'tom']),
      { key: 'e2', name: 'Communications and engagement', kind: 'Epic' },
      story('s21', 'e2', 'Stakeholder engagement and communications plan', 1, 13, ['emily']),
      story('s22', 'e2', 'Monthly town hall pack', 1, 5, ['emily']),
      { key: 'e3', name: 'Training', kind: 'Epic' },
      story('s31', 'e3', 'Training needs analysis', 2, 13, ['emily', 'ethan']),
      story('s32', 'e3', 'Champions network launch', 3, 13, ['emily', 'ethan']),
      story('s33', 'e3', 'Training materials for release 1', 4, 21, ['emily', 'ethan']),
      story('s34', 'e3', 'Training delivery wave 1', 5, 21, ['emily', 'ethan']),
      story('s35', 'e3', 'Training delivery wave 2', 6, 21, ['emily', 'ethan']),
      { key: 'e4', name: 'Adoption measurement', kind: 'Epic' },
      story('s41', 'e4', 'Adoption dashboard design', 5, 8, ['ethan']),
      story('s42', 'e4', 'Adoption measures live', 7, 13, ['ethan', 'emily']),
      { key: 'e5', name: 'Release 2 change', kind: 'Epic' },
      story('s51', 'e5', 'Release 2 impact update', 8, 13, ['emily']),
      story('s52', 'e5', 'Release 2 training materials', 9, 21, ['emily', 'ethan']),
      story('s53', 'e5', 'Release 2 training delivery', 10, 21, ['emily', 'ethan']),
      { key: 'e6', name: 'Embedding and handover', kind: 'Epic' },
      story('s61', 'e6', 'Embedding and sustainment plan', 11, 13, ['emily']),
      story('s62', 'e6', 'Benefits baseline measurement', 12, 8, ['ethan']),
      story('s63', 'e6', 'Handover to the DRS change team', 13, 8, ['emily', 'tom']),
    ], { start: s3 });
    R.m3cia = milestone('p03', { name: 'Change impact assessment endorsed', kind: 'Delivery', key: true, planned_date: D3(29) });
    R.m3champ = milestone('p03', { name: 'Regional champions network launched', kind: 'Delivery', key: true, planned_date: D3(49) });
    R.m3train = milestone('p03', { name: 'Release 1 training complete', kind: 'Delivery', key: true, planned_date: D3(69) });
    R.d3cia = deliverable('p03', { title: 'Change impact assessment', planned_date: D3(27), client_approver_id: K.rachel.id });
    R.d3comms = deliverable('p03', { title: 'Stakeholder engagement and communications plan', planned_date: D3(37), client_approver_id: K.rachel.id });
    R.d3tna = deliverable('p03', { title: 'Training needs analysis', planned_date: D3(47), client_approver_id: K.rachel.id, review_days: 10 });
    R.d3mat = deliverable('p03', { title: 'Training materials: release 1', planned_date: D3(59), client_approver_id: K.rachel.id });
    R.r3fat = raid('tom', 'risk', 'p03', { title: 'Change fatigue in regional offices', cause: 'Three other change programs running in the regions', event: 'Staff disengage from training and champions activity', effect: 'Adoption below the 80% target', category: 'Stakeholder', owner_id: users.tom, likelihood: 3, consequence: 3, response: 'Reduce', response_actions: 'Coordinate the change calendar with the DRS PMO; champions in every office', client_visible: true });
    R.r3po = raid('tom', 'risk', 'p03', { title: 'Product owner availability', cause: 'The DRS change lead also leads two other programs', event: 'Backlog not refined ahead of sprints', effect: 'Velocity drops; rework increases', category: 'Client dependency', owner_id: users.tom, likelihood: 2, consequence: 3, response: 'Reduce', response_actions: 'Agreed a delegate; refinement booked fortnightly', client_visible: true });
    allocate('p03', 'tom', s3, D3(150), 15);
    allocate('p03', 'emily', s3, D3(150), 37.5);
    allocate('p03', 'ethan', addDays(s3, 28), D3(150), 15);
    allocate('p03', 'marcus', s3, D3(150), 2);
    member('e1', 'ethan', 'team_member');
  });
  baseline('p03', 'marcus', D3(6), D3(8), { scale: 1.02, contingency: 12000 });
  progressEvery('p03', D3(8), T);
  for (let i = 0; i < 14; i++) {
    on(D3(10 + i * 10), '08:30', 'Sprint start', () => { const s = R.p03sprints[i]; if (s && s.start_date <= T) update('tom', 'stage', s.id, { status: 'Active' }); });
    on(D3(19 + i * 10), '17:45', 'Sprint end', () => { const s = R.p03sprints[i]; if (s && s.end_date < T) update('tom', 'stage', s.id, { status: 'Complete' }); });
  }
  readyAndSubmit('p03', 'd3cia', D3(26), { reviewer: 'marcus' });
  acceptByClient('rachel', 'd3cia', D3(29), 'Accepted.');
  achieve('tom', 'm3cia', D3(29));
  readyAndSubmit('p03', 'd3comms', D3(37), { reviewer: 'marcus' });
  acceptByClient('rachel', 'd3comms', D3(40), 'Accepted with thanks.');
  readyAndSubmit('p03', 'd3tna', addDays(T, -2) > D3(47) ? D3(47) : addDays(T, -2), { reviewer: 'olivia' });
  reforecast('tom', 'm3champ', D3(44), bd(T, 1), 'Launch moved to align with the regional managers’ forum.');
  on(D3(44), '13:30', 'Champions story moved', () => { moveTask('tom', 'p03', 'Champions network launch', null, bd(T, 1)); kit.pace(taskId('p03', 'Champions network launch'), 0.85); });
  on(D3(30), '10:00', 'P03 issue', () => { R.i3avail = raid('tom', 'issue', 'p03', { title: 'Regional manager availability for workshops', description: 'Peak grant round in the northern region limits workshop attendance.', severity: 'Medium', owner_id: users.tom, target_date: D3(45), client_visible: true }); });
  on(D3(44), '11:00', 'P03 issue resolved', () => update('tom', 'issue', R.i3avail.id, { status: 'Resolved', resolution: 'Workshops rescheduled after the grant round closed.' }));
  statusEvery('p03', D3(9), fri(-1));
  on(addDays(T, -1), '16:00', 'P03 status draft', () => { if (fri(0) <= addDays(T, 7)) kit.statusUpdate('tom', P.p03, fri(0), { submit: false }); });
  // E1 forecast-period and invoices: T&M monthly in arrears.
  for (const m of kit.monthsFrom(monthOf(s2), monthOf(addMonths(monthOf(T), -1)))) {
    const draftDate = nthBusinessDay(addMonths(m, 1), 1, kit.H);
    const paid = addDays(draftDate, 25) < T ? 19 : null;
    const overdue = m === addMonths(monthOf(T), -1); // the Department has not paid last month's platform invoice
    on(draftDate, '09:30', `P02 invoice ${m}`, () => kit.invoice(P.p02, monthEnd(m), { em: 'marcus', draftDate, paidAfterDays: overdue ? null : paid }));
    if (m >= monthOf(s3)) on(draftDate, '09:45', `P03 invoice ${m}`, () => kit.invoice(P.p03, monthEnd(m), { em: 'marcus', draftDate, paidAfterDays: paid }));
  }

  // E1 weekly client reports: approved by the engagement executive, issued and distributed (RPT-040..045).
  if (reports) {
    const narrativeFor = (pe) => ({
      key_messages: pe >= fri(-1)
        ? '- Go-live forecast moved into the new year after the payments API delay\n- **Decision needed:** defer reporting dashboards to Release 2\n- PO 4500123 needs a $150,000 increase before handover'
        : pe >= fri(-2) ? '- Release 1 in use by the pilot office\n- Payments API access escalated to the CIO\n- UAT environment request outstanding' : '- Sprint 3 continuing against mock services\n- Change impact assessment endorsed\n- Training needs analysis under way',
      summary: pe >= fri(-1)
        ? 'The engagement is Red overall. Platform build continues, but the payments API dependency has moved go-live and UAT. Change and adoption is on track; regional champions launch next week.'
        : 'The engagement is Amber. Build continues; the payments API dependency is the main threat to the plan.',
      decisions_required: pe >= fri(-1) ? '1. Approve CR-002 hypercare extension\n2. Defer reporting dashboards to Release 2' : '1. Confirm the data migration sign-off approach',
      escalations: pe >= fri(-2) ? '- Payments API access: escalated to Dr Anika Rao (CIO)' : 'None this period.',
    });
    for (const k of [-3, -2, -1]) on(fri(k), '14:00', `E1 weekly report ${fri(k)}`, () => kit.weeklyReport('marcus', E.e1, fri(k), { approver: 'olivia', pdf, narrative: narrativeFor(fri(k)), pair: k === -1, internalTemplateId: T_.weeklyInternal }));
    if (dayOfWeek(T) >= 4 || dayOfWeek(T) === 0) {
      on(T, '11:00', 'E1 report draft this week', () => app.reports.generate(as('marcus'), { engagement_id: E.e1, scope: 'all', report_type: 'Weekly status', audience: 'client', period_end: fri(0), narrative: narrativeFor(fri(0)), proceed: true, formats: pdf ? ['docx', 'pdf'] : ['docx'] }));
    }
  }
  // DRS client-supplied template: uploaded by the engagement manager, mapped and awaiting PMO approval (RPT-026).
  on(addDays(T, -9), '10:00', 'DRS template uploaded', async () => {
    const t = app.reports.createTemplate(as('marcus'), { name: 'DRS weekly vendor status report', description: 'The Department’s own vendor report template, mapped to CEMS data.', report_type: 'Weekly status', scope: 'Engagement', engagement_id: E.e1, level: 'engagement', audience: 'client' });
    const { version } = await app.reports.upload(as('marcus'), t.id, fs.readFileSync(path.join(tplDir, 'client-supplied-drs.docx')), 'DRS_Vendor_Status_Template.docx');
    await app.reports.saveMappings(as('marcus'), version.id, [
      { kind: 'placeholder', key: '[Week ending date]', token: 'report.week_ending' }, { kind: 'placeholder', key: '[Supplier name]', token: 'firm.name' },
      { kind: 'placeholder', key: '[Next steps]', token: 'engagement.decisions_required' }, { kind: 'bookmark', key: 'ProgramName', token: 'engagement.name' },
      { kind: 'content control', key: 'OverallStatus', token: 'engagement.overall_rag' }, { kind: 'content control', key: 'ExecSummary', token: 'engagement.summary' },
    ]);
    app.reports.submitTemplate(as('marcus'), version.id);
  });

  // =====================================================================================
  // E2 — Harbour Health: Clinical Systems Assurance (milestone fixed price + retainer)
  // =====================================================================================
  const e2s = W(-10);
  const e2end = addDays(e2s, 7 * 26 - 3);
  const D4 = (n) => bd(e2s, n);
  engagement('e2', addDays(e2s, -14), 'jack', {
    client_id: C.hhg.id, name: 'Clinical Systems Assurance', type: 'advisory', practice: 'Program Assurance', start_date: e2s, end_date: e2end,
    description: 'Independent assurance of the clinical systems replacement program, plus ongoing PMO support.', objectives: ['Give the board independent assurance on go-live readiness', 'Strengthen program governance and reporting'],
    client_sponsor_id: K.helen.id, classification: 'Confidential', reporting_cadence: 'Weekly', report_approval: false, steerco_members: 'Dr Helen Wu (chair), Mark Evans, Olivia Bennett, Jack Thompson', meeting_cadence: 'Fortnightly', health_rule: 'worst', day_length: 7.5, rounding: 0.5, billing_unit: 'day',
  });
  on(addDays(e2s, -10), '11:00', 'E2 contracts', () => {
    R.sow2 = create('jack', 'contract', { engagement_id: E.e2, kind: 'SOW', reference: 'HHG-SOW-007', title: 'Independent assurance review', value: 240000, start_date: e2s, end_date: D4(69), commercial_model: 'Milestone fixed price', status: 'Signed', signed_date: addDays(e2s, -10), payment_terms: '30 days' });
    R.wo2 = create('jack', 'contract', { engagement_id: E.e2, kind: 'Work order', reference: 'HHG-WO-012', title: 'PMO support retainer', value: 84000, retainer_fee: 14000, start_date: e2s, end_date: monthEnd(addMonths(monthOf(e2s), 5)), commercial_model: 'Retainer', status: 'Signed', signed_date: addDays(e2s, -10) });
    R.poh1 = create('jack', 'po', { engagement_id: E.e2, number: 'HH-88231', value: 240000, gst_basis: 'exclusive', contract_id: R.sow2.id, valid_from: e2s, valid_to: e2end, status: 'Active' });
    R.poh2 = create('jack', 'po', { engagement_id: E.e2, number: 'HH-88302', value: 84000, gst_basis: 'exclusive', contract_id: R.wo2.id, valid_from: e2s, valid_to: e2end, status: 'Active' });
  });
  activate('e2', addDays(e2s, -9), 'jack');
  on(addDays(e2s, -8), '10:00', 'E2 governance', () => {
    member('e2', 'helen', 'client', { endDate: e2end });
    create('jack', 'distribution_list', { engagement_id: E.e2, name: 'Weekly status', report_type: 'Weekly status', recipients: [{ name: 'Dr Helen Wu', email: K.helen.email, kind: 'client' }, { name: 'Mark Evans', email: K.mark.email, kind: 'client' }, { name: 'Jack Thompson', email: 'jack.thompson@ctoconsulting.com.au', kind: 'firm' }, { name: 'Olivia Bennett', email: 'olivia.bennett@ctoconsulting.com.au', kind: 'firm' }] });
    create('jack', 'stakeholder', { engagement_id: E.e2, name: 'Dr Helen Wu', contact_id: K.helen.id, organisation: 'Harbour Health', role: 'Sponsor', influence: 5, interest: 5, attitude: 'Supporter', current_level: 'Supportive', desired_level: 'Leading' });
    create('jack', 'stakeholder', { engagement_id: E.e2, name: 'Mark Evans', contact_id: K.mark.id, organisation: 'Harbour Health', role: 'Program director (assured party)', influence: 4, interest: 5, attitude: 'Neutral', current_level: 'Neutral', desired_level: 'Supportive', interactions: 'Sensitive to findings being shared with the board before he has seen them.' });
    app.reports.setDefault(as('jack'), E.e2, 'Weekly status', T_.weeklyClient);
  });
  project('e2p1', 'e2', addDays(e2s, -7), 'jack', { name: 'Independent assurance review', pm: 'tom', profile_id: 'prince2', approach: 'predictive', start_date: e2s, end_date: D4(69), size: 'medium', commercial_model: 'Milestone fixed price', fixed_price: 240000, description: 'Gateway-style assurance of readiness for the clinical systems go-live.' });
  commercial('e2p1', addDays(e2s, -7), 'jack', { price: 240000, cost: 98000, notes: 'Three payment milestones.' });
  const retainerEnd = monthEnd(addMonths(monthOf(e2s), 5)); // six monthly fees
  project('e2p2', 'e2', addDays(e2s, -7), 'jack', { name: 'PMO support retainer', pm: 'tom', profile_id: 'prince2', approach: 'predictive', start_date: e2s, end_date: retainerEnd, size: 'small', commercial_model: 'Retainer', retainer_fee: 14000, description: 'Monthly PMO support: reporting cycle, RAID facilitation and board papers.' });
  commercial('e2p2', addDays(e2s, -7), 'jack', { price: 84000, cost: 39000, notes: 'Retainer $14,000 a month in advance.' });
  on(addDays(e2s, -6), '10:00', 'E2 plans and team', () => {
    fundingOf('e2', 'contract', R.sow2.id, 'e2p1', 240000, 'jack');
    fundingOf('e2', 'po', R.poh1.id, 'e2p1', 240000, 'jack');
    fundingOf('e2', 'contract', R.wo2.id, 'e2p2', 84000, 'jack');
    fundingOf('e2', 'po', R.poh2.id, 'e2p2', 84000, 'jack');
    R.e2p1t = kit.buildPlan('tom', P.e2p1, [
      { key: 'a', name: 'Review planning and inception', stage: 'Initiation', start: 0, days: 6, initiation: true, who: ['tom', 'ethan'] },
      { key: 'b', name: 'Document review', stage: 'Delivery stage 1', start: 6, days: 10, who: ['ethan', 'mia'] },
      { key: 'c', name: 'Stakeholder interviews', stage: 'Delivery stage 1', start: 8, days: 12, who: ['tom', 'ethan'] },
      { key: 'd', name: 'Vendor readiness assessment', stage: 'Delivery stage 1', start: 16, days: 14, who: ['ethan', 'mia'] },
      { key: 'e', name: 'Interim assurance report', stage: 'Delivery stage 1', start: 28, days: 9, who: ['tom', 'mia'], pred: ['d'] },
      { key: 'f', name: 'Clinical safety and data migration deep dive', stage: 'Delivery stage 2', start: 39, days: 14, who: ['ethan', 'mia'] },
      { key: 'g', name: 'Go-live readiness assessment', stage: 'Delivery stage 2', start: 46, days: 14, who: ['tom', 'ethan'] },
      { key: 'h', name: 'Final assurance report', stage: 'Closure', start: 58, days: 11, who: ['tom', 'mia'], pred: ['g'] },
    ], { start: e2s });
    R.e2m1 = milestone('e2p1', { name: 'Inception report accepted', kind: 'Payment', key: true, planned_date: D4(9), billing_amount: 48000 });
    R.e2m2 = milestone('e2p1', { name: 'Interim report accepted', kind: 'Payment', key: true, planned_date: D4(38), billing_amount: 96000 });
    R.e2m3 = milestone('e2p1', { name: 'Final report accepted', kind: 'Payment', key: true, planned_date: D4(69), billing_amount: 96000 });
    R.e2d1 = deliverable('e2p1', { title: 'Inception report', planned_date: D4(8), client_approver_id: K.helen.id, billing_milestone_id: R.e2m1.id });
    R.e2d2 = deliverable('e2p1', { title: 'Interim assurance report', planned_date: D4(37), client_approver_id: K.helen.id, billing_milestone_id: R.e2m2.id });
    R.e2d3 = deliverable('e2p1', { title: 'Final assurance report', deliverable_class: 'Final report', planned_date: D4(68), client_approver_id: K.helen.id, billing_milestone_id: R.e2m3.id });
    for (const [m, amt] of [[R.e2m1, 48000], [R.e2m2, 96000], [R.e2m3, 96000]]) create('daniel', 'billing_event', { project_id: P.e2p1, kind: 'Milestone', description: `${m.name} (payment milestone)`, planned_date: m.planned_date, amount: amt, milestone_id: m.id, po_id: R.poh1.id, contract_id: R.sow2.id });
    R.e2r1 = raid('tom', 'risk', 'e2p1', { title: 'Vendor go-live date may move', cause: 'Vendor build is behind its own plan', event: 'The go-live date moves after the final report', effect: 'Assurance findings need refreshing', category: 'Delivery', owner_id: users.tom, likelihood: 3, consequence: 4, response: 'Reduce', response_actions: 'Agree a refresh clause; track the vendor plan weekly', client_visible: true });
    R.e2r2 = raid('tom', 'risk', 'e2p1', { title: 'Clinical safety case incomplete', category: 'Quality', event: 'The clinical safety case is not ready for the deep dive', owner_id: users.tom, likelihood: 3, consequence: 3, response: 'Reduce', response_actions: 'Early review of draft hazard log', client_visible: true });
    R.e2p2t = kit.buildPlan('tom', P.e2p2, [
      { key: 'a', name: 'PMO set-up and reporting calendar', stage: 'Initiation', start: 0, days: 8, initiation: true, who: ['tom', 'mia'] },
      { key: 'b', name: 'Monthly program reporting cycle', stage: 'Delivery stage 1', start: 8, days: kit.bdays(e2s, retainerEnd) - 8, who: ['mia'] },
      { key: 'c', name: 'RAID facilitation and board papers', stage: 'Delivery stage 1', start: 8, days: kit.bdays(e2s, retainerEnd) - 8, who: ['mia', 'jack'] },
    ], { start: e2s });
    R.e2p2m = milestone('e2p2', { name: 'PMO reporting cycle established', kind: 'Delivery', key: true, planned_date: D4(10) });
    raid('tom', 'risk', 'e2p2', { title: 'Retainer scope drifts into program management', category: 'Commercial', event: 'Requests exceed the agreed PMO services', owner_id: users.jack, likelihood: 2, consequence: 3, response: 'Reduce', response_actions: 'Monthly service review with Mark Evans' });
    allocate('e2p1', 'tom', e2s, D4(69), 20);
    allocate('e2p1', 'ethan', e2s, D4(69), 22.5);
    allocate('e2p1', 'mia', e2s, D4(69), 22.5);
    allocate('e2p1', 'jack', e2s, D4(69), 4);
    allocate('e2p2', 'mia', e2s, retainerEnd, 15);
    allocate('e2p2', 'jack', e2s, retainerEnd, 4);
    for (const k of ['ethan', 'mia']) member('e2', k, 'team_member');
  });
  baseline('e2p1', 'jack', D4(2), D4(3), { scale: 1.02, contingency: 10000 });
  baseline('e2p2', 'jack', D4(2), D4(3), { scale: 1.02, contingency: 0 });
  progressEvery('e2p1', D4(3), T);
  progressEvery('e2p2', D4(3), T);
  achieve('tom', 'e2p2m', D4(10));
  readyAndSubmit('e2p1', 'e2d1', D4(8), { reviewer: 'jack' });
  acceptByClient('helen', 'e2d1', D4(9), 'Accepted. Scope and interview list agreed.');
  readyAndSubmit('e2p1', 'e2d2', D4(36), { reviewer: 'jack', exec: false });
  acceptByClient('helen', 'e2d2', D4(39), 'Accepted. The board found the interim findings helpful.');
  on(D4(10), '09:30', 'E2 inception invoice', () => kit.invoice(P.e2p1, D4(10), { em: 'jack', draftDate: D4(10), paidAfterDays: 26 }));
  on(D4(40), '09:30', 'E2 interim invoice', () => kit.invoice(P.e2p1, D4(40), { em: 'jack', draftDate: D4(40), paidAfterDays: addDays(D4(41), 30) < T ? 28 : null }));
  for (const m of kit.monthsFrom(monthOf(e2s), monthOf(T))) {
    const draftDate = m === monthOf(e2s) ? D4(1) : nthBusinessDay(m, 1, kit.H);
    const paid = addDays(draftDate, 40) < T ? 25 : null;
    on(draftDate, '09:40', `E2 retainer invoice ${m}`, () => kit.invoice(P.e2p2, draftDate, { em: 'jack', draftDate, paidAfterDays: paid }));
  }
  on(D4(33), '16:00', 'E2 gate', () => {
    const stage = repos.stage.find({ project_id: P.e2p1 }).find((s) => s.name === 'Delivery stage 1');
    update('tom', 'stage', stage.id, { gate_artefacts: (stage.gate_artefacts || []).map((a) => ({ ...a, done: true, approved: true })), gate_criteria: (stage.gate_criteria || []).map((c) => ({ ...c, done: true })) });
    R.e2gate = create('tom', 'gate_review', { project_id: P.e2p1, stage_id: stage.id, date: D4(34), decision: 'Proceed', business_justification: true, notes: 'Interim findings ready; proceed to the deep dives.' });
    app.projects.submitGate(as('tom'), R.e2gate);
  });
  on(D4(34), '10:00', 'E2 gate approved', () => approve('jack', 'gate_review', R.e2gate.id, { comment: 'Proceed.' }));
  on(D4(15), '10:00', 'E2 issue', () => { R.e2i1 = raid('tom', 'issue', 'e2p1', { title: 'Delayed access to vendor test results', description: 'The vendor has not shared system test evidence.', severity: 'Medium', owner_id: users.tom, target_date: D4(22), client_visible: true }); });
  on(D4(23), '15:00', 'E2 issue resolved', () => update('tom', 'issue', R.e2i1.id, { status: 'Resolved', resolution: 'Evidence pack received after Mark Evans intervened.' }));
  on(D4(44), '10:00', 'E2 action', () => raid('tom', 'action', 'e2p1', { title: 'Prepare board briefing on interim findings', owner_org: 'Firm', owner_id: users.jack, due_date: addDays(T, 5), client_visible: true }));
  on(addDays(T, -15), '10:00', 'E2 satisfaction', () => create('jack', 'satisfaction', { engagement_id: E.e2, date: addDays(T, -15), respondent: 'Dr Helen Wu', score: 8, reporting_score: 9, comments: 'Clear and balanced findings.' }));
  on(addDays(T, -20), '10:00', 'E2 opportunity', () => create('jack', 'opportunity', { engagement_id: E.e2, title: 'Post-implementation review', description: 'PIR six months after go-live.', estimated_value: 120000, probability: 0.5 }));
  statusEvery('e2p1', D4(4), fri(-1));
  statusEvery('e2p2', D4(4), fri(-1));
  on(addDays(fri(0), -1), '15:00', 'E2 status this week', () => { kit.statusUpdate('tom', P.e2p1, fri(0)); kit.statusUpdate('tom', P.e2p2, fri(0)); });
  if (reports) on(fri(-1), '15:00', 'E2 weekly report', () => kit.weeklyReport('jack', E.e2, fri(-1), { pdf, narrative: { key_messages: '- Interim assurance report accepted by the board\n- Deep dives into clinical safety and data migration under way', summary: 'The assurance review is on track; the final report is due in three weeks.', decisions_required: 'None this period.', escalations: 'None.' } }));

  // =====================================================================================
  // E3 — Meridian Capital: Project Falcon (restricted, fixed price)
  // =====================================================================================
  const e3s = W(-6);
  const D5 = (n) => bd(e3s, n);
  engagement('e3', addDays(e3s, -14), 'lucas', {
    client_id: C.mcp.id, name: 'Project Falcon', type: 'advisory', practice: 'Cyber Security', start_date: e3s, end_date: D5(59), restricted: true,
    description: 'Confidential technology and cyber due diligence for a proposed acquisition.', client_sponsor_id: K.victoria.id, classification: 'Highly confidential', reporting_cadence: 'Weekly', report_approval: false,
    security_requirements: 'Need to know only. Insider list maintained; no data in shared repositories; clean-room review of the target’s data room.',
  });
  on(addDays(e3s, -10), '10:00', 'E3 letter of engagement', () => {
    R.loe3 = create('lucas', 'contract', { engagement_id: E.e3, kind: 'SOW', reference: 'MCP-LOE-001', title: 'Letter of engagement: technology due diligence', value: 180000, start_date: e3s, end_date: D5(59), commercial_model: 'Fixed price', status: 'Signed', signed_date: addDays(e3s, -10) });
    member('e3', 'chloe', 'team_member');
    member('e3', 'daniel', 'finance');
  });
  activate('e3', addDays(e3s, -9), 'lucas');
  project('e3p1', 'e3', addDays(e3s, -7), 'lucas', { name: 'Technology and cyber due diligence', pm: 'lucas', profile_id: 'prince2', approach: 'predictive', start_date: e3s, end_date: D5(59), size: 'small', commercial_model: 'Fixed price', fixed_price: 180000 });
  commercial('e3p1', addDays(e3s, -7), 'lucas', { price: 180000, cost: 62000, notes: 'Fixed price; 50% on signing, 50% on the final report.' });
  on(addDays(e3s, -6), '10:00', 'E3 plan', () => {
    fundingOf('e3', 'contract', R.loe3.id, 'e3p1', 180000, 'lucas');
    kit.buildPlan('lucas', P.e3p1, [
      { key: 'a', name: 'Mobilise and data room access', stage: 'Initiation', start: 0, days: 5, initiation: true, who: ['lucas'] },
      { key: 'b', name: 'Architecture and platform review', stage: 'Delivery stage 1', start: 5, days: 15, who: ['lucas'] },
      { key: 'c', name: 'Cyber maturity assessment (Essential Eight)', stage: 'Delivery stage 1', start: 8, days: 20, who: ['lucas'] },
      { key: 'd', name: 'Data and analytics assessment', stage: 'Delivery stage 1', start: 10, days: 15, who: ['chloe'] },
      { key: 'e', name: 'Draft findings', stage: 'Delivery stage 2', start: 28, days: 12, who: ['lucas', 'chloe'] },
      { key: 'f', name: 'Management presentation', stage: 'Delivery stage 2', start: 40, days: 5, who: ['lucas'] },
      { key: 'g', name: 'Final due diligence report', stage: 'Closure', start: 45, days: 14, who: ['lucas', 'chloe'] },
    ], { start: e3s });
    R.e3m1 = milestone('e3p1', { name: 'Draft findings presented', kind: 'Delivery', key: true, planned_date: D5(40) });
    R.e3m2 = milestone('e3p1', { name: 'Final report accepted', kind: 'Payment', key: true, planned_date: D5(59) });
    deliverable('e3p1', { title: 'Technology due diligence report', deliverable_class: 'Final report', planned_date: D5(58), client_approver_id: K.victoria.id });
    create('daniel', 'billing_event', { project_id: P.e3p1, kind: 'Instalment', description: 'Instalment 1: 50% on signing', planned_date: e3s, amount: 90000, contract_id: R.loe3.id });
    create('daniel', 'billing_event', { project_id: P.e3p1, kind: 'Milestone', description: 'Instalment 2: 50% on acceptance of the final report', planned_date: D5(59), amount: 90000, milestone_id: R.e3m2.id, contract_id: R.loe3.id });
    raid('lucas', 'risk', 'e3p1', { title: 'Vendor contracts missing from the data room', category: 'Commercial', event: 'Key vendor contracts are not provided before the draft findings', effect: 'Findings on change-of-control terms are qualified', owner_id: users.lucas, likelihood: 3, consequence: 3, response: 'Reduce', response_actions: 'Request list issued; escalate through the deal team' });
    raid('lucas', 'risk', 'e3p1', { title: 'Legacy platform end-of-support exposure larger than disclosed', category: 'Technical', event: 'Unsupported platforms underpin core trading systems', effect: 'Valuation adjustment and remediation costs', owner_id: users.lucas, likelihood: 3, consequence: 4, response: 'Accept', response_actions: 'Quantify remediation cost ranges for the deal team' });
    raid('lucas', 'action', 'e3p1', { title: 'Request penetration test reports from the target', owner_org: 'Firm', owner_id: users.lucas, due_date: addDays(T, 3) });
    allocate('e3p1', 'lucas', e3s, D5(59), 30);
    allocate('e3p1', 'chloe', addDays(e3s, 7), D5(59), 7.5);
    allocate('e3p1', 'olivia', e3s, D5(59), 2);
  });
  baseline('e3p1', 'lucas', D5(1), D5(2), { scale: 1.02, contingency: 8000 });
  on(D5(3), '10:00', 'E3 baseline approved by EE', () => { const apv = app.workflow.repo.find({ entity: 'project', entity_id: P.e3p1, status: 'Pending' })[0]; if (apv) approve('olivia', 'project', P.e3p1, { kind: 'baseline' }); });
  progressEvery('e3p1', D5(2), T);
  on(D5(2), '09:30', 'E3 instalment invoice', () => kit.invoice(P.e3p1, D5(2), { em: 'lucas', draftDate: D5(2), paidAfterDays: 12 }));
  weekly(D5(4), fri(-2), (f) => {
    on(addDays(f, -1), '16:00', 'E3 status', () => kit.statusUpdate('lucas', P.e3p1, f));
    on(f, '10:00', 'E3 status approved', () => { const su = app.status.latestFor(P.e3p1, f); if (su?.status === 'Submitted') approve('olivia', 'status_update', su.id, { comment: 'Noted.' }); });
  });
  on(fri(-1), '10:30', 'E3 status late', () => kit.statusUpdate('lucas', P.e3p1, fri(-1)));

  // =====================================================================================
  // E5 — Southern Water: Cyber Uplift Program (won in the CRM, awaiting commercial approval)
  // =====================================================================================
  on(addDays(T, -3), '08:15', 'CRM opportunity won', () => {
    const sys = kit.sys;
    const swc = entities.create(sys, 'client', { legal_name: 'Southern Water Corporation', code: 'SWC', sector: 'Energy and utilities', sector_type: 'Government', crm_id: 'CRM-ACC-2291', status: 'Active', payment_terms_days: 30 });
    const karen = entities.create(sys, 'contact', { client_id: swc.id, name: 'Karen Lee', title: 'Chief Information Officer', role: 'Sponsor', email: 'karen.lee@swc.example.com.au', is_approver: true });
    const e = entities.create(sys, 'engagement', {
      client_id: swc.id, name: 'Cyber Uplift Program', description: 'Essential Eight maturity assessment and a two-year uplift roadmap.', type: 'advisory', start_date: W(3), end_date: addDays(W(3), 7 * 20 - 3),
      manager_id: users.lucas, executive_id: users.olivia, status: 'Proposed', crm_opportunity_id: 'CRM-OPP-88412', client_sponsor_id: karen.id, practice: 'Cyber Security', classification: 'OFFICIAL: Sensitive',
    });
    E.e5 = e.id;
    emOf[e.id] = 'lucas';
    entities.create(sys, 'contract', { engagement_id: e.id, kind: 'SOW', reference: 'CRM-OPP-88412-SOW', title: 'Cyber uplift: assessment and roadmap', value: 340000, commercial_model: 'Fixed price', start_date: W(3), end_date: addDays(W(3), 7 * 20 - 3), status: 'Draft' });
    app.audit.record({ action: 'integration', entity: 'engagement', entityId: e.id, engagementId: e.id, summary: 'Engagement created from won CRM opportunity CRM-OPP-88412 (ENG-002)', after: { proposed_team: ['Lucas Martin', 'Chloe Nguyen', 'Ethan Clarke'] } });
    app.notify.send([users.lucas], { kind: 'engagement', title: `New engagement from CRM: ${e.name}`, body: 'Complete set-up: contracts, POs, projects and governance (UC-01).', link: `/engagements/${e.id}` });
  });
  on(addDays(T, -2), '11:00', 'E5 project set up', () => {
    const { project: p } = app.projects.createFromTemplate(as('lucas'), { engagement_id: E.e5, template_id: 'assurance', name: 'Essential Eight maturity assessment', manager_id: users.lucas, start_date: W(3), commercial_model: 'Fixed price', fixed_price: 340000 });
    P.e5p1 = p.id;
    pmOf[p.id] = 'lucas';
    app.projects.submitCommercial(as('lucas'), p.id, { price: 340000, cost: 176000, notes: 'Fixed price; value above the engagement manager’s authority.' });
    approve('lucas', 'project', p.id, { kind: 'commercial', comment: 'Resourcing confirmed with Grace.' });
  });

  // =====================================================================================
  // Firm-wide rhythm: timesheets, period close, forecast cycles, earned value history
  // =====================================================================================
  const firstWeek = W(-56);
  for (let ws = firstWeek; ws <= W(-3); ws = addDays(ws, 7)) {
    const week = ws;
    on(addDays(week, 7), '14:00', `Timesheets w/c ${week}`, () => kit.bookHistoricWeek(week));
  }
  // Christmas shutdown for everyone allocated over the break.
  for (let y = Number(firstWeek.slice(0, 4)); y <= Number(T.slice(0, 4)); y++) {
    on(`${y}-11-15`, '09:00', 'Christmas shutdown leave', () => {
      for (const key of Object.keys(people)) {
        const busy = repos.allocation.find({ person_id: people[key] }).some((a) => a.start_date <= `${y + 1}-01-02` && a.end_date >= `${y}-12-24`);
        if (busy) create(key, 'leave', { person_id: people[key], from: `${y}-12-24`, to: `${y + 1}-01-02`, kind: 'Annual', status: 'Approved' });
      }
    });
  }
  // Week before last and last week through the timesheet service.
  const everyone = Object.keys(people);
  const approvers = ['priya', 'tom', 'jack', 'lucas', 'olivia', 'marcus'];
  on(fri(-2), '16:30', 'Timesheets submitted (week -2)', () => { for (const k of everyone) kit.submitWeek(k, W(-2)); });
  on(W(-1), '14:00', 'Timesheets approved (week -2)', () => { for (const a of approvers) kit.approveWeek(a, W(-2)); });
  on(fri(-1), '16:30', 'Timesheets submitted (week -1)', () => { for (const k of everyone.filter((x) => !['noah', 'hannah', 'liam'].includes(x))) kit.submitWeek(k, W(-1)); });
  on(W(0), '09:40', 'Late-ish submissions', () => { for (const k of ['noah', 'hannah']) kit.submitWeek(k, W(-1)); });
  on(W(0), '14:00', 'Timesheets approved (week -1)', () => { for (const a of approvers) kit.approveWeek(a, W(-1), { exceptPeople: ['noah', 'hannah'] }); });
  on(T, '12:30', 'Draft timesheets this week', () => { for (const k of ['aisha', 'priya', 'emily', 'tom', 'mia', 'ethan', 'chloe']) kit.saveDraftWeek(k, W(0)); });
  // Period close on the third business day (FIN-041).
  for (const m of kit.monthsFrom(monthOf(firstWeek), monthOf(addMonths(monthOf(T), -1)))) {
    on(nthBusinessDay(addMonths(m, 1), 3, kit.H), '09:00', `Lock period ${m}`, () => app.finance.lockPeriod(as('daniel'), m));
  }
  // Monthly forecast cycles for the last three closed periods (FIN-022, UC-05).
  const lastLocked = nthBusinessDay(monthOf(T), 3, kit.H) <= T ? addMonths(monthOf(T), -1) : addMonths(monthOf(T), -2);
  for (const period of [addMonths(lastLocked, -2), addMonths(lastLocked, -1), lastLocked]) {
    kit.forecastCycle(period, {
      pmOf: (pid) => pmOf[pid],
      emOf: (eid) => emOf[eid],
      pmCommentary: (pid) => (pid === P.p02 ? 'EAC up on data migration effort (unbudgeted specialist from the build stage) and the payments API delay; CR-002 and dashboards deferral under discussion.' : 'Actuals rolled forward; labour forecast regenerated from confirmed allocations; no material movement.'),
      queryFor: (pid) => (period === lastLocked && pid === P.p02 ? 'EAC moved materially. Please explain the data migration overrun and confirm the PO increase timing before we lock this forecast.' : null),
    });
  }
  // Earned value and forecast refresh every Monday (FIN-028).
  for (const m of kit.mondays(firstWeek, T)) on(m, '06:00', 'Weekly forecast refresh', () => app.forecast.weeklyRefresh());
}
