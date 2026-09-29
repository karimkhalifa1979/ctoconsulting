// Calculations reproducing the workbook's formulas, plus the aggregates behind the
// dashboard, comparison and report.
import { DIMENSIONS, DIM } from './model.js';
import { isNum, num, daysFromToday } from './format.js';

export const avg = (arr) => {
  const a = arr.filter((x) => x !== null && x !== undefined && !Number.isNaN(x));
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
};
export const sum = (arr) => arr.reduce((s, x) => s + (isNum(x) ? Number(x) : 0), 0);
export const countBy = (rows, key) => rows.reduce((m, r) => {
  const k = typeof key === 'function' ? key(r) : r[key];
  if (k !== '' && k !== null && k !== undefined) m[k] = (m[k] || 0) + 1;
  return m;
}, {});

// RAG from a maturity gap (target − current) using the engagement thresholds.
export function rag(gap, s) {
  if (gap === null || gap === undefined || Number.isNaN(gap)) return '';
  return gap >= s.ragRed ? 'Red' : gap >= s.ragAmber ? 'Amber' : 'Green';
}

export const MATURITY_NAMES = ['Initial', 'Developing', 'Defined', 'Managed', 'Optimised'];
export function maturityName(v) {
  if (!isNum(v)) return '';
  const n = Number(v);
  return MATURITY_NAMES[Math.min(4, Math.max(0, Math.round(n) - 1))];
}

// Assessment tab: gap, weighted gap (shortfalls only) and RAG.
export function questionCalc(q, s) {
  const c = num(q.current), t = num(q.target), imp = num(q.importance);
  const gap = c !== null && t !== null ? t - c : null;
  const wgap = gap !== null && imp !== null ? Math.max(0, gap) * imp : null;
  return { gap, wgap, rag: rag(gap, s) };
}
export const isScored = (q) => (isNum(q.current) && Number(q.current) >= 1) || q.current === 'N/A';

// Dashboard: maturity and findings by dimension.
export function dimensionStats(e) {
  const s = e.settings;
  return DIMENSIONS.map((d) => {
    const qs = e.questions.filter((q) => q.dim === d.code);
    const calcs = qs.map((q) => questionCalc(q, s));
    const current = avg(qs.map((q) => num(q.current)));
    const target = avg(qs.filter((q) => num(q.current) >= 1).map((q) => num(q.target)));
    const gap = avg(calcs.map((c) => c.gap));
    const priority = avg(calcs.map((c) => c.wgap));
    const findings = e.findings.filter((f) => f.dim === d.code);
    const sev = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    for (const f of findings) if (sev[f.severity] !== undefined) sev[f.severity]++;
    const override = num(e.tom?.dimensions?.[d.code]?.targetOverride);
    return {
      code: d.code, name: d.name, short: d.short,
      questions: qs.length,
      scored: qs.filter(isScored).length,
      pct: qs.length ? qs.filter(isScored).length / qs.length : 0,
      current, target, gap, priority, rag: rag(gap, s),
      designTarget: override ?? target,
      sev, findings: findings.length,
      recs: e.recommendations.filter((r) => r.dim === d.code).length,
    };
  });
}

export function overallStats(e) {
  const s = e.settings;
  const qs = e.questions;
  const calcs = qs.map((q) => questionCalc(q, s));
  const current = avg(qs.map((q) => num(q.current)));
  const target = avg(qs.filter((q) => num(q.current) >= 1).map((q) => num(q.target)));
  const gap = avg(calcs.map((c) => c.gap));
  const named = e.stakeholders.filter((x) => x.name);
  const openCritHigh = e.findings.filter((f) => (f.severity === 'Critical' || f.severity === 'High') && f.status !== 'Closed').length;
  return {
    current, target, gap, rag: rag(gap, s),
    priority: avg(calcs.map((c) => c.wgap)),
    scored: qs.filter(isScored).length,
    total: qs.length,
    pctScored: qs.length ? qs.filter(isScored).length / qs.length : 0,
    ragCounts: countBy(calcs, 'rag'),
    interviewsDone: named.filter((x) => x.status === 'Completed').length,
    interviewsTotal: named.length,
    docsReceived: e.documents.filter((d) => d.status === 'Received').length,
    docsPartial: e.documents.filter((d) => d.status === 'Partially received').length,
    docsTotal: e.documents.filter((d) => d.document).length,
    openCritHigh,
    findings: e.findings.length,
    recs: e.recommendations.length,
  };
}

