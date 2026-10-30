// Finance (FIN-022..050): revenue forecast for the year, the monthly forecast cycle, invoices
// across engagements, debtors and cash flow, period locking, imports and standard reports.
import { useRef, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { post, upload, download } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { useLookups } from '../components/fields.jsx';
import Invoices from '../components/Invoices.jsx';
import { PageHead, RouteTabs, Card, Async, Table, Tile, Status, Badge, Money, Pct, DT, Alert, Empty, useAction, useDialog } from '../components/ui.jsx';
import { BarChart, SERIES, monthLabel } from '../components/charts.jsx';
import { fmtMoneyShort, fmtDate } from '../../shared/format.js';
import Icon from '../components/Icon.jsx';

export default function Finance() {
  const { me } = useSession();
  return (
    <>
      <PageHead title="Finance" sub="Revenue and margin across the portfolio, the monthly forecast cycle, invoicing and period close." />
      <RouteTabs tabs={[
        { to: '/finance', label: 'Overview', end: true },
        { to: '/finance/forecast', label: 'Forecast cycle' },
        { to: '/finance/invoices', label: 'Invoices' },
        me.can.finance && { to: '/finance/periods', label: 'Periods' },
        me.can.finance && { to: '/finance/imports', label: 'Imports' },
        { to: '/finance/reports', label: 'Reports' },
      ]} />
      <Routes>
        <Route index element={<Overview />} />
        <Route path="forecast" element={<Cycle />} />
        <Route path="invoices" element={<AllInvoices />} />
        <Route path="periods" element={<Periods />} />
        <Route path="imports" element={<Imports />} />
        <Route path="reports" element={<Reports />} />
      </Routes>
    </>
  );
}

function Overview() {
  const rev = useApi('/api/finance/revenue-forecast');
  const cash = useApi('/api/finance/cash-flow');
  const debt = useApi('/api/finance/debtors');
  const acc = useApi('/api/finance/accuracy');
  return (
    <div className="stack">
      <Async q={rev}>{(r) => {
        const actual = r.months.reduce((a, m) => a + m.actual, 0);
        const contracted = r.months.reduce((a, m) => a + m.contracted, 0);
        const pipeline = r.months.reduce((a, m) => a + m.pipeline + m.unstarted, 0);
        return (
          <>
            <div className="grid g-4">
              <Tile label={`FY${String(r.fy).slice(2)} revenue to date`} value={fmtMoneyShort(actual)} sub="Fees earned (recognised)" />
              <Tile label="Contracted, rest of year" value={fmtMoneyShort(contracted)} sub="Forecast on signed work" />
              <Tile label="Weighted pipeline" value={fmtMoneyShort(pipeline)} sub="Signed not started and opportunities" />
              <Tile label="Full-year outlook" value={fmtMoneyShort(actual + contracted + pipeline)} />
            </div>
            <Card title={`Revenue by month, FY${String(r.fy).slice(2)} (FIN-025)`} sub="Earned to date, then contracted forecast, signed-not-started work and weighted pipeline.">
              <BarChart stacked height={240} categories={r.months.map((m) => m.month)} labelX={monthLabel} series={[
                { name: 'Earned', color: SERIES[0], values: r.months.map((m) => m.actual) },
                { name: 'Contracted forecast', color: SERIES[2], values: r.months.map((m) => m.contracted) },
                { name: 'Signed, not started', color: SERIES[3], values: r.months.map((m) => m.unstarted) },
                { name: 'Weighted pipeline', color: SERIES[1], values: r.months.map((m) => m.pipeline) },
              ]} />
            </Card>
          </>
        );
      }}</Async>
      <div className="grid g-2">
        <Card title="Cash flow, next 12 months (FIN-040)" flush>
          <Async q={cash}>{(rows) => (
            <Table compact rows={rows.map((r) => ({ ...r, id: r.month }))} empty="No forecast receipts." columns={[
              { key: 'month', label: 'Month', render: (r) => monthLabel(r.month) },
              { key: 'receipts', label: 'Receipts', num: true, render: (r) => <Money v={r.receipts} /> },
              { key: 'payments', label: 'Payments', num: true, render: (r) => <Money v={r.payments} /> },
              { key: 'net', label: 'Net', num: true, render: (r) => <span className={r.net < 0 ? 'neg' : ''}><Money v={r.net} /></span> },
              { key: 'cumulative', label: 'Cumulative', num: true, render: (r) => <Money v={r.cumulative} /> },
            ]} />
          )}</Async>
        </Card>
        <Card title="Debtors (FIN-036)">
          <Async q={debt}>{(d) => (
            <>
              <div className="grid g-2 mb-2">
                <Tile label="Receivables" value={fmtMoneyShort(d.receivables)} sub="Including GST" />
                <Tile label="Debtor days" value={d.debtorDays == null ? '—' : Math.round(d.debtorDays)} />
              </div>
              <Table compact rows={Object.entries(d.buckets).map(([k, v]) => ({ id: k, k, v }))} columns={[
                { key: 'k', label: 'Age', sort: false, render: (r) => (r.k === 'current' ? 'Not yet due' : `${r.k} days overdue`) },
                { key: 'v', label: 'Amount', num: true, sort: false, render: (r) => <span className={r.k !== 'current' && r.v ? 'neg' : ''}><Money v={r.v} /></span> },
              ]} />
            </>
          )}</Async>
        </Card>
      </div>
      <Card title="Forecast accuracy (FIN-026)" sub="Each month’s revenue forecast in the last approved cycle before it, against the actual." flush>
        <Async q={acc}>{(rows) => (
          <Table rows={rows.map((r, i) => ({ ...r, id: i }))} initialSort={{ key: 'month', dir: -1 }} empty="Accuracy appears once approved forecasts are followed by actuals." columns={[
            { key: 'month', label: 'Month', render: (r) => monthLabel(r.month) },
            { key: 'project', label: 'Project', render: (r) => <Link to={`/projects/${r.projectId}/financials?tab=forecast`}>{r.project}</Link> },
            { key: 'manager', label: 'Engagement manager' },
            { key: 'forecast', label: 'Forecast', num: true, render: (r) => <Money v={r.forecast} /> },
            { key: 'actual', label: 'Actual', num: true, render: (r) => <Money v={r.actual} /> },
            { key: 'accuracy', label: 'Accuracy', num: true, render: (r) => <span className={r.accuracy < 0.9 ? 'neg' : ''}><Pct v={r.accuracy} /></span> },
          ]} />
        )}</Async>
      </Card>
    </div>
  );
}

// FIN-022: finance opens the cycle after locking the month; PMs submit, EMs submit, finance approves.
function Cycle() {
  const { me } = useSession();
  const cycles = useApi('/api/forecast-cycles');
  const [sel, setSel] = useState(null);
  const [run, busy] = useAction();
  const dialog = useDialog();
  const open = async () => {
    const period = await dialog({ title: 'Open a forecast cycle', message: 'The month must be locked first. Project forecasts roll forward and project managers are notified with the deadlines.', input: 'line', required: true, label: 'Month (yyyy-mm)' });
    if (!period) return;
    const out = await run(() => post('/api/forecast-cycles', { period }), 'Cycle opened');
    if (out) { cycles.reload(); setSel(out.id); }
  };
  return (
    <Async q={cycles}>{(list) => {
      const id = sel || list[0]?.id;
      return (
        <div className="split-r">
          <Card title="Cycles" flush actions={me.can.finance && <button className="btn btn-sm btn-primary" disabled={busy} onClick={open}><Icon name="plus" /> Open cycle</button>}>
            {!list.length ? <Empty>No cycles yet.</Empty> : (
              <ul className="list selectable">
                {list.map((c) => <li key={c.id} className={c.id === id ? 'active' : ''} onClick={() => setSel(c.id)}><div className="grow"><div className="strong">{monthLabel(c.period)}</div><div className="tiny muted">Opened {fmtDate(String(c.opened_at).slice(0, 10))}</div></div><Status v={c.status} /></li>)}
              </ul>
            )}
          </Card>
          {id ? <CycleView key={id} id={id} /> : <Card><Empty>Open the first cycle after locking a month.</Empty></Card>}
        </div>
      );
    }}</Async>
  );
}

function CycleView({ id }) {
  const { me } = useSession();
  const q = useApi(`/api/forecast-cycles/${id}`);
  const [run, busy] = useAction();
  const dialog = useDialog();
  const decide = async (v, decision) => {
    const comment = decision === 'query'
      ? await dialog({ title: `Query the forecast for ${v.project}`, input: true, required: true, label: 'Question for the project manager', confirm: 'Send query' })
      : await dialog({ title: `Approve and lock the forecast for ${v.project}`, input: 'line', label: 'Comment (optional)', confirm: 'Approve' });
    if (comment === null) return;
    const out = await run(() => post(`/api/forecast/${v.id}/decision`, { decision, comment }), decision === 'query' ? 'Query sent' : 'Approved and locked');
    if (out) q.reload();
  };
  const submitEngagement = async (engId, name) => {
    const commentary = await dialog({ title: `Submit ${name} to finance`, message: 'All project forecasts in the engagement must be submitted by their project managers.', input: true, label: 'Engagement commentary', confirm: 'Submit' });
    if (commentary === null) return;
    const out = await run(() => post(`/api/forecast-cycles/${id}/engagement-submit`, { engagement_id: engId, commentary }), (o) => `${o.submitted} forecasts submitted to finance`);
    if (out) q.reload();
  };
  return (
    <Async q={q}>{(c) => {
      const byEng = [...new Map(c.versions.map((v) => [v.engagement_id, v.engagement])).entries()];
      const counts = (s) => c.versions.filter((v) => v.status === s).length;
      return (
        <div className="stack">
          <Card title={`Forecast cycle for ${monthLabel(c.period)}`} sub={c.deadlines ? `Project managers by ${fmtDate(c.deadlines.pm)} · engagement managers by ${fmtDate(c.deadlines.em)} · finance by ${fmtDate(c.deadlines.finance)}` : ''}>
            <div className="grid g-5">
              <Tile label="Draft" value={counts('Draft')} />
              <Tile label="Queried" value={counts('Queried')} tone={counts('Queried') ? 'warn' : ''} />
              <Tile label="Submitted by PM" value={counts('Submitted (PM)')} />
              <Tile label="Submitted by EM" value={counts('Submitted (EM)')} />
              <Tile label="Approved" value={counts('Approved')} tone="good" />
            </div>
          </Card>
          {byEng.map(([engId, name]) => {
            const vs = c.versions.filter((v) => v.engagement_id === engId);
            const canEm = vs.some((v) => v.status === 'Submitted (PM)') && Object.keys(me.access || {}).includes(engId) && (me.access[engId].fns.budget || []).some((x) => x.startsWith('U'));
            return (
              <Card key={engId} title={name} flush actions={canEm && <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => submitEngagement(engId, name)}>Submit engagement to finance</button>}>
                <Table rows={vs} columns={[
                  { key: 'project', label: 'Project', render: (v) => <Link to={`/projects/${v.project_id}/financials?tab=forecast`}>{v.project}</Link> },
                  { key: 'status', label: 'Status', render: (v) => <Status v={v.status} /> },
                  { key: 'eac', label: 'EAC', num: true, render: (v) => <Money v={v.eac} /> },
                  { key: 'eacRevenue', label: 'Fees at completion', num: true, render: (v) => <Money v={v.eacRevenue} /> },
                  { key: 'forecastMargin', label: 'Margin', num: true, render: (v) => (v.forecastMargin === undefined ? '—' : <Pct v={v.forecastMargin} d={1} />) },
                  { key: 'movement', label: 'EAC movement', num: true, sort: (v) => v.movement?.eac || 0, render: (v) => (v.movement ? <span className={v.movement.requiresCommentary ? 'flag' : ''} title={v.movement.requiresCommentary ? 'Above the BR-14 threshold' : ''}>{v.movement.eac >= 0 ? '+' : ''}{fmtMoneyShort(v.movement.eac)}</span> : '—') },
                  { key: 'commentary', label: 'Commentary', render: (v) => <span className="small">{v.finance_query ? <><b>Query:</b> {v.finance_query}<br /></> : null}{v.commentary || <span className="muted">—</span>}</span> },
                  me.can.finance && { key: 'act', label: '', sort: false, render: (v) => (v.status === 'Submitted (EM)' ? <span className="flex"><button className="btn btn-xs" disabled={busy} onClick={() => decide(v, 'query')}>Query</button><button className="btn btn-xs btn-primary" disabled={busy} onClick={() => decide(v, 'approve')}>Approve</button></span> : null) },
                ].filter(Boolean)} />
              </Card>
            );
          })}
        </div>
      );
    }}</Async>
  );
}

