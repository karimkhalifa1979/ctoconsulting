// Stakeholder analysis rules: RUL-04 (quadrant), RUL-05 (engagement gap), RUL-06 (cadence),
// RUL-12 (resistance escalation); STK-011 to STK-019, STK-038.
import { DEFAULT_LISTS } from '../refdata.js';
import { clamp, round } from '../util.js';
import { diffDays } from '../dates.js';

export const QUADRANT_LABELS = { manageClosely: 'Manage closely', keepSatisfied: 'Keep satisfied', keepInformed: 'Keep informed', monitor: 'Monitor' };

// RUL-04.
export function quadrant(influence, interest) {
  if (!influence || !interest) return null;
  if (influence === 'high' && interest === 'high') return 'manageClosely';
  if (influence === 'high') return 'keepSatisfied';
  if (interest === 'high') return 'keepInformed';
  if (influence === 'medium' && interest === 'medium') return 'keepInformed';
  return 'monitor';
}

const LEVELS = DEFAULT_LISTS.engagementLevel.map((l) => l.id); // unaware … leading

export function levelIndex(level, levels = LEVELS) {
  const i = levels.indexOf(level);
  return i < 0 ? null : i;
}

// RUL-05: the gap is the number of levels between current and desired engagement.
export function engagementGap(current, desired, levels = LEVELS) {
  const c = levelIndex(current, levels), d = levelIndex(desired, levels);
  if (c == null || d == null) return { gap: null, priority: current === 'resistant' };
  const gap = d - c;
  return { gap, priority: gap >= 2 || current === 'resistant' };
}

// RUL-06: maximum interval between completed engagements, by quadrant.
export function requiredCadence(q, settings = {}, override) {
  if (override) return Number(override);
  const days = settings.cadenceDays || { manageClosely: 14, keepSatisfied: 30, keepInformed: 30, monitor: 90 };
  return q ? days[q] ?? null : null;
}

export function cadenceStatus(lastEngaged, cadence, today) {
  if (!cadence) return { overdue: false, daysSince: lastEngaged ? diffDays(lastEngaged, today) : null };
  if (!lastEngaged) return { overdue: true, daysSince: null, neverEngaged: true };
  const daysSince = diffDays(lastEngaged, today);
  return { overdue: daysSince > cadence, daysSince, dueIn: cadence - daysSince };
}

const ROLE_WEIGHT = {
  primarySponsor: 1, coalitionMember: 0.9, steeringCommittee: 0.8, businessOwner: 0.8, peopleManager: 0.7, influencer: 0.7,
  employeeRep: 0.7, regulator: 0.7, changeAgent: 0.5, sme: 0.5, impactedEmployee: 0.4, vendor: 0.3, externalParty: 0.3,
};
const BARRIER_WEIGHT = { awareness: 1, desire: 0.8, knowledge: 0.6, ability: 0.4, reinforcement: 0.2, none: 0 };
const LEVEL_WEIGHT = { low: 1 / 3, medium: 2 / 3, high: 1 };

// STK-015: weighted priority score (0–100) from influence, impact, engagement gap, barrier point and role.
export function priorityScore({ influence, impact, gap, barrier, roles = [] }, weights = {}) {
  const w = { influence: 30, impact: 25, gap: 20, barrier: 15, role: 10, ...weights };
  const total = w.influence + w.impact + w.gap + w.barrier + w.role || 1;
  const parts = {
    influence: LEVEL_WEIGHT[influence] ?? 0,
    impact: impact != null ? clamp(impact / 5, 0, 1) : 0,
    gap: gap != null ? clamp(gap / 4, 0, 1) : 0,
    barrier: barrier ? BARRIER_WEIGHT[barrier] ?? 0 : 0,
    role: Math.max(0, ...roles.map((r) => ROLE_WEIGHT[r] ?? 0.3)),
  };
  return round(((parts.influence * w.influence + parts.impact * w.impact + parts.gap * w.gap + parts.barrier * w.barrier + parts.role * w.role) / total) * 100);
}

const SENTIMENT_VALUE = { veryPositive: 2, positive: 1, neutral: 0, negative: -1, veryNegative: -2 };
export const sentimentValue = (s) => SENTIMENT_VALUE[s] ?? null;
export const isNegative = (s) => s === 'negative' || s === 'veryNegative';

// STK-038: sentiment series (oldest first) → trend.
export function sentimentTrend(series) {
  const pts = series.filter((p) => p.value != null);
  if (!pts.length) return { latest: null, direction: null, points: [] };
  const latest = pts[pts.length - 1];
  if (pts.length < 2) return { latest, direction: 'stable', points: pts };
  const recent = pts.slice(-3);
  const earlier = pts.slice(-6, -3);
  const avg = (xs) => xs.reduce((a, b) => a + b.value, 0) / xs.length;
  const base = earlier.length ? avg(earlier) : pts[pts.length - 2].value;
  const now = earlier.length ? avg(recent) : latest.value;
  const delta = now - base;
  return { latest, delta: round(delta, 2), direction: delta <= -0.5 ? 'deteriorating' : delta >= 0.5 ? 'improving' : 'stable', points: pts };
}

// RUL-12: high-influence stakeholder who is resistant, or negative in two consecutive engagements.
export function resistanceEscalation({ influence, currentEngagement, sentiments = [] }) {
  if (influence !== 'high') return null;
  if (currentEngagement === 'resistant') return 'Current engagement level is resistant';
  const last2 = sentiments.slice(-2);
  if (last2.length === 2 && last2.every((s) => isNegative(s.sentiment))) return 'Negative sentiment in two consecutive engagements';
  return null;
}

// Salience (STK-016): definitive, dominant, dependent, dangerous, etc.
export function salienceClass(s) {
  if (!s) return null;
  const on = (k) => s[k] === 'high' || s[k] === true;
  const p = on('power'), l = on('legitimacy'), u = on('urgency');
  if (p && l && u) return 'Definitive';
  if (p && l) return 'Dominant';
  if (p && u) return 'Dangerous';
  if (l && u) return 'Dependent';
  if (p) return 'Dormant';
  if (l) return 'Discretionary';
  if (u) return 'Demanding';
  return 'Non-stakeholder';
}

// STK-046: potential duplicates by email, or by name and organisation.
export function duplicateKey(s) {
  return {
    email: String(s.email || '').trim().toLowerCase() || null,
    name: `${String(s.givenName || '').trim().toLowerCase()}|${String(s.familyName || '').trim().toLowerCase()}|${String(s.organisation || '').trim().toLowerCase()}`,
  };
}

export function findDuplicates(candidate, existing) {
  const k = duplicateKey(candidate);
  return existing.filter((s) => s.id !== candidate.id && !s.mergedInto && (() => {
    const e = duplicateKey(s);
    return (k.email && e.email === k.email) || (k.name !== '||' && e.name === k.name);
  })()).map((s) => {
    const e = duplicateKey(s);
    return { record: s, reason: k.email && e.email === k.email ? 'Same email address' : 'Same name and organisation' };
  });
}
