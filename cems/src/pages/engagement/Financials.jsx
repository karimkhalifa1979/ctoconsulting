// Engagement financials (FIN-012..050): contract and billing position, budget against actual and
// forecast by month, project positions, PO burn, invoices, WIP, cash flow and debtors.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEngagement } from './Engagement.jsx';
import { useApi } from '../../lib/hooks.js';
import { download } from '../../lib/api.js';
import Invoices from '../../components/Invoices.jsx';
import { Async, Card, Tile, Table, Money, Pct, Alert, Seg, Meter, Field } from '../../components/ui.jsx';
import { LineChart, BarChart, SERIES, monthLabel, useFinSeries } from '../../components/charts.jsx';
import { fmtMoneyShort, fmtPct, fmtDate, fmtNum } from '../../../shared/format.js';
import { todayIn, addDays, monthOf } from '../../../shared/dates.js';
import Icon from '../../components/Icon.jsx';

const ratio = (v) => (v == null ? '—' : v.toFixed(2));

export default function Financials() {
  const { id, d, costs, can } = useEngagement();
  const q = useApi(`/api/finance/engagement/${id}`);
  return (
    <Async q={q}>{(f) => (
      <div className="stack">
        <PositionTiles f={f} costs={costs} />
        {f.poExhaustionBeforeEnd && <Alert tone="warn">A purchase order is forecast to run out on {fmtDate(f.poExhaustionDate)}, before the planned end of the work it funds. Raise a PO extension with the client (FIN-027).</Alert>}
        {f.pendingChanges?.count > 0 && <Alert tone="info">{f.pendingChanges.count} change request{f.pendingChanges.count > 1 ? 's are' : ' is'} pending approval with a price impact of {fmtMoneyShort(f.pendingChanges.price)}; pending changes are not in the figures until approved (CHG-006).</Alert>}
        <MonthlyChart f={f} costs={costs} />
        <ProjectPositions f={f} costs={costs} />
        <div className="grid g-2">
          <PoBurn f={f} />
          {costs ? <Wip f={f} /> : <Debtors f={f} />}
        </div>
        {can('billing') && <Invoices engagementId={id} projects={d.projects} />}
        <div className="grid g-2">
          <CashFlow rows={f.cashFlow} />
          {costs && <Debtors f={f} />}
        </div>
        <Extracts id={id} costs={costs} />
      </div>
    )}</Async>
  );
}

function PositionTiles({ f, costs }) {
  return (
    <>
      <div className="grid g-4">
        <Tile label="Contract value" value={fmtMoneyShort(f.contractValue)} sub={f.variations ? `${fmtMoneyShort(f.originalContractValue)} original + ${fmtMoneyShort(f.variations)} variations` : 'Original contract, no signed variations'} />
        <Tile label="Invoiced to date" value={fmtMoneyShort(f.invoicedToDate)} sub={`${fmtMoneyShort(f.remainingValue)} remaining to invoice`} />
        <Tile label="Fees earned to date" value={fmtMoneyShort(f.recognised)} sub={`Fees at completion ${fmtMoneyShort(f.eacRevenue)}`} />
        <Tile label="Purchase orders" value={f.poConsumedPct == null ? '—' : fmtPct(f.poConsumedPct)} sub={`${fmtMoneyShort(f.poConsumed)} of ${fmtMoneyShort(f.poValue)} consumed`} tone={f.poExhaustionBeforeEnd ? 'bad' : f.poConsumedPct > 0.8 ? 'warn' : ''} />
      </div>
      {costs && (
        <div className="grid g-4">
          <Tile label="Budget at completion (BAC)" value={fmtMoneyShort(f.bac)} sub={`Actual cost ${fmtMoneyShort(f.ac)} (${fmtPct(f.budgetConsumedPct)} of budget)`} />
          <Tile label="Estimate at completion (EAC)" value={fmtMoneyShort(f.eac)} sub={f.vac == null ? '' : f.vac < 0 ? `${fmtMoneyShort(-f.vac)} over budget` : `${fmtMoneyShort(f.vac)} under budget`} tone={f.vac < 0 ? (f.vac / f.bac < -0.05 ? 'bad' : 'warn') : ''} />
          <Tile label="Forecast margin" value={fmtPct(f.forecastMargin, 1)} sub={f.baselineMargin != null ? `Baseline ${fmtPct(f.baselineMargin, 1)} · erosion ${fmtPct(f.marginErosion, 1)}` : ''} tone={f.marginErosion > 0.05 ? 'bad' : f.marginErosion > 0.02 ? 'warn' : ''} />
          <Tile label="Work in progress" value={fmtMoneyShort(f.wip)} sub={f.billedInAdvance ? `${fmtMoneyShort(f.billedInAdvance)} billed in advance` : 'Earned but not yet invoiced'} />
        </div>
      )}
    </>
  );
}

