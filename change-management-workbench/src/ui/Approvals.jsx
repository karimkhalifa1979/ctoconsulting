// Approval workflow panel (WFL-001, STR-006, PLN-007, COM-005, ART-014): submit with approvers and rule,
// decide, withdraw, and see the history of every request for an item.
import { useState } from 'react';
import Icon from './Icon.jsx';
import { Badge, StatusBadge, Modal } from './core.jsx';
import { RefPicker } from './fields.jsx';
import { useApp, useDialog, useToast } from '../state/app.jsx';
import { useIniOptional, useMutator } from '../state/initiative.jsx';
import { useLookups } from './RecordForm.jsx';
import { fmtDateTime } from '../lib/format.js';
import { asArray, sortBy } from '../../shared/util.js';
import { hasRole } from '../../shared/access.js';

export function approvalsFor(records, subjectType, subjectId, component = null) {
  return sortBy(asArray(records?.approval).filter((a) => a.subjectType === subjectType && a.subjectId === subjectId && (a.component || null) === (component || null)), '-requestedAt');
}

export default function ApprovalPanel({ subjectType, subjectId, component = null, label, canSubmit = true, defaultApprovers = [], beforeSubmit, compact = false }) {
  const { user, settings } = useApp();
  const ini = useIniOptional();
  const mut = useMutator();
  const toast = useToast();
  const dialog = useDialog();
  const [submitting, setSubmitting] = useState(false);
  const list = approvalsFor(ini?.records, subjectType, subjectId, component);
  const pending = list.find((a) => a.status === 'pending');
  const mine = pending?.approvers.find((a) => a.userId === user.id && !a.decision);
  const decide = async (decision) => {
    const comment = await dialog.prompt(decision === 'reject'
      ? { title: `Reject ${label}`, label: 'Why are you rejecting it? Your comment goes to the requester.' }
      : { title: `Approve ${label}`, label: 'Comment (optional)', required: false, confirmLabel: 'Approve' });
    if (comment == null) return;
    await mut.op('decideApproval', { id: pending.id, decision, comment });
    toast.success(decision === 'approve' ? 'Approved' : 'Rejected');
  };
  return (
    <div className="stack-sm">
      <div className="row-between">
        <div className="row">
          {pending ? <StatusBadge status="pending" labelText="Awaiting approval" /> : list[0] ? <StatusBadge status={list[0].status} labelText={`Last request ${list[0].status}`} /> : <Badge>Not yet submitted</Badge>}
        </div>
        <div className="btn-row">
          {mine && <><button type="button" className="btn btn-sm btn-primary" onClick={() => decide('approve')}><Icon name="approve" />Approve</button><button type="button" className="btn btn-sm btn-danger" onClick={() => decide('reject')}>Reject</button></>}
          {pending && (pending.requestedBy === user.id || hasRole(user, 'changeLead')) && <button type="button" className="btn btn-sm" onClick={() => mut.op('withdrawApproval', { id: pending.id })}>Withdraw</button>}
          {!pending && canSubmit && !ini?.readOnly && <button type="button" className="btn btn-sm" onClick={async () => { if (beforeSubmit && !(await beforeSubmit())) return; setSubmitting(true); }}><Icon name="approve" />Submit for approval</button>}
        </div>
      </div>
      {pending && (
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {pending.approvers.map((a) => <li key={a.userId}>{a.name}: {a.decision ? <strong>{a.decision === 'approve' ? 'approved' : 'rejected'}</strong> : 'waiting'}{a.comment ? ` — “${a.comment}”` : ''}</li>)}
          <li className="muted">Rule: {pending.rule === 'any' ? 'any one approver' : 'all approvers'} · requested {fmtDateTime(pending.requestedAt, settings.timeZone)}{pending.note ? ` · ${pending.note}` : ''}</li>
        </ul>
      )}
      {!compact && list.filter((a) => a !== pending).length > 0 && (
        <details className="small">
          <summary>Approval history ({list.filter((a) => a !== pending).length})</summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {list.filter((a) => a !== pending).map((a) => <li key={a.id}><StatusBadge status={a.status} labelText={a.status} /> {fmtDateTime(a.requestedAt, settings.timeZone)} · {a.approvers.map((x) => `${x.name}${x.decision ? ` (${x.decision})` : ''}`).join(', ')}{a.snapshot?.version ? ` · version ${a.snapshot.version}` : ''}</li>)}
          </ul>
        </details>
      )}
      {submitting && <SubmitDialog subjectType={subjectType} subjectId={subjectId} component={component} label={label} defaultApprovers={defaultApprovers} onClose={() => setSubmitting(false)} />}
    </div>
  );
}

function SubmitDialog({ subjectType, subjectId, component, label, defaultApprovers, onClose }) {
  const mut = useMutator();
  const toast = useToast();
  const lookups = useLookups();
  const [approverIds, setApprovers] = useState(defaultApprovers);
  const [rule, setRule] = useState('all');
  const [note, setNote] = useState('');
  const submit = async () => {
    try {
      await mut.op('requestApproval', { subjectType, subjectId, component, approverIds, rule, note }, { quiet: true });
      toast.success(`${label} submitted for approval`);
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Modal title={`Submit ${label} for approval`} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!approverIds.length} onClick={submit}>Submit</button></>}>
      <div className="stack">
        <label className="field"><span>Approvers</span><RefPicker multiple options={lookups.optionsFor('user')} value={approverIds} onChange={setApprovers} /></label>
        <label className="field"><span>Approval rule</span><select value={rule} onChange={(e) => setRule(e.target.value)}><option value="all">All approvers must approve</option><option value="any">Any one approver can approve</option></select></label>
        <label className="field"><span>Note to approvers</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <p className="small muted">Approvers get a task and a notification. The approved version is kept with the approval record.</p>
      </div>
    </Modal>
  );
}
