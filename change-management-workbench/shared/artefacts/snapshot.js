// Data snapshots for artefacts (ART-012, AC-10). A snapshot is a self-contained, JSON-serialisable copy
// of everything an artefact shows: resolved names and labels, derived figures and the reference lists, so
// the artefact can be reproduced exactly from it later. Sensitive fields (STK-048) are left out unless the
// generating user is authorised and chose to include them (RUL-17), and person-level analysis is left out
// when the organisation reports at group level only.
import { DEFAULT_LISTS, ADKAR, ADKAR_IDS, PLANNING_APPROACHES, QUESTION_SETS, GLOSSARY } from '../refdata.js';
import { listOptions } from '../schema.js';
import { overallRag } from '../model.js';
import { asArray, personName, sortBy, round, stripHtml, uniq, canonicalJson } from '../util.js';

export const SNAPSHOT_SCHEMA = 1;

// Parameters that identify a distinct artefact series (versions are numbered within a series).
const SCOPE_PARAMS = ['blueprintId', 'stakeholderId', 'managerId', 'groupId', 'groupIds', 'plans', 'from', 'to', 'variant'];
export function scopeKey(params = {}) {
  const key = {};
  for (const k of SCOPE_PARAMS) {
    const v = params[k];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    key[k] = Array.isArray(v) ? [...v].sort() : v;
  }
  return Object.keys(key).length ? key : null;
}

// People managers of impacted employees: the managers of recorded members of impacted groups.
export function managersOf(m) {
  const out = {};
  for (const g of m.groups) {
    for (const sid of g.memberIds) {
      const s = m.byId.stakeholder[sid];
      if (!s?.managerId) continue;
      const mgr = m.byId.stakeholder[s.managerId];
      if (!mgr) continue;
      const e = (out[mgr.id] ||= { id: mgr.id, name: personName(mgr), position: mgr.positionTitle || '', team: new Set(), groups: new Set() });
      e.team.add(sid);
      e.groups.add(g.id);
    }
  }
  return sortBy(Object.values(out).map((x) => ({ ...x, team: [...x.team], groups: [...x.groups] })), 'name');
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined && o?.[k] !== null && o?.[k] !== '').map((k) => [k, o[k]]));

// Initiative custom fields available to templates, keyed cf_….
function mergeableCustom(cfg, sensitive) {
  return asArray(cfg?.customFields?.initiative).filter((cf) => cf.mergeField !== false && (sensitive || !cf.sensitive)).map((cf) => ({ ...cf, key: cf.key.startsWith('cf_') ? cf.key : `cf_${cf.key}` }));
}
function customValue(cf, v, cfg) {
  if (v == null || v === '') return '';
  const opts = cf.list ? listOptions(cf.list, cfg) : asArray(cf.options);
  const lab = (x) => opts.find((o) => o.id === x)?.label || String(x);
  if (cf.type === 'bool') return v ? 'Yes' : 'No';
  if (cf.type === 'select') return lab(v);
  if (cf.type === 'multi') return asArray(v).map(lab).join(', ');
  if (cf.type === 'date' && /^\d{4}-\d{2}-\d{2}/.test(String(v))) return `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}`;
  return stripHtml(String(v));
}

