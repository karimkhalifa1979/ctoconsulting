// Risk rating on the configurable likelihood × consequence matrix (RSK-002).
import { RISK_MATRIX, RISK_LEVEL_ORDER } from './defaults.js';

export function riskLevel(likelihood, consequence, matrix = RISK_MATRIX) {
  const l = Number(likelihood), c = Number(consequence);
  if (!(l >= 1 && l <= 5 && c >= 1 && c <= 5)) return null;
  return matrix.grid[l - 1][c - 1];
}

export const levelRank = (level) => RISK_LEVEL_ORDER[level] || 0;

// Inherent and residual ratings; residual falls back to inherent until a treatment is assessed.
export function rateRisk(r, matrix = RISK_MATRIX) {
  const inherent = riskLevel(r.likelihood, r.consequence, matrix);
  const rl = r.residual_likelihood || r.likelihood;
  const rc = r.residual_consequence || r.consequence;
  const residual = riskLevel(rl, rc, matrix);
  return {
    inherent_level: inherent,
    inherent_score: (Number(r.likelihood) || 0) * (Number(r.consequence) || 0),
    residual_level: residual,
    residual_score: (Number(rl) || 0) * (Number(rc) || 0),
  };
}

// The rating used for sorting and reporting ("rating desc") is the current (residual) rating.
export const currentLevel = (r) => r.residual_level || r.inherent_level || null;
export const currentScore = (r) => r.residual_score || r.inherent_score || 0;

// Expected value of a quantified risk (RSK-004): probability-weighted most-likely impact,
// with the likelihood band midpoint as the probability.
const PROBABILITY = { 1: 0.03, 2: 0.15, 3: 0.375, 4: 0.65, 5: 0.9 };
export function expectedValue(r) {
  const p = PROBABILITY[Number(r.residual_likelihood || r.likelihood)] || 0;
  const pert = (min, ml, max) => (Number(min || ml || 0) + 4 * Number(ml || 0) + Number(max || ml || 0)) / 6;
  const cost = r.cost_ml != null ? pert(r.cost_min, r.cost_ml, r.cost_max) : null;
  const days = r.schedule_ml != null ? pert(r.schedule_min, r.schedule_ml, r.schedule_max) : null;
  return { probability: p, cost: cost == null ? null : Math.round(cost * p), days: days == null ? null : Math.round(days * p * 10) / 10 };
}

export const THREAT_RESPONSES = ['Avoid', 'Reduce', 'Transfer', 'Share', 'Accept', 'Prepare contingent plans'];
export const OPPORTUNITY_RESPONSES = ['Exploit', 'Enhance', 'Share', 'Reject'];
