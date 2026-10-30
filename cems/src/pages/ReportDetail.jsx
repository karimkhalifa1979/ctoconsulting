// A generated report (RPT-040..048): preview, report-level narrative, readiness warnings, drafts,
// approval, issue and distribution, supersession, the frozen snapshot and period comparison.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { post, patch } from '../lib/api.js';
import { ApprovalCard } from '../components/Record.jsx';
import { reportFile } from '../components/Reports.jsx';
import { PageHead, Card, Async, Status, Badge, DT, Alert, Empty, Field, Modal, Table, KV, Tabs, Loading, Rag, useAction, useDialog } from '../components/ui.jsx';
import { fmtDate, fmtMoneyShort, fmtPct } from '../../shared/format.js';
import Icon from '../components/Icon.jsx';

const NARRATIVE = [['key_messages', 'Key messages'], ['summary', 'Engagement summary'], ['decisions_required', 'Decisions required'], ['escalations', 'Escalations']];

export default function ReportDetail() {
  const { id } = useParams();
  const q = useApi(`/api/reports/${id}`);
  const [tab, setTab] = useState('preview');
  return (
    <Async q={q}>{(r) => (
      <>
        <PageHead title={r.name} crumbs={<><Link to="/reports">Reports</Link><span>›</span><Link to={`/engagements/${r.engagement.id}/reports`}>{r.engagement.name}</Link></>}
          sub={<>{r.report_type} · week ending {fmtDate(r.period_end)} · {r.audience === 'internal' ? 'internal' : 'client'} version {r.version} · template {r.template}</>}
          actions={<Actions r={r} reload={q.reload} />} />
        <div className="flex mb-2 flex-wrap">
          <Status v={r.status} />
          {r.locked && <Badge tone="navy"><Icon name="lock" size={11} /> Snapshot locked</Badge>}
          {r.warnings_recorded?.length > 0 && <Badge tone="amber">Generated with {r.warnings_recorded.length} warning{r.warnings_recorded.length > 1 ? 's' : ''}</Badge>}
          {r.supersedes_id && <Badge tone="gold">Correction: {r.correction_reason}</Badge>}
          {r.superseded_by_id && <Link className="badge red" to={`/reports/${r.superseded_by_id}`}>Superseded — open the correction</Link>}
          {r.pdf_error && <Badge tone="grey" title={r.pdf_error}>No PDF</Badge>}
          {r.ai_used && <Badge tone="teal">AI-assisted narrative</Badge>}
        </div>
        {r.approval && r.approval.status === 'Pending' && <div className="mb-2"><ApprovalCard a={r.approval} onDecided={q.reload} /></div>}
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: 'preview', label: 'Preview' },
          { id: 'narrative', label: 'Narrative' },
          { id: 'readiness', label: 'Readiness', count: r.warnings_recorded?.length || null },
          { id: 'drafts', label: 'Drafts', count: r.drafts?.length },
          { id: 'distribution', label: 'Distribution', count: r.distributions?.length || null },
          { id: 'history', label: 'History' },
          { id: 'snapshot', label: 'Snapshot' },
          { id: 'compare', label: 'Compare' },
        ]} />
        {tab === 'preview' && <Preview r={r} />}
        {tab === 'narrative' && <Narrative r={r} reload={q.reload} />}
        {tab === 'readiness' && <Readiness r={r} />}
        {tab === 'drafts' && <Drafts r={r} />}
        {tab === 'distribution' && <Distribution r={r} />}
        {tab === 'history' && <History r={r} />}
        {tab === 'snapshot' && <Snapshot r={r} />}
        {tab === 'compare' && <Compare r={r} />}
      </>
    )}</Async>
  );
}

