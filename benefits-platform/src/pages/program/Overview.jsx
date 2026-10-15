import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, personName } from '../../lib/store.jsx';
import { BTOPP, DESIGN_STEPS, STATES } from '../../lib/config.js';
import { summaries } from '../../lib/portfolio.js';
import { sortChecks, benefitsDependingOn } from '../../lib/rules.js';
import { Card, ChecksList, Field, TextInput, TextArea, NumberInput, DateInput, Select, PersonSelect, MultiChips, Meter, Pill, Modal, Guidance, Help } from '../../components/ui.jsx';
import { healthTone } from '../../lib/scoring.js';
import { fmtDate, money, monthsBetween, similarity, todayISO, uid } from '../../lib/util.js';

export default function Overview({ program: p }) {
  const { ws, patchProgram, updateProgram, me } = useApp();
  const s = summaries(ws).get(p.id);
  const cat = ws.categories.find((c) => c.id === p.categoryId);
  const set = (k, label) => (v) => patchProgram(p.id, { [k]: v }, label || `Changed ${k}`);
  const [catChange, setCatChange] = useState(null);
  const [closing, setClosing] = useState(null);
  const isVmo = (me?.roles || []).some((r) => /VMO|IDB chair/.test(r));

  // Delays that move dependent benefit profiles (PRG-04 three synchronised views, BEN-12).
  const delays = (p.projects || []).filter((x) => x.forecastEnd && x.baselineEnd && x.forecastEnd > x.baselineEnd).map((x) => ({ x, slip: monthsBetween(x.baselineEnd, x.forecastEnd), benefits: benefitsDependingOn(p, x.id) }));
  const lessons = useMemo(() => ws.lessons.filter((l) => l.programId !== p.id).map((l) => ({ l, score: similarity(`${p.name} ${p.purpose} ${p.scope}`, `${l.lesson} ${l.context} ${l.tags.join(' ')} ${ws.programs.find((x) => x.id === l.programId)?.name || ''}`) + (ws.programs.find((x) => x.id === l.programId)?.categoryId === p.categoryId ? 0.15 : 0) })).filter((x) => x.score > 0.12).sort((a, b) => b.score - a.score).slice(0, 4), [ws, p]);

  return (
    <div className="split">
      <div className="stack">
        <Card title="Program record" subtitle="PRG-01 — the program is the unit that owns benefits">
          <div className="form-grid">
            <Field label="Program name" className="full"><TextInput value={p.name} onChange={set('name', 'Renamed program')} /></Field>
            <Field label="Problem or opportunity" className="full"><TextArea value={p.problem} onChange={set('problem')} /></Field>
            <Field label="Purpose" className="full"><TextArea value={p.purpose} onChange={set('purpose')} /></Field>
            <Field label="Scope statement" className="full"><TextArea value={p.scope} onChange={set('scope')} /></Field>
            <Field label="Investment category" hint="changes need VMO approval">
              <select value={p.categoryId} onChange={(e) => setCatChange({ to: e.target.value, rationale: '' })}>{ws.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              {p.categoryChange && !p.categoryChange.approvedAt && <span className="mini sev-warning">Pending VMO approval: change to {ws.categories.find((c) => c.id === p.categoryChange.to)?.name}</span>}
            </Field>
            <Field label="Lifecycle state"><Select value={p.state} onChange={(v) => patchProgram(p.id, { state: v, stateSince: todayISO() }, `State changed to ${v}`)} options={STATES.map((x) => [x.id, x.label])} /></Field>
            <Field label="Business sponsor" hint={p.sponsorId ? 'use Accountability → succession to change' : 'exactly one, required'}>
              {p.sponsorId ? <div className="row"><strong>{personName(ws, p.sponsorId)}</strong><Link className="btn btn-sm" to={`/programs/${p.id}/accountability`}>Succession…</Link></div> : <PersonSelect ws={ws} value={p.sponsorId} onChange={set('sponsorId', 'Sponsor nominated')} />}
            </Field>
            <Field label="Program manager"><PersonSelect ws={ws} value={p.managerId} onChange={set('managerId')} /></Field>
            <Field label="Value analyst"><PersonSelect ws={ws} value={p.analystId} onChange={set('analystId')} /></Field>
            <Field label="Change lead"><PersonSelect ws={ws} value={p.changeLeadId} onChange={set('changeLeadId')} /></Field>
            <Field label="Start date"><DateInput value={p.startDate} onChange={set('startDate')} /></Field>
            <Field label="End date"><DateInput value={p.endDate} onChange={set('endDate')} /></Field>
            <Field label="Lifetime cost — lower estimate"><NumberInput value={p.costLow} onChange={set('costLow')} /></Field>
            <Field label="Lifetime cost — upper estimate"><NumberInput value={p.costHigh} onChange={set('costHigh')} /></Field>
            <Field label="Evaluation horizon (years)"><NumberInput value={p.horizonYears} onChange={set('horizonYears')} min={1} max={30} /></Field>
            <Field label="Security classification"><Select value={p.classification} onChange={set('classification')} options={['Public', 'Internal', 'OFFICIAL', 'OFFICIAL: Sensitive', 'Confidential']} /></Field>
            <Field label="Affected business areas" className="full"><MultiChips options={ws.areas.map((a) => [a.id, a.name])} value={p.areas || []} onChange={set('areas')} /></Field>
            <Field label="Strategic drivers" className="full"><MultiChips options={ws.drivers.map((d) => [d.id, d.name])} value={p.driverIds || []} onChange={set('driverIds')} /></Field>
            <Field label="Architecture fit (are we doing it the right way?)" className="full"><TextArea value={p.architecture} onChange={set('architecture')} rows={2} /></Field>
          </div>
        </Card>

        {cat && !cat.discretionary && cat.lightFields?.length > 0 && (
          <Card title={`${cat.name} template`} subtitle="Proportionate rigour (INV-03): non-discretionary categories use a lighter path">
            <Guidance>{cat.path}</Guidance>
            <div className="form-grid" style={{ marginTop: 12 }}>
              {cat.lightFields.map((f) => <Field key={f} label={f} className="full"><TextInput value={p.light?.[f]} onChange={(v) => updateProgram(p.id, (x) => { x.light = { ...(x.light || {}), [f]: v }; }, `Updated ${f}`, { field: f })} /></Field>)}
            </div>
          </Card>
        )}

        <Card title="Eight design steps" subtitle="PRG-02 — complete in any order or in parallel">
          <div className="design-steps">
            {DESIGN_STEPS.map(([id, title, tip], i) => {
              const st = p.designSteps?.[id] || 'not-started';
              return (
                <div key={id} className={`dstep ${st}`}>
                  <div className="n">Step {i + 1} <Help>{tip}</Help></div>
                  <div style={{ fontWeight: 600 }}>{title}</div>
                  <select value={st} aria-label={`Status of ${title}`} onChange={(e) => updateProgram(p.id, (x) => { x.designSteps = { ...(x.designSteps || {}), [id]: e.target.value }; }, `Design step “${title}” → ${e.target.value}`, { field: `step:${id}` })}>
                    <option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="done">Done</option>
                  </select>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="BTOPP scope checklist" subtitle="PRG-03 — look at the whole business system, not just the technology">
          {BTOPP.map((b) => (
            <div key={b.id} style={{ borderBottom: '1px dashed var(--line)', padding: '10px 0' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}><strong>{b.name}</strong><span className="mini">{b.question}</span></div>
              <div className="form-grid" style={{ marginTop: 6 }}>
                <Field label="Answer"><TextArea rows={2} value={p.btoppChecklist?.[b.id]?.answer} onChange={(v) => updateProgram(p.id, (x) => { x.btoppChecklist = { ...(x.btoppChecklist || {}), [b.id]: { ...(x.btoppChecklist?.[b.id] || {}), answer: v } }; }, `BTOPP ${b.name} answer`, { field: `btopp:${b.id}` })} /></Field>
                <Field label="Resulting initiatives"><TextArea rows={2} value={p.btoppChecklist?.[b.id]?.initiative} onChange={(v) => updateProgram(p.id, (x) => { x.btoppChecklist = { ...(x.btoppChecklist || {}), [b.id]: { ...(x.btoppChecklist?.[b.id] || {}), initiative: v } }; }, `BTOPP ${b.name} initiatives`, { field: `btoppi:${b.id}` })} /></Field>
              </div>
            </div>
          ))}
        </Card>

        <Increments program={p} />
        <StatusReports program={p} />
      </div>

      <div className="stack">
        <Card title="Program health" subtitle="PRG-13 — components always shown beside the indicator">
          <div className="row" style={{ marginBottom: 10 }}><span className="hero-num">{s.health.score === null ? '—' : Math.round(s.health.score)}</span><Pill tone={healthTone(s.health.score)}>{s.health.score === null ? 'No data' : s.health.score >= 70 ? 'Healthy' : s.health.score >= 50 ? 'Watch' : 'Concern'}</Pill></div>
          {Object.entries({ delivery: 'Delivery', benefits: 'Benefits', assumptions: 'Assumptions', risk: 'Risk (inverse)', readiness: 'Change readiness' }).map(([k, l]) => (
            <div key={k} className="comp-row"><span>{l}</span><Meter value={s.health.comps[k]} label={l} color={s.health.comps[k] === undefined ? 'transparent' : s.health.comps[k] >= 70 ? 'var(--st-good)' : s.health.comps[k] >= 50 ? 'var(--st-warning)' : 'var(--st-critical)'} /><span className="num">{s.health.comps[k] === undefined ? '—' : Math.round(s.health.comps[k])}</span></div>
          ))}
          <div className="mini">Weights are configurable in Settings. The indicator advises; it never decides.</div>
        </Card>
        <Card title="Readiness and quality checks" subtitle="GDA-01 — rules-based, with the rule reference">
          <ChecksList checks={sortChecks(s.checks)} limit={14} />
        </Card>
        {delays.length > 0 && (
          <Card title="Delivery delays flowing to benefits" subtitle="PRG-04 / BEN-12 — the plan, map and benefits stay in step">
            {delays.map(({ x, slip, benefits }) => (
              <div key={x.id} className="check-row"><span className="ic sev-warning">!</span><span><strong>{x.name}</strong> forecast {slip} month{slip === 1 ? '' : 's'} late ({fmtDate(x.forecastEnd)}). {benefits.length ? `Moves the start of ${benefits.map((b) => `“${b.b.title}” to ${fmtDate(b.start)}`).join('; ')}.` : 'No dependent benefits.'}</span><span className="rule">PRJ-05</span></div>
            ))}
          </Card>
        )}
        {lessons.length > 0 && (
          <Card title="Lessons from similar programs" subtitle="HIS-03 — surfaced automatically">
            {lessons.map(({ l }) => <div key={l.id} style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)', fontSize: 13 }}>{l.lesson}<div className="mini">{ws.programs.find((x) => x.id === l.programId)?.name} · {l.gate} · {l.tags.join(', ')}</div></div>)}
          </Card>
        )}
        <Card title="Close the program" subtitle="Completion (PRG-11) or withdrawal (PRG-12)">
          {p.state === 'completed' && p.completion ? <p>Completed {fmtDate(p.completion.date)}. {p.completion.handoverNote} Post-handover tracking until {fmtDate(p.completion.postHandoverUntil)}.</p>
            : p.state === 'withdrawn' && p.withdrawal ? <div><p><strong>Resources released:</strong> {money(p.withdrawal.released)} on {fmtDate(p.withdrawal.date)}.</p><p>{p.withdrawal.reason}</p><p className="mini">Salvaged: {p.withdrawal.salvage}</p><Pill tone="good" icon="✓">Recorded as a governance success</Pill></div>
              : <div className="btn-row"><button className="btn" onClick={() => setClosing('complete')}>Request completion…</button><button className="btn" onClick={() => setClosing('withdraw')}>Withdraw and release resources…</button></div>}
        </Card>
      </div>

      {catChange && (
        <Modal title="Change investment category" onClose={() => setCatChange(null)} footer={<><button className="btn" onClick={() => setCatChange(null)}>Cancel</button><button className="btn btn-primary" disabled={!catChange.rationale.trim()} onClick={() => {
          updateProgram(p.id, (x) => {
            const rec = { from: x.categoryId, to: catChange.to, rationale: catChange.rationale, requestedBy: ws.currentUser, requestedAt: new Date().toISOString(), approvedAt: isVmo ? new Date().toISOString() : null, approvedBy: isVmo ? ws.currentUser : null };
            x.categoryHistory = [...(x.categoryHistory || []), rec];
            if (isVmo) { x.categoryId = catChange.to; x.categoryChange = null; } else x.categoryChange = rec;
          }, `Category change ${isVmo ? 'approved' : 'requested'}: ${ws.categories.find((c) => c.id === catChange.to)?.name}`, { field: 'categoryId', before: p.categoryId, after: catChange.to });
          setCatChange(null);
        }}>{isVmo ? 'Approve and change' : 'Request VMO approval'}</button></>}>
          <p>Category determines the depth of assessment and the funding pool, so changes are approved by the VMO and audited (INV-07, BR-21).</p>
          <Field label="Rationale"><TextArea value={catChange.rationale} onChange={(v) => setCatChange({ ...catChange, rationale: v })} /></Field>
          {!isVmo && <p className="mini">You are viewing as {me?.name}. Switch “Viewing as” to the VMO lead to approve directly.</p>}
        </Modal>
      )}
      {closing && <CloseProgram program={p} mode={closing} onClose={() => setClosing(null)} />}
    </div>
  );
}

function Increments({ program: p }) {
  const { updateProgram } = useApp();
  const upd = (i, k, v) => updateProgram(p.id, (x) => { x.increments[i][k] = v; }, 'Updated increment', { field: `inc:${i}:${k}` });
  return (
    <Card title="Delivery increments and quick wins" subtitle="PRG-10 / EVM-05 — 60–90 day increments, each with measurable value" actions={<button className="btn btn-sm" onClick={() => updateProgram(p.id, (x) => { x.increments = [...(x.increments || []), { id: uid('inc'), name: 'New increment', start: todayISO(), end: todayISO(), expectedValue: 0, realisedValue: null, quickWin: false }]; }, 'Added increment')}>+ Increment</button>}>
      {!(p.increments || []).length ? <div className="empty-sm">No increments yet.</div> : (
        <div className="table-wrap"><table className="table compact"><thead><tr><th>Increment</th><th>Start</th><th>End</th><th className="num">Expected value</th><th className="num">Realised</th><th>Quick win</th><th>Length</th></tr></thead><tbody>
          {p.increments.map((inc, i) => {
            const len = inc.start && inc.end ? Math.round((new Date(inc.end) - new Date(inc.start)) / 86400000) : null;
            return (
              <tr key={inc.id}>
                <td><input className="inline-input" value={inc.name} onChange={(e) => upd(i, 'name', e.target.value)} aria-label="Increment name" /></td>
                <td><DateInput value={inc.start} onChange={(v) => upd(i, 'start', v)} /></td>
                <td><DateInput value={inc.end} onChange={(v) => upd(i, 'end', v)} /></td>
                <td><NumberInput value={inc.expectedValue} onChange={(v) => upd(i, 'expectedValue', v)} style={{ width: 110 }} /></td>
                <td><NumberInput value={inc.realisedValue} onChange={(v) => upd(i, 'realisedValue', v)} style={{ width: 110 }} /></td>
                <td><input type="checkbox" checked={Boolean(inc.quickWin)} onChange={(e) => upd(i, 'quickWin', e.target.checked)} aria-label="Quick win" /></td>
                <td>{len === null ? '—' : <Pill tone={len >= 60 && len <= 90 ? 'good' : 'warning'}>{len} days</Pill>}</td>
              </tr>
            );
          })}
        </tbody></table></div>
      )}
    </Card>
  );
}

function StatusReports({ program: p }) {
  const { ws, updateProgram } = useApp();
  const s = summaries(ws).get(p.id);
  const rag = (v) => <Pill tone={{ green: 'good', amber: 'warning', red: 'critical' }[v] || 'none'}>{v || '—'}</Pill>;
  const draft = () => {
    const proj = p.projects.filter((x) => x.state !== 'cancelled');
    const worst = (list) => (list.includes('red') ? 'red' : list.includes('amber') ? 'amber' : 'green');
    const asm = p.chain.elements.filter((e) => e.kind === 'assumption').map((a) => a.assumption?.status);
    const ben = s.status;
    const st = p.stakeholders || [];
    return {
      id: uid('sr'), date: todayISO(), period: new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }),
      delivery: worst(proj.map((x) => x.status)), benefits: ben['off-track'] ? 'red' : ben['at-risk'] ? 'amber' : 'green',
      assumptions: asm.includes('invalid') ? 'red' : asm.includes('at-risk') ? 'amber' : 'green',
      risks: s.risk.overall > 65 ? 'red' : s.risk.overall > 35 ? 'amber' : 'green',
      readiness: st.some((x) => x.current === 'opposed') ? 'amber' : 'green',
      commentary: `${proj.length} projects (${proj.filter((x) => x.status !== 'green').length} not green). Benefits: ${ben['on-track']} on track, ${ben['at-risk']} at risk, ${ben['off-track']} off track. ${s.checks.filter((c) => c.severity === 'error').length} blocking issues in the readiness checks.`,
      auto: true,
    };
  };
  return (
    <Card title="Status reports" subtitle="PRG-06 — project status rolls up automatically" actions={<button className="btn btn-sm" onClick={() => updateProgram(p.id, (x) => { x.statusReports = [draft(), ...(x.statusReports || [])]; }, 'Status report drafted')}>Draft this period’s report</button>}>
      {!(p.statusReports || []).length ? <div className="empty-sm">No reports yet.</div> : (
        <div className="table-wrap"><table className="table compact"><thead><tr><th>Period</th><th>Delivery</th><th>Benefits</th><th>Assumptions</th><th>Risks</th><th>Readiness</th><th>Commentary</th></tr></thead><tbody>
          {p.statusReports.map((r, i) => <tr key={r.id}><td className="nowrap">{r.period}<div className="mini">{fmtDate(r.date)}</div></td><td>{rag(r.delivery)}</td><td>{rag(r.benefits)}</td><td>{rag(r.assumptions)}</td><td>{rag(r.risks)}</td><td>{rag(r.readiness)}</td><td><textarea rows={2} value={r.commentary} onChange={(e) => updateProgram(p.id, (x) => { x.statusReports[i].commentary = e.target.value; }, 'Edited status report', { field: `sr:${r.id}` })} aria-label="Commentary" /></td></tr>)}
        </tbody></table></div>
      )}
    </Card>
  );
}

function CloseProgram({ program: p, mode, onClose }) {
  const { ws, updateProgram, mutate } = useApp();
  const s = summaries(ws).get(p.id);
  const [f, setF] = useState({ reason: '', salvage: '', lessons: '', released: Math.max(0, s.funding - s.spend), handoverNote: '' });
  const checks = mode === 'complete' ? [
    ['All selected benefits paths have their conditions met', p.chain.paths.filter((x) => x.selected).length === 0 || p.chain.elements.filter((e) => e.kind !== 'assumption').every((e) => e.kind !== 'initiative' || Number(e.progress) >= 100)],
    [`Steady-state harvesting for ${ws.settings.thresholds.steadyPeriods} consecutive periods`, p.benefits.filter((b) => b.type !== 'nonfinancial').every((b) => (b.actuals || []).length >= ws.settings.thresholds.steadyPeriods)],
    ['Operational owners have accepted every benefit', p.benefits.every((b) => b.operationalOwnerId && p.acceptances?.[`operational-owner:${b.id}:${b.operationalOwnerId}`]?.acceptedAt)],
    ['Measures moved into business-as-usual reporting', p.benefits.every((b) => b.bau)],
  ] : [];
  const unmet = checks.filter((c) => !c[1]);
  return (
    <Modal title={mode === 'complete' ? 'Request program completion (G4)' : 'Withdraw the program'} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={(mode === 'complete' && unmet.length > 0) || (mode === 'withdraw' && !f.reason.trim())} onClick={() => {
      if (mode === 'complete') {
        updateProgram(p.id, (x) => { x.state = 'completed'; x.stateSince = todayISO(); x.completion = { date: todayISO(), handoverNote: f.handoverNote, postHandoverUntil: new Date(Date.now() + ws.settings.thresholds.postHandoverMonths * 30.44 * 86400000).toISOString().slice(0, 10) }; }, 'Program completed', { action: 'complete' });
      } else {
        updateProgram(p.id, (x) => { x.state = 'withdrawn'; x.stateSince = todayISO(); x.selection = 'not-selected'; x.withdrawal = { date: todayISO(), reason: f.reason, valueRealised: f.salvage, salvage: f.salvage, released: Number(f.released) || 0, lessons: f.lessons }; }, 'Program withdrawn — resources released', { action: 'withdraw' });
        if (f.lessons) mutate('Lesson captured at withdrawal', (d) => { d.lessons.push({ id: uid('les'), programId: p.id, gate: 'Withdrawal', date: todayISO(), context: 'Withdrawal', lesson: f.lessons, tags: ['withdrawal'] }); });
      }
      onClose();
    }}>{mode === 'complete' ? 'Submit for G4' : 'Withdraw and release resources'}</button></>}>
      {mode === 'complete' ? (
        <>
          <p>Completion requires every condition below (BR-16). Unmet conditions are listed and the request cannot be submitted.</p>
          {checks.map(([t, ok]) => <div key={t} className="check-row"><span className={`ic ${ok ? 'pos' : 'sev-error'}`}>{ok ? '✓' : '✕'}</span><span>{t}</span><span className="rule">PRG-11</span></div>)}
          <Field label="Handover note"><TextArea value={f.handoverNote} onChange={(v) => setF({ ...f, handoverNote: v })} /></Field>
        </>
      ) : (
        <>
          <Guidance title="Stopping is a governance success.">Withdrawal releases scarce resources for higher-value work; reports show it as “resources released”, not as a failure (BR-19).</Guidance>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <Field label="Reason" className="full"><TextArea value={f.reason} onChange={(v) => setF({ ...f, reason: v })} /></Field>
            <Field label="Value realised to date and salvageable capabilities" className="full"><TextArea value={f.salvage} onChange={(v) => setF({ ...f, salvage: v })} /></Field>
            <Field label="Funds released to the category pool"><NumberInput value={f.released} onChange={(v) => setF({ ...f, released: v })} /></Field>
            <Field label="Lessons learned"><TextArea value={f.lessons} onChange={(v) => setF({ ...f, lessons: v })} /></Field>
          </div>
          <p className="mini">Approved {money(s.funding)}, spent {money(s.spend)}. Waiting-list candidates will be proposed on the Selection workbench (PFM-06).</p>
        </>
      )}
    </Modal>
  );
}
