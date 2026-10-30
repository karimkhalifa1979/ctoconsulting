// The format-neutral content model that every artefact is built as. Builders produce documents
// ({ meta, sections: [{ id, title, blocks }] }), decks ({ meta, slides }) and workbooks
// ({ meta, sheets }); the renderers turn the same content into Word, PDF, HTML, PowerPoint and Excel,
// so every format shows the same figures (Section 8.8).
import { ADKAR, adkarLabel } from '../refdata.js';
import { fmtDate as fd } from '../dates.js';
import { htmlToBlocks, stripHtml, round } from '../util.js';

// Colours as 6-digit hex (Office and PDF take them without '#'). Same palette as the dashboards.
export const SERIES = ['2A78D6', 'EB6834', '1BAF7A', 'EDA100', 'E87BA4', '008300', '6250D6', 'E34948'];
export const SEQ = ['F0F3F7', 'CDE2FB', '9EC5F4', '6DA7EC', '3987E5', '256ABF', '184F95', '0D366B'];
export const DIV = { neg3: 'B52B2B', neg2: 'E06464', neg1: 'F3B2AB', mid: 'F0EFEC', pos1: 'B7D3F6', pos2: '5598E7', pos3: '1C5CAB' };
export const STATUS = {
  good: '0CA30C', goodInk: '006300', goodSoft: 'E3F4E3', warning: 'FAB219', warningInk: '7A5300', warningSoft: 'FDF3DC',
  serious: 'EC835A', seriousInk: '8F3A17', seriousSoft: 'FCE9E1', critical: 'D03B3B', criticalInk: 'A32626', criticalSoft: 'FAE3E3', infoSoft: 'E6F0FB', muted: 'B9C0CA',
};
export const INK = '1B2533';
export const INK2 = '4A5668';
export const LINE = 'C9D1DC';

export const DEFAULT_BRANDING = {
  organisation: '', primary: '#0b1f3a', accent: '#0fa3b1', secondary: '#1d3d69', highlight: '#f2a900', fontHeading: 'Calibri', fontBody: 'Calibri', footer: '', coverNote: '',
};
export const hex = (c, fallback = '0B1F3A') => String(c || fallback).replace('#', '').toUpperCase().slice(0, 6) || fallback;

// Degree of impact 0–5 on the sequential blue ramp; ADKAR scores on the diverging ramp around the threshold.
export const impactFill = (d) => (d == null ? null : SEQ[Math.min(7, Math.round(Number(d)) + 1)]);
export const impactInk = (d) => (d != null && Number(d) >= 3 ? 'FFFFFF' : INK);
export function adkarFill(v, threshold = 3) {
  if (v == null) return null;
  const d = Number(v) - threshold;
  if (d <= -1.5) return DIV.neg3;
  if (d <= -0.75) return DIV.neg2;
  if (d <= 0) return DIV.neg1;
  if (d < 0.75) return DIV.mid;
  if (d < 1.5) return DIV.pos1;
  if (d < 2) return DIV.pos2;
  return DIV.pos3;
}
export const adkarInk = (v, threshold = 3) => (v != null && (Number(v) - threshold <= -1.5 || Number(v) - threshold >= 2) ? 'FFFFFF' : INK);
export const RAG = { green: { fill: STATUS.goodSoft, color: STATUS.goodInk, label: 'On track' }, amber: { fill: STATUS.warningSoft, color: STATUS.warningInk, label: 'At risk' }, red: { fill: STATUS.criticalSoft, color: STATUS.criticalInk, label: 'Off track' } };
export const RISK_COLOURS = { extreme: { fill: STATUS.criticalSoft, color: STATUS.criticalInk }, high: { fill: STATUS.seriousSoft, color: STATUS.seriousInk }, medium: { fill: STATUS.warningSoft, color: STATUS.warningInk }, low: { fill: STATUS.goodSoft, color: STATUS.goodInk } };

// --- Blocks ---------------------------------------------------------------------------------------------
export const h = (level, text) => ({ t: 'h', level, text: String(text ?? '') });
export const p = (text, style) => ({ t: 'p', text: String(text ?? ''), ...(style ? { style } : {}) });
export const runs = (parts, style) => ({ t: 'p', runs: parts.filter(Boolean).map((x) => (typeof x === 'string' ? { text: x } : x)), ...(style ? { style } : {}) });
export const bullets = (items) => ({ t: 'bullets', items: items.filter((x) => x != null && x !== '').map(String) });
export const numbers = (items) => ({ t: 'numbers', items: items.filter((x) => x != null && x !== '').map(String) });
export const callout = (tone, title, text) => ({ t: 'callout', tone, title: title || '', text: String(text ?? '') });
export const placeholder = (text) => ({ t: 'placeholder', text: `[To be completed: ${text}]` });
export const pageBreak = () => ({ t: 'pageBreak' });
export const toc = () => ({ t: 'toc' });

