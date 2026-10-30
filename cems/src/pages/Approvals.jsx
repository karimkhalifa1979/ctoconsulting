// WFL-001 approvals inbox: everything awaiting the user (or the colleague they act for), and requests they made.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { PageHead, Card, Async, Empty, Tabs, Status, DT } from '../components/ui.jsx';
import { ApprovalCard } from '../components/Record.jsx';

const KIND = { change: 'Change requests', status_update: 'Status updates', report: 'Reports', baseline: 'Baselines', commercial: 'Commercial approvals', gate: 'Stage gates', expense: 'Expenses', template: 'Report templates', wip_adjustment: 'Write-downs', drawdown: 'Reserve drawdowns', 'closure-exception': 'Closure exceptions' };

export default function Approvals() {
  const q = useApi('/api/approvals');
  const [tab, setTab] = useState('inbox');
  const [kind, setKind] = useState('');
  return (
    <>
      <PageHead title="Approvals" sub="Requests route by your delegations of authority; while a colleague is on leave you can act for them, and every decision is recorded in the audit trail." />
      <Async q={q}>{(d) => {
        const kinds = [...new Set(d.inbox.map((a) => a.kind))];
        const list = d.inbox.filter((a) => !kind || a.kind === kind);
        return (
          <>
            <Tabs value={tab} onChange={setTab} tabs={[{ id: 'inbox', label: 'Waiting for me', count: d.inbox.length }, { id: 'requested', label: 'Requested by me', count: d.requested.filter((a) => a.status === 'Pending').length }]} />
            {tab === 'inbox' ? (
              <>
                {kinds.length > 1 && (
                  <div className="subtabs">
                    <button className={!kind ? 'active' : ''} onClick={() => setKind('')}>All</button>
                    {kinds.map((k) => <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{KIND[k] || k}</button>)}
                  </div>
                )}
                {!list.length ? <Card><Empty icon="checkCircle">Nothing is waiting for your approval.</Empty></Card> : (
                  <div className="grid g-2">
                    {list.map((a) => (
                      <div key={a.id} className="stack-sm">
                        <div className="small muted">{KIND[a.kind] || a.kind}{a.engagement ? ` · ${a.engagement}` : ''}</div>
                        <ApprovalCard a={a} onDecided={q.reload} />
                        {a.link && <Link className="small" to={a.link}>Open {KIND[a.kind]?.toLowerCase().replace(/s$/, '') || 'record'} →</Link>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Card flush>
                {!d.requested.length ? <Empty>You have not requested any approvals.</Empty> : (
                  <table className="table">
                    <thead><tr><th>Request</th><th>Type</th><th>Current step</th><th>Requested</th><th>Status</th></tr></thead>
                    <tbody>{d.requested.map((a) => (
                      <tr key={a.id}>
                        <td>{a.link ? <Link to={a.link}>{a.title}</Link> : a.title}</td>
                        <td className="small">{KIND[a.kind] || a.kind}</td>
                        <td className="small">{a.status === 'Pending' ? `${a.steps[a.current]?.name} (${a.steps[a.current]?.approver_names?.join(', ')})` : '—'}</td>
                        <td className="small"><DT v={a.requested_at} /></td>
                        <td><Status v={a.status} /></td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </Card>
            )}
          </>
        );
      }}</Async>
    </>
  );
}
