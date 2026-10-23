// PowerPoint (.pptx) renderer (ART-005, ART-008): slides on a master built from the template's branding
// (colours, fonts, footer and classification marking), with native, editable text, tables and charts,
// slide titles in title placeholders for screen readers, alternative text on charts, and speaker notes.
import PptxGenJS from 'pptxgenjs';
import { hex, fmtDate, INK, INK2, LINE, STATUS } from '../ir.js';
import { asArray } from '../../util.js';

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
  // The organisation's own master artwork, when its PowerPoint template was uploaded (ART-005).
  const art = ctx.pptxMaster ? await masterArtwork(ctx.pptxMaster).catch(() => null) : null;
  const light = (c) => { const n = parseInt(c, 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 > 0.6; };
  const titleBg = art?.title.bg || { color: primary };
  const titleInk = art?.title.titleColour || (titleBg.color && light(titleBg.color) ? primary : 'FFFFFF');
  const titleSub = light(titleInk) ? 'DDE6F0' : INK2;
  const pictures = (list) => list.map((p) => ({ image: { x: p.x, y: p.y, w: p.w, h: p.h, data: p.data } }));
  // The footer and slide titles stop short of the template's pictures in those bands (a logo, say).
  const clearOf = (y1, y2, fallback) => Math.min(fallback, ...asArray(art?.content.pictures).filter((p) => p.w < W * 0.6 && p.y < y2 && p.y + p.h > y1 && p.x > W / 2).map((p) => p.x - 0.15));
  const footEnd = clearOf(H - 0.6, H - 0.2, W - 0.5);
  const titleEnd = clearOf(0.38, 1.13, W - 0.5);
  const cls = (dc.classification || '').toUpperCase();
  const footer = `${br.footer || br.organisation || s.organisation || ''} · ${dc.title || ''} · Version ${dc.version || ''} ${dc.status || ''} · ${fmtDate(dc.generatedAt)}`;
  const marking = cls ? [{ text: { text: cls, options: { x: 0, y: 0.1, w: W, h: 0.25, align: 'center', fontFace: fontBody, fontSize: 9, bold: true, color: 'A32626' } } }, { text: { text: cls, options: { x: 0, y: H - 0.3, w: W, h: 0.25, align: 'center', fontFace: fontBody, fontSize: 9, bold: true, color: 'A32626' } } }] : [];
  const watermark = ctx.watermark ? [{ text: { text: dc.status === 'Approved' ? 'COPY' : 'DRAFT', options: { x: 2.2, y: 2.4, w: 9, h: 2.6, align: 'center', fontFace: fontHead, fontSize: 120, bold: true, color: 'B9C0CA', transparency: 82, rotate: -20 } } }] : [];
  pptx.defineSlideMaster({
    title: 'CMW_TITLE', background: titleBg,
    objects: [...(art ? pictures(art.title.pictures) : [{ rect: { x: 0, y: H - 0.14, w: W, h: 0.14, fill: { color: accent } } }]), ...marking.map((m) => ({ text: { ...m.text, options: { ...m.text.options, color: light(titleInk) ? 'F3B2AB' : 'A32626' } } })), ...watermark,
      { placeholder: { options: { name: 'title', type: 'title', x: 0.8, y: 2.3, w: W - 1.6, h: 1.4, fontFace: fontHead, fontSize: 38, bold: true, color: titleInk, align: 'left', valign: 'bottom', margin: 0 }, text: 'Title' } }],
  });
  pptx.defineSlideMaster({
    title: 'CMW_CONTENT', background: art?.content.bg || { color: 'FFFFFF' },
    objects: [...(art ? pictures(art.content.pictures) : [{ rect: { x: 0, y: 0, w: W, h: 0.07, fill: { color: accent } } }]), ...marking, ...watermark,
      { line: { x: 0.5, y: H - 0.55, w: footEnd - 0.5, h: 0, line: { color: LINE, width: 0.75 } } },
      { text: { text: footer, options: { x: 0.5, y: H - 0.52, w: footEnd - 1.3, h: 0.24, fontFace: fontBody, fontSize: 9, color: INK2, margin: 0 } } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.38, w: titleEnd - 0.5, h: 0.75, fontFace: fontHead, fontSize: 26, bold: true, color: art?.content.titleColour || primary, align: 'left', valign: 'middle', margin: 0 }, text: 'Title' } }],
    slideNumber: { x: footEnd - 0.7, y: H - 0.52, w: 0.7, h: 0.24, fontFace: fontBody, fontSize: 9, color: INK2, align: 'right' },
  });
  const lctx = { primary, fontBody };
  for (const sl of deck.slides) {
    if (sl.layout === 'title' || sl.layout === 'section') {
      const slide = pptx.addSlide({ masterName: 'CMW_TITLE' });
      slide.addText(sl.title, { placeholder: 'title' });
      if (sl.subtitle) slide.addText(sl.subtitle, { x: 0.8, y: 3.85, w: W - 1.6, h: 0.6, fontFace: fontBody, fontSize: 18, color: titleSub, margin: 0 });
      if (sl.layout === 'title') slide.addText([br.organisation || s.organisation, fmtDate(dc.generatedAt), `Version ${dc.version || ''} ${dc.status || ''}`].filter(Boolean).join(' · '), { x: 0.8, y: 5.9, w: W - 1.6, h: 0.4, fontFace: fontBody, fontSize: 12, color: titleSub, margin: 0 });
      if (ctx.caveat && sl.layout === 'title') slide.addText(`Handling caveat: ${ctx.caveat}`, { x: 0.8, y: 6.35, w: W - 1.6, h: 0.5, fontFace: fontBody, fontSize: 10, color: light(titleInk) ? 'F3B2AB' : 'A32626', margin: 0 });
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

// The artwork of an uploaded PowerPoint template (ART-005): the background and pictures (logos, bands,
// imagery) of its slide master and its title and content layouts, scaled to the generated slide size, and
// the colour its title slide uses for titles. Generated slides keep native, editable text, tables and
// charts on top. Picture types PowerPoint can show but a browser cannot (EMF, WMF) are left out.
const EMU = 914400;
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml' };
export async function masterArtwork(bytes) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(bytes);
  const read = (p) => zip.file(p)?.async('string') ?? Promise.resolve(null);
  const pres = await read('ppt/presentation.xml');
  const size = /<p:sldSz[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(pres || '');
  const sx = size ? W / (Number(size[1]) / EMU) : 1, sy = size ? H / (Number(size[2]) / EMU) : 1;
  const rels = async (part) => {
    const dir = part.slice(0, part.lastIndexOf('/'));
    const xml = await read(`${dir}/_rels/${part.slice(dir.length + 1)}.rels`);
    const out = {};
    for (const m of (xml || '').matchAll(/<Relationship\b[^>]*>/g)) {
      const id = /Id="([^"]+)"/.exec(m[0])?.[1], target = /Target="([^"]+)"/.exec(m[0])?.[1];
      if (id && target) out[id] = target.startsWith('/') ? target.slice(1) : new URL(target, `http://x/${dir}/`).pathname.slice(1);
    }
    return out;
  };
  const media = async (path) => {
    const ext = path.split('.').pop().toLowerCase();
    if (!IMAGE_TYPES[ext] || !zip.file(path)) return null;
    return `${IMAGE_TYPES[ext]};base64,${await zip.file(path).async('base64')}`;
  };
  const theme = await read(Object.keys(zip.files).find((f) => /^ppt\/theme\/theme\d+\.xml$/.test(f)) || '');
  const scheme = (name) => new RegExp(`<a:${name}>\\s*<a:(?:srgbClr val|sysClr[^>]*lastClr)="([0-9A-Fa-f]{6})"`).exec(theme || '')?.[1] || null;
  const SCHEME = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
  const colourOf = (xml) => {
    const m = /<a:solidFill>\s*<a:(srgbClr|schemeClr) val="([^"]+)"/.exec(xml || '');
    if (!m) return null;
    return m[1] === 'srgbClr' ? m[2].toUpperCase() : scheme(SCHEME[m[2]] || m[2]);
  };
  const partArt = async (part) => {
    const xml = await read(part);
    if (!xml) return null;
    const r = await rels(part);
    const bgXml = /<p:bg>([\s\S]*?)<\/p:bg>/.exec(xml)?.[1] || '';
    const blip = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(bgXml)?.[1];
    const bg = blip && r[blip] ? { data: await media(r[blip]) } : colourOf(bgXml) ? { color: colourOf(bgXml) } : null;
    const pictures = [];
    for (const m of xml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)) {
      if (/<p:ph\b/.test(m[1])) continue;
      const id = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(m[1])?.[1];
      const off = /<a:off x="(-?\d+)" y="(-?\d+)"/.exec(m[1]), ext = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(m[1]);
      const data = id && r[id] ? await media(r[id]) : null;
      if (data && off && ext) pictures.push({ x: (off[1] / EMU) * sx, y: (off[2] / EMU) * sy, w: (ext[1] / EMU) * sx, h: (ext[2] / EMU) * sy, data });
    }
    const titleSp = /<p:sp>(?:(?!<\/p:sp>)[\s\S])*?<p:ph type="(?:ctrTitle|title)"[\s\S]*?<\/p:sp>/.exec(xml)?.[0];
    return { bg: bg?.data === null ? null : bg, pictures, hidesMaster: /showMasterSp="0"/.test(xml), titleColour: colourOf(/<a:defRPr[\s\S]*?<\/a:defRPr>|<a:rPr[\s\S]*?<\/a:rPr>/.exec(titleSp || '')?.[0]) };
  };
  const masterPart = Object.keys(zip.files).find((f) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(f));
  if (!masterPart) return null;
  const master = await partArt(masterPart);
  const masterXml = await read(masterPart);
  master.titleColour ||= colourOf(/<p:titleStyle>[\s\S]*?<\/a:lvl1pPr>/.exec(masterXml || '')?.[0]);
  const layouts = [];
  for (const f of Object.keys(zip.files).filter((x) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(x)).sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]))) {
    const type = /<p:sldLayout\b[^>]*\btype="([^"]+)"/.exec((await read(f)) || '')?.[1] || '';
    layouts.push({ type, part: f });
  }
  const layoutArt = async (types) => { const l = layouts.find((x) => types.includes(x.type)) || null; return l ? partArt(l.part) : null; };
  const combine = (layout) => ({
    bg: layout?.bg || master.bg,
    pictures: [...(layout?.hidesMaster ? [] : master.pictures), ...(layout?.pictures || [])],
    titleColour: layout?.titleColour || master.titleColour,
  });
  const art = { title: combine(await layoutArt(['title'])), content: combine(await layoutArt(['obj', 'tx', 'titleOnly'])) };
  return art.title.bg || art.title.pictures.length || art.content.bg || art.content.pictures.length ? art : null;
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
