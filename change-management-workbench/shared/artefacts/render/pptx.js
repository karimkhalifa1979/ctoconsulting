// PowerPoint (.pptx) renderer (ART-005, ART-008): slides on a master built from the template's branding
// (colours, fonts, footer and classification marking), with native, editable text, tables and charts,
// slide titles in title placeholders for screen readers, alternative text on charts, and speaker notes.
import PptxGenJS from 'pptxgenjs';
import { hex, fmtDate, INK, INK2, LINE, STATUS } from '../ir.js';

const W = 13.333, H = 7.5;
const BOX = { x: 0.5, y: 1.25, w: W - 1, h: 5.6 };
const TONES = { good: STATUS.goodInk, warning: STATUS.warningInk, critical: STATUS.criticalInk };
const CALLOUT = { info: [STATUS.infoSoft, '2A78D6'], warn: [STATUS.warningSoft, STATUS.warning], bad: [STATUS.criticalSoft, STATUS.critical], good: [STATUS.goodSoft, STATUS.good] };

// Text height estimates in inches for laying out a slide (average glyph width about half the font size).
const lines = (text, w, pt) => Math.max(1, String(text || '').split('\n').reduce((a, l) => a + Math.max(1, Math.ceil((l.length * pt * 0.5) / 72 / w)), 0));
const lineH = (pt) => (pt * 1.22) / 72;

function estimate(bl, w) {
  switch (bl.t) {
    case 'p': return lines(bl.text, w, 14) * lineH(14) + 0.08;
    case 'bullets': return bl.items.reduce((a, it) => a + lines(it, w - 0.3, 14) * lineH(14) + 0.08, 0) + 0.05;
    case 'kpis': return 1.1;
    case 'table': return 0.36 + Math.min(bl.rows.length, 12) * 0.34;
    case 'callout': return lines(bl.text, w - 0.4, 12) * lineH(12) + 0.3;
    case 'cols': return Math.max(...bl.cols.map((c) => c.reduce((a, x) => a + (x.t === 'chart' ? 2.6 : estimate(x, w / bl.cols.length - 0.3)) + 0.15, 0)));
    default: return 0.5;
  }
}

function addBlocks(pptx, slide, blocks, box, ctx) {
  const charts = blocks.filter((b) => b.t === 'chart').length;
  const fixed = blocks.reduce((a, b) => a + (b.t === 'chart' ? 0 : estimate(b, box.w)) + 0.15, 0);
  const chartH = charts ? Math.max(1.8, (box.h - fixed) / charts) : 0;
  let y = box.y;
  for (const b of blocks) {
    const avail = box.y + box.h - y;
    if (avail < 0.3) break;
    const h = b.t === 'chart' ? Math.min(chartH, avail) : Math.min(estimate(b, box.w), avail);
    addBlock(pptx, slide, b, { x: box.x, y, w: box.w, h }, ctx);
    y += h + 0.15;
  }
}

