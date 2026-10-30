// Integrations and API (ADM-009, INT-001 to INT-010): what is connected and how to set it up, API clients
// for other systems and BI tools (INT-007, RPT-005), webhooks for key events (INT-008), and recent
// integration activity. Credentials are held by the server, not in configuration (ADM-009).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, Empty, Badge, Spinner, Modal } from '../../ui/core.jsx';
import { useApp, useDialog, useToast } from '../../state/app.jsx';
import { fmtDateTime } from '../../lib/format.js';
import { ENTITIES } from '../../../shared/schema.js';
import { asArray, sortBy } from '../../../shared/util.js';

export default function Integrations() {
  const { mode, features } = useApp();
  const server = mode === 'server';
  const status = (on, label = on ? 'Connected' : 'Not configured') => <Badge tone={on ? 'good' : ''} icon={on ? 'checkCircle' : undefined}>{label}</Badge>;
  const needsServer = <Badge>Needs the server</Badge>;
  const cards = [
    { id: 'sso', title: 'Single sign-on', req: 'INT-001, SEC-01', state: server ? status(features.sso) : needsServer, text: 'Sign-in through the organisation\'s identity provider using OpenID Connect (for example Microsoft Entra ID), with multi-factor authentication enforced there. Groups in the identity provider can map to workbench roles.', how: 'Set OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and OIDC_REDIRECT_URI on the server; OIDC_ROLE_CLAIM and OIDC_ROLE_MAP map identity-provider groups to roles, and OIDC_JIT creates accounts on first sign-in.' },
    { id: 'hr', title: 'HR system and directory', req: 'INT-002', state: <Badge tone="info">Import and API</Badge>, text: 'People and organisational structure come from the HR system or directory. The server synchronises an HR extract every night, updating positions, managers and business units and flagging leavers, whose future engagements are raised for reassignment. Extracts can also be imported by hand under Stakeholders › Import, or posted to the stakeholder API.', how: 'Set CMW_HR_SYNC_FILE to the path of the CSV extract the HR system writes.', link: ['/stakeholders?tab=import', 'Open the stakeholder import'] },
    { id: 'm365', title: 'Microsoft 365', req: 'INT-003', state: server ? <Badge tone="info">Calendar invitations available</Badge> : <Badge tone="info">Calendar invitations</Badge>, text: 'Every planned engagement can be sent as an Outlook calendar invitation (.ics) from the engagement. Teams notifications for approvals, resistance escalations and leavers use a Teams webhook. Approved artefacts can be published to a SharePoint or OneDrive library through a synchronised folder.', how: 'Set TEAMS_WEBHOOK_URL for Teams notifications and CMW_PUBLISH_DIR for publishing to a synchronised SharePoint folder.' },
    { id: 'project', title: 'Project and work management tools', req: 'INT-004', state: <Badge tone="info">Milestone import</Badge>, text: 'Releases and milestones can be imported from Microsoft Project (XML) or as CSV exported from Jira, Azure DevOps or Smartsheet, in each initiative\'s Definition and success area. Engagements and activities set relative to a milestone move when it changes.' },
    { id: 'lms', title: 'Learning management system', req: 'INT-005', state: <Badge tone="info">Completion import</Badge>, text: 'Course enrolments, attendance and completions are imported as a CSV extract in each initiative\'s Training area, matched to stakeholders by email or employee number.' },
    { id: 'survey', title: 'Survey tool', req: 'INT-006', state: <Badge tone="good">Built in</Badge>, text: 'ADKAR, readiness and pulse surveys run in the workbench with anonymous links and small-group suppression. Results from an external tool can be recorded as assessments.' },
    { id: 'email', title: 'Email', req: 'WFL-003', state: server ? status(features.email) : needsServer, text: 'Notifications by email for people who choose them, sent through the organisation\'s mail relay.', how: 'Set SMTP_URL (for example smtp://relay.example.gov.au:25) and MAIL_FROM on the server.' },
    { id: 'ai', title: 'AI assistance', req: 'AIA-001 to AIA-007', state: server ? status(features.ai, features.ai ? 'Available' : 'Not configured') : needsServer, text: 'Drafting and summarising through an approved AI service. Sensitive fields are never sent, outputs are marked as AI-drafted until a person accepts them, and every prompt and output is logged. The organisation\'s data is not used to train models.', how: 'Set ANTHROPIC_API_KEY on the server (CLAUDE_INFERENCE_GEO keeps processing in an approved region), then turn features on under Settings and thresholds › AI assistance.', link: ['/admin/audit?tab=ai', 'Open the AI log'] },
  ];
  return (
    <div className="stack">
      <div className="grid g-2">
        {cards.map((c) => (
          <Card key={c.id} title={c.title} sub={c.req} actions={c.state}>
            <p className="small" style={{ margin: 0 }}>{c.text}</p>
            {c.how && <p className="small muted" style={{ margin: '8px 0 0' }}><strong>Set-up:</strong> {c.how}</p>}
            {c.link && <Link className="btn btn-sm mt-2" to={c.link[0]}>{c.link[1]}</Link>}
          </Card>
        ))}
      </div>
      <ApiClients />
      <Webhooks />
      <Activity />
    </div>
  );
}

