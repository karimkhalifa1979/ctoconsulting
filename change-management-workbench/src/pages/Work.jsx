// My work (Section 5.4; WFL-001 to WFL-003): my tasks, approvals awaiting my decision and the approvals I
// asked for, my upcoming and unlogged engagements, my alerts and notifications across every initiative,
// and how I want to be notified.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, StatusBadge, Spinner, ErrorBox } from '../ui/core.jsx';
import DataGrid from '../ui/DataGrid.jsx';
import { useApp, useDialog, useToast } from '../state/app.jsx';
import { useMutator } from '../state/initiative.jsx';
import { useRecordDrawer } from '../ui/RecordDrawer.jsx';
import { useTab } from '../lib/hooks.js';
import { recordPath } from '../Layout.jsx';
import { fmtDate, fmtDateTime, label, relative } from '../lib/format.js';
import { ALERT_KINDS } from '../../shared/rules/alerts.js';
import { entity } from '../../shared/schema.js';
import { asArray, sortBy, uniq } from '../../shared/util.js';

// Everything the Home and My work screens show, in one request.
export function useMyWork() {
  const { api } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const reload = useCallback(async () => {
    try { setData(await api.op('myWork', {})); setError(null); } catch (e) { setError(e); }
  }, [api]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, reload };
}

// Where to review the thing an approval is about.
export function subjectPath(a) {
  const i = `/i/${a.initiativeId}`;
  switch (a.subjectType) {
    case 'strategy': return `${i}/strategy`;
    case 'masterPlan': case 'plan': return `${i}/plan?tab=approval`;
    case 'communication': return `${i}/comms?open=activity:${a.subjectId}`;
    case 'closeout': return `${i}/sustain?tab=closeout`;
    default: return recordPath(a.subjectType, a.subjectId, a.initiativeId);
  }
}

export const PRIORITY_TONE = { urgent: 'critical', high: 'serious', medium: 'info', low: '' };
const OPEN = new Set(['open', 'inProgress']);

export function useDecide(reload) {
  const mut = useMutator();
  const toast = useToast();
  const dialog = useDialog();
  return async (a, decision) => {
    const comment = await dialog.prompt(decision === 'reject'
      ? { title: `Reject ${a.subjectLabel}`, label: 'Why are you rejecting it? Your comment goes to the requester.' }
      : { title: `Approve ${a.subjectLabel}`, label: 'Comment (optional)', required: false, confirmLabel: 'Approve' });
    if (comment == null) return;
    try {
      await mut.op('decideApproval', { id: a.id, decision, comment }, { quiet: true });
      toast.success(decision === 'approve' ? `Approved: ${a.subjectLabel}` : `Rejected: ${a.subjectLabel}`);
      reload();
    } catch (e) { toast.error(e); }
  };
}

export default function Work() {
  const { notifications } = useApp();
  const { data, error, reload } = useMyWork();
  const [tab, setTab] = useTab('tasks');
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const openTasks = data.tasks.filter((t) => OPEN.has(t.status));
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <>
      <PageHead eyebrow="Workflow" title="My work">
        Everything assigned to you across the initiatives you work on: tasks, approvals, engagements you own and alerts. Notifications and how you receive them are here too.
      </PageHead>
      <Tabs value={tab} onChange={setTab} label="My work" tabs={[
        { id: 'tasks', label: 'Tasks', icon: 'task', count: openTasks.length || null },
        { id: 'approvals', label: 'Approvals', icon: 'approve', count: data.awaiting.length || null },
        { id: 'engagements', label: 'Engagements', icon: 'calendar', count: data.engagements.length || null },
        { id: 'alerts', label: 'Alerts', icon: 'alert', count: data.alerts.length || null },
        { id: 'notifications', label: 'Notifications', icon: 'bell', count: unread || null },
        { id: 'preferences', label: 'Preferences', icon: 'settings' },
      ]} />
      {tab === 'tasks' && <Tasks data={data} reload={reload} />}
      {tab === 'approvals' && <Approvals data={data} reload={reload} />}
      {tab === 'engagements' && <Engagements data={data} />}
      {tab === 'alerts' && <Alerts alerts={data.alerts} />}
      {tab === 'notifications' && <Notifications />}
      {tab === 'preferences' && <Preferences />}
    </>
  );
}

