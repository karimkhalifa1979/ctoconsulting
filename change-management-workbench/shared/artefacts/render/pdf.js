// PDF renderer (ART-006, ART-007, ART-019): searchable text in embedded fonts, bookmarks that match the
// headings, a linked table of contents, tagged structure (headings, paragraphs, lists, tables with header
// cells, figures with alternative text) with headers, footers and watermarks marked as artefacts, and
// optional PDF/A-2a for archiving. Charts are drawn as vectors from the same data as the Office charts.
import PDFDocument from 'pdfkit';
import { loadFonts } from '../fonts.js';
import { hex, INK, INK2, LINE, STATUS, fmtDate, fmtNum, fitColumns } from '../ir.js';

const A4 = { w: 595.28, h: 841.89 };
const M = { top: 76, bottom: 64, left: 54, right: 54 };
const CW = A4.w - M.left - M.right;
const SIZES = { body: 9.4, small: 8.2, table: 7.9, tableSmall: 7.1, h1: 16, h2: 12.4, h3: 10.4, caption: 8.2 };
const CALLOUT = { info: [STATUS.infoSoft, '2A78D6'], warn: [STATUS.warningSoft, STATUS.warning], bad: [STATUS.criticalSoft, STATUS.critical], good: [STATUS.goodSoft, STATUS.good] };
const SYMBOLS = { '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '✓': 'Yes', '✗': 'No', '◆': '*', '●': '•', '−': '-', '×': 'x' };

const col = (c) => `#${hex(c)}`;

async function createDoc(ctx, size) {
  const fonts = await loadFonts();
  const dc = ctx.docControl || {};
  const created = new Date(dc.generatedAt || ctx.s?.takenAt || Date.now());
  const doc = new PDFDocument({
    size, margins: size === 'A4' ? M : { top: 0, bottom: 0, left: 0, right: 0 }, autoFirstPage: false, bufferPages: true, compress: true,
    pdfVersion: '1.7', tagged: true, displayTitle: true, lang: 'en-AU', ...(ctx.pdfa ? { subset: 'PDF/A-2a' } : {}),
    info: { Title: dc.title || 'Document', Author: dc.generatedBy || 'Change Management Workbench', Subject: ctx.s?.initiative?.name || '', Keywords: [dc.classification, dc.status, `Version ${dc.version}`].filter(Boolean).join('; '), Creator: 'Change Management Workbench', Producer: 'Change Management Workbench', CreationDate: created, ModDate: created },
  });
  doc.registerFont('Body', fonts.regular);
  doc.registerFont('Italic', fonts.italic);
  doc.registerFont('Semi', fonts.semibold);
  doc.registerFont('Bold', fonts.bold);
  doc.font('Body');
  const glyphs = doc._font.font;
  // Characters outside the embedded font are written in a form it can show.
  doc.safe = (t) => String(t ?? '').replace(/[^\n\t\x20-\x7E]/g, (ch) => (glyphs.hasGlyphForCodePoint(ch.codePointAt(0)) ? ch : SYMBOLS[ch] ?? '?'));
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', resolve));
  return { doc, finish: async () => { doc.end(); await done; const len = chunks.reduce((a, c) => a + c.length, 0); const out = new Uint8Array(len); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out; } };
}

// --- Primitive drawing within structure elements -----------------------------------------------------------
function artifact(doc, fn, type = 'Layout') {
  doc.markContent('Artifact', { type });
  fn();
  doc.endMarkedContent();
}

function textHeight(doc, text, { font = 'Body', size = SIZES.body, width, lineGap = 1.6 }) {
  doc.font(font).fontSize(size);
  return doc.heightOfString(doc.safe(text) || ' ', { width, lineGap });
}

class Flow {
  constructor(doc, ctx) {
    this.doc = doc;
    this.ctx = ctx;
    this.root = doc.struct('Document');
    doc.addStructure(this.root);
    this.parent = this.root;
    this.tableNo = 0;
    this.figureNo = 0;
    this.headings = [];
    this.primary = col(ctx.branding.primary);
    this.secondary = col(ctx.branding.secondary || '#1d3d69');
  }
  get bottom() { return A4.h - M.bottom; }
  newPage() { this.doc.addPage(); this.doc.x = M.left; this.doc.y = M.top; }
  ensure(h) { if (this.doc.y + h > this.bottom) this.newPage(); }
  gap(n) { this.doc.y += n; }

  struct(type, opts, fn) {
    const el = this.doc.struct(type, opts || {});
    this.parent.add(el);
    if (fn) el.add(fn);
    return el;
  }

  heading(level, text, { pageBreak = false } = {}) {
    const doc = this.doc;
    const size = [SIZES.h1, SIZES.h2, SIZES.h3][level - 1];
    const h = textHeight(doc, text, { font: 'Bold', size, width: CW });
    if (pageBreak && doc.y > M.top + 2) this.newPage();
    else this.ensure(h + (level === 1 ? 90 : 60));
    this.gap(level === 1 ? 8 : 6);
    const id = `h${this.headings.length + 1}`;
    const page = doc.bufferedPageRange().start + doc.bufferedPageRange().count - 1;
    this.headings.push({ level, text, id, page });
    if (level === 1) this.lastOutline = doc.outline.addItem(doc.safe(text));
    else if (level === 2 && this.lastOutline) this.lastOutline.addItem(doc.safe(text));
    else if (level === 2) doc.outline.addItem(doc.safe(text));
    this.struct(`H${level}`, {}, () => {
      doc.font('Bold').fontSize(size).fillColor(level === 3 ? this.secondary : this.primary).text(doc.safe(text), M.left, doc.y, { width: CW, lineGap: 1, destination: id });
    });
    this.gap(level === 1 ? 6 : 3);
  }

  paragraph(text, { style, runs } = {}) {
    const doc = this.doc;
    const size = style === 'small' || style === 'muted' ? SIZES.small : style === 'lead' ? SIZES.body + 1.5 : SIZES.body;
    const color = style === 'small' || style === 'muted' || style === 'lead' ? col(INK2) : col(INK);
    const font = style === 'strong' ? 'Semi' : 'Body';
    const content = runs ? runs.map((r) => r.text).join('') : text;
    if (!String(content || '').trim()) return;
    this.ensure(Math.min(40, textHeight(doc, content, { size, width: CW })));
    this.struct('P', {}, () => {
      if (runs) {
        runs.forEach((r, i) => doc.font(r.bold ? 'Bold' : r.italic ? 'Italic' : 'Body').fontSize(size).fillColor(color).text(doc.safe(r.text), i ? undefined : M.left, i ? undefined : doc.y, { width: CW, lineGap: 1.6, continued: i < runs.length - 1 }));
      } else {
        doc.font(font).fontSize(size).fillColor(color).text(doc.safe(text), M.left, doc.y, { width: CW, lineGap: 1.6 });
      }
    });
    this.gap(5);
  }

  list(items, ordered) {
    const doc = this.doc;
    const list = this.struct('L');
    items.forEach((it, i) => {
      const h = textHeight(doc, it, { width: CW - 16 });
      this.ensure(Math.min(h, 30) + 2);
      const li = doc.struct('LI');
      list.add(li);
      const y = doc.y;
      li.add(doc.struct('Lbl', () => doc.font('Body').fontSize(SIZES.body).fillColor(this.primary).text(ordered ? `${i + 1}.` : '•', M.left + 2, y, { width: 14, lineBreak: false })));
      li.add(doc.struct('LBody', () => doc.font('Body').fontSize(SIZES.body).fillColor(col(INK)).text(doc.safe(it), M.left + 16, y, { width: CW - 16, lineGap: 1.6 })));
      li.end();
      this.gap(2);
    });
    list.end();
    this.gap(4);
  }

  caption(kind, text) {
    const doc = this.doc;
    const n = kind === 'Table' ? ++this.tableNo : ++this.figureNo;
    this.ensure(50);
    this.struct('Caption', {}, () => doc.font('Semi').fontSize(SIZES.caption).fillColor(col(INK2)).text(doc.safe(`${kind} ${n}: ${text}`), M.left, doc.y, { width: CW }));
    this.gap(3);
  }

  note(text) {
    const doc = this.doc;
    this.struct('P', {}, () => doc.font('Italic').fontSize(SIZES.small - 0.5).fillColor(col(INK2)).text(doc.safe(text), M.left, doc.y, { width: CW, lineGap: 1.2 }));
    this.gap(6);
  }

  table(b) {
    const doc = this.doc;
    if (b.caption) this.caption('Table', b.caption);
    if (!b.rows.length) { this.note(b.empty || 'None recorded.'); return; }
    const size = b.small ? SIZES.tableSmall : SIZES.table;
    const pad = 3.2;
    const widths = fitColumns(b.columns, b.rows, { total: CW, pad, measure: (w, head) => { doc.font(head ? 'Semi' : 'Body').fontSize(size); return doc.widthOfString(doc.safe(w)); } });
    const vertical = b.columns.some((c) => c.vertical);
    const headerH = Math.max(...b.columns.map((c, i) => {
      doc.font('Semi').fontSize(size);
      return c.vertical ? Math.min(120, doc.widthOfString(doc.safe(c.label))) + 2 * pad : textHeight(doc, c.label, { font: 'Semi', size, width: widths[i] - 2 * pad, lineGap: 0.6 }) + 2 * pad;
    }));
    const tbl = this.struct('Table');
    const drawHeader = () => {
      const y = doc.y;
      artifact(doc, () => doc.rect(M.left, y, CW, headerH).fill(this.primary));
      const tr = doc.struct('TR');
      tbl.add(tr);
      let x = M.left;
      b.columns.forEach((c, i) => {
        const cx = x;
        tr.add(doc.struct('TH', { scope: 'Column' }, () => {
          doc.font('Semi').fontSize(size).fillColor('#FFFFFF');
          if (c.vertical) {
            // Rotated a quarter-turn anticlockwise so it reads upwards from the bottom of the header cell.
            const ox = cx + widths[i] / 2 - size * 0.6;
            const oy = y + headerH - pad;
            doc.save();
            doc.rotate(-90, { origin: [ox, oy] });
            doc.text(doc.safe(c.label), ox, oy, { lineBreak: false });
            doc.restore();
          } else {
            doc.text(doc.safe(c.label), cx + pad, y + pad, { width: widths[i] - 2 * pad, align: c.align === 'r' ? 'right' : c.align === 'c' ? 'center' : 'left', lineGap: 0.6 });
          }
        }));
        x += widths[i];
      });
      tr.end();
      doc.y = y + headerH;
    };
    this.ensure(headerH + 20);
    drawHeader();
    for (const row of b.rows) {
      const hs = b.columns.map((c, i) => textHeight(doc, row[i]?.text ?? '', { font: row[i]?.bold ? 'Semi' : 'Body', size, width: widths[i] - 2 * pad, lineGap: 0.6 }) + 2 * pad);
      const h = Math.max(12, ...hs);
      if (doc.y + h > this.bottom) { this.newPage(); drawHeader(); }
      const y = doc.y;
      artifact(doc, () => {
        let x = M.left;
        b.columns.forEach((c, i) => { if (row[i]?.fill) doc.rect(x, y, widths[i], h).fill(col(row[i].fill)); x += widths[i]; });
        doc.moveTo(M.left, y + h).lineTo(M.left + CW, y + h).lineWidth(0.4).strokeColor(col(LINE)).stroke();
      });
      const tr = doc.struct('TR');
      tbl.add(tr);
      let x = M.left;
      b.columns.forEach((c, i) => {
        const cell = row[i] || { text: '' };
        const cx = x;
        const align = (cell.align || c.align) === 'r' ? 'right' : (cell.align || c.align) === 'c' ? 'center' : 'left';
        tr.add(doc.struct('TD', () => doc.font(cell.bold ? 'Semi' : 'Body').fontSize(size).fillColor(cell.color ? col(cell.color) : col(INK)).text(doc.safe(cell.text), cx + pad, y + pad, { width: widths[i] - 2 * pad, align, lineGap: 0.6 })));
        x += widths[i];
      });
      tr.end();
      doc.y = y + h;
    }
    tbl.end();
    this.gap(4);
    if (b.note) this.note(b.note);
    else this.gap(6);
  }

  kv(b) {
    const doc = this.doc;
    if (b.caption) this.caption('Table', b.caption);
    if (!b.rows.length) return;
    const w1 = CW * 0.3, w2 = CW * 0.7, pad = 3.4, size = SIZES.table;
    const tbl = this.struct('Table');
    for (const [k, v] of b.rows) {
      const h = Math.max(textHeight(doc, k, { font: 'Semi', size, width: w1 - 2 * pad }), textHeight(doc, v, { size, width: w2 - 2 * pad })) + 2 * pad;
      if (doc.y + h > this.bottom) this.newPage();
      const y = doc.y;
      artifact(doc, () => {
        doc.rect(M.left, y, w1, h).fill('#F0F3F7');
        doc.moveTo(M.left, y + h).lineTo(M.left + CW, y + h).lineWidth(0.4).strokeColor(col(LINE)).stroke();
      });
      const tr = doc.struct('TR');
      tbl.add(tr);
      tr.add(doc.struct('TH', { scope: 'Row' }, () => doc.font('Semi').fontSize(size).fillColor(col(INK)).text(doc.safe(k), M.left + pad, y + pad, { width: w1 - 2 * pad, lineGap: 0.6 })));
      tr.add(doc.struct('TD', () => doc.font('Body').fontSize(size).fillColor(col(INK)).text(doc.safe(v), M.left + w1 + pad, y + pad, { width: w2 - 2 * pad, lineGap: 0.6 })));
      tr.end();
      doc.y = y + h;
    }
    tbl.end();
    this.gap(10);
  }

  callout(b) {
    const doc = this.doc;
    const [fill, edge] = CALLOUT[b.tone] || CALLOUT.info;
    const text = `${b.title ? `${b.title}. ` : ''}${b.text}`;
    const h = textHeight(doc, text, { size: SIZES.body - 0.4, width: CW - 24 }) + 14;
    this.ensure(h + 6);
    const y = doc.y;
    artifact(doc, () => { doc.roundedRect(M.left, y, CW, h, 3).fill(col(fill)); doc.rect(M.left, y, 3, h).fill(col(edge)); });
    this.struct('P', {}, () => {
      if (b.title) doc.font('Bold').fontSize(SIZES.body - 0.4).fillColor(col(INK)).text(doc.safe(`${b.title}. `), M.left + 12, y + 7, { width: CW - 24, continued: true, lineGap: 1.4 });
      doc.font('Body').fontSize(SIZES.body - 0.4).fillColor(col(INK)).text(doc.safe(b.text), b.title ? undefined : M.left + 12, b.title ? undefined : y + 7, { width: CW - 24, lineGap: 1.4 });
    });
    doc.y = y + h + 8;
  }

  placeholder(text) {
    const doc = this.doc;
    const h = textHeight(doc, text, { font: 'Italic', width: CW - 12 }) + 8;
    this.ensure(h + 4);
    const y = doc.y;
    artifact(doc, () => doc.rect(M.left, y, CW, h).fill('#FFF4C2'));
    this.struct('P', {}, () => doc.font('Italic').fontSize(SIZES.body).fillColor('#7A5300').text(doc.safe(text), M.left + 6, y + 4, { width: CW - 12 }));
    doc.y = y + h + 6;
  }

  chart(b) {
    const doc = this.doc;
    if (b.title) this.caption('Figure', b.title);
    const h = Math.min(320, b.height ? b.height * 0.62 : b.kind === 'bar' || b.kind === 'stacked' ? 40 + b.categories.length * 18 : 190) + (b.legend ? 16 : 0);
    this.ensure(h + 8);
    const y = doc.y;
    this.struct('Figure', { alt: doc.safe(b.alt) }, () => drawChart(doc, b, { x: M.left, y, w: CW, h }));
    doc.y = y + h + 6;
    if (b.threshold) this.note(`${b.threshold.label || 'Threshold'}: ${b.threshold.value}${b.unit || ''}.`);
  }

  blocks(list) {
    for (const b of list) {
      switch (b.t) {
        case 'h': this.heading(Math.min(3, b.level), b.text); break;
        case 'p': this.paragraph(b.text, { style: b.style, runs: b.runs }); break;
        case 'bullets': this.list(b.items, false); break;
        case 'numbers': this.list(b.items, true); break;
        case 'table': this.table(b); break;
        case 'kv': this.kv(b); break;
        case 'chart': this.chart(b); break;
        case 'callout': this.callout(b); break;
        case 'placeholder': this.placeholder(b.text); break;
        case 'pageBreak': this.newPage(); break;
        default: break;
      }
    }
  }
}

// --- Charts ------------------------------------------------------------------------------------------------
function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v / 4));
  for (const k of [1, 2, 2.5, 5, 10]) if (v / (k * p) <= 4.0001) return Math.ceil(v / (k * p) - 1e-9) * k * p;
  return v;
}

