import { useRef, useState } from 'react';
import { useApp, exportBackup, personName } from '../lib/store.jsx';
import { PERSON_ROLES, DEFAULT_SETTINGS } from '../lib/config.js';
import { PageHead, Card, Tabs, Field, TextInput, TextArea, NumberInput, Select, PersonSelect, Pill, Guidance, useToast } from '../components/ui.jsx';
import { downloadJSON, exportXlsx, safeName } from '../lib/exporters.js';
import { benefitTypeLabel } from '../lib/config.js';
import { annualValue, isFinancial } from '../lib/finance.js';
import { uid } from '../lib/util.js';

// Default accountability matrix (Appendix C.4, ACC-05), paraphrased.
export const ACC_MATRIX = {
  roles: ['Investment Decision Board', 'Value Management Office', 'Business sponsor', 'Program manager', 'Project managers'],
  rows: [
    ['Overall accountability', ['Value of the investment portfolio and achievement of its benefits', 'Progress of initiatives through properly founded and funded programs', 'Achievement of the program’s agreed benefits', 'Overall program management and combined project results', 'Timely delivery of agreed deliverables']],
    ['Portfolio management', ['Owns and manages the portfolio', 'Plans and supports the board, sponsors and program managers', 'Recommends on the program; reports benefits achieved', 'Provides program status and facts to the VMO', '—']],
    ['Business plans', ['Sets annual planning guidelines; approves plans', 'Proposes and structures programs; formulates value cases', 'Confirms program requirements; negotiates priorities with the board', 'Prepares annual plans', '—']],
    ['Budgets and funding', ['Approves budgets and funding sources for program commitments', 'Facilitates the budget process; prepares funding recommendations', 'Confirms benefits and costs for the next commitment stage', 'Prepares consolidated project budgets; allocates funding to projects', 'Provide schedule and cost information']],
    ['Programs', ['Monitors status; resolves major issues; recruits sponsors', 'Facilitates value cases; monitors progress and budgets', 'Owns the program; recruits the program manager', 'Directs and coordinates the program; recruits project managers', 'Accountable to the program manager for execution']],
  ],
};

