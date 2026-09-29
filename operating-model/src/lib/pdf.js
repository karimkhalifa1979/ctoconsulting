// PDF report generator (jsPDF + AutoTable) with CTO Consulting branding. Charts are the same
// SVG components used on screen, rendered to high-resolution images.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import interRegular from '../assets/fonts/Inter-Regular.ttf?url';
import interBold from '../assets/fonts/Inter-Bold.ttf?url';
import montserratBold from '../assets/fonts/Montserrat-Bold.ttf?url';
import { Radar, HBar, VBars, Donut, Bubble, Dumbbell, Waterfall, RiskMatrix, Gauge, C, SEV_COLORS, RAG_FILL, PALETTE } from '../components/charts.jsx';
import { TK, DIMENSIONS, DIM, engagementTitle } from './model.js';
import { dimensionStats, overallStats, inventorySummary, questionCalc, recCalc, recProfile, CATEGORIES, maturityName, COST_TYPES, sum, riskRating, orgCalc, dimName } from './calc.js';
import { pillarStats, aiOverall, aiActionPlan, useCaseCalc } from './aiCalc.js';
import { AI_LEVELS, GUARDRAILS } from '../data/aiReadiness.js';
import { CANVAS_ELEMENTS, CHANGE_AREAS, ADKAR, RISK_MATRIX_LABELS, ARCHETYPES } from '../data/tomLibrary.js';
import { compareModel, optionScore } from './compare.js';
import { initiativeModel, fmtPayback } from './finance.js';
import { executiveSummary } from './narrative.js';
import { fmtMoney, fmtScore, fmtNum, fmtPct, fmtDate, num } from './format.js';

import { REPORT_SECTIONS } from './pdf-sections.js';

export { REPORT_SECTIONS };

const NAVY = [11, 31, 58], TEAL = [15, 163, 177], INK = [22, 33, 47], INK2 = [74, 87, 104], INK3 = [123, 135, 150], LINE = [226, 231, 238];
const W = 210, H = 297, ML = 16, MR = 16, TOP = 22, BOTTOM = 279, CW = W - ML - MR;
const m = (v) => fmtMoney(v, { compact: true });
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const MFILL = { 1: [246, 213, 213], 2: [251, 228, 214], 3: [253, 240, 204], 4: [217, 240, 225], 5: [185, 230, 203] };

