// Monte Carlo simulation of program and portfolio costs and benefits (VAL-12, VAL-13, extended).
//
// Model: every cost line and every financial benefit line has a deterministic monthly base series
// (from finance.js). Each iteration samples
//   • a factor per line from its (low, most likely, high) range — PERT, triangular, uniform or normal —
//     with lines in the same group correlated through a common factor (one-factor Gaussian copula);
//   • a schedule delay (months) that shifts every benefit stream, correlated with the cost factor;
//   • risk events: assumptions that fail (cutting the benefits downstream of them in the benefits map)
//     and any user-defined events (cost shocks, benefit losses, extra delay).
// Results are deterministic for a given seed (NFR-27).
import { benefitSeries, costSeries, isFinancial, programStart, horizonOf, pathScope } from './finance.js';
import { chainOf, downstream } from './chain.js';
import { isoFromMonthIndex, monthIndex, quarterKey } from './util.js';
import { SIM_DEFAULTS } from './config.js';

// ---- Random numbers ---------------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rng) {
  let u = 0; let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
// Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf).
export function phi(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

// ---- Distributions as inverse CDFs (u in (0,1) → value) -------------------------------
const pertCache = new Map();
function pertTable(alpha, beta) {
  const key = `${alpha.toFixed(3)}|${beta.toFixed(3)}`;
  if (pertCache.has(key)) return pertCache.get(key);
  const N = 1024; const cdf = new Float64Array(N + 1);
  let acc = 0; let prev = 0;
  for (let i = 0; i <= N; i++) {
    const x = Math.min(1 - 1e-9, Math.max(1e-9, i / N));
    const pdf = x ** (alpha - 1) * (1 - x) ** (beta - 1);
    if (i > 0) acc += (pdf + prev) / 2;
    cdf[i] = acc; prev = pdf;
  }
  for (let i = 0; i <= N; i++) cdf[i] /= acc;
  pertCache.set(key, cdf);
  return cdf;
}
export function makeInverse(dist, min, ml, max) {
  if (!(max > min)) return () => ml;
  const lo = Math.min(min, ml); const hi = Math.max(max, ml);
  if (dist === 'uniform') return (u) => lo + u * (hi - lo);
  if (dist === 'triangular') {
    const fc = (ml - lo) / (hi - lo);
    return (u) => (u < fc ? lo + Math.sqrt(u * (hi - lo) * (ml - lo)) : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - ml)));
  }
  if (dist === 'normal') {
    const sd = (hi - lo) / 3.29; // range treated as the 5th–95th percentile band
    return (u) => ml + sd * invNorm(u);
  }
  // PERT (default): Beta(α, β) on [lo, hi] with mode ml.
  const alpha = 1 + (4 * (ml - lo)) / (hi - lo); const beta = 1 + (4 * (hi - ml)) / (hi - lo);
  const cdf = pertTable(alpha, beta); const N = cdf.length - 1;
  return (u) => {
    let a = 0; let b = N;
    while (b - a > 1) { const m = (a + b) >> 1; if (cdf[m] < u) a = m; else b = m; }
    const span = cdf[b] - cdf[a];
    const frac = span > 0 ? (u - cdf[a]) / span : 0;
    return lo + ((a + frac) / N) * (hi - lo);
  };
}
// Acklam's inverse normal approximation.
export function invNorm(p) {
  if (p <= 0) return -8; if (p >= 1) return 8;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5; const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Default probability that an assumption proves false, by its monitored status.
export const ASSUMPTION_PROB = { holding: 0.1, 'at-risk': 0.35, invalid: 0.85 };

// ---- Model -----------------------------------------------------------------------------
export function buildModel(programs, ws, settings = {}) {
  const s = { ...SIM_DEFAULTS, ...settings };
  const startISO = programs.map((p) => programStart(p)).sort()[0] || new Date().toISOString().slice(0, 7) + '-01';
  const startMi = monthIndex(startISO);
  const horizonYears = s.horizonYears || Math.max(...programs.map((p) => horizonOf(p, ws) / 12), 1);
  // Portfolio runs extend the horizon so later programs keep their full evaluation window.
  const lastStart = Math.max(...programs.map((p) => monthIndex(programStart(p))));
  const H = Math.round(horizonYears * 12 + (programs.length > 1 ? lastStart - startMi : 0));
  const r = s.discountRate ?? ws.settings.discountRate;
  const shapeOpts = { lifetimeYears: s.lifetimeYears || undefined, dipScale: s.dipScale ?? 1, rampScale: s.rampScale ?? 1 };
  const lines = [];
  programs.forEach((p, pi) => {
    const scope = pathScope(p, settings.pathByProgram?.[p.id]);
    for (const c of (p.costs || []).filter((x) => !scope.outCosts.has(x.id))) {
      const ov = s.lineOverrides?.[c.id] || {};
      lines.push({
        id: c.id, kind: 'cost', pi, program: p, name: c.name, type: c.type,
        base: costSeries(c, startMi, H),
        low: ov.low ?? c.uncertainty?.low ?? s.costLow, high: ov.high ?? c.uncertainty?.high ?? s.costHigh, fixed: Boolean(ov.off),
      });
    }
    for (const b of (p.benefits || []).filter((x) => isFinancial(x) && !scope.outBenefits.has(x.id))) {
      const ov = s.lineOverrides?.[b.id] || {};
      lines.push({
        id: b.id, kind: 'benefit', pi, program: p, name: b.title, type: b.type,
        base: benefitSeries(p, b, startMi, H, shapeOpts),
        low: ov.low ?? b.uncertainty?.low ?? s.benefitLow, high: ov.high ?? b.uncertainty?.high ?? s.benefitHigh, fixed: Boolean(ov.off),
      });
    }
  });
  for (const l of lines) {
    const scale = l.kind === 'cost' ? s.costScale : s.benefitScale;
    l.inv = makeInverse(s.dist, scale * (1 + Math.min(0, l.low)), scale, scale * (1 + Math.max(0, l.high)));
    l.lowV = scale * (1 + Math.min(0, l.low)); l.highV = scale * (1 + Math.max(0, l.high)); l.ml = scale;
  }
  // Risk events.
  const events = [];
  if (s.events) {
    programs.forEach((p, pi) => {
      const chain = chainOf(p);
      for (const a of chain.elements.filter((e) => e.kind === 'assumption')) {
        const down = downstream(chain, a.id);
        const idx = lines.map((l, i) => (l.kind === 'benefit' && l.pi === pi && down.has((p.benefits || []).find((b) => b.id === l.id)?.outcomeId) ? i : -1)).filter((i) => i >= 0);
        if (!idx.length) continue;
        const ov = s.eventOverrides?.[a.id] || {};
        if (ov.off) continue;
        events.push({
          id: a.id, kind: 'benefit', source: 'assumption', program: p, name: `${a.code}: ${a.title} proves false`,
          prob: ov.prob ?? a.assumption?.probFalse ?? ASSUMPTION_PROB[a.assumption?.status || 'holding'],
          impact: ov.impact ?? a.assumption?.simImpact ?? 0.5, lines: idx,
        });
      }
    });
    for (const e of s.customEvents || []) {
      if (e.off) continue;
      const pi = e.programId ? programs.findIndex((p) => p.id === e.programId) : -1;
      events.push({
        id: e.id, kind: e.kind, source: 'custom', name: e.name, prob: Number(e.prob) || 0, impact: Number(e.impact) || 0,
        month: e.month ? monthIndex(e.month) - startMi : Math.round(H / 6),
        lines: e.kind === 'benefit' ? lines.map((l, i) => (l.kind === 'benefit' && (pi < 0 || l.pi === pi) ? i : -1)).filter((i) => i >= 0) : [],
      });
    }
  }
  const df = Float64Array.from({ length: H }, (_, m) => 1 / (1 + r) ** ((m + 1) / 12));
  const delayInv = makeInverse(s.dist === 'normal' ? 'triangular' : s.dist, Math.min(s.delayLow, s.delayMonths), s.delayMonths, Math.max(s.delayHigh, s.delayMonths));
  return { s, programs, startISO, startMi, H, r, df, lines, events, delayInv, Q: Math.ceil(H / 3) };
}

// One deterministic evaluation for a sample {factors[], delay, events: Uint8Array}.
function evaluate(model, sample, buf) {
  const { H, df, lines, events } = model;
  const ben = buf.ben.fill(0); const cost = buf.cost.fill(0);
  const pvByProgram = buf.pvp.fill(0);
  const delay = Math.max(0, Math.round(sample.delay));
  const benMult = buf.mult.fill(1);
  const lump = buf.lump.fill(0);
  let extraDelay = 0;
  events.forEach((e, k) => {
    if (!sample.events[k]) return;
    if (e.kind === 'benefit') for (const i of e.lines) benMult[i] *= 1 - e.impact;
    else if (e.kind === 'cost' && e.month >= 0 && e.month < H) lump[e.month] += e.impact;
    else if (e.kind === 'delay') extraDelay += e.impact;
  });
  const d = delay + Math.round(extraDelay);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]; const f = sample.factors[i] * benMult[i]; const b = l.base;
    let pv = 0;
    if (l.kind === 'cost') {
      for (let m = 0; m < H; m++) { const v = b[m] * f; cost[m] += v; pv -= v * df[m]; }
    } else {
      for (let m = d; m < H; m++) { const v = b[m - d] * f; ben[m] += v; pv += v * df[m]; }
    }
    pvByProgram[l.pi] += pv;
  }
  let pvB = 0; let pvC = 0; let totB = 0; let totC = 0; let cum = 0; let payback = NaN; let wasNeg = false;
  const cumQ = buf.cumQ;
  for (let m = 0; m < H; m++) {
    cost[m] += lump[m];
    pvB += ben[m] * df[m]; pvC += cost[m] * df[m]; totB += ben[m]; totC += cost[m];
    cum += ben[m] - cost[m];
    if (cum < 0) wasNeg = true; else if (wasNeg && Number.isNaN(payback)) payback = m + 1;
    if (m % 3 === 2 || m === H - 1) cumQ[Math.floor(m / 3)] = cum;
  }
  // Lump-sum costs belong to the whole run (portfolio) — attribute to the first program for per-program PV.
  if (pvByProgram.length) { let lumpPV = 0; for (let m = 0; m < H; m++) lumpPV += lump[m] * df[m]; pvByProgram[0] -= lumpPV; }
  // Annual flows for IRR.
  const years = buf.years.fill(0);
  for (let m = 0; m < H; m++) years[Math.floor(m / 12)] += ben[m] - cost[m];
  return { npv: pvB - pvC, pvB, pvC, totB, totC, payback: wasNeg ? payback : 0, irr: irrFast(years), cumQ, pvByProgram };
}

