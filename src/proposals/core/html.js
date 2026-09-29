// Minimal HTML parser and serialiser for the editor's content subset (runs in browser and Node).
// Section content uses: p, h2, h3, h4, ul, ol, li, table, thead, tbody, tr, th, td, blockquote, strong, em, u, s, a, br,
// span[data-ai] (AI text awaiting review), mark[data-flag] (needs evidence) and cite[data-src] (source citation).
import { decodeEntities, escapeHtml } from './util.js';

const VOID = new Set(['br', 'img', 'hr', 'col', 'input', 'meta', 'link']);
const ALLOWED = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'br', 'span', 'mark', 'cite', 'sup', 'sub', 'img', 'colgroup', 'col', 'hr']);
const ATTRS = { a: ['href'], span: ['data-ai', 'class'], mark: ['data-flag', 'class'], cite: ['data-src', 'data-label', 'data-kind', 'class'], img: ['src', 'alt'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'], ol: ['start'] };

function parseAttrs(s) {
  const attrs = {};
  const re = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(s))) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

export function parseHtml(html) {
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w-]*)([^>]*)>|([^<]+)|</g;
  let m;
  const src = String(html || '');
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[0].startsWith('<!--')) continue;
    if (m[3] !== undefined || m[0] === '<') {
      const t = decodeEntities(m[3] ?? '<');
      if (t) top.children.push({ text: t });
      continue;
    }
    const name = m[1].toLowerCase();
    if (m[0][1] === '/') {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === name) { stack.length = i; break; }
      }
      continue;
    }
    const node = { name, attrs: parseAttrs(m[2] || ''), children: [] };
    top.children.push(node);
    if (!VOID.has(name) && !/\/\s*$/.test(m[2] || '')) stack.push(node);
  }
  return root;
}

export function renderHtml(node) {
  if (node.text !== undefined) return escapeHtml(node.text);
  const inner = (node.children || []).map(renderHtml).join('');
  if (node.name === '#root') return inner;
  const attrs = Object.entries(node.attrs || {}).map(([k, v]) => ` ${k}="${escapeHtml(v)}"`).join('');
  if (VOID.has(node.name)) return `<${node.name}${attrs}>`;
  return `<${node.name}${attrs}>${inner}</${node.name}>`;
}

export function textOf(node) {
  if (!node) return '';
  if (node.text !== undefined) return node.text;
  if (node.name === 'br') return '\n';
  if (node.name === 'cite') return '';
  return (node.children || []).map(textOf).join('');
}

export function walk(node, fn, parent = null) {
  if (fn(node, parent) === false) return;
  for (const c of node.children || []) walk(c, fn, node);
}

// Removes anything outside the allowed subset (used on pasted or AI-returned HTML).
export function sanitizeHtml(html) {
  const root = parseHtml(html);
  const clean = (node) => {
    if (node.text !== undefined) return [node];
    const kids = (node.children || []).flatMap(clean);
    if (node.name === '#root') return [{ ...node, children: kids }];
    if (['script', 'style', 'iframe', 'object', 'embed', 'form', 'svg', 'math', 'template'].includes(node.name)) return [];
    if (!ALLOWED.has(node.name)) return kids;
    const allowed = ATTRS[node.name] || [];
    const attrs = {};
    for (const [k, v] of Object.entries(node.attrs || {})) {
      if (!allowed.includes(k)) continue;
      if ((k === 'href' || k === 'src') && !/^(https?:|mailto:|data:image\/)/i.test(v)) continue;
      attrs[k] = v;
    }
    const name = node.name === 'b' ? 'strong' : node.name === 'i' ? 'em' : node.name === 'h1' ? 'h2' : node.name;
    return [{ name, attrs, children: kids }];
  };
  return renderHtml(clean(root)[0]);
}

