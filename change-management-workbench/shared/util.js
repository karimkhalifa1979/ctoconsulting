// Small isomorphic helpers shared by the browser app, the server and the artefact engine.

export function uid(prefix = '') {
  const c = globalThis.crypto;
  const raw = c?.randomUUID ? c.randomUUID().replace(/-/g, '') : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return prefix ? `${prefix}_${raw.slice(0, 20)}` : raw.slice(0, 24);
}

export const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
export const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
export const asArray = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);
export const uniq = (arr) => [...new Set(arr)];
export const sum = (arr, fn = (x) => x) => arr.reduce((a, b) => a + (Number(fn(b)) || 0), 0);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round = (v, dp = 0) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** dp) / 10 ** dp);
export const pad = (n, w = 3) => String(n).padStart(w, '0');

export function mean(arr) {
  const xs = arr.filter((x) => x != null && !Number.isNaN(Number(x))).map(Number);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function median(arr) {
  const xs = arr.filter((x) => x != null && !Number.isNaN(Number(x))).map(Number).sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

export function groupBy(arr, fn) {
  const out = {};
  for (const x of arr) {
    const keys = asArray(typeof fn === 'function' ? fn(x) : x[fn]);
    for (const k of keys) (out[k] ||= []).push(x);
  }
  return out;
}

export function indexBy(arr, key = 'id') {
  const out = {};
  for (const x of arr) out[typeof key === 'function' ? key(x) : x[key]] = x;
  return out;
}

export function countBy(arr, fn) {
  const out = {};
  for (const x of arr) for (const k of asArray(typeof fn === 'function' ? fn(x) : x[fn])) out[k] = (out[k] || 0) + 1;
  return out;
}

// One collator for every sort: creating one per comparison is slow on large registers.
const COLLATOR = new Intl.Collator('en-AU', { numeric: true });
export const compareText = (a, b) => COLLATOR.compare(a, b);

export function sortBy(arr, ...fns) {
  const keys = fns.map((fn) => {
    const desc = typeof fn === 'string' && fn.startsWith('-');
    return { desc, get: typeof fn === 'function' ? fn : (x) => x?.[desc ? fn.slice(1) : fn] };
  });
  return [...arr].sort((a, b) => {
    for (const { desc, get } of keys) {
      const va = get(a), vb = get(b);
      if (va == null && vb == null) continue;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : COLLATOR.compare(String(va), String(vb));
      if (c) return desc ? -c : c;
    }
    return 0;
  });
}

export function getPath(obj, path) {
  if (!path) return obj;
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = String(path).split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
  o[keys[keys.length - 1]] = value;
  return obj;
}

export function personName(s, { formal = false } = {}) {
  if (!s) return '';
  if (s.name && !s.givenName) return s.name;
  const given = !formal && s.preferredName ? s.preferredName : s.givenName;
  return [given, s.familyName].filter(Boolean).join(' ').trim() || s.email || s.code || 'Unnamed';
}

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function escapeXml(s) {
  // Removes characters that are not allowed in XML 1.0 as well as escaping markup.
  return String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

// Rich text is stored as a restricted subset of HTML; this produces plain text for search and exports.
export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<\s*(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Allow-list sanitiser for the rich-text editor's output (b, i, u, lists, paragraphs, line breaks, headings, links).
const ALLOWED_TAGS = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'h3', 'h4', 'a']);
export function sanitiseHtml(html) {
  return String(html ?? '')
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (m, tag, attrs) => {
      const t = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(t)) return '';
      if (m.startsWith('</')) return `</${t}>`;
      if (t === 'a') {
        const href = /href\s*=\s*"(https?:\/\/[^"]*|mailto:[^"]*)"/i.exec(attrs)?.[1];
        return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">` : '<a>';
      }
      return `<${t}>`;
    });
}

// Splits rich text into simple blocks for the document renderers.
export function htmlToBlocks(html) {
  const src = sanitiseHtml(html || '');
  if (!/<(p|ul|ol|li|h3|h4|br)/i.test(src)) {
    return stripHtml(src).split(/\n{2,}/).map((t) => t.trim()).filter(Boolean).map((t) => ({ t: 'p', text: t }));
  }
  const blocks = [];
  const re = /<(p|h3|h4)>([\s\S]*?)<\/\1>|<(ul|ol)>([\s\S]*?)<\/\3>/gi;
  let m;
  let last = 0;
  while ((m = re.exec(src))) {
    const before = stripHtml(src.slice(last, m.index));
    if (before) blocks.push({ t: 'p', text: before });
    if (m[1]) {
      const text = stripHtml(m[2]);
      if (text) blocks.push({ t: m[1] === 'p' ? 'p' : 'h3', text });
    } else {
      const items = [...m[4].matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((x) => stripHtml(x[1])).filter(Boolean);
      if (items.length) blocks.push({ t: m[3] === 'ol' ? 'numbers' : 'bullets', items });
    }
    last = re.lastIndex;
  }
  const tail = stripHtml(src.slice(last));
  if (tail) blocks.push({ t: 'p', text: tail });
  return blocks;
}

export function truncate(s, n = 120) {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function pct(part, whole, dp = 0) {
  return whole ? round((part / whole) * 100, dp) : null;
}

export function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Stable, key-sorted JSON used for hashing and snapshot comparison.
export function canonicalJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
}

// Deterministic pseudo-random generator (mulberry32) for demo data and tests.
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  next.sample = (arr, n) => {
    const copy = [...arr];
    const out = [];
    while (copy.length && out.length < n) out.push(copy.splice(Math.floor(next() * copy.length), 1)[0]);
    return out;
  };
  return next;
}

// SHA-256 that works in Node (webcrypto) and browsers.
export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function base64ToBytes(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// RFC 4180 CSV parser (quoted fields, embedded commas, quotes and newlines).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

export function toCsv(rows, columns) {
  const q = (v) => {
    const s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => q(c.label)).join(','), ...rows.map((r) => columns.map((c) => q(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))].join('\r\n');
}
