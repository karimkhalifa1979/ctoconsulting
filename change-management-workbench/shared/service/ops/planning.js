// ADKAR, plan and measurement operations: UC-06 (assessment campaigns, barrier points and interventions),
// ADK-007 to ADK-012, PLN-002, PLN-006, RSK-005, MEA-001.
import { AppError, asArray, uid, round } from '../../util.js';
import { ADKAR_IDS, ADKAR_SURVEY_ITEMS, BARRIER_SIGNS, adkarLabel } from '../../refdata.js';
import { aggregate, NO_BARRIER } from '../../rules/adkar.js';
import { addDays, makeCalendar, fmtDate } from '../../dates.js';
import { holidaysOf } from '../../model.js';

export function registerPlanningOps(S) {
  // ADK-011 / UC-06 step 6: interventions for a group's barrier point (or reinforcement if none).
  S.op('suggestInterventions', { area: 'adkar', summary: 'Suggest interventions from the library for a group\'s barrier point' }, async (actor, { initiativeId, groupId, element }) => {
    const model = await S.model(initiativeId);
    S.assertInitiative(actor, model.initiative);
    const config = await S.getConfig();
    const g = model.groupsById[groupId];
    if (!g) throw new AppError(404, 'Impacted group not found.');
    const bp = element || g.barrierPoint;
    const target = !bp || bp === NO_BARRIER ? 'reinforcement' : bp;
    const existing = model.activities.filter((a) => a.status !== 'cancelled' && (!asArray(a.groupIds).length || asArray(a.groupIds).includes(groupId)));
    const items = config.interventions.filter((iv) => iv.element === target).map((iv) => ({
      ...iv,
      alreadyPlanned: existing.some((a) => a.interventionId === iv.id && asArray(a.groupIds).includes(groupId)),
    }));
    return { group: { id: g.id, name: g.name }, barrierPoint: bp || null, onTrack: !bp || bp === NO_BARRIER, element: target, signs: BARRIER_SIGNS[target], items };
  });

  // UC-06 step 7: accepted interventions become plan activities with owners and dates.
  S.op('acceptInterventions', { area: 'plans', summary: 'Add accepted interventions to plans as activities' }, async (actor, { initiativeId, groupId, items = [] }) => {
    const config = await S.getConfig();
    const out = [];
    for (const it of items) {
      const iv = config.interventions.find((x) => x.id === it.interventionId) || {};
      out.push(await S.create(actor, 'activity', {
        initiativeId, kind: 'activity', title: it.title || iv.title, description: it.description || iv.description, plans: asArray(it.plans || iv.plan), adkar: [iv.element || it.element],
        groupIds: groupId ? [groupId] : asArray(it.groupIds), ownerId: it.ownerId || actor.id, responsibleRole: iv.role || null, startDate: it.startDate || null, endDate: it.endDate || it.startDate || null,
        status: 'notStarted', percentComplete: 0, interventionId: iv.id || null, sourceType: 'barrierPoint', sourceId: groupId || null,
      }));
    }
    return out;
  });

  // ADK-012: practitioner confirmation before results are used in approved artefacts.
  S.op('confirmAssessment', { area: 'adkar', summary: 'Confirm assessment results for use in approved artefacts' }, async (actor, { id }) => {
    return S.update(actor, 'assessment', id, { confirmed: true, confirmedBy: actor.id, confirmedAt: S.nowIso() }, { auditAction: 'confirm' });
  });

  // RSK-005: accept a suggested focus area.
  S.op('acceptFocus', { area: 'assessment', summary: 'Accept a suggested focus area from a low-scoring assessment item' }, async (actor, { assessmentId, focus, createActivity }) => {
    const a = await S.driver.get('assessment', assessmentId);
    if (!a) throw new AppError(404, 'Assessment not found.');
    const accepted = [...asArray(a.acceptedFocus).filter((f) => f.id !== focus.id), { id: focus.id, title: focus.title, text: focus.text, at: S.nowIso(), by: actor.id }];
    const rec = await S.update(actor, 'assessment', a.id, { acceptedFocus: accepted }, { skipValidation: true });
    let activity = null;
    if (createActivity) activity = await S.create(actor, 'activity', { initiativeId: a.initiativeId, title: focus.title, description: focus.text, plans: ['sponsor'], adkar: ['awareness', 'desire'], ownerId: actor.id, status: 'notStarted', sourceType: 'focusArea', sourceId: a.id });
    return { assessment: rec, activity };
  });

  // PLN-002: select the plans that make up the Master Change Management Plan.
  S.op('selectPlans', { area: 'plans', summary: 'Select the plans included in the Master Change Management Plan' }, async (actor, { initiativeId, plans = [], rationale, customPlans }) => {
    if (!String(rationale || '').trim()) throw new AppError(422, 'Record the rationale for the plans selected (PLN-002).');
    const patch = { selectedPlans: plans, planRationale: rationale };
    if (customPlans) patch.customPlans = customPlans.map((c) => ({ id: c.id || `custom-${uid().slice(0, 6)}`, label: c.label, adkar: c.adkar || [], purpose: c.purpose || '' }));
    return S.update(actor, 'initiative', initiativeId, patch, { reason: rationale });
  });

  // PLN-006: baseline the plan.
  S.op('baselinePlan', { area: 'plans', summary: 'Baseline the current plan' }, async (actor, { initiativeId, name, reason }) => {
    const acts = await S.driver.list('activity', { initiativeId });
    const slim = acts.map((a) => ({ id: a.id, code: a.code, title: a.title, plans: a.plans, adkar: a.adkar, groupIds: a.groupIds, ownerId: a.ownerId, startDate: a.startDate, endDate: a.endDate, status: a.status, percentComplete: a.percentComplete }));
    return S.create(actor, 'planBaseline', { initiativeId, name: name || `Baseline ${S.nowIso().slice(0, 10)}`, date: S.nowIso().slice(0, 10), reason: reason || '', activities: slim });
  });

  // --- Survey campaigns (ADK-007, ADK-008, MEA-001) ---------------------------------------------------------
  S.op('createAdkarCampaign', { area: 'adkar', summary: 'Create an ADKAR self-assessment campaign for selected groups' }, async (actor, { initiativeId, title, round: rnd = 'adHoc', groupIds = [], opensAt, closesAt, anonymous = true }) => {
    const groups = await S.driver.list('impactedGroup', { initiativeId });
    const invited = groups.filter((g) => groupIds.includes(g.id)).reduce((a, g) => a + (Number(g.headcount) || 0), 0);
    return S.create(actor, 'survey', {
      initiativeId, title: title || 'ADKAR pulse check', kind: 'adkar', round: rnd, groupIds, anonymous, minSegment: (await S.getConfig()).settings.adkar.minSegment,
      opensAt: opensAt || S.nowIso().slice(0, 10), closesAt: closesAt || addDays(S.nowIso().slice(0, 10), 14), status: 'draft', invited, responseTarget: 60, collectionNoticeId: 'cn-survey',
      intro: 'This short check asks how you are finding the change. It takes about two minutes.',
      questions: [...ADKAR_SURVEY_ITEMS.map((q) => ({ ...q, type: 'adkar' })), { id: 'q-comment', type: 'text', text: 'Is there anything else you would like the change team to know?' }],
    });
  });

  // ADK-007: email a campaign's link to the current members of its target groups, when the deployment can send
  // email and knows its public address. Everyone receives the same link, so responses stay anonymous.
  async function emailSurveyLink(s, { reminder = false, groupIds } = {}) {
    if (!S.env.sendMail || !S.env.publicUrl) return { emailed: 0 };
    const m = await S.model(s.initiativeId);
    const targets = asArray(groupIds?.length ? groupIds : s.groupIds);
    const people = new Set();
    for (const g of m.groups.filter((x) => targets.includes(x.id))) for (const sid of g.memberIds) people.add(sid);
    const link = `${String(S.env.publicUrl).replace(/\/$/, '')}/#/survey/${s.token}`;
    const body = [
      `${reminder ? 'A reminder: you are' : 'You are'} invited to take part in "${s.title}" for ${m.initiative.name}.`,
      `It takes a few minutes${s.anonymous ? ', and your answers are anonymous' : ''}.`,
      '', link, '', s.closesAt ? `The survey closes on ${fmtDate(s.closesAt)}.` : '',
    ].join('\n');
    let emailed = 0;
    for (const sid of people) {
      const st = m.byId.stakeholder[sid];
      if (!st?.email || st.status === 'left' || st.deidentified) continue;
      try { await S.env.sendMail(st.email, `${reminder ? 'Reminder: ' : ''}${s.title}`, body); emailed++; } catch { /* reported in the count */ }
    }
    return { emailed };
  }

  S.op('openSurvey', { area: 'adkar', summary: 'Open a survey, issue its link and email it to the target groups' }, async (actor, { id }) => {
    const s = await S.driver.get('survey', id);
    if (!s) throw new AppError(404, 'Survey not found.');
    let rec = await S.update(actor, 'survey', id, { status: 'open', token: s.token || uid().slice(0, 16), opensAt: s.opensAt && s.opensAt <= (await S.today()) ? s.opensAt : await S.today() });
    const { emailed } = await emailSurveyLink(rec);
    if (emailed && !rec.invited) rec = await S.update(S.SYSTEM, 'survey', id, { invited: emailed }, { system: true, skipValidation: true, noAudit: true });
    return { ...rec, emailed };
  });

  // Schedules a draft campaign to open, and be distributed, on its opening date (ADK-007).
  S.op('scheduleSurvey', { area: 'adkar', summary: 'Schedule a survey to open on its opening date' }, async (actor, { id }) => {
    const s = await S.driver.get('survey', id);
    if (!s || s.status !== 'draft') throw new AppError(409, 'Only draft surveys can be scheduled.');
    if (!s.opensAt || s.opensAt <= (await S.today())) return S.ops.openSurvey(actor, { id });
    return S.update(actor, 'survey', id, { status: 'scheduled' }, { skipValidation: true });
  });

  S.op('sendSurveyReminder', { area: 'adkar', summary: 'Send a reminder to survey invitees' }, async (actor, { id, groupIds }) => {
    const s = await S.driver.get('survey', id);
    if (!s || s.status !== 'open') throw new AppError(409, 'Only open surveys can have reminders.');
    const { emailed } = await emailSurveyLink(s, { reminder: true, groupIds });
    const reminders = [...asArray(s.reminders), { at: S.nowIso(), by: actor.id, groupIds: groupIds || s.groupIds, emailed }];
    await S.audit(actor, { action: 'reminder', type: 'survey', recordId: id, initiativeId: s.initiativeId, summary: `Reminder issued for ${s.title}${emailed ? ` and emailed to ${emailed} people` : ''}` });
    return { ...(await S.update(actor, 'survey', id, { reminders }, { skipValidation: true })), emailed };
  });

  S.op('extendSurvey', { area: 'adkar', summary: 'Extend a survey closing date' }, async (actor, { id, closesAt }) => S.update(actor, 'survey', id, { closesAt }, { reason: 'Campaign extended' }));

  // Public, unauthenticated survey access (survey respondents need no licence).
  S.publicSurvey = async (token) => {
    const all = await S.driver.list('survey');
    const s = all.find((x) => x.token === token);
    if (!s || s.status !== 'open') throw new AppError(404, 'This survey is not open.');
    const config = await S.getConfig();
    const groups = (await S.driver.list('impactedGroup', { initiativeId: s.initiativeId })).filter((g) => asArray(s.groupIds).includes(g.id));
    const initiative = await S.initiative(s.initiativeId);
    const notice = config.settings.collectionNotices.find((n) => n.id === s.collectionNoticeId);
    return { id: s.id, title: s.title, intro: s.intro, kind: s.kind, anonymous: s.anonymous, closesAt: s.closesAt, questions: s.questions, languages: s.languages || null, groups: groups.map((g) => ({ id: g.id, name: g.name })), initiative: initiative?.name, notice: notice?.text || null, organisation: config.settings.organisationName };
  };

  S.submitSurveyResponse = async (token, { groupId, answers = {}, language, stakeholderId } = {}) => {
    const all = await S.driver.list('survey');
    const s = all.find((x) => x.token === token);
    if (!s || s.status !== 'open') throw new AppError(404, 'This survey is not open.');
    const today = await S.today();
    if (s.closesAt && today > s.closesAt) throw new AppError(409, 'This survey has closed.');
    if (asArray(s.groupIds).length && !asArray(s.groupIds).includes(groupId)) throw new AppError(422, 'Choose the group you belong to.');
    const clean = {};
    for (const q of asArray(s.questions)) {
      const v = answers[q.id];
      if (v == null || v === '') continue;
      if (q.type === 'adkar' || q.type === 'scale') {
        const n = Number(v);
        if (!(n >= 1 && n <= 5)) throw new AppError(422, 'Answers must be between 1 and 5.');
        clean[q.id] = n;
      } else clean[q.id] = String(v).slice(0, 2000);
    }
    if (!Object.keys(clean).length) throw new AppError(422, 'Answer at least one question.');
    await S.create(S.SYSTEM, 'surveyResponse', { initiativeId: s.initiativeId, surveyId: s.id, groupId: groupId || null, stakeholderId: s.anonymous ? null : stakeholderId || null, answers: clean, language: language || null, submittedAt: S.nowIso() }, { system: true, noAudit: true });
    return { ok: true };
  };

  // UC-06 step 4: close the campaign, aggregate by group, suppress small segments (RUL-03), store results.
  S.op('closeSurvey', { area: 'adkar', summary: 'Close a survey and store aggregated results by group' }, async (actor, { id }) => {
    const s = await S.driver.get('survey', id);
    if (!s) throw new AppError(404, 'Survey not found.');
    const config = await S.getConfig();
    const responses = (await S.driver.list('surveyResponse', { initiativeId: s.initiativeId })).filter((r) => r.surveyId === id);
    await S.update(actor, 'survey', id, { status: 'closed' });
    const results = [];
    if (s.kind === 'adkar') {
      const toScores = (r) => Object.fromEntries(ADKAR_SURVEY_ITEMS.map((q) => [q.element, r.answers?.[q.id] ?? null]));
      const opts = { threshold: config.settings.adkar.threshold, method: config.settings.adkar.groupMethod, proportion: config.settings.adkar.groupProportion, minSegment: s.minSegment || config.settings.adkar.minSegment };
      const date = (await S.today());
      for (const gid of asArray(s.groupIds)) {
        const rs = responses.filter((r) => r.groupId === gid).map(toScores);
        if (!rs.length) continue;
        const ag = aggregate(rs, opts);
        const rec = await S.create(S.SYSTEM, 'assessment', {
          initiativeId: s.initiativeId, kind: 'adkar', subjectType: 'group', subjectId: gid, round: s.round || 'adHoc', method: 'self', date, respondents: ag.n,
          scores: Object.fromEntries(ADKAR_IDS.map((el) => [el, ag.elements[el].score])), distribution: Object.fromEntries(ADKAR_IDS.map((el) => [el, ag.elements[el].distribution])),
          surveyId: s.id, confirmed: false, comment: ag.suppressed ? `Suppressed: fewer than ${opts.minSegment} respondents (RUL-03). Included only in the organisation-level result.` : '',
        }, { system: true });
        results.push({ groupId: gid, n: ag.n, suppressed: ag.suppressed, barrierPoint: ag.suppressed ? null : ag.barrierPoint });
      }
      // Higher-level aggregate includes every response, including suppressed segments.
      const all = responses.map(toScores);
      if (all.length) {
        const ag = aggregate(all, { ...opts, anonymous: true });
        await S.create(S.SYSTEM, 'assessment', {
          initiativeId: s.initiativeId, kind: 'adkar', subjectType: 'initiative', subjectId: s.initiativeId, round: s.round || 'adHoc', method: 'self', date, respondents: ag.n,
          scores: Object.fromEntries(ADKAR_IDS.map((el) => [el, ag.elements[el].score])), distribution: Object.fromEntries(ADKAR_IDS.map((el) => [el, ag.elements[el].distribution])), surveyId: s.id, confirmed: false,
        }, { system: true });
      }
    }
    // Free-text answers become feedback for theme analysis (MEA-002).
    for (const r of responses) {
      for (const q of asArray(s.questions).filter((x) => x.type === 'text')) {
        const t = r.answers?.[q.id];
        if (t && String(t).trim().length > 3) await S.create(S.SYSTEM, 'feedback', { initiativeId: s.initiativeId, date: String(r.submittedAt || S.nowIso()).slice(0, 10), channel: 'survey', groupId: r.groupId, text: String(t), surveyId: s.id, status: 'new', themes: [], adkar: [] }, { system: true, noAudit: true });
      }
    }
    await S.audit(actor, { action: 'close', type: 'survey', recordId: id, initiativeId: s.initiativeId, summary: `Closed ${s.title}: ${responses.length} responses` });
    return { responses: responses.length, results };
  });

  // Survey results summary for the UI, applying the anonymity threshold to every segment.
  S.op('surveyResults', { area: 'adkar', summary: 'Aggregated survey results with small segments suppressed' }, async (actor, { id }) => {
    const s = await S.get(actor, 'survey', id);
    const config = await S.getConfig();
    const responses = (await S.driver.list('surveyResponse', { initiativeId: s.initiativeId })).filter((r) => r.surveyId === id);
    const min = s.minSegment || config.settings.adkar.minSegment;
    const bySeg = {};
    for (const r of responses) (bySeg[r.groupId || 'none'] ||= []).push(r);
    const questions = asArray(s.questions).filter((q) => q.type !== 'text');
    const segment = (rs) => ({ n: rs.length, suppressed: rs.length < min, questions: rs.length < min ? null : Object.fromEntries(questions.map((q) => {
      const vals = rs.map((r) => Number(r.answers?.[q.id])).filter((v) => v >= 1 && v <= 5);
      return [q.id, { mean: vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length, 2) : null, distribution: [1, 2, 3, 4, 5].map((n) => vals.filter((v) => v === n).length) }];
    })) });
    return { survey: s, overall: segment(responses), segments: Object.fromEntries(Object.entries(bySeg).map(([g, rs]) => [g, segment(rs)])), minSegment: min, responseRate: s.invited ? round((responses.length / s.invited) * 100) : null };
  });

  // Training sessions: record attendance and completion in bulk (TRN-003).
  S.op('recordAttendance', { area: 'plans', summary: 'Record training attendance and completion' }, async (actor, { sessionId, enrolments }) => {
    const sess = await S.driver.get('trainingSession', sessionId);
    if (!sess) throw new AppError(404, 'Session not found.');
    return S.update(actor, 'trainingSession', sessionId, { enrolments, status: enrolments.some((e) => e.attended) ? 'completed' : sess.status });
  });

  // MEA-004: corrective action from a gap, optionally creating a plan revision.
  // MEA: feedback becomes a draft FAQ or an observed resistance item, linked both ways.
  S.op('convertFeedback', { area: 'plans', summary: 'Turn feedback into a draft FAQ or a resistance item' }, async (actor, { id, to }) => {
    const f = await S.driver.get('feedback', id);
    if (!f || f.deleted) throw new AppError(404, 'Feedback not found.');
    if (!['faq', 'resistance'].includes(to)) throw new AppError(422, 'Feedback can become an FAQ or a resistance item.');
    S.assertCan(actor, 'U', 'feedback', f, await S.accessCtx(actor, f.initiativeId));
    const text = String(f.text || '');
    const rec = to === 'faq'
      ? await S.create(actor, 'faq', { initiativeId: f.initiativeId, question: text.slice(0, 200), status: 'draft', audienceGroupIds: f.groupId ? [f.groupId] : [], adkar: asArray(f.adkar), sourceType: 'feedback', sourceId: f.id })
      : await S.create(actor, 'resistance', { initiativeId: f.initiativeId, kind: 'observed', title: text.slice(0, 120), description: text, sourceType: f.stakeholderId ? 'stakeholder' : 'group', stakeholderId: f.stakeholderId || null, groupId: f.groupId || null, barrierPoint: asArray(f.adkar)[0] || null, status: 'open', date: f.date, raisedFromType: 'feedback', raisedFromId: f.id });
    await S.update(actor, 'feedback', f.id, { status: 'actioned', convertedType: to, convertedId: rec.id }, { system: true, skipValidation: true });
    return rec;
  });

  S.op('raiseCorrectiveAction', { area: 'plans', summary: 'Raise a corrective action from a performance gap' }, async (actor, { initiativeId, gap, measureId, groupId, adkar = [], action, ownerId, dueDate, createActivity }) => {
    const ca = await S.create(actor, 'correctiveAction', { initiativeId, gap, measureId, groupId, adkar, action, ownerId: ownerId || actor.id, dueDate, status: 'open' }, { raw: true });
    if (createActivity) {
      const act = await S.create(actor, 'activity', { initiativeId, title: action.slice(0, 120), description: gap, plans: ['peopleManager'], adkar: adkar.length ? adkar : ['ability'], groupIds: groupId ? [groupId] : [], ownerId: ownerId || actor.id, startDate: S.nowIso().slice(0, 10), endDate: dueDate || null, status: 'notStarted', sourceType: 'correctiveAction', sourceId: ca.id });
      await S.update(S.SYSTEM, 'correctiveAction', ca.id, { activityIds: [act.id] }, { system: true });
      return { correctiveAction: ca, activity: act };
    }
    return { correctiveAction: ca };
  });

  // Business-day helper for the client (milestone-relative dates).
  S.op('addBusinessDays', { area: 'config', summary: 'Add business days to a date using the configured calendar' }, async (actor, { date, days }) => {
    const config = await S.getConfig();
    return { date: makeCalendar(holidaysOf(config.settings)).addBusinessDays(date, Number(days) || 0) };
  });

  S.op('barrierExplain', { area: 'adkar', summary: 'Explain a barrier point' }, async (actor, { element }) => ({ element, label: adkarLabel(element), signs: BARRIER_SIGNS[element] || '' }));
}
