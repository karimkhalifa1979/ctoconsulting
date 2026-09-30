import { useEffect, useMemo, useState } from 'react';
import { useP } from '../../lib/store.jsx';
import { Card } from '../../../components/ui.jsx';
import { Person, When, download, MIME, safeFile } from '../../components/common.jsx';

// The bid's audit trail (WF-15): every action, hash-chained so tampering is detectable.
export function AuditTable({ events, showBid, bids = [] }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>#</th><th>When</th><th>Who</th><th>What</th>{showBid && <th>Bid</th>}<th>Hash</th></tr></thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.seq} onClick={() => setOpen(open === e.seq ? null : e.seq)} style={{ cursor: e.detail ? 'pointer' : undefined }}>
              <td className="tabular muted">{e.seq}</td>
              <td className="small nowrap"><When at={e.at} /><div className="mini">{new Date(e.at).toLocaleString('en-AU')}</div></td>
              <td>{e.actor === 'system' ? <span className="small">Platform</span> : <Person id={e.actor} />}</td>
              <td className="small">{e.label}<div className="mini">{e.action}</div>{open === e.seq && e.detail && <pre className="mini" style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{JSON.stringify(e.detail, null, 2)}</pre>}</td>
              {showBid && <td className="small">{bids.find((b) => b.id === e.bidId)?.ref || (e.bidId ? '(restricted)' : '—')}</td>}
              <td className="mini" style={{ fontFamily: 'monospace' }} title={`prev ${e.prevHash}\nthis ${e.hash}`}>{e.hash.slice(0, 10)}…</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function auditCsv(events, name) {
  const head = ['seq', 'at', 'actor', 'actorName', 'action', 'label', 'bidId', 'objectType', 'objectId', 'prevHash', 'hash'];
  const csv = [head, ...events.map((e) => head.map((k) => e[k] ?? ''))].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download(new Blob([csv], { type: MIME.csv }), name);
}

export default function Activity({ bid }) {
  const { query, view } = useP();
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  useEffect(() => { query('audit', { bidId: bid.id }).then(setData).catch(() => setData({ events: [] })); }, [bid.id, view.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = useMemo(() => [...(data?.events || [])].reverse().filter((e) => (!who || e.actor === who) && (!q || `${e.label} ${e.action}`.toLowerCase().includes(q.toLowerCase()))), [data, q, who]);
  const actors = [...new Set((data?.events || []).map((e) => e.actor))];
  const integrity = data?.integrity;
  return (
    <div className="stack">
      {integrity && (integrity.ok
        ? <div className="callout good">Audit trail verified: {integrity.count.toLocaleString('en-AU')} events on the platform, each linked to the previous one by a SHA-256 hash. No event has been changed or removed.</div>
        : <div className="callout warn"><strong>Integrity check failed at event {integrity.at}:</strong> {integrity.reason}. Report this to the platform administrator.</div>)}
      <div className="filters">
        <input className="searchbox" placeholder="Filter actions" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter actions" />
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Person"><option value="">Everyone</option>{actors.map((id) => <option key={id} value={id}>{id === 'system' ? 'Platform' : view.users.find((u) => u.id === id)?.name || id}</option>)}</select>
        <button className="btn" onClick={() => auditCsv(events, `${safeFile(bid.ref)}_audit_trail.csv`)}>Export CSV</button>
        <span className="muted small">{events.length} events</span>
      </div>
      <Card pad={false}><AuditTable events={events} /></Card>
    </div>
  );
}
