// Project closure (CLS-001..006): checklist with automatic checks, exceptions approved by the
// executive, transfer of open RAID items, and the final position.
import { useState } from 'react';
import { useProject } from './Project.jsx';
import { useApi } from '../../lib/hooks.js';
import { post, put } from '../../lib/api.js';
import { Async, Card, Alert, Meter, Modal, Field, KV, Money, Status, useAction, useDialog } from '../../components/ui.jsx';
import { fmtDate, fmtPct } from '../../../shared/format.js';
import Icon from '../../components/Icon.jsx';

export default function Closure() {
  const { p, can, reload } = useProject();
  const q = useApi(`/api/projects/${p.id}/closure`);
  const [run, busy] = useAction();
  const dialog = useDialog();
  const [transfer, setTransfer] = useState(false);
  const edit = can('plan', 'U');
  const refresh = () => { q.reload(); reload(); };
  const mark = async (item, done) => {
    const note = done ? await dialog({ title: item.label, input: 'line', label: 'Note or evidence (optional)' }) : '';
    if (note === null) return;
    const out = await run(() => put(`/api/projects/${p.id}/closure/${item.key}`, { done, note }), done ? 'Marked complete' : 'Reopened');
    if (out) q.reload();
  };
  const exception = async () => {
    const reason = await dialog({ title: 'Request a closure exception (CLS-002)', message: 'The engagement executive approves closing with mandatory items outstanding.', input: true, required: true, label: 'Reason' });
    if (!reason) return;
    const out = await run(() => post(`/api/projects/${p.id}/closure/exception`, { reason }), 'Exception requested');
    if (out !== undefined) refresh();
  };
  const close = async () => {
    if (!(await dialog({ title: 'Close the project', message: 'The final financial position is recorded and time codes close after the grace period. The project becomes read-only.', confirm: 'Close project' }))) return;
    const out = await run(() => post(`/api/projects/${p.id}/close`), 'Project closed');
    if (out) refresh();
  };
  return (
    <div className="stack">
      {['Closed', 'Cancelled', 'Archived'].includes(p.state) && <FinalPosition />}
      <Async q={q}>{(c) => {
        const done = c.items.filter((i) => i.done).length;
        return (
          <Card title="Closure checklist (CLS-001)" sub="Automatic checks read the registers; the rest are confirmed by the project manager."
            actions={<>
              {edit && <button className="btn btn-sm" onClick={() => setTransfer(true)}>Transfer open RAID items</button>}
              {edit && c.blocking.length > 0 && !c.exception && <button className="btn btn-sm" disabled={busy} onClick={exception}>Request exception</button>}
              {can('setup', 'U') && !['Closed', 'Cancelled', 'Archived'].includes(p.state) && <button className="btn btn-sm btn-primary" disabled={busy || !c.canClose} onClick={close}>Close project</button>}
            </>}>
            <div className="flex mb-2"><span className="small">{done} of {c.items.length} complete</span><div className="flex-1"><Meter value={done / c.items.length} tone={c.blocking.length ? 'warn' : ''} /></div></div>
            {c.exception && <Alert tone={c.exception.status === 'Approved' ? 'ok' : c.exception.status === 'Rejected' ? 'error' : 'info'}>Closure exception {c.exception.status.toLowerCase()}: {c.exception.reason}</Alert>}
            <ul className="list">
              {c.items.map((i) => (
                <li key={i.key}>
                  <Icon name={i.done ? 'checkCircle' : 'circle'} size={17} />
                  <div className="grow">
                    <div>{i.label}{i.mandatory && <span className="tiny muted"> · mandatory</span>}{i.auto && <span className="tiny muted"> · checked automatically</span>}</div>
                    {i.note && <div className="tiny muted">{i.note}</div>}
                  </div>
                  {i.manual && edit && <button className="btn btn-xs" disabled={busy} onClick={() => mark(i, !i.done)}>{i.done ? 'Reopen' : 'Mark complete'}</button>}
                </li>
              ))}
            </ul>
          </Card>
        );
      }}</Async>
      {transfer && <Transfer onClose={() => setTransfer(false)} onDone={() => { setTransfer(false); refresh(); }} />}
    </div>
  );
}

function FinalPosition() {
  const { p } = useProject();
  const f = p.final_position;
  if (!f) return null;
  return (
    <Card title={`Final position (${p.state.toLowerCase()} ${fmtDate(p.closed_at || p.cancelled_at)})`} sub={p.cancel_reason ? `Cancellation reason: ${p.cancel_reason}` : 'Recorded at closure (CLS-005).'}>
      <KV items={[
        ['State', <Status v={p.state} />],
        f.contractValue != null && ['Contract value', <Money v={f.contractValue} />],
        f.invoicedToDate != null && ['Invoiced', <Money v={f.invoicedToDate} />],
        f.recognised != null && ['Fees earned', <Money v={f.recognised} />],
        f.ac != null && ['Actual cost', <Money v={f.ac} />],
        f.bac != null && ['Budget', <Money v={f.bac} />],
        f.forecastMargin != null && ['Margin', fmtPct(f.forecastMargin, 1)],
        p.time_codes_close_on && ['Time codes close', fmtDate(p.time_codes_close_on)],
      ]} />
    </Card>
  );
}

// CLS-004: transfer open risks, issues and actions to the engagement, another project or an operational owner.
function Transfer({ onClose, onDone }) {
  const { p, lookups } = useProject();
  const [run, busy] = useAction();
  const [f, setF] = useState({ target: 'engagement', target_project_id: '', owner_note: '' });
  const go = async () => {
    const out = await run(() => post(`/api/projects/${p.id}/transfer`, f), (o) => `${o.moved.length} items transferred`);
    if (out) onDone();
  };
  const others = (lookups?.projects || []).filter((x) => x.id !== p.id);
  return (
    <Modal title="Transfer open RAID items (CLS-004)" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || (f.target === 'project' && !f.target_project_id)} onClick={go}>Transfer</button></>}>
      <div className="form-grid">
        <Field label="Transfer to" full>
          <select value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })}>
            <option value="engagement">The engagement (escalated)</option>
            <option value="project">Another project in the engagement</option>
            <option value="owner">An operational owner (closes the items here)</option>
          </select>
        </Field>
        {f.target === 'project' && <Field label="Project" full><select value={f.target_project_id} onChange={(e) => setF({ ...f, target_project_id: e.target.value })}><option value="">Choose…</option>{others.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>}
        {f.target === 'owner' && <Field label="Owner and handover note" full><textarea rows={2} value={f.owner_note} onChange={(e) => setF({ ...f, owner_note: e.target.value })} /></Field>}
      </div>
    </Modal>
  );
}