export function drawChart(doc, b, { x, y, w, h }) {
  const legendH = b.legend ? 16 : 0;
  const ink = col(INK2);
  const font = (sz, f = 'Body') => doc.font(f).fontSize(sz).fillColor(ink);
  const stacked = b.kind === 'stacked';
  const vals = b.series.flatMap((s) => s.values.filter((v) => v != null));
  const totals = stacked ? b.categories.map((_, i) => b.series.reduce((a, s) => a + (s.values[i] || 0), 0)) : vals;
  const max = b.max ?? niceMax(Math.max(0, ...totals, b.threshold?.value || 0));
  const min = b.min ?? 0;
  const ticks = 4;
  if (b.kind === 'bar' || stacked) {
    const labelW = Math.min(170, w * 0.32);
    const plotX = x + labelW + 6, plotW = w - labelW - 34, plotH = h - legendH - 16;
    const band = plotH / Math.max(1, b.categories.length);
    const barH = Math.min(14, (band - 4) / (stacked ? 1 : b.series.length));
    const sx = (v) => ((Math.max(min, Math.min(max, v)) - min) / (max - min || 1)) * plotW;
    for (let t = 0; t <= ticks; t++) {
      const v = min + ((max - min) * t) / ticks;
      doc.moveTo(plotX + sx(v), y).lineTo(plotX + sx(v), y + plotH).lineWidth(0.3).strokeColor('#E3E7EE').stroke();
      font(6.4).text(fmtNum(v, max - min < 10 ? 1 : 0), plotX + sx(v) - 15, y + plotH + 3, { width: 30, align: 'center', lineBreak: false });
    }
    b.categories.forEach((cat, i) => {
      const cy = y + i * band + (band - (stacked ? barH : barH * b.series.length)) / 2;
      font(6.8).text(doc.safe(cat.length > 40 ? `${cat.slice(0, 39)}…` : cat), x, cy + (stacked ? barH : barH * b.series.length) / 2 - 3.6, { width: labelW, align: 'right', lineBreak: false, height: 9, ellipsis: true });
      let acc = 0;
      b.series.forEach((s, j) => {
        const v = s.values[i];
        if (v == null) return;
        const bx = plotX + (stacked ? sx(acc) : 0);
        const bw = stacked ? sx(acc + v) - sx(acc) : sx(v);
        const by = stacked ? cy : cy + j * barH;
        if (bw > 0) doc.rect(bx, by, Math.max(0.5, bw - (stacked ? 1 : 0)), barH - (stacked ? 0 : 1.5)).fill(col(s.color));
        if (!stacked && b.series.length === 1) font(6.6, 'Semi').fillColor(col(INK)).text(fmtNum(v, 1), bx + bw + 3, by + barH / 2 - 3.4, { lineBreak: false });
        acc += v;
      });
      if (stacked) font(6.6, 'Semi').fillColor(col(INK)).text(fmtNum(acc, 1), plotX + sx(acc) + 3, cy + barH / 2 - 3.4, { lineBreak: false });
    });
    if (b.threshold) {
      const tx = plotX + sx(b.threshold.value);
      doc.moveTo(tx, y - 2).lineTo(tx, y + plotH).dash(2, { space: 2 }).lineWidth(0.8).strokeColor(col(INK2)).stroke().undash();
    }
  } else {
    const plotX = x + 30, plotW = w - 40, plotH = h - legendH - 18;
    const sy = (v) => y + plotH - ((Math.max(min, Math.min(max, v)) - min) / (max - min || 1)) * plotH;
    for (let t = 0; t <= ticks; t++) {
      const v = min + ((max - min) * t) / ticks;
      doc.moveTo(plotX, sy(v)).lineTo(plotX + plotW, sy(v)).lineWidth(0.3).strokeColor('#E3E7EE').stroke();
      font(6.4).text(fmtNum(v, max - min < 10 ? 1 : 0), x, sy(v) - 3.4, { width: 26, align: 'right', lineBreak: false });
    }
    const band = plotW / Math.max(1, b.categories.length);
    b.categories.forEach((cat, i) => font(6.4).text(doc.safe(cat), plotX + i * band, y + plotH + 4, { width: band, align: 'center', lineBreak: false, height: 9, ellipsis: true }));
    if (b.kind === 'column') {
      const barW = Math.min(16, (band - 6) / b.series.length);
      b.categories.forEach((_, i) => b.series.forEach((s, j) => {
        const v = s.values[i];
        if (v == null) return;
        const bx = plotX + i * band + (band - barW * b.series.length) / 2 + j * barW;
        doc.rect(bx, sy(v), barW - 1.5, y + plotH - sy(v)).fill(col(s.color));
      }));
    } else {
      b.series.forEach((s) => {
        const pts = s.values.map((v, i) => (v == null ? null : [plotX + i * band + band / 2, sy(v)]));
        let started = false;
        pts.forEach((pt) => { if (!pt) { started = false; return; } if (!started) { doc.moveTo(pt[0], pt[1]); started = true; } else doc.lineTo(pt[0], pt[1]); });
        doc.lineWidth(1.6).strokeColor(col(s.color)).stroke();
        pts.forEach((pt) => pt && doc.circle(pt[0], pt[1], 1.8).fill(col(s.color)));
      });
    }
    if (b.threshold) {
      const ty = sy(b.threshold.value);
      doc.moveTo(plotX, ty).lineTo(plotX + plotW, ty).dash(2, { space: 2 }).lineWidth(0.8).strokeColor(col(INK2)).stroke().undash();
    }
    doc.moveTo(plotX, y + plotH).lineTo(plotX + plotW, y + plotH).lineWidth(0.5).strokeColor('#9AA5B4').stroke();
  }
  if (b.legend) {
    let lx = x + 4;
    const ly = y + h - 10;
    b.series.forEach((s) => {
      doc.rect(lx, ly, 7, 7).fill(col(s.color));
      font(6.8).fillColor(col(INK)).text(doc.safe(s.name), lx + 10, ly - 0.4, { lineBreak: false });
      lx += 18 + doc.widthOfString(doc.safe(s.name));
    });
  }
}

