import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useP } from '../lib/store.jsx';
import { Card, PageHead, usePaged, includesAll } from '../../components/ui.jsx';
import { StagePill, OutcomePill, Person, Closing, download, MIME } from '../components/common.jsx';
import { STAGES } from '../core/constants.js';
import { aud } from '../core/util.js';
import { tableWorkbook } from '../gen/xlsx.js';

export default function Bids() {
  const { view, userName } = useP();
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('active');
  const [offering, setOffering] = useState('');
  const client = (id) => view.clients.find((c) => c.id === id)?.name || '';
  const rows = useMemo(() => view.bids.filter((b) => {
    if (stage === 'active' && (['closed', 'archived'].includes(b.stage))) return false;
    if (stage === 'closed' && b.stage !== 'closed') return false;
    if (stage === 'archived' && b.stage !== 'archived') return false;
    if (!['active', 'closed', 'archived', ''].includes(stage) && b.stage !== stage) return false;
    if (offering && b.offering !== offering) return false;
    return includesAll(`${b.ref} ${b.title} ${client(b.clientId)} ${b.clientRef} ${b.sector} ${b.offering}`, q);
  }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')), [view.bids, q, stage, offering]); // eslint-disable-line react-hooks/exhaustive-deps
  const [page, pager] = usePaged(rows, 25, [q, stage, offering]);
  const exportXlsx = async () => download(await tableWorkbook([{ name: 'Bids', rows, columns: [
    { key: 'ref', label: 'Reference' }, { key: 'title', label: 'Opportunity', width: 44 }, { key: 'client', label: 'Client', width: 32, get: (b) => client(b.clientId) }, { key: 'stage', label: 'Stage' },
    { key: 'value', label: 'Value' }, { key: 'offering', label: 'Offering' }, { key: 'sector', label: 'Sector' }, { key: 'partner', label: 'Partner', get: (b) => userName(b.partnerId) },
    { key: 'outcome', label: 'Outcome', get: (b) => b.outcome?.result || (b.archived ? 'no-bid' : '') }, { key: 'reasons', label: 'Loss reasons', get: (b) => (b.outcome?.reasons || []).join('; ') },
  ] }]), 'CTO_Consulting_Bids.xlsx', MIME.xlsx);
  return (
    <div className="stack">
      <PageHead eyebrow="Bids" title="All bids" actions={<><button className="btn dl" onClick={exportXlsx}>Export to Excel</button><Link className="btn btn-primary" to="/bids/new">New bid</Link></>}>
        Every bid you can see. Bid-level permissions and ethical walls apply to this list, to search and to every export.
      </PageHead>
      <div className="filters">
        <input type="search" placeholder="Search by title, client or reference" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search bids" />
        <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Stage">
          <option value="active">Active</option><option value="">All</option>
          {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          <option value="closed">Closed (outcome recorded)</option><option value="archived">Archived (no-bid)</option>
        </select>
        <select value={offering} onChange={(e) => setOffering(e.target.value)} aria-label="Offering"><option value="">All offerings</option>{view.taxonomy.offerings.map((o) => <option key={o}>{o}</option>)}</select>
        <span className="muted small">{rows.length} bids</span>
      </div>
      <Card pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Bid</th><th>Client</th><th>Stage</th><th className="right">Value</th><th>Closing</th><th>Partner</th><th>Outcome</th></tr></thead>
            <tbody>
              {page.map((b) => (
                <tr key={b.id}>
                  <td><Link to={`/bids/${b.id}`}><strong>{b.title}</strong></Link><div className="mini">{b.ref}{b.confidential ? ' · Confidential' : ''}{b.clientRef ? ` · ${b.clientRef}` : ''}</div></td>
                  <td>{client(b.clientId)}<div className="mini">{b.sector}</div></td>
                  <td><StagePill stage={b.stage} /></td>
                  <td className="right tabular">{aud(b.value)}</td>
                  <td><Closing closing={b.closing} short /></td>
                  <td><Person id={b.partnerId} /></td>
                  <td>{b.outcome ? <OutcomePill outcome={b.outcome} /> : b.archived ? <span className="pill">No-bid</span> : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pager}
      </Card>
    </div>
  );
}
