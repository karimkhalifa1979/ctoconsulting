// Project governance (GOV-001..012, UC-01): brief and business case, commercial approval,
// governance roles and RACI, tolerances, baseline approval and stage gates.
import { useState } from 'react';
import { useProject } from './Project.jsx';
import { useApi } from '../../lib/hooks.js';
import { get, post, put } from '../../lib/api.js';
import { RecordView, RecordDrawer, Approvals, Register } from '../../components/Record.jsx';
import { Async, Card, Table, Status, Badge, D, DT, Alert, Empty, Field, Modal, KV, Money, useAction, useDialog } from '../../components/ui.jsx';
import { fmtPct } from '../../../shared/format.js';
import Icon from '../../components/Icon.jsx';

export default function Governance() {
  const { p, can, reload } = useProject();
  const q = useApi(`/api/e/project/${p.id}`);
  const [editing, setEditing] = useState(false);
  const edit = can('plan', 'U');
  return (
    <div className="stack">
      <div className="grid g-2">
        <Commercial />
        <Baseline />
      </div>
      <Card title="Approvals for this project" sub="Commercial approval, baseline and re-baseline, closure exceptions.">
        <Approvals entity="project" id={p.id} onDecided={reload} />
      </Card>
      <div className="grid g-2">
        <Roles />
        <Tolerances />
      </div>
      <Raci />
      <Gates />
      <Card title="Brief, business case and management approaches" sub="Project brief (GOV-002), client business case reference (GOV-004), tailoring (GOV-011) and management approaches (GOV-012)."
        actions={edit && <button className="btn btn-sm btn-navy" onClick={() => setEditing(true)}><Icon name="edit" /> Edit</button>}>
        {q.data ? <RecordView entity="project" rec={q.data} /> : <Empty>Loading…</Empty>}
      </Card>
      {editing && <RecordDrawer entity="project" id={p.id} startEditing scope={{ engagement_id: p.engagement_id }} onClose={() => setEditing(false)} onSaved={() => { q.reload(); reload(); }} />}
    </div>
  );
}

// GOV-003: price, cost and margin approved before initiation.
function Commercial() {
  const { p, d, can, costs, reload } = useProject();
  const c = p.commercial || { status: 'Not submitted' };
  const [open, setOpen] = useState(false);
  const canSubmit = (can('setup', 'U') || can('budget', 'U')) && ['Not submitted', 'Rejected', 'Returned'].includes(c.status);
  return (
    <Card title="Commercial approval (GOV-003)" sub="Price, cost and margin approved by the engagement manager, and by the executive above the value threshold or below the target margin."
      actions={canSubmit && <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>Submit for approval</button>}>
      <KV items={[
        ['Status', <Status v={c.status} />],
        c.price != null && ['Price', <Money v={c.price} />],
        costs && c.cost != null && ['Cost', <Money v={c.cost} />],
        costs && c.margin != null && ['Margin', fmtPct(c.margin, 1)],
        c.route && ['Route', c.route.join(' → ')],
        c.submitted_at && ['Submitted', <D v={c.submitted_at} />],
        c.notes && ['Notes', c.notes],
      ]} />
      {open && <CommercialForm onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload(); }} suggestedPrice={d.fin?.contractValue} />}
    </Card>
  );
}

function CommercialForm({ onClose, onDone, suggestedPrice }) {
  const { p } = useProject();
  const [run, busy] = useAction();
  const [f, setF] = useState({ price: suggestedPrice || '', cost: '', notes: '' });
  const margin = f.price ? (Number(f.price) - Number(f.cost || 0)) / Number(f.price) : null;
  const submit = async () => {
    const out = await run(() => post(`/api/projects/${p.id}/commercial`, { price: Number(f.price), cost: Number(f.cost), notes: f.notes }), 'Submitted for commercial approval');
    if (out) onDone();
  };
  return (
    <Modal title="Commercial approval" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.price} onClick={submit}>Submit</button></>}>
      <div className="form-grid">
        <Field label="Price (ex GST)" required><input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
        <Field label="Estimated cost" required><input type="number" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
        <Field label="Margin" full><div className="strong">{margin == null ? '—' : fmtPct(margin, 1)}</div></Field>
        <Field label="Notes" full><textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

