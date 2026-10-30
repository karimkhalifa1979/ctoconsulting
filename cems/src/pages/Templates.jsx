// Report template library (RPT-001..011): Firm, client and engagement templates with versions,
// validation status and publication; the PMO maintains the Firm library.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { post } from '../lib/api.js';
import { useSession, canOn } from '../lib/session.jsx';
import { useLookups } from '../components/fields.jsx';
import { PageHead, Card, Async, Table, Status, Badge, D, Modal, Field, useAction } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

export const REPORT_TYPES = ['Weekly status', 'Steering committee', 'Monthly financial', 'Exception', 'End stage', 'End project', 'PID', 'Change request'];

export default function Templates() {
  const { me } = useSession();
  const [f, setF] = useState({ report_type: '', status: '' });
  const q = useApi('/api/templates', f);
  const [creating, setCreating] = useState(false);
  const canCreate = me.can.templatesLibrary || Object.keys(me.access || {}).some((id) => canOn(me, id, 'templates', 'U'));
  return (
    <>
      <PageHead title="Report templates" crumbs={<><Link to="/reports">Reports</Link><span>›</span></>}
        sub="Word templates with tokens, loops and conditions. Uploads are scanned, macros are rejected, and every version is validated before publication (RPT-004, RPT-025)."
        actions={<>
          <Link className="btn btn-sm" to="/reports/tokens"><Icon name="book" /> Token reference</Link>
          {canCreate && <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}><Icon name="plus" /> New template</button>}
        </>} />
      <div className="filters mb-2">
        <select value={f.report_type} onChange={(e) => setF({ ...f, report_type: e.target.value })} aria-label="Report type" style={{ width: 'auto' }}><option value="">All report types</option>{REPORT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status" style={{ width: 'auto' }}><option value="">All statuses</option>{['Draft', 'Submitted', 'Published', 'Retired'].map((t) => <option key={t}>{t}</option>)}</select>
      </div>
      <Async q={q}>{(rows) => (
        <Card flush>
          <Table rows={rows} initialSort={{ key: 'name', dir: 1 }} columns={[
            { key: 'name', label: 'Template', render: (t) => <div><Link className="strong" to={`/reports/templates/${t.id}`}>{t.name}</Link><div className="tiny muted">{t.description}</div></div> },
            { key: 'report_type', label: 'Type' },
            { key: 'scope', label: 'Scope', render: (t) => <span>{t.scope}{t.client ? <div className="tiny muted">{t.client}</div> : null}{t.engagement ? <div className="tiny muted">{t.engagement}</div> : null}</span> },
            { key: 'level', label: 'Level' },
            { key: 'audience', label: 'Audience', render: (t) => <Badge tone={t.audience === 'internal' ? 'gold' : ''}>{t.audience}</Badge> },
            { key: 'version', label: 'Current', sort: (t) => t.current?.version_no || 0, render: (t) => (t.current ? `v${t.current.version_no}` : '—') },
            { key: 'validation', label: 'Validation', sort: false, render: (t) => (!t.current ? '—' : t.current.validation?.ok ? <Badge tone="green">Valid</Badge> : <Badge tone="red">{t.current.validation?.errors?.length || 0} errors</Badge>) },
            { key: 'status', label: 'Status', render: (t) => <Status v={t.status} /> },
            { key: 'updated_at', label: 'Updated', render: (t) => <D v={String(t.updated_at || '').slice(0, 10)} /> },
          ]} />
        </Card>
      )}</Async>
      {creating && <NewTemplate onClose={() => setCreating(false)} />}
    </>
  );
}

function NewTemplate({ onClose }) {
  const { me } = useSession();
  const lookups = useLookups();
  const nav = useNavigate();
  const [run, busy] = useAction();
  const [f, setF] = useState({ name: '', description: '', report_type: 'Weekly status', scope: me.can.templatesLibrary ? 'Firm' : 'Engagement', client_id: '', engagement_id: '', level: 'engagement', audience: 'client', output_formats: ['docx', 'pdf'] });
  const set = (k, v) => setF({ ...f, [k]: v });
  const engs = (lookups?.engagements || []).filter((e) => me.can.templatesLibrary || canOn(me, e.id, 'templates', 'U'));
  const create = async () => {
    const out = await run(() => post('/api/templates', f), 'Template created; upload the Word file next');
    if (out) nav(`/reports/templates/${out.id}`);
  };
  return (
    <Modal title="New report template" wide onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.name || (f.scope === 'Engagement' && !f.engagement_id) || (f.scope === 'Client' && !f.client_id)} onClick={create}>Create</button></>}>
      <div className="form-grid">
        <Field label="Name" required full><input type="text" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Description" full><textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Report type"><select value={f.report_type} onChange={(e) => set('report_type', e.target.value)}>{REPORT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Scope" hint="Firm templates are maintained by the PMO; engagement managers can create templates for their engagements (RPT-002).">
          <select value={f.scope} onChange={(e) => set('scope', e.target.value)}>
            {me.can.templatesLibrary && <option>Firm</option>}
            {me.can.templatesLibrary && <option>Client</option>}
            <option>Engagement</option>
          </select>
        </Field>
        {f.scope === 'Client' && <Field label="Client" required><select value={f.client_id} onChange={(e) => set('client_id', e.target.value)}><option value="">Choose…</option>{(lookups?.clients || []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>}
        {f.scope === 'Engagement' && <Field label="Engagement" required><select value={f.engagement_id} onChange={(e) => set('engagement_id', e.target.value)}><option value="">Choose…</option>{engs.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select></Field>}
        <Field label="Level" hint="Engagement-level templates loop over projects; project-level templates report one project."><select value={f.level} onChange={(e) => set('level', e.target.value)}><option value="engagement">Engagement</option><option value="project">Project</option></select></Field>
        <Field label="Audience" hint="Client templates cannot use internal-only tokens (RPT-021)."><select value={f.audience} onChange={(e) => set('audience', e.target.value)}><option value="client">Client</option><option value="internal">Internal</option></select></Field>
      </div>
    </Modal>
  );
}
