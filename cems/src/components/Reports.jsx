// Generated report archive (RPT-047): filters by engagement, project, type, status, audience and
// period, with downloads of the issued PDF and Word files.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { get } from '../lib/api.js';
import { Card, Table, Status, Badge, D, DT, ErrorBox, Loading } from './ui.jsx';
import Icon from './Icon.jsx';

const STATUSES = ['Draft', 'In review', 'Approved', 'Issued', 'Superseded', 'Withdrawn'];
const TYPES = ['Weekly status', 'Steering committee', 'Monthly financial', 'Exception', 'End stage', 'End project', 'PID', 'Change request'];

export const reportFile = (id, kind, draft) => `/api/reports/${id}/file/${kind}${draft ? `?draft=${draft}` : ''}`;

export function ReportList({ engagementId, projectId, title = 'Reports', sub, showEngagement = !engagementId, actions }) {
  const [f, setF] = useState({ report_type: '', status: '', audience: '', from: '', to: '', q: '' });
  const list = useApi('/api/reports', { engagement_id: engagementId, project_id: projectId, ...f });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title={title} sub={sub} flush actions={actions}>
      <div className="card-body">
        <div className="filters">
          <input type="search" placeholder="Search by file name" value={f.q} onChange={set('q')} />
          <select value={f.report_type} onChange={set('report_type')} aria-label="Report type"><option value="">All types</option>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <select value={f.status} onChange={set('status')} aria-label="Status"><option value="">All statuses</option>{STATUSES.map((t) => <option key={t}>{t}</option>)}</select>
          <select value={f.audience} onChange={set('audience')} aria-label="Audience"><option value="">Client and internal</option><option value="client">Client</option><option value="internal">Internal</option></select>
          <label className="small">From <input type="date" value={f.from} onChange={set('from')} /></label>
          <label className="small">To <input type="date" value={f.to} onChange={set('to')} /></label>
        </div>
        {list.error ? <ErrorBox error={list.error} retry={list.reload} /> : list.loading && !list.data ? <Loading /> : (
          <Table rows={list.data || []} initialSort={{ key: 'period_end', dir: -1 }} empty="No reports match." columns={[
            { key: 'name', label: 'Report', render: (r) => <Link to={`/reports/${r.id}`} className="strong">{r.name}</Link> },
            showEngagement && { key: 'engagement', label: 'Engagement', render: (r) => <Link to={`/engagements/${r.engagement_id}/reports`}>{r.engagement}</Link> },
            { key: 'report_type', label: 'Type' },
            { key: 'period_end', label: 'Week ending', render: (r) => <D v={r.period_end} /> },
            { key: 'audience', label: 'Audience', render: (r) => <Badge tone={r.audience === 'internal' ? 'gold' : ''}>{r.audience === 'internal' ? 'Internal' : 'Client'}</Badge> },
            { key: 'version', label: 'Version', num: true, render: (r) => `v${r.version}${r.drafts > 1 && r.status !== 'Issued' ? ` · draft ${r.drafts}` : ''}` },
            { key: 'status', label: 'Status', render: (r) => <span className="flex"><Status v={r.status} />{r.warnings > 0 && <span title="Generated with readiness warnings"><Icon name="alert" size={13} /></span>}</span> },
            { key: 'issued_at', label: 'Issued', sort: (r) => r.issued_at || '', render: (r) => (r.issued_at ? <DT v={r.issued_at} /> : <span className="muted">—</span>) },
            { key: 'files', label: 'Files', sort: false, render: (r) => (
              <span className="flex" onClick={(e) => e.stopPropagation()}>
                {r.files?.pdf && <a className="btn btn-xs" href={reportFile(r.id, 'pdf')}>PDF</a>}
                {r.files?.docx && <a className="btn btn-xs" href={reportFile(r.id, 'docx')}>Word</a>}
              </span>
            ) },
          ].filter(Boolean)} />
        )}
      </div>
    </Card>
  );
}

const PRINT_CSS = `@page { size: A4; margin: 18mm 16mm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.4; color: #1b2430; }
h1, .doc-title { font-size: 20pt; color: #0b1f3a; margin: 0 0 8pt; }
h2 { font-size: 14pt; color: #0b1f3a; margin: 16pt 0 6pt; page-break-after: avoid; }
h3 { font-size: 12pt; margin: 12pt 0 4pt; page-break-after: avoid; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 9pt; page-break-inside: auto; }
tr { page-break-inside: avoid; }
td, th { border: 1px solid #cfd6df; padding: 3pt 5pt; vertical-align: top; }
img { max-width: 100%; height: auto; }`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Prints a report from its Word rendering, so a PDF can be saved where LibreOffice is not
// installed (always the case in the offline edition).
export async function printReport(id, title) {
  const { html } = await get(`/api/reports/${id}/html`);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  frame.srcdoc = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${html}</body></html>`;
  document.body.appendChild(frame);
  await new Promise((resolve) => { frame.onload = resolve; });
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 60_000);
}
