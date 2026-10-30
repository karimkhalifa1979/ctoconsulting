// Generic, schema-driven registers: list with filters, bulk update and export, and a record drawer
// with edit form, record actions, approvals, comments and history (NFR-025).
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ENTITIES } from '../../shared/schema.js';
import { api, get, post, patch, del, download } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { useSession, canOn } from '../lib/session.jsx';
import { FieldInput, FieldValue, isVisible, useLookups, useFieldGroups, clearLookups } from './fields.jsx';
import { Drawer, Table, Tabs, Empty, ErrorBox, Loading, useAction, useDialog, Status, DT, Badge, Level, Field } from './ui.jsx';
import Icon from './Icon.jsx';

// ---------- Record actions available per register ----------
export const RECORD_ACTIONS = {
  deliverable: [
    { act: 'start', label: 'Start work', when: (r) => ['Not started'].includes(r.status) },
    { act: 'internal_review', label: 'Send to internal review', when: (r) => ['Not started', 'In progress'].includes(r.status) },
    { act: 'submit', label: 'Submit to client', primary: true, when: (r) => ['In internal review', 'In progress'].includes(r.status), ask: { title: 'Submit deliverable', message: 'A passed internal quality review is required (QLT-004). Version number for this submission:', field: 'version', optional: true, initial: (r) => r.version } },
    { act: 'accept', label: 'Record acceptance', when: (r) => r.status === 'Submitted', ask: { title: 'Record client acceptance', message: 'Record the client’s acceptance evidence (SCP-003).', field: 'comments' } },
    { act: 'reject', label: 'Record rejection', danger: true, when: (r) => r.status === 'Submitted', ask: { title: 'Record rejection', field: 'comments', label: 'Client comments' } },
    { act: 'rework', label: 'Return to rework', when: (r) => r.status === 'Rejected' },
    { act: 'withdraw', label: 'Withdraw', danger: true, when: (r) => !['Accepted', 'Withdrawn'].includes(r.status), ask: { title: 'Withdraw deliverable', field: 'reason' } },
  ],
  risk: [
    { act: 'review', label: 'Mark reviewed', when: (r) => r.status === 'Open', ask: { title: 'Review risk', message: 'Optional review comment (RSK-006).', field: 'comment', optional: true } },
    { act: 'escalate', label: 'Escalate to engagement', when: (r) => r.status === 'Open' && !r.escalated, ask: { title: 'Escalate risk', field: 'reason' } },
  ],
  issue: [{ act: 'convert_to_change', label: 'Convert to change request', when: (r) => ['Request for change', 'Off-specification'].includes(r.issue_type) && !r.change_id }],
  assumption: [
    { act: 'validate', label: 'Mark validated', when: (r) => r.status === 'Open' },
    { act: 'invalidate', label: 'Mark invalid', danger: true, when: (r) => r.status === 'Open', choose: { title: 'Assumption found invalid', message: 'Create a linked follow-up item (RAI-004)?', field: 'follow_up', options: [['risk', 'Raise a risk'], ['issue', 'Raise an issue'], ['change', 'Raise a change request']] } },
  ],
  change: [
    { act: 'assess', label: 'Start assessment', when: (r) => ['Draft', 'Submitted'].includes(r.status) },
    { act: 'submit', label: 'Submit for approval', primary: true, when: (r) => ['Draft', 'Submitted', 'Under assessment', 'Deferred'].includes(r.status) },
    { act: 'defer', label: 'Defer', when: (r) => ['Draft', 'Submitted', 'Under assessment'].includes(r.status), ask: { title: 'Defer change', field: 'reason' } },
    { act: 'record_client_approval', label: 'Record client decision', when: (r) => r.status === 'Awaiting approval', record: true },
    { act: 'implement', label: 'Mark implemented', when: (r) => r.status === 'Approved', ask: { title: 'Implementation notes', field: 'notes', optional: true } },
    { act: 'close', label: 'Close', when: (r) => ['Implemented', 'Rejected'].includes(r.status) },
    { act: 'variation_document', label: 'Generate variation document', when: (r) => ['Approved', 'Implemented', 'Awaiting approval', 'Under assessment'].includes(r.status), file: true },
  ],
  lesson: [
    { act: 'publish', label: 'Publish to knowledge base', when: (r) => !r.published, ask: { title: 'Publish lesson', message: 'Summary with client-confidential details removed (LSN-003).', field: 'summary', initial: (r) => r.published_summary || r.recommendation } },
    { act: 'unpublish', label: 'Withdraw from knowledge base', when: (r) => r.published },
  ],
  resource_request: [
    { act: 'propose', label: 'Propose person', when: (r) => ['Open', 'Proposed'].includes(r.status), person: true },
    { act: 'fulfil', label: 'Fulfil request', primary: true, when: (r) => ['Open', 'Proposed'].includes(r.status), person: true },
  ],
  expense: [{ act: 'submit', label: 'Submit for approval', primary: true, when: (r) => ['Draft', 'Rejected'].includes(r.status) }],
  milestone: [{ act: 'confirm_forecast', label: 'Confirm forecast', when: (r) => !r.actual_date }],
};

