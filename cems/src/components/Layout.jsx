// Application shell: navigation by role, global search, notifications and the user menu.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSession, canAnywhere } from '../lib/session.jsx';
import { get, post, patch, del, offlineInfo, saveBlob } from '../lib/api.js';
import { initials } from '../lib/util.js';
import { ROLE_LABEL } from '../../shared/permissions.js';
import { Drawer, DT, Empty, useAction, useDialog, Field } from './ui.jsx';
import Icon from './Icon.jsx';

function navFor(me) {
  const c = me.can;
  const anyFn = (fn, act) => canAnywhere(me, fn, act);
  const anyRole = (r) => Object.values(me.access || {}).some((a) => a.roles.includes(r));
  const sections = [
    { label: null, items: [
      { to: '/', icon: 'home', label: 'My work', end: true },
      { to: '/approvals', icon: 'inbox', label: 'Approvals', count: me.approvals },
      me.person && { to: '/time', icon: 'clock', label: 'Timesheet', end: true },
    ] },
    { label: 'Delivery', items: [
      c.portfolio && { to: '/portfolio', icon: 'grid', label: 'Portfolio' },
      { to: '/engagements', icon: 'briefcase', label: 'Engagements' },
      { to: '/raid', icon: 'alert', label: 'RAID' },
      anyFn('time_approve', 'A') && { to: '/time/approvals', icon: 'checkCircle', label: 'Time approvals' },
      { to: '/knowledge', icon: 'book', label: 'Knowledge base' },
    ] },
    { label: 'Reporting', items: [
      { to: '/reports', icon: 'report', label: 'Reports', end: true },
      (c.pmo || anyRole('engagement_manager') || anyRole('project_manager')) && { to: '/reports/tracker', icon: 'list', label: 'Status tracker' },
      { to: '/reports/templates', icon: 'file', label: 'Template library' },
    ] },
    { label: 'Firm', items: [
      { to: '/clients', icon: 'users', label: 'Clients' },
      { to: '/resources', icon: 'layers', label: 'Resources' },
      (c.finance || c.rateCards || c.costRates) && { to: '/finance', icon: 'dollar', label: 'Finance' },
      c.pmo && { to: '/pmo', icon: 'target', label: 'PMO' },
    ] },
    (c.adminUsers || c.audit || c.configDelivery) && { label: 'Administration', items: [
      c.adminUsers && { to: '/admin', icon: 'settings', label: 'Administration' },
      c.audit && { to: '/admin/audit', icon: 'shield', label: 'Audit log' },
      { to: '/admin/requirements', icon: 'checkCircle', label: 'Requirements' },
    ] },
  ];
  return sections.filter(Boolean).map((s) => ({ ...s, items: s.items.filter(Boolean) })).filter((s) => s.items.length);
}

