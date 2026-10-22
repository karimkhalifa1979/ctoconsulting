// Builds the derived initiative model used by every screen, dashboard, report and artefact, so that
// figures always agree (Section 8.8). Pure: it takes records and configuration and returns a model.
import { DEFAULT_SETTINGS, PLAN_TYPES, ADKAR_IDS } from './refdata.js';
import { asArray, groupBy, indexBy, mean, personName, round, sortBy, uniq } from './util.js';
import { addDays, defaultHolidays, todayIso } from './dates.js';
import { listLabel } from './schema.js';
import { groupResults, currentResult, previousResult, stakeholderResults, NO_BARRIER } from './rules/adkar.js';
import { quadrant, engagementGap, requiredCadence, cadenceStatus, priorityScore, sentimentTrend, sentimentValue, resistanceEscalation, levelIndex } from './rules/stakeholders.js';
import { groupMemberIds, isOpen, isDone } from './rules/engagements.js';
import { overallImpact } from './rules/impact.js';
import { riskSummary, pctScores, pctTrend, latestOf, focusSuggestions, recommendedApproach, sponsorScore, riskRating } from './rules/risk.js';
import { coverageWarnings, progress } from './rules/plan.js';
import { readinessIndex, checklistScore, recommendation } from './rules/readiness.js';
import { enrichMeasure } from './rules/measures.js';
import { evaluateStages } from './rules/stages.js';
import { computeAlerts } from './rules/alerts.js';

export function mergeSettings(s = {}) {
  const out = { ...DEFAULT_SETTINGS, ...s };
  for (const k of ['adkar', 'impact', 'risk', 'cadenceDays', 'cadenceGroupCredit', 'load', 'alerts', 'priorityWeights', 'readinessWeights', 'rag', 'saturation', 'agentCoverage', 'privacy', 'attachments', 'ai', 'classification', 'artefacts', 'retention', 'sensitiveFields']) {
    out[k] = { ...(DEFAULT_SETTINGS[k] || {}), ...(s[k] || {}) };
  }
  return out;
}

export function holidaysOf(settings) {
  return settings.holidays?.length ? settings.holidays : defaultHolidays(2024, 2032);
}

export const ragOf = (v, rag = { greenFrom: 75, amberFrom: 50 }) => (v == null ? null : v >= rag.greenFrom ? 'green' : v >= rag.amberFrom ? 'amber' : 'red');

