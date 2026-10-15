// Rules-based quality checks and gate readiness (GDA-01, GOV-06, business rules in section 7.1).
// Rules warn or block; nothing here makes a decision (principle P12).
import { GATES, DELIVERY_ROLES } from './config.js';
import { chainOf, modelChecks, btoppMix } from './chain.js';
import { capabilityDate, benefitStart, financials, isFinancial } from './finance.js';
import { accountabilities, riskScore } from './scoring.js';
import { daysBetween, keywords, sum, todayISO, monthsBetween } from './util.js';

const CAPABILITY_WORDS = ['system', 'platform', 'implemented', 'implement', 'delivered', 'installed', 'deployed', 'upgrade', 'upgraded', 'software', 'application', 'portal', 'tool'];

export const latestValueCase = (p) => (p.valueCases || []).slice().sort((a, b) => b.version - a.version)[0] || null;
export const lastDecision = (p) => (p.gates || []).filter((g) => g.decision).sort((a, b) => (a.decision.date < b.decision.date ? 1 : -1))[0] || null;
export const fundingApproved = (p) => sum((p.gates || []).filter((g) => g.decision), (g) => Number(g.decision.fundingApproved) || 0);
export const spendToDate = (p) => sum(p.projects || [], (x) => Number(x.actual) || 0) + (Number(p.otherSpend) || 0);
export const nextGate = (p) => (p.gates || []).filter((g) => !g.decision).sort((a, b) => (a.planned < b.planned ? -1 : 1))[0] || null;

