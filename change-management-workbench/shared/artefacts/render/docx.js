// Word (.docx) renderer (ART-001, ART-004, ART-008, ART-019): native heading, list, caption and table
// styles; a table of contents filled in from the headings with page numbers; document control in the
// headers and footers; native, editable charts with their data in an embedded workbook; alternative text
// for charts and header rows on tables. A tagged corporate template, when the template has one, is used as
// the document shell (ART-025): see templates.js.
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, TableOfContents, Table, TableRow, TableCell, WidthType, ShadingType, Header, Footer, PageNumber,
  SequentialIdentifier, AlignmentType, BorderStyle, LevelFormat, PageBreak, TableLayoutType, VerticalAlign, TabStopType, TextDirection, HeightRule, LineRuleType,
} from 'docx';
import { ChartRun } from 'docx/charts';
import { estimatePageNumbersWith } from 'docx/layout';
import { TextWatermark } from 'docx/watermarks';
import { hex, fmtDate, fitColumns, INK, INK2, LINE, STATUS } from '../ir.js';

const TEXT_WIDTH = 9638; // twips: A4 (11906) less 2 cm margins each side
const CALLOUT = { info: [STATUS.infoSoft, '2A78D6'], warn: [STATUS.warningSoft, STATUS.warning], bad: [STATUS.criticalSoft, STATUS.critical], good: [STATUS.goodSoft, STATUS.good] };

export function styles(b) {
  const primary = hex(b.primary);
  const accent = hex(b.accent, '0FA3B1');
  const body = b.fontBody || 'Calibri';
  const head = b.fontHeading || body;
  const heading = (id, name, size, before, after, outline, color = primary) => ({ id, name, basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: head, size, bold: true, color }, paragraph: { spacing: { before, after }, keepNext: true, keepLines: true, outlineLevel: outline } });
  return {
    default: { document: { run: { font: body, size: 21, color: INK }, paragraph: { spacing: { after: 120, line: 276, lineRule: LineRuleType.AUTO } } } },
    paragraphStyles: [
      heading('Heading1', 'heading 1', 32, 360, 160, 0),
      heading('Heading2', 'heading 2', 26, 280, 120, 1),
      heading('Heading3', 'heading 3', 22, 200, 80, 2, hex(b.secondary, '1D3D69')),
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: head, size: 56, bold: true, color: primary }, paragraph: { spacing: { before: 0, after: 200, line: 240, lineRule: LineRuleType.AUTO } } },
      { id: 'Subtitle', name: 'Subtitle', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: head, size: 30, color: accent }, paragraph: { spacing: { after: 240 } } },
      { id: 'Caption', name: 'caption', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 18, bold: true, color: INK2 }, paragraph: { spacing: { before: 160, after: 80 }, keepNext: true } },
      { id: 'TableText', name: 'Table Text', basedOn: 'Normal', quickFormat: true, run: { size: 18 }, paragraph: { spacing: { before: 20, after: 20, line: 240, lineRule: LineRuleType.AUTO } } },
      { id: 'TableTextSmall', name: 'Table Text Small', basedOn: 'TableText', quickFormat: true, run: { size: 16 } },
      { id: 'Lead', name: 'Lead', basedOn: 'Normal', quickFormat: true, run: { size: 24, color: INK2 } },
      { id: 'Small', name: 'Small', basedOn: 'Normal', quickFormat: true, run: { size: 17, color: INK2 } },
      { id: 'Note', name: 'Note', basedOn: 'Normal', quickFormat: true, run: { size: 16, italics: true, color: INK2 }, paragraph: { spacing: { before: 40, after: 160 } } },
      { id: 'Placeholder', name: 'Placeholder', basedOn: 'Normal', quickFormat: true, run: { italics: true, color: '7A5300', highlight: 'yellow' } },
      { id: 'Callout', name: 'Callout', basedOn: 'Normal', quickFormat: true, run: { size: 20 }, paragraph: { spacing: { before: 120, after: 160 } } },
      { id: 'HeaderText', name: 'Header Text', basedOn: 'Normal', run: { size: 16, color: INK2 }, paragraph: { spacing: { after: 0 } } },
      { id: 'Classification', name: 'Classification', basedOn: 'Normal', run: { size: 18, bold: true, color: 'A32626' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 0 } } },
    ],
  };
}

