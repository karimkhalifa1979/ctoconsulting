// Audit log (NFR-025, NFR-026): tamper-evident, hash-chained record of changes, approvals, access
// changes, exports and sign-ins; searchable, exportable, with chain verification.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks.js';
import { post, download } from '../../lib/api.js';
import { useSession } from '../../lib/session.jsx';
import { useLookups } from '../../components/fields.jsx';
import { PageHead, Card, Async, Table, DT, Alert, Drawer, KV, useAction } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';

const ACTIONS = ['create', 'update', 'delete', 'approve', 'reject', 'submit', 'issue', 'distribute', 'export', 'grant', 'revoke', 'access-change', 'sign-in', 'sign-out', 'import', 'config', 'period-lock', 'period-unlock', 'adjust', 'baseline'];
const PAGE = 100;

export default function Audit() {
  const { me } = useSession();
  const lookups = useLookups();
  const [f, setF] = useState({ user_id: '', action: '', entity: '', engagement_id: '', from: '', to: '' });
  const [offset, setOffset] = useState(0);
  const q = useApi('/api/admin/audit', { ...f, limit: PAGE, offset });
  const [open, setOpen] = useState(null);
  const [verify, setVerify] = useState(null);
  const [run, busy] = useAction();
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setOffset(0); };
  const check = async () => {
    const out = await run(() => post('/api/admin/audit/verify'));
    if (out) setVerify(out);
  };
  return (
    <>
      <PageHead title="Audit log" crumbs={<><Link to="/admin">Administration</Link><span>›</span></>}
        sub="Every event is chained to the one before it by a hash, so any alteration is detectable. Before and after values are shown to auditors."
        actions={<>
          {(me.user.roles || []).some((r) => ['auditor', 'sysadmin'].includes(r)) && <button className="btn btn-sm" disabled={busy} onClick={check}><Icon name="shield" /> Verify chain</button>}
          <button className="btn btn-sm" onClick={() => download('/api/admin/audit', { ...f, limit: 1000, format: 'xlsx' })}><Icon name="download" /> Excel</button>
        </>} />
      {verify && <Alert tone={verify.ok ? 'ok' : 'error'}>{verify.ok ? `Chain intact: ${verify.count} events verified.` : `Chain broken at event ${verify.brokenAt}: the hash does not match its contents or the previous event.`}</Alert>}
      <div className="filters mb-2 mt-2">
        <select value={f.user_id} onChange={set('user_id')} aria-label="User" style={{ width: 'auto' }}><option value="">All users</option>{(lookups?.users || []).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select>
        <select value={f.action} onChange={set('action')} aria-label="Action" style={{ width: 'auto' }}><option value="">All actions</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</select>
        <input type="text" placeholder="Record type, for example risk" value={f.entity} onChange={set('entity')} style={{ width: 200 }} />
        <select value={f.engagement_id} onChange={set('engagement_id')} aria-label="Engagement" style={{ width: 'auto' }}><option value="">All engagements</option>{(lookups?.engagements || []).map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>
        <label className="small">From <input type="date" value={f.from} onChange={set('from')} /></label>
        <label className="small">To <input type="date" value={f.to} onChange={set('to')} /></label>
      </div>
      <Async q={q}>{(d) => (
        <Card flush>
          <Table rows={d.rows.map((x) => ({ ...x, id: x.seq }))} onRow={setOpen} columns={[
            { key: 'seq', label: '#', num: true },
            { key: 'at', label: 'When', render: (x) => <DT v={x.at} /> },
            { key: 'user', label: 'User' },
            { key: 'action', label: 'Action' },
            { key: 'entity', label: 'Record' },
            { key: 'summary', label: 'Summary', render: (x) => <span className="small">{x.summary}</span> },
          ]} />
          <div className="card-foot flex between">
            <span className="small muted">{d.total ? `${offset + 1}–${Math.min(offset + PAGE, d.total)} of ${d.total.toLocaleString('en-AU')}` : 'No events'}</span>
            <span className="btn-row">
              <button className="btn btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Newer</button>
              <button className="btn btn-sm" disabled={offset + PAGE >= d.total} onClick={() => setOffset(offset + PAGE)}>Older</button>
            </span>
          </div>
        </Card>
      )}</Async>
      {open && (
        <Drawer title={`Event ${open.seq}`} sub={open.summary} onClose={() => setOpen(null)}>
          <KV items={[
            ['When', <DT v={open.at} />], ['User', open.user], ['Action', open.action], ['Record', `${open.entity}${open.entity_id ? ` ${open.entity_id}` : ''}`],
            ['IP address', open.ip], ['Hash', <span className="mono tiny">{open.hash}</span>], ['Previous hash', <span className="mono tiny">{open.prev_hash}</span>],
          ]} />
          {open.before && <><h4 className="mt-3 mb-1">Before</h4><pre className="mono" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(open.before, null, 2)}</pre></>}
          {open.after && <><h4 className="mt-3 mb-1">After</h4><pre className="mono" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(open.after, null, 2)}</pre></>}
        </Drawer>
      )}
    </>
  );
}
