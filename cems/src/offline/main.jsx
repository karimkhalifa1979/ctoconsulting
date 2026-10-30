// Entry point of the offline edition: starts the CEMS server inside the page, then the web client.
// Routing uses the URL hash because the page is opened straight from disk.
import './globals.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from '../App.jsx';
import { SessionProvider } from '../lib/session.jsx';
import { ToastProvider, DialogProvider } from '../components/ui.jsx';
import { setTransport, openApiFile } from '../lib/api.js';
import { boot, transport, reset, backup, restore } from './runtime.js';
import '../styles/app.css';

const root = createRoot(document.getElementById('root'));

function Starting({ status }) {
  const pct = status.progress != null ? Math.round(status.progress * 100) : null;
  return (
    <div className="boot">
      <div className="boot-card">
        <div className="brand-mark">CTO</div>
        <h1>CEMS</h1>
        <p className="muted">Consulting Engagement Management System · offline edition</p>
        <p className="strong mt-3">{status.phase}…</p>
        {pct != null && (
          <>
            <div className="meter"><span style={{ width: `${pct}%` }} /></div>
            <p className="tiny muted mt-1">{pct}%{status.label ? ` · ${status.label}` : ''}</p>
          </>
        )}
        {status.phase.startsWith('Creating') || status.phase.startsWith('Replaying') ? (
          <p className="small muted mt-3">The first start builds a demo consulting firm in this browser: five engagements with timesheets, status updates, forecasts, invoices and reports, up to today. It takes about a minute and happens once.</p>
        ) : null}
      </div>
    </div>
  );
}

function Failed({ error }) {
  return (
    <div className="boot">
      <div className="boot-card">
        <h1>CEMS could not start</h1>
        <p className="mt-2">{error.message}</p>
        <p className="small muted mt-2">Use a current version of Chrome, Edge, Firefox or Safari. If the problem continues, clear the data this page keeps in the browser and start again.</p>
        <button className="btn btn-danger mt-3" onClick={() => reset()}>Clear CEMS data and start again</button>
      </div>
    </div>
  );
}

// Links to API files (report downloads, attachments, analytics feeds) are produced in the page.
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href^="/api/"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  const href = a.getAttribute('href');
  openApiFile(href, { newTab: a.target === '_blank' || /[?&]inline=1/.test(href) });
}, true);

root.render(<Starting status={{ phase: 'Starting' }} />);
boot((status) => root.render(<Starting status={status} />))
  .then((info) => {
    setTransport(transport, Object.assign(info, { backup, restore, reset }));
    root.render(
      <StrictMode>
        <HashRouter>
          <SessionProvider>
            <ToastProvider>
              <DialogProvider>
                <App />
              </DialogProvider>
            </ToastProvider>
          </SessionProvider>
        </HashRouter>
      </StrictMode>,
    );
  })
  .catch((error) => {
    console.error(error);
    root.render(<Failed error={error} />);
  });
