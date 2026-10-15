import { useState } from 'react';
import { useApp, personName } from '../lib/store.jsx';
import { PageHead, Card, Drawer, Field, TextInput, TextArea, NumberInput, Select, PersonSelect, Pill, Modal, Stat, Guidance } from '../components/ui.jsx';
import { parseCSV, downloadBlob, downloadCSV } from '../lib/exporters.js';
import { uid, pct, num } from '../lib/util.js';

export default function Measures() {
  const { ws, mutate } = useApp();
  const [open, setOpen] = useState(null);
  const [imp, setImp] = useState(false);
  const usage = (m) => ws.programs.flatMap((p) => p.benefits.filter((b) => b.measureId === m.id).map((b) => ({ p, b })));
  const outcomes = ws.programs.filter((p) => p.state !== 'withdrawn').flatMap((p) => p.chain.elements.filter((e) => e.kind === 'outcome').map((e) => ({ p, e })));
  const measured = outcomes.filter(({ p, e }) => p.benefits.some((b) => b.outcomeId === e.id && b.measureId) || e.measureIds?.length);
  const m = ws.measures.find((x) => x.id === open);
  const idx = ws.measures.indexOf(m);
  const set = (k) => (v) => {
    if (k === 'active' && v && !m.ownerId) { window.alert('A measure cannot become active without an accountable owner (MEA-03).'); return; }
    mutate(`Measure “${m.name}”: ${k}`, (d) => { d.measures[idx][k] = v; }, { object: 'measure', objectId: m.id, field: `${m.id}:${k}`, before: m[k], after: v });
  };
  return (
    <div className="stack">
      <PageHead eyebrow="Governance" title="Measure library" actions={<><button className="btn dl" onClick={() => downloadCSV(ws.measures, [{ label: 'Measure', get: (x) => x.name }, { label: 'Definition', get: (x) => x.definition }, { label: 'Unit', get: (x) => x.unit }, { label: 'Level', get: (x) => x.level }, { label: 'Direction', get: (x) => x.direction }, { label: 'Source', get: (x) => x.source }, { label: 'Method', get: (x) => x.method }, { label: 'Frequency', get: (x) => x.frequency }, { label: 'Owner', get: (x) => personName(ws, x.ownerId) }, { label: 'Quality (1-5)', get: (x) => x.quality }, { label: 'Baseline', get: (x) => x.baseline }], 'measure_library.csv')}>Export CSV</button><button className="btn" onClick={() => setImp(true)}>Import actuals</button><button className="btn btn-primary" onClick={() => { const id = uid('m'); mutate('Added measure', (d) => { d.measures.push({ id, name: 'New measure', unit: '', direction: 'increase', source: '', method: 'manual', frequency: 'Quarterly', ownerId: null, quality: 3, baseline: '', definition: '', level: 'numeric', formula: '', active: false }); }); setOpen(id); }}>+ Measure</button></>}>
        Make sure measures exist, measure the right things the right way, and use measurement to guide decisions. Every measured result has an accountable owner.
      </PageHead>
      <div className="kpi-grid">
        <Stat accent label="Measurement coverage (MEA-02)" value={pct(outcomes.length ? measured.length / outcomes.length : 0)} sub={`${measured.length} of ${outcomes.length} outcomes have a measure`} />
        <Stat label="Measures" value={ws.measures.length} sub={`${ws.measures.filter((x) => x.active !== false).length} active`} />
        <Stat label="Judgement or survey based" value={ws.measures.filter((x) => ['judgement', 'survey'].includes(x.method)).length} sub="labelled as subjective (VAL-14)" />
        <Stat label="Low quality (≤ 2)" value={ws.measures.filter((x) => (x.quality || 0) <= 2).length} sub="validity / reliability (MEA-12)" />
      </div>
      <Card pad={false}>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Measure</th><th>Unit</th><th>Level</th><th>Direction</th><th>Source and method</th><th>Frequency</th><th>Owner</th><th>Quality</th><th className="num">Used by</th><th>Status</th></tr></thead>
          <tbody>{ws.measures.map((x) => (
            <tr key={x.id} className="clickable" onClick={() => setOpen(x.id)}>
              <td><strong>{x.name}</strong><div className="mini clamp-2">{x.definition}</div></td><td>{x.unit}</td><td>{x.level}</td><td>{{ increase: '↑ Increase', decrease: '↓ Decrease', maintain: '→ Maintain' }[x.direction]}</td>
              <td className="small">{x.source}<div className="mini">{x.method}{['judgement', 'survey'].includes(x.method) ? ' · subjective' : ''}</div></td><td>{x.frequency}</td><td>{personName(ws, x.ownerId)}</td>
              <td><Pill tone={(x.quality || 0) >= 4 ? 'good' : (x.quality || 0) >= 3 ? 'none' : 'warning'}>{x.quality || '—'}/5</Pill></td>
              <td className="num">{usage(x).length}</td><td>{x.active !== false ? <Pill tone="good">Active</Pill> : <Pill tone="none">Inactive</Pill>}{x.blindSpot && <div className="mini">Blind spot noted</div>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
      {m && (
        <Drawer title={m.name} subtitle="Measure" onClose={() => setOpen(null)}>
          <div className="form-grid">
            <Field label="Name" className="full"><TextInput value={m.name} onChange={set('name')} /></Field>
            <Field label="Definition" className="full"><TextArea value={m.definition} onChange={set('definition')} rows={2} /></Field>
            <Field label="Formula" className="full"><TextInput value={m.formula} onChange={set('formula')} /></Field>
            <Field label="Unit"><TextInput value={m.unit} onChange={set('unit')} /></Field>
            <Field label="Level of measurement (MEA-04)"><Select value={m.level} onChange={set('level')} options={[['binary', 'Binary (yes/no)'], ['ordinal', 'Ordinal (ranked scale)'], ['numeric', 'Numeric']]} /></Field>
            <Field label="Direction"><Select value={m.direction} onChange={set('direction')} options={[['increase', 'Increase'], ['decrease', 'Decrease'], ['maintain', 'Maintain']]} /></Field>
            <Field label="Collection method"><Select value={m.method} onChange={set('method')} options={['automated', 'manual', 'survey', 'judgement']} /></Field>
            <Field label="Source system"><TextInput value={m.source} onChange={set('source')} /></Field>
            <Field label="Frequency"><Select value={m.frequency} onChange={set('frequency')} options={['Monthly', 'Quarterly', 'Six-monthly', 'Annually']} /></Field>
            <Field label="Data owner (accountable)"><PersonSelect ws={ws} value={m.ownerId} onChange={set('ownerId')} /></Field>
            <Field label="Baseline"><NumberInput value={m.baseline} onChange={set('baseline')} /></Field>
            <Field label="Quality rating (validity and reliability, 1–5)"><NumberInput value={m.quality} onChange={set('quality')} min={1} max={5} /></Field>
            <label className="check"><input type="checkbox" checked={m.active !== false} onChange={(e) => set('active')(e.target.checked)} /> Active</label>
            {m.method === 'survey' && <><Field label="Survey instrument"><TextInput value={m.instrument} onChange={set('instrument')} /></Field><Field label="Sample size"><NumberInput value={m.sample} onChange={set('sample')} /></Field><Field label="Scale"><TextInput value={m.scale} onChange={set('scale')} placeholder="e.g. 1–10" /></Field></>}
            <Field label="Measurement blind spot (MEA-05)" className="full"><TextArea value={m.blindSpot} onChange={set('blindSpot')} rows={2} placeholder="Where this cannot be measured adequately" /></Field>
            <Field label="Compensating approach" className="full"><TextArea value={m.compensating} onChange={set('compensating')} rows={2} placeholder="e.g. structured discussions with the people involved" /></Field>
          </div>
          <div className="section-title">Used by</div>
          {usage(m).map(({ p, b }) => <div key={b.id} className="mini">• {p.code} {b.title} (attribution {pct(b.attribution ?? 1)})</div>)}
          {!usage(m).length && <div className="mini">Not used yet.</div>}
        </Drawer>
      )}
      {imp && <ImportActuals onClose={() => setImp(false)} />}
    </div>
  );
}

const TEMPLATE = 'program,benefit,period,value\nPRG-003,Broker-submitted new business increased,2026-Q4,250000\n';
function ImportActuals({ onClose }) {
  const { ws, mutate } = useApp();
  const [rows, setRows] = useState(null);
  const read = async (f) => {
    const data = parseCSV(await f.text());
    setRows(data.map((r, i) => {
      const p = ws.programs.find((x) => x.code === r.program || x.name === r.program);
      const b = p?.benefits.find((x) => x.id === r.benefit || x.title.toLowerCase() === (r.benefit || '').toLowerCase());
      const err = !p ? 'Unknown program' : !b ? 'Unknown benefit' : !/^\d{4}-Q[1-4]$/.test(r.period || '') ? 'Period must be YYYY-Qn' : r.value === '' || Number.isNaN(Number(r.value)) ? 'Value is not a number' : null;
      return { ...r, line: i + 2, p, b, err };
    }));
  };
  const good = (rows || []).filter((r) => !r.err);
  return (
    <Modal title="Import measurement actuals (MEA-06, ADM-09)" wide onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!good.length} onClick={() => { mutate(`Imported ${good.length} actuals`, (d) => { for (const r of good) { const b = d.programs.find((x) => x.id === r.p.id).benefits.find((x) => x.id === r.b.id); const existing = b.actuals.find((a) => a.period === r.period); if (existing) { existing.value = Number(r.value); existing.provenance = 'Imported'; } else b.actuals.push({ period: r.period, value: Number(r.value), provenance: 'Imported' }); } }, { action: 'import' }); onClose(); }}>Import {good.length} rows</button></>}>
      <p>CSV with columns <code>program</code> (code or name), <code>benefit</code> (title or id), <code>period</code> (YYYY-Qn) and <code>value</code>. Imports are idempotent: a second import of the same period replaces the value. Rows that fail validation are quarantined with a readable error.</p>
      <div className="row"><input type="file" accept=".csv" onChange={(e) => e.target.files[0] && read(e.target.files[0])} aria-label="CSV file" /><button className="btn btn-sm dl" onClick={() => downloadBlob(TEMPLATE, 'actuals_template.csv', 'text/csv')}>Download template</button></div>
      {rows && <div className="table-wrap" style={{ marginTop: 10, maxHeight: 300 }}><table className="table compact"><thead><tr><th>Line</th><th>Program</th><th>Benefit</th><th>Period</th><th className="num">Value</th><th>Result</th></tr></thead><tbody>{rows.map((r) => <tr key={r.line}><td>{r.line}</td><td>{r.program}</td><td>{r.benefit}</td><td>{r.period}</td><td className="num">{num(Number(r.value), 2)}</td><td>{r.err ? <Pill tone="critical">{r.err}</Pill> : <Pill tone="good">OK</Pill>}</td></tr>)}</tbody></table></div>}
      <Guidance>Missing data shows as a data-quality gap, never as zero.</Guidance>
    </Modal>
  );
}
