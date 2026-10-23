// HTML renderer for intranet publication (ART-030) and the live preview before generating (UC-07 step 7).
// A standalone, accessible page: one heading hierarchy, tables with captions and header cells, charts as
// inline SVG with text alternatives and the data behind them, and no external resources.
import { escapeHtml as esc } from '../../util.js';
import { hex, fmtDate, fmtNum, INK, INK2, LINE, STATUS } from '../ir.js';

const CALLOUT = { info: [STATUS.infoSoft, '2A78D6'], warn: [STATUS.warningSoft, STATUS.warning], bad: [STATUS.criticalSoft, STATUS.critical], good: [STATUS.goodSoft, STATUS.good] };

function css(b) {
  const primary = `#${hex(b.primary)}`, accent = `#${hex(b.accent, '0FA3B1')}`;
  return `
:root { --primary: ${primary}; --accent: ${accent}; --ink: #${INK}; --ink2: #${INK2}; --line: #${LINE}; }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.55 ${b.fontBody ? `"${b.fontBody}", ` : ''}"Segoe UI", system-ui, -apple-system, Arial, sans-serif; color: var(--ink); background: #fff; }
.page { max-width: 980px; margin: 0 auto; padding: 24px 28px 64px; }
.marking { text-align: center; font-weight: 700; font-size: 12px; letter-spacing: .06em; color: #a32626; padding: 6px 0; }
.cover { background: var(--primary); color: #fff; padding: 36px 28px 30px; border-bottom: 6px solid var(--accent); }
.cover .org { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
.cover h1 { margin: 8px 0 4px; font-size: 32px; line-height: 1.2; }
.cover .sub { color: #dde6f0; font-size: 17px; }
.cover .ini { margin-top: 14px; font-size: 17px; }
.meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px 18px; margin: 18px 0 8px; font-size: 13px; color: var(--ink2); }
.meta b { display: block; color: var(--ink); font-weight: 600; }
nav.toc { border: 1px solid var(--line); border-radius: 8px; padding: 12px 18px; margin: 18px 0; }
nav.toc h2 { font-size: 15px; margin: 0 0 6px; color: var(--primary); }
nav.toc ul { margin: 0; padding: 0; list-style: none; columns: 2; column-gap: 32px; font-size: 13.5px; }
nav.toc li { margin: 0 0 3px; break-inside: avoid; }
nav.toc a { color: var(--primary); text-decoration: none; }
h2 { color: var(--primary); font-size: 22px; margin: 34px 0 10px; padding-top: 8px; border-top: 1px solid var(--line); }
h3 { color: var(--primary); font-size: 17px; margin: 22px 0 8px; }
h4 { color: #1d3d69; font-size: 15px; margin: 16px 0 6px; }
p { margin: 0 0 10px; }
p.small, p.muted { font-size: 13px; color: var(--ink2); }
p.lead { font-size: 17px; color: var(--ink2); }
p.strong { font-weight: 600; }
.tbl-wrap { overflow-x: auto; margin: 6px 0 16px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
table.small { font-size: 12px; }
caption { text-align: left; font-weight: 600; color: var(--ink2); font-size: 12.5px; padding: 4px 0; }
th, td { border-bottom: 1px solid var(--line); padding: 5px 7px; text-align: left; vertical-align: top; }
thead th { background: var(--primary); color: #fff; font-weight: 600; vertical-align: bottom; }
thead th.v { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; height: 130px; }
td.r, th.r { text-align: right; font-variant-numeric: tabular-nums; } td.c, th.c { text-align: center; }
table.kv th { width: 30%; background: #f0f3f7; color: var(--ink); font-weight: 600; }
.note { font-size: 12px; font-style: italic; color: var(--ink2); margin: -10px 0 14px; }
aside.callout { border-left: 4px solid; padding: 9px 14px; border-radius: 4px; margin: 10px 0 14px; font-size: 14px; }
mark.ph { background: #fff4c2; color: #7a5300; font-style: italic; padding: 2px 6px; display: inline-block; margin: 0 0 10px; }
figure { margin: 8px 0 18px; } figcaption { font-weight: 600; color: var(--ink2); font-size: 12.5px; margin-bottom: 4px; }
figure svg { width: 100%; height: auto; display: block; }
details { font-size: 12.5px; margin-top: 4px; } summary { cursor: pointer; color: var(--ink2); }
.slide { border: 1px solid var(--line); border-radius: 10px; padding: 22px 26px; margin: 22px 0; aspect-ratio: 16 / 9; overflow: hidden; position: relative; }
.slide.title { background: var(--primary); color: #fff; display: flex; flex-direction: column; justify-content: flex-end; }
.slide.title h2 { color: #fff; border: 0; font-size: 30px; }
.slide h2 { border: 0; margin: 0 0 14px; padding: 0; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 6px 0 14px; }
.kpi { border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; } .kpi span { display: block; font-size: 12px; color: var(--ink2); } .kpi strong { font-size: 24px; } .kpi small { display: block; color: var(--ink2); }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 22px; }
footer { margin-top: 40px; font-size: 12px; color: var(--ink2); border-top: 1px solid var(--line); padding-top: 10px; }
.wm { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; font-size: 140px; font-weight: 800; color: rgba(90, 100, 114, .06); transform: rotate(-30deg); z-index: 0; }
@media print { .page { max-width: none; padding: 0; } h2 { break-after: avoid; } table, figure { break-inside: avoid; } nav.toc { break-after: page; } }
`;
}