// --- Page furniture --------------------------------------------------------------------------------
function furniture(doc, ctx, { skip = [0], pageSize = A4, landscape = false } = {}) {
  const dc = ctx.docControl || {};
  const range = doc.bufferedPageRange();
  const total = range.count;
  const cls = (dc.classification || '').toUpperCase();
  const left = landscape ? 30 : M.left;
  const width = pageSize.w - 2 * left;
  for (let i = range.start; i < range.start + total; i++) {
    doc.switchToPage(i);
    // Page furniture sits in the margins, so the margins are cleared while it is drawn; otherwise text
    // below the bottom margin would start a new page.
    const margins = doc.page.margins;
    doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
    artifact(doc, () => {
      if (ctx.watermark) {
        doc.save();
        doc.fillOpacity(0.07).font('Bold').fontSize(landscape ? 110 : 120).fillColor('#5A6472');
        doc.rotate(-35, { origin: [pageSize.w / 2, pageSize.h / 2] });
        doc.text(dc.status === 'Approved' ? 'COPY' : 'DRAFT', pageSize.w / 2 - 230, pageSize.h / 2 - 60, { width: 460, align: 'center', lineBreak: false });
        doc.restore();
        doc.fillOpacity(1);
      }
      if (cls) {
        doc.font('Bold').fontSize(7.6).fillColor('#A32626');
        doc.text(cls, left, landscape ? 8 : 24, { width, align: 'center', lineBreak: false });
        doc.text(cls, left, pageSize.h - (landscape ? 14 : 26), { width, align: 'center', lineBreak: false });
      }
      if (skip.includes(i - range.start)) return;
      doc.font('Body').fontSize(7).fillColor(col(INK2));
      if (!landscape) {
        doc.text(doc.safe(`${dc.title || ''} · ${ctx.s?.initiative?.shortName || ctx.s?.initiative?.name || ''}`), left, 40, { width: width * 0.7, lineBreak: false, height: 9, ellipsis: true });
        doc.text(doc.safe(`Version ${dc.version || ''} · ${dc.status || ''}`), left, 40, { width, align: 'right', lineBreak: false });
        doc.moveTo(left, 52).lineTo(left + width, 52).lineWidth(0.4).strokeColor(col(LINE)).stroke();
        doc.moveTo(left, pageSize.h - 50).lineTo(left + width, pageSize.h - 50).lineWidth(0.4).strokeColor(col(LINE)).stroke();
      }
      const fy = pageSize.h - (landscape ? 24 : 44);
      doc.font('Body').fontSize(7).fillColor(col(INK2));
      doc.text(doc.safe(`${ctx.branding.footer || ctx.branding.organisation || ctx.s?.organisation || ''} · Generated ${fmtDate(dc.generatedAt)} from data as at ${fmtDate(ctx.s?.takenAt)}`), left, fy, { width: width * 0.75, lineBreak: false, height: 9, ellipsis: true });
      doc.text(`Page ${i - range.start + 1} of ${total}`, left, fy, { width, align: 'right', lineBreak: false });
    }, 'Pagination');
    doc.page.margins = margins;
  }
}

