// Invoices (FIN-034..036): draft from unbilled time and billing events, review by the engagement
// manager and finance, issue through the accounting system, payment and disputes.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { post } from '../lib/api.js';
import { useSession, canOn } from '../lib/session.jsx';
import { Card, Table, Money, Status, D, Drawer, Field, Modal, useAction, useDialog, KV, Empty } from './ui.jsx';
import { InvoiceLines } from './fields.jsx';
import Icon from './Icon.jsx';
import { todayIn, monthOf, monthEnd, addMonths } from '../../shared/dates.js';

const NEXT = {
  Draft: [['submit', 'Submit for review', 'primary']],
  'EM review': [['em_approve', 'Approve (engagement manager)', 'primary'], ['return', 'Return to draft']],
  'Finance review': [['finance_approve', 'Approve (finance)', 'primary'], ['return', 'Return to draft']],
  Approved: [['send', 'Send to accounting and issue', 'primary'], ['void', 'Void', 'danger']],
  Issued: [['mark_paid', 'Mark paid', 'primary'], ['dispute', 'Record dispute', 'danger']],
  Overdue: [['mark_paid', 'Mark paid', 'primary'], ['dispute', 'Record dispute', 'danger']],
  Disputed: [['mark_paid', 'Mark paid', 'primary']],
};

export default function Invoices({ engagementId, projects = [], title = 'Invoices', showEngagement }) {
  const { me } = useSession();
  const list = useApi('/api/e/invoice', engagementId ? { engagement_id: engagementId } : {});
  const [open, setOpen] = useState(null);
  const [drafting, setDrafting] = useState(false);
  const [status, setStatus] = useState('');
  const canDraft = engagementId ? canOn(me, engagementId, 'billing', 'C') : me.can.finance;
  const project = (id) => projects.find((p) => p.id === id)?.name;
  const rows = (list.data || []).filter((i) => !status || i.status === status);
  const total = rows.reduce((a, i) => a + (Number(i.amount) || 0), 0);
  return (
    <Card title={title} sub="Draft → engagement manager review → finance review → issued through the accounting system → paid." flush
      actions={<>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }} aria-label="Status"><option value="">All statuses</option>{['Draft', 'EM review', 'Finance review', 'Approved', 'Issued', 'Overdue', 'Paid', 'Disputed', 'Void'].map((s) => <option key={s}>{s}</option>)}</select>
        {canDraft && <button className="btn btn-sm btn-primary" onClick={() => setDrafting(true)}><Icon name="plus" /> Draft invoice</button>}
      </>}>
      <Table rows={rows} onRow={(r) => setOpen(r.id)} initialSort={{ key: 'period_to', dir: -1 }} empty="No invoices yet." columns={[
        { key: 'number', label: 'Invoice', render: (r) => r.number || <span className="muted">Draft</span> },
        showEngagement && { key: 'engagement_id', label: 'Engagement', render: (r) => <Link to={`/engagements/${r.engagement_id}/financials`} onClick={(e) => e.stopPropagation()}>{r.engagement_code || 'Open'}</Link> },
        { key: 'project_id', label: 'Project', render: (r) => project(r.project_id) || <span className="small muted">{r.project_id ? '' : 'Engagement'}</span> },
        { key: 'po_number', label: 'PO', render: (r) => r.po_number || '—' },
        { key: 'period_to', label: 'Period to', render: (r) => <D v={r.period_to} /> },
        { key: 'issue_date', label: 'Issued', render: (r) => <D v={r.issue_date} /> },
        { key: 'due_date', label: 'Due', render: (r) => <D v={r.due_date} /> },
        { key: 'amount', label: 'Amount ex GST', num: true, render: (r) => <Money v={r.amount} decimals={2} /> },
        { key: 'total', label: 'Total inc GST', num: true, render: (r) => <Money v={r.total} decimals={2} /> },
        { key: 'status', label: 'Status', render: (r) => <Status v={r.status} /> },
      ].filter(Boolean)} />
      {rows.length > 0 && <div className="card-foot small">{rows.length} invoices · <Money v={total} decimals={2} /> ex GST</div>}
      {open && <InvoiceDrawer id={open} onClose={() => setOpen(null)} onChanged={list.reload} projectName={project} />}
      {drafting && <DraftInvoice engagementId={engagementId} projects={projects} onClose={() => setDrafting(false)} onDone={(inv) => { setDrafting(false); list.reload(); if (inv) setOpen(inv.id); }} />}
    </Card>
  );
}