export function buildModel(data, { config = {}, today } = {}) {
  const settings = mergeSettings(config.settings);
  today = today || todayIso(settings.timeZone);
  const holidays = holidaysOf(settings);
  const R = (t) => data.records?.[t] || [];
  const initiative = data.initiative || {};
  const byId = {};
  for (const [t, list] of Object.entries(data.records || {})) byId[t] = indexBy(list);
  for (const t of ['engagementPlanItem', 'stakeholder', 'user', 'impactedGroup', 'stakeholderGroup', 'milestone', 'activity', 'measure', 'keyMessage', 'trainingIntervention', 'changeAgent', 'blueprint', 'survey', 'profile', 'engagement', 'risk', 'resistance']) byId[t] ||= {};

  const stakeholders = R('stakeholder');
  const stakeholderGroups = R('stakeholderGroup');
  const memberships = R('membership');
  const stakeholderName = (id) => (byId.stakeholder[id] ? personName(byId.stakeholder[id]) : byId.stakeholderGroup[id]?.name || '');
  const userName = (id) => byId.user[id]?.name || '';
  const milestones = sortBy(R('milestone'), 'date');
  const groupCtx = { groups: stakeholderGroups, memberships, stakeholders, today };
  const memberCache = {};
  const membersOf = (gid) => (memberCache[gid] ||= groupMemberIds(gid, groupCtx));

  // Stakeholder → stakeholder groups they belong to (for group-targeted engagements).
  const groupsOfStakeholder = {};
  for (const g of stakeholderGroups) for (const sid of membersOf(g.id)) (groupsOfStakeholder[sid] ||= new Set()).add(g.id);
  // Group → itself and its descendant groups, so engagements with a team count for its branch profile.
  const childrenOf = groupBy(stakeholderGroups.filter((g) => g.parentId), 'parentId');
  const familyCache = {};
  const familyOf = (gid) => {
    if (familyCache[gid]) return familyCache[gid];
    const out = new Set([gid]);
    const stack = [gid];
    while (stack.length) for (const c of childrenOf[stack.pop()] || []) if (!out.has(c.id)) { out.add(c.id); stack.push(c.id); }
    return (familyCache[gid] = out);
  };

  // --- Engagements ---------------------------------------------------------------------------------
  const engagements = sortBy(R('engagement'), (e) => e.actualDate || e.plannedDate || '9999', 'plannedTime').map((e) => {
    const item = e.planItemId ? byId.engagementPlanItem[e.planItemId] : null;
    const who = [...asArray(e.stakeholderIds).map(stakeholderName), ...asArray(e.groupIds).map(stakeholderName)].filter(Boolean);
    return {
      ...e,
      planItem: item,
      label: e.objective || e.purpose || item?.objective || listLabel('engagementType', e.engagementType, config) || e.code,
      audienceLabel: who.length > 3 ? `${who.slice(0, 3).join(', ')} +${who.length - 3}` : who.join(', ') || '—',
      date: e.actualDate || e.plannedDate || null,
      open: isOpen(e),
      done: isDone(e),
    };
  });
  const engByStakeholder = {};
  const reachedByStakeholder = {};
  const plannedByStakeholder = {};
  const engByGroup = {};
  for (const e of engagements) {
    const attendance = asArray(e.attendance);
    const direct = new Set([...asArray(e.stakeholderIds), ...attendance.filter((a) => a.status === 'attended').map((a) => a.stakeholderId)]);
    for (const sid of direct) (engByStakeholder[sid] ||= []).push(e);
    for (const gid of asArray(e.groupIds)) (engByGroup[gid] ||= []).push(e);
    // Communications and group sessions without attendance records reach every member of the targeted
    // groups; they appear in members' histories and count towards cadence where configured.
    if (e.done && asArray(e.groupIds).length && !attendance.length) {
      const reached = new Set();
      for (const gid of asArray(e.groupIds)) for (const sid of membersOf(gid)) if (!direct.has(sid)) reached.add(sid);
      for (const sid of reached) (reachedByStakeholder[sid] ||= []).push(e);
    }
    if (e.open) {
      const audience = new Set(asArray(e.stakeholderIds));
      for (const gid of asArray(e.groupIds)) for (const sid of membersOf(gid)) audience.add(sid);
      for (const sid of audience) (plannedByStakeholder[sid] ||= []).push(e);
    }
  }

  // --- Impacted groups --------------------------------------------------------------------------------
  const impactsByGroup = groupBy(R('impact'), 'impactedGroupId');
  const assessments = R('assessment');
  const interventions = R('trainingIntervention');
  const sessions = R('trainingSession');
  // Stakeholder → interventions enrolled in and completed.
  const enrolledIn = {};
  const completedIn = {};
  for (const s of sessions) {
    if (s.status === 'cancelled') continue;
    for (const en of asArray(s.enrolments)) {
      (enrolledIn[en.stakeholderId] ||= new Set()).add(s.interventionId);
      if (en.completed) (completedIn[en.stakeholderId] ||= new Set()).add(s.interventionId);
    }
  }
  const checklists = sortBy(R('readinessChecklist'), 'date');
  const latestGoLive = [...checklists].reverse().find((c) => c.kind === 'goLive') || checklists[checklists.length - 1] || null;
  const criteriaPct = latestGoLive ? checklistScore(latestGoLive) : null;
  const agents = R('changeAgent');
  const feedback = R('feedback');
  const sentimentWindowStart = addDays(today, -90);

  // TRN-008: completion of the interventions aimed at a group, across its recorded members (or, where no
  // members are recorded, across the people enrolled). Not applicable when no intervention targets the group.
  function trainingCompletion(groupId, memberIds) {
    const required = interventions.filter((iv) => asArray(iv.audienceGroupIds).includes(groupId));
    if (!required.length) return { applicable: false, required: 0, pct: null, completed: 0, enrolled: 0, denominator: 0, byIntervention: [] };
    const ids = required.map((iv) => iv.id);
    const people = memberIds.size ? [...memberIds] : Object.keys(enrolledIn).filter((sid) => ids.some((id) => enrolledIn[sid].has(id)));
    let done = 0;
    let all = 0;
    let anyEnrolled = 0;
    for (const sid of people) {
      const c = ids.filter((id) => completedIn[sid]?.has(id)).length;
      done += c;
      if (c === ids.length) all++;
      if (ids.some((id) => enrolledIn[sid]?.has(id))) anyEnrolled++;
    }
    const byIntervention = required.map((iv) => ({
      interventionId: iv.id, title: iv.title, target: iv.targetCompletion ?? null,
      enrolled: people.filter((sid) => enrolledIn[sid]?.has(iv.id)).length,
      completed: people.filter((sid) => completedIn[sid]?.has(iv.id)).length,
      pct: people.length ? round((people.filter((sid) => completedIn[sid]?.has(iv.id)).length / people.length) * 100) : null,
    }));
    return { applicable: true, required: ids.length, pct: people.length ? round((done / (people.length * ids.length)) * 100) : null, completed: all, enrolled: anyEnrolled, denominator: people.length, byIntervention };
  }

  // Change agent coverage applies when the Change Agent Network Plan is part of the approach.
  const agentsInScope = !asArray(initiative.selectedPlans).length || asArray(initiative.selectedPlans).includes('changeAgent');
  const groups = sortBy(R('impactedGroup'), 'name').map((g) => {
    const impacts = impactsByGroup[g.id] || [];
    const oi = overallImpact(impacts, settings.impact);
    const memberIds = g.stakeholderGroupId ? membersOf(g.stakeholderGroupId) : new Set();
    const results = groupResults(g.id, { assessments, memberIds, settings });
    const cur = currentResult(results);
    const prev = previousResult(results);
    const curMean = cur ? mean(ADKAR_IDS.map((el) => cur.scores[el])) : null;
    const memberCount = memberIds.size;
    const training = trainingCompletion(g.id, memberIds);
    const trainingPct = training.pct;
    const sentiments = [];
    for (const e of engagements) {
      if (!e.done || !e.actualDate || e.actualDate < sentimentWindowStart) continue;
      for (const s of asArray(e.sentiments)) {
        if (s.subjectId === g.stakeholderGroupId || memberIds.has(s.subjectId)) {
          const v = sentimentValue(s.sentiment);
          if (v != null) sentiments.push(v);
        }
      }
    }
    for (const fb of feedback) if (fb.groupId === g.id && fb.date >= sentimentWindowStart && sentimentValue(fb.sentiment) != null) sentiments.push(sentimentValue(fb.sentiment));
    const sentimentMean = sentiments.length ? round(mean(sentiments), 2) : null;
    const readiness = readinessIndex({ adkarMean: curMean, trainingPct, criteriaPct, sentimentMean }, settings.readinessWeights);
    const gAgents = agents.filter((a) => a.status !== 'inactive' && asArray(a.groupIds).includes(g.id));
    const activeAgents = gAgents.filter((a) => a.status !== 'onLeave');
    const ac = settings.agentCoverage;
    const ratioTarget = Math.min(ac.maxPerGroup || Infinity, Math.max(ac.minPerGroup || 1, Math.ceil((Number(g.headcount) || 0) / (ac.headcountPerAgent || 50))));
    const target = !agentsInScope ? 0 : g.agentTarget != null && g.agentTarget !== '' ? Number(g.agentTarget) : ratioTarget;
    return {
      ...g,
      impacts,
      overall: oi.overall,
      high: oi.high,
      degrees: oi.degrees,
      memberIds,
      memberCount,
      adkarResults: results,
      adkar: cur,
      adkarPrev: prev,
      adkarMean: curMean != null ? round(curMean, 2) : null,
      barrierPoint: cur?.barrierPoint || null,
      // New or changed barrier points are alerted for a period after the result that changed them (STK-044).
      barrierChanged: !!(cur && cur.date && cur.date >= addDays(today, -(settings.alerts?.barrierChangeDays ?? 30))) && (!!(cur && prev && cur.barrierPoint !== prev.barrierPoint) || !!(cur && !prev && cur.barrierPoint && cur.barrierPoint !== NO_BARRIER)),
      training,
      sentimentMean,
      readiness,
      rag: ragOf(readiness.index, settings.rag),
      agents: gAgents,
      agentCoverage: { count: activeAgents.length, onLeave: gAgents.length - activeAgents.length, target, gap: Math.max(0, target - activeAgents.length), applicable: target > 0, fromRatio: g.agentTarget == null || g.agentTarget === '' },
    };
  });
  const groupsById = indexBy(groups);

  // --- Stakeholder profiles ------------------------------------------------------------------------
  const resistance = R('resistance');
  const openResistanceBy = new Set(resistance.filter((r) => ['open', 'monitoring', 'escalated'].includes(r.status) && r.stakeholderId).map((r) => r.stakeholderId));
  const groupLevelOnly = !!(settings.privacy?.groupLevelOnly || initiative.groupLevelOnly);
  const priorityThreshold = settings.priorityThreshold ?? 70;
  const profiles = R('profile').map((p) => {
    const person = p.subjectType !== 'group';
    const s = person ? byId.stakeholder[p.stakeholderId] : null;
    const sg = !person ? byId.stakeholderGroup[p.groupId] : null;
    const name = person ? (s ? personName(s) : 'Unknown stakeholder') : sg?.name || 'Unknown group';
    const igIds = uniq([...asArray(p.impactedGroupIds), ...groups.filter((g) => (person ? g.memberIds.has(p.stakeholderId) : g.stakeholderGroupId === p.groupId)).map((g) => g.id)]);
    const groupImpact = igIds.map((id) => groupsById[id]?.overall).filter((v) => v != null);
    const impact = p.impactOverride != null && p.impactOverride !== '' ? Number(p.impactOverride) : groupImpact.length ? Math.max(...groupImpact) : null;
    const q = quadrant(p.influence, p.interest);
    const gap = engagementGap(p.currentEngagement, p.desiredEngagement);
    const subjectId = person ? p.stakeholderId : p.groupId;
    const groupEngs = () => {
      const fam = familyOf(p.groupId);
      const seen = new Set();
      const out = [];
      for (const gid of fam) for (const e of engByGroup[gid] || []) if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
      return out;
    };
    const direct = person ? engByStakeholder[p.stakeholderId] || [] : groupEngs();
    const reached = person ? (reachedByStakeholder[p.stakeholderId] || []).filter((e) => !direct.includes(e)) : [];
    const history = sortBy([...direct, ...reached.map((e) => ({ ...e, viaGroup: true }))], 'date');
    const completed = direct.filter((e) => e.done && e.actualDate).sort((a, b) => a.actualDate.localeCompare(b.actualDate));
    const lastEngaged = completed.length ? completed[completed.length - 1].actualDate : null;
    const reachedDates = reached.filter((e) => e.actualDate).map((e) => e.actualDate).sort();
    const lastReached = reachedDates.length ? reachedDates[reachedDates.length - 1] : null;
    const upcoming = sortBy((person ? plannedByStakeholder[p.stakeholderId] : direct.filter((e) => e.open)) || [], 'plannedDate').filter((e) => e.plannedDate && e.plannedDate >= today);
    const nextPlanned = upcoming[0]?.plannedDate || null;
    const cadenceDays = requiredCadence(q, settings, p.cadenceOverrideDays);
    const groupCredit = !!(q && settings.cadenceGroupCredit?.[q]);
    const cadenceBasis = groupCredit && lastReached && (!lastEngaged || lastReached > lastEngaged) ? lastReached : lastEngaged;
    const sentiments = [];
    for (const e of completed) for (const se of asArray(e.sentiments)) if (se.subjectId === subjectId) sentiments.push({ date: e.actualDate, sentiment: se.sentiment, value: sentimentValue(se.sentiment), engagementId: e.id });
    const trend = sentimentTrend(sentiments);
    const adkarHistory = person ? stakeholderResults(p.stakeholderId, assessments, settings) : [];
    const linkedGroup = !person ? groups.find((g) => g.stakeholderGroupId === p.groupId) : null;
    const barrier = person ? adkarHistory[adkarHistory.length - 1]?.barrierPoint || null : linkedGroup?.barrierPoint || null;
    const computedPriority = priorityScore({ influence: p.influence, impact, gap: gap.gap, barrier, roles: asArray(p.changeRoles) }, settings.priorityWeights);
    const priority = p.priorityOverride != null && p.priorityOverride !== '' ? Number(p.priorityOverride) : computedPriority;
    const levelChanges = asArray(p.ratingHistory).filter((h) => h.field === 'currentEngagement');
    const lastChange = levelChanges[levelChanges.length - 1];
    const levelDropped = lastChange && levelIndex(lastChange.to) != null && levelIndex(lastChange.from) != null && levelIndex(lastChange.to) < levelIndex(lastChange.from) && lastChange.at >= addDays(today, -60)
      ? `Moved from ${listLabel('engagementLevel', lastChange.from, config)} to ${listLabel('engagementLevel', lastChange.to, config)} on ${String(lastChange.at).slice(0, 10)}.` : null;
    return {
      ...p,
      person,
      stakeholder: s,
      group: sg,
      name,
      positionTitle: s?.positionTitle || '',
      organisation: s?.organisation || sg?.organisation || '',
      impactedGroups: igIds,
      impact,
      quadrant: groupLevelOnly && person ? null : q,
      gap: gap.gap,
      priorityFlag: gap.priority,
      priority,
      computedPriority,
      isPriority: gap.priority || (priority != null && priority >= priorityThreshold),
      cadenceDays,
      lastEngaged,
      lastReached,
      cadenceBasis,
      groupCredit,
      nextPlanned,
      cadence: cadenceStatus(cadenceBasis, cadenceDays, today, { since: p.createdAt ? String(p.createdAt).slice(0, 10) : null }),
      history,
      sentiments,
      sentimentTrend: trend,
      latestSentiment: trend.latest?.sentiment || null,
      adkarHistory,
      barrierPoint: barrier,
      escalation: resistanceEscalation({ influence: p.influence, currentEngagement: p.currentEngagement, sentiments }),
      hasOpenResistance: person && openResistanceBy.has(p.stakeholderId),
      levelDropped,
    };
  });
  const profileByStakeholder = {};
  for (const p of profiles) if (p.person) profileByStakeholder[p.stakeholderId] = p;

  // --- Activities, communications and plans ------------------------------------------------------------
  const activities = sortBy(R('activity'), (a) => a.startDate || '9999', 'code').map((a) => {
    const due = a.endDate || a.startDate;
    return { ...a, overdue: !!(due && due < today && !['complete', 'cancelled'].includes(a.status)) };
  });
  const comms = activities.filter((a) => a.kind === 'communication');
  const customPlans = asArray(initiative.customPlans).map((c) => ({ id: c.id, label: c.label, category: 'extend', adkar: c.adkar || [], custom: true, purpose: c.purpose || '' }));
  const planTypes = [...PLAN_TYPES, ...customPlans];
  const selectedPlans = asArray(initiative.selectedPlans).length ? asArray(initiative.selectedPlans) : PLAN_TYPES.map((p) => p.id);

  // --- Risk, PCT and sponsorship ------------------------------------------------------------------------
  const risk = riskSummary(assessments, settings);
  const pct = pctScores(latestOf(assessments, 'pct'));
  const strategy = R('strategy')[0] || null;
  const recommended = recommendedApproach(risk.profile);
  const sponsorAssessments = sortBy(assessments.filter((a) => a.kind === 'sponsor'), 'date', 'createdAt');
  const sponsorAssessment = [...sponsorAssessments].reverse().find((a) => a.subjectId === initiative.primarySponsorId) || sponsorAssessments[sponsorAssessments.length - 1] || null;
  const risks = R('risk').map((r) => ({ ...r, rating: riskRating(r.likelihood, r.consequence, settings.riskMatrix) }));

  // --- Measures ----------------------------------------------------------------------------------------
  const measureValues = R('measureValue');
  const measures = R('measure').map((m) => enrichMeasure(m, measureValues));

  // --- Surveys -----------------------------------------------------------------------------------------
  const responses = R('surveyResponse');
  const surveys = R('survey').map((s) => {
    const n = responses.filter((r) => r.surveyId === s.id).length;
    return { ...s, responses: n, responseRate: s.invited ? round((n / s.invited) * 100) : null };
  });

  const approvals = R('approval');
  const planApproval = sortBy(approvals.filter((a) => a.subjectType === 'masterPlan' && a.subjectId === initiative.id), 'requestedAt').slice(-1)[0] || null;

  const model = {
    today,
    settings,
    config,
    holidays,
    initiative,
    byId,
    records: data.records || {},
    stakeholderName,
    userName,
    membersOf,
    groupsOfStakeholder,
    stakeholders,
    stakeholderGroups,
    users: R('user'),
    milestones,
    objectives: R('objective'),
    measures,
    decisions: R('decision'),
    groups,
    groupsById,
    impacts: R('impact'),
    assessments,
    checklists: checklists.map((c) => ({ ...c, score: checklistScore(c) })),
    latestGoLive,
    risks,
    risk: { ...risk, pct, pctTrend: pctTrend(assessments), recommended, focus: focusSuggestions(assessments), sponsorScore: sponsorScore(sponsorAssessment), sponsorAssessment },
    strategy,
    coalition: R('coalitionMember'),
    blueprints: R('blueprint'),
    activities,
    comms,
    planTypes,
    selectedPlans,
    keyMessages: R('keyMessage'),
    faqs: R('faq'),
    toolkit: R('toolkitItem'),
    tnas: R('tna'),
    interventions,
    sessions,
    proficiency: R('proficiency'),
    supports: R('supportArrangement'),
    resistance,
    agents,
    profiles,
    profileByStakeholder,
    planItems: R('engagementPlanItem'),
    engagements,
    engByStakeholder,
    reachedByStakeholder,
    familyOf,
    feedback,
    surveys,
    responses,
    correctiveActions: R('correctiveAction'),
    sustainmentItems: R('sustainmentItem'),
    handoverItems: R('handoverItem'),
    lessons: R('lesson'),
    closeout: R('closeout')[0] || null,
    narratives: R('narrative'),
    baselines: sortBy(R('planBaseline'), 'date'),
    planChanges: R('planChange'),
    artefacts: R('artefact'),
    tasks: R('task'),
    approvals,
    planApproval,
    relationships: R('relationship'),
  };

  model.coverage = coverageWarnings(model);
  model.progress = progress(activities, groups, planTypes);
  model.readiness = latestGoLive ? { checklist: latestGoLive, score: criteriaPct, ...recommendation(latestGoLive, groups, settings.readinessThreshold) } : null;
  model.alerts = computeAlerts(model);
  model.stageStatus = evaluateStages(model, settings.stageChecks);
  model.kpis = kpis(model);
  return model;
}