// A table. Columns: [{ label, w (relative width), align: 'l' | 'r' | 'c' }]. Cells: text, numbers or
// { text, fill, color, bold, align }. `empty` is shown when there are no rows.
export function table(columns, rows, { caption, empty = 'None recorded.', small = false, note } = {}) {
  const cols = columns.map((c) => (typeof c === 'string' ? { label: c } : c));
  return { t: 'table', caption: caption || '', columns: cols, rows: rows.map((r) => r.map(cell)), empty, small, note: note || '' };
}
export function cell(v) {
  if (v == null || v === '') return { text: '' };
  if (typeof v === 'object' && !Array.isArray(v)) return { ...v, text: v.text == null ? '' : String(v.text) };
  return { text: Array.isArray(v) ? v.join(', ') : String(v) };
}
// Two-column label/value table. A value made with missing() is shown highlighted, like a placeholder.
export const kv = (rows, { caption } = {}) => ({ t: 'kv', caption: caption || '', rows: rows.filter((r) => r && r[1] != null && r[1] !== '').map(([k, v]) => [String(k), v?.placeholder ? v : Array.isArray(v) ? v.join(', ') : String(v)]) });
// A value still to be completed, for a key/value row (ART-010, AC-07).
export const missing = (text) => ({ placeholder: `[To be completed: ${text}]` });

// A native chart: bar (horizontal), column, stacked (horizontal stacked bars) or line.
export function chart(kind, { title, categories, series, unit = '', max, min, alt, height, legend, threshold, numberFormat }) {
  const s = series.filter((x) => x && x.values?.some((v) => v != null));
  if (!s.length || !categories.length) return { t: 'p', text: `${title ? `${title}: ` : ''}no data to chart yet.`, style: 'small' };
  return {
    t: 'chart', kind, title: title || '', categories: categories.map(String), series: s.map((x, i) => ({ name: x.name, values: x.values.map((v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v))), color: hex(x.color || SERIES[i % SERIES.length]) })),
    unit, max: max ?? null, min: min ?? null, height: height || null, legend: legend ?? s.length > 1, threshold: threshold || null, numberFormat: numberFormat || null,
    alt: alt || describeChart(kind, title, categories, s, unit),
  };
}
function describeChart(kind, title, categories, series, unit) {
  const name = { bar: 'Bar chart', column: 'Column chart', stacked: 'Stacked bar chart', line: 'Line chart' }[kind] || 'Chart';
  const parts = series.map((x) => `${x.name}: ${categories.map((c, i) => `${c} ${x.values[i] == null ? 'no data' : `${round(x.values[i], 2)}${unit}`}`).join(', ')}`);
  return `${name}${title ? `, ${title}` : ''}. ${parts.join('. ')}.`.slice(0, 1500);
}

// Rich text written in the application (ART-021) as blocks; AI drafts not yet accepted are marked (ART-022).
export function rich(html, { aiDrafted = false } = {}) {
  const blocks = htmlToBlocks(html || '').map((b) => (b.t === 'h3' ? h(3, b.text) : b));
  if (aiDrafted && blocks.length) blocks.unshift(callout('warn', 'AI-drafted content', 'This text was drafted with AI assistance and has not yet been reviewed and accepted.'));
  return blocks;
}
export const plain = (html) => stripHtml(html || '');

// --- Formatting ---------------------------------------------------------------------------------------
export const fmtDate = (iso, opts) => (iso ? fd(String(iso).slice(0, 10), opts) : '');
export const fmtNum = (v, dp = 0) => (v == null || v === '' || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-AU', { maximumFractionDigits: dp, minimumFractionDigits: 0 }));
export const fmtPct = (v) => (v == null ? '—' : `${Math.round(v)}%`);
export const fmtMoney = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }));
export const adkarName = (id) => (id === 'none' ? 'No barrier point' : id ? adkarLabel(id) : '');
export const adkarList = (ids) => (ids || []).map((id) => ADKAR.find((a) => a.id === id)?.label).filter(Boolean).join(', ');
export const score = (v) => (v == null ? '—' : Number(v).toFixed(1));

// Column widths from relative weights, widened where needed so the longest unbreakable word in each column
// (dates, codes, numbers) fits, taking the space from columns that can spare it.
export function fitColumns(columns, rows, { total, measure, pad = 0, maxShare = 0.4 }) {
  const weights = columns.map((c) => c.w || 1);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / sumW) * total);
  const words = (t) => String(t ?? '').split(/\s+/).filter(Boolean);
  const mins = columns.map((c, i) => {
    let m = 0;
    for (const r of rows) for (const w of words(r[i]?.text)) m = Math.max(m, measure(w, false));
    if (!c.vertical) for (const w of words(c.label)) m = Math.max(m, measure(w, true));
    return Math.min(total * maxShare, m + pad * 2 + 1);
  });
  for (let pass = 0; pass < 3; pass++) {
    const short = widths.map((w, i) => Math.max(0, mins[i] - w));
    const need = short.reduce((a, b) => a + b, 0);
    if (need < 0.5) break;
    const spare = widths.map((w, i) => (short[i] ? 0 : Math.max(0, w - mins[i])));
    const avail = spare.reduce((a, b) => a + b, 0);
    if (avail < 0.5) break;
    const take = Math.min(need, avail);
    for (let i = 0; i < widths.length; i++) {
      if (short[i]) widths[i] += (short[i] / need) * take;
      else widths[i] -= (spare[i] / avail) * take;
    }
  }
  return widths;
}

// Labels from the snapshot's reference lists, so reproductions show the labels as they were.
export const labeller = (s) => (list, id) => (id == null || id === '' ? '' : s.lists?.[list]?.[id] ?? String(id));