function addBlock(pptx, slide, b, r, ctx) {
  const body = ctx.fontBody;
  switch (b.t) {
    case 'p':
      slide.addText(b.text, { x: r.x, y: r.y, w: r.w, h: r.h, fontFace: body, fontSize: 14, bold: b.style === 'strong', color: b.style === 'muted' ? INK2 : INK, valign: 'top', margin: 0, fit: 'shrink' });
      break;
    case 'bullets':
      if (!b.items.length) break;
      slide.addText(b.items.map((it) => ({ text: it, options: { bullet: { indent: 16 }, breakLine: true } })), { x: r.x, y: r.y, w: r.w, h: r.h, fontFace: body, fontSize: 14, color: INK, valign: 'top', paraSpaceAfter: 6, margin: 0, fit: 'shrink' });
      break;
    case 'kpis': {
      const n = b.items.length;
      const w = (r.w - (n - 1) * 0.2) / n;
      b.items.forEach((k, i) => {
        const x = r.x + i * (w + 0.2);
        slide.addShape(pptx.ShapeType.roundRect, { x, y: r.y, w, h: 1.0, fill: { color: 'FFFFFF' }, line: { color: LINE, width: 0.75 }, rectRadius: 0.06 });
        slide.addText([
          { text: k.label, options: { fontSize: 11, color: INK2, breakLine: true } },
          { text: String(k.value ?? '—'), options: { fontSize: 24, bold: true, color: TONES[k.tone] || INK, breakLine: !!k.sub } },
          ...(k.sub ? [{ text: k.sub, options: { fontSize: 9.5, color: INK2 } }] : []),
        ], { x: x + 0.12, y: r.y + 0.05, w: w - 0.24, h: 0.9, fontFace: body, valign: 'top', margin: 0 });
      });
      break;
    }
    case 'table': {
      const maxRows = Math.max(1, Math.floor((r.h - 0.36) / 0.34));
      const rows = b.rows.slice(0, maxRows);
      if (!rows.length) { slide.addText(b.empty || 'None recorded.', { x: r.x, y: r.y, w: r.w, h: 0.4, fontFace: body, fontSize: 12, italic: true, color: INK2, margin: 0 }); break; }
      const total = b.columns.reduce((a, c) => a + (c.w || 1), 0);
      const colW = b.columns.map((c) => ((c.w || 1) / total) * r.w);
      const align = (a) => (a === 'r' ? 'right' : a === 'c' ? 'center' : 'left');
      const head = b.columns.map((c) => ({ text: c.label, options: { bold: true, color: 'FFFFFF', fill: { color: ctx.primary }, align: align(c.align) } }));
      const data = rows.map((row) => b.columns.map((c, i) => { const cell = row[i] || { text: '' }; return { text: cell.text, options: { bold: !!cell.bold, color: cell.color ? hex(cell.color) : INK, align: align(cell.align || c.align), ...(cell.fill ? { fill: { color: hex(cell.fill) } } : {}) } }; }));
      slide.addTable([head, ...data], { x: r.x, y: r.y, w: r.w, colW, fontFace: body, fontSize: 10.5, valign: 'middle', border: { type: 'solid', color: LINE, pt: 0.5 }, margin: [2, 5, 2, 5], rowH: 0.3, autoPage: false });
      if (b.rows.length > rows.length) slide.addText(`and ${b.rows.length - rows.length} more`, { x: r.x, y: Math.min(r.y + 0.36 + rows.length * 0.34, BOX.y + BOX.h - 0.25), w: r.w, h: 0.25, fontFace: body, fontSize: 9, italic: true, color: INK2, margin: 0 });
      break;
    }
    case 'chart': {
      const stacked = b.kind === 'stacked';
      const type = b.kind === 'line' ? pptx.charts.LINE : pptx.charts.BAR;
      const horizontal = b.kind === 'bar' || stacked;
      slide.addChart(type, b.series.map((s) => ({ name: s.name, labels: b.categories, values: s.values.map((v) => (v == null ? null : v)) })), {
        x: r.x, y: r.y, w: r.w, h: r.h, altText: b.alt, showTitle: !!b.title, title: b.title, titleFontSize: 12, titleColor: INK2, titleFontFace: body,
        ...(type === pptx.charts.BAR ? { barDir: horizontal ? 'bar' : 'col', barGrouping: stacked ? 'stacked' : 'clustered', barGapWidthPct: 60 } : { lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 6 }),
        chartColors: b.series.map((s) => s.color),
        showLegend: b.series.length > 1, legendPos: 'b', legendFontSize: 10, legendFontFace: body,
        catAxisLabelFontSize: 10, valAxisLabelFontSize: 9, catAxisLabelColor: INK2, valAxisLabelColor: INK2, catAxisLabelFontFace: body, valAxisLabelFontFace: body,
        ...(horizontal ? { catAxisOrientation: 'maxMin', valAxisOrientation: 'minMax' } : {}),
        ...(b.max != null ? { valAxisMaxVal: b.max } : {}), ...(b.min != null ? { valAxisMinVal: b.min } : {}),
        valGridLine: { color: 'E3E7EE', size: 0.5 }, catGridLine: { style: 'none' },
        ...(b.series.length === 1 && type === pptx.charts.BAR ? { showValue: true, dataLabelFontSize: 9, dataLabelColor: INK, dataLabelPosition: stacked ? 'ctr' : 'outEnd' } : {}),
      });
      break;
    }
    case 'callout': {
      const [fill, edge] = CALLOUT[b.tone] || CALLOUT.info;
      slide.addShape(pptx.ShapeType.rect, { x: r.x, y: r.y, w: r.w, h: r.h, fill: { color: fill }, line: { color: fill, width: 0 } });
      slide.addShape(pptx.ShapeType.rect, { x: r.x, y: r.y, w: 0.06, h: r.h, fill: { color: edge }, line: { color: edge, width: 0 } });
      slide.addText([...(b.title ? [{ text: `${b.title}. `, options: { bold: true } }] : []), { text: b.text }], { x: r.x + 0.18, y: r.y + 0.05, w: r.w - 0.3, h: r.h - 0.1, fontFace: body, fontSize: 12, color: INK, valign: 'middle', margin: 0, fit: 'shrink' });
      break;
    }
    case 'cols': {
      const n = b.cols.length;
      const w = (r.w - (n - 1) * 0.35) / n;
      b.cols.forEach((c, i) => addBlocks(pptx, slide, c, { x: r.x + i * (w + 0.35), y: r.y, w, h: r.h }, ctx));
      break;
    }
    default: break;
  }
}

