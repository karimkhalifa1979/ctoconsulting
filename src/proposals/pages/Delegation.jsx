import { useState } from 'react';
import { useP } from '../lib/store.jsx';
import { Card, PageHead } from '../../components/ui.jsx';
import { Field, UserSelect, Person } from '../components/common.jsx';
import { activeDelegation, authorityOf } from '../core/permissions.js';
import { fmtDate, todayISO, addDays } from '../core/util.js';
import { roleLabel } from '../core/constants.js';

// Approval delegation while away (WF-14): only to someone with equal or higher approval authority.
export default function Delegation() {
  const { view, me, dispatch } = useP();
  const cur = me.delegation;
  const [d, setD] = useState({ toUserId: cur?.toUserId || '', from: cur?.from || todayISO(), until: cur?.until || addDays(todayISO(), 14), note: cur?.note || '' });
  const mine = authorityOf(me);
  const toMe = view.users.filter((u) => activeDelegation(u)?.toUserId === me.id);
  const approverRoles = me.roles.filter((r) => ['partner', 'commercial', 'reviewer'].includes(r));
  return (
    <div className="stack">
      <PageHead eyebrow="Work" title="Delegate my approvals">While you are away, a delegate with equal or higher approval authority can decide gates on your behalf. The audit trail records both names.</PageHead>
      <div className="split">
        <Card title="My delegation" subtitle={approverRoles.length ? `Your approval roles: ${approverRoles.map(roleLabel).join(', ')}` : 'You do not hold an approver role, so there is nothing to delegate.'}>
          {cur && <div className={`callout ${activeDelegation(me) ? 'good' : ''} small`}>{activeDelegation(me) ? 'Active' : 'Scheduled'}: delegated to <strong>{view.users.find((u) => u.id === cur.toUserId)?.name}</strong> from {fmtDate(cur.from)} to {fmtDate(cur.until)}.{cur.note ? ` “${cur.note}”` : ''}</div>}
          <fieldset disabled={!approverRoles.length} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="form-grid">
              <Field label="Delegate to" full><UserSelect value={d.toUserId} onChange={(v) => setD({ ...d, toUserId: v || '' })} filter={(u) => u.id !== me.id && authorityOf(u) >= mine && mine > 0} placeholder="Choose a person with equal or higher authority" /></Field>
              <Field label="From"><input type="date" value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })} /></Field>
              <Field label="Until"><input type="date" value={d.until} onChange={(e) => setD({ ...d, until: e.target.value })} /></Field>
              <Field label="Note" full><input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="For example: on leave, back 14 October" /></Field>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" disabled={!d.toUserId} onClick={() => dispatch('user.delegate', d, { success: 'Delegation saved; your delegate has been notified' })}>Save delegation</button>
              {cur && <button className="btn" onClick={() => dispatch('user.delegate', { toUserId: null }, { success: 'Delegation removed' })}>Remove delegation</button>}
            </div>
          </fieldset>
        </Card>
        <Card title="Delegated to me" pad={false}>
          {toMe.length ? toMe.map((u) => <div key={u.id} className="work-item" style={{ gridTemplateColumns: '1fr auto' }}><Person id={u.id} sub={u.roles.map(roleLabel).join(', ')} /><span className="mini">until {fmtDate(u.delegation.until)}</span></div>) : <p className="muted small" style={{ padding: '0 18px 12px' }}>No one has delegated approvals to you.</p>}
          {toMe.length > 0 && <p className="mini" style={{ padding: '0 18px 12px' }}>Their pending approvals appear in My work and on each bid’s Approvals tab.</p>}
        </Card>
      </div>
    </div>
  );
}
