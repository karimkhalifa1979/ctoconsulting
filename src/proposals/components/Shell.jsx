import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useP } from '../lib/store.jsx';
import { platformInfo } from '../lib/ai.js';
import { Avatar, Icon, When } from './common.jsx';
import { roleLabel } from '../core/constants.js';
import { hasAnyRole } from '../core/permissions.js';
import { myWork } from '../core/analytics.js';

const BASE = import.meta.env.BASE_URL;

function useOutside(ref, onClose) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [ref, onClose]);
}

function Notifications() {
  const { view, dispatch } = useP();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();
  useOutside(ref, () => setOpen(false));
  const list = [...(view.notifications || [])].reverse();
  const unread = list.filter((n) => !n.read).length;
  const colour = { approval: 'var(--st-critical)', mention: '#7a52c7', review: 'var(--st-warning)', assignment: 'var(--series-1)', escalation: 'var(--st-critical)', library: 'var(--series-3)' };
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" aria-label={`Notifications, ${unread} unread`} onClick={() => setOpen(!open)}><Icon name="bell" />{unread > 0 && <span className="badge-count">{unread > 99 ? '99+' : unread}</span>}</button>
      {open && (
        <div className="menu" style={{ width: 400 }}>
          <div className="menu-head"><strong>Notifications</strong><button className="linkish small" onClick={() => dispatch('notif.read', { all: true }, { quiet: true })}>Mark all read</button></div>
          <div className="menu-list">
            {!list.length && <div className="empty" style={{ padding: 24 }}>You are all caught up.</div>}
            {list.slice(0, 40).map((n) => (
              <div key={n.id} className="notif" role="button" tabIndex={0} onClick={() => { dispatch('notif.read', { ids: [n.id] }, { quiet: true }); setOpen(false); if (n.link) nav(n.link); }}>
                <span className="u" style={{ background: n.read ? 'transparent' : colour[n.kind] || 'var(--brand-teal)' }} />
                <div><div className="t">{n.title}</div>{n.text && <div className="x clamp-2">{n.text}</div>}<div className="w"><When at={n.at} /></div></div>
              </div>
            ))}
          </div>
          <div className="menu-head" style={{ borderTop: '1px solid var(--line)', borderBottom: 0 }}><span className="mini">Email and Teams copies go to the notification outbox.</span><button className="linkish small" onClick={() => { setOpen(false); nav('/notifications'); }}>All</button></div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { me, signOut, mode } = useP();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();
  useOutside(ref, () => setOpen(false));
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="user-chip" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <Avatar id={me.id} />
        <span className="who"><strong>{me.name}</strong><span>{me.roles.map(roleLabel).join(', ')}</span></span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head"><div><strong>{me.name}</strong><div className="mini">{me.email}</div></div></div>
          {me.consultantId && <button className="menu-item" onClick={() => { setOpen(false); nav('/profile'); }}>My consultant profile</button>}
          <button className="menu-item" onClick={() => { setOpen(false); nav('/delegation'); }}>Delegate my approvals</button>
          <button className="menu-item" onClick={() => { setOpen(false); nav('/notifications'); }}>Notifications and preferences</button>
          <button className="menu-item" onClick={async () => { setOpen(false); await signOut(); nav('/'); }}>{mode === 'server' ? 'Sign out' : 'Switch user (demo sign-in)'}</button>
        </div>
      )}
    </div>
  );
}

export default function Shell() {
  const { view, me, mode, busy, presence } = useP();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [q, setQ] = useState('');
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => { platformInfo().then(setInfo); }, []);
  const work = myWork(view, me.id).filter((w) => !w.done).length;
  const admin = hasAnyRole(me, ['admin']);
  const configure = hasAnyRole(me, ['admin', 'librarian']);
  const others = new Set(presence.map((p) => p.userId)).size;
  const NAV = [
    ['Work', [['/work', 'My work', 'work', work], ['/pipeline', 'Pipeline', 'pipeline'], ['/bids', 'All bids', 'bids'], ['/search', 'Search', 'search']]],
    ['Content', [['/library', 'Content library', 'library'], ['/consultants', 'Consultants', 'people'], ['/rates', 'Rate cards', 'rates'], ['/templates', 'Templates', 'template']]],
    ['Insight', [['/insight/winloss', 'Win/loss analytics', 'chart'], ['/insight/content', 'Content insight', 'content'], ['/insight/ai', 'AI usage', 'ai']]],
    ...(configure ? [['Administration', [
      ...(admin ? [['/admin/users', 'Users and roles', 'users']] : []),
      ['/admin/workflows', 'Workflow templates', 'flow'], ['/admin/recipes', 'Deck recipes', 'slides'], ['/admin/settings', 'Taxonomy and style', 'settings'],
      ...(admin ? [['/admin/integrations', 'Integrations', 'plug'], ['/admin/outbox', 'Notification outbox', 'mail'], ['/admin/audit', 'Audit log', 'shield']] : []),
    ]]] : []),
  ];
  return (
    <div className="shell pp">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden>CTO</div>
          <div className="brand-text"><strong>CTO Consulting</strong><span>Proposal Platform</span></div>
        </div>
        <nav className="nav">
          <NavLink to="/bids/new" className="btn btn-primary" style={{ margin: '6px 4px 4px', justifyContent: 'center', color: '#fff', boxShadow: 'none' }}><Icon name="plus" />New bid</NavLink>
          {NAV.map(([group, items]) => (
            <div key={group}>
              <div className="nav-label">{group}</div>
              {items.map(([to, label, icon, count]) => <NavLink key={to} to={to}><Icon name={icon} />{label}{count ? <span className="count">{count}</span> : null}</NavLink>)}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="mode"><span className="dotline" style={{ background: mode === 'server' ? '#7ee2c4' : '#f2c14e' }} />{mode === 'server' ? 'Shared server storage' : 'Browser storage (this device)'}</div>
          <div className="mode" style={{ marginTop: 4 }}><span className="dotline" style={{ background: info?.claude ? '#7ee2c4' : '#8fa3bf' }} />AI: {info === null ? '…' : info.claude ? `Claude (${info.model})` : 'offline drafting engine'}</div>
          {others > 0 && <div style={{ marginTop: 4 }}>{others} other {others === 1 ? 'person' : 'people'} online</div>}
          <div style={{ marginTop: 8 }}><a href={`${BASE}index.html`}>Regulatory Assessment tool</a></div>
          <div style={{ marginTop: 4 }}>© CTO Consulting · <a href="https://www.ctoconsulting.com.au" target="_blank" rel="noreferrer">ctoconsulting.com.au</a></div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar no-print">
          <button className="btn menu-btn" onClick={() => setOpen(!open)} aria-label="Menu"><Icon name="menu" /></button>
          <form className="search" onSubmit={(e) => { e.preventDefault(); nav(`/search?q=${encodeURIComponent(q)}`); }} role="search">
            <Icon name="search" />
            <input type="search" placeholder="Search bids, sections, requirements and the library" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          </form>
          <div className="spacer" />
          {busy && <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2, margin: 0 }} aria-label="Saving" />}
          <Notifications />
          <UserMenu />
        </header>
        <main className="content" id="main">
          <Outlet />
        </main>
      </div>
      {open && <div className="overlay" style={{ zIndex: 70 }} onClick={() => setOpen(false)} />}
    </div>
  );
}
