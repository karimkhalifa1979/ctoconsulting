// Engagement reports (RPT-008, RPT-047), team and access (ACC-001, ACC-006..008, RES-009, RES-011)
// and engagement closure (CLS-007).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEngagement } from './Engagement.jsx';
import { useApi } from '../../lib/hooks.js';
import { post, patch, put, del, download } from '../../lib/api.js';
import { ReportList } from '../../components/Reports.jsx';
import { Card, Table, Status, Badge, D, DT, Modal, Field, Alert, Async, Empty, Meter, useAction, useDialog } from '../../components/ui.jsx';
import { ROLES, FUNCTIONS } from '../../../shared/permissions.js';
import { fmtPct } from '../../../shared/format.js';
import Icon from '../../components/Icon.jsx';

const REPORT_TYPES = ['Weekly status', 'Steering committee', 'Monthly financial', 'Exception', 'End stage', 'End project'];

export function EngReports() {
  const { id, e, can, reload } = useEngagement();
  const templates = useApi('/api/templates', { engagement_id: id, status: 'Published' });
  const [run, busy] = useAction();
  const setDefault = async (type, templateId) => {
    const out = await run(() => post(`/api/engagements/${id}/default-template`, { report_type: type, template_id: templateId || null }), 'Default template saved');
    if (out) reload();
  };
  const canSet = can('report', 'U') || can('setup', 'U');
  return (
    <div className="stack">
      <ReportList engagementId={id} title="Reports for this engagement" sub="Every generated report with its snapshot, drafts, approvals and distribution."
        actions={can('report', 'C') && <Link className="btn btn-sm btn-primary" to={`/reports/new?engagement=${id}`}><Icon name="plus" /> Generate report</Link>} />
      <Card title="Default templates (RPT-008)" sub="Used for scheduled drafts and preselected when generating. Only published templates permitted for this engagement are offered." flush>
        <Async q={templates}>{(list) => (
          <Table rows={REPORT_TYPES.map((t) => ({ id: t, type: t, current: e.default_templates?.[t] || '' }))} columns={[
            { key: 'type', label: 'Report type' },
            { key: 'current', label: 'Default template', sort: false, render: (r) => {
              const opts = list.filter((t) => t.report_type === r.type);
              if (!canSet) return list.find((t) => t.id === r.current)?.name || <span className="muted">None</span>;
              return (
                <select value={r.current} disabled={busy || !opts.length} onChange={(ev) => setDefault(r.type, ev.target.value)} style={{ maxWidth: 420 }}>
                  <option value="">{opts.length ? 'None' : 'No published templates of this type'}</option>
                  {opts.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.audience}, {t.level}-level, {t.scope})</option>)}
                </select>
              );
            } },
          ]} />
        )}</Async>
      </Card>
    </div>
  );
}