function Actions({ r, reload }) {
  const nav = useNavigate();
  const [run, busy] = useAction();
  const dialog = useDialog();
  const [issuing, setIssuing] = useState(false);
  const regenerate = async () => {
    const out = await run(() => post(`/api/reports/${r.id}/regenerate`), 'New draft generated from current data');
    if (out) reload();
  };
  const submit = async () => {
    const out = await run(() => post(`/api/reports/${r.id}/submit`), 'Submitted to the engagement executive');
    if (out) reload();
  };
  const supersede = async () => {
    const reason = await dialog({ title: 'Issue a correction (RPT-041)', message: 'A new version is generated from the same period and supersedes this one when issued. The original stays in the archive.', input: true, required: true, label: 'Reason for the correction', confirm: 'Create correction' });
    if (!reason) return;
    const out = await run(() => post(`/api/reports/${r.id}/supersede`, { reason }), 'Correction drafted');
    if (out?.report) nav(`/reports/${out.report.id}`);
  };
  const withdraw = async () => {
    const reason = await dialog({ title: 'Withdraw this draft', input: 'line', required: true, label: 'Reason', confirm: 'Withdraw', danger: true });
    if (!reason) return;
    const out = await run(() => post(`/api/reports/${r.id}/withdraw`, { reason }), 'Withdrawn');
    if (out) reload();
  };
  return (
    <>
      {r.files?.pdf && <a className="btn btn-sm" href={reportFile(r.id, 'pdf')}><Icon name="download" /> PDF</a>}
      {r.files?.docx && <a className="btn btn-sm" href={reportFile(r.id, 'docx')}><Icon name="download" /> Word</a>}
      {r.can?.edit && <button className="btn btn-sm" disabled={busy} onClick={regenerate}><Icon name="refresh" /> Regenerate</button>}
      {r.can?.edit && r.status === 'Draft' && <button className="btn btn-sm btn-danger" disabled={busy} onClick={withdraw}>Withdraw</button>}
      {r.can?.submit && <button className="btn btn-sm btn-primary" disabled={busy} onClick={submit}><Icon name="send" /> Submit for approval</button>}
      {r.can?.issue && <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => setIssuing(true)}><Icon name="send" /> Issue and distribute</button>}
      {r.can?.supersede && <button className="btn btn-sm" disabled={busy} onClick={supersede}>Issue a correction</button>}
      {issuing && <Issue r={r} onClose={() => setIssuing(false)} onDone={() => { setIssuing(false); reload(); }} />}
    </>
  );
}

// RPT-041..046: issuing locks the snapshot; distribution goes to the engagement's list.
function Issue({ r, onClose, onDone }) {
  const lists = useApi('/api/e/distribution_list', { engagement_id: r.engagement.id });
  const [run, busy] = useAction();
  const [f, setF] = useState({ distribute: true, channel: 'attachment', message: '', extra: '', exception_reason: '' });
  const list = (lists.data || []).find((d) => (d.report_type || 'Weekly status') === r.report_type) || (lists.data || [])[0];
  const recipients = (list?.recipients || []).filter((x) => r.audience === 'client' || x.kind !== 'client');
  const go = async () => {
    const out = await run(() => post(`/api/reports/${r.id}/issue`, {
      distribute: f.distribute, channel: f.channel, message: f.message || undefined, exception_reason: f.exception_reason || undefined,
      extra_recipients: f.extra.split(/[,;\s]+/).filter(Boolean),
    }), f.distribute ? 'Issued and distributed' : 'Issued');
    if (out) onDone();
  };
  return (
    <Modal title="Issue the report" wide onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={go}>Issue</button></>}>
      <Alert tone="info">Issuing locks the report and its data snapshot, and marks the status updates used as reported (BR-07). Corrections are issued as a new version.</Alert>
      <label className="check mt-2"><input type="checkbox" checked={f.distribute} onChange={(e) => setF({ ...f, distribute: e.target.checked })} /> Distribute now</label>
      {f.distribute && (
        <div className="form-grid mt-2">
          <Field label="Recipients from the distribution list (STK-004)" full>
            {lists.loading ? <Loading /> : !recipients.length ? <Alert tone="warn">The engagement has no distribution list for this report type.</Alert> : (
              <div className="chips">{recipients.map((x) => <span key={x.email} className="chip" title={x.email}>{x.name} <span className="tiny muted">{x.kind}</span></span>)}</div>
            )}
          </Field>
          <Field label="Send as">
            <select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
              <option value="attachment">Email with the PDF attached</option>
              <option value="link">Email with a secure portal link</option>
              <option value="both">Both</option>
            </select>
          </Field>
          <Field label="Additional recipients" hint="Firm colleagues, or client addresses with an authorised exception (RPT-046)."><input type="text" value={f.extra} onChange={(e) => setF({ ...f, extra: e.target.value })} placeholder="name@example.com" /></Field>
          {f.extra.trim() && <Field label="Exception reason for off-list external recipients" full><input type="text" value={f.exception_reason} onChange={(e) => setF({ ...f, exception_reason: e.target.value })} /></Field>}
          <Field label="Message" full hint="Leave blank for the standard covering note."><textarea rows={4} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
        </div>
      )}
    </Modal>
  );
}

