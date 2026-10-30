// Standard report charts rendered as images (RPT-016): budget burn-down, milestone timeline,
// RAG trend, risk heat map and PO burn-down. Charts are drawn as SVG from snapshot data and
// rasterised to PNG; every chart carries alt text summarising its data (WCAG 2.2).
import { fmtMoneyShort, fmtDate, fmtMoney } from '../../../shared/format.js';

let Resvg = null;
try { ({ Resvg } = await import('@resvg/resvg-js')); } catch { Resvg = null; }

const FONT = 'DejaVu Sans, Liberation Sans, Inter, Arial, sans-serif';
const C = { navy: '#0b1f3a', teal: '#0fa3b1', orange: '#eb6834', grey: '#9aa5b4', grid: '#e2e7ee', ink: '#16212f', ink2: '#4a5768', blue: '#2a78d6' };
const RAG = { Green: '#2E7D32', Amber: '#F2B200', Red: '#C62828' };
const LEVEL = { Low: '#2E7D32', Medium: '#F2B200', High: '#E8710A', Extreme: '#C62828' };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function frame(w, h, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}">
<rect width="${w}" height="${h}" fill="#ffffff"/>
${title ? `<text x="16" y="24" font-size="15" font-weight="bold" fill="${C.navy}">${esc(title)}</text>` : ''}
${body}</svg>`;
}

function legend(items, x, y) {
  let cx = x;
  return items.map(([label, color, dash]) => {
    const s = `<line x1="${cx}" y1="${y}" x2="${cx + 22}" y2="${y}" stroke="${color}" stroke-width="3" ${dash ? 'stroke-dasharray="6 4"' : ''}/><text x="${cx + 28}" y="${y + 4}" font-size="11" fill="${C.ink2}">${esc(label)}</text>`;
    cx += 40 + label.length * 6.4;
    return s;
  }).join('');
}

// Line chart over months with optional reference line.
function lineChart({ w, h, title, months, series, reference, yFormat = fmtMoneyShort }) {
  const pad = { l: 64, r: 18, t: 40, b: 54 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const vals = series.flatMap((s) => s.values.filter((v) => v != null));
  if (reference) vals.push(reference.value);
  const max = Math.max(1, ...vals) * 1.08;
  const min = Math.min(0, ...vals);
  const x = (i) => pad.l + (months.length <= 1 ? iw / 2 : (i / (months.length - 1)) * iw);
  const y = (v) => pad.t + ih - ((v - min) / (max - min)) * ih;
  const ticks = 4;
  let body = '';
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks;
    body += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}"/><text x="${pad.l - 8}" y="${y(v) + 4}" font-size="10.5" text-anchor="end" fill="${C.ink2}">${esc(yFormat(v))}</text>`;
  }
  const step = Math.max(1, Math.ceil(months.length / 10));
  months.forEach((m, i) => {
    if (i % step) return;
    const [yy, mm] = m.split('-');
    body += `<text x="${x(i)}" y="${h - pad.b + 16}" font-size="10.5" text-anchor="middle" fill="${C.ink2}">${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mm) - 1]} ${yy.slice(2)}</text>`;
  });
  if (reference) body += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(reference.value)}" y2="${y(reference.value)}" stroke="${C.grey}" stroke-dasharray="3 3"/><text x="${w - pad.r}" y="${y(reference.value) - 5}" font-size="10.5" text-anchor="end" fill="${C.ink2}">${esc(reference.label)}</text>`;
  for (const s of series) {
    const pts = s.values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`));
    let path = '';
    let started = false;
    pts.forEach((p) => { if (!p) { started = false; return; } path += `${started ? 'L' : 'M'}${p} `; started = true; });
    body += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.6" ${s.dash ? 'stroke-dasharray="7 5"' : ''} stroke-linejoin="round"/>`;
  }
  body += legend(series.map((s) => [s.label, s.color, s.dash]), pad.l, h - 14);
  return frame(w, h, body, title);
}

