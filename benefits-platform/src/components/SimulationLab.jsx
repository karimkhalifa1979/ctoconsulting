// Interactive Monte Carlo simulation of costs and benefits for one program or a portfolio.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { SIM_DEFAULTS } from '../lib/config.js';
import { buildModel, createRun, analyse, tornado, histogram, summarise, ASSUMPTION_PROB } from '../lib/simulation.js';
import { Card, ChartCard, Pill, Modal, Field, TextInput, Select, NumberInput, useToast } from './ui.jsx';
import { Histogram, CdfChart, FanChart, CostBenefitScatter, Tornado, BoxPlot } from './charts.jsx';
import { money, pct, ratio, months, uid, todayISO, fmtDate, quarterLabel } from '../lib/util.js';
import { downloadCSV, safeName } from '../lib/exporters.js';

const SCEN_COLORS = ['var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

function Slider({ label, value, min, max, step, onChange, format = (v) => v, hint }) {
  const id = useMemo(() => uid('sl'), []);
  return (
    <div className="slider">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{format(value)}</output>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
function Range2({ label, low, high, minL, maxL, minH, maxH, step, onLow, onHigh, format }) {
  return (
    <div className="slider">
      <label>{label}</label>
      <output>{format(low)} / {format(high)}</output>
      <div className="range2">
        <div><span>Downside</span><input type="range" min={minL} max={maxL} step={step} value={low} onChange={(e) => onLow(Number(e.target.value))} aria-label={`${label} downside`} /></div>
        <div><span>Upside</span><input type="range" min={minH} max={maxH} step={step} value={high} onChange={(e) => onHigh(Number(e.target.value))} aria-label={`${label} upside`} /></div>
      </div>
    </div>
  );
}

export default function SimulationLab({ programs, scopeLabel, portfolio = false, settingsKey }) {
  const { ws, updateProgram, mutate } = useApp();
  const single = !portfolio && programs.length === 1 ? programs[0] : null;
  const stored = single ? single.simSettings : ws.portfolioSim;
  const [s, setS] = useState(() => ({ ...SIM_DEFAULTS, ...(stored || {}) }));
  const [res, setRes] = useState(null);
  const [live, setLive] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [target, setTarget] = useState(0);
  const [showLines, setShowLines] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overlay, setOverlay] = useState([]);
  const [eventModal, setEventModal] = useState(null);
  const [toast, toastNode] = useToast();
  const anim = useRef(null);
  const saveTimer = useRef(null);
  const programKey = programs.map((p) => p.id).join(',');

  // Reset local settings when the scope changes.
  useEffect(() => { setS({ ...SIM_DEFAULTS, ...(stored || {}) }); setOverlay([]); }, [programKey, settingsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist settings (debounced) so the business case uses the same assumptions.
  const persist = useCallback((next) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (single) updateProgram(single.id, (x) => { x.simSettings = next; }, 'Simulation settings changed', { field: 'simSettings' });
      else mutate('Portfolio simulation settings changed', (d) => { d.portfolioSim = next; }, { field: 'portfolioSim' });
    }, 700);
  }, [single, updateProgram, mutate]);
  const set = (patch) => setS((prev) => { const next = { ...prev, ...patch }; persist(next); return next; });

  const model = useMemo(() => (programs.length ? buildModel(programs, ws, s) : null), [programs, ws, s]);

  const runNow = useCallback((animate) => {
    if (!model) return;
    cancelAnimationFrame(anim.current);
    const run = createRun(model);
    if (!animate) {
      run.step(run.out.n);
      setRes({ run, analysis: analyse(run), tornado: tornado(model), done: run.out.n });
      setProgress(1); setRunning(false);
      return;
    }
    setRunning(true);
    const batch = Math.max(50, Math.round(run.out.n / 60));
    const tick = () => {
      const finished = run.step(batch);
      setProgress(run.out.done / run.out.n);
      if (finished) { setRes({ run, analysis: analyse(run), tornado: tornado(model), done: run.out.n }); setRunning(false); return; }
      setRes((prev) => ({ run, analysis: prev?.run === run ? prev.analysis : null, tornado: prev?.tornado, done: run.out.done, partial: true }));
      anim.current = requestAnimationFrame(tick);
    };
    anim.current = requestAnimationFrame(tick);
  }, [model]);

  useEffect(() => {
    if (!live) return undefined;
    const t = setTimeout(() => runNow(false), 220);
    return () => clearTimeout(t);
  }, [model, live, runNow]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  const a = res?.analysis;
  const out = res?.run.out;
  const n = res?.done || 0;
  const bins = useMemo(() => (out ? histogram(out.npv, n, 44) : []), [out, n]);
  const partialStats = useMemo(() => (out && res?.partial ? summarise(out.npv, n) : null), [out, n, res]);
  const npvS = a?.npv || partialStats;
  const scenarios = (single ? single.simScenarios : ws.portfolioScenarios) || [];

  const saveScenario = (name) => {
    if (!a) return;
    const q = Array.from({ length: 201 }, (_, i) => a.npv.sorted[Math.min(a.npv.sorted.length - 1, Math.round((i / 200) * (a.npv.sorted.length - 1)))]);
    const rec = { id: uid('scn'), name, createdAt: new Date().toISOString(), by: ws.currentUser, settings: s, summary: { mean: a.npv.mean, p10: a.npv.p10, p50: a.npv.p50, p90: a.npv.p90, probPositive: a.probPositive, base: a.base.npv }, quantiles: q };
    if (single) updateProgram(single.id, (x) => { x.simScenarios = [...(x.simScenarios || []), rec]; }, `Saved simulation scenario “${name}”`);
    else mutate(`Saved portfolio simulation scenario “${name}”`, (d) => { d.portfolioScenarios = [...(d.portfolioScenarios || []), rec]; });
    setOverlay((o) => [...o, rec.id].slice(-3));
    toast('Scenario saved');
  };
  const deleteScenario = (id) => {
    if (single) updateProgram(single.id, (x) => { x.simScenarios = (x.simScenarios || []).filter((y) => y.id !== id); }, 'Deleted simulation scenario');
    else mutate('Deleted portfolio simulation scenario', (d) => { d.portfolioScenarios = (d.portfolioScenarios || []).filter((y) => y.id !== id); });
  };

  const insights = useMemo(() => (a && res?.tornado ? buildInsights(a, res.tornado, model) : []), [a, res, model]);
  const fmtPct0 = (v) => `${Math.round(v * 100)}%`;
  const fmtSigned = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;

  if (!programs.length) return <Card><div className="empty-sm">Choose at least one program to simulate.</div></Card>;
  const assumptionEvents = model?.events.filter((e) => e.source === 'assumption') || [];

  return (
    <div className="lab">
      <div className="card lab-controls" aria-label="Simulation controls">
        <div className="ctl-group">
          <h4>Run <span className="row" style={{ gap: 6 }}><label className="check mini" style={{ alignItems: 'center' }}><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live</label></span></h4>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => runNow(true)} disabled={running}>▶ Animate run</button>
            <button className="btn btn-sm" onClick={() => runNow(false)} disabled={running}>Run now</button>
            <button className="btn btn-sm" onClick={() => set({ seed: Math.floor(Math.random() * 1e9) })} title="New random seed">🎲 Reseed</button>
          </div>
          <div className="run-progress" style={{ marginTop: 8 }}><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <div className="form-grid" style={{ marginTop: 10, gap: 8 }}>
            <Field label="Iterations"><Select value={String(s.iterations)} onChange={(v) => set({ iterations: Number(v) })} options={['1000', '2000', '5000', '10000', '20000']} /></Field>
            <Field label="Distribution"><Select value={s.dist} onChange={(v) => set({ dist: v })} options={[['pert', 'PERT'], ['triangular', 'Triangular'], ['uniform', 'Uniform'], ['normal', 'Normal']]} /></Field>
          </div>
          <div className="mini" style={{ marginTop: 6 }}>Seed {s.seed} — the same inputs and seed always give the same results.</div>
        </div>

        <div className="ctl-group">
          <h4>What-if levers <button className="btn btn-ghost btn-sm" onClick={() => set({ benefitScale: 1, costScale: 1, delayMonths: 0, rampScale: 1, lifetimeYears: null, dipScale: 1, discountRate: null, horizonYears: null })}>Reset</button></h4>
          <Slider label="Benefits realised" value={s.benefitScale} min={0.4} max={1.6} step={0.05} onChange={(v) => set({ benefitScale: v })} format={fmtPct0} hint="Scales every financial benefit's most likely value" />
          <Slider label="Costs" value={s.costScale} min={0.7} max={2} step={0.05} onChange={(v) => set({ costScale: v })} format={fmtPct0} hint="Scales every cost line's most likely value" />
          <Slider label="Benefit delay (most likely)" value={s.delayMonths} min={0} max={24} step={1} onChange={(v) => set({ delayMonths: v, delayHigh: Math.max(s.delayHigh, v), delayLow: Math.min(s.delayLow, v) })} format={(v) => `${v} mo`} />
          <Slider label="Ramp-up speed" value={s.rampScale ?? 1} min={0.5} max={2.5} step={0.1} onChange={(v) => set({ rampScale: v })} format={(v) => (v === 1 ? 'as planned' : v > 1 ? `${v.toFixed(1)}× slower` : `${(1 / v).toFixed(1)}× faster`)} hint="Stretches or compresses the time to each plateau" />
          <Slider label="Learning-lag dip" value={s.dipScale ?? 1} min={0} max={3} step={0.25} onChange={(v) => set({ dipScale: v })} format={(v) => (v === 1 ? 'as planned' : `${v}×`)} />
          <Slider label="Benefit lifetime" value={s.lifetimeYears || 0} min={0} max={15} step={1} onChange={(v) => set({ lifetimeYears: v || null })} format={(v) => (v ? `${v} years` : 'as planned')} />
          <Slider label="Discount rate" value={s.discountRate ?? ws.settings.discountRate} min={0} max={0.15} step={0.005} onChange={(v) => set({ discountRate: v })} format={(v) => pct(v, 1)} />
          <Slider label="Evaluation horizon" value={s.horizonYears || Math.round((model?.H || 120) / 12)} min={3} max={20} step={1} onChange={(v) => set({ horizonYears: v })} format={(v) => `${v} years`} />
        </div>

        <div className="ctl-group">
          <h4>Uncertainty</h4>
          <Range2 label="Benefit range (default per line)" low={s.benefitLow} high={s.benefitHigh} minL={-0.9} maxL={0} minH={0} maxH={1} step={0.05} onLow={(v) => set({ benefitLow: v })} onHigh={(v) => set({ benefitHigh: v })} format={fmtSigned} />
          <Range2 label="Cost range (default per line)" low={s.costLow} high={s.costHigh} minL={-0.5} maxL={0} minH={0} maxH={1.5} step={0.05} onLow={(v) => set({ costLow: v })} onHigh={(v) => set({ costHigh: v })} format={fmtSigned} />
          <Range2 label="Delay range (months)" low={s.delayLow} high={s.delayHigh} minL={0} maxL={s.delayMonths} minH={s.delayMonths} maxH={36} step={1} onLow={(v) => set({ delayLow: v })} onHigh={(v) => set({ delayHigh: v })} format={(v) => `${v}`} />
          <Slider label="Correlation between lines" value={s.lineCorrelation ?? 0.6} min={0} max={0.95} step={0.05} onChange={(v) => set({ lineCorrelation: v })} format={(v) => v.toFixed(2)} hint="How much benefit (and cost) lines move together" />
          <Slider label="Cost overrun ↔ delay correlation" value={s.correlation} min={-0.9} max={0.9} step={0.05} onChange={(v) => set({ correlation: v })} format={(v) => v.toFixed(2)} hint="Late programs usually cost more" />
          <button className="btn btn-sm" onClick={() => setShowLines(!showLines)}>{showLines ? 'Hide' : 'Edit'} per-line ranges ({model?.lines.length || 0})</button>
          {showLines && model && (
            <div style={{ marginTop: 8, maxHeight: 260, overflowY: 'auto' }}>
              {model.lines.map((l) => {
                const ov = s.lineOverrides?.[l.id] || {};
                const setOv = (patch) => set({ lineOverrides: { ...(s.lineOverrides || {}), [l.id]: { ...ov, ...patch } } });
                return (
                  <div key={l.id} style={{ borderBottom: '1px dashed var(--line)', padding: '6px 0', fontSize: 12 }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}><span><Pill tone={l.kind === 'cost' ? 'serious' : 'good'} icon={l.kind === 'cost' ? '−' : '+'}>{l.kind}</Pill> {l.name.slice(0, 30)}</span><label className="check mini"><input type="checkbox" checked={Boolean(ov.off)} onChange={(e) => setOv({ off: e.target.checked })} /> fixed</label></div>
                    {!ov.off && <div className="row" style={{ gap: 6, marginTop: 4 }}><span className="mini">−</span><NumberInput value={l.low} onChange={(v) => setOv({ low: v })} step={0.05} style={{ width: 70 }} aria-label="Downside" /><span className="mini">+</span><NumberInput value={l.high} onChange={(v) => setOv({ high: v })} step={0.05} style={{ width: 70 }} aria-label="Upside" />{programs.length > 1 && <span className="mini">{l.program.code}</span>}</div>}
                  </div>
                );
              })}
              <button className="btn btn-ghost btn-sm" onClick={() => set({ lineOverrides: {} })}>Clear overrides</button>
            </div>
          )}
        </div>

        <div className="ctl-group">
          <h4>Risk events <label className="check mini" style={{ alignItems: 'center' }}><input type="checkbox" checked={s.events} onChange={(e) => set({ events: e.target.checked })} /> On</label></h4>
          {s.events && <>
            {assumptionEvents.length === 0 && <div className="mini">No assumptions linked to financial benefits.</div>}
            {assumptionEvents.map((e) => {
              const ov = s.eventOverrides?.[e.id] || {};
              const setOv = (patch) => set({ eventOverrides: { ...(s.eventOverrides || {}), [e.id]: { ...ov, ...patch } } });
              return (
                <div key={e.id} style={{ borderBottom: '1px dashed var(--line)', paddingBottom: 6, marginBottom: 6 }}>
                  <div className="mini" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{e.name}{programs.length > 1 ? ` (${e.program.code})` : ''}</div>
                  <Slider label="Probability" value={e.prob} min={0} max={1} step={0.05} onChange={(v) => setOv({ prob: v })} format={fmtPct0} />
                  <Slider label="Benefit lost if it happens" value={e.impact} min={0} max={1} step={0.05} onChange={(v) => setOv({ impact: v })} format={fmtPct0} />
                </div>
              );
            })}
            {(s.customEvents || []).map((e, i) => (
              <div key={e.id} style={{ borderBottom: '1px dashed var(--line)', padding: '6px 0', fontSize: 12.5 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}><strong>{e.name}</strong><span className="row" style={{ gap: 4 }}><label className="check mini"><input type="checkbox" checked={!e.off} onChange={(ev) => set({ customEvents: s.customEvents.map((x, j) => (j === i ? { ...x, off: !ev.target.checked } : x)) })} /> on</label><button className="btn btn-ghost btn-sm" onClick={() => setEventModal({ ...e, index: i })}>Edit</button></span></div>
                <div className="mini">{pct(e.prob)} chance · {e.kind === 'cost' ? `${money(e.impact)} extra cost` : e.kind === 'delay' ? `${e.impact} months extra delay` : `${pct(e.impact)} of benefits lost`}</div>
              </div>
            ))}
            <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => setEventModal({ id: uid('ev'), name: 'New risk event', kind: 'cost', prob: 0.2, impact: 250000, index: -1 })}>+ Custom event</button>
            <div className="mini" style={{ marginTop: 6 }}>Assumption events come from the benefits map: if an assumption proves false, the benefits downstream of it are cut. Defaults: holding {pct(ASSUMPTION_PROB.holding)}, at risk {pct(ASSUMPTION_PROB['at-risk'])}, invalid {pct(ASSUMPTION_PROB.invalid)}.</div>
          </>}
        </div>

        <div className="ctl-group">
          <h4>Scenarios</h4>
          <button className="btn btn-sm" onClick={() => setSaving(true)} disabled={!a}>Save current as scenario…</button>
          {scenarios.map((sc, i) => (
            <div key={sc.id} className="row" style={{ justifyContent: 'space-between', marginTop: 6, flexWrap: 'nowrap' }}>
              <label className="check mini" style={{ alignItems: 'center' }}><input type="checkbox" checked={overlay.includes(sc.id)} onChange={(e) => setOverlay(e.target.checked ? [...overlay, sc.id].slice(-3) : overlay.filter((x) => x !== sc.id))} /><span className="scenario-chip" style={{ padding: '1px 8px' }}><i style={{ background: overlay.includes(sc.id) ? SCEN_COLORS[overlay.indexOf(sc.id) % 3] : '#c3c9d2' }} />{sc.name}</span></label>
              <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}><button className="btn btn-ghost btn-sm" title="Load these settings" onClick={() => set({ ...SIM_DEFAULTS, ...sc.settings })}>Load</button><button className="btn btn-ghost btn-sm" aria-label="Delete scenario" onClick={() => deleteScenario(sc.id)}>✕</button></span>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => set({ ...SIM_DEFAULTS, seed: s.seed, iterations: s.iterations })}>Reset all settings</button>
        </div>
      </div>

      <div className="stack">
        <div className="kpi-grid">
          <div className="card stat accent"><div className="label">Expected NPV (mean)</div><div className="value" style={{ color: npvS?.mean < 0 ? '#a52a2a' : undefined }}>{npvS ? money(npvS.mean) : '…'}</div><div className="sub">Risk-adjusted (VAL-13); base case {a ? money(a.base.npv) : '…'}</div></div>
          <div className="card stat"><div className="label">NPV range P10 – P90</div><div className="value" style={{ fontSize: 20 }}>{npvS ? `${money(npvS.p10)} – ${money(npvS.p90)}` : '…'}</div><div className="sub">Median (P50) {npvS ? money(npvS.p50) : '…'}</div></div>
          <div className="card stat"><div className="label">Chance NPV &gt; 0</div><div className="value">{a ? pct(a.probPositive) : '…'}</div>{a && <div className="prob-bar" role="img" aria-label={`Probability of positive NPV ${pct(a.probPositive)}`}><span style={{ width: `${a.probPositive * 100}%` }} /></div>}</div>
          <div className="card stat"><div className="label">Benefit–cost ratio</div><div className="value">{a ? ratio(a.bcr?.p50) : '…'}</div><div className="sub">P10 {a ? ratio(a.bcr?.p10) : '…'} · P(BCR &gt; 1) {a ? pct(a.probBcr1) : '…'}</div></div>
          <div className="card stat"><div className="label">Payback (median)</div><div className="value" style={{ fontSize: 20 }}>{a?.payback ? months(a.payback.p50) : '…'}</div><div className="sub">Pays back within horizon in {a ? pct(a.probPayback) : '…'} of runs</div></div>
        </div>

        {insights.length > 0 && (
          <Card title="What the simulation is telling you">
            <ul style={{ margin: 0, paddingLeft: 18 }}>{insights.map((t, i) => <li key={i} style={{ marginBottom: 4 }}>{t}</li>)}</ul>
            <p className="mini" style={{ margin: '8px 0 0' }}>The simulation sharpens judgement; it does not make the decision (principle P12). {res && `${n.toLocaleString()} iterations over ${model.lines.length} cost and benefit lines${model.events.length ? ` and ${model.events.length} risk events` : ''}.`}</p>
          </Card>
        )}

        <div className="grid g-2">
          <ChartCard title="Distribution of NPV" subtitle={`${scopeLabel} · ${n.toLocaleString()} iterations${running ? ' (running…)' : ''}`} table={a ? { columns: [{ label: 'NPV from', get: (b) => money(b.x0) }, { label: 'to', get: (b) => money(b.x1) }, { label: 'Iterations', num: true, get: (b) => b.count }, { label: 'Share', num: true, get: (b) => pct(b.count / n, 1) }], rows: bins } : null}>
            <Histogram bins={bins} total={n} markers={npvS ? [{ label: 'P10', value: npvS.p10, color: 'var(--ink-2)' }, { label: 'P50', value: npvS.p50, strong: true }, { label: 'P90', value: npvS.p90, color: 'var(--ink-2)' }, ...(a ? [{ label: 'Base', value: a.base.npv, color: 'var(--brand-gold)', dash: true }] : [])] : []} />
            <div className="legend inline"><span><i style={{ background: 'var(--series-8)' }} />NPV below zero</span><span><i style={{ background: 'var(--net)' }} />NPV above zero</span><span><i className="dash" style={{ borderTopColor: 'var(--brand-gold)' }} />Base case (no uncertainty)</span></div>
          </ChartCard>
          <ChartCard title="Probability curve (S-curve)" subtitle="Drag across the chart to read the chance NPV falls below any value" table={a ? { columns: [{ label: 'Percentile', get: (r) => r[0] }, { label: 'NPV', num: true, get: (r) => money(r[1]) }], rows: [['P5', a.npv.p5], ['P10', a.npv.p10], ['P25', a.npv.p25], ['P50', a.npv.p50], ['P75', a.npv.p75], ['P90', a.npv.p90], ['P95', a.npv.p95]] } : null}>
            <CdfChart target={target} onTarget={setTarget} series={[{ name: 'Current settings', sorted: a?.npv.sorted || [], color: 'var(--net)' }, ...overlay.map((id, i) => { const sc = scenarios.find((x) => x.id === id); return sc ? { name: sc.name, sorted: sc.quantiles, color: SCEN_COLORS[i % 3] } : null; }).filter(Boolean)]} />
            <div className="row mini" style={{ marginTop: 6 }}><span>Target NPV</span><NumberInput value={Math.round(target)} onChange={(v) => setTarget(Number(v) || 0)} step={50000} style={{ width: 130 }} aria-label="Target NPV" /><button className="btn btn-ghost btn-sm" onClick={() => setTarget(0)}>Break-even</button></div>
          </ChartCard>
        </div>

        <ChartCard title="Cumulative net cash flow over time" subtitle="Fan of outcomes — the shaded bands show where 50% and 80% of runs fall" table={a ? { columns: [{ label: 'Quarter end', get: (f) => quarterLabel(f.key) }, { label: 'P10', num: true, get: (f) => money(f.p10) }, { label: 'P50', num: true, get: (f) => money(f.p50) }, { label: 'P90', num: true, get: (f) => money(f.p90) }, { label: 'Base', num: true, get: (f) => money(a.base.cumQ[f.q]) }], rows: a.fan } : null}>
          {a ? <FanChart fan={a.fan} base={a.base.cumQ} /> : <div className="empty-sm">Running…</div>}
        </ChartCard>

        <div className="grid g-2">
          <ChartCard title="Costs against benefits" subtitle="Each dot is one simulated future (present values)">
            {out ? <CostBenefitScatter pvC={out.pvC} pvB={out.pvB} n={n} base={a ? { pvC: a.base.pvC, pvB: a.base.pvB } : null} /> : <div className="empty-sm">Running…</div>}
          </ChartCard>
          <ChartCard title="What drives the result" subtitle="Tornado: NPV as each input moves from its downside to its upside" table={res?.tornado ? { columns: [{ label: 'Input', get: (r) => r.label }, { label: 'NPV low', num: true, get: (r) => money(r.low) }, { label: 'NPV high', num: true, get: (r) => money(r.high) }, { label: 'Swing', num: true, get: (r) => money(r.swing) }], rows: res.tornado.rows } : null}>
            {res?.tornado ? <Tornado rows={res.tornado.rows} base={res.tornado.base} /> : <div className="empty-sm">Running…</div>}
          </ChartCard>
        </div>

        {programs.length > 1 && a && (
          <ChartCard title="Spread of NPV by program" subtitle="Which programs carry the portfolio's uncertainty" table={{ columns: [{ label: 'Program', get: (r) => `${r.program.code} ${r.program.name}` }, { label: 'P10', num: true, get: (r) => money(r.stats.p10) }, { label: 'P50', num: true, get: (r) => money(r.stats.p50) }, { label: 'P90', num: true, get: (r) => money(r.stats.p90) }, { label: 'P(NPV>0)', num: true, get: (r) => pct(r.probPositive) }], rows: a.perProgram }}>
            <BoxPlot rows={a.perProgram} />
          </ChartCard>
        )}

        {a && (
          <div className="grid g-2">
            <Card title="Risk events" subtitle="How often each event occurred and what it did to NPV" pad={false}>
              {!a.eventImpact.length ? <div className="empty-sm">No risk events in this run.</div> : (
                <div className="table-wrap"><table className="table compact"><thead><tr><th>Event</th><th className="num">Occurred</th><th className="num">Mean NPV if it happens</th><th className="num">Impact</th></tr></thead><tbody>
                  {a.eventImpact.slice().sort((x, y) => x.delta - y.delta).map((e) => <tr key={e.id}><td>{e.name}</td><td className="num">{pct(e.occurred)}</td><td className="num">{money(e.npvIf)}</td><td className={`num ${e.delta < 0 ? 'neg' : ''}`}>{money(e.delta)}</td></tr>)}
                </tbody></table></div>
              )}
            </Card>
            <Card title="Distribution statistics" pad={false} actions={<button className="btn btn-sm dl" onClick={() => downloadCSV(Array.from({ length: n }, (_, i) => i), [{ label: 'Iteration', get: (i) => i + 1 }, { label: 'NPV', get: (i) => Math.round(out.npv[i]) }, { label: 'PV benefits', get: (i) => Math.round(out.pvB[i]) }, { label: 'PV costs', get: (i) => Math.round(out.pvC[i]) }, { label: 'BCR', get: (i) => out.bcr[i].toFixed(3) }, { label: 'Payback months', get: (i) => (Number.isFinite(out.payback[i]) ? out.payback[i] : '') }, { label: 'Benefit delay months', get: (i) => out.delay[i].toFixed(1) }], `${safeName(scopeLabel)}_simulation.csv`)}>Export runs (CSV)</button>}>
              <div className="table-wrap"><table className="table compact"><thead><tr><th>Measure</th><th className="num">Mean</th><th className="num">P10</th><th className="num">P50</th><th className="num">P90</th></tr></thead><tbody>
                {[['NPV', a.npv, money], ['PV benefits', a.pvB, money], ['PV costs', a.pvC, money], ['Benefit–cost ratio', a.bcr, ratio], ['ROI (undiscounted)', a.roi, (v) => pct(v)], ['IRR', a.irr, (v) => pct(v, 1)], ['Payback (months)', a.payback, (v) => (Number.isFinite(v) ? Math.round(v) : '—')], ['Benefit delay (months)', a.delay, (v) => v.toFixed(1)]].map(([l, st, f]) => <tr key={l}><td>{l}</td><td className="num">{st ? f(st.mean) : '—'}</td><td className="num">{st ? f(st.p10) : '—'}</td><td className="num">{st ? f(st.p50) : '—'}</td><td className="num">{st ? f(st.p90) : '—'}</td></tr>)}
              </tbody></table></div>
              <div className="card-body mini">IRR is shown for the {a.irr ? pct(a.irr.n / a.irr.of) : '—'} of runs where cash flows change sign. Payback statistics cover runs that pay back within the horizon.</div>
            </Card>
          </div>
        )}
      </div>

      {saving && <SaveScenario onClose={() => setSaving(false)} onSave={(name) => { saveScenario(name); setSaving(false); }} />}
      {eventModal && (
        <Modal title="Risk event" onClose={() => setEventModal(null)} footer={<>{eventModal.index >= 0 && <button className="btn btn-danger" onClick={() => { set({ customEvents: s.customEvents.filter((_, j) => j !== eventModal.index) }); setEventModal(null); }}>Delete</button>}<button className="btn" onClick={() => setEventModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => { const { index, ...ev } = eventModal; set({ customEvents: index >= 0 ? s.customEvents.map((x, j) => (j === index ? ev : x)) : [...(s.customEvents || []), ev] }); setEventModal(null); }}>Save</button></>}>
          <div className="form-grid">
            <Field label="Name" className="full"><TextInput value={eventModal.name} onChange={(v) => setEventModal({ ...eventModal, name: v })} /></Field>
            <Field label="Effect"><Select value={eventModal.kind} onChange={(v) => setEventModal({ ...eventModal, kind: v, impact: v === 'cost' ? 250000 : v === 'delay' ? 3 : 0.2 })} options={[['cost', 'Extra cost (lump sum)'], ['delay', 'Extra delay to benefits (months)'], ['benefit', 'Share of benefits lost']]} /></Field>
            <Field label="Probability (0–1)"><NumberInput value={eventModal.prob} onChange={(v) => setEventModal({ ...eventModal, prob: v })} min={0} max={1} step={0.05} /></Field>
            <Field label={eventModal.kind === 'cost' ? 'Extra cost ($)' : eventModal.kind === 'delay' ? 'Months' : 'Share lost (0–1)'}><NumberInput value={eventModal.impact} onChange={(v) => setEventModal({ ...eventModal, impact: v })} /></Field>
            {eventModal.kind === 'cost' && <Field label="When (month)"><input type="month" value={(eventModal.month || '').slice(0, 7)} onChange={(e) => setEventModal({ ...eventModal, month: `${e.target.value}-01` })} /></Field>}
            {programs.length > 1 && eventModal.kind === 'benefit' && <Field label="Program"><Select value={eventModal.programId} onChange={(v) => setEventModal({ ...eventModal, programId: v })} placeholder="All programs" options={programs.map((p) => [p.id, `${p.code} ${p.name}`])} /></Field>}
          </div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}

function SaveScenario({ onClose, onSave }) {
  const [name, setName] = useState(`Scenario ${fmtDate(todayISO())}`);
  return (
    <Modal title="Save simulation scenario" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!name.trim()} onClick={() => onSave(name.trim())}>Save</button></>}>
      <Field label="Name"><TextInput value={name} onChange={setName} autoFocus /></Field>
      <p className="mini">Saved scenarios keep their settings and result distribution, so you can overlay them on the S-curve and reload them later.</p>
    </Modal>
  );
}

// Plain-English reading of the results.
function buildInsights(a, tor, model) {
  const out = [];
  const pp = a.probPositive;
  const word = pp >= 0.9 ? 'very likely' : pp >= 0.75 ? 'likely' : pp >= 0.55 ? 'more likely than not' : pp >= 0.4 ? 'roughly a coin toss' : 'unlikely';
  out.push(`A positive NPV is ${word}: it happens in ${pct(pp)} of simulated futures. Eight in ten outcomes fall between ${money(a.npv.p10)} and ${money(a.npv.p90)}.`);
  const gap = a.npv.mean - a.base.npv;
  if (Math.abs(gap) > Math.abs(a.base.npv) * 0.05 + 1000) out.push(`The expected (risk-adjusted) NPV is ${money(Math.abs(gap))} ${gap < 0 ? 'below' : 'above'} the single-point base case of ${money(a.base.npv)}${gap < 0 ? ' — downside ranges and risk events pull value down, which a single-figure business case hides' : ''}.`);
  const top = tor.rows[0];
  if (top) out.push(`The biggest driver is ${top.label.replace(/^(Cost|Benefit|Risk): /, '').toLowerCase()} — it swings NPV by ${money(top.swing)}. Tightening that estimate or managing that risk is worth more than refining anything else.`);
  const ev = a.eventImpact.slice().sort((x, y) => x.delta - y.delta)[0];
  if (ev && ev.delta < 0) out.push(`If “${ev.name}” happens, mean NPV falls by ${money(-ev.delta)}. Monitor its indicator and consider testing it early (for example with a pilot before Commitment).`);
  if (a.payback?.p50) out.push(`Median payback is ${months(a.payback.p50)} from the start of spending; ${pct(1 - a.probPayback)} of runs do not pay back within the ${Math.round(model.H / 12)}-year horizon.`);
  if (pp < 0.6) out.push('With this level of uncertainty, consider committing a smaller first tranche, adding mitigations, or holding the program on the waiting list until key assumptions are tested.');
  return out;
}
