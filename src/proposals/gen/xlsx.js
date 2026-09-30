// Excel outputs: compliance matrix (CR-05), pricing schedule (PR-07), generic view export (section 12),
// and filling a client-supplied workbook by matching its column headings.
import { computePricing } from '../core/pricing.js';
import { COMPLIANCE, PRICING_MODELS } from '../core/constants.js';

async function ExcelJS() {
  const mod = await import('exceljs');
  return mod.default || mod;
}

function styleHeader(ws, row = 1) {
  const r = ws.getRow(row);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
  r.alignment = { vertical: 'middle', wrapText: true };
  r.height = 30;
  ws.views = [{ state: 'frozen', ySplit: row }];
}

const wrap = (ws, from = 2) => ws.eachRow((row, i) => { if (i >= from) row.alignment = { vertical: 'top', wrapText: true }; });

export function complianceRows(bid) {
  const title = (id) => bid.sections.find((s) => s.id === id)?.title || '';
  const crit = (id) => bid.criteria.find((c) => c.id === id)?.name || '';
  const doc = (id) => bid.documents.find((d) => d.id === id)?.name || '';
  return bid.requirements.map((r) => ({
    ref: r.ref, text: r.text, kind: r.kind === 'mandatory' ? 'Mandatory' : 'Desirable', category: r.category || '', criterion: crit(r.criterionId),
    sections: (r.sectionIds || []).map(title).join('; '), compliance: COMPLIANCE.find((c) => c.id === (r.compliance || ''))?.label || 'Not assessed',
    evidence: r.evidence || '', source: r.src ? `${doc(r.src.docId)} p${r.src.page} ¶${r.src.para}` : 'Manual', status: r.excluded ? 'Withdrawn' : r.confirmed ? 'Confirmed' : 'Unconfirmed',
  }));
}

