// Built-in CTO Consulting Word templates. They are ordinary .docx files that use named styles and the
// tag syntax from section 9.2 of the specification, so designers can download, restyle and re-upload them.
import JSZip from 'jszip';
import { DOC_NS, para, textRun, tabRun, simpleField, complexField, pPr, CONTENT_TYPES, REL, coreXml, appXml } from './ooxml.js';

const NAVY = '0B1F3A', TEAL = '0FA3B1', TEAL_DARK = '0B7D88', GREY = '5A6675', LINE = 'CFD7E2', BAND = 'F4F6F9';
export const PAGE = { width: 11906, height: 16838, margin: 1134, text: 11906 - 2 * 1134 };

const style = (type, id, name, { basedOn, next, link, ui, qFormat = true, def, pp = '', rp = '', tblPr = '', extra = '' } = {}) =>
  `<w:style w:type="${type}"${def ? ' w:default="1"' : ''} w:styleId="${id}"><w:name w:val="${name}"/>${basedOn ? `<w:basedOn w:val="${basedOn}"/>` : ''}${next ? `<w:next w:val="${next}"/>` : ''}${link ? `<w:link w:val="${link}"/>` : ''}${ui != null ? `<w:uiPriority w:val="${ui}"/>` : ''}${qFormat ? '<w:qFormat/>' : ''}${pp ? `<w:pPr>${pp}</w:pPr>` : ''}${rp ? `<w:rPr>${rp}</w:rPr>` : ''}${tblPr}${extra}</w:style>`;

const col = (c) => `<w:color w:val="${c}"/>`;
const sz = (pt) => `<w:sz w:val="${pt * 2}"/><w:szCs w:val="${pt * 2}"/>`;
const B = '<w:b/><w:bCs/>';
const border = (side, color, size = 4, space = 0) => `<w:${side} w:val="single" w:sz="${size}" w:space="${space}" w:color="${color}"/>`;