export function buildSnapshot(model, params = {}, { includeSensitive = false, takenAt } = {}) {
  const m = model;
  const cfg = m.config;
  const settings = m.settings;
  const today = m.today;
  const sensitive = !!includeSensitive;
  const groupLevelOnly = !!(settings.privacy?.groupLevelOnly || m.initiative.groupLevelOnly);
  const userName = (id) => m.userName(id) || '';
  const sName = (id) => m.stakeholderName(id) || '';
  const planLabel = (id) => m.planTypes.find((p) => p.id === id)?.label || id;

  // --- Scope (ART-009) -------------------------------------------------------------------------------
  let groupScope = asArray(params.groupIds).length ? new Set(asArray(params.groupIds)) : null;
  let manager = null;
  if (params.managerId) {
    const mg = managersOf(m).find((x) => x.id === params.managerId);
    const s = m.byId.stakeholder[params.managerId];
    manager = { id: params.managerId, name: mg?.name || (s ? personName(s) : 'Unknown manager'), position: mg?.position || s?.positionTitle || '', teamCount: mg?.team.length || 0, groupIds: mg?.groups || [] };
    if (!groupScope && manager.groupIds.length) groupScope = new Set(manager.groupIds);
  }
  if (params.groupId) groupScope = new Set([params.groupId]);
  const inGroups = (ids) => !groupScope || !asArray(ids).length || asArray(ids).some((g) => groupScope.has(g));
  const planScope = asArray(params.plans).length ? new Set(asArray(params.plans)) : null;
  const inPlans = (plans) => !planScope || asArray(plans).some((p) => planScope.has(p));
  const from = params.from || null;
  const to = params.to || null;

  // --- Reference lists (labels as configured at the time of generation) ---------------------------------
  const lists = Object.fromEntries(Object.keys(DEFAULT_LISTS).map((k) => [k, Object.fromEntries(listOptions(k, cfg).map((o) => [o.id, o.label]))]));

  const i = m.initiative;
  const strategy = m.strategy;
  const initiative = {
    id: i.id, code: i.code, name: i.name, shortName: i.shortName || '', description: i.description || '', status: i.status, startDate: i.startDate || null, endDate: i.endDate || null,
    deliveryApproach: i.deliveryApproach || null, classification: i.classification || null,
    businessDrivers: i.businessDrivers || '', problemOpportunity: i.problemOpportunity || '', whyNow: i.whyNow || '', riskOfNotChanging: i.riskOfNotChanging || '', reasonForChange: i.reasonForChange || '',
    benefits: i.benefits || '', adoptionDefinition: i.adoptionDefinition || '', whatIsChanging: i.whatIsChanging || '', whatIsNotChanging: i.whatIsNotChanging || '', exclusions: i.exclusions || '',
    primarySponsorId: i.primarySponsorId || null, primarySponsor: sName(i.primarySponsorId), primarySponsorPosition: m.byId.stakeholder[i.primarySponsorId]?.positionTitle || '',
    businessOwner: sName(i.businessOwnerId), businessOwnerPosition: m.byId.stakeholder[i.businessOwnerId]?.positionTitle || '',
    changeLead: userName(i.changeLeadId), projectManager: userName(i.projectManagerId),
    selectedPlans: m.selectedPlans, planRationale: i.planRationale || '', closedAt: i.closedAt || null,
    // Administrator-defined fields offered as template merge fields (ADM-002); sensitive ones only when
    // sensitive fields are included.
    custom: Object.fromEntries(mergeableCustom(cfg, sensitive).map((cf) => [cf.key, customValue(cf, i[cf.key], cfg)])),
  };

  const plans = m.planTypes.map((p) => ({ id: p.id, label: p.label, category: p.category, purpose: p.purpose || '', adkar: asArray(p.adkar), selected: m.selectedPlans.includes(p.id), custom: !!p.custom }));
  const milestones = m.milestones.map((x) => ({ id: x.id, name: x.name, kind: x.kind, date: x.date, status: x.status || 'planned', description: stripHtml(x.description || '') }));
  const msName = (id) => m.byId.milestone?.[id]?.name || milestones.find((x) => x.id === id)?.name || '';
  const objectives = m.objectives.map((o) => ({ id: o.id, title: o.title, description: stripHtml(o.description || ''), benefits: stripHtml(o.benefits || '') }));

  // --- Impacted groups and impacts ---------------------------------------------------------------------
  const groups = m.groups.filter((g) => !groupScope || groupScope.has(g.id)).map((g) => ({
    id: g.id, code: g.code, name: g.name, headcount: Number(g.headcount) || 0, definition: stripHtml(g.definition || ''), locations: g.locations || '',
    manager: sName(g.managerStakeholderId), sustainmentOwner: sName(g.sustainmentOwnerId), confirmationStatus: g.confirmationStatus || null,
    adoptionChallenge: stripHtml(g.adoptionChallenge || ''), wiifm: stripHtml(g.wiifm || ''), concerns: stripHtml(g.concerns || ''),
    overall: g.overall ?? null, high: !!g.high, degrees: g.degrees || {},
    adkar: g.adkar ? { date: g.adkar.date, round: g.adkar.round, method: g.adkar.method, n: g.adkar.n, scores: g.adkar.scores, barrierPoint: g.adkar.barrierPoint, confirmed: !!g.adkar.confirmed } : null,
    adkarHistory: g.adkarResults.filter((r) => !r.suppressed).map((r) => ({ date: r.date, round: r.round, method: r.method, n: r.n, scores: r.scores, barrierPoint: r.barrierPoint })),
    adkarMean: g.adkarMean, barrierPoint: g.barrierPoint || null, barrierChanged: !!g.barrierChanged,
    readiness: { index: g.readiness.index, components: g.readiness.components }, rag: g.rag || null,
    training: { applicable: g.training.applicable, pct: g.training.pct, completed: g.training.completed, denominator: g.training.denominator, byIntervention: g.training.byIntervention },
    sentimentMean: sensitive ? g.sentimentMean : null, memberCount: g.memberCount,
    agents: { count: g.agentCoverage.count, onLeave: g.agentCoverage.onLeave, target: g.agentCoverage.target, gap: g.agentCoverage.gap, applicable: g.agentCoverage.applicable },
  }));
  const groupIds = new Set(groups.map((g) => g.id));
  const gName = (id) => m.groupsById[id]?.name || '';
  const impacts = m.impacts.filter((x) => groupIds.has(x.impactedGroupId)).map((x) => ({
    id: x.id, groupId: x.impactedGroupId, aspect: x.aspect, level: x.level || 'group', subject: x.subject || '', degree: x.degree == null ? null : Number(x.degree),
    currentState: stripHtml(x.currentState || ''), futureState: stripHtml(x.futureState || ''), description: stripHtml(x.description || ''),
    milestoneId: x.milestoneId || null, milestone: msName(x.milestoneId), feltFrom: x.feltFrom || null, feltTo: x.feltTo || null, transitionWeeks: x.transitionWeeks ?? null,
    milestoneDate: m.milestones.find((ms) => ms.id === x.milestoneId)?.date || null,
  }));

  // --- Stakeholders (STK) --------------------------------------------------------------------------
  const profiles = m.profiles.filter((p) => !(groupLevelOnly && p.person)).filter((p) => !groupScope || p.impactedGroups.some((g) => groupScope.has(g)) || !p.impactedGroups.length).map((p) => ({
    id: p.id, stakeholderId: p.stakeholderId || null, groupId: p.groupId || null, person: p.person, name: p.name, position: p.positionTitle || '', organisation: p.organisation || '',
    roles: asArray(p.changeRoles), impactedGroups: p.impactedGroups.filter((g) => groupIds.has(g) || !groupScope), relationshipOwner: userName(p.relationshipOwnerId),
    influence: p.influence || null, interest: p.interest || null, quadrant: p.quadrant || null, impact: p.impact ?? null,
    isPriority: !!p.isPriority, cadenceDays: p.cadenceDays ?? null, lastEngaged: p.cadenceBasis || null, nextPlanned: p.nextPlanned || null, cadenceOverdue: !!p.cadence?.overdue,
    barrierPoint: p.person && !sensitive ? null : p.barrierPoint || null,
    escalation: sensitive ? p.escalation || null : null,
    ...(sensitive ? { current: p.currentEngagement || null, desired: p.desiredEngagement || null, gap: p.gap ?? null, priority: p.priority ?? null, latestSentiment: p.latestSentiment || null, privateNotes: stripHtml(p.privateNotes || '') } : {}),
  }));
  const stakeholders = Object.fromEntries(profiles.filter((p) => p.person && p.stakeholderId).map((p) => {
    const s = m.byId.stakeholder[p.stakeholderId] || {};
    return [p.stakeholderId, { name: p.name, position: s.positionTitle || '', organisation: s.organisation || '', businessUnit: s.businessUnit || '', location: s.location || '', manager: sName(s.managerId), preferredChannels: asArray(s.preferredChannels), ...(sensitive ? { engagementAdjustments: stripHtml(s.engagementAdjustments || '') } : {}) }];
  }));

  const inWindow = (d) => (!from || (d && d >= from)) && (!to || (d && d <= to));
  const engagements = m.engagements.filter((e) => inWindow(e.date)).map((e) => ({
    id: e.id, code: e.code, date: e.date, plannedDate: e.plannedDate || null, actualDate: e.actualDate || null, status: e.status, done: !!e.done, open: !!e.open,
    type: e.engagementType || null, channel: e.channel || null, level: e.engagementLevel || null, objective: e.label, audience: e.audienceLabel, adkar: asArray(e.adkar),
    outcome: e.outcome || null, planned: !!e.planItemId && !e.unplanned, communication: !!e.communicationId, durationMinutes: e.durationMinutes ?? null,
    stakeholderIds: asArray(e.stakeholderIds), groupIds: asArray(e.groupIds), followUpRequired: !!e.followUpRequired, followUpDate: e.followUpDate || null,
    summary: stripHtml(e.summary || '').slice(0, 600), concerns: asArray(e.concerns).map((c) => (typeof c === 'string' ? c : c.text)).filter(Boolean),
    aiDrafted: !!e.aiDrafted, ...(sensitive ? { sentiments: asArray(e.sentiments).map((x) => ({ subject: sName(x.subjectId), sentiment: x.sentiment })) } : {}),
  }));
  const planItems = m.planItems.filter((x) => x.status !== 'cancelled').map((x) => ({
    id: x.id, objective: x.objective || '', adkar: asArray(x.adkar), type: x.engagementType || null, channel: x.channel || null, level: x.engagementLevel || null,
    audience: [...asArray(x.stakeholderIds).map(sName), ...asArray(x.groupIds).map(sName)].filter(Boolean).join(', '),
    timing: x.cadence && x.cadence !== 'oneOff' ? lists.cadence?.[x.cadence] || x.cadence : x.timingMode === 'milestone' ? `${x.offsetBusinessDays ?? 0} business days from ${msName(x.milestoneId)}` : x.plannedDate || x.windowStart || '',
    owner: userName(x.relationshipOwnerId), sender: sName(x.senderId),
    next: sortBy(m.engagements.filter((e) => e.planItemId === x.id && e.open && e.plannedDate >= today), 'plannedDate')[0]?.plannedDate || null,
  }));

  // --- ADKAR (ADK) ---------------------------------------------------------------------------------
  const blueprints = m.blueprints.filter((b) => (params.blueprintId ? b.id === params.blueprintId : !b.impactedGroupId || groupIds.has(b.impactedGroupId))).map((b) => ({
    id: b.id, name: b.name, scope: b.scope || (b.impactedGroupId ? 'group' : 'organisation'), groupId: b.impactedGroupId || null, group: gName(b.impactedGroupId), status: b.status || 'draft',
    elements: Object.fromEntries(ADKAR_IDS.map((el) => [el, pick(Object.fromEntries(Object.entries(b.elements?.[el] || {}).map(([k, v]) => [k, stripHtml(v || '')])), ['desiredOutcome', 'indicators', 'barriers', 'rootCauses', 'measures'])])),
  }));
  const individualAdkar = sensitive && !groupLevelOnly ? m.assessments.filter((a) => a.kind === 'adkar' && a.subjectType === 'stakeholder' && profiles.some((p) => p.stakeholderId === a.subjectId)).map((a) => ({ name: sName(a.subjectId), date: a.date, scores: Object.fromEntries(ADKAR_IDS.map((el) => [el, typeof a.scores?.[el] === 'object' ? a.scores?.[el]?.score ?? null : a.scores?.[el] ?? null])) })) : [];
  const surveys = m.surveys.map((x) => ({ id: x.id, title: x.title, kind: x.kind || 'adkar', status: x.status, opensAt: x.opensAt || null, closesAt: x.closesAt || null, responses: x.responses, invited: x.invited ?? null, responseRate: x.responseRate, responseTarget: x.responseTarget ?? 60, groups: asArray(x.groupIds).map(gName).filter(Boolean) }));

  // --- Risk (RSK) ----------------------------------------------------------------------------------
  const itemsOf = (a, set) => (a ? QUESTION_SETS[set].items.map((q) => ({ id: q.id, text: q.text, score: (() => { const v = a.scores?.[q.id]; const n = typeof v === 'object' && v !== null ? v.score : v; return n == null || n === '' ? null : Number(n); })() })) : []);
  const risk = {
    profile: m.risk.profile || null, ccScore: m.risk.ccScore ?? null, oaScore: m.risk.oaScore ?? null, ccDate: m.risk.cc?.date || null, oaDate: m.risk.oa?.date || null,
    ccItems: itemsOf(m.risk.cc, 'changeCharacteristics'), oaItems: itemsOf(m.risk.oa, 'orgAttributes'),
    pct: m.risk.pct ? { aspects: m.risk.pct.aspects, overall: m.risk.pct.overall, date: m.risk.pct.date } : null,
    pctTrend: asArray(m.risk.pctTrend).filter(Boolean).map((x) => ({ date: x.date, aspects: x.aspects, overall: x.overall })),
    recommended: m.risk.recommended ? { id: m.risk.recommended.id, label: m.risk.recommended.label, description: m.risk.recommended.description } : null,
    sponsorAssessed: m.risk.sponsorAssessment?.date || null, sponsorScore: sensitive ? m.risk.sponsorScore ?? null : null,
    focus: asArray(m.risk.focus).map((f) => ({ title: f.title, text: f.text, evidence: f.evidence })),
  };
  const risks = m.risks.filter((r) => inGroups(r.groupIds)).map((r) => ({
    id: r.id, code: r.code, kind: r.kind || 'risk', title: r.title, cause: stripHtml(r.cause || ''), consequenceText: stripHtml(r.consequenceText || ''), likelihood: r.likelihood ?? null, consequence: r.consequence ?? null,
    rating: r.rating || null, treatment: stripHtml(r.treatment || ''), owner: userName(r.ownerId), status: r.status, dueDate: r.dueDate || null, adkar: asArray(r.adkar), groups: asArray(r.groupIds).map(gName).filter(Boolean),
  }));
  const checklist = m.readiness?.checklist || m.latestGoLive || null;
  const readiness = checklist ? {
    name: checklist.name, kind: checklist.kind, date: checklist.date || null, milestone: msName(checklist.milestoneId), score: m.readiness?.score ?? null,
    items: asArray(checklist.items).map((x) => ({ criterion: x.criterion, owner: userName(x.ownerId), evidence: x.evidence || '', status: x.status || null, notes: x.notes || '' })),
    decision: checklist.decision || null, decisionDate: checklist.decisionDate || null, decidedBy: checklist.decidedBy || '', conditions: stripHtml(checklist.conditions || ''),
    recommendation: m.readiness?.decision || null, reasons: asArray(m.readiness?.reasons),
  } : null;

  // --- Strategy (STR) and sponsorship (SPN) --------------------------------------------------------
  const strat = strategy ? {
    status: strategy.status || 'draft', approvedVersion: strategy.approvedVersion || null, baselineAt: strategy.baselineAt || null,
    summary: strategy.summary || '', sponsorshipGaps: stripHtml(strategy.sponsorshipGaps || ''), sponsorshipActions: stripHtml(strategy.sponsorshipActions || ''),
    changeTeam: asArray(strategy.changeTeam).map((x) => pick(x, ['role', 'person', 'allocation', 'reportsTo', 'responsibilities'])),
    raci: asArray(strategy.raci).map((x) => pick(x, ['deliverable', 'responsible', 'accountable', 'consulted', 'informed'])),
    governance: asArray(strategy.governance).map((x) => pick(x, ['name', 'chair', 'frequency', 'purpose'])),
    approach: strategy.approach || null, approachLabel: PLANNING_APPROACHES.find((p) => p.id === strategy.approach)?.label || '', overrideRationale: stripHtml(strategy.overrideRationale || ''),
    integrationApproach: stripHtml(strategy.integrationApproach || ''), phaseMapping: asArray(strategy.phaseMapping).map((x) => pick(x, ['projectPhase', 'changeActivities'])),
    anticipatedResistance: stripHtml(strategy.anticipatedResistance || ''), specialTactics: stripHtml(strategy.specialTactics || ''), assumptions: stripHtml(strategy.assumptions || ''),
    budget: asArray(strategy.budget).map((x) => ({ ...pick(x, ['category', 'period', 'notes']), amount: x.amount == null || x.amount === '' ? null : Number(x.amount), effortDays: x.effortDays == null || x.effortDays === '' ? null : Number(x.effortDays) })),
  } : null;
  const coalition = m.coalition.map((c) => ({ id: c.id, name: sName(c.stakeholderId), position: m.byId.stakeholder[c.stakeholderId]?.positionTitle || '', area: c.area || '', current: c.currentSupport || null, desired: c.desiredSupport || null, actions: stripHtml(c.alignmentActions || ''), status: c.status || null }));

  // --- Plans and activities (PLN, SPN, PMG, COM, TRN, RES, CAN, SUS) ------------------------------------
  const activities = m.activities.filter((a) => inGroups(a.groupIds) && inPlans(a.plans)).map((a) => ({
    id: a.id, code: a.code, title: a.title, kind: a.kind || 'activity', description: stripHtml(a.description || '').slice(0, 500), plans: asArray(a.plans), adkar: asArray(a.adkar),
    groups: asArray(a.groupIds).filter((g) => m.groupsById[g]), owner: userName(a.ownerId), role: a.responsibleRole || null, deliverer: sName(a.delivererId), channel: a.channel || '',
    start: a.startDate || null, end: a.endDate || a.startDate || null, milestone: msName(a.milestoneId), status: a.status, pct: a.status === 'complete' ? 100 : Number(a.percentComplete) || 0, overdue: !!a.overdue,
    effortHours: a.effortHours == null || a.effortHours === '' ? null : Number(a.effortHours), cost: a.cost == null || a.cost === '' ? null : Number(a.cost), successMeasure: a.successMeasure || '',
    confirmed: !!a.confirmation?.confirmed, confirmedAt: a.confirmation?.at ? String(a.confirmation.at).slice(0, 10) : null, observations: a.confirmation?.observations || '',
    commsStatus: a.commsStatus || null, messageFocus: a.messageFocus || null, objective: stripHtml(a.objective || ''), audience: a.audience || '', keyMessages: asArray(a.keyMessageIds).map((k) => m.byId.keyMessage?.[k]?.title).filter(Boolean),
    senderOverridden: !!a.senderOverridden, interventionId: a.interventionId || null, aiDrafted: !!a.aiDrafted,
  }));
  const keyMessages = m.keyMessages.filter((k) => inGroups(k.audienceGroupIds)).map((k) => ({ id: k.id, title: k.title, text: stripHtml(k.text || ''), audience: asArray(k.audienceGroupIds).map(gName).filter(Boolean), roles: asArray(k.audienceRoles), adkar: asArray(k.adkar), focus: k.messageFocus || null, status: k.status || 'draft', version: k.messageVersion || 1, aiDrafted: !!k.aiDrafted }));
  const faqs = m.faqs.filter((f) => inGroups(f.audienceGroupIds)).map((f) => ({ id: f.id, question: f.question, answer: stripHtml(f.answer || ''), status: f.status || 'draft', published: !!f.published, audience: asArray(f.audienceGroupIds).map(gName).filter(Boolean), adkar: asArray(f.adkar) }));
  const toolkit = m.toolkit.filter((t) => inGroups(t.audienceGroupIds)).map((t) => ({ id: t.id, title: t.title, kind: t.kind, status: t.status, version: t.itemVersion || 1, audience: asArray(t.audienceGroupIds).map(gName).filter(Boolean), content: t.content || '' }));

  const interventions = m.interventions.filter((iv) => inGroups(iv.audienceGroupIds)).map((iv) => ({ id: iv.id, title: iv.title, modality: iv.modality, durationHours: iv.durationHours ?? null, prerequisites: iv.prerequisites || '', audience: asArray(iv.audienceGroupIds).map(gName).filter(Boolean), roles: iv.audienceRoles || '', owner: userName(iv.ownerId), timing: iv.milestoneId ? `${iv.offsetDays ?? 0} business days from ${msName(iv.milestoneId)}` : '', forChangeRoles: !!iv.forChangeRoles, target: iv.targetCompletion ?? null, lmsCourseId: iv.lmsCourseId || '' }));
  const ivIds = new Set(interventions.map((x) => x.id));
  const sessions = m.sessions.filter((x) => ivIds.has(x.interventionId)).map((x) => ({ id: x.id, intervention: m.byId.trainingIntervention?.[x.interventionId]?.title || '', interventionId: x.interventionId, date: x.date, time: x.startTime || '', location: x.location || (x.link ? 'Online' : ''), trainer: x.trainer || '', capacity: x.capacity ?? null, enrolled: asArray(x.enrolments).length, attended: asArray(x.enrolments).filter((e) => e.attended).length, completed: asArray(x.enrolments).filter((e) => e.completed).length, status: x.status }));
  const tnas = m.tnas.filter((t) => groupIds.has(t.impactedGroupId)).map((t) => ({ id: t.id, group: gName(t.impactedGroupId), role: t.role || '', requirement: stripHtml(t.requirement || ''), current: t.currentCapability ?? null, required: t.requiredCapability ?? null, gap: t.requiredCapability != null && t.currentCapability != null ? t.requiredCapability - t.currentCapability : null, objectives: stripHtml(t.learningObjectives || ''), priority: t.priority || null, interventions: asArray(t.interventionIds).map((id) => m.byId.trainingIntervention?.[id]?.title).filter(Boolean) }));
  const proficiency = groups.map((g) => { const xs = m.proficiency.filter((p) => p.impactedGroupId === g.id); return { group: g.name, records: xs.length, proficient: xs.filter((p) => p.result === 'proficient').length }; }).filter((x) => x.records);
  const supports = m.supports.filter((x) => inGroups(x.groupIds)).map((x) => ({ kind: x.kind, description: stripHtml(x.description || ''), groups: asArray(x.groupIds).map(gName).filter(Boolean), from: x.from || null, to: x.to || null, owner: userName(x.ownerId) }));

  const resistanceAll = m.resistance.filter((r) => !r.groupId || groupIds.has(r.groupId) || !groupScope);
  const aboutIndividuals = resistanceAll.filter((r) => r.sourceType === 'stakeholder' && r.stakeholderId);
  const resistance = resistanceAll.filter((r) => sensitive || !(r.sourceType === 'stakeholder' && r.stakeholderId)).map((r) => ({
    id: r.id, code: r.code, kind: r.kind, title: r.title, source: r.sourceType === 'stakeholder' && r.stakeholderId ? sName(r.stakeholderId) : gName(r.groupId) || 'Not recorded', individual: r.sourceType === 'stakeholder',
    group: gName(r.groupId), form: r.form || null, rootCause: stripHtml(r.rootCause || ''), barrierPoint: r.barrierPoint || null, severity: r.severity || null, impactOnAdoption: r.impactOnAdoption || '',
    prevention: stripHtml(r.preventionActions || ''), response: stripHtml(r.responseActions || ''), role: r.responsibleRole || null, owner: userName(r.ownerId), escalationPath: r.escalationPath || '',
    status: r.status, date: r.date || null, resolutionDate: r.resolutionDate || null,
    ...(sensitive ? { description: stripHtml(r.description || ''), evidence: stripHtml(r.evidence || '') } : {}),
  }));
  const agents = m.agents.filter((a) => inGroups(a.groupIds)).map((a) => ({ id: a.id, name: sName(a.stakeholderId), position: m.byId.stakeholder[a.stakeholderId]?.positionTitle || '', groups: asArray(a.groupIds).map(gName).filter(Boolean), locations: a.locations || m.byId.stakeholder[a.stakeholderId]?.location || '', hours: a.hoursPerWeek ?? null, endorsed: !!a.managerEndorsed, status: a.status || 'active', recognition: stripHtml(a.recognition || ''), role: stripHtml(a.roleDescription || '') }));
  const feedback = m.feedback.filter((f) => (!f.groupId || groupIds.has(f.groupId)) && inWindow(f.date));
  const themes = {};
  for (const f of feedback) for (const t of asArray(f.themes).length ? asArray(f.themes) : ['other']) {
    const e = (themes[t] ||= { theme: t, total: 0, positive: 0, neutral: 0, negative: 0 });
    e.total++;
    if (sensitive) {
      const s = f.sentiment;
      if (['veryPositive', 'positive'].includes(s)) e.positive++; else if (['veryNegative', 'negative'].includes(s)) e.negative++; else if (s) e.neutral++;
    }
  }

  const measures = m.measures.filter((x) => inGroups(x.groupIds)).map((x) => ({
    id: x.id, code: x.code, name: x.name, category: x.category, subtype: x.subtype || null, unit: x.unit || '', baseline: x.baseline ?? null, target: x.target ?? null, direction: x.direction || 'higher', threshold: x.threshold ?? null,
    method: stripHtml(x.method || ''), dataSource: x.dataSource || '', frequency: x.frequency || null, owner: userName(x.ownerId), sustainmentOwner: sName(x.sustainmentOwnerId), postCloseoutMonths: x.postCloseoutMonths || 0,
    latest: x.latest, latestDate: x.latestDate, status: x.status, progress: x.progress ?? null, belowThreshold: !!x.belowThreshold,
    values: x.values.map((v) => ({ date: v.date, value: Number(v.value), group: gName(v.groupId) || null })),
  }));
  const correctiveActions = m.correctiveActions.filter((c) => !c.groupId || groupIds.has(c.groupId)).map((c) => ({ gap: stripHtml(c.gap || ''), action: stripHtml(c.action || ''), owner: userName(c.ownerId), due: c.dueDate || null, status: c.status, group: gName(c.groupId), measure: m.measures.find((x) => x.id === c.measureId)?.name || '' }));
  const sustainment = m.sustainmentItems.filter((x) => inGroups(x.groupIds)).map((x) => ({ mechanism: x.mechanism, description: stripHtml(x.description || ''), owner: sName(x.ownerId), groups: asArray(x.groupIds).map(gName).filter(Boolean), measures: asArray(x.measureIds).map((id) => m.measures.find((y) => y.id === id)?.name).filter(Boolean), frequency: x.frequency || null, reviewDate: x.reviewDate || null, status: x.status || 'planned' }));
  const handover = m.handoverItems.filter((h) => !h.groupId || groupIds.has(h.groupId)).map((h) => ({ item: h.item, owner: sName(h.ownerId), group: gName(h.groupId), measure: m.measures.find((x) => x.id === h.measureId)?.name || '', status: h.status || 'pending', acceptedBy: h.acceptedBy || '', acceptedDate: h.acceptedDate || null, transferDate: h.transferDate || null, notes: stripHtml(h.notes || '') }));
  const lessons = m.lessons.map((l) => ({ title: l.title, category: l.category, whatWorked: stripHtml(l.whatWorked || ''), whatDidNot: stripHtml(l.whatDidNot || ''), recommendation: stripHtml(l.recommendation || ''), phase: l.phase || null, date: l.date || null, tags: l.tags || '' }));
  const co = m.closeout;
  const closeout = co ? {
    status: co.status || 'draft', performanceSummary: co.performanceSummary || '', overallRag: co.overallRag || null, sustainmentStatus: stripHtml(co.sustainmentStatus || ''), handoverStatus: stripHtml(co.handoverStatus || ''), recommendations: stripHtml(co.recommendations || ''),
    measureReviews: asArray(co.measureReviews).map((r) => ({ measure: m.measures.find((x) => x.id === r.measureId)?.name || '', actual: r.actual ?? null, gap: r.gap ?? null, commentary: r.commentary || '', gapAnalysis: r.gapAnalysis || '' })),
  } : null;

  // --- Narratives (ART-021) and AI drafts (ART-022) ---------------------------------------------------
  const narratives = Object.fromEntries(m.narratives.map((n) => [n.key, { title: n.title, html: n.content || '', aiDrafted: !!n.aiDrafted && !n.acceptedAt }]));
  const aiUnreviewed = Object.values(narratives).some((n) => n.aiDrafted) || activities.some((a) => a.aiDrafted) || keyMessages.some((k) => k.aiDrafted) || engagements.some((e) => e.aiDrafted);

  // --- Approvals and plan baselines (document control) -------------------------------------------------
  const approvalsFor = (subjectType, subjectId) => sortBy(m.approvals.filter((a) => a.subjectType === subjectType && a.subjectId === subjectId), 'requestedAt').map((a) => ({ requestedAt: String(a.requestedAt || '').slice(0, 10), status: a.status, approvers: asArray(a.approvers).map((x) => ({ name: x.name, decision: x.decision, at: x.decidedAt ? String(x.decidedAt).slice(0, 10) : null, comment: x.comment || '' })) }));
  const approvals = {
    masterPlan: approvalsFor('masterPlan', i.id),
    strategy: strategy ? approvalsFor('strategy', strategy.id) : [],
    closeout: co ? approvalsFor('closeout', co.id) : [],
  };

  // --- Derived figures ----------------------------------------------------------------------------
  const k = m.kpis;
  const kpis = {
    stakeholders: k.stakeholders, groupProfiles: k.groupProfiles, priorityStakeholders: k.priorityStakeholders, engagementCoverage: k.engagementCoverage, outsideCadence: k.outsideCadence,
    plannedLast30: k.plannedLast30, completedLast30: k.completedLast30, plannedCompletedLast30: k.plannedCompletedLast30, upcoming14: k.upcoming14,
    readinessAvg: k.readinessAvg, barrierGroups: k.barrierGroups, activitiesTotal: k.activitiesTotal, activitiesComplete: k.activitiesComplete, activitiesOverdue: k.activitiesOverdue,
    openRisks: k.openRisks, highRisks: k.highRisks, openResistance: k.openResistance, headcount: k.headcount, highImpactGroups: k.highImpactGroups, impactedGroups: k.impactedGroups, openActions: k.openActions, overdueActions: k.overdueActions, overallRag: overallRag(m),
  };
  const progress = {
    overall: m.progress.overall,
    byPlan: m.progress.byPlan.map((x) => ({ plan: x.plan.id, label: x.plan.label, total: x.total, complete: x.complete, inProgress: x.inProgress, overdue: x.overdue, pct: x.pct })),
    byElement: m.progress.byElement.map((x) => ({ element: x.element.id, total: x.total, complete: x.complete, overdue: x.overdue, pct: x.pct })),
  };
  const coverage = m.coverage.filter((w) => !w.ack).map((w) => ({ kind: w.kind, message: w.message }));
  const stages = m.stageStatus ? { current: m.stageStatus.current?.label || null, currentPhase: m.stageStatus.currentPhase?.label || null, phases: m.stageStatus.phases.map((p) => ({ label: p.label, status: p.status, stages: p.stages.map((s) => ({ label: s.label, status: s.status, done: s.done, total: s.total })) })) } : null;

  const snapshot = {
    schema: SNAPSHOT_SCHEMA,
    artefactType: params.artefactType || null,
    params: pick(params, ['artefactType', 'variant', 'from', 'to', 'groupIds', 'groupId', 'plans', 'managerId', 'stakeholderId', 'blueprintId', 'locale', 'watermark', 'title']),
    takenAt: takenAt || new Date().toISOString(),
    today,
    includeSensitive: sensitive,
    groupLevelOnly,
    hiddenIndividualResistance: sensitive ? 0 : aboutIndividuals.length,
    organisation: settings.organisationName || '',
    settings: { adkarThreshold: settings.adkar?.threshold ?? 3, readinessThreshold: settings.readinessThreshold ?? 70, rag: settings.rag, timeZone: settings.timeZone || 'Australia/Sydney', groupMaxCommsPer7Days: settings.load?.groupMaxCommsPer7Days ?? 5, agentHeadcountRatio: settings.agentCoverage?.headcountPerAgent ?? 50 },
    lists,
    customFieldDefs: { initiative: mergeableCustom(cfg, sensitive).map((cf) => ({ key: cf.key, label: cf.label })) },
    initiative, plans, milestones, objectives, measures, groups, impacts, profiles, stakeholders, engagements, planItems,
    blueprints, individualAdkar, surveys, risk, risks, readiness, strategy: strat, coalition,
    activities, keyMessages, faqs, toolkit, interventions, sessions, tnas, proficiency, supports,
    resistance, agents, feedbackThemes: sortBy(Object.values(themes), (x) => -x.total), correctiveActions, sustainment, handover, lessons, closeout,
    narratives, aiUnreviewed, approvals, kpis, progress, coverage, stages,
    manager, stakeholder: params.stakeholderId ? stakeholderDetail(m, params.stakeholderId, { sensitive, keyMessages, today }) : null,
    glossary: Object.entries(GLOSSARY).map(([term, text]) => ({ term, text })),
  };
  return JSON.parse(JSON.stringify(snapshot));
}