export async function complianceWorkbook(bid, client) {
  const Excel = await ExcelJS();
  const wb = new Excel.Workbook();
  wb.creator = 'CTO Consulting';
  const ws = wb.addWorksheet('Compliance matrix');
  ws.columns = [
    { header: 'Requirement ID', key: 'ref', width: 14 }, { header: 'Requirement', key: 'text', width: 70 }, { header: 'Mandatory or desirable', key: 'kind', width: 14 },
    { header: 'Category', key: 'category', width: 14 }, { header: 'Evaluation criterion', key: 'criterion', width: 30 }, { header: 'Response section', key: 'sections', width: 34 },
    { header: 'Compliance', key: 'compliance', width: 14 }, { header: 'Evidence', key: 'evidence', width: 40 }, { header: 'Source', key: 'source', width: 34 }, { header: 'Status', key: 'status', width: 12 },
  ];
  complianceRows(bid).forEach((r) => ws.addRow(r));
  styleHeader(ws);
  wrap(ws);
  const info = wb.addWorksheet('About');
  info.addRows([['Client', client?.name || ''], ['Opportunity', bid.title], ['Client reference', bid.clientRef || ''], ['CTO Consulting reference', bid.ref], ['Generated', new Date().toISOString()]]);
  info.getColumn(1).width = 26; info.getColumn(2).width = 60;
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export async function pricingWorkbook(state, bid, client, { includeCost = false } = {}) {
  const Excel = await ExcelJS();
  const p = computePricing(state, bid);
  const wb = new Excel.Workbook();
  wb.creator = 'CTO Consulting';
  const ws = wb.addWorksheet('Pricing schedule');
  ws.addRow([`${client?.name || ''} — ${bid.title}`]).font = { bold: true, size: 14, name: 'Arial' };
  ws.addRow([`Pricing model: ${PRICING_MODELS.find((m) => m.id === p.model)?.label || p.model}. All amounts in AUD, excluding GST unless stated.`]);
  ws.addRow([]);
  const header = ['Role', 'Level', 'Named consultant', p.model === 'retainer' ? 'Days per month' : 'Days', 'Day rate (ex GST)', 'Amount (ex GST)', 'Rate source', ...(includeCost ? ['Cost rate', 'Cost'] : [])];
  ws.addRow(header);
  styleHeader(ws, 4);
  const first = 5;
  p.lines.forEach((l, i) => {
    const r = first + i;
    const c = state.consultants.find((x) => x.id === l.consultantId);
    ws.addRow([l.role, l.level, c?.name || 'To be named', l.days, l.rate, { formula: `D${r}*E${r}`, result: l.sell }, l.rateSource, ...(includeCost ? [l.costRate, { formula: `D${r}*H${r}`, result: l.cost }] : [])]);
  });
  const last = first + p.lines.length - 1;
  const add = (label, value, bold) => { const row = ws.addRow([label, '', '', '', '', value]); if (bold) row.font = { bold: true }; return row.number; };
  const labourRow = add('Labour', { formula: `SUM(F${first}:F${Math.max(first, last)})`, result: p.labour });
  let totalFormula = `F${labourRow}`;
  if (p.discount) { const r = add(`Discount (${bid.pricing.discountPct}%)`, { formula: `-F${labourRow}*${bid.pricing.discountPct}/100`, result: -p.discount }); totalFormula += `+F${r}`; }
  if (p.model === 'retainer') { const r = add(`Months (${p.months})`, { formula: `(${totalFormula})*${p.months - 1}`, result: p.labourNet - p.monthly }); totalFormula += `+F${r}`; }
  if (p.contingency) { const r = add(`Delivery contingency (${bid.pricing.contingencyPct}%)`, { formula: `(${totalFormula})*${bid.pricing.contingencyPct}/100`, result: p.contingency }); totalFormula += `+F${r}`; }
  for (const e of bid.pricing.expenses || []) { const r = add(`Expenses: ${e.label}`, e.amount); totalFormula += `+F${r}`; }
  const sub = add('Total (excluding GST)', { formula: totalFormula, result: p.subtotal }, true);
  const gst = add(`GST (${Math.round(p.gstRate * 100)}%)`, { formula: `F${sub}*${p.gstRate}`, result: p.gst });
  add('Total (including GST)', { formula: `F${sub}+F${gst}`, result: p.total }, true);
  if (p.model === 'capped') add('Not-to-exceed cap (excluding GST)', p.cap, true);
  if (includeCost) {
    ws.addRow([]);
    const cr = ws.addRow(['Internal: labour cost', '', '', '', '', p.labourCost]);
    cr.font = { italic: true, color: { argb: 'FFB42318' } };
    ws.addRow(['Internal: margin', '', '', '', '', p.marginPct === null ? '' : Math.round(p.marginPct * 1000) / 10 + '%']).font = { italic: true, color: { argb: 'FFB42318' } };
  }
  ws.columns.forEach((c, i) => { c.width = [30, 20, 22, 12, 16, 18, 36, 12, 14][i] || 14; });
  for (const col of ['E', 'F', 'H', 'I']) ws.getColumn(col).numFmt = '$#,##0.00';
  if (p.milestones.length) {
    const ms = wb.addWorksheet('Payment milestones');
    ms.columns = [{ header: 'Milestone', key: 'label', width: 50 }, { header: 'Share', key: 'pct', width: 10 }, { header: 'Amount (ex GST)', key: 'amount', width: 18 }];
    p.milestones.forEach((m) => ms.addRow({ label: m.label, pct: m.pct / 100, amount: m.amount }));
    ms.getColumn('pct').numFmt = '0%'; ms.getColumn('amount').numFmt = '$#,##0.00';
    styleHeader(ms);
  }
  for (const [name, list, cols] of [['Assumptions', bid.pricing.assumptions, [['text', 'Assumption', 100]]], ['Risks', bid.pricing.risks, [['text', 'Risk', 50], ['rating', 'Rating', 12], ['mitigation', 'Mitigation', 60]]], ['Departures', bid.pricing.departures, [['clause', 'Clause', 24], ['departure', 'Departure', 60], ['rationale', 'Rationale', 50]]]]) {
    if (!(list || []).length) continue;
    const w = wb.addWorksheet(name);
    w.columns = cols.map(([key, header, width]) => ({ key, header, width }));
    list.forEach((x) => w.addRow(x));
    styleHeader(w);
    wrap(w);
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// Fill a client's own workbook (CR-05, PR-07, WD-10): find a header row, match columns by heading, write values.
const MATCHERS = {
  ref: /^(req(uirement)?\.?\s*(id|no|number|ref)|ref(erence)?|id|clause|item)\b/i,
  text: /^(requirement|description|specification|criteria|question)s?\b/i,
  compliance: /(complian|comply|meets?|response type|status)/i,
  response: /(response|comment|explanation|how.*met|supplier.*response|details)/i,
  sections: /(section|cross.?ref|reference in response|page)/i,
  evidence: /evidence/i,
};

export async function fillClientWorkbook(bytes, bid) {
  const Excel = await ExcelJS();
  const wb = new Excel.Workbook();
  await wb.xlsx.load(bytes);
  const rows = complianceRows(bid);
  const byRef = new Map(rows.map((r) => [r.ref.toLowerCase(), r]));
  const report = { sheet: null, headerRow: null, matched: {}, filled: 0, unmatchedRows: [] };
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
      const cells = ws.getRow(r).values.map((v) => (typeof v === 'object' && v?.richText ? v.richText.map((t) => t.text).join('') : String(v ?? '')).trim());
      const cols = {};
      cells.forEach((v, i) => { if (!v) return; for (const [k, re] of Object.entries(MATCHERS)) if (!cols[k] && re.test(v)) { cols[k] = i; break; } });
      if (cols.ref && (cols.compliance || cols.response)) {
        report.sheet = ws.name; report.headerRow = r; report.matched = Object.fromEntries(Object.entries(cols).map(([k, i]) => [k, cells[i]]));
        for (let rr = r + 1; rr <= ws.rowCount; rr++) {
          const row = ws.getRow(rr);
          const ref = String(row.getCell(cols.ref).value ?? '').trim();
          if (!ref) continue;
          const req = byRef.get(ref.toLowerCase());
          if (!req) { report.unmatchedRows.push(ref); continue; }
          if (cols.compliance) row.getCell(cols.compliance).value = req.compliance;
          if (cols.response && cols.response !== cols.compliance) row.getCell(cols.response).value = `Addressed in: ${req.sections || 'see response'}${req.evidence ? `. ${req.evidence}` : ''}`;
          if (cols.sections && cols.sections !== cols.response) row.getCell(cols.sections).value = req.sections;
          if (cols.evidence) row.getCell(cols.evidence).value = req.evidence;
          report.filled++;
        }
        return { bytes: new Uint8Array(await wb.xlsx.writeBuffer()), report };
      }
    }
  }
  throw new Error('No header row with a requirement reference column and a compliance or response column was found in the first 30 rows.');
}

const PRICE_MATCHERS = {
  role: /^(role|position|labour category|personnel category|resource|category|title)\b/i,
  level: /^(level|seniority|grade|classification)\b/i,
  name: /(name|nominated|personnel|consultant)/i,
  days: /^(estimated\s+)?(days|no\.? of days|number of days|quantity|qty|effort)\b/i,
  rate: /(day rate|daily rate|rate|unit price)/i,
  amount: /(amount|total|price|extended|cost)/i,
};
const cellText = (v) => (typeof v === 'object' && v?.richText ? v.richText.map((t) => t.text).join('') : typeof v === 'object' && v?.result !== undefined ? String(v.result) : String(v ?? '')).trim();

// Fills the client's own pricing schedule (PR-07): finds the header row by its headings, then writes one row per
// priced line, matching rows the client pre-filled with roles or levels, with live Excel formulas for amounts.
export async function fillClientPricing(bytes, state, bid) {
  const Excel = await ExcelJS();
  const wb = new Excel.Workbook();
  await wb.xlsx.load(bytes);
  const p = computePricing(state, bid);
  const name = (l) => state.consultants.find((c) => c.id === l.consultantId)?.name || 'To be named';
  const report = { sheet: null, headerRow: null, matched: {}, filled: 0, added: 0, unmatched: [] };
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
      const cells = ws.getRow(r).values.map(cellText);
      const cols = {};
      cells.forEach((v, i) => {
        if (!v) return;
        for (const [k, re] of Object.entries(PRICE_MATCHERS)) if (!cols[k] && re.test(v) && !Object.values(cols).includes(i)) { cols[k] = i; break; }
      });
      if (!((cols.role || cols.level) && cols.rate)) continue;
      report.sheet = ws.name; report.headerRow = r; report.matched = Object.fromEntries(Object.entries(cols).map(([k, i]) => [k, cells[i]]));
      const colLetter = (i) => ws.getColumn(i).letter;
      const pending = [...p.lines];
      let last = r;
      // Rows the client pre-filled (a role or level with no amount yet) are matched first.
      for (let rr = r + 1; rr <= ws.rowCount; rr++) {
        const row = ws.getRow(rr);
        const label = cellText(row.getCell(cols.role || cols.level).value);
        if (!label) continue;
        if (/^(sub-?total|total|gst)/i.test(label)) break;
        last = rr;
        const i = pending.findIndex((l) => [l.role, l.level].some((x) => x && (x.toLowerCase() === label.toLowerCase() || label.toLowerCase().includes(x.toLowerCase()))));
        if (i < 0) { report.unmatched.push(label); continue; }
        const l = pending.splice(i, 1)[0];
        if (cols.name) row.getCell(cols.name).value = name(l);
        if (cols.days) row.getCell(cols.days).value = l.days;
        row.getCell(cols.rate).value = l.rate;
        if (cols.amount) row.getCell(cols.amount).value = cols.days ? { formula: `${colLetter(cols.days)}${rr}*${colLetter(cols.rate)}${rr}`, result: l.sell } : l.sell;
        report.filled++;
      }
      // Remaining lines go into the rows after the last used one.
      for (const l of pending) {
        last += 1;
        const row = ws.getRow(last);
        if (cols.role) row.getCell(cols.role).value = l.role || l.level;
        if (cols.level && cols.level !== cols.role) row.getCell(cols.level).value = l.level;
        if (cols.name) row.getCell(cols.name).value = name(l);
        if (cols.days) row.getCell(cols.days).value = l.days;
        row.getCell(cols.rate).value = l.rate;
        if (cols.amount) row.getCell(cols.amount).value = cols.days ? { formula: `${colLetter(cols.days)}${last}*${colLetter(cols.rate)}${last}`, result: l.sell } : l.sell;
        report.added++;
      }
      if (cols.amount) {
        const a = colLetter(cols.amount);
        const labelCol = cols.role || cols.level;
        const put = (offset, label, formula, result) => { const row = ws.getRow(last + offset); row.getCell(labelCol).value = label; row.getCell(cols.amount).value = { formula, result }; row.font = { bold: true }; };
        put(2, 'Subtotal (ex GST)', `SUM(${a}${r + 1}:${a}${last})`, p.labour);
        put(3, `GST (${Math.round(p.gstRate * 100)}%)`, `${a}${last + 2}*${p.gstRate}`, round(p.labour * p.gstRate));
        put(4, 'Total (inc GST)', `${a}${last + 2}+${a}${last + 3}`, round(p.labour * (1 + p.gstRate)));
      }
      return { bytes: new Uint8Array(await wb.xlsx.writeBuffer()), report };
    }
  }
  throw new Error('No header row with a role or level column and a rate column was found in the first 30 rows.');
}
const round = (n) => Math.round(n * 100) / 100;

// Generic export of a dashboard view (section 12: every view exports to Excel).
export async function tableWorkbook(sheets) {
  const Excel = await ExcelJS();
  const wb = new Excel.Workbook();
  wb.creator = 'CTO Consulting';
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.columns = s.columns.map((c) => ({ header: c.label, key: c.key, width: c.width || 18 }));
    for (const r of s.rows) ws.addRow(Object.fromEntries(s.columns.map((c) => [c.key, typeof c.get === 'function' ? c.get(r) : r[c.key]])));
    styleHeader(ws);
    wrap(ws);
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
