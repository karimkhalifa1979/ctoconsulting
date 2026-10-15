import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../lib/store.jsx';
import { summaries, categoryFunds } from '../lib/portfolio.js';
import { changeLoad } from '../lib/scoring.js';
import { financials } from '../lib/finance.js';
import { simulate } from '../lib/simulation.js';
import { PageHead, Card, Select, NumberInput, Pill, RiskIcon, Modal, Field, TextArea, Guidance, StackBar, useToast } from '../components/ui.jsx';
import { money, pct, todayISO, fiscalYear, fyLabel, quarterKey, addMonths, uid, fmtDate } from '../lib/util.js';

const SEL = [['selected', 'Selected'], ['queued', 'Queued (waiting list)'], ['not-selected', 'Not selected']];

export default function Selection() {
  const { ws, mutate } = useApp();
  const nav = useNavigate();
  const s = summaries(ws);
  const [fy, setFy] = useState(fiscalYear(todayISO(), ws.settings.fyStartMonth));
  const [working, setWorking] = useState(() => Object.fromEntries(ws.programs.map((p) => [p.id, p.selection || 'queued'])));
  const [why, setWhy] = useState(null);
  const [compare, setCompare] = useState([]);
  const [simRes, setSimRes] = useState(null);
  const [urgent, setUrgent] = useState(1500000);
  const [riskCap, setRiskCap] = useState(65);
  const [toast, toastNode] = useToast();
  const cands = ws.programs.filter((p) => !['withdrawn', 'completed'].includes(p.state));
  const fyCost = (p) => s.get(p.id).fin.annual.filter((y) => y.fy === fy).reduce((a, y) => a + y.costs, 0);
  const peakFte = (p) => Math.max(0, ...(p.demand || []).map((d) => d.fte));
  const funds = categoryFunds(ws, fy);
  const reserve = Number(ws.reserve?.[fy]) || 0;
  const released = ws.programs.filter((p) => p.state === 'withdrawn' && p.withdrawal && fiscalYear(p.withdrawal.date, ws.settings.fyStartMonth) === fy).reduce((a, p) => a + (Number(p.withdrawal.released) || 0), 0);

  // Constraint check for a selection map (PFM-04).
  const evaluate = (sel) => {
    const chosen = cands.filter((p) => sel[p.id] === 'selected');
    const violations = [];
    for (const f of funds) {
      const cost = chosen.filter((p) => p.categoryId === f.category.id).reduce((a, p) => a + fyCost(p), 0);
      if (cost > f.allocation + (f.category.discretionary ? released : 0) && cost > 0) violations.push(`${f.category.name}: ${money(cost)} needed in ${fyLabel(fy)} against ${money(f.allocation)} allocated`);
    }
    const qs = []; let q = quarterKey(todayISO()); for (let i = 0; i < 8; i++) { qs.push(q); q = quarterKey(addMonths(`${q.slice(0, 4)}-${String((Number(q.slice(-1)) - 1) * 3 + 1).padStart(2, '0')}-01`, 3)); }
    for (const r of ws.resources) for (const qq of qs) { const tot = chosen.reduce((a, p) => a + (p.demand || []).filter((d) => d.roleId === r.id && qq >= d.from && qq <= d.to).reduce((x, d) => x + d.fte, 0), 0); if (tot > r.capacity) { violations.push(`${r.name}: ${tot} FTE demanded in ${qq} against capacity ${r.capacity}`); break; } }
    const cl = changeLoad(ws, chosen, qs[0], qs[qs.length - 1]);
    for (const row of cl.rows) { const over = row.cells.find((c) => c.over); if (over) violations.push(`${row.area.name}: change load ${over.load.toFixed(1)} exceeds absorption ${row.area.absorption} in ${over.q}`); }
    const npv = chosen.reduce((a, p) => a + s.get(p.id).fin.npv, 0);
    const risks = chosen.map((p) => s.get(p.id).risk.overall).filter((x) => x !== null);
    const drivers = new Set(chosen.flatMap((p) => p.driverIds || []));
    const disc = chosen.filter((p) => ws.categories.find((c) => c.id === p.categoryId)?.discretionary);
    const discCost = disc.reduce((a, p) => a + fyCost(p), 0);
    const highRiskShare = discCost ? disc.filter((p) => (s.get(p.id).risk.overall ?? 0) > ws.settings.thresholds.riskRed).reduce((a, p) => a + fyCost(p), 0) / discCost : 0;
    return { chosen, violations, npv, meanRisk: risks.length ? risks.reduce((a, b) => a + b, 0) / risks.length : null, coverage: drivers.size / Math.max(1, ws.drivers.length), cost: chosen.reduce((a, p) => a + fyCost(p), 0), highRiskShare };
  };
  const ev = useMemo(() => evaluate(working), [working, ws, fy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Advisory optimiser (PFM-14): greedy by NPV per FY dollar within discretionary budget and risk cap.
  const suggestion = useMemo(() => {
    const out = { ...working };
    const disc = cands.filter((p) => ws.categories.find((c) => c.id === p.categoryId)?.discretionary && !['active', 'harvesting'].includes(p.state));
    const budget = funds.filter((f) => f.category.discretionary).reduce((a, f) => a + f.allocation, 0) + released;
    let used = cands.filter((p) => ws.categories.find((c) => c.id === p.categoryId)?.discretionary && ['active', 'harvesting'].includes(p.state)).reduce((a, p) => a + fyCost(p), 0);
    for (const p of disc) out[p.id] = 'queued';
    disc.filter((p) => (s.get(p.id).risk.overall ?? 0) <= riskCap && s.get(p.id).fin.npv > 0).sort((a, b) => s.get(b.id).fin.npv / Math.max(1, fyCost(b) || s.get(b.id).fin.totalCosts) - s.get(a.id).fin.npv / Math.max(1, fyCost(a) || s.get(a.id).fin.totalCosts)).forEach((p) => { if (used + fyCost(p) <= budget) { out[p.id] = 'selected'; used += fyCost(p); } });
    return out;
  }, [cands, funds, riskCap, released, working, ws]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSel = (id, v) => { if (v === 'not-selected') setWhy({ id, text: '' }); else setWorking({ ...working, [id]: v }); };
  const saveScenario = () => { const name = window.prompt('Scenario name', `Scenario ${fmtDate(todayISO())}`); if (name) { mutate(`Saved portfolio scenario “${name}”`, (d) => { d.scenarios.push({ id: uid('sc'), name, createdAt: todayISO(), approved: false, selections: { ...working } }); }); toast('Scenario saved'); } };
  const promote = (sc) => { if (!window.confirm(`Promote “${sc.name}” to the approved plan? Program selections will change; record the board decision in the meeting minutes.`)) return; mutate(`Scenario “${sc.name}” promoted to approved plan`, (d) => { d.scenarios.forEach((x) => { x.approved = x.id === sc.id; }); for (const p of d.programs) if (sc.selections[p.id]) { p.selection = sc.selections[p.id]; if (sc.selections[p.id] === 'queued' && ['concept', 'definition', 'awaiting-initiation'].includes(p.state)) p.state = 'waiting-list'; } }, { action: 'approve' }); setWorking({ ...sc.selections }); };
  const waiting = cands.filter((p) => working[p.id] === 'queued').sort((a, b) => (a.waitRank || 99) - (b.waitRank || 99));
  const freeFunds = released + reserve + funds.filter((f) => f.category.discretionary).reduce((a, f) => a + Math.max(0, f.available), 0);
  const overruns = funds.filter((f) => !f.category.discretionary && f.available < 0);
  const discActive = cands.filter((p) => ws.categories.find((c) => c.id === p.categoryId)?.discretionary && working[p.id] === 'selected');

  const divers = (keyFn, labels) => { const m = {}; for (const p of ev.chosen) { const k = keyFn(p); m[k] = (m[k] || 0) + s.get(p.id).fin.totalCosts; } return Object.entries(m).map(([k, v], i) => ({ label: labels(k), value: v, color: `var(--series-${(i % 8) + 1})` })); };

  return (
    <div className="stack">
      <PageHead eyebrow="Portfolio" title="Selection workbench" actions={<>
        <Select value={String(fy)} onChange={(v) => setFy(Number(v))} options={[fy - 1, fy, fy + 1, fy + 2].map((y) => [String(y), fyLabel(y, ws.settings.fyStartMonth)])} aria-label="Financial year" />
        <button className="btn" onClick={saveScenario}>Save working scenario</button>
      </>}>Select, defer, bump or stretch programs within real constraints — budget by category, scarce skills, and the business's capacity to absorb change — and keep a ranked waiting list ready to use released resources. Recommendations advise; the board decides.</PageHead>

      <div className="kpi-grid">
        <div className="card stat accent"><div className="label">Working scenario NPV</div><div className="value">{money(ev.npv)}</div><div className="sub">{ev.chosen.length} programs selected</div></div>
        <div className="card stat"><div className="label">{fyLabel(fy)} cost of selection</div><div className="value">{money(ev.cost)}</div><div className="sub">allocated {money(funds.reduce((a, f) => a + f.allocation, 0))} + reserve {money(reserve)}</div></div>
        <div className="card stat"><div className="label">Mean risk · driver coverage</div><div className="value">{ev.meanRisk === null ? '—' : Math.round(ev.meanRisk)} · {pct(ev.coverage)}</div></div>
        <div className="card stat"><div className="label">Constraint violations</div><div className="value" style={{ color: ev.violations.length ? '#a52a2a' : undefined }}>{ev.violations.length}</div><div className="sub">budget, skills, change load</div></div>
        <div className="card stat"><div className="label">Released and reserve</div><div className="value">{money(released + reserve)}</div><div className="sub">{money(released)} from withdrawals</div></div>
      </div>
      {ev.violations.length > 0 && <div className="callout warn"><strong>Constraint check (PFM-04):</strong><ul style={{ margin: '4px 0 0' }}>{ev.violations.map((v) => <li key={v}>{v}</li>)}</ul></div>}

      <Card title="Candidates side by side (PFM-03)" subtitle="Change the working scenario here; it becomes the plan only when promoted" pad={false}>
        <div className="table-wrap"><table className="table compact">
          <thead><tr><th>Program</th><th>Category</th><th>State</th><th className="num">NPV</th><th>Risk</th><th className="num">Align</th><th className="num">Lifetime cost</th><th className="num">{fyLabel(fy)} cost</th><th className="num">Peak FTE</th><th className="num">Deps</th><th>Decision</th></tr></thead>
          <tbody>{cands.map((p) => { const x = s.get(p.id); return (
            <tr key={p.id}>
              <td><button className="btn btn-ghost btn-sm" onClick={() => nav(`/programs/${p.id}`)}><strong>{p.code}</strong></button> {p.name}{p.selectionReason && working[p.id] === 'not-selected' && <div className="mini">Not selected: {p.selectionReason}</div>}</td>
              <td>{ws.categories.find((c) => c.id === p.categoryId)?.name}</td><td className="mini">{p.state}</td>
              <td className={`num ${x.fin.npv < 0 ? 'neg' : ''}`}>{money(x.fin.npv)}</td><td><RiskIcon byAre={x.risk.byAre} ws={ws} size={22} /></td><td className="num">{x.align.score === null ? '—' : Math.round(x.align.score)}</td>
              <td className="num">{money(x.fin.totalCosts)}</td><td className="num">{money(fyCost(p))}</td><td className="num">{peakFte(p) || '—'}</td><td className="num">{ws.dependencies.filter((d) => d.from === p.id || d.to === p.id).length}</td>
              <td><Select value={working[p.id]} onChange={(v) => setSel(p.id, v)} options={SEL} aria-label={`Decision for ${p.name}`} /></td>
            </tr>
          ); })}</tbody>
        </table></div>
      </Card>

      <div className="grid g-2" data-layout>
        <Card title="Category allocations (PFM-02, PFM-10)" subtitle={`${fyLabel(fy)} — committed means tranches approved at gates in the year`} pad={false}>
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Category</th><th className="num">Allocation</th><th className="num">Committed</th><th className="num">Forecast spend</th><th className="num">Available</th></tr></thead>
            <tbody>{funds.map((f) => { const al = ws.allocations.find((a) => a.categoryId === f.category.id && a.fy === fy); return (
              <tr key={f.category.id}><td>{f.category.name}{f.category.discretionary && <> <Pill tone="navy" icon="◆">discretionary</Pill></>}</td>
                <td><NumberInput value={al?.amount ?? 0} onChange={(v) => mutate(`Allocation ${f.category.name} ${fyLabel(fy)}`, (d) => { const a = d.allocations.find((y) => y.categoryId === f.category.id && y.fy === fy); if (a) a.amount = v; else d.allocations.push({ id: uid('al'), fy, categoryId: f.category.id, amount: v }); }, { field: `alloc:${f.category.id}:${fy}` })} style={{ width: 120 }} /></td>
                <td className="num">{money(f.committed)}</td><td className="num">{money(f.forecast)}</td><td className={`num ${f.available < 0 ? 'neg' : ''}`}>{money(f.available)}</td></tr>
            ); })}
              <tr><td><strong>Unallocated reserve</strong></td><td><NumberInput value={reserve} onChange={(v) => mutate(`Reserve ${fyLabel(fy)}`, (d) => { d.reserve = { ...(d.reserve || {}), [fy]: v }; }, { field: `reserve:${fy}` })} style={{ width: 120 }} /></td><td colSpan={3} className="mini">Used for new mandatory obligations and urgent opportunities (PFM-09)</td></tr>
            </tbody>
          </table></div>
        </Card>
        <Card title="Waiting list (PFM-06)" subtitle="Ranked programs ready to use released resources">
          {!waiting.length ? <div className="empty-sm">No queued programs.</div> : waiting.map((p, i) => (
            <div key={p.id} className="check-row" style={{ gridTemplateColumns: '50px 1fr auto' }}>
              <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}><button className="btn btn-ghost btn-sm" aria-label="Move up" disabled={i === 0} onClick={() => mutate('Waiting list re-ranked', (d) => { waiting.forEach((w, k) => { d.programs.find((x) => x.id === w.id).waitRank = k === i ? i : k === i - 1 ? i + 1 : k + 1; }); })}>▲</button><strong>{i + 1}</strong></span>
              <span><strong>{p.code}</strong> {p.name}<div className="mini">NPV {money(s.get(p.id).fin.npv)} · {fyLabel(fy)} cost {money(fyCost(p))}</div></span>
              {fyCost(p) <= freeFunds ? <Pill tone="good">Fundable now</Pill> : <Pill tone="none">Needs {money(fyCost(p) - freeFunds)}</Pill>}
            </div>
          ))}
          <p className="mini">Funds available to the discretionary pool: {money(freeFunds)} (released {money(released)}, reserve {money(reserve)}, unspent discretionary allocation). Withdrawals return funds automatically (BR-14).</p>
        </Card>
      </div>

      <div className="grid g-2" data-layout>
        <Card title="Risk profile and diversification (PFM-07)" subtitle={ws.portfolios[0]?.riskAppetite}>
          <div className="mini">By category (lifetime cost)</div><StackBar segments={divers((p) => p.categoryId, (k) => ws.categories.find((c) => c.id === k)?.name)} format={(v) => money(v)} />
          <div className="mini" style={{ marginTop: 10 }}>By risk band</div><StackBar segments={divers((p) => { const r = s.get(p.id).risk.overall; return r === null ? 'Not assessed' : r > 65 ? 'High' : r >= 35 ? 'Medium' : 'Low'; }, (k) => k)} format={(v) => money(v)} />
          <div className="mini" style={{ marginTop: 10 }}>By start year (time horizon)</div><StackBar segments={divers((p) => (p.startDate || '').slice(0, 4), (k) => k)} format={(v) => money(v)} />
          <div className="row" style={{ marginTop: 12 }}>
            <Pill tone={ev.highRiskShare > 0.3 ? 'warning' : 'good'}>{pct(ev.highRiskShare)} of discretionary {fyLabel(fy)} spend in high-risk programs (appetite ≤ 30%)</Pill>
            <button className="btn btn-sm" onClick={() => { const r = simulate(ev.chosen, ws, { ...ws.portfolioSim, iterations: 2000 }); setSimRes(r.analysis); }}>Simulate this selection</button>
          </div>
          {simRes && <div className={`${simRes.npv.p10 < 0 ? 'callout warn' : 'guidance'}`} style={{ marginTop: 8 }}>Monte Carlo (2,000 runs): expected NPV {money(simRes.npv.mean)}, P10 {money(simRes.npv.p10)}, P90 {money(simRes.npv.p90)}, P(NPV &gt; 0) {pct(simRes.probPositive)}. {simRes.npv.p10 < 0 ? 'The portfolio is not NPV-positive at P10 — outside the stated risk appetite.' : 'NPV-positive at P10 — within the stated risk appetite.'}</div>}
        </Card>
        <Card title="Advisory selection (PFM-14)" subtitle="Maximises NPV per dollar within the discretionary budget and a risk cap — advisory only, never applied automatically">
          <div className="row"><span className="mini">Exclude programs with risk above</span><NumberInput value={riskCap} onChange={(v) => setRiskCap(Number(v) || 0)} style={{ width: 70 }} aria-label="Risk cap" /></div>
          <div style={{ marginTop: 8 }}>{cands.filter((p) => suggestion[p.id] !== working[p.id]).map((p) => <div key={p.id} className="check-row"><span className="ic">→</span><span><strong>{p.code}</strong> {p.name}: {SEL.find((x) => x[0] === working[p.id])?.[1]} → <strong>{SEL.find((x) => x[0] === suggestion[p.id])?.[1]}</strong></span><span /></div>)}
            {cands.every((p) => suggestion[p.id] === working[p.id]) && <div className="empty-sm">The working scenario already matches the suggestion.</div>}</div>
          <div className="row" style={{ marginTop: 8 }}><span className="mini">Suggested NPV {money(evaluate(suggestion).npv)} · {evaluate(suggestion).violations.length} violations</span><button className="btn btn-sm" onClick={() => setWorking(suggestion)}>Load into working scenario</button></div>
        </Card>
      </div>

      <div className="grid g-2" data-layout>
        <Card title="Urgent opportunity or new obligation (PFM-09)" subtitle="Options to fund it mid-period, and their effect">
          <div className="row"><span className="mini">Funding needed in {fyLabel(fy)}</span><NumberInput value={urgent} onChange={(v) => setUrgent(Number(v) || 0)} style={{ width: 140 }} /></div>
          <div className="check-row"><span className="ic">1</span><span><strong>Use the reserve:</strong> {money(reserve)} available {reserve >= urgent ? '— covers it fully' : `— ${money(urgent - reserve)} short`}.</span><span /></div>
          {(() => { const bump = discActive.slice().sort((a, b) => s.get(a.id).fin.npv / Math.max(1, s.get(a.id).fin.totalCosts) - s.get(b.id).fin.npv / Math.max(1, s.get(b.id).fin.totalCosts)).find((p) => !['active', 'harvesting'].includes(p.state)); return bump ? <div className="check-row"><span className="ic">2</span><span><strong>Bump</strong> {bump.name} to the waiting list: frees {money(fyCost(bump))}; NPV forgone or deferred {money(s.get(bump.id).fin.npv)}.</span><span /></div> : null; })()}
          {discActive.filter((p) => ['active', 'definition'].includes(p.state)).slice(0, 3).map((p) => { const delayed = financials(p, ws, { delay: 6 }); return <div key={p.id} className="check-row"><span className="ic">3</span><span><strong>Stretch</strong> {p.name} by six months: benefit NPV falls by {money(s.get(p.id).fin.npv - delayed.npv)}.</span><span /></div>; })}
          <p className="mini">Reallocation from discretionary categories always needs a board decision (BR-15).</p>
        </Card>
        <Card title="Overruns in non-discretionary categories (PFM-08)" subtitle="Funded first from the category's own reserve">
          {!overruns.length ? <div className="empty-sm">No overruns forecast in {fyLabel(fy)}.</div> : overruns.map((f) => <div key={f.category.id}><div className="callout warn">{f.category.name} is forecast {money(-f.available)} over its allocation.</div>{discActive.map((p) => { const d = financials(p, ws, { delay: 6 }); return <div key={p.id} className="check-row"><span className="ic">⇢</span><span>Defer {p.name}: frees {money(fyCost(p))}; benefit streams fall by {money(s.get(p.id).fin.npv - d.npv)} in NPV.</span><span /></div>; })}</div>)}
        </Card>
      </div>

      <Card title="Scenarios (PFM-05)" subtitle="Compare on aggregate value, risk, alignment coverage, cost and constraint violations; promote one to the approved plan" pad={false}>
        <div className="table-wrap"><table className="table compact">
          <thead><tr><th>Compare</th><th>Scenario</th><th className="num">Programs</th><th className="num">NPV</th><th className="num">Mean risk</th><th className="num">Driver coverage</th><th className="num">{fyLabel(fy)} cost</th><th className="num">Violations</th><th /></tr></thead>
          <tbody>
            <tr style={{ background: '#f8fafc' }}><td /><td><strong>Working scenario</strong></td><td className="num">{ev.chosen.length}</td><td className="num">{money(ev.npv)}</td><td className="num">{ev.meanRisk === null ? '—' : Math.round(ev.meanRisk)}</td><td className="num">{pct(ev.coverage)}</td><td className="num">{money(ev.cost)}</td><td className="num">{ev.violations.length}</td><td /></tr>
            {ws.scenarios.map((sc) => { const e = evaluate(sc.selections); return (
              <tr key={sc.id}><td><input type="checkbox" checked={compare.includes(sc.id)} onChange={(x) => setCompare(x.target.checked ? [...compare, sc.id] : compare.filter((y) => y !== sc.id))} aria-label={`Compare ${sc.name}`} /></td><td>{sc.name} {sc.approved && <Pill tone="good">Approved plan</Pill>}<div className="mini">{fmtDate(sc.createdAt)}</div></td><td className="num">{e.chosen.length}</td><td className="num">{money(e.npv)}</td><td className="num">{e.meanRisk === null ? '—' : Math.round(e.meanRisk)}</td><td className="num">{pct(e.coverage)}</td><td className="num">{money(e.cost)}</td><td className="num">{e.violations.length}</td>
                <td className="actions"><button className="btn btn-sm" onClick={() => setWorking({ ...sc.selections })}>Load</button> {!sc.approved && <button className="btn btn-sm btn-navy" onClick={() => promote(sc)}>Promote</button>}</td></tr>
            ); })}
          </tbody>
        </table></div>
        {compare.length > 0 && <div className="card-body">{cands.filter((p) => new Set(compare.map((id) => ws.scenarios.find((x) => x.id === id).selections[p.id])).size > 1 || compare.some((id) => ws.scenarios.find((x) => x.id === id).selections[p.id] !== working[p.id])).map((p) => <div key={p.id} className="mini">{p.code} {p.name}: working {working[p.id]} · {compare.map((id) => { const sc = ws.scenarios.find((x) => x.id === id); return `${sc.name} ${sc.selections[p.id]}`; }).join(' · ')}</div>)}</div>}
      </Card>

      {why && (
        <Modal title="Record a “not selected” decision" onClose={() => setWhy(null)} footer={<><button className="btn" onClick={() => setWhy(null)}>Cancel</button><button className="btn btn-primary" disabled={!why.text.trim()} onClick={() => { setWorking({ ...working, [why.id]: 'not-selected' }); mutate('Not-selected rationale recorded', (d) => { d.programs.find((p) => p.id === why.id).selectionReason = why.text; }); setWhy(null); }}>Record</button></>}>
          <Guidance>“Not selected” decisions are recorded explicitly with their rationale (PFM-03).</Guidance>
          <Field label="Rationale"><TextArea value={why.text} onChange={(v) => setWhy({ ...why, text: v })} /></Field>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}
