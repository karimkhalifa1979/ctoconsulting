// Text extraction from uploaded client documents (CR-01, CR-02), keeping page and paragraph positions so every
// extracted item links back to its source. PDF (pdf.js), DOCX, XLSX, PPTX, text, .eml and .msg emails, and ZIP.
import JSZip from 'jszip';
import { parseXml, findAll, textOfRuns, kids, attr } from './xml.js';

export const ACCEPT = '.pdf,.docx,.xlsx,.pptx,.txt,.md,.eml,.msg,.zip,.csv';
export const MAX_BYTES = 200 * 1024 * 1024;
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

const ext = (name) => (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';

// Signature-based scan in the browser; production runs a real engine on upload (see README).
export function scanBytes(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 4096)));
  if (head.includes(EICAR)) return { clean: false, threat: 'EICAR-Test-File' };
  return { clean: true };
}

async function parsePdf(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  // pdf.js transfers its buffer to the worker, so it gets a copy and the original stays intact for storage.
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true }).promise;
  const pages = [];
  const warnings = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    // Group text items into lines by y position, then lines into paragraphs by vertical gaps.
    const lines = [];
    for (const it of tc.items) {
      if (!('str' in it) || it.str === '') continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      const h = Math.abs(it.transform[3]) || it.height || 10;
      let line = lines.find((l) => Math.abs(l.y - y) <= 2);
      if (!line) { line = { y, parts: [], h }; lines.push(line); }
      line.h = Math.max(line.h, h);
      line.parts.push({ x, str: it.str, w: it.width });
    }
    lines.sort((a, b) => b.y - a.y);
    // Split each line into columns at wide gaps (pdf.js marks table-cell gaps with wide whitespace items).
    const toCols = (l) => {
      l.parts.sort((a, b) => a.x - b.x);
      const cols = [];
      let cur = null, end = null;
      for (const p of l.parts) {
        if (!p.str.trim()) { if (p.w > 12 && cur) { cols.push(cur); cur = null; } end = p.x + (p.w || 0); continue; }
        if (cur && end !== null && p.x - end > 18) { cols.push(cur); cur = null; }
        if (!cur) cur = { x: p.x, text: '' };
        else if (end !== null && p.x - end > 1.5 && !cur.text.endsWith(' ') && !p.str.startsWith(' ')) cur.text += ' ';
        cur.text += p.str;
        end = p.x + (p.w || 0);
      }
      if (cur) cols.push(cur);
      return cols.map((c) => ({ x: c.x, text: c.text.trim() })).filter((c) => c.text);
    };
    const paras = [];
    let cur = null;
    let prevY = null, prevH = 10, tableCols = null;
    const flush = () => { if (cur) paras.push(cur.cols.map((c) => c.text).join('\t').trim()); cur = null; };
    for (const l of lines) {
      let cols = toCols(l);
      if (!cols.length) continue;
      // Inside a table, split a line at the known column starts even when pdf.js reports no gap.
      if (tableCols && cols.length < tableCols.length) {
        const words = [];
        for (const p of l.parts.filter((x) => x.str.trim())) words.push(p);
        const split = tableCols.map((x) => ({ x, text: '' }));
        for (const w of words) {
          let idx = 0;
          for (let i = 0; i < tableCols.length; i++) if (w.x >= tableCols[i] - 3) idx = i;
          split[idx].text += (split[idx].text ? ' ' : '') + w.str.trim();
        }
        const nonEmpty = split.filter((c) => c.text);
        if (nonEmpty.length > 1 || (nonEmpty.length === 1 && Math.abs(nonEmpty[0].x - tableCols[0]) > 3)) cols = nonEmpty;
      }
      const gap = prevY === null ? 0 : prevY - l.y;
      const sizeChange = Math.abs(l.h - prevH) / Math.max(l.h, prevH) > 0.15;
      const isRow = cols.length > 1;
      const startsItem = /^\s*(\d+(\.\d+)*\s|[A-Z]\d{1,3}\b|•|-\s)/.test(cols[0].text) && Math.abs(cols[0].x - (tableCols?.[0] ?? cols[0].x)) < 3;
      const continuation = cur && !sizeChange && gap <= Math.max(l.h, prevH) * 1.6 && !(isRow && Math.abs(cols[0].x - cur.cols[0].x) < 3 && !(cur.cols.length > 1 && cols.length < cur.cols.length)) && !startsItem;
      if (continuation && cur.cols.length > 1) {
        // Wrapped cell text: append each column to the nearest column of the current row.
        for (const c of cols) {
          let best = 0, bestD = Infinity;
          cur.cols.forEach((cc, i) => { const d = Math.abs(cc.x - c.x); if (d < bestD) { bestD = d; best = i; } });
          cur.cols[best].text += ` ${c.text}`;
        }
      } else if (continuation && !isRow) {
        cur.cols[0].text += ` ${cols.map((c) => c.text).join(' ')}`;
      } else {
        flush();
        cur = { cols: cols.map((c) => ({ ...c })) };
        if (isRow) tableCols = cols.map((c) => c.x);
        else if (!startsItem || cols[0].x < (tableCols?.[0] ?? Infinity) - 3) tableCols = gap > l.h * 1.6 ? null : tableCols;
      }
      prevY = l.y; prevH = l.h;
    }
    flush();
    if (!paras.length) warnings.push(`Page ${n} has no text layer. It looks scanned and needs OCR.`);
    pages.push({ n, paras: paras.map((t) => t.replace(/\t\s*$/, '').replace(/ *\t */g, '\t')) });
  }
  // Running headers and footers repeat on most pages; drop them so they are not read as content.
  if (pages.length >= 3) {
    const key = (t) => t.replace(/\d+/g, '#');
    const counts = new Map();
    for (const p of pages) for (const t of new Set(p.paras.map(key))) counts.set(t, (counts.get(t) || 0) + 1);
    const repeated = new Set([...counts].filter(([t, c]) => c >= Math.ceil(pages.length * 0.6) && t.length < 160).map(([t]) => t));
    for (const p of pages) p.paras = p.paras.filter((t) => !repeated.has(key(t)) && !/^(page\s+)?\d+(\s+of\s+\d+)?$/i.test(t.trim()));
  }
  return { pages, warnings, ocrNeeded: warnings.length > 0 };
}