function ApiClients() {
  const { api, mode } = useApp();
  const toast = useToast();
  const dialog = useDialog();
  const [rows, setRows] = useState(null);
  const [created, setCreated] = useState(null);
  const [form, setForm] = useState(null);
  const load = useCallback(() => api.list('apiClient', {}).then((r) => setRows(r.rows)).catch(() => setRows([])), [api]);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    try { const r = await api.createApiClient({ name: form.name, scopes: form.scopes, roles: form.roles }); setCreated(r); setForm(null); load(); } catch (e) { toast.error(e); }
  };
  const revoke = async (c) => {
    if (!(await dialog.confirm({ title: `Revoke ${c.name}`, message: 'Systems using this client can no longer connect.', confirmLabel: 'Revoke', danger: true }))) return;
    try { await api.remove('apiClient', c.id, { reason: 'Revoked by an administrator' }); toast.success('Client revoked'); load(); } catch (e) { toast.error(e); }
  };
  return (
    <Card title="API clients" sub={`Other systems and BI tools connect with OAuth 2.0 client credentials; every call is rate-limited and audited (INT-007). The API is described in OpenAPI 3${mode === 'server' ? ' at /api/v1/openapi.json' : ''}.`} flush
      actions={mode === 'server' ? <button type="button" className="btn btn-sm btn-primary" onClick={() => setForm({ name: '', scopes: ['reporting'], roles: ['portfolio'] })}><Icon name="plus" />Add a client</button> : <Badge>Needs the server</Badge>}>
      {!rows ? <Spinner /> : !rows.length ? <Empty icon="key" title="No API clients">Add a client for each system that reads or writes workbench data.</Empty> : (
        <table className="tbl">
          <thead><tr><th>Client</th><th>Client ID</th><th>Scopes</th><th>Acts as</th><th>Last used</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{sortBy(rows, 'name').map((c) => <tr key={c.id}><td><strong>{c.name}</strong></td><td><code className="small">{c.clientId}</code></td><td className="small">{asArray(c.scopes).join(', ')}</td><td className="small">{asArray(c.roles).join(', ')}</td><td className="small">{c.lastUsedAt ? fmtDateTime(c.lastUsedAt) : 'Never'}</td><td><button type="button" className="btn btn-xs btn-ghost" onClick={() => revoke(c)}>Revoke</button></td></tr>)}</tbody>
        </table>
      )}
      {form && (
        <Modal title="New API client" onClose={() => setForm(null)} footer={<><button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button><button type="button" className="btn btn-primary" disabled={!form.name.trim() || !form.scopes.length} onClick={create}>Create</button></>}>
          <div className="stack">
            <label className="field"><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="For example: Power BI reporting" /></label>
            <fieldset className="fieldset"><legend>Scopes</legend>{[['read', 'Read records'], ['write', 'Create and change records'], ['reporting', 'Reporting feed']].map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={form.scopes.includes(k)} onChange={(e) => setForm({ ...form, scopes: e.target.checked ? [...form.scopes, k] : form.scopes.filter((x) => x !== k) })} /><span>{l}</span></label>)}</fieldset>
            <label className="field"><span>Acts with the access of</span><select value={form.roles[0]} onChange={(e) => setForm({ ...form, roles: [e.target.value] })}><option value="portfolio">Portfolio change manager (read across initiatives)</option><option value="auditor">Auditor (read-only)</option><option value="practitioner">Change practitioner</option></select></label>
          </div>
        </Modal>
      )}
      {created && (
        <Modal title="Client created" onClose={() => setCreated(null)} footer={<button type="button" className="btn btn-primary" onClick={() => setCreated(null)}>I have stored the secret</button>}>
          <p className="small">Store the secret now in the other system's secure vault. It is not shown again.</p>
          <dl className="kv"><dt>Client ID</dt><dd><code>{created.client.clientId}</code></dd><dt>Client secret</dt><dd><code style={{ wordBreak: 'break-all' }}>{created.clientSecret}</code></dd><dt>Token endpoint</dt><dd><code>/api/oauth/token</code></dd></dl>
        </Modal>
      )}
    </Card>
  );
}