const align = (a) => (a === 'r' ? 'r' : a === 'c' ? 'c' : '');
const cellStyle = (c) => [c.fill ? `background:#${hex(c.fill)}` : '', c.color ? `color:#${hex(c.color)}` : '', c.bold ? 'font-weight:600' : ''].filter(Boolean).join(';');
const text = (t) => esc(t).replace(/\n/g, '<br>');

function tableHtml(b, n) {
  if (!b.rows.length) return `${b.caption ? `<p class="small"><strong>Table ${n}: ${esc(b.caption)}</strong></p>` : ''}<p class="note" style="margin:0 0 14px">${esc(b.empty || 'None recorded.')}</p>`;
  const head = `<thead><tr>${b.columns.map((c) => `<th scope="col" class="${[align(c.align), c.vertical ? 'v' : ''].filter(Boolean).join(' ')}">${text(c.label)}</th>`).join('')}</tr></thead>`;
  const body = `<tbody>${b.rows.map((r) => `<tr>${b.columns.map((c, i) => { const cell = r[i] || { text: '' }; const st = cellStyle(cell); return `<td class="${align(cell.align || c.align)}"${st ? ` style="${st}"` : ''}>${text(cell.text)}</td>`; }).join('')}</tr>`).join('')}</tbody>`;
  return `<div class="tbl-wrap"><table class="${b.small ? 'small' : ''}">${b.caption ? `<caption>Table ${n}: ${esc(b.caption)}</caption>` : ''}${head}${body}</table></div>${b.note ? `<p class="note">${esc(b.note)}</p>` : ''}`;
}