export function budgetBurn(data, { audience }) {
  const client = audience === 'client';
  const months = data.months.map((m) => m.month);
  const total = client ? data.contractValue || data.eacRevenue : data.bac;
  if (!months.length || !total) return null;
  let plan = 0, act = 0, fc = 0;
  const planned = [], actual = [], forecast = [];
  data.months.forEach((m) => {
    plan += client ? m.budgetRevenue : m.budgetCost;
    planned.push(Math.max(0, total - plan));
    if (m.month <= data.asAtMonth) {
      act += client ? m.actualRevenue : m.actualCost;
      actual.push(total - act);
      forecast.push(m.month === data.asAtMonth ? total - act : null);
      fc = act;
    } else {
      actual.push(null);
      fc += client ? m.forecastRevenue : m.forecastCost;
      forecast.push(total - fc);
    }
  });
  const label = client ? 'Fees remaining' : 'Budget remaining (cost)';
  const svg = lineChart({
    w: 760, h: 340, title: client ? 'Contract value burn-down (fees)' : 'Budget burn-down (cost)', months,
    series: [{ label: 'Planned', values: planned, color: C.grey, dash: true }, { label: 'Actual', values: actual, color: C.navy }, { label: 'Forecast', values: forecast, color: C.orange, dash: true }],
    reference: { value: 0, label: '' },
  });
  const remaining = actual.filter((v) => v != null).at(-1);
  const end = forecast.filter((v) => v != null).at(-1);
  return { svg, alt: `${label}: ${fmtMoney(remaining)} of ${fmtMoney(total)} remaining as at ${fmtDate(data.asAt)}; forecast ${end < 0 ? `to exceed by ${fmtMoney(-end)}` : `to finish with ${fmtMoney(end)} remaining`}.` };
}

export function poBurn(data) {
  if (!data.po || !data.po.value) return null;
  const months = data.months.map((m) => m.month);
  let cum = data.po.consumedBefore || 0;
  const actual = [], forecast = [];
  for (const m of data.months) {
    if (m.month <= data.asAtMonth) { cum += m.billing || 0; actual.push(data.po.value - cum); forecast.push(m.month === data.asAtMonth ? data.po.value - cum : null); }
    else { cum += m.billing || 0; actual.push(null); forecast.push(data.po.value - cum); }
  }
  const svg = lineChart({ w: 760, h: 320, title: `PO ${data.po.number} burn-down`, months, series: [{ label: 'Remaining (actual)', values: actual, color: C.navy }, { label: 'Remaining (forecast)', values: forecast, color: C.orange, dash: true }], reference: { value: 0, label: 'Exhausted' } });
  return { svg, alt: `PO ${data.po.number}: ${Math.round((data.po.consumedPct || 0) * 100)}% consumed${data.po.exhaustionDate ? `; forecast exhaustion ${fmtDate(data.po.exhaustionDate)}` : ''}.` };
}

