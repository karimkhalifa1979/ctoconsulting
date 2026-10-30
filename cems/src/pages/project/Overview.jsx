// Project dashboard (DSH-002): ratings and trend, tolerance exceptions, schedule flags, the
// four-week look-ahead, milestones, financial position, earned value and risk exposure.
import { Link } from 'react-router-dom';
import { useProject } from './Project.jsx';
import { Card, Tile, Rag, Status, Empty, Alert, Table, D, Badge } from '../../components/ui.jsx';
import { LineChart, RagStrip, RiskHeat, BarChart, useFinSeries, monthLabel } from '../../components/charts.jsx';
import { DIMENSIONS } from '../../../shared/rag.js';
import { fmtMoneyShort, fmtPct, fmtDate } from '../../../shared/format.js';
import { todayIn, monthOf } from '../../../shared/dates.js';
import { useSession } from '../../lib/session.jsx';

const ratio = (v) => (v == null ? '—' : v.toFixed(2));

export default function Overview() {
  const { d, p, costs } = useProject();
  const { me } = useSession();
  const fin = d.fin;
  const next = d.next_milestone;
  const openRisks = d.heatmap.residual.flat().reduce((a, b) => a + b, 0);
  return (
    <div className="stack">
      {d.exceptions?.length > 0 && (
        <Alert tone="error">
          <b>Tolerance exceptions (BR-04).</b> The project manager raises an exception report to the engagement manager when a tolerance is forecast to be exceeded.
          <ul>{d.exceptions.map((x, i) => <li key={i}><b>{x.dimension}</b>: {x.text}</li>)}</ul>
        </Alert>
      )}
      <div className="grid g-6">
        <Tile label="Complete" value={fmtPct(d.percent)} sub={d.stage ? `Stage: ${d.stage}` : 'Effort-weighted'} />
        <Tile label="Next milestone" value={next ? fmtDate(next.date) : '—'} sub={next?.name} tone={next && ['Forecast late', 'Missed'].includes(next.status) ? 'bad' : next?.status === 'At risk' ? 'warn' : ''} title={next?.status} />
        <Tile label="SPI / CPI" value={`${ratio(d.evm?.spi)} / ${ratio(d.evm?.cpi)}`} sub="Earned value indices" tone={d.evm?.spi < 0.9 || d.evm?.cpi < 0.9 ? 'bad' : d.evm?.spi < 0.95 || d.evm?.cpi < 0.95 ? 'warn' : ''} />
        {fin && <Tile label="Fees at completion" value={fmtMoneyShort(fin.forecastFeesAtCompletion)} sub={`Invoiced ${fmtMoneyShort(fin.invoicedToDate)}`} />}
        {fin && costs && <Tile label="EAC vs BAC" value={fmtMoneyShort(fin.eac)} sub={`BAC ${fmtMoneyShort(fin.bac)}${fin.vac < 0 ? ` · ${fmtMoneyShort(-fin.vac)} over` : ''}`} tone={fin.vac < 0 ? (fin.vac / fin.bac < -0.05 ? 'bad' : 'warn') : ''} />}
        <Tile label="Open risks" value={openRisks} sub="Threats with a residual rating" />
      </div>
      <div className="grid g-2">
        <Card title="Ratings" sub={d.rag_period ? `From the update for the week ending ${fmtDate(d.rag_period)}. Suggested ratings are calculated from the data (BR-03).` : 'No status update submitted yet.'}
          actions={<Link className="btn btn-sm" to="status">Status updates</Link>}>
          <Table compact rows={[...DIMENSIONS, { key: 'overall', label: 'Overall' }].map((x) => ({ ...x, id: x.key }))} columns={[
            { key: 'label', label: 'Dimension', sort: false },
            { key: 'rag', label: 'Reported', sort: false, render: (x) => <Rag v={d.ratings?.[x.key]} sm /> },
            { key: 'suggested', label: 'Calculated now', sort: false, render: (x) => (d.suggested ? <Rag v={d.suggested[x.key]} sm /> : <span className="muted small">—</span>) },
            { key: 'trend', label: 'Last 12 periods', sort: false, render: (x) => <RagStrip items={d.history} dimension={x.key} /> },
          ]} />
        </Card>
        <Card title="Schedule flags" sub="Late or at-risk milestones and overdue tasks from the plan (PLN-014)." actions={<Link className="btn btn-sm" to="plan">Plan</Link>}>
          {!d.flags.length ? <Empty icon="check">No schedule flags.</Empty> : (
            <ul className="list">{d.flags.map((f, i) => <li key={i}><span className={`badge ${f.kind.includes('missed') || f.kind.includes('late') ? 'red' : 'amber'}`}>{f.kind.replace('-', ' ')}</span><span className="grow small">{f.text}</span></li>)}</ul>
          )}
        </Card>
      </div>
      <div className="grid g-2">
        <Card title="Four-week look-ahead (PLN-016)" sub={`${fmtDate(d.lookahead.from)} to ${fmtDate(d.lookahead.to)}`}>
          {!d.lookahead.tasks.length && !d.lookahead.milestones.length && !d.lookahead.deliverables.length ? <Empty>Nothing planned.</Empty> : (
            <ul className="list">
              {d.lookahead.milestones.map((m) => <li key={m.id}><span className="badge navy">Milestone</span><span className="grow">{m.name}</span><span className="small nowrap">{fmtDate(m.forecast_date || m.planned_date)}</span><Status v={m.status} /></li>)}
              {d.lookahead.deliverables.map((x) => <li key={x.id}><span className="badge teal">Deliverable</span><span className="grow">{x.ref} {x.title}</span><span className="small nowrap">{fmtDate(x.forecast_date || x.planned_date)}</span><Status v={x.status} /></li>)}
              {d.lookahead.tasks.slice(0, 12).map((t) => <li key={t.id}><span className="badge grey">{t.wbs}</span><span className="grow">{t.name}{t.critical && <Badge tone="red">Critical</Badge>}</span><span className="small nowrap">{fmtDate(t.finish_date)}</span><span className="small">{Math.round((t.percent_complete || 0) * 100)}%</span></li>)}
            </ul>
          )}
        </Card>
        <Card title="Milestones">
          {!d.plan.milestones.length ? <Empty>No milestones.</Empty> : (
            <Table compact rows={d.plan.milestones} columns={[
              { key: 'name', label: 'Milestone', render: (m) => <span>{m.key && <span title="Key milestone">★ </span>}{m.name}</span> },
              { key: 'baseline_date', label: 'Baseline', render: (m) => <D v={m.baseline_date} /> },
              { key: 'forecast_date', label: 'Forecast / actual', render: (m) => <D v={m.actual_date || m.forecast_date || m.planned_date} /> },
              { key: 'variance_days', label: 'Var. (BD)', num: true, render: (m) => (m.variance_days ? <span className={m.variance_days > 0 ? 'neg' : 'pos'}>{m.variance_days > 0 ? '+' : ''}{m.variance_days}</span> : '0') },
              { key: 'status', label: 'Status', render: (m) => <Status v={m.status} /> },
            ]} />
          )}
        </Card>
      </div>
      <div className="grid g-2">
        {fin && <FinChart fin={fin} costs={costs} />}
        <Card title="Risk exposure" sub="Open threats by residual likelihood and consequence (RSK-008)." actions={<Link className="btn btn-sm" to="raid">RAID</Link>}>
          <RiskHeat grid={d.heatmap.residual} matrix={me.settings.riskMatrix} />
          <RiskTrend rows={d.riskTrend} />
        </Card>
      </div>
      {p.description && <Card title="About this project"><p className="pre">{p.description}</p></Card>}
    </div>
  );
}

