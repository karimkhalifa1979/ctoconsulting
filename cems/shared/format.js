// Australian English formatting (NFR-027): AUD, dd/mm/yyyy, local time zones.
import { parseISO } from './dates.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function fmtDate(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
}

// Formats a calendar date with a pattern: yyyy yy MMMM MMM MM M dd d EEEE EEE (RPT-012).
export function fmtDatePattern(iso, pattern = 'dd/MM/yyyy') {
  if (!iso) return '';
  const dt = parseISO(iso);
  if (Number.isNaN(dt.getTime())) return String(iso);
  const y = dt.getUTCFullYear(), m = dt.getUTCMonth(), d = dt.getUTCDate(), w = dt.getUTCDay();
  const map = {
    yyyy: String(y), yy: String(y).slice(2), MMMM: MONTHS[m], MMM: MONTHS[m].slice(0, 3), MM: String(m + 1).padStart(2, '0'), M: String(m + 1),
    dd: String(d).padStart(2, '0'), d: String(d), EEEE: DAYS[w], EEE: DAYS[w].slice(0, 3),
  };
  return pattern.replace(/yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|'[^']*'/g, (t) => (t.startsWith("'") ? t.slice(1, -1) : map[t]));
}

export function fmtDateTime(ts, tz) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d);
}

export function fmtMoney(v, { decimals = 0, blank = '—' } = {}) {
  if (!isNum(v)) return blank;
  const s = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(v));
  return v < 0 ? `-${s}` : s;
}

// Compact currency for tiles and axes: $1.2m, $345k.
export function fmtMoneyShort(v) {
  if (!isNum(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}m`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}k`;
  return `${sign}$${Math.round(a)}`;
}

export function fmtPct(v, decimals = 0, { blank = '—' } = {}) {
  if (!isNum(v)) return blank;
  return `${(v * 100).toFixed(decimals)}%`;
}

export function fmtNum(v, decimals = 0, { blank = '—' } = {}) {
  if (!isNum(v)) return blank;
  return new Intl.NumberFormat('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
}

export const fmtHours = (v) => (isNum(v) ? `${fmtNum(v, v % 1 ? 1 : 0)} h` : '—');
export const fmtDays = (v) => (isNum(v) ? `${fmtNum(v, v % 1 ? 2 : 0)} d` : '—');

export function fmtIndex(v) {
  return isNum(v) ? v.toFixed(2) : '—';
}

export function textCase(s, mode) {
  const str = String(s ?? '');
  if (mode === 'upper') return str.toUpperCase();
  if (mode === 'lower') return str.toLowerCase();
  if (mode === 'title') return str.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  if (mode === 'sentence') return str ? str[0].toUpperCase() + str.slice(1) : str;
  return str;
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function relativeDays(n) {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
