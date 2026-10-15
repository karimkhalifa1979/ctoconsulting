// Calculation checks against reference cases (NFR-27) plus sanity checks on the demo workspace.
// Run: npm run check
import assert from 'node:assert/strict';
import { npvOf, irr, paybackMonth, financials, shapeAt, sensitivity, pathScope, realisation } from '../src/lib/finance.js';
import { riskScore, alignmentScore, changeLoad, programHealth, calibration } from '../src/lib/scoring.js';
import { modelChecks, wording, layout, backtrace, diffChains, snapshot, NODE_W, NODE_H } from '../src/lib/chain.js';
import { qualityChecks, gateReadiness } from '../src/lib/rules.js';
import { simulate, makeInverse, mulberry32, phi, invNorm, summarise } from '../src/lib/simulation.js';
import { demoWorkspace } from '../src/lib/seed.js';
import { RISK_INSTRUMENT } from '../src/lib/config.js';

let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);

console.log('Financial worth (7.2.3)');
t('NPV of 12 monthly payments of 100 at 0% is 1200', () => near(npvOf(new Float64Array(12).fill(100), 0), 1200, 1e-9));
t('NPV discounts at (1+r)^(t/12), end of period', () => near(npvOf(Float64Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 110]), 0.1), 100, 1e-9));
t('IRR of −100, +110 is 10%', () => near(irr([-100, 110]), 0.1, 1e-6));
t('IRR of −1000, 300×5 is ≈15.24%', () => near(irr([-1000, 300, 300, 300, 300, 300]), 0.15238, 1e-4));
t('IRR is n/a without a sign change', () => assert.equal(irr([100, 200]), null));
t('Payback is the first month cumulative ≥ 0 after being negative', () => assert.equal(paybackMonth([-10, -5, 0, 5]), 3));
t('Payback is null when never recovered', () => assert.equal(paybackMonth([-10, -11]), null));

console.log('Benefit profiles (BEN-03)');
const prof = { dipPct: 0.1, dipMonths: 2, plateaus: [{ after: 0, pct: 0.5 }, { after: 6, pct: 1 }], lifetimeYears: 1 };
t('Learning-lag dip is negative', () => near(shapeAt(prof, 0), -0.1, 1e-12));
t('First plateau after the dip', () => near(shapeAt(prof, 2), 0.5, 1e-12));
t('Second plateau', () => near(shapeAt(prof, 8), 1, 1e-12));
t('Zero after lifetime', () => near(shapeAt(prof, 12), 0, 1e-12));
t('Linear ramp interpolates', () => near(shapeAt({ ramp: 'linear', plateaus: [{ after: 0, pct: 0 }, { after: 10, pct: 1 }] }, 5), 0.5, 1e-12));

console.log('Risk and alignment scores (7.2.1, 7.2.2)');
const ws0 = { settings: { areWeights: { right: 1, way: 1, well: 1, benefits: 1 }, thresholds: { unansweredMax: 0.2 }, typeWeights: { current: 0.5, parent: 0.2, future: 0.3 } }, instrument: RISK_INSTRUMENT };
const all = (v) => Object.fromEntries(RISK_INSTRUMENT.map((q) => [q.id, v]));
t('All 1s → risk 0', () => near(riskScore({}, ws0, all(1)).overall, 0, 1e-9));
t('All 5s → risk 100', () => near(riskScore({}, ws0, all(5)).overall, 100, 1e-9));
t('All 3s → risk 50', () => near(riskScore({}, ws0, all(3)).overall, 50, 1e-9));
t('Weighted "are" score R(a) = 100·Σw(s−1)/Σw(4)', () => {
  const ans = { r1: 5, r2: 1 }; // weights 3 and 2 → 100 × (3×4 + 0) / (5×4) = 60
  near(riskScore({}, ws0, ans).byAre.right.score, 60, 1e-9);
});
t('Unanswered > 20% → incomplete', () => assert.equal(riskScore({}, ws0, { r1: 3 }).incomplete, true));
const wsA = { ...ws0, drivers: [{ id: 'a', type: 'current', weight: 1 }, { id: 'b', type: 'future', weight: 1 }], settings: { ...ws0.settings, typeWeights: { current: 0.5, parent: 0.2, future: 0.3 } } };
t('Alignment = 100 × Σ T(t) Σ W(d) c / 4 (missing type re-weighted)', () => near(alignmentScore({}, wsA, { a: 4, b: 0 }).score, 62.5, 1e-9));

