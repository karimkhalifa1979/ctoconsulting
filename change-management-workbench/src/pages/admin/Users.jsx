// Users and roles (ADM-004, SEC-01, SEC-02): the people who use the workbench, their roles and the
// initiatives they work on, break-glass local accounts, and what each role may do.
import { useCallback, useEffect, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { Card, Tabs, Empty, Badge, Spinner, ErrorBox } from '../../ui/core.jsx';
import DataGrid from '../../ui/DataGrid.jsx';
import { useRecordDrawer } from '../../ui/RecordDrawer.jsx';
import { useApp, useDialog, useToast } from '../../state/app.jsx';
import { useTab } from '../../lib/hooks.js';
import { fmtDateTime } from '../../lib/format.js';
import { ROLES, MATRIX, hasRole, roleLabel } from '../../../shared/access.js';
import { asArray, sortBy } from '../../../shared/util.js';

const AREA_LABELS = {
  initiative: 'Initiatives and their definition', impact: 'Change impact', assessment: 'Risk, PCT and readiness assessments', stakeholder: 'Stakeholders',
  sensitive: 'Sensitive stakeholder fields', engagement: 'Engagements', adkar: 'ADKAR assessments and Blueprints', plans: 'Plans, communications and training',
  artefacts: 'Artefacts', lessons: 'Lessons learned', templates: 'Artefact templates', config: 'Configuration', users: 'Users', audit: 'Audit trail', reports: 'Reports', workflow: 'Tasks, approvals and comments',
};
const SCOPES = { team: 'their team', group: 'their groups', own: 'their own', assigned: 'assigned stakeholders', comms: 'communications', training: 'training', status: 'status packs', all: 'all' };
const LETTERS = { C: 'create', R: 'view', U: 'change', D: 'delete', A: 'approve' };
const SHORT = { changeLead: 'Lead', practitioner: 'Practitioner', commsAdviser: 'Comms', trainingLead: 'Training', pm: 'PM', sponsor: 'Sponsor', peopleManager: 'Manager', changeAgent: 'Agent', portfolio: 'Portfolio', admin: 'Admin', auditor: 'Auditor' };
const describe = (code) => {
  if (!code) return '';
  const [letters, scope] = code.split(':');
  return `${letters.split('').map((l) => LETTERS[l]).join(', ')}${scope ? ` (${SCOPES[scope] || scope})` : ''}`;
};

export default function Users() {
  const [tab, setTab] = useTab('people');
  return (
    <div className="stack">
      <Tabs value={tab} onChange={setTab} label="Users" tabs={[{ id: 'people', label: 'People', icon: 'users' }, { id: 'roles', label: 'Roles and permissions', icon: 'shield' }]} />
      {tab === 'people' ? <People /> : <Roles />}
    </div>
  );
}

function People() {
  const { api, user, users: publicUsers, initiatives, mode, refresh } = useApp();
  const drawer = useRecordDrawer();
  const dialog = useDialog();
  const toast = useToast();
  const isAdmin = hasRole(user, 'admin');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => (isAdmin ? api.op('userDirectory', {}) : Promise.resolve(publicUsers)).then((r) => { setRows(r); setError(null); }).catch(setError), [api, isAdmin, publicUsers]);
  useEffect(() => { load(); }, [load]);
  const saved = async () => { await refresh(); load(); };
  const setPassword = async (u) => {
    const pw = await dialog.prompt({ title: `Set a password for ${u.name}`, message: 'Local accounts are for break-glass administration only; everyone else signs in through single sign-on (SEC-01). Use at least 14 characters.', label: 'New password', multiline: false });
    if (!pw) return;
    try { await api.setPassword(u.id, pw); toast.success('Password set'); } catch (e) { toast.error(e); }
  };
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!rows) return <Spinner />;
  const iniName = Object.fromEntries(initiatives.map((i) => [i.id, i.shortName || i.name]));
  return (
    <DataGrid id="admin-users" type="user" title="Users" rows={sortBy(rows, 'name')} exportName="Users"
      onRowClick={isAdmin ? (u) => drawer.open({ type: 'user', id: u.id, onSaved: saved, exclude: ['notify'] }) : undefined}
      columns={[
        { key: 'name', label: 'Name', render: (u) => <span><strong>{u.name}</strong><span className="sub-line tiny muted">{u.email}</span></span>, value: (u) => u.name },
        { key: 'roles', label: 'Roles', render: (u) => <span className="btn-row">{asArray(u.roles).map((r) => <Badge key={r} tone={r === 'admin' ? 'serious' : r === 'changeLead' ? 'info' : ''}>{roleLabel(r)}</Badge>)}</span>, value: (u) => asArray(u.roles).map(roleLabel).join(', ') },
        { key: 'initiatives', label: 'Initiatives', render: (u) => (u.roles?.includes('portfolio') ? <span className="small muted">All (portfolio)</span> : <span className="small">{asArray(u.initiativeIds).map((id) => iniName[id]).filter(Boolean).join(', ') || '—'}</span>), value: (u) => asArray(u.initiativeIds).length },
        { key: 'status', label: 'Status', render: (u) => (u.status === 'active' ? <Badge tone="good">Active</Badge> : <Badge>{u.status === 'left' ? 'Left' : 'Inactive'}</Badge>), value: (u) => u.status },
        { key: 'auth', label: 'Signs in with', render: (u) => (u.authProvider === 'local' ? <Badge tone="warning" icon="key">Local account</Badge> : 'Single sign-on'), value: (u) => u.authProvider || 'sso' },
        { key: 'last', label: 'Last sign-in', render: (u) => (u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : <span className="muted">—</span>), value: (u) => u.lastLoginAt || '' },
        ...(isAdmin && mode === 'server' ? [{ key: '_pw', label: '', sortable: false, render: (u) => u.authProvider === 'local' && <span onClick={(e) => e.stopPropagation()}><button type="button" className="btn btn-xs" onClick={() => setPassword(u)}><Icon name="key" />Set password</button></span> }] : []),
      ]}
      facets={[
        { key: 'role', label: 'Role', options: ROLES.map((r) => ({ id: r.id, label: r.label })), value: (u) => asArray(u.roles) },
        { key: 'status', label: 'Status', options: [{ id: 'active', label: 'Active' }, { id: 'inactive', label: 'Inactive' }, { id: 'left', label: 'Left' }], value: (u) => u.status },
      ]}
      toolbar={isAdmin && <button type="button" className="btn btn-sm btn-primary" onClick={() => drawer.open({ type: 'user', defaults: { status: 'active', authProvider: 'sso', roles: ['practitioner'] }, onSaved: saved, exclude: ['notify'] })}><Icon name="plus" />Add user</button>}
      empty={<Empty icon="users" title="No users" />} />
  );
}

