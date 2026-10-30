// Date helpers shared by the server and the browser.
// Calendar dates are ISO strings ('YYYY-MM-DD') with no time zone; instants are ISO UTC timestamps.
// Reporting weeks end on Friday (BR-01); the financial year runs 1 July – 30 June (FIN-041).

const DAY = 86_400_000;

export function parseISO(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export const isISODate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISO(s).getTime());

export function addDays(iso, n) {
  return toISO(parseISO(iso).getTime() + n * DAY);
}

// Whole days from a to b (b − a).
export function diffDays(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / DAY);
}

export const dayOfWeek = (iso) => parseISO(iso).getUTCDay(); // 0 = Sunday
export const isWeekend = (iso) => [0, 6].includes(dayOfWeek(iso));
export const minDate = (...ds) => ds.filter(Boolean).sort()[0] || null;
export const maxDate = (...ds) => ds.filter(Boolean).sort().at(-1) || null;

// The reporting-week label: the Friday on or after the date (BR-01).
export function weekEnding(iso, endDow = 5) {
  return addDays(iso, (endDow - dayOfWeek(iso) + 7) % 7);
}

// Monday on or before the date (timesheet weeks run Monday to Sunday).
export function weekStart(iso) {
  return addDays(iso, -((dayOfWeek(iso) + 6) % 7));
}

export function isBusinessDay(iso, holidays) {
  return !isWeekend(iso) && !(holidays && holidays.has(iso));
}

export function addBusinessDays(iso, n, holidays) {
  let d = iso;
  let left = Math.abs(n);
  const step = n < 0 ? -1 : 1;
  while (left > 0) {
    d = addDays(d, step);
    if (isBusinessDay(d, holidays)) left--;
  }
  return d;
}

// Business days after a, up to and including b (0 when b <= a).
export function businessDaysBetween(a, b, holidays) {
  if (!a || !b || b <= a) return 0;
  let n = 0;
  for (let d = addDays(a, 1); d <= b; d = addDays(d, 1)) if (isBusinessDay(d, holidays)) n++;
  return n;
}

// Signed business-day difference (positive when b is later than a).
export function businessDayDiff(a, b, holidays) {
  return b >= a ? businessDaysBetween(a, b, holidays) : -businessDaysBetween(b, a, holidays);
}

// The nth business day of a month (1-based), used for forecast-cycle deadlines.
export function nthBusinessDay(month, n, holidays) {
  return addBusinessDays(addDays(`${month}-01`, -1), n, holidays);
}

export const monthOf = (iso) => String(iso).slice(0, 7);
export const monthStart = (month) => `${month}-01`;
export function monthEnd(month) {
  const [y, m] = month.split('-').map(Number);
  return toISO(Date.UTC(y, m, 0));
}
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}
export function monthsBetween(fromMonth, toMonth) {
  const out = [];
  for (let m = fromMonth; m <= toMonth; m = addMonths(m, 1)) out.push(m);
  return out;
}
export const daysInMonth = (month) => Number(monthEnd(month).slice(8, 10));

// Australian financial year containing the date, named by the year it ends (FY2027 = Jul 2026 – Jun 2027).
export function fyOf(iso, startMonth = 7) {
  const [y, m] = String(iso).split('-').map(Number);
  return m >= startMonth ? y + 1 : y;
}
export const fyLabel = (fy) => `FY${fy - 1}–${String(fy).slice(2)}`;
export function fyMonths(fy, startMonth = 7) {
  const first = `${fy - 1}-${String(startMonth).padStart(2, '0')}`;
  return monthsBetween(first, addMonths(first, 11));
}
export const fyStart = (fy, startMonth = 7) => `${fy - 1}-${String(startMonth).padStart(2, '0')}-01`;
export const fyEnd = (fy, startMonth = 7) => monthEnd(addMonths(`${fy - 1}-${String(startMonth).padStart(2, '0')}`, 11));

// Offset in minutes of a time zone from UTC at an instant (handles daylight saving).
export function tzOffsetMinutes(instant, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

// The UTC instant of a local wall-clock time in a zone, e.g. Thursday 17:00 in Australia/Sydney.
export function zonedToUtc(iso, time, tz) {
  const [y, m, d] = iso.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let utc = wall;
  for (let i = 0; i < 3; i++) utc = wall - tzOffsetMinutes(new Date(utc), tz) * 60000;
  return new Date(utc);
}

// Today's calendar date in a time zone.
export function todayIn(tz = 'Australia/Sydney', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Holiday set for a state from the reference-data calendar (ADM-003).
export function holidaySet(holidays, state = 'NSW') {
  const set = new Set();
  for (const h of holidays || []) if (!h.states || h.states.includes('ALL') || h.states.includes(state)) set.add(h.date);
  return set;
}

export function rangeDays(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
