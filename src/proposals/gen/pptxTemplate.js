// Uploaded PowerPoint masters (PP-01): read layouts and placeholders, validate the mapping from deck layouts,
// and render a storyboard into the master's own layouts as editable placeholder text.
import JSZip from 'jszip';
import { parseXml, serializeXml, findAll, kid, attr, xmlEscape as esc } from './xml.js';

export const DECK_LAYOUTS = [
  { id: 'title', label: 'Title slide', needs: ['title'] },
  { id: 'content', label: 'Title and content', needs: ['title', 'body'] },
  { id: 'section', label: 'Section header', needs: ['title'] },
  { id: 'timeline', label: 'Timeline', needs: ['title'] },
  { id: 'team', label: 'Team', needs: ['title'] },
  { id: 'case_study', label: 'Case study', needs: ['title', 'body'] },
  { id: 'table', label: 'Table or chart', needs: ['title'] },
];

const phKind = (ph) => {
  const t = attr(ph, 'type') || 'body';
  if (t === 'title' || t === 'ctrTitle') return 'title';
  if (t === 'subTitle' || t === 'body' || t === 'obj') return 'body';
  return t;
};

export async function inspectPptxTemplate(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const issues = [];
  if (!zip.file('ppt/presentation.xml')) return { layouts: [], issues: [{ level: 'error', message: 'This is not a PowerPoint file (ppt/presentation.xml is missing).' }] };
  const layoutFiles = Object.keys(zip.files).filter((n) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const layouts = [];
  for (const f of layoutFiles) {
    const root = parseXml(await zip.file(f).async('string'));
    const cSld = findAll(root, 'p:cSld')[0];
    const name = attr(cSld || { attrs: [] }, 'name') || f.split('/').pop();
    const placeholders = findAll(root, 'p:ph').map((ph) => ({ type: attr(ph, 'type') || 'body', idx: attr(ph, 'idx'), kind: phKind(ph) })).filter((p) => !['dt', 'ftr', 'sldNum'].includes(p.type));
    layouts.push({ file: f, name, placeholders });
  }
  if (!layouts.length) issues.push({ level: 'error', message: 'The file has no slide layouts.' });
  const isTemplate = /presentationml\.template\.main/.test(await zip.file('[Content_Types].xml').async('string'));
  const sz = findAll(parseXml(await zip.file('ppt/presentation.xml').async('string')), 'p:sldSz')[0];
  return { layouts, issues, isTemplate, slideSize: sz ? { cx: Number(attr(sz, 'cx')), cy: Number(attr(sz, 'cy')) } : null, hasNotesMaster: Boolean(zip.file('ppt/notesMasters/notesMaster1.xml')) };
}

// Proposes a mapping by layout name, then validates that each deck layout maps to a layout with the placeholders it needs.
export function suggestMapping(layouts) {
  const has = (l, needs) => needs.every((k) => l.placeholders.some((p) => p.kind === k));
  const pick = (dl, patterns) => {
    const ok = layouts.filter((l) => has(l, dl.needs));
    for (const re of patterns) { const l = ok.find((x) => re.test(x.name)); if (l) return l.file; }
    return ok[0]?.file || layouts[0]?.file;
  };
  const byId = Object.fromEntries(DECK_LAYOUTS.map((d) => [d.id, d]));
  return {
    title: pick(byId.title, [/cover/i, /title slide/i, /_title$/i, /^title$/i, /title/i]),
    content: pick(byId.content, [/title and content/i, /_content$/i, /content/i]),
    section: pick(byId.section, [/section/i, /divider/i]),
    timeline: pick(byId.timeline, [/title only/i, /visual/i, /content/i]),
    team: pick(byId.team, [/two content|comparison/i, /visual/i, /content/i]),
    case_study: pick(byId.case_study, [/two content|comparison/i, /content/i]),
    table: pick(byId.table, [/title only/i, /visual/i, /content/i]),
  };
}

export function validateMapping(layouts, mapping) {
  const issues = [];
  for (const dl of DECK_LAYOUTS) {
    const file = mapping?.[dl.id];
    const l = layouts.find((x) => x.file === file);
    if (!l) { issues.push({ level: 'error', message: `${dl.label}: choose a layout.` }); continue; }
    for (const need of dl.needs) if (!l.placeholders.some((p) => p.kind === need)) issues.push({ level: 'error', message: `${dl.label} → “${l.name}” has no ${need} placeholder.` });
  }
  return issues;
}

const P_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL_LAYOUT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout';
const REL_SLIDE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const REL_NOTES = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide';
const REL_NOTES_MASTER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster';
const CT_SLIDE = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';
const CT_NOTES = 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml';

const paras = (lines, { bullet = false } = {}) => (lines.length ? lines : ['']).map((t) => `<a:p>${bullet ? '' : ''}<a:r><a:rPr lang="en-AU" dirty="0"/><a:t>${esc(t)}</a:t></a:r></a:p>`).join('');

function shape(id, ph, lines) {
  const phAttrs = [ph.type && ph.type !== 'body' ? `type="${ph.type}"` : ph.idx ? '' : 'type="body"', ph.idx ? `idx="${ph.idx}"` : ''].filter(Boolean).join(' ');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Placeholder ${id}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph ${phAttrs}/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras(lines)}</p:txBody></p:sp>`;
}

function slideLines(s) {
  if (s.kind === 'team' && s.data?.members) return s.data.members.map((m) => `${m.name} — ${m.role}`);
  if (s.kind === 'case_studies' && s.data?.caseStudy) return [s.data.caseStudy.summary, ...s.points].filter(Boolean);
  if (s.layout === 'timeline' && s.data?.phases) return s.data.phases.map((p) => `${p.label}: ${p.detail}`);
  return s.points || [];
}

export async function renderIntoMaster(bytes, deck, mapping) {
  const zip = await JSZip.loadAsync(bytes);
  const info = await inspectPptxTemplate(bytes);
  const issues = validateMapping(info.layouts, mapping);
  if (issues.some((i) => i.level === 'error')) throw new Error(issues.map((i) => i.message).join(' '));
  // Remove any slides that ship with the template.
  const presPath = 'ppt/presentation.xml';
  const pres = parseXml(await zip.file(presPath).async('string'));
  const presRels = parseXml(await zip.file('ppt/_rels/presentation.xml.rels').async('string'));
  const relRoot = findAll(presRels, 'Relationships')[0];
  relRoot.children = relRoot.children.filter((r) => attr(r, 'Type') !== REL_SLIDE);
  for (const n of Object.keys(zip.files)) if (/^ppt\/(slides|notesSlides)\//.test(n)) zip.remove(n);
  let ct = await zip.file('[Content_Types].xml').async('string');
  ct = ct.replace(/<Override[^>]*PartName="\/ppt\/(slides|notesSlides)\/[^"]*"[^>]*\/>/g, '').replace('presentationml.template.main+xml', 'presentationml.presentation.main+xml');
  const presRoot = findAll(pres, 'p:presentation')[0];
  presRoot.children = presRoot.children.filter((c) => c.name !== 'p:sldIdLst');
  const sldIdLst = { name: 'p:sldIdLst', attrs: [], children: [] };
  const after = ['p:handoutMasterIdLst', 'p:notesMasterIdLst', 'p:sldMasterIdLst'].map((n) => presRoot.children.findIndex((c) => c.name === n)).find((i) => i >= 0);
  presRoot.children.splice((after ?? 0) + 1, 0, sldIdLst);
  const notesMaster = Object.keys(zip.files).find((n) => /^ppt\/notesMasters\/notesMaster\d+\.xml$/.test(n));
  let n = 0;
  const overrides = [];
  for (const s of deck.slides.filter((x) => x.include !== false)) {
    n++;
    const layoutFile = mapping[s.layout] || mapping.content;
    const layout = info.layouts.find((l) => l.file === layoutFile);
    const titlePh = layout.placeholders.find((p) => p.kind === 'title');
    const bodyPh = layout.placeholders.find((p) => p.kind === 'body');
    let shapes = '';
    let id = 2;
    if (titlePh) shapes += shape(id++, titlePh, [s.title]);
    const lines = s.layout === 'title' || s.layout === 'section' ? [s.subtitle || ''] : slideLines(s);
    if (bodyPh) shapes += shape(id++, bodyPh, lines);
    else if (lines.filter(Boolean).length) {
      // Layouts without a body placeholder get a text box below the title.
      const W = info.slideSize?.cx || 12192000, Hh = info.slideSize?.cy || 6858000, in1 = 914400;
      shapes += `<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(in1 * 0.6)}" y="${Math.round(in1 * 1.6)}"/><a:ext cx="${Math.round(W - in1 * 1.2)}" cy="${Math.round(Hh - in1 * 2.6)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>${lines.filter(Boolean).map((t) => `<a:p><a:pPr marL="285750" indent="-285750"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="en-AU" sz="1800" dirty="0"/><a:t>${esc(t)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>`;
    }
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${P_NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    zip.file(`ppt/slides/slide${n}.xml`, xml);
    let slideRels = `<Relationship Id="rId1" Type="${REL_LAYOUT}" Target="../slideLayouts/${layoutFile.split('/').pop()}"/>`;
    if (notesMaster && s.notes) {
      const notes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes ${P_NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras(String(s.notes).split('\n').filter(Boolean))}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
      zip.file(`ppt/notesSlides/notesSlide${n}.xml`, notes);
      zip.file(`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NOTES_MASTER}" Target="../notesMasters/${notesMaster.split('/').pop()}"/><Relationship Id="rId2" Type="${REL_SLIDE}" Target="../slides/slide${n}.xml"/></Relationships>`);
      slideRels += `<Relationship Id="rId2" Type="${REL_NOTES}" Target="../notesSlides/notesSlide${n}.xml"/>`;
      overrides.push(`<Override PartName="/ppt/notesSlides/notesSlide${n}.xml" ContentType="${CT_NOTES}"/>`);
    }
    zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slideRels}</Relationships>`);
    overrides.push(`<Override PartName="/ppt/slides/slide${n}.xml" ContentType="${CT_SLIDE}"/>`);
    const rid = `rIdSlide${n}`;
    relRoot.children.push({ name: 'Relationship', attrs: [['Id', rid], ['Type', REL_SLIDE], ['Target', `slides/slide${n}.xml`]], children: [] });
    sldIdLst.children.push({ name: 'p:sldId', attrs: [['id', String(255 + n)], ['r:id', rid]], children: [] });
  }
  zip.file('[Content_Types].xml', ct.replace('</Types>', `${overrides.join('')}</Types>`));
  zip.file(presPath, serializeXml(pres));
  zip.file('ppt/_rels/presentation.xml.rels', serializeXml(presRels));
  return { bytes: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), notes: Boolean(notesMaster), slides: n };
}

export { kid };
