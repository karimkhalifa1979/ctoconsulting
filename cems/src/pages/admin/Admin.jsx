// Administration (ADM-001..008, DAT-001..007, INT-*): users and Firm roles, configuration,
// delivery profiles and project templates, custom fields, imports, system health and retention.
import { useRef, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { useApi } from '../../lib/hooks.js';
import { post, put, patch, del, upload } from '../../lib/api.js';
import { useSession } from '../../lib/session.jsx';
import { useLookups } from '../../components/fields.jsx';
import { PageHead, RouteTabs, Card, Async, Table, Badge, Status, D, DT, Alert, Empty, Field, Modal, Tile, KV, useAction, useDialog } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';

export default function Admin() {
  const { me } = useSession();
  return (
    <>
      <PageHead title="Administration" sub="Users and roles, Firm configuration, delivery profiles, imports and system health. Administrators do not see engagement content (ACC-009)."
        actions={<><Link className="btn btn-sm" to="/admin/audit"><Icon name="shield" /> Audit log</Link><Link className="btn btn-sm" to="/admin/requirements"><Icon name="list" /> Requirements</Link></>} />
      <RouteTabs tabs={[
        { to: '/admin', label: 'Users', end: true },
        { to: '/admin/settings', label: 'Configuration' },
        (me.can.configDelivery || me.can.adminSystem) && { to: '/admin/profiles', label: 'Delivery profiles' },
        (me.can.configDelivery || me.can.adminSystem) && { to: '/admin/fields', label: 'Custom fields' },
        { to: '/admin/imports', label: 'Imports' },
        me.can.adminSystem && { to: '/admin/system', label: 'System' },
        me.can.adminSystem && { to: '/admin/retention', label: 'Retention' },
      ]} />
      <Routes>
        <Route index element={<Users />} />
        <Route path="settings" element={<Settings />} />
        <Route path="profiles" element={<Profiles />} />
        <Route path="fields" element={<CustomFields />} />
        <Route path="imports" element={<Imports />} />
        <Route path="system" element={<System />} />
        <Route path="retention" element={<Retention />} />
      </Routes>
    </>
  );
}

// ADM-001, ACC-007: Firm users, external client users and Firm-wide roles.
function Users() {
  const { me } = useSession();
  const q = useApi('/api/admin/users');
  const roles = useApi('/api/admin/roles');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');
  const label = (id) => roles.data?.global.find((r) => r.id === id)?.label.split(' (')[0] || id;
  return (
    <Async q={q}>{(users) => {
      const rows = users.filter((u) => !filter || `${u.name} ${u.email}`.toLowerCase().includes(filter.toLowerCase()));
      return (
        <Card title="Users" sub="Engagement roles are granted on each engagement’s Team tab; Firm-wide roles are set here." flush
          actions={<><input type="search" placeholder="Search users" value={filter} onChange={(e) => setFilter(e.target.value)} />{me.can.adminUsers && <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}><Icon name="plus" /> New user</button>}</>}>
          <Table rows={rows} onRow={me.can.adminUsers ? (u) => setEditing(u) : undefined} columns={[
            { key: 'name', label: 'Name', render: (u) => <span><span className="strong">{u.name}</span>{u.external && <Badge tone="gold">External</Badge>}<div className="tiny muted">{u.email}{u.title ? ` · ${u.title}` : ''}</div></span> },
            { key: 'roles', label: 'Firm roles', sort: false, render: (u) => <div className="chips">{(u.roles || []).map((r) => <span key={r} className="chip">{label(r)}</span>)}</div> },
            { key: 'memberships', label: 'Engagement roles', sort: (u) => u.memberships.length, render: (u) => <span className="small">{u.memberships.map((m) => `${m.engagement} ${m.role.replace(/_/g, ' ')}`).join('; ') || '—'}</span> },
            { key: 'client', label: 'Client', render: (u) => u.client || '' },
            { key: 'last_login', label: 'Last sign-in', render: (u) => (u.last_login ? <DT v={u.last_login} /> : <span className="muted">Never</span>) },
            { key: 'active', label: 'Status', render: (u) => (u.active ? <Badge tone="green">Active</Badge> : <Badge tone="grey">Disabled</Badge>) },
          ]} />
          {creating && <NewUser roles={roles.data?.global || []} onClose={() => setCreating(false)} onDone={() => { setCreating(false); q.reload(); }} />}
          {editing && <EditUser u={editing} roles={roles.data?.global || []} onClose={() => setEditing(null)} onDone={() => { setEditing(null); q.reload(); }} />}
        </Card>
      );
    }}</Async>
  );
}

