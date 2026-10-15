// Standalone SVG charts for documents (print, PDF and Word). Explicit hex colours so the SVGs
// render identically when rasterised into a .docx.
import { layout, NODE_W, NODE_H, elById } from './chain.js';
import { money, quarterLabel, esc } from './util.js';
import { ARES } from './config.js';

const C = { ben: '#1baf7a', cost: '#eb6834', net: '#2a78d6', neg: '#e34948', grid: '#e7ebf0', axis: '#c3c9d2', ink: '#16212f', ink2: '#4a5768', ink3: '#7b8796', navy: '#0b1f3a', gold: '#f2a900' };
const FONT = 'font-family="Arial, Helvetica, sans-serif"';
const sc = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
function ticks(min, max, count = 5) {
  if (min === max) { min -= 1; max += 1; }
  const step0 = (max - min) / count; const mag = 10 ** Math.floor(Math.log10(step0)); const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.5; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}
const yAxis = (t, y, x0, x1, fmt) => t.map((v) => `<line x1="${x0}" x2="${x1}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? C.axis : C.grid}"/><text x="${x0 - 6}" y="${y(v) + 3.5}" font-size="10" fill="${C.ink3}" text-anchor="end">${esc(fmt(v))}</text>`).join('');
const wrapSvg = (w, h, body, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${FONT} role="img" aria-label="${esc(label)}"><rect width="${w}" height="${h}" fill="#ffffff"/>${body}</svg>`;
const legend = (items, x, y) => items.map(([label, color, kind], i) => { const xx = x + i * 150; return `${kind === 'line' ? `<line x1="${xx}" x2="${xx + 14}" y1="${y - 4}" y2="${y - 4}" stroke="${color}" stroke-width="2.5"/>` : `<rect x="${xx}" y="${y - 9}" width="10" height="10" rx="2" fill="${color}"/>`}<text x="${xx + 18}" y="${y}" font-size="10.5" fill="${C.ink2}">${esc(label)}</text>`; }).join('');

export function cashflowSvg(annual, w = 640, h = 270) {
  const m = { l: 58, r: 12, t: 12, b: 50 };
  const lo = Math.min(0, ...annual.map((a) => -a.costs), ...annual.map((a) => a.cum));
  const hi = Math.max(0, ...annual.map((a) => a.benefits), ...annual.map((a) => a.cum));
  const t = ticks(lo, hi, 5); const y = sc(t[0], t[t.length - 1], h - m.b, m.t);
  const band = (w - m.l - m.r) / Math.max(1, annual.length); const bw = Math.min(20, band * 0.36);
  const xc = (i) => m.l + band * i + band / 2;
  let body = yAxis(t, y, m.l, w - m.r, (v) => money(v));
  annual.forEach((a, i) => {
    body += `<rect x="${xc(i) - bw - 1}" y="${y(a.benefits)}" width="${bw}" height="${Math.max(0, y(0) - y(a.benefits))}" rx="2" fill="${C.ben}"/>`;
    body += `<rect x="${xc(i) + 1}" y="${y(0)}" width="${bw}" height="${Math.max(0, y(-a.costs) - y(0))}" rx="2" fill="${C.cost}"/>`;
    body += `<text x="${xc(i)}" y="${h - m.b + 14}" font-size="9.5" fill="${C.ink3}" text-anchor="middle">${esc(a.label)}</text>`;
  });
  body += `<path d="${annual.map((a, i) => `${i ? 'L' : 'M'}${xc(i)},${y(a.cum)}`).join(' ')}" fill="none" stroke="${C.net}" stroke-width="2"/>`;
  body += annual.map((a, i) => `<circle cx="${xc(i)}" cy="${y(a.cum)}" r="3.2" fill="${C.net}" stroke="#fff" stroke-width="1.5"/>`).join('');
  body += legend([['Benefits', C.ben], ['Costs', C.cost], ['Cumulative net', C.net, 'line']], m.l, h - 10);
  return wrapSvg(w, h, body, 'Annual benefits, costs and cumulative net cash flow');
}

export function histogramSvg(bins, total, markers = [], w = 640, h = 250) {
  const m = { l: 42, r: 12, t: 24, b: 46 };
  if (!bins.length) return wrapSvg(w, h, '', 'No data');
  const x = sc(bins[0].x0, bins[bins.length - 1].x1, m.l, w - m.r);
  const maxS = Math.max(...bins.map((b) => (b.count / total) * 100), 1);
  const t = ticks(0, maxS, 4); const y = sc(0, t[t.length - 1], h - m.b, m.t);
  let body = yAxis(t, y, m.l, w - m.r, (v) => `${v}%`);
  for (const b of bins) {
    const s = (b.count / total) * 100; const x0 = x(b.x0) + 0.75; const bw = Math.max(1, x(b.x1) - x(b.x0) - 1.5);
    body += `<rect x="${x0}" y="${y(s)}" width="${bw}" height="${Math.max(0, y(0) - y(s))}" rx="1.5" fill="${b.x1 <= 0 ? C.neg : b.x0 >= 0 ? C.net : '#9aa7b8'}"/>`;
  }
  const xt = ticks(bins[0].x0, bins[bins.length - 1].x1, 6).filter((v) => v >= bins[0].x0 && v <= bins[bins.length - 1].x1);
  body += xt.map((v) => `<text x="${x(v)}" y="${h - m.b + 14}" font-size="9.5" fill="${C.ink3}" text-anchor="middle">${esc(money(v))}</text>`).join('');
  body += `<text x="${(m.l + w - m.r) / 2}" y="${h - m.b + 28}" font-size="10" fill="${C.ink3}" text-anchor="middle">Net present value</text>`;
  markers.forEach((mk) => { if (mk.value < bins[0].x0 || mk.value > bins[bins.length - 1].x1) return; body += `<line x1="${x(mk.value)}" x2="${x(mk.value)}" y1="${m.t - 6}" y2="${h - m.b}" stroke="${mk.color || C.navy}" stroke-width="${mk.strong ? 2 : 1.2}" ${mk.dash ? 'stroke-dasharray="4 3"' : ''}/><text x="${x(mk.value)}" y="${m.t - 9}" font-size="10" font-weight="700" fill="${mk.color || C.navy}" text-anchor="middle">${esc(mk.label)}</text>`; });
  body += legend([['NPV below zero', C.neg], ['NPV above zero', C.net]], m.l, h - 6);
  return wrapSvg(w, h, body, 'Distribution of NPV from Monte Carlo simulation');
}

export function fanSvg(fan, base, w = 640, h = 260) {
  const m = { l: 58, r: 12, t: 12, b: 46 };
  const lo = Math.min(0, ...fan.map((f) => f.p10), ...base); const hi = Math.max(0, ...fan.map((f) => f.p90), ...base);
  const t = ticks(lo, hi, 5); const y = sc(t[0], t[t.length - 1], h - m.b, m.t); const x = sc(0, fan.length - 1, m.l, w - m.r);
  const band = (a, b) => `${fan.map((f, i) => `${i ? 'L' : 'M'}${x(i)},${y(f[a])}`).join(' ')} ${fan.slice().reverse().map((f, i) => `L${x(fan.length - 1 - i)},${y(f[b])}`).join(' ')} Z`;
  let body = yAxis(t, y, m.l, w - m.r, (v) => money(v));
  body += `<path d="${band('p90', 'p10')}" fill="${C.net}" fill-opacity="0.12"/><path d="${band('p75', 'p25')}" fill="${C.net}" fill-opacity="0.22"/>`;
  body += `<path d="${fan.map((f, i) => `${i ? 'L' : 'M'}${x(i)},${y(f.p50)}`).join(' ')}" fill="none" stroke="${C.net}" stroke-width="2"/>`;
  body += `<path d="${base.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="${C.navy}" stroke-width="1.4" stroke-dasharray="5 4"/>`;
  const every = Math.ceil(fan.length / 8);
  body += fan.map((f, i) => (i % every === 0 ? `<text x="${x(i)}" y="${h - m.b + 14}" font-size="9.5" fill="${C.ink3}" text-anchor="middle">${esc(quarterLabel(f.key))}</text>` : '')).join('');
  body += legend([['P10–P90', '#c9dcf3'], ['P25–P75', '#a3c4ec'], ['Median', C.net, 'line'], ['Base case', C.navy, 'line']], m.l, h - 8);
  return wrapSvg(w, h, body, 'Cumulative net cash flow fan chart');
}

