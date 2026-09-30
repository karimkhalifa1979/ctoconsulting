// PowerPoint generation (spec section 10) in the CTO Consulting master, using native, editable objects:
// placeholders, tables, a native chart from pricing data, a timeline built from shapes and speaker notes.
import PptxGenJS from 'pptxgenjs';
import { aud } from '../core/util.js';
import { initials } from '../core/util.js';

const NAVY = '0B1F3A', TEAL = '0FA3B1', TEAL_DARK = '0B7D88', LIGHT = '7FD6DE', GREY = '5A6675', LINE = 'CFD7E2', BAND = 'F4F6F9', INK = '1F2937';
const FONT = 'Arial';

export function toBase64(bytes) {
  if (!bytes) return null;
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
const png = (bytes) => (bytes ? `image/png;base64,${toBase64(bytes)}` : null);

function defineMasters(pptx, assets) {
  const logoWhite = png(assets.logoWhite), mark = png(assets.mark);
  const footer = { text: { text: 'CTO Consulting | Commercial-in-confidence', options: { x: 0.6, y: 7.02, w: 6, h: 0.3, fontFace: FONT, fontSize: 9, color: GREY } } };
  const number = { x: 11.9, y: 7.02, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 9, color: GREY, align: 'right' };
  pptx.defineSlideMaster({
    title: 'CTO_TITLE', background: { color: NAVY },
    objects: [
      { rect: { x: 12.93, y: 0, w: 0.4, h: 7.5, fill: { color: TEAL }, line: { color: TEAL, width: 0 } } },
      { rect: { x: 0.6, y: 1.95, w: 0.9, h: 0.08, fill: { color: TEAL }, line: { color: TEAL, width: 0 } } },
      ...(logoWhite ? [{ image: { x: 0.6, y: 6.2, w: 3.2, h: 0.7, data: logoWhite } }] : []),
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 2.2, w: 9.8, h: 1.8, fontFace: FONT, fontSize: 40, bold: true, color: 'FFFFFF', valign: 'top', align: 'left' }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.6, y: 4.1, w: 9.8, h: 0.9, fontFace: FONT, fontSize: 20, color: LIGHT, valign: 'top', align: 'left' }, text: '' } },
    ],
  });
  pptx.defineSlideMaster({
    title: 'CTO_CONTENT', background: { color: 'FFFFFF' }, slideNumber: number,
    objects: [
      { rect: { x: 0, y: 0, w: 13.333, h: 0.09, fill: { color: TEAL }, line: { color: TEAL, width: 0 } } },
      footer,
      ...(mark ? [{ image: { x: 12.55, y: 6.93, w: 0.42, h: 0.42, data: mark } }] : []),
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.4, w: 12.1, h: 1.0, fontFace: FONT, fontSize: 28, bold: true, color: NAVY, valign: 'middle', align: 'left' }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.6, y: 1.6, w: 12.1, h: 5.1, fontFace: FONT, fontSize: 20, color: INK, valign: 'top', align: 'left' }, text: '' } },
    ],
  });
  pptx.defineSlideMaster({
    title: 'CTO_VISUAL', background: { color: 'FFFFFF' }, slideNumber: number,
    objects: [
      { rect: { x: 0, y: 0, w: 13.333, h: 0.09, fill: { color: TEAL }, line: { color: TEAL, width: 0 } } },
      footer,
      ...(mark ? [{ image: { x: 12.55, y: 6.93, w: 0.42, h: 0.42, data: mark } }] : []),
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.4, w: 12.1, h: 1.0, fontFace: FONT, fontSize: 28, bold: true, color: NAVY, valign: 'middle', align: 'left' }, text: '' } },
    ],
  });
  pptx.defineSlideMaster({
    title: 'CTO_SECTION', background: { color: NAVY }, slideNumber: { ...number, color: LIGHT },
    objects: [
      { rect: { x: 0.6, y: 3.1, w: 0.9, h: 0.08, fill: { color: TEAL }, line: { color: TEAL, width: 0 } } },
      ...(logoWhite ? [{ image: { x: 0.6, y: 6.2, w: 3.2, h: 0.7, data: logoWhite } }] : []),
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 3.3, w: 12, h: 1.3, fontFace: FONT, fontSize: 40, bold: true, color: 'FFFFFF', align: 'left' }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.6, y: 4.6, w: 12, h: 0.8, fontFace: FONT, fontSize: 18, color: LIGHT, align: 'left' }, text: '' } },
    ],
  });
}