console.log('Distributions and random numbers');
t('Seeded RNG is deterministic', () => { const a = mulberry32(5); const b = mulberry32(5); assert.equal(a(), b()); });
t('Φ(0)=0.5 and Φ(1.96)≈0.975', () => { near(phi(0), 0.5, 1e-7); near(phi(1.96), 0.975, 1e-3); });
t('Inverse normal round-trips', () => near(phi(invNorm(0.8)), 0.8, 1e-4));
t('Triangular inverse CDF median', () => near(makeInverse('triangular', 0, 0.5, 1)(0.5), 0.5, 1e-9));
t('PERT inverse spans min..max and is centred on a symmetric mode', () => { const f = makeInverse('pert', 0, 5, 10); near(f(0.5), 5, 0.05); assert.ok(f(0.001) >= 0 && f(0.999) <= 10); });
t('PERT mean ≈ (min + 4·mode + max)/6', () => {
  const f = makeInverse('pert', 0, 2, 10); const rng = mulberry32(3); let s = 0; const n = 20000;
  for (let i = 0; i < n; i++) s += f(rng());
  near(s / n, (0 + 8 + 10) / 6, 0.05);
});

console.log('Demo workspace');
const ws = demoWorkspace();
const cis = ws.programs.find((p) => p.id === 'prg-cis');
const fin = financials(cis, ws);
t('CIS path A selected and path B benefits excluded', () => { const s = pathScope(cis); assert.equal(s.path.id, 'cis-pathA'); assert.ok(s.outBenefits.has('cis-b2')); assert.ok(s.outCosts.has('cis-c8')); });
t('CIS financials are finite', () => assert.ok(Number.isFinite(fin.npv) && fin.pvCosts > 0));
const finB = financials(cis, ws, { pathId: 'cis-pathB' });
console.log(`    CIS path A: NPV ${Math.round(fin.npv / 1000)}k, BCR ${fin.bcr?.toFixed(2)}, IRR ${(fin.irr * 100).toFixed(1)}%, payback ${fin.paybackMonths} months`);
console.log(`    CIS path B: NPV ${Math.round(finB.npv / 1000)}k, BCR ${finB.bcr?.toFixed(2)}`);
for (const p of ws.programs) {
  const f = financials(p, ws);
  const r = riskScore(p, ws).overall; const a = alignmentScore(p, ws).score; const h = programHealth(p, ws).score;
  console.log(`    ${p.code} ${p.name.padEnd(48)} NPV ${String(Math.round(f.npv / 1000)).padStart(6)}k  cost ${String(Math.round(f.totalCosts / 1000)).padStart(6)}k  risk ${r?.toFixed(0)}  align ${a?.toFixed(0)}  health ${h?.toFixed(0) ?? '—'}  checks ${qualityChecks(p, ws).filter((c) => c.severity === 'error').length}E/${qualityChecks(p, ws).filter((c) => c.severity === 'warning').length}W`);
}
t('Sensitivity runs', () => { const s = sensitivity(cis, ws); assert.ok(s.rows.length >= 10); assert.ok(s.rows[0].npv < s.base.npv); });
t('Modelling checks find no error for initiatives in CIS', () => assert.ok(!modelChecks(cis, ws).some((c) => c.rule === 'BR-04')));
t('MEDIC wording flags vague words', () => { assert.equal(wording('Customer service improved').ok, false); assert.equal(wording('Cycle time decreased').ok, true); });
t('Layout places every element', () => { const L = layout(cis.chain); assert.equal(Object.keys(L.pos).length, cis.chain.elements.length); });
t('Layout never overlaps elements', () => {
  for (const pr of ws.programs) {
    const P = Object.values(layout(pr.chain).pos);
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i]; const b = P[j];
      assert.ok(Math.abs(a.x - b.x) >= NODE_W || Math.abs(a.y - b.y) >= NODE_H, `${pr.code} overlap`);
    }
  }
});
t('Backtrace from O4 reaches I1', () => assert.ok(backtrace(cis, 'cis-O4').some((r) => r.el.code === 'I1')));
t('Diff detects an added element', () => { const a = snapshot(cis.chain); const b = snapshot(cis.chain); b.elements.push({ id: 'x', kind: 'outcome', title: 'X' }); assert.equal(diffChains(a, b).added.length, 1); });
t('Gate readiness evaluates G2 criteria', () => { const g = gateReadiness(cis, ws, 'G2'); assert.equal(g.criteria.length, 7); });
t('Overlapping attribution (BR-11) is detected on query-handling cost', () => assert.ok(qualityChecks(cis, ws).some((c) => c.rule === 'BR-11')));
t('Broker benefits realisation shows at-risk volume', () => { const b = ws.programs.find((p) => p.id === 'prg-broker'); const r = realisation(b, b.benefits[0], ws); assert.ok(['at-risk', 'off-track'].includes(r.status), r.status); });
t('Change load flags a contact-centre bottleneck in 2027', () => { const cl = changeLoad(ws, ws.programs, '2027-Q1', '2027-Q4'); assert.ok(cl.rows.find((r) => r.area.id === 'a-cc').cells.some((c) => c.over)); });
t('Calibration fits two benchmarks', () => assert.ok(calibration(ws, 'risk')));

