// Weekly timesheet (TEX-001..005, BR-08, BR-09) and the person's expenses (TEX-008).
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { get, put, post } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { Register } from '../components/Record.jsx';
import { PageHead, Card, Status, Badge, Alert, Empty, Loading, ErrorBox, Modal, Field, Table, D, useAction, useDialog, useToast } from '../components/ui.jsx';
import { addDays, weekStart, todayIn } from '../../shared/dates.js';
import { fmtDate, fmtNum } from '../../shared/format.js';
import Icon from '../components/Icon.jsx';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const rowKey = (e) => (e.code ? `code:${e.code}` : `${e.project_id}|${e.task_id || ''}|${e.billable === false ? 'nb' : 'b'}`);

export default function Time() {
  const { me } = useSession();
  const [params, setParams] = useSearchParams();
  const today = todayIn(me.settings.firm?.timezone || 'Australia/Sydney');
  const ws = weekStart(params.get('week') || today);
  const setWeek = (w) => { params.set('week', w); setParams(params, { replace: true }); };
  const [tab, setTab] = useState('week');
  if (!me.person) return <><PageHead title="Time" /><Alert tone="warn">Your account is not linked to a person in the resource pool, so you cannot record time. Ask an administrator to link it.</Alert></>;
  return (
    <>
      <PageHead title="Time and expenses" sub="Record time weekly by project and task; submit by the cut-off. Approved time is locked (BR-09)." />
      <div className="subtabs">
        <button className={tab === 'week' ? 'active' : ''} onClick={() => setTab('week')}>Timesheet</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>History</button>
        <button className={tab === 'expenses' ? 'active' : ''} onClick={() => setTab('expenses')}>Expenses</button>
      </div>
      {tab === 'week' && <Week ws={ws} today={today} setWeek={setWeek} />}
      {tab === 'history' && <History onOpen={(w) => { setWeek(w); setTab('week'); }} />}
      {tab === 'expenses' && <Register entity="expense" query={{ person_id: me.person.id }} defaults={{ person_id: me.person.id }} title="My expenses" sub="Claims against a project with a receipt; your project manager approves them (TEX-008)." />}
    </>
  );
}

