// PMO (DSH-004, DSH-007, DSH-008, DAT-009): exceptions across the portfolio, data quality,
// engagement trends and analytics datasets for external BI tools.
import { useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { offlineInfo } from '../lib/api.js';
import { useLookups } from '../components/fields.jsx';
import { PageHead, RouteTabs, Card, Async, Table, Empty, Tile, Rag, Badge } from '../components/ui.jsx';
import { LineChart, BarChart, SERIES, RagStrip, monthLabel } from '../components/charts.jsx';
import { Exceptions } from './Portfolio.jsx';
import { fmtDate } from '../../shared/format.js';
import Icon from '../components/Icon.jsx';

export default function Pmo() {
  return (
    <>
      <PageHead title="PMO" sub="Delivery standards and portfolio insight: exceptions, data quality and trends."
        actions={<><Link className="btn btn-sm" to="/reports/tracker"><Icon name="activity" /> Status tracker</Link><Link className="btn btn-sm" to="/reports/templates"><Icon name="file" /> Template library</Link></>} />
      <RouteTabs tabs={[
        { to: '/pmo', label: 'Exceptions', end: true },
        { to: '/pmo/quality', label: 'Data quality' },
        { to: '/pmo/trends', label: 'Trends' },
        { to: '/pmo/analytics', label: 'Analytics feeds' },
      ]} />
      <Routes>
        <Route index element={<ExceptionsTab />} />
        <Route path="quality" element={<Quality />} />
        <Route path="trends" element={<Trends />} />
        <Route path="analytics" element={<Analytics />} />
      </Routes>
    </>
  );
}

function ExceptionsTab() {
  const q = useApi('/api/dash/exceptions');
  return <Async q={q}>{(ex) => <Exceptions ex={ex} />}</Async>;
}

// DAT-009: records missing owners, overdue reviews, stale forecasts, projects without baselines or risks.
function Quality() {
  const q = useApi('/api/dash/data-quality');
  return (
    <Async q={q}>{(d) => {
      const blocks = [
        ['RAID items without an owner', d.missingOwners, [{ key: 'type', label: 'Register' }, { key: 'ref', label: 'ID' }, { key: 'title', label: 'Title', render: (x) => <Link to={x.project_id ? `/projects/${x.project_id}/raid` : `/engagements/${x.engagement_id}/raid`}>{x.title}</Link> }]],
        ['Reviews overdue', d.overdueReviews, [{ key: 'type', label: 'Register' }, { key: 'ref', label: 'ID' }, { key: 'title', label: 'Title' }, { key: 'next_review', label: 'Review due', render: (x) => fmtDate(x.next_review) }]],
        ['Forecasts not updated for five weeks', d.staleForecasts, [{ key: 'project', label: 'Project', render: (x) => <Link to={`/projects/${x.project_id}/financials?tab=forecast`}>{x.project}</Link> }]],
        ['In delivery without an approved baseline', d.noBaseline, [{ key: 'project', label: 'Project', render: (x) => <Link to={`/projects/${x.project_id}/governance`}>{x.project}</Link> }, { key: 'state', label: 'State' }]],
        ['In delivery with an empty risk register', d.noRaid, [{ key: 'project', label: 'Project', render: (x) => <Link to={`/projects/${x.project_id}/raid`}>{x.project}</Link> }]],
      ];
      return (
        <div className="stack">
          <div className="grid g-5">{blocks.map(([t, list]) => <Tile key={t} label={t} value={list.length} tone={list.length ? 'warn' : 'good'} />)}</div>
          {blocks.filter(([, list]) => list.length).map(([t, list, cols]) => (
            <Card key={t} title={t} flush><Table compact rows={list.map((x, i) => ({ ...x, id: i }))} columns={cols} /></Card>
          ))}
          {blocks.every(([, list]) => !list.length) && <Card><Empty icon="checkCircle">No data quality issues.</Empty></Card>}
        </div>
      );
    }}</Async>
  );
}

// DSH-007: RAG history, forecast movement and RAID ageing for an engagement.
function Trends() {
  const lookups = useLookups();
  const [eng, setEng] = useState('');
  const id = eng || lookups?.engagements?.[0]?.id;
  const q = useApi(id ? `/api/dash/trends/${id}` : null);
  return (
    <div className="stack">
      <div className="filters">
        <select value={id || ''} onChange={(e) => setEng(e.target.value)} aria-label="Engagement" style={{ width: 'auto' }}>
          {(lookups?.engagements || []).map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </div>
      {!id ? <Empty>No engagements.</Empty> : <Async q={q}>{(t) => (
        <>
          <Card title="Overall rating by period" sub="From submitted and approved status updates (STS-007).">
            {!t.rag.length ? <Empty>No projects.</Empty> : (
              <Table compact rows={t.rag.map((r, i) => ({ ...r, id: i }))} columns={[
                { key: 'project', label: 'Project' },
                { key: 'latest', label: 'Latest', sort: false, render: (r) => <Rag v={r.history.at(-1)?.overall} sm /> },
                { key: 'history', label: 'History (oldest to newest)', sort: false, render: (r) => (r.history.length ? <RagStrip items={r.history} /> : <span className="muted small">No updates</span>) },
              ]} />
            )}
          </Card>
          <div className="grid g-2">
            <Card title="Forecast fees at completion by cycle (FIN-023)">
              {(() => {
                const periods = [...new Set(t.forecast.flatMap((p) => p.cycles.map((c) => c.period)))].sort();
                const series = t.forecast.filter((p) => p.cycles.length).slice(0, 4).map((p, i) => ({ name: p.project, color: SERIES[i], values: periods.map((m) => p.cycles.find((c) => c.period === m)?.eacRevenue ?? null) }));
                return periods.length < 2 ? <Empty>The trend appears after two approved cycles.</Empty> : <LineChart categories={periods} labelX={monthLabel} series={series} height={220} />;
              })()}
            </Card>
            <Card title="Open RAID items by age">
              <BarChart height={220} format={(v) => String(Math.round(v))} categories={Object.keys(t.raidAgeing)} labelX={(k) => `${k} days`} series={[{ name: 'Open items', color: SERIES[0], values: Object.values(t.raidAgeing) }]} />
            </Card>
          </div>
        </>
      )}</Async>}
    </div>
  );
}

// DSH-008: read-only datasets for Power BI or other tools, filtered to what the caller may see.
function Analytics() {
  const sets = [
    ['engagements', 'Engagements', 'Code, client, status, type, practice, dates and health.'],
    ['projects', 'Projects', 'State, approach, dates and latest overall rating.'],
    ['financials', 'Financials by month', 'Budget, actual and forecast revenue (and cost where permitted) by project and month.'],
    ['raid', 'RAID', 'Every RAID item with rating, status and age.'],
    ['time', 'Approved time', 'Hours by person, project and date.'],
  ];
  return (
    <Card title="Analytics feeds" sub="JSON endpoints for Power BI and other tools; the same access rules apply as in the application, and cost fields appear only where you may see costs.">
      <ul className="list">
        {sets.map(([k, label, desc]) => (
          <li key={k}>
            <Icon name="link" size={16} />
            <div className="grow"><div className="strong">{label}</div><div className="small muted">{desc}</div>{!offlineInfo() && <div className="mono tiny">{`${window.location.origin}/api/analytics/${k}`}</div>}</div>
            <a className="btn btn-sm" href={`/api/analytics/${k}`} target="_blank" rel="noreferrer">Open</a>
          </li>
        ))}
      </ul>
      <p className="small muted mt-2">For scheduled refresh, use an API token issued by an administrator (Admin › Integrations). <Badge tone="grey">Read-only</Badge></p>
    </Card>
  );
}