export function tornadoSvg(rows, base, w = 640) {
  const rowH = 24; const h = rows.length * rowH + 44; const labelW = 250;
  const m = { l: labelW + 8, r: 14, t: 6, b: 38 };
  const lo = Math.min(base, ...rows.map((r) => Math.min(r.low, r.high))); const hi = Math.max(base, ...rows.map((r) => Math.max(r.low, r.high)));
  const xt = ticks(lo, hi, 4); const x = sc(xt[0], xt[xt.length - 1], m.l, w - m.r);
  let body = xt.map((v) => `<line x1="${x(v)}" x2="${x(v)}" y1="${m.t}" y2="${h - m.b}" stroke="${C.grid}"/><text x="${x(v)}" y="${h - m.b + 14}" font-size="9.5" fill="${C.ink3}" text-anchor="middle">${esc(money(v))}</text>`).join('');
  rows.forEach((r, i) => {
    const yy = m.t + i * rowH; const a = Math.min(r.low, r.high); const b = Math.max(r.low, r.high);
    body += `<text x="${labelW}" y="${yy + rowH / 2 + 4}" font-size="10.5" fill="${C.ink2}" text-anchor="end">${esc(r.label.length > 42 ? `${r.label.slice(0, 40)}…` : r.label)}</text>`;
    if (a < base) body += `<rect x="${x(a)}" y="${yy + 5}" width="${Math.max(1, x(Math.min(b, base)) - x(a))}" height="${rowH - 10}" rx="2" fill="${C.neg}"/>`;
    if (b > base) body += `<rect x="${x(Math.max(a, base))}" y="${yy + 5}" width="${Math.max(1, x(b) - x(Math.max(a, base)))}" height="${rowH - 10}" rx="2" fill="${C.net}"/>`;
  });
  body += `<line x1="${x(base)}" x2="${x(base)}" y1="${m.t - 2}" y2="${h - m.b}" stroke="${C.navy}" stroke-width="2"/>`;
  body += legend([['Downside', C.neg], ['Upside', C.net], [`Base ${money(base)}`, C.navy, 'line']], m.l - labelW + 10, h - 6);
  return wrapSvg(w, h, body, 'Tornado chart of NPV drivers');
}