export function stylesXml({ font = 'Arial' } = {}) {
  const tab = `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${PAGE.text - 10}"/></w:tabs>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
    + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:eastAsia="${font}" w:hAnsi="${font}" w:cs="${font}"/>${sz(11)}<w:lang w:val="en-AU" w:eastAsia="en-AU" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + style('paragraph', 'Normal', 'Normal', { def: true, rp: col('1F2937') })
    + style('character', 'DefaultParagraphFont', 'Default Paragraph Font', { def: true, ui: 1, qFormat: false, extra: '<w:semiHidden/><w:unhideWhenUsed/>' })
    + `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>`
    + '<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/></w:style>'
    + style('paragraph', 'Title', 'Title', { basedOn: 'Normal', next: 'Normal', ui: 10, pp: '<w:spacing w:before="0" w:after="200" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="9"/>', rp: `${B}${col(NAVY)}${sz(30)}` })
    + style('paragraph', 'Subtitle', 'Subtitle', { basedOn: 'Normal', next: 'Normal', ui: 11, pp: '<w:spacing w:after="360"/>', rp: `${col(TEAL_DARK)}${sz(16)}` })
    + style('paragraph', 'Heading1', 'heading 1', { basedOn: 'Normal', next: 'Normal', ui: 9, pp: `<w:keepNext/><w:keepLines/><w:pBdr>${border('bottom', TEAL, 8, 4)}</w:pBdr><w:spacing w:before="360" w:after="160"/><w:outlineLvl w:val="0"/>`, rp: `${B}${col(NAVY)}${sz(18)}` })
    + style('paragraph', 'Heading2', 'heading 2', { basedOn: 'Normal', next: 'Normal', ui: 9, pp: '<w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="1"/>', rp: `${B}${col(TEAL_DARK)}${sz(14)}` })
    + style('paragraph', 'Heading3', 'heading 3', { basedOn: 'Normal', next: 'Normal', ui: 9, pp: '<w:keepNext/><w:keepLines/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="2"/>', rp: `${B}${col(NAVY)}${sz(12)}` })
    + style('paragraph', 'Heading4', 'heading 4', { basedOn: 'Normal', next: 'Normal', ui: 9, pp: '<w:keepNext/><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="3"/>', rp: `${B}<w:i/><w:iCs/>${col(NAVY)}${sz(11)}` })
    + style('paragraph', 'TOCHeading', 'TOC Heading', { basedOn: 'Heading1', next: 'Normal', ui: 39, pp: '<w:outlineLvl w:val="9"/>' })
    + style('paragraph', 'TOC1', 'toc 1', { basedOn: 'Normal', next: 'Normal', ui: 39, pp: `${tab}<w:spacing w:before="120" w:after="40"/>`, rp: B })
    + style('paragraph', 'TOC2', 'toc 2', { basedOn: 'Normal', next: 'Normal', ui: 39, pp: `${tab}<w:spacing w:after="40"/><w:ind w:left="284"/>` })
    + style('paragraph', 'ListBullet', 'List Bullet', { basedOn: 'Normal', ui: 34, pp: '<w:numPr><w:numId w:val="1"/></w:numPr><w:spacing w:after="60"/><w:ind w:left="357" w:hanging="357"/>' })
    + style('paragraph', 'ListBullet2', 'List Bullet 2', { basedOn: 'Normal', ui: 34, pp: '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="60"/><w:ind w:left="714" w:hanging="357"/>' })
    + style('paragraph', 'ListNumber', 'List Number', { basedOn: 'Normal', ui: 34, pp: '<w:numPr><w:numId w:val="2"/></w:numPr><w:spacing w:after="60"/><w:ind w:left="357" w:hanging="357"/>' })
    + style('paragraph', 'Caption', 'caption', { basedOn: 'Normal', next: 'Normal', ui: 35, pp: '<w:keepNext/><w:spacing w:before="160" w:after="80"/>', rp: `${B}${col(GREY)}${sz(9)}` })
    + style('paragraph', 'TableText', 'Table Text', { basedOn: 'Normal', ui: 40, pp: '<w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/>', rp: sz(9.5) })
    + style('paragraph', 'TableHeading', 'Table Heading', { basedOn: 'TableText', ui: 40, pp: '<w:keepNext/><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/>', rp: `${B}${col('FFFFFF')}${sz(9.5)}` })
    + style('paragraph', 'Quote', 'Quote', { basedOn: 'Normal', next: 'Normal', ui: 29, pp: `<w:pBdr>${border('left', TEAL, 18, 8)}</w:pBdr><w:ind w:left="284"/>`, rp: `<w:i/><w:iCs/>${col(GREY)}` })
    + style('paragraph', 'CoverMeta', 'Cover Meta', { basedOn: 'Normal', ui: 41, pp: '<w:spacing w:after="60"/>', rp: `${col(GREY)}${sz(11)}` })
    + style('paragraph', 'CoverMark', 'Cover Mark', { basedOn: 'Normal', ui: 42, pp: '<w:spacing w:before="480" w:after="120"/>', rp: `${B}<w:caps/>${col('B42318')}${sz(10)}` })
    + style('paragraph', 'Header', 'header', { basedOn: 'Normal', link: 'HeaderChar', ui: 99, pp: `<w:pBdr>${border('bottom', LINE, 4, 4)}</w:pBdr><w:tabs><w:tab w:val="right" w:pos="${PAGE.text}"/></w:tabs><w:spacing w:after="0"/>`, rp: `${col(GREY)}${sz(8.5)}` })
    + style('paragraph', 'Footer', 'footer', { basedOn: 'Normal', link: 'FooterChar', ui: 99, pp: `<w:tabs><w:tab w:val="right" w:pos="${PAGE.text}"/></w:tabs><w:spacing w:after="0"/>`, rp: `${col(GREY)}${sz(8.5)}` })
    + style('character', 'HeaderChar', 'Header Char', { basedOn: 'DefaultParagraphFont', link: 'Header', ui: 99, qFormat: false })
    + style('character', 'FooterChar', 'Footer Char', { basedOn: 'DefaultParagraphFont', link: 'Footer', ui: 99, qFormat: false })
    + style('character', 'Strong', 'Strong', { basedOn: 'DefaultParagraphFont', ui: 22, rp: B })
    + style('character', 'Emphasis', 'Emphasis', { basedOn: 'DefaultParagraphFont', ui: 20, rp: '<w:i/><w:iCs/>' })
    + style('character', 'Hyperlink', 'Hyperlink', { basedOn: 'DefaultParagraphFont', ui: 99, qFormat: false, rp: `${col(TEAL_DARK)}<w:u w:val="single"/>` })
    + `<w:style w:type="table" w:styleId="CTOTable"><w:name w:val="CTO Table"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="59"/><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr>${sz(9.5)}</w:rPr><w:tblPr><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => border(s, LINE)).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblStylePr w:type="firstRow"><w:rPr>${B}${col('FFFFFF')}</w:rPr><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${NAVY}"/></w:tcPr></w:tblStylePr><w:tblStylePr w:type="band1Horz"><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${BAND}"/></w:tcPr></w:tblStylePr></w:style>`
    + '</w:styles>';
}

export function numberingXml() {
  const lvl = (ilvl, fmt, text, left) => `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="357"/></w:pPr>${fmt === 'bullet' ? `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:hint="default"/><w:color w:val="${TEAL_DARK}"/></w:rPr>` : ''}</w:lvl>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
    + `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, 'bullet', '•', 357)}${lvl(1, 'bullet', '–', 714)}${lvl(2, 'bullet', '•', 1071)}</w:abstractNum>`
    + `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, 'decimal', '%1.', 357)}${lvl(1, 'lowerLetter', '%2)', 714)}${lvl(2, 'lowerRoman', '%3.', 1071)}</w:abstractNum>`
    + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>';
}

