// Audit trail and AI log (SEC-05, PRV-07, AIA-006, REC-02): search every recorded event (sign-ins, access to
// sensitive fields, changes, exports, artefact generation, configuration), see the fields each change
// touched, verify that the trail has not been altered, export it for the organisation's SIEM, and review
// the AI log and the disposal record.
import { useCallback, useEffect, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { Card, Tabs, Badge, Empty, Spinner, ErrorBox } from '../../ui/core.jsx';
import { useApp, useToast } from '../../state/app.jsx';
import { saveBlob } from '../../data/client.js';
import { useTab } from '../../lib/hooks.js';
import { fmtDateTime } from '../../lib/format.js';
import { ENTITIES } from '../../../shared/schema.js';
import { hasRole } from '../../../shared/access.js';
import { sortBy } from '../../../shared/util.js';

const ACTIONS = ['create', 'update', 'delete', 'login', 'logout', 'loginFailed', 'sensitiveRead', 'sensitiveInclude', 'export', 'download', 'generate', 'bulkGenerate', 'reproduce', 'publish', 'submit', 'approve', 'reject', 'import', 'merge', 'deidentify', 'privacySearch', 'config', 'disposal', 'close', 'lock', 'ai', 'upload', 'malwareBlocked', 'credential'];
const ACTION_TONE = { delete: 'critical', loginFailed: 'critical', malwareBlocked: 'critical', sensitiveRead: 'warning', sensitiveInclude: 'warning', export: 'info', disposal: 'serious', deidentify: 'serious', config: 'info', ai: 'info' };
const typeLabel = (t) => ENTITIES[t]?.label || t || '';

export default function Audit() {
  const { user } = useApp();
  const [tab, setTab] = useTab('trail');
  const full = hasRole(user, 'admin', 'auditor');
  return (
    <div className="stack">
      <Tabs value={tab} onChange={setTab} label="Audit" tabs={[{ id: 'trail', label: 'Audit trail', icon: 'history' }, full && { id: 'ai', label: 'AI log', icon: 'sparkles' }, full && { id: 'disposal', label: 'Disposal record', icon: 'archive' }]} />
      {tab === 'trail' && <Trail full={full} />}
      {tab === 'ai' && full && <AiLog />}
      {tab === 'disposal' && full && <Disposal />}
    </div>
  );
}

function EventTable({ rows }) {
  const { usersById } = useApp();
  const [open, setOpen] = useState(null);
  if (!rows.length) return <Empty icon="history" title="No events match" />;
  return (
    <div className="table-wrap">
      <table className="tbl tbl-compact audit-table">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>What happened</th></tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.seq} className={e.changes?.length ? 'clickable' : ''} onClick={() => e.changes?.length && setOpen(open === e.seq ? null : e.seq)}>
              <td className="nowrap small">{fmtDateTime(e.ts)}</td>
              <td className="small">{e.userName || usersById[e.userId]?.name || e.userId}</td>
              <td><Badge tone={ACTION_TONE[e.action] || ''}>{e.action}</Badge></td>
              <td className="small">{typeLabel(e.type)}{e.recordId ? <span className="sub-line tiny muted">{String(e.recordId).slice(0, 12)}</span> : null}</td>
              <td className="small">
                {e.summary}{e.reason && <span className="sub-line tiny muted">Reason: {e.reason}</span>}
                {open === e.seq && (
                  <ul className="audit-changes">{e.changes.map((c, i) => <li key={i}><strong>{c.field}</strong>: {c.sensitive ? <em>sensitive value changed (not shown)</em> : <>{c.from == null ? <em>empty</em> : String(c.from)} → {c.to == null ? <em>empty</em> : String(c.to)}</>}</li>)}</ul>
                )}
                {e.changes?.length > 0 && open !== e.seq && <span className="sub-line tiny muted">{e.changes.length} field{e.changes.length === 1 ? '' : 's'} changed — select to see</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Trail({ full }) {
  const { api, initiatives, users } = useApp();
  const toast = useToast();
  const [f, setF] = useState(() => ({ initiativeId: full ? '' : initiatives[0]?.id || '', userId: '', action: '', type: '', from: '', to: '', q: '' }));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [verify, setVerify] = useState(null);
  const [limit, setLimit] = useState(200);
  const filter = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const load = useCallback(() => {
    setData(null);
    api.op('auditQuery', { ...filter, limit }).then((r) => { setData(r); setError(null); }).catch(setError);
  }, [api, JSON.stringify(filter), limit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const doVerify = async () => { try { setVerify(await api.op('auditVerify', {})); } catch (e) { toast.error(e); } };
  const doExport = async () => {
    try { const r = await api.op('auditExport', filter); saveBlob(new Blob([r.jsonl], { type: 'application/x-ndjson' }), `audit-trail-${new Date().toISOString().slice(0, 10)}.jsonl`); } catch (e) { toast.error(e); }
  };
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setLimit(200); };
  return (
    <>
      <Card title="Audit trail" sub="Every sign-in, view of sensitive fields, change, export, artefact generation and configuration change, in a tamper-evident chain kept for at least seven years (SEC-05)."
        actions={full && <div className="btn-row"><button type="button" className="btn btn-sm" onClick={doVerify}><Icon name="shield" />Verify integrity</button><button type="button" className="btn btn-sm" onClick={doExport}><Icon name="download" />Export for the SIEM</button></div>}>
        <div className="audit-filters">
          <label className="field"><span>Initiative</span><select value={f.initiativeId} onChange={(e) => set('initiativeId', e.target.value)}>{full && <option value="">All initiatives</option>}{sortBy(initiatives, 'name').map((i) => <option key={i.id} value={i.id}>{i.shortName || i.name}</option>)}</select></label>
          <label className="field"><span>Person</span><select value={f.userId} onChange={(e) => set('userId', e.target.value)}><option value="">Anyone</option><option value="system">System</option>{sortBy(users, 'name').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          <label className="field"><span>Action</span><select value={f.action} onChange={(e) => set('action', e.target.value)}><option value="">Any action</option>{ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
          <label className="field"><span>Record type</span><select value={f.type} onChange={(e) => set('type', e.target.value)}><option value="">Any record</option>{sortBy(Object.entries(ENTITIES), ([, e]) => e.label).map(([k, e]) => <option key={k} value={k}>{e.label}</option>)}<option value="config">Configuration</option><option value="session">Session</option><option value="reporting">Reporting feed</option></select></label>
          <label className="field"><span>From</span><input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></label>
          <label className="field"><span>To</span><input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></label>
          <label className="field" style={{ gridColumn: 'span 2' }}><span>Containing</span><input type="search" value={f.q} placeholder="Name, code or words in the summary" onChange={(e) => set('q', e.target.value)} /></label>
        </div>
        {verify && <div className={`callout small mt-3 ${verify.ok ? 'good' : 'bad'}`} role="status">{verify.ok ? `Intact: all ${verify.checked} events link correctly and match their hashes.` : `The chain is broken at event ${verify.brokenAt}: ${verify.reason}. Report this to security.`}</div>}
      </Card>
      {error ? <ErrorBox error={error} onRetry={load} /> : !data ? <Spinner /> : (
        <Card title={`${data.total.toLocaleString('en-AU')} events`} sub={data.total > data.rows.length ? `Showing the latest ${data.rows.length}.` : undefined} flush
          actions={data.total > data.rows.length && <button type="button" className="btn btn-sm" onClick={() => setLimit(limit + 300)}>Show more</button>}>
          <EventTable rows={data.rows} />
        </Card>
      )}
    </>
  );
}

function AiLog() {
  const { api } = useApp();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.op('aiLog', { limit: 500 }).then(setRows).catch(setError); }, [api]);
  if (error) return <ErrorBox error={error} />;
  if (!rows) return <Spinner />;
  return (
    <Card title="AI log" sub="Each AI request with its feature, the person who asked, and what was returned, together with acceptances of AI-drafted content (AIA-006). Sensitive fields are never sent." flush>
      {!rows.length ? <Empty icon="sparkles" title="No AI activity">AI assistance has not been used{' '}yet, or it is not enabled.</Empty> : (
        <div className="table-wrap">
          <table className="tbl tbl-compact">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
            <tbody>{rows.map((e) => <tr key={e.seq}><td className="nowrap small">{fmtDateTime(e.ts)}</td><td className="small">{e.userName}</td><td className="small">{e.summary}</td><td className="small">{e.feature || e.model ? <span>{[e.feature, e.model].filter(Boolean).join(' · ')}</span> : null}{e.prompt && <details><summary>Prompt and output</summary><pre className="ai-pre">{String(e.prompt).slice(0, 4000)}</pre>{e.output && <pre className="ai-pre">{String(typeof e.output === 'string' ? e.output : JSON.stringify(e.output, null, 2)).slice(0, 4000)}</pre>}</details>}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Disposal() {
  const { api } = useApp();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.op('disposalRecord', {}).then(setRows).catch(setError); }, [api]);
  if (error) return <ErrorBox error={error} />;
  if (!rows) return <Spinner />;
  return (
    <Card title="Disposal record" sub="Every de-identification and deletion carried out under the retention schedule, for records management (ADM-006, PRV-06)." flush>
      {!rows.length ? <Empty icon="archive" title="Nothing has been disposed of" /> : <EventTable rows={rows} />}
    </Card>
  );
}
