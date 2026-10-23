// Excel (.xlsx) renderer for register extracts: a document control sheet, then one sheet per register with
// a styled, frozen header row, filters and real date and number cells.
import { hex, fmtDate } from '../ir.js';

export async function renderXlsx(wb, { docControl: dc = {}, branding, s }) {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  const at = new Date(dc.generatedAt || s.takenAt || Date.now());
  book.creator = dc.generatedBy || 'Change Management Workbench';
  book.lastModifiedBy = 'Change Management Workbench';
  book.created = at;
  book.modified = at;
  book.title = dc.title || wb.meta.title;
  book.subject = s.initiative.name;
  book.keywords = dc.classification || '';
  const primary = `FF${hex(branding.primary)}`;
  const about = book.addWorksheet('Document control');
  about.columns = [{ width: 26 }, { width: 70 }];
  [['Document', dc.title || wb.meta.title], ['Initiative', s.initiative.name], ['Version', dc.version], ['Status', dc.status], ['Generated', `${fmtDate(dc.generatedAt)} by ${dc.generatedBy || ''}`], ['Data snapshot taken', fmtDate(s.takenAt)], ['Security classification', dc.classification], ...(s.includeSensitive ? [['Handling caveat', 'Contains sensitive personal information. Handle in accordance with the classification marking.']] : [])]
    .forEach(([k, v]) => { const r = about.addRow([k, v ?? '']); r.getCell(1).font = { bold: true }; });
  for (const sh of wb.sheets) {
    const ws = book.addWorksheet(sh.name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }], headerFooter: { oddHeader: `&C&"-,Bold"${(dc.classification || '').toUpperCase()}`, oddFooter: `&L${(dc.title || '').replace(/&/g, '&&')} v${dc.version || ''}&RPage &P of &N` } });
    ws.columns = sh.columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 16, style: c.type === 'date' ? { numFmt: 'dd/mm/yyyy' } : {} }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
    head.alignment = { vertical: 'bottom', wrapText: true };
    for (const r of sh.rows) {
      ws.addRow(Object.fromEntries(sh.columns.map((c) => {
        const v = r[c.key];
        if (v == null || v === '') return [c.key, null];
        if (c.type === 'date') return [c.key, new Date(`${String(v).slice(0, 10)}T00:00:00Z`)];
        if (c.type === 'number') return [c.key, Number(v)];
        return [c.key, Array.isArray(v) ? v.join(', ') : String(v)];
      })));
    }
    if (sh.columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sh.columns.length } };
  }
  return new Uint8Array(await book.xlsx.writeBuffer());
}
