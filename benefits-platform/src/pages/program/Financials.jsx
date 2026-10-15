import { useMemo } from 'react';
import { useApp } from '../../lib/store.jsx';
import { BTOPP, COST_TYPES } from '../../lib/config.js';
import { financials, sensitivity, pathScope } from '../../lib/finance.js';
import { Card, ChartCard, Field, NumberInput, Select, Pill, Guidance, Stat } from '../../components/ui.jsx';
import { CashflowChart, Tornado } from '../../components/charts.jsx';
import { money, moneyFull, pct, ratio, months, todayISO, uid, fmtDate } from '../../lib/util.js';
import { exportXlsx } from '../../lib/exporters.js';

export default function Financials({ program: p }) {
  const { ws, updateProgram, patchProgram } = useApp();
  const f = useMemo(() => financials(p, ws), [p, ws]);
  const sens = useMemo(() => sensitivity(p, ws), [p, ws]);
  const scope = pathScope(p);
  const add = () => updateProgram(p.id, (x) => { x.costs.push({ id: uid('cost'), name: 'New cost line', type: 'capital', btopp: 'T', start: todayISO().slice(0, 7) + '-01', months: 12, amount: 0, basis: 'once', uncertainty: { low: -0.05, high: 0.3 } }); }, 'Added cost line', { action: 'create', object: 'cost' });
  const upd = (i, k, v) => updateProgram(p.id, (x) => { x.costs[i][k] = v; }, `Cost line “${p.costs[i].name}”: ${k}`, { object: 'cost', objectId: p.costs[i].id, field: `${p.costs[i].id}:${k}`, before: p.costs[i][k], after: v });
  const sensRows = sens.rows.map((r) => ({ id: r.label, label: r.label, low: Math.min(r.npv, sens.base.npv), high: Math.max(r.npv, sens.base.npv), swing: Math.abs(r.delta) })).sort((a, b) => b.swing - a.swing);

  const exportModel = () => exportXlsx([
    { name: 'Annual cash flow', columns: [{ label: 'Financial year', get: (y) => y.label }, { label: 'Benefits', get: (y) => Math.round(y.benefits) }, { label: 'Cash-releasing', get: (y) => Math.round(y.cash) }, { label: 'Non-cash', get: (y) => Math.round(y.noncash) }, { label: 'Costs', get: (y) => Math.round(y.costs) }, ...COST_TYPES.map((t) => ({ label: t.label, get: (y) => Math.round(y.byType[t.id] || 0) })), { label: 'Net', get: (y) => Math.round(y.net) }, { label: 'Cumulative', get: (y) => Math.round(y.cum) }], rows: f.annual },
    { name: 'Cost lines', columns: [{ label: 'Cost line', get: (c) => c.name }, { label: 'Type', get: (c) => c.type }, { label: 'BTOPP', get: (c) => c.btopp }, { label: 'Basis', get: (c) => c.basis }, { label: 'Start', get: (c) => c.start }, { label: 'Months', get: (c) => c.months }, { label: 'Amount', get: (c) => c.amount }], rows: p.costs },
    { name: 'Summary', columns: [{ label: 'Measure', get: (r) => r[0] }, { label: 'Value', get: (r) => r[1] }], rows: [['NPV', Math.round(f.npv)], ['Discount rate', f.r], ['PV benefits', Math.round(f.pvBenefits)], ['PV costs', Math.round(f.pvCosts)], ['BCR', f.bcr], ['ROI (undiscounted)', f.roi], ['IRR', f.irr ?? 'n/a'], ['Payback (months)', f.paybackMonths ?? 'not within horizon']] },
  ], `${p.code}_financial_model.xlsx`);

  return (
    <div className="stack">
      <div className="kpi-grid">
        <Stat label="Net present value" value={money(f.npv)} sub={`at ${pct(f.r, 1)} discount rate`} accent />
        <Stat label="PV benefits / PV costs" value={`${money(f.pvBenefits)} / ${money(f.pvCosts)}`} sub={`Benefit–cost ratio ${ratio(f.bcr)}`} />
        <Stat label="Internal rate of return" value={f.irr === null ? 'n/a' : pct(f.irr, 1)} sub="on annual net flows" />
        <Stat label="Payback" value={months(f.paybackMonths)} sub="undiscounted" />
        <Stat label="ROI (undiscounted)" value={pct(f.roi)} sub={`${money(f.totalBenefits)} benefits ÷ ${money(f.totalCosts)} costs − 1`} />
        <Stat label="Cash-releasing (PV)" value={money(f.pvCash)} sub={`Non-cash-releasing ${money(f.pvNonCash)}`} />
      </div>
      {scope.path && <Guidance title={`Selected path: ${scope.path.name}.`}>Benefits and costs that belong only to other, mutually exclusive paths are left out ({scope.outBenefits.size} benefits, {scope.outCosts.size} cost lines). Compare paths on the Benefits map → Paths panel.</Guidance>}

      <ChartCard title="Lifecycle cash flow by financial year" subtitle="Benefits after attribution; costs across the full lifecycle (VAL-03)" table={{ columns: [{ label: 'Year', get: (y) => y.label }, { label: 'Benefits', num: true, get: (y) => money(y.benefits) }, { label: 'Costs', num: true, get: (y) => money(y.costs) }, { label: 'Net', num: true, get: (y) => money(y.net) }, { label: 'Cumulative', num: true, get: (y) => money(y.cum) }], rows: f.annual }} actions={<button className="btn btn-sm dl" onClick={exportModel}>Excel</button>}>
        <CashflowChart annual={f.annual} />
      </ChartCard>

      <Card title="Full lifecycle cost lines" subtitle="Capital, operating, organisation/process/people change, sustaining and decommissioning (VAL-03, MEA-08)" pad={false} actions={<>
        <span className="mini">Discount rate</span>
        <NumberInput value={p.discountRate ?? ''} placeholder={String(ws.settings.discountRate)} onChange={(v) => patchProgram(p.id, { discountRate: v === '' ? undefined : v }, 'Program discount rate')} step={0.005} style={{ width: 80 }} aria-label="Discount rate override" />
        <button className="btn btn-sm btn-primary" onClick={add}>+ Cost line</button>
      </>}>
        <div className="table-wrap"><table className="table compact">
          <thead><tr><th>Cost line</th><th>Type</th><th>BTOPP</th><th>Basis</th><th>Start</th><th className="num">Months</th><th className="num">Amount</th><th className="num">Range (−/+)</th><th>Path</th><th className="num">Lifetime total</th><th /></tr></thead>
          <tbody>{p.costs.map((c, i) => {
            const line = f.costLines.find((l) => l.id === c.id);
            const total = line ? line.series.reduce((a, b) => a + b, 0) : 0;
            return (
              <tr key={c.id} style={scope.outCosts.has(c.id) ? { opacity: 0.55 } : undefined}>
                <td><input className="inline-input" value={c.name} onChange={(e) => upd(i, 'name', e.target.value)} aria-label="Cost line" style={{ minWidth: 180 }} /></td>
                <td><Select value={c.type} onChange={(v) => upd(i, 'type', v)} options={COST_TYPES.map((t) => [t.id, t.label])} /></td>
                <td><Select value={c.btopp} onChange={(v) => upd(i, 'btopp', v)} options={BTOPP.map((b) => [b.id, b.id])} /></td>
                <td><Select value={c.basis} onChange={(v) => upd(i, 'basis', v)} options={[['once', 'One-off'], ['annual', 'Per year']]} /></td>
                <td><input type="month" value={(c.start || '').slice(0, 7)} onChange={(e) => upd(i, 'start', `${e.target.value}-01`)} aria-label="Start month" /></td>
                <td><NumberInput value={c.months} onChange={(v) => upd(i, 'months', v)} style={{ width: 64 }} title={c.basis === 'annual' ? 'Duration (blank = to horizon)' : 'Spread over months'} /></td>
                <td><NumberInput value={c.amount} onChange={(v) => upd(i, 'amount', v)} style={{ width: 110 }} /></td>
                <td className="nowrap"><NumberInput value={c.uncertainty?.low} onChange={(v) => upd(i, 'uncertainty', { ...(c.uncertainty || {}), low: v })} step={0.05} style={{ width: 62 }} aria-label="Downside" /> <NumberInput value={c.uncertainty?.high} onChange={(v) => upd(i, 'uncertainty', { ...(c.uncertainty || {}), high: v })} step={0.05} style={{ width: 62 }} aria-label="Upside" /></td>
                <td><Select value={c.pathId} onChange={(v) => upd(i, 'pathId', v || undefined)} placeholder="All" options={p.chain.paths.map((x) => [x.id, x.name.split('—')[0].trim()])} /></td>
                <td className="num">{scope.outCosts.has(c.id) ? <span className="mini">other path</span> : money(total)}</td>
                <td><button className="btn btn-ghost btn-sm" aria-label="Delete cost line" onClick={() => updateProgram(p.id, (x) => { x.costs.splice(i, 1); }, `Deleted cost line ${c.name}`, { action: 'delete' })}>✕</button></td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <div className="card-body mini">Totals by type: {COST_TYPES.map((t) => `${t.label} ${money(f.costByType[t.id] || 0)}`).join(' · ')}. Inputs (cost) are tracked separately from outputs and outcomes. Range values are relative (−0.1 = 10% under, 0.3 = 30% over) and drive the simulation.</div>
      </Card>

      <div className="grid g-2">
        <ChartCard title="Sensitivity analysis (VAL-12)" subtitle="NPV if benefits fall, arrive late, costs rise or assumptions fail" table={{ columns: [{ label: 'Scenario', get: (r) => r.label }, { label: 'NPV', num: true, get: (r) => money(r.npv) }, { label: 'Change', num: true, get: (r) => money(r.delta) }, { label: 'BCR', num: true, get: (r) => ratio(r.bcr) }], rows: sens.rows }}>
          <Tornado rows={sensRows} base={sens.base.npv} />
        </ChartCard>
        <Card title="Annual detail" pad={false}>
          <div className="table-wrap" style={{ maxHeight: 420 }}><table className="table compact">
            <thead><tr><th>Year</th><th className="num">Cash-releasing</th><th className="num">Non-cash</th><th className="num">Costs</th><th className="num">Net</th><th className="num">Cumulative</th></tr></thead>
            <tbody>{f.annual.map((y) => <tr key={y.fy}><td>{y.label}</td><td className="num">{money(y.cash)}</td><td className="num">{money(y.noncash)}</td><td className="num">{money(y.costs)}</td><td className={`num ${y.net < 0 ? 'neg' : ''}`}>{money(y.net)}</td><td className={`num ${y.cum < 0 ? 'neg' : ''}`}>{money(y.cum)}</td></tr>)}</tbody>
            <tfoot><tr><th>Total</th><th className="num">{money(f.annual.reduce((a, y) => a + y.cash, 0))}</th><th className="num">{money(f.annual.reduce((a, y) => a + y.noncash, 0))}</th><th className="num">{money(f.totalCosts)}</th><th className="num">{money(f.totalBenefits - f.totalCosts)}</th><th /></tr></tfoot>
          </table></div>
          <div className="card-body mini">Model starts {fmtDate(f.startISO)} for {f.H / 12} years; end-of-period monthly discounting. Values rounded to the nearest thousand in documents ({moneyFull(f.npv)}). ROI is undiscounted and labelled as such.</div>
        </Card>
      </div>
      <Tolerances p={p} />
    </div>
  );
}

function Tolerances({ p }) {
  const { updateProgram } = useApp();
  const t = p.tolerances || {};
  const set = (k) => (v) => updateProgram(p.id, (x) => { x.tolerances = { ...(x.tolerances || {}), [k]: v }; }, `Tolerance ${k}`, { field: `tol:${k}` });
  return (
    <Card title="Program tolerances (GOV-13)" subtitle="Exceeding a tolerance raises an exception to the decision authority">
      <div className="form-grid-3" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <Field label="Cost (share over budget)"><NumberInput value={t.cost} onChange={set('cost')} step={0.05} /></Field>
        <Field label="Time (months late)"><NumberInput value={t.time} onChange={set('time')} /></Field>
        <Field label="Benefits (share under forecast)"><NumberInput value={t.benefits} onChange={set('benefits')} step={0.05} /></Field>
        <Field label="Risk (overall score)"><NumberInput value={t.risk} onChange={set('risk')} /></Field>
      </div>
      <div style={{ marginTop: 8 }}><Pill tone="none" icon="i">Tolerances feed the project variance checks and VMO exception list.</Pill></div>
    </Card>
  );
}