function Preview({ r }) {
  const q = useApi(`/api/reports/${r.id}/html`);
  return (
    <div className="split">
      <Card title="Document preview" sub="Rendered from the Word file; open the PDF for the exact layout.">
        <Async q={q}>{(d) => <div className="doc-preview" dangerouslySetInnerHTML={{ __html: d.html }} />}</Async>
      </Card>
      <div className="stack">
        {r.files?.pdf ? (
          <Card title="PDF" flush><iframe title="Report PDF" src={`${reportFile(r.id, 'pdf')}?inline=1`} style={{ width: '100%', height: 620, border: 0 }} /></Card>
        ) : <Alert tone="info">{r.pdf_error ? `No PDF: ${r.pdf_error}.` : 'Word output only.'}</Alert>}
        <Card title="About this report">
          <KV items={[
            ['Generated', <><DT v={r.generated_at} /> in {Math.round((r.generation_ms || 0) / 100) / 10} s</>],
            ['Issued', r.issued_at ? <DT v={r.issued_at} /> : null],
            ['Projects', `${r.project_ids?.length || 0}`],
            ['Formats', (r.formats || []).join(', ')],
            r.approved_at && ['Approved', <DT v={r.approved_at} />],
          ]} />
        </Card>
      </div>
    </div>
  );
}

// RPT-031: report-level narrative; regenerate to apply it to the document.
function Narrative({ r, reload }) {
  const [n, setN] = useState(r.narrative || {});
  const [run, busy] = useAction();
  const save = async (regen) => {
    const out = await run(() => patch(`/api/reports/${r.id}/narrative`, { narrative: n }), regen ? null : 'Narrative saved');
    if (!out) return;
    if (regen) await run(() => post(`/api/reports/${r.id}/regenerate`), 'Saved and regenerated');
    reload();
  };
  return (
    <Card title="Report narrative" sub="Engagement-level text for this report. Project narrative comes from the approved status updates; edit those on each project’s Status tab."
      actions={r.can?.edit && <><button className="btn btn-sm" disabled={busy} onClick={() => save(false)}>Save</button><button className="btn btn-sm btn-primary" disabled={busy} onClick={() => save(true)}>Save and regenerate</button></>}>
      <div className="form-grid">
        {NARRATIVE.map(([k, label]) => (
          <Field key={k} label={label} full>
            {r.can?.edit ? <textarea rows={3} value={n[k] || ''} onChange={(e) => setN({ ...n, [k]: e.target.value })} /> : <div className="small pre">{n[k] || <span className="muted">—</span>}</div>}
          </Field>
        ))}
      </div>
    </Card>
  );
}

