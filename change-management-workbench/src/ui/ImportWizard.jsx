// Spreadsheet import for any register (INT-009, STK-047, AC-06): download a template with instructions and
// allowed values, upload a completed Excel or CSV file, match its columns to fields, validate every row
// (with duplicate detection for stakeholders), decide what happens to each possible duplicate, then import.
import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { Card, Badge, Empty } from './core.jsx';
import { selectOptions } from './fields.jsx';
import { useApp, useToast } from '../state/app.jsx';
import { useMutator } from '../state/initiative.jsx';
import { saveBlob } from '../data/client.js';
import { entity, fieldsOf } from '../../shared/schema.js';
import { asArray, parseCsv } from '../../shared/util.js';

const MAX_ROWS = 5000;
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The fields a spreadsheet can fill (the same rule the service applies).
export function importFields(type, config) {
  return fieldsOf(type, config).filter((f) => !f.system && !f.readOnly && !f.hidden && !['json', 'table', 'richtext'].includes(f.type) && f.key !== 'initiativeId');
}

function formatHint(f) {
  switch (f.type) {
    case 'date': return 'Date as DD/MM/YYYY';
    case 'datetime': return 'Date and time as DD/MM/YYYY HH:MM';
    case 'time': return 'Time as HH:MM (24-hour)';
    case 'int': return 'Whole number';
    case 'number': case 'money': return 'Number';
    case 'bool': return 'Yes or No';
    case 'select': return 'One of the allowed values';
    case 'multi': case 'adkar': return 'One or more allowed values, separated by semicolons';
    case 'ref': return `Name, code or email of an existing ${entity(f.ref).label.toLowerCase()}`;
    case 'refs': return `Names, codes or emails of existing ${entity(f.ref).plural.toLowerCase()}, separated by semicolons`;
    case 'user': return 'Name or email of a user';
    case 'users': return 'Names or emails of users, separated by semicolons';
    case 'email': return 'Email address';
    default: return 'Text';
  }
}

async function downloadTemplate(type, fields, config) {
  const { default: ExcelJS } = await import('exceljs');
  const meta = entity(type);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Change Management Workbench';
  const ws = wb.addWorksheet(meta.plural.slice(0, 30));
  const lists = wb.addWorksheet('Allowed values');
  const help = wb.addWorksheet('Instructions');
  ws.columns = fields.map((f) => ({ header: f.label, key: f.key, width: Math.min(40, Math.max(14, f.label.length + 4)) }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2545' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  // Allowed values for each list field, offered as a drop-down in the column.
  let col = 0;
  fields.forEach((f, i) => {
    const opts = ['select', 'multi'].includes(f.type) ? selectOptions(f, { config }) : f.type === 'bool' ? [{ label: 'Yes' }, { label: 'No' }] : f.type === 'adkar' ? ['Awareness', 'Desire', 'Knowledge', 'Ability', 'Reinforcement'].map((label) => ({ label })) : null;
    if (!opts?.length) return;
    col++;
    const letter = lists.getColumn(col).letter;
    lists.getCell(`${letter}1`).value = f.label;
    lists.getCell(`${letter}1`).font = { bold: true };
    opts.forEach((o, j) => { lists.getCell(`${letter}${j + 2}`).value = o.label; });
    lists.getColumn(col).width = Math.max(18, f.label.length + 4);
    if (f.type === 'select' || f.type === 'bool') {
      const target = ws.getColumn(i + 1).letter;
      for (let r = 2; r <= 501; r++) ws.getCell(`${target}${r}`).dataValidation = { type: 'list', allowBlank: !f.required, formulae: [`'Allowed values'!$${letter}$2:$${letter}$${opts.length + 1}`], showErrorMessage: true, errorTitle: f.label, error: 'Choose one of the allowed values.' };
    }
  });
  help.columns = [{ header: 'Column', key: 'label', width: 34 }, { header: 'Required', key: 'req', width: 10 }, { header: 'What to enter', key: 'hint', width: 60 }];
  help.getRow(1).font = { bold: true };
  for (const f of fields) help.addRow({ label: f.label, req: f.required ? 'Yes' : '', hint: `${formatHint(f)}${f.sensitive ? '. Sensitive: only people permitted to record it can import it' : ''}` });
  help.addRow({});
  help.addRow({ label: 'How the import works' });
  help.lastRow.font = { bold: true };
  for (const line of [
    'Enter one record per row in the first sheet. Keep the column headings; you may delete columns you do not need.',
    'Upload the file, check how the columns were matched, then validate. Nothing is saved until you choose Import.',
    type === 'stakeholder' ? 'Rows that match an existing stakeholder by email, or by name and organisation, are shown as possible duplicates: skip them, update the existing record, or create a new one.' : 'Rows with errors are listed with the reason and are not imported.',
    'Do not record sensitive information such as health details, union membership or religious beliefs in free-text columns.',
  ]) help.addRow({ label: line });
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${meta.plural} import template.xlsx`);
}

// Excel cell values as the text a person would type.
function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) {
    const iso = v.toISOString();
    const hasTime = !/T00:00:00/.test(iso);
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}${hasTime ? ` ${iso.slice(11, 16)}` : ''}`;
  }
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text != null) return String(v.text);
    if (v.result != null) return cellText(v.result);
    if (v.hyperlink) return String(v.hyperlink);
    return '';
  }
  return String(v);
}