// The table style goes in as an external styles part so docx keeps its own default styles (Normal, TOC,
// list and hyperlink styles) alongside it.
export const tableStyles = (primary) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="table" w:styleId="CMWTable"><w:name w:val="Workbench Table"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="59"/><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="${LINE}"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="${LINE}"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="${LINE}"/></w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${primary}"/></w:tcPr></w:tblStylePr></w:style></w:styles>`;

export const NUMBERING = {
  config: [{
    reference: 'cmw-numbers',
    levels: [0, 1, 2].map((level) => ({ level, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level], text: `%${level + 1}.`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } } })),
  }],
};

function textRuns(text, opts = {}) {
  const lines = String(text ?? '').split('\n');
  return lines.map((line, i) => new TextRun({ text: line, ...opts, ...(i ? { break: 1 } : {}) }));
}

function cellParagraph(c, { header, small }) {
  const align = c.align === 'r' ? AlignmentType.RIGHT : c.align === 'c' ? AlignmentType.CENTER : AlignmentType.LEFT;
  return new Paragraph({ style: small ? 'TableTextSmall' : 'TableText', alignment: align, children: textRuns(c.text, { bold: header || !!c.bold, color: header ? 'FFFFFF' : c.color ? hex(c.color) : undefined }) });
}

function tableEl(b, { primary }) {
  // Approximate Calibri advance widths in twips (about half the font size per character, wider for digits and capitals).
  const pt = b.small ? 8 : 9;
  const measure = (w, head) => [...w].reduce((a, ch) => a + (/[A-Z0-9/]/.test(ch) ? 0.58 : /[ilt.,:;'|]/.test(ch) ? 0.3 : 0.5), 0) * pt * 20 * (head ? 1.06 : 1);
  const widths = fitColumns(b.columns, b.rows, { total: TEXT_WIDTH, pad: 90, measure }).map(Math.round);
  const vertical = b.columns.some((c) => c.vertical);
  const head = new TableRow({
    tableHeader: true, cantSplit: true, ...(vertical ? { height: { value: 1500, rule: HeightRule.ATLEAST } } : {}),
    children: b.columns.map((c, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: primary }, verticalAlign: VerticalAlign.BOTTOM,
      ...(c.vertical ? { textDirection: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT } : {}),
      children: [cellParagraph({ text: c.label, align: c.vertical ? 'l' : c.align }, { header: true, small: b.small })],
    })),
  });
  const rows = b.rows.map((r) => new TableRow({
    cantSplit: true,
    children: b.columns.map((c, i) => {
      const cell = r[i] || { text: '' };
      return new TableCell({ width: { size: widths[i], type: WidthType.DXA }, ...(cell.fill ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: hex(cell.fill) } } : {}), verticalAlign: VerticalAlign.TOP, children: [cellParagraph({ ...cell, align: cell.align || c.align }, { small: b.small })] });
    }),
  }));
  return new Table({ style: 'CMWTable', layout: TableLayoutType.FIXED, width: { size: TEXT_WIDTH, type: WidthType.DXA }, columnWidths: widths, tableLook: { firstRow: true, noVBand: true }, rows: [head, ...rows] });
}

