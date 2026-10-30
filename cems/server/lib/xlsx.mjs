// Excel and CSV exports (RAI-008, FIN-050, DSH-005) and spreadsheet imports (DAT-005).
import ExcelJS from 'exceljs';

export async function toXlsx(sheets) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CTO Consulting CEMS';
  wb.created = new Date();
  for (const { name, columns, rows } of sheets) {
    const ws = wb.addWorksheet(String(name).slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: c.width || Math.min(60, Math.max(12, String(c.label).length + 4)) }));
    for (const r of rows) {
      ws.addRow(Object.fromEntries(columns.map((c) => {
        const v = r[c.key];
        return [c.key, v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v];
      })));
    }
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    columns.forEach((c, i) => {
      if (c.type === 'money') ws.getColumn(i + 1).numFmt = '"$"#,##0.00';
      if (c.type === 'percent') ws.getColumn(i + 1).numFmt = '0.0%';
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toCsv(columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(','))].join('\r\n');
}

// Parses CSV text (RFC 4180) into objects keyed by the header row.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...data] = rows.filter((r) => r.some((x) => String(x).trim()));
  if (!header) return [];
  const keys = header.map((h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

// Reads the first worksheet of an .xlsx file into objects keyed by the header row.
export async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out = [];
  let keys = null;
  ws.eachRow((row) => {
    const vals = row.values.slice(1).map((v) => (v && typeof v === 'object' && 'text' in v ? v.text : v instanceof Date ? v.toISOString().slice(0, 10) : v));
    if (!keys) { keys = vals.map((h) => String(h ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')); return; }
    out.push(Object.fromEntries(keys.map((k, i) => [k, vals[i] === undefined || vals[i] === null ? '' : String(vals[i]).trim()])));
  });
  return out;
}