// Recommendations: priority score and category from the prioritisation threshold.
export function recCalc(r, s) {
  const v = num(r.value), ez = num(r.ease);
  if (v === null || ez === null) return { priority: null, category: '' };
  const t = s.priorityThreshold;
  const category = v >= t ? (ez >= t ? 'Quick win' : 'Strategic initiative') : (ez >= t ? 'Fill-in' : 'Deprioritise');
  return { priority: v * ez, category };
}
export const CATEGORIES = ['Quick win', 'Strategic initiative', 'Fill-in', 'Deprioritise'];
export function recProfile(e) {
  const horizons = e.lists.Horizon;
  const m = Object.fromEntries(CATEGORIES.map((c) => [c, Object.fromEntries(horizons.map((h) => [h, 0]))]));
  let unassigned = 0;
  for (const r of e.recommendations) {
    const { category } = recCalc(r, e.settings);
    if (category && m[category] && r.horizon in m[category]) m[category][r.horizon]++;
    else if (r.recommendation) unassigned++;
  }
  return { matrix: m, horizons, unassigned };
}

// Stakeholders: engagement approach from influence and interest.
export function engagementApproach(inf, int) {
  if (!inf || !int) return '';
  if (inf === 'High' && int === 'High') return 'Manage closely';
  if (inf === 'High') return 'Keep satisfied';
  if (int === 'High') return 'Keep informed';
  return 'Monitor';
}

export function daysOutstanding(d) {
  if (!d.requested || d.received) return null;
  const x = daysFromToday(d.requested);
  return x === null ? null : -x;
}

const IMPORTANCE_WEIGHT = { High: 3, Medium: 2, Low: 1 };
export function capabilityCalc(c) {
  const cur = num(c.current), t = num(c.target);
  const gap = cur !== null && t !== null ? t - cur : null;
  const w = IMPORTANCE_WEIGHT[c.importance];
  return { gap, priority: gap !== null && w ? Math.max(0, gap) * w : null };
}

export function processCalc(p) {
  const v = num(p.volume), f = num(p.fte);
  return { ftePer1000: v && f !== null && v > 0 ? (f / v) * 1000 : null };
}

// Org Structure: totals, spans and layers against benchmarks.
export function spanRange(e, nature) {
  const b = (e.spanBenchmarks || []).find((x) => x.nature === nature);
  return b ? { min: Number(b.min), max: Number(b.max), label: `${b.min}–${b.max}` } : null;
}
function orgFigures(u, e, p = '') {
  const g = (k) => num(u[p ? `${p}${k[0].toUpperCase()}${k.slice(1)}` : k]);
  const perm = g('perm'), fixed = g('fixed'), contractor = g('contractor'), outsourced = g('outsourced');
  const parts = [perm, fixed, contractor, outsourced];
  const total = parts.some((x) => x !== null) ? parts.reduce((s, x) => s + (x || 0), 0) : null;
  const managers = g('managers'), layers = g('layers'), cost = g('cost');
  const contractorPct = total ? ((contractor || 0) + (outsourced || 0)) / total : null;
  const span = managers ? ((perm || 0) + (fixed || 0) + (contractor || 0) - 1) / managers : null;
  const range = spanRange(e, u.nature);
  const spanAssessment = span === null || !range ? '' : span < range.min ? 'Below range' : span > range.max ? 'Above range' : 'Within range';
  const layersAssessment = layers === null ? '' : layers > e.settings.maxLayers ? 'Exceeds maximum' : 'Within maximum';
  const emp = (perm || 0) + (fixed || 0);
  return { total, contractorPct, span, range, spanAssessment, layersAssessment, costPerFte: cost !== null && emp > 0 ? cost / emp : null, managers, layers, cost };
}
export const orgCalc = (u, e) => orgFigures(u, e);
export const orgTargetCalc = (u, e) => orgFigures(u, e, 't');
export function orgTotals(e, target = false) {
  const f = (u) => (target ? orgTargetCalc(u, e) : orgCalc(u, e));
  const k = (name) => (target ? `t${name[0].toUpperCase()}${name.slice(1)}` : name);
  const units = e.orgUnits.filter((u) => !(target && u.tAction === 'Disestablish'));
  const s = (name) => sum(units.map((u) => u[k(name)]));
  const perm = s('perm'), fixed = s('fixed'), contractor = s('contractor'), outsourced = s('outsourced');
  const total = perm + fixed + contractor + outsourced;
  const managers = s('managers');
  const calcs = units.map(f);
  return {
    units: units.length,
    perm, fixed, contractor, outsourced, total,
    contractorPct: total ? (contractor + outsourced) / total : null,
    managers,
    span: managers ? (perm + fixed + contractor - 1) / managers : null,
    maxLayers: Math.max(0, ...units.map((u) => num(u[k('layers')]) || 0)),
    cost: s('cost'),
    costPerFte: perm + fixed ? s('cost') / (perm + fixed) : null,
    vacancies: target ? 0 : s('vacancies'),
    spanIssues: calcs.filter((c) => c.spanAssessment && c.spanAssessment !== 'Within range').length,
    layerIssues: calcs.filter((c) => c.layersAssessment === 'Exceeds maximum').length,
  };
}