export function riskIconSvg(byAre, bandOf, size = 120) {
  const h = size / 2; const pos = [['right', 0, 0], ['way', 1, 0], ['well', 0, 1], ['benefits', 1, 1]];
  let body = '';
  for (const [id, cx, cy] of pos) {
    const s = byAre?.[id]?.score; const b = bandOf(s);
    body += `<rect x="${cx * h + 2}" y="${cy * h + 2}" width="${h - 4}" height="${h - 4}" rx="4" fill="${b.hex}"/><text x="${cx * h + h / 2}" y="${cy * h + h / 2 - 2}" font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(ARES.find((a) => a.id === id).short)}</text><text x="${cx * h + h / 2}" y="${cy * h + h / 2 + 13}" font-size="12" font-weight="700" fill="#ffffff" text-anchor="middle">${s === null || s === undefined ? '–' : Math.round(s)}</text>`;
  }
  return wrapSvg(size, size, body, 'Four-quadrant risk profile');
}

// Simplified benefits map for documents.
export function chainSvg(chain, { highlightPath } = {}) {
  const L = layout({ ...chain, elements: chain.elements.map((e) => ({ ...e, pinned: false })) });
  const w = L.w; const h = L.h;
  const keep = highlightPath ? new Set(highlightPath.elementIds) : null;
  let body = '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#5b6b80"/></marker></defs>';
  for (const l of chain.links) {
    const a = elById(chain, l.from); const b = elById(chain, l.to); const pa = L.pos[l.from]; const pb = L.pos[l.to];
    if (!a || !b || !pa || !pb) continue;
    const op = keep && !(keep.has(a.id) && keep.has(b.id)) ? 0.2 : 1;
    if (a.kind === 'assumption') { const x1 = pa.x + NODE_W / 2; const y1 = pa.y + NODE_H; const x2 = pb.x + NODE_W / 2; const y2 = pb.y; body += `<path d="M${x1},${y1} C${x1},${y1 + 20} ${x2},${y2 - 20} ${x2},${y2 - 2}" fill="none" stroke="#c98500" stroke-width="1.4" stroke-dasharray="5 4" opacity="${op}"/>`; continue; }
    const x1 = pa.x + NODE_W; const y1 = pa.y + NODE_H / 2; const x2 = pb.x; const y2 = pb.y + NODE_H / 2;
    body += `<path d="M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2 - 2},${y2}" fill="none" stroke="#5b6b80" stroke-width="${{ high: 2.4, medium: 1.6, low: 1 }[l.strength] || 1.6}" marker-end="url(#a)" opacity="${op}"/>`;
  }
  for (const e of chain.elements) {
    const q = L.pos[e.id]; if (!q) continue;
    const op = keep && !keep.has(e.id) ? 0.25 : 1;
    const fill = e.kind === 'initiative' ? '#e8f1fc' : e.kind === 'assumption' ? '#fff6dc' : e.final ? '#d4f0e5' : '#e6f6f0';
    const stroke = e.kind === 'initiative' ? '#2a78d6' : e.kind === 'assumption' ? '#c98500' : '#148a61';
    const shape = e.kind === 'outcome' ? `<rect width="${NODE_W}" height="${NODE_H}" rx="${NODE_H / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${e.final ? 2.4 : 1.3}"/>` : e.kind === 'assumption' ? `<path d="M14,0 H${NODE_W} L${NODE_W - 14},${NODE_H} H0 Z" fill="${fill}" stroke="${stroke}" stroke-dasharray="5 3"/>` : `<rect width="${NODE_W}" height="${NODE_H}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>`;
    const words = String(e.title).split(/\s+/); const lines = []; let cur = '';
    for (const wd of words) { if ((cur + ' ' + wd).trim().length > 27) { lines.push(cur.trim()); cur = wd; } else cur += ` ${wd}`; }
    if (cur.trim()) lines.push(cur.trim());
    const anchor = e.kind === 'outcome' ? `x="${NODE_W / 2}" text-anchor="middle"` : 'x="12"';
    body += `<g transform="translate(${q.x},${q.y})" opacity="${op}">${shape}<text x="12" y="15" font-size="10" font-weight="700" fill="${C.ink2}">${esc(e.code)}${e.kind === 'initiative' && e.btopp?.length ? ` · ${esc(e.btopp.join(' '))}` : ''}${e.final ? ' · FINAL' : ''}</text>${lines.slice(0, 3).map((ln, i) => `<text ${anchor} y="${31 + i * 12.5}" font-size="11" font-weight="600" fill="${C.ink}">${esc(ln)}</text>`).join('')}</g>`;
  }
  return wrapSvg(w, h, body, 'Benefits map');
}