function AllInvoices() {
  const projects = useApi('/api/e/project');
  return <Invoices showEngagement title="Invoices across engagements" projects={projects.data || []} />;
}

// FIN-041: closing a month locks its actuals; later corrections post to the open period.
function Periods() {
  const q = useApi('/api/finance/periods');
  const [run, busy] = useAction();
  const dialog = useDialog();
  const act = async (p, action) => {
    if (!(await dialog({ title: `${action === 'lock' ? 'Lock' : 'Reopen'} ${monthLabel(p.id)}`, message: action === 'lock' ? 'Actuals for the month are frozen; adjustments post to the next open period (FIN-041).' : 'Reopening allows postings to the month again and is audited.', confirm: action === 'lock' ? 'Lock' : 'Reopen', danger: action !== 'lock' }))) return;
    const out = await run(() => post(`/api/finance/periods/${p.id}/${action}`), action === 'lock' ? 'Period locked' : 'Period reopened');
    if (out !== undefined) q.reload();
  };
  return (
    <Async q={q}>{(rows) => (
      <Card title="Financial periods" sub="By financial year; lock each month after the timesheet and invoice cut-off." flush>
        <Table rows={rows} columns={[
          { key: 'id', label: 'Month', render: (p) => monthLabel(p.id) },
          { key: 'fy', label: 'Financial year', render: (p) => `FY${String(p.fy).slice(2)}` },
          { key: 'status', label: 'Status', render: (p) => (p.status === 'locked' ? <Badge tone="navy"><Icon name="lock" size={11} /> Locked</Badge> : <Badge tone="green">Open</Badge>) },
          { key: 'locked_at', label: 'Locked', render: (p) => (p.locked_at ? <DT v={p.locked_at} /> : '—') },
          { key: 'act', label: '', sort: false, render: (p) => (p.status === 'locked' ? <button className="btn btn-xs" disabled={busy} onClick={() => act(p, 'unlock')}>Reopen</button> : <button className="btn btn-xs btn-primary" disabled={busy} onClick={() => act(p, 'lock')}>Lock</button>) },
        ]} />
      </Card>
    )}</Async>
  );
}