export function Team() {
  const { id, can, roles } = useEngagement();
  const team = useApi(`/api/engagements/${id}/team`);
  const members = useApi(`/api/engagements/${id}/members`);
  const manage = can('setup', 'U');
  const [adding, setAdding] = useState(false);
  const [review, setReview] = useState(false);
  const [run, busy] = useAction();
  const dialog = useDialog();
  const toggle = async (row, item, done) => {
    const out = await run(() => put(`/api/allocations/${row.allocation_id}/onboarding`, { item, done }));
    if (out) team.reload();
  };
  const end = async (m) => {
    const reason = await dialog({ title: `End ${m.user}’s access`, message: 'Access ends immediately and is recorded in the audit log (ACC-006).', input: 'line', required: true, label: 'Reason', confirm: 'End access', danger: true });
    if (!reason) return;
    const out = await run(() => del(`/api/members/${m.id}`, { reason }), 'Access ended');
    if (out) members.reload();
  };
  const extend = async (m) => {
    const date = await dialog({ title: `Change end date for ${m.user}`, input: 'line', label: 'End date (yyyy-mm-dd), blank for none', initial: m.end_date || '' });
    if (date === null) return;
    const out = await run(() => patch(`/api/members/${m.id}`, { end_date: date || null }), 'Membership updated');
    if (out) members.reload();
  };
  return (
    <div className="stack">
      <Async q={team}>{(t) => (
        <Card title="Team" sub={t.requirements.length ? `Onboarding requirements for this client: ${t.requirements.join(', ')} (RES-011).` : 'People allocated to the engagement’s projects (RES-009).'} flush>
          <Table rows={t.rows.map((r) => ({ ...r, id: r.allocation_id }))} columns={[
            { key: 'name', label: 'Person', render: (r) => <span>{r.name}{r.key_person && <Badge tone="gold" title="Key person under the contract">Key</Badge>}</span> },
            { key: 'project', label: 'Project', render: (r) => <Link to={`/projects/${r.project_id}/resources`}>{r.project}</Link> },
            { key: 'role', label: 'Role' },
            { key: 'hours_per_week', label: 'Hours / week', num: true },
            { key: 'start_date', label: 'From', render: (r) => <D v={r.start_date} /> },
            { key: 'end_date', label: 'To', render: (r) => <D v={r.end_date} /> },
            { key: 'status', label: 'Status', render: (r) => <Status v={r.status} /> },
            { key: 'clearances', label: 'Clearance', sort: false, render: (r) => (r.clearances || []).map((c) => <Badge key={c.level} tone={c.expiry && c.expiry < new Date().toISOString().slice(0, 10) ? 'red' : ''} title={c.expiry ? `Expires ${c.expiry}` : ''}>{c.level}</Badge>) },
            t.requirements.length > 0 && { key: 'onboarded', label: 'Onboarding', sort: (r) => r.onboarding.filter((o) => o.done).length, render: (r) => (
              <div className="stack-sm" onClick={(e) => e.stopPropagation()}>
                {r.onboarding.map((o) => <label key={o.item} className="check tiny"><input type="checkbox" checked={o.done} disabled={busy || !can('resources', 'U')} onChange={(e) => toggle(r, o.item, e.target.checked)} /> {o.item}</label>)}
              </div>
            ) },
          ].filter(Boolean)} />
        </Card>
      )}</Async>
      <Async q={members}>{(list) => (
        <Card title="Access to this engagement" sub="Membership grants a role on the engagement, optionally limited to projects, with an end date. Access is reviewed each quarter (ACC-001, ACC-008)." flush
          actions={<>
            {(manage || roles.includes('engagement_executive')) && <button className="btn btn-sm" onClick={() => setReview(true)}><Icon name="shield" /> Access review</button>}
            {manage && <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}><Icon name="plus" /> Add member</button>}
          </>}>
          <Table rows={list} columns={[
            { key: 'user', label: 'Person', render: (m) => <span>{m.user}{m.external && <Badge tone="gold">External</Badge>}<div className="tiny muted">{m.email}</div></span> },
            { key: 'role_label', label: 'Role' },
            { key: 'project_ids', label: 'Projects', sort: false, render: (m) => (m.project_ids?.length ? <span className="small">{m.project_ids.length} project{m.project_ids.length > 1 ? 's' : ''}</span> : <span className="small muted">All</span>) },
            { key: 'grants', label: 'Extra grants', sort: false, render: (m) => (m.grants?.length ? <span className="small">{m.grants.join(', ')}</span> : '—') },
            { key: 'start_date', label: 'From', render: (m) => <D v={m.start_date} /> },
            { key: 'end_date', label: 'Until', render: (m) => (m.end_date ? <D v={m.end_date} /> : m.external ? <span className="flag small">No end date</span> : <span className="muted">—</span>) },
            manage && { key: 'act', label: '', sort: false, render: (m) => (
              <span className="flex" onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-xs" disabled={busy} onClick={() => extend(m)}>End date</button>
                <button className="btn btn-xs btn-danger" disabled={busy} onClick={() => end(m)}>Remove</button>
              </span>
            ) },
          ].filter(Boolean)} />
        </Card>
      )}</Async>
      {adding && <AddMember onClose={() => setAdding(false)} onDone={() => { setAdding(false); members.reload(); }} />}
      {review && <AccessReview onClose={() => setReview(false)} />}
    </div>
  );
}

