// Upload pipeline for client documents: expand ZIPs, scan, parse, store the original file.
import { parseFile, expandZip } from '../gen/parse.js';
import { sha256 } from '../core/sha256.js';

export function guessDocType(name) {
  if (/addend|amend/i.test(name)) return 'addendum';
  if (/q\s*&\s*a|questions? and answers|clarification/i.test(name)) return 'qa';
  if (/schedule|form|questionnaire|attachment|returnable|annex/i.test(name)) return 'form';
  return 'request';
}

export async function ingestFiles(files, { putFile, bidId, onProgress } = {}) {
  const expanded = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) expanded.push(...(await expandZip(f)));
    else expanded.push(f);
  }
  const out = [];
  for (const [i, f] of expanded.entries()) {
    onProgress?.(`Reading ${f.name} (${i + 1} of ${expanded.length})…`);
    try {
      const r = await parseFile(f);
      if (r.scan === 'infected') { out.push({ name: f.name, error: `Blocked by the virus scan (${r.threat}).`, scan: 'infected', pages: [] }); continue; }
      const fileId = putFile ? await putFile(r.bytes, { name: f.name, type: f.type, bidId }) : null;
      const text = r.pages.map((p) => p.paras.join('\n')).join('\n');
      out.push({ name: f.name, type: guessDocType(f.name), size: r.bytes.length, mime: f.type || '', fileId, pages: r.pages, warnings: r.warnings || [], hash: sha256(text), ocr: r.ocrNeeded || false, meta: r.meta || null });
    } catch (e) {
      out.push({ name: f.name, error: e.message, pages: [] });
    }
  }
  return out;
}