function irrFast(flows) {
  let hasNeg = false; let hasPos = false;
  for (const f of flows) { if (f < 0) hasNeg = true; else if (f > 0) hasPos = true; }
  if (!hasNeg || !hasPos) return NaN;
  const f = (r) => { const k = 1 / (1 + r); let disc = k; let v = 0; for (let t = 0; t < flows.length; t++) { v += flows[t] * disc; disc *= k; } return v; };
  let lo = -0.95; let hi = 5; let flo = f(lo); const fhi = f(hi);
  if (flo * fhi > 0) return NaN;
  for (let i = 0; i < 48; i++) { const mid = (lo + hi) / 2; const fm = f(mid); if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; } }
  return (lo + hi) / 2;
}

function makeBuffers(model) {
  return {
    ben: new Float64Array(model.H), cost: new Float64Array(model.H), lump: new Float64Array(model.H),
    mult: new Float64Array(model.lines.length), cumQ: new Float64Array(model.Q), years: new Float64Array(Math.ceil(model.H / 12)),
    pvp: new Float64Array(model.programs.length),
  };
}

// Base case: every factor at its most likely value, delay at most likely, no events.
export function baseCase(model) {
  const sample = { factors: model.lines.map((l) => (l.fixed ? l.ml : l.ml)), delay: model.s.delayMonths, events: new Uint8Array(model.events.length) };
  const r = evaluate(model, sample, makeBuffers(model));
  return { ...r, cumQ: Array.from(r.cumQ), pvByProgram: Array.from(r.pvByProgram) };
}

