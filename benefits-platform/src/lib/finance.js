// Financial worth model (VAL-03, section 7.2.3) and time-phased benefit profiles (BEN-03).
// Everything runs on a monthly grid that starts at the program's first month; NPV uses
// end-of-period discounting: NPV = Σ net(t) / (1 + r)^(t / 12).
import { addMonths, fiscalYear, fyLabel, isoFromMonthIndex, monthIndex, quarterKey, sum } from './util.js';
import { affectedBenefitIds, chainOf } from './chain.js';

export const isFinancial = (b) => b.type === 'cash' || b.type === 'noncash';

// Mutually exclusive benefits paths (RCM-07): benefits and costs that belong only to an
// unselected path in the same exclusive group are left out of the financial model.
export function pathScope(program, pathId) {
  const paths = chainOf(program).paths || [];
  const excl = paths.filter((p) => p.exclusiveGroup);
  const chosen = pathId ? paths.find((p) => p.id === pathId) : excl.find((p) => p.selected);
  if (!chosen) return { path: null, outBenefits: new Set(), outCosts: new Set() };
  const others = excl.filter((p) => p.exclusiveGroup === chosen.exclusiveGroup && p.id !== chosen.id);
  const mine = new Set(chosen.elementIds);
  const theirs = new Set(others.flatMap((p) => p.elementIds).filter((id) => !mine.has(id)));
  const otherIds = new Set(others.map((p) => p.id));
  return {
    path: chosen,
    outBenefits: new Set((program.benefits || []).filter((b) => b.outcomeId && theirs.has(b.outcomeId)).map((b) => b.id)),
    outCosts: new Set((program.costs || []).filter((c) => c.pathId && otherIds.has(c.pathId)).map((c) => c.id)),
  };
}
export const inScopeBenefits = (program, pathId) => { const s = pathScope(program, pathId); return (program.benefits || []).filter((b) => !s.outBenefits.has(b.id)); };
export const inScopeCosts = (program, pathId) => { const s = pathScope(program, pathId); return (program.costs || []).filter((c) => !s.outCosts.has(c.id)); };

// Annual value at full realisation: driver × coefficient when both are recorded (VAL-04).
export function annualValue(b) {
  const v = b.valuation || {};
  if (Number(v.driverValue) && Number(v.coefficient)) return Number(v.driverValue) * Number(v.coefficient);
  return Number(b.annualValue) || 0;
}

export function programStart(program) {
  const starts = [program.startDate, ...(program.projects || []).map((p) => p.start), ...(program.costs || []).map((c) => c.start)].filter(Boolean).sort();
  return (starts[0] || new Date().toISOString().slice(0, 10)).slice(0, 7) + '-01';
}

// Date the capabilities a benefit depends on are delivered (accepted if known, else forecast end).
export function capabilityDate(program, b) {
  const deps = (program.projects || []).filter((p) => (b.dependsOn || []).includes(p.id));
  if (!deps.length) return null;
  return deps.map((p) => p.acceptedDate || p.forecastEnd || p.end).filter(Boolean).sort().pop() || null;
}

// Benefit profile start (BR-12: should not start before capability delivery).
export function benefitStart(program, b, extraDelay = 0) {
  const cap = capabilityDate(program, b);
  const prof = b.profile || {};
  const fromCap = cap ? addMonths(cap, Number(prof.lagMonths) || 0) : null;
  const own = prof.startDate || null;
  const s = [fromCap, own].filter(Boolean).sort().pop() || program.endDate || programStart(program);
  return addMonths(s.slice(0, 7) + '-01', extraDelay);
}

