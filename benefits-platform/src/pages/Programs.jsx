import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, personName, categoryOf } from '../lib/store.jsx';
import { STATES, stateOf } from '../lib/config.js';
import { summaries, createProgram } from '../lib/portfolio.js';
import { Card, PageHead, Pill, RiskIcon, Seg, Modal, Field, TextInput, TextArea, Select, PersonSelect, includesAll, useToast } from '../components/ui.jsx';
import { money, fmtDate, uid } from '../lib/util.js';
import { healthTone } from '../lib/scoring.js';
import { downloadCSV, downloadBlob, parseCSV } from '../lib/exporters.js';

export const StatePill = ({ state }) => { const s = stateOf(state); return <span className="pill" style={{ background: '#f0f3f7' }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} aria-hidden />{s.label}</span>; };
export const HealthPill = ({ score }) => (score === null || score === undefined ? <Pill tone="none">No data</Pill> : <Pill tone={healthTone(score)}>{Math.round(score)}</Pill>);

export default function Programs() {
  const { ws, mutate } = useApp();
  const nav = useNavigate();
  const s = summaries(ws);
  const [view, setView] = useState('pipeline');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sort, setSort] = useState(['code', 1]);
  const [toast, toastNode] = useToast();

  const rows = useMemo(() => ws.programs.filter((p) => (!cat || p.categoryId === cat) && includesAll(`${p.code} ${p.name} ${p.purpose} ${personName(ws, p.sponsorId)}`, q)), [ws, q, cat]);
  const sorted = useMemo(() => {
    const [k, dir] = sort;
    const val = (p) => ({ code: p.code, name: p.name, state: STATES.findIndex((x) => x.id === p.state), npv: s.get(p.id).fin.npv, cost: s.get(p.id).lifetimeCost, risk: s.get(p.id).risk.overall ?? -1, align: s.get(p.id).align.score ?? -1, health: s.get(p.id).health.score ?? -1 })[k];
    return rows.slice().sort((a, b) => (val(a) > val(b) ? dir : val(a) < val(b) ? -dir : 0));
  }, [rows, sort, s]);
  const th = (k, label, cls = '') => <th className={cls} style={{ cursor: 'pointer' }} onClick={() => setSort([k, sort[0] === k ? -sort[1] : 1])} aria-sort={sort[0] === k ? (sort[1] > 0 ? 'ascending' : 'descending') : 'none'}>{label}{sort[0] === k ? (sort[1] > 0 ? ' ▲' : ' ▼') : ''}</th>;

  const exportCsv = () => downloadCSV(sorted, [
    { label: 'Code', get: (p) => p.code }, { label: 'Program', get: (p) => p.name }, { label: 'Category', get: (p) => categoryOf(ws, p.categoryId)?.name },
    { label: 'State', get: (p) => stateOf(p.state).label }, { label: 'Sponsor', get: (p) => personName(ws, p.sponsorId) }, { label: 'Program manager', get: (p) => personName(ws, p.managerId) },
    { label: 'Lifetime cost (model)', get: (p) => Math.round(s.get(p.id).fin.totalCosts) }, { label: 'NPV', get: (p) => Math.round(s.get(p.id).fin.npv) }, { label: 'BCR', get: (p) => s.get(p.id).fin.bcr?.toFixed(2) },
    { label: 'Risk score', get: (p) => s.get(p.id).risk.overall?.toFixed(0) }, { label: 'Alignment score', get: (p) => s.get(p.id).align.score?.toFixed(0) }, { label: 'Health', get: (p) => s.get(p.id).health.score?.toFixed(0) },
    { label: 'Projects', get: (p) => p.projects.length }, { label: 'Benefits', get: (p) => p.benefits.length },
  ], 'programs.csv');

  return (
    <div className="stack">
      <PageHead eyebrow="Investments" title="Programs and projects" actions={<>
        <button className="btn dl" onClick={exportCsv}>Export CSV</button>
        <button className="btn" onClick={() => setImporting(true)}>Import project inventory</button>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New program</button>
      </>}>
        Projects deliver capabilities; programs deliver benefits. Every project belongs to exactly one blended program (business, technology, organisation, process and people), managed from concept to cash.
      </PageHead>

      <div className="filters">
        <input type="search" placeholder="Search programs, sponsors…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search programs" />
        <Select value={cat} onChange={setCat} placeholder="All categories" options={ws.categories.map((c) => [c.id, c.name])} aria-label="Category" />
        <div className="spacer" style={{ flex: 1 }} />
        <Seg value={view} onChange={setView} options={[['pipeline', 'Pipeline'], ['table', 'Table']]} label="View" />
      </div>

      {view === 'pipeline' ? (
        <div className="kanban" role="list" aria-label="Pipeline by lifecycle state">
          {STATES.filter((st) => st.id !== 'idea').map((st) => {
            const items = rows.filter((p) => p.state === st.id);
            return (
              <div className="kan-col" key={st.id} role="listitem">
                <h4><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: st.color, marginRight: 6 }} />{st.label}</span><span>{items.length}</span></h4>
                {items.map((p) => {
                  const x = s.get(p.id);
                  return (
                    <div key={p.id} className="kan-card" tabIndex={0} role="button" onClick={() => nav(`/programs/${p.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/programs/${p.id}`)}>
                      <div className="mini prog-code">{p.code}</div>
                      <div className="t">{p.name}</div>
                      <div className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
                        <span className="mini">{categoryOf(ws, p.categoryId)?.name}</span>
                        <RiskIcon byAre={x.risk.byAre} ws={ws} size={22} />
                      </div>
                      <div className="row mini" style={{ justifyContent: 'space-between', marginTop: 4 }}>
                        <span>NPV <strong className={x.fin.npv < 0 ? 'neg' : ''}>{money(x.fin.npv)}</strong></span>
                        <span>{x.errors ? <span className="sev-error">✕ {x.errors}</span> : null} {x.warnings ? <span className="sev-warning">! {x.warnings}</span> : null}</span>
                      </div>
                      {x.next && <div className="mini" style={{ marginTop: 4 }}>Next: {x.next.gate} · {fmtDate(x.next.planned)}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <Card pad={false}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr>{th('code', 'Code')}{th('name', 'Program')}<th>Category</th>{th('state', 'State')}<th>Sponsor</th>{th('cost', 'Lifetime cost', 'num')}{th('npv', 'NPV', 'num')}{th('risk', 'Risk')}{th('align', 'Alignment', 'num')}{th('health', 'Health')}<th>Next gate</th><th>Checks</th></tr></thead>
              <tbody>
                {sorted.map((p) => {
                  const x = s.get(p.id);
                  return (
                    <tr key={p.id} className="clickable" onClick={() => nav(`/programs/${p.id}`)}>
                      <td className="prog-code">{p.code}</td>
                      <td><strong>{p.name}</strong><div className="mini">{p.projects.length} projects · {p.benefits.length} benefits</div></td>
                      <td>{categoryOf(ws, p.categoryId)?.name}</td>
                      <td><StatePill state={p.state} /></td>
                      <td>{personName(ws, p.sponsorId)}</td>
                      <td className="num">{money(x.lifetimeCost)}</td>
                      <td className={`num ${x.fin.npv < 0 ? 'neg' : ''}`}>{money(x.fin.npv)}</td>
                      <td><RiskIcon byAre={x.risk.byAre} ws={ws} size={24} /></td>
                      <td className="num">{x.align.score === null ? '—' : Math.round(x.align.score)}</td>
                      <td><HealthPill score={x.health.score} /></td>
                      <td>{x.next ? `${x.next.gate} · ${fmtDate(x.next.planned)}` : '—'}</td>
                      <td className="nowrap">{x.errors ? <span className="sev-error">✕ {x.errors} </span> : null}{x.warnings ? <span className="sev-warning">! {x.warnings}</span> : null}{!x.errors && !x.warnings ? <span className="pos">✓</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {creating && <NewProgram onClose={() => setCreating(false)} onCreate={(fields) => {
        const p = createProgram(ws, fields);
        mutate(`Created program ${p.code} ${p.name}`, (d) => { d.programs.push(p); }, { action: 'create', object: 'program', objectId: p.id, programId: p.id });
        setCreating(false);
        nav(`/programs/${p.id}`);
      }} />}
      {importing && <ImportInventory onClose={() => setImporting(false)} onDone={(n) => { setImporting(false); toast(`Imported ${n} projects`); }} />}
      {toastNode}
    </div>
  );
}

function NewProgram({ onClose, onCreate }) {
  const { ws } = useApp();
  const [f, setF] = useState({ name: '', categoryId: 'opportunity', sponsorId: '', managerId: '', purpose: '', problem: '' });
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const cat = ws.categories.find((c) => c.id === f.categoryId);
  return (
    <Modal title="New program" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!f.name.trim()} onClick={() => onCreate({ ...f, sponsorId: f.sponsorId || null, managerId: f.managerId || null })}>Create program</button></>}>
      <div className="form-grid">
        <Field label="Program name" className="full"><TextInput value={f.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Investment category"><Select value={f.categoryId} onChange={set('categoryId')} options={ws.categories.map((c) => [c.id, c.name])} /></Field>
        <Field label="Business sponsor" hint="required before Initiation"><PersonSelect ws={ws} value={f.sponsorId} onChange={set('sponsorId')} /></Field>
        <Field label="Program manager"><PersonSelect ws={ws} value={f.managerId} onChange={set('managerId')} /></Field>
        <Field label="Problem or opportunity" className="full"><TextArea value={f.problem} onChange={set('problem')} /></Field>
        <Field label="Purpose" className="full"><TextArea value={f.purpose} onChange={set('purpose')} /></Field>
      </div>
      {cat && <div className="guidance" style={{ marginTop: 12 }}><strong>{cat.name} ({cat.freedom} freedom):</strong> {cat.path}</div>}
    </Modal>
  );
}

const TEMPLATE = 'project,program,project_manager,status,budget,actual_cost,start,end,sponsor\nCRM upgrade,Customer experience,Jane Citizen,green,450000,120000,2026-07-01,2027-03-31,Priya Raman\n';
function ImportInventory({ onClose, onDone }) {
  const { ws, mutate } = useApp();
  const [rows, setRows] = useState(null);
  const [errors, setErrors] = useState([]);
  const file = useRef(null);
  const read = async (f) => {
    const text = await f.text();
    const data = parseCSV(text);
    const errs = [];
    const ok = data.filter((r, i) => {
      if (!r.project || !r.program) { errs.push(`Row ${i + 2}: project and program are required`); return false; }
      if (r.budget && Number.isNaN(Number(r.budget))) { errs.push(`Row ${i + 2}: budget is not a number`); return false; }
      return true;
    });
    setRows(ok); setErrors(errs);
  };
  const apply = () => {
    mutate(`Imported ${rows.length} projects from inventory`, (d) => {
      for (const r of rows) {
        let p = d.programs.find((x) => x.name.toLowerCase() === r.program.trim().toLowerCase());
        if (!p) {
          const sponsor = d.people.find((x) => x.name.toLowerCase() === (r.sponsor || '').trim().toLowerCase());
          p = createProgram(d, { name: r.program.trim(), categoryId: 'committed', sponsorId: sponsor?.id || null, state: 'active' });
          d.programs.push(p);
        }
        const pm = d.people.find((x) => x.name.toLowerCase() === (r.project_manager || '').trim().toLowerCase());
        p.projects.push({ id: uid('prj'), name: r.project.trim(), sow: '', managerId: pm?.id || null, initiativeIds: [], capabilities: [], btopp: 'T', budget: Number(r.budget) || 0, actual: Number(r.actual_cost) || 0, forecast: Number(r.budget) || 0, start: r.start || null, end: r.end || null, baselineEnd: r.end || null, status: ['green', 'amber', 'red'].includes((r.status || '').toLowerCase()) ? r.status.toLowerCase() : 'green', gate: 'Execution', state: 'active', milestones: [], estimates: [], source: 'Imported' });
      }
    }, { action: 'import', object: 'project' });
    onDone(rows.length);
  };
  return (
    <Modal title="Import project inventory" onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!rows?.length} onClick={apply}>Import {rows?.length || ''} projects</button></>}>
      <p>Load an inventory of current and planned projects (CSV). Projects are grouped into programs by the <code>program</code> column; unknown programs are created in the <em>Already committed</em> category so they join the standard path at their next gate.</p>
      <div className="row"><input ref={file} type="file" accept=".csv,text/csv" onChange={(e) => e.target.files[0] && read(e.target.files[0])} aria-label="CSV file" /><button className="btn btn-sm dl" onClick={downloadTemplate}>Download template</button></div>
      {errors.length > 0 && <div className="callout warn" style={{ marginTop: 10 }}>{errors.map((e) => <div key={e}>{e}</div>)}</div>}
      {rows && <div className="table-wrap" style={{ marginTop: 12, maxHeight: 300 }}><table className="table compact"><thead><tr><th>Project</th><th>Program</th><th>Status</th><th className="num">Budget</th><th>End</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><td>{r.project}</td><td>{r.program}{ws.programs.some((p) => p.name.toLowerCase() === r.program.trim().toLowerCase()) ? '' : <span className="pill teal" style={{ marginLeft: 6 }}>new</span>}</td><td>{r.status}</td><td className="num">{money(Number(r.budget) || 0)}</td><td>{fmtDate(r.end)}</td></tr>)}</tbody></table></div>}
    </Modal>
  );
}
function downloadTemplate() { downloadBlob(TEMPLATE, 'project_inventory_template.csv', 'text/csv'); }