function kvEl(b) {
  const widths = [Math.round(TEXT_WIDTH * 0.3), Math.round(TEXT_WIDTH * 0.7)];
  return new Table({
    layout: TableLayoutType.FIXED, width: { size: TEXT_WIDTH, type: WidthType.DXA }, columnWidths: widths, tableLook: { firstRow: false, noHBand: true, noVBand: true },
    borders: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE }, insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: LINE }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
    rows: b.rows.map(([k, v]) => new TableRow({ cantSplit: true, children: [
      new TableCell({ width: { size: widths[0], type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F0F3F7' }, children: [new Paragraph({ style: 'TableText', children: [new TextRun({ text: k, bold: true })] })] }),
      new TableCell({ width: { size: widths[1], type: WidthType.DXA }, children: [new Paragraph({ style: 'TableText', children: v?.placeholder ? [new TextRun({ text: v.placeholder, italics: true, color: '7A5300', highlight: 'yellow' })] : textRuns(v) })] }),
    ] })),
  });
}

// Captions are numbered with SEQ fields (so Word can build a table of figures); in tagged templates, where
// the fields are not worked out when the document is written, the numbers are written as text.
function caption(kind, text, ctx = {}) {
  if (ctx.staticCaptions) {
    ctx.counters ||= {};
    ctx.counters[kind] = (ctx.counters[kind] || 0) + 1;
    return new Paragraph({ style: 'Caption', children: [new TextRun(`${kind} ${ctx.counters[kind]}: ${text}`)] });
  }
  return new Paragraph({ style: 'Caption', children: [new TextRun(`${kind} `), new SequentialIdentifier(kind), new TextRun(`: ${text}`)] });
}

function chartEl(b) {
  const type = b.kind === 'stacked' ? 'bar' : b.kind;
  const horizontal = type === 'bar';
  const height = b.height || (horizontal ? Math.max(200, b.categories.length * 26 + 80) : 280);
  const valueAxis = { ...(b.min != null ? { minimum: b.min } : {}), ...(b.max != null ? { maximum: b.max } : {}), ...(b.numberFormat ? { numberFormat: b.numberFormat } : {}), font: { size: 8, color: INK2 } };
  return new Paragraph({
    keepNext: false,
    children: [new ChartRun({
      type, categories: b.categories, series: b.series.map((s) => ({ name: s.name, values: s.values, color: s.color })),
      ...(b.kind === 'stacked' ? { stacking: 'stacked', gapWidth: 60 } : horizontal ? { gapWidth: 60 } : {}),
      ...(type === 'line' ? { markers: { shape: 'circle', size: 5 } } : {}),
      legend: b.legend ? { position: 'bottom', font: { size: 8 } } : false,
      // Horizontal bars read top-down in category order, as on the dashboards.
      categoryAxis: { font: { size: 8, color: INK2 }, ...(horizontal ? { reverseOrder: true } : {}) },
      valueAxis: horizontal ? { ...valueAxis, crossesAt: 'maximum' } : valueAxis,
      ...(b.series.length === 1 && type !== 'line' ? { dataLabels: { value: true, position: b.kind === 'stacked' ? 'center' : 'outsideEnd', font: { size: 8, color: INK } } } : {}),
      font: { name: 'Calibri' },
      transformation: { width: 620, height: Math.min(640, height) },
      altText: { name: b.title || 'Chart', title: b.title || 'Chart', description: b.alt },
    })],
  });
}

function calloutEl(b) {
  const [fill, edge] = CALLOUT[b.tone] || CALLOUT.info;
  return new Paragraph({
    style: 'Callout', shading: { type: ShadingType.CLEAR, color: 'auto', fill },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: edge, space: 8 } },
    indent: { left: 160, right: 160 },
    children: [...(b.title ? [new TextRun({ text: `${b.title}. `, bold: true })] : []), ...textRuns(b.text)],
  });
}

export function blockElements(blocks, ctx) {
  const out = [];
  for (const b of blocks) {
    switch (b.t) {
      case 'h': out.push(new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][Math.min(3, b.level) - 1], children: textRuns(b.text) })); break;
      case 'p': out.push(new Paragraph({ style: { lead: 'Lead', small: 'Small', muted: 'Small' }[b.style], children: b.runs ? b.runs.map((r) => new TextRun({ text: r.text, bold: !!r.bold, italics: !!r.italic })) : textRuns(b.text, b.style === 'strong' ? { bold: true } : {}) })); break;
      case 'bullets': for (const it of b.items) out.push(new Paragraph({ bullet: { level: 0 }, children: textRuns(it) })); break;
      case 'numbers': for (const it of b.items) out.push(new Paragraph({ numbering: { reference: 'cmw-numbers', level: 0 }, children: textRuns(it) })); break;
      case 'table':
        if (b.caption) out.push(caption('Table', b.caption, ctx));
        if (!b.rows.length) out.push(new Paragraph({ style: 'Note', children: textRuns(b.empty) }));
        else out.push(tableEl(b, ctx));
        if (b.note) out.push(new Paragraph({ style: 'Note', children: textRuns(b.note) }));
        else out.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
        break;
      case 'kv':
        if (b.caption) out.push(caption('Table', b.caption, ctx));
        if (b.rows.length) out.push(kvEl(b), new Paragraph({ spacing: { after: 80 }, children: [] }));
        break;
      case 'chart':
        if (b.title) out.push(caption('Figure', b.title, ctx));
        out.push(chartEl(b));
        if (b.threshold) out.push(new Paragraph({ style: 'Note', children: textRuns(`${b.threshold.label || 'Threshold'}: ${b.threshold.value}${b.unit || ''}.`) }));
        break;
      case 'callout': out.push(calloutEl(b)); break;
      case 'placeholder': out.push(new Paragraph({ style: 'Placeholder', children: textRuns(b.text) })); break;
      case 'pageBreak': out.push(new Paragraph({ children: [new PageBreak()] })); break;
      case 'toc': out.push(new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-3' })); break;
      default: break;
    }
  }
  return out;
}

