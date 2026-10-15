import { useState } from 'react';
import { useApp, personName } from '../../lib/store.jsx';
import { BTOPP, PROJECT_GATES } from '../../lib/config.js';
import { benefitsDependingOn } from '../../lib/rules.js';
import { Card, Drawer, Field, TextInput, TextArea, NumberInput, DateInput, Select, PersonSelect, Pill, Guidance, Modal } from '../../components/ui.jsx';
import { money, fmtDate, monthsBetween, pct, todayISO, uid } from '../../lib/util.js';

export default function Projects({ program: p }) {
  const { ws, updateProgram } = useApp();
  const [open, setOpen] = useState(null);
  const [stop, setStop] = useState(null);
  const tol = p.tolerances || { cost: 0.1, time: 3 };
  const add = () => {
    const id = uid('prj');
    updateProgram(p.id, (x) => { x.projects.push({ id, name: 'New project', sow: '', managerId: null, initiativeIds: [], capabilities: [], btopp: 'T', budget: 0, actual: 0, forecast: 0, start: todayISO(), end: null, baselineEnd: null, status: 'green', gate: 'Concept', state: 'active', milestones: [], estimates: [] }); }, 'Added project', { action: 'create', object: 'project', objectId: id });
    setOpen(id);
  };
  const proj = p.projects.find((x) => x.id === open);
  const totals = p.projects.reduce((a, x) => ({ budget: a.budget + (Number(x.budget) || 0), actual: a.actual + (Number(x.actual) || 0), forecast: a.forecast + (Number(x.forecast) || Number(x.budget) || 0) }), { budget: 0, actual: 0, forecast: 0 });

  return (
    <div className="stack">
      <Guidance title="Projects deliver capabilities, not benefits.">Each project carries a statement of work describing what it achieves and how it relates to the program. Detailed schedules stay in delivery tools; the platform holds summary and gate-level data. A project’s Implementation gate is the program’s Commissioning decision.</Guidance>
      <Card title="Program plan" subtitle={`${p.projects.length} projects · budget ${money(totals.budget)} · actual ${money(totals.actual)} · forecast ${money(totals.forecast)}`} actions={<button className="btn btn-sm btn-primary" onClick={add}>+ Project</button>} pad={false}>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Project</th><th>Manager</th><th>BTOPP</th><th>Gate</th><th>Status</th><th className="num">Budget</th><th className="num">Actual</th><th className="num">Forecast</th><th>Finish (baseline → forecast)</th><th>Variance</th><th>Capabilities</th></tr></thead>
          <tbody>
            {p.projects.map((x) => {
              const cv = x.budget ? ((Number(x.forecast) || Number(x.budget)) - x.budget) / x.budget : 0;
              const slip = x.baselineEnd && x.forecastEnd ? monthsBetween(x.baselineEnd, x.forecastEnd) : 0;
              const out = cv > tol.cost || slip > tol.time;
              return (
                <tr key={x.id} className="clickable" onClick={() => setOpen(x.id)} style={x.state !== 'active' ? { opacity: 0.7 } : undefined}>
                  <td><strong>{x.name}</strong>{x.state !== 'active' && <> <Pill tone={x.state === 'complete' ? 'good' : 'none'}>{x.state}</Pill></>}<div className="mini clamp-2">{x.sow}</div></td>
                  <td>{personName(ws, x.managerId)}</td>
                  <td>{x.btopp}</td>
                  <td>{x.gate}</td>
                  <td><Pill tone={{ green: 'good', amber: 'warning', red: 'critical' }[x.status]}>{x.status}</Pill></td>
                  <td className="num">{money(x.budget)}</td><td className="num">{money(x.actual)}</td><td className="num">{money(Number(x.forecast) || x.budget)}</td>
                  <td className="nowrap">{fmtDate(x.baselineEnd || x.end)}{x.forecastEnd && x.forecastEnd !== x.baselineEnd ? ` → ${fmtDate(x.forecastEnd)}` : ''}</td>
                  <td>{out ? <Pill tone="warning">{cv > 0 ? `cost ${pct(cv)}` : ''}{cv > 0 && slip > 0 ? ' · ' : ''}{slip > 0 ? `+${slip} mo` : ''}</Pill> : <Pill tone="good">Within tolerance</Pill>}</td>
                  <td>{(x.capabilities || []).map((c) => <div key={c.id} className="mini">{c.accepted || x.acceptedDate ? '✓' : '○'} {c.name}</div>)}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </Card>

      {proj && (
        <Drawer title={proj.name} subtitle={`${p.code} · project`} onClose={() => setOpen(null)} actions={proj.state === 'active' && <button className="btn btn-sm" onClick={() => setStop(proj.id)}>Cancel or defer…</button>}>
          <ProjectEditor p={p} proj={proj} />
        </Drawer>
      )}
      {stop && (
        <StopProject p={p} projId={stop} onClose={() => setStop(null)} />
      )}
    </div>
  );
}

function ProjectEditor({ p, proj }) {
  const { ws, updateProgram } = useApp();
  const idx = p.projects.findIndex((x) => x.id === proj.id);
  const set = (k) => (v) => updateProgram(p.id, (x) => { x.projects[idx][k] = v; }, `Project “${proj.name}”: ${k}`, { object: 'project', objectId: proj.id, field: `${proj.id}:${k}`, before: proj[k], after: v });
  const deps = benefitsDependingOn(p, proj.id);
  const cv = proj.budget ? ((Number(proj.forecast) || Number(proj.budget)) - proj.budget) / proj.budget : 0;
  const slip = proj.baselineEnd && proj.forecastEnd ? monthsBetween(proj.baselineEnd, proj.forecastEnd) : 0;
  const tol = p.tolerances || { cost: 0.1, time: 3 };
  const listUpd = (k, fn, label) => updateProgram(p.id, (x) => { x.projects[idx][k] = fn(x.projects[idx][k] || []); }, label, { field: `${proj.id}:${k}` });
  return (
    <div className="stack">
      {(cv > tol.cost || slip > tol.time) && (
        <div className="callout warn"><strong>Outside tolerance (PRJ-05).</strong> {cv > 0 && `Cost forecast ${pct(cv)} over budget. `}{slip > 0 && `Finish ${slip} months late. `}
          {deps.length ? <>Affected benefits: {deps.map((d) => `“${d.b.title}” now starts ${fmtDate(d.start)}`).join('; ')}. Confirm target benefits remain achievable.</> : 'No benefits depend directly on this project.'}
          <div style={{ marginTop: 8 }}><button className="btn btn-sm" onClick={() => updateProgram(p.id, (x) => { x.log.push({ id: uid('log'), type: 'decision', title: `Benefit targets confirmed after variance on ${proj.name}`, detail: `Cost ${pct(cv)}, schedule +${slip} months.`, ownerId: x.managerId, date: todayISO(), status: 'closed', level: 'program' }); }, 'Confirmed benefits after variance')}>Record confirmation</button></div>
        </div>
      )}
      <div className="form-grid">
        <Field label="Project name" className="full"><TextInput value={proj.name} onChange={set('name')} /></Field>
        <Field label="Statement of work" hint="what it achieves and how it relates to the program" className="full"><TextArea value={proj.sow} onChange={set('sow')} /></Field>
        <Field label="Project manager"><PersonSelect ws={ws} value={proj.managerId} onChange={set('managerId')} /></Field>
        <Field label="BTOPP element"><Select value={proj.btopp} onChange={set('btopp')} options={BTOPP.map((b) => [b.id, `${b.id} ${b.name}`])} /></Field>
        <Field label="Current project gate (PRJ-02)"><Select value={proj.gate} onChange={set('gate')} options={PROJECT_GATES} /></Field>
        <Field label="Status"><Select value={proj.status} onChange={set('status')} options={[['green', 'Green'], ['amber', 'Amber'], ['red', 'Red']]} /></Field>
        <Field label="Budget (approved to next gate)"><NumberInput value={proj.budget} onChange={set('budget')} /></Field>
        <Field label="Actual cost to date"><NumberInput value={proj.actual} onChange={set('actual')} /></Field>
        <Field label="Forecast at completion"><NumberInput value={proj.forecast} onChange={set('forecast')} /></Field>
        <Field label="Start"><DateInput value={proj.start} onChange={set('start')} /></Field>
        <Field label="Baseline finish"><DateInput value={proj.baselineEnd} onChange={set('baselineEnd')} /></Field>
        <Field label="Forecast finish" hint="moves dependent benefit profiles"><DateInput value={proj.forecastEnd || proj.end} onChange={(v) => updateProgram(p.id, (x) => { x.projects[idx].forecastEnd = v; x.projects[idx].end = v; }, `Project “${proj.name}” forecast finish ${v}`, { field: `${proj.id}:forecastEnd`, before: proj.forecastEnd, after: v })} /></Field>
        <Field label="Initiatives realised (RCM-08)" className="full"><div className="chips">{p.chain.elements.filter((e) => e.kind === 'initiative').map((e) => <button key={e.id} type="button" className={`chip ${(proj.initiativeIds || []).includes(e.id) ? 'on' : ''}`} onClick={() => set('initiativeIds')((proj.initiativeIds || []).includes(e.id) ? proj.initiativeIds.filter((x) => x !== e.id) : [...(proj.initiativeIds || []), e.id])}>{e.code} {e.title}</button>)}</div></Field>
      </div>

      <div>
        <div className="section-title">Capabilities and acceptance (PRJ-04)</div>
        <p className="mini">Sponsor acceptance of a capability starts measurement of the benefit profiles that depend on it.</p>
        <table className="table compact"><thead><tr><th>Capability</th><th>Delivered</th><th>Accepted by sponsor</th><th /></tr></thead><tbody>
          {(proj.capabilities || []).map((c, i) => (
            <tr key={c.id}>
              <td><input className="inline-input" value={c.name} onChange={(e) => listUpd('capabilities', (l) => l.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)), 'Edited capability')} aria-label="Capability" /></td>
              <td><DateInput value={c.delivered} onChange={(v) => listUpd('capabilities', (l) => l.map((y, j) => (j === i ? { ...y, delivered: v } : y)), 'Capability delivered')} /></td>
              <td>{c.accepted ? <Pill tone="good">{fmtDate(c.accepted)}</Pill> : <button className="btn btn-sm" onClick={() => updateProgram(p.id, (x) => { x.projects[idx].capabilities[i].accepted = todayISO(); if (x.projects[idx].capabilities.every((y) => y.accepted)) x.projects[idx].acceptedDate = todayISO(); }, `Capability “${c.name}” accepted by sponsor`, { action: 'approve' })}>Record acceptance</button>}</td>
              <td><button className="btn btn-ghost btn-sm" aria-label="Remove" onClick={() => listUpd('capabilities', (l) => l.filter((_, j) => j !== i), 'Removed capability')}>✕</button></td>
            </tr>
          ))}
        </tbody></table>
        <button className="btn btn-sm" onClick={() => listUpd('capabilities', (l) => [...l, { id: uid('cap'), name: 'New capability' }], 'Added capability')}>+ Capability</button>
      </div>

      <div>
        <div className="section-title">Estimates at each project gate (PRJ-03)</div>
        <table className="table compact"><thead><tr><th>Gate</th><th>Type</th><th className="num">Cost</th><th className="num">Months</th><th /></tr></thead><tbody>
          {(proj.estimates || []).map((e, i) => (
            <tr key={i}>
              <td><Select value={e.gate} onChange={(v) => listUpd('estimates', (l) => l.map((y, j) => (j === i ? { ...y, gate: v } : y)), 'Edited estimate')} options={PROJECT_GATES} /></td>
              <td><Select value={e.type} onChange={(v) => listUpd('estimates', (l) => l.map((y, j) => (j === i ? { ...y, type: v } : y)), 'Edited estimate')} options={['preliminary', 'refined', 'fixed price']} /></td>
              <td><NumberInput value={e.cost} onChange={(v) => listUpd('estimates', (l) => l.map((y, j) => (j === i ? { ...y, cost: v } : y)), 'Edited estimate')} /></td>
              <td><NumberInput value={e.months} onChange={(v) => listUpd('estimates', (l) => l.map((y, j) => (j === i ? { ...y, months: v } : y)), 'Edited estimate')} style={{ width: 80 }} /></td>
              <td><button className="btn btn-ghost btn-sm" aria-label="Remove" onClick={() => listUpd('estimates', (l) => l.filter((_, j) => j !== i), 'Removed estimate')}>✕</button></td>
            </tr>
          ))}
        </tbody></table>
        <button className="btn btn-sm" onClick={() => listUpd('estimates', (l) => [...l, { gate: proj.gate, type: 'refined', cost: proj.budget, months: '' }], 'Added estimate')}>+ Estimate</button>
        <p className="mini">Approved project funding is limited to the next project gate.</p>
      </div>

      <div>
        <div className="section-title">Key milestones</div>
        <table className="table compact"><thead><tr><th>Milestone</th><th>Date</th><th>Done</th><th /></tr></thead><tbody>
          {(proj.milestones || []).map((m, i) => (
            <tr key={i}>
              <td><input className="inline-input" value={m.name} onChange={(e) => listUpd('milestones', (l) => l.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)), 'Edited milestone')} aria-label="Milestone" /></td>
              <td><DateInput value={m.date} onChange={(v) => listUpd('milestones', (l) => l.map((y, j) => (j === i ? { ...y, date: v } : y)), 'Edited milestone')} /></td>
              <td><input type="checkbox" checked={Boolean(m.done)} onChange={(e) => listUpd('milestones', (l) => l.map((y, j) => (j === i ? { ...y, done: e.target.checked } : y)), 'Milestone status')} aria-label="Done" /></td>
              <td><button className="btn btn-ghost btn-sm" aria-label="Remove" onClick={() => listUpd('milestones', (l) => l.filter((_, j) => j !== i), 'Removed milestone')}>✕</button></td>
            </tr>
          ))}
        </tbody></table>
        <button className="btn btn-sm" onClick={() => listUpd('milestones', (l) => [...l, { name: 'New milestone', date: todayISO(), done: false }], 'Added milestone')}>+ Milestone</button>
      </div>
    </div>
  );
}

