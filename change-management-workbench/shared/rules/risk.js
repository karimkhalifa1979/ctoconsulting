// Risk, PCT and sponsorship rules: RUL-13 (risk profile), RUL-14 (planning approach); RSK-003 to RSK-005, RSK-008.
import { QUESTION_SETS, FOCUS_RULES, APPROACH_BY_RISK, PLANNING_APPROACHES } from '../refdata.js';
import { mean, round, sortBy } from '../util.js';

const itemScore = (scores, id) => {
  const raw = scores?.[id];
  const v = typeof raw === 'object' && raw !== null ? raw.score : raw;
  return v == null || v === '' ? null : Number(v);
};

// Normalises a 1–5 rated question set to 0–100 (RUL-13). Returns null when nothing is rated.
export function setScore(assessment, set = QUESTION_SETS[assessment?.kind]) {
  if (!assessment || !set) return null;
  const m = mean(set.items.map((q) => itemScore(assessment.scores, q.id)));
  return m == null ? null : round(((m - 1) / 4) * 100);
}

// RUL-13: both below 40 → low; both 60 or above → high; otherwise medium.
export function riskProfile(ccScore, oaScore, { lowBelow = 40, highFrom = 60 } = {}) {
  if (ccScore == null || oaScore == null) return null;
  if (ccScore < lowBelow && oaScore < lowBelow) return 'low';
  if (ccScore >= highFrom && oaScore >= highFrom) return 'high';
  return 'medium';
}

export function latestOf(assessments, kind, subjectType = 'initiative') {
  return sortBy(assessments.filter((a) => a.kind === kind && (a.subjectType || 'initiative') === subjectType), 'date', 'createdAt').slice(-1)[0] || null;
}

export function riskSummary(assessments, settings = {}) {
  const cc = latestOf(assessments, 'changeCharacteristics');
  const oa = latestOf(assessments, 'orgAttributes');
  const ccScore = setScore(cc), oaScore = setScore(oa);
  return { cc, oa, ccScore, oaScore, profile: riskProfile(ccScore, oaScore, settings.risk) };
}

// RSK-004: PCT scores per aspect (0–100) and overall.
export function pctScores(assessment) {
  if (!assessment) return null;
  const set = QUESTION_SETS.pct;
  const aspects = {};
  for (const a of set.aspects) {
    const m = mean(set.items.filter((q) => q.aspect === a.id).map((q) => itemScore(assessment.scores, q.id)));
    aspects[a.id] = m == null ? null : round(((m - 1) / 4) * 100);
  }
  const overall = mean(Object.values(aspects));
  return { aspects, overall: overall == null ? null : round(overall), date: assessment.date, id: assessment.id, round: assessment.round };
}

export function pctTrend(assessments) {
  return sortBy(assessments.filter((a) => a.kind === 'pct'), 'date').map(pctScores);
}

// RSK-005: suggested focus areas from low-scoring items, for practitioner review and acceptance.
export function focusSuggestions(assessments, rules = FOCUS_RULES) {
  const out = [];
  const pct = pctScores(latestOf(assessments, 'pct'));
  for (const r of rules) {
    if (r.set === 'pct' && r.aspect) {
      const v = pct?.aspects?.[r.aspect];
      if (v != null && v <= r.when) out.push({ ...r, id: `${r.set}:${r.aspect}`, evidence: `${r.aspect} scored ${v}/100` });
      continue;
    }
    const a = latestOf(assessments, r.set);
    const v = a ? itemScore(a.scores, r.item) : null;
    if (v == null) continue;
    const set = QUESTION_SETS[r.set];
    const fires = set.higherIsRisk ? v >= r.when : v <= r.when;
    if (fires) out.push({ ...r, id: `${r.set}:${r.item}`, evidence: `${set.items.find((q) => q.id === r.item)?.text} scored ${v}/5` });
  }
  return out;
}

// RUL-14: recommended planning approach by risk profile.
export function recommendedApproach(profile) {
  const id = APPROACH_BY_RISK[profile] || null;
  return id ? PLANNING_APPROACHES.find((p) => p.id === id) : null;
}

// RSK-008: organisation risk matrix (likelihood × consequence → rating). Configurable.
export const DEFAULT_RISK_MATRIX = [
  // consequence 1..5 →
  ['low', 'low', 'low', 'medium', 'medium'], // likelihood 1
  ['low', 'low', 'medium', 'medium', 'high'], // 2
  ['low', 'medium', 'medium', 'high', 'high'], // 3
  ['medium', 'medium', 'high', 'high', 'extreme'], // 4
  ['medium', 'high', 'high', 'extreme', 'extreme'], // 5
];

export function riskRating(likelihood, consequence, matrix = DEFAULT_RISK_MATRIX) {
  const l = Number(likelihood), c = Number(consequence);
  if (!l || !c) return null;
  return matrix[l - 1]?.[c - 1] ?? null;
}

export const RATING_ORDER = { extreme: 4, high: 3, medium: 2, low: 1 };

// RSK-007: sponsor assessment score (0–100; higher is stronger sponsorship).
export function sponsorScore(assessment) {
  return setScore(assessment, QUESTION_SETS.sponsor);
}