export async function renderPptx(deck, ctx) {
  const { docControl: dc = {}, branding: br, s } = ctx;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = dc.generatedBy || 'Change Management Workbench';
  pptx.company = br.organisation || s.organisation || '';
  pptx.title = dc.title || deck.meta.title;
  pptx.subject = `${s.initiative.name} · Version ${dc.version || ''} ${dc.status || ''}`;
  pptx.revision = String(dc.version || '1');
  const fontHead = br.fontHeading || 'Calibri';
  const fontBody = br.fontBody || 'Calibri';
  pptx.theme = { headFontFace: fontHead, bodyFontFace: fontBody };
  const primary = hex(br.primary), accent = hex(br.accent, '0FA3B1');
  const cls = (dc.classification || '').toUpperCase();
  const footer = `${br.footer || br.organisation || s.organisation || ''} · ${dc.title || ''} · Version ${dc.version || ''} ${dc.status || ''} · ${fmtDate(dc.generatedAt)}`;
  const marking = cls ? [{ text: { text: cls, options: { x: 0, y: 0.1, w: W, h: 0.25, align: 'center', fontFace: fontBody, fontSize: 9, bold: true, color: 'A32626' } } }, { text: { text: cls, options: { x: 0, y: H - 0.3, w: W, h: 0.25, align: 'center', fontFace: fontBody, fontSize: 9, bold: true, color: 'A32626' } } }] : [];
  const watermark = ctx.watermark ? [{ text: { text: dc.status === 'Approved' ? 'COPY' : 'DRAFT', options: { x: 2.2, y: 2.4, w: 9, h: 2.6, align: 'center', fontFace: fontHead, fontSize: 120, bold: true, color: 'B9C0CA', transparency: 82, rotate: -20 } } }] : [];
  pptx.defineSlideMaster({
    title: 'CMW_TITLE', background: { color: primary },
    objects: [{ rect: { x: 0, y: H - 0.14, w: W, h: 0.14, fill: { color: accent } } }, ...marking.map((m) => ({ text: { ...m.text, options: { ...m.text.options, color: 'F3B2AB' } } })), ...watermark,
      { placeholder: { options: { name: 'title', type: 'title', x: 0.8, y: 2.3, w: W - 1.6, h: 1.4, fontFace: fontHead, fontSize: 38, bold: true, color: 'FFFFFF', align: 'left', valign: 'bottom', margin: 0 }, text: 'Title' } }],
  });
  pptx.defineSlideMaster({
    title: 'CMW_CONTENT', background: { color: 'FFFFFF' },
    objects: [{ rect: { x: 0, y: 0, w: W, h: 0.07, fill: { color: accent } } }, ...marking, ...watermark,
      { line: { x: 0.5, y: H - 0.55, w: W - 1, h: 0, line: { color: LINE, width: 0.75 } } },
      { text: { text: footer, options: { x: 0.5, y: H - 0.52, w: W - 2.2, h: 0.24, fontFace: fontBody, fontSize: 9, color: INK2, margin: 0 } } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.38, w: W - 1, h: 0.75, fontFace: fontHead, fontSize: 26, bold: true, color: primary, align: 'left', valign: 'middle', margin: 0 }, text: 'Title' } }],
    slideNumber: { x: W - 1.2, y: H - 0.52, w: 0.7, h: 0.24, fontFace: fontBody, fontSize: 9, color: INK2, align: 'right' },
  });
  const lctx = { primary, fontBody };
  for (const sl of deck.slides) {
    if (sl.layout === 'title' || sl.layout === 'section') {
      const slide = pptx.addSlide({ masterName: 'CMW_TITLE' });
      slide.addText(sl.title, { placeholder: 'title' });
      if (sl.subtitle) slide.addText(sl.subtitle, { x: 0.8, y: 3.85, w: W - 1.6, h: 0.6, fontFace: fontBody, fontSize: 18, color: 'DDE6F0', margin: 0 });
      if (sl.layout === 'title') slide.addText([br.organisation || s.organisation, fmtDate(dc.generatedAt), `Version ${dc.version || ''} ${dc.status || ''}`].filter(Boolean).join(' · '), { x: 0.8, y: 5.9, w: W - 1.6, h: 0.4, fontFace: fontBody, fontSize: 12, color: 'DDE6F0', margin: 0 });
      if (ctx.caveat && sl.layout === 'title') slide.addText(`Handling caveat: ${ctx.caveat}`, { x: 0.8, y: 6.35, w: W - 1.6, h: 0.5, fontFace: fontBody, fontSize: 10, color: 'F3B2AB', margin: 0 });
      if (sl.notes) slide.addNotes(sl.notes);
      continue;
    }
    const slide = pptx.addSlide({ masterName: 'CMW_CONTENT' });
    slide.addText(sl.title, { placeholder: 'title' });
    addBlocks(pptx, slide, sl.body || [], BOX, lctx);
    if (sl.notes) slide.addNotes(sl.notes);
  }
  const out = await pptx.write({ outputType: 'uint8array' });
  return titlesAsTitlePlaceholders(out instanceof Uint8Array ? out : new Uint8Array(out));
}

