// ART-010: completeness against what each artefact needs, before generating. Warnings mean the artefact
// would carry marked placeholders or misleading gaps (the user resolves them, proceeds with placeholders or
// cancels); information items do not hold generation up.
import { ADKAR } from '../refdata.js';
import { addDays } from '../dates.js';
import { asArray } from '../util.js';
import { managersOf } from './snapshot.js';

const ALL = 'all';
const RULES = [
  // [id, artefact types, check(model, params) → gap fields or null]
  ['sponsor', ['strategy', 'masterPlan', 'sponsorPack', 'steeringPack', 'coalitionPlan', 'changeOnAPage'], (m) => (!m.initiative.primarySponsorId ? { message: 'No primary sponsor is recorded.', fix: { page: 'setup', label: 'Record the primary sponsor' } } : null)],
  ['groups', ['strategy', 'masterPlan', 'impactAssessment', 'changeOnAPage', 'readinessReport', 'adkarReport', 'managerBriefing'], (m) => (!m.groups.length ? { message: 'No impacted groups are recorded.', fix: { page: 'impact', label: 'Add impacted groups' } } : null)],
  ['groupImpacts', ['strategy', 'masterPlan', 'impactAssessment', 'changeOnAPage', 'managerBriefing'], (m) => m.groups.filter((g) => !g.impacts.length).map((g) => ({ key: g.id, message: `${g.name} has no impact assessment.`, fix: { page: 'impact', label: 'Assess impacts' } }))],
  ['groupConfirmed', ['impactAssessment', 'masterPlan'], (m) => m.groups.filter((g) => g.impacts.length && g.confirmationStatus !== 'confirmed').map((g) => ({ key: g.id, severity: 'info', message: `Impacts for ${g.name} have not been confirmed by the group's representative.`, fix: { page: 'impact', tab: 'confirm', label: 'Request confirmation' } }))],
  ['adkarAge', ['adkarReport', 'readinessReport', 'masterPlan', 'steeringPack', 'sponsorPack'], (m, p, o) => m.groups.filter((g) => g.adkar?.date && g.adkar.date < addDays(m.today, -o.maxAgeDays)).map((g) => ({ key: g.id, severity: ['adkarReport', 'readinessReport'].includes(p.artefactType) ? 'warning' : 'info', message: `The latest ADKAR result for ${g.name} is from ${fmt(g.adkar.date)}, more than ${o.maxAgeDays} days ago.`, fix: { page: 'adkar', tab: 'assessments', label: 'Assess again' } }))],
  ['adkarMissing', ['adkarReport', 'readinessReport', 'masterPlan'], (m) => m.groups.filter((g) => !g.adkar).map((g) => ({ key: g.id, severity: 'info', message: `${g.name} has no ADKAR assessment yet.`, fix: { page: 'adkar', tab: 'assessments', label: 'Record an assessment' } }))],
  ['adkarUnconfirmed', ['adkarReport', 'masterPlan', 'readinessReport'], (m) => (m.groups.some((g) => g.adkar && !g.adkar.confirmed) ? { severity: 'info', message: 'Some ADKAR results have not been confirmed by a practitioner (ADK-012).', fix: { page: 'adkar', label: 'Confirm results' } } : null)],
  ['riskAssessment', ['strategy', 'riskReport'], (m) => (!m.risk.cc || !m.risk.oa ? { message: 'The change characteristics and organisational attributes assessments are not both complete.', fix: { page: 'risk', label: 'Complete the risk assessment' } } : null)],
  ['riskAge', ['strategy', 'riskReport', 'masterPlan'], (m, p, o) => { const d = [m.risk.cc?.date, m.risk.oa?.date].filter(Boolean).sort()[0]; return d && d < addDays(m.today, -2 * o.maxAgeDays) ? { severity: 'info', message: `The change risk assessment is from ${fmt(d)}; consider reassessing.`, fix: { page: 'risk', label: 'Reassess' } } : null; }],
  ['pct', ['strategy', 'riskReport'], (m) => (!m.risk.pct ? { severity: 'info', message: 'No PCT health assessment has been completed.', fix: { page: 'risk', tab: 'pct', label: 'Assess PCT' } } : null)],
  ['strategyApproved', ['masterPlan'], (m) => (m.strategy?.status !== 'approved' ? { message: 'The Change Management Strategy has not been approved; the plan will say so.', fix: { page: 'strategy', label: 'Submit the strategy for approval' } } : null)],
  ['objectives', ['strategy', 'masterPlan', 'closeout', 'changeOnAPage'], (m) => (!m.objectives.length ? { message: 'No objectives are recorded.', fix: { page: 'setup', tab: 'success', label: 'Add objectives' } } : null)],
  ['measures', ['strategy', 'masterPlan', 'closeout', 'readinessReport', 'changeOnAPage'], (m) => (!m.measures.length ? { message: 'No success measures are recorded.', fix: { page: 'setup', tab: 'success', label: 'Add success measures' } } : null)],
  ['caseForChange', ['strategy', 'masterPlan', 'sponsorPack', 'changeOnAPage'], (m) => (!m.initiative.reasonForChange && !m.initiative.businessDrivers ? { message: 'The case for change (reason for change or business drivers) is not recorded.', fix: { page: 'setup', label: 'Describe the case for change' } } : null)],
  ['plansActivities', ['masterPlan'], (m) => m.planTypes.filter((p) => m.selectedPlans.includes(p.id) && p.id !== 'blueprint' && !m.activities.some((a) => asArray(a.plans).includes(p.id))).map((p) => ({ key: p.id, message: `The ${p.label} is selected but has no activities.`, fix: { page: 'plan', label: 'Plan activities' } }))],
  ['blueprint', ['masterPlan', 'blueprint'], (m, p) => (!m.blueprints.length || (p.blueprintId && !m.blueprints.some((b) => b.id === p.blueprintId)) ? { message: 'No ADKAR Blueprint is recorded.', fix: { page: 'adkar', tab: 'blueprints', label: 'Create a Blueprint' } } : null)],
  ['coverage', ['masterPlan'], (m) => m.coverage.filter((w) => !w.ack && w.kind === 'noElement').slice(0, 6).map((w) => ({ key: w.id, severity: 'info', message: w.message, fix: { page: 'plan', tab: 'coverage', label: 'Review plan coverage' } }))],
  ['execSummary', ['strategy', 'masterPlan', 'steeringPack', 'closeout'], (m) => (!m.narratives.some((n) => n.key === 'executiveSummary') ? { severity: 'info', message: 'No executive summary has been written; a summary is generated from the data.', fix: { page: 'artefacts', tab: 'narratives', label: 'Write an executive summary' } } : null)],
  ['decisions', ['steeringPack', 'sponsorPack'], (m) => (!m.narratives.some((n) => n.key === 'decisionsRequired') ? { severity: 'info', message: 'No "decisions and support required" narrative has been written.', fix: { page: 'artefacts', tab: 'narratives', label: 'Write it' } } : null)],
  ['statusCommentary', ['steeringPack', 'engagementReport'], (m) => (!m.narratives.some((n) => n.key === 'statusCommentary') ? { severity: 'info', message: 'No status commentary for the period has been written.', fix: { page: 'artefacts', tab: 'narratives', label: 'Write it' } } : null)],
  ['readiness', ['readinessReport'], (m) => (!m.latestGoLive ? { message: 'No readiness checklist has been completed.', fix: { page: 'risk', tab: 'readiness', label: 'Assess readiness' } } : null)],
  ['readinessPlan', ['masterPlan'], (m) => (!m.latestGoLive ? { severity: 'info', message: 'No go-live readiness criteria are recorded yet.', fix: { page: 'risk', tab: 'readiness', label: 'Set readiness criteria' } } : null)],
  ['commsSender', ['commsPlan'], (m) => m.comms.filter((c) => c.status !== 'cancelled' && !c.delivererId).slice(0, 8).map((c) => ({ key: c.id, message: `"${c.title}" has no sender.`, fix: { page: 'comms', label: 'Choose a sender' } }))],
  ['commsAny', ['commsPlan'], (m) => (!m.comms.length ? { message: 'No communications are planned.', fix: { page: 'comms', label: 'Plan communications' } } : null)],
  ['messages', ['keyMessages', 'sponsorPack', 'managerBriefing'], (m) => (!m.keyMessages.some((k) => k.status === 'approved') ? { message: 'No key messages have been approved.', fix: { page: 'comms', tab: 'messages', label: 'Approve key messages' } } : null)],
  ['faqs', ['keyMessages', 'managerBriefing'], (m) => (!m.faqs.some((f) => f.status === 'approved' || f.published) ? { severity: 'info', message: 'No FAQs have been approved.', fix: { page: 'comms', tab: 'faqs', label: 'Approve FAQs' } } : null)],
  ['tna', ['trainingPlan'], (m) => (!m.tnas.length ? { message: 'No training needs analysis has been recorded.', fix: { page: 'training', tab: 'needs', label: 'Analyse training needs' } } : null)],
  ['interventions', ['trainingPlan', 'managerBriefing'], (m) => (!m.interventions.length ? { message: 'No training interventions are recorded.', fix: { page: 'training', tab: 'interventions', label: 'Add interventions' } } : null)],
  ['changeRoleTraining', ['trainingPlan'], (m) => (!m.interventions.some((iv) => iv.forChangeRoles) ? { severity: 'info', message: 'The Training Plan has no training for sponsors and people managers on their change roles (TRN-006).', fix: { page: 'training', label: 'Add change-role training' } } : null)],
  ['resistance', ['resistancePlan'], (m) => (!m.resistance.some((r) => r.kind === 'anticipated') ? { message: 'No anticipated resistance is recorded.', fix: { page: 'resistance', tab: 'plan', label: 'Anticipate resistance' } } : null)],
  ['agents', ['canPlan'], (m) => (!m.agents.length ? { message: 'No change agents are recorded.', fix: { page: 'agents', label: 'Build the network' } } : null)],
  ['coalition', ['coalitionPlan'], (m) => (!m.coalition.length ? { message: 'No sponsor coalition members are recorded.', fix: { page: 'sponsor', tab: 'coalition', label: 'Add coalition members' } } : null)],
  ['sustainment', ['sustainmentPlan', 'closeout'], (m) => (!m.sustainmentItems.length ? { message: 'No reinforcement mechanisms are recorded.', fix: { page: 'sustain', tab: 'plan', label: 'Plan reinforcement' } } : null)],
  ['sustainmentOwners', ['sustainmentPlan', 'handoverChecklist'], (m) => (m.groups.some((g) => !g.sustainmentOwnerId) ? { severity: 'info', message: 'Not every impacted group has a sustainment owner.', fix: { page: 'sustain', tab: 'handover', label: 'Nominate owners' } } : null)],
  ['handover', ['handoverChecklist'], (m) => (!m.handoverItems.length ? { message: 'No handover items are recorded.', fix: { page: 'sustain', tab: 'handover', label: 'Build the checklist' } } : null)],
  ['handoverPending', ['closeout'], (m) => (m.handoverItems.some((h) => h.status !== 'accepted') ? { severity: 'info', message: 'Some handover items have not been accepted.', fix: { page: 'sustain', tab: 'handover', label: 'Record acceptance' } } : null)],
  ['lessons', ['lessonsReport', 'closeout'], (m) => (!m.lessons.length ? { message: 'No lessons learned are recorded.', fix: { page: 'sustain', tab: 'lessons', label: 'Capture lessons' } } : null)],
  ['closeoutRecord', ['closeout'], (m) => (!m.closeout?.performanceSummary ? { message: 'The closeout performance summary has not been written.', fix: { page: 'sustain', tab: 'closeout', label: 'Write the performance summary' } } : null)],
  ['manager', ['managerBriefing'], (m, p) => {
    if (!p.managerId && !p.groupId) return { message: 'Choose the people manager (or impacted group) the pack is for.', fix: { field: 'managerId', label: 'Choose a manager' } };
    if (p.managerId && !managersOf(m).some((x) => x.id === p.managerId)) return { message: 'The chosen manager has no recorded team members in an impacted group; the pack will cover the groups chosen.', fix: { page: 'stakeholders', label: 'Record team members' } };
    return null;
  }],
  ['stakeholder', ['engagementBrief'], (m, p) => (!p.stakeholderId ? { message: 'Choose the stakeholder the brief is for.', fix: { field: 'stakeholderId', label: 'Choose a stakeholder' } } : !m.profileByStakeholder[p.stakeholderId] ? { severity: 'info', message: 'The stakeholder has no profile in this initiative; the brief will have little to say.', fix: { page: 'stakeholders', label: 'Add a profile' } } : null)],
  ['period', ['engagementReport'], (m, p) => { const from = p.from || addDays(m.today, -30); const to = p.to || m.today; return !m.engagements.some((e) => e.date >= from && e.date <= to) ? { severity: 'info', message: `No engagements fall between ${fmt(from)} and ${fmt(to)}.` } : null; }],
  ['aiDrafts', ALL, (m) => (m.narratives.some((n) => n.aiDrafted && !n.acceptedAt) || m.activities.some((a) => a.aiDrafted) || m.keyMessages.some((k) => k.aiDrafted) ? { severity: 'info', message: 'Some content was drafted with AI assistance and has not been accepted; it will be marked in the artefact (ART-022).' } : null)],
  ['adkarCoverage', ['blueprint'], (m, p) => { const b = m.blueprints.find((x) => x.id === p.blueprintId) || m.blueprints[0]; if (!b) return null; const missing = ADKAR.filter((el) => !b.elements?.[el.id]?.desiredOutcome).map((el) => el.label); return missing.length ? { message: `The Blueprint has no desired outcome for ${missing.join(', ')}.`, fix: { page: 'adkar', tab: 'blueprints', label: 'Complete the Blueprint' } } : null; }],
];

const fmt = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

export function completeness(model, artefactType, params = {}) {
  const opts = { maxAgeDays: model.settings.artefacts?.assessmentMaxAgeDays ?? 90 };
  const p = { ...params, artefactType };
  const gaps = [];
  for (const [id, types, check] of RULES) {
    if (types !== ALL && !types.includes(artefactType)) continue;
    let res;
    try { res = check(model, p, opts); } catch { res = null; }
    for (const g of asArray(res)) if (g) gaps.push({ id: g.key ? `${id}:${g.key}` : id, rule: id, severity: g.severity || 'warning', message: g.message, fix: g.fix || null });
  }
  return gaps;
}
