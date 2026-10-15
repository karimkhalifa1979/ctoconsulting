import { useMemo, useState } from 'react';
import { useApp, personName } from '../lib/store.jsx';
import { PageHead, Card, Tabs, Pill, Select, includesAll, usePaged, Field, TextArea, PersonSelect, DataTable } from '../components/ui.jsx';
import { fmtDate, todayISO, uid, money } from '../lib/util.js';
import { downloadCSV } from '../lib/exporters.js';

export default function Learning() {
  const [tab, setTab] = useState('lessons');
  return (
    <div className="stack">
      <PageHead eyebrow="Governance" title="Lessons and audit">Benefits realisation is a learning process: experience is archived and reused, decisions are traceable, and contributions — including stopping low-value work — are recognised.</PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[['lessons', 'Lessons learned'], ['audit', 'Audit trail'], ['history', 'Point-in-time view'], ['recognition', 'Recognition']]} />
      {tab === 'lessons' && <Lessons />}
      {tab === 'audit' && <Audit />}
      {tab === 'history' && <PointInTime />}
      {tab === 'recognition' && <Recognition />}
    </div>
  );
}

function Lessons() {
  const { ws } = useApp();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const tags = [...new Set(ws.lessons.flatMap((l) => l.tags))].sort();
  const list = ws.lessons.filter((l) => (!tag || l.tags.includes(tag)) && includesAll(`${l.lesson} ${l.context} ${l.tags.join(' ')} ${ws.programs.find((p) => p.id === l.programId)?.name}`, q));
  return (
    <Card title="Lessons learned (HIS-03)" subtitle="Captured at gates, withdrawal and completion; surfaced automatically when similar programs are proposed">
      <div className="filters"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lessons" aria-label="Search lessons" /><Select value={tag} onChange={setTag} placeholder="All tags" options={tags} aria-label="Tag" /></div>
      {list.map((l) => <div key={l.id} className="check-row"><span className="ic">✎</span><span>{l.lesson}<div className="mini">{ws.programs.find((p) => p.id === l.programId)?.name} · {l.gate} · {fmtDate(l.date)}{l.context ? ` · ${l.context}` : ''}</div></span><span className="row" style={{ gap: 4 }}>{l.tags.map((t) => <Pill key={t} tone="none" icon="#">{t}</Pill>)}</span></div>)}
      {!list.length && <div className="empty-sm">No lessons match.</div>}
    </Card>
  );
}

function Audit() {
  const { ws } = useApp();
  const [q, setQ] = useState('');
  const [prog, setProg] = useState('');
  const rows = useMemo(() => ws.audit.slice().reverse().filter((a) => (!prog || a.programId === prog) && includesAll(`${a.summary} ${a.object} ${personName(ws, a.actor)} ${a.before || ''} ${a.after || ''}`, q)), [ws.audit, q, prog, ws]);
  const [page, pager] = usePaged(rows, 50, [q, prog]);
  return (
    <Card title="Audit trail (HIS-01)" subtitle="Every create, update and delete: who, what, when, and the values before and after" pad={false} actions={<button className="btn btn-sm dl" onClick={() => downloadCSV(rows, [{ label: 'Time', get: (a) => a.ts }, { label: 'Actor', get: (a) => personName(ws, a.actor) }, { label: 'Action', get: (a) => a.action }, { label: 'Object', get: (a) => a.object }, { label: 'Object id', get: (a) => a.objectId }, { label: 'Summary', get: (a) => a.summary }, { label: 'Before', get: (a) => a.before }, { label: 'After', get: (a) => a.after }], 'audit_trail.csv')}>Export CSV</button>}>
      <div className="card-body filters" style={{ marginBottom: 0 }}><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the audit trail" aria-label="Search audit trail" /><Select value={prog} onChange={setProg} placeholder="All programs" options={ws.programs.map((p) => [p.id, `${p.code} ${p.name}`])} aria-label="Program" /></div>
      <div className="table-wrap"><table className="table compact">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>What</th><th>Before → after</th></tr></thead>
        <tbody>{page.map((a) => <tr key={a.id}><td className="nowrap">{fmtDate(a.ts)} {a.ts.slice(11, 16)}</td><td>{personName(ws, a.actor)}</td><td><Pill tone="none">{a.action}</Pill></td><td>{a.summary}<div className="mini">{a.object}{a.programId ? ` · ${ws.programs.find((p) => p.id === a.programId)?.code || ''}` : ''}</div></td><td className="mini" style={{ maxWidth: 360, overflowWrap: 'anywhere' }}>{a.before !== undefined && a.before !== null ? <><span className="neg">{a.before}</span> → </> : ''}{a.after !== undefined && a.after !== null ? <span className="pos">{a.after}</span> : ''}</td></tr>)}</tbody>
      </table></div>
      {pager}
      <div className="card-body mini">Audit events are append-only in the workspace and travel with backups. Rapid edits to the same field within 90 seconds are coalesced into one event. In a server deployment the trail is tamper-evident and exported to security monitoring (NFR-17).</div>
    </Card>
  );
}

