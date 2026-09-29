// Rules-based narrative for the dashboard and report executive summary.
import { dimensionStats, overallStats, inventorySummary, maturityName, costTotals } from './calc.js';
import { aiOverall } from './aiCalc.js';
import { portfolioModel, fmtPayback, yearLabels } from './finance.js';
import { fmtScore, fmtMoney, fmtPct, fmtNum } from './format.js';

const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

export function executiveSummary(e) {
  const o = overallStats(e);
  const dims = dimensionStats(e).filter((d) => d.current !== null);
  const client = e.details.client || 'The organisation';
  if (!dims.length) {
    return { headline: `${client} has not yet been scored. Complete the maturity assessment to generate the summary.`, paragraphs: [], bullets: [] };
  }
  const strong = [...dims].sort((a, b) => b.current - a.current).slice(0, 3);
  const weak = [...dims].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).slice(0, 4);
  const red = dims.filter((d) => d.rag === 'Red');
  const inv = inventorySummary(e);
  const ai = aiOverall(e);
  const pm = portfolioModel(e);
  const tc = costTotals(e.targetCosts);
  const labels = yearLabels(e.settings);
  const sev = e.findings.reduce((m, f) => ({ ...m, [f.severity]: (m[f.severity] || 0) + 1 }), {});

  const poss = /s$/i.test(client) ? `${client}'` : `${client}'s`;
  const headline = `${poss} operating model scores ${fmtScore(o.current)} out of 5 (${maturityName(o.current)}) against a target of ${fmtScore(o.target)}, an average gap of ${fmtScore(o.gap)} (${o.rag}). ${red.length ? `${red.length} of 17 dimensions are rated Red.` : 'No dimension is rated Red.'}`;
  const paragraphs = [
    `The strongest dimensions are ${list(strong.map((d) => `${d.name} (${fmtScore(d.current)})`))}. The largest importance-weighted gaps are in ${list(weak.map((d) => `${d.name} (gap ${fmtScore(d.gap)})`))}, which should anchor the target operating model design.`,
    `${e.findings.length} findings were logged (${sev.Critical || 0} critical, ${sev.High || 0} high, ${sev.Medium || 0} medium, ${sev.Low || 0} low), ${o.openCritHigh} of them critical or high and still open. ${e.recommendations.length} recommendations have been prioritised by value and ease.`,
    `The current state comprises ${fmtNum(inv.org.total)} FTE with an average span of control of ${fmtNum(inv.org.span, 1)} and up to ${inv.org.maxLayers} management layers, ${inv.apps.count} applications (${inv.apps.eol} end of life), ${inv.suppliers.count} suppliers (${inv.suppliers.dependency.High || 0} with high dependency risk) and ${inv.locations.count} sites, at an annual operating cost of ${fmtMoney(inv.costs.total, { compact: true })}.`,
  ];
  if (ai.index !== null) paragraphs.push(`AI readiness is ${ai.index} out of 100 (${ai.level.name}), with ${ai.guardrails.implemented} of ${ai.guardrails.applicable} responsible AI guardrails in place and ${ai.useCases.count} AI use cases identified.`);
  if (tc.total) paragraphs.push(`The target operating model has a steady-state run cost of ${fmtMoney(tc.total, { compact: true })} (${fmtMoney(tc.total - inv.costs.total, { compact: true })}, ${fmtPct(inv.costs.total ? (tc.total - inv.costs.total) / inv.costs.total : null, 1)} against the baseline).`);
  if (pm.totalCost) paragraphs.push(`Across ${e.initiatives.length} initiatives the business case shows ${fmtMoney(pm.totalCost, { compact: true })} of costs and ${fmtMoney(pm.totalBenefit, { compact: true })} of ${e.settings.riskAdjustBenefits ? 'risk-adjusted ' : ''}benefits over ${labels.length} years: NPV ${fmtMoney(pm.npv, { compact: true })} at ${e.settings.discountRate}%, ROI ${fmtPct(pm.roi)}, payback ${fmtPayback(pm.payback)}.`);
  const bullets = weak.map((d) => `${d.name}: current ${fmtScore(d.current)}, target ${fmtScore(d.target)} — ${d.findings} findings, ${d.recs} recommendations.`);
  return { headline, paragraphs, bullets };
}
