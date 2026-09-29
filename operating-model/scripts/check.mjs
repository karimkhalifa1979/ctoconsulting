// Sanity checks for the workbook formulas and business case calculations.
// Usage: npm run check   (runs the source through Vite's SSR loader)
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const load = (p) => server.ssrLoadModule(p);
const { blankEngagement } = await load('/src/lib/model.js');
const calc = await load('/src/lib/calc.js');
const fin = await load('/src/lib/finance.js');
const { createDemo } = await load('/src/data/demo.js');
const { compareModel } = await load('/src/lib/compare.js');
const { aiOverall } = await load('/src/lib/aiCalc.js');
const { executiveSummary } = await load('/src/lib/narrative.js');

let failed = 0;
const eq = (name, a, b) => {
  const ok = typeof b === 'number' ? Math.abs(a - b) < 1e-6 : a === b;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — expected ${b}, got ${a}`}`);
};
const s = blankEngagement().settings;

// Assessment: gap, weighted gap, RAG (defaults Red ≥ 1.5, Amber ≥ 0.75)
eq('gap', calc.questionCalc({ current: 2, target: 4, importance: 3 }, s).gap, 2);
eq('weighted gap', calc.questionCalc({ current: 2, target: 4, importance: 3 }, s).wgap, 6);
eq('weighted gap ignores overshoot', calc.questionCalc({ current: 5, target: 3, importance: 3 }, s).wgap, 0);
eq('RAG red', calc.rag(1.5, s), 'Red');
eq('RAG amber', calc.rag(0.75, s), 'Amber');
eq('RAG green', calc.rag(0.5, s), 'Green');
eq('N/A has no gap', calc.questionCalc({ current: 'N/A', target: 3, importance: 2 }, s).gap, null);
// Recommendations
eq('quick win', calc.recCalc({ value: 4, ease: 4 }, s).category, 'Quick win');
eq('strategic initiative', calc.recCalc({ value: 4, ease: 2 }, s).category, 'Strategic initiative');
eq('fill-in', calc.recCalc({ value: 2, ease: 4 }, s).category, 'Fill-in');
eq('deprioritise', calc.recCalc({ value: 2, ease: 2 }, s).category, 'Deprioritise');
// Stakeholders
eq('manage closely', calc.engagementApproach('High', 'High'), 'Manage closely');
eq('keep satisfied', calc.engagementApproach('High', 'Low'), 'Keep satisfied');
eq('keep informed', calc.engagementApproach('Low', 'High'), 'Keep informed');
// Org structure: the workbook's example row (span 14.43, within 11–15, cost per FTE 110,567)
const e = blankEngagement();
const u = { nature: 'Standardised / operational', perm: 182, fixed: 12, contractor: 9, outsourced: 25, managers: 14, layers: 5, cost: 21450000 };
const oc = calc.orgCalc(u, e);
eq('total FTE', oc.total, 228);
eq('span', oc.span, 202 / 14);
eq('span assessment', oc.spanAssessment, 'Within range');
eq('layers assessment', oc.layersAssessment, 'Within maximum');
eq('cost per FTE', oc.costPerFte, 21450000 / 194);
// TIME, RAPID, supplier dependency
eq('TIME migrate', calc.timeClass(4, 2, 3), 'Migrate');
eq('TIME tolerate', calc.timeClass(2, 4, 3), 'Tolerate');
eq('TIME invest', calc.timeClass(3, 3, 3), 'Invest');
eq('RAPID ok', calc.decisionCheck({ CEO: 'D', CFO: 'R' }).check, 'OK');
eq('RAPID none', calc.decisionCheck({ CEO: 'A' }).check, 'No decider');
eq('RAPID multiple', calc.decisionCheck({ CEO: 'D', CFO: 'D' }).check, 'Multiple deciders');
eq('dependency high', calc.dependencyRisk({ material: 'Yes', singleSource: 'Yes', exitPlan: 'Partial' }), 'High');
eq('dependency medium', calc.dependencyRisk({ material: 'Yes', singleSource: 'No', exitPlan: 'No' }), 'Medium');
eq('dependency low', calc.dependencyRisk({ material: 'No', singleSource: 'No', exitPlan: 'Yes' }), 'Low');
// Finance
eq('NPV', fin.npv([110, 121], 10), 200);
eq('payback interpolated', fin.payback([-100, 50, 100]), 2.5);
eq('payback never', fin.payback([-100, 10, 10]), null);
eq('IRR', Math.round(fin.irr([-100, 110]) * 1000) / 1000, 0.1);
const m = fin.model([{ nature: 'One-off', category: 'Capex', planned: [100, 0] }], [{ class: 'Cashable', confidence: 50, planned: [0, 300] }], { ...s, years: 2, riskAdjustBenefits: true, discountRate: 0 });
eq('risk-adjusted benefit', m.totalBenefit, 150);
eq('ROI', m.roi, 0.5);
// Demo engagement end to end
const d = createDemo();
const o = calc.overallStats(d);
eq('demo fully scored', o.scored, o.total);
const c = compareModel(d);
eq('comparison metrics', c.metrics.length, 14);
eq('AI index present', typeof aiOverall(d).index, 'number');
eq('summary headline', executiveSummary(d).headline.startsWith("Tallowood Water Services'"), true);

await server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