function RolePicker({ roles, value, onChange, disabled }) {
  return (
    <div className="stack-sm">
      {roles.map((r) => <label key={r.id} className="check"><input type="checkbox" disabled={disabled} checked={value.includes(r.id)} onChange={(e) => onChange(e.target.checked ? [...value, r.id] : value.filter((x) => x !== r.id))} /> {r.label}</label>)}
    </div>
  );
}

function NewUser({ roles, onClose, onDone }) {
  const lookups = useLookups();
  const [run, busy] = useAction();
  const [f, setF] = useState({ name: '', email: '', title: '', external: false, client_id: '', roles: [], person: true, grade: 'Consultant' });
  const set = (k, v) => setF({ ...f, [k]: v });
  const save = async () => {
    const out = await run(() => post('/api/admin/users', f), 'User created');
    if (out) onDone();
  };
  return (
    <Modal title="New user" wide onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.name || !f.email || (f.external && !f.client_id)} onClick={save}>Create</button></>}>
      <div className="form-grid">
        <Field label="Name" required><input type="text" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Email" required hint="Must match the Microsoft Entra ID sign-in."><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Title"><input type="text" value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Kind">
          <select value={f.external ? 'external' : 'firm'} onChange={(e) => setF({ ...f, external: e.target.value === 'external', roles: [] })}><option value="firm">Firm staff or contractor</option><option value="external">Client stakeholder (external)</option></select>
        </Field>
        {f.external ? (
          <Field label="Client" required full hint="External users only see client-visible content for engagements they are members of (ACC-005).">
            <select value={f.client_id} onChange={(e) => set('client_id', e.target.value)}><option value="">Choose…</option>{(lookups?.clients || []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          </Field>
        ) : (
          <>
            <Field label="Firm-wide roles" full><RolePicker roles={roles} value={f.roles} onChange={(v) => set('roles', v)} /></Field>
            <label className="check"><input type="checkbox" checked={f.person} onChange={(e) => set('person', e.target.checked)} /> Add to the resource pool (can record time)</label>
            {f.person && <Field label="Grade"><select value={f.grade} onChange={(e) => set('grade', e.target.value)}>{['Partner', 'Director', 'Senior Manager', 'Manager', 'Senior Consultant', 'Consultant', 'Analyst'].map((g) => <option key={g}>{g}</option>)}</select></Field>}
          </>
        )}
      </div>
    </Modal>
  );
}

function EditUser({ u, roles, onClose, onDone }) {
  const [run, busy] = useAction();
  const [f, setF] = useState({ name: u.name, title: u.title || '', roles: u.roles || [], active: u.active });
  const save = async () => {
    const out = await run(() => patch(`/api/admin/users/${u.id}`, f), f.active ? 'User updated' : 'User disabled and signed out');
    if (out) onDone();
  };
  return (
    <Modal title={u.name} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Name"><input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Title"><input type="text" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        {!u.external && <Field label="Firm-wide roles" full><RolePicker roles={roles} value={f.roles} onChange={(v) => setF({ ...f, roles: v })} /></Field>}
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active (disabling ends all sessions immediately)</label>
      </div>
    </Modal>
  );
}

const SETTING_HELP = {
  firm: 'Firm name, ABN, time zone, branding and numbering (ADM-006).', reporting: 'Week end, status cut-off, file naming and RAG trend periods (BR-01, BR-17).',
  ragRules: 'Thresholds behind the calculated ratings (BR-03).', tolerances: 'Default tolerances for new projects (BR-04).', finance: 'GST, financial year, forecast cycle days, PO alerts, commentary thresholds (BR-13, BR-14).',
  timesheets: 'Daily maximum, validation modes, deadlines and day rounding (TEX-005, BR-12).', authority: 'Approval thresholds for changes, commercial approval and re-baselines (WFL-002).',
  alerts: 'Notice periods for contract dates, clearance expiries and time-code closure.', security: 'Session timeout, upload limits and malware scanning (NFR-008).', retention: 'Retention period and disposal (DAT-001).',
};

