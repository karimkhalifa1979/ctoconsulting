// Stage completion (RUL-18, INI-009): a stage is complete when every mandatory input configured for it
// is captured and any required approvals are recorded.
import { STAGES, PHASES, STAGE_CHECKS, CHECK_LABELS } from '../refdata.js';
import { asArray, stripHtml } from '../util.js';

const filled = (v) => !!stripHtml(v || '').trim();

export const CHECKS = {
  initiativeBasics: (m) => !!(m.initiative.primarySponsorId && m.initiative.changeLeadId && m.initiative.startDate && m.initiative.endDate),
  caseForChange: (m) => ['businessDrivers', 'problemOpportunity', 'whyNow', 'riskOfNotChanging'].filter((k) => filled(m.initiative[k])).length >= 3,
  objectives: (m) => m.objectives.length > 0,
  successMeasures: (m) => m.measures.some((x) => x.target != null && x.target !== ''),
  adoptionDefinition: (m) => filled(m.initiative.adoptionDefinition),
  scope: (m) => filled(m.initiative.whatIsChanging),
  milestones: (m) => m.milestones.some((x) => x.date),
  impactedGroups: (m) => m.groups.length > 0,
  impactsAssessed: (m) => m.groups.length > 0 && m.groups.every((g) => g.impacts.length > 0),
  stakeholdersAnalysed: (m) => m.profiles.length > 0 && m.profiles.filter((p) => p.influence && p.interest).length >= Math.ceil(m.profiles.length * 0.9),
  riskAssessed: (m) => !!(m.risk.cc && m.risk.oa),
  pctBaseline: (m) => !!m.risk.pct,
  sponsorshipModel: (m) => !!m.initiative.primarySponsorId && (m.coalition.length > 0 || filled(m.strategy?.sponsorshipGaps)),
  changeTeam: (m) => asArray(m.strategy?.changeTeam).length > 0,
  strategyApproved: (m) => m.strategy?.status === 'approved',
  orgBlueprint: (m) => m.blueprints.some((b) => b.scope === 'organisation'),
  groupBaselines: (m) => m.groups.length > 0 && m.groups.every((g) => g.adkarResults.some((r) => r.round === 'baseline')),
  planActivities: (m) => m.activities.some((a) => a.status !== 'cancelled'),
  engagementsPlanned: (m) => m.planItems.length > 0 && !m.coverage.some((w) => w.kind === 'noPlannedEngagement' && !w.ack),
  planApproved: (m) => m.planApproval?.status === 'approved',
  followUpAssessment: (m) => m.groups.some((g) => new Set(g.adkarResults.map((r) => r.round)).size > 1),
  engagementsLogged: (m) => m.engagements.some((e) => e.planItemId && ['completed', 'locked'].includes(e.status)),
  measureValues: (m) => m.measures.some((x) => x.category === 'individual' && x.values.length > 0),
  coverageAcknowledged: (m) => m.coverage.every((w) => w.ack),
  correctiveActionsTracked: (m) => m.correctiveActions.every((c) => c.ownerId) && (m.correctiveActions.length > 0 || !m.alerts.some((a) => a.kind === 'measureBelowThreshold')),
  performanceReview: (m) => !!m.closeout && (filled(m.closeout.performanceSummary) || asArray(m.closeout.measureReviews).length > 0),
  sustainmentPlan: (m) => m.sustainmentItems.length > 0 && m.sustainmentItems.every((s) => s.ownerId),
  handoverAccepted: (m) => m.handoverItems.length > 0 && m.handoverItems.every((h) => h.status === 'accepted'),
  lessonsCaptured: (m) => m.lessons.length > 0,
  closeoutApproved: (m) => m.closeout?.status === 'approved',
};

export function evaluateStages(model, stageChecks = STAGE_CHECKS) {
  const stages = STAGES.map((s) => {
    const checks = (stageChecks[s.id] || []).map((id) => {
      let ok = false;
      try { ok = !!CHECKS[id]?.(model); } catch { ok = false; }
      return { id, label: CHECK_LABELS[id] || id, ok };
    });
    const done = checks.filter((c) => c.ok).length;
    const status = checks.length && done === checks.length ? 'complete' : done > 0 ? 'inProgress' : 'notStarted';
    return { ...s, checks, done, total: checks.length, status, pct: checks.length ? Math.round((done / checks.length) * 100) : 0 };
  });
  const phases = PHASES.map((p) => {
    const ss = stages.filter((s) => s.phase === p.id);
    const status = ss.every((s) => s.status === 'complete') ? 'complete' : ss.some((s) => s.status !== 'notStarted') ? 'inProgress' : 'notStarted';
    return { ...p, stages: ss, status };
  });
  const current = stages.find((s) => s.status !== 'complete') || stages[stages.length - 1];
  return { stages, phases, current, currentPhase: phases.find((p) => p.id === current.phase) };
}
