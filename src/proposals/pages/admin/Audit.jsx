import { useEffect, useMemo, useState } from 'react';
import { useP } from '../../lib/store.jsx';
import { Card, PageHead } from '../../../components/ui.jsx';
import { AuditTable, auditCsv } from '../bid/Activity.jsx';

// Platform-wide audit trail (WF-15). Administrators see everything; others see events on bids they can open.
export default function Audit() {
  const { query, view } = useP();
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [bid, setBid] = useState('');
  useEffect(() => { query('audit', { limit: 5000 }).then(setData); }, [view.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = useMemo(() => [...(data?.events || [])].reverse().filter((e) => (!who || e.actor === who) && (!bid || e.bidId === bid) && (!q || `${e.label} ${e.action}`.toLowerCase().includes(q.toLowerCase()))), [data, q, who, bid]);
  const actors = [...new Set((data?.events || []).map((e) => e.actor))];
  return (
    <div className="stack">
      <PageHead eyebrow="Administration" title="Audit trail">Every action on the platform, in order. Each event includes the hash of the previous one, so any change or deletion breaks the chain and is detected.</PageHead>
      {data?.integrity && (data.integrity.ok
        ? <div className="callout good">Chain verified: {data.integrity.count.toLocaleString('en-AU')} events, intact.</div>
        : <div className="callout warn"><strong>Integrity check failed at event {data.integrity.at}:</strong> {data.integrity.reason}</div>)}
      <div className="filters">
        <input className="searchbox" placeholder="Filter actions" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter actions" />
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Person"><option value="">Everyone</option>{actors.map((id) => <option key={id} value={id}>{id === 'system' ? 'Platform' : view.users.find((u) => u.id === id)?.name || id}</option>)}</select>
        <select value={bid} onChange={(e) => setBid(e.target.value)} aria-label="Bid"><option value="">All bids</option>{view.bids.map((b) => <option key={b.id} value={b.id}>{b.ref} {b.title}</option>)}</select>
        <button className="btn" onClick={() => auditCsv(events, 'CTO_audit_trail.csv')}>Export CSV</button>
        <span className="muted small">{events.length} events</span>
      </div>
      <Card pad={false}><AuditTable events={events.slice(0, 1000)} showBid bids={view.bids} /></Card>
    </div>
  );
}