console.log('Monte Carlo simulation');
const t0 = Date.now();
const sim = simulate([cis], ws, { ...cis.simSettings, iterations: 5000 });
const ms = Date.now() - t0;
const sim2 = simulate([cis], ws, { ...cis.simSettings, iterations: 5000 });
t('Same seed gives identical results', () => assert.equal(sim.analysis.npv.mean, sim2.analysis.npv.mean));
t('Base case matches the deterministic financial model', () => near(sim.analysis.base.npv, fin.npv, Math.abs(fin.npv) * 1e-6 + 1));
t('P10 < P50 < P90', () => assert.ok(sim.analysis.npv.p10 < sim.analysis.npv.p50 && sim.analysis.npv.p50 < sim.analysis.npv.p90));
t('Fan bands are ordered', () => assert.ok(sim.analysis.fan.every((f) => f.p10 <= f.p50 + 1e-6 && f.p50 <= f.p90 + 1e-6)));
t('Tornado has rows sorted by swing', () => { const r = sim.tornado.rows; assert.ok(r.length > 3 && r[0].swing >= r[r.length - 1].swing); });
t('Events reduce expected NPV', () => { const noEv = simulate([cis], ws, { ...cis.simSettings, events: false, iterations: 5000 }); assert.ok(noEv.analysis.npv.mean > sim.analysis.npv.mean); });
t('Higher benefit scale raises P50', () => { const hi = simulate([cis], ws, { ...cis.simSettings, benefitScale: 1.2, iterations: 2000 }); assert.ok(hi.analysis.npv.p50 > sim.analysis.npv.p50); });
console.log(`    5,000 iterations in ${ms} ms · NPV P10 ${Math.round(sim.analysis.npv.p10 / 1000)}k · P50 ${Math.round(sim.analysis.npv.p50 / 1000)}k · P90 ${Math.round(sim.analysis.npv.p90 / 1000)}k · P(NPV>0) ${(sim.analysis.probPositive * 100).toFixed(1)}%`);
const live = ws.programs.filter((p) => !['withdrawn'].includes(p.state));
const t1 = Date.now();
const port = simulate(live, ws, { ...ws.portfolioSim, iterations: 3000 });
console.log(`    Portfolio (${live.length} programs) 3,000 iterations in ${Date.now() - t1} ms · NPV P50 ${Math.round(port.analysis.npv.p50 / 1000)}k · P(NPV>0) ${(port.analysis.probPositive * 100).toFixed(1)}%`);
t('Portfolio per-program spread present', () => assert.equal(port.analysis.perProgram.length, live.length));
t('summarise handles NaN', () => assert.equal(summarise(Float64Array.from([1, NaN, 3])).n, 2));

console.log(`\n${passed} checks passed${process.exitCode ? ' — SOME FAILED' : ''}`);