async function readFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv' || ext === 'txt') {
    const [headers = [], ...rows] = parseCsv((await file.text()).replace(/^﻿/, ''));
    return { headers: headers.map((h) => String(h).trim()), rows };
  }
  if (ext !== 'xlsx') throw new Error('Upload an Excel workbook (.xlsx) or a CSV file.');
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets.find((w) => w.state !== 'hidden' && w.name !== 'Instructions' && w.name !== 'Allowed values') || wb.worksheets[0];
  if (!ws) throw new Error('The workbook has no worksheets.');
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { headers[i - 1] = cellText(c.value).trim(); });
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    rows.push(headers.map((_, i) => cellText(row.getCell(i + 1).value)));
  }
  return { headers, rows };
}

export default function ImportWizard({ type, initiativeId, onDone }) {
  const { api, config } = useApp();
  const mut = useMutator();
  const toast = useToast();
  const meta = entity(type);
  const fields = useMemo(() => importFields(type, config), [type, config]);
  const [file, setFile] = useState(null);
  const [table, setTable] = useState(null);
  const [mapping, setMapping] = useState([]);
  const [report, setReport] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);
  const reset = () => { setFile(null); setTable(null); setMapping([]); setReport(null); setDecisions({}); setResult(null); setError(null); };

  const upload = async (f) => {
    reset();
    if (!f) return;
    setBusy('read');
    try {
      const t = await readFile(f);
      // Blank rows are left out; each kept row remembers its row number in the spreadsheet.
      const kept = t.rows.map((r, i) => ({ r, n: i + 2 })).filter(({ r }) => r.some((v) => String(v ?? '').trim() !== ''));
      if (!t.headers.some(Boolean)) throw new Error('The first row must hold the column headings.');
      if (kept.length > MAX_ROWS) throw new Error(`The file has ${kept.length} rows; import at most ${MAX_ROWS} at a time.`);
      setFile(f);
      setTable({ headers: t.headers, rows: kept.map((x) => x.r), rowNumbers: kept.map((x) => x.n) });
      setMapping(t.headers.map((h) => fields.find((fd) => norm(fd.label) === norm(h) || norm(fd.key) === norm(h))?.key || ''));
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  const missing = fields.filter((f) => f.required && !mapping.includes(f.key));
  const dupeMap = mapping.filter((k, i) => k && mapping.indexOf(k) !== i);
  const records = () => table.rows.map((r) => Object.fromEntries(mapping.map((k, i) => [k, r[i]]).filter(([k]) => k)));

  const validate = async () => {
    setBusy('validate'); setError(null);
    try {
      const r = await api.op('importRecords', { type, initiativeId, rows: records(), mode: 'validate' });
      setReport(r);
      setDecisions(Object.fromEntries(r.report.filter((x) => x.status === 'duplicate').map((x) => [x.row, 'skip'])));
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  const commit = async () => {
    setBusy('commit'); setError(null);
    try {
      const r = await mut.op('importRecords', { type, initiativeId, rows: records(), mode: 'commit', decisions }, { quiet: true });
      setResult(r.result);
      toast.success(`${r.result.created} created, ${r.result.merged} updated`);
      onDone?.(r.result);
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  return (
    <div className="stack">
      <Card title={`Import ${meta.plural.toLowerCase()}`} sub="Download the template, complete it in Excel, then upload it. Every row is checked before anything is saved.">
        <ol className="steps">
          <li><strong>Get the template.</strong> It lists every column, which are required, the allowed values (as drop-downs) and how to enter dates and references. <button type="button" className="btn btn-sm mt-2" onClick={() => downloadTemplate(type, fields, config).catch((e) => toast.error(e))}><Icon name="download" />Download the Excel template</button></li>
          <li><strong>Upload the completed file</strong> (.xlsx or .csv, up to {MAX_ROWS.toLocaleString('en-AU')} rows).
            <div className="mt-2"><label className="btn btn-sm file-btn"><Icon name="upload" />{file ? 'Choose another file' : 'Choose a file'}<input type="file" accept=".xlsx,.csv" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} /></label>{file && <span className="small muted" style={{ marginLeft: 10 }}>{file.name} · {table?.rows.length ?? 0} rows</span>}{busy === 'read' && <span className="small muted" style={{ marginLeft: 10 }}>Reading…</span>}</div>
          </li>
          <li><strong>Check the columns, validate, then import.</strong></li>
        </ol>
        {error && <div className="callout bad mt-3" role="alert">{error}</div>}
      </Card>

      {table && !result && (
        <Card title="Match the columns" sub={`${table.headers.filter(Boolean).length} columns found. Columns matched by heading are filled in; choose a field for any others, or ignore them.`} flush>
          <div className="table-wrap">
            <table className="tbl tbl-compact">
              <thead><tr><th>Column in your file</th><th>First value</th><th>Imports into</th></tr></thead>
              <tbody>
                {table.headers.map((h, i) => (
                  <tr key={i}>
                    <td><strong>{h || <span className="muted">(no heading)</span>}</strong></td>
                    <td className="small muted">{table.rows.find((r) => r[i])?.[i] || '—'}</td>
                    <td>
                      <select aria-label={`Field for column ${h || i + 1}`} value={mapping[i] || ''} onChange={(e) => { const m = [...mapping]; m[i] = e.target.value; setMapping(m); setReport(null); }}>
                        <option value="">Ignore this column</option>
                        {fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required ? ' (required)' : ''}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-pad">
            {missing.length > 0 && <p className="small" style={{ color: 'var(--st-warning-ink)', margin: '0 0 8px' }}>Required fields not in the file: {missing.map((f) => f.label).join(', ')}. Rows without them will fail validation unless the field has a default.</p>}
            {dupeMap.length > 0 && <p className="small" style={{ color: 'var(--st-critical-ink)', margin: '0 0 8px' }}>More than one column imports into {fields.filter((f) => dupeMap.includes(f.key)).map((f) => f.label).join(', ')}.</p>}
            <button type="button" className="btn btn-primary" disabled={!!busy || dupeMap.length > 0 || !mapping.some(Boolean)} onClick={validate}><Icon name="checkCircle" />{busy === 'validate' ? 'Validating…' : `Validate ${table.rows.length} rows`}</button>
          </div>
        </Card>
      )}

      {report && !result && (
        <Card title="Validation" sub="Nothing has been saved yet." flush>
          <div className="card-pad row" style={{ gap: 8 }}>
            <Badge tone="good" icon="checkCircle">{report.summary.ok} ready</Badge>
            {report.summary.duplicates > 0 && <Badge tone="warning" icon="copy">{report.summary.duplicates} possible duplicates</Badge>}
            {report.summary.errors > 0 && <Badge tone="critical" icon="alert">{report.summary.errors} with errors (not imported)</Badge>}
          </div>
          {report.report.some((r) => r.status !== 'ok') ? (
            <div className="table-wrap">
              <table className="tbl tbl-compact">
                <thead><tr><th className="num">Row</th><th>Status</th><th>Detail</th><th>What to do</th></tr></thead>
                <tbody>
                  {report.report.filter((r) => r.status !== 'ok').map((r) => (
                    <tr key={r.row}>
                      <td className="num">{table.rowNumbers[r.row - 1]}</td>
                      <td>{r.status === 'error' ? <Badge tone="critical">Error</Badge> : <Badge tone="warning">Possible duplicate</Badge>}</td>
                      <td className="small">{r.status === 'error' ? asArray(r.errors).join('; ') : `${r.duplicateOf.reason}: ${r.duplicateOf.name}${r.duplicateOf.code ? ` (${r.duplicateOf.code})` : ''}`}</td>
                      <td>
                        {r.status === 'duplicate' ? (
                          <select aria-label={`Action for row ${table.rowNumbers[r.row - 1]}`} value={decisions[r.row] || 'skip'} onChange={(e) => setDecisions({ ...decisions, [r.row]: e.target.value })}>
                            <option value="skip">Skip this row</option>
                            {!r.duplicateOf.inFile && <option value="merge">Update the existing record</option>}
                            <option value="create">Create a new record anyway</option>
                          </select>
                        ) : <span className="small muted">Correct the file and upload it again</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="card-pad small">Every row is ready to import.</div>}
          <div className="card-pad"><button type="button" className="btn btn-primary" disabled={!!busy || report.summary.ok + report.summary.duplicates === 0} onClick={commit}><Icon name="upload" />{busy === 'commit' ? 'Importing…' : 'Import'}</button></div>
        </Card>
      )}

      {result && (
        <Card title="Import complete">
          <div className="row" style={{ gap: 8 }}>
            <Badge tone="good">{result.created} created</Badge>
            <Badge tone="info">{result.merged} existing records updated</Badge>
            <Badge>{result.skipped} skipped</Badge>
            {result.failed > 0 && <Badge tone="critical">{result.failed} failed</Badge>}
          </div>
          {asArray(result.details).length > 0 && <ul className="small mt-2">{result.details.map((d) => <li key={d.row}>Row {table.rowNumbers[d.row - 1]}: {d.error}</li>)}</ul>}
          <p className="small muted mt-2">The import is recorded in the audit trail.</p>
          <button type="button" className="btn btn-sm mt-2" onClick={reset}>Import another file</button>
        </Card>
      )}
      {!table && !result && !error && <Empty icon="upload" title="No file chosen yet">Choose a completed template, or any spreadsheet with column headings that match the field names.</Empty>}
    </div>
  );
}
