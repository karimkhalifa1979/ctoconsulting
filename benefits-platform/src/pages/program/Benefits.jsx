import { useState } from 'react';
import { useApp, personName, measureById } from '../../lib/store.jsx';
import { BENEFIT_TYPES, benefitTypeLabel, DELIVERY_ROLES } from '../../lib/config.js';
import { annualValue, benefitStart, capabilityDate, isFinancial, realisation, BENEFIT_STATUS, profileQuarters, pathScope, forecastForQuarter } from '../../lib/finance.js';
import { wording } from '../../lib/chain.js';
import { Card, Drawer, Field, TextInput, TextArea, NumberInput, DateInput, Select, PersonSelect, MultiChips, Pill, ChartCard, Tabs } from '../../components/ui.jsx';
import { ProfileChart } from '../../components/charts.jsx';
import { money, fmtDate, pct, quarterKey, nextQuarter, quarterLabel, todayISO, uid, addMonths, num } from '../../lib/util.js';
import { downloadCSV } from '../../lib/exporters.js';

export function StatusPill({ status }) {
  const s = BENEFIT_STATUS[status];
  const tone = { 'on-track': 'good', 'at-risk': 'warning', 'off-track': 'critical', 'no-data': 'none' }[status];
  return <Pill tone={tone} icon={s.icon}>{s.label}</Pill>;
}