// --- Tasks (WFL-002) ---------------------------------------------------------------------------------
function Tasks({ data, reload }) {
  const { user, config, today } = useApp();
  const drawer = useRecordDrawer();
  const mut = useMutator();
  const toast = useToast();
  const navigate = useNavigate();
  const done = async (t) => {
    try {
      await mut.update('task', t.id, { status: 'done' }, { version: t.version, quiet: true });
      toast.success(`Done: ${t.title}`);
      reload();
    } catch (e) { toast.error(e); }
  };
  const linked = (t) => {
    if (!t.recordType || !t.recordId) return null;
    if (t.recordType === 'approval') return { label: 'Approval request', go: () => navigate('/work?tab=approvals') };
    let what;
    try { what = entity(t.recordType).label; } catch { return null; }
    return { label: what, go: () => navigate(recordPath(t.recordType, t.recordId, t.initiativeId)) };
  };
  const inis = uniq(data.tasks.map((t) => t.initiative).filter(Boolean));
  const cols = [
    { key: 'title', label: 'Task', render: (t) => { const l = linked(t); return <span><strong>{t.title}</strong>{l && <span className="sub-line tiny"><button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); l.go(); }}>{l.label}</button></span>}</span>; }, value: (t) => t.title },
    { key: 'initiative', label: 'Initiative', render: (t) => t.initiative || <span className="muted">—</span>, value: (t) => t.initiative },
    { key: 'priority', label: 'Priority', render: (t) => <Badge tone={PRIORITY_TONE[t.priority]}>{label('taskPriority', t.priority, config)}</Badge>, value: (t) => ['urgent', 'high', 'medium', 'low'].indexOf(t.priority) },
    { key: 'due', label: 'Due', render: (t) => (t.overdue ? <Badge tone="critical" icon="octagon">{fmtDate(t.dueDate)}</Badge> : t.dueDate ? <span title={relative(t.dueDate, today)}>{fmtDate(t.dueDate)}</span> : <span className="muted">—</span>), value: (t) => t.dueDate || '9999' },
    { key: 'status', label: 'Status', render: (t) => <StatusBadge status={t.status} labelText={label('taskStatus', t.status, config)} />, value: (t) => t.status },
    { key: '_done', label: '', sortable: false, render: (t) => OPEN.has(t.status) && <span onClick={(e) => e.stopPropagation()}><button type="button" className="btn btn-xs" onClick={() => done(t)}><Icon name="check" />Done</button></span> },
  ];
  return (
    <DataGrid id="my-tasks" type="task" title="My tasks" rows={data.tasks} columns={cols} defaultSort={{ key: 'due', dir: 'asc' }}
      facets={[
        { key: 'state', label: 'Status', options: [{ id: 'open', label: 'Not done' }, { id: 'overdue', label: 'Overdue' }, { id: 'done', label: 'Done or cancelled' }], value: (t) => (t.overdue ? ['open', 'overdue'] : OPEN.has(t.status) ? ['open'] : ['done']) },
        { key: 'priority', label: 'Priority', options: ['urgent', 'high', 'medium', 'low'].map((p) => ({ id: p, label: label('taskPriority', p, config) })), value: (t) => t.priority },
        ...(inis.length > 1 ? [{ key: 'ini', label: 'Initiative', options: inis.map((x) => ({ id: x, label: x })), value: (t) => t.initiative }] : []),
      ]}
      onRowClick={(t) => drawer.open({ type: 'task', id: t.id, onSaved: reload })}
      toolbar={<button type="button" className="btn btn-sm btn-primary" onClick={() => drawer.open({ type: 'task', defaults: { assigneeId: user.id, status: 'open', priority: 'medium' }, onSaved: reload })}><Icon name="plus" />New task</button>}
      empty={<Empty icon="checkCircle" title="No tasks">Tasks assigned to you, including approval requests and follow-ups from engagements, appear here.</Empty>} />
  );
}