// Inline runs of a block: text with marks, and citations attached to the run they follow.
export function inlineRuns(node, marks = {}) {
  const out = [];
  for (const c of node.children || []) {
    if (c.text !== undefined) { out.push({ text: c.text, marks: { ...marks } }); continue; }
    if (c.name === 'cite') { out.push({ cite: { src: c.attrs['data-src'], label: c.attrs['data-label'] || textOf(c), kind: c.attrs['data-kind'] } }); continue; }
    if (c.name === 'br') { out.push({ text: '\n', marks: { ...marks } }); continue; }
    const m = { ...marks };
    if (c.name === 'strong') m.bold = true;
    if (c.name === 'em') m.italic = true;
    if (c.name === 'u') m.underline = true;
    if (c.name === 'span' && c.attrs['data-ai']) m.ai = c.attrs['data-ai'];
    if (c.name === 'mark' && c.attrs['data-flag']) m.flag = c.attrs['data-flag'];
    if (c.name === 'a') m.href = c.attrs.href;
    out.push(...inlineRuns(c, m));
  }
  return out;
}

// Splits a block into sentences, each with its citations and whether it is AI text or flagged.
export function blockSentences(node) {
  const runs = inlineRuns(node);
  const sentences = [];
  let cur = { text: '', cites: [], ai: false, flag: false };
  const push = () => {
    if (cur.text.trim()) sentences.push({ ...cur, text: cur.text.replace(/\s+/g, ' ').trim() });
    else if (cur.cites.length && sentences.length) sentences[sentences.length - 1].cites.push(...cur.cites);
    cur = { text: '', cites: [], ai: false, flag: false };
  };
  const ended = () => /[.!?]["”’)]?\s*$/.test(cur.text);
  for (const r of runs) {
    if (r.cite) {
      if (!cur.text.trim() && sentences.length) sentences[sentences.length - 1].cites.push(r.cite);
      else cur.cites.push(r.cite);
      continue;
    }
    // A new sentence starts at a run boundary after closing punctuation (typically after a citation).
    if (cur.text.trim() && ended() && /^\s*[A-Z0-9“"(]/.test(r.text)) push();
    const parts = r.text.split(/(?<=[.!?]["”’)]?)\s+(?=[A-Z0-9“"(])/);
    parts.forEach((part, i) => {
      if (i > 0) push();
      cur.text += part;
      if (r.marks.ai) cur.ai = true;
      if (r.marks.flag) cur.flag = true;
    });
  }
  push();
  return sentences.filter((s) => s.text);
}

export function topBlocks(html) {
  return parseHtml(html).children.filter((c) => c.text === undefined || c.text.trim());
}

// Builds the HTML for one AI sentence: optional needs-evidence mark and citations.
export function sentenceHtml(s, { ai = true } = {}) {
  let t = escapeHtml(s.text);
  if (s.flag) t = `<mark data-flag="needs-evidence">${t}</mark>`;
  if (ai) t = `<span data-ai="pending">${t}</span>`;
  const cites = (s.cites || []).map((c) => `<cite data-src="${escapeHtml(c.src)}" data-label="${escapeHtml(c.label)}"${c.kind ? ` data-kind="${escapeHtml(c.kind)}"` : ''}>${escapeHtml(c.label)}</cite>`).join('');
  return t + cites;
}

export function sentencesToParagraph(sentences, opts) {
  return `<p>${sentences.map((s) => sentenceHtml(s, opts)).join(' ')}</p>`;
}

export function stripAiMarks(html) {
  return String(html || '').replace(/<span data-ai="[^"]*">([\s\S]*?)<\/span>/g, '$1');
}

export function citationsIn(html) {
  const out = [];
  walk(parseHtml(html), (n) => { if (n.name === 'cite') out.push({ src: n.attrs['data-src'], label: n.attrs['data-label'] || textOf(n), kind: n.attrs['data-kind'] }); });
  return out;
}

// "lib:ITEM@V", "req:REQID", "doc:DOCID#p3", "con:CONSULTANTID", "sec:SECTIONID"
export function parseSrc(src) {
  const m = String(src || '').match(/^(\w+):([^@#]+)(?:@(\d+))?(?:#p(\d+))?/);
  if (!m) return null;
  return { kind: { lib: 'library', req: 'request', doc: 'document', con: 'consultant', sec: 'section' }[m[1]] || m[1], id: m[2], v: m[3] ? Number(m[3]) : null, page: m[4] ? Number(m[4]) : null };
}