async function parseDocx(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('Not a Word document.');
  const root = parseXml(xml);
  const body = findAll(root, 'w:body')[0];
  const pages = [{ n: 1, paras: [] }];
  const push = (t) => { if (t.trim()) pages[pages.length - 1].paras.push(t.trim()); };
  for (const el of body.children) {
    if (el.name === 'w:p') {
      const brk = findAll(el, 'w:br').some((b) => attr(b, 'w:type') === 'page') || findAll(el, 'w:lastRenderedPageBreak').length > 0;
      if (brk && pages[pages.length - 1].paras.length) pages.push({ n: pages.length + 1, paras: [] });
      push(textOfRuns(el));
    } else if (el.name === 'w:tbl') {
      for (const tr of findAll(el, 'w:tr')) push(kids(tr, 'w:tc').map((tc) => findAll(tc, 'w:p').map(textOfRuns).join(' ').trim()).join('\t'));
    }
  }
  return { pages: pages.filter((p) => p.paras.length), warnings: [] };
}

async function parseXlsx(bytes) {
  const mod = await import('exceljs');
  const Excel = mod.default || mod;
  const wb = new Excel.Workbook();
  await wb.xlsx.load(bytes);
  const pages = [];
  wb.eachSheet((ws) => {
    const paras = [`Sheet: ${ws.name}`];
    ws.eachRow((row) => {
      const vals = row.values.slice(1).map((v) => (v && typeof v === 'object' ? v.richText?.map((t) => t.text).join('') ?? v.text ?? v.result ?? '' : v ?? '')).map((v) => String(v).trim());
      if (vals.some(Boolean)) paras.push(vals.join('\t'));
    });
    pages.push({ n: pages.length + 1, paras });
  });
  return { pages, warnings: [] };
}

