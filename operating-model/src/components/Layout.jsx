import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { Toast } from './ui.jsx';
import { engagementTitle } from '../lib/model.js';
import { isScored } from '../lib/calc.js';

const P = {
  home: 'M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4v-9.5Z',
  dash: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  flag: 'M5 3h2v18H5V3Zm3 1h10l-2 4 2 4H8V4Z',
  people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6H2Zm15 0c0-1.9-.7-3.6-1.9-4.9.6-.1 1.2-.1 1.9-.1 2.8 0 5 1.8 5 5h-5Z',
  chat: 'M4 4h16v12H8l-4 4V4Zm4 5h8V7H8v2Zm0 4h6v-2H8v2Z',
  doc: 'M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8 12h10v-2H8v2Zm0 4h10v-2H8v2Zm0 4h7v-2H8v2Z',
  cap: 'M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z',
  flow: 'M3 5h6v4H3V5Zm12 0h6v4h-6V5ZM9 15h6v4H9v-4ZM9 7h6v2H9V7Zm2 2h2v6h-2V9Z',
  org: 'M10 2h4v4h-1v3h6v4h1v4h-4v-4h1v-2h-5v2h1v4h-4v-4h1v-2H6v2h1v4H3v-4h1v-4h6V6h0V6h-0V2Z',
  key: 'M14 2a6 6 0 0 0-5.7 7.9L2 16.2V22h5.8v-2.3h2.3v-2.3h2.3l1.8-1.8A6 6 0 1 0 14 2Zm2 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
  app: 'M4 4h16v12H4V4Zm2 2v8h12V6H6Zm-3 12h18v2H3v-2Z',
  truck: 'M2 5h12v10h1.2a3 3 0 0 1 5.6 0H22v-5l-3-4h-4V5H2Zm0 10h1.2a3 3 0 0 1 5.6 0H13V15H2Zm4 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  pin: 'M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z',
  dollar: 'M11 2h2v2.1c2.3.4 4 2 4 4.4h-2.2c0-1.3-1.2-2.3-2.8-2.3s-2.8.8-2.8 2c0 1.3 1.1 1.7 3.1 2.2 2.6.6 4.9 1.5 4.9 4.4 0 2.3-1.7 3.8-4.2 4.1V21h-2v-2.1c-2.5-.4-4.3-2.1-4.3-4.6h2.2c0 1.5 1.3 2.5 3.1 2.5 1.9 0 3-.9 3-2.2 0-1.4-1.2-1.8-3.3-2.3-2.4-.6-4.7-1.4-4.7-4.2 0-2.1 1.6-3.7 4-4V2Z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z',
  ai: 'M12 2 9.5 8.5 3 11l6.5 2.5L12 20l2.5-6.5L21 11l-6.5-2.5L12 2Zm7 13-1 2.5-2.5 1 2.5 1L19 22l1-2.5 2.5-1-2.5-1L19 15Z',
  alert: 'M12 2 1 21h22L12 2Zm1 15h-2v-2h2v2Zm0-4h-2V9h2v4Z',
  target: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8Zm0-14a6 6 0 1 0 6 6 6 6 0 0 0-6-6Zm0 10a4 4 0 1 1 4-4 4 4 0 0 1-4 4Zm0-6a2 2 0 1 0 2 2 2 2 0 0 0-2-2Z',
  list: 'M4 6h2V4H4v2Zm4 0h12V4H8v2ZM4 13h2v-2H4v2Zm4 0h12v-2H8v2Zm-4 7h2v-2H4v2Zm4 0h12v-2H8v2Z',
  road: 'M3 4h4v16H3V4Zm14 0h4v16h-4V4Zm-6 1h2v3h-2V5Zm0 5h2v4h-2v-4Zm0 6h2v3h-2v-3Z',
  scale: 'M11 3h2v2h6l-3 7a3.5 3.5 0 0 0 7 0l-3-7h-1V3h-2v2H11V3Zm7 4.5L19.9 12h-3.8L18 7.5ZM6 5l-3 7a3.5 3.5 0 0 0 7 0L7 5H6Zm.5 2.5L8.4 12H4.6l1.9-4.5ZM11 7h2v12h4v2H7v-2h4V7Z',
  report: 'M5 3h14v18H5V3Zm3 14h2v-5H8v5Zm3 0h2V8h-2v9Zm3 0h2v-3h-2v3Z',
  book: 'M4 4a2 2 0 0 1 2-2h14v17H6a1 1 0 0 0 0 2h14v2H6a3 3 0 0 1-3-3V4h1Zm3 1v2h9V5H7Z',
};
const Icon = ({ d }) => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={d} /></svg>;

