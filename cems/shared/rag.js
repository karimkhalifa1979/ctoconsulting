// Suggested RAG derivation (BR-03), override checks (BR-06, STS-004) and engagement health (BR-16).
import { businessDayDiff } from './dates.js';
import { fmtDate, fmtPct, fmtMoney } from './format.js';
import { RAG_RULES } from './defaults.js';

export const RAGS = ['Green', 'Amber', 'Red'];
export const RAG_RANK = { Green: 0, Amber: 1, Red: 2 };
export const DIMENSIONS = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'budget', label: 'Budget' },
  { key: 'scope', label: 'Scope' },
  { key: 'risk', label: 'Risks and issues' },
  { key: 'resource', label: 'Resources' },
  { key: 'quality', label: 'Quality' },
];

export const worstRag = (...rags) => rags.filter(Boolean).reduce((w, r) => (RAG_RANK[r] > RAG_RANK[w] ? r : w), 'Green');
export const isBetter = (chosen, calculated) => chosen && calculated && RAG_RANK[chosen] < RAG_RANK[calculated];

export function trendOf(previous, current) {
  if (!previous || !current) return 'New';
  if (RAG_RANK[current] < RAG_RANK[previous]) return 'Up';
  if (RAG_RANK[current] > RAG_RANK[previous]) return 'Down';
  return 'Steady';
}
export const TREND_LABEL = { Up: '▲ Improved', Down: '▼ Worse', Steady: '► Steady', New: '● New' };

function rate(red, amber, greenReason) {
  if (red.length) return { rag: 'Red', reasons: red };
  if (amber.length) return { rag: 'Amber', reasons: amber };
  return { rag: 'Green', reasons: [greenReason] };
}

// m: metrics assembled from project data (see server/lib/status.mjs).
export function deriveRag(m, rules = RAG_RULES) {
  const today = m.today;
  const tol = m.timeToleranceDays ?? 10;

  // Schedule
  const sRed = [], sAmber = [];
  for (const ms of m.keyMilestones || []) {
    if (ms.actual_date) continue;
    const due = ms.forecast_date || ms.baseline_date || ms.planned_date;
    if (due && due < today) { sRed.push(`Key milestone "${ms.name}" missed (due ${fmtDate(due)})`); continue; }
    if (ms.baseline_date && ms.forecast_date && ms.forecast_date > ms.baseline_date) {
      const slip = businessDayDiff(ms.baseline_date, ms.forecast_date, m.holidays);
      if (slip > tol) sRed.push(`"${ms.name}" forecast ${slip} business days after baseline (tolerance ${tol})`);
      else if (slip > 0) sAmber.push(`"${ms.name}" forecast ${slip} business days after baseline, within tolerance`);
    }
  }
  if (m.evmApplies && Number.isFinite(m.spi)) {
    if (m.spi < rules.spiRed) sRed.push(`SPI ${m.spi.toFixed(2)} is below ${rules.spiRed}`);
    else if (m.spi < rules.spiGreen) sAmber.push(`SPI ${m.spi.toFixed(2)} is between ${rules.spiRed} and ${rules.spiGreen}`);
  }
  if (m.overdueTasks > 0) sAmber.push(`${m.overdueTasks} overdue task${m.overdueTasks > 1 ? 's' : ''}`);
  const schedule = rate(sRed, sAmber, 'No key milestone forecast later than baseline');

  // Budget
  const bRed = [], bAmber = [];
  const costTol = m.costTolerancePct ?? 0.05;
  if (Number.isFinite(m.bac) && m.bac > 0 && Number.isFinite(m.eac)) {
    const over = m.eac / m.bac - 1;
    if (over > costTol) bRed.push(`EAC ${fmtMoney(m.eac)} is ${fmtPct(over, 1)} above BAC (tolerance ${fmtPct(costTol)})`);
    else if (over > 0) bAmber.push(`EAC ${fmtMoney(m.eac)} is ${fmtPct(over, 1)} above BAC, within tolerance`);
  }
  const target = m.marginTarget ?? rules.marginTarget;
  const floor = m.marginFloor ?? rules.marginFloor;
  if (Number.isFinite(m.forecastMargin)) {
    if (m.forecastMargin < floor) bRed.push(`Forecast margin ${fmtPct(m.forecastMargin, 1)} is below the floor (${fmtPct(floor)})`);
    else if (m.forecastMargin < target) bAmber.push(`Forecast margin ${fmtPct(m.forecastMargin, 1)} is below target (${fmtPct(target)})`);
  }
  if (m.poExhaustsBeforeEnd) bRed.push(`PO forecast to run out on ${fmtDate(m.poExhaustionDate)}, before the planned end`);
  const budget = rate(bRed, bAmber, 'EAC within BAC and margin on target');

  // Scope
  const scRed = [], scAmber = [];
  if (m.disputedScope > 0) scRed.push(`${m.disputedScope} disputed or unapproved scope change${m.disputedScope > 1 ? 's' : ''} affecting deliverables`);
  if (m.pendingScopeChanges > 0) scAmber.push(`${m.pendingScopeChanges} pending change request${m.pendingScopeChanges > 1 ? 's' : ''}`);
  if (m.unresolvedScopeQuestions > 0) scAmber.push(`${m.unresolvedScopeQuestions} unresolved scope question${m.unresolvedScopeQuestions > 1 ? 's' : ''}`);
  const scope = rate(scRed, scAmber, 'No pending or disputed scope changes');

  // Risks and issues
  const rRed = [], rAmber = [];
  const risks = m.openRisks || [];
  const issues = m.openIssues || [];
  const extreme = risks.filter((r) => r.level === 'Extreme');
  const high = risks.filter((r) => r.level === 'High');
  if (extreme.length) rRed.push(`${extreme.length} open Extreme risk${extreme.length > 1 ? 's' : ''}`);
  const highSev = (i) => ['High', 'Critical'].includes(i.severity);
  const late = (i) => i.target_date && i.target_date < today;
  const highLate = issues.filter((i) => highSev(i) && late(i));
  if (highLate.length) rRed.push(`${highLate.length} high-severity issue${highLate.length > 1 ? 's' : ''} past target date`);
  if (high.length) rAmber.push(`${high.length} High risk${high.length > 1 ? 's' : ''}${high.every((r) => r.response_actions) ? ' with responses under way' : ' (response not yet recorded)'}`);
  const highOpen = issues.filter((i) => highSev(i) && !late(i));
  if (highOpen.length) rAmber.push(`${highOpen.length} open high-severity issue${highOpen.length > 1 ? 's' : ''}`);
  const medLate = issues.filter((i) => i.severity === 'Medium' && late(i));
  if (medLate.length) rAmber.push(`${medLate.length} medium issue${medLate.length > 1 ? 's' : ''} past target date`);
  const risk = rate(rRed, rAmber, 'No open Extreme risks or high-severity issues');

  // Resources
  const reRed = [], reAmber = [];
  if (m.unfilledCritical > 0) reRed.push(`${m.unfilledCritical} unfilled critical role${m.unfilledCritical > 1 ? 's' : ''}`);
  if (m.keyPersonLoss) reRed.push('Loss of a key person affecting delivery');
  if (m.resourceGaps > 0) reAmber.push(`${m.resourceGaps} resourcing gap${m.resourceGaps > 1 ? 's' : ''} in the next ${rules.resourceLookaheadWeeks} weeks`);
  const resource = rate(reRed, reAmber, 'Confirmed allocations meet the plan');

  // Quality
  const qRed = [], qAmber = [];
  if (m.rejectedDeliverables > 0) qRed.push(`${m.rejectedDeliverables} deliverable${m.rejectedDeliverables > 1 ? 's' : ''} rejected`);
  if (m.qualityToleranceBreached) qRed.push('Quality tolerance breached');
  if (m.reworkDeliverables > 0) qAmber.push(`${m.reworkDeliverables} deliverable${m.reworkDeliverables > 1 ? 's' : ''} required rework`);
  if (m.failedReviews > 0) qAmber.push(`${m.failedReviews} quality review${m.failedReviews > 1 ? 's' : ''} failed`);
  if (m.overdueReviews > 0) qAmber.push(`${m.overdueReviews} quality review${m.overdueReviews > 1 ? 's' : ''} overdue`);
  const quality = rate(qRed, qAmber, 'Deliverables accepted first time; reviews on schedule');

  const dims = { schedule, budget, scope, risk, resource, quality };
  const overallRag = worstRag(...Object.values(dims).map((d) => d.rag));
  const overall = {
    rag: overallRag,
    reasons: overallRag === 'Green' ? ['All dimensions Green'] : DIMENSIONS.filter((d) => dims[d.key].rag === overallRag).map((d) => `${d.label} is ${overallRag}`),
  };
  return { ...dims, overall };
}