export function qualityChecks(program, ws, { includeModel = true } = {}) {
  const out = includeModel ? modelChecks(program, ws).map((c) => ({ ...c, area: 'Benefits map' })) : [];
  const add = (severity, rule, area, text, extra = {}) => out.push({ severity, rule, area, text, ...extra });
  const t = ws.settings.thresholds;
  const person = (id) => ws.people.find((x) => x.id === id);
  const today = todayISO();

  if (!program.sponsorId) add('error', 'BR-01', 'Accountability', 'No business sponsor. A program cannot go to the board without exactly one sponsor.');
  if (program.succession && !program.succession.acceptedAt) add('warning', 'BR-17', 'Accountability', 'Sponsor succession in progress: accountability sits with the board chair until the new sponsor accepts.');

  // Benefits register checks (BR-10, BR-12, "so what?").
  for (const b of program.benefits || []) {
    if (!b.ownerId) add('error', 'BR-10', 'Benefits', `Benefit “${b.title}” has no owner.`);
    if (!b.measureId) add('warning', 'BR-10', 'Benefits', `Benefit “${b.title}” has no measure.`);
    if (!b.baseline || b.baseline.value === '' || b.baseline.value === undefined) {
      if (!b.baselinePlan) add('warning', 'BR-10', 'Benefits', `Benefit “${b.title}” has no baseline or approved plan to establish one.`);
    }
    if (keywords(b.title).some((w) => CAPABILITY_WORDS.includes(w))) add('warning', 'GDA-01', 'Benefits', `“${b.title}” reads like a capability, not a benefit. Ask “so what?” until you reach the business result.`);
    const cap = capabilityDate(program, b);
    if (cap && b.profile?.startDate && b.profile.startDate < cap) add('warning', 'BR-12', 'Benefits', `“${b.title}” is forecast to start before the capability it depends on is delivered (${cap}).`);
    const owner = person(b.ownerId);
    if (owner && (owner.roles || []).length && (owner.roles || []).every((r) => DELIVERY_ROLES.includes(r)) && !b.ownerConfirmed) add('warning', 'BR-22', 'Accountability', `Benefit “${b.title}” is owned by ${owner.name}, who holds only a delivery role. The sponsor must confirm.`);
    if (!b.outcomeId) add('info', 'BEN-01', 'Benefits', `Benefit “${b.title}” is not linked to a benefits-map outcome.`);
  }
  if (!(program.benefits || []).length) add('error', 'BEN-01', 'Benefits', 'The benefits register is empty.');

  // Overlapping benefit claims across programs (BEN-06, BR-11).
  for (const b of program.benefits || []) {
    if (!b.measureId) continue;
    const claims = ws.programs.flatMap((p) => (p.benefits || []).filter((x) => x.measureId === b.measureId).map((x) => ({ p, x })));
    const total = sum(claims, (c) => c.x.attribution ?? 1);
    if (claims.length > 1 && total > 1.0001) add('error', 'BR-11', 'Benefits', `Attribution for measure “${ws.measures.find((m) => m.id === b.measureId)?.name || b.measureId}” totals ${Math.round(total * 100)}% across ${claims.length} claims (max 100%).`);
    else if (claims.some((c) => c.p.id !== program.id)) add('info', 'BEN-06', 'Benefits', `“${b.title}” shares its measure with ${claims.filter((c) => c.p.id !== program.id).map((c) => c.p.name).join(', ')} (attribution ${Math.round(total * 100)}%).`);
  }

  // Value case (BR-08, BR-23, VCS-02).
  const vc = latestValueCase(program);
  const cat = ws.categories.find((c) => c.id === program.categoryId);
  if (cat?.discretionary && !vc) add('warning', 'VCS-01', 'Value case', 'No value case yet (full value case required for discretionary categories).');
  if (vc) {
    const last = lastDecision(program);
    if ((last && vc.createdAt.slice(0, 10) < last.decision.date) || daysBetween(vc.createdAt.slice(0, 10), today) > 180 || (program.materialChangeAt && vc.createdAt < program.materialChangeAt)) add('warning', 'VCS-02', 'Value case', `Value case v${vc.version} is stale — refresh it before the next gate.`);
    if ((vc.reviewCycles || 0) > t.reviewCycles) add('warning', 'BR-23', 'Value case', `Value case has been through ${vc.reviewCycles} review cycles (threshold ${t.reviewCycles}). Consider a decision rather than another cycle.`);
  }

  // Change management (CHG-04, CHG-09).
  const mix = btoppMix(program);
  const changeCost = sum((program.costs || []).filter((c) => c.type === 'change'), (c) => (c.basis === 'annual' ? c.amount * ((c.months || 12) / 12) : Number(c.amount) || 0));
  const totalCost = mix.totalCost || 0;
  if (totalCost > 0 && changeCost / totalCost < t.changeEffortMin) add('warning', 'CHG-09', 'Change', `Change management is ${Math.round((changeCost / totalCost) * 100)}% of program cost (threshold ${Math.round(t.changeEffortMin * 100)}%; major change programs often need 30–50%).`);
  const chain = chainOf(program);
  for (const s of program.stakeholders || []) {
    if (s.impact === 'high' && !chain.elements.some((e) => e.kind === 'initiative' && (e.targetGroups || []).includes(s.id))) add('warning', 'CHG-04', 'Change', `High-impact group “${s.name}” has no change initiative directed at it.`);
  }
  if (!(program.stakeholders || []).length && ['definition', 'active', 'awaiting-initiation'].includes(program.state)) add('warning', 'CHG-01', 'Change', 'No stakeholder register.');

  // Accountabilities (ACC-04).
  const pending = accountabilities(program, ws).filter((a) => !a.acceptedAt);
  if (pending.length) add('info', 'ACC-04', 'Accountability', `${pending.length} accountabilit${pending.length === 1 ? 'y is' : 'ies are'} not yet formally accepted.`);
  const unmet = accountabilities(program, ws).filter((a) => a.unmet > 0);
  if (unmet.length) add('warning', 'ACC-03', 'Accountability', `${unmet.length} accountabilit${unmet.length === 1 ? 'y has' : 'ies have'} unmet seven-plus-one conditions (raised as risks).`);

  // Assumption monitoring (MEA-11).
  for (const a of chain.elements.filter((e) => e.kind === 'assumption')) {
    if (a.assumption?.nextReview && a.assumption.nextReview < today) add('warning', 'MEA-11', 'Assumptions', `Review of assumption “${a.title}” is overdue (due ${a.assumption.nextReview}).`);
  }

  // Funding, tolerances and variance (GOV-03, GOV-13, PRJ-05).
  const approved = fundingApproved(program); const spent = spendToDate(program);
  if (approved > 0 && spent > approved * (1 + t.contingency)) add('error', 'GOV-03', 'Funding', `Spend to date exceeds the approved tranche plus contingency (${Math.round((spent / approved) * 100)}% of approved funding).`);
  for (const pr of program.projects || []) {
    if (pr.state === 'cancelled') continue;
    const costVar = pr.budget ? ((Number(pr.forecast) || Number(pr.actual) || 0) - pr.budget) / pr.budget : 0;
    const slip = pr.baselineEnd && pr.forecastEnd ? monthsBetween(pr.baselineEnd, pr.forecastEnd) : 0;
    if (costVar > (program.tolerances?.cost ?? t.varianceTolerance) || slip > (program.tolerances?.time ?? 3)) {
      const dependent = (program.benefits || []).filter((b) => (b.dependsOn || []).includes(pr.id));
      add('warning', 'PRJ-05', 'Delivery', `Project “${pr.name}” is outside tolerance (${costVar > 0 ? `cost +${Math.round(costVar * 100)}%` : ''}${slip > 0 ? `${costVar > 0 ? ', ' : ''}${slip} months late` : ''}). ${dependent.length} benefit${dependent.length === 1 ? '' : 's'} affected — confirm targets remain achievable.`);
    }
  }

  // High risk classification (VAL-11).
  const r = riskScore(program, ws);
  if (r.overall !== null && r.overall > t.riskRed && !program.assessment?.risk?.classification) add('warning', 'VAL-11', 'Assessment', 'Overall risk is high. Classify it as “not yet examined” (add mitigations) or “inherent at this stage” (smaller tranche, closer monitoring).');
  if (r.incomplete && r.overall !== null) add('info', 'VAL-05', 'Assessment', `Risk instrument ${Math.round(r.unanswered * 100)}% unanswered — score shown as incomplete.`);

  // Analysis paralysis (GDA-04).
  if (['concept', 'definition'].includes(program.state) && program.stateSince && daysBetween(program.stateSince, today) > t.analysisParalysisDays) add('warning', 'GDA-04', 'Governance', `In ${program.state} for ${daysBetween(program.stateSince, today)} days — possible analysis paralysis. Prompt a decision.`);

  // Gate calendar overdue (GOV-07).
  for (const g of program.gates || []) if (!g.decision && g.planned && g.planned < today) add('warning', 'GOV-07', 'Governance', `${g.gate} gate planned for ${g.planned} is overdue.`);

  return out;
}

