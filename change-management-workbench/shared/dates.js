// Date handling. Calendar dates are stored as ISO strings (YYYY-MM-DD) and manipulated in UTC so that
// arithmetic never shifts with the server or browser time zone. Display uses Australian English
// (DD/MM/YYYY) and each user's time zone (USE-06).

const DAY = 86400000;

export function toDate(iso) {
  if (!iso) return null;
  if (iso instanceof Date) return new Date(Date.UTC(iso.getUTCFullYear(), iso.getUTCMonth(), iso.getUTCDate()));
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

export function toIso(d) {
  if (!d) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

export function addDays(iso, n) {
  const d = toDate(iso);
  return d ? toIso(new Date(d.getTime() + n * DAY)) : null;
}

export function diffDays(a, b) {
  // Whole days from a to b (b - a).
  const da = toDate(a), db = toDate(b);
  return da && db ? Math.round((db - da) / DAY) : null;
}

export function addMonths(iso, n) {
  const d = toDate(iso);
  if (!d) return null;
  const day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return toIso(t);
}

export const dayOfWeek = (iso) => toDate(iso)?.getUTCDay(); // 0 Sunday … 6 Saturday
export const isWeekend = (iso) => [0, 6].includes(dayOfWeek(iso));

export function minIso(...xs) { return xs.filter(Boolean).sort()[0] || null; }
export function maxIso(...xs) { return xs.filter(Boolean).sort().slice(-1)[0] || null; }

// --- Business-day calendar (STK-023, RUL-10) -------------------------------------------------

function easterSunday(year) {
  // Anonymous Gregorian algorithm.
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return toIso(new Date(Date.UTC(year, month - 1, day)));
}

function nthWeekday(year, month, weekday, n) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return toIso(new Date(Date.UTC(year, month - 1, 1 + offset + (n - 1) * 7)));
}

// Australian national public holidays (default calendar; state holidays can be added in Administration).
export function australianNationalHolidays(year) {
  const iso = (m, d) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const out = [];
  const add = (date, name) => out.push({ date, name });
  const observedMonday = (date, name) => {
    add(date, name);
    const dow = dayOfWeek(date);
    if (dow === 6) add(addDays(date, 2), `${name} (observed)`);
    if (dow === 0) add(addDays(date, 1), `${name} (observed)`);
  };
  observedMonday(iso(1, 1), "New Year's Day");
  observedMonday(iso(1, 26), 'Australia Day');
  const easter = easterSunday(year);
  add(addDays(easter, -2), 'Good Friday');
  add(addDays(easter, 1), 'Easter Monday');
  add(iso(4, 25), 'Anzac Day');
  add(nthWeekday(year, 6, 1, 2), "King's Birthday");
  const xmas = iso(12, 25), boxing = iso(12, 26);
  add(xmas, 'Christmas Day');
  add(boxing, 'Boxing Day');
  const xd = dayOfWeek(xmas);
  if (xd === 6) { add(iso(12, 27), 'Christmas Day (observed)'); add(iso(12, 28), 'Boxing Day (observed)'); }
  if (xd === 5) add(iso(12, 28), 'Boxing Day (observed)');
  if (xd === 0) add(iso(12, 27), 'Christmas Day (observed)');
  return out;
}

export function defaultHolidays(fromYear = 2025, toYear = 2030) {
  const out = [];
  for (let y = fromYear; y <= toYear; y++) out.push(...australianNationalHolidays(y));
  return out;
}

export function makeCalendar(holidays = []) {
  const set = new Set(holidays.map((h) => (typeof h === 'string' ? h : h.date)));
  const isBusinessDay = (iso) => !isWeekend(iso) && !set.has(iso);
  return {
    isBusinessDay,
    // Moves n business days from iso (n < 0 moves backwards). A start date that is not a business day
    // is first rolled in the direction of travel.
    addBusinessDays(iso, n) {
      if (!iso) return null;
      let d = iso;
      const step = n < 0 ? -1 : 1;
      let left = Math.abs(n);
      if (left === 0) {
        while (!isBusinessDay(d)) d = addDays(d, 1);
        return d;
      }
      while (left > 0) {
        d = addDays(d, step);
        if (isBusinessDay(d)) left--;
      }
      return d;
    },
    // Business days elapsed after `from` up to and including `to`.
    businessDaysBetween(from, to) {
      if (!from || !to) return null;
      if (to <= from) return 0;
      let n = 0;
      for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isBusinessDay(d)) n++;
      return n;
    },
  };
}