export default function Layout() {
  const { me } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notes, setNotes] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [unread, setUnread] = useState(me.unread || 0);
  const loc = useLocation();
  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);
  useEffect(() => {
    const t = setInterval(() => get('/api/notifications', { unread: 1, limit: 1 }).then((r) => setUnread(r.unread)).catch(() => {}), 60_000);
    return () => clearInterval(t);
  }, []);
  const sections = useMemo(() => navFor(me), [me]);
  const offline = offlineInfo();
  // Offline edition: re-render when another window opens on the same browser data.
  const [, setOfflineChange] = useState(0);
  useEffect(() => {
    const changed = () => setOfflineChange((n) => n + 1);
    window.addEventListener('cems:offline', changed);
    return () => window.removeEventListener('cems:offline', changed);
  }, []);
  return (
    <div className="shell">
      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <Link to="/" className="brand">
          <div className="brand-mark">CTO</div>
          <div className="brand-text"><strong>CEMS</strong><span>Engagement management</span></div>
        </Link>
        <nav className="nav" aria-label="Main">
          {sections.map((s) => (
            <div key={s.label || 'top'}>
              {s.label && <div className="nav-label">{s.label}</div>}
              {s.items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <Icon name={i.icon} />{i.label}{i.count ? <span className="count">{i.count}</span> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        {offline ? (
          <div className="sidebar-foot">
            <div><b>Offline edition</b> · demo sign-in</div>
            <div>Data is kept in this browser</div>
            <div>Email is kept in the outbox</div>
            <div>PDF: print from a report</div>
          </div>
        ) : (
          <div className="sidebar-foot">
            {me.env !== 'production' && <div>Environment: <b>{me.env}</b>{me.authMode === 'demo' ? ' · demo sign-in' : ''}</div>}
            <div>Email: {me.features?.email}</div>
            <div>PDF output: {me.features?.pdf ? 'available' : 'not installed'}</div>
          </div>
        )}
      </aside>
      <div className="main">
        {offline ? (
          <div className={`env-banner${!offline.persistent || offline.others ? ' warn' : ''}`}>
            {!offline.persistent ? 'Offline edition — this browser does not allow storage for pages opened from disk, so changes last until you close the page'
              : offline.others ? 'CEMS is open in another window of this browser — use one window so changes are not overwritten'
                : 'Offline edition with demo data — everything is kept in this browser on this computer'}
          </div>
        ) : me.env !== 'production' && <div className="env-banner">{me.env === 'development' ? 'Development environment with demo data — not for client information' : `${me.env} environment`}</div>}
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu"><Icon name="menu" /></button>
          <GlobalSearch />
          <span className="spacer" />
          <button className="icon-btn" onClick={() => setNotes(true)} aria-label={`Notifications, ${unread} unread`}>
            <Icon name="bell" />{unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
          </button>
          <button className="user-chip" onClick={() => setUserMenu(true)} aria-label="Your account">
            <span className="avatar">{initials(me.user.name)}</span>
            <span className="small strong">{me.user.name}</span>
          </button>
        </header>
        <main className="content" id="main"><Outlet /></main>
      </div>
      {notes && <Notifications onClose={() => setNotes(false)} onCount={setUnread} />}
      {userMenu && <UserPanel onClose={() => setUserMenu(false)} />}
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(null);
  const [focus, setFocus] = useState(0);
  const nav = useNavigate();
  const ref = useRef(null);
  const load = async () => {
    if (index) return;
    const [engs, projects, clients] = await Promise.all([get('/api/e/engagement').catch(() => []), get('/api/e/project').catch(() => []), get('/api/e/client').catch(() => [])]);
    setIndex([
      ...engs.map((e) => ({ kind: 'Engagement', label: `${e.code} ${e.name}`, to: `/engagements/${e.id}` })),
      ...projects.map((p) => ({ kind: 'Project', label: `${p.code} ${p.name}`, to: `/projects/${p.id}` })),
      ...clients.map((c) => ({ kind: 'Client', label: `${c.code} ${c.trading_name || c.legal_name}`, to: `/clients/${c.id}` })),
    ]);
  };
  const results = q && index ? index.filter((x) => x.label.toLowerCase().includes(q.toLowerCase())).slice(0, 12) : [];
  const go = (r) => { nav(r.to); setQ(''); setOpen(false); ref.current?.blur(); };
  return (
    <div className="topbar-search">
      <Icon name="search" />
      <input ref={ref} type="search" placeholder="Search engagements, projects and clients" value={q} aria-label="Search"
        onFocus={() => { load(); setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setFocus(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setFocus((f) => Math.min(results.length - 1, f + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
          if (e.key === 'Enter' && results[focus]) go(results[focus]);
        }} />
      {open && q && (
        <div className="search-results">
          {!index ? <div className="small muted">Loading…</div> : !results.length ? <div className="small muted" style={{ padding: 8 }}>No matches</div> : results.map((r, i) => (
            <a key={r.to} href={r.to} className={i === focus ? 'focus' : ''} onMouseDown={(e) => { e.preventDefault(); go(r); }}><span className="kind">{r.kind}</span><span>{r.label}</span></a>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications({ onClose, onCount }) {
  const [data, setData] = useState(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const nav = useNavigate();
  const load = () => get('/api/notifications', { limit: 60, unread: onlyUnread ? 1 : '' }).then((r) => { setData(r); onCount(r.unread); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [onlyUnread]);
  const markAll = async () => { const r = await post('/api/notifications/read', { ids: 'all' }); onCount(r.unread); load(); };
  const open = async (n) => {
    if (!n.read_at) { const r = await post('/api/notifications/read', { ids: [n.id] }); onCount(r.unread); }
    if (n.link) { nav(n.link); onClose(); }
  };
  return (
    <Drawer title="Notifications" onClose={onClose} actions={<button className="btn btn-sm" onClick={markAll}>Mark all read</button>}>
      <label className="check small mb-2"><input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Unread only</label>
      {!data ? null : !data.items.length ? <Empty icon="bell">You are all caught up.</Empty> : (
        <ul className="list">
          {data.items.map((n) => (
            <li key={n.id} style={{ cursor: n.link ? 'pointer' : 'default', opacity: n.read_at ? 0.7 : 1 }} onClick={() => open(n)}>
              <span className={`rag-dot ${n.severity === 'high' ? 'Red' : n.severity === 'action' ? 'Amber' : n.read_at ? '' : 'Green'}`} />
              <div className="grow">
                <div className={n.read_at ? '' : 'strong'}>{n.title}</div>
                {n.body && <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>}
                <div className="tiny muted"><DT v={n.created_at} />{n.mandatory ? ' · mandatory' : ''}{n.emailed_at ? ' · emailed' : ''}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

function UserPanel({ onClose }) {
  const { me, signOut, reload } = useSession();
  const nav = useNavigate();
  const [run, busy] = useAction();
  const [dlg, setDlg] = useState({ to_user: '', from: '', to: '' });
  const [people, setPeople] = useState([]);
  useEffect(() => { get('/api/directory').then((d) => setPeople(d.filter((u) => !u.external && u.id !== me.user.id))).catch(() => {}); }, [me.user.id]);
  const roles = Object.values(me.access || {}).flatMap((a) => a.roles);
  const roleSummary = [...new Set([...me.user.roles, ...roles])].map((r) => ROLE_LABEL[r] || r);
  const out = async () => { await signOut(); onClose(); nav('/login'); };
  return (
    <Drawer title={me.user.name} sub={`${me.user.title || ''} · ${me.user.email}`} onClose={onClose}
      footer={<><button className="btn" onClick={() => { onClose(); nav('/login?switch=1'); }} hidden={me.authMode !== 'demo'}>Switch persona</button><button className="btn btn-navy" onClick={out}><Icon name="logout" /> Sign out</button></>}>
      <div className="stack">
        {me.user.persona && <div className="alert info"><Icon name="user" /><div><b>Demo persona.</b> {me.user.persona}</div></div>}
        <div>
          <h4 className="mb-1">Roles</h4>
          <div className="chips">{roleSummary.map((r) => <span key={r} className="chip">{r}</span>)}{!roleSummary.length && <span className="muted">No roles yet</span>}</div>
        </div>
        <Field label="Notification delivery (WFL-004)" hint="Mandatory notifications are always sent immediately.">
          <select value={me.user.notify_pref} onChange={async (e) => { await run(() => patch('/api/me', { notify_pref: e.target.value }), 'Preference saved'); reload(); }}>
            <option value="immediate">Immediately</option>
            <option value="digest">Daily digest</option>
          </select>
        </Field>
        {offlineInfo() && <OfflineData />}
        <div>
          <h4 className="mb-1">Delegate approvals while away (WFL-006)</h4>
          {me.delegation?.map((d) => (
            <div key={d.id} className="flex mb-1">
              <span className="flex-1 small">To {people.find((p) => p.id === d.to_user)?.label || d.to_user} from {d.from}{d.to ? ` to ${d.to}` : ''}</span>
              <button className="btn btn-xs" onClick={async () => { await run(() => del(`/api/me/delegation/${d.id}`), 'Delegation ended'); reload(); }}>End</button>
            </div>
          ))}
          <div className="form-grid">
            <Field label="Delegate to"><select value={dlg.to_user} onChange={(e) => setDlg({ ...dlg, to_user: e.target.value })}><option value="">Choose…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
            <Field label="From"><input type="date" value={dlg.from} onChange={(e) => setDlg({ ...dlg, from: e.target.value })} /></Field>
            <Field label="To"><input type="date" value={dlg.to} onChange={(e) => setDlg({ ...dlg, to: e.target.value })} /></Field>
          </div>
          <button className="btn btn-sm mt-1" disabled={busy || !dlg.to_user || !dlg.from} onClick={async () => { await run(() => post('/api/me/delegation', dlg), 'Approvals delegated'); setDlg({ to_user: '', from: '', to: '' }); reload(); }}>Delegate</button>
        </div>
      </div>
    </Drawer>
  );
}

// Offline edition: the data lives in this browser, so it can be backed up, restored or reset.
function OfflineData() {
  const offline = offlineInfo();
  const dialog = useDialog();
  const [run, busy] = useAction();
  const input = useRef(null);
  const backup = async () => {
    const blob = await run(() => offline.backup(), 'Back-up saved');
    if (blob) saveBlob(blob, `CEMS_offline_backup_${new Date().toISOString().slice(0, 10)}.json`);
  };
  const restore = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!(await dialog({ title: 'Restore from a back-up', message: `Replace everything in this browser with ${file.name}? CEMS restarts with the restored data.`, confirm: 'Restore', danger: true }))) return;
    await run(() => offline.restore(file));
  };
  const reset = async () => {
    if (!(await dialog({ title: 'Reset the demo data', message: 'Delete everything CEMS keeps in this browser and build a fresh demo firm up to today? Back up first if you want to keep your changes.', confirm: 'Reset', danger: true }))) return;
    await run(() => offline.reset());
  };
  return (
    <div>
      <h4 className="mb-1">Data in this browser</h4>
      <p className="small muted">The offline edition keeps its database and files in this browser on this computer{offline.persistent ? '' : ' for this session only'}. Back up to move your data or keep a copy.</p>
      <div className="btn-row">
        <button className="btn btn-sm" disabled={busy} onClick={backup}><Icon name="download" /> Back up</button>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={restore} />
        <button className="btn btn-sm" disabled={busy} onClick={() => input.current?.click()}><Icon name="upload" /> Restore</button>
        <button className="btn btn-sm btn-danger" disabled={busy} onClick={reset}>Reset demo data</button>
      </div>
    </div>
  );
}
