// File exports and imports: CSV, JSON, Excel, print, and SVG → PNG for images and Word documents (INT-06, RPT-04).
export function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function toCSV(rows, columns) {
  const q = (v) => {
    const s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => q(c.label)).join(','), ...rows.map((r) => columns.map((c) => q(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))].join('\r\n');
}
export function downloadCSV(rows, columns, filename) { downloadBlob(`﻿${toCSV(rows, columns)}`, filename, 'text/csv;charset=utf-8'); }
export function downloadJSON(data, filename) { downloadBlob(JSON.stringify(data, null, 2), filename, 'application/json'); }
export const safeName = (s) => String(s || 'export').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');

// Minimal RFC 4180 CSV parser returning objects keyed by lower-case header.
export function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  const t = String(text).replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export async function exportXlsx(sheets, filename) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CTO Consulting — Benefits Realisation Platform';
  wb.created = new Date();
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31));
    ws.columns = sh.columns.map((c) => ({ header: c.label, key: c.label, width: c.width || 18 }));
    for (const r of sh.rows) ws.addRow(Object.fromEntries(sh.columns.map((c) => [c.label, c.get(r)])));
    const h = ws.getRow(1);
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
    h.alignment = { vertical: 'middle', wrapText: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.eachRow((row, i) => { if (i > 1) row.alignment = { vertical: 'top', wrapText: true }; });
  }
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

export function printHtml(html) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  let printed = false;
  const go = () => { if (printed) return; printed = true; try { w.focus(); w.print(); } catch { /* closed */ } };
  w.onload = go; setTimeout(go, 700);
  return true;
}

// Serialise an on-screen SVG with computed colours resolved (CSS variables do not survive as images).
export function inlineSvg(svgEl) {
  const clone = svgEl.cloneNode(true);
  const src = svgEl.querySelectorAll('*'); const dst = clone.querySelectorAll('*');
  const props = ['fill', 'stroke', 'opacity', 'stroke-width', 'stroke-dasharray', 'font-size', 'font-weight', 'font-family'];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    for (const p of props) { const v = cs.getPropertyValue(p); if (v) dst[i].setAttribute(p, v); }
  });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const r = svgEl.getBoundingClientRect();
  clone.setAttribute('width', r.width); clone.setAttribute('height', r.height);
  clone.setAttribute('style', 'background:#ffffff');
  return new XMLSerializer().serializeToString(clone);
}

export function svgToPng(svgString, width, height, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(width * scale); c.height = Math.round(height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG conversion failed'))), 'image/png');
    };
    img.onerror = () => reject(new Error('Could not render chart image'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
  });
}
