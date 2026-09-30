import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useP } from '../lib/store.jsx';
import { pipeline, riskFlags, bidHealth } from '../core/analytics.js';
import { STAGES } from '../core/constants.js';
import { Card, PageHead, BarList } from '../../components/ui.jsx';
import { Closing, Person, StagePill, download, MIME, Tabs } from '../components/common.jsx';
import { audShort, aud } from '../core/util.js';
import { tableWorkbook } from '../gen/xlsx.js';

export default function Pipeline() {
  const { view, userName } = useP();
  const [tab, setTab] = useState('board');
  const [owner, setOwner] = useState('');
  const p = useMemo(() => pipeline(view.bids), [view.bids]);
  const client = (id) => view.clients.find((c) => c.id === id)?.name || '';
  const active = p.active.filter((b) => !owner || b.partnerId === owner || b.bidManagerId === owner);
  const due7 = active.filter((b) => b.closing?.date && b.closing.date <= new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)).length;
  const owners = [...new Set(p.active.flatMap((b) => [b.partnerId, b.bidManagerId]))];
  const exportXlsx = async () => {
    const bytes = await tableWorkbook([{ name: 'Pipeline', rows: active, columns: [
      { key: 'ref', label: 'Reference' }, { key: 'title', label: 'Opportunity', width: 44 }, { key: 'client', label: 'Client', width: 30, get: (b) => client(b.clientId) }, { key: 'stage', label: 'Stage', get: (b) => STAGES.find((s) => s.id === b.stage)?.label || b.stage },
      { key: 'value', label: 'Estimated value', get: (b) => b.value }, { key: 'closing', label: 'Closing', get: (b) => `${b.closing?.date || ''} ${b.closing?.time || ''} ${b.closing?.tz || ''}` },
      { key: 'partner', label: 'Partner', get: (b) => userName(b.partnerId) }, { key: 'bm', label: 'Bid manager', get: (b) => userName(b.bidManagerId) }, { key: 'risk', label: 'At risk', width: 40, get: (b) => riskFlags(b).join('; ') },
    ] }]);
    download(bytes, 'CTO_Consulting_Pipeline.xlsx', MIME.xlsx);
  };
  return (
    <div className="stack">
      <PageHead eyebrow="Pipeline" title="Bids in flight" actions={<><select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Filter by owner"><option value="">All partners and bid managers</option>{owners.map((id) => <option key={id} value={id}>{userName(id)}</option>)}</select><button className="btn dl" onClick={exportXlsx}>Export to Excel</button><button className="btn dl" onClick={() => window.print()}>Print or PDF</button></>}>
        Every active bid by stage, value, closing date and owner. At-risk bids have overdue sections, or approvals still pending within 48 hours of the deadline.
      </PageHead>
      <div className="stat-row">
        <div className="card stat accent"><div className="label">Active bids</div><div className="value tabular">{active.length}</div></div>
        <div className="card stat"><div className="label">Pipeline value</div><div className="value tabular">{audShort(active.reduce((a, b) => a + (b.value || 0), 0))}</div><div className="sub">Estimated contract value</div></div>
        <div className="card stat"><div className="label">Closing in 7 days</div><div className="value tabular">{due7}</div></div>
        <div className="card stat"><div className="label">At risk</div><div className="value tabular" style={{ color: p.atRisk.length ? 'var(--st-critical)' : undefined }}>{active.filter((b) => riskFlags(b).length).length}</div></div>
      </div>
      <Tabs tabs={[['board', 'Board'], ['table', 'Table'], ['value', 'Value by stage']]} value={tab} onChange={setTab} />
      {tab === 'board' && (
        <div className="kanban" role="list">
          {STAGES.map((s) => {
            const list = active.filter((b) => b.stage === s.id);
            return (
              <div key={s.id} className="kan-col" role="listitem" aria-label={`${s.label}: ${list.length} bids`}>
                <h4><span>{s.n}. {s.label}</span><span>{list.length}</span></h4>
                {list.map((b) => {
                  const flags = riskFlags(b);
                  const h = bidHealth(b);
                  return (
                    <Link key={b.id} to={`/bids/${b.id}`} className={`kan-card ${flags.length ? 'risk' : ''}`}>
                      <div className="ref">{b.ref}{b.confidential ? ' · Confidential' : ''}</div>
                      <div className="t">{b.title}</div>
                      <div className="c">{client(b.clientId)}</div>
                      {h.total > 0 && <div className="hbar" style={{ marginTop: 6 }} title={`${h.counts.approved + h.counts.locked} of ${h.total} sections approved`}><span style={{ width: `${((h.counts.approved + h.counts.locked + h.counts.in_review * 0.5) / h.total) * 100}%` }} /></div>}
                      <div className="f"><span>{audShort(b.value)}</span><Closing closing={b.closing} short /></div>
                      {flags.length > 0 && <div className="mini" style={{ color: 'var(--st-critical)', marginTop: 4 }}>{flags.join(' · ')}</div>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {tab === 'table' && (
        <Card pad={false}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Bid</th><th>Client</th><th>Stage</th><th className="right">Value</th><th>Closing</th><th>Partner</th><th>Bid manager</th><th>Health</th></tr></thead>
              <tbody>
                {active.map((b) => {
                  const h = bidHealth(b);
                  const flags = riskFlags(b);
                  return (
                    <tr key={b.id}>
                      <td><Link to={`/bids/${b.id}`}><strong>{b.title}</strong></Link><div className="mini">{b.ref}</div></td>
                      <td>{client(b.clientId)}</td>
                      <td><StagePill stage={b.stage} /></td>
                      <td className="right tabular">{aud(b.value)}</td>
                      <td><Closing closing={b.closing} short /></td>
                      <td><Person id={b.partnerId} /></td>
                      <td><Person id={b.bidManagerId} /></td>
                      <td className="small">{h.total ? `${h.counts.approved + h.counts.locked}/${h.total} approved` : 'No sections'}{h.coverage !== null ? ` · ${Math.round(h.coverage * 100)}% mapped` : ''}{flags.length > 0 && <div style={{ color: 'var(--st-critical)' }}>{flags.join(' · ')}</div>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {tab === 'value' && (
        <Card title="Pipeline value by stage" subtitle="Estimated contract value of active bids">
          <BarList items={STAGES.map((s) => ({ label: s.label, value: active.filter((b) => b.stage === s.id).reduce((a, b) => a + (b.value || 0), 0) })).filter((x) => x.value)} format={audShort} />
        </Card>
      )}
    </div>
  );
}