// Realisation fraction k months after the profile starts: learning-lag dip, then plateaus.
export function shapeAt(profile = {}, k, opts = {}) {
  if (k < 0) return 0;
  const life = (opts.lifetimeYears ?? profile.lifetimeYears ?? 10) * 12;
  if (k >= life) return 0;
  const dipMonths = Number(profile.dipMonths) || 0;
  const dipPct = (Number(profile.dipPct) || 0) * (opts.dipScale ?? 1);
  if (k < dipMonths) return -dipPct;
  const k2 = k - dipMonths;
  let pts = (profile.plateaus && profile.plateaus.length ? profile.plateaus : [{ after: 0, pct: 1 }]).slice().sort((a, b) => a.after - b.after);
  if (opts.rampScale && opts.rampScale !== 1) pts = pts.map((p) => ({ ...p, after: p.after * opts.rampScale }));
  if (profile.ramp === 'linear') {
    if (k2 <= pts[0].after) return pts[0].after === 0 ? pts[0].pct : pts[0].pct * (k2 / pts[0].after);
    for (let i = 1; i < pts.length; i++) {
      if (k2 < pts[i].after) {
        const a = pts[i - 1]; const b = pts[i];
        return a.pct + (b.pct - a.pct) * ((k2 - a.after) / (b.after - a.after));
      }
    }
    return pts[pts.length - 1].pct;
  }
  let level = 0;
  for (const p of pts) if (k2 >= p.after) level = p.pct;
  return level;
}

// Monthly series for one benefit on a grid starting at startMi (month index) of length H.
export function benefitSeries(program, b, startMi, H, opts = {}) {
  const out = new Float64Array(H);
  const s = monthIndex(benefitStart(program, b, opts.delay || 0)) - startMi;
  const fin = isFinancial(b);
  const base = fin ? annualValue(b) / 12 : 1;
  const attr = b.attribution ?? 1;
  const sign = b.disbenefit ? -1 : 1;
  for (let m = 0; m < H; m++) out[m] = sign * base * attr * shapeAt(b.profile, m - s, opts);
  return out;
}

// Monthly series for one cost line: 'once' spreads the amount over the duration; 'annual' recurs.
export function costSeries(c, startMi, H, opts = {}) {
  const out = new Float64Array(H);
  const s = monthIndex(c.start) - startMi;
  const amt = Number(c.amount) || 0;
  const dur = Number(c.months) || 0;
  if (c.basis === 'annual') {
    const end = dur ? s + dur : H;
    for (let m = Math.max(0, s); m < Math.min(H, end); m++) out[m] = amt / 12;
  } else {
    const d = Math.max(1, dur || 1);
    for (let m = s; m < s + d; m++) if (m >= 0 && m < H) out[m] = amt / d;
  }
  if (opts.scale) for (let m = 0; m < H; m++) out[m] *= opts.scale;
  return out;
}

export const discountFactors = (H, r) => Float64Array.from({ length: H }, (_, m) => 1 / (1 + r) ** ((m + 1) / 12));

export function npvOf(net, r) {
  const df = discountFactors(net.length, r);
  let v = 0;
  for (let m = 0; m < net.length; m++) v += net[m] * df[m];
  return v;
}

