import { useEffect, useState } from 'react';
import { useP } from '../../lib/store.jsx';
import { platformInfo } from '../../lib/ai.js';
import { PageHead, Card } from '../../../components/ui.jsx';

// Integrations (spec section 13): what is connected in this deployment and how each one is configured.
export default function Integrations() {
  const { mode, view } = useP();
  const [info, setInfo] = useState(null);
  useEffect(() => { platformInfo(true).then(setInfo); }, []);
  const server = mode === 'server';
  const rows = [
    { name: 'Microsoft Entra ID', what: 'Single sign-on with MFA; roles can be mapped from Entra groups.', on: server && info?.server, how: 'Register an app in Entra ID and set ENTRA_TENANT_ID, ENTRA_CLIENT_ID and ENTRA_CLIENT_SECRET on the server. Until then the server uses demonstration sign-in.' },
    { name: 'Anthropic Claude API', what: 'Drafting, extraction, storyboards and other AI actions, grounded in approved content with citations.', on: info?.claude, detail: info?.claude ? `Model ${info.model}` : 'Offline engines in use', how: 'Set ANTHROPIC_API_KEY on the server. Use an in-country endpoint or zero-retention terms where clients require it.' },
    { name: 'Semantic search (embeddings)', what: 'Library retrieval for drafting and search.', on: true, detail: info?.embeddings ? 'Vector embeddings' : 'Built-in lexical search with synonym expansion', how: 'An embeddings provider can be configured on the server; the built-in index works without one.' },
    { name: 'PDF and PDF/A rendering', what: 'Renders outputs with LibreOffice and counts pages on the rendered PDF (WD-08).', on: info?.pdf, how: 'Install LibreOffice on the server host (soffice on the PATH).' },
    { name: 'OCR for scanned requests', what: 'Reads scanned PDFs during intake.', on: info?.ocr, how: 'Install Tesseract on the server host.' },
    { name: 'Microsoft Graph email', what: 'Notification emails and the daily digest (WF-11).', on: false, detail: `${view.counts.outbox} messages in the outbox`, how: 'Grant Mail.Send to the Entra app and set GRAPH_SENDER. Messages queue in the outbox until then.' },
    { name: 'Microsoft Teams', what: 'Approval cards and mentions; approve from the card (WF-12).', on: view.settings.teamsEnabled && false, detail: view.settings.teamsEnabled ? 'Cards are generated and queued in the outbox' : 'Switched off in settings', how: 'Configure an incoming webhook or bot for the Teams channel and set TEAMS_WEBHOOK_URL.' },
    { name: 'SharePoint', what: 'Import existing library folders (CL-01).', on: false, detail: 'ZIP export import available now', how: 'Grant Sites.Read.All to the Entra app. Meanwhile, export a folder as ZIP and use Library → Bulk import.' },
    { name: 'CRM', what: 'Create bids from CRM opportunities and write back outcomes.', on: false, how: 'Configure the CRM connector (for example Dynamics 365 or Salesforce) on the server.' },
    { name: 'Calendars (.ics)', what: 'Back-scheduled milestones and key dates export to Outlook or Google Calendar (WF-13).', on: true, detail: 'Available on every bid’s overview' },
  ];
  return (
    <div className="stack">
      <PageHead eyebrow="Administration" title="Integrations">Mode: {server ? 'platform server' : 'browser storage (demonstration)'}. Secrets are set as server environment variables and never stored in the browser.</PageHead>
      <Card pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Integration</th><th>Purpose</th><th>Status</th><th>Configuration</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.name}><td className="strong">{r.name}</td><td className="small">{r.what}</td><td><span className={`pill ${r.on ? 'good' : ''}`}>{r.on ? 'Connected' : 'Not connected'}</span>{r.detail && <div className="mini">{r.detail}</div>}</td><td className="small">{r.how || '—'}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