function navGroups(e) {
  const pctScored = e ? Math.round((e.questions.filter(isScored).length / Math.max(1, e.questions.length)) * 100) : 0;
  return [
    { group: 'Overview', items: [['/', 'Engagements', P.home], ['/dashboard', 'Dashboard', P.dash]] },
    { group: '1 · Mobilise', items: [['/engagement', 'Engagement setup', P.flag]] },
    { group: '2 · Plan', items: [['/stakeholders', 'Stakeholders', P.people, e?.stakeholders.length], ['/interviews', 'Interview guides', P.chat], ['/documents', 'Document requests', P.doc]] },
    {
      group: '3 · Discover', items: [
        ['/capabilities', 'Capabilities', P.cap], ['/processes', 'Processes', P.flow], ['/organisation', 'Org structure', P.org],
        ['/decisions', 'Decision rights', P.key], ['/applications', 'Applications', P.app, e?.applications.length], ['/suppliers', 'Suppliers', P.truck, e?.suppliers.length],
        ['/locations', 'Locations', P.pin, e?.locations.length], ['/costs', 'Cost baseline', P.dollar],
      ],
    },
    { group: '4 · Assess', items: [['/assessment', 'Maturity assessment', P.check, `${pctScored}%`], ['/ai', 'AI readiness', P.ai], ['/findings', 'Findings', P.alert, e?.findings.length]] },
    { group: '5 · Design', items: [['/tom', 'TOM designer', P.target], ['/recommendations', 'Recommendations', P.list, e?.recommendations.length], ['/transition', 'Transition & change', P.road]] },
    { group: '6 · Business case', items: [['/benefits', 'Benefits & costs', P.dollar, e?.initiatives.length]] },
    { group: '7 · Compare & report', items: [['/compare', 'Current vs target', P.scale], ['/report', 'Report (PDF)', P.report]] },
    { group: 'Reference', items: [['/reference', 'Framework & lists', P.book]] },
  ];
}

export default function Layout() {
  const { index, eng, open, saved, undo, canUndo, toast, clearToast, storage } = useStore();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => { setMenu(false); window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <div className="shell">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <NavLink to="/" className="brand">
          <div className="brand-mark" aria-hidden>CTO</div>
          <div className="brand-text"><strong>CTO Consulting</strong><span>Operating Model Assessment</span></div>
        </NavLink>
        <nav className="nav">
          {navGroups(eng).map((g) => (
            <div key={g.group}>
              <div className="nav-label">{g.group}</div>
              {g.items.map(([to, label, icon, pill]) => (
                <NavLink key={to} to={to} end={to === '/'}>
                  <Icon d={icon} />{label}
                  {pill !== undefined && pill !== 0 && pill !== '' && <span className="pill">{pill}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div>Digital Transformation Specialists</div>
          <div style={{ marginTop: 4 }}>© CTO Consulting · <a href="https://www.ctoconsulting.com.au" target="_blank" rel="noreferrer">ctoconsulting.com.au</a></div>
          <div style={{ marginTop: 4 }}>Data is stored in this browser{storage === 'memory' ? ' (session only)' : ''}.</div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar no-print">
          <button className="btn menu-btn" onClick={() => setMenu(!menu)} aria-label="Menu">☰</button>
          <div className="eng-switch">
            <label htmlFor="eng-select">Engagement</label>
            <select id="eng-select" value={eng?.id || ''} onChange={(ev) => open(ev.target.value)}>
              {index.map((i) => <option key={i.id} value={i.id}>{i.client || i.name || 'Untitled engagement'}{i.kind === 'demo' ? ' (demo)' : ''}</option>)}
            </select>
          </div>
          <div className="spacer" />
          <span className={`save-state hide-sm ${saved ? '' : 'pending'}`}><i />{saved ? 'Saved' : 'Saving…'}</span>
          <button className="btn btn-sm hide-sm" onClick={undo} disabled={!canUndo} title="Undo the last change">↶ Undo</button>
          <button className="btn btn-sm btn-primary" onClick={() => nav('/report')} title={`Report for ${engagementTitle(eng)}`}>Report PDF</button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      {toast && <Toast key={toast.id} text={toast.text} onDone={clearToast} />}
    </div>
  );
}
