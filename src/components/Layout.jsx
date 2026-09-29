import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../lib/store.jsx';
import { aiStatus } from '../lib/ai.js';

const I = {
  dash: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  org: 'M4 21V5l8-3 8 3v16h-6v-5h-4v5H4Zm4-12h2V7H8v2Zm0 4h2v-2H8v2Zm6-4h2V7h-2v2Zm0 4h2v-2h-2v2Z',
  search: 'M10 2a8 8 0 0 1 6.32 12.9l5.39 5.4-1.41 1.4-5.4-5.39A8 8 0 1 1 10 2Zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z',
  list: 'M4 6h2V4H4v2Zm4 0h12V4H8v2ZM4 13h2v-2H4v2Zm4 0h12v-2H8v2Zm-4 7h2v-2H4v2Zm4 0h12v-2H8v2Z',
  doc: 'M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8 12h10v-2H8v2Zm0 4h10v-2H8v2Zm0 4h7v-2H8v2Z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z',
  report: 'M5 3h14v18H5V3Zm3 14h2v-5H8v5Zm3 0h2V8h-2v9Zm3 0h2v-3h-2v3Z',
  trace: 'M4 6a2 2 0 1 1 4 0 2 2 0 0 1-4 0Zm12 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0ZM10 18a2 2 0 1 1 4 0 2 2 0 0 1-4 0ZM7.5 7.5l3.6 8.3M16.5 7.5l-3.6 8.3M8 6h8',
  pen: 'M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25ZM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z',
  cal: 'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm-2 8h14v10H5V10Zm2 2v2h2v-2H7Zm4 0v2h2v-2h-2Zm4 0v2h2v-2h-2Z',
  table: 'M3 4h18v16H3V4Zm2 2v3h6V6H5Zm8 0v3h6V6h-6Zm-8 5v3h6v-3H5Zm8 0v3h6v-3h-6Zm-8 5v2h6v-2H5Zm8 0v2h6v-2h-6Z',
};
const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" fill={d === I.trace ? 'none' : 'currentColor'} stroke={d === I.trace ? 'currentColor' : 'none'} strokeWidth="1.8" aria-hidden><path d={d} /></svg>
);

const NAV = [
  { group: 'Overview', items: [['/dashboard', 'Dashboard', I.dash], ['/organisations', 'Organisations', I.org], ['/discover', 'Discover obligations', I.search]] },
  { group: 'Register', items: [['/obligations', 'Obligations', I.list], ['/requirements', 'Policy requirements', I.doc], ['/traceability', 'Traceability', I.trace], ['/register', 'Register explorer', I.table]] },
  { group: 'Assurance', items: [['/assessment', 'Control assessment', I.check], ['/report', 'Assessment report', I.report], ['/calendar', 'Regulatory calendar', I.cal]] },
  { group: 'Authoring', items: [['/policy', 'Policy author', I.pen]] },
];

export default function Layout() {
  const { orgs, org, selectOrg } = useApp();
  const [open, setOpen] = useState(false);
  const [ai, setAi] = useState(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => { aiStatus().then(setAi); }, []);

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden>CTO</div>
          <div className="brand-text"><strong>CTO Consulting</strong><span>Regulatory Assessment</span></div>
        </div>
        <nav className="nav">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="nav-label">{g.group}</div>
              {g.items.map(([to, label, icon]) => (
                <NavLink key={to} to={to}><Icon d={icon} />{label}</NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div>AI research: {ai === null ? '…' : ai.ai ? <span style={{ color: '#7ee2c4' }}>enabled</span> : 'rules engine'}</div>
          <div style={{ marginTop: 6 }}>© CTO Consulting · <a href="https://www.ctoconsulting.com.au" target="_blank" rel="noreferrer">ctoconsulting.com.au</a></div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar no-print">
          <button className="btn menu-btn" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
          <div className="org-switch">
            <label htmlFor="org-select">Organisation</label>
            <select id="org-select" value={org?.id || ''} onChange={(e) => selectOrg(e.target.value)}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="spacer" />
          <NavLink to="/discover" className="btn btn-primary" aria-label="New organisation">+<span className="new-org-label"> New organisation</span></NavLink>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