// Decision Rights: exactly one Decide role per decision.
export function decisionCheck(roles) {
  const codes = Object.values(roles || {}).filter(Boolean);
  if (!codes.length) return { deciders: null, check: '' };
  const deciders = codes.filter((c) => c === 'D').length;
  return { deciders, check: deciders === 1 ? 'OK' : deciders === 0 ? 'No decider' : 'Multiple deciders' };
}

// Applications: TIME classification and support expiry.
export function timeClass(bf, tf, threshold) {
  const b = num(bf), t = num(tf);
  if (b === null || t === null) return '';
  return b >= threshold ? (t >= threshold ? 'Invest' : 'Migrate') : (t >= threshold ? 'Tolerate' : 'Eliminate');
}
export function appCalc(a, s) {
  const days = daysFromToday(a.supportEnd);
  return {
    time: timeClass(a.businessFit, a.technicalFit, s.timeFitThreshold),
    days,
    expiry: days === null ? '' : days < 0 ? 'Expired' : days <= s.expiryWarningDays ? 'Expiring' : '',
  };
}

// Suppliers: share of spend, renewal flag and dependency risk.
export function dependencyRisk(sup) {
  const { material: l, singleSource: m, exitPlan: n } = sup;
  if (!l && !m && !n) return '';
  if (m === 'Yes' && n !== 'Yes') return 'High';
  if (m === 'Yes' || (l === 'Yes' && n !== 'Yes')) return 'Medium';
  return 'Low';
}
export function supplierCalc(sup, totalSpend, s) {
  const days = daysFromToday(sup.end);
  return {
    pct: isNum(sup.spend) && totalSpend > 0 ? Number(sup.spend) / totalSpend : null,
    days,
    renewal: days === null ? '' : days < 0 ? 'Expired' : days <= s.expiryWarningDays ? 'Decision due' : '',
    dependency: dependencyRisk(sup),
  };
}

export function locationCalc(l, s) {
  const days = daysFromToday(l.leaseExpiry);
  const cost = num(l.cost), fte = num(l.fte), cap = num(l.capacity);
  return {
    days,
    expiry: days === null ? '' : days < 0 ? 'Expired' : days <= s.expiryWarningDays ? 'Expiring' : '',
    costPerFte: cost !== null && fte ? cost / fte : null,
    costPerWs: cost !== null && cap ? cost / cap : null,
  };
}

// Cost Baseline.
export const COST_TYPES = [
  { key: 'employee', label: 'Employee' },
  { key: 'contractor', label: 'Contractor' },
  { key: 'technology', label: 'Technology' },
  { key: 'property', label: 'Property' },
  { key: 'outsourced', label: 'Outsourced / third-party' },
  { key: 'other', label: 'Other operating' },
];
export function costRowTotal(c) {
  const vals = COST_TYPES.map((t) => c[t.key]);
  return vals.some(isNum) ? sum(vals) : null;
}
export function costTotals(rows) {
  const byType = Object.fromEntries(COST_TYPES.map((t) => [t.key, sum(rows.map((r) => r[t.key]))]));
  const total = sum(Object.values(byType));
  const fte = sum(rows.map((r) => r.fte));
  const change = sum(rows.map((r) => r.change));
  return { byType, total, fte, change, perFte: fte ? total / fte : null, changePct: total ? change / total : null };
}