function MonthlyChart({ f, costs }) {
  const [mode, setMode] = useState('cumulative');
  const [what, setWhat] = useState('fees');
  const base = useFinSeries(f.months, { cumulative: mode === 'cumulative', costs: costs && what === 'cost', revenue: !costs || what === 'fees' });
  // FIN-048: cumulative fees burn up against the contract value.
  const s = mode === 'cumulative' && (what === 'fees' || !costs) && f.contractValue
    ? { ...base, series: [...base.series, { name: 'Contract value', color: SERIES[4], dashed: true, values: base.categories.map(() => f.contractValue) }] }
    : base;
  const thisMonth = monthOf(todayIn('Australia/Sydney'));
  return (
    <Card title={what === 'fees' ? 'Fees: budget, earned and forecast' : 'Cost: budget, actual and forecast'} sub="Solid lines are budget and actuals; dashed lines are the current forecast. The teal line marks this month."
      actions={<>
        {costs && <Seg value={what} onChange={setWhat} options={[{ value: 'fees', label: 'Fees' }, { value: 'cost', label: 'Cost' }]} />}
        <Seg value={mode} onChange={setMode} options={[{ value: 'cumulative', label: 'Cumulative' }, { value: 'monthly', label: 'By month' }]} />
      </>}>
      {s.categories.length < 2 ? <p className="muted">Not enough months yet.</p> : <LineChart categories={s.categories} series={s.series} labelX={monthLabel} markX={thisMonth} height={240} />}
    </Card>
  );
}

function ProjectPositions({ f, costs }) {
  const { d } = useEngagement();
  const rows = f.projects.map((p) => ({ ...p, id: p.projectId, project: d.projects.find((x) => x.id === p.projectId) }));
  return (
    <Card title="Project positions" sub={`As at ${fmtDate(f.asAt)} — the last day of the most recent approved timesheet week (BR-02).`} flush>
      <Table rows={rows} columns={[
        { key: 'name', label: 'Project', sort: (r) => r.project?.name, render: (r) => <Link to={`/projects/${r.projectId}/financials`}>{r.project?.name || 'Project'}</Link> },
        { key: 'model', label: 'Model' },
        { key: 'contractValue', label: 'Contract', num: true, render: (r) => <Money v={r.contractValue} /> },
        { key: 'invoicedToDate', label: 'Invoiced', num: true, render: (r) => <Money v={r.invoicedToDate} /> },
        { key: 'eacRevenue', label: 'Fees at completion', num: true, render: (r) => <Money v={r.eacRevenue} /> },
        costs && { key: 'bac', label: 'BAC', num: true, render: (r) => <Money v={r.bac} /> },
        costs && { key: 'ac', label: 'Actual cost', num: true, render: (r) => <Money v={r.ac} /> },
        costs && { key: 'eac', label: 'EAC', num: true, render: (r) => <Money v={r.eac} /> },
        costs && { key: 'vac', label: 'VAC', num: true, render: (r) => <span className={r.vac < 0 ? 'neg' : ''}><Money v={r.vac} /></span> },
        costs && { key: 'forecastMargin', label: 'Margin', num: true, render: (r) => <Pct v={r.forecastMargin} d={1} /> },
        costs && { key: 'cpi', label: 'CPI', num: true, sort: (r) => r.evm?.cpi, render: (r) => ratio(r.evm?.cpi) },
        costs && { key: 'spi', label: 'SPI', num: true, sort: (r) => r.evm?.spi, render: (r) => ratio(r.evm?.spi) },
        { key: 'hours', label: 'Hours', num: true, render: (r) => fmtNum(r.hours) },
      ].filter(Boolean)} />
    </Card>
  );
}

