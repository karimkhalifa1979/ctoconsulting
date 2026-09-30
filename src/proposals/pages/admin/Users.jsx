import { useState } from 'react';
import { useP } from '../../lib/store.jsx';
import { Card, PageHead, Modal } from '../../../components/ui.jsx';
import { Field, Avatar } from '../../components/common.jsx';
import { ROLES, CAPABILITIES, MATRIX_ROLES, roleLabel } from '../../core/constants.js';

const GRANT = { yes: ['good', 'Yes'], team: ['warn', 'Team'], own: ['', 'Own'] };

// Users, roles and the permissions matrix (spec section 4). Access is granted by role; ethical walls apply per bid.
export default function Users() {
  const { view, me, dispatch } = useP();
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState('');
  const admin = me.roles.includes('admin');
  const users = view.users.filter((u) => !q || `${u.name} ${u.email} ${u.title}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <PageHead eyebrow="Administration" title="Users and roles" actions={admin && <button className="btn btn-primary" onClick={() => setEdit({ name: '', email: '', title: '', roles: ['author'], active: true })}>Add user</button>}>
        In production, people sign in with Microsoft Entra ID and MFA, and roles can be mapped from Entra groups. A user can hold several roles.
      </PageHead>
      <Card pad={false} title={`${view.users.length} users`} actions={<input className="searchbox" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter users" />}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Status</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><Avatar name={u.name} size="sm" /><span><strong>{u.name}</strong><div className="mini">{u.title}</div></span></span></td>
                  <td className="small">{u.email}</td>
                  <td>{u.roles.map((r) => <span key={r} className="tag" style={{ marginRight: 4 }}>{roleLabel(r)}</span>)}</td>
                  <td>{u.active === false ? <span className="pill">Inactive</span> : <span className="pill good">Active</span>}{u.delegation ? <div className="mini">Delegated</div> : null}</td>
                  <td>{admin && <button className="btn btn-sm" onClick={() => setEdit({ ...u })}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Permissions matrix" subtitle="Yes = everywhere. Team = only on bids where the person is a team member. Own = only their own sections or items." pad={false}>
        <div className="table-wrap">
          <table className="table matrix">
            <thead><tr><th>Capability</th>{MATRIX_ROLES.map((r) => <th key={r}>{ROLES.find((x) => x.id === r)?.short}</th>)}</tr></thead>
            <tbody>{CAPABILITIES.map((c) => <tr key={c.id}><td>{c.label}</td>{MATRIX_ROLES.map((r) => { const g = c.grants[r]; return <td key={r}>{g ? <span className={`pill ${GRANT[g][0]}`}>{GRANT[g][1]}</span> : <span className="muted">—</span>}</td>; })}</tr>)}</tbody>
          </table>
        </div>
        <div style={{ padding: '10px 18px' }} className="mini">Consultants maintain their own profile and confirm availability. Ethical walls exclude named people from a bid even when a role would otherwise give access. Cost rates and margin are visible only to partners, commercial approvers and administrators (PR-08).</div>
      </Card>
      <Card title="Roles">
        <dl className="kv">{ROLES.map((r) => [<dt key={`${r.id}t`}>{r.label}</dt>, <dd key={`${r.id}d`}>{r.desc}</dd>])}</dl>
      </Card>
      {edit && (
        <Modal title={edit.id ? `Edit ${edit.name}` : 'Add a user'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={!edit.name.trim() || !edit.email.trim() || !edit.roles.length} onClick={() => dispatch('user.upsert', { user: edit }, { success: 'User saved' }).then(() => setEdit(null))}>Save</button></>}>
          <div className="form-grid">
            <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Email"><input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Job title" full><input value={edit.title || ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Roles" full>
              <div className="stack" style={{ gap: 4 }}>{ROLES.map((r) => <label key={r.id} className="check"><input type="checkbox" checked={edit.roles.includes(r.id)} onChange={(e) => setEdit({ ...edit, roles: e.target.checked ? [...edit.roles, r.id] : edit.roles.filter((x) => x !== r.id) })} /><span><strong>{r.label}</strong> <span className="mini">{r.desc}</span></span></label>)}</div>
            </Field>
            <Field label="Status"><label className="check"><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /><span>Active</span></label></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