// Charts as inline SVG drawn in a 640-unit-wide view box.
export function chartSvg(b) {
  const W = 640;
  const horizontal = b.kind === 'bar' || b.kind === 'stacked';
  const stacked = b.kind === 'stacked';
  const totals = stacked ? b.categories.map((_, i) => b.series.reduce((a, s) => a + (s.values[i] || 0), 0)) : b.series.flatMap((s) => s.values.filter((v) => v != null));
  const rawMax = Math.max(0, ...totals, b.threshold?.value || 0);
  const max = b.max ?? (rawMax <= 0 ? 1 : (() => { const p = 10 ** Math.floor(Math.log10(rawMax / 4)); for (const k of [1, 2, 2.5, 5, 10]) if (rawMax / (k * p) <= 4.0001) return Math.ceil(rawMax / (k * p) - 1e-9) * k * p; return rawMax; })());
  const min = b.min ?? 0;
  const out = [];
  let H;
  if (horizontal) {
    const labelW = 190, plotW = W - labelW - 50, band = 26;
    H = 12 + b.categories.length * band + 26 + (b.legend ? 22 : 0);
    const sx = (v) => ((Math.max(min, Math.min(max, v)) - min) / (max - min || 1)) * plotW;
    for (let t = 0; t <= 4; t++) { const v = min + ((max - min) * t) / 4; const x = labelW + sx(v); out.push(`<line x1="${x}" x2="${x}" y1="6" y2="${H - 22 - (b.legend ? 22 : 0)}" stroke="#E3E7EE"/><text x="${x}" y="${H - 8 - (b.legend ? 22 : 0)}" font-size="10" text-anchor="middle" fill="#${INK2}">${fmtNum(v, max - min < 10 ? 1 : 0)}</text>`); }
    b.categories.forEach((cat, i) => {
      const y = 10 + i * band;
      out.push(`<text x="${labelW - 8}" y="${y + 14}" font-size="11" text-anchor="end" fill="#${INK}">${esc(cat.length > 32 ? `${cat.slice(0, 31)}…` : cat)}</text>`);
      let acc = 0;
      const h = stacked ? 16 : 16 / b.series.length;
      b.series.forEach((s, j) => {
        const v = s.values[i];
        if (v == null) return;
        const x = labelW + (stacked ? sx(acc) : 0);
        const w = stacked ? sx(acc + v) - sx(acc) : sx(v);
        out.push(`<rect x="${x}" y="${y + 3 + (stacked ? 0 : j * h)}" width="${Math.max(0, w - (stacked ? 1.5 : 0))}" height="${h - (stacked ? 0 : 1)}" rx="2" fill="#${s.color}"><title>${esc(`${cat}, ${s.name}: ${fmtNum(v, 1)}${b.unit || ''}`)}</title></rect>`);
        if (!stacked && b.series.length === 1) out.push(`<text x="${x + w + 5}" y="${y + 15}" font-size="10.5" font-weight="600" fill="#${INK}">${fmtNum(v, 1)}${esc(b.unit || '')}</text>`);
        acc += v;
      });
      if (stacked) out.push(`<text x="${labelW + sx(acc) + 5}" y="${y + 15}" font-size="10.5" font-weight="600" fill="#${INK}">${fmtNum(acc, 1)}</text>`);
    });
    if (b.threshold) { const x = labelW + sx(b.threshold.value); out.push(`<line x1="${x}" x2="${x}" y1="2" y2="${H - 22 - (b.legend ? 22 : 0)}" stroke="#${INK2}" stroke-dasharray="4 3"/>`); }
  } else {
    const left = 40, plotW = W - left - 10, plotH = 200;
    H = plotH + 34 + (b.legend ? 22 : 0);
    const sy = (v) => 8 + plotH - ((Math.max(min, Math.min(max, v)) - min) / (max - min || 1)) * plotH;
    for (let t = 0; t <= 4; t++) { const v = min + ((max - min) * t) / 4; out.push(`<line x1="${left}" x2="${W - 10}" y1="${sy(v)}" y2="${sy(v)}" stroke="#E3E7EE"/><text x="${left - 6}" y="${sy(v) + 4}" font-size="10" text-anchor="end" fill="#${INK2}">${fmtNum(v, max - min < 10 ? 1 : 0)}</text>`); }
    const band = plotW / Math.max(1, b.categories.length);
    b.categories.forEach((cat, i) => out.push(`<text x="${left + i * band + band / 2}" y="${plotH + 24}" font-size="10" text-anchor="middle" fill="#${INK2}">${esc(cat)}</text>`));
    if (b.kind === 'column') {
      const bw = Math.min(22, (band - 8) / b.series.length);
      b.categories.forEach((cat, i) => b.series.forEach((s, j) => { const v = s.values[i]; if (v == null) return; const x = left + i * band + (band - bw * b.series.length) / 2 + j * bw; out.push(`<rect x="${x}" y="${sy(v)}" width="${bw - 2}" height="${8 + plotH - sy(v)}" rx="2" fill="#${s.color}"><title>${esc(`${cat}, ${s.name}: ${fmtNum(v, 1)}`)}</title></rect>`); }));
    } else {
      b.series.forEach((s) => {
        const pts = s.values.map((v, i) => (v == null ? null : `${left + i * band + band / 2},${sy(v)}`));
        const segs = []; let cur = [];
        for (const pt of pts) { if (pt) cur.push(pt); else if (cur.length) { segs.push(cur); cur = []; } }
        if (cur.length) segs.push(cur);
        for (const sg of segs) out.push(`<polyline points="${sg.join(' ')}" fill="none" stroke="#${s.color}" stroke-width="2"/>`);
        s.values.forEach((v, i) => v != null && out.push(`<circle cx="${left + i * band + band / 2}" cy="${sy(v)}" r="3" fill="#${s.color}"><title>${esc(`${b.categories[i]}, ${s.name}: ${fmtNum(v, 2)}`)}</title></circle>`));
      });
    }
    if (b.threshold) out.push(`<line x1="${left}" x2="${W - 10}" y1="${sy(b.threshold.value)}" y2="${sy(b.threshold.value)}" stroke="#${INK2}" stroke-dasharray="4 3"/>`);
  }
  if (b.legend) {
    let x = 8;
    const y = H - 12;
    for (const s of b.series) { out.push(`<rect x="${x}" y="${y - 9}" width="10" height="10" rx="2" fill="#${s.color}"/><text x="${x + 14}" y="${y}" font-size="11" fill="#${INK}">${esc(s.name)}</text>`); x += 26 + s.name.length * 6.2; }
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.alt)}" xmlns="http://www.w3.org/2000/svg" font-family="inherit"><title>${esc(b.title || 'Chart')}</title>${out.join('')}</svg>`;
}