// ADM-003/004: Firm configuration, each key edited as JSON by the role that owns it.
function Settings() {
  const q = useApi('/api/admin/settings');
  const [open, setOpen] = useState(null);
  return (
    <Async q={q}>{(rows) => (
      <div className="split-nav">
        <Card title="Settings" flush>
          <ul className="list selectable">
            {rows.map((s) => <li key={s.key} className={open === s.key ? 'active' : ''} onClick={() => setOpen(s.key)}><div className="grow"><div className="strong">{s.key}</div><div className="tiny muted">{SETTING_HELP[s.key] || ''}</div></div>{s.customised ? <Badge tone="teal">Customised</Badge> : <Badge tone="grey">Default</Badge>}</li>)}
          </ul>
        </Card>
        {open ? <SettingEditor key={open} s={rows.find((x) => x.key === open)} onSaved={q.reload} /> : <Card><Empty>Choose a setting.</Empty></Card>}
      </div>
    )}</Async>
  );
}

function SettingEditor({ s, onSaved }) {
  const [text, setText] = useState(JSON.stringify(s.value, null, 2));
  const [err, setErr] = useState(null);
  const [run, busy] = useAction();
  const dialog = useDialog();
  const save = async () => {
    let value;
    try { value = JSON.parse(text); setErr(null); } catch (e) { setErr(`Not valid JSON: ${e.message}`); return; }
    const out = await run(() => put(`/api/admin/settings/${s.key}`, { value }), 'Setting saved');
    if (out) onSaved();
  };
  const reset = async () => {
    if (!(await dialog({ title: `Reset ${s.key}`, message: 'Restore the default values. The change is audited.', confirm: 'Reset', danger: true }))) return;
    const out = await run(() => del(`/api/admin/settings/${s.key}`), 'Reset to defaults');
    if (out) { setText(JSON.stringify(out.value, null, 2)); onSaved(); }
  };
  return (
    <Card title={s.key} sub={SETTING_HELP[s.key]} actions={s.editable && <><button className="btn btn-sm" disabled={busy || !s.customised} onClick={reset}>Reset</button><button className="btn btn-sm btn-primary" disabled={busy} onClick={save}>Save</button></>}>
      {!s.editable && <Alert tone="info">Read-only for your role.</Alert>}
      {err && <Alert tone="error">{err}</Alert>}
      <textarea className="mono" rows={24} value={text} readOnly={!s.editable} onChange={(e) => setText(e.target.value)} spellCheck={false} />
    </Card>
  );
}

// ADM-002 / GOV-011: delivery profiles (stages, gates, roles) and project templates.
function Profiles() {
  const [which, setWhich] = useState('profiles');
  const q = useApi(`/api/admin/${which}`);
  const [text, setText] = useState(null);
  const [run, busy] = useAction();
  const save = async () => {
    let items;
    try { items = JSON.parse(text); } catch (e) { await run(() => Promise.reject(new Error(`Not valid JSON: ${e.message}`))); return; }
    const out = await run(() => put(`/api/admin/${which}`, { items }), 'Saved');
    if (out) q.reload();
  };
  return (
    <div className="stack">
      <div className="subtabs">
        <button className={which === 'profiles' ? 'active' : ''} onClick={() => { setWhich('profiles'); setText(null); }}>Delivery profiles</button>
        <button className={which === 'project-templates' ? 'active' : ''} onClick={() => { setWhich('project-templates'); setText(null); }}>Project templates</button>
      </div>
      <Async q={q}>{(d) => (
        <Card title={which === 'profiles' ? 'Delivery profiles' : 'Project templates'} sub={which === 'profiles' ? 'PRINCE2-aligned by default, with agile and hybrid profiles: stages, gate criteria, mandatory artefacts, governance roles and enforcement (GOV-007..011).' : 'Standard tasks, milestones, deliverables and risks that new projects start from (PLN-015).'}
          actions={<><Badge tone={d.custom ? 'teal' : 'grey'}>{d.custom ? 'Customised' : 'Firm defaults'}</Badge><button className="btn btn-sm btn-primary" disabled={busy || text == null} onClick={save}>Save</button></>}>
          <div className="grid g-3 mb-2">
            {d.items.map((x) => <div key={x.id || x.key} className="tile"><div className="label">{x.approach || x.profile || ''}</div><div className="value" style={{ fontSize: 15 }}>{x.name}</div><div className="sub">{x.stages ? `${x.stages.length} stages` : x.tasks ? `${x.tasks.length} tasks · ${x.milestones?.length || 0} milestones` : ''}</div></div>)}
          </div>
          <textarea className="mono" rows={22} spellCheck={false} value={text ?? JSON.stringify(d.items, null, 2)} onChange={(e) => setText(e.target.value)} />
        </Card>
      )}</Async>
    </div>
  );
}

