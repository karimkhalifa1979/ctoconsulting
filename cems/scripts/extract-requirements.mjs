// Extracts every requirement (ID, module, text, MoSCoW priority) from the specification .docx
// into shared/requirements.json, which drives the in-app traceability view.
// Run with: npm run requirements
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(root, 'docs', 'CEMS_Requirements_Specification_v0.1.docx');
const OUT = path.join(root, 'shared', 'requirements.json');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const zip = await JSZip.loadAsync(fs.readFileSync(SPEC));
const doc = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'text/xml');
const body = doc.getElementsByTagNameNS(W, 'body')[0];

const textOf = (node) => {
  const parts = [];
  const walk = (n) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType !== 1) continue;
      if (c.localName === 't') parts.push(c.textContent);
      else if (c.localName === 'p' && parts.length) { parts.push(' '); walk(c); }
      else walk(c);
    }
  };
  walk(node);
  return parts.join('').replace(/\s+/g, ' ').trim();
};
const styleOf = (p) => {
  const ps = p.getElementsByTagNameNS(W, 'pStyle')[0];
  return ps ? ps.getAttributeNS(W, 'val') || ps.getAttribute('w:val') : '';
};

const PRIORITY = /^(M|S|C|W)\b/;
const ID = /^([A-Z]{3})-(\d{3})$/;
const reqs = [];
let heading = '';
for (let el = body.firstChild; el; el = el.nextSibling) {
  if (el.nodeType !== 1) continue;
  if (el.localName === 'p') {
    if (/^Heading/i.test(styleOf(el))) heading = textOf(el);
    continue;
  }
  if (el.localName !== 'tbl') continue;
  for (const tr of Array.from(el.getElementsByTagNameNS(W, 'tr'))) {
    const cells = Array.from(tr.getElementsByTagNameNS(W, 'tc')).map(textOf);
    const m = cells[0] && cells[0].match(ID);
    if (!m) continue;
    const last = cells[cells.length - 1];
    const p = last.match(PRIORITY);
    if (!p) continue;
    // Integration rows carry System | Purpose | Direction columns before the priority.
    const text = cells.length > 3
      ? `${cells[1]} — ${cells[2]} (${cells[3]})`
      : cells[1];
    reqs.push({
      id: cells[0],
      module: m[1],
      section: heading,
      text,
      priority: p[1],
      conditional: /when/i.test(last) ? last : undefined,
    });
  }
}

const seen = new Set();
const unique = reqs.filter((r) => (seen.has(r.id) ? false : seen.add(r.id)));
const counts = unique.reduce((a, r) => ({ ...a, [r.priority]: (a[r.priority] || 0) + 1 }), {});
fs.writeFileSync(OUT, `${JSON.stringify(unique, null, 1)}\n`);
console.log(`Extracted ${unique.length} requirements`, counts);
