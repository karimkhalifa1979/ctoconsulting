// Table exports to CSV and Excel (RPT-003). Rows are plain objects keyed by column label.
import { saveBlob } from '../data/client.js';
import { toCsv } from '../../shared/util.js';

export async function exportTable(rows, columns, { name = 'Export', format = 'xlsx', sheet } = {}) {
  const cols = columns || Object.keys(rows[0] || {});
  const file = `${name} ${new Date().toISOString().slice(0, 10)}`;
  if (format === 'csv') {
    saveBlob(new Blob(['﻿', toCsv(rows, cols)], { type: 'text/csv;charset=utf-8' }), `${file}.csv`);
    return;
  }
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Change Management Workbench';
  const ws = wb.addWorksheet(String(sheet || name || 'Data').replace(/[*?:\\/[\]]/g, ' ').slice(0, 30));
  ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(60, Math.max(12, String(c).length + 4)) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of rows) ws.addRow(r);
  if (cols.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${file}.xlsx`);
}