const bullets = (points) => points.map((p) => ({ text: p, options: { bullet: { indent: 18 }, paraSpaceAfter: 10, breakLine: true } }));

function notesFor(s) {
  const src = (s.sources || []).map((x) => x.label).filter(Boolean);
  return `${s.notes || ''}${src.length ? `\n\nSources: ${[...new Set(src)].join(', ')}` : ''}`.trim();
}

function timeline(slide, phases) {
  const n = Math.max(1, phases.length);
  const x0 = 0.8, x1 = 12.5, y = 3.2;
  slide.addShape('line', { x: x0, y: y + 0.45, w: x1 - x0, h: 0, line: { color: LINE, width: 2, endArrowType: 'triangle' } });
  const step = (x1 - x0 - 0.4) / n;
  phases.forEach((p, i) => {
    const x = x0 + i * step;
    slide.addShape('roundRect', { x, y, w: step - 0.2, h: 0.9, fill: { color: i % 2 ? TEAL_DARK : NAVY }, line: { color: 'FFFFFF', width: 0 }, rectRadius: 0.1 });
    slide.addText(p.label, { x, y, w: step - 0.2, h: 0.9, fontFace: FONT, fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 4 });
    slide.addText(p.detail || '', { x, y: y + 1.05, w: step - 0.2, h: 1.2, fontFace: FONT, fontSize: 12, color: GREY, align: 'center', valign: 'top' });
  });
}

function teamGrid(slide, members, photos) {
  const cols = members.length > 4 ? 3 : 2;
  const w = 12.1 / cols, h = 2.45;
  members.forEach((m, i) => {
    const x = 0.6 + (i % cols) * w, y = 1.6 + Math.floor(i / cols) * h;
    const photo = photos?.[m.consultantId];
    if (photo) slide.addImage({ data: `image/png;base64,${toBase64(photo)}`, x, y, w: 1.1, h: 1.1, rounding: true, altText: `Photo of ${m.name}` });
    else {
      slide.addShape('ellipse', { x, y, w: 1.1, h: 1.1, fill: { color: i % 2 ? TEAL_DARK : NAVY }, line: { color: 'FFFFFF', width: 0 } });
      slide.addText(initials(m.name), { x, y, w: 1.1, h: 1.1, fontFace: FONT, fontSize: 22, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    }
    slide.addText([
      { text: m.name, options: { bold: true, color: NAVY, fontSize: 15, breakLine: true } },
      { text: m.role, options: { color: TEAL_DARK, fontSize: 12, breakLine: true } },
      { text: [m.level, m.clearance && m.clearance !== 'None' ? `${m.clearance} clearance` : ''].filter(Boolean).join(' · '), options: { color: GREY, fontSize: 11, breakLine: true } },
      { text: m.bio || '', options: { color: INK, fontSize: 10.5 } },
    ], { x: x + 1.25, y, w: w - 1.45, h: h - 0.2, fontFace: FONT, valign: 'top', margin: 0 });
  });
}

function caseStudy(slide, cs, points) {
  slide.addText(`${cs.client}${cs.sector ? ` · ${cs.sector}` : ''}${cs.services ? ` · ${cs.services}` : ''}${cs.value ? ` · ${cs.value}` : ''}`, { x: 0.6, y: 1.45, w: 12.1, h: 0.4, fontFace: FONT, fontSize: 13, color: TEAL_DARK, bold: true });
  slide.addText(cs.summary || '', { x: 0.6, y: 2.0, w: 6.2, h: 4.6, fontFace: FONT, fontSize: 16, color: INK, valign: 'top' });
  slide.addShape('rect', { x: 7.2, y: 2.0, w: 5.5, h: 4.6, fill: { color: NAVY }, line: { color: NAVY, width: 0 } });
  slide.addText([{ text: 'Outcomes', options: { bold: true, color: LIGHT, fontSize: 14, breakLine: true } }, ...points.map((p) => ({ text: p, options: { bullet: { indent: 16 }, color: 'FFFFFF', fontSize: 15, paraSpaceBefore: 8, breakLine: true } }))], { x: 7.45, y: 2.2, w: 5.0, h: 4.2, fontFace: FONT, valign: 'top' });
}

function commercial(pptx, slide, s) {
  const rows = [
    [{ text: 'Item', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } }, { text: 'Amount', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } }],
    ...s.points.slice(1).map((p, i) => { const [k, v] = p.split(': '); return [{ text: k, options: { fill: { color: i % 2 ? 'FFFFFF' : BAND } } }, { text: v || '', options: { align: 'right', bold: /Total/.test(k), fill: { color: i % 2 ? 'FFFFFF' : BAND } } }]; }),
  ];
  slide.addText(s.points[0] || '', { x: 0.6, y: 1.5, w: 6, h: 0.5, fontFace: FONT, fontSize: 16, color: TEAL_DARK, bold: true });
  slide.addTable(rows, { x: 0.6, y: 2.1, w: 5.6, colW: [3.4, 2.2], fontFace: FONT, fontSize: 14, color: INK, border: { type: 'solid', color: LINE, pt: 1 }, rowH: 0.45 });
  const lines = (s.data?.lines || []).filter((l) => l.amount > 0);
  if (lines.length) {
    slide.addChart(pptx.ChartType.bar, [{ name: 'Fees (ex GST)', labels: lines.map((l) => l.role), values: lines.map((l) => Math.round(l.amount)) }], {
      x: 6.6, y: 1.5, w: 6.1, h: 5.2, barDir: 'bar', chartColors: [TEAL_DARK], catAxisLabelFontSize: 10, valAxisLabelFontSize: 9, valAxisLabelFormatCode: '$#,##0', dataLabelFormatCode: '$#,##0',
      showValue: true, dataLabelFontSize: 9, dataLabelColor: INK, showLegend: false, showTitle: true, title: 'Fees by role (excluding GST)', titleFontSize: 12, titleColor: NAVY, catAxisOrientation: 'maxMin', valGridLine: { color: 'E5E7EB', size: 0.5 },
    });
  }
  if (s.data?.milestones?.length) slide.addText(`Payment milestones: ${s.data.milestones.map((m) => `${m.label} (${m.pct}%)`).join('; ')}`, { x: 0.6, y: 5.3, w: 5.6, h: 1.3, fontFace: FONT, fontSize: 11, color: GREY, valign: 'top' });
}

