// Shared helpers for the proposal platform core. No DOM or React: this code also runs in Node.

export const DAY = 86400000;

export function uid(prefix = 'id') {
  const rnd = globalThis.crypto?.getRandomValues ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 9) : Math.random().toString(36).slice(2, 11);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

// Deterministic PRNG (mulberry32) for seed data.
export function prng(seed = 42) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (min, max) => Math.floor(next() * (max - min + 1)) + min;
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  next.shuffle = (arr) => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  };
  return next;
}

export const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

export function byId(list, id) {
  return (list || []).find((x) => x.id === id) || null;
}

export function groupBy(list, fn) {
  const m = {};
  for (const x of list) { const k = fn(x); (m[k] ||= []).push(x); }
  return m;
}

export function sum(list, fn = (x) => x) {
  return list.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ---------- Dates and time zones ----------

export const todayISO = (now = new Date()) => now.toISOString().slice(0, 10);

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((new Date(`${b.slice(0, 10)}T00:00:00Z`) - new Date(`${a.slice(0, 10)}T00:00:00Z`)) / DAY);
}

// Australian national public holidays (used when back-scheduling milestones).
const HOLIDAYS = new Set([
  '2025-01-01', '2025-01-27', '2025-04-18', '2025-04-21', '2025-04-25', '2025-12-25', '2025-12-26',
  '2026-01-01', '2026-01-26', '2026-04-03', '2026-04-06', '2026-04-25', '2026-12-25', '2026-12-28',
  '2027-01-01', '2027-01-26', '2027-03-26', '2027-03-29', '2027-04-26', '2027-12-27', '2027-12-28',
]);

export function isBusinessDay(iso) {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6 && !HOLIDAYS.has(iso);
}

export function addBusinessDays(iso, n) {
  let d = iso;
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n);
  while (left > 0) {
    d = addDays(d, step);
    if (isBusinessDay(d)) left--;
  }
  return d;
}

// Offset (minutes) of a time zone at a given instant, using Intl.
function tzOffset(date, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return (asUtc - date.getTime()) / 60000;
}

// Converts a wall-clock date and time in a time zone to a Date.
export function zonedToDate(dateISO, time = '00:00', tz = 'Australia/Sydney') {
  if (!dateISO) return null;
  const [h, m] = (time || '00:00').split(':').map(Number);
  const guess = new Date(Date.UTC(+dateISO.slice(0, 4), +dateISO.slice(5, 7) - 1, +dateISO.slice(8, 10), h || 0, m || 0));
  let off = tzOffset(guess, tz);
  let d = new Date(guess.getTime() - off * 60000);
  const off2 = tzOffset(d, tz);
  if (off2 !== off) d = new Date(guess.getTime() - off2 * 60000);
  return d;
}

export function fmtZoned(date, tz = 'Australia/Sydney', opts = {}) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: tz, weekday: opts.weekday === false ? undefined : 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short', ...opts.intl,
  }).format(d);
}

export function fmtDate(iso, opts = {}) {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: iso.length <= 10 ? 'UTC' : 'Australia/Sydney', ...opts }).format(d);
}

// "Friday 23 October 2026" and "23 October 2026" for generated documents.
export function longDate(iso, { weekday = true } = {}) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-AU', { weekday: weekday ? 'long' : undefined, day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)).replace(',', '');
}

// Next occurrence of a weekday (0 = Sunday) on or after a date.
export function nextWeekday(iso, dow) {
  let d = iso;
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== dow) d = addDays(d, 1);
  return d;
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' }).format(new Date(iso));
}

export function relTime(iso, now = Date.now()) {
  if (!iso) return '';
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  const abs = Math.abs(s);
  const f = (n, u) => `${n} ${u}${n === 1 ? '' : 's'}`;
  const txt = abs < 60 ? 'just now' : abs < 3600 ? f(Math.round(abs / 60), 'minute') : abs < 86400 ? f(Math.round(abs / 3600), 'hour') : f(Math.round(abs / 86400), 'day');
  if (txt === 'just now') return txt;
  return s >= 0 ? `${txt} ago` : `in ${txt}`;
}

export const TIMEZONES = [
  ['Australia/Sydney', 'NSW / ACT (AEST/AEDT)'],
  ['Australia/Melbourne', 'VIC (AEST/AEDT)'],
  ['Australia/Hobart', 'TAS (AEST/AEDT)'],
  ['Australia/Brisbane', 'QLD (AEST)'],
  ['Australia/Adelaide', 'SA (ACST/ACDT)'],
  ['Australia/Darwin', 'NT (ACST)'],
  ['Australia/Perth', 'WA (AWST)'],
];

// ---------- Money ----------

export function aud(n, { cents = false } = {}) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
}

export function audShort(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (Math.abs(v) >= 1e3) return `$${Math.round(v / 1e3)}k`;
  return `$${Math.round(v)}`;
}

export const pct = (n, d = 0) => `${((Number(n) || 0) * 100).toFixed(d)}%`;

// ---------- Text and HTML ----------

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Plain text from the editor's HTML subset; citations and comments are removed.
export function htmlToText(html, { keepCitations = false } = {}) {
  let s = String(html || '');
  if (!keepCitations) s = s.replace(/<cite\b[^>]*>[\s\S]*?<\/cite>/gi, '');
  s = s.replace(/<(br)\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|tr|blockquote|div)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(s).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function wordCount(text) {
  const m = String(text || '').match(/[A-Za-z0-9À-ɏ][\w'’\-.%$]*/g);
  return m ? m.length : 0;
}

export function htmlWords(html) {
  return wordCount(htmlToText(html));
}

export function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function truncate(s, n = 120) {
  const t = String(s || '');
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

export function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'section';
}

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}