// Incremental runner so the UI can animate the distribution building up.
export function createRun(model) {
  const { s, lines, events, Q } = model;
  const n = Math.max(100, Math.min(50000, Math.round(s.iterations)));
  const rng = mulberry32(s.seed || 1);
  const out = {
    n, done: 0,
    npv: new Float64Array(n), pvB: new Float64Array(n), pvC: new Float64Array(n), totB: new Float64Array(n), totC: new Float64Array(n),
    bcr: new Float64Array(n), roi: new Float64Array(n), irr: new Float64Array(n), payback: new Float64Array(n),
    delay: new Float64Array(n), benF: new Float64Array(n), costF: new Float64Array(n),
    events: new Uint8Array(n * Math.max(1, events.length)),
    cumQ: new Float32Array(n * Q), pvp: new Float64Array(n * model.programs.length),
  };
  const buf = makeBuffers(model);
  const rho = Math.max(0, Math.min(0.99, s.lineCorrelation ?? 0.6));
  const rcs = Math.max(-0.99, Math.min(0.99, s.correlation ?? 0));
  const sample = { factors: new Float64Array(lines.length), delay: 0, events: new Uint8Array(events.length) };
  const lineW = lines.map((l) => Math.abs(l.base.reduce((x, y) => x + y, 0)));
  const benW = lines.reduce((a, l, i) => a + (l.kind === 'benefit' ? lineW[i] : 0), 0) || 1;
  const costW = lines.reduce((a, l, i) => a + (l.kind === 'cost' ? lineW[i] : 0), 0) || 1;
  function step(k) {
    const end = Math.min(n, out.done + k);
    for (let it = out.done; it < end; it++) {
      const zb = gaussian(rng); const zc = gaussian(rng);
      const zd = rcs * zc + Math.sqrt(1 - rcs * rcs) * gaussian(rng);
      let bf = 0; let cf = 0;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (l.fixed) { sample.factors[i] = l.ml; continue; }
        const z = Math.sqrt(rho) * (l.kind === 'cost' ? zc : zb) + Math.sqrt(1 - rho) * gaussian(rng);
        const v = Math.max(0, l.inv(phi(z)));
        sample.factors[i] = v;
        if (l.kind === 'cost') cf += v * lineW[i] / costW; else bf += v * lineW[i] / benW;
      }
      sample.delay = Math.max(0, model.delayInv(phi(zd)));
      for (let k2 = 0; k2 < events.length; k2++) sample.events[k2] = rng() < events[k2].prob ? 1 : 0;
      const r = evaluate(model, sample, buf);
      out.npv[it] = r.npv; out.pvB[it] = r.pvB; out.pvC[it] = r.pvC; out.totB[it] = r.totB; out.totC[it] = r.totC;
      out.bcr[it] = r.pvC > 0 ? r.pvB / r.pvC : NaN;
      out.roi[it] = r.totC > 0 ? (r.totB - r.totC) / r.totC : NaN;
      out.irr[it] = r.irr; out.payback[it] = r.payback;
      out.delay[it] = sample.delay; out.benF[it] = bf; out.costF[it] = cf;
      for (let k2 = 0; k2 < events.length; k2++) out.events[it * events.length + k2] = sample.events[k2];
      out.cumQ.set(r.cumQ, it * Q);
      out.pvp.set(r.pvByProgram, it * model.programs.length);
    }
    out.done = end;
    return out.done >= n;
  }
  return { model, out, step };
}

