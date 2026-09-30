// In-browser preview of a .docx (generated outputs and template previews with sample data).
// A faithful-enough HTML rendering of paragraphs, named styles, tables, images and page breaks.
import JSZip from 'jszip';
import { parseXml, findAll, kid, kids, attr, xmlUnescape } from './xml.js';
import { escapeHtml } from '../core/util.js';

function styleMap(xml) {
  const map = {};
  for (const s of findAll(parseXml(xml || ''), 'w:style')) {
    const id = attr(s, 'w:styleId');
    const name = (attr(kid(s, 'w:name') || { attrs: [] }, 'w:val') || '').toLowerCase();
    map[id] = name;
  }
  return map;
}

export async function docxToHtml(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const styles = styleMap(await zip.file('word/styles.xml')?.async('string'));
  const rels = {};
  const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
  for (const r of findAll(parseXml(relsXml || ''), 'Relationship')) rels[attr(r, 'Id')] = attr(r, 'Target');
  const media = {};
  for (const [id, target] of Object.entries(rels)) {
    if (!/^media\//.test(target)) continue;
    const f = zip.file(`word/${target}`);
    if (!f) continue;
    const b64 = await f.async('base64');
    media[id] = `data:image/${target.endsWith('.png') ? 'png' : 'jpeg'};base64,${b64}`;
  }
  const doc = parseXml(await zip.file('word/document.xml').async('string'));
  const body = findAll(doc, 'w:body')[0];
  const cls = (styleId) => {
    const n = styles[styleId] || '';
    if (/^heading (\d)/.test(n)) return { tag: `h${Math.min(6, Number(n.match(/\d/)[0]) + 1)}`, cls: '' };
    if (n === 'title') return { tag: 'h1', cls: 'dp-title' };
    if (n === 'subtitle') return { tag: 'p', cls: 'dp-subtitle' };
    if (/^toc/.test(n)) return { tag: 'p', cls: `dp-toc dp-toc${n.replace(/\D/g, '') || 1}` };
    if (/list bullet/.test(n)) return { tag: 'li', cls: 'dp-bullet' };
    if (/list number/.test(n)) return { tag: 'li', cls: 'dp-number' };
    if (n === 'caption') return { tag: 'p', cls: 'dp-caption' };
    if (/cover mark/.test(n)) return { tag: 'p', cls: 'dp-mark' };
    if (/cover meta/.test(n)) return { tag: 'p', cls: 'dp-meta' };
    if (n === 'quote') return { tag: 'blockquote', cls: '' };
    if (/table heading/.test(n)) return { tag: 'p', cls: 'dp-th' };
    return { tag: 'p', cls: '' };
  };
  const runs = (p) => {
    let html = '';
    const walk = (n) => {
      for (const c of n.children || []) {
        if (c.name === 'w:r') {
          const rp = kid(c, 'w:rPr');
          const b = rp && (kid(rp, 'w:b') || (kid(rp, 'w:rStyle') && /strong/i.test(attr(kid(rp, 'w:rStyle'), 'w:val'))));
          const i = rp && (kid(rp, 'w:i') || (kid(rp, 'w:rStyle') && /emphasis/i.test(attr(kid(rp, 'w:rStyle'), 'w:val'))));
          for (const x of c.children) {
            if (x.name === 'w:t') { let t = escapeHtml(xmlUnescape(x.children.map((y) => y.text || '').join(''))); if (b) t = `<strong>${t}</strong>`; if (i) t = `<em>${t}</em>`; html += t; }
            if (x.name === 'w:tab') html += '<span class="dp-tab"></span>';
            if (x.name === 'w:br') html += attr(x, 'w:type') === 'page' ? '<hr class="dp-page">' : '<br>';
            if (x.name === 'w:drawing') {
              const blip = findAll(x, 'a:blip')[0];
              const ext = findAll(x, 'wp:extent')[0];
              const docPr = findAll(x, 'wp:docPr')[0];
              const w = ext ? Math.round(Number(attr(ext, 'cx')) / 9525) : 200;
              const src = blip && media[attr(blip, 'r:embed')];
              if (src) html += `<img src="${src}" alt="${escapeHtml(attr(docPr || { attrs: [] }, 'descr') || '')}" style="width:${Math.min(w, 600)}px;max-width:100%">`;
            }
          }
        } else if (c.name === 'w:hyperlink' || c.name === 'w:fldSimple' || c.name === 'w:smartTag' || c.name === 'w:ins') walk(c);
      }
    };
    walk(p);
    return html;
  };
  const out = [];
  let list = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const para = (p) => {
    const ps = findAll(p, 'w:pStyle')[0];
    const c = cls(ps ? attr(ps, 'w:val') : '');
    const pageBreak = findAll(p, 'w:pageBreakBefore').length;
    const inner = runs(p);
    if (c.tag === 'li') {
      const want = c.cls === 'dp-number' ? 'ol' : 'ul';
      if (list !== want) { closeList(); out.push(`<${want}>`); list = want; }
      out.push(`<li>${inner}</li>`);
      return;
    }
    closeList();
    if (pageBreak) out.push('<hr class="dp-page">');
    out.push(`<${c.tag}${c.cls ? ` class="${c.cls}"` : ''}>${inner || '&nbsp;'}</${c.tag}>`);
  };
  for (const el of body.children) {
    if (el.name === 'w:p') para(el);
    else if (el.name === 'w:tbl') {
      closeList();
      const cap = findAll(el, 'w:tblCaption')[0];
      const rows = kids(el, 'w:tr').map((tr, i) => {
        const head = i === 0 && findAll(tr, 'w:tblHeader').length;
        return `<tr>${kids(tr, 'w:tc').map((tc) => `<${head ? 'th' : 'td'}>${kids(tc, 'w:p').map(runs).join('<br>')}</${head ? 'th' : 'td'}>`).join('')}</tr>`;
      }).join('');
      out.push(`<table class="dp-table"${cap ? ` aria-label="${escapeHtml(attr(cap, 'w:val'))}"` : ''}>${rows}</table>`);
    }
  }
  closeList();
  return out.join('');
}
