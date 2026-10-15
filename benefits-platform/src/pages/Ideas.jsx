import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp, personName } from '../lib/store.jsx';
import { createProgram } from '../lib/portfolio.js';
import { PageHead, Card, Modal, Field, TextInput, TextArea, NumberInput, Select, PersonSelect, MultiChips, Pill, Guidance, Seg } from '../components/ui.jsx';
import { similarity, todayISO, uid, fmtDate, money } from '../lib/util.js';

const STATUS = { new: ['Awaiting triage', 'warning'], accepted: ['Accepted', 'good'], merged: ['Merged', 'navy'], returned: ['Returned for clarification', 'progress'], declined: ['Declined', 'none'] };

export function overlaps(ws, idea) {
  const text = `${idea.title} ${idea.problem} ${idea.outcome}`;
  const out = [];
  for (const i of ws.ideas) if (i.id !== idea.id) { const s = similarity(text, `${i.title} ${i.problem} ${i.outcome}`); if (s >= 0.3) out.push({ kind: 'Idea', id: i.id, label: i.title, score: s }); }
  for (const p of ws.programs) {
    const s = similarity(text, `${p.name} ${p.purpose} ${p.problem}`);
    const outcomes = (p.chain?.elements || []).filter((e) => e.kind === 'outcome').map((e) => ({ e, s: similarity(idea.outcome || idea.title, e.title) })).filter((x) => x.s >= 0.5);
    const areaBonus = (idea.areas || []).some((a) => (p.areas || []).includes(a)) ? 0.1 : 0;
    const driverBonus = (idea.driverIds || []).some((d) => (p.driverIds || []).includes(d)) ? 0.05 : 0;
    if (s + areaBonus + driverBonus >= 0.35 || outcomes.length) out.push({ kind: 'Program', id: p.id, label: `${p.code} ${p.name}`, score: Math.max(s + areaBonus + driverBonus, ...outcomes.map((x) => x.s)), via: outcomes.map((x) => x.e.title) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

export default function Ideas() {
  const { ws, mutate } = useApp();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState(null);
  const [triage, setTriage] = useState(null);
  const [filter, setFilter] = useState('open');
  useEffect(() => { if (params.get('new')) { setForm(blank(ws)); setParams({}); } }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = ws.ideas.filter((i) => (filter === 'open' ? ['new', 'returned'].includes(i.status) : filter === 'all' ? true : i.status === filter)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="stack">
      <PageHead eyebrow="Investments" title="Ideas and intake" actions={<button className="btn btn-primary" onClick={() => setForm(blank(ws))}>+ Propose an idea</button>}>
        Anyone can propose an investment idea at any time — selection is continuous, not an annual contest. The value office triages each idea: confirm its category, assign a value analyst, and accept, merge, return or decline it with a reason the proposer can see.
      </PageHead>
      <Seg value={filter} onChange={setFilter} options={[['open', `Open (${ws.ideas.filter((i) => ['new', 'returned'].includes(i.status)).length})`], ['accepted', 'Accepted'], ['merged', 'Merged'], ['declined', 'Declined'], ['all', 'All']]} label="Filter" />
      <div className="grid g-2" data-layout>
        {list.map((i) => {
          const ov = overlaps(ws, i);
          const cat = ws.categories.find((c) => c.id === i.category);
          return (
            <Card key={i.id} title={i.title} subtitle={`Proposed by ${personName(ws, i.proposer)} · ${fmtDate(i.createdAt)}`} actions={<Pill tone={STATUS[i.status][1]}>{STATUS[i.status][0]}</Pill>}>
              <div className="small"><strong>Problem or opportunity:</strong> {i.problem}</div>
              <div className="small" style={{ marginTop: 4 }}><strong>Intended outcome:</strong> {i.outcome}</div>
              <div className="row mini" style={{ marginTop: 6 }}><span>{cat?.name}</span><span>· {money(Number(i.costLow) || null)}–{money(Number(i.costHigh) || null)}</span><span>· {(i.areas || []).map((a) => ws.areas.find((x) => x.id === a)?.name).join(', ')}</span>{i.analystId && <span>· Analyst {personName(ws, i.analystId)}</span>}</div>
              {i.reason && <div className="guidance" style={{ marginTop: 8 }}><strong>Triage note:</strong> {i.reason}</div>}
              {ov.length > 0 && <div style={{ marginTop: 8 }}><div className="mini" style={{ fontWeight: 600 }}>Possible overlaps (INV-06)</div>{ov.map((o) => <div key={o.id} className="mini">• {o.kind}: {o.label} ({Math.round(o.score * 100)}% match{o.via?.length ? `; outcome “${o.via[0]}”` : ''})</div>)}</div>}
              <div className="btn-row" style={{ marginTop: 10 }}>
                {['new', 'returned'].includes(i.status) && <button className="btn btn-sm btn-primary" onClick={() => setTriage(i)}>Triage…</button>}
                {i.programId && <button className="btn btn-sm" onClick={() => nav(`/programs/${i.programId}`)}>Open program</button>}
                {i.status === 'returned' && <button className="btn btn-sm" onClick={() => setForm({ ...i })}>Clarify and resubmit</button>}
              </div>
            </Card>
          );
        })}
        {!list.length && <Card><div className="empty-sm">Nothing here.</div></Card>}
      </div>
      {form && <IdeaForm initial={form} onClose={() => setForm(null)} onSave={(idea) => { mutate(idea.createdAt === form.createdAt && ws.ideas.some((x) => x.id === idea.id) ? 'Idea resubmitted' : 'Idea proposed', (d) => { const k = d.ideas.findIndex((x) => x.id === idea.id); if (k >= 0) d.ideas[k] = { ...idea, status: 'new' }; else d.ideas.push(idea); }, { action: 'create', object: 'idea', objectId: idea.id }); setForm(null); }} />}
      {triage && <Triage idea={triage} onClose={() => setTriage(null)} onAccept={(pid) => { setTriage(null); if (pid) nav(`/programs/${pid}`); }} />}
    </div>
  );
}

const blank = (ws) => ({ id: uid('idea'), title: '', problem: '', outcome: '', areas: [], costLow: '', costHigh: '', proposer: ws.currentUser, category: 'opportunity', status: 'new', createdAt: todayISO(), reason: '', driverIds: [] });

function IdeaForm({ initial, onClose, onSave }) {
  const { ws } = useApp();
  const [f, setF] = useState(initial);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const ov = useMemo(() => (f.title.length > 4 ? overlaps(ws, f) : []), [ws, f]);
  const cat = ws.categories.find((c) => c.id === f.category);
  const ok = f.title.trim() && f.problem.trim() && f.outcome.trim() && f.areas.length && f.costLow !== '' && f.costHigh !== '';
  return (
    <Modal title="Propose an investment idea" wide onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!ok} onClick={() => onSave(f)}>Submit idea</button></>}>
      <div className="form-grid">
        <Field label="Title" className="full"><TextInput value={f.title} onChange={set('title')} autoFocus /></Field>
        <Field label="Problem or opportunity" className="full"><TextArea value={f.problem} onChange={set('problem')} /></Field>
        <Field label="Intended business outcome" hint="what will be different, measurably" className="full"><TextInput value={f.outcome} onChange={set('outcome')} placeholder="e.g. Claim cycle time decreased" /></Field>
        <Field label="Affected business areas" className="full"><MultiChips options={ws.areas.map((a) => [a.id, a.name])} value={f.areas} onChange={set('areas')} /></Field>
        <Field label="Strategic drivers (optional)" className="full"><MultiChips options={ws.drivers.map((d) => [d.id, d.name])} value={f.driverIds} onChange={set('driverIds')} /></Field>
        <Field label="Indicative cost — low"><NumberInput value={f.costLow} onChange={set('costLow')} /></Field>
        <Field label="Indicative cost — high"><NumberInput value={f.costHigh} onChange={set('costHigh')} /></Field>
        <Field label="Proposer"><PersonSelect ws={ws} value={f.proposer} onChange={set('proposer')} /></Field>
        <Field label="Suggested investment category"><Select value={f.category} onChange={set('category')} options={ws.categories.map((c) => [c.id, c.name])} /></Field>
      </div>
      {cat && <div className="guidance" style={{ marginTop: 10 }}><strong>{cat.name}:</strong> {cat.path}{cat.lightFields?.length ? ` You will be asked for: ${cat.lightFields.join(', ')}.` : ''}</div>}
      {ov.length > 0 && <div className="callout warn" style={{ marginTop: 10 }}><strong>Possible overlaps — please confirm this is new:</strong>{ov.map((o) => <div key={o.id}>• {o.kind}: {o.label} ({Math.round(o.score * 100)}% match)</div>)}</div>}
    </Modal>
  );
}

function Triage({ idea, onClose, onAccept }) {
  const { ws, mutate, me } = useApp();
  const [f, setF] = useState({ action: 'accept', category: idea.category, analystId: idea.analystId || 'p-karim', reason: '', mergeInto: '', sponsorId: '' });
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const isVmo = (me?.roles || []).some((r) => /VMO|Value analyst/.test(r));
  const apply = () => {
    let pid = null;
    mutate(`Idea triaged: ${f.action}`, (d) => {
      const i = d.ideas.find((x) => x.id === idea.id);
      i.analystId = f.analystId; i.reason = f.reason; i.category = f.category; i.triagedBy = d.currentUser; i.triagedAt = todayISO();
      if (f.action === 'accept') {
        const p = createProgram(d, { name: idea.title, problem: idea.problem, purpose: '', categoryId: f.category, areas: idea.areas, driverIds: idea.driverIds || [], analystId: f.analystId, sponsorId: f.sponsorId || null, costLow: idea.costLow, costHigh: idea.costHigh, state: 'concept', originIdea: idea.id });
        p.chain.elements.push({ id: uid('el'), code: 'O1', kind: 'outcome', title: idea.outcome, final: true, btopp: [], driverIds: idea.driverIds || [], validation: 'pending', progress: 0, expected: 0 });
        d.programs.push(p); i.status = 'accepted'; i.programId = p.id; pid = p.id;
      } else if (f.action === 'merge') { i.status = 'merged'; i.mergedInto = f.mergeInto; i.reason = `${f.reason} (merged into ${d.programs.find((x) => x.id === f.mergeInto)?.name || d.ideas.find((x) => x.id === f.mergeInto)?.title})`; }
      else if (f.action === 'return') i.status = 'returned';
      else i.status = 'declined';
    }, { action: 'triage', object: 'idea', objectId: idea.id });
    onAccept(pid);
  };
  const ov = overlaps(ws, idea);
  return (
    <Modal title={`Triage: ${idea.title}`} wide onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={(f.action !== 'accept' && !f.reason.trim()) || (f.action === 'merge' && !f.mergeInto)} onClick={apply}>Confirm</button></>}>
      {!isVmo && <Guidance>Triage is a value-office task (INV-09). You are viewing as {me?.name}.</Guidance>}
      <div className="form-grid" style={{ marginTop: 10 }}>
        <Field label="Decision" className="full"><Seg value={f.action} onChange={set('action')} options={[['accept', 'Accept into concept definition'], ['merge', 'Merge'], ['return', 'Return for clarification'], ['decline', 'Decline']]} label="Triage decision" /></Field>
        <Field label="Confirmed category" hint="changes are recorded (INV-07)"><Select value={f.category} onChange={set('category')} options={ws.categories.map((c) => [c.id, c.name])} /></Field>
        <Field label="Value analyst"><PersonSelect ws={ws} value={f.analystId} onChange={set('analystId')} /></Field>
        {f.action === 'accept' && <Field label="Nominated business sponsor" hint="required before Initiation"><PersonSelect ws={ws} value={f.sponsorId} onChange={set('sponsorId')} /></Field>}
        {f.action === 'merge' && <Field label="Merge into"><Select value={f.mergeInto} onChange={set('mergeInto')} placeholder="—" options={[...ov.map((o) => [o.id, `${o.kind}: ${o.label}`]), ...ws.programs.filter((p) => !ov.some((o) => o.id === p.id)).map((p) => [p.id, `Program: ${p.code} ${p.name}`])]} /></Field>}
        <Field label={`Reason (visible to the proposer)${f.action === 'accept' ? ' — optional' : ''}`} className="full"><TextArea value={f.reason} onChange={set('reason')} /></Field>
      </div>
    </Modal>
  );
}