// --- Approvals (WFL-001) -------------------------------------------------------------------------------
export function ApprovalCard({ a, onDecide }) {
  const { usersById, settings } = useApp();
  return (
    <div className="approval-card">
      <div className="row-between">
        <div>
          <div className="eyebrow">{a.initiative}</div>
          <h3 style={{ margin: '2px 0 0' }}><Link to={subjectPath(a)}>{a.subjectLabel}</Link></h3>
          <div className="small muted">Requested by {usersById[a.requestedBy]?.name || 'someone'} · {fmtDateTime(a.requestedAt, settings.timeZone)} · {a.rule === 'any' ? 'any one approver' : 'all approvers'}</div>
        </div>
        <div className="btn-row">
          <Link className="btn btn-sm" to={subjectPath(a)}><Icon name="eye" />Review</Link>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => onDecide(a, 'approve')}><Icon name="approve" />Approve</button>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => onDecide(a, 'reject')}>Reject</button>
        </div>
      </div>
      {a.note && <p className="small" style={{ margin: '8px 0 0' }}>{a.note}</p>}
      <div className="tiny muted mt-2">{asArray(a.approvers).map((x) => `${x.name}: ${x.decision ? (x.decision === 'approve' ? 'approved' : 'rejected') : 'waiting'}`).join(' · ')}</div>
    </div>
  );
}

function Approvals({ data, reload }) {
  const { config, settings, user } = useApp();
  const mut = useMutator();
  const toast = useToast();
  const decide = useDecide(reload);
  const withdraw = async (a) => {
    try { await mut.op('withdrawApproval', { id: a.id }, { quiet: true }); toast.success('Request withdrawn'); reload(); } catch (e) { toast.error(e); }
  };
  return (
    <div className="stack">
      <Card title="Awaiting your decision" sub="Review each item, then approve it or reject it with a comment for the requester." flush>
        {data.awaiting.length ? <div className="approval-list">{data.awaiting.map((a) => <ApprovalCard key={a.id} a={a} onDecide={decide} />)}</div>
          : <Empty icon="checkCircle" title="Nothing awaiting your approval">Strategies, plans, communications, messages, Blueprints, closeouts and artefacts sent to you for approval appear here.</Empty>}
      </Card>
      <h2 className="mt-2">Approvals you requested</h2>
      <DataGrid id="my-requests" type="approval" title="Approvals you requested" rows={data.requested}
        columns={[
          { key: 'subject', label: 'Item', render: (a) => <Link to={subjectPath(a)} onClick={(e) => e.stopPropagation()}>{a.subjectLabel}</Link>, value: (a) => a.subjectLabel },
          { key: 'initiative', label: 'Initiative', render: (a) => a.initiative, value: (a) => a.initiative },
          { key: 'requested', label: 'Requested', render: (a) => fmtDateTime(a.requestedAt, settings.timeZone), value: (a) => a.requestedAt },
          { key: 'approvers', label: 'Approvers', render: (a) => <span className="small">{asArray(a.approvers).map((x) => `${x.name}${x.decision ? ` (${x.decision === 'approve' ? 'approved' : 'rejected'})` : ''}`).join(', ')}</span>, value: (a) => asArray(a.approvers).map((x) => x.name).join(', ') },
          { key: 'status', label: 'Status', render: (a) => <StatusBadge status={a.status} labelText={label('approvalStatus', a.status, config)} />, value: (a) => a.status },
          { key: '_w', label: '', sortable: false, render: (a) => a.status === 'pending' && a.requestedBy === user.id && <span onClick={(e) => e.stopPropagation()}><button type="button" className="btn btn-xs" onClick={() => withdraw(a)}>Withdraw</button></span> },
        ]}
        empty={<Empty icon="approve" title="No requests">Items you submit for approval are tracked here.</Empty>} />
    </div>
  );
}