// UC-01 / BR-10: baseline and re-baseline with approval; history of baselines.
function Baseline() {
  const { p, can, reload } = useProject();
  const list = useApi(`/api/projects/${p.id}/baselines`);
  const [run, busy] = useAction();
  const dialog = useDialog();
  const submit = async () => {
    let reason;
    if (p.baseline_approved) {
      reason = await dialog({ title: 'Submit a re-baseline (BR-10)', message: 'Re-baselining is for approved changes or a fundamental re-plan; the reason is recorded and shown in reports.', input: true, required: true, label: 'Reason' });
      if (!reason) return;
    } else if (!(await dialog({ title: 'Submit the baseline', message: 'The plan, budget, milestones and tolerances are frozen as the baseline when the engagement manager approves. Time codes then open for delivery tasks.', confirm: 'Submit' }))) return;
    const out = await run(() => post(`/api/projects/${p.id}/baseline`, { reason }), 'Baseline submitted for approval');
    if (out) { reload(); list.reload(); }
  };
  return (
    <Card title="Baseline" sub="Scope, schedule and budget frozen at approval; changes go through change control (UC-01, BR-10)."
      actions={can('plan', 'U') && !p.baseline_pending && <button className="btn btn-sm btn-primary" disabled={busy} onClick={submit}>{p.baseline_approved ? 'Submit re-baseline' : 'Submit baseline'}</button>}>
      {p.baseline_pending && <Alert tone="info">Awaiting approval.</Alert>}
      {!p.baseline_approved && !p.baseline_pending && <Alert tone="warn">Not yet baselined. Only initiation tasks accept time until the baseline is approved.</Alert>}
      <Async q={list}>{(rows) => (!rows.length ? <Empty>No baselines yet.</Empty> : (
        <Table compact rows={rows} columns={[
          { key: 'version_no', label: 'Version', num: true },
          { key: 'created_at', label: 'Approved', render: (b) => <DT v={b.created_at} /> },
          { key: 'end_date', label: 'End date', render: (b) => <D v={b.end_date} /> },
          { key: 'bac', label: 'BAC', num: true, render: (b) => (b.bac != null ? <Money v={b.bac} /> : '—') },
          { key: 'items', label: 'Tasks', num: true },
          { key: 'reason', label: 'Reason', render: (b) => <span className="small">{b.reason || 'Initial baseline'}</span> },
        ]} />
      ))}</Async>
    </Card>
  );
}

function useGovernanceSave() {
  const { p, reload } = useProject();
  const [run, busy] = useAction();
  const save = async (body, msg) => {
    const out = await run(() => put(`/api/projects/${p.id}/governance`, body), msg);
    if (out) reload();
    return out;
  };
  return [save, busy];
}

