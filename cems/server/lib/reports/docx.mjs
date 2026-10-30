// Word (.docx) template engine (section 8.4, RPT-012..027).
// The template language is logic-limited (RPT-022): values, formatting helpers, {{#each}} over
// catalogue collections with filter/sort/limit, {{#if}}/{{#unless}}/{{else}} on data, RAG, rich text,
// charts and images. No expressions or code are ever evaluated.
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CEMS = 'urn:cems:template';
const TOKEN_RE = /\{\{[\s\S]*?\}\}/g;

const parseXml = (s) => new DOMParser({ onError: () => {} }).parseFromString(s, 'text/xml');
const serialize = (d) => new XMLSerializer().serializeToString(d);
const isW = (n, name) => n && n.nodeType === 1 && n.namespaceURI === W && n.localName === name;
const children = (n) => Array.from(n.childNodes || []).filter((c) => c.nodeType === 1);
function closest(n, name, stop = null) {
  for (let x = n; x && x !== stop; x = x.parentNode) if (isW(x, name)) return x;
  return null;
}
function descendants(n, name) {
  return Array.from(n.getElementsByTagNameNS(W, name));
}

// ---------- Token parsing ----------
export function normaliseQuotes(s) {
  return s.replace(/[“”„‟″]/g, '"').replace(/[‘’‚‛′]/g, "'").replace(/ /g, ' ');
}