// --- Engagements ---------------------------------------------------------------------------------------
function Engagements({ data }) {
  const { config, today } = useApp();
  const navigate = useNavigate();
  const open = (e) => navigate(`/i/${e.initiativeId}/engagement?open=engagement:${e.id}`);
  return (
    <DataGrid id="my-engagements" type="engagement" title="My engagements" rows={data.engagements} onRowClick={open}
      columns={[
        { key: 'date', label: 'Date', render: (e) => <span className="nowrap">{fmtDate(e.plannedDate)}{e.plannedTime ? ` ${e.plannedTime}` : ''}</span>, value: (e) => `${e.plannedDate} ${e.plannedTime}` },
        { key: 'label', label: 'Engagement', render: (e) => <span><strong>{e.label}</strong><span className="sub-line tiny muted">{e.audience}</span></span>, value: (e) => e.label },
        { key: 'initiative', label: 'Initiative', render: (e) => e.initiative, value: (e) => e.initiative },
        { key: 'status', label: 'Status', render: (e) => (e.overdue ? <Badge tone="warning" icon="alert">Not yet logged</Badge> : <StatusBadge status={e.status} labelText={label('engagementStatus', e.status, config)} />), value: (e) => (e.overdue ? 'overdue' : e.status) },
        { key: 'when', label: '', render: (e) => <span className="small muted">{relative(e.plannedDate, today)}</span>, value: (e) => e.plannedDate },
      ]}
      facets={[{ key: 'state', label: 'Show', options: [{ id: 'upcoming', label: 'Upcoming' }, { id: 'overdue', label: 'Not yet logged' }], value: (e) => (e.overdue ? 'overdue' : 'upcoming') }]}
      empty={<Empty icon="calendar" title={`No engagements in the next ${data.days} days`}>Engagements you own or take part in, and any past engagements you have not yet logged, appear here.</Empty>} />
  );
}

// --- Alerts --------------------------------------------------------------------------------------------
export function Alerts({ alerts, limit }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState('');
  const [ini, setIni] = useState('');
  const kinds = uniq(alerts.map((a) => a.kind));
  const inis = uniq(alerts.map((a) => a.initiative));
  const list = alerts.filter((a) => (!kind || a.kind === kind) && (!ini || a.initiative === ini));
  const shown = limit ? list.slice(0, limit) : list;
  const icon = { critical: 'octagon', warning: 'alert', info: 'info' };
  return (
    <div className="card">
      {!limit && (kinds.length > 1 || inis.length > 1) && (
        <div className="grid-toolbar">
          {kinds.length > 1 && <select aria-label="Alert type" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All alerts ({alerts.length})</option>{kinds.map((k) => <option key={k} value={k}>{ALERT_KINDS[k] || k} ({alerts.filter((a) => a.kind === k).length})</option>)}</select>}
          {inis.length > 1 && <select aria-label="Initiative" value={ini} onChange={(e) => setIni(e.target.value)}><option value="">All initiatives</option>{inis.map((x) => <option key={x} value={x}>{x}</option>)}</select>}
        </div>
      )}
      {!shown.length && <Empty icon="checkCircle" title="Nothing needs attention">Alerts for stakeholders and engagements you look after appear here.</Empty>}
      {shown.map((a) => (
        <div key={`${a.initiativeId}:${a.id}`} className={`alert-item ${a.severity}`}>
          <Icon name={icon[a.severity]} className="ai-icon" label={a.severity} />
          <div className="grow">
            <div className="ai-title">{a.link ? <button type="button" className="link-btn" onClick={() => navigate(recordPath(a.link.type, a.link.id, a.initiativeId))}>{a.title}</button> : a.title}</div>
            <div className="ai-detail">{a.detail}</div>
          </div>
          <Badge>{a.initiative}</Badge>
        </div>
      ))}
      {limit && list.length > limit && <div className="card-pad small"><Link to="/work?tab=alerts">All {list.length} alerts</Link></div>}
    </div>
  );
}

