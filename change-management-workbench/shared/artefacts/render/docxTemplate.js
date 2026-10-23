// Fills an organisation's tagged Word template (ART-025): the template supplies the cover page, styles,
// headers, footers and branding; tags are replaced with merge fields, repeating rows and sections, and the
// generated content. The workbench's own paragraph and table styles are added where the template lacks
// them, so generated tables and captions keep their formatting.
import { Document, Packer, Paragraph, TextRun, TableOfContents, patchDocument, PatchType } from 'docx';
import { estimatePageNumbersWith } from 'docx/layout';
import { blockElements, bodyElements, NUMBERING, styles, tableStyles } from './docx.js';
import { templateData, preprocessDocumentXml, preprocessPartXml, classifyTag, fieldCatalogue } from '../templates.js';
import * as X from '../sections.js';
import { rich, hex } from '../ir.js';

const CHARTS = {
  impactHeatmap: (s, x) => [X.impactHeatmapTable(s, x)],
  impactTimeline: (s) => [X.impactTimelineTable(s)],
  adkarHeatmap: (s) => [X.adkarResultsTable(s)],
  readinessByGroup: (s) => [X.readinessByGroupChart(s)],
  powerInterest: (s) => [X.powerInterestTable(s)],
  engagementGap: (s, x) => X.engagementGap(s, x),
  timeline: (s, x) => [X.timelineTable(s, x)],
  risks: (s) => [X.risksTable(s)],
};

const text = (v, opts = {}) => ({ type: PatchType.PARAGRAPH, children: [new TextRun({ text: String(v ?? ''), ...opts })] });
const marker = (t) => text(`[Unknown field: ${t}]`, { highlight: 'yellow', italics: true });

async function referenceStyles(branding) {
  const { default: JSZip } = await import('jszip');
  const doc = new Document({ styles: styles(branding), externalStyles: tableStyles(hex(branding.primary)), numbering: NUMBERING, sections: [{ children: [new Paragraph('x')] }] });
  const zip = await JSZip.loadAsync(await Packer.toArrayBuffer(doc));
  return zip.file('word/styles.xml').async('string');
}

// Adds the workbench styles the template does not define (by style ID).
function mergeStyles(templateXml, referenceXml) {
  const have = new Set([...templateXml.matchAll(/w:styleId="([^"]+)"/g)].map((m) => m[1]));
  const add = [...referenceXml.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>[\s\S]*?<\/w:style>/g)].filter((m) => !have.has(m[1])).map((m) => m[0]);
  return add.length ? templateXml.replace('</w:styles>', `${add.join('')}</w:styles>`) : templateXml;
}