export function bodyElements(doc, ctx) {
  const out = [];
  const breakBefore = doc.meta.toc && doc.sections.length > 5;
  doc.sections.forEach((sec, i) => {
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: breakBefore && i > 0, children: textRuns(sec.title) }));
    out.push(...blockElements(sec.blocks, ctx));
  });
  return out;
}

function coverElements(doc, { docControl: dc, branding: b, caveat, aiNotice, s }) {
  const primary = hex(b.primary);
  const row = (k, v) => new TableRow({ children: [
    new TableCell({ width: { size: 2600, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ style: 'TableText', children: [new TextRun({ text: k, bold: true, color: INK2 })] })] }),
    new TableCell({ width: { size: 7038, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ style: 'TableText', children: textRuns(v) })] }),
  ] });
  return [
    new Paragraph({ spacing: { before: 1800, after: 120 }, children: [new TextRun({ text: (b.organisation || s.organisation || '').toUpperCase(), bold: true, size: 20, color: hex(b.accent, '0FA3B1'), characterSpacing: 40 })] }),
    new Paragraph({ style: 'Title', children: textRuns(dc.title || doc.meta.title) }),
    ...(doc.meta.subtitle ? [new Paragraph({ style: 'Subtitle', children: textRuns(doc.meta.subtitle) })] : []),
    new Paragraph({ spacing: { after: 480 }, children: [new TextRun({ text: s.initiative.name, size: 28, color: primary })] }),
    new Table({ layout: TableLayoutType.FIXED, width: { size: TEXT_WIDTH, type: WidthType.DXA }, columnWidths: [2600, 7038], borders: { top: { style: BorderStyle.SINGLE, size: 6, color: primary }, bottom: { style: BorderStyle.SINGLE, size: 6, color: primary }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
      rows: [row('Version', `${dc.version || ''} (${dc.status || 'Draft'})`), row('Date', fmtDate(dc.generatedAt)), row('Prepared by', dc.generatedBy || ''), row('Security classification', dc.classification || ''), ...(b.coverNote ? [row('Note', b.coverNote)] : [])] }),
    ...(caveat ? [new Paragraph({ spacing: { before: 360 }, children: [] }), calloutEl({ tone: 'bad', title: 'Handling caveat', text: caveat })] : []),
    ...(aiNotice ? [calloutEl({ tone: 'warn', title: 'AI-drafted content', text: aiNotice })] : []),
  ];
}
const noBorders = () => ({ top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } });

export function headerFooter({ docControl: dc, branding: b, watermark, s }) {
  const cls = dc.classification || '';
  const header = new Header({ children: [
    ...(cls ? [new Paragraph({ style: 'Classification', children: [new TextRun(cls.toUpperCase())] })] : []),
    new Paragraph({ style: 'HeaderText', tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }], border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 4 } }, children: [new TextRun(`${dc.title || ''} · ${s.initiative.shortName || s.initiative.name}`), new TextRun({ text: `\tVersion ${dc.version || ''} · ${dc.status || ''}` }), ...(watermark ? [new TextWatermark({ text: dc.status === 'Approved' ? 'COPY' : 'DRAFT', opacity: 0.18, color: 'B9C0CA' })] : [])] }),
  ] });
  const footer = new Footer({ children: [
    new Paragraph({ style: 'HeaderText', tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }], border: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 4 } }, children: [new TextRun(`${b.footer || b.organisation || s.organisation || ''} · Generated ${fmtDate(dc.generatedAt)} from data as at ${fmtDate(s.takenAt)}`), new TextRun({ children: ['\tPage ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] })] }),
    ...(cls ? [new Paragraph({ style: 'Classification', children: [new TextRun(cls.toUpperCase())] })] : []),
  ] });
  return { header, footer };
}

const PAGE = { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1200, left: 1134, right: 1134, header: 500, footer: 500 } };