// --- Notifications (WFL-003) -----------------------------------------------------------------------------
function Notifications() {
  const { notifications, setNotifications, settings, api } = useApp();
  const mut = useMutator();
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  useEffect(() => { api.op('listNotifications', {}).then(setNotifications).catch(() => {}); }, [api, setNotifications]);
  const list = sortBy(notifications.filter((n) => !unreadOnly || !n.read), '-createdAt');
  const read = (ids) => {
    mut.op('markNotificationsRead', ids ? { ids } : { all: true }, { quiet: true }).catch(() => {});
    setNotifications((ns) => ns.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)));
  };
  const go = (n) => {
    if (!n.read) read([n.id]);
    if (n.link) navigate(recordPath(n.link.type, n.link.id, n.initiativeId));
  };
  return (
    <Card title="Notifications" sub="Assignments, approvals, mentions, reminders and alerts sent to you." flush
      actions={<div className="btn-row"><label className="check small"><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /><span>Unread only</span></label><button type="button" className="btn btn-sm" onClick={() => read(null)} disabled={!notifications.some((n) => !n.read)}>Mark all as read</button></div>}>
      {!list.length && <Empty icon="bell" title={unreadOnly ? 'No unread notifications' : 'No notifications'}>You are up to date.</Empty>}
      <ul className="notice-list">
        {list.map((n) => (
          <li key={n.id} className={n.read ? '' : 'unread'}>
            <button type="button" onClick={() => go(n)}>
              <span className="nl-title">{!n.read && <span className="dot" aria-label="Unread" />}{n.title}</span>
              {n.body && <span className="nl-body">{n.body}</span>}
              <span className="nl-time">{fmtDateTime(n.createdAt, settings.timeZone)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// --- Preferences (WFL-003, USE-06) ------------------------------------------------------------------------
const MUTABLE = [
  { id: 'cadence', label: 'Reminders when a stakeholder is due for engagement' },
  { id: 'reschedule', label: 'Engagements moved because a milestone date changed' },
  { id: 'measure', label: 'Success measure values due' },
  { id: 'artefact', label: 'Scheduled artefacts ready' },
];
const ESSENTIAL = ['Approval requests and decisions', 'Tasks assigned to you', '@mentions', 'Leavers with future engagements', 'Resistance escalations'];

function Preferences() {
  const { user, features, mode, setBootPart, settings, api } = useApp();
  const toast = useToast();
  const [notify, setNotify] = useState(() => ({ email: true, teams: false, mute: [], ...(user.notify || {}) }));
  const [timeZone, setTimeZone] = useState(user.timeZone || settings.timeZone || 'Australia/Sydney');
  const [saving, setSaving] = useState(false);
  const zones = useMemo(() => {
    let all = [];
    try { all = Intl.supportedValuesOf('timeZone'); } catch { all = []; }
    const au = all.filter((z) => z.startsWith('Australia/'));
    return [...(au.length ? au : ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Perth', 'Australia/Hobart', 'Australia/Darwin']), ...all.filter((z) => !z.startsWith('Australia/'))];
  }, []);
  const save = async () => {
    setSaving(true);
    try {
      const u = await api.op('setMyPreferences', { notify, timeZone });
      setBootPart({ user: { ...user, ...u } });
      toast.success('Preferences saved');
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  };
  return (
    <div className="grid g-2">
      <Card title="How you are notified">
        <div className="stack-sm">
          <label className="check"><input type="checkbox" checked disabled /><span>In the application (always on)</span></label>
          <label className="check"><input type="checkbox" checked={!!notify.email} onChange={(e) => setNotify({ ...notify, email: e.target.checked })} /><span>By email{!features.email && <span className="muted"> — {mode === 'server' ? 'email is not configured on this server' : 'not sent in the browser-only demonstration'}</span>}</span></label>
          <label className="check"><input type="checkbox" checked={!!notify.teams} onChange={(e) => setNotify({ ...notify, teams: e.target.checked })} /><span>In Microsoft Teams, for approvals, resistance escalations and leavers (where the Teams connection is configured)</span></label>
        </div>
        <h3 className="mt-3">Notifications you receive</h3>
        <div className="stack-sm">
          {MUTABLE.map((k) => (
            <label key={k.id} className="check"><input type="checkbox" checked={!asArray(notify.mute).includes(k.id)} onChange={(e) => setNotify({ ...notify, mute: e.target.checked ? asArray(notify.mute).filter((x) => x !== k.id) : [...asArray(notify.mute), k.id] })} /><span>{k.label}</span></label>
          ))}
        </div>
        <p className="small muted mt-2">Always sent: {ESSENTIAL.join(', ').toLowerCase()}.</p>
      </Card>
      <Card title="Date and time">
        <label className="field"><span>Your time zone</span>
          <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>{zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</select>
        </label>
        <p className="small muted mt-2">Dates are shown as DD/MM/YYYY. Times are shown in your time zone; schedules run in the organisation's time zone ({settings.timeZone}).</p>
      </Card>
      <div className="btn-row"><button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save preferences'}</button></div>
    </div>
  );
}