// Slide titles are written as standard title placeholders (type "title", index 0), as PowerPoint writes
// them, so the accessibility checker and assistive technology recognise each slide's title.
async function titlesAsTitlePlaceholders(bytes) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(bytes);
  const parts = Object.keys(zip.files).filter((f) => /^ppt\/(slides|slideLayouts)\/[^/]+\.xml$/.test(f));
  for (const f of parts) {
    const xml = await zip.file(f).async('string');
    const fixed = xml.replace(/<p:ph\s+idx="\d+"\s+type="title"/g, '<p:ph type="title"');
    if (fixed !== xml) zip.file(f, fixed);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

// Colours and fonts of an uploaded PowerPoint template's theme, applied to the generated slide master.
export async function extractPptxTheme(bytes) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(bytes);
  const name = Object.keys(zip.files).find((f) => /^ppt\/theme\/theme\d+\.xml$/.test(f));
  if (!name) throw Object.assign(new Error('The file has no theme.'), { status: 422 });
  const xml = await zip.file(name).async('string');
  const colour = (tag) => new RegExp(`<a:${tag}>\\s*<a:(?:srgbClr val|sysClr[^>]*lastClr)="([0-9A-Fa-f]{6})"`).exec(xml)?.[1] || null;
  const font = (tag) => new RegExp(`<a:${tag}>\\s*<a:latin typeface="([^"]+)"`).exec(xml)?.[1] || null;
  const dk2 = colour('dk2'), a1 = colour('accent1'), a2 = colour('accent2');
  return { primary: dk2 ? `#${dk2}` : a1 ? `#${a1}` : undefined, accent: a1 && dk2 ? `#${a1}` : a2 ? `#${a2}` : undefined, secondary: a2 ? `#${a2}` : undefined, fontHeading: font('majorFont') || undefined, fontBody: font('minorFont') || undefined, themeColours: { dk2, accent1: a1, accent2: a2, accent3: colour('accent3'), accent4: colour('accent4') } };
}