async function toBase64(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function svgToPng(el) {
  const svg = renderToStaticMarkup(el);
  const wm = svg.match(/width="([\d.]+)"/), hm = svg.match(/height="([\d.]+)"/);
  const w = Number(wm?.[1] || 600), h = Number(hm?.[1] || 300);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  img.decoding = 'sync';
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Chart render failed')); img.src = url; });
  const scale = 2.5;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { data: canvas.toDataURL('image/png'), w, h };
}

class Report {
  constructor(doc, e, opts) {
    this.doc = doc; this.e = e; this.opts = opts; this.y = TOP; this.toc = [];
  }
  font(style = 'normal', size = 9.5, color = INK) {
    const d = this.doc;
    if (style === 'head') d.setFont('Montserrat', 'bold'); else d.setFont('Inter', style);
    d.setFontSize(size); d.setTextColor(...color);
  }
  space(h) { if (this.y + h > BOTTOM) this.page(); }
  page() { this.doc.addPage(); this.y = TOP; }
  section(title) {
    this.page();
    this.toc.push({ title, page: this.doc.getNumberOfPages() });
    this.font('head', 17, NAVY);
    this.doc.text(title, ML, this.y + 6);
    this.doc.setDrawColor(...TEAL); this.doc.setLineWidth(0.9);
    this.doc.line(ML, this.y + 9.5, ML + 28, this.y + 9.5);
    this.y += 16;
  }
  h2(t) {
    this.space(14);
    this.font('head', 11.5, NAVY);
    this.doc.text(t, ML, this.y + 4);
    this.y += 8;
  }
  h3(t) {
    this.space(10);
    this.font('bold', 9.5, TEAL);
    this.doc.text(t.toUpperCase(), ML, this.y + 3);
    this.y += 6;
  }
  p(text, { size = 9.5, color = INK2, style = 'normal', width = CW, x = ML, gap = 2.5 } = {}) {
    if (!text) return;
    this.font(style, size, color);
    const lines = this.doc.splitTextToSize(String(text), width);
    const lh = size * 0.45;
    for (const ln of lines) {
      this.space(lh + 1);
      this.doc.text(ln, x, this.y + lh);
      this.y += lh;
    }
    this.y += gap;
  }
  bullets(items, opts = {}) {
    for (const it of items.filter(Boolean)) {
      this.font('normal', 9.5, INK2);
      const lines = this.doc.splitTextToSize(String(it), CW - 6);
      this.space(lines.length * 4.3 + 1);
      this.doc.setFillColor(...TEAL);
      this.doc.circle(ML + 1.5, this.y + 2.6, 0.8, 'F');
      lines.forEach((ln, i) => this.doc.text(ln, ML + 5, this.y + 3.6 + i * 4.3));
      this.y += lines.length * 4.3 + (opts.gap ?? 1.4);
    }
    this.y += 1.5;
  }
  kpis(items) {
    const n = items.length, gap = 3, w = (CW - gap * (n - 1)) / n, h = 21;
    this.space(h + 4);
    items.forEach((k, i) => {
      const x = ML + i * (w + gap);
      this.doc.setFillColor(246, 248, 251); this.doc.setDrawColor(...LINE);
      this.doc.roundedRect(x, this.y, w, h, 2, 2, 'FD');
      this.doc.setFillColor(...TEAL); this.doc.rect(x, this.y, w, 0.9, 'F');
      this.font('bold', 6.8, INK3); this.doc.text(this.doc.splitTextToSize(k.label.toUpperCase(), w - 6)[0], x + 3, this.y + 5.5);
      this.font('head', n > 4 ? 13 : 15, NAVY); this.doc.text(String(k.value), x + 3, this.y + 13);
      if (k.sub) { this.font('normal', 7, INK2); this.doc.text(this.doc.splitTextToSize(String(k.sub), w - 6)[0], x + 3, this.y + 18); }
    });
    this.y += h + 5;
  }
  table(head, body, opts = {}) {
    if (!body.length) { this.p('No entries recorded.', { size: 8.5, color: INK3 }); return; }
    autoTable(this.doc, {
      startY: this.y, head: [head], body, margin: { left: ML, right: MR, top: TOP, bottom: H - BOTTOM },
      styles: { font: 'Inter', fontSize: opts.fontSize || 7.8, cellPadding: 1.6, textColor: INK, lineColor: LINE, lineWidth: 0.1, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: (opts.fontSize || 7.8) - 0.3 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: opts.columnStyles || {},
      didParseCell: opts.didParseCell,
      theme: 'grid',
    });
    this.y = this.doc.lastAutoTable.finalY + 5;
  }
  async chart(el, width = CW, { center = true } = {}) {
    const img = await svgToPng(el);
    const h = (img.h / img.w) * width;
    this.space(h + 3);
    const x = center ? ML + (CW - width) / 2 : ML;
    this.doc.addImage(img.data, 'PNG', x, this.y, width, h, undefined, 'FAST');
    this.y += h + 4;
  }
  async charts2(a, b, h0) {
    const [ia, ib] = await Promise.all([svgToPng(a), svgToPng(b)]);
    const w = (CW - 5) / 2;
    const ha = (ia.h / ia.w) * w, hb = (ib.h / ib.w) * w;
    const h = Math.max(ha, hb, h0 || 0);
    this.space(h + 3);
    this.doc.addImage(ia.data, 'PNG', ML, this.y, w, ha, undefined, 'FAST');
    this.doc.addImage(ib.data, 'PNG', ML + w + 5, this.y, w, hb, undefined, 'FAST');
    this.y += h + 4;
  }
  callout(text, color = TEAL) {
    this.font('normal', 9.5, INK);
    const lines = this.doc.splitTextToSize(text, CW - 10);
    const h = lines.length * 4.4 + 6;
    this.space(h + 2);
    this.doc.setFillColor(227, 245, 247); this.doc.rect(ML, this.y, CW, h, 'F');
    this.doc.setFillColor(...color); this.doc.rect(ML, this.y, 1.4, h, 'F');
    lines.forEach((ln, i) => this.doc.text(ln, ML + 5, this.y + 5.5 + i * 4.4));
    this.y += h + 4;
  }
}

function cover(r) {
  const { doc, e, opts } = r;
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, H, 'F');
  doc.setFillColor(29, 61, 105); doc.circle(W + 10, 40, 80, 'F');
  doc.setFillColor(...NAVY); doc.circle(W + 10, 40, 58, 'F');
  doc.setFillColor(...TEAL); doc.roundedRect(ML, 24, 16, 16, 3, 3, 'F');
  r.font('head', 9.5, [255, 255, 255]); doc.text('CTO', ML + 8, 33.8, { align: 'center' });
  r.font('head', 14, [255, 255, 255]); doc.text('CTO Consulting', ML + 21, 31);
  r.font('normal', 8, [159, 180, 208]); doc.text('DIGITAL TRANSFORMATION SPECIALISTS', ML + 21, 36.5);
  doc.setFillColor(...TEAL); doc.rect(ML, 108, 30, 1.6, 'F');
  r.font('bold', 10, [159, 227, 234]); doc.text((opts.subtitle || 'Operating Model Assessment').toUpperCase(), ML, 100);
  r.font('head', 28, [255, 255, 255]);
  doc.splitTextToSize(opts.title || 'Operating Model Assessment Report', CW).forEach((ln, i) => doc.text(ln, ML, 124 + i * 12));
  r.font('head', 16, [220, 231, 245]); doc.text(doc.splitTextToSize(e.details.client || 'Client', CW)[0], ML, 158);
  r.font('normal', 11, [195, 211, 232]); doc.text(doc.splitTextToSize(e.details.name || '', CW)[0] || '', ML, 166);
  const meta = [['Date', fmtDate(new Date())], ['Version', e.details.version || '—'], ['Status', e.details.status || '—'], ['Prepared by', opts.preparedBy || e.details.lead || 'CTO Consulting'], ['Prepared for', opts.preparedFor || e.details.sponsor || '—']];
  meta.forEach(([k, v], i) => {
    r.font('bold', 8, [159, 180, 208]); doc.text(k.toUpperCase(), ML, 200 + i * 10);
    r.font('normal', 10.5, [255, 255, 255]); doc.text(doc.splitTextToSize(String(v), CW - 40)[0], ML + 36, 200 + i * 10);
  });
  if (opts.classification) { r.font('bold', 9, [242, 169, 0]); doc.text(opts.classification.toUpperCase(), ML, 262); }
  r.font('normal', 8.5, [159, 180, 208]);
  doc.text('www.ctoconsulting.com.au  ·  connect@ctoconsulting.com.au', ML, 280);
}

async function build(r) {
  const { e, opts } = r;
  const s = e.settings;
  const sections = new Set(opts.sections);
  const o = overallStats(e);
  const dims = dimensionStats(e);
  const inv = inventorySummary(e);
  const ai = aiOverall(e);
  const cmp = compareModel(e);
  const summary = executiveSummary(e);
  const ragFill = (rag) => (rag ? hex(RAG_FILL[rag]) : null);
  const colourRag = (idx) => (data) => {
    if (data.section !== 'body' || data.column.index !== idx) return;
    const f = ragFill(data.cell.raw);
    if (f) { data.cell.styles.fillColor = f; data.cell.styles.textColor = 255; data.cell.styles.fontStyle = 'bold'; }
  };
  const colourMat = (idxs) => (data) => {
    if (data.section !== 'body' || !idxs.includes(data.column.index)) return;
    const v = num(data.cell.raw);
    if (v !== null) data.cell.styles.fillColor = MFILL[Math.min(5, Math.max(1, Math.round(v)))];
  };

  if (sections.has('exec')) {
    r.section('Executive summary');
    r.callout(summary.headline);
    r.kpis([
      { label: 'Current maturity', value: `${fmtScore(o.current)} / 5`, sub: maturityName(o.current) },
      { label: 'Target maturity', value: fmtScore(cmp.targetMaturity), sub: 'Design target' },
      { label: 'Average gap', value: fmtScore(o.gap), sub: o.rag },
      { label: 'Findings', value: o.findings, sub: `${o.openCritHigh} open critical/high` },
      { label: 'AI readiness', value: ai.index ?? '—', sub: ai.level?.name || '' },
    ]);
    summary.paragraphs.forEach((t) => r.p(t));
    r.h2('Priority areas');
    r.bullets(summary.bullets);
    await r.chart(createElement(Radar, { labels: dims.map((d) => d.short), series: [{ name: 'Current', color: C.orange, values: dims.map((d) => d.current || 0) }, { name: 'Target', color: C.teal, values: dims.map((d) => d.designTarget || 0), fill: 0.07 }], size: 440 }), 125);
    const topRecs = e.recommendations.map((x) => ({ ...x, ...recCalc(x, s) })).sort((a, b) => (b.priority || 0) - (a.priority || 0)).slice(0, 8);
    r.h2('Top recommendations');
    r.table(['ID', 'Recommendation', 'Category', 'Horizon', 'Cost'], topRecs.map((x) => [x.id, x.recommendation, x.category, x.horizon, m(x.cost)]), { columnStyles: { 1: { cellWidth: 100 } } });
    if (cmp.pm.totalCost) {
      r.h2('Business case at a glance');
      r.kpis([
        { label: 'Investment (one-off)', value: m(cmp.investment) },
        { label: 'Total benefit', value: m(cmp.pm.totalBenefit), sub: s.riskAdjustBenefits ? 'risk-adjusted' : '' },
        { label: 'NPV', value: m(cmp.pm.npv), sub: `${s.discountRate}% discount rate` },
        { label: 'ROI', value: fmtPct(cmp.pm.roi) },
        { label: 'Payback', value: cmp.pm.payback === null ? '—' : `${cmp.pm.payback.toFixed(1)} yrs` },
      ]);
    }
  }

  if (sections.has('engagement')) {
    r.section('Engagement overview');
    r.table(['Item', 'Detail'], [['Client organisation', e.details.client], ['Industry / sector', e.details.industry], ['Engagement', e.details.name], ['Client sponsor', e.details.sponsor], ['Engagement lead', e.details.lead], ['Assessment team', e.details.team], ['Period', `${fmtDate(e.details.startDate)} – ${fmtDate(e.details.endDate)}`], ['Status', e.details.status]], { columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold' } } });
    r.h2('Objectives');
    r.bullets(e.objectives.filter(Boolean));
    r.h2('Scope');
    r.table(['Scope item', 'Detail'], [['In-scope units', e.scope.units], ['In-scope locations', e.scope.locations], ['Dimensions', e.scope.dimensions], ['Out of scope', e.scope.outOfScope], ['Constraints & assumptions', e.scope.constraints]].filter((x) => x[1]), { columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold' } } });
    if (e.hypotheses.some(Boolean)) { r.h2('Hypotheses tested'); r.bullets(e.hypotheses.filter(Boolean)); }
    r.h2('Approach and evidence base');
    r.p(`${TK.frameworkIntro} The assessment scored ${o.scored} of ${o.total} questions against a five-level maturity model, drawing on ${o.interviewsDone} stakeholder interviews and ${o.docsReceived + o.docsPartial} documents received (of ${o.docsTotal} requested).`);
    r.table(['Phase', 'Key activities', 'Outputs'], TK.approach.map((a) => [a.phase, a.activities, a.outputs]), { columnStyles: { 0: { cellWidth: 30, fontStyle: 'bold' } } });
    const sh = e.stakeholders.filter((x) => x.name && x.status === 'Completed');
    if (sh.length) { r.h2('Stakeholders interviewed'); r.table(['Name / role', 'Business unit', 'Group', 'Date'], sh.map((x) => [x.name + (x.role && x.role !== x.name ? `, ${x.role}` : ''), x.unit, x.group, fmtDate(x.date)])); }
    if (e.principles.length) { r.h2('Operating model design principles'); r.table(['Principle', 'Rationale', 'Implications', 'Status'], e.principles.map((p) => [p.principle, p.rationale, p.implications, p.status]), { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 34 } } }); }
  }

  if (sections.has('maturity')) {
    r.section('Operating model maturity profile');
    r.p(`Overall current maturity is ${fmtScore(o.current)} (${maturityName(o.current)}) against a target of ${fmtScore(o.target)}. Gaps are rated Red at ${s.ragRed} or more and Amber from ${s.ragAmber}. Priority index = average importance-weighted shortfall.`);
    await r.charts2(
      createElement(Radar, { labels: dims.map((d) => d.short), series: [{ name: 'Current', color: C.orange, values: dims.map((d) => d.current || 0) }, { name: 'Target', color: C.teal, values: dims.map((d) => d.target || 0), fill: 0.07 }], size: 440 }),
      createElement(HBar, { items: dims.map((d) => ({ label: `${d.code} ${d.short}`, value: d.gap === null ? 0 : +d.gap.toFixed(2), color: RAG_FILL[d.rag] })), fmt: (v) => Number(v).toFixed(1), width: 560, labelW: 190, max: Math.max(2.5, ...dims.map((d) => d.gap || 0)) }),
    );
    r.table(['Code', 'Dimension', 'Scored', 'Current', 'Target', 'Gap', 'Priority', 'RAG', 'Findings', 'Recs'],
      dims.map((d) => [d.code, d.name, `${d.scored}/${d.questions}`, fmtScore(d.current), fmtScore(d.target), fmtScore(d.gap), fmtScore(d.priority), d.rag, d.findings, d.recs]),
      { didParseCell: (data) => { colourRag(7)(data); colourMat([3])(data); }, columnStyles: { 1: { cellWidth: 58 } } });
    await r.chart(createElement(VBars, { categories: dims.map((d) => d.code), stacked: true, height: 240, width: 900, series: ['Critical', 'High', 'Medium', 'Low'].map((sv) => ({ name: sv, color: SEV_COLORS[sv], values: dims.map((d) => d.sev[sv]) })) }), CW);
  }

  if (sections.has('dimensions')) {
    r.section('Assessment by dimension');
    for (const d of dims) {
      const def = DIM[d.code];
      const qs = e.questions.filter((q) => q.dim === d.code);
      r.space(40);
      r.h2(`${d.code}  ${d.name}`);
      r.p(`${def.definition} Key question: ${def.keyQuestion}`, { size: 8.8 });
      r.p(`Current ${fmtScore(d.current)} (${maturityName(d.current) || 'not assessed'}) · target ${fmtScore(d.designTarget)} · gap ${fmtScore(d.gap)} ${d.rag ? `(${d.rag})` : ''} · ${d.findings} findings · ${d.recs} recommendations`, { size: 8.8, style: 'bold', color: NAVY });
      const t = e.tom.dimensions[d.code] || {};
      const obs = qs.filter((q) => q.observations).map((q) => `${q.sub}: ${q.observations}`);
      if (obs.length) { r.h3('Observations'); r.bullets(obs.slice(0, 6), { gap: 0.8 }); }
      const strong = qs.filter((q) => num(q.current) >= 3).sort((a, b) => b.current - a.current).slice(0, 3);
      const gaps = qs.map((q) => ({ ...q, ...questionCalc(q, s) })).filter((q) => q.wgap).sort((a, b) => b.wgap - a.wgap).slice(0, 3);
      if (strong.length || gaps.length) {
        r.table(['Strengths', 'Largest gaps'], [[strong.map((q) => `${q.id} ${q.sub} (${q.current})`).join('\n') || '—', gaps.map((q) => `${q.id} ${q.sub} (${q.current} → ${q.target})`).join('\n') || '—']], { fontSize: 7.6 });
      }
      if (t.targetDescription) { r.h3('Target state'); r.p(t.targetDescription, { size: 8.8 }); }
    }
  }

  if (sections.has('findings')) {
    r.section('Key findings');
    const sev = ['Critical', 'High', 'Medium', 'Low'];
    const counts = Object.fromEntries(sev.map((x) => [x, e.findings.filter((f) => f.severity === x).length]));
    r.kpis([...sev.map((x) => ({ label: `${x} findings`, value: counts[x] })), { label: 'Validated', value: `${e.findings.filter((f) => f.validated === 'Yes').length}/${e.findings.length}` }]);
    const sorted = [...e.findings].sort((a, b) => sev.indexOf(a.severity) - sev.indexOf(b.severity));
    r.table(['ID', 'Dimension', 'Finding', 'Root cause', 'Impact', 'Severity'], sorted.map((f) => [f.id, DIM[f.dim]?.short || f.dim, f.finding, f.rootCause, f.impact, f.severity]),
      { fontSize: 7.3, columnStyles: { 0: { cellWidth: 11 }, 1: { cellWidth: 22 }, 2: { cellWidth: 58 }, 5: { cellWidth: 16 } }, didParseCell: (data) => { if (data.section === 'body' && data.column.index === 5 && SEV_COLORS[data.cell.raw]) { data.cell.styles.fillColor = hex(SEV_COLORS[data.cell.raw]); data.cell.styles.textColor = 255; } } });
  }

  if (sections.has('inventories')) {
    r.section('Current-state analysis');
    r.h2('Organisation structure');
    r.kpis([{ label: 'Total FTE', value: fmtNum(inv.org.total) }, { label: 'People managers', value: fmtNum(inv.org.managers) }, { label: 'Average span', value: fmtNum(inv.org.span, 1) }, { label: 'Deepest layers', value: inv.org.maxLayers, sub: `max ${s.maxLayers}` }, { label: 'Contractor & outsourced', value: fmtPct(inv.org.contractorPct) }]);
    r.table(['Business unit', 'Nature of work', 'FTE', 'Managers', 'Layers', 'Span', 'Benchmark', 'Span assessment', 'Employee cost'],
      e.orgUnits.filter((u) => orgCalc(u, e).total).map((u) => { const c = orgCalc(u, e); return [u.name, u.nature, fmtNum(c.total), u.managers, u.layers, fmtNum(c.span, 1), c.range?.label || '', c.spanAssessment, m(u.cost)]; }), { fontSize: 7.3 });
    r.h2('Applications');
    r.p(`${inv.apps.count} applications costing ${m(inv.apps.cost)} a year; ${inv.apps.eol} are end of life and ${inv.apps.expiring} reach end of support within ${s.expiryWarningDays} days. TIME: ${['Invest', 'Tolerate', 'Migrate', 'Eliminate'].map((t) => `${t} ${inv.apps.time[t] || 0}`).join(', ')}.`);
    await r.charts2(
      createElement(Bubble, { points: inv.apps.list.filter((a) => num(a.businessFit) && num(a.technicalFit)).map((a) => ({ id: a.id, label: a.name, x: Number(a.technicalFit), y: Number(a.businessFit), color: { Invest: '#1f9d58', Tolerate: '#f2c14e', Migrate: '#eb6834', Eliminate: '#d03b3b' }[a.time], r: 7 })), xLabel: 'Technical fit', yLabel: 'Business fit', xMin: 1, yMin: 1, threshold: s.timeFitThreshold, quadrants: ['Migrate', 'Invest', 'Eliminate', 'Tolerate'], size: 460 }),
      createElement(Donut, { items: COST_TYPES.map((t, i) => ({ label: t.label, value: inv.costs.byType[t.key], display: m(inv.costs.byType[t.key]), color: PALETTE[i] })), center: m(inv.costs.total), sub: 'operating cost', size: 190, legendW: 210 }),
    );
    r.h2('Suppliers');
    r.p(`${inv.suppliers.count} suppliers with ${m(inv.suppliers.spend)} annual spend; ${inv.suppliers.dependency.High || 0} carry high dependency risk and ${inv.suppliers.noExit} material service providers lack a complete exit plan. ${inv.suppliers.renewals} renewal decisions are due.`);
    r.table(['Supplier', 'Segment', 'Spend', 'Contract end', 'Dependency risk', 'Exit plan'], inv.suppliers.list.filter((x) => x.dependency === 'High' || x.segment === 'Strategic').map((x) => [x.name, x.segment, m(x.spend), fmtDate(x.end), x.dependency, x.exitPlan]), { fontSize: 7.4 });
    r.h2('Locations and cost baseline');
    r.p(`${inv.locations.count} sites costing ${m(inv.locations.cost)} a year with average utilisation of ${fmtPct(inv.locations.utilisation)}. The annual operating cost baseline is ${m(inv.costs.total)} (${fmtNum(inv.costs.fte)} FTE, ${fmtMoney(inv.costs.perFte)} per FTE), of which ${fmtPct(inv.costs.changePct, 1)} is change spend.`);
    r.table(['Business unit', ...COST_TYPES.map((t) => t.label), 'Total'], e.costs.map((c) => [c.unit, ...COST_TYPES.map((t) => m(c[t.key])), m(sum(COST_TYPES.map((t) => c[t.key])))]), { fontSize: 7 });
    r.h2('Decision rights and capabilities');
    r.p(`${inv.decisions.mapped} of ${inv.decisions.total} key decisions were mapped using RAPID; ${inv.decisions.issues} have no single decider or multiple deciders, and decisions take ${fmtNum(inv.decisions.avgDays)} days on average. ${inv.capabilities.assessed} of ${inv.capabilities.total} business capabilities were assessed.`);
    r.table(['Capability', 'Level 1', 'Importance', 'Current', 'Target', 'Priority score'], inv.capabilities.top.map((c) => [c.l2, c.l1, c.importance, c.current, c.target, c.priority]), { fontSize: 7.4, didParseCell: colourMat([3]) });
  }

  if (sections.has('ai')) {
    r.section('AI readiness');
    const ps = pillarStats(e);
    r.kpis([{ label: 'AI readiness index', value: ai.index ?? '—', sub: `target ${ai.targetIndex ?? '—'}` }, { label: 'Readiness level', value: ai.level ? `L${ai.level.level}` : '—', sub: ai.level?.name }, { label: 'Guardrails in place', value: `${ai.guardrails.implemented}/${ai.guardrails.applicable}` }, { label: 'AI use cases', value: ai.useCases.count, sub: m(ai.useCases.benefit) + ' benefit' }]);
    if (ai.level) r.callout(`Level ${ai.level.level} — ${ai.level.name}: ${ai.level.description}`);
    await r.charts2(
      createElement(Radar, { labels: ps.map((p) => p.short), series: [{ name: 'Current', color: C.orange, values: ps.map((p) => p.current || 0) }, { name: 'Target', color: C.teal, values: ps.map((p) => p.target || 0), fill: 0.07 }], size: 420 }),
      createElement(Bubble, { points: ai.useCases.list.filter((u) => u.priority).map((u) => ({ id: u.id, label: u.name, x: Number(u.feasibility), y: Number(u.value), color: { Minimal: '#1f9d58', Limited: '#2a78d6', High: '#eb6834', Prohibited: '#d03b3b' }[u.riskTier] || C.grey, r: 8 })), xLabel: 'Feasibility', yLabel: 'Value', xMin: 1, yMin: 1, quadrants: ['Build foundations', 'Prioritise now', 'Park', 'Opportunistic'], size: 460 }),
    );
    r.table(['Pillar', 'Current', 'Target', 'Gap', 'Level'], ps.map((p) => [p.name, fmtScore(p.current), fmtScore(p.target), fmtScore(p.gap), p.level?.name || '—']), { didParseCell: colourMat([1]) });
    r.h2('AI use cases');
    r.table(['ID', 'Use case', 'AI type', 'Value', 'Feasibility', 'Risk tier', 'Recommendation', 'Benefit'], ai.useCases.list.map((u) => [u.id, u.name, u.aiType, u.value, u.feasibility, u.riskTier, u.quadrant, m(u.benefit)]), { fontSize: 7.3 });
    r.h2('Responsible AI guardrails');
    r.table(['#', 'Guardrail', 'Status', 'Owner'], GUARDRAILS.map((g) => [g.id, `${g.title}: ${g.text}`, e.ai.guardrails[g.id]?.status || 'Not started', e.ai.guardrails[g.id]?.owner || '']), { fontSize: 7.3, columnStyles: { 1: { cellWidth: 110 } } });
    r.h2('AI action plan');
    for (const a of aiActionPlan(e).slice(0, 8)) { r.h3(`${a.pillar.name} · ${a.pillar.stage} · ${a.horizon}`); r.bullets(a.actions, { gap: 0.6 }); }
  }

  if (sections.has('tom')) {
    r.section('Target operating model');
    const t = e.tom;
    if (t.vision) r.callout(t.vision);
    if (t.archetype) {
      r.h2(`Structural archetype: ${t.archetype}`);
      r.p(t.archetypeRationale);
      const a = ARCHETYPES[t.archetype];
      if (a) r.table(['When it fits', 'Strengths', 'Watch-outs'], [[a.when, a.pros, a.cons]], { fontSize: 7.6 });
    }
    r.h2('Operating Model Canvas');
    r.table(['Element', 'Current state', 'Target state', 'Key shifts'], CANVAS_ELEMENTS.map((c) => [c.name, t.canvas[c.id]?.current || '', t.canvas[c.id]?.target || '', t.canvas[c.id]?.shifts || '']), { fontSize: 7.3, columnStyles: { 0: { cellWidth: 26, fontStyle: 'bold' } } });
    r.h2('Target state and key shifts by dimension');
    r.table(['Dimension', 'Target state', 'Key shifts', 'Enablers'], DIMENSIONS.filter((d) => t.dimensions[d.code]?.targetDescription).map((d) => [`${d.code} ${d.name}`, t.dimensions[d.code].targetDescription, t.dimensions[d.code].shifts, t.dimensions[d.code].enablers]), { fontSize: 7.3, columnStyles: { 0: { cellWidth: 30, fontStyle: 'bold' } } });
    if (t.options.length) {
      r.h2('Design options appraisal');
      const opts2 = t.options.map((x) => ({ ...x, score: optionScore(x, t.criteria) }));
      r.table(['Option', ...t.criteria.map((c) => `${c.name} (${c.weight}%)`), 'Weighted', 'One-off', 'Run cost', 'Risk'], opts2.map((x) => [`${x.name}${x.id === t.preferredOption ? ' ★ preferred' : ''}`, ...t.criteria.map((c) => x.scores?.[c.id] ?? ''), x.score === null ? '—' : x.score.toFixed(2), m(x.oneOff), m(x.runCost), x.risk || '']), { fontSize: 6.8, columnStyles: { 0: { cellWidth: 36, fontStyle: 'bold' } } });
      const pref = opts2.find((x) => x.id === t.preferredOption);
      if (pref) r.p(`Preferred option: ${pref.name}. ${pref.description || ''} ${pref.notes || ''}`, { style: 'bold', color: NAVY });
    }
  }

  if (sections.has('compare')) {
    r.section('Current vs target comparison');
    r.table(['Measure', 'Current', 'Target', 'Change'], cmp.metrics.map((x) => {
      const f = (v) => (v === null || v === undefined ? '—' : x.type === 'money' ? m(v) : x.type === 'score' ? fmtScore(v) : x.type === 'dec' ? fmtNum(v, 1) : fmtNum(v));
      const d = num(x.cur) !== null && num(x.tgt) !== null ? x.tgt - x.cur : null;
      return [x.label, f(x.cur), f(x.tgt), d === null ? '—' : `${d > 0 ? '+' : d < 0 ? '−' : ''}${f(Math.abs(d))}`];
    }), { columnStyles: { 0: { cellWidth: 80, fontStyle: 'bold' } } });
    await r.chart(createElement(Dumbbell, { items: dims.map((d) => ({ label: `${d.code} ${d.short}`, from: d.current, to: d.designTarget })), width: 640 }), 140);
    r.h2('Costs');
    await r.chart(createElement(Waterfall, { steps: [{ label: 'Current', value: cmp.costC.total, total: true }, ...cmp.costByType.map((x) => ({ label: x.label, value: x.tgt - x.cur })).filter((x) => x.value), { label: 'Target', value: cmp.costT.total, total: true }], fmt: m, width: 700 }), 150);
    r.table(['Business unit', 'Current run cost', 'Target run cost', 'Change'], cmp.costByUnit.map((u) => [u.unit, m(u.cur), m(u.tgt), m(u.tgt - u.cur)]));
    r.h2('Benefits');
    r.p(`Initiatives deliver ${m(cmp.pm.totalBenefit)} of ${s.riskAdjustBenefits ? 'risk-adjusted ' : ''}financial benefits over ${cmp.labels.length} years for ${m(cmp.pm.totalCost)} of cost: NPV ${m(cmp.pm.npv)}, ROI ${fmtPct(cmp.pm.roi)}, payback ${fmtPayback(cmp.pm.payback, cmp.labels)}.`);
    r.table(['Benefit measure', 'Baseline (current)', 'Target', 'Owner'], e.benefitLines.filter((b) => b.kpi).map((b) => [`${b.kpi} — ${b.description}`, `${b.baseline} ${b.baseline !== '' ? b.unit || '' : ''}`, `${b.target} ${b.target !== '' ? b.unit || '' : ''}`, b.owner]), { fontSize: 7.3 });
    r.h2('Risks');
    await r.charts2(
      createElement(RiskMatrix, { title: 'Inherent risk', risks: cmp.risks.map((x) => ({ id: x.id, l: num(x.likelihood), i: num(x.impact) })), likelihoodLabels: RISK_MATRIX_LABELS.likelihood, impactLabels: RISK_MATRIX_LABELS.impact }),
      createElement(RiskMatrix, { title: 'Residual risk', risks: cmp.risks.map((x) => ({ id: x.id, l: num(x.residualLikelihood), i: num(x.residualImpact) })), likelihoodLabels: RISK_MATRIX_LABELS.likelihood, impactLabels: RISK_MATRIX_LABELS.impact }),
    );
    r.p(`Current-state exposure: ${Object.entries(cmp.sevCount).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')} open findings; ${inv.suppliers.dependency.High || 0} high-dependency suppliers; ${inv.apps.eol} end-of-life applications. Transition and target-state risks: ${cmp.risks.filter((x) => x.score >= 12).length} high or extreme before mitigation, ${cmp.risks.filter((x) => x.rscore >= 12).length} after.`);
    r.h2('Implementation requirements');
    r.table(['Category', 'Requirements', 'Must have', 'Complete'], e.lists['Requirement category'].map((c) => { const rs = e.requirements.filter((x) => x.category === c); return rs.length ? [c, rs.length, rs.filter((x) => x.priority === 'Must have').length, rs.filter((x) => x.status === 'Complete').length] : null; }).filter(Boolean));
    r.h2('Change management requirements');
    r.table(['Stakeholder group', 'People', ...CHANGE_AREAS.map((a) => a.name), 'Impact', 'Readiness', 'Barrier'], cmp.changeGroups.map((g) => [g.group, fmtNum(g.headcount), ...CHANGE_AREAS.map((a) => ['–', 'L', 'M', 'H'][num(g[a.id]) || 0]), g.impact, fmtScore(g.adkar), g.barrier?.name || 'Ready']),
      { fontSize: 6.6, didParseCell: (data) => { if (data.section === 'body' && data.column.index >= 2 && data.column.index < 2 + CHANGE_AREAS.length) { const k = ['–', 'L', 'M', 'H'].indexOf(data.cell.raw); data.cell.styles.fillColor = [[243, 245, 248], [253, 240, 204], [251, 217, 184], [242, 166, 122]][Math.max(0, k)]; data.cell.styles.halign = 'center'; } } });
  }

  if (sections.has('business')) {
    r.section('Business case: benefits and costs');
    const pm = cmp.pm;
    r.kpis([{ label: 'Total cost', value: m(pm.totalCost) }, { label: 'Total benefit', value: m(pm.totalBenefit) }, { label: 'NPV', value: m(pm.npv), sub: `${s.discountRate}%` }, { label: 'ROI / BCR', value: fmtPct(pm.roi), sub: `BCR ${pm.bcr ? pm.bcr.toFixed(2) : '—'}` }, { label: 'Payback', value: pm.payback === null ? '—' : `${pm.payback.toFixed(1)} yrs`, sub: pm.irr === null ? '' : `IRR ${fmtPct(pm.irr, 1)}` }]);
    await r.chart(createElement(VBars, { categories: cmp.labels, series: [{ name: 'One-off costs', color: C.orange, values: pm.oneOff.map((v) => -v) }, { name: 'Recurring costs', color: '#f5a67c', values: pm.recurring.map((v) => -v) }, { name: 'Cashable benefits', color: C.green, values: pm.cashable }, { name: 'Non-cashable benefits', color: '#8fd3b4', values: pm.nonCashable }], stacked: true, line: { name: 'Cumulative net benefit', values: pm.cumulative, color: C.navy }, height: 320, width: 900, fmt: m }), CW);
    r.table(['', ...cmp.labels, 'Total'], [['Costs', ...pm.cost.map(m), m(pm.totalCost)], ['Benefits', ...pm.benefit.map(m), m(pm.totalBenefit)], ['Net', ...pm.net.map(m), m(pm.totalNet)], ['Cumulative', ...pm.cumulative.map(m), '']], { columnStyles: { 0: { fontStyle: 'bold' } } });
    r.h2('Initiatives and solution components');
    r.table(['ID', 'Initiative', 'Type', 'Owner', 'Status', 'Cost', 'Benefit', 'NPV', 'Payback'], e.initiatives.map((i) => { const im = initiativeModel(e, i.id); return [i.id, i.name, i.type, i.owner, i.status, m(im.totalCost), m(im.totalBenefit), m(im.npv), im.payback === null ? '—' : `${im.payback.toFixed(1)}y`]; }), { fontSize: 7.3 });
    r.p(`Assumptions: ${s.riskAdjustBenefits ? 'benefits are risk-adjusted by their confidence rating' : 'benefits are not risk-adjusted'}; non-cashable benefits are ${s.includeNonCashable ? 'included' : 'excluded'}; non-financial benefits are tracked but excluded from NPV; end-of-year discounting at ${s.discountRate}%.`, { size: 8, color: INK3 });
  }

  if (sections.has('recommendations')) {
    r.section('Recommendations and roadmap');
    const recs = e.recommendations.map((x) => ({ ...x, ...recCalc(x, s) }));
    const prof = recProfile(e);
    await r.charts2(
      createElement(Bubble, { points: recs.filter((x) => x.priority).map((x) => ({ id: x.id, label: x.recommendation, x: Number(x.ease), y: Number(x.value), color: { 'Quick win': '#1f9d58', 'Strategic initiative': '#2a78d6', 'Fill-in': '#f2b33d', Deprioritise: '#9aa5b4' }[x.category], r: 9 })), xLabel: 'Ease', yLabel: 'Value', xMin: 1, yMin: 1, threshold: s.priorityThreshold, quadrants: ['Strategic initiatives', 'Quick wins', 'Deprioritise', 'Fill-ins'], size: 460 }),
      createElement(VBars, { categories: prof.horizons, series: CATEGORIES.map((c, i) => ({ name: c, color: ['#1f9d58', '#2a78d6', '#f2b33d', '#9aa5b4'][i], values: prof.horizons.map((h) => prof.matrix[c][h]) })), stacked: true, height: 330, width: 520 }),
    );
    for (const h of e.lists.Horizon) {
      const list = recs.filter((x) => x.horizon === h).sort((a, b) => (b.priority || 0) - (a.priority || 0));
      if (!list.length) continue;
      r.h2(`${h} (${list.length})`);
      r.table(['ID', 'Dimension', 'Recommendation', 'Benefits', 'Category', 'Owner', 'Cost'], list.map((x) => [x.id, DIM[x.dim]?.short || x.dim, x.recommendation, x.benefits, x.category, x.owner, m(x.cost)]), { fontSize: 7.2, columnStyles: { 2: { cellWidth: 62 } } });
    }
  }

  if (sections.has('transition')) {
    r.section('Implementation, change and risk');
    r.h2('Initiative roadmap');
    r.table(['ID', 'Initiative', 'Start', 'End', 'Status', 'Owner'], e.initiatives.map((i) => [i.id, i.name, fmtDate(i.start), fmtDate(i.end), i.status, i.owner]));
    r.h2('Implementation requirements');
    r.table(['ID', 'Category', 'Requirement', 'Priority', 'Horizon', 'Owner', 'Status'], e.requirements.map((x) => [x.id, x.category, x.requirement, x.priority, x.horizon, x.owner, x.status]), { fontSize: 7.2, columnStyles: { 2: { cellWidth: 66 } } });
    r.h2('Change management plan');
    r.table(['Activity', 'Type', 'Audience', 'Timing', 'Owner', 'Status'], e.changeActivities.map((a) => [a.activity, a.type, a.audience, a.timing, a.owner, a.status]), { fontSize: 7.2, columnStyles: { 0: { cellWidth: 62 } } });
    r.h2('ADKAR interventions');
    r.table(['Element', 'Groups at this barrier', 'Interventions'], ADKAR.map((a) => [a.name, cmp.changeGroups.filter((g) => g.barrier?.id === a.id).map((g) => g.group).join(', ') || '—', a.interventions]), { fontSize: 7.3 });
    r.h2('Risk register');
    r.table(['ID', 'Risk', 'Stage', 'L×I', 'Rating', 'Mitigation', 'Residual', 'Owner'], cmp.risks.map((x) => [x.id, x.title, x.stage, x.score ?? '', riskRating(x.score), x.mitigation, x.rscore ?? '', x.owner]), { fontSize: 7, columnStyles: { 1: { cellWidth: 42 }, 5: { cellWidth: 50 } } });
  }

  if (sections.has('appendixA')) {
    r.section('Appendix A: Detailed assessment scores');
    for (const d of DIMENSIONS) {
      r.h2(`${d.code} ${d.name}`);
      r.table(['ID', 'Sub-component', 'Question', 'Imp.', 'Cur.', 'Tgt.', 'RAG', 'Observations'], e.questions.filter((q) => q.dim === d.code).map((q) => { const c = questionCalc(q, s); return [q.id, q.sub, q.question, q.importance, q.current, q.target, c.rag, q.observations]; }), { fontSize: 6.8, columnStyles: { 2: { cellWidth: 62 }, 7: { cellWidth: 45 } }, didParseCell: (data) => { colourRag(6)(data); colourMat([4])(data); } });
    }
  }

  if (sections.has('appendixB')) {
    r.section('Appendix B: Framework and maturity scale');
    r.table(['Level', 'Description'], TK.maturityScale.map((l) => [l.label, l.description]), { columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } } });
    r.table(['Code', 'Dimension', 'Definition', 'Standards & references'], DIMENSIONS.map((d) => [d.code, d.name, d.definition, d.standards]), { fontSize: 7, columnStyles: { 1: { cellWidth: 32, fontStyle: 'bold' } } });
    r.table(['Level', 'AI readiness level', 'Description'], AI_LEVELS.map((l) => [l.level, l.name, l.description]), { fontSize: 7.4 });
  }
}

export async function generateReport(e, opts = {}, onProgress = () => {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  onProgress('Loading fonts…');
  const [ir, ib, mb] = await Promise.all([toBase64(interRegular), toBase64(interBold), toBase64(montserratBold)]);
  doc.addFileToVFS('Inter-Regular.ttf', ir); doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
  doc.addFileToVFS('Inter-Bold.ttf', ib); doc.addFont('Inter-Bold.ttf', 'Inter', 'bold');
  doc.addFileToVFS('Montserrat-Bold.ttf', mb); doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold');
  const sections = opts.sections || REPORT_SECTIONS.filter((x) => x.default).map((x) => x.id);
  const r = new Report(doc, e, { ...opts, sections });
  doc.setProperties({ title: `${opts.title || 'Operating Model Assessment Report'} — ${engagementTitle(e)}`, author: 'CTO Consulting', creator: 'CTO Consulting Operating Model Assessment Tool' });

  onProgress('Building cover…');
  cover(r);
  // Contents page, filled in once page numbers are known.
  doc.addPage();
  const tocPage = doc.getNumberOfPages();
  onProgress('Building sections and charts…');
  await build(r);

  doc.setPage(tocPage);
  r.font('head', 17, NAVY); doc.text('Contents', ML, TOP + 6);
  doc.setDrawColor(...TEAL); doc.setLineWidth(0.9); doc.line(ML, TOP + 9.5, ML + 28, TOP + 9.5);
  r.toc.forEach((t, i) => {
    const y = TOP + 22 + i * 9;
    r.font('normal', 11, INK); doc.text(t.title, ML, y);
    r.font('bold', 11, NAVY); doc.text(String(t.page), W - MR, y, { align: 'right' });
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(ML, y + 2.5, W - MR, y + 2.5);
  });
  r.font('normal', 8.5, INK3);
  doc.text(doc.splitTextToSize(`This report was generated by the CTO Consulting Operating Model Assessment Tool from the assessment data recorded for ${engagementTitle(e)}. Figures reflect the data at ${new Date().toLocaleString('en-AU')}.`, CW), ML, TOP + 30 + r.toc.length * 9);

  const n = doc.getNumberOfPages();
  for (let i = 2; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(ML, 14, W - MR, 14); doc.line(ML, 286, W - MR, 286);
    doc.setFillColor(...TEAL); doc.roundedRect(ML, 7.5, 5, 5, 1, 1, 'F');
    r.font('head', 5, [255, 255, 255]); doc.text('CTO', ML + 2.5, 10.8, { align: 'center' });
    r.font('bold', 7.5, NAVY); doc.text('CTO Consulting', ML + 7, 11.2);
    r.font('normal', 7.5, INK3); doc.text(`Operating Model Assessment · ${engagementTitle(e)}`, W - MR, 11.2, { align: 'right' });
    doc.text(opts.classification || 'www.ctoconsulting.com.au', ML, 291);
    doc.text(`Page ${i} of ${n}`, W - MR, 291, { align: 'right' });
  }
  onProgress('Saving…');
  return doc.output('blob');
}