export async function renderDocxFromTemplate(templateBytes, doc, ctx) {
  const { default: JSZip } = await import('jszip');
  const { s, docControl: dc = {}, branding } = ctx;
  const data = templateData(s, dc);
  const problems = [];
  const zip = await JSZip.loadAsync(templateBytes);
  const parts = Object.keys(zip.files).filter((f) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(f));
  for (const part of parts) {
    const xml = await zip.file(part).async('string');
    zip.file(part, part === 'word/document.xml' ? preprocessDocumentXml(xml, data, problems) : preprocessPartXml(xml));
  }
  const stylesPart = zip.file('word/styles.xml');
  if (stylesPart) zip.file('word/styles.xml', mergeStyles(await stylesPart.async('string'), await referenceStyles(branding)));
  const prepared = await zip.generateAsync({ type: 'uint8array' });

  // Tags present after the repeating and conditional sections were expanded.
  const tags = new Set();
  for (const part of parts) for (const m of (await zip.file(part).async('string')).matchAll(/\{\{([^{}]+)\}\}/g)) tags.add(m[1].trim());
  const catalogue = fieldCatalogue();
  const x = X.helpers(s);
  const lctx = { primary: hex(branding.primary), staticCaptions: true, counters: {} };
  const patches = {};
  const rowCollections = new Set();
  for (const tag of tags) {
    const c = classifyTag(tag, catalogue);
    if (c.kind === 'field') patches[tag] = text(data.fields[tag]);
    else if (c.kind === 'eachField') patches[tag] = text(data.collections[c.collection]?.[c.index]?.[c.field]);
    else if (c.kind === 'rowField') rowCollections.add(c.collection);
    else if (c.kind === 'block') {
      if (c.block === 'content') patches[tag] = { type: PatchType.DOCUMENT, children: bodyElements(doc, lctx) };
      else if (c.block === 'toc') patches[tag] = { type: PatchType.DOCUMENT, children: [new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' })] };
      else if (c.block === 'section') {
        const sec = doc.sections.find((y) => y.id === c.id);
        patches[tag] = { type: PatchType.DOCUMENT, children: sec ? bodyElements({ meta: { ...doc.meta, toc: false }, sections: [sec] }, lctx) : [new Paragraph({ children: [new TextRun({ text: `[This artefact has no ${c.id} section]`, italics: true })] })] };
      } else if (c.block === 'narrative') {
        const n = s.narratives?.[c.id];
        patches[tag] = { type: PatchType.DOCUMENT, children: blockElements(n ? rich(n.html, { aiDrafted: n.aiDrafted }) : [{ t: 'placeholder', text: `[To be completed: ${c.id}]` }], lctx) };
      } else if (c.block === 'chart') patches[tag] = { type: PatchType.DOCUMENT, children: blockElements(CHARTS[c.id](s, x), lctx) };
    } else if (c.kind === 'unknown' || c.kind === 'itemField') {
      patches[tag] = marker(tag);
      problems.push(`Unknown tag {{${tag}}}.`);
    }
  }
  for (const coll of rowCollections) patches[coll] = { type: PatchType.TABLE_ROWS, rows: data.collections[coll].map((item) => Object.fromEntries(Object.entries(item).map(([k, v]) => [k, text(v)]))) };
  // Page numbers are worked out so captions, the table of contents and page references are filled in.
  const out = await patchDocument({ outputType: 'uint8array', data: prepared, patches, keepOriginalStyles: true, recursive: true, numbering: NUMBERING, pageNumbers: estimatePageNumbersWith({ guess: true }) });
  return { bytes: out instanceof Uint8Array ? out : new Uint8Array(out), problems };
}

// A starting template for administrators: a cover page with merge fields, document control in the header
// and footer, an example repeating table, a conditional section and the generated content.
export async function starterTemplate(branding) {
  const { Table, TableRow, TableCell, WidthType, Header, Footer } = await import('docx');
  const p = (t, o = {}) => new Paragraph({ ...o, children: [new TextRun({ text: t, ...(o.run || {}) })] });
  const row = (cells, head) => new TableRow({ tableHeader: !!head, children: cells.map((c) => new TableCell({ width: { size: 3200, type: WidthType.DXA }, children: [p(c, head ? { run: { bold: true } } : {})] })) });
  const doc = new Document({
    styles: styles(branding), externalStyles: tableStyles(hex(branding.primary)), numbering: NUMBERING,
    sections: [{
      headers: { default: new Header({ children: [p('{{document.classification}}', { alignment: 'center', run: { bold: true, color: 'A32626' } }), p('{{document.title}} · {{initiative.shortName}} · Version {{document.version}} {{document.status}}', { style: 'HeaderText' })] }) },
      footers: { default: new Footer({ children: [p('{{document.organisation}} · Generated {{document.generatedAt}} from data as at {{document.snapshotAt}}', { style: 'HeaderText' }), p('{{document.classification}}', { alignment: 'center', run: { bold: true, color: 'A32626' } })] }) },
      children: [
        p('{{document.organisation}}', { run: { bold: true, color: hex(branding.accent, '0FA3B1') } }),
        p('{{document.title}}', { style: 'Title' }),
        p('{{initiative.name}}', { style: 'Subtitle' }),
        p('Version {{document.version}} ({{document.status}}) · {{document.generatedAt}} · Prepared by {{document.generatedBy}}'),
        p('{{#if sensitive}}'), p('Handling caveat: {{document.caveat}}', { style: 'Callout' }), p('{{/if}}'),
        p('Key dates', { style: 'Heading2' }),
        new Table({ style: 'CMWTable', width: { size: 9600, type: WidthType.DXA }, rows: [row(['Milestone', 'Date', 'Status'], true), row(['{{milestones.name}}', '{{milestones.date}}', '{{milestones.status}}'])] }),
        p('{{toc}}'),
        p('{{content}}'),
      ],
    }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