function chartHtml(b, n) {
  const data = `<details><summary>Show the data</summary><div class="tbl-wrap"><table class="small"><thead><tr><th scope="col">Category</th>${b.series.map((s) => `<th scope="col" class="r">${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${b.categories.map((c, i) => `<tr><th scope="row">${esc(c)}</th>${b.series.map((s) => `<td class="r">${s.values[i] == null ? '—' : fmtNum(s.values[i], 2)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  return `<figure>${b.title ? `<figcaption>Figure ${n}: ${esc(b.title)}</figcaption>` : ''}${chartSvg(b)}${b.threshold ? `<p class="note" style="margin:4px 0 0">${esc(b.threshold.label || 'Threshold')}: ${esc(String(b.threshold.value))}${esc(b.unit || '')}</p>` : ''}${data}</figure>`;
}

function blocksHtml(blocks, counters, level = 2) {
  return blocks.map((b) => {
    switch (b.t) {
      case 'h': return `<h${Math.min(6, level + b.level - 1)}>${esc(b.text)}</h${Math.min(6, level + b.level - 1)}>`;
      case 'p': return `<p class="${b.style || ''}">${b.runs ? b.runs.map((r) => (r.bold ? `<strong>${esc(r.text)}</strong>` : r.italic ? `<em>${esc(r.text)}</em>` : esc(r.text))).join('') : text(b.text)}</p>`;
      case 'bullets': return `<ul>${b.items.map((i) => `<li>${text(i)}</li>`).join('')}</ul>`;
      case 'numbers': return `<ol>${b.items.map((i) => `<li>${text(i)}</li>`).join('')}</ol>`;
      case 'table': return tableHtml(b, ++counters.table);
      case 'kv': return b.rows.length ? `<div class="tbl-wrap"><table class="kv">${b.caption ? `<caption>Table ${++counters.table}: ${esc(b.caption)}</caption>` : ''}<tbody>${b.rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${text(v)}</td></tr>`).join('')}</tbody></table></div>` : '';
      case 'chart': return chartHtml(b, ++counters.figure);
      case 'callout': { const [fill, edge] = CALLOUT[b.tone] || CALLOUT.info; return `<aside class="callout" role="note" style="background:#${fill};border-color:#${edge}">${b.title ? `<strong>${esc(b.title)}.</strong> ` : ''}${text(b.text)}</aside>`; }
      case 'placeholder': return `<mark class="ph">${esc(b.text)}</mark>`;
      case 'kpis': return `<div class="kpis">${b.items.map((k) => `<div class="kpi"><span>${esc(k.label)}</span><strong>${esc(String(k.value ?? '—'))}</strong>${k.sub ? `<small>${esc(k.sub)}</small>` : ''}</div>`).join('')}</div>`;
      case 'cols': return `<div class="cols">${b.cols.map((c) => `<div>${blocksHtml(c, counters, level + 1)}</div>`).join('')}</div>`;
      default: return '';
    }
  }).join('\n');
}

function shell({ title, branding, docControl: dc, s, body, caveat, aiNotice, watermark, subtitle }) {
  const cls = (dc.classification || '').toUpperCase();
  return `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(dc.title || title)} · ${esc(s.initiative.name)}</title>
<meta name="description" content="${esc(`${dc.title || title} for ${s.initiative.name}. Version ${dc.version || ''}, ${dc.status || ''}.`)}">
<meta name="classification" content="${esc(dc.classification || '')}">
<style>${css(branding)}</style></head>
<body>${watermark ? `<div class="wm" aria-hidden="true">${dc.status === 'Approved' ? 'COPY' : 'DRAFT'}</div>` : ''}
${cls ? `<div class="marking">${esc(cls)}</div>` : ''}
<header class="cover"><div class="org">${esc(branding.organisation || s.organisation || '')}</div><h1>${esc(dc.title || title)}</h1>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}<div class="ini">${esc(s.initiative.name)}</div></header>
<main class="page">
<div class="meta"><div><b>Version</b>${esc(String(dc.version || ''))} (${esc(dc.status || 'Draft')})</div><div><b>Generated</b>${esc(fmtDate(dc.generatedAt))}${dc.generatedBy ? ` by ${esc(dc.generatedBy)}` : ''}</div><div><b>Data as at</b>${esc(fmtDate(s.takenAt))}</div><div><b>Classification</b>${esc(dc.classification || '')}</div></div>
${caveat ? `<aside class="callout" role="note" style="background:#${STATUS.criticalSoft};border-color:#${STATUS.critical}"><strong>Handling caveat.</strong> ${esc(caveat)}</aside>` : ''}
${aiNotice ? `<aside class="callout" role="note" style="background:#${STATUS.warningSoft};border-color:#${STATUS.warning}"><strong>AI-drafted content.</strong> ${esc(aiNotice)}</aside>` : ''}
${body}
<footer>${esc(branding.footer || branding.organisation || s.organisation || '')} · ${esc(dc.title || title)} · Version ${esc(String(dc.version || ''))} · Generated ${esc(fmtDate(dc.generatedAt))} from data as at ${esc(fmtDate(s.takenAt))}</footer>
</main>
${cls ? `<div class="marking">${esc(cls)}</div>` : ''}
</body></html>`;
}

export function renderHtmlDocument(doc, ctx) {
  const counters = { table: 0, figure: 0 };
  const toc = doc.meta.toc ? `<nav class="toc" aria-label="Contents"><h2>Contents</h2><ul>${doc.sections.map((sec, i) => `<li><a href="#s${i + 1}">${esc(sec.title)}</a></li>`).join('')}</ul></nav>` : '';
  const body = `${toc}${doc.sections.map((sec, i) => `<section aria-labelledby="s${i + 1}"><h2 id="s${i + 1}">${esc(sec.title)}</h2>${blocksHtml(sec.blocks, counters, 2)}</section>`).join('\n')}`;
  return shell({ ...ctx, title: doc.meta.title, subtitle: doc.meta.subtitle, body });
}

export function renderHtmlDeck(deck, ctx) {
  const counters = { table: 0, figure: 0 };
  const body = deck.slides.map((sl, i) => (sl.layout === 'title' || sl.layout === 'section'
    ? `<section class="slide title" aria-label="Slide ${i + 1}"><h2>${esc(sl.title)}</h2>${sl.subtitle ? `<p>${esc(sl.subtitle)}</p>` : ''}</section>`
    : `<section class="slide" aria-label="Slide ${i + 1}"><h2>${esc(sl.title)}</h2>${blocksHtml(sl.body || [], counters, 2)}</section>`)).join('\n');
  return shell({ ...ctx, title: deck.meta.title, body });
}
