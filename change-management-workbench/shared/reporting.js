// Flat reporting datasets built from the initiative model. Used by the BI feed (RPT-005), report
// exports (RPT-003) and the report builder (RPT-004), so every channel reports the same figures.
import { ADKAR_IDS, adkarLabel } from './refdata.js';
import { listLabel } from './schema.js';
import { asArray } from './util.js';
import { QUADRANT_LABELS } from './rules/stakeholders.js';

export const DATASETS = {
  groups: 'Impacted groups with impact, ADKAR, readiness and training',
  stakeholders: 'Stakeholder profiles with analysis and engagement status',
  engagements: 'Planned and completed engagements',
  activities: 'Plan activities',
  adkar: 'ADKAR results by group and round',
  measures: 'Success measure values',
  risks: 'Change risks and issues',
};

export function dataset(name, m, { canSensitive = false } = {}) {
  const c = m.config;
  const ini = m.initiative.name;
  switch (name) {
    case 'groups':
      return m.groups.map((g) => ({
        initiative: ini, groupId: g.id, code: g.code, group: g.name, headcount: g.headcount, overallImpact: g.overall, highImpact: g.high,
        barrierPoint: g.barrierPoint ? (g.barrierPoint === 'none' ? 'None' : adkarLabel(g.barrierPoint)) : '', ...Object.fromEntries(ADKAR_IDS.map((el) => [el, g.adkar?.scores?.[el] ?? null])),
        readinessIndex: g.readiness.index, trainingCompletionPct: g.training.pct, sentiment: g.sentimentMean, changeAgents: g.agentCoverage.count, changeAgentTarget: g.agentCoverage.target,
      }));
    case 'stakeholders':
      return m.profiles.map((p) => ({
        initiative: ini, profileId: p.id, code: p.code, name: p.name, position: p.positionTitle, organisation: p.organisation, type: p.person ? 'Person' : 'Group',
        roles: asArray(p.changeRoles).map((r) => listLabel('changeRole', r, c)).join('; '), relationshipOwner: m.userName(p.relationshipOwnerId),
        influence: listLabel('influence', p.influence, c), interest: listLabel('interest', p.interest, c), quadrant: QUADRANT_LABELS[p.quadrant] || '', impact: p.impact,
        currentEngagement: canSensitive ? listLabel('engagementLevel', p.currentEngagement, c) : undefined, desiredEngagement: canSensitive ? listLabel('engagementLevel', p.desiredEngagement, c) : undefined,
        priorityScore: canSensitive ? p.priority : undefined, priority: p.isPriority, cadenceDays: p.cadenceDays, lastEngaged: p.lastEngaged, nextPlanned: p.nextPlanned, overdue: !!p.cadence?.overdue,
      }));
    case 'engagements':
      return m.engagements.map((e) => ({
        initiative: ini, engagementId: e.id, code: e.code, objective: e.label, status: listLabel('engagementStatus', e.status, c), plannedDate: e.plannedDate, actualDate: e.actualDate,
        type: listLabel('engagementType', e.engagementType, c), channel: listLabel('channel', e.channel, c), level: listLabel('engagementApproach', e.engagementLevel, c),
        audience: e.audienceLabel, adkar: asArray(e.adkar).map(adkarLabel).join('; '), outcome: listLabel('outcomeRating', e.outcome, c), planned: !!e.planItemId, durationMinutes: e.durationMinutes,
      }));
    case 'activities':
      return m.activities.map((a) => ({
        initiative: ini, activityId: a.id, code: a.code, title: a.title, kind: a.kind, plans: asArray(a.plans).map((p) => m.planTypes.find((x) => x.id === p)?.label || p).join('; '),
        adkar: asArray(a.adkar).map(adkarLabel).join('; '), groups: asArray(a.groupIds).map((g) => m.groupsById[g]?.name).filter(Boolean).join('; ') || 'All groups',
        owner: m.userName(a.ownerId), start: a.startDate, end: a.endDate, status: listLabel('activityStatus', a.status, c), percentComplete: a.percentComplete, overdue: a.overdue,
      }));
    case 'adkar':
      return m.groups.flatMap((g) => g.adkarResults.filter((r) => !r.suppressed).map((r) => ({
        initiative: ini, group: g.name, round: listLabel('assessmentRound', r.round, c), date: r.date, method: r.method, respondents: r.n,
        ...Object.fromEntries(ADKAR_IDS.map((el) => [el, r.scores[el]])), barrierPoint: r.barrierPoint === 'none' ? 'None' : adkarLabel(r.barrierPoint), confirmed: r.confirmed,
      })));
    case 'measures':
      return m.measures.flatMap((x) => x.values.map((v) => ({ initiative: ini, measure: x.name, category: listLabel('measureCategory', x.category, c), date: v.date, value: v.value, group: m.groupsById[v.groupId]?.name || 'All', target: x.target, baseline: x.baseline, unit: x.unit })));
    case 'risks':
      return m.risks.map((r) => ({ initiative: ini, code: r.code, kind: r.kind, title: r.title, likelihood: r.likelihood, consequence: r.consequence, rating: r.rating, status: listLabel('riskStatus', r.status, c), owner: m.userName(r.ownerId), adkar: asArray(r.adkar).map(adkarLabel).join('; ') }));
    default:
      return [];
  }
}
