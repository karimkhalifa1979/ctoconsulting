// Portfolio-level helpers: cached per-program summaries, factories and roll-ups.
import { financials, isFinancial, realisation } from './finance.js';
import { riskScore, alignmentScore, programHealth, benefitStatusCounts, calibration } from './scoring.js';
import { qualityChecks, fundingApproved, spendToDate, nextGate, latestValueCase } from './rules.js';
import { newProgramShape } from './seed.js';
import { fiscalYear, sum, todayISO, uid } from './util.js';
import { SIM_DEFAULTS } from './config.js';

const cache = new WeakMap();
export function summaries(ws) {
  if (cache.has(ws)) return cache.get(ws);
  const calR = calibration(ws, 'risk'); const calA = calibration(ws, 'alignment');
  const map = new Map();
  for (const p of ws.programs) {
    const fin = financials(p, ws);
    const risk = riskScore(p, ws);
    const align = alignmentScore(p, ws);
    const checks = qualityChecks(p, ws);
    map.set(p.id, {
      p, fin, risk, align, checks,
      riskNorm: calR ? calR.apply(risk.overall) : null,
      alignNorm: calA ? calA.apply(align.score) : null,
      health: programHealth(p, ws),
      status: benefitStatusCounts(p, ws),
      funding: fundingApproved(p), spend: spendToDate(p), next: nextGate(p), vc: latestValueCase(p),
      cost: fin.totalCosts, lifetimeCost: Math.max(fin.totalCosts, Number(p.costHigh) || 0),
      errors: checks.filter((c) => c.severity === 'error').length,
      warnings: checks.filter((c) => c.severity === 'warning').length,
    });
  }
  const out = { map, calR, calA, get: (id) => map.get(id), list: [...map.values()] };
  cache.set(ws, out);
  return out;
}

export function nextProgramCode(ws) {
  const n = Math.max(0, ...ws.programs.map((p) => Number(String(p.code || '').replace(/\D/g, '')) || 0)) + 1;
  return `PRG-${String(n).padStart(3, '0')}`;
}

export function createProgram(ws, fields = {}) {
  const today = todayISO();
  return newProgramShape({
    id: uid('prg'), code: nextProgramCode(ws), name: 'New program', state: 'concept', stateSince: today,
    categoryId: 'opportunity', portfolioId: ws.portfolios[0]?.id, sponsorId: null, managerId: null, analystId: null,
    purpose: '', problem: '', scope: '', areas: [], driverIds: [], startDate: today.slice(0, 7) + '-01', endDate: null,
    costLow: '', costHigh: '', selection: null, band: null,
    simSettings: { ...SIM_DEFAULTS },
    ...fields,
  });
}

// Benefits realisation roll-up (RPT-03, 7.2.4): financial summed after attribution; non-financial as share on track.
export function benefitsRollup(ws, programs = ws.programs) {
  const rows = [];
  for (const p of programs) {
    for (const b of p.benefits || []) {
      const r = realisation(p, b, ws);
      rows.push({ p, b, r, financial: isFinancial(b) });
    }
  }
  const fin = rows.filter((x) => x.financial && x.r.status !== 'no-data');
  const nonfin = rows.filter((x) => !x.financial && x.r.status !== 'no-data');
  return {
    rows,
    realised: sum(fin, (x) => x.r.actual), forecast: sum(fin, (x) => x.r.forecast),
    cashRealised: sum(fin.filter((x) => x.b.type === 'cash'), (x) => x.r.actual), cashForecast: sum(fin.filter((x) => x.b.type === 'cash'), (x) => x.r.forecast),
    nonfinOnTrack: nonfin.length ? nonfin.filter((x) => x.r.status === 'on-track').length / nonfin.length : null,
    counts: rows.reduce((a, x) => ({ ...a, [x.r.status]: (a[x.r.status] || 0) + 1 }), {}),
  };
}

// Funds by category and fiscal year (PFM-02, VMO-03): allocation, committed (approved tranches), spent, forecast.
export function categoryFunds(ws, fy) {
  const fyStart = ws.settings.fyStartMonth || 7;
  return ws.categories.map((c) => {
    const progs = ws.programs.filter((p) => p.categoryId === c.id && p.state !== 'withdrawn');
    const allocation = sum(ws.allocations.filter((a) => a.categoryId === c.id && a.fy === fy), (a) => a.amount);
    let forecast = 0;
    const s = summaries(ws);
    for (const p of progs) {
      const f = s.get(p.id)?.fin;
      if (!f) continue;
      forecast += sum(f.annual.filter((y) => y.fy === fy), (y) => y.costs);
    }
    const committed = sum(progs, (p) => sum((p.gates || []).filter((g) => g.decision && fiscalYear(g.decision.date, fyStart) === fy), (g) => Number(g.decision.fundingApproved) || 0));
    const released = sum(ws.programs.filter((p) => p.categoryId === c.id && p.state === 'withdrawn' && p.withdrawal && fiscalYear(p.withdrawal.date, fyStart) === fy), (p) => Number(p.withdrawal.released) || 0);
    return { category: c, allocation, forecast, committed, released, available: allocation - forecast, programs: progs.length };
  });
}

export const LIVE = (p) => !['withdrawn', 'completed', 'idea'].includes(p.state);