function splitArgs(s) {
  const out = [];
  const re = /([A-Za-z_][\w]*=(?:"[^"]*"|'[^']*'|[^\s]+))|("[^"]*"|'[^']*')|([^\s]+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[0]);
  return out;
}
const unquote = (s) => (/^(["']).*\1$/.test(s) ? s.slice(1, -1) : s);
const PATH_RE = /^(@?[A-Za-z_][\w]*)(\.[A-Za-z_][\w]*)*$/;

// Returns { kind, name, path, args, hash, raw, error }.
export function parseToken(raw) {
  const inner = normaliseQuotes(raw.slice(2, -2)).trim();
  const tok = { raw, inner };
  if (!inner) return { ...tok, kind: 'error', error: 'Empty token' };
  if (inner.includes('{{') || inner.includes('}}') || raw.slice(2).includes('{{')) return { ...tok, kind: 'error', error: 'Malformed token: nested or unbalanced braces' };
  if (inner === 'else') return { ...tok, kind: 'else' };
  if (inner.startsWith('/')) return { ...tok, kind: 'close', name: inner.slice(1).trim() };
  const parts = splitArgs(inner.replace(/^#\s*/, '#'));
  if (parts[0].startsWith('#')) {
    const name = parts[0].slice(1);
    const path = parts[1];
    const hash = {};
    for (const p of parts.slice(2)) {
      const i = p.indexOf('=');
      if (i < 0) return { ...tok, kind: 'error', error: `Unexpected "${p}" in block tag` };
      hash[p.slice(0, i)] = unquote(p.slice(i + 1));
    }
    if (!path || !PATH_RE.test(path)) return { ...tok, kind: 'error', error: `{{#${name}}} needs a data path` };
    return { ...tok, kind: 'open', name, path, hash };
  }
  const args = [];
  const hash = {};
  for (const p of parts) {
    const i = p.indexOf('=');
    if (i > 0 && /^[A-Za-z_]\w*$/.test(p.slice(0, i))) hash[p.slice(0, i)] = unquote(p.slice(i + 1));
    else args.push(p);
  }
  if (args.length === 1) {
    if (!PATH_RE.test(args[0])) return { ...tok, kind: 'error', error: `"${args[0]}" is not a valid data path` };
    return { ...tok, kind: 'value', path: args[0], hash, args: [] };
  }
  const [helper, target, ...rest] = args;
  if (!/^[a-z]+$/.test(helper)) return { ...tok, kind: 'error', error: `Unknown helper "${helper}"` };
  const literal = target && /^["']/.test(target);
  if (target && !literal && !PATH_RE.test(target)) return { ...tok, kind: 'error', error: `"${target}" is not a valid data path` };
  return { ...tok, kind: 'helper', helper, path: literal ? null : target, literal: literal ? unquote(target) : null, args: rest.map(unquote), hash };
}

// ---------- Loading and normalising ----------
export async function loadDocx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const ct = await zip.file('[Content_Types].xml')?.async('string');
  if (!ct) throw new Error('Not a Word document (missing content types)');
  const names = Object.keys(zip.files);
  const main = names.includes('word/document.xml') ? 'word/document.xml' : null;
  if (!main) throw new Error('Not a Word document (missing word/document.xml)');
  const partNames = [main, ...names.filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n)).sort()];
  const parts = [];
  for (const name of partNames) parts.push({ name, doc: parseXml(await zip.file(name).async('string')) });
  return { zip, parts, contentTypes: ct };
}

function textNodesOf(p) {
  return descendants(p, 't').filter((t) => closest(t, 'p') === p && !closest(t, 'del', p));
}

// Merges tokens that Word has split across several runs into the run where each token starts.
export function mergeSplitTokens(doc) {
  for (const p of descendants(doc, 'p')) {
    for (let guard = 0; guard < 200; guard++) {
      const ts = textNodesOf(p);
      if (ts.length < 2) break;
      const texts = ts.map((t) => t.textContent);
      const full = texts.join('');
      if (!full.includes('{{')) break;
      const starts = [];
      let pos = 0;
      for (const t of texts) { starts.push(pos); pos += t.length; }
      const at = (offset) => { let i = starts.length - 1; while (i > 0 && starts[i] > offset) i--; return i; };
      let fixed = false;
      for (const m of full.matchAll(TOKEN_RE)) {
        const s = m.index, e = s + m[0].length;
        const i = at(s), j = at(e - 1);
        if (i === j) continue;
        ts[i].textContent = texts[i].slice(0, s - starts[i]) + m[0];
        for (let k = i + 1; k < j; k++) ts[k].textContent = '';
        ts[j].textContent = texts[j].slice(e - starts[j]);
        for (const k of [i, j]) ts[k].setAttribute('xml:space', 'preserve');
        fixed = true;
        break;
      }
      if (!fixed) break;
    }
  }
}

function runProps(run) {
  return children(run).find((c) => isW(c, 'rPr')) || null;
}

function newRun(doc, rPr, child) {
  const r = doc.createElementNS(W, 'w:r');
  if (rPr) r.appendChild(rPr.cloneNode(true));
  if (child) r.appendChild(child);
  return r;
}
function newText(doc, text) {
  const t = doc.createElementNS(W, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.appendChild(doc.createTextNode(text));
  return t;
}

// Splits runs so that every token sits alone in its own run.
export function isolateTokens(doc) {
  for (const t of descendants(doc, 't')) {
    const text = t.textContent;
    if (!text.includes('{{')) continue;
    const run = t.parentNode;
    if (!isW(run, 'r')) continue;
    const segments = [];
    let last = 0;
    for (const m of text.matchAll(TOKEN_RE)) {
      if (m.index > last) segments.push(text.slice(last, m.index));
      segments.push(m[0]);
      last = m.index + m[0].length;
    }
    if (last < text.length) segments.push(text.slice(last));
    const kids = children(run).filter((c) => !isW(c, 'rPr'));
    if (segments.length === 1 && kids.length === 1) continue;
    const rPr = runProps(run);
    const parent = run.parentNode;
    for (const k of kids) {
      if (k === t) for (const seg of segments) parent.insertBefore(newRun(doc, rPr, newText(doc, seg)), run);
      else parent.insertBefore(newRun(doc, rPr, k.cloneNode(true)), run);
    }
    parent.removeChild(run);
  }
}

// ---------- Locations (RPT-024) ----------
// Page numbers are estimated from page breaks and the last-rendered page markers Word stores.
function locate(part, doc) {
  const out = [];
  const body = doc.documentElement;
  let page = 1;
  let para = 0;
  const kind = part.startsWith('word/header') ? 'Header' : part.startsWith('word/footer') ? 'Footer' : 'Body';
  const walk = (n) => {
    for (const c of children(n)) {
      if (isW(c, 'lastRenderedPageBreak') || (isW(c, 'br') && c.getAttributeNS(W, 'type') === 'page') || (isW(c, 'br') && c.getAttribute('w:type') === 'page')) page++;
      if (isW(c, 'p')) para++;
      if (isW(c, 'r')) {
        const t = children(c).find((x) => isW(x, 't'));
        const text = t?.textContent || '';
        if (/^\{\{[\s\S]*\}\}$/.test(text)) {
          const p = closest(c, 'p');
          const tc = closest(c, 'tc');
          let cellLoc = null;
          if (tc) {
            const tr = closest(tc, 'tr');
            const tbl = closest(tr, 'tbl');
            const tables = descendants(doc, 'tbl');
            cellLoc = { table: tables.indexOf(tbl) + 1, row: children(tbl).filter((x) => isW(x, 'tr')).indexOf(tr) + 1, cell: children(tr).filter((x) => isW(x, 'tc')).indexOf(tc) + 1 };
          }
          const context = textNodesOf(p).map((x) => x.textContent).join('').replace(/\s+/g, ' ').trim().slice(0, 90);
          out.push({ run: c, text, location: { part: kind, partName: part, page: kind === 'Body' ? page : null, paragraph: para, ...cellLoc, context } });
        }
      }
      walk(c);
    }
  };
  walk(body);
  return out;
}

export function describeLocation(l) {
  if (!l) return '';
  const where = l.table ? `table ${l.table}, row ${l.row}, cell ${l.cell}` : `paragraph ${l.paragraph}`;
  return `${l.part}${l.page ? ` page ${l.page}` : ''}, ${where}`;
}

// Parses every part and returns tokens with locations and structural errors.
export function analyse(parts) {
  const tokens = [];
  const errors = [];
  for (const part of parts) {
    mergeSplitTokens(part.doc);
    isolateTokens(part.doc);
    const found = locate(part.name, part.doc);
    const stack = [];
    for (const f of found) {
      const ast = parseToken(f.text);
      const tok = { ...f, ast };
      tokens.push(tok);
      if (ast.kind === 'error') errors.push({ code: 'malformed', message: `${ast.error}: ${f.text}`, location: f.location, token: f.text });
      else if (ast.kind === 'open') stack.push(tok);
      else if (ast.kind === 'else') {
        const top = stack.at(-1);
        if (!top || !['if', 'unless'].includes(top.ast.name)) errors.push({ code: 'stray-else', message: '{{else}} outside an {{#if}} block', location: f.location, token: f.text });
        else if (top.elseTok) errors.push({ code: 'stray-else', message: 'Two {{else}} tags in one block', location: f.location, token: f.text });
        else top.elseTok = tok;
      } else if (ast.kind === 'close') {
        const top = stack.pop();
        if (!top) errors.push({ code: 'stray-close', message: `{{/${ast.name}}} without a matching opening tag`, location: f.location, token: f.text });
        else if (top.ast.name !== ast.name) {
          errors.push({ code: 'mismatch', message: `{{/${ast.name}}} closes {{#${top.ast.name}}} opened at ${describeLocation(top.location)}`, location: f.location, token: f.text });
        } else { top.closeTok = tok; tok.openTok = top; }
      }
    }
    for (const open of stack) errors.push({ code: 'unclosed', message: `Unclosed {{#${open.ast.name} ${open.ast.path}}} opened at ${describeLocation(open.location)}`, location: open.location, token: open.text });
  }
  return { tokens, errors };
}

// ---------- Block structure ----------
function lca(a, b) {
  const seen = new Set();
  for (let x = a; x; x = x.parentNode) seen.add(x);
  for (let y = b; y; y = y.parentNode) if (seen.has(y)) return y;
  return null;
}
function childOfAncestor(anc, n) {
  let x = n;
  while (x && x.parentNode !== anc) x = x.parentNode;
  return x;
}
const hasContent = (p) => children(p).some((c) => !isW(c, 'pPr') && !(isW(c, 'r') && !children(c).some((k) => !isW(k, 'rPr') && !(isW(k, 't') && !k.textContent))) && !isW(c, 'bookmarkStart') && !isW(c, 'bookmarkEnd') && !isW(c, 'proofErr'));

// Moves the runs of a paragraph after (or before) a marker run into a new paragraph.
function splitParagraph(doc, p, marker, side) {
  const pPr = children(p).find((c) => isW(c, 'pPr'));
  const np = doc.createElementNS(W, 'w:p');
  if (pPr) np.appendChild(pPr.cloneNode(true));
  const kids = children(p).filter((c) => !isW(c, 'pPr'));
  const idx = kids.indexOf(childOfAncestor(p, marker));
  const move = side === 'after' ? kids.slice(idx + 1) : kids.slice(0, idx);
  for (const k of move) np.appendChild(k);
  if (side === 'after') p.parentNode.insertBefore(np, p.nextSibling);
  else p.parentNode.insertBefore(np, p);
  return np;
}

function blockEl(doc, tok, mode) {
  const b = doc.createElementNS(CEMS, 'cems:block');
  b.setAttribute('kind', tok.ast.name);
  b.setAttribute('path', tok.ast.path);
  b.setAttribute('hash', JSON.stringify(tok.ast.hash || {}));
  b.setAttribute('mode', mode);
  return b;
}

// Wraps every block (innermost first) in a <cems:block> element so rendering is a tree walk.
export function structure(doc, tokens) {
  const errors = [];
  const pairs = tokens.filter((t) => t.ast.kind === 'open' && t.closeTok).sort((a, b) => {
    // innermost first: blocks whose close comes earlier and opens later
    const ia = tokens.indexOf(a), ib = tokens.indexOf(b);
    const ca = tokens.indexOf(a.closeTok), cb = tokens.indexOf(b.closeTok);
    return (ca - ia) - (cb - ib);
  });
  for (const open of pairs) {
    const close = open.closeTok;
    const elseTok = open.elseTok || null;
    const pO = closest(open.run, 'p');
    const pC = closest(close.run, 'p');
    if (!pO || !pC || !open.run.parentNode || !close.run.parentNode) continue;
    if (pO === pC) {
      // Inline: repeat runs within the paragraph.
      const b = blockEl(doc, open, 'inline');
      const parent = open.run.parentNode;
      if (parent !== close.run.parentNode) { errors.push({ code: 'structure', message: `{{#${open.ast.name}}} and its closing tag are in different parts of the paragraph`, location: open.location }); continue; }
      parent.insertBefore(b, open.run);
      let n = open.run.nextSibling;
      while (n && n !== close.run) {
        const next = n.nextSibling;
        if (elseTok && n === elseTok.run) b.appendChild(doc.createElementNS(CEMS, 'cems:else'));
        else b.appendChild(n);
        n = next;
      }
      parent.removeChild(open.run);
      parent.removeChild(close.run);
      continue;
    }
    const anc = lca(pO, pC);
    if (isW(anc, 'tr') || isW(anc, 'tbl')) {
      // Table rows: the tags sit in cells of the first and last repeated rows.
      if (elseTok) { errors.push({ code: 'structure', message: '{{else}} is not supported inside repeated table rows', location: elseTok.location }); continue; }
      const tbl = isW(anc, 'tbl') ? anc : anc.parentNode;
      const trO = childOfAncestor(tbl, pO);
      const trC = childOfAncestor(tbl, pC);
      if (!isW(trO, 'tr') || !isW(trC, 'tr')) { errors.push({ code: 'structure', message: 'Table loop tags must be in the cells of the rows to repeat', location: open.location }); continue; }
      open.run.parentNode.removeChild(open.run);
      close.run.parentNode.removeChild(close.run);
      const b = blockEl(doc, open, 'rows');
      tbl.insertBefore(b, trO);
      let n = trO;
      while (n) {
        const next = n.nextSibling;
        b.appendChild(n);
        if (n === trC) break;
        n = next;
      }
      continue;
    }
    // Block range of paragraphs and tables within the same container.
    const cO = childOfAncestor(anc, pO);
    const cC = childOfAncestor(anc, pC);
    if (cO !== pO || cC !== pC) {
      errors.push({ code: 'structure', message: `{{#${open.ast.name}}} and {{/${open.ast.name}}} must be at the same level (not one inside a table and the other outside)`, location: open.location });
      continue;
    }
    if (hasContentBefore(pO, open.run)) splitParagraph(doc, pO, open.run, 'before');
    if (hasContentAfter(pC, close.run)) splitParagraph(doc, pC, close.run, 'after');
    let elseMarker = null;
    if (elseTok) {
      const pE = closest(elseTok.run, 'p');
      if (childOfAncestor(anc, pE) !== pE) { errors.push({ code: 'structure', message: '{{else}} must be at the same level as its {{#if}}', location: elseTok.location }); continue; }
      elseMarker = doc.createElementNS(CEMS, 'cems:else');
      if (hasContentAfter(pE, elseTok.run)) splitParagraph(doc, pE, elseTok.run, 'after');
      if (hasContentBefore(pE, elseTok.run)) splitParagraph(doc, pE, elseTok.run, 'before');
      pE.parentNode.insertBefore(elseMarker, pE);
      elseTok.run.parentNode.removeChild(elseTok.run);
      if (!hasContent(pE)) pE.parentNode.removeChild(pE);
    }
    open.run.parentNode.removeChild(open.run);
    close.run.parentNode.removeChild(close.run);
    const b = blockEl(doc, open, 'elements');
    const startKeep = hasContent(pO);
    const endKeep = hasContent(pC);
    const first = startKeep ? pO : pO.nextSibling;
    const last = endKeep ? pC : pC.previousSibling;
    anc.insertBefore(b, pO);
    if (!startKeep) anc.removeChild(pO);
    if (pC !== pO && !endKeep && pC.parentNode) anc.removeChild(pC);
    let n = first;
    while (n && n !== b) {
      const next = n.nextSibling;
      b.appendChild(n);
      if (n === last) break;
      n = next;
    }
    // In a table cell the last paragraph must remain.
    if (isW(anc, 'tc') && !children(anc).some((c) => isW(c, 'p'))) anc.appendChild(doc.createElementNS(W, 'w:p'));
  }
  return errors;
}
function hasContentBefore(p, run) {
  const kids = children(p).filter((c) => !isW(c, 'pPr'));
  const idx = kids.indexOf(childOfAncestor(p, run));
  return kids.slice(0, idx).some((k) => (isW(k, 'r') && textOfRun(k)) || isW(k, 'hyperlink'));
}
function hasContentAfter(p, run) {
  const kids = children(p).filter((c) => !isW(c, 'pPr'));
  const idx = kids.indexOf(childOfAncestor(p, run));
  return kids.slice(idx + 1).some((k) => (isW(k, 'r') && (textOfRun(k) || children(k).some((x) => isW(x, 'drawing') || isW(x, 'tab')))) || isW(k, 'hyperlink'));
}
const textOfRun = (r) => children(r).filter((x) => isW(x, 't')).map((x) => x.textContent).join('');

// ---------- Rendering ----------
export class DocxRenderer {
  constructor({ zip, parts, contentTypes }, { resolve, select, formatValue, render: renderValueHook }) {
    this.zip = zip;
    this.parts = parts;
    this.contentTypes = parseXml(contentTypes);
    this.resolve = resolve; // (scope, path) => value
    this.select = select; // (scope, path, hash) => items
    this.formatValue = formatValue; // (ast, value, scope) => { kind: 'text'|'rag'|'rich'|'image'|'trend', ... }
    this.renderValueHook = renderValueHook;
    this.media = 0;
    this.docPr = 9000;
    this.rels = new Map();
    this.numbering = null;
    this.warnings = [];
  }

  async relsFor(partName) {
    if (this.rels.has(partName)) return this.rels.get(partName);
    const relName = partName.replace(/^word\//, 'word/_rels/') + '.rels';
    const file = this.zip.file(relName);
    const doc = parseXml(file ? await file.async('string') : `<Relationships xmlns="${PKG_REL}"/>`);
    const entry = { name: relName, doc };
    this.rels.set(partName, entry);
    return entry;
  }

  addRel(entry, type, target, external = false) {
    const ids = Array.from(entry.doc.getElementsByTagName('Relationship')).map((r) => r.getAttribute('Id'));
    let n = ids.length + 1;
    while (ids.includes(`rIdC${n}`)) n++;
    const id = `rIdC${n}`;
    const rel = entry.doc.createElementNS(PKG_REL, 'Relationship');
    rel.setAttribute('Id', id);
    rel.setAttribute('Type', type);
    rel.setAttribute('Target', target);
    if (external) rel.setAttribute('TargetMode', 'External');
    entry.doc.documentElement.appendChild(rel);
    return id;
  }

  ensureDefault(ext, type) {
    const types = this.contentTypes.documentElement;
    if (!Array.from(types.getElementsByTagName('Default')).some((d) => d.getAttribute('Extension') === ext)) {
      const d = this.contentTypes.createElementNS('http://schemas.openxmlformats.org/package/2006/content-types', 'Default');
      d.setAttribute('Extension', ext);
      d.setAttribute('ContentType', type);
      types.insertBefore(d, types.firstChild);
    }
  }

  async render(rootScope) {
    for (const part of this.parts) {
      this.part = part;
      await this.walk(part.doc.documentElement, rootScope);
    }
    for (const part of this.parts) this.zip.file(part.name, serialize(part.doc));
    for (const entry of this.rels.values()) this.zip.file(entry.name, serialize(entry.doc));
    if (this.numbering) this.zip.file('word/numbering.xml', serialize(this.numbering.doc));
    this.zip.file('[Content_Types].xml', serialize(this.contentTypes));
    return this.zip;
  }

  async walk(node, scope) {
    for (const c of children(node)) {
      if (c.namespaceURI === CEMS && c.localName === 'block') await this.expand(c, scope);
      else if (isW(c, 'r') && /^\{\{[\s\S]*\}\}$/.test(textOfRun(c))) await this.renderToken(c, scope);
      else await this.walk(c, scope);
    }
  }

  async expand(block, scope) {
    const kind = block.getAttribute('kind');
    const path = block.getAttribute('path');
    const hash = JSON.parse(block.getAttribute('hash') || '{}');
    const parent = block.parentNode;
    const kids = Array.from(block.childNodes).filter((x) => x.nodeType === 1);
    const elseIdx = kids.findIndex((k) => k.namespaceURI === CEMS && k.localName === 'else');
    const yes = elseIdx >= 0 ? kids.slice(0, elseIdx) : kids;
    const no = elseIdx >= 0 ? kids.slice(elseIdx + 1) : [];
    const produced = [];
    if (kind === 'each') {
      const items = this.select(scope, path, hash) || [];
      items.forEach((item, i) => {
        const childScope = { item, index: i, count: items.length, parent: scope, collection: path };
        for (const k of yes) produced.push([k.cloneNode(true), childScope]);
      });
    } else if (kind === 'if' || kind === 'unless') {
      let v = this.resolve(scope, path);
      const truthy = Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== false && v !== '' && v !== 0 && v !== 'No';
      const show = kind === 'if' ? truthy : !truthy;
      for (const k of show ? yes : no) produced.push([k.cloneNode(true), scope]);
    } else {
      this.warnings.push(`Unknown block {{#${kind}}}`);
    }
    for (const [n] of produced) parent.insertBefore(n, block);
    parent.removeChild(block);
    for (const [n, s] of produced) {
      if (n.namespaceURI === CEMS && n.localName === 'block') await this.expand(n, s);
      else if (isW(n, 'r') && /^\{\{[\s\S]*\}\}$/.test(textOfRun(n))) await this.renderToken(n, s);
      else await this.walk(n, s);
    }
    // Rows removed entirely leave a table that still needs at least one row.
    if (isW(parent, 'tbl') && !children(parent).some((c) => isW(c, 'tr'))) parent.parentNode.removeChild(parent);
  }

  async renderToken(run, scope) {
    const ast = parseToken(textOfRun(run));
    if (ast.kind !== 'value' && ast.kind !== 'helper') { run.parentNode.removeChild(run); return; }
    const out = await this.formatValue(ast, scope);
    const doc = run.ownerDocument;
    const rPr = runProps(run);
    const parent = run.parentNode;
    if (out.kind === 'text') {
      const lines = String(out.text ?? '').split('\n');
      const r = newRun(doc, rPr, null);
      lines.forEach((line, i) => {
        if (i) r.appendChild(doc.createElementNS(W, 'w:br'));
        r.appendChild(newText(doc, line));
      });
      parent.replaceChild(r, run);
    } else if (out.kind === 'rag') {
      this.renderRag(run, out);
    } else if (out.kind === 'rich') {
      await this.renderRich(run, out.blocks);
    } else if (out.kind === 'image') {
      if (!out.buffer) { parent.replaceChild(newRun(doc, rPr, newText(doc, out.fallback || '')), run); return; }
      parent.replaceChild(await this.imageRun(doc, out), run);
    } else {
      parent.removeChild(run);
    }
  }

  // RPT-015: coloured cell or shape that always carries its text label.
  renderRag(run, { label, fill, color }) {
    const doc = run.ownerDocument;
    const tc = closest(run, 'tc');
    const rPr = (runProps(run) || doc.createElementNS(W, 'w:rPr')).cloneNode(true);
    const set = (name, attrs) => {
      for (const old of children(rPr).filter((c) => isW(c, name))) rPr.removeChild(old);
      const el = doc.createElementNS(W, `w:${name}`);
      for (const [k, v] of Object.entries(attrs)) el.setAttributeNS(W, `w:${k}`, v);
      rPr.appendChild(el);
    };
    set('b', {});
    set('color', { val: color });
    if (tc && children(closest(run, 'p')).filter((c) => isW(c, 'r')).length === 1 && fill) {
      let tcPr = children(tc).find((c) => isW(c, 'tcPr'));
      if (!tcPr) { tcPr = doc.createElementNS(W, 'w:tcPr'); tc.insertBefore(tcPr, tc.firstChild); }
      for (const old of children(tcPr).filter((c) => isW(c, 'shd'))) tcPr.removeChild(old);
      const shd = doc.createElementNS(W, 'w:shd');
      shd.setAttributeNS(W, 'w:val', 'clear');
      shd.setAttributeNS(W, 'w:color', 'auto');
      shd.setAttributeNS(W, 'w:fill', fill);
      // tcPr children order: shd comes after borders and before noWrap/vAlign; append before vAlign if present.
      const vAlign = children(tcPr).find((c) => isW(c, 'vAlign') || isW(c, 'noWrap') || isW(c, 'tcMar') || isW(c, 'textDirection') || isW(c, 'tcFitText') || isW(c, 'hideMark'));
      tcPr.insertBefore(shd, vAlign || null);
    } else if (fill) {
      set('shd', { val: 'clear', color: 'auto', fill });
    }
    const r = doc.createElementNS(W, 'w:r');
    r.appendChild(rPr);
    r.appendChild(newText(doc, fill && !tc ? ` ${label} ` : label));
    run.parentNode.replaceChild(r, run);
  }

  async ensureNumbering() {
    if (this.numbering) return this.numbering;
    let doc;
    const file = this.zip.file('word/numbering.xml');
    if (file) doc = parseXml(await file.async('string'));
    else {
      doc = parseXml(`<w:numbering xmlns:w="${W}"/>`);
      const types = this.contentTypes.documentElement;
      const o = this.contentTypes.createElementNS('http://schemas.openxmlformats.org/package/2006/content-types', 'Override');
      o.setAttribute('PartName', '/word/numbering.xml');
      o.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml');
      types.appendChild(o);
      const rels = await this.relsFor('word/document.xml');
      this.addRel(rels, `${R_NS}/numbering`, 'numbering.xml');
    }
    const root = doc.documentElement;
    const firstNum = children(root).find((c) => isW(c, 'num'));
    const abs = (id, fmt, texts) => {
      const a = parseXml(`<w:abstractNum xmlns:w="${W}" w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${texts.map((t, i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt[i]}"/><w:lvlText w:val="${t}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr>${fmt[i] === 'bullet' ? '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr>' : ''}</w:lvl>`).join('')}</w:abstractNum>`).documentElement;
      root.insertBefore(doc.importNode(a, true), firstNum || null);
    };
    abs(9101, ['bullet', 'bullet'], ['', 'o']);
    abs(9102, ['decimal', 'lowerLetter'], ['%1.', '%2)']);
    const bullet = parseXml(`<w:num xmlns:w="${W}" w:numId="9101"><w:abstractNumId w:val="9101"/></w:num>`).documentElement;
    root.appendChild(doc.importNode(bullet, true));
    this.numbering = { doc, next: 9200 };
    return this.numbering;
  }

  async newNumberedList() {
    const nb = await this.ensureNumbering();
    const id = nb.next++;
    const num = parseXml(`<w:num xmlns:w="${W}" w:numId="${id}"><w:abstractNumId w:val="9102"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).documentElement;
    nb.doc.documentElement.appendChild(nb.doc.importNode(num, true));
    return id;
  }

  // RPT-018: rich narrative in the template's own paragraph styles; lists use Word numbering.
  async renderRich(run, blocks) {
    const doc = run.ownerDocument;
    const p = closest(run, 'p');
    const rPr = runProps(run);
    const alone = p && children(p).filter((c) => isW(c, 'r') || isW(c, 'hyperlink')).length === 1;
    if (!alone || !blocks.length) {
      const text = blocks.map((b) => (b.type === 'p' ? b.inlines.map((r) => r.text).join('') : b.items.map((it) => it.inlines.map((r) => r.text).join('')).join('; '))).join(' ');
      run.parentNode.replaceChild(newRun(doc, rPr, newText(doc, text)), run);
      return;
    }
    const pPr = children(p).find((c) => isW(c, 'pPr'));
    const parent = p.parentNode;
    for (const b of blocks) {
      if (b.type === 'p') {
        const np = doc.createElementNS(W, 'w:p');
        if (pPr) np.appendChild(pPr.cloneNode(true));
        await this.appendInlines(np, b.inlines, rPr);
        parent.insertBefore(np, p);
      } else {
        const numId = b.type === 'ul' ? (await this.ensureNumbering(), 9101) : await this.newNumberedList();
        for (const it of b.items) {
          const np = doc.createElementNS(W, 'w:p');
          const ppr = pPr ? pPr.cloneNode(true) : doc.createElementNS(W, 'w:pPr');
          for (const old of children(ppr).filter((c) => isW(c, 'numPr'))) ppr.removeChild(old);
          const numPr = parseXml(`<w:numPr xmlns:w="${W}"><w:ilvl w:val="${it.level || 0}"/><w:numId w:val="${numId}"/></w:numPr>`).documentElement;
          const anchor = children(ppr).find((c) => !isW(c, 'pStyle') && !isW(c, 'keepNext') && !isW(c, 'keepLines') && !isW(c, 'pageBreakBefore') && !isW(c, 'framePr') && !isW(c, 'widowControl'));
          ppr.insertBefore(doc.importNode(numPr, true), anchor || null);
          np.appendChild(ppr);
          await this.appendInlines(np, it.inlines, rPr);
          parent.insertBefore(np, p);
        }
      }
    }
    parent.removeChild(p);
  }

  async appendInlines(p, inlines, baseRPr) {
    const doc = p.ownerDocument;
    for (const r of inlines) {
      const rPr = baseRPr ? baseRPr.cloneNode(true) : doc.createElementNS(W, 'w:rPr');
      if (r.bold) rPr.appendChild(doc.createElementNS(W, 'w:b'));
      if (r.italic) rPr.appendChild(doc.createElementNS(W, 'w:i'));
      if (r.link) {
        const color = doc.createElementNS(W, 'w:color'); color.setAttributeNS(W, 'w:val', '0563C1'); rPr.appendChild(color);
        const u = doc.createElementNS(W, 'w:u'); u.setAttributeNS(W, 'w:val', 'single'); rPr.appendChild(u);
        const rels = await this.relsFor(this.part.name);
        const id = this.addRel(rels, `${R_NS}/hyperlink`, r.link, true);
        const h = doc.createElementNS(W, 'w:hyperlink');
        h.setAttributeNS(R_NS, 'r:id', id);
        h.appendChild(newRun(doc, null, null));
        h.firstChild.appendChild(rPr);
        h.firstChild.appendChild(newText(doc, r.text));
        p.appendChild(h);
      } else {
        const run = doc.createElementNS(W, 'w:r');
        if (rPr.childNodes.length) run.appendChild(rPr);
        run.appendChild(newText(doc, r.text));
        p.appendChild(run);
      }
    }
  }

  async imageRun(doc, { buffer, ext = 'png', widthCm = 16, heightCm, alt = '' }) {
    const n = ++this.media;
    const name = `cems_${n}.${ext}`;
    this.zip.file(`word/media/${name}`, buffer);
    this.ensureDefault(ext, ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`);
    const rels = await this.relsFor(this.part.name);
    const rid = this.addRel(rels, `${R_NS}/image`, `media/${name}`);
    const cx = Math.round(widthCm * 360000);
    const cy = Math.round((heightCm || widthCm * 0.5) * 360000);
    const id = ++this.docPr;
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const xml = `<w:r xmlns:w="${W}"><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Image ${id}" descr="${esc(alt)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}" descr="${esc(alt)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="${R_NS}" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    return doc.importNode(parseXml(xml).documentElement, true);
  }
}

// ---------- Client-supplied templates (RPT-026) ----------
// Content controls (by tag or title), bookmarks and marked placeholder text such as [Project name].
export async function detectFields(buffer) {
  const { parts } = await loadDocx(buffer);
  const out = [];
  for (const part of parts) {
    for (const sdt of descendants(part.doc, 'sdt')) {
      const pr = children(sdt).find((c) => isW(c, 'sdtPr'));
      const tag = pr && children(pr).find((c) => isW(c, 'tag'));
      const alias = pr && children(pr).find((c) => isW(c, 'alias'));
      const key = tag?.getAttributeNS(W, 'val') || tag?.getAttribute('w:val') || alias?.getAttributeNS(W, 'val') || alias?.getAttribute('w:val');
      if (!key) continue;
      const content = children(sdt).find((c) => isW(c, 'sdtContent'));
      out.push({ kind: 'content control', key, part: part.name, text: (content ? descendants(content, 't').map((t) => t.textContent).join('') : '').slice(0, 80) });
    }
    for (const bm of descendants(part.doc, 'bookmarkStart')) {
      const name = bm.getAttributeNS(W, 'name') || bm.getAttribute('w:name');
      if (!name || name.startsWith('_')) continue;
      out.push({ kind: 'bookmark', key: name, part: part.name, text: '' });
    }
    for (const p of descendants(part.doc, 'p')) {
      const text = textNodesOf(p).map((t) => t.textContent).join('');
      for (const m of text.matchAll(/\[([A-Z][^\[\]{}]{2,60})\]/g)) out.push({ kind: 'placeholder', key: m[0], part: part.name, text: m[1] });
    }
  }
  const seen = new Set();
  return out.filter((f) => (seen.has(`${f.kind}|${f.key}`) ? false : seen.add(`${f.kind}|${f.key}`)));
}

// Rewrites mapped content controls, bookmarks and placeholders into tokens before analysis.
export function applyMappings(parts, mappings = []) {
  const map = new Map(mappings.filter((m) => m.token).map((m) => [`${m.kind}|${m.key}`, m.token]));
  if (!map.size) return;
  for (const part of parts) {
    const doc = part.doc;
    for (const sdt of descendants(doc, 'sdt')) {
      const pr = children(sdt).find((c) => isW(c, 'sdtPr'));
      const tag = pr && children(pr).find((c) => isW(c, 'tag'));
      const alias = pr && children(pr).find((c) => isW(c, 'alias'));
      const key = tag?.getAttributeNS(W, 'val') || tag?.getAttribute('w:val') || alias?.getAttributeNS(W, 'val') || alias?.getAttribute('w:val');
      const token = map.get(`content control|${key}`);
      if (!token) continue;
      const content = children(sdt).find((c) => isW(c, 'sdtContent'));
      const ts = content ? descendants(content, 't') : [];
      if (ts.length) {
        ts[0].textContent = `{{${token}}}`;
        for (const t of ts.slice(1)) t.textContent = '';
      }
      // Unwrap the control so the rendered text is plain document content.
      if (content) {
        const parent = sdt.parentNode;
        for (const c of children(content)) parent.insertBefore(c, sdt);
        parent.removeChild(sdt);
      }
    }
    for (const bm of descendants(doc, 'bookmarkStart')) {
      const name = bm.getAttributeNS(W, 'name') || bm.getAttribute('w:name');
      const token = map.get(`bookmark|${name}`);
      if (!token) continue;
      const run = doc.createElementNS(W, 'w:r');
      run.appendChild(newText(doc, `{{${token}}}`));
      bm.parentNode.insertBefore(run, bm.nextSibling);
    }
    for (const t of descendants(doc, 't')) {
      let text = t.textContent;
      for (const [k, token] of map) {
        const [kind, key] = [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)];
        if (kind === 'placeholder' && text.includes(key)) text = text.split(key).join(`{{${token}}}`);
      }
      if (text !== t.textContent) { t.textContent = text; t.setAttribute('xml:space', 'preserve'); }
    }
  }
}

// RPT-042: sensitivity label in document metadata.
export async function applyMetadata(zip, { title, classification, author }) {
  const core = zip.file('docProps/core.xml');
  if (core) {
    let xml = await core.async('string');
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const setTag = (tag, val) => {
      const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>|<${tag}[^>]*/>`);
      xml = re.test(xml) ? xml.replace(re, `<${tag}>${esc(val)}</${tag}>`) : xml.replace('</cp:coreProperties>', `<${tag}>${esc(val)}</${tag}></cp:coreProperties>`);
    };
    if (title) setTag('dc:title', title);
    if (classification) { setTag('cp:category', classification); setTag('cp:keywords', `Classification: ${classification}`); }
    if (author) setTag('dc:creator', author);
    zip.file('docProps/core.xml', xml);
  }
}

// RPT-004 / NFR-008: macro-enabled and active content checks, run on the raw package.
export async function inspectPackage(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const ct = await zip.file('[Content_Types].xml')?.async('string');
  const names = Object.keys(zip.files);
  const issues = [];
  if (!ct) issues.push({ severity: 'error', message: 'The file is not an Office Open XML package' });
  if (ct && /macroEnabled|vbaProject|ms-office\.vbaProject/i.test(ct)) issues.push({ severity: 'error', message: 'Macro-enabled documents are not accepted (RPT-004)' });
  if (names.some((n) => /vbaProject\.bin$/i.test(n))) issues.push({ severity: 'error', message: 'The document contains a VBA macro project (RPT-004)' });
  if (names.some((n) => /activeX/i.test(n))) issues.push({ severity: 'warning', message: 'ActiveX controls will be removed (NFR-008)' });
  if (names.some((n) => /embeddings\//i.test(n))) issues.push({ severity: 'warning', message: 'Embedded objects will be removed (NFR-008)' });
  const kind = names.includes('word/document.xml') ? 'docx' : names.includes('ppt/presentation.xml') ? 'pptx' : names.includes('xl/workbook.xml') ? 'xlsx' : 'unknown';
  return { kind, issues, zip };
}

// Strips active content (ActiveX, OLE embeddings, external template references, DDE fields).
export async function sanitise(zip) {
  const removed = [];
  for (const n of Object.keys(zip.files)) {
    if (/(^|\/)activeX\//i.test(n) || /(^|\/)embeddings\//i.test(n) || /vbaProject/i.test(n) || /vbaData/i.test(n)) { zip.remove(n); removed.push(n); }
  }
  for (const n of Object.keys(zip.files).filter((x) => x.endsWith('.rels'))) {
    let xml = await zip.file(n).async('string');
    const before = xml;
    xml = xml.replace(/<Relationship[^>]*Type="[^"]*\/(attachedTemplate|oleObject|control|package|vbaProject|aFChunk)"[^>]*\/>/g, '');
    xml = xml.replace(/<Relationship[^>]*TargetMode="External"[^>]*Type="[^"]*\/(?!hyperlink)[^"]*"[^>]*\/>/g, (m) => (/\/hyperlink"/.test(m) ? m : ''));
    if (xml !== before) { zip.file(n, xml); removed.push(`${n} (external or active relationships)`); }
  }
  for (const n of Object.keys(zip.files).filter((x) => /^word\/.*\.xml$/.test(x))) {
    let xml = await zip.file(n).async('string');
    const before = xml;
    xml = xml.replace(/<w:instrText([^>]*)>\s*(DDE|DDEAUTO|INCLUDETEXT|INCLUDEPICTURE|IMPORT)\b[^<]*<\/w:instrText>/gi, '<w:instrText$1></w:instrText>');
    xml = xml.replace(/<w:fldSimple[^>]*w:instr="\s*(DDE|DDEAUTO|INCLUDETEXT|INCLUDEPICTURE)[^"]*"[^>]*>/gi, '<w:fldSimple w:instr="">');
    if (xml !== before) { zip.file(n, xml); removed.push(`${n} (field codes)`); }
  }
  return removed;
}
