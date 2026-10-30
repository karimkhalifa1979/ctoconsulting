// Flat reporting datasets built from the initiative model. Used by the BI feed (RPT-005), report
// exports (RPT-003) and the report builder (RPT-004), so every channel reports the same figures.
import { ADKAR_IDS, adkarLabel } from './refdata.js';
import { listLabel } from './schema.js';
import { asArray } from './util.js';
import { QUADRANT_LABELS } from './rules/stakeholders.js';
import { initiativeComparison } from './rules/portfolio.js';

export const DATASETS = {
  initiatives: 'Initiatives with phase, risk profile, readiness, adoption and engagement coverage',
  groups: 'Impacted groups with impact, ADKAR, readiness and training',
  stakeholders: 'Stakeholder profiles with analysis and engagement status',
  engagements: 'Planned and completed engagements',
  activities: 'Plan activities',
  communications: 'Communications with audience, sender, channel and status',
  training: 'Training completion by impacted group and intervention',
  resistance: 'Anticipated and observed resistance',
  actions: 'Open tasks and corrective actions',
  changeAgents: 'Change agents with their groups and status',
  adkar: 'ADKAR results by group and round',
  measures: 'Success measure values',
  risks: 'Change risks and issues',
};

// The standard reports (RPT-002), shown on each initiative's Dashboards screen.
export const STANDARD_REPORTS = [
  { id: 'coverage', label: 'Stakeholder engagement coverage', description: 'Stakeholders engaged within their required cadence, by quadrant.' },
  { id: 'plannedActual', label: 'Planned versus actual engagements', description: 'Engagements planned and completed by month.' },
  { id: 'gap', label: 'Engagement gap', description: 'Current against desired engagement for each stakeholder.' },
  { id: 'adkar', label: 'ADKAR heatmap and trends', description: 'Latest ADKAR scores by group, barrier points and movement between rounds.' },
  { id: 'impact', label: 'Impact heatmap and timeline', description: 'Degree of impact by group and aspect, and when it lands.' },
  { id: 'comms', label: 'Communications calendar', description: 'Communications by week, audience and status.' },
  { id: 'training', label: 'Training completion and proficiency', description: 'Completion against target by group and intervention.' },
  { id: 'resistance', label: 'Resistance summary', description: 'Resistance by severity, form, barrier point and status.' },
  { id: 'readiness', label: 'Readiness status', description: 'Readiness index by group against the go-live threshold.' },
  { id: 'progress', label: 'Plan progress', description: 'Activities complete, in progress and overdue, by plan.' },
  { id: 'risks', label: 'Change risks', description: 'Change risks and issues by rating.' },
  { id: 'actions', label: 'Open actions', description: 'Open tasks and corrective actions by owner, with overdue items.' },
  { id: 'sponsor', label: 'Sponsor activity', description: 'Sponsor activities planned, delivered and confirmed.' },
  { id: 'agents', label: 'Change agent coverage', description: 'Change agents in place against the coverage target for each group.' },
  { id: 'measures', label: 'Adoption and success measures', description: 'Speed of adoption, ultimate utilisation and proficiency against targets.' },
];

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
    case 'initiatives':
      return initiativeComparison([m]).map(({ goLives, ...x }) => ({ ...x, nextGoLive: goLives.map((g) => g.date).filter((d) => d >= m.today).sort()[0] || '' }));
    case 'communications':
      return m.comms.map((a) => ({
        initiative: ini, activityId: a.id, code: a.code, title: a.title, audience: a.audience || asArray(a.groupIds).map((g) => m.groupsById[g]?.name).filter(Boolean).join('; ') || 'All impacted groups',
        sender: m.stakeholderName(a.delivererId), channel: a.channel || '', date: a.startDate, status: listLabel('commsStatus', a.commsStatus, c) || listLabel('activityStatus', a.status, c),
        adkar: asArray(a.adkar).map(adkarLabel).join('; '), sentAt: a.sentAt || '', approver: m.userName(a.approverId),
      }));
    case 'training':
      return m.groups.flatMap((g) => g.training.byIntervention.map((t) => ({
        initiative: ini, group: g.name, intervention: t.title, people: g.training.denominator, enrolled: t.enrolled, completed: t.completed, completionPct: t.pct, targetPct: t.target, belowTarget: t.target != null && t.pct != null && t.pct < t.target,
      })));
    case 'resistance':
      return m.resistance.map((r) => ({
        initiative: ini, code: r.code, title: r.title, kind: r.kind, stakeholderOrGroup: m.stakeholderName(r.stakeholderId) || m.groupsById[r.groupId]?.name || m.stakeholderName(r.groupId) || '',
        form: listLabel('resistanceForm', r.form, c), barrierPoint: r.barrierPoint ? adkarLabel(r.barrierPoint) : '', severity: listLabel('severity', r.severity, c), status: listLabel('resistanceStatus', r.status, c), owner: m.userName(r.ownerId), date: r.date, resolved: r.resolutionDate || '',
      }));
    case 'actions':
      return [
        ...m.tasks.filter((t) => ['open', 'inProgress'].includes(t.status)).map((t) => ({ initiative: ini, source: 'Task', code: t.code, title: t.title, owner: m.userName(t.assigneeId), due: t.dueDate || '', priority: listLabel('taskPriority', t.priority, c), overdue: !!(t.dueDate && t.dueDate < m.today) })),
        ...m.correctiveActions.filter((x) => ['open', 'inProgress'].includes(x.status)).map((x) => ({ initiative: ini, source: 'Corrective action', code: x.code, title: x.action, owner: m.userName(x.ownerId), due: x.dueDate || '', priority: '', overdue: !!(x.dueDate && x.dueDate < m.today) })),
      ];
    case 'changeAgents':
      return m.agents.map((a) => ({
        initiative: ini, code: a.code, name: m.stakeholderName(a.stakeholderId), groups: asArray(a.groupIds).map((g) => m.groupsById[g]?.name).filter(Boolean).join('; '), locations: a.locations || '',
        status: listLabel('agentStatus', a.status, c), hoursPerWeek: a.hoursPerWeek ?? null, managerEndorsed: !!a.managerEndorsed, startDate: a.startDate || '',
      }));
    case 'risks':
      return m.risks.map((r) => ({ initiative: ini, code: r.code, kind: r.kind, title: r.title, likelihood: r.likelihood, consequence: r.consequence, rating: r.rating, status: listLabel('riskStatus', r.status, c), owner: m.userName(r.ownerId), adkar: asArray(r.adkar).map(adkarLabel).join('; ') }));
    default:
      return [];
  }
}