function StopProject({ p, projId, onClose }) {
  const { updateProgram } = useApp();
  const [f, setF] = useState({ state: 'deferred', reason: '' });
  const proj = p.projects.find((x) => x.id === projId);
  return (
    <Modal title={`Cancel or defer ${proj.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Back</button><button className="btn btn-primary" disabled={!f.reason.trim()} onClick={() => { updateProgram(p.id, (x) => { const pr = x.projects.find((y) => y.id === projId); pr.state = f.state === 'deferred' ? 'deferred' : 'cancelled'; pr.stopReason = f.reason; x.log.push({ id: uid('log'), type: 'decision', title: `Project ${pr.name} ${pr.state}`, detail: f.reason, ownerId: x.managerId, date: todayISO(), status: 'closed', level: 'program' }); x.materialChangeAt = new Date().toISOString(); }, `Project ${f.state}`); onClose(); }}>Confirm</button></>}>
      <p>Stopping a project whose objectives are no longer needed is good governance, not failure (PRJ-06). The reason is recorded and communicated.</p>
      <Field label="Action"><Select value={f.state} onChange={(v) => setF({ ...f, state: v })} options={[['deferred', 'Defer'], ['cancelled', 'Cancel']]} /></Field>
      <Field label="Reason"><TextArea value={f.reason} onChange={(v) => setF({ ...f, reason: v })} /></Field>
    </Modal>
  );
}
