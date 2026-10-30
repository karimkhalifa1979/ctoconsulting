// DSH-001 portfolio dashboard with filters, exceptions (DSH-004) and utilisation by practice.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { useSession } from '../lib/session.jsx';
import { useLookups } from '../components/fields.jsx';
import { PageHead, Card, Tile, Async, Table, Rag, Money, Pct, Badge, Empty, Meter, Level } from '../components/ui.jsx';
import { fmtMoneyShort, fmtPct, fmtDate } from '../../shared/format.js';
import { LISTS } from '../../shared/defaults.js';

export default function Portfolio() {
  const { me } = useSession();
  const [f, setF] = useState({ status: '' });
  const q = useApi('/api/dash/portfolio', f);
  const lookups = useLookups();
  const userName = (id) => lookups?.users?.find((u) => u.id === id)?.label || '';
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <>
      <PageHead title="Portfolio" sub="Health, financial position and exceptions across the engagements you can see. Select an engagement to drill down." />
      <div className="filters">
        <select value={f.client || ''} onChange={(e) => set('client', e.target.value)} aria-label="Client"><option value="">All clients</option>{(lookups?.clients || []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
        <select value={f.manager || ''} onChange={(e) => set('manager', e.target.value)} aria-label="Engagement manager"><option value="">All engagement managers</option>{(lookups?.users || []).filter((u) => !u.external).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select>
        <select value={f.practice || ''} onChange={(e) => set('practice', e.target.value)} aria-label="Practice"><option value="">All practices</option>{LISTS.practices.map((p) => <option key={p}>{p}</option>)}</select>
        <select value={f.sector || ''} onChange={(e) => set('sector', e.target.value)} aria-label="Sector"><option value="">All sectors</option>{LISTS.sectors.map((p) => <option key={p}>{p}</option>)}</select>
        <select value={f.status || ''} onChange={(e) => set('status', e.target.value)} aria-label="Status"><option value="">Open engagements</option>{['Proposed', 'Active', 'On hold', 'Closing', 'Closed'].map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <Async q={q}>{(d) => (
        <div className="stack">
          <div className="grid g-6">
            <Tile label="Engagements" value={d.totals.engagements} sub={`${d.totals.projects} active projects`} />
            <Tile label="Contract value" value={fmtMoneyShort(d.totals.contractValue)} sub="Including approved variations" />
            <Tile label="Fees at completion" value={fmtMoneyShort(d.totals.fees)} sub="Forecast" />
            <Tile label="Invoiced to date" value={fmtMoneyShort(d.totals.invoiced)} />
            {d.totals.showCosts ? <Tile label="Unbilled WIP" value={fmtMoneyShort(d.totals.wip)} /> : <Tile label="Health" value={`${d.totals.health.Red} red`} sub={`${d.totals.health.Amber} amber · ${d.totals.health.Green} green`} />}
            {d.totals.showCosts ? <Tile label="Forecast margin" value={fmtPct(d.totals.margin, 1)} tone={d.totals.margin < 0.25 ? 'bad' : d.totals.margin < 0.4 ? 'warn' : 'good'} sub="Engagements where you see costs" /> : <Tile label="Red engagements" value={d.totals.health.Red} tone={d.totals.health.Red ? 'bad' : 'good'} />}
          </div>
          <Card title="Engagements" sub={`Health: ${d.totals.health.Green} green · ${d.totals.health.Amber} amber · ${d.totals.health.Red} red${d.totals.health.None ? ` · ${d.totals.health.None} not rated` : ''}`} flush>
            <Table rows={d.rows} initialSort={{ key: 'health', dir: -1 }} columns={[
              { key: 'health', label: 'Health', sort: (r) => ({ Red: 3, Amber: 2, Green: 1 }[r.health?.rag] || 0), render: (r) => <Rag v={r.health?.rag} title={r.health?.overridden ? `Overridden: ${r.health.justification}` : undefined} /> },
              { key: 'name', label: 'Engagement', render: (r) => <div><Link to={`/engagements/${r.id}`} className="strong">{r.name}</Link>{r.restricted && <Badge tone="red">Restricted</Badge>}<div className="small muted">{r.code} · {r.client}</div></div> },
              { key: 'manager_id', label: 'Manager', render: (r) => <span className="small">{userName(r.manager_id)}</span> },
              { key: 'status', label: 'Status', render: (r) => <span className="small">{r.status}<br /><span className="muted">{r.activeProjects}/{r.projects} projects</span></span> },
              { key: 'contract', label: 'Contract value', num: true, sort: (r) => r.fin?.contractValue || 0, render: (r) => <Money v={r.fin?.contractValue} /> },
              { key: 'fees', label: 'Fees at completion', num: true, sort: (r) => r.fin?.forecastFeesAtCompletion || 0, render: (r) => <Money v={r.fin?.forecastFeesAtCompletion} /> },
              { key: 'invoiced', label: 'Invoiced', num: true, sort: (r) => r.fin?.invoicedToDate || 0, render: (r) => <Money v={r.fin?.invoicedToDate} /> },
              { key: 'po', label: 'PO consumed', sort: (r) => r.fin?.poConsumedPct || 0, render: (r) => (r.fin?.poConsumedPct != null ? <div style={{ minWidth: 90 }}><Meter value={r.fin.poConsumedPct} /><div className="tiny muted">{fmtPct(r.fin.poConsumedPct)}{r.fin.poExhaustionBeforeEnd ? ' · runs out early' : ''}</div></div> : <span className="muted">—</span>) },
              me.can.finance || d.totals.showCosts ? { key: 'margin', label: 'Margin', num: true, sort: (r) => r.fin?.forecastMargin ?? -1, render: (r) => (r.costs ? <Pct v={r.fin?.forecastMargin} d={1} /> : <span className="muted" title="Cost data is restricted">—</span>) } : null,
              { key: 'risks', label: 'Risks', sort: (r) => r.risks.extreme * 10 + r.risks.high, render: (r) => <span className="flex">{r.risks.extreme > 0 && <Level v="Extreme" />}{r.risks.high > 0 && <span className="small">{r.risks.high} high</span>}{!r.risks.extreme && !r.risks.high && <span className="muted">—</span>}</span> },
              { key: 'next', label: 'Next milestone', sort: (r) => r.next_milestone?.date || 'z', render: (r) => (r.next_milestone ? <span className="small">{r.next_milestone.name}<br /><span className="muted">{fmtDate(r.next_milestone.date)}</span></span> : <span className="muted">—</span>) },
            ].filter(Boolean)} />
          </Card>
          <Exceptions ex={d.exceptions} />
          <Card title="Utilisation by practice" sub="Approved billable hours against available hours over the last 12 weeks (RES-006).">
            <Table compact rows={d.utilisation.map((u) => ({ ...u, id: u.name }))} columns={[
              { key: 'name', label: 'Practice' },
              { key: 'actual', label: 'Actual billable', sort: (r) => r.actualUtilisation, render: (r) => <div className="flex" style={{ minWidth: 200 }}><div className="flex-1"><Meter value={r.actualUtilisation || 0} mark={r.plannedUtilisation} tone={r.actualUtilisation < 0.6 ? 'warn' : ''} /></div><span className="small tabular">{fmtPct(r.actualUtilisation)}</span></div> },
              { key: 'planned', label: 'Planned', num: true, sort: (r) => r.plannedUtilisation, render: (r) => <Pct v={r.plannedUtilisation} /> },
              { key: 'billable', label: 'Billable hours', num: true, render: (r) => Math.round(r.billable).toLocaleString('en-AU') },
              { key: 'available', label: 'Available hours', num: true, render: (r) => Math.round(r.available).toLocaleString('en-AU') },
            ]} />
          </Card>
        </div>
      )}</Async>
    </>
  );
}

export function Exceptions({ ex }) {
  const blocks = [
    ['Projects at risk', ex.atRisk, (x) => <><Link to={`/projects/${x.project_id}`}>{x.project}</Link> <Rag v={x.rag} sm /><div className="small muted">{x.engagement}{x.reasons?.length ? ` · ${x.reasons.join('; ')}` : ''}</div></>],
    ['Late status updates', ex.lateStatus, (x) => <><Link to={`/projects/${x.project_id}/status`}>{x.project}</Link><div className="small muted">{x.engagement} · week ending {fmtDate(x.period_end)}</div></>],
    ['Purchase order alerts', ex.poAlerts, (x) => <><Link to={`/engagements/${x.engagement_id}/commercial`}>PO {x.po}</Link> · {fmtPct(x.consumedPct)} consumed<div className="small muted">{x.engagement}{x.beforeEnd ? ` · forecast to run out ${fmtDate(x.exhaustionDate)}, before the planned end` : ''}</div></>],
    ['Contract and agreement dates', ex.contractExpiries, (x) => <>{x.contract}: {x.label}<div className="small muted">{x.engagement || x.client} · {fmtDate(x.date)} (in {x.days} days)</div></>],
    ['Clearance and certification expiries', ex.clearanceExpiries, (x) => <><Link to={`/resources/people?open=${x.person_id}`}>{x.name}</Link>: {x.kind} {x.item}<div className="small muted">{x.expired ? 'Expired' : 'Expires'} {fmtDate(x.expiry)}</div></>],
    ['RAID reviews overdue', ex.overdueReviews, (x) => <>{x.ref} {x.title}<div className="small muted">{x.type} · review due {fmtDate(x.next_review)}</div></>],
    ['Aged unbilled WIP', ex.agedWip, (x) => <><Link to={`/engagements/${x.engagement_id}/financials`}>{x.engagement}</Link> · <Money v={x.amount} /> over 60 days</>],
  ].filter(([, list]) => list?.length);
  return (
    <Card title="Exceptions" sub="Items that need attention across your portfolio (DSH-004).">
      {!blocks.length ? <Empty icon="checkCircle">No exceptions.</Empty> : (
        <div className="grid g-3">
          {blocks.map(([title, list, render]) => (
            <div key={title}>
              <h4 className="mb-1">{title} <span className="badge">{list.length}</span></h4>
              <ul className="list">{list.slice(0, 8).map((x, i) => <li key={i}><div className="grow">{render(x)}</div></li>)}</ul>
              {list.length > 8 && <div className="small muted">and {list.length - 8} more</div>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

