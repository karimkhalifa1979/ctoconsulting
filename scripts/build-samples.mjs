// Builds the sample client request documents in public/samples (Word, and PDF when LibreOffice is installed).
// Run with: node scripts/build-samples.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { srwaRfq, srwaAddendum, odrAtm, ODR_QUESTIONNAIRE, harbourRfq } from '../src/proposals/core/seed/rfp.js';
import { buildDocument, PAGE } from '../src/proposals/gen/wordTemplate.js';
import { para, textRun, table } from '../src/proposals/gen/ooxml.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'public', 'samples');
const BASE = '2026-09-29';
fs.mkdirSync(OUT, { recursive: true });

function docBody(doc) {
  const out = [];
  doc.pages.forEach((paras, pi) => {
    let rows = [];
    const flush = () => {
      if (!rows.length) return;
      const header = /^(criterion|event|item)$/i.test(rows[0][0]);
      const widths = rows[0].length === 2 ? [2800, PAGE.text - 2800] : rows[0].map(() => Math.floor(PAGE.text / rows[0].length));
      if (rows[0][0].length <= 4) { widths[0] = 900; widths[1] = PAGE.text - 900; }
      out.push(table({ style: 'CTOTable', widths, header: header ? rows[0] : null, rows: header ? rows.slice(1) : rows, cellStyle: 'TableText', headerRepeat: true }));
      out.push(para(''));
      rows = [];
    };
    paras.forEach((t, i) => {
      if (t.includes('\t')) { rows.push(t.split('\t')); return; }
      flush();
      const first = pi === 0 && i < 3;
      const heading = /^\d+\.\s+[A-Z][^.]*$/.test(t);
      out.push(para(textRun(t), { style: first ? (i === 0 ? 'Subtitle' : i === 1 ? 'Heading2' : 'Title') : heading ? 'Heading1' : 'Normal', pageBreakBefore: heading && pi > 0 && i === 0 }));
    });
    flush();
  });
  return out.join('');
}

const docs = [
  [srwaRfq(BASE), 'SRWA-RFQ-2026-031 Request for Quote'],
  [srwaAddendum(BASE), 'SRWA-RFQ-2026-031 Addendum 1'],
  [odrAtm(BASE), 'ODR-2026-118 Approach to Market'],
  [ODR_QUESTIONNAIRE, 'ODR Attachment A - Supplier Questionnaire'],
  [harbourRfq(BASE), 'HCC-RFQ-2026-19 Customer Portal Discovery'],
];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'samples-'));
for (const [doc, name] of docs) {
  const bytes = await buildDocument({ bodyXml: docBody(doc), title: name, header: 'Sample document for the CTO Consulting Proposal Platform. All organisations are fictitious.', footer: name });
  const docx = path.join(OUT, `${name}.docx`);
  fs.writeFileSync(docx, bytes);
  try {
    execFileSync('soffice', [`-env:UserInstallation=file://${tmp}/profile`, '--headless', '--convert-to', 'pdf', '--outdir', OUT, docx], { stdio: 'ignore', timeout: 120000 });
    console.log('built', name, '(.docx, .pdf)');
  } catch {
    console.log('built', name, '(.docx only; install LibreOffice for PDF)');
  }
}
// A client-format compliance workbook, to demonstrate filling the client's own format.
const { default: Excel } = await import('exceljs');
const wb = new Excel.Workbook();
const ws = wb.addWorksheet('Schedule 6 Compliance');
ws.addRow(['Southern Rivers Water Authority – Returnable Schedule 6: Statement of Compliance']);
ws.addRow([]);
ws.addRow(['Req. ID', 'Requirement', 'Compliance (Comply / Partial / Not comply)', 'Supplier response', 'Cross-reference in response']);
for (const t of srwaRfq(BASE).pages[2].filter((x) => /^[MD]\d+\t/.test(x))) { const [ref, text] = t.split('\t'); ws.addRow([ref, text, '', '', '']); }
ws.columns.forEach((c, i) => { c.width = [10, 70, 24, 50, 30][i]; });
await wb.xlsx.writeFile(path.join(OUT, 'SRWA Returnable Schedule 6 - Compliance (client format).xlsx'));
console.log('built client-format compliance workbook');
