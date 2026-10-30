// Client portal (ACC-005, RPT-044, SCP-003, CHG-005): issued reports, deliverables awaiting the
// client's acceptance, approvals such as change requests, and actions owned by the client.
// Client users see only client-visible content for engagements they are members of.
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { post } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { ApprovalCard } from '../components/Record.jsx';
import { reportFile } from '../components/Reports.jsx';
import { Card, Async, Table, Status, D, DT, Empty, Badge, Alert, useAction, useDialog } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

export default function Portal() {
  const { me, signOut } = useSession();
  return (
    <div className="portal">
      <header className="portal-head">
        <div className="brand-mark">CTO</div>
        <div className="grow"><div className="strong">{me.settings.firm?.name || 'CTO Consulting'} client portal</div><div className="tiny">Signed in as {me.user.name}</div></div>
        <Link className="btn btn-sm" to="/portal">Home</Link>
        <button className="btn btn-sm" onClick={signOut}><Icon name="logout" /> Sign out</button>
      </header>
      <main className="portal-main">
        <Routes>
          <Route index element={<Home />} />
          <Route path="reports/:id" element={<ReportView />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
    </div>
  );
}

function Home() {
  const q = useApi('/api/portal');
  const approvals = useApi('/api/approvals');
  const [run, busy] = useAction();
  const dialog = useDialog();
  const decide = async (d, act) => {
    const comments = await dialog({ title: act === 'accept' ? `Accept ${d.title}` : `Reject ${d.title}`, message: act === 'accept' ? 'Record your acceptance of this deliverable against its acceptance criteria.' : 'Explain what needs to change; the team will rework and resubmit.', input: true, required: act !== 'accept', label: 'Comments', confirm: act === 'accept' ? 'Accept' : 'Reject', danger: act !== 'accept' });
    if (comments === null) return;
    const out = await run(() => post(`/api/e/deliverable/${d.id}/do/${act}`, { comments }), act === 'accept' ? 'Accepted. Thank you.' : 'Rejection recorded');
    if (out !== undefined) q.reload();
  };
  return (
    <Async q={q}>{(d) => (
      <div className="stack">
        <h1>Welcome</h1>
        {approvals.data?.inbox?.length > 0 && (
          <Card title="Waiting for your approval" sub="For example change requests that need the client’s decision (CHG-005).">
            <div className="stack">{approvals.data.inbox.map((a) => <ApprovalCard key={a.id} a={a} onDecided={() => { approvals.reload(); q.reload(); }} />)}</div>
          </Card>
        )}
        <Card title="Deliverables awaiting your acceptance (SCP-003)" flush>
          {!d.awaitingAcceptance.length ? <Empty icon="checkCircle">Nothing awaiting your acceptance.</Empty> : (
            <Table rows={d.awaitingAcceptance} columns={[
              { key: 'title', label: 'Deliverable', render: (x) => <span><span className="strong">{x.ref} {x.title}</span><div className="tiny muted">{x.engagement}</div></span> },
              { key: 'version', label: 'Version' },
              { key: 'submitted_date', label: 'Submitted', render: (x) => <D v={x.submitted_date} /> },
              { key: 'acceptance_criteria', label: 'Acceptance criteria', render: (x) => <span className="small">{x.acceptance_criteria}</span> },
              { key: 'x', label: '', sort: false, render: (x) => <span className="flex"><button className="btn btn-xs btn-danger" disabled={busy} onClick={() => decide(x, 'reject')}>Reject</button><button className="btn btn-xs btn-primary" disabled={busy} onClick={() => decide(x, 'accept')}>Accept</button></span> },
            ]} />
          )}
        </Card>
        <Card title="Reports" sub="Reports issued to you, newest first." flush>
          <Table rows={d.reports} empty="No reports have been issued yet." columns={[
            { key: 'name', label: 'Report', render: (r) => <Link className="strong" to={`/portal/reports/${r.id}`}>{r.name}</Link> },
            { key: 'engagement', label: 'Engagement' },
            { key: 'report_type', label: 'Type' },
            { key: 'period_end', label: 'Week ending', render: (r) => <D v={r.period_end} /> },
            { key: 'issued_at', label: 'Issued', render: (r) => <DT v={r.issued_at} /> },
            { key: 'files', label: '', sort: false, render: (r) => <span className="flex">{r.files?.pdf && <a className="btn btn-xs" href={reportFile(r.id, 'pdf')}>PDF</a>}{r.files?.docx && <a className="btn btn-xs" href={reportFile(r.id, 'docx')}>Word</a>}</span> },
          ]} />
        </Card>
        <Card title="Actions for your organisation" flush>
          <Table rows={d.actions} empty="No open actions." columns={[
            { key: 'title', label: 'Action', render: (a) => <span>{a.ref} {a.title}<div className="tiny muted">{a.engagement}</div></span> },
            { key: 'owner_name', label: 'Owner' },
            { key: 'due_date', label: 'Due', render: (a) => <span className={a.overdue ? 'neg' : ''}><D v={a.due_date} /></span> },
            { key: 'status', label: 'Status', render: (a) => <Status v={a.status} /> },
          ]} />
        </Card>
        <Card title="Your engagements">
          <ul className="list">{d.engagements.map((e) => <li key={e.id}><div className="grow"><div className="strong">{e.name}</div><div className="tiny muted">{e.code} · <D v={e.start_date} /> to <D v={e.end_date} /></div></div><Status v={e.status} /></li>)}</ul>
        </Card>
      </div>
    )}</Async>
  );
}

function ReportView() {
  const { id } = useParams();
  const q = useApi(`/api/reports/${id}`);
  return (
    <Async q={q}>{(r) => (
      <div className="stack">
        <div className="flex flex-wrap">
          <Link to="/portal">‹ All reports</Link>
          <h1 style={{ margin: 0 }}>{r.name}</h1>
          <Badge>{r.report_type}</Badge>
          <span className="small muted">Week ending <D v={r.period_end} /> · issued <DT v={r.issued_at} /></span>
          <span className="flex-1" />
          {r.files?.pdf && <a className="btn btn-sm btn-primary" href={reportFile(r.id, 'pdf')}><Icon name="download" /> PDF</a>}
          {r.files?.docx && <a className="btn btn-sm" href={reportFile(r.id, 'docx')}><Icon name="download" /> Word</a>}
        </div>
        {r.files?.pdf ? <iframe title={r.name} src={`${reportFile(r.id, 'pdf')}?inline=1`} style={{ width: '100%', height: '78vh', border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }} /> : <Alert>The PDF is not available; download the Word version.</Alert>}
      </div>
    )}</Async>
  );
}
