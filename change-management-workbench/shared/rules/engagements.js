// Engagement lifecycle and planning rules: Section 7.9, RUL-07 to RUL-11; STK-022 to STK-027, STK-036, STK-037.
import { addDays, addMonths, makeCalendar, diffDays } from '../dates.js';
import { asArray, uniq, sortBy } from '../util.js';

// Figure 2: allowed status transitions.
export const TRANSITIONS = {
  planned: ['scheduled', 'completed', 'cancelled'],
  scheduled: ['completed', 'rescheduled', 'cancelled', 'didNotProceed'],
  rescheduled: ['scheduled', 'cancelled'],
  completed: ['locked'],
  locked: [],
  cancelled: [],
  didNotProceed: [],
};

export const OPEN_STATUSES = ['planned', 'scheduled', 'rescheduled'];
export const DONE_STATUSES = ['completed', 'locked'];
export const isOpen = (e) => OPEN_STATUSES.includes(e.status);
export const isDone = (e) => DONE_STATUSES.includes(e.status);

export function canTransition(from, to) {
  if (from === to) return true;
  return (TRANSITIONS[from] || []).includes(to);
}

// RUL-09: reasons are mandatory for cancellation, rescheduling and did-not-proceed.
export function transitionRequirements(to) {
  return {
    reason: ['cancelled', 'rescheduled', 'didNotProceed'].includes(to),
    newDate: to === 'rescheduled',
    completion: to === 'completed',
  };
}

// RUL-08: completion requires actual date, type, at least one stakeholder or group, a summary and an outcome.
export function completionGaps(e) {
  const gaps = [];
  if (!e.actualDate) gaps.push('Actual date');
  if (!e.engagementType) gaps.push('Engagement type');
  if (!asArray(e.stakeholderIds).length && !asArray(e.groupIds).length) gaps.push('At least one stakeholder or group');
  const summary = String(e.summary || '').replace(/<[^>]+>/g, '').trim();
  if (!summary) gaps.push('Discussion summary');
  if (!e.outcome) gaps.push('Outcome rating');
  return gaps;
}

// The date that drives locking: when the engagement was completed.
export function completionDate(e) {
  const hist = asArray(e.statusHistory).filter((h) => h.to === 'completed');
  const last = hist[hist.length - 1];
  return last?.at ? String(last.at).slice(0, 10) : e.actualDate;
}

// RUL-10: completed records lock after N business days.
export function lockDue(e, today, { lockBusinessDays = 10, holidays = [] } = {}) {
  if (e.status !== 'completed') return false;
  const from = completionDate(e);
  if (!from) return false;
  return makeCalendar(holidays).businessDaysBetween(from, today) >= lockBusinessDays;
}

// --- Scheduling (STK-022, STK-023) ------------------------------------------------------------------

// Resolves the anchor date for a plan item's first occurrence.
export function anchorDate(item, milestones = [], holidays = []) {
  if (item.timingMode === 'milestone') {
    const ms = milestones.find((m) => m.id === item.milestoneId);
    if (!ms?.date) return null;
    return makeCalendar(holidays).addBusinessDays(ms.date, Number(item.offsetBusinessDays) || 0);
  }
  if (item.timingMode === 'window') return item.windowStart || item.plannedDate || null;
  return item.plannedDate || null;
}

function stepDate(date, cadence) {
  switch (cadence) {
    case 'weekly': return addDays(date, 7);
    case 'fortnightly': return addDays(date, 14);
    case 'monthly': return addMonths(date, 1);
    case 'quarterly': return addMonths(date, 3);
    default: return null;
  }
}

