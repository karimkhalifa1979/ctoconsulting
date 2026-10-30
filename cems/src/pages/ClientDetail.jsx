// Client view (CLI-006): engagements with their health, revenue, debtors, open high risks and
// issues, satisfaction, agreements and contacts.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { useLookups } from '../components/fields.jsx';
import { Register, RecordView, RecordDrawer } from '../components/Record.jsx';
import { PageHead, Async, Card, Tile, Table, Rag, Status, Level, D, Empty } from '../components/ui.jsx';
import { LineChart, SERIES } from '../components/charts.jsx';
import { fmtMoneyShort, fmtDate } from '../../shared/format.js';
import Icon from '../components/Icon.jsx';

export default function ClientDetail() {
  const { id } = useParams();
  const q = useApi(`/api/dash/client/${id}`);
  const lookups = useLookups({ clientId: id });
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const name = (uid) => lookups?.users?.find((u) => u.id === uid)?.label;
  return (
    <Async q={q}>{(d) => {
      const c = d.client;
      const overdue = Object.entries(d.debtorBuckets || {}).filter(([k]) => k !== 'current').reduce((a, [, v]) => a + v, 0);
      return (
        <>
          <PageHead title={c.trading_name || c.legal_name} crumbs={<><Link to="/clients">Clients</Link><span>›</span></>}
            sub={<>{c.legal_name}{c.abn ? ` · ABN ${c.abn}` : ''} · {c.sector || 'Sector not set'}{c.sector_type ? ` (${c.sector_type})` : ''}</>}
            actions={c._can?.update && <button className="btn btn-sm btn-navy" onClick={() => setEditing(true)}><Icon name="edit" /> Edit</button>} />
          <div className="subtabs">
            {[['overview', 'Overview'], ['contacts', 'Contacts'], ['agreements', 'Agreements and panels'], ['details', 'Details and obligations']].map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          {tab === 'overview' && (
            <div className="stack">
              <div className="grid g-4">
                <Tile label="Engagements" value={d.engagements.length} sub={`${d.engagements.filter((e) => e.status === 'Active').length} active`} />
                <Tile label="Fees earned to date" value={fmtMoneyShort(d.revenueToDate)} sub="Engagements you can see" />
                <Tile label="Receivables" value={fmtMoneyShort(d.debtors)} sub={overdue ? `${fmtMoneyShort(overdue)} overdue` : 'Nothing overdue'} tone={overdue ? 'warn' : ''} />
                {d.wip != null ? <Tile label="Unbilled WIP" value={fmtMoneyShort(d.wip)} /> : <Tile label="Satisfaction responses" value={d.satisfaction.length} />}
              </div>
              <Card title="Engagements" flush>
                <Table rows={d.engagements} columns={[
                  { key: 'health', label: 'Health', sort: (e) => e.health?.rag || 'z', render: (e) => <Rag v={e.health?.rag} sm /> },
                  { key: 'name', label: 'Engagement', render: (e) => <div><Link className="strong" to={`/engagements/${e.id}`}>{e.name}</Link><div className="tiny muted">{e.code}</div></div> },
                  { key: 'manager_id', label: 'Manager', render: (e) => name(e.manager_id) },
                  { key: 'status', label: 'Status', render: (e) => <Status v={e.status} /> },
                  { key: 'start_date', label: 'Start', render: (e) => <D v={e.start_date} /> },
                  { key: 'end_date', label: 'End', render: (e) => <D v={e.end_date} /> },
                ]} />
              </Card>
              <div className="grid g-2">
                <Card title="High and extreme risks">
                  {!d.risks.length ? <Empty icon="check">None open.</Empty> : <ul className="list">{d.risks.map((r) => <li key={r.id}><Level v={r.residual_level || r.inherent_level} /><span className="grow"><Link to={r.project_id ? `/projects/${r.project_id}/raid?open=${r.id}&entity=risk` : `/engagements/${r.engagement_id}/raid?open=${r.id}&entity=risk`}>{r.ref} {r.title}</Link></span></li>)}</ul>}
                </Card>
                <Card title="High and critical issues">
                  {!d.issues.length ? <Empty icon="check">None open.</Empty> : <ul className="list">{d.issues.map((i) => <li key={i.id}><Level v={i.severity} /><span className="grow"><Link to={i.project_id ? `/projects/${i.project_id}/raid?open=${i.id}&entity=issue` : `/engagements/${i.engagement_id}/raid?open=${i.id}&entity=issue`}>{i.ref} {i.title}</Link></span></li>)}</ul>}
                </Card>
              </div>
              <Card title="Client satisfaction (OBJ-7)" sub="Overall score and the reporting and governance score, out of 10.">
                {d.satisfaction.length < 2 ? (d.satisfaction.length ? <p className="small">One response: overall {d.satisfaction[0].score}/10 on {fmtDate(d.satisfaction[0].date)}.</p> : <Empty>No responses yet.</Empty>) : (
                  <LineChart height={200} format={(v) => v.toFixed(1)} categories={d.satisfaction.map((s) => s.date)} labelX={(x) => fmtDate(x).slice(3)} series={[
                    { name: 'Overall', color: SERIES[0], values: d.satisfaction.map((s) => Number(s.score) || null) },
                    { name: 'Reporting and governance', color: SERIES[1], values: d.satisfaction.map((s) => Number(s.reporting_score) || null) },
                  ]} />
                )}
              </Card>
              {d.children.length > 0 && <Card title="Related organisations (CLI-003)"><div className="chips">{d.children.map((x) => <Link key={x.id} className="chip" to={`/clients/${x.id}`}>{x.name}</Link>)}</div></Card>}
            </div>
          )}
          {tab === 'contacts' && <Register entity="contact" scope={{ client_id: id }} defaults={{ client_id: id }} sub="People at the client with their role, influence and preferred communication (CLI-002)." />}
          {tab === 'agreements' && <Register entity="agreement" scope={{ client_id: id }} defaults={{ client_id: id }} sub="Master agreements, panel arrangements and standing offers with their rate cards and key dates (CLI-004)." />}
          {tab === 'details' && <Card title="Client record"><RecordView entity="client" rec={c} lookups={lookups} /></Card>}
          {editing && <RecordDrawer entity="client" id={c.id} startEditing scope={{ client_id: c.id }} onClose={() => setEditing(false)} onSaved={q.reload} />}
        </>
      );
    }}</Async>
  );
}