function Webhooks() {
  const { api, mode } = useApp();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  const [created, setCreated] = useState(null);
  const events = ENTITIES.webhook.fields.find((f) => f.key === 'events')?.options || [];
  const load = useCallback(() => api.list('webhook', {}).then((r) => setRows(r.rows)).catch(() => setRows([])), [api]);
  useEffect(() => { load(); }, [load]);
  const create = async () => { try { const r = await api.createWebhook({ url: form.url, events: form.events }); setCreated(r); setForm(null); load(); } catch (e) { toast.error(e); } };
  const remove = async (w) => { try { await api.remove('webhook', w.id, { reason: 'Removed by an administrator' }); toast.success('Webhook removed'); load(); } catch (e) { toast.error(e); } };
  return (
    <Card title="Webhooks" sub="Other systems are told about key events as they happen (INT-008). Each delivery is signed so the receiver can check it came from the workbench." flush
      actions={mode === 'server' ? <button type="button" className="btn btn-sm btn-primary" onClick={() => setForm({ url: 'https://', events: ['engagement.completed'] })}><Icon name="plus" />Add a webhook</button> : <Badge>Needs the server</Badge>}>
      {!rows ? <Spinner /> : !rows.length ? <Empty icon="link" title="No webhooks" /> : (
        <table className="tbl">
          <thead><tr><th>Address</th><th>Events</th><th>Last delivery</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{rows.map((w) => <tr key={w.id}><td><code className="small">{w.url}</code></td><td className="small">{asArray(w.events).map((e) => events.find((x) => x.id === e)?.label || e).join(', ')}</td><td className="small">{w.lastStatus || '—'}</td><td><button type="button" className="btn btn-xs btn-ghost" onClick={() => remove(w)}>Remove</button></td></tr>)}</tbody>
        </table>
      )}
      {form && (
        <Modal title="New webhook" onClose={() => setForm(null)} footer={<><button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button><button type="button" className="btn btn-primary" disabled={!/^https:\/\/.+/.test(form.url) || !form.events.length} onClick={create}>Create</button></>}>
          <div className="stack">
            <label className="field"><span>Address (https only)</span><input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
            <fieldset className="fieldset"><legend>Events</legend>{events.map((e) => <label key={e.id} className="check"><input type="checkbox" checked={form.events.includes(e.id)} onChange={(x) => setForm({ ...form, events: x.target.checked ? [...form.events, e.id] : form.events.filter((y) => y !== e.id) })} /><span>{e.label}</span></label>)}</fieldset>
          </div>
        </Modal>
      )}
      {created && (
        <Modal title="Webhook created" onClose={() => setCreated(null)} footer={<button type="button" className="btn btn-primary" onClick={() => setCreated(null)}>I have stored the secret</button>}>
          <p className="small">Use this signing secret to verify the X-CMW-Signature header on each delivery. It is not shown again.</p>
          <code style={{ wordBreak: 'break-all' }}>{created.signingSecret}</code>
        </Modal>
      )}
    </Card>
  );
}

function Activity() {
  const { api } = useApp();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    Promise.all(['import', 'export', 'publish', 'webhook'].map((action) => api.op('auditQuery', { action, limit: 25 }).then((r) => r.rows).catch(() => [])))
      .then((lists) => setRows(sortBy(lists.flat(), '-ts').slice(0, 30)));
  }, [api]);
  return (
    <Card title="Recent integration activity" sub="Imports, exports, reporting feed reads, publications and webhook deliveries, from the audit trail." flush actions={<Link className="btn btn-sm btn-ghost" to="/admin/audit">Audit trail</Link>}>
      {!rows ? <Spinner /> : !rows.length ? <Empty icon="history" title="No integration activity yet" /> : (
        <table className="tbl tbl-compact">
          <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.seq}><td className="nowrap small">{fmtDateTime(r.ts)}</td><td className="small">{r.userName}</td><td className="small">{r.summary}</td></tr>)}</tbody>
        </table>
      )}
    </Card>
  );
}