function InvoiceDrawer({ id, onClose, onChanged, projectName }) {
  const q = useApi(`/api/e/invoice/${id}`);
  const [run, busy] = useAction();
  const dialog = useDialog();
  const inv = q.data;
  const act = async (action) => {
    let body = {};
    if (['dispute', 'return'].includes(action)) {
      const reason = await dialog({ title: action === 'dispute' ? 'Record dispute' : 'Return to draft', input: true, required: true, label: 'Reason' });
      if (!reason) return;
      body = { reason };
    } else if (action === 'void') {
      if (!(await dialog({ title: 'Void invoice', message: 'The billed time and events are released for a new draft.', confirm: 'Void', danger: true }))) return;
    } else if (action === 'mark_paid') {
      const date = await dialog({ title: 'Mark paid', input: 'line', label: 'Payment date (yyyy-mm-dd)', initial: todayIn('Australia/Sydney') });
      if (!date) return;
      body = { date };
    }
    const out = await run(() => post(`/api/invoices/${id}/${action}`, body), 'Invoice updated');
    if (out) { q.reload(); onChanged(); }
  };
  return (
    <Drawer wide title={inv ? `Invoice ${inv.number || '(draft)'}` : 'Invoice'} sub={inv && <Status v={inv.status} />} onClose={onClose}
      footer={inv && (NEXT[inv.status] || []).map(([a, label, tone]) => <button key={a} className={`btn ${tone === 'primary' ? 'btn-primary' : tone === 'danger' ? 'btn-danger' : ''}`} disabled={busy} onClick={() => act(a)}>{label}</button>)}>
      {!inv ? <Empty>Loading…</Empty> : (
        <div className="stack">
          <KV items={[
            ['Project', projectName(inv.project_id)], ['Purchase order', inv.po_number], ['SOW', inv.sow_reference],
            ['Period', <><D v={inv.period_from} /> to <D v={inv.period_to} /></>], ['Issued', <D v={inv.issue_date} />], ['Due', <D v={inv.due_date} />], ['Paid', <D v={inv.paid_date} />],
            ['Amount', <><Money v={inv.amount} decimals={2} /> + GST <Money v={inv.gst} decimals={2} /> = <b><Money v={inv.total} decimals={2} /></b></>],
            inv.dispute_reason && ['Dispute', inv.dispute_reason], inv.external_id && ['Accounting ID', inv.external_id],
          ]} />
          <InvoiceLines lines={inv.lines} />
          {inv.supporting_detail?.length > 0 && (
            <div>
              <h4 className="mb-1">Supporting detail: timesheet extract (TEX-006)</h4>
              <Table compact rows={inv.supporting_detail.map((x, i) => ({ ...x, id: i }))} columns={[
                { key: 'date', label: 'Date', render: (r) => <D v={r.date} /> }, { key: 'person', label: 'Person' }, { key: 'task', label: 'Activity' },
                { key: 'hours', label: 'Hours', num: true }, { key: 'days', label: 'Billable days', num: true, render: (r) => (r.days != null ? Math.round(r.days * 100) / 100 : '—') },
              ]} />
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function DraftInvoice({ engagementId, projects, onClose, onDone }) {
  const [run, busy] = useAction();
  const today = todayIn('Australia/Sydney');
  const [f, setF] = useState({ project_id: projects[0]?.id || '', period_to: monthEnd(addMonths(monthOf(today), -1)) });
  const go = async () => {
    const inv = await run(() => post('/api/invoices/draft', f), 'Draft invoice prepared');
    if (inv) onDone(inv);
  };
  return (
    <Modal title="Draft an invoice" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.project_id} onClick={go}>Prepare draft</button></>}>
      <p className="small muted">The draft includes unbilled approved time valued at the applicable rates (with day rounding per person per day, BR-12), billable expenses and supplier costs, billing events ready to invoice, caps and retainers (FIN-035, FIN-039).</p>
      <div className="form-grid">
        <Field label="Project" required>
          <select value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </Field>
        <Field label="Up to and including"><input type="date" value={f.period_to} onChange={(e) => setF({ ...f, period_to: e.target.value })} /></Field>
      </div>
      {!engagementId && <p className="small mt-2">Choose an engagement first to draft its invoices.</p>}
    </Modal>
  );
}