// ADM-005 / RPT-020: custom fields, also available to templates as custom.<key>.
function CustomFields() {
  const q = useApi('/api/admin/custom-fields');
  const [run, busy] = useAction();
  const [f, setF] = useState({ entity: 'engagement', key: '', label: '', type: 'text', audience: 'client', required: false, options: '' });
  const add = async () => {
    const out = await run(() => post('/api/admin/custom-fields', { ...f, options: f.type === 'enum' ? f.options.split(',').map((x) => x.trim()).filter(Boolean) : null }), 'Custom field added');
    if (out) { q.reload(); setF({ ...f, key: '', label: '', options: '' }); }
  };
  const remove = async (c) => {
    const out = await run(() => del(`/api/admin/custom-fields/${c.id}`), 'Removed');
    if (out) q.reload();
  };
  return (
    <div className="split">
      <Card title="Custom fields" flush>
        <Async q={q}>{(rows) => (
          <Table rows={rows} empty="No custom fields." columns={[
            { key: 'entity', label: 'Record' }, { key: 'key', label: 'Key', render: (c) => <span className="mono">{c.key}</span> }, { key: 'label', label: 'Label' }, { key: 'type', label: 'Type' },
            { key: 'audience', label: 'Audience', render: (c) => <Badge tone={c.audience === 'internal' ? 'gold' : ''}>{c.audience}</Badge> },
            { key: 'token', label: 'Template token', sort: false, render: (c) => <span className="mono small">{`{{custom.${c.key}}}`}</span> },
            { key: 'x', label: '', sort: false, render: (c) => <button className="btn btn-xs btn-danger" disabled={busy} onClick={() => remove(c)}>Remove</button> },
          ]} />
        )}</Async>
      </Card>
      <Card title="Add a field">
        <div className="form-grid">
          <Field label="Record type" full><select value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })}>{['client', 'engagement', 'project', 'risk', 'issue', 'deliverable'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Key" hint="Lower case, digits and underscores"><input type="text" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} /></Field>
          <Field label="Label"><input type="text" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
          <Field label="Type"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['text', 'textarea', 'number', 'money', 'date', 'bool', 'enum'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Audience"><select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="client">Client and internal</option><option value="internal">Internal only</option></select></Field>
          {f.type === 'enum' && <Field label="Options" full hint="Comma-separated"><input type="text" value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} /></Field>}
          <label className="check"><input type="checkbox" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} /> Required</label>
        </div>
        <button className="btn btn-primary btn-sm mt-2" disabled={busy || !f.key || !f.label} onClick={add}>Add field</button>
      </Card>
    </div>
  );
}

