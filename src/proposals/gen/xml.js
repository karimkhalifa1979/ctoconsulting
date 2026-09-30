// Minimal XML parser and serialiser for OOXML parts. Text and attribute values are kept encoded
// so untouched content round-trips byte-for-byte; namespaces are treated as plain prefixes.

export const xmlEscape = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const xmlUnescape = (s) => String(s ?? '').replace(/&(lt|gt|quot|apos|amp|#x?[0-9a-f]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }[e.toLowerCase()];
});

export function parseXml(str) {
  const root = { name: '#doc', attrs: [], children: [] };
  const stack = [root];
  const re = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(str))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) { top.children.push({ text: m[5] }); continue; }
    if (m[1]) {
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].name === m[1]) { stack.length = i; break; }
      continue;
    }
    if (m[2]) {
      const attrs = [];
      const ar = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a;
      while ((a = ar.exec(m[3] || ''))) attrs.push([a[1], a[2] ?? a[3]]);
      const node = { name: m[2], attrs, children: [] };
      top.children.push(node);
      if (!m[4]) stack.push(node);
      continue;
    }
    top.children.push({ raw: m[0] });
  }
  return root;
}

export function serializeXml(node) {
  if (node.text !== undefined) return node.text;
  if (node.raw !== undefined) return node.raw;
  const inner = (node.children || []).map(serializeXml).join('');
  if (node.name === '#doc') return inner;
  const attrs = node.attrs.map(([k, v]) => ` ${k}="${v}"`).join('');
  return node.children.length ? `<${node.name}${attrs}>${inner}</${node.name}>` : `<${node.name}${attrs}/>`;
}

export const attr = (n, k) => { const a = n.attrs?.find((x) => x[0] === k); return a ? xmlUnescape(a[1]) : null; };
export function setAttr(n, k, v) {
  const a = n.attrs.find((x) => x[0] === k);
  if (a) a[1] = xmlEscape(v); else n.attrs.push([k, xmlEscape(v)]);
}
export const kids = (n, name) => (n.children || []).filter((c) => c.name === name);
export const kid = (n, name) => (n.children || []).find((c) => c.name === name) || null;

export function findAll(n, name, out = []) {
  for (const c of n.children || []) {
    if (c.name === name) out.push(c);
    if (c.children) findAll(c, name, out);
  }
  return out;
}

export function walkXml(n, fn, parent = null) {
  if (fn(n, parent) === false) return;
  for (const c of [...(n.children || [])]) if (c.children) walkXml(c, fn, n);
}

export function textOfRuns(p) {
  let t = '';
  walkXml(p, (n) => {
    if (n.name === 'w:t' || n.name === 'w:delText') t += xmlUnescape(n.children.map((c) => c.text || '').join(''));
    else if (n.name === 'w:tab') t += '\t';
    else if (n.name === 'w:br' || n.name === 'w:cr') t += '\n';
    if (n.name === 'w:txbxContent' && n !== p) return false;
    return undefined;
  });
  return t;
}

export function fragment(xml) {
  return parseXml(`<x>${xml}</x>`).children[0].children;
}

export const el = (name, attrs = [], children = []) => ({ name, attrs: attrs.map(([k, v]) => [k, xmlEscape(v)]), children });