// Expands a plan item into dated occurrences (index from 1). The `until` limit is the plan item's
// end date, its end milestone, or the initiative end date; occurrences are capped for safety.
export function expandOccurrences(item, { milestones = [], holidays = [], initiativeEnd = null, max = 120 } = {}) {
  const cal = makeCalendar(holidays);
  const first = anchorDate(item, milestones, holidays);
  if (!first) return [];
  const untilMs = item.untilMilestoneId ? milestones.find((m) => m.id === item.untilMilestoneId)?.date : null;
  const until = item.until || untilMs || initiativeEnd;
  if (item.cadence === 'milestoneTriggered') {
    const anchor = milestones.find((m) => m.id === item.milestoneId);
    if (!anchor) return [{ index: 1, date: first, time: item.plannedTime || null }];
    const same = sortBy(milestones.filter((m) => m.kind === anchor.kind && m.date), 'date');
    return same.map((m, i) => ({ index: i + 1, date: cal.addBusinessDays(m.date, Number(item.offsetBusinessDays) || 0), time: item.plannedTime || null, milestoneId: m.id }))
      .filter((o) => !until || o.date <= until);
  }
  const out = [{ index: 1, date: first, time: item.plannedTime || null }];
  if (!item.cadence || item.cadence === 'oneOff' || !until) return out;
  let d = first;
  for (let i = 2; i <= max; i++) {
    d = stepDate(d, item.cadence);
    if (!d || d > until) break;
    // Recurring occurrences that land on a non-business day move to the next business day.
    out.push({ index: i, date: cal.isBusinessDay(d) ? d : cal.addBusinessDays(d, 0), time: item.plannedTime || null });
  }
  return out;
}

// --- Audience resolution (STK-027) ---------------------------------------------------------------

export function groupMemberIds(groupId, { groups = [], memberships = [], stakeholders = [], today = null } = {}) {
  const seen = new Set();
  const out = new Set();
  const visit = (gid) => {
    if (seen.has(gid)) return;
    seen.add(gid);
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    if (g.membershipType === 'dynamic') {
      for (const s of stakeholders) if (matchesRules(s, g.rules)) out.add(s.id);
    } else {
      for (const m of memberships) {
        if (m.groupId !== gid) continue;
        if (today && ((m.from && m.from > today) || (m.to && m.to < today))) continue;
        out.add(m.stakeholderId);
      }
    }
    for (const child of groups.filter((x) => x.parentId === gid)) visit(child.id);
  };
  visit(groupId);
  return out;
}

export function matchesRules(s, rules) {
  const list = asArray(rules);
  if (!list.length) return false;
  return list.every((r) => {
    const v = String(s?.[r.field] ?? '').toLowerCase();
    const want = String(r.value ?? '').toLowerCase();
    switch (r.op) {
      case 'equals': return v === want;
      case 'notEquals': return v !== want;
      case 'startsWith': return v.startsWith(want);
      case 'in': return want.split(',').map((x) => x.trim()).includes(v);
      default: return v.includes(want);
    }
  });
}

export function resolveAudience({ stakeholderIds = [], groupIds = [] }, ctx) {
  const ids = new Set(asArray(stakeholderIds));
  for (const g of asArray(groupIds)) for (const id of groupMemberIds(g, ctx)) ids.add(id);
  const active = new Set((ctx.stakeholders || []).filter((s) => s.status !== 'left').map((s) => s.id));
  return [...ids].filter((id) => active.has(id));
}

// --- Load and blackout checks (RUL-07, STK-025) -------------------------------------------------------

export function blackoutFor(date, blackouts = []) {
  if (!date) return null;
  const md = date.slice(5);
  for (const b of blackouts) {
    if (b.annual) {
      const inRange = b.start <= b.end ? md >= b.start && md <= b.end : md >= b.start || md <= b.end;
      if (inRange) return b;
    } else if (b.start && b.end && date >= b.start && date <= b.end) return b;
  }
  return null;
}

// Counts how many dated items fall in the busiest 7-day window that contains `date`.
function maxInWindow(dates, date) {
  let best = 0;
  for (let start = addDays(date, -6); start <= date; start = addDays(start, 1)) {
    const end = addDays(start, 6);
    best = Math.max(best, dates.filter((d) => d >= start && d <= end).length);
  }
  return best;
}

const COMMS_TYPES = new Set(['email', 'intranet', 'newsletter', 'video', 'collabPost']);