async function parsePptx(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const pages = [];
  for (const s of slides) {
    const root = parseXml(await zip.file(s).async('string'));
    const paras = findAll(root, 'a:p').map((p) => findAll(p, 'a:t').map((t) => t.children.map((x) => x.text || '').join('')).join('')).map((t) => t.trim()).filter(Boolean);
    pages.push({ n: pages.length + 1, paras });
  }
  return { pages, warnings: [] };
}

function textToPages(text) {
  const chunks = String(text).split(/\f/);
  return chunks.map((c, i) => ({ n: i + 1, paras: c.split(/\r?\n\s*\r?\n|\r?\n(?=\s*(?:\d+(?:\.\d+)*\s|[A-Z]\d{1,3}\t))/).map((p) => p.replace(/\r?\n/g, ' ').trim()).filter(Boolean) }));
}

function parseEml(text) {
  const [head, ...rest] = String(text).split(/\r?\n\r?\n/);
  const h = Object.fromEntries(head.split(/\r?\n(?!\s)/).map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()]; }));
  let body = rest.join('\n\n');
  const boundary = (h['content-type'] || '').match(/boundary="?([^";]+)"?/)?.[1];
  if (boundary) {
    const parts = body.split(`--${boundary}`);
    const plain = parts.find((p) => /content-type:\s*text\/plain/i.test(p)) || parts.find((p) => /content-type:\s*text\/html/i.test(p)) || '';
    body = plain.split(/\r?\n\r?\n/).slice(1).join('\n\n');
    if (/quoted-printable/i.test(plain)) body = body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (m, x) => String.fromCharCode(parseInt(x, 16)));
    if (/base64/i.test(plain.split(/\r?\n\r?\n/)[0])) { try { body = atob(body.replace(/\s/g, '')); } catch { /* keep */ } }
    body = body.replace(/<[^>]+>/g, ' ');
  }
  const pages = textToPages(body);
  pages[0].paras.unshift(`From: ${h.from || ''}`, `Subject: ${h.subject || ''}`, `Date: ${h.date || ''}`);
  return { pages, warnings: [], meta: { from: h.from, subject: h.subject, date: h.date } };
}

// Outlook .msg is an OLE compound file; without a full parser we recover the UTF-16 text streams.
function parseMsg(bytes) {
  const u16 = new TextDecoder('utf-16le').decode(bytes);
  const runs = u16.match(/[\x20-\x7E -ɏ‘-‟\r\n\t]{24,}/g) || [];
  const text = runs.sort((a, b) => b.length - a.length).slice(0, 12).join('\n\n');
  return { pages: textToPages(text), warnings: ['Outlook .msg text was recovered from the file’s text streams. Check it, or save the email as .eml for full fidelity.'] };
}

export async function parseFile(file) {
  const name = file.name;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error(`${name} is larger than 200 MB.`);
  const scan = scanBytes(bytes);
  if (!scan.clean) return { name, bytes, scan: 'infected', threat: scan.threat, pages: [], warnings: [`Virus scan detected ${scan.threat}.`] };
  const e = ext(name);
  let res;
  if (e === 'pdf') res = await parsePdf(bytes);
  else if (e === 'docx') res = await parseDocx(bytes);
  else if (e === 'xlsx') res = await parseXlsx(bytes);
  else if (e === 'pptx') res = await parsePptx(bytes);
  else if (e === 'eml') res = parseEml(new TextDecoder().decode(bytes));
  else if (e === 'msg') res = parseMsg(bytes);
  else if (['txt', 'md', 'csv'].includes(e)) res = { pages: textToPages(new TextDecoder().decode(bytes)), warnings: [] };
  else throw new Error(`${name}: unsupported file type. Upload PDF, DOCX, XLSX, PPTX, email or ZIP files.`);
  return { name, bytes, scan: 'clean', mime: file.type || '', size: bytes.length, ...res };
}

// ZIP packs are expanded into their supported files.
export async function expandZip(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const out = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || /(^|\/)(__MACOSX|\.)/.test(path) || !/\.(pdf|docx|xlsx|pptx|txt|eml|msg|md|csv)$/i.test(path)) continue;
    const data = await entry.async('uint8array');
    out.push({ name: path.split('/').pop(), type: '', arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), size: data.length });
  }
  return out;
}