export async function renderDeck(deck, { title, client, assets = {}, photos = {} } = {}) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'CTO Consulting';
  pptx.company = 'CTO Consulting';
  pptx.title = title || 'CTO Consulting presentation';
  pptx.subject = client ? `Presentation to ${client}` : '';
  defineMasters(pptx, assets);
  for (const s of deck.slides.filter((x) => x.include !== false)) {
    if (s.layout === 'title') {
      const slide = pptx.addSlide({ masterName: 'CTO_TITLE' });
      slide.addText(s.title, { placeholder: 'title', align: 'left' });
      slide.addText(s.subtitle || '', { placeholder: 'body', align: 'left' });
      slide.addNotes(notesFor(s));
      continue;
    }
    if (s.layout === 'section') {
      const slide = pptx.addSlide({ masterName: 'CTO_SECTION' });
      slide.addText(s.title, { placeholder: 'title', align: 'left' });
      slide.addText(s.subtitle || '', { placeholder: 'body', align: 'left' });
      slide.addNotes(notesFor(s));
      continue;
    }
    const visual = ['timeline', 'team', 'case_study', 'table'].includes(s.layout) && (s.data || s.layout === 'table');
    const slide = pptx.addSlide({ masterName: visual ? 'CTO_VISUAL' : 'CTO_CONTENT' });
    slide.addText(s.title, { placeholder: 'title', align: 'left' });
    if (s.layout === 'timeline' && s.data?.phases?.length) timeline(slide, s.data.phases);
    else if (s.layout === 'team' && s.data?.members?.length) teamGrid(slide, s.data.members, photos);
    else if (s.layout === 'case_study' && s.data?.caseStudy) caseStudy(slide, s.data.caseStudy, s.points);
    else if (s.layout === 'table' && s.kind === 'commercial') commercial(pptx, slide, s);
    else if (visual) slide.addText(bullets(s.points), { x: 0.6, y: 1.6, w: 12.1, h: 5.1, fontFace: FONT, fontSize: 20, color: INK, valign: 'top' });
    else slide.addText(bullets(s.points), { placeholder: 'body', align: 'left' });
    slide.addNotes(notesFor(s));
  }
  return pptx.write({ outputType: 'uint8array' });
}

export const DECK_COLOURS = { NAVY, TEAL, TEAL_DARK, LIGHT, GREY };
export { aud };
