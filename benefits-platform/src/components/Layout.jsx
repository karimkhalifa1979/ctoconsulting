import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/store.jsx';
import { aiStatus } from '../lib/ai.js';

const I = {
  dash: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  me: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5Z',
  bulb: 'M9 21h6v-2H9v2Zm3-19a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z',
  target: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  folder: 'M3 5h7l2 2h9v12H3V5Z',
  dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2.5 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM7.5 15a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  doc: 'M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8 12h10v-2H8v2Zm0 4h10v-2H8v2Zm0 4h7v-2H8v2Z',
  plot: 'M4 20h17v-2H6V3H4v17Zm5-5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm5-4a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm4 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  chart: 'M5 3h14v18H5V3Zm3 14h2v-5H8v5Zm3 0h2V8h-2v9Zm3 0h2v-3h-2v3Z',
  scale: 'M12 3 2 8h20L12 3Zm-8 7v8h3v-8H4Zm6 0v8h4v-8h-4Zm7 0v8h3v-8h-3ZM2 20h20v2H2v-2Z',
  net: 'M5 5a2 2 0 1 1 0 .01ZM19 5a2 2 0 1 1 0 .01ZM12 19a2 2 0 1 1 0 .01ZM6.5 6.5l4.5 11M17.5 6.5 13 17.5M7 5h10',
  gate: 'M4 21V7l8-4 8 4v14h-5v-6H9v6H4Z',
  office: 'M4 21V3h10v4h6v14H4Zm3-14h2V5H7v2Zm0 4h2V9H7v2Zm0 4h2v-2H7v2Zm4-8h2V5h-2v2Zm0 4h2V9h-2v2Zm0 4h2v-2h-2v2Zm5 0h2v-2h-2v2Zm0-4h2V9h-2v2Z',
  ruler: 'M3 17 17 3l4 4L7 21l-4-4Zm4-1 1.5-1.5M10 13l1.5-1.5M13 10l1.5-1.5',
  book: 'M5 3h11a3 3 0 0 1 3 3v15H8a3 3 0 0 1-3-3V3Zm3 15h9V6a1 1 0 0 0-1-1H7v12.2A1 1 0 0 0 8 18Z',
  gauge: 'M12 4a10 10 0 0 0-8.66 15h17.32A10 10 0 0 0 12 4Zm1 9.73V8h-2v5.73a2 2 0 1 0 2 0Z',
  cog: 'M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.3 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.3-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5-2.1-1.6ZM13 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z',
  help: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 16h-2v-2h2v2Zm2.1-7.7-.9.9A3.4 3.4 0 0 0 13 14h-2v-.5a4 4 0 0 1 1.2-2.8l1.2-1.3A2 2 0 1 0 10 8H8a4 4 0 1 1 7.1 2.3Z',
};
const STROKE = new Set([I.net, I.ruler]);
const Icon = ({ d }) => <svg viewBox="0 0 24 24" fill={STROKE.has(d) ? 'none' : 'currentColor'} stroke={STROKE.has(d) ? 'currentColor' : 'none'} strokeWidth="1.8" aria-hidden><path d={d} /></svg>;

const NAV = [
  { group: 'Overview', items: [['/dashboard', 'Portfolio dashboard', I.dash], ['/my', 'My accountabilities', I.me]] },
  { group: 'Investments', items: [['/ideas', 'Ideas and intake', I.bulb], ['/programs', 'Programs and projects', I.folder], ['/strategy', 'Strategy and alignment', I.target]] },
  { group: 'Value', items: [['/simulation', 'Simulation lab', I.dice], ['/business-case', 'Business case builder', I.doc], ['/value-plots', 'Value plots', I.plot], ['/benefits', 'Benefits realisation', I.chart]] },
  { group: 'Portfolio', items: [['/selection', 'Selection workbench', I.scale], ['/dependencies', 'Dependencies and capacity', I.net]] },
  { group: 'Governance', items: [['/governance', 'Gates and board', I.gate], ['/vmo', 'Value office workspace', I.office], ['/measures', 'Measure library', I.ruler], ['/learning', 'Lessons and audit', I.book], ['/maturity', 'Maturity diagnostic', I.gauge]] },
  { group: 'Configure', items: [['/settings', 'Settings and data', I.cog], ['/guide', 'Method guide', I.help]] },
];

export default function Layout() {
  const { list, ws, storageOk, switchWorkspace, setMe } = useApp();
  const [open, setOpen] = useState(false);
  const [ai, setAi] = useState(null);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => { aiStatus().then(setAi); }, []);

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden>CTO</div>
          <div className="brand-text"><strong>CTO Consulting</strong><span>Benefits Realisation</span></div>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="nav-label">{g.group}</div>
              {g.items.map(([to, label, icon]) => <NavLink key={to} to={to}><Icon d={icon} />{label}</NavLink>)}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          {import.meta.env.VITE_OFFLINE
            ? <div>Offline edition · data is saved in this browser</div>
            : <div>AI assistance: {ai === null ? '…' : ai.ai && ws.settings.ai ? <span style={{ color: '#7ee2c4' }}>available</span> : 'off (rules only)'}</div>}
          <div style={{ marginTop: 6 }}>© CTO Consulting · <a href="https://www.ctoconsulting.com.au" target="_blank" rel="noreferrer">ctoconsulting.com.au</a></div>
        </div>
      </aside>
      {open && <div className="overlay no-print" style={{ zIndex: 70 }} onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="topbar no-print">
          <button className="btn menu-btn" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
          <div className="org-switch">
            <label htmlFor="ws-select">Organisation</label>
            <select id="ws-select" value={ws.id} onChange={(e) => switchWorkspace(e.target.value)}>
              {(list || []).map((w) => <option key={w.id} value={w.id}>{w.name}{w.kind === 'demo' ? ' (demo)' : ''}</option>)}
            </select>
          </div>
          <div className="spacer" />
          <div className="who">
            <label htmlFor="me-select">Viewing as</label>
            <select id="me-select" value={ws.currentUser || ''} onChange={(e) => setMe(e.target.value)}>
              {ws.people.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.roles?.[0] || p.position}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={() => nav('/ideas?new=1')} aria-label="Propose an idea">+<span className="new-org-label"> Propose idea</span></button>
        </header>
        <main className="content">
          {!storageOk && <div className="callout warn no-print" role="alert" style={{ marginBottom: 16 }}><strong>This browser is not saving your changes.</strong> It has blocked storage for this page, so work is lost when the tab closes. Download a backup from <Link to="/settings">Settings → Data</Link> before closing, or open the app in Chrome or Edge.</div>}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