export function profileSvg(rows, { financial, w = 640, h = 220 }) {
  const m = { l: 58, r: 12, t: 12, b: 34 };
  const vals = rows.flatMap((r) => [r.forecast, r.actual].filter((v) => v !== null && v !== undefined));
  const t = ticks(Math.min(0, ...vals), Math.max(0, ...vals), 4); const y = sc(t[0], t[t.length - 1], h - m.b, m.t);
  const band = (w - m.l - m.r) / Math.max(1, rows.length);
  let body = yAxis(t, y, m.l, w - m.r, (v) => (financial ? money(v) : String(Math.round(v * 10) / 10)));
  body += `<path d="${rows.map((r, i) => `${i ? 'L' : 'M'}${m.l + band * i},${y(r.forecast)} L${m.l + band * (i + 1)},${y(r.forecast)}`).join(' ')}" fill="none" stroke="${C.ben}" stroke-width="2"/>`;
  rows.forEach((r, i) => { if (r.actual !== null) body += `<circle cx="${m.l + band * i + band / 2}" cy="${y(r.actual)}" r="3.5" fill="${C.net}" stroke="#fff" stroke-width="1.5"/>`; if (i % 4 === 0) body += `<text x="${m.l + band * i + band / 2}" y="${h - m.b + 14}" font-size="9.5" fill="${C.ink3}" text-anchor="middle">${esc(quarterLabel(r.period))}</text>`; });
  body += legend([['Forecast', C.ben, 'line'], ['Actual', C.net]], m.l, h - 6);
  return wrapSvg(w, h, body, 'Benefit profile');
}

export const svgSize = (svg) => { const m = svg.match(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/); return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 640, h: 260 }; };
