// Artefact generation engine (Section 8; Figure 3). The service calls it with a model or a stored data
// snapshot; it builds the artefact's content once and renders each requested format from it, so the Word
// document, PDF, presentation, workbook and HTML all show the same content. Every file carries a
// fingerprint of its content, which is how a reproduction from the stored snapshot is shown to match the
// approved version (AC-10).
import { catalogueEntry } from './catalogue.js';
import { buildDocument } from './documents.js';
import { buildDeck, DECKS, DECK_FIRST } from './decks.js';
import { buildWorkbook, SHEETS } from './sheets.js';
import { DEFAULT_BRANDING } from './ir.js';
import { CAVEAT } from './templates.js';
import { canonicalJson, sha256Hex } from '../util.js';

export { completeness } from './completeness.js';
export { buildSnapshot, scopeKey, diffSnapshots, managersOf } from './snapshot.js';
export { fieldCatalogue, validateDocxTemplate, templateData } from './templates.js';
export { sampleSnapshot } from './sample.js';

export const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  html: 'text/html;charset=utf-8',
};
const AI_NOTICE = 'Parts of this artefact were drafted with AI assistance and have not yet been reviewed and accepted by a person. They are marked where they appear (ART-022).';

export async function extractPptxTheme(bytes) {
  return (await import('./render/pptx.js')).extractPptxTheme(bytes);
}

export async function starterTemplate(branding = {}) {
  return (await import('./render/docxTemplate.js')).starterTemplate({ ...DEFAULT_BRANDING, ...branding });
}

function context(snapshot, { template, docControl = {}, params = {} }) {
  const branding = { ...DEFAULT_BRANDING, organisation: snapshot.organisation || '', ...(template?.branding || {}) };
  return {
    s: snapshot,
    branding,
    docControl,
    params,
    caveat: snapshot.includeSensitive ? CAVEAT : null,
    aiNotice: snapshot.aiUnreviewed ? AI_NOTICE : null,
    watermark: params.watermark ?? docControl.status !== 'Approved',
    pdfa: !!params.pdfa,
  };
}

// The content of each format: documents for Word, PDF and HTML; presentations for PowerPoint (and the PDF
// and HTML of presentation-first artefacts); workbooks for Excel.
function content(snapshot, artefactType, format, ctx) {
  const built = { docControl: ctx.docControl, params: ctx.params };
  if (format === 'pptx' || ((format === 'pdf' || format === 'html') && DECK_FIRST.has(artefactType))) return { kind: 'deck', ir: buildDeck(snapshot, artefactType, built) };
  if (format === 'xlsx') return { kind: 'workbook', ir: buildWorkbook(snapshot, artefactType, built) };
  return { kind: 'document', ir: buildDocument(snapshot, artefactType, built) };
}

export function supportedFormats(artefactType) {
  const entry = catalogueEntry(artefactType);
  if (!entry) return [];
  return entry.formats.filter((f) => (f === 'pptx' ? !!DECKS[artefactType] : f === 'xlsx' ? !!SHEETS[artefactType] : true));
}

// Live preview (UC-07 step 7): the HTML rendering of the artefact.
export async function renderHtml(snapshot, { artefactType, params = {}, template, docControl = {} }) {
  const ctx = context(snapshot, { template, docControl, params });
  const c = content(snapshot, artefactType, 'html', ctx);
  const html = await import('./render/html.js');
  return c.kind === 'deck' ? html.renderHtmlDeck(c.ir, ctx) : html.renderHtmlDocument(c.ir, ctx);
}

const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

export async function render(snapshot, { artefactType, formats, template, docControl = {}, params = {} }) {
  const entry = catalogueEntry(artefactType);
  if (!entry) throw Object.assign(new Error(`Unknown artefact ${artefactType}.`), { status: 404 });
  const ctx = context(snapshot, { template, docControl, params });
  const wanted = (formats?.length ? formats : entry.defaultFormats).filter((f) => supportedFormats(artefactType).includes(f));
  const base = safeName(`${snapshot.initiative.shortName || snapshot.initiative.code || snapshot.initiative.name} ${docControl.title || entry.title}${snapshot.manager ? ` ${snapshot.manager.name}` : snapshot.stakeholder ? ` ${snapshot.stakeholder.name}` : ''} v${docControl.version || ''}`);
  const files = [];
  for (const format of wanted) {
    const c = content(snapshot, artefactType, format, ctx);
    let bytes;
    let problems = [];
    if (format === 'docx') {
      if (template?.docxBytes) {
        const r = await (await import('./render/docxTemplate.js')).renderDocxFromTemplate(template.docxBytes, c.ir, ctx);
        bytes = r.bytes;
        problems = r.problems;
      } else bytes = await (await import('./render/docx.js')).renderDocx(c.ir, ctx);
    } else if (format === 'pdf') {
      const pdf = await import('./render/pdf.js');
      bytes = c.kind === 'deck' ? await pdf.renderDeckPdf(c.ir, ctx) : await pdf.renderPdf(c.ir, ctx);
    } else if (format === 'pptx') bytes = await (await import('./render/pptx.js')).renderPptx(c.ir, ctx);
    else if (format === 'xlsx') bytes = await (await import('./render/xlsx.js')).renderXlsx(c.ir, ctx);
    else if (format === 'html') {
      const html = await import('./render/html.js');
      bytes = new TextEncoder().encode(c.kind === 'deck' ? html.renderHtmlDeck(c.ir, ctx) : html.renderHtmlDocument(c.ir, ctx));
    } else continue;
    const fingerprint = await sha256Hex(canonicalJson({
      format, content: c.ir,
      docControl: { title: docControl.title, version: docControl.version, status: docControl.status, classification: docControl.classification, generatedAt: docControl.generatedAt, generatedBy: docControl.generatedBy, approvals: docControl.approvals || [] },
      template: template ? { id: template.id || null, version: template.templateVersion || null, branding: ctx.branding, tagged: !!template.docxBytes } : null,
      watermark: ctx.watermark, pdfa: ctx.pdfa,
    }));
    files.push({ format, filename: `${base}.${format}`, mime: MIME[format], bytes, fingerprint, problems });
  }
  return files;
}