function FinChart({ fin, costs }) {
  const s = useFinSeries(fin.months, { cumulative: true, costs, revenue: !costs });
  const thisMonth = monthOf(todayIn('Australia/Sydney'));
  return (
    <Card title={costs ? 'Cost: budget, actual and forecast' : 'Fees: budget, earned and forecast'} sub={`Cumulative, as at ${fmtDate(fin.asAt)}. Dashed lines are forecast.`} actions={<Link className="btn btn-sm" to="financials">Financials</Link>}>
      {s.categories.length < 2 ? <Empty>No financial months yet.</Empty> : <LineChart categories={s.categories} series={s.series} labelX={monthLabel} markX={thisMonth} height={220} />}
    </Card>
  );
}

function RiskTrend({ rows = [] }) {
  if (!rows.some((r) => r.Low || r.Medium || r.High || r.Extreme)) return null;
  return (
    <div className="mt-3">
      <h4 className="mb-1">Open risks by level, last 12 weeks</h4>
      <BarChart stacked height={150} format={(v) => String(Math.round(v))} categories={rows.map((r) => r.week)} labelX={(w) => fmtDate(w).slice(0, 6)} series={[
        // Ordinal levels: one hue, light to dark.
        { name: 'Low', color: '#c6dbf3', values: rows.map((r) => r.Low) },
        { name: 'Medium', color: '#7fb0e8', values: rows.map((r) => r.Medium) },
        { name: 'High', color: '#2a78d6', values: rows.map((r) => r.High) },
        { name: 'Extreme', color: '#12407a', values: rows.map((r) => r.Extreme) },
      ]} />
    </div>
  );
}
