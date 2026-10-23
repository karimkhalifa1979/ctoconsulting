// Reports (RPT-002 to RPT-006): the standard reports of each initiative; an ad hoc report builder over the
// reporting datasets with filters, grouping, drill-down to the underlying rows and export to Excel and CSV;
// saved and shared reports with scheduled distribution; and the read-only feed for business intelligence
// tools such as Power BI.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, Spinner, ErrorBox, Modal } from '../ui/core.jsx';
import DataGrid from '../ui/DataGrid.jsx';
import { BarChart } from '../charts/index.jsx';
import { useApp, useDialog, useToast } from '../state/app.jsx';
import { useMutator } from '../state/initiative.jsx';
import { useRecordDrawer } from '../ui/RecordDrawer.jsx';
import { useTab } from '../lib/hooks.js';
import { exportTable } from '../lib/export.js';
import { fmtDate, fmtNum } from '../lib/format.js';
import { DATASETS, STANDARD_REPORTS } from '../../shared/reporting.js';
import { FILTER_OPS, MEASURES, datasetFields, runReport, fieldLabel } from '../../shared/reportBuilder.js';
import { can } from '../../shared/access.js';
import { sortBy, uniq } from '../../shared/util.js';

const display = (v, type) => {
  if (v == null || v === '') return '';
  if (type === 'bool' || typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (type === 'date') return fmtDate(v);
  if (type === 'number') return fmtNum(v, 2);
  return String(v);
};

export default function Reports() {
  const [tab, setTab] = useTab('standard');
  return (
    <>
      <PageHead eyebrow="Reporting" title="Reports">
        Standard reports for each initiative, a report builder for your own questions across initiatives, reports saved and shared with colleagues, and the data feed for business intelligence tools. Every report respects your access, and every figure can be followed back to its records.
      </PageHead>
      <Tabs value={tab} onChange={setTab} label="Reports" tabs={[
        { id: 'standard', label: 'Standard reports', icon: 'report' },
        { id: 'builder', label: 'Report builder', icon: 'filter' },
        { id: 'saved', label: 'Saved reports', icon: 'files' },
        { id: 'feed', label: 'Data feed', icon: 'database' },
      ]} />
      {tab === 'standard' && <Standard />}
      {tab === 'builder' && <Builder />}
      {tab === 'saved' && <Saved />}
      {tab === 'feed' && <Feed />}
    </>
  );
}

// --- Standard reports (RPT-002) ---------------------------------------------------------------------------
function Standard() {
  const { initiatives } = useApp();
  const active = initiatives.filter((i) => i.status !== 'closed');
  const [iid, setIid] = useState(active[0]?.id || initiatives[0]?.id || '');
  if (!initiatives.length) return <Empty icon="report" title="No initiatives">Standard reports are produced for each initiative you work on.</Empty>;
  return (
    <Card title="Standard reports" sub="Each report has a chart, the records behind it, filters and export to Excel and CSV. Choose the initiative, then the report." flush
      actions={<label className="field field-inline"><span>Initiative</span><select value={iid} onChange={(e) => setIid(e.target.value)}>{sortBy(initiatives, 'name').map((i) => <option key={i.id} value={i.id}>{i.shortName || i.name}{i.status === 'closed' ? ' (closed)' : ''}</option>)}</select></label>}>
      <ul className="link-list">
        {STANDARD_REPORTS.map((r) => (
          <li key={r.id}><Link to={`/i/${iid}/dashboards?view=reports&report=${r.id}`}><Icon name="report" /><span className="grow"><span className="ll-title">{r.label}</span><span className="ll-sub">{r.description}</span></span><Icon name="chevronRight" /></Link></li>
        ))}
      </ul>
    </Card>
  );
}

// --- Report builder (RPT-003, RPT-004) ---------------------------------------------------------------------
const BLANK = { dataset: 'engagements', initiativeId: '', columns: [], filters: [], groupBy: '', measure: { fn: 'count', field: '' }, sort: { field: '', dir: 'asc' } };

function Builder() {
  const { api, user, initiatives, usersById } = useApp();
  const mut = useMutator();
  const toast = useToast();
  const dialog = useDialog();
  const drawer = useRecordDrawer();
  const [params, setParams] = useSearchParams();
  const reportId = params.get('report');
  const [saved, setSaved] = useState(null);
  const [def, setDef] = useState(BLANK);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [drill, setDrill] = useState(null);
  const canBuild = can(user, 'C', 'reportDefinition');

  // Open a saved report from the URL (?report=id).
  useEffect(() => {
    if (!reportId) { setSaved(null); return; }
    api.get('reportDefinition', reportId).then((r) => { setSaved(r); setDef({ ...BLANK, ...(r.definition || {}) }); }).catch((e) => toast.error(e));
  }, [api, reportId]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    setData(null);
    api.reporting(def.dataset, def.initiativeId ? { initiativeId: def.initiativeId } : {}).then((r) => { setData(r.rows); setError(null); }).catch(setError);
  }, [api, def.dataset, def.initiativeId]);
  useEffect(() => { load(); }, [load]);

  const fields = useMemo(() => (data ? datasetFields(data) : []), [data]);
  const result = useMemo(() => (data ? runReport(data, { ...def, groupBy: def.groupBy || null }) : null), [data, def]);
  const set = (patch) => { setDef((d) => ({ ...d, ...patch })); setDrill(null); };
  const typeOf = (k) => fields.find((f) => f.key === k)?.type || 'text';
  const columns = result?.columns || [];

  const save = async (asNew) => {
    const name = asNew || !saved ? await dialog.prompt({ title: 'Save report', label: 'Report name', multiline: false, defaultValue: saved && !asNew ? saved.name : '' }) : saved.name;
    if (!name) return;
    try {
      const body = { name, entityType: def.dataset, definition: def, ownerId: saved && !asNew ? saved.ownerId : user.id, shared: saved && !asNew ? !!saved.shared : false };
      const rec = saved && !asNew ? await mut.update('reportDefinition', saved.id, body, { version: saved.version, quiet: true }) : await mut.create('reportDefinition', body, { quiet: true });
      setSaved(rec);
      const p = new URLSearchParams(params); p.set('tab', 'builder'); p.set('report', rec.id); setParams(p, { replace: true });
      toast.success(`Saved: ${name}`);
    } catch (e) { toast.error(e); }
  };
  const schedule = async () => {
    if (!saved || !def.initiativeId) return;
    try {
      const sch = await mut.create('schedule', { initiativeId: def.initiativeId, name: `${saved.name} (weekly)`, kind: 'report', reportId: saved.id, frequency: 'weekly', dayOfWeek: '1', time: '08:00', recipients: [user.id], active: true }, { quiet: true });
      drawer.open({ type: 'schedule', id: sch.id, exclude: ['kind', 'reportId', 'artefactType', 'params', 'lastRunAt', 'nextRunAt'] });
      toast.success('Scheduled. Choose the recipients and timing.');
    } catch (e) { toast.error(e); }
  };
  const exportResult = (format) => {
    if (!result) return;
    if (result.kind === 'grouped') {
      const measureLabel = result.measure.fn === 'count' ? 'Rows' : `${MEASURES.find((m) => m.id === result.measure.fn)?.label} of ${fieldLabel(result.measure.field || '')}`;
      exportTable(result.groups.map((g) => ({ [fieldLabel(def.groupBy)]: g.label, [measureLabel]: g.value, Rows: g.count })), [fieldLabel(def.groupBy), measureLabel, 'Rows'], { name: saved?.name || 'Report', format }).catch(toast.error);
    } else {
      exportTable(result.rows.map((r) => Object.fromEntries(columns.map((k) => [fieldLabel(k), display(r[k], typeOf(k))]))), columns.map(fieldLabel), { name: saved?.name || 'Report', format }).catch(toast.error);
    }
  };

  if (!canBuild && !saved) return <Card title="Report builder"><p className="small">Your role can view the saved reports colleagues share with you; building new reports is for change management leads, practitioners, project managers and portfolio change managers.</p></Card>;
  const textFields = fields;
  const numberFields = fields.filter((f) => f.type === 'number');
  const distinct = (k) => uniq((data || []).map((r) => r[k]).filter((v) => v != null && v !== '').map(String)).sort();
  const rowCols = columns.map((k) => ({ key: k, label: fieldLabel(k), align: typeOf(k) === 'number' ? 'num' : undefined, render: (r) => display(r[k], typeOf(k)), value: (r) => r[k] ?? '' }));
  return (
    <div className="report-builder">
      <Card title={saved ? saved.name : 'New report'} sub={saved ? `Saved by ${usersById[saved.ownerId]?.name || 'a colleague'}${saved.shared ? ' · shared' : ''}` : 'Choose the data, then the columns, filters and grouping.'}>
        <div className="stack">
          <label className="field"><span>Data</span>
            <select value={def.dataset} onChange={(e) => set({ dataset: e.target.value, columns: [], filters: [], groupBy: '', measure: { fn: 'count', field: '' }, sort: { field: '', dir: 'asc' } })}>{Object.keys(DATASETS).map((k) => <option key={k} value={k}>{fieldLabel(k)}</option>)}</select>
            <span className="hint">{DATASETS[def.dataset]}</span>
          </label>
          <label className="field"><span>Initiatives</span>
            <select value={def.initiativeId} onChange={(e) => set({ initiativeId: e.target.value })}><option value="">Every initiative I can see</option>{sortBy(initiatives, 'name').map((i) => <option key={i.id} value={i.id}>{i.shortName || i.name}</option>)}</select>
          </label>
          <fieldset className="fieldset">
            <legend>Columns</legend>
            <div className="col-picker">
              {fields.map((f) => <label key={f.key} className="check small"><input type="checkbox" checked={columns.includes(f.key)} onChange={(e) => set({ columns: e.target.checked ? [...columns, f.key] : columns.filter((k) => k !== f.key) })} /><span>{f.label}</span></label>)}
            </div>
          </fieldset>
          <fieldset className="fieldset">
            <legend>Filters</legend>
            <div className="stack-sm">
              {def.filters.map((f, i) => {
                const vals = typeOf(f.field) === 'text' ? distinct(f.field) : [];
                const upd = (patch) => set({ filters: def.filters.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <div key={i} className="filter-row">
                    <select aria-label="Field" value={f.field} onChange={(e) => upd({ field: e.target.value, value: '' })}>{textFields.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
                    <select aria-label="Condition" value={f.op} onChange={(e) => upd({ op: e.target.value })}>{FILTER_OPS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
                    {!['empty', 'notEmpty'].includes(f.op) && (typeOf(f.field) === 'bool'
                      ? <select aria-label="Value" value={f.value} onChange={(e) => upd({ value: e.target.value })}><option value="">Choose…</option><option value="true">Yes</option><option value="false">No</option></select>
                      : vals.length && vals.length <= 40 && ['eq', 'ne'].includes(f.op)
                        ? <select aria-label="Value" value={f.value} onChange={(e) => upd({ value: e.target.value })}><option value="">Choose…</option>{vals.map((v) => <option key={v} value={v}>{typeOf(f.field) === 'date' ? fmtDate(v) : v}</option>)}</select>
                        : <input aria-label="Value" type={typeOf(f.field) === 'date' ? 'date' : typeOf(f.field) === 'number' ? 'number' : 'text'} value={f.value} onChange={(e) => upd({ value: e.target.value })} />)}
                    <button type="button" className="icon-btn" aria-label="Remove filter" onClick={() => set({ filters: def.filters.filter((_, j) => j !== i) })}><Icon name="x" /></button>
                  </div>
                );
              })}
              <div><button type="button" className="btn btn-sm" disabled={!fields.length} onClick={() => set({ filters: [...def.filters, { field: fields[0]?.key, op: 'eq', value: '' }] })}><Icon name="plus" />Add a filter</button></div>
            </div>
          </fieldset>
          <fieldset className="fieldset">
            <legend>Group and summarise</legend>
            <label className="field"><span>Group by</span><select value={def.groupBy} onChange={(e) => set({ groupBy: e.target.value, sort: { field: '', dir: e.target.value ? 'desc' : 'asc' } })}><option value="">Nothing: list the rows</option>{fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
            <div className="form-grid mt-2">
              {def.groupBy && <label className="field"><span>Show</span><select value={def.measure.fn} onChange={(e) => set({ measure: { fn: e.target.value, field: e.target.value === 'count' ? '' : def.measure.field || numberFields[0]?.key || '' } })}>{MEASURES.filter((m) => m.id === 'count' || numberFields.length).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>}
              {def.groupBy && def.measure.fn !== 'count' && <label className="field"><span>Of</span><select value={def.measure.field} onChange={(e) => set({ measure: { ...def.measure, field: e.target.value } })}>{numberFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>}
              <label className="field"><span>Sort by</span>
                <select value={def.sort.field} onChange={(e) => set({ sort: { ...def.sort, field: e.target.value } })}>
                  {def.groupBy ? <><option value="">Value</option><option value="group">Group name</option></> : <><option value="">Data order</option>{fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</>}
                </select>
              </label>
              <label className="field"><span>Order</span><select value={def.sort.dir} onChange={(e) => set({ sort: { ...def.sort, dir: e.target.value } })}><option value="asc">{def.groupBy && !def.sort.field ? 'Smallest first' : 'Ascending'}</option><option value="desc">{def.groupBy && !def.sort.field ? 'Largest first' : 'Descending'}</option></select></label>
            </div>
          </fieldset>
          {canBuild && (
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={() => save(false)}><Icon name="check" />{saved ? 'Save' : 'Save report'}</button>
              {saved && <button type="button" className="btn" onClick={() => save(true)}>Save as new</button>}
              {saved && <button type="button" className="btn" disabled={!def.initiativeId} title={def.initiativeId ? '' : 'Choose one initiative to schedule distribution'} onClick={schedule}><Icon name="clock" />Schedule</button>}
              <button type="button" className="btn btn-ghost" onClick={() => { setDef(BLANK); setSaved(null); const p = new URLSearchParams(params); p.delete('report'); setParams(p, { replace: true }); }}>New</button>
            </div>
          )}
        </div>
      </Card>

      <div className="stack" style={{ minWidth: 0 }}>
        {error && <ErrorBox error={error} onRetry={load} />}
        {!result && !error && <Spinner label="Loading data" />}
        {result?.kind === 'rows' && <h2>{result.total} {result.total === 1 ? 'row' : 'rows'}</h2>}
        {result?.kind === 'grouped' && (
          <Card title={`${fieldLabel(def.groupBy)}: ${result.groups.length} groups`} sub={`${result.total} rows. Select a bar or a row to see the records behind it.`}
            actions={<div className="btn-row"><button type="button" className="btn btn-sm" onClick={() => exportResult('xlsx')}><Icon name="download" />Excel</button><button type="button" className="btn btn-sm" onClick={() => exportResult('csv')}>CSV</button></div>}>
            {(
              <>
                {result.groups.length ? <BarChart data={result.groups.slice(0, 30).map((g) => ({ key: g.key, label: g.label, value: g.value ?? 0, sub: `${g.count} rows` }))} format={(v) => fmtNum(v, 2)} labelWidth={220} onSelect={(d) => setDrill(d.key)} ariaLabel={`${MEASURES.find((m) => m.id === result.measure.fn)?.label} by ${fieldLabel(def.groupBy)}`} /> : <Empty icon="filter" title="No rows match the filters" />}
                {result.groups.length > 30 && <p className="small muted">The chart shows the first 30 of {result.groups.length} groups; the table below has them all.</p>}
                <table className="tbl tbl-compact mt-3">
                  <thead><tr><th>{fieldLabel(def.groupBy)}</th><th className="num">{result.measure.fn === 'count' ? 'Rows' : `${MEASURES.find((m) => m.id === result.measure.fn)?.label} of ${fieldLabel(result.measure.field || '')}`}</th><th className="num">Rows</th></tr></thead>
                  <tbody>{result.groups.map((g) => <tr key={g.key} className={`clickable ${drill === g.key ? 'selected' : ''}`} onClick={() => setDrill(drill === g.key ? null : g.key)}><td>{typeOf(def.groupBy) === 'date' ? fmtDate(g.label) : g.label}</td><td className="num">{fmtNum(g.value, 2)}</td><td className="num">{g.count}</td></tr>)}</tbody>
                </table>
              </>
            )}
          </Card>
        )}
        {result?.kind === 'rows' && (
          <DataGrid id={`report-${def.dataset}`} title="Report rows" rows={result.rows.map((r, i) => ({ id: String(i), ...r }))} columns={rowCols} savedViews={false} exportName={saved?.name || fieldLabel(def.dataset)}
            empty={<Empty icon="filter" title="No rows match the filters" />} />
        )}
        {result?.kind === 'grouped' && drill != null && (
          <DataGrid id={`report-drill-${def.dataset}`} title={`Rows for ${drill}`} rows={(result.groups.find((g) => g.key === drill)?.rows || []).map((r, i) => ({ id: String(i), ...r }))} columns={rowCols} savedViews={false} exportName={`${saved?.name || fieldLabel(def.dataset)} ${drill}`} />
        )}
      </div>
    </div>
  );
}

// --- Saved and shared reports ----------------------------------------------------------------------------
function Saved() {
  const { api, user, usersById, initiatives } = useApp();
  const mut = useMutator();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.list('reportDefinition', {}).then((r) => { setRows(r.rows.filter((x) => x.ownerId === user.id || x.shared)); setError(null); }).catch(setError), [api, user.id]);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!rows) return <Spinner />;
  const iniName = Object.fromEntries(initiatives.map((i) => [i.id, i.shortName || i.name]));
  const share = async (r) => { try { await mut.update('reportDefinition', r.id, { shared: !r.shared }, { version: r.version, quiet: true }); load(); } catch (e) { toast.error(e); } };
  const remove = async (r) => { try { const ok = await mut.remove('reportDefinition', r.id, { message: `Delete the saved report "${r.name}"? Schedules that use it stop.` }); if (ok !== null) load(); } catch (e) { if (!e.handled) toast.error(e); } };
  return (
    <DataGrid id="saved-reports" type="reportDefinition" title="Saved reports" rows={sortBy(rows, 'name')} exportName="Saved reports"
      columns={[
        { key: 'name', label: 'Report', render: (r) => <Link to={`/reports?tab=builder&report=${r.id}`}><strong>{r.name}</strong></Link>, value: (r) => r.name },
        { key: 'data', label: 'Data', render: (r) => fieldLabel(r.definition?.dataset || r.entityType || ''), value: (r) => r.definition?.dataset || '' },
        { key: 'scope', label: 'Initiatives', render: (r) => (r.definition?.initiativeId ? iniName[r.definition.initiativeId] || 'One initiative' : 'All I can see'), value: (r) => r.definition?.initiativeId || '' },
        { key: 'owner', label: 'Owner', render: (r) => usersById[r.ownerId]?.name || '—', value: (r) => usersById[r.ownerId]?.name || '' },
        { key: 'shared', label: 'Sharing', render: (r) => (r.shared ? <Badge tone="info" icon="users">Shared</Badge> : <Badge icon="lock">Only me</Badge>), value: (r) => (r.shared ? 1 : 0) },
        { key: '_a', label: '', sortable: false, render: (r) => r.ownerId === user.id && <span className="btn-row" onClick={(e) => e.stopPropagation()}><button type="button" className="btn btn-xs" onClick={() => share(r)}>{r.shared ? 'Stop sharing' : 'Share'}</button><button type="button" className="btn btn-xs btn-ghost" onClick={() => remove(r)}>Delete</button></span> },
      ]}
      empty={<Empty icon="files" title="No saved reports">Build a report and save it to run it again, share it with colleagues or schedule it.</Empty>} />
  );
}

// --- Data feed for BI tools (RPT-005) ---------------------------------------------------------------------
function Feed() {
  const { api, mode, user } = useApp();
  const toast = useToast();
  const [preview, setPreview] = useState(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const show = async (name) => {
    try { const r = await api.reporting(name, {}); setPreview({ name, rows: r.rows }); } catch (e) { toast.error(e); }
  };
  const download = async (name, format) => {
    try {
      const r = await api.reporting(name, {});
      const fields = datasetFields(r.rows);
      await exportTable(r.rows.map((x) => Object.fromEntries(fields.map((f) => [f.label, display(x[f.key], f.type)]))), fields.map((f) => f.label), { name: `${fieldLabel(name)} dataset`, format });
    } catch (e) { toast.error(e); }
  };
  return (
    <div className="stack">
      <Card title="Read-only data feed" sub="Business intelligence tools read the same datasets the reports use, through the API, with access rights applied to the account that connects. Every read is recorded in the audit trail.">
        {mode === 'server' ? (
          <div className="small stack-sm">
            <p style={{ margin: 0 }}>Each dataset is available at <code>{origin}/api/v1/reporting/&#123;dataset&#125;</code>, optionally with <code>?initiativeId=…</code>. Responses are JSON with a <code>rows</code> array.</p>
            <p style={{ margin: 0 }}>To connect Power BI, an administrator creates an API client with the <em>reporting</em> scope in Administration › Integrations. In Power BI choose <em>Get data › Web</em>, enter the dataset address, and send the client's token in an <code>Authorization: Bearer</code> header.</p>
            <p style={{ margin: 0 }}>The full API is described in OpenAPI 3 at <code>{origin}/api/v1/openapi.json</code>.</p>
          </div>
        ) : <p className="small" style={{ margin: 0 }}>This browser-only demonstration has no server, so tools cannot connect to it. On the server the same datasets are available at <code>/api/v1/reporting/&#123;dataset&#125;</code>. You can still preview and download each dataset here.</p>}
      </Card>
      <div className="table-wrap card">
        <table className="tbl">
          <thead><tr><th>Dataset</th><th>Contents</th><th>Address</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {Object.entries(DATASETS).map(([k, d]) => (
              <tr key={k}>
                <td><strong>{fieldLabel(k)}</strong></td>
                <td className="small">{d}</td>
                <td><code className="small">/api/v1/reporting/{k}</code></td>
                <td><span className="btn-row" style={{ flexWrap: 'nowrap' }}><button type="button" className="btn btn-xs" onClick={() => show(k)}><Icon name="eye" />Preview</button><button type="button" className="btn btn-xs" onClick={() => download(k, 'xlsx')}>Excel</button><button type="button" className="btn btn-xs" onClick={() => download(k, 'csv')}>CSV</button></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview && (
        <Modal title={`${fieldLabel(preview.name)}: first rows of ${preview.rows.length}`} wide onClose={() => setPreview(null)} footer={<button type="button" className="btn" onClick={() => setPreview(null)}>Close</button>}>
          {preview.rows.length ? (() => {
            const fields = datasetFields(preview.rows);
            return (
              <div className="table-wrap">
                <table className="tbl tbl-compact"><thead><tr>{fields.map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
                  <tbody>{preview.rows.slice(0, 12).map((r, i) => <tr key={i}>{fields.map((f) => <td key={f.key} className="small nowrap">{display(r[f.key], f.type)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            );
          })() : <Empty icon="database" title="No rows" />}
          {!can(user, 'R', 'profile') && <p className="small muted">Some datasets are not available to your role.</p>}
        </Modal>
      )}
    </div>
  );
}
