// Requirements traceability: every requirement in the specification with its priority, release
// and where it is implemented.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks.js';
import { PageHead, Card, Async, Table, Badge, Tile } from '../../components/ui.jsx';

const PRIORITY = { M: 'Must', S: 'Should', C: 'Could', W: 'Won’t' };
const TONE = { Implemented: 'green', Partial: 'amber', Configurable: 'teal', 'Not started': 'grey', 'Out of scope': 'grey' };

export default function Requirements() {
  const q = useApi('/api/requirements');
  const [f, setF] = useState({ q: '', module: '', priority: '', status: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <PageHead title="Requirements traceability" crumbs={<><Link to="/admin">Administration</Link><span>›</span></>}
        sub="Requirements from the CEMS specification with their implementation status and where to find them." />
      <Async q={q}>{(rows) => {
        const shown = rows.filter((r) => (!f.module || r.module === f.module) && (!f.priority || r.priority === f.priority) && (!f.status || r.status === f.status)
          && (!f.q || `${r.id} ${r.text} ${r.where || ''}`.toLowerCase().includes(f.q.toLowerCase())));
        const musts = rows.filter((r) => r.priority === 'M');
        const done = (list) => list.filter((r) => ['Implemented', 'Configurable'].includes(r.status)).length;
        return (
          <>
            <div className="grid g-4 mb-2">
              <Tile label="Requirements" value={rows.length} />
              <Tile label="Musts implemented" value={`${done(musts)} / ${musts.length}`} tone={done(musts) === musts.length ? 'good' : 'warn'} />
              <Tile label="All implemented" value={`${done(rows)} / ${rows.length}`} />
              <Tile label="Partial" value={rows.filter((r) => r.status === 'Partial').length} />
            </div>
            <div className="filters mb-2">
              <input type="search" placeholder="Search ID, text or location" value={f.q} onChange={set('q')} style={{ minWidth: 280 }} />
              <select value={f.module} onChange={set('module')} aria-label="Module" style={{ width: 'auto' }}><option value="">All modules</option>{[...new Set(rows.map((r) => r.module))].sort().map((m) => <option key={m}>{m}</option>)}</select>
              <select value={f.priority} onChange={set('priority')} aria-label="Priority" style={{ width: 'auto' }}><option value="">All priorities</option>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <select value={f.status} onChange={set('status')} aria-label="Status" style={{ width: 'auto' }}><option value="">All statuses</option>{[...new Set(rows.map((r) => r.status))].sort().map((s) => <option key={s}>{s}</option>)}</select>
            </div>
            <Card flush>
              <Table rows={shown} columns={[
                { key: 'id', label: 'ID', render: (r) => <span className="mono">{r.id}</span> },
                { key: 'priority', label: 'Priority', render: (r) => <Badge tone={r.priority === 'M' ? 'navy' : ''}>{PRIORITY[r.priority] || r.priority}</Badge> },
                { key: 'text', label: 'Requirement', render: (r) => <span className="small">{r.text}</span> },
                { key: 'status', label: 'Status', render: (r) => <Badge tone={TONE[r.status] || 'grey'}>{r.status}</Badge> },
                { key: 'where', label: 'Where', render: (r) => <span className="small">{r.where || ''}</span> },
              ]} />
            </Card>
          </>
        );
      }}</Async>
    </>
  );
}
