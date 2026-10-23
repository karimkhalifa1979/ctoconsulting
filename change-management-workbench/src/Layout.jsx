// Application shell: navigation by phase and module, global search (WFL-006), notifications (WFL-003),
// quick capture, theme and the signed-in user's menu.
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from './ui/Icon.jsx';
import { Avatar, Popover } from './ui/core.jsx';
import { useApp } from './state/app.jsx';
import { useIniOptional, useMutator } from './state/initiative.jsx';
import { useRecordDrawer } from './ui/RecordDrawer.jsx';
import { can, hasRole, roleLabel } from '../shared/access.js';
import { PHASES, TRADEMARK_NOTICE } from '../shared/refdata.js';
import { entity } from '../shared/schema.js';
import { fmtDateTime } from './lib/format.js';
import { BackupButton, RestoreButton, WorkbenchBanner, canBackUp, useWorkbenchStatus } from './ui/WorkbenchData.jsx';

// Where each record type lives in an initiative.
export const TYPE_PAGE = {
  initiative: '', milestone: 'setup', objective: 'setup', measure: 'measures', measureValue: 'measures', decision: 'setup',
  impactedGroup: 'impact', impact: 'impact', assessment: 'risk', readinessChecklist: 'risk', risk: 'risk', strategy: 'strategy',
  coalitionMember: 'sponsor', blueprint: 'adkar', survey: 'adkar', surveyResponse: 'adkar', activity: 'plan', keyMessage: 'comms', faq: 'comms',
  toolkitItem: 'managers', tna: 'training', trainingIntervention: 'training', trainingSession: 'training', proficiency: 'training', supportArrangement: 'training',
  resistance: 'resistance', changeAgent: 'agents', profile: 'stakeholders', engagementPlanItem: 'engagement', engagement: 'engagement', feedback: 'measures',
  correctiveAction: 'measures', sustainmentItem: 'sustain', handoverItem: 'sustain', lesson: 'sustain', closeout: 'sustain', narrative: 'artefacts',
  artefact: 'artefacts', schedule: 'artefacts', planBaseline: 'plan', planChange: 'plan', task: '', approval: '', comment: '', attachment: '',
};

export function recordPath(type, id, initiativeId) {
  if (type === 'stakeholder') return `/stakeholders/${id}`;
  if (type === 'initiative') return `/i/${id}`;
  if (type === 'approval') return '/work?tab=approvals';
  if (type === 'task') return `/work?open=task:${id}`;
  if (type === 'reportDefinition') return `/reports?tab=builder&report=${id}`;
  if (!initiativeId) return '/work';
  if (type === 'artefact') return `/i/${initiativeId}/artefacts?tab=library&artefact=${id}`;
  const page = TYPE_PAGE[type] ?? '';
  return `/i/${initiativeId}${page ? `/${page}` : ''}?open=${type}:${id}`;
}