// Inventory summaries used on the dashboard, comparison and report.
export function inventorySummary(e) {
  const s = e.settings;
  const apps = e.applications.map((a) => ({ ...a, ...appCalc(a, s) }));
  const supTotal = sum(e.suppliers.map((x) => x.spend));
  const sups = e.suppliers.map((x) => ({ ...x, ...supplierCalc(x, supTotal, s) }));
  const locs = e.locations.map((l) => ({ ...l, ...locationCalc(l, s) }));
  const cap = sum(e.locations.map((l) => l.capacity));
  const occupied = sum(e.locations.map((l) => (isNum(l.capacity) && isNum(l.utilisation) ? l.capacity * l.utilisation : 0)));
  const caps = e.capabilities.map((c) => ({ ...c, ...capabilityCalc(c) }));
  const decs = e.decisions.map((d) => ({ ...d, ...decisionCheck(d.current) }));
  const procs = e.processes.filter((p) => p.l1 || p.l2);
  return {
    apps: {
      count: apps.filter((a) => a.name).length,
      cost: sum(apps.map((a) => a.cost)),
      time: countBy(apps, 'time'),
      support: countBy(apps, 'supportStatus'),
      criticality: countBy(apps, 'criticality'),
      hosting: countBy(apps, 'hosting'),
      expiring: apps.filter((a) => a.expiry).length,
      eol: apps.filter((a) => a.supportStatus === 'End of life').length,
      disposition: countBy(apps, 'disposition'),
      list: apps,
    },
    suppliers: {
      count: sups.filter((x) => x.name).length,
      spend: supTotal,
      dependency: countBy(sups, 'dependency'),
      segment: countBy(sups, 'segment'),
      renewals: sups.filter((x) => x.renewal).length,
      material: sups.filter((x) => x.material === 'Yes').length,
      noExit: sups.filter((x) => x.material === 'Yes' && x.exitPlan !== 'Yes').length,
      list: sups,
    },
    locations: {
      count: locs.filter((l) => l.name).length,
      cost: sum(locs.map((l) => l.cost)),
      fte: sum(locs.map((l) => l.fte)),
      capacity: cap,
      utilisation: cap ? occupied / cap : null,
      expiring: locs.filter((l) => l.expiry).length,
      critical: locs.filter((l) => l.critical === 'Yes').length,
      list: locs,
    },
    org: orgTotals(e),
    costs: costTotals(e.costs),
    capabilities: {
      assessed: caps.filter((c) => isNum(c.current)).length,
      total: caps.filter((c) => c.l2 || c.l1).length,
      top: caps.filter((c) => c.priority).sort((a, b) => b.priority - a.priority).slice(0, 10),
      list: caps,
    },
    decisions: {
      total: decs.filter((d) => d.decision).length,
      mapped: decs.filter((d) => d.check).length,
      issues: decs.filter((d) => d.check && d.check !== 'OK').length,
      avgDays: avg(decs.map((d) => num(d.days))),
      list: decs,
    },
    processes: {
      total: procs.length,
      documented: procs.filter((p) => p.documented === 'Yes').length,
      assessed: procs.filter((p) => p.documented || p.maturity).length,
      automation: countBy(procs, 'automation'),
      avgMaturity: avg(procs.map((p) => num(p.maturity))),
    },
  };
}

// Risk rating on a 5 × 5 likelihood × impact matrix.
export function riskScore(l, i) {
  const a = num(l), b = num(i);
  return a !== null && b !== null ? a * b : null;
}
export function riskRating(score) {
  if (score === null || score === undefined) return '';
  return score >= 20 ? 'Extreme' : score >= 12 ? 'High' : score >= 5 ? 'Medium' : 'Low';
}

export const dimName = (code) => DIM[code]?.name || code || '';
export const dimShort = (code) => DIM[code]?.short || code || '';
