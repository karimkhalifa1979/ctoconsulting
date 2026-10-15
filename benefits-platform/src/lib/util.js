// Small shared helpers: identifiers, dates (stored ISO, shown DD/MM/YYYY), money and percentages.

export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const sum = (arr, f = (x) => x) => arr.reduce((a, b) => a + (Number(f(b)) || 0), 0);
export const round = (v, p = 0) => { const m = 10 ** p; return Math.round(v * m) / m; };
export const byId = (list = [], id) => list.find((x) => x.id === id);
export const unique = (arr) => [...new Set(arr)];

// ---- Dates -------------------------------------------------------------
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const monthIndex = (iso) => {
  if (!iso) return null;
  const [y, m] = String(iso).split('-').map(Number);
  return y * 12 + (m - 1);
};
export const isoFromMonthIndex = (mi) => `${Math.floor(mi / 12)}-${String((mi % 12) + 1).padStart(2, '0')}-01`;
export const addMonths = (iso, n) => {
  if (!iso) return iso;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Math.round(n));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
};
export const addDays = (iso, n) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a, b) => Math.round((new Date(`${b.slice(0, 10)}T00:00:00Z`) - new Date(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000);
export const monthsBetween = (a, b) => (monthIndex(b) ?? 0) - (monthIndex(a) ?? 0);
export const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d ? `${d}/${m}/${y}` : iso;
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtMonth = (iso) => (iso ? `${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '—');
export const quarterKey = (iso) => `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
export const quarterStart = (key) => { const [y, q] = key.split('-Q').map(Number); return `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`; };
export const quarterLabel = (key) => { const [y, q] = key.split('-Q'); return `Q${q} ${y}`; };
export const nextQuarter = (key) => { const [y, q] = key.split('-Q').map(Number); return q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`; };
export const quarterRange = (fromKey, toKey) => {
  const out = [];
  let k = fromKey;
  for (let i = 0; i < 400 && k <= toKey; i++) { out.push(k); k = nextQuarter(k); }
  return out;
};
// Fiscal year label for a date given the FY start month (default July: FY2027 = Jul 2026–Jun 2027).
export const fiscalYear = (iso, startMonth = 7) => {
  const y = Number(iso.slice(0, 4)); const m = Number(iso.slice(5, 7));
  return startMonth === 1 ? y : m >= startMonth ? y + 1 : y;
};
export const fyLabel = (fy, startMonth = 7) => (startMonth === 1 ? `${fy}` : `FY${String(fy).slice(-2)}`);

// ---- Numbers -------------------------------------------------------------
let CURRENCY = 'AUD';
export const setCurrency = (c) => { CURRENCY = c || 'AUD'; };
const symbol = () => ({ AUD: '$', USD: 'US$', NZD: 'NZ$', GBP: '£', EUR: '€', CAD: 'C$', SGD: 'S$' }[CURRENCY] || `${CURRENCY} `);

export function money(v, { compact = true, precision = 0, sign = false } = {}) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const neg = v < 0; const a = Math.abs(v);
  let s;
  if (compact && a >= 1e9) s = `${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}b`;
  else if (compact && a >= 1e6) s = `${(a / 1e6).toFixed(a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2)}m`;
  else if (compact && a >= 1e3) s = `${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
  else s = a.toLocaleString('en-AU', { maximumFractionDigits: precision });
  return `${neg ? '−' : sign ? '+' : ''}${symbol()}${s}`;
}
// Full figure rounded to the configured precision (default nearest thousand, section 7.2.7).
export const moneyFull = (v, precision = 1000) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${v < 0 ? '−' : ''}${symbol()}${(Math.round(Math.abs(v) / precision) * precision).toLocaleString('en-AU')}`);
export const pct = (v, dp = 0) => {
  if (v === null || v === undefined || Number.isNaN(v) || !Number.isFinite(v)) return '—';
  const s = (v * 100).toFixed(dp);
  return Number(s) === 0 ? `${(0).toFixed(dp)}%` : `${s.replace('-', '−')}%`;
};
export const num = (v, dp = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toLocaleString('en-AU', { maximumFractionDigits: dp, minimumFractionDigits: dp }));
export const ratio = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(2)}×`);
export const months = (m) => (m === null || m === undefined ? 'Not within horizon' : m < 24 ? `${Math.round(m)} months` : `${(m / 12).toFixed(1)} years`);

// ---- Text ----------------------------------------------------------------
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const words = (s) => String(s || '').toLowerCase().match(/[a-z][a-z-]{2,}/g) || [];
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'our', 'are', 'was', 'will', 'all', 'per', 'its', 'new', 'more', 'less', 'than', 'have', 'has', 'can', 'via', 'use', 'using', 'increased', 'decreased', 'created', 'maintained', 'eliminated', 'program', 'project']);
export const keywords = (s) => unique(words(s).filter((w) => !STOP.has(w)));
export function similarity(a, b) {
  const A = new Set(keywords(a)); const B = new Set(keywords(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}
export const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
