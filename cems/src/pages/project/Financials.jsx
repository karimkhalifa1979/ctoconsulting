// Project financials (FIN-008..040): position and earned value, the time-phased budget, the
// monthly forecast with EAC methods (UC-05), comparisons and scenarios, billing and costs.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProject } from './Project.jsx';
import { useApi } from '../../lib/hooks.js';
import { get, put, patch, post } from '../../lib/api.js';
import { Register } from '../../components/Record.jsx';
import Invoices from '../../components/Invoices.jsx';
import { Async, Card, Tile, Table, Money, Pct, Status, Badge, D, Alert, Empty, Seg, Field, useAction, useDialog, useToast } from '../../components/ui.jsx';
import { LineChart, SERIES, monthLabel, useFinSeries } from '../../components/charts.jsx';
import { fmtMoneyShort, fmtMoney, fmtPct, fmtDate, fmtNum, fmtDatePattern } from '../../../shared/format.js';
import { todayIn, monthOf, monthsBetween } from '../../../shared/dates.js';
import Icon from '../../components/Icon.jsx';

const ratio = (v) => (v == null ? '—' : v.toFixed(2));
const COST_TYPES = ['labour', 'expenses', 'third-party', 'contingency'];
const EAC_METHODS = ['Bottom-up', 'BAC ÷ CPI', 'AC + (BAC − EV)', 'AC + (BAC − EV) ÷ (CPI × SPI)', 'Manual'];

export default function Financials() {
  const { can, costs } = useProject();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'position';
  const setTab = (t) => { params.set('tab', t); setParams(params, { replace: true }); };
  const tabs = [['position', 'Position'], can('budget') && ['budget', 'Budget'], can('budget') && ['forecast', 'Forecast'], ['billing', 'Billing and costs']].filter(Boolean);
  return (
    <div className="stack">
      <div className="subtabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'position' && <Position costs={costs} />}
      {tab === 'budget' && <Budget />}
      {tab === 'forecast' && <Forecast />}
      {tab === 'billing' && <Billing />}
    </div>
  );
}

// ---------- Position and earned value ----------
function Position({ costs }) {
  const { id } = useProject();
  const q = useApi(`/api/finance/project/${id}`);
  const [what, setWhat] = useState(costs ? 'cost' : 'fees');
  return (
    <Async q={q}>{(f) => {
      return (
        <>
          <div className="grid g-4">
            <Tile label="Contract value" value={fmtMoneyShort(f.contractValue)} sub={`${f.model}${f.arrangements?.length > 1 ? ` · ${f.arrangements.length} arrangements` : ''}`} />
            <Tile label="Fees earned to date" value={fmtMoneyShort(f.recognised)} sub={`Fees at completion ${fmtMoneyShort(f.eacRevenue)}`} />
            <Tile label="Invoiced" value={fmtMoneyShort(f.invoicedToDate)} sub={f.remainingValue != null ? `${fmtMoneyShort(f.remainingValue)} remaining` : ''} />
            <Tile label="Hours" value={fmtNum(f.hours)} sub={f.pendingHours ? `${fmtNum(f.pendingHours)} awaiting approval` : `${fmtNum(f.billableHours)} billable`} />
          </div>
          {costs && (
            <div className="grid g-4">
              <Tile label="BAC" value={fmtMoneyShort(f.bac)} sub={f.budgetVersion ? `${f.budgetVersion.label} (v${f.budgetVersion.version_no})` : 'No approved budget'} />
              <Tile label="Actual cost" value={fmtMoneyShort(f.ac)} sub={`${fmtPct(f.budgetConsumedPct)} of budget · burn ${fmtMoneyShort(f.burnRate)}/week`} />
              <Tile label="EAC" value={fmtMoneyShort(f.eac)} sub={`${f.eacMethod} · VAC ${fmtMoneyShort(f.vac)}`} tone={f.vac < 0 ? (f.vac / f.bac < -0.05 ? 'bad' : 'warn') : ''} />
              <Tile label="Forecast margin" value={fmtPct(f.forecastMargin, 1)} sub={`Baseline ${fmtPct(f.baselineMargin, 1)}`} tone={f.marginErosion > 0.05 ? 'bad' : f.marginErosion > 0.02 ? 'warn' : ''} />
            </div>
          )}
          {f.commercialRisk && <Alert tone="warn">{fmtNum(f.hoursOnUnapprovedChanges)} hours are booked to work linked to change requests that are not yet approved: a commercial risk (CHG-008).</Alert>}
          {f.pendingChanges?.count > 0 && <Alert tone="info">{f.pendingChanges.count} pending change{f.pendingChanges.count > 1 ? 's' : ''}: {fmtMoneyShort(f.pendingChanges.price)} price, {f.pendingChanges.days || 0} days — shown separately until approved (CHG-006).</Alert>}
          <MonthChart f={f} costs={costs} what={what} setWhat={setWhat} />
          {costs && <Evm f={f} />}
          {costs && f.contingency > 0 && (
            <Card title="Contingency" sub="Held outside the BAC; drawdowns are requested against risks or changes and approved (FIN-011).">
              <div className="grid g-3">
                <Tile label="Contingency" value={fmtMoneyShort(f.contingency)} />
                <Tile label="Drawn" value={fmtMoneyShort(f.contingencyDrawn)} />
                <Tile label="Remaining" value={fmtMoneyShort(f.contingencyRemaining)} tone={f.contingencyRemaining < f.contingency * 0.2 ? 'warn' : ''} />
              </div>
            </Card>
          )}
          {f.arrangements?.length > 1 && (
            <Card title="Commercial arrangements (FIN-001)" flush>
              <Table rows={f.arrangements.map((a) => ({ ...a, id: a.key }))} columns={[
                { key: 'label', label: 'Arrangement' }, { key: 'model', label: 'Model' },
                { key: 'price', label: 'Price', num: true, render: (a) => <Money v={a.price} /> },
                { key: 'cap', label: 'Cap', num: true, render: (a) => <Money v={a.cap} /> },
                { key: 'fee', label: 'Monthly fee', num: true, render: (a) => <Money v={a.fee} /> },
              ]} />
            </Card>
          )}
        </>
      );
    }}</Async>
  );
}

