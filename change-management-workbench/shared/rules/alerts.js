// Alerts (STK-044, SPN-006, MEA-006, RUL-06, RUL-07, RUL-12, RUL-19 and data-quality indicators in Section 10.4).
import { adkarLabel } from '../refdata.js';
import { addDays, diffDays, fmtDate, makeCalendar } from '../dates.js';
import { asArray, uniq } from '../util.js';
import { NO_BARRIER } from './adkar.js';
import { isOpen } from './engagements.js';

export function computeAlerts(m) {
  const out = [];
  const { today, settings } = m;
  const cal = makeCalendar(m.holidays);
  const lead = m.initiative.changeLeadId;
  const upcomingDays = settings.alerts?.upcomingDays ?? 5;
  const add = (a) => out.push({ severity: 'warning', recipients: [], date: today, ...a, recipients: uniq(asArray(a.recipients).filter(Boolean)) });

  const ownersOf = (e) => {
    const item = e.planItemId ? m.byId.engagementPlanItem[e.planItemId] : null;
    const fromProfiles = asArray(e.stakeholderIds).map((sid) => m.profileByStakeholder[sid]?.relationshipOwnerId);
    return [item?.relationshipOwnerId, ...asArray(e.internalParticipantIds), ...fromProfiles, e.createdBy];
  };

  for (const e of m.engagements) {
    const when = e.plannedDate;
    if (isOpen(e) && when) {
      const d = diffDays(today, when);
      if (d >= 0 && d <= upcomingDays) add({ id: `upcoming:${e.id}`, kind: 'upcomingEngagement', severity: 'info', title: `Upcoming: ${e.label}`, detail: `${fmtDate(when)}${e.plannedTime ? ` ${e.plannedTime}` : ''} · ${e.audienceLabel}`, link: { type: 'engagement', id: e.id }, recipients: ownersOf(e), date: when });
      if (d < 0) {
        const late = cal.businessDaysBetween(when, today);
        add({ id: `overdue:${e.id}`, kind: 'overdueEngagement', severity: late > (settings.alerts?.completionGraceBusinessDays ?? 5) ? 'critical' : 'warning', title: `Not logged: ${e.label}`, detail: `Planned for ${fmtDate(when)} (${late} business days ago). Log the engagement or update its status.`, link: { type: 'engagement', id: e.id }, recipients: ownersOf(e), date: when });
      }
    }
    if (e.quickCapture && !['cancelled'].includes(e.status)) add({ id: `quick:${e.id}`, kind: 'quickCaptureIncomplete', severity: 'info', title: `Complete quick capture: ${e.label}`, detail: 'Captured on mobile with minimum fields; add attendance, messages, concerns and actions.', link: { type: 'engagement', id: e.id }, recipients: [e.createdBy] });
  }

  for (const t of m.tasks) {
    if (['open', 'inProgress'].includes(t.status) && t.dueDate && t.dueDate < today) add({ id: `task:${t.id}`, kind: 'overdueAction', title: `Overdue action: ${t.title}`, detail: `Due ${fmtDate(t.dueDate)}`, link: { type: 'task', id: t.id }, recipients: [t.assigneeId], date: t.dueDate });
  }

  for (const p of m.profiles) {
    if (p.cadence?.overdue && p.cadenceDays) {
      add({ id: `cadence:${p.id}`, kind: 'outsideCadence', severity: p.quadrant === 'manageClosely' ? 'critical' : 'warning', title: `Overdue for engagement: ${p.name}`, detail: p.lastEngaged ? `Last engaged ${fmtDate(p.lastEngaged)} (${p.cadence.daysSince} days ago); required every ${p.cadenceDays} days.` : `Not yet engaged; required every ${p.cadenceDays} days.`, link: { type: 'profile', id: p.id }, recipients: [p.relationshipOwnerId, p.delegateId] });
    }
    if (p.sentimentTrend?.direction === 'deteriorating') add({ id: `sentiment:${p.id}`, kind: 'deterioratingSentiment', title: `Sentiment deteriorating: ${p.name}`, detail: 'Observed sentiment has fallen across recent engagements.', link: { type: 'profile', id: p.id }, recipients: [p.relationshipOwnerId] });
    if (p.levelDropped) add({ id: `level:${p.id}`, kind: 'engagementLevelDropped', title: `Engagement level fell: ${p.name}`, detail: p.levelDropped, link: { type: 'profile', id: p.id }, recipients: [p.relationshipOwnerId] });
    if (p.escalation && !p.hasOpenResistance) add({ id: `resist:${p.id}`, kind: 'resistanceEscalation', severity: 'critical', title: `Escalate resistance: ${p.name}`, detail: `${p.escalation}. Create a resistance item and agree a response (RUL-12).`, link: { type: 'profile', id: p.id }, recipients: [p.relationshipOwnerId, lead] });
    if (p.stakeholder?.status === 'left' && (p.nextPlanned || p.relationshipOwnerId)) add({ id: `leaver:${p.id}`, kind: 'leaver', title: `Stakeholder has left: ${p.name}`, detail: 'Cancel or reassign their future engagements, relationships and actions (RUL-19).', link: { type: 'profile', id: p.id }, recipients: [lead, p.relationshipOwnerId] });
  }

  for (const g of m.groups) {
    if (g.barrierChanged && g.barrierPoint) {
      const now = g.barrierPoint === NO_BARRIER ? 'no barrier point' : adkarLabel(g.barrierPoint);
      const before = g.adkarPrev?.barrierPoint ? (g.adkarPrev.barrierPoint === NO_BARRIER ? 'no barrier point' : adkarLabel(g.adkarPrev.barrierPoint)) : 'none recorded';
      add({ id: `barrier:${g.id}:${g.barrierPoint}`, kind: 'barrierChanged', title: `Barrier point changed: ${g.name}`, detail: `Now ${now} (previously ${before}).`, link: { type: 'impactedGroup', id: g.id }, recipients: [lead] });
    }
  }

  // RUL-07: load threshold exceeded in the next 30 days.
  const horizon = addDays(today, 30);
  const max = settings.load?.stakeholderMaxPer7Days ?? 3;
  const datesBy = {};
  for (const e of m.engagements) {
    if (!isOpen(e) || !e.plannedDate || e.plannedDate < today || e.plannedDate > horizon) continue;
    for (const sid of asArray(e.stakeholderIds)) (datesBy[sid] ||= []).push(e.plannedDate);
  }
  for (const [sid, dates] of Object.entries(datesBy)) {
    dates.sort();
    for (let i = 0; i < dates.length; i++) {
      const n = dates.filter((d) => d >= dates[i] && d <= addDays(dates[i], 6)).length;
      if (n > max) {
        const p = m.profileByStakeholder[sid];
        add({ id: `load:${sid}`, kind: 'loadExceeded', title: `Engagement load: ${p?.name || m.stakeholderName(sid)}`, detail: `${n} engagements planned in the seven days from ${fmtDate(dates[i])} (limit ${max}).`, link: p ? { type: 'profile', id: p.id } : null, recipients: [p?.relationshipOwnerId, lead] });
        break;
      }
    }
  }

  // SPN-006: overdue sponsor commitments.
  for (const a of m.activities) {
    if (asArray(a.plans).includes('sponsor') && a.overdue) add({ id: `sponsor:${a.id}`, kind: 'sponsorOverdue', title: `Sponsor commitment overdue: ${a.title}`, detail: `Due ${fmtDate(a.endDate || a.startDate)}; not yet confirmed as complete.`, link: { type: 'activity', id: a.id }, recipients: [lead, a.ownerId] });
  }

  // MEA-006: measures below threshold.
  for (const x of m.measures) {
    if (x.belowThreshold) add({ id: `measure:${x.id}`, kind: 'measureBelowThreshold', title: `Below threshold: ${x.name}`, detail: `Latest ${x.latest}${x.unit || ''} on ${fmtDate(x.latestDate)}; threshold ${x.threshold}${x.unit || ''}, target ${x.target}${x.unit || ''}.`, link: { type: 'measure', id: x.id }, recipients: [x.ownerId, lead] });
  }

  // Survey response rates (ADK-007 alternative flow 3a).
  for (const s of m.surveys) {
    if (s.status !== 'open' || !s.closesAt) continue;
    const left = diffDays(today, s.closesAt);
    if (left >= 0 && left <= 7 && s.responseRate != null && s.responseRate < (s.responseTarget ?? 60)) add({ id: `survey:${s.id}`, kind: 'surveyLowResponse', title: `Low response rate: ${s.title}`, detail: `${s.responseRate}% response with ${left} days left (target ${s.responseTarget ?? 60}%). Extend the campaign or send targeted reminders.`, link: { type: 'survey', id: s.id }, recipients: [lead] });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity] || String(a.date).localeCompare(String(b.date)));
}

export const ALERT_KINDS = {
  upcomingEngagement: 'Upcoming engagements',
  overdueEngagement: 'Engagements not logged',
  overdueAction: 'Overdue actions',
  outsideCadence: 'Stakeholders outside cadence',
  deterioratingSentiment: 'Deteriorating sentiment',
  engagementLevelDropped: 'Engagement level fell',
  barrierChanged: 'New or changed barrier points',
  loadExceeded: 'Engagement load exceeded',
  resistanceEscalation: 'Resistance escalation',
  sponsorOverdue: 'Overdue sponsor commitments',
  measureBelowThreshold: 'Measures below threshold',
  leaver: 'Leavers and movers',
  quickCaptureIncomplete: 'Quick captures to complete',
  surveyLowResponse: 'Low survey response',
};
