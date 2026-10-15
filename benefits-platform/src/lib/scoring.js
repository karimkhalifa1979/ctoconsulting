// Value assessment calculations (VAL-02/05/06/07, sections 7.2.1, 7.2.2, 7.2.6) and program health (PRG-13).
import { ARES, RISK_INSTRUMENT, SEVEN_PLUS_ONE } from './config.js';
import { chainOf } from './chain.js';
import { realisation, isFinancial } from './finance.js';
import { quarterRange, sum } from './util.js';

// ---- Risk score (7.2.1) -------------------------------------------------------
export function riskScore(program, ws, answers = program.assessment?.risk?.answers || {}) {
  const sMin = 1; const sMax = 5;
  const weights = ws?.settings?.areWeights || { right: 1, way: 1, well: 1, benefits: 1 };
  const instrument = ws?.instrument || RISK_INSTRUMENT;
  const byAre = {};
  let answered = 0;
  for (const a of ARES) {
    const qs = instrument.filter((q) => q.are === a.id);
    let num = 0; let den = 0; let n = 0;
    for (const q of qs) {
      const s = Number(answers[q.id]);
      if (!s) continue;
      n++; answered++;
      num += q.w * (s - sMin); den += q.w * (sMax - sMin);
    }
    byAre[a.id] = { score: den ? (100 * num) / den : null, answered: n, total: qs.length };
  }
  const present = ARES.filter((a) => byAre[a.id].score !== null);
  const W = sum(present, (a) => weights[a.id] ?? 1);
  const overall = present.length && W ? sum(present, (a) => (weights[a.id] ?? 1) * byAre[a.id].score) / W : null;
  const unanswered = 1 - answered / instrument.length;
  return { byAre, overall, unanswered, incomplete: unanswered > (ws?.settings?.thresholds?.unansweredMax ?? 0.2) };
}

export function riskBand(score, ws) {
  const t = ws?.settings?.thresholds || { riskAmber: 35, riskRed: 65 };
  if (score === null || score === undefined) return { id: 'none', label: 'Not assessed', color: 'var(--st-none)', hex: '#e1e0d9' };
  if (score > t.riskRed) return { id: 'red', label: 'High', color: 'var(--st-critical)', hex: '#d03b3b' };
  if (score >= t.riskAmber) return { id: 'amber', label: 'Medium', color: 'var(--st-warning)', hex: '#fab219' };
  return { id: 'green', label: 'Low', color: 'var(--st-good)', hex: '#0ca30c' };
}

// ---- Alignment score (7.2.2) ---------------------------------------------------
export function alignmentScore(program, ws, ratings = program.assessment?.alignment?.ratings || {}) {
  const drivers = (ws?.drivers || []).filter((d) => d.status !== 'retired');
  const T = ws?.settings?.typeWeights || { current: 0.5, parent: 0.2, future: 0.3 };
  const types = [...new Set(drivers.map((d) => d.type))];
  const tSum = sum(types, (t) => T[t] ?? 0) || 1;
  let score = 0; let rated = 0;
  const breakdown = [];
  for (const t of types) {
    const ds = drivers.filter((d) => d.type === t);
    const wSum = sum(ds, (d) => d.weight) || 1;
    let typeScore = 0;
    for (const d of ds) {
      const c = Number(ratings[d.id]);
      if (ratings[d.id] !== undefined && ratings[d.id] !== '') rated++;
      const contrib = ((T[t] ?? 0) / tSum) * ((d.weight || 0) / wSum) * ((Number.isFinite(c) ? c : 0) / 4) * 100;
      typeScore += contrib;
      breakdown.push({ driver: d, type: t, rating: Number.isFinite(c) ? c : null, contribution: contrib });
    }
    score += typeScore;
  }
  return { score: rated ? score : null, rated, total: drivers.length, breakdown };
}

// ---- Normalisation against benchmark programs (VAL-06) ------------------------
export function calibration(ws, kind) {
  const pts = (ws.programs || []).filter((p) => p.benchmark && p.reference?.[kind] !== undefined && p.reference?.[kind] !== '').map((p) => {
    const raw = kind === 'risk' ? riskScore(p, ws).overall : alignmentScore(p, ws).score;
    return raw === null ? null : [raw, Number(p.reference[kind])];
  }).filter(Boolean);
  if (pts.length < 2) return null;
  const n = pts.length; const mx = sum(pts, (p) => p[0]) / n; const my = sum(pts, (p) => p[1]) / n;
  const sxx = sum(pts, (p) => (p[0] - mx) ** 2);
  if (sxx < 1e-9) return null;
  const b = sum(pts, (p) => (p[0] - mx) * (p[1] - my)) / sxx;
  const a = my - b * mx;
  return { a, b, n, apply: (x) => (x === null ? null : Math.max(0, Math.min(100, a + b * x))) };
}