function MonthChart({ f, costs, what, setWhat }) {
  const s = useFinSeries(f.months, { cumulative: true, costs: costs && what === 'cost', revenue: !costs || what === 'fees' });
  return (
    <Card title={what === 'cost' ? 'Cost: budget, actual and forecast' : 'Fees: budget, earned and forecast'} sub={`Cumulative. Actuals to ${fmtDate(f.asAt)}, the last approved timesheet week (BR-02).`}
      actions={costs && <Seg value={what} onChange={setWhat} options={[{ value: 'cost', label: 'Cost' }, { value: 'fees', label: 'Fees' }]} />}>
      {s.categories.length < 2 ? <Empty>No months yet.</Empty> : <LineChart categories={s.categories} series={s.series} labelX={monthLabel} markX={monthOf(todayIn('Australia/Sydney'))} />}
    </Card>
  );
}

function Evm({ f }) {
  const e = f.evm || {};
  const hist = e.history || [];
  return (
    <div className="grid g-2">
      <Card title="Earned value (FIN-029..031)" sub={e.applies ? 'Mandatory for this project’s classification.' : 'Calculated for all projects; mandatory for large projects.'}>
        <Table compact rows={[
          { id: 'pv', k: 'Planned value (PV)', v: <Money v={e.pv} /> }, { id: 'ev', k: 'Earned value (EV)', v: <Money v={e.ev} /> }, { id: 'ac', k: 'Actual cost (AC)', v: <Money v={e.ac} /> },
          { id: 'sv', k: 'Schedule variance (EV − PV)', v: <span className={e.sv < 0 ? 'neg' : ''}><Money v={e.sv} /></span> }, { id: 'cv', k: 'Cost variance (EV − AC)', v: <span className={e.cv < 0 ? 'neg' : ''}><Money v={e.cv} /></span> },
          { id: 'spi', k: 'SPI', v: ratio(e.spi) }, { id: 'cpi', k: 'CPI', v: ratio(e.cpi) }, { id: 'tcpi', k: 'TCPI (to complete on budget)', v: ratio(e.tcpi) },
          { id: 'pct', k: 'Percent complete (earned)', v: fmtPct(e.pctComplete, 1) },
        ]} columns={[{ key: 'k', label: 'Measure', sort: false }, { key: 'v', label: 'Value', num: true, sort: false }]} />
        <h4 className="mt-3 mb-1">EAC by method (FIN-020)</h4>
        <Table compact rows={Object.entries(f.eacOptions || {}).filter(([, v]) => v != null).map(([k, v]) => ({ id: k, k, v }))} columns={[
          { key: 'k', label: 'Method', sort: false, render: (r) => <span>{r.k}{r.k === f.eacMethod && <Badge tone="teal">In use</Badge>}</span> },
          { key: 'v', label: 'EAC', num: true, sort: false, render: (r) => <Money v={r.v} /> },
        ]} />
      </Card>
      <Card title="Earned value over time (FIN-031)" sub="Weekly, from the forecast refresh (FIN-028).">
        {hist.length < 2 ? <Empty>The curves appear after two weekly refreshes.</Empty> : (
          <>
            <h4 className="mb-1">Planned value, earned value and actual cost</h4>
            <LineChart height={200} categories={hist.map((h) => h.date)} labelX={(d) => fmtDatePattern(d, 'd MMM')} series={[
              { name: 'Planned value', color: SERIES[0], values: hist.map((h) => h.pv ?? null) },
              { name: 'Earned value', color: SERIES[2], values: hist.map((h) => h.ev ?? null) },
              { name: 'Actual cost', color: SERIES[1], values: hist.map((h) => h.ac ?? null) },
            ]} />
            <h4 className="mt-3 mb-1">SPI and CPI</h4>
            <LineChart height={170} categories={hist.map((h) => h.date)} labelX={(d) => fmtDatePattern(d, 'd MMM')} format={(v) => v.toFixed(2)} series={[
              { name: 'SPI', color: SERIES[0], values: hist.map((h) => h.spi) },
              { name: 'CPI', color: SERIES[1], values: hist.map((h) => h.cpi) },
            ]} />
          </>
        )}
      </Card>
    </div>
  );
}