export function settingsXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:removePersonalInformation/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:updateFields w:val="true"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:themeFontLang w:val="en-AU"/><w:decimalSymbol w:val="."/><w:listSeparator w:val=","/></w:settings>';
}

const hdr = (body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${DOC_NS}>${body}</w:hdr>`;
const ftr = (body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${DOC_NS}>${body}</w:ftr>`;

function headerFooter() {
  return {
    header1: hdr(para([textRun('{{client.name}} | {{bid.title}}'), tabRun(), textRun('{{bid.reference}}')], { style: 'Header' })),
    footer1: ftr(para([textRun('CTO Consulting | {{org.website}}'), textRun('{{#if confidential}} | Commercial-in-confidence{{/if}}'), tabRun(), textRun('Page '), simpleField('PAGE', '1'), textRun(' of '), simpleField('NUMPAGES', '1')], { style: 'Footer' })),
    footer2: ftr(para([textRun('CTO Consulting Pty Ltd | ABN {{org.abn}} | {{org.website}}')], { style: 'Footer' })),
  };
}

const P = (text, style, extra = {}) => para(textRun(text), { style, ...extra });
const H = (level, text, extra = {}) => P(text, `Heading${level}`, extra);
const pageBreak = () => para('<w:r><w:br w:type="page"/></w:r>');

function tocParagraph() {
  return para(complexField('TOC \\o "1-2" \\h \\z \\u', textRun('Right-click and choose Update Field to refresh the contents.')), { style: 'TOC1' });
}

function sectPr() {
  return `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/><w:footerReference w:type="default" r:id="rIdFooter1"/><w:footerReference w:type="first" r:id="rIdFooter2"/><w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}"/><w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}" w:header="567" w:footer="567" w:gutter="0"/><w:cols w:space="708"/><w:titlePg/><w:docGrid w:linePitch="360"/></w:sectPr>`;
}

function proposalBody() {
  return [
    P('{{image:cto_logo}}', 'Normal', { spacing: { after: 1200 } }),
    P('{{bid.title}}', 'Title'),
    P('Proposal to {{client.name}}', 'Subtitle'),
    P('Client reference: {{bid.client_reference}}', 'CoverMeta'),
    P('Response due: {{submission.due}}', 'CoverMeta'),
    P('Our reference: {{bid.internal_reference}}', 'CoverMeta'),
    P('Contact: {{partner.name}}, {{partner.title}} | {{partner.email}}', 'CoverMeta'),
    P('{{#if confidential}}Commercial-in-confidence{{/if}}', 'CoverMark'),
    pageBreak(),
    P('Contents', 'TOCHeading'),
    tocParagraph(),
    pageBreak(),
    P('{{section:*}}', 'Normal'),
    H(1, 'Appendix A: Compliance matrix', { pageBreakBefore: true }),
    P('The table below maps each of the {{client.short_name}}’s requirements to our response.', 'Normal'),
    P('{{table:compliance_matrix}}', 'Normal'),
    H(1, 'Appendix B: Pricing schedule', { pageBreakBefore: true }),
    P('Pricing model: {{pricing.model}}. All prices are in Australian dollars. GST is shown separately.', 'Normal'),
    P('{{table:pricing}}', 'Normal'),
    P('{{#if pricing_fixed}}', 'Normal'),
    H(2, 'Payment milestones'),
    P('{{table:milestones}}', 'Normal'),
    P('{{/if}}', 'Normal'),
    P('{{#if has_assumptions}}', 'Normal'),
    H(2, 'Pricing assumptions'),
    P('{{#assumptions}}', 'Normal'),
    P('{{text}}', 'ListBullet'),
    P('{{/assumptions}}', 'Normal'),
    P('{{/if}}', 'Normal'),
    P('{{#if has_departures}}', 'Normal'),
    H(2, 'Statement of departures'),
    P('{{table:departures}}', 'Normal'),
    P('{{/if}}', 'Normal'),
    H(1, 'Appendix C: Proposed team', { pageBreakBefore: true }),
    P('{{table:team}}', 'Normal'),
    P('{{#team}}', 'Normal'),
    H(2, '{{name}}, {{role}}'),
    P('{{bio}}', 'Normal'),
    P('Level: {{level}} | Security clearance: {{clearance}} | Certifications: {{certifications}}', 'CoverMeta'),
    P('{{/team}}', 'Normal'),
    P('{{#if has_case_studies}}', 'Normal'),
    H(1, 'Appendix D: Case studies', { pageBreakBefore: true }),
    P('{{#case_studies}}', 'Normal'),
    H(2, '{{title}}'),
    P('{{summary_line}}', 'CoverMeta'),
    P('{{summary}}', 'Normal'),
    P('{{#outcomes}}', 'Normal'),
    P('{{text}}', 'ListBullet'),
    P('{{/outcomes}}', 'Normal'),
    P('{{/case_studies}}', 'Normal'),
    P('{{/if}}', 'Normal'),
    P('{{#if ai_disclosure}}', 'Normal'),
    H(1, 'Disclosure of AI use'),
    P('{{ai.disclosure}}', 'Normal'),
    P('{{/if}}', 'Normal'),
  ].join('');
}

function shortBody() {
  return [
    P('{{image:cto_logo}}', 'Normal', { spacing: { after: 480 } }),
    P('{{bid.title}}', 'Title'),
    P('Response to {{client.name}} | {{bid.client_reference}} | Due {{submission.due}}', 'Subtitle'),
    P('{{section:*}}', 'Normal'),
    H(1, 'Pricing'),
    P('{{table:pricing}}', 'Normal'),
    P('{{#if has_assumptions}}', 'Normal'),
    H(2, 'Assumptions'),
    P('{{#assumptions}}', 'Normal'),
    P('{{text}}', 'ListBullet'),
    P('{{/assumptions}}', 'Normal'),
    P('{{/if}}', 'Normal'),
    H(1, 'Team'),
    P('{{table:team}}', 'Normal'),
  ].join('');
}

export async function buildWordTemplate(kind = 'proposal', { logoPng } = {}) {
  const zip = new JSZip();
  const hf = headerFooter();
  const body = kind === 'short' ? shortBody() : proposalBody();
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${DOC_NS}><w:body>${body}${sectPr()}</w:body></w:document>`;
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="${CONTENT_TYPES.rels}"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="${CONTENT_TYPES.main}"/><Override PartName="/word/styles.xml" ContentType="${CONTENT_TYPES.styles}"/><Override PartName="/word/numbering.xml" ContentType="${CONTENT_TYPES.numbering}"/><Override PartName="/word/settings.xml" ContentType="${CONTENT_TYPES.settings}"/><Override PartName="/word/header1.xml" ContentType="${CONTENT_TYPES.header}"/><Override PartName="/word/footer1.xml" ContentType="${CONTENT_TYPES.footer}"/><Override PartName="/word/footer2.xml" ContentType="${CONTENT_TYPES.footer}"/><Override PartName="/docProps/core.xml" ContentType="${CONTENT_TYPES.core}"/><Override PartName="/docProps/app.xml" ContentType="${CONTENT_TYPES.app}"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL.doc}" Target="word/document.xml"/><Relationship Id="rId2" Type="${REL.core}" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL.app}" Target="docProps/app.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${REL.styles}" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="${REL.numbering}" Target="numbering.xml"/><Relationship Id="rIdSettings" Type="${REL.settings}" Target="settings.xml"/><Relationship Id="rIdHeader1" Type="${REL.header}" Target="header1.xml"/><Relationship Id="rIdFooter1" Type="${REL.footer}" Target="footer1.xml"/><Relationship Id="rIdFooter2" Type="${REL.footer}" Target="footer2.xml"/></Relationships>`);
  zip.file('word/document.xml', doc);
  zip.file('word/styles.xml', stylesXml());
  zip.file('word/numbering.xml', numberingXml());
  zip.file('word/settings.xml', settingsXml());
  zip.file('word/header1.xml', hf.header1);
  zip.file('word/footer1.xml', hf.footer1);
  zip.file('word/footer2.xml', hf.footer2);
  zip.file('docProps/core.xml', coreXml({ title: kind === 'short' ? 'CTO Consulting short-form response template' : 'CTO Consulting proposal template', subject: 'Proposal template' }));
  zip.file('docProps/app.xml', appXml());
  void logoPng;
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// A standalone document built from body XML with the CTO styles (used for CVs and rehearsal packs).
export async function buildDocument({ bodyXml, title, header = '', footer = 'CTO Consulting | www.ctoconsulting.com.au', images = [] }) {
  const zip = new JSZip();
  const imgRels = images.map((im) => `<Relationship Id="${im.rId}" Type="${REL.image}" Target="media/${im.file}"/>`).join('');
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="${CONTENT_TYPES.rels}"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="${CONTENT_TYPES.main}"/><Override PartName="/word/styles.xml" ContentType="${CONTENT_TYPES.styles}"/><Override PartName="/word/numbering.xml" ContentType="${CONTENT_TYPES.numbering}"/><Override PartName="/word/settings.xml" ContentType="${CONTENT_TYPES.settings}"/><Override PartName="/word/header1.xml" ContentType="${CONTENT_TYPES.header}"/><Override PartName="/word/footer1.xml" ContentType="${CONTENT_TYPES.footer}"/><Override PartName="/docProps/core.xml" ContentType="${CONTENT_TYPES.core}"/><Override PartName="/docProps/app.xml" ContentType="${CONTENT_TYPES.app}"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL.doc}" Target="word/document.xml"/><Relationship Id="rId2" Type="${REL.core}" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL.app}" Target="docProps/app.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${REL.styles}" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="${REL.numbering}" Target="numbering.xml"/><Relationship Id="rIdSettings" Type="${REL.settings}" Target="settings.xml"/><Relationship Id="rIdHeader1" Type="${REL.header}" Target="header1.xml"/><Relationship Id="rIdFooter1" Type="${REL.footer}" Target="footer1.xml"/>${imgRels}</Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${DOC_NS}><w:body>${bodyXml}<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/><w:footerReference w:type="default" r:id="rIdFooter1"/><w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}"/><w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}" w:header="567" w:footer="567" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr></w:body></w:document>`);
  zip.file('word/styles.xml', stylesXml());
  zip.file('word/numbering.xml', numberingXml());
  zip.file('word/settings.xml', settingsXml().replace('<w:updateFields w:val="true"/>', ''));
  zip.file('word/header1.xml', hdr(para(textRun(header), { style: 'Header' })));
  zip.file('word/footer1.xml', ftr(para([textRun(footer), tabRun(), textRun('Page '), simpleField('PAGE', '1')], { style: 'Footer' })));
  zip.file('docProps/core.xml', coreXml({ title, subject: title }));
  zip.file('docProps/app.xml', appXml());
  for (const im of images) zip.file(`word/media/${im.file}`, im.bytes);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export { pPr };
