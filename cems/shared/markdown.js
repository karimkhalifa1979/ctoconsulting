// Rich-text narrative (RPT-018): a small Markdown subset — paragraphs, bullet and numbered lists
// (two-space indent for a second level), **bold**, *italics*, [links](https://…).
// Parsed to a block/inline tree that renders to HTML in the app and to WordprocessingML in reports.

export function parseInline(text) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(_([^_]+)_)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[1]) out.push(...parseInline(m[2]).map((r) => ({ ...r, bold: true })));
    else if (m[3]) out.push(...parseInline(m[4]).map((r) => ({ ...r, italic: true })));
    else if (m[5]) out.push(...parseInline(m[6]).map((r) => ({ ...r, italic: true })));
    else if (m[7]) out.push({ text: m[8], link: m[9] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.filter((r) => r.text);
}

export function parseRich(src) {
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', inlines: parseInline(para.join(' ')) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of String(src ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const bullet = line.match(/^(\s*)[-*•]\s+(.*)$/);
    const number = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
    if (bullet || number) {
      flushPara();
      const type = bullet ? 'ul' : 'ol';
      const [, indent, text] = bullet || number;
      if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
      list.items.push({ level: indent.length >= 2 ? 1 : 0, inlines: parseInline(text) });
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return blocks;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inlineHTML(inlines) {
  return inlines.map((r) => {
    let h = esc(r.text);
    if (r.bold) h = `<strong>${h}</strong>`;
    if (r.italic) h = `<em>${h}</em>`;
    if (r.link) h = `<a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">${h}</a>`;
    return h;
  }).join('');
}

export function richToHTML(src) {
  return parseRich(src).map((b) => {
    if (b.type === 'p') return `<p>${inlineHTML(b.inlines)}</p>`;
    const items = b.items.map((it) => `<li${it.level ? ' class="lvl-1"' : ''}>${inlineHTML(it.inlines)}</li>`).join('');
    return `<${b.type}>${items}</${b.type}>`;
  }).join('');
}

export function richToPlain(src) {
  return parseRich(src).map((b) => (b.type === 'p'
    ? b.inlines.map((r) => r.text).join('')
    : b.items.map((it, i) => `${b.type === 'ul' ? '•' : `${i + 1}.`} ${it.inlines.map((r) => r.text).join('')}`).join('\n'))).join('\n');
}

export const isBlankRich = (src) => !String(src ?? '').replace(/[\s\-*•]/g, '');