// Screen names in the navigation; administrators can rename them (ADM-003, terminology key screen.<id>).
export const SCREEN_LABELS = {
  home: 'Home', work: 'My work', initiatives: 'Initiatives', portfolio: 'Portfolio', stakeholders: 'Stakeholders', lessons: 'Lessons learned', reports: 'Reports',
  overview: 'Overview', dashboards: 'Dashboards', setup: 'Definition and success', impact: 'Change impact', risk: 'Risk and readiness', strategy: 'Strategy',
  plan: 'Master plan', adkar: 'ADKAR', engagement: 'Engagement', sponsor: 'Sponsorship', managers: 'People managers', comms: 'Communications', training: 'Training',
  resistance: 'Resistance', agents: 'Change agents', measures: 'Measurement', sustain: 'Sustainment and closeout', artefacts: 'Artefacts',
};
const screenKey = (to) => (to === '/' ? 'home' : /^\/i\/[^/]+$/.test(to) ? 'overview' : to.replace(/^\/i\/[^/]+\//, '').replace(/^\//, ''));

function useNav(user, ini, terms = {}) {
  const nav = buildNav(user, ini);
  const rename = (it) => ({ ...it, label: terms[`screen.${screenKey(it.to)}`] || it.label });
  return { global: nav.global.map(rename), sections: nav.sections.map((sec) => ({ ...sec, items: sec.items.map(rename) })) };
}

function buildNav(user, ini) {
  const iid = ini?.id;
  const base = `/i/${iid}`;
  const r = (type) => can(user, 'R', type, null);
  const global = [
    { to: '/', icon: 'home', label: 'Home', end: true },
    { to: '/work', icon: 'task', label: 'My work' },
    { to: '/initiatives', icon: 'layers', label: 'Initiatives' },
    (hasRole(user, 'portfolio', 'changeLead', 'admin', 'auditor', 'pm', 'sponsor')) && { to: '/portfolio', icon: 'grid', label: 'Portfolio' },
    r('stakeholder') && { to: '/stakeholders', icon: 'users', label: 'Stakeholders' },
    r('lesson') && { to: '/lessons', icon: 'lightbulb', label: 'Lessons learned' },
    { to: '/reports', icon: 'report', label: 'Reports' },
    (hasRole(user, 'admin', 'auditor', 'changeLead')) && { to: '/admin', icon: 'settings', label: hasRole(user, 'admin') ? 'Administration' : 'Audit and configuration' },
  ].filter(Boolean);
  if (!iid) return { global, sections: [] };
  const m = ini.model;
  const sections = [
    { label: 'Initiative', items: [{ to: base, icon: 'compass', label: 'Overview', end: true, count: m?.kpis.criticalAlerts, alert: true }, { to: `${base}/dashboards`, icon: 'chart', label: 'Dashboards' }] },
    { label: PHASES[0].label, phase: PHASES[0], items: [
      r('initiative') && { to: `${base}/setup`, icon: 'flag', label: 'Definition and success' },
      r('impact') && { to: `${base}/impact`, icon: 'impact', label: 'Change impact' },
      r('profile') && { to: `${base}/stakeholders`, icon: 'users', label: 'Stakeholders' },
      r('assessment') && { to: `${base}/risk`, icon: 'shield', label: 'Risk and readiness' },
      r('strategy') && { to: `${base}/strategy`, icon: 'route', label: 'Strategy' },
    ].filter(Boolean) },
    { label: PHASES[1].label, phase: PHASES[1], items: [
      r('activity') && { to: `${base}/plan`, icon: 'gantt', label: 'Master plan', count: m?.kpis.coverageWarnings || null },
      { to: `${base}/adkar`, icon: 'target', label: 'ADKAR' },
      r('engagement') && { to: `${base}/engagement`, icon: 'calendar', label: 'Engagement' },
      r('activity') && { to: `${base}/sponsor`, icon: 'star', label: 'Sponsorship' },
      r('toolkitItem') && { to: `${base}/managers`, icon: 'briefcase', label: 'People managers' },
      r('keyMessage') && { to: `${base}/comms`, icon: 'megaphone', label: 'Communications' },
      r('trainingIntervention') && { to: `${base}/training`, icon: 'book', label: 'Training' },
      r('resistance') && { to: `${base}/resistance`, icon: 'hand', label: 'Resistance' },
      r('changeAgent') && { to: `${base}/agents`, icon: 'network', label: 'Change agents' },
      r('measure') && { to: `${base}/measures`, icon: 'trend', label: 'Measurement' },
    ].filter(Boolean) },
    { label: PHASES[2].label, phase: PHASES[2], items: [r('sustainmentItem') && { to: `${base}/sustain`, icon: 'leaf', label: 'Sustainment and closeout' }].filter(Boolean) },
    { label: 'Outputs', items: [r('artefact') && { to: `${base}/artefacts`, icon: 'files', label: 'Artefacts' }].filter(Boolean) },
  ].filter((s) => s.items.length);
  return { global, sections };
}

export default function Layout({ children, initiativeId }) {
  const app = useApp();
  const { user, initiatives, api, mode, notifications } = app;
  const ini = useIniOptional();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const nav = useNav(user, initiativeId ? ini : null, app.settings?.terminology);
  useEffect(() => { setNavOpen(false); }, [location.pathname]);
  useOpenParam();

  const unread = notifications.filter((n) => !n.read).length;
  const current = initiatives.find((i) => i.id === initiativeId);
  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <NavLink to="/" className="brand" aria-label="Change Management Workbench home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="26" height="26"><path d="M12 42c6-15 15-22 26-22 6 0 10 2 13 4" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" /><circle cx="47" cy="42" r="6" fill="#f2a900" /></svg>
          </span>
          <span className="brand-text"><strong>Change Workbench</strong><span>CTO Consulting</span></span>
        </NavLink>
        <div className="ini-switch">
          <label htmlFor="ini-select">Initiative</label>
          <select id="ini-select" value={initiativeId || ''} onChange={(e) => navigate(e.target.value ? `/i/${e.target.value}` : '/')}>
            <option value="">All initiatives</option>
            {initiatives.map((i) => <option key={i.id} value={i.id}>{i.shortName || i.name}{i.status === 'closed' ? ' (closed)' : ''}</option>)}
          </select>
        </div>
        <nav className="nav">
          {nav.sections.map((s) => (
            <div key={s.label}>
              <div className="nav-label">{s.phase && <span className="phase-dot" style={{ background: s.phase.color }} aria-hidden="true" />}{s.phase ? `Phase ${s.phase.n}: ${s.label}` : s.label}</div>
              {s.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end}>
                  <Icon name={it.icon} />{it.label}{it.count ? <span className={`count ${it.alert ? 'alert' : ''}`} aria-label={`${it.count} items`}>{it.count}</span> : null}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="nav-label">{initiativeId ? 'Workbench' : 'Navigate'}</div>
          {nav.global.map((it) => <NavLink key={it.to} to={it.to} end={it.end}><Icon name={it.icon} />{it.label}</NavLink>)}
          <NavLink to="/help"><Icon name="question" />Help and glossary</NavLink>
        </nav>
        <div className="sidebar-foot">{TRADEMARK_NOTICE}</div>
      </aside>
      <div className="main">
        {mode === 'standalone' && <WorkbenchBanner />}
        <header className="topbar no-print">
          <button type="button" className="icon-btn menu-btn" aria-label="Open navigation" aria-expanded={navOpen} onClick={() => setNavOpen((o) => !o)}><Icon name="menu" /></button>
          {current && <div className="small muted ellipsis" style={{ maxWidth: 260 }} title={current.name}><strong style={{ color: 'var(--ink)' }}>{current.shortName || current.name}</strong></div>}
          <GlobalSearch />
          <span className="spacer" />
          {initiativeId && can(user, 'C', 'engagement', null) && (
            <NavLink to={`/i/${initiativeId}/capture`} className="btn btn-sm" title="Quick capture an engagement (STK-034)"><Icon name="mobile" /><span className="hide-sm">Quick capture</span></NavLink>
          )}
          <Notifications unread={unread} />
          <UserMenu />
        </header>
        <main id="main" className="content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}

// ?open=type:id opens a record drawer (links from search, notifications and dashboards).
function useOpenParam() {
  const [params, setParams] = useSearchParams();
  const drawer = useRecordDrawer();
  const ini = useIniOptional();
  const open = params.get('open');
  useEffect(() => {
    if (!open || !drawer) return;
    if (ini && !ini.data) return;
    const [type, id] = open.split(':');
    params.delete('open');
    setParams(params, { replace: true });
    try { entity(type); } catch { return; }
    drawer.open({ type, id });
  }, [open, ini?.data]); // eslint-disable-line react-hooks/exhaustive-deps
}

function GlobalSearch() {
  const { api } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const box = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits(null); return; }
    timer.current = setTimeout(() => api.search(q).then(setHits).catch(() => setHits([])), 250);
  }, [q, api]);
  useEffect(() => {
    const onDoc = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); box.current?.querySelector('input')?.focus(); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);
  const go = (h) => { setOpen(false); setQ(''); navigate(recordPath(h.type, h.id, h.initiativeId)); };
  return (
    <div className="search" ref={box} role="search">
      <Icon name="search" />
      <input type="search" placeholder="Search stakeholders, engagements, plans… (Ctrl K)" aria-label="Search everything you can see" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && hits && (
        <div className="search-results" role="listbox">
          {hits.length === 0 && <div className="small muted" style={{ padding: 8 }}>No results you have access to.</div>}
          {hits.map((h) => (
            <button key={`${h.type}:${h.id}`} type="button" role="option" aria-selected="false" onClick={() => go(h)}>
              <span className="badge">{(() => { try { return entity(h.type).label; } catch { return h.type; } })()}</span>
              <span className="grow ellipsis">{String(h.title || h.code).replace(/<[^>]+>/g, '')}</span>
              {h.code && <span className="code">{h.code}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications({ unread }) {
  const { notifications, setNotifications, settings } = useApp();
  const mut = useMutator();
  const navigate = useNavigate();
  const markAll = async () => {
    await mut.op('markNotificationsRead', { all: true }, { quiet: true });
    setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
  };
  const open = async (n) => {
    if (!n.read) {
      mut.op('markNotificationsRead', { ids: [n.id] }, { quiet: true }).catch(() => {});
      setNotifications((ns) => ns.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    if (n.link?.type === 'approval' || n.link?.type === 'task') navigate('/work');
    else if (n.link?.type) navigate(recordPath(n.link.type, n.link.id, n.initiativeId));
  };
  return (
    <Popover width={380} button={({ toggle }) => (
      <button type="button" className="icon-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={toggle}>
        <Icon name="bell" />{unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
      </button>
    )}>
      <div className="row-between" style={{ padding: '4px 8px 8px' }}><strong>Notifications</strong>{unread > 0 && <button type="button" className="btn btn-xs" onClick={markAll}>Mark all read</button>}</div>
      <div className="panel-list">
        {notifications.length === 0 && <div className="menu-head">You are all caught up.</div>}
        {notifications.slice(0, 40).map((n) => (
          <button key={n.id} type="button" data-close onClick={() => open(n)} style={{ alignItems: 'flex-start', fontWeight: n.read ? 400 : 600 }}>
            <Icon name={{ approval: 'approve', cadence: 'clock', measure: 'trend', resistance: 'hand', task: 'task', mention: 'chat', reschedule: 'calendar', artefact: 'file', leaver: 'user' }[n.kind] || 'bell'} />
            <span className="grow">
              <span style={{ display: 'block' }}>{n.title}</span>
              {n.body && <span className="small muted" style={{ display: 'block', fontWeight: 400, whiteSpace: 'pre-line' }}>{n.body.length > 160 ? `${n.body.slice(0, 159)}…` : n.body}</span>}
              <span className="tiny muted" style={{ fontWeight: 400 }}>{fmtDateTime(n.createdAt, settings.timeZone)}</span>
            </span>
          </button>
        ))}
      </div>
    </Popover>
  );
}

function UserMenu() {
  const { user, signOut, mode, api, refresh } = useApp();
  const navigate = useNavigate();
  const [demoUsers, setDemoUsers] = useState(null);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'system');
  const applyTheme = (t) => {
    setTheme(t);
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try { localStorage.setItem('cmw.theme', t); } catch { /* storage unavailable */ }
  };
  const isDemo = mode === 'standalone' || api.serverInfo?.demo;
  const own = useWorkbenchStatus(api)?.workspace === 'own';
  useEffect(() => { if (isDemo) api.authOptions().then((o) => setDemoUsers(o.demoUsers || [])).catch(() => {}); }, [api, isDemo]);
  const switchTo = async (id) => {
    await api.demoLogin(id);
    navigate('/');
    await refresh();
  };
  const roles = useMemo(() => (user.roles || []).map(roleLabel).join(', '), [user.roles]);
  return (
    <Popover width={300} button={({ toggle }) => (
      <button type="button" className="icon-btn" style={{ width: 'auto', padding: '0 4px', gap: 6 }} aria-label={`Account: ${user.name}`} onClick={toggle}><Avatar name={user.name} size="sm" /></button>
    )}>
      <div className="menu-head"><strong style={{ color: 'var(--ink)', display: 'block', fontSize: 13.5 }}>{user.name}</strong>{roles}<br />{user.email}</div>
      <hr />
      <div className="menu-head">Theme</div>
      <div style={{ padding: '0 8px 6px' }}>
        <div className="seg" role="group" aria-label="Theme">
          {[['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([id, l]) => <button key={id} type="button" aria-pressed={theme === id} onClick={() => applyTheme(id)}>{l}</button>)}
        </div>
      </div>
      {mode === 'standalone' && canBackUp(user) && (
        <>
          <hr />
          <div className="menu-head">Workbench data in this browser</div>
          <BackupButton className="" label="Back up the workbench" />
          <RestoreButton className="menu-item" />
        </>
      )}
      {isDemo && demoUsers?.length > 1 && (
        <>
          <hr />
          <div className="menu-head">{own ? 'Switch user' : 'Switch demonstration user (see the app as each role)'}</div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {demoUsers.filter((u) => u.id !== user.id).map((u) => <button key={u.id} type="button" data-close onClick={() => switchTo(u.id)}><Avatar name={u.name} size="sm" /><span className="grow"><span style={{ display: 'block' }}>{u.name}</span><span className="tiny muted">{u.title}</span></span></button>)}
          </div>
        </>
      )}
      <hr />
      <button type="button" data-close onClick={() => navigate('/help')}><Icon name="question" />Help and glossary</button>
      <button type="button" data-close onClick={signOut}><Icon name="logout" />Sign out</button>
    </Popover>
  );
}