function cover(flow, doc, ctx, meta) {
  const dc = ctx.docControl || {};
  const b = ctx.branding;
  flow.newPage();
  artifact(doc, () => {
    doc.rect(0, 0, A4.w, 300).fill(col(b.primary));
    doc.rect(0, 300, A4.w, 6).fill(col(b.accent || '#0fa3b1'));
  });
  doc.y = 110;
  flow.struct('P', {}, () => doc.font('Semi').fontSize(9).fillColor(col(b.accent || '#0fa3b1')).text(doc.safe((b.organisation || ctx.s?.organisation || '').toUpperCase()), M.left, 110, { width: CW, characterSpacing: 1.2 }));
  flow.struct('H1', {}, () => doc.font('Bold').fontSize(28).fillColor('#FFFFFF').text(doc.safe(dc.title || meta.title), M.left, 132, { width: CW, lineGap: 2 }));
  if (meta.subtitle) flow.struct('P', {}, () => doc.font('Body').fontSize(13).fillColor('#DDE6F0').text(doc.safe(meta.subtitle), M.left, doc.y + 6, { width: CW }));
  flow.struct('P', {}, () => doc.font('Semi').fontSize(14).fillColor(col(INK)).text(doc.safe(ctx.s?.initiative?.name || ''), M.left, 336, { width: CW }));
  doc.y = 372;
  flow.kv({ rows: [['Version', `${dc.version || ''} (${dc.status || 'Draft'})`], ['Date', fmtDate(dc.generatedAt)], ['Prepared by', dc.generatedBy || ''], ['Security classification', dc.classification || ''], ...(b.coverNote ? [['Note', b.coverNote]] : [])].filter((r) => r[1]) });
  if (ctx.caveat) flow.callout({ tone: 'bad', title: 'Handling caveat', text: ctx.caveat });
  if (ctx.aiNotice) flow.callout({ tone: 'warn', title: 'AI-drafted content', text: ctx.aiNotice });
}