// GOV-005: governance roles from the delivery profile with Firm and client names.
function Roles() {
  const { p, can } = useProject();
  const [rows, setRows] = useState(p.governance_roles || []);
  const [save, busy] = useGovernanceSave();
  const edit = can('plan', 'U');
  const set = (i, patchObj) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patchObj } : r)));
  return (
    <Card title="Governance roles (GOV-005)" sub="From the delivery profile, for example executive, senior user and senior supplier." flush
      actions={edit && <>
        <button className="btn btn-sm" onClick={() => setRows([...rows, { role: '', name: '', org: 'Firm' }])}><Icon name="plus" /> Add</button>
        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => save({ governance_roles: rows }, 'Governance roles saved')}>Save</button>
      </>}>
      <div className="table-wrap">
        <table className="table compact">
          <thead><tr><th>Role</th><th>Name</th><th>Organisation</th></tr></thead>
          <tbody>
            {!rows.length && <tr><td colSpan={3} className="muted">No roles.</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{edit ? <input type="text" value={r.role} onChange={(e) => set(i, { role: e.target.value })} /> : r.role}</td>
                <td>{edit ? <input type="text" value={r.name || ''} onChange={(e) => set(i, { name: e.target.value })} /> : r.name || <span className="flag small">Not assigned</span>}</td>
                <td>{edit ? <select value={r.org} onChange={(e) => set(i, { org: e.target.value })}><option>Firm</option><option>Client</option><option>Third party</option></select> : r.org}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// BR-04: tolerances for cost, time, scope, quality, benefits, risk and sustainability.
function Tolerances() {
  const { p, can } = useProject();
  const [t, setT] = useState(p.tolerances || {});
  const [save, busy] = useGovernanceSave();
  const edit = can('plan', 'U') && (!p.baseline_approved || can('setup', 'U'));
  const set = (k, patchObj) => setT({ ...t, [k]: { ...t[k], ...patchObj } });
  const keys = ['cost', 'time', 'scope', 'quality', 'benefits', 'risk', 'sustainability'];
  return (
    <Card title="Tolerances (BR-04)" sub={p.baseline_approved ? 'After baselining only the engagement manager changes tolerances.' : 'Agreed with the engagement manager at initiation.'}
      actions={edit && <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => save({ tolerances: t }, 'Tolerances saved')}>Save</button>}>
      <div className="stack-sm">
        {keys.map((k) => (
          <div key={k} className="flex flex-wrap">
            <span className="strong" style={{ width: 110, textTransform: 'capitalize' }}>{k}</span>
            {k === 'cost' && (edit ? <label className="small">± <input type="number" step="0.5" style={{ width: 70 }} value={Math.round((t.cost?.pct ?? 0.05) * 1000) / 10} onChange={(e) => set('cost', { pct: Number(e.target.value) / 100 })} /> % of BAC</label> : <Badge>{fmtPct(t.cost?.pct, 1)} of BAC</Badge>)}
            {k === 'time' && (edit ? <label className="small"><input type="number" style={{ width: 70 }} value={t.time?.days ?? 10} onChange={(e) => set('time', { days: Number(e.target.value) })} /> business days</label> : <Badge>{t.time?.days} business days</Badge>)}
            <span className="flex-1">{edit ? <input type="text" value={t[k]?.note || ''} onChange={(e) => set(k, { note: e.target.value })} /> : <span className="small">{t[k]?.note}</span>}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// GOV-006: responsibility assignment for key activities.
const RACI_DEFAULT = ['Approve deliverables', 'Approve changes', 'Weekly status update', 'Risk management', 'Invoicing', 'Stage gate decision'];
function Raci() {
  const { p, can } = useProject();
  const roles = (p.governance_roles || []).map((r) => r.role).filter(Boolean);
  const [rows, setRows] = useState(p.raci?.length ? p.raci : RACI_DEFAULT.map((a) => ({ activity: a, cells: {} })));
  const [save, busy] = useGovernanceSave();
  const edit = can('plan', 'U');
  const cycle = { '': 'R', R: 'A', A: 'C', C: 'I', I: '' };
  const toggle = (i, role) => setRows(rows.map((r, j) => (j === i ? { ...r, cells: { ...r.cells, [role]: cycle[r.cells?.[role] || ''] } } : r)));
  if (!roles.length) return null;
  return (
    <Card title="RACI (GOV-006)" sub="Responsible, accountable, consulted, informed. Select a cell to change it." flush
      actions={edit && <>
        <button className="btn btn-sm" onClick={() => setRows([...rows, { activity: '', cells: {} }])}><Icon name="plus" /> Activity</button>
        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => save({ raci: rows }, 'RACI saved')}>Save</button>
      </>}>
      <div className="table-wrap">
        <table className="table compact">
          <thead><tr><th>Activity</th>{roles.map((r) => <th key={r} className="center">{r}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>{edit ? <input type="text" value={row.activity} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, activity: e.target.value } : r)))} /> : row.activity}</td>
                {roles.map((role) => (
                  <td key={role} className="center">
                    {edit ? <button type="button" className="btn btn-xs" style={{ minWidth: 28 }} onClick={() => toggle(i, role)}>{row.cells?.[role] || '·'}</button> : <b>{row.cells?.[role] || ''}</b>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// GOV-008/009: stage gates with criteria, mandatory artefacts and recorded decisions.
function Gates() {
  const { p, engId, can, lookups, reload } = useProject();
  const stages = useApi('/api/e/stage', { engagement_id: engId, project_id: p.id });
  const gates = useApi('/api/e/gate_review', { engagement_id: engId, project_id: p.id });
  const [check, setCheck] = useState(null);
  const [run, busy] = useAction();
  const dialog = useDialog();
  const submitGate = async (g) => {
    if (!(await dialog({ title: 'Submit the gate decision', message: `${g.decision}. Mandatory artefacts must be complete and approved, and continued business justification confirmed (GOV-004, GOV-009).`, confirm: 'Submit' }))) return;
    const out = await run(() => post(`/api/gates/${g.id}/submit`), 'Gate decision submitted for approval');
    if (out !== undefined) { gates.reload(); reload(); }
  };
  const showCheck = async (s) => {
    const out = await run(() => get(`/api/stages/${s.id}/gate-check`));
    if (out) setCheck({ stage: s, ...out });
  };
  const stageName = (id) => lookups?.stages?.find((s) => s.id === id)?.label;
  return (
    <>
      <Card title="Stages and gates (GOV-008)" flush>
        <Async q={stages}>{(rows) => (
          <Table rows={[...rows].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))} columns={[
            { key: 'seq', label: '#', num: true },
            { key: 'name', label: 'Stage' },
            { key: 'kind', label: 'Kind' },
            { key: 'start_date', label: 'Start', render: (s) => <D v={s.start_date} /> },
            { key: 'end_date', label: 'End', render: (s) => <D v={s.end_date} /> },
            { key: 'status', label: 'Status', render: (s) => <Status v={s.status} /> },
            { key: 'gate', label: 'Gate readiness', sort: false, render: (s) => {
              const arts = s.gate_artefacts || [];
              const done = arts.filter((a) => a.done && a.approved).length;
              return <span className="flex"><span className="small">{done}/{arts.length} artefacts</span><button className="btn btn-xs" onClick={() => showCheck(s)}>Check</button></span>;
            } },
          ]} />
        )}</Async>
      </Card>
      <Async q={gates}>{(rows) => (
        <Card title="Gate reviews" flush>
          <Table rows={rows} empty="No gate reviews yet." columns={[
            { key: 'stage_id', label: 'Stage', render: (g) => stageName(g.stage_id) },
            { key: 'date', label: 'Date', render: (g) => <D v={g.date} /> },
            { key: 'decision', label: 'Decision' },
            { key: 'business_justification', label: 'Justification confirmed', render: (g) => (g.business_justification ? 'Yes' : <span className="flag">No</span>) },
            { key: 'status', label: 'Status', render: (g) => <Status v={g.status} /> },
            { key: 'act', label: '', sort: false, render: (g) => (g.status === 'Draft' && can('plan', 'U') ? <button className="btn btn-xs btn-primary" disabled={busy} onClick={(e) => { e.stopPropagation(); submitGate(g); }}>Submit</button> : null) },
          ]} />
        </Card>
      )}</Async>
      <Register entity="gate_review" scope={{ engagement_id: engId, project_id: p.id }} defaults={{ project_id: p.id }} title="Record a gate review" sub="Create the review, then submit the decision above." onChanged={gates.reload} />
      {check && (
        <Modal title={`Gate check: ${check.stage.name}`} onClose={() => setCheck(null)} footer={<button className="btn btn-primary" onClick={() => setCheck(null)}>Close</button>}>
          {check.ok ? <Alert tone="ok">Mandatory artefacts are complete and approved.</Alert> : <Alert tone="warn">Not ready: {check.missing.length} mandatory artefact{check.missing.length === 1 ? '' : 's'} outstanding.</Alert>}
          {check.missing.length > 0 && <><h4 className="mt-2 mb-1">Artefacts outstanding</h4><ul className="small">{check.missing.map((m) => <li key={m}>{m}</li>)}</ul></>}
          {check.unmet.length > 0 && <><h4 className="mt-2 mb-1">Criteria not yet met</h4><ul className="small">{check.unmet.map((m) => <li key={m}>{m}</li>)}</ul></>}
        </Modal>
      )}
    </>
  );
}

