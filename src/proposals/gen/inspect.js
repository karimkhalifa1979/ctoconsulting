// Reads a Word or PowerPoint file finalised outside the platform, for the re-upload checks (WD-09, PP-07).
import JSZip from 'jszip';
import { parseXml, findAll, textOfRuns, xmlUnescape } from './xml.js';

export async function inspectOfficeFile(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);
  const kind = names.includes('word/document.xml') ? 'docx' : names.some((n) => n.startsWith('ppt/')) ? 'pptx' : null;
  if (!kind) throw new Error('This is not a Word (.docx) or PowerPoint (.pptx) file.');
  const parts = kind === 'docx'
    ? names.filter((n) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n))
    : names.filter((n) => /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/.test(n));
  let text = '';
  let trackedChanges = false;
  let hiddenText = false;
  for (const p of parts) {
    const xml = await zip.file(p).async('string');
    if (/<w:(ins|del|moveFrom|moveTo)\b/.test(xml)) trackedChanges = true;
    if (/<w:vanish\/>|<w:vanish w:val="(1|true)"/.test(xml)) hiddenText = true;
    const doc = parseXml(xml);
    text += kind === 'docx' ? `${findAll(doc, 'w:p').map(textOfRuns).join('\n')}\n` : `${findAll(doc, 'a:p').map((p) => findAll(p, 'a:t').map((t) => xmlUnescape((t.children || []).map((c) => c.text || '').join(''))).join('')).join('\n')}\n`;
  }
  const comments = names.some((n) => /^word\/comments\.xml$|^ppt\/comments\//.test(n) || /^ppt\/commentAuthors\.xml$/.test(n))
    && (kind === 'pptx' || /<w:comment\b/.test(await zip.file('word/comments.xml')?.async('string') || ''));
  const personal = [];
  const core = await zip.file('docProps/core.xml')?.async('string');
  if (core) {
    for (const tag of ['dc:creator', 'cp:lastModifiedBy']) {
      const v = findAll(parseXml(core), tag)[0];
      const val = v ? (v.children || []).map((c) => c.text || '').join('').trim() : '';
      if (val && !/cto consulting/i.test(val)) personal.push(`${tag.split(':')[1]} = ${val}`);
    }
  }
  const slides = kind === 'pptx' ? names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length : null;
  return { kind, text, trackedChanges, comments, hiddenText, personal, slides };
}
