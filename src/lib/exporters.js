// File exports: CSV, Excel register (same layout as the source workbook), Word and iCalendar.
import { REQ_FIELDS, OBL_FIELDS, EXM_FIELDS } from './registerParser.js';
import { statusOf } from './assessment.js';

export function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function toCSV(rows, columns) {
  const q = (v) => {
    const s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => q(c.label)).join(','), ...rows.map((r) => columns.map((c) => q(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))].join('\r\n');
}

export function downloadCSV(rows, columns, filename) {
  downloadBlob(`﻿${toCSV(rows, columns)}`, filename, 'text/csv;charset=utf-8');
}

export function safeName(s) {
  return String(s || 'export').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');
}

function styleHeader(ws, row = 1) {
  const r = ws.getRow(row);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
  r.alignment = { vertical: 'middle', wrapText: true };
  r.height = 32;
  ws.views = [{ state: 'frozen', ySplit: row }];
}

export async function exportRegisterXlsx(org, data, assessments) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CTO Consulting — Regulatory Assessment Tool';
  wb.created = new Date();

  const req = wb.addWorksheet('Requirements');
  req.columns = REQ_FIELDS.map((f) => ({ header: f.label, key: f.key, width: ['requirement', 'obligationDescription', 'guidance', 'processSteps', 'evidence', 'notes'].includes(f.key) ? 60 : 24 }));
  data.requirements.forEach((r) => req.addRow(Object.fromEntries(REQ_FIELDS.map((f) => [f.key, r[f.key]]))));
  styleHeader(req);

  const obl = wb.addWorksheet('Obligations');
  obl.columns = OBL_FIELDS.map((f) => ({ header: f.key === 'applicability' ? `Applicability to the ${org.shortName}` : f.key === 'policyNumber' ? `${org.shortName} Policy Number` : f.label, key: f.key, width: ['description', 'applicability'].includes(f.key) ? 60 : 24 }));
  data.obligations.forEach((o) => obl.addRow({ ...o, requirementIds: o.requirementIds.join(', ') }));
  styleHeader(obl);

  if (data.exemptions?.length) {
    const ex = wb.addWorksheet('Exemptions');
    ex.columns = EXM_FIELDS.map((f) => ({ header: f.label, key: f.key, width: 24 }));
    data.exemptions.forEach((e) => ex.addRow(e));
    styleHeader(ex);
  }

  const src = wb.addWorksheet('Applicable Sources');
  src.columns = [
    { header: 'Obligation Source', key: 'name', width: 50 }, { header: 'Applicability', key: 'level', width: 14 },
    { header: 'Rationale', key: 'reason', width: 70 }, { header: 'Publisher', key: 'publisher', width: 36 },
    { header: 'Type', key: 'type', width: 28 }, { header: 'Obligations', key: 'count', width: 12 }, { header: 'URL', key: 'url', width: 50 },
  ];
  (org.sources || []).filter((s) => s.selected !== false).forEach((s) => src.addRow(s));
  styleHeader(src);

  const as = wb.addWorksheet('Control Assessment');
  as.columns = [
    { header: 'Requirement ID', key: 'id', width: 20 }, { header: 'Requirement Title', key: 'title', width: 40 },
    { header: 'Target Policy', key: 'policy', width: 30 }, { header: 'Priority', key: 'priority', width: 10 },
    { header: 'Compliance Status', key: 'status', width: 20 }, { header: 'Current Maturity', key: 'maturity', width: 12 },
    { header: 'Target Maturity', key: 'target', width: 12 }, { header: 'Design Effectiveness', key: 'design', width: 18 },
    { header: 'Operating Effectiveness', key: 'operating', width: 18 }, { header: 'Evidence Provided', key: 'evidence', width: 14 },
    { header: 'Finding', key: 'finding', width: 50 }, { header: 'Recommendation', key: 'recommendation', width: 50 },
    { header: 'Risk Rating', key: 'risk', width: 12 }, { header: 'Remediation Owner', key: 'owner', width: 24 },
    { header: 'Due Date', key: 'dueDate', width: 12 }, { header: 'Remediation Status', key: 'remediationStatus', width: 16 },
    { header: 'Assessor', key: 'assessor', width: 20 }, { header: 'Assessed On', key: 'assessedOn', width: 12 },
  ];
  for (const r of data.requirements) {
    const a = assessments[r.id] || {};
    const ev = Object.values(a.evidence || {}).filter((e) => e?.provided).length;
    as.addRow({ id: r.id, title: r.title, policy: r.policyTitle, priority: r.priority, status: statusOf(a).label, maturity: a.maturity, target: a.targetMaturity, design: a.design, operating: a.operating, evidence: ev, finding: a.finding, recommendation: a.recommendation, risk: a.risk, owner: a.owner, dueDate: a.dueDate, remediationStatus: a.status && a.status !== 'none' ? a.remediationStatus : '', assessor: a.assessor, assessedOn: a.assessedOn });
  }
  styleHeader(as);
  for (const ws of wb.worksheets) ws.eachRow((row, i) => { if (i > 1) row.alignment = { vertical: 'top', wrapText: true }; });

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${safeName(org.shortName)}_Policy_Requirements_Register.xlsx`);
}

export function downloadWord(html, filename) {
  downloadBlob(`﻿${html}`, filename, 'application/msword');
}

export function printHtml(html) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    try { w.focus(); w.print(); } catch { /* window closed */ }
  };
  w.onload = go;
  setTimeout(go, 600);
  return true;
}