function drawToc(doc, flow, tocPages, tocStruct) {
  const entries = flow.headings.filter((x) => x.level <= 2);
  let i = 0;
  for (const pageIndex of tocPages) {
    doc.switchToPage(pageIndex);
    let y = M.top;
    if (pageIndex === tocPages[0]) {
      tocStruct.add(doc.struct('H1', () => doc.font('Bold').fontSize(SIZES.h1).fillColor(flow.primary).text('Contents', M.left, y, { width: CW })));
      y += 30;
    }
    while (i < entries.length && y < A4.h - M.bottom - 14) {
      const e = entries[i++];
      const indent = e.level === 2 ? 14 : 0;
      const size = e.level === 1 ? 9.2 : 8.4;
      const pg = String(e.page + 1);
      tocStruct.add(doc.struct('TOCI', () => {
        doc.font(e.level === 1 ? 'Semi' : 'Body').fontSize(size).fillColor(col(INK));
        doc.text(doc.safe(e.text), M.left + indent, y, { width: CW - indent - 30, lineBreak: false, height: 12, ellipsis: true, goTo: e.id });
        doc.text(pg, M.left, y, { width: CW, align: 'right', lineBreak: false, goTo: e.id });
      }));
      y += e.level === 1 ? 15 : 13;
    }
  }
}