function Week({ ws, today, setWeek }) {
  const { me } = useSession();
  const q = useApi('/api/time/week', { week_start: ws });
  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState({});
  const [run, busy] = useAction();
  const dialog = useDialog();
  const toast = useToast();
  const data = q.data;
  const dates = useMemo(() => DAYS.map((_, i) => addDays(ws, i)), [ws]);

  // Pivot entries into one row per project/task/billable (or non-project code), one cell per day.
  useEffect(() => {
    if (!data) return;
    const m = new Map();
    const validated = data.entries.filter((x) => !x.adjustment_of);
    for (const e of validated) {
      const k = rowKey(e);
      if (!m.has(k)) m.set(k, { key: k, project_id: e.project_id, task_id: e.task_id, code: e.code, billable: e.billable !== false, notes: e.notes || '', cells: {} });
      const r = m.get(k);
      const c = r.cells[e.date];
      r.cells[e.date] = c ? { ...c, hours: c.hours + Number(e.hours), ids: [...c.ids, e.id], status: c.status === e.status ? c.status : 'Mixed' } : { hours: Number(e.hours), ids: [e.id], status: e.status, comment: e.decision_comments, index: validated.indexOf(e) };
    }
    setRows([...m.values()]);
    setDirty(false);
    setErrors({});
  }, [data]);

  if (q.error) return <ErrorBox error={q.error} retry={q.reload} />;
  if (!data) return <Loading />;
  const codes = data.codes;
  const locked = (c) => c && !['Draft', 'Rejected'].includes(c.status);
  const label = (r) => {
    if (r.code) return { title: data.nonProject.find((x) => x.code === r.code)?.label || r.code, sub: 'Non-project' };
    const tc = codes.find((c) => c.project_id === r.project_id);
    const task = tc?.tasks.find((t) => t.id === r.task_id);
    return { title: `${tc?.project || 'Project'}${task ? ` · ${task.name}` : ''}`, sub: `${tc?.client || ''}${tc?.code ? ` · ${tc.code}` : ''}`, closed: tc?.closed, preBaseline: tc?.preBaseline };
  };
  const setCell = (r, date, hours) => {
    setRows(rows.map((x) => (x.key === r.key ? { ...x, cells: { ...x.cells, [date]: { ...(x.cells[date] || { ids: [], status: 'Draft' }), hours: hours === '' ? '' : Number(hours) } } } : x)));
    setDirty(true);
  };
  // Flatten back to entries: locked cells keep their ids; editable cells become one line per day.
  const entries = () => {
    const out = [];
    for (const r of rows) {
      for (const date of dates) {
        const c = r.cells[date];
        if (!c) continue;
        if (locked(c)) { for (const id of c.ids) out.push({ line: { id }, key: r.key, date }); continue; }
        if (!(Number(c.hours) > 0)) continue;
        out.push({ line: { id: c.ids[0], date, project_id: r.project_id, task_id: r.task_id, code: r.code, hours: Number(c.hours), billable: r.billable, notes: r.notes }, key: r.key, date });
      }
    }
    return out;
  };
  const save = async (quiet) => {
    setErrors({});
    const sent = entries();
    try {
      const out = await put('/api/time/week', { week_start: ws, entries: sent.map((x) => x.line) });
      q.setData(out);
      if (!quiet) toast('Timesheet saved', 'ok');
      return true;
    } catch (e) {
      // Errors come back keyed by line index; keep them against the row and day they belong to.
      const byCell = {};
      for (const [i, msgs] of Object.entries(e.details || {})) if (sent[i]) byCell[`${sent[i].key}@${sent[i].date}`] = msgs;
      setErrors(byCell);
      toast(e);
      return false;
    }
  };
  const submit = async () => {
    if (dirty && !(await save(true))) return;
    if (!(await dialog({ title: 'Submit timesheet', message: `Submit ${fmtNum(total)} hours for the week of ${fmtDate(ws)}? Lines go to each project’s approver.`, confirm: 'Submit' }))) return;
    const out = await run(() => post('/api/time/week/submit', { week_start: ws }), 'Timesheet submitted');
    if (out) q.setData(out);
  };
  const copyLast = async () => {
    const prev = await run(() => get('/api/time/week', { week_start: addDays(ws, -7) }));
    if (!prev) return;
    const have = new Set(rows.map((r) => r.key));
    const add = [];
    for (const e of prev.entries) {
      const k = rowKey(e);
      if (have.has(k)) continue;
      have.add(k);
      add.push({ key: k, project_id: e.project_id, task_id: e.task_id, code: e.code, billable: e.billable !== false, notes: '', cells: {} });
    }
    if (!add.length) { toast('Last week’s rows are already here'); return; }
    setRows([...rows, ...add]);
    setDirty(true);
  };
  const dayTotal = (date) => rows.reduce((a, r) => a + (Number(r.cells[date]?.hours) || 0), 0);
  const total = dates.reduce((a, d) => a + dayTotal(d), 0);
  const v = data.validation || { errors: {}, warnings: {} };
  const msgFor = (r) => {
    const out = { errors: [], warnings: [] };
    for (const date of dates) {
      const c = r.cells[date];
      if (!c) continue;
      out.errors.push(...(errors[`${r.key}@${date}`] || []));
      if (c.index != null && !dirty) {
        out.errors.push(...(v.errors[c.index] || []));
        out.warnings.push(...(v.warnings[c.index] || []));
      }
    }
    return { errors: [...new Set(out.errors)], warnings: [...new Set(out.warnings)] };
  };
  const anyEditable = rows.some((r) => dates.some((d) => r.cells[d] && !locked(r.cells[d]))) || rows.some((r) => !Object.keys(r.cells).length);
  const future = ws > weekStart(today);
  const std = Number(data.person.standard_hours) || 37.5;
  return (
    <div className="stack">
      <div className="flex flex-wrap">
        <div className="btn-row">
          <button className="btn btn-sm" onClick={() => setWeek(addDays(ws, -7))} aria-label="Previous week">‹</button>
          <button className="btn btn-sm" onClick={() => setWeek(weekStart(today))}>This week</button>
          <button className="btn btn-sm" onClick={() => setWeek(addDays(ws, 7))} aria-label="Next week">›</button>
        </div>
        <h2 style={{ margin: 0 }}>Week of {fmtDate(ws)}</h2>
        <Status v={data.status} />
        {data.late && <Badge tone="red">Overdue</Badge>}
        <span className="small muted">Due {fmtDate(data.deadline?.slice(0, 10))}</span>
        <span className="flex-1" />
        <div className="btn-row">
          <button className="btn btn-sm" onClick={copyLast} disabled={busy || future}>Copy last week’s rows</button>
          <button className="btn btn-sm" onClick={() => setAdding(true)} disabled={future}><Icon name="plus" /> Add row</button>
          <button className="btn btn-sm" onClick={() => save()} disabled={!dirty}>Save</button>
          <button className="btn btn-sm btn-primary" onClick={submit} disabled={busy || future || !anyEditable}><Icon name="send" /> Submit</button>
        </div>
      </div>
      {future && <Alert tone="info">Time cannot be recorded for future weeks (BR-08).</Alert>}
      <Card flush>
        <div className="table-wrap">
          <table className="table ts-table va-middle">
            <thead>
              <tr>
                <th>Project and task</th>
                {dates.map((d, i) => <th key={d} className={`day ${i > 4 ? 'weekend' : ''} ${d === today ? 'today' : ''}`}>{DAYS[i]}<div className="tiny muted">{d.slice(8)}/{d.slice(5, 7)}</div></th>)}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length && <tr><td colSpan={9}><Empty>No time recorded. Add a row or copy last week’s rows.</Empty></td></tr>}
              {rows.map((r) => {
                const l = label(r);
                const m = msgFor(r);
                const rowTotal = dates.reduce((a, d) => a + (Number(r.cells[d]?.hours) || 0), 0);
                return (
                  <tr key={r.key} className={m.errors.length ? 'has-error' : ''}>
                    <td>
                      <div className="strong">{l.title}</div>
                      <div className="tiny muted">{l.sub}{!r.code && !r.billable ? ' · non-billable' : ''}{l.preBaseline ? ' · initiation only until baselined' : ''}</div>
                      {m.errors.map((x) => <div key={x} className="tiny flag">{x}</div>)}
                      {m.warnings.map((x) => <div key={x} className="tiny" style={{ color: '#8a5d00' }}>{x}</div>)}
                    </td>
                    {dates.map((d, i) => {
                      const c = r.cells[d];
                      if (locked(c)) return <td key={d} className={`day ${i > 4 ? 'weekend' : ''}`}><span className={`ts-locked ${c.status}`} title={c.status}>{fmtNum(c.hours, 2)}</span></td>;
                      return (
                        <td key={d} className={`day ${i > 4 ? 'weekend' : ''}`}>
                          <input type="number" min="0" max="24" step="0.25" className={c?.status === 'Rejected' ? 'invalid' : ''} value={c?.hours ?? ''} disabled={future || d > addDays(weekStart(today), 6)} title={c?.status === 'Rejected' ? `Rejected: ${c.comment || ''}` : ''}
                            onChange={(e) => setCell(r, d, e.target.value)} aria-label={`${l.title} ${d}`} />
                        </td>
                      );
                    })}
                    <td className="num strong">{fmtNum(rowTotal, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">Total <span className="tiny muted">(standard {std} h)</span></td>
                {dates.map((d, i) => <td key={d} className={`day ${i > 4 ? 'weekend' : ''} ${dayTotal(d) > (me.settings.timesheets?.dailyMaxHours || 12) ? 'neg' : ''}`}>{fmtNum(dayTotal(d), 2)}</td>)}
                <td className="num strong">{fmtNum(total, 2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <div className="legend">
        <span><span className="ts-locked Submitted">8</span> Submitted</span>
        <span><span className="ts-locked Approved">8</span> Approved (locked)</span>
        <span><span className="ts-locked Rejected">8</span> Rejected — correct and resubmit</span>
      </div>
      {adding && <AddRow codes={codes} nonProject={data.nonProject} onClose={() => setAdding(false)} onAdd={(r) => {
        if (rows.some((x) => x.key === r.key)) { toast('That row is already on the timesheet'); return; }
        setRows([...rows, r]); setAdding(false); setDirty(true);
      }} />}
    </div>
  );
}

function AddRow({ codes, nonProject, onClose, onAdd }) {
  const [kind, setKind] = useState(codes.length ? 'project' : 'code');
  const [f, setF] = useState({ project_id: codes.find((c) => !c.closed)?.project_id || '', task_id: '', code: nonProject[0]?.code || '', billable: true });
  const tc = codes.find((c) => c.project_id === f.project_id);
  const tasks = (tc?.tasks || []).filter((t) => !t.closed && (!tc.preBaseline || t.initiation));
  const add = () => {
    const r = kind === 'code'
      ? { project_id: null, task_id: null, code: f.code, billable: false }
      : { project_id: f.project_id, task_id: f.task_id || null, code: null, billable: f.billable };
    onAdd({ ...r, key: rowKey(r), notes: '', cells: {} });
  };
  return (
    <Modal title="Add a row" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={kind === 'project' ? !f.project_id : !f.code} onClick={add}>Add</button></>}>
      <div className="form-grid">
        <Field label="Type" full>
          <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="project">Project time</option><option value="code">Leave, training or other non-project time</option></select>
        </Field>
        {kind === 'project' ? (
          <>
            <Field label="Project" full hint="Projects you are allocated to or a member of (TEX-001).">
              <select value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value, task_id: '' })}>
                {codes.map((c) => <option key={c.project_id} value={c.project_id} disabled={c.closed}>{c.client} · {c.project}{c.closed ? ' (closed to time)' : ''}</option>)}
              </select>
            </Field>
            <Field label="Task" full hint={tc?.preBaseline ? 'Only initiation tasks accept time until the baseline is approved.' : 'Your assigned tasks are listed first.'}>
              <select value={f.task_id} onChange={(e) => setF({ ...f, task_id: e.target.value, billable: tasks.find((t) => t.id === e.target.value)?.billable ?? true })}>
                <option value="">{tc?.preBaseline ? 'Choose an initiation task' : 'No specific task'}</option>
                {[...tasks].sort((a, b) => Number(b.assigned) - Number(a.assigned)).map((t) => <option key={t.id} value={t.id}>{t.assigned ? '★ ' : ''}{t.name}{t.change_id ? ' (change)' : ''}</option>)}
              </select>
            </Field>
            <label className="check"><input type="checkbox" checked={f.billable} onChange={(e) => setF({ ...f, billable: e.target.checked })} /> Billable</label>
          </>
        ) : (
          <Field label="Code" full>
            <select value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })}>{nonProject.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function History({ onOpen }) {
  const q = useApi('/api/time/history');
  return (
    <Card title="Recent timesheets" flush>
      {q.loading && !q.data ? <Loading /> : (
        <Table rows={q.data || []} onRow={(t) => onOpen(t.week_start)} empty="No timesheets yet." columns={[
          { key: 'week_start', label: 'Week of', render: (t) => <D v={t.week_start} /> },
          { key: 'status', label: 'Status', render: (t) => <Status v={t.status} /> },
          { key: 'submitted_at', label: 'Submitted', render: (t) => (t.submitted_at ? <D v={t.submitted_at.slice(0, 10)} /> : '—') },
          { key: 'late_submission', label: 'Late', render: (t) => (t.late_submission ? <Badge tone="amber">Late</Badge> : '') },
        ]} />
      )}
      <div className="card-foot small"><Link to="/time/approvals">Approve your team’s time</Link></div>
    </Card>
  );
}
