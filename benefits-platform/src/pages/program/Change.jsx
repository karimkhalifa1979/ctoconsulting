import { useApp } from '../../lib/store.jsx';
import { READINESS_QUESTIONS } from '../../lib/config.js';
import { chainOf } from '../../lib/chain.js';
import { Card, Field, TextInput, TextArea, NumberInput, Select, PersonSelect, Pill, Guidance, StackBar } from '../../components/ui.jsx';
import { money, pct, todayISO, uid, fmtDate, quarterKey } from '../../lib/util.js';

const POS = [['opposed', 'Opposed'], ['neutral', 'Neutral'], ['proponent', 'Proponent']];
const CHANGES = ['process', 'role', 'system', 'skills', 'culture', 'rewards'];

export default function Change({ program: p }) {
  const { ws, updateProgram } = useApp();
  const t = ws.settings.thresholds;
  const st = p.stakeholders || [];
  const upd = (i, k, v) => updateProgram(p.id, (x) => { x.stakeholders[i][k] = v; }, `Stakeholder “${st[i].name}”: ${k}`, { field: `st:${st[i].id}:${k}` });
  const chain = chainOf(p);
  const changeCost = (p.costs || []).filter((c) => c.type === 'change').reduce((a, c) => a + (c.basis === 'annual' ? c.amount * ((c.months || 12) / 12) : Number(c.amount) || 0), 0);
  const allCost = (p.costs || []).reduce((a, c) => a + (c.basis === 'annual' ? c.amount * ((c.months || 120) / 12) : Number(c.amount) || 0), 0);
  const share = allCost ? changeCost / allCost : 0;
  const changeInits = chain.elements.filter((e) => e.kind === 'initiative' && (e.btopp || []).some((b) => ['O', 'Pr', 'P'].includes(b)));

  return (
    <div className="stack">
      <Guidance title="Benefits only come with change.">Managing change is the sponsor's job, not something to delegate. Build change initiatives into the benefits map from the start; major change programs often spend 30–50% of their effort on it.</Guidance>
      <div className="kpi-grid">
        <div className="card stat accent"><div className="label">Change share of cost (CHG-09)</div><div className="value">{pct(share)}</div><div className="sub">{money(changeCost)} of {money(allCost)} · threshold {pct(t.changeEffortMin)}</div>{share < t.changeEffortMin && <Pill tone="warning">Below threshold</Pill>}</div>
        <div className="card stat"><div className="label">Stakeholder groups</div><div className="value">{st.length}</div><div className="sub">{st.filter((s) => s.impact === 'high').length} high impact</div></div>
        <div className="card stat"><div className="label">At desired position</div><div className="value">{st.filter((s) => s.current === s.desired).length}/{st.length}</div><div className="sub">{st.filter((s) => s.current === 'opposed').length} opposed today</div></div>
        <div className="card stat"><div className="label">Change initiatives in the map</div><div className="value">{changeInits.length}</div><div className="sub">organisation, process and people (CHG-04)</div></div>
      </div>
      <Card title="Positions now and desired" subtitle="Stakeholder register (CHG-01)">
        <StackBar segments={[{ label: 'Opposed', value: st.filter((s) => s.current === 'opposed').length, color: 'var(--st-critical)' }, { label: 'Neutral', value: st.filter((s) => s.current === 'neutral').length, color: 'var(--st-none)' }, { label: 'Proponent', value: st.filter((s) => s.current === 'proponent').length, color: 'var(--st-good)' }]} />
      </Card>

      <Card title="Stakeholders and change impact" subtitle="CHG-01/02/03 — role, impact, depth and breadth, what changes, readiness" actions={<button className="btn btn-sm btn-primary" onClick={() => updateProgram(p.id, (x) => { x.stakeholders = [...(x.stakeholders || []), { id: uid('st'), name: 'New stakeholder group', areaId: x.areas?.[0] || '', size: '', role: '', impact: 'medium', share: 0.5, current: 'neutral', desired: 'proponent', influence: 'medium', ownerId: null, depth: 'technical', breadth: 'group', changes: [], from: quarterKey(todayISO()), to: quarterKey(todayISO()), readiness: {} }]; }, 'Added stakeholder group')}>+ Group</button>}>
        {!st.length ? <div className="empty-sm">No stakeholder groups yet.</div> : st.map((s, i) => {
          const targeted = chain.elements.filter((e) => (e.targetGroups || []).includes(s.id));
          return (
            <div key={s.id} style={{ borderBottom: '1px solid var(--line)', padding: '12px 0' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <input className="inline-input" style={{ fontWeight: 700, fontSize: 14, maxWidth: 380 }} value={s.name} onChange={(e) => upd(i, 'name', e.target.value)} aria-label="Group name" />
                <span className="row">{targeted.length ? <Pill tone="good">{targeted.length} change initiative{targeted.length === 1 ? '' : 's'}: {targeted.map((e) => e.code).join(', ')}</Pill> : s.impact === 'high' ? <Pill tone="warning">No change initiative directed at this group</Pill> : <Pill tone="none">No targeted initiative</Pill>}<button className="btn btn-ghost btn-sm" aria-label="Remove group" onClick={() => updateProgram(p.id, (x) => { x.stakeholders.splice(i, 1); }, 'Removed stakeholder group')}>✕</button></span>
              </div>
              <div className="form-grid-3" style={{ gridTemplateColumns: 'repeat(6, minmax(0,1fr))', marginTop: 8 }}>
                <Field label="Business area"><Select value={s.areaId} onChange={(v) => upd(i, 'areaId', v)} options={ws.areas.map((a) => [a.id, a.name])} /></Field>
                <Field label="Size"><NumberInput value={s.size} onChange={(v) => upd(i, 'size', v)} /></Field>
                <Field label="Impact"><Select value={s.impact} onChange={(v) => upd(i, 'impact', v)} options={['low', 'medium', 'high']} /></Field>
                <Field label="Share affected"><NumberInput value={s.share} onChange={(v) => upd(i, 'share', v)} min={0} max={1} step={0.1} /></Field>
                <Field label="Current"><Select value={s.current} onChange={(v) => upd(i, 'current', v)} options={POS} /></Field>
                <Field label="Desired"><Select value={s.desired} onChange={(v) => upd(i, 'desired', v)} options={POS} /></Field>
                <Field label="Influence"><Select value={s.influence} onChange={(v) => upd(i, 'influence', v)} options={['low', 'medium', 'high']} /></Field>
                <Field label="Depth"><Select value={s.depth} onChange={(v) => upd(i, 'depth', v)} options={[['technical', 'Technical'], ['structural', 'Structural'], ['cultural', 'Cultural']]} /></Field>
                <Field label="Breadth"><Select value={s.breadth} onChange={(v) => upd(i, 'breadth', v)} options={[['enterprise', 'Enterprise'], ['group', 'Group'], ['individual', 'Individual'], ['external', 'External party']]} /></Field>
                <Field label="Impact from"><input type="text" value={s.from} onChange={(e) => upd(i, 'from', e.target.value)} placeholder="2027-Q1" aria-label="From quarter" /></Field>
                <Field label="Impact to"><input type="text" value={s.to} onChange={(e) => upd(i, 'to', e.target.value)} placeholder="2027-Q4" aria-label="To quarter" /></Field>
                <Field label="Engagement owner"><PersonSelect ws={ws} value={s.ownerId} onChange={(v) => upd(i, 'ownerId', v)} /></Field>
                <Field label="Role in the change" className="span-2"><TextInput value={s.role} onChange={(v) => upd(i, 'role', v)} /></Field>
                <Field label="What changes" className="span-2" style={{ gridColumn: 'span 4' }}><div className="chips">{CHANGES.map((c) => <button key={c} type="button" className={`chip ${(s.changes || []).includes(c) ? 'on' : ''}`} onClick={() => upd(i, 'changes', (s.changes || []).includes(c) ? s.changes.filter((x) => x !== c) : [...(s.changes || []), c])}>{c}</button>)}</div></Field>
              </div>
              <details style={{ marginTop: 6 }}><summary className="mini" style={{ cursor: 'pointer' }}>Readiness checklist (CHG-03) — {Object.values(s.readiness || {}).filter((v) => v === 'yes').length}/{READINESS_QUESTIONS.length} ready</summary>
                {READINESS_QUESTIONS.map(([k, q]) => <div key={k} className="ctrl-row" style={{ gridTemplateColumns: '1fr 220px' }}><span>{q}</span><div className="seg">{[['yes', 'Yes'], ['partial', 'Partly'], ['no', 'No']].map(([v, l]) => <button key={v} type="button" className={s.readiness?.[k] === v ? 'on' : ''} onClick={() => upd(i, 'readiness', { ...(s.readiness || {}), [k]: v })}>{l}</button>)}</div></div>)}
              </details>
            </div>
          );
        })}
      </Card>

      <Card title="Communication plan — the four Ps (CHG-05)" subtitle="Purpose, picture, plan and part for each audience, with two-way feedback" actions={<button className="btn btn-sm btn-primary" onClick={() => updateProgram(p.id, (x) => { x.comms = [...(x.comms || []), { id: uid('cm'), audience: st[0]?.id || '', purpose: '', picture: '', plan: '', part: '', channel: '', date: todayISO(), ownerId: x.changeLeadId || null, feedback: '' }]; }, 'Added communication')}>+ Communication</button>}>
        {!(p.comms || []).length ? <div className="empty-sm">No communications planned.</div> : p.comms.map((c, i) => {
          const u = (k) => (v) => updateProgram(p.id, (x) => { x.comms[i][k] = v; }, 'Edited communication', { field: `cm:${c.id}:${k}` });
          return (
            <div key={c.id} className="form-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', borderBottom: '1px solid var(--line)', paddingBottom: 12, marginBottom: 12 }}>
              <Field label="Audience"><Select value={c.audience} onChange={u('audience')} options={st.map((s) => [s.id, s.name])} /></Field>
              <Field label="Channel"><TextInput value={c.channel} onChange={u('channel')} /></Field>
              <Field label="Date"><input type="date" value={c.date || ''} onChange={(e) => u('date')(e.target.value)} /></Field>
              <Field label="Owner"><PersonSelect ws={ws} value={c.ownerId} onChange={u('ownerId')} /></Field>
              <Field label="Purpose — why change?"><TextArea rows={2} value={c.purpose} onChange={u('purpose')} /></Field>
              <Field label="Picture — what will it look like?"><TextArea rows={2} value={c.picture} onChange={u('picture')} /></Field>
              <Field label="Plan — how will we get there?"><TextArea rows={2} value={c.plan} onChange={u('plan')} /></Field>
              <Field label="Part — what is my role?"><TextArea rows={2} value={c.part} onChange={u('part')} /></Field>
              <Field label="Feedback received" className="full"><TextArea rows={2} value={c.feedback} onChange={u('feedback')} /></Field>
            </div>
          );
        })}
      </Card>

      <div className="grid g-2" data-layout>
        <Card title="Training plan (CHG-07)" subtitle="Just enough, just in time" actions={<button className="btn btn-sm" onClick={() => updateProgram(p.id, (x) => { x.training = [...(x.training || []), { id: uid('tr'), audience: '', competency: '', when: todayISO(), delivered: 0, target: 0 }]; }, 'Added training')}>+ Training</button>}>
          {!(p.training || []).length ? <div className="empty-sm">No training planned.</div> : <table className="table compact"><thead><tr><th>Audience</th><th>Competency</th><th>When</th><th className="num">Delivered / target</th></tr></thead><tbody>{p.training.map((tr, i) => <tr key={tr.id}><td><input className="inline-input" value={tr.audience} onChange={(e) => updateProgram(p.id, (x) => { x.training[i].audience = e.target.value; }, 'Edited training', { field: `tr:${tr.id}:a` })} aria-label="Audience" /></td><td><input className="inline-input" value={tr.competency} onChange={(e) => updateProgram(p.id, (x) => { x.training[i].competency = e.target.value; }, 'Edited training', { field: `tr:${tr.id}:c` })} aria-label="Competency" /></td><td>{fmtDate(tr.when)}</td><td className="num"><NumberInput value={tr.delivered} onChange={(v) => updateProgram(p.id, (x) => { x.training[i].delivered = v; }, 'Training delivered', { field: `tr:${tr.id}:d` })} style={{ width: 60 }} /> / <NumberInput value={tr.target} onChange={(v) => updateProgram(p.id, (x) => { x.training[i].target = v; }, 'Training target', { field: `tr:${tr.id}:t` })} style={{ width: 60 }} /></td></tr>)}</tbody></table>}
        </Card>
        <Card title="Rewards and incentives (CHG-08)" subtitle="Does each benefits path need reward changes?">
          {(chain.paths.length ? chain.paths : [{ id: 'all', name: 'Program', elementIds: chain.elements.map((e) => e.id) }]).map((pa) => {
            const rewardInits = chain.elements.filter((e) => pa.elementIds.includes(e.id) && e.initType === 'Reward or incentive change');
            return <div key={pa.id} className="check-row"><span className="ic">{rewardInits.length ? '✓' : '○'}</span><span><strong>{pa.name}</strong><div className="mini">{rewardInits.length ? rewardInits.map((e) => `${e.code} ${e.title}`).join('; ') : 'No reward or incentive initiative — confirm none is needed.'}</div></span><span className="rule">CHG-08</span></div>;
          })}
        </Card>
      </div>
    </div>
  );
}
