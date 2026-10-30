// Timesheet and expense approval (TEX-004, TEX-008): line-level approve or reject with reasons,
// delegates acting during leave (WFL-006), and controlled adjustments of approved time (TEX-010).
import { useState } from 'react';
import { useApi } from '../lib/hooks.js';
import { post } from '../lib/api.js';
import { ApprovalCard } from '../components/Record.jsx';
import { PageHead, Card, Table, Badge, D, Empty, Loading, ErrorBox, Alert, useAction, useDialog } from '../components/ui.jsx';
import { fmtNum, fmtDate } from '../../shared/format.js';
import Icon from '../components/Icon.jsx';

export default function TimeApprovals() {
  const q = useApi('/api/time/approvals');
  return (
    <>
      <PageHead title="Approve time and expenses" sub="Approve or reject each line; rejected lines go back to the person with your reason. Approved time is locked (BR-09)." />
      {q.error ? <ErrorBox error={q.error} retry={q.reload} /> : !q.data ? <Loading /> : (
        <div className="stack">
          {!q.data.timesheets.length && !q.data.expenses.length && <Card><Empty icon="check">Nothing waiting for your approval.</Empty></Card>}
          {q.data.timesheets.map((g) => <Sheet key={`${g.person_id}|${g.week_start}`} g={g} onDone={q.reload} />)}
          {q.data.expenses.length > 0 && (
            <Card title="Expenses">
              <div className="stack">{q.data.expenses.map((a) => <ApprovalCard key={a.id} a={a} onDecided={q.reload} />)}</div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function Sheet({ g, onDone }) {
  const [sel, setSel] = useState(new Set(g.lines.map((l) => l.id)));
  const [run, busy] = useAction();
  const dialog = useDialog();
  const total = g.lines.reduce((a, l) => a + Number(l.hours), 0);
  const billable = g.lines.filter((l) => l.billable).reduce((a, l) => a + Number(l.hours), 0);
  const approve = async (ids) => {
    const out = await run(() => post('/api/time/approvals', { approve: ids }), (o) => `${o.approved} line${o.approved === 1 ? '' : 's'} approved`);
    if (out) onDone();
  };
  const reject = async (ids) => {
    const reason = await dialog({ title: `Reject ${ids.length} line${ids.length === 1 ? '' : 's'}`, message: 'The person is notified with your reason and can correct and resubmit.', input: true, required: true, label: 'Reason', confirm: 'Reject', danger: true });
    if (!reason) return;
    const out = await run(() => post('/api/time/approvals', { reject: ids.map((id) => ({ id, reason })) }), 'Rejected');
    if (out) onDone();
  };
  const onBehalf = g.lines.some((l) => l.on_behalf);
  const ids = [...sel];
  return (
    <Card title={`${g.person} — week of ${fmtDate(g.week_start)}`} sub={`${fmtNum(total, 2)} hours (${fmtNum(billable, 2)} billable) across ${new Set(g.lines.map((l) => l.project_id)).size} project${new Set(g.lines.map((l) => l.project_id)).size === 1 ? '' : 's'}`} flush
      actions={<>
        <button className="btn btn-sm btn-danger" disabled={busy || !ids.length} onClick={() => reject(ids)}>Reject selected</button>
        <button className="btn btn-sm btn-primary" disabled={busy || !ids.length} onClick={() => approve(ids)}><Icon name="check" /> Approve selected ({ids.length})</button>
      </>}>
      {onBehalf && <div className="card-body"><Alert tone="info">You are approving some lines as a delegate; this is recorded against the delegator (WFL-006).</Alert></div>}
      <Table compact rows={[...g.lines].sort((a, b) => a.date.localeCompare(b.date))} selectable selected={sel} onSelect={setSel} columns={[
        { key: 'date', label: 'Date', render: (l) => <D v={l.date} /> },
        { key: 'project', label: 'Project' },
        { key: 'task', label: 'Task', render: (l) => l.task || <span className="muted">—</span> },
        { key: 'hours', label: 'Hours', num: true, render: (l) => fmtNum(l.hours, 2) },
        { key: 'billable', label: 'Billable', render: (l) => (l.billable ? 'Yes' : <Badge tone="grey">No</Badge>) },
        { key: 'notes', label: 'Notes', render: (l) => <span className="small">{l.notes || ''}</span> },
        { key: 'flags', label: '', sort: false, render: (l) => (l.on_behalf ? <Badge tone="gold">Delegate</Badge> : null) },
      ]} />
    </Card>
  );
}