function kpis(m) {
  const { today } = m;
  const persons = m.profiles.filter((p) => p.person);
  const withCadence = persons.filter((p) => p.cadenceDays);
  const inCadence = withCadence.filter((p) => !p.cadence.overdue);
  const from30 = addDays(today, -30);
  const plannedWindow = m.engagements.filter((e) => e.plannedDate && e.plannedDate >= from30 && e.plannedDate <= today && e.status !== 'cancelled');
  const completedWindow = m.engagements.filter((e) => e.done && e.actualDate && e.actualDate >= from30 && e.actualDate <= today);
  const readinessVals = m.groups.map((g) => g.readiness.index).filter((v) => v != null);
  const openRisks = m.risks.filter((r) => r.status !== 'closed');
  return {
    stakeholders: persons.length,
    groupProfiles: m.profiles.length - persons.length,
    priorityStakeholders: m.profiles.filter((p) => p.isPriority).length,
    engagementCoverage: withCadence.length ? round((inCadence.length / withCadence.length) * 100) : null,
    outsideCadence: withCadence.length - inCadence.length,
    plannedLast30: plannedWindow.length,
    completedLast30: completedWindow.length,
    plannedCompletedLast30: plannedWindow.filter((e) => e.done).length,
    upcoming14: m.engagements.filter((e) => e.open && e.plannedDate >= today && e.plannedDate <= addDays(today, 14)).length,
    impactedGroups: m.groups.length,
    highImpactGroups: m.groups.filter((g) => g.high).length,
    headcount: m.groups.reduce((a, g) => a + (Number(g.headcount) || 0), 0),
    barrierGroups: m.groups.filter((g) => g.barrierPoint && g.barrierPoint !== NO_BARRIER).length,
    readinessAvg: readinessVals.length ? round(mean(readinessVals)) : null,
    activitiesComplete: m.progress.overall.complete,
    activitiesTotal: m.progress.overall.total,
    activitiesOverdue: m.activities.filter((a) => a.overdue).length,
    openRisks: openRisks.length,
    highRisks: openRisks.filter((r) => ['high', 'extreme'].includes(r.rating)).length,
    openResistance: m.resistance.filter((r) => r.kind === 'observed' && r.status !== 'resolved').length,
    openActions: m.tasks.filter((t) => ['open', 'inProgress'].includes(t.status)).length,
    overdueActions: m.tasks.filter((t) => ['open', 'inProgress'].includes(t.status) && t.dueDate && t.dueDate < today).length,
    coverageWarnings: m.coverage.filter((w) => !w.ack).length,
    criticalAlerts: m.alerts.filter((a) => a.severity === 'critical').length,
  };
}

// Overall initiative RAG for status packs: worst of readiness, plan progress and risk.
export function overallRag(m) {
  const signals = [];
  if (m.kpis.readinessAvg != null) signals.push(ragOf(m.kpis.readinessAvg, m.settings.rag));
  if (m.kpis.activitiesTotal) {
    const overdueShare = m.kpis.activitiesOverdue / m.kpis.activitiesTotal;
    signals.push(overdueShare > 0.2 ? 'red' : overdueShare > 0.08 ? 'amber' : 'green');
  }
  if (m.kpis.highRisks) signals.push(m.kpis.highRisks > 2 ? 'red' : 'amber');
  if (m.kpis.engagementCoverage != null) signals.push(ragOf(m.kpis.engagementCoverage, m.settings.rag));
  if (signals.includes('red')) return 'red';
  if (signals.includes('amber')) return 'amber';
  return signals.length ? 'green' : null;
}