function Readiness({ r }) {
  const ready = r.readiness;
  return (
    <Card title="Readiness at generation (RPT-034)">
      {r.warnings_recorded?.length > 0 && <Alert tone="warn">Generated with warnings: {r.warnings_recorded.join('; ')}</Alert>}
      {!ready ? <Empty>No readiness record.</Empty> : (
        <div className="stack-sm mt-2">
          {ready.checks.map((c) => (
            <div key={c.key}>
              <div className="flex"><Icon name={c.ok ? 'checkCircle' : 'alert'} size={15} /><span className={c.ok ? '' : 'strong'}>{c.label}</span></div>
              {!c.ok && <ul className="small" style={{ margin: '4px 0 0 22px', paddingLeft: 14 }}>{c.items.map((x, i) => <li key={i}>{x.text}</li>)}</ul>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Drafts({ r }) {
  return (
    <Card title="Drafts" sub="Every generated draft is kept with its snapshot and any rendering warnings." flush>
      <Table rows={[...(r.drafts || [])].reverse().map((x) => ({ ...x, id: x.no }))} columns={[
        { key: 'no', label: 'Draft', num: true },
        { key: 'at', label: 'Generated', render: (x) => <DT v={x.at} /> },
        { key: 'ms', label: 'Time', num: true, render: (x) => `${Math.round((x.ms || 0) / 100) / 10} s` },
        { key: 'warnings', label: 'Readiness warnings', render: (x) => <span className="small">{(x.warnings || []).join('; ') || '—'}</span> },
        { key: 'render_warnings', label: 'Rendering', render: (x) => <span className="small">{(x.render_warnings || []).slice(0, 3).join('; ') || '—'}</span> },
        { key: 'files', label: 'Files', sort: false, render: (x) => <span className="flex">{x.pdf && <a className="btn btn-xs" href={reportFile(r.id, 'pdf', x.no)}>PDF</a>}{x.docx && <a className="btn btn-xs" href={reportFile(r.id, 'docx', x.no)}>Word</a>}</span> },
      ]} />
    </Card>
  );
}

function Distribution({ r }) {
  return (
    <Card title="Distribution (RPT-045)" sub="Each send is recorded with its recipients and channel; client versions are also published to the portal." flush>
      <Table rows={r.distributions || []} empty="Not distributed yet." columns={[
        { key: 'sent_at', label: 'Sent', render: (x) => <DT v={x.sent_at} /> },
        { key: 'channel', label: 'Channel' },
        { key: 'recipients', label: 'Recipients', sort: false, render: (x) => <span className="small">{(x.recipients || []).map((y) => y.name || y.email).join(', ')}</span> },
        { key: 'off_list', label: 'Off-list', sort: false, render: (x) => (x.off_list?.length ? <span className="small">{x.off_list.join(', ')}{x.exception_reason ? ` — ${x.exception_reason}` : ''}</span> : '—') },
      ]} />
    </Card>
  );
}

function History({ r }) {
  return (
    <Card title="History">
      <ul className="timeline">
        {[...(r.history || [])].reverse().map((h, i) => <li key={i}><div className="small"><b>{h.event}</b></div><div className="tiny muted"><DT v={h.at} />{h.warnings?.length ? ` · ${h.warnings.length} warnings` : ''}</div></li>)}
      </ul>
    </Card>
  );
}

// RPT-030: the frozen data behind the report.
function Snapshot({ r }) {
  const q = useApi(`/api/reports/${r.id}/snapshot`);
  return (
    <Async q={q}>{(s) => {
      const e = s.data?.engagement || {};
      return (
        <div className="stack">
          <Card title="Snapshot" sub="The report is rendered only from this data, so it can be reproduced exactly.">
            <KV items={[
              ['As at', fmtDate(s.as_at)], ['Audience', s.audience], ['Locked', s.locked ? 'Yes — issued' : 'No'],
              ['Integrity (SHA-256)', <span className="mono">{s.sha256}</span>],
            ]} />
          </Card>
          <Card title="Headline figures in the snapshot" flush>
            <Table rows={(e.projects || []).map((p, i) => ({ id: i, name: p.project?.name, rag: p.status?.overall_rag, pct: p.project?.percent_complete, fees: p.fin?.forecast_fees_at_completion, invoiced: p.fin?.invoiced_to_date }))} columns={[
              { key: 'name', label: 'Project' },
              { key: 'rag', label: 'Overall', render: (x) => <Rag v={x.rag} sm /> },
              { key: 'pct', label: 'Complete', num: true, render: (x) => (x.pct == null ? '—' : typeof x.pct === 'number' ? fmtPct(x.pct) : x.pct) },
              { key: 'fees', label: 'Fees at completion', num: true, render: (x) => (typeof x.fees === 'number' ? fmtMoneyShort(x.fees) : x.fees ?? '—') },
              { key: 'invoiced', label: 'Invoiced', num: true, render: (x) => (typeof x.invoiced === 'number' ? fmtMoneyShort(x.invoiced) : x.invoiced ?? '—') },
            ]} />
          </Card>
          <details className="card card-body"><summary className="strong">Raw snapshot data</summary><pre className="mono" style={{ maxHeight: 480, overflow: 'auto' }}>{JSON.stringify(s.data, null, 2)}</pre></details>
        </div>
      );
    }}</Async>
  );
}

// RPT-048: compare with another period.
function Compare({ r }) {
  const others = useApi('/api/reports', { engagement_id: r.engagement.id, report_type: r.report_type });
  const [other, setOther] = useState('');
  const cmp = useApi(other ? '/api/reports/compare' : null, { a: other, b: r.id });
  const list = (others.data || []).filter((x) => x.id !== r.id && x.audience === r.audience);
  return (
    <Card title="Compare periods (RPT-048)" actions={<select value={other} onChange={(e) => setOther(e.target.value)} style={{ width: 'auto' }}><option value="">Compare with…</option>{list.map((x) => <option key={x.id} value={x.id}>{x.name} ({fmtDate(x.period_end)})</option>)}</select>}>
      {!other ? <Empty>Choose an earlier report.</Empty> : <Async q={cmp}>{(c) => (
        <>
          <div className="grid g-2 mb-2">
            {[c.a, c.b].map((x) => <div key={x.name} className="tile"><div className="label">{fmtDate(x.period)}</div><div className="value"><Rag v={x.overall} /></div><div className="sub">{x.name}</div></div>)}
          </div>
          <Table rows={c.projects.map((p, i) => ({ ...p, id: i }))} columns={[
            { key: 'project', label: 'Project' },
            { key: 'a', label: fmtDate(c.a.period), sort: false, render: (p) => <Rag v={p.a?.overall} sm /> },
            { key: 'b', label: fmtDate(c.b.period), sort: false, render: (p) => <Rag v={p.b?.overall} sm /> },
            { key: 'aOpenRisks', label: `Open risks ${fmtDate(c.a.period)}`, num: true },
            { key: 'bOpenRisks', label: `Open risks ${fmtDate(c.b.period)}`, num: true },
          ]} />
        </>
      )}</Async>}
    </Card>
  );
}