// ---- Change load (7.2.6) ---------------------------------------------------------
const IMPACT = { low: 1, medium: 2, high: 3 };
export function changeLoad(ws, programs = ws.programs, fromQ, toQ) {
  const quarters = quarterRange(fromQ, toQ);
  const rows = (ws.areas || []).map((area) => {
    const cells = quarters.map((q) => {
      let load = 0; const contributors = [];
      for (const p of programs) {
        for (const s of p.stakeholders || []) {
          if (s.areaId !== area.id || !s.from || !s.to || q < s.from || q > s.to) continue;
          const v = (IMPACT[s.impact] || 1) * (Number(s.share) || 0);
          load += v;
          contributors.push({ program: p, group: s, value: v });
        }
      }
      return { q, load, contributors, over: load > (Number(area.absorption) || 2) };
    });
    return { area, cells };
  });
  return { quarters, rows };
}

// ---- Accountability rows derived from the model (ACC-02/03/04) ----------------------
export function accountabilities(program, ws) {
  const rows = [];
  const add = (role, objectType, objectId, objectLabel, personId) => {
    if (!personId) return;
    const key = `${role}:${objectId}:${personId}`;
    const acc = program.acceptances?.[key] || {};
    const conds = acc.conditions || {};
    const unmet = SEVEN_PLUS_ONE.filter(([k]) => conds[k] === 'not').length;
    const partly = SEVEN_PLUS_ONE.filter(([k]) => conds[k] === 'partly').length;
    rows.push({ key, role, objectType, objectId, objectLabel, personId, person: ws.people?.find((x) => x.id === personId), acceptedAt: acc.acceptedAt || null, conditions: conds, unmet, partly, notes: acc.notes || '' });
  };
  add('sponsor', 'program', program.id, program.name, program.sponsorId);
  add('manager', 'program', program.id, program.name, program.managerId);
  add('change-lead', 'program', program.id, `${program.name} change`, program.changeLeadId);
  for (const e of chainOf(program).elements) {
    if (e.kind === 'outcome') add('outcome-owner', 'outcome', e.id, `${e.code} ${e.title}`, e.ownerId);
    if (e.kind === 'initiative') add('delivery-owner', 'initiative', e.id, `${e.code} ${e.title}`, e.ownerId);
    if (e.kind === 'assumption') add('assumption-monitor', 'assumption', e.id, `${e.code} ${e.title}`, e.assumption?.monitorId);
  }
  for (const b of program.benefits || []) {
    add('benefit-owner', 'benefit', b.id, b.title, b.ownerId);
    if (b.operationalOwnerId) add('operational-owner', 'benefit', b.id, b.title, b.operationalOwnerId);
  }
  for (const pr of program.projects || []) add('project-manager', 'project', pr.id, pr.name, pr.managerId);
  return rows;
}

// ---- Program health (PRG-13): components always shown beside the indicator ----------
export function programHealth(program, ws) {
  const w = ws?.settings?.healthWeights || { delivery: 0.25, benefits: 0.3, assumptions: 0.15, risk: 0.15, readiness: 0.15 };
  const comps = {};
  const projects = (program.projects || []).filter((p) => p.state !== 'cancelled');
  if (projects.length) {
    const rag = { green: 100, amber: 60, red: 20 };
    comps.delivery = sum(projects, (p) => rag[p.status] ?? 60) / projects.length;
  }
  const realised = (program.benefits || []).map((b) => realisation(program, b, ws)).filter((r) => r.status !== 'no-data');
  if (realised.length) comps.benefits = (100 * sum(realised, (r) => (r.status === 'on-track' ? 1 : r.status === 'at-risk' ? 0.6 : 0.15))) / realised.length;
  const asm = chainOf(program).elements.filter((e) => e.kind === 'assumption');
  if (asm.length) comps.assumptions = (100 * sum(asm, (a) => ({ holding: 1, 'at-risk': 0.5, invalid: 0 }[a.assumption?.status || 'holding']))) / asm.length;
  const r = riskScore(program, ws).overall;
  if (r !== null) comps.risk = 100 - r;
  const st = program.stakeholders || [];
  if (st.length) {
    const POS = { opposed: 0, neutral: 1, proponent: 2 };
    comps.readiness = (100 * sum(st, (s) => Math.min(1, (POS[s.current] ?? 1) / Math.max(1, POS[s.desired] ?? 2)))) / st.length;
  }
  const keys = Object.keys(comps);
  const W = sum(keys, (k) => w[k] ?? 0);
  const score = keys.length && W ? sum(keys, (k) => (w[k] ?? 0) * comps[k]) / W : null;
  return { score, comps };
}

export const healthTone = (s) => (s === null || s === undefined ? 'none' : s >= 70 ? 'good' : s >= 50 ? 'warning' : 'critical');

// ---- Benefits roll-up for portfolio reporting (RPT-03, 7.2.4) ------------------------
export function benefitStatusCounts(program, ws) {
  const out = { 'on-track': 0, 'at-risk': 0, 'off-track': 0, 'no-data': 0 };
  for (const b of program.benefits || []) out[realisation(program, b, ws).status]++;
  return out;
}

export function financialBenefitIds(program) { return (program.benefits || []).filter(isFinancial).map((b) => b.id); }