export function milestoneTimeline(data) {
  const ms = (data.milestones || []).filter((m) => m.baseline_date || m.forecast_date || m.actual_date).slice(0, 12);
  if (!ms.length) return null;
  const dates = ms.flatMap((m) => [m.baseline_date, m.forecast_date, m.actual_date]).filter(Boolean).concat(data.today ? [data.today] : []).sort();
  const t0 = new Date(dates[0]).getTime(), t1 = new Date(dates.at(-1)).getTime() || t0 + 1;
  const w = 760, rowH = 26, pad = { l: 230, r: 30, t: 44, b: 52 };
  const h = pad.t + ms.length * rowH + pad.b;
  const x = (d) => pad.l + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (w - pad.l - pad.r);
  const color = (m) => (m.actual_date ? RAG.Green : m.status === 'Missed' ? RAG.Red : m.status === 'Forecast late' || m.status === 'At risk' ? RAG.Amber : C.blue);
  let body = '';
  if (data.today) body += `<line x1="${x(data.today)}" x2="${x(data.today)}" y1="${pad.t - 8}" y2="${h - pad.b + 4}" stroke="${C.teal}" stroke-dasharray="4 3"/><text x="${x(data.today)}" y="${pad.t - 12}" font-size="10" text-anchor="middle" fill="${C.teal}">Today</text>`;
  ms.forEach((m, i) => {
    const cy = pad.t + i * rowH + rowH / 2;
    const name = m.name.length > 32 ? `${m.name.slice(0, 31)}…` : m.name;
    body += `<text x="${pad.l - 10}" y="${cy + 4}" font-size="11" text-anchor="end" fill="${C.ink}">${esc(name)}</text><line x1="${pad.l}" x2="${w - pad.r}" y1="${cy}" y2="${cy}" stroke="${C.grid}"/>`;
    const d = (cx, fill, stroke) => `<path d="M${cx},${cy - 7} L${cx + 7},${cy} L${cx},${cy + 7} L${cx - 7},${cy} Z" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
    if (m.baseline_date) body += d(x(m.baseline_date), '#ffffff', C.grey);
    const at = m.actual_date || m.forecast_date;
    if (at) {
      if (m.baseline_date && at !== m.baseline_date) body += `<line x1="${x(m.baseline_date)}" x2="${x(at)}" y1="${cy}" y2="${cy}" stroke="${color(m)}" stroke-width="2"/>`;
      body += d(x(at), color(m), color(m));
    }
  });
  const [a, b] = [dates[0], dates.at(-1)];
  body += `<text x="${pad.l}" y="${h - 32}" font-size="10.5" fill="${C.ink2}">${esc(fmtDate(a))}</text><text x="${w - pad.r}" y="${h - 32}" font-size="10.5" text-anchor="end" fill="${C.ink2}">${esc(fmtDate(b))}</text>`;
  body += `<text x="16" y="${h - 10}" font-size="10.5" fill="${C.ink2}">◇ baseline   ◆ forecast or actual: green achieved, blue on track, amber late or at risk, red missed</text>`;
  const late = ms.filter((m) => ['Forecast late', 'Missed', 'At risk'].includes(m.status));
  return { svg: frame(w, h, body, 'Milestone timeline'), alt: `Milestone timeline of ${ms.length} milestones; ${ms.filter((m) => m.actual_date).length} achieved, ${late.length} late, missed or at risk${late.length ? `: ${late.map((m) => m.name).join(', ')}` : ''}.` };
}

export function ragTrend(data) {
  const hist = (data.history || []).slice(-12);
  if (!hist.length) return null;
  const dims = [['overall', 'Overall'], ['schedule', 'Schedule'], ['budget', 'Budget'], ['scope', 'Scope'], ['risk', 'Risks and issues'], ['resource', 'Resources'], ['quality', 'Quality']];
  const w = 760, pad = { l: 130, t: 44, r: 16 }, cell = Math.min(48, (w - pad.l - pad.r) / hist.length), rowH = 26;
  const h = pad.t + dims.length * rowH + 40;
  let body = '';
  hist.forEach((p, i) => {
    body += `<text x="${pad.l + i * cell + cell / 2}" y="${pad.t - 8}" font-size="10" text-anchor="middle" fill="${C.ink2}">${esc(p.period_end.slice(8, 10))}/${esc(p.period_end.slice(5, 7))}</text>`;
  });
  dims.forEach(([k, label], r) => {
    const y = pad.t + r * rowH;
    body += `<text x="${pad.l - 10}" y="${y + rowH / 2 + 4}" font-size="11" text-anchor="end" fill="${C.ink}" ${k === 'overall' ? 'font-weight="bold"' : ''}>${esc(label)}</text>`;
    hist.forEach((p, i) => {
      const v = p[k];
      const fill = RAG[v] || '#eef2f7';
      body += `<rect x="${pad.l + i * cell + 2}" y="${y + 2}" width="${cell - 4}" height="${rowH - 4}" rx="3" fill="${fill}"/><text x="${pad.l + i * cell + cell / 2}" y="${y + rowH / 2 + 4}" font-size="11" font-weight="bold" text-anchor="middle" fill="${v === 'Amber' ? '#000' : '#fff'}">${v ? v[0] : '–'}</text>`;
    });
  });
  body += `<text x="${pad.l}" y="${h - 12}" font-size="10.5" fill="${C.ink2}">G = Green, A = Amber, R = Red; columns are reporting weeks (week ending).</text>`;
  const last = hist.at(-1);
  return { svg: frame(w, h, body, 'RAG trend'), alt: `RAG trend over ${hist.length} periods; latest overall rating ${last.overall || 'not rated'} for week ending ${fmtDate(last.period_end)}.` };
}

export function riskHeatmap(data) {
  const grid = data.heatmap || Array.from({ length: 5 }, () => Array(5).fill(0));
  const levels = data.matrix || null;
  const w = 520, h = 400, pad = { l: 110, t: 46, b: 70 }, cell = 62;
  const L = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];
  const Cn = ['Insignificant', 'Minor', 'Moderate', 'Major', 'Severe'];
  let body = '';
  let total = 0;
  for (let l = 5; l >= 1; l--) {
    const y = pad.t + (5 - l) * cell;
    body += `<text x="${pad.l - 8}" y="${y + cell / 2 + 4}" font-size="10.5" text-anchor="end" fill="${C.ink2}">${L[l - 1]}</text>`;
    for (let c = 1; c <= 5; c++) {
      const lvl = levels ? levels[l - 1][c - 1] : (l * c >= 20 ? 'Extreme' : l * c >= 10 ? 'High' : l * c >= 5 ? 'Medium' : 'Low');
      const n = grid[l - 1][c - 1] || 0;
      total += n;
      const x = pad.l + (c - 1) * cell;
      body += `<rect x="${x + 1}" y="${y + 1}" width="${cell - 2}" height="${cell - 2}" fill="${LEVEL[lvl]}" opacity="${n ? 1 : 0.35}"/>`;
      if (n) body += `<text x="${x + cell / 2}" y="${y + cell / 2 + 6}" font-size="17" font-weight="bold" text-anchor="middle" fill="${lvl === 'Medium' ? '#000' : '#fff'}">${n}</text>`;
    }
  }
  for (let c = 1; c <= 5; c++) body += `<text x="${pad.l + (c - 1) * cell + cell / 2}" y="${pad.t + 5 * cell + 16}" font-size="10" text-anchor="middle" fill="${C.ink2}">${Cn[c - 1]}</text>`;
  body += `<text x="${pad.l + 2.5 * cell}" y="${h - 14}" font-size="11" text-anchor="middle" fill="${C.ink}">Consequence</text><text x="18" y="${pad.t + 2.5 * cell}" font-size="11" fill="${C.ink}" transform="rotate(-90 18 ${pad.t + 2.5 * cell})" text-anchor="middle">Likelihood</text>`;
  const counts = { Extreme: 0, High: 0, Medium: 0, Low: 0 };
  for (let l = 1; l <= 5; l++) for (let c = 1; c <= 5; c++) { const lvl = levels ? levels[l - 1][c - 1] : null; if (lvl) counts[lvl] += grid[l - 1][c - 1] || 0; }
  return { svg: frame(w, h, body, `Risk heat map (${data.residual ? 'residual' : 'current'})`), alt: `Risk heat map of ${total} open risks: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}.` };
}

const BUILDERS = { budget_burn: budgetBurn, milestone_timeline: milestoneTimeline, rag_trend: ragTrend, risk_heatmap: riskHeatmap, po_burn: poBurn };

export function chartSvg(name, data, opts = {}) {
  const b = BUILDERS[name];
  if (!b || !data) return null;
  const out = b(data, opts);
  if (!out) return null;
  const m = out.svg.match(/width="(\d+)" height="(\d+)"/);
  return { ...out, ratio: m ? Number(m[2]) / Number(m[1]) : 0.45 };
}

export function svgToPng(svg, widthCm = 16) {
  if (!Resvg) return null;
  const px = Math.round((widthCm / 2.54) * 200);
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: px }, font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' }, background: '#ffffff' });
  return r.render().asPng();
}

export const chartsAvailable = () => Boolean(Resvg);
