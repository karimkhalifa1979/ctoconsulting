import { useEffect, useState } from 'react';
import { demoMode } from '../config.js';
import { fmtAgo } from '../lib/format.js';

const ICONS = {
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4Z',
  saved: 'M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8 12h10v-2H8v2Zm0 4h10v-2H8v2Zm0 4h7v-2H8v2Z',
  proposals: 'M4 4h6l2 2h8v14H4V4Zm2 4v10h12V8H6Zm2 2h8v2H8v-2Zm0 4h5v2H8v-2Z',
  resumes: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z',
};

export default function Layout({ route, user, onSignOut, onResetDemo, counts, location, changeCount, saving, onSave, onDiscard, children }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route]);
  const nav = [
    { group: 'Proposals', items: [
      ['new-proposal', 'New proposal', ICONS.plus, null],
      ['saved-proposals', 'Saved proposals', ICONS.saved, [counts.saved, 'saved proposals']],
    ] },
    { group: 'Library', items: [
      ['proposals', 'Proposal library', ICONS.proposals, [counts.proposals, 'files selected']],
      ['resumes', 'Active resumes', ICONS.resumes, [counts.resumes, 'active resumes']],
    ] },
  ];
  const activeId = route === 'proposal' ? 'saved-proposals' : route;
  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden>CTO</div>
          <div className="brand-text"><strong>CTO Consulting</strong><span>Proposal Library</span></div>
        </div>
        <nav className="nav">
          {nav.map((g) => (
            <div key={g.group}>
              <div className="nav-label">{g.group}</div>
              {g.items.map(([id, label, icon, count]) => (
                <a key={id} href={`#/${id}`} className={`${activeId === id ? 'active' : ''} ${id === 'new-proposal' ? 'nav-cta' : ''}`} aria-current={activeId === id ? 'page' : undefined}>
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={icon} /></svg>
                  <span className="nav-text">{label}</span>
                  {count && <span className="nav-count" title={`${count[0]} ${count[1]}`}>{count[0]}</span>}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          {demoMode && <div className="demo-pill">Demo mode · sample data</div>}
          {demoMode && onResetDemo && <button className="link-btn" onClick={onResetDemo}>Reset demo</button>}
          <div className="foot-row"><span className="muted-inv">Signed in as</span> {user}</div>
          <div className="foot-row"><span className="muted-inv">Selections saved to</span> <span className="path">{location || '…'}</span></div>
          {onSignOut && <button className="link-btn" onClick={onSignOut}>Sign out</button>}
          <div className="foot-row copy">© CTO Consulting · <a href="https://www.ctoconsulting.com.au" target="_blank" rel="noreferrer">ctoconsulting.com.au</a></div>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
          <div className="spacer" />
          {changeCount > 0 ? (
            <div className="savebar" role="status">
              <span><b>{changeCount}</b> unsaved selection change{changeCount === 1 ? '' : 's'}</span>
              <button className="btn btn-sm" onClick={onDiscard} disabled={saving.busy}>Discard</button>
              <button className="btn btn-sm btn-primary" onClick={onSave} disabled={saving.busy}>{saving.busy ? 'Saving…' : 'Save selections'}</button>
            </div>
          ) : (
            (route === 'proposals' || route === 'resumes') && <span className="muted small" role="status">{saving.at ? `Saved ${fmtAgo(saving.at)}` : 'All selections saved'}</span>
          )}
        </header>
        {saving.error && <div className="alert alert-error content-alert">Save failed: {saving.error}</div>}
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