// IRR on annual flows by bisection; null where cash flows do not change sign (section 7.2.3).
export function irr(flows) {
  const hasNeg = flows.some((f) => f < 0); const hasPos = flows.some((f) => f > 0);
  if (!hasNeg || !hasPos) return null;
  const f = (r) => flows.reduce((a, cf, t) => a + cf / (1 + r) ** (t + 1), 0);
  let lo = -0.99; let hi = 10;
  let flo = f(lo); const fhi = f(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2; const fm = f(mid);
    if (Math.abs(fm) < 1e-6) return mid;
    if (flo * fm < 0) hi = mid; else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

// First month in which cumulative net cash flow returns to zero or more after being negative.
export function paybackMonth(cum) {
  let wasNeg = false;
  for (let m = 0; m < cum.length; m++) {
    if (cum[m] < 0) wasNeg = true;
    else if (wasNeg && cum[m] >= 0) return m + 1;
  }
  return wasNeg ? null : 0;
}

export function horizonOf(program, ws, opts = {}) {
  return (opts.horizonYears || program.horizonYears || ws?.settings?.horizonYears || 10) * 12;
}

// Full financial worth for a program.
export function financials(program, ws, opts = {}) {
  const startISO = opts.startISO || programStart(program);
  const startMi = monthIndex(startISO);
  const H = opts.H || horizonOf(program, ws, opts);
  const r = opts.discountRate ?? program.discountRate ?? ws?.settings?.discountRate ?? 0.07;
  const fyStart = ws?.settings?.fyStartMonth || 7;
  const df = discountFactors(H, r);
  const benefitScale = opts.benefitScale ?? 1;
  const costScale = opts.costScale ?? 1;

  const scope = pathScope(program, opts.pathId);
  const benefitLines = (program.benefits || []).filter((b) => isFinancial(b) && !scope.outBenefits.has(b.id)).map((b) => {
    const series = benefitSeries(program, b, startMi, H, { delay: opts.delay || 0, lifetimeYears: opts.lifetimeYears, dipScale: opts.dipScale, rampScale: opts.rampScale });
    const scaleB = (opts.drop?.has?.(b.id) ? 0 : 1) * benefitScale;
    if (scaleB !== 1) for (let m = 0; m < H; m++) series[m] *= scaleB;
    return { id: b.id, name: b.title, type: b.type, series };
  });
  const costLines = (program.costs || []).filter((c) => !scope.outCosts.has(c.id)).map((c) => ({ id: c.id, name: c.name, type: c.type, btopp: c.btopp, series: costSeries(c, startMi, H, { scale: costScale }) }));

  const benefitsM = new Float64Array(H); const costsM = new Float64Array(H); const cashM = new Float64Array(H);
  for (const l of benefitLines) for (let m = 0; m < H; m++) { benefitsM[m] += l.series[m]; if (l.type === 'cash') cashM[m] += l.series[m]; }
  for (const l of costLines) for (let m = 0; m < H; m++) costsM[m] += l.series[m];
  const netM = new Float64Array(H); const cumM = new Float64Array(H);
  let pvB = 0; let pvC = 0; let pvCash = 0; let acc = 0;
  for (let m = 0; m < H; m++) {
    netM[m] = benefitsM[m] - costsM[m];
    acc += netM[m]; cumM[m] = acc;
    pvB += benefitsM[m] * df[m]; pvC += costsM[m] * df[m]; pvCash += cashM[m] * df[m];
  }
  const totalB = sum(benefitsM); const totalC = sum(costsM);

  // Annual (fiscal-year) roll-up.
  const years = new Map();
  for (let m = 0; m < H; m++) {
    const iso = isoFromMonthIndex(startMi + m);
    const fy = fiscalYear(iso, fyStart);
    if (!years.has(fy)) years.set(fy, { fy, label: fyLabel(fy, fyStart), benefits: 0, costs: 0, cash: 0, net: 0, byType: {} });
    const y = years.get(fy);
    y.benefits += benefitsM[m]; y.costs += costsM[m]; y.cash += cashM[m]; y.net += netM[m];
  }
  for (const l of costLines) for (let m = 0; m < H; m++) {
    const y = years.get(fiscalYear(isoFromMonthIndex(startMi + m), fyStart));
    y.byType[l.type] = (y.byType[l.type] || 0) + l.series[m];
  }
  let c = 0;
  const annual = [...years.values()].map((y) => { c += y.net; return { ...y, cum: c, noncash: y.benefits - y.cash }; });

  const costByType = {}; const costByBtopp = {};
  for (const l of costLines) {
    const t = sum(l.series);
    costByType[l.type] = (costByType[l.type] || 0) + t;
    costByBtopp[l.btopp || 'T'] = (costByBtopp[l.btopp || 'T'] || 0) + t;
  }

  return {
    path: scope.path, startISO, startMi, H, r, df, benefitLines, costLines, benefitsM, costsM, netM, cumM, cashM,
    pvBenefits: pvB, pvCosts: pvC, pvCash, pvNonCash: pvB - pvCash, npv: pvB - pvC,
    totalBenefits: totalB, totalCosts: totalC,
    bcr: pvC > 0 ? pvB / pvC : null,
    roi: totalC > 0 ? (totalB - totalC) / totalC : null,
    irr: irr(annual.map((y) => y.net)),
    paybackMonths: paybackMonth(cumM),
    annual, costByType, costByBtopp,
  };
}

// Sensitivity analysis (VAL-12): financial worth if benefits fall, arrive late, costs rise or assumptions fail.
export function sensitivity(program, ws) {
  const base = financials(program, ws);
  const run = (label, group, opts) => {
    const f = financials(program, ws, opts);
    return { label, group, npv: f.npv, bcr: f.bcr, delta: f.npv - base.npv, payback: f.paybackMonths };
  };
  const atRisk = affectedBenefitIds(program, (a) => a.assumption?.status === 'at-risk' || a.assumption?.status === 'invalid');
  const all = affectedBenefitIds(program, () => true);
  return {
    base,
    rows: [
      run('Benefits 10% lower', 'Benefits fall', { benefitScale: 0.9 }),
      run('Benefits 25% lower', 'Benefits fall', { benefitScale: 0.75 }),
      run('Benefits 50% lower', 'Benefits fall', { benefitScale: 0.5 }),
      run('Benefits 3 months late', 'Benefits delayed', { delay: 3 }),
      run('Benefits 6 months late', 'Benefits delayed', { delay: 6 }),
      run('Benefits 12 months late', 'Benefits delayed', { delay: 12 }),
      run('Costs 10% higher', 'Costs rise', { costScale: 1.1 }),
      run('Costs 25% higher', 'Costs rise', { costScale: 1.25 }),
      run('Costs 50% higher', 'Costs rise', { costScale: 1.5 }),
      run(`At-risk assumptions fail (${atRisk.size} benefit${atRisk.size === 1 ? '' : 's'} lost)`, 'Assumptions fail', { drop: atRisk }),
      run(`Every assumption fails (${all.size} benefit${all.size === 1 ? '' : 's'} lost)`, 'Assumptions fail', { drop: all }),
    ],
  };
}

// ---- Benefits realisation (BEN-04, section 7.2.4) ----------------------------
// Forecast for a quarter: currency realised in the quarter (financial) or level at quarter end (non-financial).
export function forecastForQuarter(program, b, qKey) {
  const startMi = monthIndex(benefitStart(program, b));
  const qMi = monthIndex(`${qKey.slice(0, 4)}-${String((Number(qKey.slice(-1)) - 1) * 3 + 1).padStart(2, '0')}-01`);
  if (isFinancial(b)) {
    let v = 0;
    for (let i = 0; i < 3; i++) v += (b.disbenefit ? -1 : 1) * (annualValue(b) / 12) * (b.attribution ?? 1) * shapeAt(b.profile, qMi + i - startMi);
    return v;
  }
  const base = Number(b.baseline?.value) || 0; const target = Number(b.target) || 0;
  return base + (target - base) * Math.max(0, shapeAt(b.profile, qMi + 2 - startMi));
}

export function realisation(program, b, ws) {
  const t = ws?.settings?.thresholds || { onTrack: 0.9, atRisk: 0.75 };
  const actuals = (b.actuals || []).filter((a) => a.value !== '' && a.value !== null && a.value !== undefined).sort((x, y) => (x.period < y.period ? -1 : 1));
  if (!actuals.length) return { status: 'no-data', ratio: null, actual: 0, forecast: 0, rows: [] };
  const rows = actuals.map((a) => ({ period: a.period, actual: Number(a.value), forecast: forecastForQuarter(program, b, a.period) }));
  let ratio;
  let actual; let forecast;
  if (isFinancial(b)) {
    actual = sum(rows, (r) => r.actual); forecast = sum(rows, (r) => r.forecast);
    ratio = forecast > 0 ? actual / forecast : null;
  } else {
    const last = rows[rows.length - 1];
    const base = Number(b.baseline?.value) || 0;
    actual = last.actual; forecast = last.forecast;
    const want = forecast - base;
    ratio = Math.abs(want) > 1e-9 ? (actual - base) / want : null;
  }
  const status = ratio === null ? 'no-data' : ratio >= t.onTrack ? 'on-track' : ratio >= t.atRisk ? 'at-risk' : 'off-track';
  return { status, ratio, actual, forecast, rows, last: rows[rows.length - 1]?.period };
}

export const BENEFIT_STATUS = {
  'on-track': { label: 'On track', color: 'var(--st-good)', icon: '●' },
  'at-risk': { label: 'At risk', color: 'var(--st-warning)', icon: '▲' },
  'off-track': { label: 'Off track', color: 'var(--st-critical)', icon: '■' },
  'no-data': { label: 'No actuals yet', color: 'var(--st-none)', icon: '○' },
};

// Forecast vs actual by quarter for charts.
export function profileQuarters(program, b, fromISO, count = 24) {
  const out = [];
  let k = quarterKey(fromISO);
  for (let i = 0; i < count; i++) {
    const a = (b.actuals || []).find((x) => x.period === k);
    out.push({ period: k, forecast: forecastForQuarter(program, b, k), actual: a && a.value !== '' ? Number(a.value) : null });
    const [y, q] = k.split('-Q').map(Number);
    k = q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`;
  }
  return out;
}
