// Business case: costs and benefits of initiatives (solution components) by financial year,
// with NPV, ROI, benefit–cost ratio, payback and planned-vs-actual tracking.
import { isNum, num } from './format.js';
import { sum } from './calc.js';

export function yearLabels(s) {
  const n = Math.max(1, Math.min(10, Number(s.years) || 5));
  const start = Number(s.startYear) || new Date().getFullYear();
  // Australian financial years: FY27 runs July 2026 – June 2027.
  return Array.from({ length: n }, (_, i) => `FY${String((start + i + 1) % 100).padStart(2, '0')}`);
}

const arr = (a, n) => Array.from({ length: n }, (_, i) => (isNum(a?.[i]) ? Number(a[i]) : 0));
const add = (a, b) => a.map((x, i) => x + (b[i] || 0));

export function confidenceFactor(line) {
  const c = num(line.confidence);
  return c === null ? 1 : Math.max(0, Math.min(100, c)) / 100;
}

// Which benefit lines count as financial value in the NPV.
export function countsFinancially(line, s) {
  if (line.class === 'Non-financial') return false;
  if (line.class === 'Non-cashable') return !!s.includeNonCashable;
  return true;
}

export function npv(flows, ratePct) {
  const r = (Number(ratePct) || 0) / 100;
  // End-of-year convention: year 1 is discounted by one period.
  return flows.reduce((s, f, i) => s + f / (1 + r) ** (i + 1), 0);
}

export function irr(flows) {
  if (!flows.some((f) => f < 0) || !flows.some((f) => f > 0)) return null;
  let lo = -0.99, hi = 10;
  const f = (r) => flows.reduce((s, x, i) => s + x / (1 + r) ** (i + 1), 0);
  if (f(lo) * f(hi) > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

// Years until cumulative net cash flow turns non-negative (interpolated within the year).
export function payback(flows) {
  if (!flows.some((f) => f !== 0)) return null;
  let cum = 0;
  let wasNegative = false;
  for (let i = 0; i < flows.length; i++) {
    const prev = cum;
    cum += flows[i];
    if (cum < 0) wasNegative = true;
    else if (prev < 0) return i + (flows[i] ? -prev / flows[i] : 0);
  }
  return wasNegative ? null : 0;
}

// Financial model for a set of cost and benefit lines.
export function model(costLines, benefitLines, s) {
  const n = yearLabels(s).length;
  let cost = arr([], n), oneOff = arr([], n), recurring = arr([], n), capex = arr([], n), opex = arr([], n), costActual = arr([], n);
  for (const l of costLines) {
    const p = arr(l.planned, n), a = arr(l.actual, n);
    cost = add(cost, p);
    costActual = add(costActual, a);
    if (l.nature === 'Recurring') recurring = add(recurring, p); else oneOff = add(oneOff, p);
    if (l.category === 'Capex') capex = add(capex, p); else opex = add(opex, p);
  }
  let benefit = arr([], n), benefitGross = arr([], n), benefitActual = arr([], n), cashable = arr([], n), nonCashable = arr([], n);
  for (const l of benefitLines) {
    if (!countsFinancially(l, s)) continue;
    const f = s.riskAdjustBenefits ? confidenceFactor(l) : 1;
    const p = arr(l.planned, n), a = arr(l.actual, n);
    benefitGross = add(benefitGross, p);
    const adj = p.map((x) => x * f);
    benefit = add(benefit, adj);
    benefitActual = add(benefitActual, a);
    if (l.class === 'Non-cashable') nonCashable = add(nonCashable, adj); else cashable = add(cashable, adj);
  }
  const net = benefit.map((b, i) => b - cost[i]);
  let c = 0;
  const cumulative = net.map((x) => (c += x));
  const totalCost = sum(cost), totalBenefit = sum(benefit);
  const pvCost = npv(cost, s.discountRate), pvBenefit = npv(benefit, s.discountRate);
  return {
    n, cost, oneOff, recurring, capex, opex, costActual,
    benefit, benefitGross, benefitActual, cashable, nonCashable,
    net, cumulative,
    totalCost, totalBenefit, totalNet: totalBenefit - totalCost,
    totalCostActual: sum(costActual), totalBenefitActual: sum(benefitActual),
    npv: pvBenefit - pvCost,
    pvCost, pvBenefit,
    roi: totalCost ? (totalBenefit - totalCost) / totalCost : null,
    bcr: pvCost ? pvBenefit / pvCost : null,
    irr: irr(net),
    payback: payback(net),
  };
}

export function initiativeModel(e, id) {
  return model(e.costLines.filter((l) => l.initiativeId === id), e.benefitLines.filter((l) => l.initiativeId === id), e.settings);
}
export const portfolioModel = (e, ids) => {
  const keep = ids ? (l) => ids.includes(l.initiativeId) : (l) => {
    const i = e.initiatives.find((x) => x.id === l.initiativeId);
    return !i || i.status !== 'Cancelled';
  };
  return model(e.costLines.filter(keep), e.benefitLines.filter(keep), e.settings);
};

export function fmtPayback(p, labels) {
  if (p === null || p === undefined) return 'Not within horizon';
  return `${p.toFixed(1)} years${labels ? ` (${labels[Math.min(labels.length - 1, Math.floor(p))]})` : ''}`;
}

// Planned-to-date vs actual-to-date for realisation tracking, up to and including `upto`.
export function toDate(line, upto) {
  let planned = 0, actual = 0;
  for (let i = 0; i <= upto; i++) {
    planned += isNum(line.planned?.[i]) ? Number(line.planned[i]) : 0;
    actual += isNum(line.actual?.[i]) ? Number(line.actual[i]) : 0;
  }
  return { planned, actual, variance: actual - planned, pct: planned ? actual / planned : null };
}

// Index of the current financial year within the horizon (clamped), based on today's date.
export function currentYearIndex(s) {
  const d = new Date();
  const fyStartYear = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  const i = fyStartYear - (Number(s.startYear) || fyStartYear);
  return Math.max(0, Math.min(yearLabels(s).length - 1, i));
}
