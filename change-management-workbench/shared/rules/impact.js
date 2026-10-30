// Impact rules: RUL-20 (impact roll-up), IMP-004, IMP-008, IMP-009.
import { DEFAULT_LISTS } from '../refdata.js';
import { mean, round } from '../util.js';

export const ASPECTS = DEFAULT_LISTS.impactAspect;

// Per-aspect degree for a group: group-level entries win; role- and process-level entries roll up (max).
export function aspectDegrees(impacts) {
  const out = {};
  const groupLevel = {};
  for (const i of impacts) {
    const d = Number(i.degree);
    if (Number.isNaN(d)) continue;
    if (!i.level || i.level === 'group') groupLevel[i.aspect] = Math.max(groupLevel[i.aspect] ?? 0, d);
    else out[i.aspect] = Math.max(out[i.aspect] ?? 0, d);
  }
  return { ...out, ...groupLevel };
}

// RUL-20: overall impact = highest aspect score (or weighted average); 4 or more is high impact.
export function overallImpact(impacts, { rollup = 'highest', highImpact = 4, aspectWeights = {} } = {}) {
  const degrees = aspectDegrees(impacts);
  const vals = Object.entries(degrees);
  if (!vals.length) return { overall: null, high: false, degrees };
  let overall;
  if (rollup === 'weightedAverage') {
    let num = 0, den = 0;
    for (const [aspect, d] of vals) {
      const w = Number(aspectWeights[aspect] ?? 1);
      num += d * w;
      den += w;
    }
    overall = den ? round(num / den, 1) : null;
  } else {
    overall = Math.max(...vals.map(([, d]) => d));
  }
  return { overall, high: overall != null && overall >= highImpact, degrees };
}

// IMP-008: heatmap rows (groups) by aspect.
export function heatmap(groups, impactsByGroup, settings) {
  return groups.map((g) => {
    const r = overallImpact(impactsByGroup[g.id] || [], settings?.impact);
    return { group: g, degrees: r.degrees, overall: r.overall, high: r.high };
  });
}

// Date range during which an impact is felt (from its milestone or explicit dates).
export function impactWindow(i, milestonesById = {}) {
  const ms = i.milestoneId ? milestonesById[i.milestoneId] : null;
  const from = i.feltFrom || ms?.date || null;
  let to = i.feltTo || null;
  if (!to && from) {
    const weeks = Number(i.transitionWeeks) || 6;
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + weeks * 7);
    to = d.toISOString().slice(0, 10);
  }
  return { from, to };
}

// IMP-008: impact timeline (groups by period), highlighting concurrent impacts.
export function timeline(groups, impactsByGroup, milestonesById, periods) {
  return groups.map((g) => {
    const cells = periods.map((p) => {
      const active = (impactsByGroup[g.id] || []).filter((i) => {
        const w = impactWindow(i, milestonesById);
        return w.from && w.from <= p.end && (w.to || w.from) >= p.start;
      });
      return { period: p.key, count: active.length, max: active.length ? Math.max(...active.map((i) => Number(i.degree) || 0)) : 0, aspects: active.map((i) => i.aspect), concurrent: active.length > 1 };
    });
    return { group: g, cells };
  });
}

export const averageDegree = (impacts) => round(mean(impacts.map((i) => i.degree)), 1);