export async function renderPdf(docIr, ctx) {
  const { doc, finish } = await createDoc(ctx, 'A4');
  const flow = new Flow(doc, ctx);
  const meta = docIr.meta;
  if (!meta.compact) cover(flow, doc, ctx, meta);
  let tocPages = [];
  let tocStruct = null;
  if (meta.toc) {
    tocStruct = flow.struct('TOC');
    const entries = docIr.sections.length + docIr.sections.reduce((a, s) => a + s.blocks.filter((b) => b.t === 'h' && b.level === 2).length, 0);
    const pages = Math.max(1, Math.ceil((entries + 3) / 46));
    for (let i = 0; i < pages; i++) { flow.newPage(); tocPages.push(doc.bufferedPageRange().count - 1); }
  }
  flow.newPage();
  if (meta.compact) {
    flow.struct('H1', {}, () => doc.font('Bold').fontSize(20).fillColor(flow.primary).text(doc.safe(ctx.docControl?.title || meta.title), M.left, doc.y, { width: CW }));
    if (meta.subtitle) flow.paragraph(meta.subtitle, { style: 'lead' });
    if (ctx.caveat) flow.callout({ tone: 'bad', title: 'Handling caveat', text: ctx.caveat });
    flow.gap(6);
  }
  const breakBefore = meta.toc && docIr.sections.length > 5;
  docIr.sections.forEach((sec, i) => {
    flow.heading(1, sec.title, { pageBreak: breakBefore && i > 0 });
    flow.blocks(sec.blocks);
  });
  if (tocStruct) { drawToc(doc, flow, tocPages, tocStruct); tocStruct.end(); }
  furniture(doc, ctx, { skip: meta.compact ? [] : [0] });
  flow.root.end();
  return finish();
}