// --- Periods -----------------------------------------------------------------------------------

export function weekStart(iso) {
  const dow = dayOfWeek(iso);
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

export const monthKey = (iso) => (iso ? String(iso).slice(0, 7) : null);
export const quarterKey = (iso) => (iso ? `${iso.slice(0, 4)}-Q${Math.floor((+iso.slice(5, 7) - 1) / 3) + 1}` : null);

export function periodKey(iso, unit = 'month') {
  if (!iso) return null;
  if (unit === 'week') return weekStart(iso);
  if (unit === 'quarter') return quarterKey(iso);
  return monthKey(iso);
}

export function periodRange(start, end, unit = 'month') {
  if (!start || !end || end < start) return [];
  const out = [];
  if (unit === 'week') {
    for (let d = weekStart(start); d <= end; d = addDays(d, 7)) out.push({ key: d, start: d, end: addDays(d, 6), label: fmtDate(d, { short: true }) });
    return out;
  }
  if (unit === 'quarter') {
    let y = +start.slice(0, 4), q = Math.floor((+start.slice(5, 7) - 1) / 3);
    const endKey = quarterKey(end);
    for (let guard = 0; guard < 200; guard++) {
      const key = `${y}-Q${q + 1}`;
      const s = `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`;
      out.push({ key, start: s, end: addDays(addMonths(s, 3), -1), label: `Q${q + 1} ${y}` });
      if (key === endKey) break;
      q++;
      if (q > 3) { q = 0; y++; }
    }
    return out;
  }
  let m = `${start.slice(0, 7)}-01`;
  for (let guard = 0; guard < 600 && m.slice(0, 7) <= end.slice(0, 7); guard++) {
    out.push({ key: m.slice(0, 7), start: m, end: addDays(addMonths(m, 1), -1), label: fmtMonth(m) });
    m = addMonths(m, 1);
  }
  return out;
}

// --- Formatting (Australian English) ------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function fmtDate(iso, { short = false, long = false } = {}) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  if (long) return `${+m[3]} ${MONTHS_LONG[+m[2] - 1]} ${m[1]}`;
  if (short) return `${+m[3]} ${MONTHS[+m[2] - 1]}`;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function fmtMonth(iso) {
  if (!iso) return '';
  return `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
}

export function fmtDateTime(ts, timeZone) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  try {
    const parts = new Intl.DateTimeFormat('en-AU', { timeZone: timeZone || undefined, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    const g = (t) => parts.find((p) => p.type === t)?.value;
    return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`;
  } catch {
    return d.toISOString().replace('T', ' ').slice(0, 16);
  }
}

// Minutes a time zone is ahead of UTC at an instant (600 for Sydney in winter, 660 in summer).
function zoneOffset(timeZone, at) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at).map((p) => [p.type, p.value]));
    return (Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - Math.floor(at.getTime() / 1000) * 1000) / 60000;
  } catch {
    return 0;
  }
}

// The instant a wall-clock date and time ('YYYY-MM-DD', 'HH:MM') occurs in a time zone, allowing for
// daylight saving.
export function zonedInstant(iso, time, timeZone) {
  const [y, mo, d] = iso.split('-').map(Number);
  const [hh, mm] = String(time || '00:00').split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, hh || 0, mm || 0);
  let at = new Date(wall - zoneOffset(timeZone, new Date(wall)) * 60000);
  at = new Date(wall - zoneOffset(timeZone, at) * 60000);
  return at;
}

// Today's calendar date in a given IANA time zone (defaults to Australia/Sydney).
export function todayIso(timeZone = 'Australia/Sydney', now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    return parts; // en-CA formats as YYYY-MM-DD
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function relativeDays(iso, today) {
  const d = diffDays(today, iso);
  if (d == null) return '';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

// Parses user-entered dates in DD/MM/YYYY (and ISO) form.
export function parseAuDate(s) {
  const t = String(s ?? '').trim();
  if (!t) return null;
  if (isIsoDate(t.slice(0, 10))) return t.slice(0, 10);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function excelSerialToIso(n) {
  if (typeof n !== 'number') return null;
  return toIso(new Date(Date.UTC(1899, 11, 30) + Math.round(n) * DAY));
}