// BR-16: worst overall RAG of active projects, or budget-weighted when configured.
export function engagementHealth(projects, rule = 'worst') {
  const rated = projects.filter((p) => p.rag);
  if (!rated.length) return null;
  if (rule === 'budget_weighted') {
    const total = rated.reduce((a, p) => a + (p.bac || 0), 0);
    if (total > 0) {
      const score = rated.reduce((a, p) => a + (p.bac || 0) * RAG_RANK[p.rag], 0) / total;
      return score < 0.5 ? 'Green' : score < 1.5 ? 'Amber' : 'Red';
    }
  }
  return worstRag(...rated.map((p) => p.rag));
}

export const RAG_DEFINITIONS = [
  { dimension: 'Schedule', green: 'No key milestone forecast later than baseline; SPI at least 0.95 where earned value applies', amber: 'Slippage within time tolerance, or SPI from 0.85 to below 0.95', red: 'Slippage beyond tolerance, a missed key milestone, or SPI below 0.85' },
  { dimension: 'Budget', green: 'EAC at or below BAC, and forecast margin at or above target', amber: 'EAC above BAC within cost tolerance, or margin below target but above the floor', red: 'EAC above BAC beyond tolerance, margin below the floor, or PO forecast to run out before planned end' },
  { dimension: 'Scope', green: 'No pending or disputed scope changes', amber: 'Pending change requests or unresolved scope questions', red: 'Disputed or unapproved scope change affecting deliverables' },
  { dimension: 'Risks and issues', green: 'No open Extreme risks and no high-severity issues', amber: 'High risks with responses under way, or medium issues past target date', red: 'Extreme risks, or high-severity issues past target date' },
  { dimension: 'Resources', green: 'Confirmed allocations meet the plan', amber: 'Gaps in the next four weeks, with mitigation in place', red: 'Unfilled critical role, or loss of a key person affecting delivery' },
  { dimension: 'Quality', green: 'Deliverables accepted first time; reviews on schedule', amber: 'Rework required, or reviews overdue', red: 'Deliverable rejected, or quality tolerance breached' },
  { dimension: 'Overall', green: 'All dimensions Green', amber: 'Worst dimension is Amber', red: 'Any dimension is Red' },
];
