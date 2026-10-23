// Notification wording shared by the daily jobs and the demonstration data set (AC-03, MEA-006).
import { fmtDate } from '../dates.js';

export const cadenceKey = (p) => `${p.id}:${p.cadenceBasis || 'never'}`;

export function cadenceNotice(initiative, p) {
  return {
    kind: 'cadence',
    initiativeId: initiative.id,
    title: `Overdue for engagement: ${p.name}`,
    body: p.cadenceBasis
      ? `Last engaged ${fmtDate(p.cadenceBasis)}; required every ${p.cadenceDays} days (RUL-06).`
      : `Not yet engaged; required every ${p.cadenceDays} days (RUL-06).`,
    link: { type: 'profile', id: p.id },
  };
}

export const measureKey = (x) => `${x.id}:${x.latestDate}`;

export function measureNotice(initiative, x) {
  return {
    kind: 'measure',
    initiativeId: initiative.id,
    title: `Measure below threshold: ${x.name}`,
    body: `Latest ${x.latest}${x.unit || ''} on ${fmtDate(x.latestDate)}; threshold ${x.threshold}${x.unit || ''}, target ${x.target}${x.unit || ''}.`,
    link: { type: 'measure', id: x.id },
  };
}

export function approvalNotice(a, approverName) {
  return {
    kind: 'approval',
    initiativeId: a.initiativeId || null,
    title: `Approval requested: ${a.subjectLabel}`,
    body: `${approverName ? `${approverName}, your` : 'Your'} decision is requested${a.note ? `: ${a.note}` : '.'}`,
    link: { type: 'approval', id: a.id },
  };
}