// Page numbers for the contents are worked out by laying the pages out, in several passes, which takes longer
// the longer the document. Past about 200 pages (some 25 paragraphs, table rows or list items to a page) the
// contents keeps its entries and links, and Word fills in their page numbers when it opens the document, so
// generation stays within ART-018's time.
const ESTIMATE_UP_TO = 5000;
export function contentWeight(doc) {
  let w = 0;
  const walk = (blocks) => {
    for (const b of blocks || []) {
      if (b.t === 'cols') { for (const c of b.cols || []) walk(c); continue; }
      w += b.t === 'table' ? b.rows.length + 1 : b.t === 'kv' ? b.rows.length : b.t === 'bullets' || b.t === 'numbers' ? b.items.length : b.t === 'chart' ? 12 : 1;
    }
  };
  for (const sec of doc.sections || []) { w += 1; walk(sec.blocks); }
  return w;
}

export async function renderDocx(doc, ctx) {
  const { docControl: dc, branding, s, estimatePages = true } = ctx;
  const estimate = estimatePages && contentWeight(doc) <= ESTIMATE_UP_TO;
  const primary = hex(branding.primary);
  const { header, footer } = headerFooter(ctx);
  const body = [...(doc.meta.toc ? [new Paragraph({ style: 'Caption', children: [new TextRun({ text: 'Contents', size: 28, color: primary })] }), new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }), new Paragraph({ children: [new PageBreak()] })] : []), ...bodyElements(doc, { primary })];
  const compact = doc.meta.compact;
  const sections = compact
    ? [{ properties: { page: PAGE }, headers: { default: header }, footers: { default: footer }, children: [new Paragraph({ style: 'Title', children: textRuns(dc.title || doc.meta.title) }), ...(doc.meta.subtitle ? [new Paragraph({ style: 'Subtitle', children: textRuns(doc.meta.subtitle) })] : []), ...(ctx.caveat ? [calloutEl({ tone: 'bad', title: 'Handling caveat', text: ctx.caveat })] : []), ...body] }]
    : [
      { properties: { page: PAGE, titlePage: true }, headers: { default: header, first: new Header({ children: [new Paragraph({ style: 'Classification', children: [new TextRun((dc.classification || '').toUpperCase())] })] }) }, footers: { default: footer, first: new Footer({ children: [new Paragraph({ style: 'Classification', children: [new TextRun((dc.classification || '').toUpperCase())] })] }) }, children: coverElements(doc, ctx) },
      { properties: { page: PAGE }, headers: { default: header }, footers: { default: footer }, children: body },
    ];
  const document = new Document({
    creator: dc.generatedBy || 'Change Management Workbench', lastModifiedBy: 'Change Management Workbench', title: dc.title, subject: s.initiative.name, description: `${dc.title} for ${s.initiative.name}. Version ${dc.version}, ${dc.status}.`, keywords: dc.classification || '',
    customProperties: [{ name: 'Version', value: String(dc.version || '') }, { name: 'Status', value: String(dc.status || '') }, { name: 'Classification', value: String(dc.classification || '') }, { name: 'DataSnapshot', value: String(s.takenAt || '') }, { name: 'Initiative', value: s.initiative.name }],
    features: { updateFields: !estimate && !!doc.meta.toc },
    styles: styles(branding),
    externalStyles: tableStyles(primary),
    numbering: NUMBERING,
    ...(estimate ? { pageNumbers: estimatePageNumbersWith({ guess: true }) } : {}),
    sections,
  });
  return new Uint8Array(await Packer.toArrayBuffer(document));
}