// DAT-005..007: imports with validation, row errors and reconciliation totals.
const IMPORTS = [
  ['clients', 'Clients', 'legal_name, trading_name, abn, sector, sector_type, code, payment_terms_days'],
  ['people', 'People', 'name, email, grade, practice, state, employment_type, standard_hours, skills (semicolon-separated)'],
  ['raid', 'RAID items', 'type, engagement_code, project_code, title, description, owner_email, status, likelihood, consequence, severity, due_date'],
  ['rates', 'Rate card rates', 'rate_card, role, rate, effective_from'],
];
function Imports() {
  const q = useApi('/api/admin/imports');
  const file = useRef(null);
  const [kind, setKind] = useState('clients');
  const [result, setResult] = useState(null);
  const [run, busy] = useAction();
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const out = await run(() => upload(`/api/admin/import/${kind}`, f), (o) => `${o.created} of ${o.total} rows imported`);
    if (out) { setResult(out); q.reload(); }
  };
  return (
    <div className="stack">
      <Card title="Import data" sub="CSV or Excel. Every row is validated; rejected rows are listed with the reason, and totals reconcile source and imported rows (DAT-005).">
        <div className="form-grid">
          <Field label="What to import"><select value={kind} onChange={(e) => { setKind(e.target.value); setResult(null); }}>{IMPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Columns" full><span className="mono small">{IMPORTS.find(([k]) => k === kind)[2]}</span></Field>
        </div>
        <input ref={file} type="file" accept=".csv,.xlsx,text/csv" hidden onChange={onFile} />
        <button className="btn btn-sm btn-primary mt-2" disabled={busy} onClick={() => file.current?.click()}><Icon name="upload" /> Choose file</button>
        {result && (
          <div className="mt-3">
            <Alert tone={result.errors.length ? 'warn' : 'ok'}>{result.created} of {result.total} rows imported; {result.errors.length} rejected.</Alert>
            <KV items={Object.entries(result.reconciliation || {}).map(([k, v]) => [k.replace(/_/g, ' '), String(v)])} />
            {result.errors.length > 0 && <Table compact rows={result.errors.map((x, i) => ({ ...x, id: i }))} columns={[{ key: 'row', label: 'Row', num: true }, { key: 'error', label: 'Problem' }]} />}
          </div>
        )}
      </Card>
      <Card title="Import history" flush>
        <Async q={q}>{(rows) => (
          <Table rows={rows} empty="No imports yet." columns={[
            { key: 'created_at', label: 'When', render: (r) => <DT v={r.created_at} /> }, { key: 'kind', label: 'Kind' }, { key: 'file_name', label: 'File' },
            { key: 'rows', label: 'Rows', num: true }, { key: 'created', label: 'Imported', num: true }, { key: 'errors', label: 'Rejected', num: true, sort: (r) => r.errors?.length || 0, render: (r) => r.errors?.length || 0 },
          ]} />
        )}</Async>
      </Card>
    </div>
  );
}