// Proposed occurrences checked against existing engagements and communications.
// `existing` are engagement records; `comms` are communication activities with a date.
export function loadWarnings({ occurrences = [], audienceIds = [], groupIds = [], engagementType, excludePlanItemId }, { existing = [], comms = [], settings = {}, memberLookup = () => new Set() } = {}) {
  const warnings = [];
  const max = settings.load?.stakeholderMaxPer7Days ?? 3;
  const maxComms = settings.load?.groupMaxCommsPer7Days ?? 5;
  const live = existing.filter((e) => (!excludePlanItemId || e.planItemId !== excludePlanItemId) && !['cancelled', 'didNotProceed'].includes(e.status));
  const datesFor = (sid) => live.filter((e) => asArray(e.stakeholderIds).includes(sid) || asArray(e.groupIds).some((g) => memberLookup(g).has(sid))).map((e) => e.actualDate || e.plannedDate).filter(Boolean);
  const flagged = new Set();
  for (const occ of occurrences) {
    const b = blackoutFor(occ.date, settings.blackouts);
    if (b) warnings.push({ kind: 'blackout', date: occ.date, message: `${occ.date} falls in the blackout period "${b.name}".` });
    for (const sid of audienceIds) {
      if (flagged.has(sid)) continue;
      const dates = [...datesFor(sid), occ.date];
      const n = maxInWindow(dates, occ.date);
      if (n > max) {
        flagged.add(sid);
        warnings.push({ kind: 'stakeholderLoad', date: occ.date, stakeholderId: sid, message: `A stakeholder would have ${n} engagements in seven days (limit ${max}).` });
      }
    }
    if (COMMS_TYPES.has(engagementType)) {
      for (const gid of groupIds) {
        const dates = [
          ...comms.filter((c) => asArray(c.groupIds).includes(gid) && c.startDate).map((c) => c.startDate),
          ...live.filter((e) => COMMS_TYPES.has(e.engagementType) && asArray(e.groupIds).includes(gid)).map((e) => e.actualDate || e.plannedDate),
          occ.date,
        ];
        const n = maxInWindow(dates.filter(Boolean), occ.date);
        if (n > maxComms) warnings.push({ kind: 'groupLoad', date: occ.date, groupId: gid, message: `A group would receive ${n} communications in seven days (limit ${maxComms}).` });
      }
    }
  }
  return warnings;
}

// --- Preferred sender (RUL-11, COM-003, STK-024) --------------------------------------------------------

export function proposeSender({ messageFocus, stakeholderIds = [], groupIds = [] }, { initiative, stakeholders = [], impactedGroups = [], stakeholderGroups = [] } = {}) {
  if (messageFocus === 'businessReasons' || messageFocus === 'progress') {
    if (initiative?.primarySponsorId) return { senderId: initiative.primarySponsorId, rationale: 'Business reasons for the change are best delivered by the primary sponsor (RUL-11).' };
    return { senderId: null, rationale: 'No primary sponsor is recorded; nominate a senior leader.' };
  }
  if (messageFocus === 'personalImpacts') {
    const ids = asArray(stakeholderIds);
    if (ids.length === 1) {
      const s = stakeholders.find((x) => x.id === ids[0]);
      if (s?.managerId) return { senderId: s.managerId, rationale: "Personal and role impacts are best delivered by the recipient's direct people manager (RUL-11)." };
    }
    const managers = uniq(ids.map((id) => stakeholders.find((x) => x.id === id)?.managerId).filter(Boolean));
    if (managers.length === 1) return { senderId: managers[0], rationale: "Recipients share one direct people manager, who should deliver personal impact messages (RUL-11)." };
    for (const gid of asArray(groupIds)) {
      const ig = impactedGroups.find((g) => g.stakeholderGroupId === gid || g.id === gid);
      if (ig?.managerStakeholderId) return { senderId: ig.managerStakeholderId, rationale: 'Personal and role impacts should come from the people managers of the group; the accountable people leader is proposed (RUL-11).' };
    }
    return { senderId: null, rationale: 'Personal impacts should be delivered by each recipient\'s direct people manager (RUL-11).' };
  }
  return { senderId: null, rationale: 'No preferred-sender rule applies to this message focus.' };
}

// Business days between today and a date, used for upcoming and overdue alerts.
export const daysUntil = (date, today) => diffDays(today, date);
