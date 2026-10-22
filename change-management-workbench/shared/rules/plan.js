// Plan rules: RUL-15 (coverage warnings, PLN-005) and progress (PLN-009).
import { ADKAR, adkarLabel } from '../refdata.js';
import { asArray, groupBy, mean, round } from '../util.js';
import { NO_BARRIER } from './adkar.js';

const OPEN = new Set(['notStarted', 'inProgress', 'onHold']);
const possessive = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
const live = (a) => a.status !== 'cancelled';

// Activities with no target groups apply to the whole organisation.
export const targetsGroup = (a, groupId) => !asArray(a.groupIds).length || asArray(a.groupIds).includes(groupId);

export function coverageWarnings(model) {
  const { groups, activities, profiles, initiative } = model;
  const acts = activities.filter(live);
  const out = [];
  const selected = new Set(asArray(initiative?.selectedPlans));
  for (const g of groups) {
    const gActs = acts.filter((a) => targetsGroup(a, g.id));
    // (a) no activity addressing an ADKAR element
    for (const el of ADKAR) {
      if (!gActs.some((a) => asArray(a.adkar).includes(el.id))) {
        out.push({ id: `noElement:${g.id}:${el.id}`, kind: 'noElement', severity: 'medium', groupId: g.id, element: el.id, message: `${g.name} has no plan activity addressing ${el.label}.` });
      }
    }
    // (b) high-impact group without People Manager Plan activities
    if (g.high && (!selected.size || selected.has('peopleManager')) && !gActs.some((a) => asArray(a.plans).includes('peopleManager'))) {
      out.push({ id: `noManager:${g.id}`, kind: 'noManagerActivity', severity: 'high', groupId: g.id, message: `${g.name} is high impact (${g.overall}/5) but has no People Manager Plan activities.` });
    }
    // (c) current barrier point not addressed by an open activity (AC-11)
    const bp = g.barrierPoint;
    if (bp && bp !== NO_BARRIER && !gActs.some((a) => OPEN.has(a.status) && asArray(a.adkar).includes(bp))) {
      out.push({ id: `barrier:${g.id}:${bp}`, kind: 'barrierUnaddressed', severity: 'high', groupId: g.id, element: bp, message: `${possessive(g.name)} barrier point is ${adkarLabel(bp)}, but no open activity for the group addresses ${adkarLabel(bp)}.` });
    }
  }
  // (d) priority stakeholder with no planned engagement
  for (const p of profiles) {
    if (!p.isPriority) continue;
    if (!p.nextPlanned) {
      out.push({ id: `noEngagement:${p.id}`, kind: 'noPlannedEngagement', severity: 'high', profileId: p.id, stakeholderId: p.stakeholderId, message: `Priority stakeholder ${p.name} has no planned engagement.` });
    }
  }
  const acks = initiative?.coverageAcks || {};
  return out.map((w) => ({ ...w, ack: acks[w.id] || null }));
}

// PLN-009: progress by plan, ADKAR element and impacted group (planned versus completed).
export function progress(activities, groups, planTypes) {
  const acts = activities.filter(live);
  const summarise = (list) => ({
    total: list.length,
    complete: list.filter((a) => a.status === 'complete').length,
    inProgress: list.filter((a) => a.status === 'inProgress').length,
    overdue: list.filter((a) => a.overdue).length,
    pct: list.length ? round(mean(list.map((a) => (a.status === 'complete' ? 100 : Number(a.percentComplete) || 0)))) : null,
  });
  const byPlan = planTypes.map((p) => ({ plan: p, ...summarise(acts.filter((a) => asArray(a.plans).includes(p.id))) })).filter((x) => x.total);
  const byElement = ADKAR.map((el) => ({ element: el, ...summarise(acts.filter((a) => asArray(a.adkar).includes(el.id))) }));
  const byGroup = groups.map((g) => ({ group: g, ...summarise(acts.filter((a) => targetsGroup(a, g.id))) }));
  const byOwner = Object.entries(groupBy(acts, (a) => a.ownerId || 'unassigned')).map(([ownerId, list]) => ({ ownerId, ...summarise(list) }));
  return { overall: summarise(acts), byPlan, byElement, byGroup, byOwner };
}

// PLN-006: compare the current plan with a baseline.
export function compareBaseline(current, baselineActivities = []) {
  const base = Object.fromEntries(baselineActivities.map((a) => [a.id, a]));
  const cur = Object.fromEntries(current.map((a) => [a.id, a]));
  const fields = ['title', 'startDate', 'endDate', 'ownerId', 'status', 'plans', 'adkar', 'groupIds'];
  const added = current.filter((a) => !base[a.id]);
  const removed = baselineActivities.filter((a) => !cur[a.id]);
  const changed = [];
  for (const a of current) {
    const b = base[a.id];
    if (!b) continue;
    const diffs = fields.filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)).map((k) => ({ field: k, from: b[k] ?? null, to: a[k] ?? null }));
    if (diffs.length) changed.push({ activity: a, diffs, slipDays: a.endDate && b.endDate ? Math.round((new Date(a.endDate) - new Date(b.endDate)) / 86400000) : null });
  }
  return { added, removed, changed };
}