export default function Settings() {
  const { ws, mutate, list, renameWorkspace, createBlank, resetDemo, deleteWorkspace, importBackup } = useApp();
  const [tab, setTab] = useState('general');
  const [toast, toastNode] = useToast();
  const file = useRef(null); const cfgFile = useRef(null);
  const st = ws.settings;
  const setS = (path, label) => (v) => mutate(label || `Setting ${path}`, (d) => { const ks = path.split('.'); let o = d.settings; for (const k of ks.slice(0, -1)) o = o[k] = o[k] || {}; o[ks[ks.length - 1]] = v; }, { object: 'settings', field: path, after: v });
  const matrix = ws.accountabilityMatrix || ACC_MATRIX;

  const exportAll = () => exportXlsx([
    { name: 'Programs', columns: [{ label: 'Code', get: (p) => p.code }, { label: 'Name', get: (p) => p.name }, { label: 'Category', get: (p) => p.categoryId }, { label: 'State', get: (p) => p.state }, { label: 'Sponsor', get: (p) => personName(ws, p.sponsorId) }, { label: 'Start', get: (p) => p.startDate }, { label: 'End', get: (p) => p.endDate }, { label: 'Cost low', get: (p) => p.costLow }, { label: 'Cost high', get: (p) => p.costHigh }], rows: ws.programs },
    { name: 'Projects', columns: [{ label: 'Program', get: (r) => r.p.code }, { label: 'Project', get: (r) => r.x.name }, { label: 'Manager', get: (r) => personName(ws, r.x.managerId) }, { label: 'Budget', get: (r) => r.x.budget }, { label: 'Actual', get: (r) => r.x.actual }, { label: 'Status', get: (r) => r.x.status }, { label: 'Gate', get: (r) => r.x.gate }], rows: ws.programs.flatMap((p) => p.projects.map((x) => ({ p, x }))) },
    { name: 'Benefits', columns: [{ label: 'Program', get: (r) => r.p.code }, { label: 'Benefit', get: (r) => r.b.title }, { label: 'Type', get: (r) => benefitTypeLabel(r.b.type) }, { label: 'Owner', get: (r) => personName(ws, r.b.ownerId) }, { label: 'Annual value', get: (r) => (isFinancial(r.b) ? annualValue(r.b) : '') }, { label: 'Baseline', get: (r) => r.b.baseline?.value }, { label: 'Target', get: (r) => r.b.target }, { label: 'Attribution', get: (r) => r.b.attribution }], rows: ws.programs.flatMap((p) => p.benefits.map((b) => ({ p, b }))) },
    { name: 'Actuals', columns: [{ label: 'Program', get: (r) => r.p.code }, { label: 'Benefit', get: (r) => r.b.title }, { label: 'Period', get: (r) => r.a.period }, { label: 'Value', get: (r) => r.a.value }, { label: 'Provenance', get: (r) => r.a.provenance }], rows: ws.programs.flatMap((p) => p.benefits.flatMap((b) => (b.actuals || []).map((a) => ({ p, b, a })))) },
    { name: 'Cost lines', columns: [{ label: 'Program', get: (r) => r.p.code }, { label: 'Cost line', get: (r) => r.c.name }, { label: 'Type', get: (r) => r.c.type }, { label: 'BTOPP', get: (r) => r.c.btopp }, { label: 'Basis', get: (r) => r.c.basis }, { label: 'Start', get: (r) => r.c.start }, { label: 'Months', get: (r) => r.c.months }, { label: 'Amount', get: (r) => r.c.amount }], rows: ws.programs.flatMap((p) => p.costs.map((c) => ({ p, c }))) },
    { name: 'Benefits map elements', columns: [{ label: 'Program', get: (r) => r.p.code }, { label: 'Code', get: (r) => r.e.code }, { label: 'Kind', get: (r) => r.e.kind }, { label: 'Title', get: (r) => r.e.title }, { label: 'Final', get: (r) => (r.e.final ? 'yes' : '') }, { label: 'BTOPP', get: (r) => (r.e.btopp || []).join(' ') }], rows: ws.programs.flatMap((p) => p.chain.elements.map((e) => ({ p, e }))) },
    { name: 'Gate decisions', columns: [{ label: 'Program', get: (r) => r.p.code }, { label: 'Gate', get: (r) => r.g.gate }, { label: 'Date', get: (r) => r.g.decision.date }, { label: 'Decision', get: (r) => r.g.decision.option }, { label: 'Funding', get: (r) => r.g.decision.fundingApproved }, { label: 'Rationale', get: (r) => r.g.decision.rationale }], rows: ws.programs.flatMap((p) => p.gates.filter((g) => g.decision).map((g) => ({ p, g }))) },
    { name: 'Strategic drivers', columns: [{ label: 'Driver', get: (d) => d.name }, { label: 'Type', get: (d) => d.type }, { label: 'Weight', get: (d) => d.weight }, { label: 'Owner', get: (d) => personName(ws, d.owner) }], rows: ws.drivers },
    { name: 'Measures', columns: [{ label: 'Measure', get: (m) => m.name }, { label: 'Unit', get: (m) => m.unit }, { label: 'Owner', get: (m) => personName(ws, m.ownerId) }, { label: 'Frequency', get: (m) => m.frequency }], rows: ws.measures },
  ], `${safeName(ws.name)}_benefits_platform.xlsx`);

  return (
    <div className="stack">
      <PageHead eyebrow="Configure" title="Settings and data">Adapt the method to the organisation through configuration, not code — terminology, categories, thresholds, instruments and reference data. Workspaces are stored in this browser; use backups to move or share them.</PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[['general', 'General'], ['thresholds', 'Thresholds and weights'], ['categories', 'Categories'], ['instrument', 'Risk instrument'], ['matrix', 'Accountability matrix'], ['people', 'People and areas'], ['data', 'Data and workspaces']]} />
      {tab === 'general' && (
        <Card title="Organisation and terminology (ADM-01, ADM-02)">
          <div className="form-grid">
            <Field label="Organisation name"><TextInput value={ws.name} onChange={renameWorkspace} /></Field>
            <Field label="Currency"><Select value={st.currency} onChange={setS('currency')} options={['AUD', 'NZD', 'USD', 'GBP', 'EUR', 'CAD', 'SGD']} /></Field>
            <Field label="English variant"><Select value={st.locale} onChange={setS('locale')} options={[['en-AU', 'Australian'], ['en-GB', 'British'], ['en-US', 'US']]} /></Field>
            <Field label="Financial year starts"><Select value={String(st.fyStartMonth)} onChange={(v) => setS('fyStartMonth')(Number(v))} options={[['7', 'July (Australia)'], ['4', 'April'], ['10', 'October'], ['1', 'January']]} /></Field>
            <Field label="Discount rate"><NumberInput value={st.discountRate} onChange={setS('discountRate')} step={0.005} /></Field>
            <Field label="Default evaluation horizon (years)"><NumberInput value={st.horizonYears} onChange={setS('horizonYears')} /></Field>
            <Field label="Rounding in documents"><Select value={String(st.precision)} onChange={(v) => setS('precision')(Number(v))} options={[['1', 'Nearest dollar'], ['1000', 'Nearest thousand'], ['10000', 'Nearest ten thousand']]} /></Field>
            <Field label="Operating mode (section 2.5)"><Select value={st.mode} onChange={setS('mode')} options={[['program', 'Program mode'], ['portfolio', 'Portfolio mode']]} /></Field>
            <Field label="Term for a program"><Select value={st.terms.program} onChange={setS('terms.program')} options={['program', 'programme', 'initiative']} /></Field>
            <Field label="Board name"><TextInput value={st.terms.board} onChange={setS('terms.board')} /></Field>
            <Field label="Value office name"><TextInput value={st.terms.vmo} onChange={setS('terms.vmo')} /></Field>
            <Field label="Benefits model name" hint="neutral name (C-01)"><TextInput value={st.terms.map} onChange={setS('terms.map')} /></Field>
            <label className="check"><input type="checkbox" checked={st.ai} onChange={(e) => setS('ai')(e.target.checked)} /> Allow optional AI assistance (GDA-03) — suggestions are labelled, need human acceptance, and are never used for programs classified Confidential</label>
          </div>
        </Card>
      )}
      {tab === 'thresholds' && (
        <div className="grid g-2" data-layout>
          <Card title="Scales and thresholds (Appendix C.5)">
            <div className="form-grid">
              {[['riskAmber', 'Risk amber from'], ['riskRed', 'Risk red above'], ['onTrack', 'Benefit on track at (share of forecast)'], ['atRisk', 'Benefit at risk from'], ['reviewCycles', 'Value-case review cycles before flag'], ['steadyPeriods', 'Steady-state periods before completion'], ['postHandoverMonths', 'Post-handover tracking (months)'], ['changeEffortMin', 'Change-management share warning below'], ['oppMin', 'Organisation, process, people share warning below'], ['alignmentChange', 'Alignment change to flag (points)'], ['sponsorAcceptDays', 'Sponsor acceptance due (business days)'], ['contingency', 'Funding contingency above estimate'], ['unansweredMax', 'Unanswered risk questions before incomplete'], ['analysisParalysisDays', 'Days in definition before paralysis flag'], ['varianceTolerance', 'Default project cost tolerance']].map(([k, l]) => <Field key={k} label={l}><NumberInput value={st.thresholds[k]} onChange={setS(`thresholds.${k}`)} step={k.match(/Track|atRisk|Min|contingency|unanswered|variance/) ? 0.05 : 1} /></Field>)}
            </div>
          </Card>
          <div className="stack">
            <Card title="Relevance weight of each “are” (7.2.1)"><div className="form-grid">{Object.keys(st.areWeights).map((k) => <Field key={k} label={k}><NumberInput value={st.areWeights[k]} onChange={setS(`areWeights.${k}`)} step={0.25} /></Field>)}</div></Card>
            <Card title="Contribution-type weights (7.2.2)"><div className="form-grid">{Object.keys(st.typeWeights).map((k) => <Field key={k} label={k}><NumberInput value={st.typeWeights[k]} onChange={setS(`typeWeights.${k}`)} step={0.05} /></Field>)}</div></Card>
            <Card title="Program health weights (PRG-13)"><div className="form-grid">{Object.keys(st.healthWeights).map((k) => <Field key={k} label={k}><NumberInput value={st.healthWeights[k]} onChange={setS(`healthWeights.${k}`)} step={0.05} /></Field>)}</div></Card>
          </div>
        </div>
      )}
      {tab === 'categories' && (
        <Card title="Investment categories (INV-02, Appendix C.1)" subtitle="The category sets the degree of freedom, the depth of assessment and the funding pool" pad={false}>
          <div className="table-wrap"><table className="table compact"><thead><tr><th>Category</th><th>Degree of freedom</th><th>Discretionary (full value case)</th><th>Assessment and path</th><th>Light-template fields</th></tr></thead>
            <tbody>{ws.categories.map((c, i) => <tr key={c.id}>
              <td><input className="inline-input" style={{ fontWeight: 600 }} value={c.name} onChange={(e) => mutate('Category name', (d) => { d.categories[i].name = e.target.value; }, { field: `cat:${c.id}` })} aria-label="Category" /><input className="inline-input mini" value={c.description} onChange={(e) => mutate('Category description', (d) => { d.categories[i].description = e.target.value; }, { field: `catd:${c.id}` })} aria-label="Description" /></td>
              <td><input className="inline-input" value={c.freedom} onChange={(e) => mutate('Category freedom', (d) => { d.categories[i].freedom = e.target.value; }, { field: `catf:${c.id}` })} aria-label="Freedom" /></td>
              <td><input type="checkbox" checked={c.discretionary} onChange={(e) => mutate('Category discretionary', (d) => { d.categories[i].discretionary = e.target.checked; d.categories[i].depth = e.target.checked ? 'full' : 'light'; })} aria-label="Discretionary" /></td>
              <td><TextArea rows={2} value={c.path} onChange={(v) => mutate('Category path', (d) => { d.categories[i].path = v; }, { field: `catp:${c.id}` })} /></td>
              <td><input className="inline-input" value={(c.lightFields || []).join('; ')} onChange={(e) => mutate('Category fields', (d) => { d.categories[i].lightFields = e.target.value.split(';').map((s) => s.trim()).filter(Boolean); }, { field: `catl:${c.id}` })} aria-label="Fields" /></td>
            </tr>)}</tbody></table></div>
          <div className="card-body"><button className="btn btn-sm" onClick={() => mutate('Added category', (d) => { d.categories.push({ id: uid('cat'), name: 'New category', freedom: 'Medium', discretionary: false, depth: 'light', description: '', path: '', lightFields: [] }); })}>+ Category</button></div>
        </Card>
      )}
      {tab === 'instrument' && (
        <Card title="Risk instrument (VAL-05, Appendix C.3)" subtitle="Questions grouped under the four “ares”, each with a weight 1–3" pad={false}>
          <div className="table-wrap"><table className="table compact"><thead><tr><th>“Are”</th><th>Question</th><th className="num">Weight</th><th /></tr></thead>
            <tbody>{ws.instrument.map((q, i) => <tr key={q.id}><td>{q.are}</td><td><input className="inline-input" value={q.text} onChange={(e) => mutate('Risk question', (d) => { d.instrument[i] = { ...d.instrument[i], text: e.target.value }; }, { field: `rq:${q.id}` })} aria-label="Question" /></td><td><NumberInput value={q.w} onChange={(v) => mutate('Risk question weight', (d) => { d.instrument[i] = { ...d.instrument[i], w: v }; }, { field: `rqw:${q.id}` })} min={1} max={3} style={{ width: 60 }} /></td><td><button className="btn btn-ghost btn-sm" aria-label="Delete question" onClick={() => mutate('Risk question removed', (d) => { d.instrument.splice(i, 1); })}>✕</button></td></tr>)}</tbody></table></div>
          <div className="card-body row">{['right', 'way', 'well', 'benefits'].map((a) => <button key={a} className="btn btn-sm" onClick={() => mutate('Risk question added', (d) => { d.instrument.push({ are: a, id: uid('q'), text: 'New question', w: 2 }); })}>+ {a}</button>)}</div>
        </Card>
      )}
      {tab === 'matrix' && (
        <Card title="Accountability matrix (ACC-05, Appendix C.4)" subtitle="Function by role — adapted from the source’s simplified matrix; edit to match your organisation" pad={false}>
          <div className="table-wrap"><table className="table compact"><thead><tr><th>Function</th>{matrix.roles.map((r) => <th key={r}>{r}</th>)}</tr></thead>
            <tbody>{matrix.rows.map(([fn, cells], i) => <tr key={fn}><td><strong>{fn}</strong></td>{cells.map((c, j) => <td key={j}><textarea rows={3} value={c} onChange={(e) => mutate('Accountability matrix edited', (d) => { d.accountabilityMatrix = structuredClone(d.accountabilityMatrix || ACC_MATRIX); d.accountabilityMatrix.rows[i][1][j] = e.target.value; }, { field: `am:${i}:${j}` })} aria-label={`${fn} — ${matrix.roles[j]}`} style={{ minWidth: 160, fontSize: 12 }} /></td>)}</tr>)}</tbody></table></div>
        </Card>
      )}
      {tab === 'people' && (
        <div className="grid g-2" data-layout>
          <Card title="People (ADM-03)" subtitle="Holds only what is needed to identify people and record accountability (DAT-05)" pad={false} actions={<button className="btn btn-sm" onClick={() => mutate('Person added', (d) => { d.people.push({ id: uid('p'), name: 'New person', position: '', unit: d.areas[0]?.id, roles: ['Contributor'], email: '' }); })}>+ Person</button>}>
            <div className="table-wrap" style={{ maxHeight: 620 }}><table className="table compact"><thead><tr><th>Name and position</th><th>Unit</th><th>Roles</th></tr></thead>
              <tbody>{ws.people.map((p, i) => <tr key={p.id}><td><input className="inline-input" style={{ fontWeight: 600 }} value={p.name} onChange={(e) => mutate('Person name', (d) => { d.people[i].name = e.target.value; }, { field: `pn:${p.id}` })} aria-label="Name" /><input className="inline-input mini" value={p.position} onChange={(e) => mutate('Person position', (d) => { d.people[i].position = e.target.value; }, { field: `pp:${p.id}` })} aria-label="Position" /></td><td><Select value={p.unit} onChange={(v) => mutate('Person unit', (d) => { d.people[i].unit = v; })} options={ws.areas.map((a) => [a.id, a.name])} /></td><td><select multiple value={p.roles || []} onChange={(e) => mutate('Person roles', (d) => { d.people[i].roles = [...e.target.selectedOptions].map((o) => o.value); })} style={{ height: 64, minWidth: 170 }} aria-label="Roles">{PERSON_ROLES.concat(['Corporate sponsor']).map((r) => <option key={r} value={r}>{r}</option>)}</select></td></tr>)}</tbody></table></div>
          </Card>
          <Card title="Business areas and absorption thresholds" subtitle="Used for change load (7.2.6) and reach checks" pad={false} actions={<button className="btn btn-sm" onClick={() => mutate('Area added', (d) => { d.areas.push({ id: uid('a'), name: 'New area', head: null, absorption: 2 }); })}>+ Area</button>}>
            <div className="table-wrap"><table className="table compact"><thead><tr><th>Area</th><th>Head</th><th className="num">Absorption threshold</th></tr></thead>
              <tbody>{ws.areas.map((a, i) => <tr key={a.id}><td><input className="inline-input" value={a.name} onChange={(e) => mutate('Area name', (d) => { d.areas[i].name = e.target.value; }, { field: `an:${a.id}` })} aria-label="Area" /></td><td><PersonSelect ws={ws} value={a.head} onChange={(v) => mutate('Area head', (d) => { d.areas[i].head = v; })} /></td><td><NumberInput value={a.absorption} onChange={(v) => mutate('Area absorption', (d) => { d.areas[i].absorption = v; }, { field: `aa:${a.id}` })} step={0.1} style={{ width: 70 }} /></td></tr>)}</tbody></table></div>
          </Card>
        </div>
      )}
      {tab === 'data' && (
        <div className="grid g-2" data-layout>
          <Card title="Backup and restore" subtitle="The whole workspace as one JSON file — move it between browsers or share it">
            <div className="btn-row dl"><button className="btn btn-primary" onClick={() => downloadJSON(exportBackup(ws), `${safeName(ws.name)}_backup.json`)}>Download backup</button><button className="btn" onClick={exportAll}>Export all data to Excel (INT-06)</button></div>
            <div className="btn-row" style={{ marginTop: 10 }}><button className="btn" onClick={() => file.current.click()}>Restore from backup…</button><input ref={file} type="file" accept=".json" style={{ display: 'none' }} onChange={async (e) => { try { await importBackup(JSON.parse(await e.target.files[0].text())); toast('Workspace restored'); } catch (err) { toast(err.message); } e.target.value = ''; }} /></div>
            <p className="hosted-note mini">Downloads are unavailable in this hosted preview.</p>
          </Card>
          <Card title="Configuration (ADM-07)" subtitle="Export and import configuration between workspaces or environments">
            <div className="btn-row"><button className="btn dl" onClick={() => downloadJSON({ format: 'brp-config', version: 1, settings: ws.settings, categories: ws.categories, instrument: ws.instrument, accountabilityMatrix: matrix, areas: ws.areas, drivers: ws.drivers }, `${safeName(ws.name)}_configuration.json`)}>Export configuration</button><button className="btn" onClick={() => cfgFile.current.click()}>Import configuration…</button><input ref={cfgFile} type="file" accept=".json" style={{ display: 'none' }} onChange={async (e) => { try { const c = JSON.parse(await e.target.files[0].text()); if (c.format !== 'brp-config') throw new Error('Not a configuration file'); mutate('Configuration imported', (d) => { d.settings = { ...DEFAULT_SETTINGS, ...c.settings, orgName: d.settings.orgName }; d.categories = c.categories; d.instrument = c.instrument; d.accountabilityMatrix = c.accountabilityMatrix; }, { action: 'import' }); toast('Configuration imported'); } catch (err) { toast(err.message); } e.target.value = ''; }} /></div>
          </Card>
          <Card title="Workspaces" subtitle={`${(list || []).length} in this browser`}>
            {(list || []).map((w) => <div key={w.id} className="check-row"><span className="ic">{w.id === ws.id ? '●' : '○'}</span><span>{w.name}{w.kind === 'demo' && <> <Pill tone="teal">demo</Pill></>}</span><button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(`Delete workspace “${w.name}” from this browser? Download a backup first if you need it.`)) deleteWorkspace(w.id); }}>Delete</button></div>)}
            <div className="btn-row" style={{ marginTop: 10 }}><button className="btn" onClick={() => { const n = window.prompt('Organisation name'); if (n) createBlank(n); }}>+ New blank workspace</button><button className="btn" onClick={() => { if (window.confirm('Reload the Harbourline Mutual demonstration workspace? Changes to the demo are replaced.')) resetDemo(); }}>Reset demo data</button></div>
          </Card>
          <Card title="Where data lives">
            <Guidance>Workspaces are stored in this browser (IndexedDB) and never leave it unless you export them. The optional AI features send only the text of the section being refined to the server you run. For a multi-user deployment with single sign-on, role-based access and server-side audit, see the README.</Guidance>
          </Card>
        </div>
      )}
      {toastNode}
    </div>
  );
}
