// Success measures and adoption tracking: INI-004, MEA-003, MEA-006, SUS-001.
import { sortBy, round } from '../util.js';

export function measureStatus(m, latest) {
  if (latest == null || m.target == null || m.target === '') return { status: 'noData' };
  const higher = (m.direction || 'higher') === 'higher';
  const target = Number(m.target), v = Number(latest);
  const meets = higher ? v >= target : v <= target;
  const threshold = m.threshold != null && m.threshold !== '' ? Number(m.threshold) : null;
  const belowThreshold = threshold != null && (higher ? v < threshold : v > threshold);
  const baseline = m.baseline != null && m.baseline !== '' ? Number(m.baseline) : null;
  const progress = baseline != null && target !== baseline ? round(((v - baseline) / (target - baseline)) * 100) : null;
  return { status: meets ? 'onTrack' : belowThreshold ? 'offTrack' : 'atRisk', belowThreshold, gap: round(target - v, 2), progress };
}

export function enrichMeasure(m, values) {
  const vals = sortBy(values.filter((v) => v.measureId === m.id), 'date');
  const overall = vals.filter((v) => !v.groupId);
  const series = overall.length ? overall : vals;
  const latest = series.length ? series[series.length - 1] : null;
  const byGroup = {};
  for (const v of vals.filter((x) => x.groupId)) (byGroup[v.groupId] ||= []).push(v);
  const groupLatest = Object.fromEntries(Object.entries(byGroup).map(([g, list]) => [g, list[list.length - 1]]));
  return { ...m, values: vals, series, latest: latest?.value ?? null, latestDate: latest?.date ?? null, groupLatest, ...measureStatus(m, latest?.value ?? null) };
}

export const MEASURE_STATUS_LABELS = { onTrack: 'On track', atRisk: 'At risk', offTrack: 'Off track', noData: 'No data' };
