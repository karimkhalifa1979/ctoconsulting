// Engagement list (ENG-001) with set-up of new engagements.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { useSession } from '../lib/session.jsx';
import { useLookups } from '../components/fields.jsx';
import { PageHead, Card, Async, Table, Rag, Status, D, Badge } from '../components/ui.jsx';
import { RecordDrawer } from '../components/Record.jsx';
import Icon from '../components/Icon.jsx';

export default function Engagements() {
  const { me } = useSession();
  const q = useApi('/api/e/engagement');
  const lookups = useLookups();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('open');
  const [text, setText] = useState('');
  const name = (list, id) => lookups?.[list]?.find((x) => x.id === id)?.label || '';
  return (
    <>
      <PageHead title="Engagements" sub="Every engagement you are a member of, plus the portfolio your role lets you see. Restricted engagements are visible only to named members (ACC-004)."
        actions={me.can.createEngagement && <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" /> New engagement</button>} />
      <div className="filters">
        <input type="search" placeholder="Search by name, code or client" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search" />
        <div className="seg">{[['open', 'Open'], ['all', 'All'], ['Closed', 'Closed']].map(([v, l]) => <button key={v} className={filter === v ? 'on' : ''} onClick={() => setFilter(v)}>{l}</button>)}</div>
      </div>
      <Async q={q}>{(rows) => {
        const list = rows.filter((e) => (filter === 'all' ? true : filter === 'open' ? e.status !== 'Closed' : e.status === filter))
          .filter((e) => !text || `${e.name} ${e.code} ${name('clients', e.client_id)}`.toLowerCase().includes(text.toLowerCase()));
        return (
          <Card flush>
            <Table rows={list} onRow={(e) => nav(`/engagements/${e.id}`)} initialSort={{ key: 'code', dir: 1 }} columns={[
              { key: 'health', label: 'Health', sort: (r) => r.health?.rag || '', render: (r) => <Rag v={r.health?.rag} /> },
              { key: 'code', label: 'Code' },
              { key: 'name', label: 'Engagement', render: (r) => <span><Link to={`/engagements/${r.id}`} className="strong" onClick={(e) => e.stopPropagation()}>{r.name}</Link> {r.restricted && <Badge tone="red">Restricted</Badge>}</span> },
              { key: 'client_id', label: 'Client', sort: (r) => name('clients', r.client_id), render: (r) => name('clients', r.client_id) },
              { key: 'type', label: 'Type' },
              { key: 'manager_id', label: 'Engagement manager', sort: (r) => name('users', r.manager_id), render: (r) => name('users', r.manager_id) },
              { key: 'start_date', label: 'Start', render: (r) => <D v={r.start_date} /> },
              { key: 'end_date', label: 'End', render: (r) => <D v={r.end_date} /> },
              { key: 'status', label: 'Status', render: (r) => <Status v={r.status} /> },
            ]} />
          </Card>
        );
      }}</Async>
      {creating && <RecordDrawer entity="engagement" defaults={{ executive_id: me.user.roles.includes('engagement_executive') ? me.user.id : null, manager_id: null, reporting_cadence: 'Weekly', report_approval: true, classification: 'Confidential', type: 'advisory' }}
        onClose={() => setCreating(false)} onSaved={(e) => { q.reload(); if (e?.id) nav(`/engagements/${e.id}`); }} />}
    </>
  );
}