// Auto-evaluated gate checklist (GOV-06); reviewers can override with met / not met / waived.
export function gateReadiness(program, ws, gateId) {
  const gate = GATES.find((g) => g.id === gateId);
  if (!gate) return { criteria: [], blocking: [] };
  const chain = chainOf(program);
  const checks = qualityChecks(program, ws);
  const fin = financials(program, ws);
  const vc = latestValueCase(program);
  const accs = accountabilities(program, ws);
  const outcomesOwned = accs.filter((a) => ['outcome-owner', 'benefit-owner'].includes(a.role));
  const auto = {
    'g1-chain': [chain.elements.some((e) => e.kind === 'outcome' && e.final), 'Final outcome present in the benefits map'],
    'g1-value': [fin.totalCosts > 0 && fin.totalBenefits !== 0, `Costs ${fin.totalCosts > 0 ? 'and benefits ' : ''}recorded`],
    'g1-risk': [riskScore(program, ws).overall !== null, 'Risk instrument has answers'],
    'g1-sponsor': [Boolean(program.sponsorId), program.sponsorId ? 'Sponsor nominated' : 'No sponsor'],
    'g1-align': [(program.driverIds || []).length > 0, `${(program.driverIds || []).length} strategic driver(s) linked`],
    'g2-vc': [Boolean(vc) && !checks.some((c) => c.rule === 'VCS-02'), vc ? `Value case v${vc.version}` : 'No value case'],
    'g2-chain': [!checks.some((c) => c.rule === 'BR-04') && chain.elements.length > 0 && chain.elements.filter((e) => e.kind !== 'assumption').every((e) => (e.validation || 'pending') === 'validated'), 'All initiatives lead to outcomes; elements validated'],
    'g2-owners': [outcomesOwned.length > 0 && outcomesOwned.every((a) => a.acceptedAt), `${outcomesOwned.filter((a) => a.acceptedAt).length}/${outcomesOwned.length} owners accepted`],
    'g2-baselines': [(program.benefits || []).length > 0 && (program.benefits || []).every((b) => b.measureId && (b.baseline?.value !== undefined && b.baseline?.value !== '' || b.baselinePlan)), 'Measures and baselines for all benefits'],
    'g2-change': [(program.stakeholders || []).length > 0 && !checks.some((c) => c.rule === 'CHG-04'), `${(program.stakeholders || []).length} stakeholder groups`],
    'g2-contingency': [!checks.some((c) => c.rule === 'BR-13'), 'Contingency plans in place'],
    'g2-drivers': [!checks.some((c) => c.rule === 'STR-04'), 'Final outcomes linked to drivers'],
    'g3-accept': [(program.projects || []).some((p) => p.acceptedDate), 'Capability acceptance recorded'],
    'g3-ready': [(program.stakeholders || []).every((s) => s.current === s.desired || s.current === 'proponent'), 'Stakeholders at desired position'],
    'g3-measures': [(program.benefits || []).every((b) => b.measureId && ws.measures.find((m) => m.id === b.measureId)?.active !== false), 'Measures active'],
    'br-actuals': [(program.benefits || []).some((b) => (b.actuals || []).length), 'Actuals captured'],
    'br-assumptions': [!checks.some((c) => c.rule === 'MEA-11'), 'Assumption reviews up to date'],
    'br-options': [false, 'Record options in the review'],
    'g4-paths': [(chain.paths || []).filter((p) => p.selected).length > 0, 'Selected path conditions'],
    'g4-steady': [steadyState(program, ws), `Steady state for ${ws.settings.thresholds.steadyPeriods} periods`],
    'g4-handover': [(program.benefits || []).length > 0 && (program.benefits || []).every((b) => b.operationalOwnerId && program.acceptances?.[`operational-owner:${b.id}:${b.operationalOwnerId}`]?.acceptedAt), 'Operational owners accepted'],
    'g4-bau': [(program.benefits || []).every((b) => b.bau), 'Measures in BAU reporting'],
    'g4-lessons': [(ws.lessons || []).some((l) => l.programId === program.id), 'Lessons recorded'],
  };
  const criteria = gate.criteria.map(([id, text]) => ({ id, text, auto: auto[id]?.[0] ?? false, evidence: auto[id]?.[1] || '' }));
  const blockingRules = { G1: ['BR-01'], G2: ['BR-01', 'BR-04', 'STR-04', 'BR-10', 'BR-13', 'BR-11'], G3: ['BR-01'], BR: [], G4: ['BR-01'] }[gateId] || [];
  const blocking = checks.filter((c) => c.severity === 'error' && blockingRules.includes(c.rule));
  return { gate, criteria, blocking, checks };
}

function steadyState(program, ws) {
  const n = ws.settings.thresholds.steadyPeriods;
  return (program.benefits || []).filter(isFinancial).every((b) => {
    const rows = (b.actuals || []).slice(-n);
    return rows.length >= n;
  });
}

// Benefits whose profiles start after a given project end (BEN-12) — used for delay propagation.
export function benefitsDependingOn(program, projectId) {
  return (program.benefits || []).filter((b) => (b.dependsOn || []).includes(projectId)).map((b) => ({ b, start: benefitStart(program, b) }));
}

export const severityRank = { error: 0, warning: 1, info: 2 };
export const sortChecks = (list) => list.slice().sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
