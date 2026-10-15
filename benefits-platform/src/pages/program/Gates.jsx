import { useMemo, useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { GATES, DECISIONS, gateOf, decisionOf, stateOf } from '../../lib/config.js';
import { gateReadiness, fundingApproved, spendToDate, latestValueCase } from '../../lib/rules.js';
import { financials } from '../../lib/finance.js';
import { snapshot, chainOf } from '../../lib/chain.js';
import { summaries, categoryFunds } from '../../lib/portfolio.js';
import { Card, Field, TextInput, TextArea, NumberInput, DateInput, Select, Pill, Modal, ChecksList, Guidance } from '../../components/ui.jsx';
import { money, fmtDate, todayISO, uid, addMonths, monthIndex, sum, fiscalYear } from '../../lib/util.js';

const LIFECYCLE = [['concept', 'Concept definition'], ['G1', 'G1 Initiation'], ['definition', 'Program definition'], ['G2', 'G2 Commitment'], ['active', 'Delivery and integration'], ['G3', 'G3 Commissioning'], ['harvesting', 'Benefits harvesting'], ['G4', 'G4 Completion']];

export default function Gates({ program: p }) {
  const { ws, updateProgram } = useApp();
  const [deciding, setDeciding] = useState(null);
  const [adding, setAdding] = useState(false);
  const gates = (p.gates || []).slice().sort((a, b) => ((a.decision?.date || a.planned || '') < (b.decision?.date || b.planned || '') ? -1 : 1));
  const open = gates.filter((g) => !g.decision);
  const decided = gates.filter((g) => g.decision);
  const stateIdx = { concept: 0, 'awaiting-initiation': 1, definition: 2, 'waiting-list': 3, active: 4, harvesting: 6, completed: 7, withdrawn: -1 }[p.state] ?? 0;
  const cat = ws.categories.find((c) => c.id === p.categoryId);

  return (
    <div className="stack">
      <Card title="Lifecycle and progressive commitment" subtitle={`${cat?.name || ''} lifecycle template (GOV-01) — resources are committed only to the next gate`}>
        <div className="steps" style={{ marginBottom: 8 }}>
          {LIFECYCLE.map(([id, label], i) => {
            const g = decided.filter((x) => x.gate === id).pop();
            const done = i < stateIdx || Boolean(g);
            return <div key={id} className={`step ${done ? 'done' : ''} ${i === stateIdx ? 'current' : ''}`} style={{ fontSize: 12 }}><span className="n">{id.startsWith('G') ? '◆' : i + 1}</span><span>{label}{g && <div className="mini">{fmtDate(g.decision.date)} · {decisionOf(g.decision.option)?.label}</div>}</span></div>;
          })}
        </div>
        <div className="row mini"><span>State: <strong>{stateOf(p.state).label}</strong></span><span>Approved to date: <strong>{money(fundingApproved(p))}</strong></span><span>Spent: <strong>{money(spendToDate(p))}</strong></span><span>Lifetime estimate: <strong>{money(Number(p.costLow) || null)}–{money(Number(p.costHigh) || null)}</strong></span></div>
      </Card>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>Upcoming and open gates</h3>
        <div className="btn-row">
          <button className="btn btn-sm" onClick={() => updateProgram(p.id, (x) => { const last = (x.gates || []).filter((g) => g.gate === 'BR').map((g) => g.planned).sort().pop() || todayISO(); for (let i = 1; i <= 4; i++) x.gates.push({ id: uid('g'), gate: 'BR', planned: addMonths(last, 3 * i), held: null, checklist: {}, decision: null, recurring: true }); }, 'Scheduled quarterly benefits reviews (GOV-08)')}>Schedule quarterly benefits reviews</button>
          <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>+ Gate or review</button>
        </div>
      </div>
      {!open.length && <Card><div className="empty-sm">No open gates. Schedule the next gate so the gate calendar can remind people (GOV-07).</div></Card>}
      {open.map((g) => <OpenGate key={g.id} p={p} g={g} onDecide={() => setDeciding(g.id)} />)}

      <Card title="Decision history (GOV-09)" subtitle="Immutable once recorded; corrections supersede the original" pad={false}>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Gate</th><th>Date</th><th>Decision</th><th>Rationale and conditions</th><th>Decision makers</th><th className="num">Funding released</th><th>Value case</th></tr></thead>
          <tbody>{decided.slice().reverse().map((g) => (
            <tr key={g.id} style={g.decision.supersededBy ? { opacity: 0.55 } : undefined}>
              <td><strong>{gateOf(g.gate)?.name || g.gate}</strong>{g.eventTriggered && <div className="mini">Event: {g.eventTriggered}</div>}</td>
              <td className="nowrap">{fmtDate(g.decision.date)}</td>
              <td><Pill tone={{ good: 'good', warning: 'warning', neutral: 'navy' }[decisionOf(g.decision.option)?.tone]}>{decisionOf(g.decision.option)?.label}</Pill>{g.decision.option === 'withdraw' && <div className="mini pos">Resources released</div>}{g.decision.supersededBy && <div className="mini">Superseded</div>}{g.decision.supersedes && <div className="mini">Supersedes earlier record</div>}</td>
              <td className="small">{g.decision.rationale}{g.decision.conditions && <div className="mini"><strong>Conditions:</strong> {g.decision.conditions}</div>}{g.decision.override && <div className="mini sev-warning">Funding override: {g.decision.override}</div>}</td>
              <td className="small">{g.decision.makers}</td>
              <td className="num">{money(g.decision.fundingApproved)}</td>
              <td>{g.decision.valueCaseVersion ? `v${g.decision.valueCaseVersion}` : '—'}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {decided.length > 0 && <div className="card-body"><button className="btn btn-sm" onClick={() => { const g = decided[decided.length - 1]; const reason = window.prompt('Correction note (the original record is kept and marked superseded):'); if (reason) updateProgram(p.id, (x) => { const og = x.gates.find((y) => y.id === g.id); const copy = { ...structuredClone(og), id: uid('g'), decision: { ...structuredClone(og.decision), supersedes: og.id, rationale: `${og.decision.rationale} [Correction ${fmtDate(todayISO())}: ${reason}]` } }; og.decision.supersededBy = copy.id; x.gates.push(copy); }, 'Gate decision superseded (DAT-02)', { action: 'supersede' }); }}>Correct the latest decision…</button></div>}
      </Card>

      <Pilots p={p} />

      {deciding && <DecisionModal p={p} gateId={deciding} onClose={() => setDeciding(null)} />}
      {adding && (
        <Modal title="Schedule a gate or review" onClose={() => setAdding(false)} footer={null}>
          <AddGate p={p} onDone={() => setAdding(false)} />
        </Modal>
      )}
    </div>
  );
}

function OpenGate({ p, g, onDecide }) {
  const { ws, updateProgram } = useApp();
  const rd = useMemo(() => gateReadiness(p, ws, g.gate), [p, ws, g.gate]);
  const s = summaries(ws).get(p.id);
  const vc = latestValueCase(p);
  const set = (k, v) => updateProgram(p.id, (x) => { x.gates.find((y) => y.id === g.id)[k] = v; }, `Gate ${g.gate}: ${k}`, { field: `${g.id}:${k}` });
  const setCheck = (cid, patch) => updateProgram(p.id, (x) => { const y = x.gates.find((q) => q.id === g.id); y.checklist = { ...(y.checklist || {}), [cid]: { ...(y.checklist?.[cid] || {}), ...patch } }; }, `Gate ${g.gate} checklist`, { field: `${g.id}:chk:${cid}` });
  const asm = chainOf(p).elements.filter((e) => e.kind === 'assumption');
  const overdue = g.planned && g.planned < todayISO();
  return (
    <Card title={`${gateOf(g.gate)?.name || g.gate}${g.title ? ` — ${g.title}` : ''}`} subtitle={gateOf(g.gate)?.questions} actions={<>
      {overdue && <Pill tone="critical">Overdue</Pill>}
      <DateInput value={g.planned} onChange={(v) => set('planned', v)} aria-label="Planned date" />
      <button className="btn btn-sm btn-primary" onClick={onDecide}>Record decision…</button>
    </>}>
      {g.eventTriggered && <div className="callout warn" style={{ marginBottom: 10 }}>Event-triggered review: {g.eventTriggered} (GOV-07)</div>}
      <div className="grid g-2" data-layout>
        <div>
          <div className="section-title" style={{ marginTop: 0 }}>Gate criteria checklist (GOV-06)</div>
          {rd.criteria.map((c) => {
            const ov = g.checklist?.[c.id] || {};
            const state = ov.state || (c.auto ? 'met' : 'not-met');
            return (
              <div key={c.id} style={{ borderBottom: '1px dashed var(--line)', padding: '7px 0' }}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                  <span style={{ fontSize: 13 }}>{c.text}<div className="mini">Auto-check: {c.auto ? '✓' : '✕'} {c.evidence}</div></span>
                  <select value={state} onChange={(e) => setCheck(c.id, { state: e.target.value })} aria-label={c.text} style={{ width: 110 }}><option value="met">✓ Met</option><option value="not-met">✕ Not met</option><option value="waived">~ Waived</option></select>
                </div>
                {state === 'waived' && <input type="text" placeholder="Justification for waiver (required)" value={ov.note || ''} onChange={(e) => setCheck(c.id, { note: e.target.value })} style={{ width: '100%', marginTop: 4 }} aria-label="Waiver justification" />}
              </div>
            );
          })}
          {rd.blocking.length > 0 && <><div className="section-title">Blocking business rules</div><ChecksList checks={rd.blocking} /><label className="check mini" style={{ marginTop: 6 }}><input type="checkbox" checked={Boolean(g.waived)} onChange={(e) => set('waived', e.target.checked ? { by: ws.currentUser, date: todayISO() } : null)} /> VMO waives incomplete submission (reason in decision record)</label></>}
        </div>
        <div>
          <div className="section-title" style={{ marginTop: 0 }}>Submission package (GOV-02)</div>
          <table className="table compact kv"><tbody>
            <tr><td>Value case</td><td>{vc ? `v${vc.version} (${vc.status})${vc.createdAt < (p.materialChangeAt || '') ? ' — stale' : ''}` : <span className="sev-error">None</span>}</td></tr>
            <tr><td>Benefits map</td><td>{chainOf(p).elements.length} elements · {chainOf(p).versions.filter((v) => v.baseline).length} baselines</td></tr>
            <tr><td>Benefit profiles</td><td>{p.benefits.length} benefits ({p.benefits.filter((b) => b.measureId).length} with measures)</td></tr>
            <tr><td>Cost to date / lifetime</td><td>{money(spendToDate(p))} / {money(s.fin.totalCosts)}</td></tr>
            <tr><td>Value assessment</td><td>Alignment {s.align.score === null ? '—' : Math.round(s.align.score)} · Risk {s.risk.overall === null ? '—' : Math.round(s.risk.overall)} · NPV {money(s.fin.npv)}</td></tr>
            <tr><td>Assumptions</td><td>{asm.filter((a) => a.assumption?.status === 'holding').length} holding · {asm.filter((a) => a.assumption?.status === 'at-risk').length} at risk · {asm.filter((a) => a.assumption?.status === 'invalid').length} invalid</td></tr>
            <tr><td>Change readiness</td><td>{(p.stakeholders || []).filter((x) => x.current === x.desired).length}/{(p.stakeholders || []).length} groups at desired position</td></tr>
            <tr><td>Open issues</td><td>{(p.log || []).filter((l) => l.type === 'issue' && l.status !== 'closed').length} issues · {s.errors} blocking checks</td></tr>
            <tr><td>Funding requested</td><td>{money(vc?.fundingRequested ?? null)}</td></tr>
          </tbody></table>
          <PortfolioImpact p={p} />
        </div>
      </div>
    </Card>
  );
}

// GOV-05: funds released or required by category, dependent programs, and waiting-list candidates.
function PortfolioImpact({ p }) {
  const { ws } = useApp();
  const s = summaries(ws);
  const fy = fiscalYear(todayISO(), ws.settings.fyStartMonth);
  const funds = categoryFunds(ws, fy).find((f) => f.category.id === p.categoryId);
  const deps = ws.dependencies.filter((d) => d.from === p.id || d.to === p.id);
  const waiting = ws.programs.filter((x) => x.state === 'waiting-list' || x.selection === 'queued').sort((a, b) => (a.waitRank || 99) - (b.waitRank || 99));
  return (
    <>
      <div className="section-title">Portfolio impact (GOV-05)</div>
      <div className="small">
        <div>{funds?.category.name} {`FY${String(fy).slice(-2)}`}: allocation {money(funds?.allocation)}, forecast spend {money(funds?.forecast)}, <strong className={funds?.available < 0 ? 'neg' : ''}>available {money(funds?.available)}</strong>.</div>
        <div style={{ marginTop: 4 }}>Dependent programs: {deps.length ? deps.map((d) => `${ws.programs.find((x) => x.id === (d.from === p.id ? d.to : d.from))?.name} (${d.type})`).join('; ') : 'none'}.</div>
        <div style={{ marginTop: 4 }}>Waiting-list candidates if funds are released: {waiting.filter((x) => x.id !== p.id).map((x) => `${x.code} ${x.name} (NPV ${money(s.get(x.id).fin.npv)})`).join('; ') || 'none'}.</div>
      </div>
    </>
  );
}

function DecisionModal({ p, gateId, onClose }) {
  const { ws, updateProgram, me } = useApp();
  const g = p.gates.find((x) => x.id === gateId);
  const gate = gateOf(g.gate);
  const fin = financials(p, ws);
  const vc = latestValueCase(p);
  const rd = gateReadiness(p, ws, g.gate);
  const startMi = fin.startMi;
  const nextOpen = p.gates.filter((x) => !x.decision && x.id !== g.id && x.planned > (g.planned || '')).sort((a, b) => (a.planned < b.planned ? -1 : 1))[0];
  const from = Math.max(0, monthIndex(g.planned || todayISO()) - startMi); const to = nextOpen ? Math.max(from + 1, monthIndex(nextOpen.planned) - startMi) : from + 12;
  const estimate = Math.round(sum(Array.from(fin.costsM.slice(from, to))) / 1000) * 1000;
  const limit = estimate * (1 + ws.settings.thresholds.contingency);
  const [f, setF] = useState({ option: 'stay', rationale: '', conditions: '', makers: ws.board?.name || 'Investment Decision Board', date: todayISO(), fundingApproved: vc?.fundingRequested ?? estimate, costLow: p.costLow, costHigh: p.costHigh, override: '', lockVc: true, baseline: true });
  const set = (k) => (v) => setF({ ...f, [k]: v });
  // Decision authority (BR-18, GOV-11): IDB gates need a board member; sponsor-level reviews need the sponsor; delegated authority for non-discretionary categories.
  const cat = ws.categories.find((c) => c.id === p.categoryId);
  const roles = me?.roles || [];
  const authorised = /IDB/.test(gate.authority) ? roles.some((r) => /IDB/.test(r)) || (!cat?.discretionary && Number(f.fundingApproved) < 3000000 && me?.id === 'p-okafor') : /sponsor/i.test(gate.authority) ? me?.id === p.sponsorId || roles.some((r) => /IDB/.test(r)) : true;
  const overLimit = Number(f.fundingApproved) > limit && limit > 0;
  const blocked = rd.blocking.length > 0 && !g.waived && f.option !== 'withdraw' && f.option !== 'delay';
  const ok = f.rationale.trim() && authorised && (!overLimit || f.override.trim()) && !blocked;
  const save = () => {
    updateProgram(p.id, (x) => {
      const y = x.gates.find((q) => q.id === g.id);
      y.held = f.date;
      y.decision = { option: f.option, date: f.date, rationale: f.rationale, conditions: f.conditions, makers: f.makers, recordedBy: ws.currentUser, fundingApproved: f.option === 'withdraw' || f.option === 'delay' ? 0 : Number(f.fundingApproved) || 0, costLow: f.costLow, costHigh: f.costHigh, override: overLimit ? f.override : '', valueCaseVersion: vc?.version || null, waived: g.waived || null };
      if (f.costLow) x.costLow = f.costLow; if (f.costHigh) x.costHigh = f.costHigh;
      const after = { stay: gate.stageAfter, conditions: gate.stageAfter, modify: gate.stageAfter, delay: null, withdraw: 'withdrawn' }[f.option];
      if (after && after !== x.state) { x.state = after; x.stateSince = f.date; }
      if (f.option === 'delay' && g.gate === 'G2') { x.state = 'waiting-list'; x.selection = 'queued'; x.stateSince = f.date; }
      if (f.option === 'withdraw') { x.selection = 'not-selected'; x.withdrawal = x.withdrawal || { date: f.date, reason: f.rationale, released: Math.max(0, fundingApproved(x) - spendToDate(x)), salvage: '', lessons: '' }; }
      if (f.option === 'modify') x.materialChangeAt = new Date().toISOString();
      if (f.lockVc && vc && vc.status !== 'locked') { const v = x.valueCases.find((q) => q.id === vc.id); v.status = 'locked'; v.lockedAt = new Date().toISOString(); }
      if (f.baseline) x.chain.versions.push({ id: uid('ver'), label: `Baseline at ${gate.name}`, date: new Date().toISOString(), by: ws.currentUser, baseline: true, snapshot: snapshot(x.chain) });
      if (g.gate === 'G2') x.baselineLocked = true;
    }, `${gate.name} decision: ${decisionOf(f.option).label}`, { action: 'decision', object: 'gate', objectId: g.id });
    onClose();
  };
  return (
    <Modal title={`Record ${gate.name} decision`} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!ok} onClick={save}>Record decision</button></>}>
      <Guidance title="Gates are resting points for self-examination, not hoops.">Stopping a program to release resources is a governance success. Funding is released only to the next gate.</Guidance>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <Field label="Decision (GOV-04)" className="full"><div className="seg" role="radiogroup">{DECISIONS.map((d) => <button key={d.id} type="button" role="radio" aria-checked={f.option === d.id} className={f.option === d.id ? 'on' : ''} onClick={() => set('option')(d.id)}>{d.label}</button>)}</div></Field>
        <Field label="Rationale" className="full"><TextArea value={f.rationale} onChange={set('rationale')} /></Field>
        <Field label="Conditions and actions" className="full"><TextArea value={f.conditions} onChange={set('conditions')} rows={2} /></Field>
        <Field label="Decision makers"><TextInput value={f.makers} onChange={set('makers')} /></Field>
        <Field label="Date"><DateInput value={f.date} onChange={set('date')} /></Field>
        {f.option !== 'withdraw' && f.option !== 'delay' && <Field label="Funding released to next gate" hint={`estimate ${money(estimate)}; limit ${money(limit)} incl. contingency`}><NumberInput value={f.fundingApproved} onChange={set('fundingApproved')} /></Field>}
        <Field label="Lifetime cost range (GOV-03)"><div className="row" style={{ flexWrap: 'nowrap' }}><NumberInput value={f.costLow} onChange={set('costLow')} aria-label="Lower" /><NumberInput value={f.costHigh} onChange={set('costHigh')} aria-label="Upper" /></div></Field>
        {overLimit && <Field label="Board chair override reason (BR-09)" className="full"><TextInput value={f.override} onChange={set('override')} /></Field>}
        <label className="check"><input type="checkbox" checked={f.lockVc} onChange={(e) => set('lockVc')(e.target.checked)} /> Lock value case {vc ? `v${vc.version}` : ''} as reviewed (BR-08)</label>
        <label className="check"><input type="checkbox" checked={f.baseline} onChange={(e) => set('baseline')(e.target.checked)} /> Baseline the benefits map (RCM-13)</label>
      </div>
      {!authorised && <div className="callout warn" style={{ marginTop: 10 }}>You are viewing as {me?.name}. {gate.name} decisions are recorded by: {gate.authority} (BR-18). Switch “Viewing as” to a board member.</div>}
      {blocked && <div className="callout warn" style={{ marginTop: 10 }}>Blocking rules must be resolved or waived by the VMO first: {rd.blocking.map((c) => c.rule).join(', ')}.</div>}
    </Modal>
  );
}

function AddGate({ p, onDone }) {
  const { updateProgram } = useApp();
  const [f, setF] = useState({ gate: 'BR', planned: addMonths(todayISO(), 1), eventTriggered: '' });
  return (
    <div className="stack">
      <Field label="Gate"><Select value={f.gate} onChange={(v) => setF({ ...f, gate: v })} options={GATES.map((g) => [g.id, g.name])} /></Field>
      <Field label="Planned date"><DateInput value={f.planned} onChange={(v) => setF({ ...f, planned: v })} /></Field>
      <Field label="Event trigger (optional)" hint="assumption invalid, variance, strategy change"><TextInput value={f.eventTriggered} onChange={(v) => setF({ ...f, eventTriggered: v })} /></Field>
      <div className="btn-row"><button className="btn btn-primary" onClick={() => { updateProgram(p.id, (x) => { x.gates.push({ id: uid('g'), gate: f.gate, planned: f.planned, held: null, checklist: {}, decision: null, eventTriggered: f.eventTriggered || null }); }, `Scheduled ${f.gate} for ${f.planned}`); onDone(); }}>Schedule</button></div>
    </div>
  );
}

function Pilots({ p }) {
  const { updateProgram } = useApp();
  const list = p.pilots || [];
  const upd = (i, k, v) => updateProgram(p.id, (x) => { x.pilots[i][k] = v; }, 'Updated pilot', { field: `pilot:${i}:${k}` });
  return (
    <Card title="Pilots and proofs of concept (GOV-10)" subtitle="Try before you buy: test hypotheses during definition and feed results into the value case" actions={<button className="btn btn-sm" onClick={() => updateProgram(p.id, (x) => { x.pilots = [...(x.pilots || []), { id: uid('pl'), name: 'New pilot', objective: '', hypothesis: '', result: '', lessons: '', status: 'planned', from: todayISO(), to: addMonths(todayISO(), 2) }]; }, 'Added pilot')}>+ Pilot</button>}>
      {!list.length ? <div className="empty-sm">No pilots recorded.</div> : list.map((pl, i) => (
        <div key={pl.id} className="form-grid" style={{ borderBottom: '1px dashed var(--line)', paddingBottom: 10, marginBottom: 10 }}>
          <Field label="Pilot"><TextInput value={pl.name} onChange={(v) => upd(i, 'name', v)} /></Field>
          <Field label="Status"><Select value={pl.status} onChange={(v) => upd(i, 'status', v)} options={['planned', 'running', 'complete']} /></Field>
          <Field label="Objective"><TextArea rows={2} value={pl.objective} onChange={(v) => upd(i, 'objective', v)} /></Field>
          <Field label="Hypothesis tested"><TextArea rows={2} value={pl.hypothesis} onChange={(v) => upd(i, 'hypothesis', v)} /></Field>
          <Field label="Result"><TextArea rows={2} value={pl.result} onChange={(v) => upd(i, 'result', v)} /></Field>
          <Field label="Lessons and value-case impact"><TextArea rows={2} value={pl.lessons} onChange={(v) => upd(i, 'lessons', v)} /></Field>
        </div>
      ))}
      {p.id === 'prg-cis' && !list.length && <p className="mini">Tip: the cross-sell pilot testing assumption A1 belongs here.</p>}
    </Card>
  );
}