// --- Presentations as PDF (Steering Committee Pack and Change on a Page) -------------------------------------
const SLIDE = { w: 960, h: 540 };
export async function renderDeckPdf(deck, ctx) {
  const { doc, finish } = await createDoc(ctx, [SLIDE.w, SLIDE.h]);
  const root = doc.struct('Document');
  doc.addStructure(root);
  const b = ctx.branding;
  const primary = col(b.primary), accent = col(b.accent || '#0fa3b1');
  deck.slides.forEach((slide) => {
    doc.addPage();
    const sect = doc.struct('Sect');
    root.add(sect);
    if (slide.layout === 'title' || slide.layout === 'section') {
      artifact(doc, () => { doc.rect(0, 0, SLIDE.w, SLIDE.h).fill(primary); doc.rect(0, SLIDE.h - 10, SLIDE.w, 10).fill(accent); });
      doc.outline.addItem(doc.safe(slide.title));
      sect.add(doc.struct('H1', () => doc.font('Bold').fontSize(slide.layout === 'title' ? 34 : 28).fillColor('#FFFFFF').text(doc.safe(slide.title), 60, 180, { width: SLIDE.w - 120 })));
      if (slide.subtitle) sect.add(doc.struct('P', () => doc.font('Body').fontSize(15).fillColor('#DDE6F0').text(doc.safe(slide.subtitle), 60, doc.y + 10, { width: SLIDE.w - 120 })));
      if (slide.layout === 'title') sect.add(doc.struct('P', () => doc.font('Body').fontSize(11).fillColor('#DDE6F0').text(doc.safe([b.organisation || ctx.s?.organisation, fmtDate(ctx.docControl?.generatedAt), `Version ${ctx.docControl?.version || ''} ${ctx.docControl?.status || ''}`].filter(Boolean).join(' · ')), 60, 420, { width: SLIDE.w - 120 })));
      sect.end();
      return;
    }
    artifact(doc, () => doc.rect(0, 0, SLIDE.w, 6).fill(accent));
    doc.outline.addItem(doc.safe(slide.title));
    sect.add(doc.struct('H1', () => doc.font('Bold').fontSize(22).fillColor(primary).text(doc.safe(slide.title), 40, 28, { width: SLIDE.w - 80, lineBreak: false, height: 28, ellipsis: true })));
    const box = { x: 40, y: 78, w: SLIDE.w - 80, h: SLIDE.h - 78 - 40 };
    slideBlocks(doc, sect, slide.body || [], box, ctx);
    sect.end();
  });
  furniture(doc, ctx, { skip: [0], pageSize: SLIDE, landscape: true });
  root.end();
  return finish();
}

function slideBlocks(doc, parent, blocks, box, ctx) {
  let y = box.y;
  const flexible = blocks.filter((bl) => bl.t === 'chart').length;
  const fixed = blocks.reduce((a, bl) => a + (bl.t === 'chart' ? 0 : estimate(doc, bl, box.w)), 0);
  const chartH = flexible ? Math.max(120, (box.h - fixed - 10 * blocks.length) / flexible) : 0;
  for (const bl of blocks) {
    const remaining = box.y + box.h - y;
    if (remaining < 24) break;
    const used = drawSlideBlock(doc, parent, bl, { x: box.x, y, w: box.w, h: bl.t === 'chart' ? Math.min(chartH, remaining) : remaining }, ctx);
    y += used + 10;
  }
}

function estimate(doc, bl, w) {
  switch (bl.t) {
    case 'p': return textHeight(doc, bl.text, { size: 12, width: w }) + 4;
    case 'bullets': return bl.items.reduce((a, it) => a + textHeight(doc, it, { size: 12, width: w - 18 }) + 4, 0);
    case 'kpis': return 78;
    case 'table': return 22 + Math.min(bl.rows.length, 10) * 19;
    case 'callout': return textHeight(doc, bl.text, { size: 11, width: w - 24 }) + 18;
    case 'cols': return Math.max(...bl.cols.map((c) => c.reduce((a, x) => a + (x.t === 'chart' ? 180 : estimate(doc, x, w / bl.cols.length - 12)) + 10, 0)));
    default: return 40;
  }
}

