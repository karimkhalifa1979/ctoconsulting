// Word template engine (spec 9.2 and 9.3): validates templates, merges bid data using the tag syntax,
// converts section rich text into the template's named styles, rebuilds the contents page, cleans the
// package (tracked changes, comments, hidden text, personal properties) and reports what it produced.
import JSZip from 'jszip';
import { parseXml, serializeXml, attr, kids, kid, findAll, walkXml, textOfRuns, fragment, xmlEscape as esc, xmlUnescape } from './xml.js';
import { drawing, pngSize, REL, coreXml, appXml } from './ooxml.js';
import { parseHtml, inlineRuns, textOf } from '../core/html.js';

export const FIELDS = {
  'client.name': 'Client name', 'client.short_name': 'Client short name', 'client.abn': 'Client ABN', 'client.sector': 'Client sector',
  'bid.title': 'Opportunity title', 'bid.reference': 'Client reference (or our reference)', 'bid.client_reference': 'Client reference', 'bid.internal_reference': 'CTO Consulting reference', 'bid.value': 'Estimated value',
  'submission.due': 'Closing date and time', 'submission.due_date': 'Closing date', 'submission.due_time': 'Closing time', 'submission.timezone': 'Closing time zone', 'submission.channel': 'Lodgement channel',
  'partner.name': 'Partner name', 'partner.title': 'Partner title', 'partner.email': 'Partner email', 'bid_manager.name': 'Bid manager name', 'bid_manager.email': 'Bid manager email',
  'org.name': 'CTO Consulting', 'org.website': 'Website', 'org.abn': 'CTO Consulting ABN', today: 'Generation date',
  'pricing.model': 'Pricing model', 'pricing.total_ex_gst': 'Total excluding GST', 'pricing.gst': 'GST', 'pricing.total_inc_gst': 'Total including GST', 'ai.disclosure': 'AI use disclosure statement',
};
export const BLOCKS = {
  case_studies: ['title', 'client', 'sector', 'summary', 'summary_line', 'value', 'period', 'referee', 'challenge', 'approach'],
  outcomes: ['text'],
  team: ['name', 'role', 'level', 'clearance', 'bio', 'certifications', 'skills', 'days'],
  assumptions: ['text'], risks: ['text', 'rating', 'mitigation'], departures: ['clause', 'departure', 'rationale'],
  milestones: ['label', 'pct', 'amount'], requirements: ['ref', 'text', 'kind', 'compliance', 'sections'],
};
export const TABLES = ['compliance_matrix', 'pricing', 'team', 'milestones', 'departures', 'assumptions', 'risks'];
export const IMAGES = ['cto_logo', 'client_logo', 'photo'];
export const CONDITIONS = ['confidential', 'lot_1', 'lot_2', 'has_assumptions', 'has_departures', 'has_risks', 'has_case_studies', 'pricing_fixed', 'pricing_tm', 'pricing_capped', 'pricing_retainer', 'ai_disclosure'];

const TAG_RE = /\{\{\s*([^{}]*?)\s*\}\}/g;