export default function Benefits({ program: p }) {
  const { ws, updateProgram } = useApp();
  const [open, setOpen] = useState(null);
  const [view, setView] = useState('register');
  const scope = pathScope(p);
  const add = (extra = {}) => {
    const id = uid('ben');
    updateProgram(p.id, (x) => { x.benefits.push({ id, title: 'New benefit increased', type: 'cash', description: '', category: '', driverIds: [], dependsOn: [], attribution: 1, actuals: [], reforecasts: [], status: 'active', profile: { lagMonths: 0, dipPct: 0, dipMonths: 0, plateaus: [{ after: 0, pct: 0.5 }, { after: 6, pct: 1 }], ramp: 'step', lifetimeYears: 5 }, uncertainty: { low: -0.3, high: 0.15 }, ...extra }); }, 'Added benefit', { action: 'create', object: 'benefit', objectId: id });
    setOpen(id);
  };
  const b = p.benefits.find((x) => x.id === open);
  return (
    <div className="stack">
      <Tabs sub value={view} onChange={setView} tabs={[['register', `Benefits register (${p.benefits.length})`], ['plan', 'Benefits realisation plan'], ['opportunities', `Opportunity register (${(p.opportunities || []).length})`]]} />
      {view === 'register' && (
        <Card title="Benefits register" subtitle="BEN-01/02 — expected and actual benefits linked to outcomes, measures and owners" pad={false} actions={<>
          <button className="btn btn-sm dl" onClick={() => downloadCSV(p.benefits, [{ label: 'Benefit', get: (x) => x.title }, { label: 'Type', get: (x) => benefitTypeLabel(x.type) }, { label: 'Owner', get: (x) => personName(ws, x.ownerId) }, { label: 'Measure', get: (x) => measureById(ws, x.measureId)?.name }, { label: 'Baseline', get: (x) => x.baseline?.value }, { label: 'Target', get: (x) => x.target }, { label: 'Annual value', get: (x) => (isFinancial(x) ? Math.round(annualValue(x)) : '') }, { label: 'Attribution', get: (x) => x.attribution }, { label: 'Start', get: (x) => benefitStart(p, x) }, { label: 'Status', get: (x) => BENEFIT_STATUS[realisation(p, x, ws).status].label }], `${p.code}_benefits.csv`)}>Export CSV</button>
          <button className="btn btn-sm" onClick={() => add({ disbenefit: true, title: 'Dis-benefit: productivity decreased during learning', type: 'nonfinancial' })}>+ Dis-benefit</button>
          <button className="btn btn-sm" onClick={() => add({ emergent: { source: '', date: todayISO() }, title: 'Emergent benefit increased' })}>+ Emergent</button>
          <button className="btn btn-sm btn-primary" onClick={() => add()}>+ Benefit</button>
        </>}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Benefit</th><th>Type</th><th>Owner</th><th>Measure</th><th className="num">Annual value / target</th><th className="num">Attribution</th><th>Starts</th><th>Realisation</th></tr></thead>
            <tbody>{p.benefits.map((x) => {
              const r = realisation(p, x, ws);
              const outPath = scope.outBenefits.has(x.id);
              return (
                <tr key={x.id} className="clickable" onClick={() => setOpen(x.id)} style={outPath ? { opacity: 0.6 } : undefined}>
                  <td><strong>{x.title}</strong>{x.disbenefit && <> <Pill tone="serious" icon="▼">Dis-benefit</Pill></>}{x.emergent && <> <Pill tone="progress" icon="✦">Emergent</Pill></>}{outPath && <> <Pill tone="none">Not on selected path</Pill></>}<div className="mini">{x.category}{x.outcomeId ? ` · ${p.chain.elements.find((e) => e.id === x.outcomeId)?.code || ''}` : ''}</div></td>
                  <td><Pill tone={x.type === 'cash' ? 'good' : x.type === 'noncash' ? 'progress' : 'none'} icon={x.type === 'cash' ? '$' : x.type === 'noncash' ? '≈' : '#'}>{benefitTypeLabel(x.type)}</Pill></td>
                  <td>{personName(ws, x.ownerId)}</td>
                  <td>{measureById(ws, x.measureId)?.name || <span className="sev-warning">None</span>}</td>
                  <td className="num">{isFinancial(x) ? `${money(annualValue(x))}/yr` : `${num(x.baseline?.value, 1)} → ${num(x.target, 1)} ${x.unit || ''}`}</td>
                  <td className="num">{pct(x.attribution ?? 1)}</td>
                  <td className="nowrap">{fmtDate(benefitStart(p, x))}</td>
                  <td><StatusPill status={r.status} />{r.ratio !== null && <div className="mini">{pct(r.ratio)} of forecast</div>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </Card>
      )}
      {view === 'plan' && <RealisationPlan p={p} />}
      {view === 'opportunities' && <Opportunities p={p} />}
      {b && <Drawer title={b.title} subtitle={`${p.code} · ${b.disbenefit ? 'dis-benefit' : 'benefit'}`} width={940} onClose={() => setOpen(null)} actions={<button className="btn btn-sm btn-danger" onClick={() => { if (window.confirm('Delete this benefit?')) { updateProgram(p.id, (x) => { x.benefits = x.benefits.filter((y) => y.id !== b.id); }, `Deleted benefit ${b.title}`, { action: 'delete', object: 'benefit', objectId: b.id }); setOpen(null); } }}>Delete</button>}><BenefitEditor p={p} b={b} /></Drawer>}
    </div>
  );
}

function BenefitEditor({ p, b }) {
  const { ws, updateProgram } = useApp();
  const idx = p.benefits.findIndex((x) => x.id === b.id);
  const set = (k) => (v) => updateProgram(p.id, (x) => { x.benefits[idx][k] = v; }, `Benefit “${b.title}”: ${k}`, { object: 'benefit', objectId: b.id, field: `${b.id}:${k}`, before: b[k], after: v });
  const setIn = (obj, k) => (v) => updateProgram(p.id, (x) => { x.benefits[idx][obj] = { ...(x.benefits[idx][obj] || {}), [k]: v }; }, `Benefit “${b.title}”: ${obj}.${k}`, { object: 'benefit', objectId: b.id, field: `${b.id}:${obj}.${k}` });
  const fin = isFinancial(b);
  const w = wording(b.title);
  const owner = ws.people.find((x) => x.id === b.ownerId);
  const deliveryOnly = owner && (owner.roles || []).length > 0 && owner.roles.every((r) => DELIVERY_ROLES.includes(r));
  const start = benefitStart(p, b);
  const cap = capabilityDate(p, b);
  const r = realisation(p, b, ws);
  const fromQ = quarterKey(addMonths(start, -6));
  const rows = profileQuarters(p, b, `${fromQ.slice(0, 4)}-${String((Number(fromQ.slice(-1)) - 1) * 3 + 1).padStart(2, '0')}-01`, 28);
  const claims = b.measureId ? ws.programs.flatMap((q) => (q.benefits || []).filter((x) => x.measureId === b.measureId).map((x) => ({ q, x }))) : [];
  const claimTotal = claims.reduce((a, c) => a + (c.x.attribution ?? 1), 0);
  const plateaus = b.profile?.plateaus || [];
  const lastActual = (b.actuals || []).map((a) => a.period).sort().pop();
  const nextPeriod = lastActual ? nextQuarter(lastActual) : quarterKey(start);
  const [tab, setTab] = useState('definition');

  return (
    <div className="stack">
      <Tabs sub value={tab} onChange={setTab} tabs={[['definition', 'Definition'], ['valuation', 'Valuation and profile'], ['actuals', `Actuals (${(b.actuals || []).length})`], ['handover', 'Ownership and handover']]} />
      {tab === 'definition' && (
        <div className="form-grid">
          <Field label="Measurable title" className="full"><TextInput value={b.title} onChange={set('title')} /></Field>
          <div className="full">{w.ok ? <span className="mini pos">✓ Measurable wording</span> : <span className="mini sev-warning">! Use MEDIC wording so the benefit can be measured{w.vague.length ? ` (avoid: ${w.vague.join(', ')})` : ''}.</span>}</div>
          <Field label="Description" className="full"><TextArea value={b.description} onChange={set('description')} /></Field>
          <Field label="Type"><Select value={b.type} onChange={set('type')} options={BENEFIT_TYPES.map((t) => [t.id, t.label])} /></Field>
          <Field label="Category"><TextInput value={b.category} onChange={set('category')} placeholder="e.g. Cost reduction, Revenue, Experience" /></Field>
          <Field label="Linked outcome (benefits map)"><Select value={b.outcomeId} onChange={set('outcomeId')} placeholder="—" options={p.chain.elements.filter((e) => e.kind === 'outcome').map((e) => [e.id, `${e.code} ${e.title}`])} /></Field>
          <Field label="Beneficiary area"><Select value={b.areaId} onChange={set('areaId')} placeholder="—" options={ws.areas.map((a) => [a.id, a.name])} /></Field>
          <Field label="Strategic drivers" className="full"><MultiChips options={ws.drivers.map((d) => [d.id, d.name])} value={b.driverIds || []} onChange={set('driverIds')} /></Field>
          <Field label="Measure (library)"><Select value={b.measureId} onChange={set('measureId')} placeholder="— none —" options={ws.measures.map((m) => [m.id, `${m.name} (${m.unit})`])} /></Field>
          <Field label="Unit"><TextInput value={b.unit} onChange={set('unit')} /></Field>
          <Field label="Baseline value"><NumberInput value={b.baseline?.value} onChange={setIn('baseline', 'value')} disabled={Boolean(p.baselineLocked)} /></Field>
          <Field label="Baseline date"><DateInput value={b.baseline?.date} onChange={setIn('baseline', 'date')} /></Field>
          <Field label="Baseline source"><TextInput value={b.baseline?.source} onChange={setIn('baseline', 'source')} /></Field>
          <Field label="Target value"><NumberInput value={b.target} onChange={set('target')} /></Field>
          <Field label="Plan to establish baseline (if none yet)" className="full"><TextInput value={b.baselinePlan} onChange={set('baselinePlan')} /></Field>
          <Field label="Mechanism (how the benefit arises)" className="full"><TextArea value={b.mechanism} onChange={set('mechanism')} rows={2} /></Field>
          <Field label="Evidence" className="full"><TextArea value={b.evidence} onChange={set('evidence')} rows={2} /></Field>
          <label className="check full"><input type="checkbox" checked={Boolean(b.disbenefit)} onChange={(e) => set('disbenefit')(e.target.checked)} /> Dis-benefit (a negative outcome of the change, BEN-08)</label>
          {b.disbenefit && <Field label="Mitigation" className="full"><TextArea value={b.mitigation} onChange={set('mitigation')} rows={2} /></Field>}
          <label className="check full"><input type="checkbox" checked={Boolean(b.emergent)} onChange={(e) => set('emergent')(e.target.checked ? { source: '', date: todayISO(), capability: '' } : null)} /> Emergent benefit (not originally targeted, BEN-07)</label>
          {b.emergent && <><Field label="Enabled by capability"><TextInput value={b.emergent.capability} onChange={(v) => set('emergent')({ ...b.emergent, capability: v })} /></Field><Field label="Discovered (date and source)"><TextInput value={b.emergent.source} onChange={(v) => set('emergent')({ ...b.emergent, source: v })} /></Field></>}
        </div>
      )}

      {tab === 'valuation' && (
        <>
          {fin && (
            <Card title="Structured estimation (VAL-04)" subtitle="Annual value = driving variable × coefficient">
              <div className="form-grid-3">
                <Field label="Driving variable"><TextInput value={b.valuation?.driverName} onChange={setIn('valuation', 'driverName')} placeholder="e.g. Claims per year" /></Field>
                <Field label="Value"><NumberInput value={b.valuation?.driverValue} onChange={setIn('valuation', 'driverValue')} /></Field>
                <Field label="Annual value at full realisation"><div className="hero-num" style={{ fontSize: 20 }}>{money(annualValue(b))}</div></Field>
                <Field label="Coefficient"><TextInput value={b.valuation?.coefficientName} onChange={setIn('valuation', 'coefficientName')} placeholder="e.g. Saving per claim ($)" /></Field>
                <Field label="Value"><NumberInput value={b.valuation?.coefficient} onChange={setIn('valuation', 'coefficient')} /></Field>
                <Field label="…or enter annual value directly"><NumberInput value={b.annualValue} onChange={set('annualValue')} disabled={Boolean(Number(b.valuation?.driverValue) && Number(b.valuation?.coefficient))} /></Field>
                <Field label="Data source"><TextInput value={b.valuation?.source} onChange={setIn('valuation', 'source')} /></Field>
                <Field label="Forecast change in coefficient" className="span-2"><TextInput value={b.valuation?.change} onChange={setIn('valuation', 'change')} placeholder="e.g. saving per claim falls 3% a year as volumes shift" /></Field>
              </div>
              <div className="form-grid" style={{ marginTop: 10 }}>
                <Field label="Uncertainty — downside" hint="for the simulation, e.g. −0.3"><NumberInput value={b.uncertainty?.low} onChange={setIn('uncertainty', 'low')} step={0.05} /></Field>
                <Field label="Uncertainty — upside" hint="e.g. 0.15"><NumberInput value={b.uncertainty?.high} onChange={setIn('uncertainty', 'high')} step={0.05} /></Field>
              </div>
            </Card>
          )}
          <Card title="Time-phased profile (BEN-03)" subtitle={`Starts ${fmtDate(start)}${cap ? ` — tied to capability delivery on ${fmtDate(cap)}` : ''}`}>
            <div className="form-grid-3">
              <Field label="Depends on projects (BEN-12)" className="full"><MultiChips options={p.projects.map((x) => [x.id, x.name])} value={b.dependsOn || []} onChange={set('dependsOn')} /></Field>
              <Field label="Lag after capability (months)"><NumberInput value={b.profile?.lagMonths} onChange={setIn('profile', 'lagMonths')} min={0} /></Field>
              <Field label="Or fixed start date"><DateInput value={b.profile?.startDate} onChange={setIn('profile', 'startDate')} /></Field>
              <Field label="Benefit lifetime (years)"><NumberInput value={b.profile?.lifetimeYears} onChange={setIn('profile', 'lifetimeYears')} min={0} step={0.5} /></Field>
              <Field label="Learning-lag dip (share)" hint="e.g. 0.1 = 10% below baseline"><NumberInput value={b.profile?.dipPct} onChange={setIn('profile', 'dipPct')} min={0} max={1} step={0.01} /></Field>
              <Field label="Dip duration (months)"><NumberInput value={b.profile?.dipMonths} onChange={setIn('profile', 'dipMonths')} min={0} /></Field>
              <Field label="Between plateaus"><Select value={b.profile?.ramp || 'step'} onChange={setIn('profile', 'ramp')} options={[['step', 'Step (plateaus)'], ['linear', 'Linear ramp']]} /></Field>
            </div>
            <div className="section-title">Plateaus</div>
            <table className="table compact" style={{ maxWidth: 520 }}><thead><tr><th>Months after dip ends</th><th>Share of full benefit</th><th /></tr></thead><tbody>
              {plateaus.map((pl, i) => (
                <tr key={i}>
                  <td><NumberInput value={pl.after} onChange={(v) => setIn('profile', 'plateaus')(plateaus.map((y, j) => (j === i ? { ...y, after: Number(v) || 0 } : y)))} min={0} /></td>
                  <td><NumberInput value={pl.pct} onChange={(v) => setIn('profile', 'plateaus')(plateaus.map((y, j) => (j === i ? { ...y, pct: Number(v) || 0 } : y)))} min={0} max={2} step={0.05} /></td>
                  <td><button className="btn btn-ghost btn-sm" aria-label="Remove plateau" onClick={() => setIn('profile', 'plateaus')(plateaus.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody></table>
            <button className="btn btn-sm" onClick={() => setIn('profile', 'plateaus')([...plateaus, { after: (plateaus[plateaus.length - 1]?.after || 0) + 6, pct: 1 }])}>+ Plateau</button>
          </Card>
          <ChartCard title="Profile — forecast against actuals" subtitle={fin ? `${b.unit || '$'} per quarter, after ${pct(b.attribution ?? 1)} attribution` : `${b.unit || ''} level at quarter end`} table={{ columns: [{ label: 'Quarter', get: (x) => quarterLabel(x.period) }, { label: 'Forecast', num: true, get: (x) => (fin ? money(x.forecast) : num(x.forecast, 2)) }, { label: 'Actual', num: true, get: (x) => (x.actual === null ? '—' : fin ? money(x.actual) : num(x.actual, 2)) }], rows }}>
            <ProfileChart rows={rows} financial={fin} unit={b.unit} baseline={b.baseline?.value} target={b.target} />
          </ChartCard>
        </>
      )}

      {tab === 'actuals' && (
        <>
          <Card title="Actuals and variance (BEN-04)" subtitle={`Status: ${BENEFIT_STATUS[r.status].label}${r.ratio !== null ? ` — ${pct(r.ratio)} of forecast to date` : ''}. Missing data shows as a gap, never as zero.`} actions={<button className="btn btn-sm" onClick={() => set('actuals')([...(b.actuals || []), { period: nextPeriod, value: '', provenance: 'Entered' }])}>+ {quarterLabel(nextPeriod)}</button>}>
            <table className="table compact"><thead><tr><th>Quarter</th><th className="num">Forecast</th><th className="num">Actual</th><th className="num">Variance</th><th>Provenance</th><th /></tr></thead><tbody>
              {(b.actuals || []).slice().sort((x, y) => (x.period < y.period ? -1 : 1)).map((a) => {
                const f = forecastForQuarter(p, b, a.period);
                const i = b.actuals.indexOf(a);
                const v = a.value === '' || a.value === null ? null : Number(a.value);
                const base = Number(b.baseline?.value) || 0;
                const variance = v === null ? null : fin ? (f ? (v - f) / Math.abs(f) : null) : (f - base ? (v - f) / Math.abs(f - base) : null);
                return (
                  <tr key={a.period}>
                    <td>{quarterLabel(a.period)}</td>
                    <td className="num">{fin ? money(f) : num(f, 2)}</td>
                    <td><NumberInput value={a.value} onChange={(val) => set('actuals')(b.actuals.map((y, j) => (j === i ? { ...y, value: val, provenance: 'Entered' } : y)))} style={{ width: 130 }} aria-label={`Actual for ${quarterLabel(a.period)}`} /></td>
                    <td className={`num ${variance !== null && variance < -0.1 ? 'neg' : ''}`}>{variance === null ? <span className="mini">missing</span> : pct(variance)}</td>
                    <td className="mini">{a.provenance}</td>
                    <td><button className="btn btn-ghost btn-sm" aria-label="Remove" onClick={() => set('actuals')(b.actuals.filter((_, j) => j !== i))}>✕</button></td>
                  </tr>
                );
              })}
            </tbody></table>
          </Card>
          <Card title="Re-forecasts" subtitle="Recorded with reasons" actions={<button className="btn btn-sm" onClick={() => { const reason = window.prompt('Reason for re-forecast'); if (reason) set('reforecasts')([...(b.reforecasts || []), { date: todayISO(), reason, by: ws.currentUser }]); }}>+ Re-forecast</button>}>
            {(b.reforecasts || []).length ? b.reforecasts.map((rf, i) => <div key={i} className="check-row"><span className="ic">↻</span><span>{rf.reason}<div className="mini">{fmtDate(rf.date)} · {personName(ws, rf.by)}</div></span><span /></div>) : <div className="empty-sm">No re-forecasts.</div>}
            <p className="mini">Change the profile (plateaus, start, value) on the Valuation tab, then record why here.</p>
          </Card>
        </>
      )}

      {tab === 'handover' && (
        <div className="form-grid">
          <Field label="Benefit owner (accountable)"><PersonSelect ws={ws} value={b.ownerId} onChange={set('ownerId')} /></Field>
          <div>{deliveryOnly && <div className="callout warn" style={{ fontSize: 12.5 }}><strong>BR-22:</strong> {owner.name} holds only a delivery role. Benefits are a business responsibility; the sponsor must confirm.<label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={Boolean(b.ownerConfirmed)} onChange={(e) => set('ownerConfirmed')(e.target.checked)} /> Sponsor confirms this assignment</label></div>}</div>
          <Field label="Attribution share (BEN-06)" hint="this program’s share of the measured change"><NumberInput value={b.attribution} onChange={set('attribution')} min={0} max={1} step={0.05} /></Field>
          <Field label="Attribution method"><TextInput value={b.attributionMethod} onChange={set('attributionMethod')} placeholder="e.g. agreed split, controlled pilot, regression" /></Field>
          {claims.length > 1 && <div className={`full ${claimTotal > 1.0001 ? 'callout warn' : 'guidance'}`}><strong>Claims on {measureById(ws, b.measureId)?.name}:</strong> {claims.map((c) => `${c.q.code} ${pct(c.x.attribution ?? 1)}`).join(', ')} — total {pct(claimTotal)}{claimTotal > 1.0001 ? ' exceeds 100% (BR-11).' : '.'}</div>}
          <Field label="Operational owner after completion (ACC-09)"><PersonSelect ws={ws} value={b.operationalOwnerId} onChange={set('operationalOwnerId')} /></Field>
          <label className="check"><input type="checkbox" checked={Boolean(b.bau)} onChange={(e) => set('bau')(e.target.checked)} /> Measure is in business-as-usual reporting</label>
          {p.state === 'completed' && <div className="full guidance">Post-handover tracking continues under the operational owner until {fmtDate(p.completion?.postHandoverUntil)} (BEN-10).</div>}
        </div>
      )}
    </div>
  );
}

function RealisationPlan({ p }) {
  const { ws } = useApp();
  const rows = p.benefits.filter((b) => !b.disbenefit).map((b) => {
    const start = benefitStart(p, b);
    const pl = (b.profile?.plateaus || []).slice().sort((a, c) => a.after - c.after);
    const full = pl.find((x) => x.pct >= 1);
    const fullDate = addMonths(start, (Number(b.profile?.dipMonths) || 0) + (full ? full.after : 0));
    return { b, start, fullDate };
  });
  return (
    <Card title="Benefits realisation plan (BEN-11)" subtitle="Each benefit with its mechanism, accountability and timeline" pad={false}>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Benefit</th><th>Mechanism</th><th>Owner</th><th>Measure</th><th>Depends on</th><th>Starts</th><th>Full benefit</th><th>Ends</th></tr></thead>
        <tbody>{rows.map(({ b, start, fullDate }) => (
          <tr key={b.id}>
            <td><strong>{b.title}</strong><div className="mini">{benefitTypeLabel(b.type)}{isFinancial(b) ? ` · ${money(annualValue(b))}/yr` : ''}</div></td>
            <td className="small">{b.mechanism || <span className="muted">—</span>}</td>
            <td>{personName(ws, b.ownerId)}</td>
            <td>{measureById(ws, b.measureId)?.name || '—'}</td>
            <td className="small">{(b.dependsOn || []).map((id) => p.projects.find((x) => x.id === id)?.name).filter(Boolean).join(', ') || '—'}</td>
            <td className="nowrap">{fmtDate(start)}</td><td className="nowrap">{fmtDate(fullDate)}</td><td className="nowrap">{fmtDate(addMonths(start, (Number(b.profile?.lifetimeYears) || 10) * 12))}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </Card>
  );
}

function Opportunities({ p }) {
  const { ws, updateProgram, mutate } = useApp();
  const list = p.opportunities || [];
  const upd = (i, k, v) => updateProgram(p.id, (x) => { x.opportunities[i][k] = v; }, 'Updated opportunity', { field: `opp:${i}:${k}` });
  return (
    <Card title="Opportunity register (BEN-13)" subtitle="Ways to exploit delivered capabilities — capture, assess, rank, assign and convert" actions={<button className="btn btn-sm" onClick={() => updateProgram(p.id, (x) => { x.opportunities = [...(x.opportunities || []), { id: uid('opp'), title: 'New opportunity', capability: '', areaId: '', value: '', rank: (x.opportunities || []).length + 1, status: 'captured' }]; }, 'Captured opportunity')}>+ Opportunity</button>}>
      {!list.length ? <div className="empty-sm">No opportunities captured. As people use new capabilities they find new ways to create value — record them here.</div> : (
        <table className="table compact"><thead><tr><th>#</th><th>Opportunity</th><th>Capability</th><th>Responsible area</th><th className="num">Estimated value / yr</th><th>Status</th><th /></tr></thead><tbody>
          {list.slice().sort((a, b) => a.rank - b.rank).map((o) => {
            const i = list.indexOf(o);
            return (
              <tr key={o.id}>
                <td><NumberInput value={o.rank} onChange={(v) => upd(i, 'rank', v)} style={{ width: 54 }} aria-label="Rank" /></td>
                <td><input className="inline-input" value={o.title} onChange={(e) => upd(i, 'title', e.target.value)} aria-label="Opportunity" /></td>
                <td><input className="inline-input" value={o.capability} onChange={(e) => upd(i, 'capability', e.target.value)} aria-label="Capability" /></td>
                <td><Select value={o.areaId} onChange={(v) => upd(i, 'areaId', v)} placeholder="—" options={ws.areas.map((a) => [a.id, a.name])} /></td>
                <td><NumberInput value={o.value} onChange={(v) => upd(i, 'value', v)} style={{ width: 110 }} /></td>
                <td><Select value={o.status} onChange={(v) => upd(i, 'status', v)} options={[['captured', 'Captured'], ['assessed', 'Assessed'], ['assigned', 'Assigned'], ['converted', 'Converted']]} /></td>
                <td>{o.status !== 'converted' && <button className="btn btn-sm" onClick={() => { mutate(`Opportunity converted to idea: ${o.title}`, (d) => { d.ideas.push({ id: uid('idea'), title: o.title, problem: `Opportunity from ${p.name}: ${o.capability}`, outcome: '', areas: o.areaId ? [o.areaId] : [], costLow: '', costHigh: '', proposer: ws.currentUser, category: 'opportunity', status: 'new', createdAt: todayISO(), reason: '', driverIds: [] }); const q = d.programs.find((x) => x.id === p.id); q.opportunities[i].status = 'converted'; }); }}>Convert to idea</button>}</td>
              </tr>
            );
          })}
        </tbody></table>
      )}
    </Card>
  );
}