// NFR / INT: health, scheduled jobs, integration log with retry, email outbox and webhooks.
function System() {
  const health = useApi('/api/admin/health');
  const integ = useApi('/api/admin/integrations');
  const outbox = useApi('/api/admin/outbox');
  const hooks = useApi('/api/admin/webhooks');
  const [run, busy] = useAction();
  const dialog = useDialog();
  const runJob = async (name) => {
    const out = await run(() => post(`/api/admin/jobs/${name}/run`), (o) => o.message || 'Job finished');
    if (out) health.reload();
  };
  const retry = async () => {
    const out = await run(() => post('/api/admin/integrations/retry'), 'Retry started');
    if (out) integ.reload();
  };
  const addHook = async () => {
    const url = await dialog({ title: 'Add a webhook', message: 'Events are posted as JSON with an HMAC signature header (INT-014).', input: 'line', required: true, label: 'HTTPS URL' });
    if (!url) return;
    const events = await dialog({ title: 'Events', input: 'line', required: true, label: 'Comma-separated, for example report.issued, status.submitted, threshold.breached', initial: 'report.issued, status.submitted, threshold.breached' });
    if (!events) return;
    const out = await run(() => post('/api/admin/webhooks', { url, events: events.split(',').map((x) => x.trim()).filter(Boolean) }), 'Webhook added');
    if (out) hooks.reload();
  };
  return (
    <div className="stack">
      <Async q={health}>{(h) => (
        <>
          <div className="grid g-6">
            <Tile label="Environment" value={h.env} sub={`Node ${h.node} · up ${Math.round(h.uptimeSeconds / 3600)} h`} />
            <Tile label="Sign-in" value={h.oidc ? 'Entra ID' : 'Demo'} sub={h.authMode} />
            <Tile label="Email" value={h.email.startsWith('Microsoft') ? 'Microsoft 365' : 'Outbox'} sub={h.email} />
            <Tile label="PDF rendering" value={h.pdf ? 'Available' : 'Unavailable'} tone={h.pdf ? 'good' : 'warn'} sub="LibreOffice" />
            <Tile label="Integration errors" value={h.integrationErrors} tone={h.integrationErrors ? 'warn' : 'good'} />
            <Tile label="Emails queued" value={h.outboxQueued} />
          </div>
          <Card title="Scheduled jobs" flush>
            <Table rows={h.jobs.map((j) => ({ ...j, id: j.name }))} columns={[
              { key: 'name', label: 'Job', render: (j) => <span><span className="strong">{j.label || j.name}</span><div className="tiny muted mono">{j.name}</div></span> },
              { key: 'every_minutes', label: 'Every', render: (j) => (j.every_minutes >= 1440 ? `${Math.round(j.every_minutes / 1440)} d` : j.every_minutes >= 60 ? `${Math.round(j.every_minutes / 60)} h` : `${j.every_minutes} min`) },
              { key: 'last_run_at', label: 'Last run', render: (j) => (j.last_run_at ? <DT v={j.last_run_at} /> : '—') },
              { key: 'last_status', label: 'Result', render: (j) => <span className="small">{j.last_status ? <Status v={j.last_status} /> : null} {j.last_message || ''}</span> },
              { key: 'runs', label: 'Runs', num: true },
              { key: 'x', label: '', sort: false, render: (j) => <button className="btn btn-xs" disabled={busy} onClick={() => runJob(j.name)}>Run now</button> },
            ]} />
          </Card>
          <Card title="Record counts"><KV items={Object.entries(h.counts).map(([k, v]) => [k.replace(/([A-Z])/g, ' $1').toLowerCase(), v.toLocaleString('en-AU')])} /></Card>
        </>
      )}</Async>
      <Card title="Integration log (INT-015)" sub="Calls to Entra ID, Microsoft 365, the accounting system, CRM and SharePoint, with retries and a dead-letter state." flush actions={<button className="btn btn-sm" disabled={busy} onClick={retry}>Retry failed</button>}>
        <Async q={integ}>{(rows) => (
          <Table rows={rows} pageSize={15} empty="No integration calls yet." columns={[
            { key: 'updated_at', label: 'When', render: (r) => <DT v={r.updated_at} /> }, { key: 'system', label: 'System' }, { key: 'operation', label: 'Operation' },
            { key: 'status', label: 'Status', render: (r) => <Status v={r.status} /> }, { key: 'attempts', label: 'Attempts', num: true }, { key: 'error', label: 'Error', render: (r) => <span className="small">{r.error || ''}</span> },
          ]} />
        )}</Async>
      </Card>
      <Card title="Email outbox" sub="Notifications and report distribution; sent through Microsoft 365 when configured." flush>
        <Async q={outbox}>{(rows) => (
          <Table rows={rows} pageSize={15} empty="No emails." columns={[
            { key: 'created_at', label: 'Queued', render: (m) => <DT v={m.created_at} /> }, { key: 'subject', label: 'Subject' },
            { key: 'to', label: 'To', sort: false, render: (m) => <span className="small">{(m.to || []).slice(0, 3).join(', ')}{m.to?.length > 3 ? ` +${m.to.length - 3}` : ''}</span> },
            { key: 'status', label: 'Status', render: (m) => <Status v={m.status} /> }, { key: 'sent_at', label: 'Sent', render: (m) => (m.sent_at ? <DT v={m.sent_at} /> : '—') },
          ]} />
        )}</Async>
      </Card>
      <Card title="Webhooks (INT-014)" flush actions={<button className="btn btn-sm" onClick={addHook}><Icon name="plus" /> Add</button>}>
        <Async q={hooks}>{(rows) => (
          <Table rows={rows} empty="No webhooks." columns={[
            { key: 'url', label: 'URL', render: (w) => <span className="mono small">{w.url}</span> }, { key: 'events', label: 'Events', sort: false, render: (w) => (w.events || []).join(', ') },
            { key: 'x', label: '', sort: false, render: (w) => <button className="btn btn-xs btn-danger" disabled={busy} onClick={async () => { if (await run(() => del(`/api/admin/webhooks/${w.id}`), 'Removed')) hooks.reload(); }}>Remove</button> },
          ]} />
        )}</Async>
      </Card>
    </div>
  );
}

// DAT-001: retention from engagement closure, with legal hold.
function Retention() {
  const q = useApi('/api/admin/retention');
  return (
    <Card title="Retention" sub="Records are kept for the retention period after the engagement closes, unless on legal hold (DAT-001, DAT-003)." flush>
      <Async q={q}>{(rows) => (
        <Table rows={rows} columns={[
          { key: 'code', label: 'Code' }, { key: 'name', label: 'Engagement' }, { key: 'status', label: 'Status', render: (r) => <Status v={r.status} /> },
          { key: 'closed_at', label: 'Closed', render: (r) => <D v={r.closed_at} /> }, { key: 'retain_until', label: 'Retain until', render: (r) => <D v={r.retain_until} /> },
          { key: 'legal_hold', label: 'Legal hold', render: (r) => (r.legal_hold ? <Badge tone="red">On hold</Badge> : '—') },
        ]} />
      )}</Async>
    </Card>
  );
}
