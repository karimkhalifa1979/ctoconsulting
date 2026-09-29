// Current versus target operating model: one model shared by the Compare page and the PDF report.
import { dimensionStats, overallStats, orgTotals, costTotals, COST_TYPES, costRowTotal, inventorySummary, riskScore, sum, avg, countBy } from './calc.js';
import { aiOverall } from './aiCalc.js';
import { portfolioModel, yearLabels } from './finance.js';
import { CHANGE_AREAS, ADKAR } from '../data/tomLibrary.js';
import { isNum, num } from './format.js';

export function compareModel(e) {
  const dims = dimensionStats(e);
  const o = overallStats(e);
  const inv = inventorySummary(e);
  const orgC = orgTotals(e), orgT = orgTotals(e, true);
  const costC = costTotals(e.costs), costT = costTotals(e.targetCosts);
  const ai = aiOverall(e);
  const pm = portfolioModel(e);
  const labels = yearLabels(e.settings);

  const appsT = e.applications.filter((a) => a.name && !['Retire', 'Consolidate'].includes(a.disposition));
  const appCostT = sum(appsT.map((a) => (isNum(a.targetCost) ? a.targetCost : a.cost)));
  const supT = e.suppliers.filter((x) => x.name && !['Exit', 'Insource'].includes(x.targetAction));
  const supSpendT = sum(supT.map((x) => (isNum(x.targetSpend) ? x.targetSpend : x.spend)));
  const locT = e.locations.filter((l) => l.name && l.targetAction !== 'Exit');
  const locCostT = sum(locT.map((l) => (isNum(l.targetCost) ? l.targetCost : l.cost)));
  const targetMaturity = avg(dims.map((d) => d.designTarget));

  const risks = e.risks.map((r) => ({ ...r, score: riskScore(r.likelihood, r.impact), rscore: riskScore(r.residualLikelihood, r.residualImpact) }));
  const sevCount = countBy(e.findings.filter((f) => f.status !== 'Closed'), 'severity');
  const units = [...new Set([...e.costs.map((c) => c.unit), ...e.targetCosts.map((c) => c.unit)])].filter(Boolean);

  const changeGroups = e.changeImpacts.map((g) => {
    const impact = sum(CHANGE_AREAS.map((a) => g[a.id]));
    const adkar = avg(ADKAR.map((a) => num(g[a.id])));
    const barrier = ADKAR.find((a) => num(g[a.id]) !== null && num(g[a.id]) <= 3) || null;
    return { ...g, impact, adkar, barrier };
  });

  const metrics = [
    { key: 'maturity', label: 'Operating model maturity (1–5)', cur: o.current, tgt: targetMaturity, better: 'higher', type: 'score' },
    { key: 'cost', label: 'Annual operating cost', cur: costC.total || null, tgt: costT.total || null, better: 'lower', type: 'money' },
    { key: 'fte', label: 'Total FTE', cur: orgC.total || null, tgt: orgT.total || null, better: 'lower', type: 'num' },
    { key: 'managers', label: 'People managers', cur: orgC.managers || null, tgt: orgT.managers || null, better: 'lower', type: 'num' },
    { key: 'span', label: 'Average span of control', cur: orgC.span, tgt: orgT.span, better: 'higher', type: 'dec' },
    { key: 'layers', label: 'Deepest management layers', cur: orgC.maxLayers || null, tgt: orgT.maxLayers || null, better: 'lower', type: 'num' },
    { key: 'apps', label: 'Applications', cur: inv.apps.count || null, tgt: inv.apps.count ? appsT.length : null, better: 'lower', type: 'num' },
    { key: 'appCost', label: 'Application run cost', cur: inv.apps.cost || null, tgt: inv.apps.count ? appCostT : null, better: 'lower', type: 'money' },
    { key: 'suppliers', label: 'Suppliers', cur: inv.suppliers.count || null, tgt: inv.suppliers.count ? supT.length : null, better: 'lower', type: 'num' },
    { key: 'supSpend', label: 'Supplier spend', cur: inv.suppliers.spend || null, tgt: inv.suppliers.count ? supSpendT : null, better: 'lower', type: 'money' },
    { key: 'sites', label: 'Sites', cur: inv.locations.count || null, tgt: inv.locations.count ? locT.length : null, better: 'lower', type: 'num' },
    { key: 'property', label: 'Property cost', cur: inv.locations.cost || null, tgt: inv.locations.count ? locCostT : null, better: 'lower', type: 'money' },
    { key: 'ai', label: 'AI readiness index', cur: ai.index, tgt: ai.targetIndex, better: 'higher', type: 'num' },
    { key: 'risk', label: 'High & extreme risks (inherent → residual)', cur: risks.length ? risks.filter((r) => r.score >= 12).length : null, tgt: risks.length ? risks.filter((r) => r.rscore >= 12).length : null, better: 'lower', type: 'num' },
  ];

  return {
    dims, o, inv, orgC, orgT, costC, costT, ai, pm, labels, metrics, targetMaturity,
    costByType: COST_TYPES.map((t) => ({ ...t, cur: costC.byType[t.key], tgt: costT.byType[t.key] })),
    costByUnit: units.map((u) => ({ unit: u, cur: sum(e.costs.filter((c) => c.unit === u).map(costRowTotal)), tgt: sum(e.targetCosts.filter((c) => c.unit === u).map(costRowTotal)) })),
    risks, sevCount, changeGroups,
    requirements: e.requirements,
    reqByCategory: countBy(e.requirements, 'category'),
    reqByHorizon: countBy(e.requirements, 'horizon'),
    investment: sum(pm.oneOff),
  };
}

export function optionScore(opt, criteria) {
  const tw = sum(criteria.map((c) => c.weight)) || 1;
  if (!criteria.some((c) => num(opt.scores?.[c.id]) !== null)) return null;
  return sum(criteria.map((c) => (num(opt.scores?.[c.id]) || 0) * (Number(c.weight) || 0))) / tw;
}