// ---------- Budget (FIN-008..011) ----------
function Budget() {
  const { id, p, can, lookups } = useProject();
  const list = useApi(`/api/projects/${id}/budgets`);
  const [draft, setDraft] = useState(null);
  const [run, busy] = useAction();
  const dialog = useDialog();
  const edit = can('budget', 'U');
  const versions = list.data || [];
  const working = versions.filter((b) => b.status === 'Draft').at(-1);
  const approved = versions.filter((b) => b.status === 'Approved').at(-1);
  useEffect(() => {
    if (!list.data) return;
    const src = working || approved;
    setDraft(src ? { lines: src.lines.map((l, i) => ({ ...l, _k: i })), contingency: src.contingency || 0, management_reserve: src.management_reserve || 0 } : { lines: [], contingency: 0, management_reserve: 0 });
  }, [list.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!draft) return <Async q={list}>{() => null}</Async>;
  const months = monthsBetween(monthOf(p.start_date), monthOf(p.end_date));
  const setLine = (k, patchObj) => setDraft({ ...draft, lines: draft.lines.map((l) => (l._k === k ? { ...l, ...patchObj } : l)) });
  const addLine = () => setDraft({ ...draft, lines: [...draft.lines, { _k: Date.now(), month: months[0], cost_type: 'labour', role: '', hours: 0, cost: 0, revenue: 0 }] });
  const bottomUp = async () => {
    if (!(await dialog({ title: 'Labour from the resource plan', message: 'Replace the labour lines with hours from the allocations at cost and charge-out rates (FIN-008). Other cost types are kept.', confirm: 'Replace labour' }))) return;
    const lines = await run(() => get(`/api/projects/${id}/budget/bottom-up`));
    if (lines) setDraft({ ...draft, lines: [...draft.lines.filter((l) => l.cost_type !== 'labour'), ...lines.map((l, i) => ({ ...l, _k: `b${i}` }))] });
  };
  const save = async () => {
    const out = await run(() => put(`/api/projects/${id}/budget`, { lines: draft.lines, contingency: draft.contingency, management_reserve: draft.management_reserve }), 'Draft budget saved. It takes effect when the baseline is approved (BR-10).');
    if (out) list.reload();
  };
  const tot = (key, filter = (l) => l.cost_type !== 'contingency') => draft.lines.filter(filter).reduce((a, l) => a + (Number(l[key]) || 0), 0);
  const cost = tot('cost'), revenue = tot('revenue');
  const byMonth = months.map((m) => ({ id: m, month: m, ...Object.fromEntries(COST_TYPES.map((t) => [t, draft.lines.filter((l) => l.month === m && l.cost_type === t).reduce((a, l) => a + (Number(l.cost) || 0), 0)])), revenue: draft.lines.filter((l) => l.month === m).reduce((a, l) => a + (Number(l.revenue) || 0), 0) }));
  return (
    <div className="stack">
      {p.baseline_approved && working && <Alert tone="info">A re-baseline draft is open. Submit it from the Governance tab with a reason; changes above the threshold also need the engagement executive (BR-10).</Alert>}
      <div className="grid g-4">
        <Tile label="Budget cost (BAC)" value={fmtMoneyShort(cost)} sub={approved ? `Approved: ${fmtMoneyShort(approved.totals.cost)}` : 'No approved budget yet'} />
        <Tile label="Budgeted fees" value={fmtMoneyShort(revenue)} />
        <Tile label="Budgeted margin" value={revenue ? fmtPct((revenue - cost) / revenue, 1) : '—'} />
        <Tile label="Contingency and reserve" value={fmtMoneyShort(tot('cost', (l) => l.cost_type === 'contingency') + Number(draft.contingency || 0))} sub={`Management reserve ${fmtMoneyShort(draft.management_reserve)}`} />
      </div>
      <Card title={working ? `${working.label} (draft)` : approved ? `${approved.label} (approved)` : 'New budget'} sub="Time-phased by month and cost type; labour can be built bottom-up from the resource plan." flush
        actions={edit && <>
          <button className="btn btn-sm" disabled={busy} onClick={bottomUp}><Icon name="users" /> Labour from resource plan</button>
          <button className="btn btn-sm" onClick={addLine}><Icon name="plus" /> Add line</button>
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={save}>Save draft</button>
        </>}>
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>Month</th><th>Cost type</th><th>Stage</th><th>Role or item</th><th className="num">Hours</th><th className="num">Cost</th><th className="num">Fees</th>{edit && <th />}</tr></thead>
            <tbody>
              {!draft.lines.length && <tr><td colSpan={8} className="muted">No lines yet.</td></tr>}
              {[...draft.lines].sort((a, b) => a.month.localeCompare(b.month) || COST_TYPES.indexOf(a.cost_type) - COST_TYPES.indexOf(b.cost_type)).map((l) => (
                <tr key={l._k}>
                  <td>{edit ? <select value={l.month} onChange={(e) => setLine(l._k, { month: e.target.value })}>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select> : monthLabel(l.month)}</td>
                  <td>{edit ? <select value={l.cost_type} onChange={(e) => setLine(l._k, { cost_type: e.target.value })}>{COST_TYPES.map((t) => <option key={t}>{t}</option>)}</select> : l.cost_type}</td>
                  <td>{edit ? <select value={l.stage_id || ''} onChange={(e) => setLine(l._k, { stage_id: e.target.value || null })}><option value="">—</option>{(lookups?.stages || []).filter((s) => s.project_id === id).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select> : (lookups?.stages?.find((s) => s.id === l.stage_id)?.label || '—')}</td>
                  <td>{edit ? <input type="text" value={l.role || l.note || ''} onChange={(e) => setLine(l._k, { role: e.target.value })} /> : (l.role || l.note || '—')}</td>
                  <td className="num">{edit ? <input type="number" className="num" value={l.hours || 0} onChange={(e) => setLine(l._k, { hours: Number(e.target.value) })} style={{ width: 80 }} /> : fmtNum(l.hours)}</td>
                  <td className="num">{edit ? <input type="number" className="num" value={l.cost || 0} onChange={(e) => setLine(l._k, { cost: Number(e.target.value) })} style={{ width: 110 }} /> : <Money v={l.cost} />}</td>
                  <td className="num">{edit ? <input type="number" className="num" value={l.revenue || 0} onChange={(e) => setLine(l._k, { revenue: Number(e.target.value) })} style={{ width: 110 }} /> : <Money v={l.revenue} />}</td>
                  {edit && <td><button className="btn btn-xs btn-ghost" aria-label="Remove line" onClick={() => setDraft({ ...draft, lines: draft.lines.filter((x) => x._k !== l._k) })}><Icon name="trash" size={13} /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {edit && (
          <div className="card-body form-grid">
            <Field label="Contingency held outside BAC (FIN-011)"><input type="number" value={draft.contingency} onChange={(e) => setDraft({ ...draft, contingency: Number(e.target.value) })} /></Field>
            <Field label="Management reserve"><input type="number" value={draft.management_reserve} onChange={(e) => setDraft({ ...draft, management_reserve: Number(e.target.value) })} /></Field>
          </div>
        )}
      </Card>
      <Card title="By month" flush>
        <Table compact rows={byMonth} columns={[
          { key: 'month', label: 'Month', render: (r) => monthLabel(r.month) },
          ...COST_TYPES.map((t) => ({ key: t, label: t[0].toUpperCase() + t.slice(1), num: true, render: (r) => (r[t] ? <Money v={r[t]} /> : <span className="muted">—</span>) })),
          { key: 'revenue', label: 'Fees', num: true, render: (r) => <Money v={r.revenue} /> },
        ]} />
      </Card>
      <Card title="Budget versions" sub="Approved versions are the baseline; earlier versions are kept as superseded (BR-10)." flush>
        <Table rows={[...versions].reverse()} columns={[
          { key: 'version_no', label: 'Version', num: true },
          { key: 'label', label: 'Label' },
          { key: 'status', label: 'Status', render: (b) => <Status v={b.status} /> },
          { key: 'cost', label: 'Cost', num: true, sort: (b) => b.totals.cost, render: (b) => <Money v={b.totals.cost} /> },
          { key: 'revenue', label: 'Fees', num: true, sort: (b) => b.totals.revenue, render: (b) => <Money v={b.totals.revenue} /> },
          { key: 'margin', label: 'Margin', num: true, sort: (b) => b.totals.margin, render: (b) => <Pct v={b.totals.margin} d={1} /> },
          { key: 'reason', label: 'Reason', render: (b) => <span className="small">{b.reason || '—'}</span> },
          { key: 'approved_at', label: 'Approved', render: (b) => <D v={b.approved_at?.slice(0, 10)} /> },
        ]} />
      </Card>
    </div>
  );
}

// ---------- Forecast (FIN-018..028, UC-05) ----------
function Forecast() {
  const { id, can, costs } = useProject();
  const q = useApi(`/api/projects/${id}/forecast`);
  const cmp = useApi(`/api/projects/${id}/forecast/compare`);
  const sc = useApi(`/api/projects/${id}/scenarios`);
  const [v, setV] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { if (q.data) { setV(q.data); setDirty(false); } }, [q.data]);
  if (!v) return <Async q={q} empty={<Card><Empty>No forecast yet. The project manager’s working forecast is created on first open.</Empty></Card>}>{() => null}</Async>;
  const editable = ['Draft', 'Queried'].includes(v.status) && can('budget', 'U');
  const set = (k, val) => { setV({ ...v, [k]: val }); setDirty(true); };
  const save = async (quiet) => {
    setErrors({});
    setBusy(true);
    try {
      const out = await patch(`/api/forecast/${v.id}`, { adjustments: v.adjustments, non_labour: v.non_labour, eac_method: v.eac_method, manual_eac: v.manual_eac, eac_justification: v.eac_justification, commentary: v.commentary });
      setV(out); setDirty(false);
      if (!quiet) toast('Forecast saved', 'ok');
      return out;
    } catch (e) { setErrors(e.details || {}); toast(e); return null; } finally { setBusy(false); }
  };
  const submit = async () => {
    if (dirty && !(await save(true))) return;
    setBusy(true);
    try {
      setV(await post(`/api/forecast/${v.id}/submit`));
      toast('Forecast submitted to the engagement manager', 'ok');
    } catch (e) { setErrors(e.details || {}); toast(e); } finally { setBusy(false); }
  };
  const t = v.totals;
  return (
    <div className="stack">
      <Card title={`${v.name} — ${v.status}`} sub={v.cycle_period ? `Monthly cycle for ${monthLabel(v.cycle_period)}: project manager → engagement manager → finance (FIN-022).` : 'Working forecast between cycles.'}
        actions={<>
          {editable && <button className="btn btn-sm" disabled={busy || !dirty} onClick={() => save()}>Save</button>}
          {editable && <button className="btn btn-sm btn-primary" disabled={busy} onClick={submit}><Icon name="send" /> Submit</button>}
        </>}>
        {v.finance_query && v.status === 'Queried' && <Alert tone="warn"><b>Finance query:</b> {v.finance_query}</Alert>}
        {v.marginBelowTarget && costs && <Alert tone="warn">Forecast margin is below target: commentary is required and the engagement executive is notified (UC-05).</Alert>}
        <div className="grid g-6">
          <Tile label="Actual cost" value={fmtMoneyShort(t.ac)} sub={`As at ${fmtDate(t.asAt)}`} />
          <Tile label="Estimate to complete" value={fmtMoneyShort(t.etc)} />
          <Tile label="EAC" value={fmtMoneyShort(t.eac)} sub={v.movement ? `${v.movement.eac >= 0 ? '+' : ''}${fmtMoneyShort(v.movement.eac)} vs prior` : 'No prior approved forecast'} tone={v.commentaryRequired ? 'warn' : ''} />
          <Tile label="BAC" value={fmtMoneyShort(t.bac)} sub={`VAC ${fmtMoneyShort(t.vac)}`} />
          <Tile label="Fees at completion" value={fmtMoneyShort(t.eacRevenue)} sub={v.movement ? `${v.movement.revenue >= 0 ? '+' : ''}${fmtMoneyShort(v.movement.revenue)} vs prior` : ''} />
          {costs && <Tile label="Forecast margin" value={fmtPct(t.forecastMargin, 1)} sub={`Baseline ${fmtPct(t.baselineMargin, 1)}`} tone={v.marginBelowTarget ? 'bad' : ''} />}
        </div>
        <div className="form-grid mt-3">
          <Field label="EAC method (FIN-020)" hint={t.eacOptions?.[v.eac_method] != null ? `This method gives ${fmtMoney(t.eacOptions[v.eac_method])}` : null}>
            <select value={v.eac_method || 'Bottom-up'} disabled={!editable} onChange={(e) => set('eac_method', e.target.value)}>
              {EAC_METHODS.map((m) => <option key={m} value={m}>{m}{t.eacOptions?.[m] != null ? ` — ${fmtMoneyShort(t.eacOptions[m])}` : ''}</option>)}
            </select>
          </Field>
          {v.eac_method === 'Manual' && <Field label="Manual EAC"><input type="number" value={v.manual_eac || ''} disabled={!editable} onChange={(e) => set('manual_eac', Number(e.target.value))} /></Field>}
          {v.eac_method && v.eac_method !== 'Bottom-up' && <Field label="Why this method" required error={errors.eac_justification} full><textarea rows={2} value={v.eac_justification || ''} disabled={!editable} onChange={(e) => set('eac_justification', e.target.value)} /></Field>}
          <Field label="Commentary" required={v.commentaryRequired || v.marginBelowTarget} error={errors.commentary} full hint={v.commentaryRequired ? `Required: EAC or margin moved by more than 5% or $10,000 from the prior approved forecast (BR-14).` : 'Explain movements, risks and assumptions.'}>
            <textarea rows={3} value={v.commentary || ''} disabled={!editable} onChange={(e) => set('commentary', e.target.value)} />
          </Field>
        </div>
      </Card>
      <LabourGrid v={v} editable={editable} onChange={(adjustments) => set('adjustments', adjustments)} costs={costs} />
      <NonLabour v={v} editable={editable} onChange={(rows) => set('non_labour', rows)} />
      <div className="grid g-2">
        <Card title="Compared with prior forecasts and the baseline (FIN-023)" flush>
          <Async q={cmp}>{(c) => (
            <>
            {costs && c.trend?.length > 1 && (
              <div className="card-body">
                <h4 className="mb-1">Forecast margin by cycle (FIN-048)</h4>
                <LineChart height={160} categories={c.trend.map((t) => t.period)} labelX={monthLabel} format={(v) => fmtPct(v, 1)} series={[{ name: 'Forecast margin', color: SERIES[0], values: c.trend.map((t) => t.forecastMargin ?? null) }]} />
              </div>
            )}
            <Table compact rows={c.rows.map((r, i) => ({ ...r, id: i }))} columns={[
              { key: 'label', label: 'Version', sort: false },
              costs && { key: 'eac', label: 'Cost at completion', num: true, sort: false, render: (r) => <Money v={r.eac} /> },
              { key: 'eacRevenue', label: 'Fees at completion', num: true, sort: false, render: (r) => <Money v={r.eacRevenue} /> },
              costs && { key: 'forecastMargin', label: 'Margin', num: true, sort: false, render: (r) => <Pct v={r.forecastMargin} d={1} /> },
            ].filter(Boolean)} />
            </>
          )}</Async>
        </Card>
        <Card title="Scenarios (FIN-024)" sub="What-if views that do not change the forecast." flush>
          <Async q={sc}>{(rows) => (
            <Table compact rows={rows.map((r) => ({ ...r, id: r.name }))} columns={[
              { key: 'name', label: 'Scenario', sort: false },
              costs && { key: 'eac', label: 'EAC', num: true, sort: false, render: (r) => <Money v={r.eac} /> },
              { key: 'eacRevenue', label: 'Fees', num: true, sort: false, render: (r) => <Money v={r.eacRevenue} /> },
              costs && { key: 'forecastMargin', label: 'Margin', num: true, sort: false, render: (r) => <Pct v={r.forecastMargin} d={1} /> },
            ].filter(Boolean)} />
          )}</Async>
        </Card>
      </div>
    </div>
  );
}

// Labour forecast by person or role and month: hours from allocations, overridden by adjustments.
function LabourGrid({ v, editable, onChange, costs }) {
  const lines = v.labourLines || [];
  const months = useMemo(() => [...new Set(lines.map((l) => l.month))].sort(), [lines]);
  const keys = useMemo(() => {
    const m = new Map();
    for (const l of lines) if (!m.has(l.key)) m.set(l.key, { key: l.key, label: l.label, role: l.role, person_id: l.person_id });
    for (const a of v.adjustments || []) if (!m.has(a.key)) m.set(a.key, { key: a.key, label: a.label || a.role, role: a.role, person_id: a.person_id });
    return [...m.values()];
  }, [lines, v.adjustments]);
  const hoursOf = (key, month) => {
    const adj = (v.adjustments || []).find((a) => a.key === key && a.month === month);
    if (adj) return adj.hours;
    return lines.filter((l) => l.key === key && l.month === month).reduce((a, l) => a + l.hours, 0);
  };
  const setHours = (row, month, hours) => {
    const rest = (v.adjustments || []).filter((a) => !(a.key === row.key && a.month === month));
    onChange([...rest, { key: row.key, month, hours: Number(hours) || 0, person_id: row.person_id || null, role: row.role, label: row.label }]);
  };
  const dialog = useDialog();
  const addRole = async () => {
    const role = await dialog({ title: 'Add a role to the forecast', input: 'line', required: true, label: 'Role, for example Senior Consultant' });
    if (!role || !months.length) return;
    onChange([...(v.adjustments || []), { key: `role:${role}:added${Date.now()}`, month: months[0], hours: 0, role, label: `${role} (placeholder)` }]);
  };
  if (!months.length) return <Card title="Labour forecast"><Empty>No remaining months to forecast.</Empty></Card>;
  const cost = lines.reduce((a, l) => a + (l.cost || 0), 0);
  return (
    <Card title="Labour forecast (FIN-018)" sub={`Hours by person and month from allocations; edited cells override them. ${costs ? `Forecast labour cost ${fmtMoneyShort(cost)}.` : ''}`} flush
      actions={editable && <button className="btn btn-sm" onClick={addRole}><Icon name="plus" /> Add role</button>}>
      <div className="table-wrap">
        <table className="table compact va-middle">
          <thead><tr><th>Person or role</th>{months.map((m) => <th key={m} className="num">{monthLabel(m)}</th>)}<th className="num">Total</th></tr></thead>
          <tbody>
            {keys.map((row) => {
              const total = months.reduce((a, m) => a + hoursOf(row.key, m), 0);
              return (
                <tr key={row.key}>
                  <td className="nowrap">{row.label}<div className="tiny muted">{row.role}</div></td>
                  {months.map((m) => {
                    const h = hoursOf(row.key, m);
                    const adjusted = (v.adjustments || []).some((a) => a.key === row.key && a.month === m);
                    return <td key={m} className="num">{editable ? <input type="number" className={`num ${adjusted ? 'adjusted' : ''}`} style={{ width: 64 }} value={Math.round(h * 10) / 10} onChange={(e) => setHours(row, m, e.target.value)} /> : <span className={adjusted ? 'strong' : ''}>{fmtNum(h)}</span>}</td>;
                  })}
                  <td className="num strong">{fmtNum(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function NonLabour({ v, editable, onChange }) {
  const rows = v.non_labour || [];
  const auto = (v.nonLabourLines || []).filter((l) => l.source === 'commitment');
  const set = (i, patchObj) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patchObj } : r)));
  return (
    <Card title="Expenses and third-party costs" sub="Forecast non-labour cost by month; open commitments are included automatically (FIN-015)." flush
      actions={editable && <button className="btn btn-sm" onClick={() => onChange([...rows, { month: monthOf(todayIn('Australia/Sydney')), category: 'Expenses', description: '', cost: 0, revenue: 0 }])}><Icon name="plus" /> Add line</button>}>
      <div className="table-wrap">
        <table className="table compact">
          <thead><tr><th>Month</th><th>Category</th><th>Description</th><th className="num">Cost</th><th className="num">Recoverable</th>{editable && <th />}</tr></thead>
          <tbody>
            {!rows.length && !auto.length && <tr><td colSpan={6} className="muted">No non-labour costs forecast.</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{editable ? <input type="month" value={r.month} onChange={(e) => set(i, { month: e.target.value })} /> : monthLabel(r.month)}</td>
                <td>{editable ? <select value={r.category} onChange={(e) => set(i, { category: e.target.value })}>{['Expenses', 'Third-party', 'Subcontractor', 'Software', 'Travel'].map((c) => <option key={c}>{c}</option>)}</select> : r.category}</td>
                <td>{editable ? <input type="text" value={r.description || ''} onChange={(e) => set(i, { description: e.target.value })} /> : r.description}</td>
                <td className="num">{editable ? <input type="number" className="num" style={{ width: 100 }} value={r.cost || 0} onChange={(e) => set(i, { cost: Number(e.target.value) })} /> : <Money v={r.cost} />}</td>
                <td className="num">{editable ? <input type="number" className="num" style={{ width: 100 }} value={r.revenue || 0} onChange={(e) => set(i, { revenue: Number(e.target.value) })} /> : <Money v={r.revenue} />}</td>
                {editable && <td><button className="btn btn-xs btn-ghost" aria-label="Remove line" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Icon name="trash" size={13} /></button></td>}
              </tr>
            ))}
            {auto.map((r, i) => <tr key={`c${i}`} className="muted-row"><td>{monthLabel(r.month)}</td><td>Commitment</td><td>{r.description}</td><td className="num"><Money v={r.cost} /></td><td className="num">—</td>{editable && <td />}</tr>)}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Billing and costs ----------
function Billing() {
  const { id, p, engId, can, costs } = useProject();
  const scope = { engagement_id: engId, project_id: id };
  const defaults = { project_id: id };
  const [tab, setTab] = useState('invoices');
  const tabs = [['invoices', 'Invoices'], ['events', 'Billing events'], ['expenses', 'Expenses'], ['supplier', 'Supplier costs'], ['commitments', 'Commitments'], costs && ['wip', 'Write-ups and write-downs'], can('budget') && ['drawdowns', 'Contingency drawdowns']].filter(Boolean);
  return (
    <>
      <div className="subtabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'invoices' && (can('billing') ? <Invoices engagementId={engId} projects={[p]} /> : <Alert>Invoices are visible to finance and the engagement manager.</Alert>)}
      {tab === 'events' && <Register entity="billing_event" scope={scope} defaults={defaults} sub="Milestone payments, fixed fees and recurring fees; deliverable acceptance marks the linked event ready to invoice (SCP-004, FIN-034)." />}
      {tab === 'expenses' && <Register entity="expense" scope={scope} defaults={defaults} sub="Claims with receipts against the engagement’s expense policy; billable expenses flow to invoices (TEX-008)." />}
      {tab === 'supplier' && <Register entity="supplier_cost" scope={scope} defaults={defaults} sub="Subcontractor and third-party costs, entered or imported from the accounting system (FIN-014)." />}
      {tab === 'commitments' && <Register entity="commitment" scope={scope} defaults={defaults} sub="Purchase orders raised with suppliers; open commitments count in the forecast (FIN-015)." />}
      {tab === 'wip' && <Register entity="wip_adjustment" scope={scope} defaults={defaults} sub="Adjustments to unbilled value with a reason code; approved by the engagement manager and finance (FIN-033)." />}
      {tab === 'drawdowns' && <Register entity="drawdown" scope={scope} defaults={defaults} sub="Drawdowns from contingency or management reserve against a risk or change (FIN-011)." />}
    </>
  );
}