function AddMember({ onClose, onDone }) {
  const { id, lookups, d } = useEngagement();
  const [run, busy] = useAction();
  const [f, setF] = useState({ user_id: '', role: 'team_member', project_ids: [], grants: [], start_date: '', end_date: '' });
  const user = lookups?.users?.find((u) => u.id === f.user_id);
  const roles = ROLES.filter((r) => (user?.external ? r.id === 'client' : r.id !== 'client'));
  const save = async () => {
    const body = { ...f, start_date: f.start_date || null, end_date: f.end_date || null };
    const out = await run(() => post(`/api/engagements/${id}/members`, body), 'Member added');
    if (out) onDone();
  };
  return (
    <Modal title="Add a member" wide onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.user_id || !f.role} onClick={save}>Add</button></>}>
      <div className="form-grid">
        <Field label="Person" required>
          <select value={f.user_id} onChange={(e) => { const u = lookups?.users?.find((x) => x.id === e.target.value); setF({ ...f, user_id: e.target.value, role: u?.external ? 'client' : f.role === 'client' ? 'team_member' : f.role }); }}>
            <option value="">Choose…</option>
            {(lookups?.users || []).map((u) => <option key={u.id} value={u.id}>{u.label}{u.external ? ' (external)' : ''}</option>)}
          </select>
        </Field>
        <Field label="Role" required hint={ROLES.find((r) => r.id === f.role)?.desc}>
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
        </Field>
        <Field label="Limit to projects" hint="Leave empty for all projects in the engagement (ACC-001).">
          <select multiple value={f.project_ids} onChange={(e) => setF({ ...f, project_ids: [...e.target.selectedOptions].map((o) => o.value) })} size={Math.min(5, d.projects.length || 1)}>
            {d.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Extra grants" hint="Specific functions beyond the role, for example time approval for a delegate.">
          <select multiple value={f.grants} onChange={(e) => setF({ ...f, grants: [...e.target.selectedOptions].map((o) => o.value) })} size={5}>
            {FUNCTIONS.map((fn) => <option key={fn.id} value={`${fn.id}:A`}>{fn.label}: approve</option>)}
          </select>
        </Field>
        <Field label="From"><input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
        <Field label="Until" hint={user?.external ? 'External access should always have an end date (ACC-005).' : ''}><input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function AccessReview({ onClose }) {
  const { id } = useEngagement();
  const q = useApi(`/api/engagements/${id}/access-review`);
  return (
    <Modal title="Access review (ACC-008)" wide onClose={onClose} footer={<><button className="btn" onClick={() => download(`/api/engagements/${id}/access-review`, { format: 'xlsx' })}><Icon name="download" /> Excel</button><button className="btn btn-primary" onClick={onClose}>Done</button></>}>
      <Async q={q}>{(rows) => (
        <>
          {rows.some((r) => r.flags?.length) ? <Alert tone="warn">{rows.filter((r) => r.flags?.length).length} memberships need attention.</Alert> : <Alert tone="ok">No issues found.</Alert>}
          <Table compact rows={rows} columns={[
            { key: 'user_name', label: 'Person' }, { key: 'role', label: 'Role' }, { key: 'projects', label: 'Projects' },
            { key: 'status', label: 'Status', render: (r) => <Status v={r.status} /> },
            { key: 'last_login', label: 'Last sign-in', render: (r) => (r.last_login ? <DT v={r.last_login} /> : <span className="muted">Never</span>) },
            { key: 'flags', label: 'Flags', render: (r) => (r.flags || []).map((x) => <div key={x} className="flag tiny">{x}</div>) },
          ]} />
        </>
      )}</Async>
    </Modal>
  );
}

export function Closure() {
  const { id, e, d, can, reload } = useEngagement();
  const q = useApi(`/api/engagements/${id}/closure`);
  const [run, busy] = useAction();
  const dialog = useDialog();
  const mark = async (item, done) => {
    const note = done ? await dialog({ title: item.label, input: 'line', label: 'Note (optional)' }) : '';
    if (note === null) return;
    const out = await run(() => put(`/api/engagements/${id}/closure/${item.key}`, { done, note }), done ? 'Marked complete' : 'Reopened');
    if (out) q.reload();
  };
  const close = async () => {
    if (!(await dialog({ title: 'Close the engagement', message: 'The engagement and its records become read-only. Documents follow the retention schedule (DAT-003).', confirm: 'Close engagement' }))) return;
    const out = await run(() => post(`/api/e/engagement/${id}/do/transition`, { to: 'Closed' }), 'Engagement closed');
    if (out) { reload(); q.reload(); }
  };
  const open = d.projects.filter((p) => !['Closed', 'Cancelled', 'Archived'].includes(p.state));
  return (
    <div className="stack">
      <Async q={q}>{(c) => {
        const done = c.items.filter((i) => i.done).length;
        return (
          <Card title="Engagement closure (CLS-007)" sub="The engagement closes when every project is closed and contractual obligations are complete."
            actions={e.status === 'Closing' && can('setup', 'U') && <button className="btn btn-sm btn-primary" disabled={busy || c.blocking.length > 0} onClick={close}>Close engagement</button>}>
            <div className="flex mb-2"><span className="small">{done} of {c.items.length} complete</span><div className="flex-1"><Meter value={done / c.items.length} /></div></div>
            <ul className="list">
              {c.items.map((i) => (
                <li key={i.key}>
                  <Icon name={i.done ? 'check' : 'circle'} size={16} />
                  <div className="grow">
                    <div>{i.label}{i.mandatory && <span className="tiny muted"> · mandatory</span>}{i.auto && <span className="tiny muted"> · checked automatically</span>}</div>
                    {i.note && <div className="tiny muted">{i.note}</div>}
                  </div>
                  {!i.auto && can('setup', 'U') && <button className="btn btn-xs" disabled={busy} onClick={() => mark(i, !i.done)}>{i.done ? 'Reopen' : 'Mark complete'}</button>}
                </li>
              ))}
            </ul>
            {e.status !== 'Closing' && e.status !== 'Closed' && <p className="small muted mt-2">Move the engagement to Closing from the header when delivery is complete.</p>}
          </Card>
        );
      }}</Async>
      <Card title="Projects still open" flush>
        {!open.length ? <Empty icon="check">All projects are closed.</Empty> : (
          <Table rows={open} columns={[
            { key: 'name', label: 'Project', render: (p) => <Link to={`/projects/${p.id}/closure`}>{p.name}</Link> },
            { key: 'state', label: 'State', render: (p) => <Status v={p.state} /> },
            { key: 'percent', label: 'Complete', num: true, render: (p) => fmtPct(p.percent) },
            { key: 'end_date', label: 'Planned end', render: (p) => <D v={p.end_date} /> },
          ]} />
        )}
      </Card>
    </div>
  );
}