function PoBurn({ f }) {
  return (
    <Card title="Purchase order burn" sub="Invoiced plus approved unbilled value on each PO’s own GST basis (BR-05, BR-13).">
      {!f.po.length ? <p className="muted">No purchase orders.</p> : (
        <div className="stack-sm">
          {f.po.map((p) => (
            <div key={p.id}>
              <div className="row-between small"><b>PO {p.number}</b><span>{fmtMoneyShort(p.consumed)} of {fmtMoneyShort(p.value)} {p.gst_basis === 'inclusive' ? 'inc GST' : 'ex GST'}</span></div>
              <Meter value={p.consumedPct || 0} tone={p.exhaustsBeforeEnd ? 'bad' : p.consumedPct > 0.8 ? 'warn' : ''} />
              <div className="tiny muted mt-1">
                {fmtPct(p.consumedPct, 1)} consumed · {fmtMoneyShort(p.remaining)} remaining
                {p.exhaustionDate ? <> · forecast to run out <b className={p.exhaustsBeforeEnd ? 'neg' : ''}>{fmtDate(p.exhaustionDate)}</b></> : ' · sufficient to the planned end'}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Wip({ f }) {
  const a = f.wipAgeing || {};
  const buckets = [['0-30', '0–30 days'], ['31-60', '31–60 days'], ['61-90', '61–90 days'], ['90+', 'Over 90 days']];
  return (
    <Card title="WIP ageing" sub="Earned but uninvoiced value by age; internal only (FIN-033, ACC-003).">
      <Table compact rows={buckets.map(([k, label]) => ({ id: k, label, v: a[k] || 0 }))} columns={[
        { key: 'label', label: 'Age' },
        { key: 'v', label: 'WIP', num: true, render: (r) => <Money v={r.v} /> },
        { key: 'share', label: 'Share', num: true, sort: (r) => r.v, render: (r) => (f.wip ? fmtPct(r.v / f.wip) : '—') },
      ]} foot={<><td><b>Total</b></td><td className="num"><b><Money v={f.wip} /></b></td><td /></>} />
      {f.writeDowns > 0 && <p className="small mt-2">Write-downs to date <Money v={f.writeDowns} />{f.writeUps > 0 && <>; write-ups <Money v={f.writeUps} /></>}.</p>}
    </Card>
  );
}

function Debtors({ f }) {
  const b = f.debtors?.buckets || {};
  const keys = [['current', 'Not yet due'], ['1-30', '1–30 days overdue'], ['31-60', '31–60 days'], ['61-90', '61–90 days'], ['90+', 'Over 90 days']];
  return (
    <Card title="Debtors" sub={`Receivables ${fmtMoneyShort(f.debtors?.receivables)} inc GST${f.debtors?.debtorDays != null ? ` · ${Math.round(f.debtors.debtorDays)} debtor days` : ''} (FIN-036).`}>
      <Table compact rows={keys.map(([k, label]) => ({ id: k, label, v: b[k] || 0 }))} columns={[
        { key: 'label', label: 'Age' },
        { key: 'v', label: 'Amount inc GST', num: true, render: (r) => <span className={r.id !== 'current' && r.v > 0 ? 'neg' : ''}><Money v={r.v} /></span> },
      ]} />
    </Card>
  );
}

function CashFlow({ rows = [] }) {
  return (
    <Card title="Cash flow forecast" sub="Receipts from issued and forecast invoices on the client’s payment terms; payments for third-party costs (FIN-040).">
      {!rows.length ? <p className="muted">No forecast receipts or payments.</p> : (
        <>
          <BarChart categories={rows.map((r) => r.month)} labelX={monthLabel} height={200} series={[
            { name: 'Receipts', color: SERIES[0], values: rows.map((r) => r.receipts) },
            { name: 'Payments', color: SERIES[1], values: rows.map((r) => r.payments) },
          ]} />
          <Table compact rows={rows.map((r) => ({ ...r, id: r.month }))} columns={[
            { key: 'month', label: 'Month', render: (r) => monthLabel(r.month) },
            { key: 'receipts', label: 'Receipts', num: true, render: (r) => <Money v={r.receipts} /> },
            { key: 'payments', label: 'Payments', num: true, render: (r) => <Money v={r.payments} /> },
            { key: 'net', label: 'Net', num: true, render: (r) => <span className={r.net < 0 ? 'neg' : ''}><Money v={r.net} /></span> },
            { key: 'cumulative', label: 'Cumulative', num: true, render: (r) => <Money v={r.cumulative} /> },
          ]} />
        </>
      )}
    </Card>
  );
}

function Extracts({ id, costs }) {
  const today = todayIn('Australia/Sydney');
  const [range, setRange] = useState({ from: addDays(today, -35), to: today });
  const reports = [
    ['project-summary', 'Project financial summary'], ['monthly', 'Budget, actual and forecast by month'], ['po-burn', 'PO and contract burn'],
    ['debtors', 'Debtor ageing'], ['change-impact', 'Change impact'], ['forecast-movements', 'Forecast movements'],
    ...(costs ? [['engagement-pl', 'Engagement profit and loss'], ['wip-ageing', 'WIP ageing'], ['margin', 'Margin analysis']] : []),
  ];
  return (
    <div className="grid g-2">
      <Card title="Financial reports" sub="Standard reports for this engagement, exported to Excel (FIN-047, FIN-050).">
        <ul className="list">
          {reports.map(([k, label]) => (
            <li key={k}><Icon name="table" size={15} /><span className="grow">{label}</span>
              <button className="btn btn-sm" onClick={() => download(`/api/finance/reports/${k}`, { engagement_id: id, format: 'xlsx' })}><Icon name="download" /> Excel</button></li>
          ))}
        </ul>
      </Card>
      <Card title="Client timesheet extract" sub="Approved time for the client in their agreed layout, with day rounding applied (TEX-001..006).">
        <div className="form-grid">
          <Field label="From"><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="To"><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        </div>
        <div className="btn-row mt-2">
          <button className="btn btn-sm btn-primary" onClick={() => download('/api/time/extract', { engagement_id: id, ...range, format: 'xlsx' })}><Icon name="download" /> Excel</button>
          <button className="btn btn-sm" onClick={() => download('/api/time/extract', { engagement_id: id, ...range, format: 'csv' })}><Icon name="download" /> CSV</button>
        </div>
        <p className="tiny muted mt-2">Exports are recorded in the audit log.</p>
      </Card>
    </div>
  );
}