function drawSlideBlock(doc, parent, bl, r, ctx) {
  const ink = col(INK);
  switch (bl.t) {
    case 'p': {
      const h = textHeight(doc, bl.text, { size: 12, width: r.w });
      parent.add(doc.struct('P', () => doc.font(bl.style === 'strong' ? 'Semi' : 'Body').fontSize(12).fillColor(bl.style === 'muted' ? col(INK2) : ink).text(doc.safe(bl.text), r.x, r.y, { width: r.w, height: r.h, ellipsis: true, lineGap: 2 })));
      return Math.min(h, r.h);
    }
    case 'bullets': {
      const list = doc.struct('L');
      parent.add(list);
      let y = r.y;
      for (const it of bl.items) {
        const h = textHeight(doc, it, { size: 12, width: r.w - 18 });
        if (y + h > r.y + r.h) break;
        const li = doc.struct('LI');
        list.add(li);
        li.add(doc.struct('Lbl', () => doc.font('Bold').fontSize(12).fillColor(col(ctx.branding.accent || '#0fa3b1')).text('•', r.x, y, { lineBreak: false })));
        li.add(doc.struct('LBody', () => doc.font('Body').fontSize(12).fillColor(ink).text(doc.safe(it), r.x + 18, y, { width: r.w - 18, lineGap: 2 })));
        li.end();
        y += h + 4;
      }
      list.end();
      return y - r.y;
    }
    case 'kpis': {
      const n = bl.items.length;
      const w = (r.w - (n - 1) * 10) / n;
      bl.items.forEach((k, i) => {
        const x = r.x + i * (w + 10);
        artifact(doc, () => doc.roundedRect(x, r.y, w, 70, 6).lineWidth(0.8).strokeColor(col(LINE)).stroke());
        parent.add(doc.struct('P', () => {
          doc.font('Semi').fontSize(9).fillColor(col(INK2)).text(doc.safe(k.label), x + 10, r.y + 8, { width: w - 20, lineBreak: false, height: 11, ellipsis: true });
          doc.font('Bold').fontSize(22).fillColor(k.tone ? col({ good: STATUS.goodInk, warning: STATUS.warningInk, critical: STATUS.criticalInk }[k.tone] || INK) : ink).text(doc.safe(String(k.value ?? '—')), x + 10, r.y + 22, { width: w - 20, lineBreak: false });
          if (k.sub) doc.font('Body').fontSize(8).fillColor(col(INK2)).text(doc.safe(k.sub), x + 10, r.y + 52, { width: w - 20, lineBreak: false, height: 10, ellipsis: true });
        }));
      });
      return 70;
    }
    case 'table': {
      const rows = bl.rows.slice(0, Math.max(1, Math.floor((r.h - 22) / 19)));
      const total = bl.columns.reduce((a, c) => a + (c.w || 1), 0);
      const widths = bl.columns.map((c) => ((c.w || 1) / total) * r.w);
      const tbl = doc.struct('Table');
      parent.add(tbl);
      artifact(doc, () => doc.rect(r.x, r.y, r.w, 20).fill(col(ctx.branding.primary)));
      const th = doc.struct('TR');
      tbl.add(th);
      let x = r.x;
      bl.columns.forEach((c, i) => { const cx = x; th.add(doc.struct('TH', { scope: 'Column' }, () => doc.font('Semi').fontSize(9).fillColor('#FFFFFF').text(doc.safe(c.label), cx + 4, r.y + 5.5, { width: widths[i] - 8, lineBreak: false, height: 11, ellipsis: true, align: c.align === 'r' ? 'right' : c.align === 'c' ? 'center' : 'left' }))); x += widths[i]; });
      th.end();
      rows.forEach((row, ri) => {
        const y = r.y + 20 + ri * 19;
        artifact(doc, () => {
          let xx = r.x;
          bl.columns.forEach((c, i) => { if (row[i]?.fill) doc.rect(xx, y, widths[i], 19).fill(col(row[i].fill)); xx += widths[i]; });
          doc.moveTo(r.x, y + 19).lineTo(r.x + r.w, y + 19).lineWidth(0.4).strokeColor(col(LINE)).stroke();
        });
        const tr = doc.struct('TR');
        tbl.add(tr);
        let xx = r.x;
        bl.columns.forEach((c, i) => { const cx = xx; const cell = row[i] || { text: '' }; tr.add(doc.struct('TD', () => doc.font(cell.bold ? 'Semi' : 'Body').fontSize(9).fillColor(cell.color ? col(cell.color) : ink).text(doc.safe(cell.text), cx + 4, y + 5, { width: widths[i] - 8, lineBreak: false, height: 11, ellipsis: true, align: (cell.align || c.align) === 'r' ? 'right' : (cell.align || c.align) === 'c' ? 'center' : 'left' }))); xx += widths[i]; });
        tr.end();
      });
      tbl.end();
      return 20 + rows.length * 19;
    }
    case 'chart': {
      parent.add(doc.struct('Figure', { alt: doc.safe(bl.alt) }, () => {
        if (bl.title) doc.font('Semi').fontSize(10).fillColor(col(INK2)).text(doc.safe(bl.title), r.x, r.y, { width: r.w, lineBreak: false });
        drawChart(doc, { ...bl, categories: bl.categories }, { x: r.x, y: r.y + (bl.title ? 16 : 0), w: r.w, h: r.h - (bl.title ? 16 : 0) });
      }));
      return r.h;
    }
    case 'callout': {
      const [fill, edge] = CALLOUT[bl.tone] || CALLOUT.info;
      const text = `${bl.title ? `${bl.title}. ` : ''}${bl.text}`;
      const h = Math.min(r.h, textHeight(doc, text, { size: 11, width: r.w - 24 }) + 16);
      artifact(doc, () => { doc.roundedRect(r.x, r.y, r.w, h, 4).fill(col(fill)); doc.rect(r.x, r.y, 4, h).fill(col(edge)); });
      parent.add(doc.struct('P', () => doc.font('Body').fontSize(11).fillColor(ink).text(doc.safe(text), r.x + 14, r.y + 8, { width: r.w - 24, height: h - 10, ellipsis: true })));
      return h;
    }
    case 'cols': {
      const n = bl.cols.length;
      const w = (r.w - (n - 1) * 20) / n;
      let maxH = 0;
      bl.cols.forEach((c, i) => {
        let y = r.y;
        const charts = c.filter((x) => x.t === 'chart').length;
        const fixed = c.reduce((a, x) => a + (x.t === 'chart' ? 0 : estimate(doc, x, w)), 0);
        for (const x of c) {
          const avail = r.y + r.h - y;
          if (avail < 20) break;
          const hh = x.t === 'chart' ? Math.max(100, (r.h - fixed - 10 * c.length) / Math.max(1, charts)) : avail;
          y += drawSlideBlock(doc, parent, x, { x: r.x + i * (w + 20), y, w, h: Math.min(hh, avail) }, ctx) + 10;
        }
        maxH = Math.max(maxH, y - r.y);
      });
      return maxH;
    }
    default: return 0;
  }
}
