// WordprocessingML builders. Element order follows the OOXML schema so Word opens files without repair.
import { xmlEscape as esc } from './xml.js';

export const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
};
export const DOC_NS = `xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}" xmlns:a="${NS.a}" xmlns:pic="${NS.pic}"`;

// Run properties in schema order.
export function rPr({ style, bold, italic, underline, color, size, font, vanish } = {}) {
  const p = [];
  if (style) p.push(`<w:rStyle w:val="${esc(style)}"/>`);
  if (font) p.push(`<w:rFonts w:ascii="${esc(font)}" w:hAnsi="${esc(font)}" w:cs="${esc(font)}"/>`);
  if (bold) p.push('<w:b/><w:bCs/>');
  if (italic) p.push('<w:i/><w:iCs/>');
  if (vanish) p.push('<w:vanish/>');
  if (color) p.push(`<w:color w:val="${esc(color)}"/>`);
  if (size) p.push(`<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`);
  if (underline) p.push('<w:u w:val="single"/>');
  return p.length ? `<w:rPr>${p.join('')}</w:rPr>` : '';
}

export function textRun(text, props = {}) {
  const parts = String(text ?? '').split('\n');
  return `<w:r>${rPr(props)}${parts.map((t, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(t)}</w:t>`).join('')}</w:r>`;
}

export const tabRun = (props = {}) => `<w:r>${rPr(props)}<w:tab/></w:r>`;
export const breakRun = (type) => `<w:r><w:br${type ? ` w:type="${type}"` : ''}/></w:r>`;

// Paragraph properties in schema order.
export function pPr({ style, keepNext, pageBreakBefore, numId, ilvl = 0, tabs, spacing, jc, outlineLvl } = {}) {
  const p = [];
  if (style) p.push(`<w:pStyle w:val="${esc(style)}"/>`);
  if (keepNext) p.push('<w:keepNext/>');
  if (pageBreakBefore) p.push('<w:pageBreakBefore/>');
  if (numId) p.push(`<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`);
  if (tabs) p.push(`<w:tabs>${tabs.map((t) => `<w:tab w:val="${t.val || 'left'}"${t.leader ? ` w:leader="${t.leader}"` : ''} w:pos="${t.pos}"/>`).join('')}</w:tabs>`);
  if (spacing) p.push(`<w:spacing${spacing.before != null ? ` w:before="${spacing.before}"` : ''}${spacing.after != null ? ` w:after="${spacing.after}"` : ''}/>`);
  if (jc) p.push(`<w:jc w:val="${jc}"/>`);
  if (outlineLvl != null) p.push(`<w:outlineLvl w:val="${outlineLvl}"/>`);
  return p.length ? `<w:pPr>${p.join('')}</w:pPr>` : '';
}

export function para(content, props = {}) {
  const runs = typeof content === 'string' ? content : (content || []).join('');
  const bm = props.bookmark ? `<w:bookmarkStart w:id="${props.bookmark.id}" w:name="${esc(props.bookmark.name)}"/>` : '';
  const bmEnd = props.bookmark ? `<w:bookmarkEnd w:id="${props.bookmark.id}"/>` : '';
  return `<w:p>${pPr(props)}${bm}${runs}${bmEnd}</w:p>`;
}

export const simpleField = (instr, placeholder = '1', props = {}) => `<w:fldSimple w:instr=" ${esc(instr)} "><w:r>${rPr(props)}<w:t>${esc(placeholder)}</w:t></w:r></w:fldSimple>`;

export function complexField(instr, resultRuns, props = {}) {
  return `<w:r>${rPr(props)}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rPr(props)}<w:instrText xml:space="preserve"> ${esc(instr)} </w:instrText></w:r><w:r>${rPr(props)}<w:fldChar w:fldCharType="separate"/></w:r>${resultRuns}<w:r>${rPr(props)}<w:fldChar w:fldCharType="end"/></w:r>`;
}

// Table with a repeating header row; widths in twips.
export function table({ style, widths, header, rows, caption, align = [], headerRepeat = true, cellStyle }) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (content, w, i, isHeader) => {
    const paras = (Array.isArray(content) ? content : [content]).map((c) => (String(c).startsWith('<w:p>') ? c : para(textRun(c, isHeader ? {} : {}), { style: cellStyle, jc: align[i] === 'right' ? 'right' : undefined }))).join('');
    return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${paras || para('', { style: cellStyle })}</w:tc>`;
  };
  const tr = (cells, isHeader) => `<w:tr>${isHeader && headerRepeat ? '<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${cells.map((c, i) => cell(c, widths[i], i, isHeader)).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr>${style ? `<w:tblStyle w:val="${esc(style)}"/>` : ''}<w:tblW w:w="${total}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>${caption ? `<w:tblCaption w:val="${esc(caption)}"/>` : ''}</w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${header ? tr(header, true) : ''}${rows.map((r) => tr(r, false)).join('')}</w:tbl>`;
}

const EMU_PER_PX = 9525;
export function drawing({ rId, id, name, alt, widthPx, heightPx }) {
  const cx = Math.round(widthPx * EMU_PER_PX), cy = Math.round(heightPx * EMU_PER_PX);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${esc(name)}" descr="${esc(alt || '')}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(name)}" descr="${esc(alt || '')}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

export function pngSize(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0x89 && b[1] === 0x50) return { width: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], height: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23], type: 'png' };
  // JPEG: scan for SOF0/SOF2.
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker >= 0xc0 && marker <= 0xc3) return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8], type: 'jpeg' };
    i += 2 + len;
  }
  return { width: 200, height: 200, type: 'png' };
}

export const CONTENT_TYPES = {
  main: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
  styles: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
  numbering: 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml',
  settings: 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml',
  header: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml',
  footer: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml',
  core: 'application/vnd.openxmlformats-package.core-properties+xml',
  app: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
  rels: 'application/vnd.openxmlformats-package.relationships+xml',
};
export const REL = {
  doc: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  core: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  app: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
  styles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
  numbering: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering',
  settings: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
  header: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
  footer: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  hyperlink: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
};

export function coreXml({ title = '', subject = '', creator = 'CTO Consulting', now = new Date().toISOString() } = {}) {
  const t = now.replace(/\.\d{3}Z$/, 'Z');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:subject>${esc(subject)}</dc:subject><dc:creator>${esc(creator)}</dc:creator><cp:lastModifiedBy>${esc(creator)}</cp:lastModifiedBy><cp:revision>1</cp:revision><dcterms:created xsi:type="dcterms:W3CDTF">${t}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${t}</dcterms:modified></cp:coreProperties>`;
}

export function appXml({ company = 'CTO Consulting' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>CTO Consulting Proposal Platform</Application><Company>${esc(company)}</Company><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion></Properties>`;
}