// FIN-014 / TEX-009: supplier costs exported from the accounting system.
function Imports() {
  const file = useRef(null);
  const [run, busy] = useAction();
  const [result, setResult] = useState(null);
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const out = await run(() => upload('/api/finance/import/supplier-costs', f), 'Import processed');
    if (out) setResult(out);
  };
  return (
    <Card title="Import supplier costs" sub="CSV from the accounting system; rows are matched to projects by project number and de-duplicated by external ID.">
      <p className="small">Columns: <span className="mono">project_code, supplier, invoice_ref, date, amount, cost_type, description, billable, external_id</span></p>
      <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => file.current?.click()}><Icon name="upload" /> Choose CSV file</button>
      {result && (
        <div className="mt-3">
          <Alert tone={result.errors?.length ? 'warn' : 'ok'}>{result.created ?? 0} created, {result.skipped ?? 0} skipped as duplicates{result.errors?.length ? `, ${result.errors.length} rows with errors` : ''}.</Alert>
          {result.errors?.length > 0 && <ul className="small">{result.errors.slice(0, 20).map((x, i) => <li key={i}>Row {x.row}: {x.error}</li>)}</ul>}
        </div>
      )}
    </Card>
  );
}

const REPORTS = [
  ['project-summary', 'Project financial summary', 'Contract, BAC, actual, EAC, VAC, fees, invoiced, WIP and margin by project.'],
  ['engagement-pl', 'Engagement profit and loss', 'Revenue, labour, expenses, third-party costs and margin by engagement.', true],
  ['monthly', 'Budget, actual and forecast by month', 'Monthly phasing across the selected engagements.'],
  ['po-burn', 'PO and contract burn', 'Consumption, remaining value and forecast exhaustion by purchase order.'],
  ['wip-ageing', 'WIP ageing', 'Unbilled value by age band and billed in advance.', true],
  ['debtors', 'Debtor ageing', 'Issued and overdue invoices with their age.'],
  ['margin', 'Margin analysis', 'Baseline against forecast margin and erosion.', true],
  ['utilisation', 'Utilisation', 'Billable utilisation by person.'],
  ['forecast-movements', 'Forecast movements', 'EAC and margin movement between cycles with commentary.'],
  ['change-impact', 'Change impact', 'Approved and pending changes with their price, cost and schedule effect.'],
  ['revenue-forecast', 'Revenue forecast', 'Revenue by month for the financial year.'],
];

// FIN-047 / FIN-050: standard reports exported to Excel.
function Reports() {
  const { me } = useSession();
  const lookups = useLookups();
  const [eng, setEng] = useState('');
  const costsAnywhere = me.can.finance || Object.values(me.access || {}).some((a) => a.costs);
  return (
    <Card title="Financial reports" sub="Exported to Excel with the Firm’s formats; each export is recorded in the audit log."
      actions={<select value={eng} onChange={(e) => setEng(e.target.value)} aria-label="Engagement" style={{ width: 'auto' }}><option value="">All engagements you can see</option>{(lookups?.engagements || []).map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>}>
      <ul className="list">
        {REPORTS.filter(([, , , costs]) => !costs || costsAnywhere).map(([k, label, desc]) => (
          <li key={k}>
            <Icon name="table" size={16} />
            <div className="grow"><div className="strong">{label}</div><div className="small muted">{desc}</div></div>
            <button className="btn btn-sm" onClick={() => download(`/api/finance/reports/${k}`, { engagement_id: eng || undefined, format: 'xlsx' })}><Icon name="download" /> Excel</button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