// ---------- Form ----------
export function RecordForm({ entity, rec, onChange, errors = {}, lookups, creating, engagementId }) {
  const d = ENTITIES[entity];
  const fields = d.fields.filter((f) => isVisible(f, rec) && !(creating && f.readOnly) && f.key !== 'ref' && !(f.sensitive && rec._can && !rec._can.costs));
  const groups = useFieldGroups(fields);
  const set = (k, v) => onChange({ ...rec, [k]: v });
  const wide = ['textarea', 'markdown', 'checklist', 'keydates', 'conditions', 'findings', 'measurements', 'recipients', 'estimate', 'rates', 'skills', 'expiring', 'predecessors', 'links', 'onboarding', 'list', 'tags', 'objectives', 'users', 'refs', 'versions', 'invoicelines', 'fylimits'];
  return (
    <div className="stack">
      {groups.map((g) => (
        <div key={g.name || 'main'} className={g.name ? 'form-group' : ''}>
          {g.name && <h4>{g.name}</h4>}
          <div className="form-grid">
            {g.fields.map((f) => (
              <Field key={f.key} label={f.type === 'bool' ? null : f.label} required={!f.readOnly && (f.required || f.requiredIf?.(rec))} hint={f.help} error={errors[f.key]} full={wide.includes(f.type)}>
                {f.readOnly && !creating
                  ? <div className="small"><FieldValue field={f} value={rec[f.key]} rec={rec} lookups={lookups} /></div>
                  : <FieldInput field={f} value={rec[f.key]} onChange={(v) => set(f.key, v)} rec={rec} lookups={lookups} engagementId={engagementId} />}
              </Field>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RecordView({ entity, rec, lookups }) {
  const d = ENTITIES[entity];
  const fields = d.fields.filter((f) => isVisible(f, rec) && !(f.sensitive && rec._can && !rec._can.costs));
  const groups = useFieldGroups(fields);
  return (
    <div className="stack">
      {groups.map((g) => {
        const shown = g.fields.filter((f) => rec[f.key] !== undefined && rec[f.key] !== null && rec[f.key] !== '' && !(Array.isArray(rec[f.key]) && !rec[f.key].length));
        if (!shown.length) return null;
        return (
          <div key={g.name || 'main'} className={g.name ? 'form-group' : ''}>
            {g.name && <h4>{g.name}</h4>}
            <dl className="kv">
              {shown.map((f) => <div key={f.key} style={{ display: 'contents' }}><dt>{f.label}</dt><dd><FieldValue field={f} value={rec[f.key]} rec={rec} lookups={lookups} /></dd></div>)}
            </dl>
          </div>
        );
      })}
    </div>
  );
}

// Computed flags the services add when decorating records.
export function RecordFlags({ rec }) {
  const flags = [];
  if (rec.overdue) flags.push(<Badge key="o" tone="red">Overdue</Badge>);
  if (rec.review_overdue) flags.push(<Badge key="r" tone="amber">Review overdue</Badge>);
  if (rec.escalated) flags.push(<Badge key="e" tone="red">Escalated</Badge>);
  if (rec.flag) flags.push(<Badge key="f" tone="red">{rec.flag}</Badge>);
  if (rec.outside_change_control) flags.push(<Badge key="c" tone="red">Outside change control</Badge>);
  if (rec.reportable) flags.push(<Badge key="rep" tone="teal" title="Included in client reports by the default rules (RAI-009)">In report</Badge>);
  if (rec.client_visible) flags.push(<Badge key="cv" tone="gold" title="Visible to client users">Client-visible</Badge>);
  return flags.length ? <span className="flex flex-wrap">{flags}</span> : null;
}

// ---------- Drawer ----------
export function RecordDrawer({ entity, id, defaults = {}, scope = {}, onClose, onSaved, startEditing }) {
  const d = ENTITIES[entity];
  const creating = !id;
  const q = useApi(creating ? null : `/api/e/${entity}/${id}`);
  const [draft, setDraft] = useState(creating ? { ...defaults } : null);
  const [editing, setEditing] = useState(creating || startEditing);
  const [errors, setErrors] = useState({});
  const [tab, setTab] = useState('details');
  const [run, busy] = useAction();
  const dialog = useDialog();
  const rec = creating ? draft : q.data;
  const engagementId = scope.engagement_id || rec?.engagement_id;
  const lookups = useLookups({ engagementId, clientId: scope.client_id || rec?.client_id });

  useEffect(() => { if (q.data && editing && !draft) setDraft({ ...q.data }); }, [q.data, editing, draft]);

  const save = async () => {
    setErrors({});
    const body = creating ? { ...scope, ...draft } : { ...diff(q.data, draft), _rev: q.data.rev };
    try {
      const saved = creating ? await post(`/api/e/${entity}`, body) : await patch(`/api/e/${entity}/${id}`, body);
      clearLookups();
      onSaved?.(saved);
      if (creating) onClose(); else { setEditing(false); setDraft(null); q.reload(); }
    } catch (e) {
      setErrors(e.details || {});
      await run(() => Promise.reject(e));
    }
  };

  const doAction = async (a) => {
    let body = {};
    if (a.ask) {
      const v = await dialog({ title: a.ask.title, message: a.ask.message, input: true, required: !a.ask.optional, label: a.ask.label || a.ask.field.replace('_', ' '), initial: a.ask.initial ? a.ask.initial(rec) || '' : '', confirm: a.label });
      if (v === null) return;
      if (v) body[a.ask.field] = v;
    }
    if (a.choose) {
      const pick = await choose(dialog, a.choose);
      if (pick === null) return;
      body[a.choose.field] = pick;
    }
    if (a.person) {
      const personId = await pickPerson(dialog, lookups);
      if (!personId) return;
      body.person_id = personId;
    }
    if (a.record) {
      const decision = await dialog({ title: 'Client decision', message: 'Record the client’s decision with evidence (for example an email reference). Use the portal when the client has an account.', input: true, required: true, label: 'Evidence and comment', confirm: 'Record approval' });
      if (!decision) return;
      body = { decision: 'approve', evidence: decision, comment: decision };
    }
    const out = await run(() => post(`/api/e/${entity}/${id}/do/${a.act}`, body), `${a.label}: done`);
    if (out?.file_id) download(`/api/files/${out.file_id}`);
    if (out !== undefined) { q.reload(); onSaved?.(out); }
  };

  const remove = async () => {
    const ok = await dialog({ title: `Delete ${d.label.toLowerCase()}`, message: 'The record is removed from registers; the audit trail keeps its history.', confirm: 'Delete', danger: true });
    if (!ok) return;
    const out = await run(() => del(`/api/e/${entity}/${id}`), `${d.label} deleted`);
    if (out) { onSaved?.(null); onClose(); }
  };

  const title = creating ? `New ${d.label.toLowerCase()}` : rec ? [rec.ref, rec[d.title] ?? rec.name ?? rec.title].filter(Boolean).join(' · ') : d.label;
  const actions = !creating && rec && !rec._can?.locked ? (RECORD_ACTIONS[entity] || []).filter((a) => !a.when || a.when(rec)) : [];

  return (
    <Drawer title={title} sub={!creating && rec ? <span className="flex flex-wrap">{rec.status && <Status v={rec.status} />}{(rec.residual_level || rec.inherent_level) && <Level v={rec.residual_level || rec.inherent_level} />}<RecordFlags rec={rec} /></span> : d.plural} onClose={onClose} wide={['change', 'project', 'engagement', 'deliverable'].includes(entity)}
      footer={editing ? (
        <>
          <button className="btn" onClick={() => { if (creating) onClose(); else { setEditing(false); setDraft(null); setErrors({}); } }}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{creating ? 'Create' : 'Save changes'}</button>
        </>
      ) : rec && (
        <>
          {rec._can?.locked && <span className="small muted flex-1"><Icon name="lock" size={13} /> {rec._can.locked}</span>}
          {rec._can?.delete && <button className="btn btn-danger" onClick={remove} disabled={busy}><Icon name="trash" /> Delete</button>}
          {actions.map((a) => <button key={a.act} className={`btn ${a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : ''}`} disabled={busy} onClick={() => doAction(a)}>{a.label}</button>)}
          {rec._can?.update && <button className="btn btn-navy" onClick={() => { setDraft({ ...rec }); setEditing(true); }}><Icon name="edit" /> Edit</button>}
        </>
      )}>
      {!creating && q.error && <ErrorBox error={q.error} />}
      {!creating && !rec && !q.error && <Loading />}
      {rec && (
        <>
          {!creating && !editing && (
            <Tabs value={tab} onChange={setTab} tabs={[{ id: 'details', label: 'Details' }, { id: 'approvals', label: 'Approvals' }, { id: 'comments', label: 'Comments' }, { id: 'history', label: 'History' }]} />
          )}
          {editing && Object.keys(errors).length > 0 && <div className="alert error mb-2"><Icon name="alert" /><div>Please correct the highlighted fields.{errors._duplicate && ' A possible duplicate exists (CLI-007).'}</div></div>}
          {editing ? (
            <RecordForm entity={entity} rec={draft || rec} onChange={setDraft} errors={errors} lookups={lookups} creating={creating} engagementId={engagementId} />
          ) : tab === 'details' ? (
            <RecordView entity={entity} rec={rec} lookups={lookups} />
          ) : tab === 'history' ? <History entity={entity} id={id} /> : tab === 'comments' ? <Comments entity={entity} id={id} lookups={lookups} /> : <Approvals entity={entity} id={id} onDecided={() => q.reload()} />}
        </>
      )}
    </Drawer>
  );
}

const diff = (before, after) => Object.fromEntries(Object.entries(after || {}).filter(([k, v]) => !k.startsWith('_') && JSON.stringify(v) !== JSON.stringify(before[k])));

async function choose(dialog, c) {
  let picked = c.options[0][0];
  const ok = await dialog({
    title: c.title, confirm: 'Continue',
    message: (
      <div className="stack-sm">
        <div>{c.message}</div>
        {c.options.map(([v, l]) => <label key={v} className="check"><input type="radio" name="choice" defaultChecked={v === picked} onChange={() => { picked = v; }} /> {l}</label>)}
        <label className="check"><input type="radio" name="choice" onChange={() => { picked = ''; }} /> No follow-up item</label>
      </div>
    ),
  });
  return ok ? picked : null;
}

async function pickPerson(dialog, lookups) {
  let picked = '';
  const ok = await dialog({
    title: 'Choose a person', confirm: 'Choose',
    message: <select defaultValue="" onChange={(e) => { picked = e.target.value; }}><option value="">Choose…</option>{(lookups?.people || []).map((p) => <option key={p.id} value={p.id}>{p.label} · {p.grade}</option>)}</select>,
  });
  return ok ? picked : null;
}

// ---------- History, comments and approvals ----------
function History({ entity, id }) {
  const q = useApi(`/api/e/${entity}/${id}/history`);
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data.length) return <Empty>No history yet.</Empty>;
  return (
    <ul className="timeline">
      {q.data.map((h) => (
        <li key={h.seq}>
          <div className="small"><b>{h.user}</b> · <DT v={h.at} /> · <span className="muted">{h.action}</span></div>
          <div>{h.summary}</div>
          {h.before && h.after && <ChangeDiff before={h.before} after={h.after} />}
        </li>
      ))}
    </ul>
  );
}
function ChangeDiff({ before, after }) {
  const keys = Object.keys(after).filter((k) => !['updated_at', 'updated_by', 'rev', 'score_history'].includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k])).slice(0, 8);
  if (!keys.length) return null;
  const s = (v) => (v === null || v === undefined || v === '' ? '∅' : typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v).slice(0, 120));
  return <div className="diff">{keys.map((k) => <div key={k}><b>{k}</b>: <del>{s(before[k])}</del> → <ins>{s(after[k])}</ins></div>)}</div>;
}

function Comments({ entity, id, lookups }) {
  const q = useApi(`/api/comments/${entity}/${id}`);
  const [text, setText] = useState('');
  const [run, busy] = useAction();
  const [mention, setMention] = useState('');
  const send = async () => {
    const r = await run(() => post(`/api/comments/${entity}/${id}`, { body: text }), 'Comment added');
    if (r) { setText(''); q.reload(); }
  };
  const addMention = (uid) => { const u = lookups?.users?.find((x) => x.id === uid); if (u) setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@[${u.label}](${u.id}) `); setMention(''); };
  return (
    <div className="stack">
      {q.loading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data.length ? <Empty icon="message">No comments yet.</Empty> : (
        <ul className="list">
          {q.data.map((c) => <li key={c.id}><div className="grow"><div className="small"><b>{c.user}</b> · <DT v={c.created_at} /></div><div style={{ whiteSpace: 'pre-wrap' }}>{c.body.replace(/@\[([^\]]+)\]\([\w]+\)/g, '@$1')}</div></div></li>)}
        </ul>
      )}
      <Field label="Add a comment" hint="Mention a colleague to notify them (WFL-007); only people who can see this record are notified.">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      </Field>
      <div className="flex">
        <select value={mention} onChange={(e) => addMention(e.target.value)} style={{ maxWidth: 260 }} aria-label="Mention"><option value="">@ Mention someone…</option>{(lookups?.users || []).filter((u) => !u.external).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select>
        <span className="flex-1" />
        <button className="btn btn-primary" onClick={send} disabled={busy || !text.trim()}><Icon name="send" /> Post</button>
      </div>
    </div>
  );
}

export function Approvals({ entity, id, onDecided }) {
  const q = useApi(`/api/approvals/entity/${entity}/${id}`);
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data.length) return <Empty>No approvals for this record.</Empty>;
  return <div className="stack">{q.data.map((a) => <ApprovalCard key={a.id} a={a} onDecided={() => { q.reload(); onDecided?.(); }} />)}</div>;
}

export function ApprovalCard({ a, onDecided, compact }) {
  const { me } = useSession();
  const dialog = useDialog();
  const [run, busy] = useAction();
  const step = a.steps[a.current];
  const mine = a.status === 'Pending' && step && step.approvers.some((u) => u === me.user.id || a.on_behalf_of === u) && !step.decisions.some((x) => x.for === me.user.id);
  const decide = async (decision) => {
    let comment = '';
    if (decision !== 'approve') {
      comment = await dialog({ title: decision === 'reject' ? 'Reject' : 'Return for changes', input: true, required: true, label: 'Reason', confirm: decision === 'reject' ? 'Reject' : 'Return', danger: decision === 'reject' });
      if (!comment) return;
    } else {
      const c = await dialog({ title: 'Approve', message: a.title, confirm: 'Approve' });
      if (!c) return;
    }
    const out = await run(() => post(`/api/approvals/${a.id}/decide`, { decision, comment }), decision === 'approve' ? 'Approved' : decision === 'reject' ? 'Rejected' : 'Returned');
    if (out) onDecided?.(out);
  };
  return (
    <div className="card">
      <div className="card-body stack-sm">
        <div className="flex between flex-wrap">
          <div className="strong">{a.title}</div>
          <Status v={a.status} />
        </div>
        {!compact && <div className="small muted">Requested by {a.requested_by_name || 'system'} · <DT v={a.requested_at} />{a.due_date ? ` · due ${a.due_date}` : ''}{a.escalated ? ' · escalated' : ''}{a.on_behalf_of ? ' · as delegate' : ''}</div>}
        <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {a.steps.map((s, i) => (
            <li key={i} style={{ fontWeight: i === a.current && a.status === 'Pending' ? 600 : 400 }}>
              {s.name} — {s.approver_names?.join(', ')} {s.mode === 'all' ? '(all must approve)' : ''}
              {s.decisions.map((x, j) => <div key={j} className="muted">{x.decision === 'approve' ? '✓' : '✗'} {x.by_name}{x.on_behalf ? ' (delegate)' : ''}{x.comment ? `: ${x.comment}` : ''} · <DT v={x.at} /></div>)}
            </li>
          ))}
        </ol>
        {mine && (
          <div className="btn-row">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => decide('approve')}><Icon name="check" /> Approve</button>
            <button className="btn btn-sm" disabled={busy} onClick={() => decide('return')}>Return</button>
            <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => decide('reject')}>Reject</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Register ----------
// A list of one entity type within a scope, with filters, export, bulk update and the record drawer.
export function Register({ entity, scope = {}, defaults = {}, title, sub, columns, canCreate = true, query = {}, extraFilters, rowFilter, emptyText, toolbar, onChanged, initialOpenOnly = false }) {
  const d = ENTITIES[entity];
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({});
  const [openOnly, setOpenOnly] = useState(initialOpenOnly);
  const [drawer, setDrawer] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const list = useApi(`/api/e/${entity}`, { ...scope, ...query, ...(openOnly && d.closed ? { open: '1' } : {}) });
  const lookups = useLookups({ engagementId: scope.engagement_id, clientId: scope.client_id });
  const { me } = useSession();

  // Deep links: ?open=<id>&entity=<name>
  useEffect(() => {
    const open = params.get('open');
    const ent = params.get('entity');
    if (open && (!ent || ent === entity) && list.data?.some((r) => r.id === open)) setDrawer({ id: open });
  }, [params, list.data, entity]);

  const cols = useMemo(() => columns || defaultColumns(d, lookups), [columns, d, lookups]);
  const filterFields = d.fields.filter((f) => f.filter && f.type === 'enum' && !scope[f.key]);
  let rows = list.data || [];
  if (q) {
    const s = q.toLowerCase();
    rows = rows.filter((r) => Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(s)));
  }
  for (const [k, v] of Object.entries(filters)) if (v) rows = rows.filter((r) => String(r[k] ?? '') === v);
  if (rowFilter) rows = rows.filter(rowFilter);

  const canWrite = canCreate && !me?.user?.external && (scope.engagement_id ? canOn(me, scope.engagement_id, d.fn, 'C', scope.project_id) : true);
  const close = () => { setDrawer(null); if (params.get('open')) { params.delete('open'); params.delete('entity'); setParams(params, { replace: true }); } };
  const exportQ = { ...scope, ...query };
  return (
    <section className="card">
      <div className="card-head">
        <div><h3>{title || d.plural}</h3>{sub && <p>{sub}</p>}</div>
        <div className="btn-row">
          {toolbar}
          {!me?.user?.external && <button className="btn btn-sm" onClick={() => download(`/api/e/${entity}/export`, { ...exportQ, format: 'xlsx' })}><Icon name="download" /> Excel</button>}
          {canWrite && <button className="btn btn-sm btn-primary" onClick={() => setDrawer({ id: null })}><Icon name="plus" /> New</button>}
        </div>
      </div>
      <div className="card-body">
        <div className="filters">
          <input type="search" placeholder={`Search ${d.plural.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          {filterFields.map((f) => (
            <select key={f.key} value={filters[f.key] || ''} onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })} aria-label={f.label}>
              <option value="">{f.label}: all</option>
              {(f.options || []).map((o) => <option key={o}>{o}</option>)}
            </select>
          ))}
          {d.closed && <label className="check small"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open only</label>}
          {extraFilters}
          <span className="flex-1" />
          <span className="small muted">{rows.length} of {(list.data || []).length}</span>
        </div>
        {selected.size > 0 && <BulkBar entity={entity} ids={[...selected]} lookups={lookups} onDone={() => { setSelected(new Set()); list.reload(); onChanged?.(); }} />}
        {list.error ? <ErrorBox error={list.error} retry={list.reload} /> : list.loading && !list.data ? <Loading /> : (
          <Table columns={cols} rows={rows} onRow={(r) => setDrawer({ id: r.id })} empty={emptyText || `No ${d.plural.toLowerCase()} yet.`}
            selectable={canWrite && ['risk', 'issue', 'action', 'dependency', 'assumption', 'decision'].includes(entity)} selected={selected} onSelect={setSelected} />
        )}
      </div>
      {drawer && <RecordDrawer entity={entity} id={drawer.id} scope={scope} defaults={defaults} onClose={close} onSaved={() => { list.reload(); onChanged?.(); }} />}
    </section>
  );
}

function defaultColumns(d, lookups) {
  const listFields = d.fields.filter((f) => f.list && f.key !== 'project_id').slice(0, 8);
  return [
    ...listFields.map((f) => ({ key: f.key, label: f.label, num: ['money', 'number', 'int', 'percent'].includes(f.type), render: (r) => (f.key === 'status' && f.type === 'text' ? <Status v={r.status} /> : <FieldValue field={f} value={r[f.key]} rec={r} lookups={lookups} />) })),
    { key: '_flags', label: '', sort: false, render: (r) => <RecordFlags rec={{ ...r, client_visible: false, reportable: false }} /> },
  ];
}

// RAI-008 bulk update of owner, status, due dates or review dates.
function BulkBar({ entity, ids, lookups, onDone }) {
  const d = ENTITIES[entity];
  const [field, setField] = useState('');
  const [value, setValue] = useState(null);
  const [run, busy] = useAction();
  const editable = d.fields.filter((f) => ['status', 'owner_id', 'due_date', 'target_date', 'need_by', 'validate_by', 'last_reviewed', 'client_visible', 'include_in_report', 'severity', 'priority'].includes(f.key));
  const f = d.fieldMap[field];
  const apply = async () => {
    const res = await run(() => post(`/api/e/${entity}/bulk`, { ids, changes: { [field]: value } }));
    if (res) {
      const failed = res.filter((x) => !x.ok);
      if (failed.length) alertFailed(failed);
      onDone();
    }
  };
  return (
    <div className="alert info mb-2">
      <Icon name="list" />
      <div className="flex flex-wrap flex-1">
        <b>{ids.length} selected</b> · Set
        <select value={field} onChange={(e) => { setField(e.target.value); setValue(null); }} style={{ width: 'auto' }}><option value="">field…</option>{editable.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
        {f && <div style={{ minWidth: 200 }}><FieldInput field={f} value={value} onChange={setValue} rec={{}} lookups={lookups} /></div>}
        <button className="btn btn-sm btn-primary" disabled={!f || busy} onClick={apply}>Apply to selected</button>
      </div>
    </div>
  );
}
function alertFailed(failed) {
  window.alert(`${failed.length} record(s) were not updated:\n${failed.map((x) => x.error).join('\n')}`);
}

export { api, get };