// The one-page brief on a stakeholder (STK engagement brief).
function stakeholderDetail(m, sid, { sensitive, today }) {
  const s = m.byId.stakeholder[sid];
  if (!s) return null;
  const p = m.profileByStakeholder[sid];
  const groups = m.groups.filter((g) => g.memberIds.has(sid) || p?.impactedGroups?.includes(g.id));
  const history = sortBy((p?.history || []).filter((e) => e.done), '-date').slice(0, 5).map((e) => ({ date: e.date, objective: e.label, type: e.engagementType, viaGroup: !!e.viaGroup, summary: stripHtml(e.summary || '').slice(0, 400), outcome: e.outcome || null }));
  const upcoming = sortBy(m.engagements.filter((e) => e.open && e.plannedDate >= today && (asArray(e.stakeholderIds).includes(sid) || asArray(e.groupIds).some((g) => m.membersOf(g).has(sid)))), 'plannedDate').slice(0, 5).map((e) => ({ date: e.plannedDate, objective: e.label, type: e.engagementType }));
  const concerns = uniq((p?.history || []).flatMap((e) => asArray(e.concerns).map((c) => (typeof c === 'string' ? c : c.text))).filter(Boolean)).slice(0, 6);
  return {
    id: sid, name: personName(s), position: s.positionTitle || '', organisation: s.organisation || '', businessUnit: s.businessUnit || '', location: s.location || '', manager: m.stakeholderName(s.managerId),
    preferredChannels: asArray(s.preferredChannels), availability: s.availability || '', language: s.language || '',
    roles: asArray(p?.changeRoles), relationshipOwner: m.userName(p?.relationshipOwnerId), influence: p?.influence || null, interest: p?.interest || null, quadrant: p?.quadrant || null, impact: p?.impact ?? null,
    cadenceDays: p?.cadenceDays ?? null, lastEngaged: p?.cadenceBasis || null, cadenceOverdue: !!p?.cadence?.overdue, isPriority: !!p?.isPriority,
    groups: groups.map((g) => ({ name: g.name, overall: g.overall, barrierPoint: g.barrierPoint || null, impacts: g.impacts.filter((x) => Number(x.degree) >= 3).map((x) => ({ aspect: x.aspect, degree: Number(x.degree), description: stripHtml(x.description || x.futureState || '') })) })),
    history, upcoming, concerns,
    keyMessages: m.keyMessages.filter((k) => k.status === 'approved' && (!asArray(k.audienceGroupIds).length || asArray(k.audienceGroupIds).some((g) => groups.some((x) => x.id === g)))).slice(0, 6).map((k) => ({ title: k.title, text: stripHtml(k.text || '') })),
    ...(sensitive ? {
      current: p?.currentEngagement || null, desired: p?.desiredEngagement || null, latestSentiment: p?.latestSentiment || null, escalation: p?.escalation || null, engagementAdjustments: stripHtml(s.engagementAdjustments || ''),
      openResistance: m.resistance.filter((r) => r.stakeholderId === sid && ['open', 'monitoring', 'escalated'].includes(r.status)).map((r) => ({ title: r.title, status: r.status, response: stripHtml(r.responseActions || '') })),
      adkar: p?.adkarHistory?.length ? p.adkarHistory[p.adkarHistory.length - 1] : null,
    } : {}),
  };
}