// ---- Statistics -----------------------------------------------------------------------
export function summarise(arr, count = arr.length) {
  let k = 0;
  for (let i = 0; i < count; i++) if (Number.isFinite(arr[i])) k++;
  if (!k) return null;
  const v = new Float64Array(k);
  k = 0;
  for (let i = 0; i < count; i++) if (Number.isFinite(arr[i])) v[k++] = arr[i];
  v.sort();
  const q = (p) => { const x = (v.length - 1) * p; const lo = Math.floor(x); const hi = Math.ceil(x); return v[lo] + (v[hi] - v[lo]) * (x - lo); };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, v.length - 1));
  return { n: v.length, of: count, mean, sd, min: v[0], max: v[v.length - 1], p5: q(0.05), p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95), sorted: v };
}
export const probability = (arr, pred, count = arr.length) => { let k = 0; let n = 0; for (let i = 0; i < count; i++) { if (Number.isNaN(arr[i])) continue; n++; if (pred(arr[i])) k++; } return n ? k / n : null; };

export function histogram(arr, count, bins = 40, range) {
  const st = range || (() => { let lo = Infinity; let hi = -Infinity; for (let i = 0; i < count; i++) { if (!Number.isFinite(arr[i])) continue; lo = Math.min(lo, arr[i]); hi = Math.max(hi, arr[i]); } return [lo, hi]; })();
  let [lo, hi] = st;
  if (!(hi > lo)) { lo -= 1; hi += 1; }
  const w = (hi - lo) / bins; const counts = new Array(bins).fill(0);
  for (let i = 0; i < count; i++) { const x = arr[i]; if (!Number.isFinite(x)) continue; counts[Math.min(bins - 1, Math.max(0, Math.floor((x - lo) / w)))]++; }
  return counts.map((c, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, count: c }));
}

