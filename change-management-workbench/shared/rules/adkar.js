// ADKAR scoring rules: RUL-01 (individual barrier point), RUL-02 (group barrier point) and
// RUL-03 (anonymity threshold); ADK-005, ADK-008, ADK-009, ADK-010.
import { ADKAR_IDS } from '../refdata.js';
import { mean, median, round, sortBy } from '../util.js';

export const NO_BARRIER = 'none';

// RUL-01: the first element, in ADKAR order, with a score at or below the threshold.
export function barrierPoint(scores, threshold = 3) {
  if (!scores) return null;
  let any = false;
  for (const el of ADKAR_IDS) {
    const raw = scores[el];
    const v = typeof raw === 'object' && raw !== null ? raw.score : raw;
    if (v == null || v === '') continue;
    any = true;
    if (Number(v) <= threshold) return el;
  }
  return any ? NO_BARRIER : null;
}

export function scoreOf(scores, el) {
  const raw = scores?.[el];
  const v = typeof raw === 'object' && raw !== null ? raw.score : raw;
  return v == null || v === '' ? null : Number(v);
}

// RUL-02 and RUL-03: aggregates individual scores for a segment.
// `responses` is a list of { awareness: n, desire: n, ... } objects.
export function aggregate(responses, { threshold = 3, method = 'mean', proportion = 0.3, minSegment = 5, anonymous = true } = {}) {
  const n = responses.length;
  const elements = {};
  for (const el of ADKAR_IDS) {
    const xs = responses.map((r) => scoreOf(r, el)).filter((v) => v != null);
    const distribution = [1, 2, 3, 4, 5].map((s) => xs.filter((x) => Math.round(x) === s).length);
    const atOrBelow = xs.filter((x) => x <= threshold).length;
    elements[el] = {
      score: xs.length ? round(method === 'median' ? median(xs) : mean(xs), 2) : null,
      n: xs.length,
      distribution,
      pctAtOrBelow: xs.length ? round(atOrBelow / xs.length, 3) : null,
    };
  }
  let bp = null;
  if (n) {
    bp = NO_BARRIER;
    for (const el of ADKAR_IDS) {
      const e = elements[el];
      if (e.score == null) continue;
      if (e.score <= threshold || (e.pctAtOrBelow != null && e.pctAtOrBelow >= proportion)) { bp = el; break; }
    }
  }
  return { n, elements, barrierPoint: bp, suppressed: anonymous && n < minSegment };
}

// Plain { element: score } map from an aggregate or assessment record.
export function flatScores(scores) {
  const out = {};
  for (const el of ADKAR_IDS) out[el] = scoreOf(scores, el);
  return out;
}

const ROUND_ORDER = { baseline: 0, preGoLive: 1, postGoLive: 2, sustainment: 3, adHoc: 4 };

// Results for one impacted group over time (ADK-010 trend), combining group-level assessments
// (practitioner, manager, inferred or aggregated survey results) and aggregated individual assessments.
export function groupResults(groupId, { assessments = [], memberIds = new Set(), settings = {} } = {}) {
  const cfg = settings.adkar || {};
  const threshold = cfg.threshold ?? 3;
  const out = [];
  for (const a of assessments) {
    if (a.kind !== 'adkar' || a.subjectType !== 'group' || a.subjectId !== groupId) continue;
    const scores = flatScores(a.scores);
    const anonymous = a.method === 'self';
    const suppressed = anonymous && (a.respondents ?? 0) < (cfg.minSegment ?? 5);
    let bp = barrierPoint(scores, threshold);
    // Results aggregated from individual responses also apply the proportion rule (RUL-02)
    // using the stored score distribution (counts of 1s, 2s … 5s per element).
    if (a.distribution && bp != null) {
      bp = NO_BARRIER;
      for (const el of ADKAR_IDS) {
        if (scores[el] == null) continue;
        const d = a.distribution[el] || [];
        const total = d.reduce((x, y) => x + y, 0);
        const low = d.slice(0, Math.floor(threshold)).reduce((x, y) => x + y, 0);
        if (scores[el] <= threshold || (total && low / total >= (cfg.groupProportion ?? 0.3))) { bp = el; break; }
      }
    }
    out.push({ id: a.id, date: a.date, round: a.round || 'adHoc', method: a.method, n: a.respondents ?? null, scores, barrierPoint: bp, suppressed, confirmed: !!a.confirmed, source: 'group' });
  }
  // Aggregate individual assessments of group members by round.
  const indiv = assessments.filter((a) => a.kind === 'adkar' && a.subjectType === 'stakeholder' && memberIds.has(a.subjectId));
  const byRound = {};
  for (const a of indiv) (byRound[a.round || 'adHoc'] ||= []).push(a);
  for (const [rnd, list] of Object.entries(byRound)) {
    if (out.some((r) => r.round === rnd && r.source === 'group')) continue;
    // Use each person's latest assessment in the round.
    const latest = {};
    for (const a of sortBy(list, 'date')) latest[a.subjectId] = a;
    const ag = aggregate(Object.values(latest).map((a) => flatScores(a.scores)), { threshold, method: cfg.groupMethod, proportion: cfg.groupProportion, anonymous: false });
    out.push({ id: `agg-${groupId}-${rnd}`, date: sortBy(list, '-date')[0]?.date, round: rnd, method: 'aggregated', n: ag.n, scores: Object.fromEntries(ADKAR_IDS.map((el) => [el, ag.elements[el].score])), barrierPoint: ag.barrierPoint, suppressed: false, confirmed: list.every((a) => a.confirmed), source: 'individuals' });
  }
  return sortBy(out, 'date', (r) => ROUND_ORDER[r.round] ?? 9);
}

// The current (latest visible) result for a group.
export function currentResult(results) {
  const visible = results.filter((r) => !r.suppressed);
  return visible[visible.length - 1] || null;
}

export function previousResult(results) {
  const visible = results.filter((r) => !r.suppressed);
  return visible.length > 1 ? visible[visible.length - 2] : null;
}

// Individual assessment history for a stakeholder.
export function stakeholderResults(stakeholderId, assessments, settings = {}) {
  const threshold = settings.adkar?.threshold ?? 3;
  return sortBy(assessments.filter((a) => a.kind === 'adkar' && a.subjectType === 'stakeholder' && a.subjectId === stakeholderId), 'date')
    .map((a) => ({ id: a.id, date: a.date, round: a.round, method: a.method, scores: flatScores(a.scores), barrierPoint: barrierPoint(flatScores(a.scores), threshold), confirmed: !!a.confirmed }));
}

// Converts a mean ADKAR score (1–5) into a 0–100 index.
export const adkarIndex = (score) => (score == null ? null : round(((score - 1) / 4) * 100));