// ART-013: what changed in the data between two snapshots of the same artefact.
export function diffSnapshots(older, newer) {
  const out = [];
  const add = (area, change, detail) => out.push({ area, change, detail });
  const coll = (area, key, label, fields = []) => {
    const a = new Map(asArray(older?.[key]).map((x) => [x.id ?? label(x), x]));
    const b = new Map(asArray(newer?.[key]).map((x) => [x.id ?? label(x), x]));
    for (const [id, x] of b) if (!a.has(id)) add(area, 'added', label(x));
    for (const [id, x] of a) if (!b.has(id)) add(area, 'removed', label(x));
    for (const [id, x] of b) {
      const y = a.get(id);
      if (!y) continue;
      const changed = fields.filter((f) => canonicalJson(x[f] ?? null) !== canonicalJson(y[f] ?? null));
      if (changed.length) add(area, 'changed', `${label(x)}: ${changed.map((f) => `${f} ${fmtVal(y[f])} → ${fmtVal(x[f])}`).join('; ')}`);
    }
  };
  coll('Stakeholders', 'profiles', (p) => p.name, ['quadrant', 'influence', 'interest', 'isPriority', 'current', 'desired']);
  coll('Impacted groups', 'groups', (g) => g.name, ['headcount', 'overall', 'barrierPoint']);
  coll('Impacts', 'impacts', (x) => `${older?.groups?.find((g) => g.id === x.groupId)?.name || newer?.groups?.find((g) => g.id === x.groupId)?.name || 'Group'} – ${x.aspect}`, ['degree', 'milestone']);
  coll('Plan activities', 'activities', (x) => x.title, ['status', 'start', 'end', 'owner', 'pct']);
  coll('Milestones', 'milestones', (x) => x.name, ['date', 'status']);
  coll('Change risks', 'risks', (x) => x.title, ['rating', 'status']);
  coll('Success measures', 'measures', (x) => x.name, ['latest', 'target', 'status']);
  coll('Key messages', 'keyMessages', (x) => x.title, ['status', 'version']);
  coll('Resistance', 'resistance', (x) => x.title, ['status', 'severity']);
  // ADKAR scores moved, by group and element.
  for (const g of asArray(newer?.groups)) {
    const og = asArray(older?.groups).find((x) => x.id === g.id);
    if (!og?.adkar || !g.adkar) continue;
    for (const el of ADKAR_IDS) {
      const a = og.adkar.scores?.[el];
      const b = g.adkar.scores?.[el];
      if (a != null && b != null && Math.abs(a - b) >= 0.05) add('ADKAR scores', 'moved', `${g.name} ${ADKAR.find((x) => x.id === el).label}: ${round(a, 1)} → ${round(b, 1)}`);
    }
  }
  const kp = ['engagementCoverage', 'readinessAvg', 'activitiesComplete', 'activitiesOverdue', 'openRisks', 'openResistance'];
  for (const key of kp) {
    const a = older?.kpis?.[key], b = newer?.kpis?.[key];
    if (a !== b && (a != null || b != null)) add('Key figures', 'moved', `${KPI_LABELS[key]}: ${fmtVal(a)} → ${fmtVal(b)}`);
  }
  for (const [key, n] of Object.entries(newer?.narratives || {})) {
    const o = older?.narratives?.[key];
    if (!o) add('Narrative', 'added', n.title);
    else if (o.html !== n.html) add('Narrative', 'changed', n.title);
  }
  return out;
}

const KPI_LABELS = { engagementCoverage: 'Engaged within cadence (%)', readinessAvg: 'Average readiness', activitiesComplete: 'Activities complete', activitiesOverdue: 'Activities overdue', openRisks: 'Open change risks', openResistance: 'Open resistance' };
const fmtVal = (v) => (v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : String(v));