// Finalise a run: summary statistics, fan bands, event impact and per-program spread.
export function analyse(run) {
  const { model, out } = run;
  const n = out.done;
  const npv = summarise(out.npv, n);
  const Q = model.Q;
  const fan = [];
  const col = new Float64Array(n);
  for (let q = 0; q < Q; q++) {
    for (let i = 0; i < n; i++) col[i] = out.cumQ[i * Q + q];
    const s = summarise(col, n);
    fan.push({ q, key: quarterKey(isoFromMonthIndex(model.startMi + q * 3)), p10: s.p10, p25: s.p25, p50: s.p50, p75: s.p75, p90: s.p90, mean: s.mean });
  }
  const E = model.events.length;
  const eventImpact = model.events.map((e, k) => {
    let a = 0; let na = 0; let b = 0; let nb = 0;
    for (let i = 0; i < n; i++) { if (out.events[i * E + k]) { a += out.npv[i]; na++; } else { b += out.npv[i]; nb++; } }
    return { ...e, occurred: na / n, npvIf: na ? a / na : null, npvIfNot: nb ? b / nb : null, delta: na && nb ? a / na - b / nb : 0 };
  });
  const P = model.programs.length;
  const perProgram = model.programs.map((p, pi) => {
    const arr = new Float64Array(n);
    for (let i = 0; i < n; i++) arr[i] = out.pvp[i * P + pi];
    return { program: p, stats: summarise(arr, n), probPositive: probability(arr, (v) => v > 0, n) };
  });
  return {
    n, npv, base: baseCase(model),
    pvB: summarise(out.pvB, n), pvC: summarise(out.pvC, n), bcr: summarise(out.bcr, n), roi: summarise(out.roi, n), irr: summarise(out.irr, n),
    payback: summarise(out.payback, n), delay: summarise(out.delay, n),
    probPositive: probability(out.npv, (v) => v > 0, n),
    probBcr1: probability(out.bcr, (v) => v > 1, n),
    probPayback: probability(out.payback, (v) => Number.isFinite(v), n),
    fan, eventImpact, perProgram,
  };
}

// Tornado (swing) analysis: NPV with each input at its low and high bound, everything else most likely.
export function tornado(model, limit = 12) {
  const buf = makeBuffers(model);
  const baseFactors = model.lines.map((l) => l.ml);
  const none = new Uint8Array(model.events.length);
  const run = (patch) => evaluate(model, { factors: patch.factors || baseFactors, delay: patch.delay ?? model.s.delayMonths, events: patch.events || none }, buf).npv;
  const base = run({});
  const rows = [];
  const allTo = (kind, which) => baseFactors.map((v, i) => (model.lines[i].kind === kind && !model.lines[i].fixed ? (which === 'low' ? model.lines[i].lowV : model.lines[i].highV) : v));
  rows.push({ id: 'all-benefits', label: 'All benefits (low ↔ high)', group: 'Global', low: run({ factors: allTo('benefit', 'low') }), high: run({ factors: allTo('benefit', 'high') }) });
  rows.push({ id: 'all-costs', label: 'All costs (low ↔ high)', group: 'Global', low: run({ factors: allTo('cost', 'high') }), high: run({ factors: allTo('cost', 'low') }), invert: true });
  rows.push({ id: 'delay', label: `Benefit delay (${Math.round(model.s.delayHigh)} ↔ ${Math.round(model.s.delayLow)} months)`, group: 'Global', low: run({ delay: Math.max(model.s.delayHigh, model.s.delayMonths) }), high: run({ delay: Math.min(model.s.delayLow, model.s.delayMonths) }) });
  model.lines.forEach((l, i) => {
    if (l.fixed) return;
    const lo = baseFactors.slice(); const hi = baseFactors.slice();
    if (l.kind === 'cost') { lo[i] = l.highV; hi[i] = l.lowV; } else { lo[i] = l.lowV; hi[i] = l.highV; }
    rows.push({ id: l.id, label: `${l.kind === 'cost' ? 'Cost' : 'Benefit'}: ${l.name}`, group: l.kind, program: l.program.name, low: run({ factors: lo }), high: run({ factors: hi }) });
  });
  model.events.forEach((e, k) => {
    const on = new Uint8Array(model.events.length); on[k] = 1;
    const v = run({ events: on });
    rows.push({ id: e.id, label: `Risk: ${e.name}`, group: 'event', low: Math.min(v, base), high: Math.max(v, base), prob: e.prob });
  });
  return { base, rows: rows.map((r) => ({ ...r, swing: Math.abs(r.high - r.low) })).sort((a, b) => b.swing - a.swing).slice(0, limit) };
}

// Convenience: run everything synchronously (used by the business case and tests).
export function simulate(programs, ws, settings = {}) {
  const model = buildModel(programs, ws, settings);
  const run = createRun(model);
  run.step(run.out.n);
  return { model, run, analysis: analyse(run), tornado: tornado(model) };
}
