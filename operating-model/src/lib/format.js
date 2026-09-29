// Number, currency and date formatting.

export const isNum = (v) => v !== '' && v !== null && v !== undefined && typeof v !== 'boolean' && !Number.isNaN(Number(v));
export const num = (v) => (isNum(v) ? Number(v) : null);

export function fmtNum(v, dp = 0) {
  if (!isNum(v)) return '—';
  return Number(v).toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtMoney(v, { compact = false, dp } = {}) {
  if (!isNum(v)) return '—';
  const n = Number(v);
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (compact) {
    if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(dp ?? 2)}b`;
    if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(dp ?? 1)}m`;
    if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(dp ?? 0)}k`;
    return `${sign}$${a.toFixed(0)}`;
  }
  return `${sign}$${a.toLocaleString('en-AU', { maximumFractionDigits: dp ?? 0, minimumFractionDigits: dp ?? 0 })}`;
}

export function fmtPct(v, dp = 0) {
  if (!isNum(v)) return '—';
  return `${(Number(v) * 100).toFixed(dp)}%`;
}

export function fmtScore(v, dp = 1) {
  if (!isNum(v)) return '—';
  return Number(v).toFixed(dp);
}

export function fmtSigned(v, dp = 1, fmt) {
  if (!isNum(v)) return '—';
  const n = Number(v);
  const s = fmt ? fmt(Math.abs(n)) : Math.abs(n).toFixed(dp);
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
export function fmtDate(v) {
  const d = parseDate(v);
  if (!d) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function daysFromToday(v) {
  const d = parseDate(v);
  if (!d) return null;
  return Math.round((d - today()) / 86400000);
}
export function addMonths(d, n) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

export const plural = (n, word, pl) => `${fmtNum(n)} ${n === 1 ? word : pl || `${word}s`}`;
