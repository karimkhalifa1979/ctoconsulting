// Readiness rules: MEA-005 (readiness index) and RSK-006 (go/no-go recommendation).
import { adkarIndex } from './adkar.js';
import { mean, round } from '../util.js';

// Weighted readiness index (0–100) from whichever components are available.
export function readinessIndex({ adkarMean, trainingPct, criteriaPct, sentimentMean }, weights = {}) {
  const w = { adkar: 40, training: 25, criteria: 20, sentiment: 15, ...weights };
  const parts = {
    adkar: adkarMean != null ? adkarIndex(adkarMean) : null,
    training: trainingPct,
    criteria: criteriaPct,
    sentiment: sentimentMean != null ? round(((sentimentMean + 2) / 4) * 100) : null,
  };
  let num = 0, den = 0;
  for (const [k, v] of Object.entries(parts)) {
    if (v == null) continue;
    num += v * w[k];
    den += w[k];
  }
  return { index: den ? round(num / den) : null, components: parts };
}

export function checklistScore(checklist) {
  const items = (checklist?.items || []).filter((i) => i.status && i.status !== 'notApplicable');
  if (!items.length) return null;
  const val = { met: 1, partlyMet: 0.5, notMet: 0 };
  return round((items.reduce((a, i) => a + (val[i.status] ?? 0), 0) / items.length) * 100);
}

// RSK-006: recommendation from criteria and the readiness of each impacted group.
export function recommendation(checklist, groups = [], threshold = 70) {
  const items = (checklist?.items || []).filter((i) => i.status !== 'notApplicable');
  if (!items.length) return { decision: null, reasons: ['No criteria assessed'] };
  const notMet = items.filter((i) => i.status === 'notMet' || !i.status);
  const partly = items.filter((i) => i.status === 'partlyMet');
  const lowGroups = groups.filter((g) => g.readiness?.index != null && g.readiness.index < threshold);
  const reasons = [
    ...notMet.map((i) => `Not met: ${i.criterion}`),
    ...partly.map((i) => `Partly met: ${i.criterion}`),
    ...lowGroups.map((g) => `${g.name} readiness index ${g.readiness.index} is below ${threshold}`),
  ];
  if (!notMet.length && !partly.length && !lowGroups.length) return { decision: 'go', reasons: ['All criteria met and every group is at or above the readiness threshold'] };
  if (notMet.length <= Math.max(1, Math.floor(items.length * 0.15)) && lowGroups.length <= 1) return { decision: 'goWithConditions', reasons };
  return { decision: 'noGo', reasons };
}

export const meanOrNull = (xs) => {
  const m = mean(xs);
  return m == null ? null : round(m, 2);
};