// HIS-02: reconstruct a program's value case, benefits map and scores as at a past gate.
function PointInTime() {
  const { ws } = useApp();
  const [pid, setPid] = useState(ws.programs[0]?.id);
  const p = ws.programs.find((x) => x.id === pid);
  const points = [
    ...(p?.chain.versions || []).map((v) => ({ id: v.id, date: v.date, label: `Benefits map: ${v.label}`, kind: 'map', v })),
    ...(p?.valueCases || []).filter((v) => v.doc || v.figures).map((v) => ({ id: v.id, date: v.lockedAt || v.createdAt, label: `Value case v${v.version} (${v.gate}, ${v.status})`, kind: 'vc', v })),
    ...(p?.assessment?.history || []).map((h, i) => ({ id: `h${i}`, date: h.date, label: `Assessment at ${h.gate}`, kind: 'score', h })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));
  const [pick, setPick] = useState(null);
  const sel = points.find((x) => x.id === pick);
  return (
    <div className="split-wide">
      <Card title="Point-in-time view (HIS-02, RP-16)">
        <Select value={pid} onChange={(v) => { setPid(v); setPick(null); }} options={ws.programs.map((x) => [x.id, `${x.code} ${x.name}`])} aria-label="Program" />
        <div style={{ marginTop: 10 }}>{points.map((x) => <div key={x.id} className="check-row" style={{ cursor: 'pointer', background: x.id === pick ? 'var(--brand-teal-soft)' : undefined }} onClick={() => setPick(x.id)}><span className="ic">◷</span><span>{x.label}<div className="mini">{fmtDate(x.date)}</div></span><span /></div>)}{!points.length && <div className="empty-sm">No recorded versions yet. Baselines are taken at gates.</div>}</div>
      </Card>
      <Card title={sel ? sel.label : 'Select a point in time'}>
        {!sel && <div className="empty-sm">Gate decisions lock the value case and baseline the benefits map so they can be reproduced exactly.</div>}
        {sel?.kind === 'map' && <DataTable caption={`${sel.v.snapshot.elements.length} elements, ${sel.v.snapshot.links.length} contributions`} columns={[{ label: 'Code', get: (e) => e.code }, { label: 'Type', get: (e) => (e.final ? 'Final outcome' : e.kind) }, { label: 'Title', get: (e) => e.title }, { label: 'Owner', get: (e) => personName(ws, e.ownerId) }]} rows={sel.v.snapshot.elements} />}
        {sel?.kind === 'vc' && (sel.v.figures ? <DataTable columns={[{ label: 'Figure', get: (r) => r[0] }, { label: 'Value', get: (r) => r[1] }]} rows={Object.entries(sel.v.figures).map(([k, v]) => [k, typeof v === 'number' && Math.abs(v) > 1000 ? money(v) : String(v ?? '—')])} /> : <div className="empty-sm">No figures stored.</div>)}
        {sel?.kind === 'score' && <DataTable columns={[{ label: 'Measure', get: (r) => r[0] }, { label: 'Value', get: (r) => r[1] }]} rows={[['Gate', sel.h.gate], ['Alignment', sel.h.alignment ?? '—'], ['Risk', sel.h.risk ?? '—'], ['NPV', sel.h.npv === undefined ? '—' : money(sel.h.npv)]]} />}
      </Card>
    </div>
  );
}

function Recognition() {
  const { ws, mutate } = useApp();
  const [f, setF] = useState({ personId: '', text: '' });
  return (
    <div className="grid g-2" data-layout>
      <Card title="Recognition (HIS-04)" subtitle="Excellent value cases, successful harvesting, and releasing resources by stopping work">
        {(ws.recognitions || []).slice().reverse().map((r) => <div key={r.id} className="check-row"><span className="ic">★</span><span><strong>{personName(ws, r.personId)}</strong> — {r.text}<div className="mini">{fmtDate(r.date)}</div></span><span /></div>)}
      </Card>
      <Card title="Recognise a contribution">
        <Field label="Person"><PersonSelect ws={ws} value={f.personId} onChange={(v) => setF({ ...f, personId: v })} /></Field>
        <Field label="Contribution"><TextArea value={f.text} onChange={(v) => setF({ ...f, text: v })} /></Field>
        <button className="btn btn-primary" style={{ marginTop: 8 }} disabled={!f.personId || !f.text.trim()} onClick={() => { mutate('Recognised contribution', (d) => { d.recognitions = [...(d.recognitions || []), { id: uid('rec'), date: todayISO(), ...f }]; }); setF({ personId: '', text: '' }); }}>Record</button>
      </Card>
    </div>
  );
}