export function classifyTag(inner) {
  const t = inner.trim();
  let m;
  if ((m = t.match(/^#if\s+([\w.]+)$/))) return { type: 'ifOpen', name: m[1] };
  if (t === '/if') return { type: 'ifClose', name: 'if' };
  if ((m = t.match(/^#([\w]+)$/))) return { type: 'open', name: m[1] };
  if ((m = t.match(/^\/([\w]+)$/))) return { type: 'close', name: m[1] };
  if ((m = t.match(/^section:([\w*-]+)$/))) return { type: 'section', name: m[1] };
  if ((m = t.match(/^table:([\w]+)$/))) return { type: 'table', name: m[1] };
  if ((m = t.match(/^image:([\w]+)$/))) return { type: 'image', name: m[1] };
  if ((m = t.match(/^([\w]+(?:\.[\w]+)*)$/))) return { type: 'field', name: m[1] };
  return { type: 'invalid', name: t };
}

const PARTS = (zip) => Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n)).sort((a, b) => (a === 'word/document.xml' ? -1 : b === 'word/document.xml' ? 1 : a.localeCompare(b)));

// ---------- Style discovery ----------

function readStyles(xml) {
  const root = parseXml(xml || '');
  const styles = findAll(root, 'w:style').map((s) => ({ id: attr(s, 'w:styleId'), type: attr(s, 'w:type'), name: (attr(kid(s, 'w:name') || { attrs: [] }, 'w:val') || '').toLowerCase(), node: s }));
  const byName = (type, ...names) => styles.find((s) => s.type === type && names.includes(s.name))?.id || null;
  const heading = [1, 2, 3, 4].map((n) => byName('paragraph', `heading ${n}`));
  const table = styles.find((s) => s.type === 'table' && /cto|proposal|brand/.test(s.name))?.id || byName('table', 'table grid') || styles.find((s) => s.type === 'table' && !/normal/.test(s.name))?.id || null;
  const numIdOf = (id) => { const s = styles.find((x) => x.id === id); const n = s && findAll(s.node, 'w:numId')[0]; return n ? attr(n, 'w:val') : null; };
  const out = {
    heading, table, normal: byName('paragraph', 'normal') || 'Normal',
    listBullet: byName('paragraph', 'list bullet'), listBullet2: byName('paragraph', 'list bullet 2'), listNumber: byName('paragraph', 'list number'), listParagraph: byName('paragraph', 'list paragraph'),
    caption: byName('paragraph', 'caption'), tableText: byName('paragraph', 'table text'), tableHeading: byName('paragraph', 'table heading'), quote: byName('paragraph', 'quote', 'intense quote'),
    toc1: byName('paragraph', 'toc 1'), toc2: byName('paragraph', 'toc 2'), strong: byName('character', 'strong'), emphasis: byName('character', 'emphasis'), hyperlink: byName('character', 'hyperlink'),
  };
  out.bulletNumId = numIdOf(out.listBullet);
  out.numberNumId = numIdOf(out.listNumber);
  out.levels = Object.fromEntries(heading.map((id, i) => [id, i + 1]).filter(([id]) => id));
  return out;
}

// ---------- Template inspection (CL-10, WD-05) ----------

export async function inspectTemplate(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const issues = [];
  const placeholders = [];
  if (!zip.file('word/document.xml')) return { placeholders, issues: [{ level: 'error', message: 'This is not a Word document (word/document.xml is missing).' }], styles: null };
  const styles = readStyles(await zip.file('word/styles.xml')?.async('string'));
  for (const part of PARTS(zip)) {
    const root = parseXml(await zip.file(part).async('string'));
    const stack = [];
    const paras = findAll(root, 'w:p');
    if (findAll(root, 'w:ins').length || findAll(root, 'w:del').length) issues.push({ level: 'warning', message: `${part}: contains tracked changes. They will be accepted and removed at generation.` });
    if (findAll(root, 'w:commentReference').length) issues.push({ level: 'warning', message: `${part}: contains comments. They will be removed at generation.` });
    if (findAll(root, 'w:vanish').length) issues.push({ level: 'warning', message: `${part}: contains hidden text. It will be removed at generation.` });
    for (const p of paras) {
      const text = textOfRuns(p);
      if (!text.includes('{')) continue;
      const opens = (text.match(/\{\{/g) || []).length, closes = (text.match(/\}\}/g) || []).length;
      if (opens !== closes) issues.push({ level: 'error', message: `${part}: malformed tag in “${text.slice(0, 80)}”. Every {{ needs a matching }}.` });
      const tags = [...text.matchAll(TAG_RE)];
      const alone = tags.length === 1 && text.trim() === tags[0][0];
      const inlineStack = [];
      for (const m of tags) {
        const t = classifyTag(m[1]);
        const block = stack.length ? stack[stack.length - 1] : null;
        placeholders.push({ tag: m[0], ...t, part, context: block?.name || null });
        if (t.type === 'invalid') { issues.push({ level: 'error', message: `${part}: “${m[0]}” is not valid tag syntax.` }); continue; }
        if (['section', 'table'].includes(t.type) && !alone) issues.push({ level: 'error', message: `${m[0]} must be on its own paragraph.` });
        if (t.type === 'table' && !TABLES.includes(t.name)) issues.push({ level: 'error', message: `Unknown table “${t.name}”. Use one of: ${TABLES.join(', ')}.` });
        if (t.type === 'image' && !IMAGES.includes(t.name)) issues.push({ level: 'error', message: `Unknown image “${t.name}”. Use one of: ${IMAGES.join(', ')}.` });
        if (t.type === 'image' && t.name === 'photo' && block?.name !== 'team') issues.push({ level: 'error', message: '{{image:photo}} can only be used inside a {{#team}} block.' });
        if (t.type === 'field') {
          const inBlock = [...stack].reverse().find((x) => x.type === 'open');
          const itemFields = inBlock ? BLOCKS[inBlock.name] || [] : [];
          if (!FIELDS[t.name] && !itemFields.includes(t.name) && !t.name.startsWith('flags.')) issues.push({ level: 'error', message: `Unknown field “${t.name}”${inBlock ? ` in the ${inBlock.name} block` : ''}.` });
        }
        if (t.type === 'open' && !BLOCKS[t.name]) issues.push({ level: 'error', message: `Unknown repeating block “${t.name}”. Use one of: ${Object.keys(BLOCKS).join(', ')}.` });
        if (t.type === 'ifOpen' && !CONDITIONS.includes(t.name) && !t.name.startsWith('flags.')) issues.push({ level: 'warning', message: `Condition “${t.name}” is not a standard flag; it will be read from the bid’s custom flags.` });
        if (t.type === 'open' || t.type === 'ifOpen') (alone ? stack : inlineStack).push(t);
        if (t.type === 'close' || t.type === 'ifClose') {
          const s = alone ? stack : inlineStack;
          const top = s.pop();
          const expected = t.type === 'ifClose' ? 'ifOpen' : 'open';
          if (!top || top.type !== expected || (t.type === 'close' && top.name !== t.name)) issues.push({ level: 'error', message: `${part}: “${m[0]}” does not match an open tag${top ? ` (open: {{${top.type === 'ifOpen' ? `#if ${top.name}` : `#${top.name}`}}})` : ''}.` });
        }
      }
      if (inlineStack.length) issues.push({ level: 'error', message: `${part}: “${text.slice(0, 60)}” opens a condition or block that is not closed in the same paragraph. Put block tags on their own paragraphs.` });
    }
    if (stack.length) issues.push({ level: 'error', message: `${part}: ${stack.map((t) => `{{${t.type === 'ifOpen' ? `#if ${t.name}` : `#${t.name}`}}}`).join(', ')} not closed.` });
  }
  if (!styles.heading[0] || !styles.heading[1]) issues.push({ level: 'warning', message: 'Heading 1 and Heading 2 styles are missing. Section headings will fall back to built-in names.' });
  if (!styles.listBullet) issues.push({ level: 'warning', message: 'The List Bullet style is missing. Bulleted lists will use direct numbering.' });
  if (!styles.table) issues.push({ level: 'warning', message: 'No table style found. Tables will have no brand styling.' });
  if (!placeholders.some((p) => p.type === 'section')) issues.push({ level: 'warning', message: 'The template has no {{section:…}} tag, so no response content will be merged.' });
  const summary = {};
  for (const p of placeholders) summary[p.type] = (summary[p.type] || 0) + 1;
  return { placeholders, issues, styles: { heading: styles.heading, listBullet: styles.listBullet, listNumber: styles.listNumber, table: styles.table, caption: styles.caption, toc: styles.toc1 }, summary };
}

// ---------- Merge ----------

function setRunText(run, text) {
  const idx = run.children.findIndex((c) => c.name === 'w:t');
  run.children = run.children.filter((c) => c.name !== 'w:t');
  const t = { name: 'w:t', attrs: [['xml:space', 'preserve']], children: [{ text: esc(text) }] };
  run.children.splice(idx < 0 ? run.children.length : Math.min(idx, run.children.length), 0, t);
}
const runText = (r) => r.children.filter((c) => c.name === 'w:t').map((t) => xmlUnescape(t.children.map((x) => x.text || '').join(''))).join('');
const hasOpen = (s) => s.lastIndexOf('{{') > s.lastIndexOf('}}') || /\{$/.test(s);

// Tags split across runs (Word does this with spell-check and revision markers) are joined into one run.
function normaliseParagraph(p) {
  const runs = p.children.filter((c) => c.name === 'w:r' && c.children.some((x) => x.name === 'w:t'));
  for (let i = 0; i < runs.length; i++) {
    let acc = runText(runs[i]);
    if (!hasOpen(acc)) continue;
    let j = i + 1;
    while (j < runs.length && hasOpen(acc)) { acc += runText(runs[j]); j++; }
    setRunText(runs[i], acc);
    for (let k = i + 1; k < j; k++) {
      runs[k].children = runs[k].children.filter((c) => c.name !== 'w:t');
      if (!runs[k].children.some((c) => c.name !== 'w:rPr')) p.children = p.children.filter((c) => c !== runs[k]);
    }
    i = j - 1;
  }
}

function cleanPart(root, report) {
  walkXml(root, (n) => {
    if (!n.children) return;
    const next = [];
    for (const c of n.children) {
      if (c.name === 'w:del' || c.name === 'w:moveFrom') { report.trackedRemoved++; continue; }
      if (c.name === 'w:ins' || c.name === 'w:moveTo') { report.trackedRemoved++; next.push(...c.children); continue; }
      if (['w:commentRangeStart', 'w:commentRangeEnd', 'w:proofErr', 'w:rPrChange', 'w:pPrChange'].includes(c.name)) { if (c.name.startsWith('w:comment')) report.commentsRemoved++; continue; }
      if (c.name === 'w:r' && c.children.some((x) => x.name === 'w:commentReference')) { report.commentsRemoved++; continue; }
      if (c.name === 'w:r' && kid(c, 'w:rPr') && kid(kid(c, 'w:rPr'), 'w:vanish')) { report.hiddenRemoved++; continue; }
      next.push(c);
    }
    n.children = next;
  });
}

const clone = (n) => JSON.parse(JSON.stringify(n));

function lookup(ctx, name) {
  for (let c = ctx; c; c = c.parent) {
    if (c.scope && Object.prototype.hasOwnProperty.call(c.scope, name)) return c.scope[name];
  }
  const d = ctx.data;
  if (name in (d.fields || {})) return d.fields[name];
  if (name.startsWith('flags.')) return d.flags?.[name.slice(6)];
  return undefined;
}

function truthy(ctx, name) {
  const key = name.startsWith('flags.') ? name.slice(6) : name;
  const v = ctx.data.flags?.[key] ?? lookup(ctx, name);
  return Array.isArray(v) ? v.length > 0 : Boolean(v);
}

function blockTagOf(p) {
  const text = textOfRuns(p).trim();
  const m = text.match(/^\{\{\s*([^{}]*?)\s*\}\}$/);
  if (!m) return null;
  const t = classifyTag(m[1]);
  return ['open', 'close', 'ifOpen', 'ifClose'].includes(t.type) ? t : null;
}

function findMatch(children, i, tag) {
  let depth = 0;
  for (let j = i + 1; j < children.length; j++) {
    const c = children[j];
    if (c.name !== 'w:p') continue;
    const t = blockTagOf(c);
    if (!t) continue;
    if (tag.type === 'ifOpen') { if (t.type === 'ifOpen') depth++; if (t.type === 'ifClose') { if (!depth) return j; depth--; } } else { if (t.type === 'open' && t.name === tag.name) depth++; if (t.type === 'close' && t.name === tag.name) { if (!depth) return j; depth--; } }
  }
  return -1;
}

function listFor(ctx, name) {
  const v = lookup(ctx, name) ?? ctx.data.lists?.[name];
  return Array.isArray(v) ? v : [];
}

function formatValue(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'number') return v.toLocaleString('en-AU');
  return String(v);
}

function replaceInlineTags(p, ctx, E) {
  const runs = p.children.filter((c) => c.name === 'w:r' && c.children.some((x) => x.name === 'w:t'));
  // Inline conditions within a single run.
  for (const r of runs) {
    let t = runText(r);
    if (!t.includes('{{')) continue;
    let guard = 20;
    while (/\{\{\s*#if\s+[\w.]+\s*\}\}[\s\S]*?\{\{\s*\/if\s*\}\}/.test(t) && guard-- > 0) {
      t = t.replace(/\{\{\s*#if\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\s*\/if\s*\}\}/, (m, name, inner) => (truthy(ctx, name) ? inner : ''));
    }
    t = t.replace(TAG_RE, (m, inner) => {
      const tag = classifyTag(inner);
      if (tag.type !== 'field') return m;
      const v = lookup(ctx, tag.name);
      if (v === undefined) { E.report.unresolvedSet.add(m); return m; }
      const s = formatValue(v);
      if (!s) E.report.emptyFields.add(tag.name);
      return s;
    });
    setRunText(r, t);
  }
  // Images: split the run around {{image:x}}.
  for (const r of [...p.children.filter((c) => c.name === 'w:r')]) {
    const t = runText(r);
    const m = t.match(/\{\{\s*image:(\w+)\s*\}\}/);
    if (!m) continue;
    const img = m[1] === 'photo' ? lookup(ctx, 'photo') : E.data.images?.[m[1]];
    const idx = p.children.indexOf(r);
    const before = t.slice(0, m.index), after = t.slice(m.index + m[0].length);
    const out = [];
    const rPrNode = kid(r, 'w:rPr');
    const mk = (s) => ({ name: 'w:r', attrs: [], children: [...(rPrNode ? [clone(rPrNode)] : []), { name: 'w:t', attrs: [['xml:space', 'preserve']], children: [{ text: esc(s) }] }] });
    if (before) out.push(mk(before));
    if (img?.bytes) out.push(...fragment(E.imageRun(img)));
    else if (m[1] !== 'client_logo') E.report.emptyFields.add(`image:${m[1]}`);
    if (after) out.push(mk(after));
    p.children.splice(idx, 1, ...out);
  }
}

function paragraphXml(E, style, runsXml, extra = {}) {
  const pp = [];
  if (style) pp.push(`<w:pStyle w:val="${esc(style)}"/>`);
  if (extra.keepNext) pp.push('<w:keepNext/>');
  if (extra.numId) pp.push(`<w:numPr><w:ilvl w:val="${extra.ilvl || 0}"/><w:numId w:val="${extra.numId}"/></w:numPr>`);
  if (extra.ind) pp.push(`<w:ind w:left="${extra.ind}"/>`);
  if (extra.jc) pp.push(`<w:jc w:val="${extra.jc}"/>`);
  const bm = extra.bookmark ? `<w:bookmarkStart w:id="${extra.bookmark.id}" w:name="${extra.bookmark.name}"/>` : '';
  const bme = extra.bookmark ? `<w:bookmarkEnd w:id="${extra.bookmark.id}"/>` : '';
  return `<w:p>${pp.length ? `<w:pPr>${pp.join('')}</w:pPr>` : ''}${bm}${runsXml}${bme}</w:p>`;
}

function runsFromInline(E, node) {
  const out = [];
  for (const r of inlineRuns(node)) {
    if (r.cite) continue;
    const m = r.marks;
    const rp = [];
    if (m.href && E.styles.hyperlink) rp.push(`<w:rStyle w:val="${E.styles.hyperlink}"/>`);
    else if (m.bold && E.styles.strong && !m.italic) rp.push(`<w:rStyle w:val="${E.styles.strong}"/>`);
    else if (m.italic && E.styles.emphasis && !m.bold) rp.push(`<w:rStyle w:val="${E.styles.emphasis}"/>`);
    else { if (m.bold) rp.push('<w:b/><w:bCs/>'); if (m.italic) rp.push('<w:i/><w:iCs/>'); }
    if (m.underline && !m.href) rp.push('<w:u w:val="single"/>');
    const rPr = rp.length ? `<w:rPr>${rp.join('')}</w:rPr>` : '';
    const parts = r.text.split('\n');
    const run = `<w:r>${rPr}${parts.map((t, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(t)}</w:t>`).join('')}</w:r>`;
    if (m.href) {
      const rid = E.addRel(REL.hyperlink, m.href, true);
      out.push(`<w:hyperlink r:id="${rid}" w:history="1">${run}</w:hyperlink>`);
    } else out.push(run);
  }
  // Merge adjacent runs with identical properties is left to Word; empty paragraphs keep one empty run.
  return out.join('');
}

function tableXml(E, { columns, rows, caption, headerRow = true }) {
  const total = columns.reduce((a, c) => a + c.width, 0);
  const cellP = (c, i, isHead) => {
    const cellv = typeof c === 'object' && c !== null && !Array.isArray(c) ? c : { text: c };
    const jc = cellv.align || columns[i].align;
    // Header cells use the template's Table Heading style; templates without one get white bold text on the table style's header fill.
    const rPr = isHead ? (E.styles.tableHeading ? '' : '<w:rPr><w:b/><w:bCs/><w:color w:val="FFFFFF"/></w:rPr>') : cellv.bold ? '<w:rPr><w:b/><w:bCs/></w:rPr>' : '';
    const lines = String(cellv.text ?? '').split('\n');
    const pstyle = isHead ? E.styles.tableHeading || E.styles.tableText || null : E.styles.tableText || null;
    return lines.map((line) => paragraphXml(E, pstyle, `<w:r>${rPr}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`, { jc: jc === 'right' ? 'right' : undefined })).join('');
  };
  const tr = (cells, isHead) => `<w:tr><w:trPr><w:cantSplit/>${isHead ? '<w:tblHeader/>' : ''}</w:trPr>${cells.map((c, i) => `<w:tc><w:tcPr><w:tcW w:w="${columns[i].width}" w:type="dxa"/></w:tcPr>${cellP(c, i, isHead)}</w:tc>`).join('')}</w:tr>`;
  const tbl = `<w:tbl><w:tblPr>${E.styles.table ? `<w:tblStyle w:val="${E.styles.table}"/>` : ''}<w:tblW w:w="${total}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>${caption ? `<w:tblCaption w:val="${esc(caption)}"/>` : ''}</w:tblPr><w:tblGrid>${columns.map((c) => `<w:gridCol w:w="${c.width}"/>`).join('')}</w:tblGrid>${headerRow ? tr(columns.map((c) => c.label), true) : ''}${rows.map((r) => tr(r, false)).join('')}</w:tbl>`;
  E.report.tables.push({ caption, header: headerRow });
  return tbl;
}

function captionXml(E, caption) {
  E.tableNo++;
  return paragraphXml(E, E.styles.caption || null, `<w:r><w:t xml:space="preserve">Table </w:t></w:r><w:fldSimple w:instr=" SEQ Table \\* ARABIC "><w:r><w:t>${E.tableNo}</w:t></w:r></w:fldSimple><w:r><w:t xml:space="preserve">: ${esc(caption)}</w:t></w:r>`, { keepNext: true });
}

function headingXml(E, level, text) {
  const lvl = Math.max(1, Math.min(4, level));
  const style = E.styles.heading[lvl - 1] || `Heading${lvl}`;
  const id = E.bookmarkId++;
  const name = `_Toc${String(100000 + id)}`;
  E.headings.push({ level: lvl, text, bookmark: name, words: E.words });
  return paragraphXml(E, style, `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`, { bookmark: { id, name } });
}

// Rich text (editor HTML) to WordprocessingML using only the template's named styles.
function htmlToXml(E, html, baseLevel) {
  const root = parseHtml(html);
  const out = [];
  // Headings are relative to the section heading: the highest heading used in the section sits one level below it.
  const used = root.children.filter((c) => /^h[1-6]$/.test(c.name || '')).map((c) => Number(c.name[1]));
  const top = used.length ? Math.min(...used) : 2;
  const list = (node, ordered, ilvl) => {
    const numId = ordered ? E.newNumbered() : E.styles.bulletNumId || E.fallbackBullet();
    for (const li of node.children.filter((c) => c.name === 'li')) {
      let first = true;
      for (const c of li.children) {
        if (c.name === 'ul' || c.name === 'ol') { list(c, c.name === 'ol', ilvl + 1); continue; }
        const inline = c.name === 'p' ? c : { children: [c] };
        const text = textOf(inline);
        if (!text.trim() && !first) continue;
        E.words += text.split(/\s+/).filter(Boolean).length;
        const style = ordered ? E.styles.listNumber || E.styles.listParagraph : (ilvl > 0 && E.styles.listBullet2) || E.styles.listBullet || E.styles.listParagraph;
        out.push(first ? paragraphXml(E, style, runsFromInline(E, inline), { numId, ilvl: Math.min(ilvl, 2) }) : paragraphXml(E, style, runsFromInline(E, inline), { ind: 357 * (ilvl + 1) }));
        first = false;
      }
    }
  };
  for (const n of root.children) {
    if (n.text !== undefined) { if (n.text.trim()) out.push(paragraphXml(E, null, `<w:r><w:t xml:space="preserve">${esc(n.text)}</w:t></w:r>`)); continue; }
    const name = n.name;
    if (/^h[1-6]$/.test(name)) { out.push(headingXml(E, baseLevel + 1 + (Number(name[1]) - top), textOf(n).trim())); continue; }
    if (name === 'p') { const t = textOf(n); E.words += t.split(/\s+/).filter(Boolean).length; if (t.trim() || n.children.some((c) => c.name === 'img')) out.push(paragraphXml(E, null, runsFromInline(E, n))); continue; }
    if (name === 'ul' || name === 'ol') { list(n, name === 'ol', 0); continue; }
    if (name === 'blockquote') { for (const c of n.children.filter((x) => x.name === 'p')) out.push(paragraphXml(E, E.styles.quote, runsFromInline(E, c))); continue; }
    if (name === 'table') {
      const rows = [];
      walkRows(n, rows);
      if (!rows.length) continue;
      const header = rows[0].every((c) => c.th);
      const ncols = Math.max(...rows.map((r) => r.length));
      const width = Math.floor(E.textWidth / ncols);
      const columns = Array.from({ length: ncols }, (_, i) => ({ label: header ? rows[0][i]?.text || '' : '', width }));
      const body = (header ? rows.slice(1) : rows).map((r) => Array.from({ length: ncols }, (_, i) => r[i]?.text || ''));
      for (const r of body) E.words += r.join(' ').split(/\s+/).length;
      out.push(tableXml(E, { columns, rows: body, headerRow: header }));
      out.push(paragraphXml(E, null, ''));
      continue;
    }
    if (name === 'hr') continue;
  }
  return out.join('');
}

function walkRows(node, rows) {
  for (const c of node.children || []) {
    if (c.name === 'tr') rows.push(c.children.filter((x) => x.name === 'td' || x.name === 'th').map((x) => ({ text: textOf(x).trim(), th: x.name === 'th' })));
    else if (c.children) walkRows(c, rows);
  }
}

function sectionXml(E, key) {
  const secs = key === '*' ? E.data.sections.filter((s) => !E.placedSections.has(s.id)) : E.data.sections.filter((s) => s.key === key);
  if (!secs.length) { E.report.emptyFields.add(`section:${key}`); return ''; }
  const out = [];
  for (const s of secs) {
    E.placedSections.add(s.id);
    const startWords = E.words;
    out.push(headingXml(E, s.level || 1, s.title));
    out.push(htmlToXml(E, s.html, s.level || 1));
    E.sectionWords += E.words - startWords;
  }
  return out.join('');
}

function tableTagXml(E, name) {
  const t = E.data.tables?.[name];
  if (!t) { E.report.unresolvedSet.add(`{{table:${name}}}`); return ''; }
  if (!t.rows.length) return paragraphXml(E, null, `<w:r><w:t xml:space="preserve">${esc(t.empty || 'None.')}</w:t></w:r>`);
  for (const r of t.rows) E.words += r.map((c) => (typeof c === 'object' ? c.text : c)).join(' ').split(/\s+/).length * 0.6;
  return captionXml(E, t.caption) + tableXml(E, t) + paragraphXml(E, null, '');
}

function processParagraph(E, p, ctx) {
  const text = textOfRuns(p).trim();
  const m = text.match(/^\{\{\s*([^{}]*?)\s*\}\}$/);
  if (m) {
    const t = classifyTag(m[1]);
    if (t.type === 'section') return fragment(sectionXml(E, t.name));
    if (t.type === 'table') return fragment(tableTagXml(E, t.name));
  }
  if (text.includes('{{')) replaceInlineTags(p, ctx, E);
  // Count body words for page estimates.
  E.words += textOfRuns(p).split(/\s+/).filter(Boolean).length;
  if (findAll(p, 'w:br').some((b) => attr(b, 'w:type') === 'page') || findAll(p, 'w:pageBreakBefore').length) E.pageBreaks.push(E.words);
  const style = attr(findAll(p, 'w:pStyle')[0] || { attrs: [] }, 'w:val');
  if (style && E.styles.levels[style]) {
    const id = E.bookmarkId++;
    const name = `_Toc${String(100000 + id)}`;
    const t = textOfRuns(p).trim();
    if (t) {
      E.headings.push({ level: E.styles.levels[style], text: t, bookmark: name, words: E.words });
      const pPrIdx = p.children.findIndex((c) => c.name === 'w:pPr');
      p.children.splice(pPrIdx + 1, 0, { name: 'w:bookmarkStart', attrs: [['w:id', String(id)], ['w:name', name]], children: [] });
      p.children.push({ name: 'w:bookmarkEnd', attrs: [['w:id', String(id)]], children: [] });
    }
  }
  return [p];
}

function processTable(E, tbl, ctx) {
  const out = [];
  for (const c of tbl.children) {
    if (c.name !== 'w:tr') { out.push(c); continue; }
    const cells = kids(c, 'w:tc');
    const rowText = cells.map((tc) => textOfRuns(tc)).join('');
    const loop = rowText.match(/^\s*\{\{\s*#(\w+)\s*\}\}/);
    if (loop && new RegExp(`\\{\\{\\s*/${loop[1]}\\s*\\}\\}\\s*$`).test(rowText)) {
      // Row-level repeating block: one row per item.
      for (const item of listFor(ctx, loop[1])) {
        const row = clone(c);
        for (const p of findAll(row, 'w:p')) {
          normaliseParagraph(p);
          for (const r of p.children.filter((x) => x.name === 'w:r')) {
            const t = runText(r);
            if (t.includes('{{')) setRunText(r, t.replace(new RegExp(`\\{\\{\\s*[#/]${loop[1]}\\s*\\}\\}`, 'g'), ''));
          }
        }
        for (const tc of kids(row, 'w:tc')) processContainer(E, tc, { ...ctx, scope: item, parent: ctx });
        out.push(row);
      }
      continue;
    }
    for (const tc of cells) processContainer(E, tc, ctx);
    out.push(c);
  }
  tbl.children = out;
}

function processContainer(E, node, ctx) {
  for (const p of node.children.filter((c) => c.name === 'w:p')) normaliseParagraph(p);
  const children = node.children;
  const out = [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    const tag = c.name === 'w:p' ? blockTagOf(c) : null;
    if (tag && (tag.type === 'open' || tag.type === 'ifOpen')) {
      const j = findMatch(children, i, tag);
      if (j < 0) { E.report.unresolvedSet.add(`{{${tag.type === 'ifOpen' ? `#if ${tag.name}` : `#${tag.name}`}}} (not closed)`); continue; }
      const inner = children.slice(i + 1, j);
      if (tag.type === 'ifOpen') {
        if (truthy(ctx, tag.name)) { const w = { children: clone(inner) }; processContainer(E, w, ctx); out.push(...w.children); }
      } else {
        for (const item of listFor(ctx, tag.name)) { const w = { children: clone(inner) }; processContainer(E, w, { ...ctx, scope: item, parent: ctx }); out.push(...w.children); }
      }
      i = j;
      continue;
    }
    if (tag) continue; // stray close tag
    if (c.name === 'w:p') { out.push(...processParagraph(E, c, ctx)); continue; }
    if (c.name === 'w:tbl') { processTable(E, c, ctx); out.push(c); continue; }
    if (c.name === 'w:sdt') { const content = kid(c, 'w:sdtContent'); if (content) processContainer(E, content, ctx); out.push(c); continue; }
    out.push(c);
  }
  node.children = out;
  // Text boxes (cover pages) hold their own paragraphs.
  for (const tx of findAll({ children: out }, 'w:txbxContent')) processContainer(E, tx, ctx);
}

function estimatePage(E, words) {
  const breaks = E.pageBreaks.filter((w) => w <= words).length;
  return 1 + breaks + Math.floor(Math.max(0, words - (E.pageBreaks.filter((w) => w <= words).pop() || 0)) / 480);
}

function rebuildToc(E, body) {
  const paras = findAll(body, 'w:p');
  const tocP = paras.find((p) => findAll(p, 'w:instrText').some((t) => /\bTOC\b/.test(t.children.map((x) => x.text || '').join(''))));
  if (!tocP) return;
  const instr = findAll(tocP, 'w:instrText').map((t) => xmlUnescape(t.children.map((x) => x.text || '').join(''))).join('');
  const levels = Number((instr.match(/\\o\s+"1-(\d)"/) || [])[1] || 3);
  const entries = E.headings.filter((h) => h.level <= levels && h.text && !/^contents$/i.test(h.text));
  const style = (l) => (l === 1 ? E.styles.toc1 : E.styles.toc2) || null;
  const tabPos = E.textWidth - 10;
  const entry = (h, i) => {
    const page = estimatePage(E, h.words);
    const inner = `<w:hyperlink w:anchor="${h.bookmark}" w:history="1"><w:r><w:t xml:space="preserve">${esc(h.text)}</w:t></w:r><w:r><w:tab/></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGEREF ${h.bookmark} \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${page}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink>`;
    const begin = i === 0 ? `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${esc(instr.trim())} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>` : '';
    const end = i === entries.length - 1 ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : '';
    return `<w:p><w:pPr>${style(h.level) ? `<w:pStyle w:val="${style(h.level)}"/>` : ''}<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${tabPos}"/></w:tabs></w:pPr>${begin}${inner}${end}</w:p>`;
  };
  if (!entries.length) return;
  const nodes = fragment(entries.map(entry).join(''));
  const parentOf = (n, target) => { for (const c of n.children || []) { if (c === target) return n; const r = c.children && parentOf(c, target); if (r) return r; } return null; };
  const parent = parentOf(body, tocP);
  parent.children.splice(parent.children.indexOf(tocP), 1, ...nodes);
}

async function ensureContentTypes(zip, exts) {
  let ct = await zip.file('[Content_Types].xml').async('string');
  for (const [ext, type] of exts) if (!new RegExp(`Extension="${ext}"`, 'i').test(ct)) ct = ct.replace('<Default ', `<Default Extension="${ext}" ContentType="${type}"/><Default `);
  zip.file('[Content_Types].xml', ct);
}

export async function mergeTemplate(bytes, data, { now = new Date().toISOString(), title = '', personalNames = [], otherClientNames = [] } = {}) {
  const zip = await JSZip.loadAsync(bytes);
  const report = { unresolvedSet: new Set(), emptyFields: new Set(), tables: [], images: [], headings: [], trackedRemoved: 0, commentsRemoved: 0, hiddenRemoved: 0, personalProperties: [], otherClientNames: [] };
  const styles = readStyles(await zip.file('word/styles.xml')?.async('string'));
  const relsPath = 'word/_rels/document.xml.rels';
  const rels = parseXml(await zip.file(relsPath)?.async('string') || '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  const relRoot = findAll(rels, 'Relationships')[0];
  let relN = 900;
  let numbering = zip.file('word/numbering.xml') ? parseXml(await zip.file('word/numbering.xml').async('string')) : null;
  const numRoot = () => {
    if (!numbering) {
      numbering = parseXml('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:numbering>');
      relRoot.children.push({ name: 'Relationship', attrs: [['Id', 'rIdNumberingGen'], ['Type', REL.numbering], ['Target', 'numbering.xml']], children: [] });
    }
    return findAll(numbering, 'w:numbering')[0];
  };
  const E = {
    data, styles, report, words: 0, sectionWords: 0, pageBreaks: [], headings: report.headings, bookmarkId: 1000, tableNo: 0, imageNo: 0, placedSections: new Set(), textWidth: 9638,
    addRel(type, target, external) {
      const id = `rIdGen${++relN}`;
      relRoot.children.push({ name: 'Relationship', attrs: [['Id', id], ['Type', type], ['Target', esc(target)], ...(external ? [['TargetMode', 'External']] : [])], children: [] });
      return id;
    },
    imageRun(img) {
      const size = pngSize(img.bytes);
      const file = `gen_image${++E.imageNo}.${size.type === 'jpeg' ? 'jpeg' : 'png'}`;
      zip.file(`word/media/${file}`, img.bytes);
      const rId = E.addRel(REL.image, `media/${file}`);
      const w = img.widthPx || Math.min(size.width, 600);
      const h = Math.round(w * (size.height / size.width));
      report.images.push({ name: file, alt: img.alt || '' });
      return drawing({ rId, id: 5000 + E.imageNo, name: file, alt: img.alt || '', widthPx: w, heightPx: h });
    },
    newNumbered() {
      const root = numRoot();
      let abs = null;
      if (styles.numberNumId) { const num = findAll(root, 'w:num').find((n) => attr(n, 'w:numId') === styles.numberNumId); abs = num && attr(kid(num, 'w:abstractNumId'), 'w:val'); }
      if (!abs) abs = E.ensureAbstract('decimal');
      const ids = findAll(root, 'w:num').map((n) => Number(attr(n, 'w:numId')) || 0);
      const id = String(Math.max(0, ...ids) + 1);
      root.children.push(...fragment(`<w:num w:numId="${id}"><w:abstractNumId w:val="${abs}"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`));
      return id;
    },
    fallbackBullet() {
      if (E._bullet) return E._bullet;
      const root = numRoot();
      const abs = E.ensureAbstract('bullet');
      const ids = findAll(root, 'w:num').map((n) => Number(attr(n, 'w:numId')) || 0);
      E._bullet = String(Math.max(0, ...ids) + 1);
      root.children.push(...fragment(`<w:num w:numId="${E._bullet}"><w:abstractNumId w:val="${abs}"/></w:num>`));
      return E._bullet;
    },
    ensureAbstract(kind) {
      const root = numRoot();
      const absIds = findAll(root, 'w:abstractNum').map((n) => Number(attr(n, 'w:abstractNumId')) || 0);
      const id = String(Math.max(90, ...absIds) + 1);
      const lvl = kind === 'bullet' ? '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="357" w:hanging="357"/></w:pPr></w:lvl>' : '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="357" w:hanging="357"/></w:pPr></w:lvl>';
      const node = fragment(`<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="singleLevel"/>${lvl}</w:abstractNum>`)[0];
      const firstNum = root.children.findIndex((c) => c.name === 'w:num');
      root.children.splice(firstNum < 0 ? root.children.length : firstNum, 0, node);
      return id;
    },
  };

  const rootCtx = { data, scope: null, parent: null };
  const docXml = await zip.file('word/document.xml').async('string');
  const doc = parseXml(docXml);
  const body = findAll(doc, 'w:body')[0];
  const pg = findAll(body, 'w:pgSz')[0], mar = findAll(body, 'w:pgMar')[0];
  if (pg && mar) E.textWidth = Number(attr(pg, 'w:w')) - Number(attr(mar, 'w:left')) - Number(attr(mar, 'w:right'));
  cleanPart(doc, report);
  processContainer(E, body, rootCtx);
  rebuildToc(E, body);
  zip.file('word/document.xml', serializeXml(doc));

  for (const part of PARTS(zip).filter((p) => p !== 'word/document.xml')) {
    const root = parseXml(await zip.file(part).async('string'));
    cleanPart(root, report);
    const container = root.children.find((c) => c.name === 'w:hdr' || c.name === 'w:ftr');
    if (container) processContainer({ ...E, words: 0, pageBreaks: [], headings: [], report }, container, rootCtx);
    zip.file(part, serializeXml(root));
  }

  // Remove comments parts, custom properties and personal data; set clean document properties.
  for (const name of Object.keys(zip.files)) if (/^word\/comments(Extended|Ids|Extensible)?\.xml$/.test(name) || name === 'docProps/custom.xml') zip.remove(name);
  relRoot.children = relRoot.children.filter((r) => !/comments/.test(attr(r, 'Type') || ''));
  zip.file(relsPath, serializeXml(rels));
  const rootRels = await zip.file('_rels/.rels')?.async('string');
  if (rootRels) zip.file('_rels/.rels', rootRels.replace(/<Relationship[^>]*custom-properties[^>]*\/>/g, ''));
  let ct = await zip.file('[Content_Types].xml').async('string');
  ct = ct.replace(/<Override[^>]*PartName="\/word\/comments[^"]*"[^>]*\/>/g, '').replace(/<Override[^>]*PartName="\/docProps\/custom.xml"[^>]*\/>/g, '');
  if (numbering && !/numbering\.xml/.test(ct)) ct = ct.replace('</Types>', '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>');
  zip.file('[Content_Types].xml', ct);
  if (numbering) zip.file('word/numbering.xml', serializeXml(numbering));
  const oldCore = await zip.file('docProps/core.xml')?.async('string') || '';
  for (const n of personalNames) if (n && oldCore.includes(n)) report.personalProperties.push(`template author “${n}” (removed)`);
  zip.file('docProps/core.xml', coreXml({ title, subject: 'Proposal', now }));
  zip.file('docProps/app.xml', appXml());
  if (!/docProps\/core\.xml/.test(ct)) zip.file('[Content_Types].xml', ct.replace('</Types>', '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'));
  let settings = await zip.file('word/settings.xml')?.async('string');
  if (settings && !/w:updateFields/.test(settings)) settings = settings.replace(/(<w:compat>|<w:compat\/>)/, '<w:updateFields w:val="true"/>$1');
  if (settings) zip.file('word/settings.xml', settings);
  await ensureContentTypes(zip, [['png', 'image/png'], ['jpeg', 'image/jpeg']]);

  // Final scan for leftovers and other clients' names.
  let allText = '';
  for (const part of PARTS(zip)) allText += `${textOfRuns(parseXml(await zip.file(part).async('string')))}\n`;
  for (const m of allText.match(/\{\{[^{}]*\}\}/g) || []) report.unresolvedSet.add(m);
  for (const n of otherClientNames) if (n.name && new RegExp(`\\b${n.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(allText) && !n.allowed) report.otherClientNames.push(n.name);
  const totalWords = E.words;
  const pages = estimatePage(E, totalWords) + 0;
  const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return {
    bytes: out,
    report: {
      unresolved: [...report.unresolvedSet], emptyFields: [...report.emptyFields], tables: report.tables, images: report.images, headings: report.headings.map((h) => ({ level: h.level, text: h.text })),
      trackedChanges: false, comments: false, hiddenText: false, cleaned: { trackedChanges: report.trackedRemoved, comments: report.commentsRemoved, hiddenText: report.hiddenRemoved },
      personalProperties: [], personalRemoved: report.personalProperties, otherClientNames: report.otherClientNames,
      words: Math.round(E.sectionWords), pages, bodyPages: Math.max(1, Math.ceil(E.sectionWords / 480)), pagesEstimated: true,
    },
  };
}
