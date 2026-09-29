// Back-scheduling milestones from the submission deadline (WF-13) and iCalendar export.
import { addBusinessDays, isBusinessDay, addDays, zonedToDate, todayISO, uid } from './util.js';

// Offsets are business days before the closing date. For short windows the plan is compressed proportionally.
export const MILESTONE_PLAN = [
  { key: 'gate1', label: 'Gate 1: bid/no-bid decision', from: 'start', offset: 2 },
  { key: 'plan', label: 'Plan published to the team', from: 'start', offset: 4 },
  { key: 'drafts', label: 'First drafts complete', before: 10 },
  { key: 'ready', label: 'All sections ready for review', before: 7 },
  { key: 'review', label: 'Red team review complete', before: 5 },
  { key: 'gate2', label: 'Gate 2: commercial approval', before: 3 },
  { key: 'gate3', label: 'Gate 3: partner sign-off', before: 2 },
  { key: 'produce', label: 'Final outputs produced and checked', before: 1 },
  { key: 'submit', label: 'Submission lodged', before: 0 },
];

function businessDaysBetween(a, b) {
  let n = 0;
  for (let d = a; d < b; d = addDays(d, 1)) if (isBusinessDay(addDays(d, 1))) n++;
  return n;
}

export function backSchedule(closingDate, startDate = todayISO()) {
  if (!closingDate) return [];
  const start = startDate > closingDate ? closingDate : startDate;
  const window = Math.max(1, businessDaysBetween(start, closingDate));
  const scale = window >= 16 ? 1 : window / 16;
  return MILESTONE_PLAN.map((m) => {
    let date;
    if (m.from === 'start') date = addBusinessDays(start, Math.max(0, Math.round(m.offset * scale)));
    else date = m.before === 0 ? closingDate : addBusinessDays(closingDate, -Math.max(0, Math.round(m.before * scale)));
    if (date > closingDate) date = closingDate;
    if (date < start) date = start;
    return { id: uid('ms'), key: m.key, label: m.label, date, done: false };
  });
}

// Default due date for sections: the "ready for review" milestone.
export function defaultSectionDue(bid) {
  const ms = (bid.plan?.milestones || []).find((m) => m.key === 'ready');
  return ms?.date || (bid.closing?.date ? addBusinessDays(bid.closing.date, -7) : null);
}

const icsEscape = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
const icsDate = (iso) => iso.replace(/-/g, '');
const icsStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function fold(line) {
  const out = [];
  let s = line;
  while (s.length > 74) { out.push(s.slice(0, 74)); s = ` ${s.slice(74)}`; }
  out.push(s);
  return out.join('\r\n');
}

export function buildIcs(bid, { sections = true, userId = null } = {}) {
  const now = icsStamp(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CTO Consulting//Proposal Platform//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsEscape(`${bid.ref} ${bid.title}`)}`];
  const allDay = (id, date, summary, desc) => {
    lines.push('BEGIN:VEVENT', `UID:${id}@proposals.ctoconsulting.com.au`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${icsDate(date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(date, 1))}`, fold(`SUMMARY:${icsEscape(summary)}`));
    if (desc) lines.push(fold(`DESCRIPTION:${icsEscape(desc)}`));
    lines.push('END:VEVENT');
  };
  for (const m of bid.plan?.milestones || []) {
    if (m.key === 'submit') continue;
    allDay(`${bid.id}-${m.id}`, m.date, `${bid.ref}: ${m.label}`, `${bid.title}`);
  }
  if (sections) {
    for (const s of bid.sections) {
      if (!s.due || (userId && s.ownerId !== userId)) continue;
      allDay(`${bid.id}-${s.id}`, s.due, `${bid.ref}: "${s.title}" due for review`, `Section owner deadline for ${bid.title}`);
    }
  }
  if (bid.closing?.date) {
    const start = zonedToDate(bid.closing.date, bid.closing.time || '14:00', bid.closing.tz || 'Australia/Sydney');
    const end = new Date(start.getTime() + 30 * 60000);
    lines.push('BEGIN:VEVENT', `UID:${bid.id}-closing@proposals.ctoconsulting.com.au`, `DTSTAMP:${now}`, `DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(end)}`,
      fold(`SUMMARY:${icsEscape(`${bid.ref}: submission closes`)}`), fold(`DESCRIPTION:${icsEscape(`${bid.title}. Closing time in the client's time zone: ${bid.closing.time} ${bid.closing.tz}`)}`),
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Submission closes tomorrow', 'END:VALARM', 'END:VEVENT');
  }
  for (const d of bid.extraction?.dates || []) {
    if (!d.date || /clos/i.test(d.label)) continue;
    allDay(`${bid.id}-${d.id}`, d.date, `${bid.ref}: ${d.label}`, d.time ? `${d.time} ${d.tz || ''}` : '');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