function Roles() {
  const areas = Object.keys(MATRIX);
  return (
    <>
      <Card title="Roles" flush>
        <table className="tbl">
          <thead><tr><th>Role</th><th>Responsibilities</th></tr></thead>
          <tbody>{ROLES.map((r) => <tr key={r.id}><td><strong>{r.label}</strong></td><td className="small">{r.description}</td></tr>)}</tbody>
        </table>
      </Card>
      <Card title="What each role may do" sub="Create (C), view (R), change (U), delete (D) and approve (A), with any limit on scope. Record-level rules (for example, people managers see their own team) and field-level rules for sensitive fields apply on top (SEC-02)." flush>
        <div className="table-wrap">
          <table className="tbl tbl-compact perm-matrix">
            <thead><tr><th>Area</th>{ROLES.map((r) => <th key={r.id} className="center" title={r.label}><abbr title={r.label}>{SHORT[r.id] || r.label}</abbr></th>)}</tr></thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a}>
                  <th scope="row">{AREA_LABELS[a] || a}</th>
                  {ROLES.map((r) => { const code = MATRIX[a][r.id]; return <td key={r.id} className="center" title={code ? `${r.label}: ${describe(code)}` : `${r.label}: no access`}>{code ? <code>{code}</code> : <span className="muted">—</span>}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
