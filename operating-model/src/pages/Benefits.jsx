import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { Card, PageHead, Stat, Tabs, useTab, Badge, Progress } from '../components/ui.jsx';
import DataGrid from '../components/DataGrid.jsx';
import { VBars, Bubble, Donut, C, PALETTE } from '../components/charts.jsx';
import { nextId } from '../lib/model.js';
import { yearLabels, portfolioModel, initiativeModel, fmtPayback, toDate, currentYearIndex, confidenceFactor, countsFinancially } from '../lib/finance.js';
import { sum } from '../lib/calc.js';
import { fmtMoney, fmtPct, fmtNum, num, isNum } from '../lib/format.js';

const m = (v) => fmtMoney(v, { compact: true });

function LinesEditor({ kind, lines, onChange, eng, labels }) {
  const [initF, setInitF] = useState('');
  const [view, setView] = useState('planned');
  const isCost = kind === 'cost';
  const L = eng.lists;
  const fields = isCost
    ? [['description', 'Cost item', 'text', 220], ['category', 'Capex / Opex', L['Cost category'], 90], ['costType', 'Cost type', L['Cost type'], 170], ['nature', 'One-off / recurring', L['Cost nature'], 110]]
    : [['description', 'Benefit', 'text', 220], ['type', 'Benefit type', L['Benefit type'], 170], ['class', 'Class', L['Benefit class'], 120], ['kpi', 'Measure / KPI', 'text', 160], ['baseline', 'Baseline', 'text', 80], ['target', 'Target', 'text', 80], ['unit', 'Unit', 'text', 80], ['owner', 'Owner', 'text', 140], ['confidence', 'Confidence %', 'num', 70], ['status', 'Status', L['Benefit status'], 110]];
  const idx = lines.map((l, i) => i).filter((i) => !initF || lines[i].initiativeId === initF);
  const upd = (i, patch) => onChange(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const setYear = (i, y, v) => {
    const a = [...(lines[i][view] || [])];
    while (a.length < labels.length) a.push('');
    a[y] = v === '' ? '' : Number(v);
    upd(i, { [view]: a });
  };
  const add = () => onChange([...lines, { id: nextId(lines, isCost ? 'CL' : 'BL', 3), initiativeId: initF || eng.initiatives[0]?.id || '', planned: [], actual: [], ...(isCost ? { category: 'Opex', nature: 'One-off' } : { class: 'Cashable', confidence: 80, status: 'Not started' }) }]);
  const colTotal = (y) => sum(idx.map((i) => lines[i][view]?.[y]));
  return (
    <div>
      <div className="filters" style={{ padding: '12px 14px 0' }}>
        <select value={initF} onChange={(e) => setInitF(e.target.value)}><option value="">All initiatives</option>{eng.initiatives.map((i) => <option key={i.id} value={i.id}>{i.id} {i.name}</option>)}</select>
        <div className="chips">{[['planned', 'Planned'], ['actual', 'Actual']].map(([k, l]) => <button key={k} className={`chip ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>{l} by year</button>)}</div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-primary" onClick={add} disabled={!eng.initiatives.length}>+ Add {isCost ? 'cost' : 'benefit'} line</button>
      </div>
      <div className="dg-wrap" style={{ marginTop: 12 }}>
        <table className="dg">
          <thead><tr><th className="sticky">ID</th><th>Initiative</th>{fields.map(([k, l]) => <th key={k}>{l}</th>)}{labels.map((y) => <th key={y} className={view === 'actual' ? 'target' : ''}>{view === 'actual' ? 'Actual' : 'Planned'} {y}</th>)}<th className="calc">Total</th><th /></tr></thead>
          <tbody>
            {idx.map((i) => {
              const l = lines[i];
              return (
                <tr key={l.id + i}>
                  <td className="sticky idcell">{l.id}</td>
                  <td style={{ minWidth: 130 }}><select value={l.initiativeId || ''} onChange={(e) => upd(i, { initiativeId: e.target.value })}><option value="" />{eng.initiatives.map((x) => <option key={x.id} value={x.id}>{x.id} {x.name}</option>)}</select></td>
                  {fields.map(([k, , t, w]) => (
                    <td key={k} style={{ minWidth: w }}>
                      {Array.isArray(t) ? <select value={l[k] || ''} onChange={(e) => upd(i, { [k]: e.target.value })}><option value="" />{t.map((o) => <option key={o}>{o}</option>)}</select>
                        : <input type={t === 'num' ? 'number' : 'text'} value={l[k] ?? ''} onChange={(e) => upd(i, { [k]: t === 'num' && e.target.value !== '' ? Number(e.target.value) : e.target.value })} />}
                    </td>
                  ))}
                  {labels.map((y, k) => <td key={y} style={{ minWidth: 100 }} className={view === 'actual' ? 'target' : ''}><input type="number" value={l[view]?.[k] ?? ''} onChange={(e) => setYear(i, k, e.target.value)} /></td>)}
                  <td className="calc">{m(sum(l[view] || []))}</td>
                  <td className="rowtools"><button className="icon-btn danger" onClick={() => window.confirm(`Delete ${l.id}?`) && onChange(lines.filter((_, k) => k !== i))}>✕</button></td>
                </tr>
              );
            })}
            {!idx.length && <tr><td colSpan={fields.length + labels.length + 4} className="empty">No lines yet.</td></tr>}
          </tbody>
          {idx.length > 0 && <tfoot><tr><td className="sticky">Total</td><td />{fields.map(([k]) => <td key={k} />)}{labels.map((y, k) => <td key={y} style={{ textAlign: 'right' }}>{m(colTotal(k))}</td>)}<td>{m(sum(labels.map((_, k) => colTotal(k))))}</td><td /></tr></tfoot>}
        </table>
      </div>
      <div className="dg-foot"><span>Amounts in {eng.settings.currency} per financial year. {isCost ? '' : 'Benefits are risk-adjusted by confidence when that setting is on; non-financial benefits are tracked but excluded from NPV.'}</span></div>
    </div>
  );
}

export default function Benefits() {
  const { eng, set } = useStore();
  const [tab, setTab] = useTab('summary');
  const s = eng.settings;
  const labels = yearLabels(s);
  const pm = portfolioModel(eng);
  const inits = eng.initiatives.map((i) => ({ ...i, model: initiativeModel(eng, i.id) }));
  const cy = currentYearIndex(s);
  const benTypes = [...new Set(eng.benefitLines.map((b) => b.type).filter(Boolean))];

  return (
    <div className="stack">
      <PageHead eyebrow="Step 6 · Business case" title="Benefits & costs"
        actions={<Link className="btn" to="/engagement?tab=settings">Business case settings</Link>}>
        Track the costs and benefits of each initiative or solution component by financial year ({labels[0]}–{labels[labels.length - 1]}), with NPV at {s.discountRate}%, ROI, benefit–cost ratio, payback and planned-versus-actual realisation.
      </PageHead>
      <div className="grid g-6">
        <Stat label="Total cost" value={m(pm.totalCost)} sub={`${m(sum(pm.oneOff))} one-off · ${m(sum(pm.recurring))} recurring`} accent />
        <Stat label="Total benefit" value={m(pm.totalBenefit)} sub={s.riskAdjustBenefits ? 'Risk-adjusted' : 'Unadjusted'} />
        <Stat label="NPV" value={m(pm.npv)} sub={`at ${s.discountRate}% discount rate`} />
        <Stat label="ROI" value={fmtPct(pm.roi)} sub={`BCR ${pm.bcr ? pm.bcr.toFixed(2) : '—'}`} />
        <Stat label="Payback" value={pm.payback === null ? '—' : `${pm.payback.toFixed(1)} yrs`} sub={fmtPayback(pm.payback, labels).replace(/^[\d.]+ years /, '')} />
        <Stat label="IRR" value={pm.irr === null ? '—' : fmtPct(pm.irr, 1)} sub={`${eng.initiatives.length} initiatives`} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'summary', label: 'Portfolio summary' }, { id: 'initiatives', label: 'Initiatives', count: eng.initiatives.length },
        { id: 'costs', label: 'Costs', count: eng.costLines.length }, { id: 'benefits', label: 'Benefits', count: eng.benefitLines.length }, { id: 'tracking', label: 'Realisation tracking' },
      ]} />

      {tab === 'summary' && (
        <>
          <Card title="Costs, benefits and cumulative net benefit by year">
            <VBars categories={labels} series={[{ name: 'One-off costs', color: C.orange, values: pm.oneOff.map((v) => -v) }, { name: 'Recurring costs', color: '#f5a67c', values: pm.recurring.map((v) => -v) }, { name: 'Cashable benefits', color: C.green, values: pm.cashable }, { name: 'Non-cashable benefits', color: '#8fd3b4', values: pm.nonCashable }]}
              stacked line={{ name: 'Cumulative net benefit', values: pm.cumulative, color: C.navy }} height={340} width={980} fmt={m} />
          </Card>
          <div className="grid g-21">
            <Card title="By initiative" pad={false}>
              <div className="table-wrap">
                <table className="table compact">
                  <thead><tr><th>Initiative</th><th>Status</th><th className="num">Cost</th><th className="num">Benefit</th><th className="num">NPV</th><th className="num">ROI</th><th className="num">Payback</th></tr></thead>
                  <tbody>{inits.map((i) => (
                    <tr key={i.id}><td><strong>{i.id}</strong> {i.name}<div className="xsmall muted">{i.type} · {i.owner}</div></td><td><Badge v={i.status} /></td>
                      <td className="num">{m(i.model.totalCost)}</td><td className="num">{m(i.model.totalBenefit)}</td><td className="num strong" style={{ color: i.model.npv < 0 ? C.red : undefined }}>{m(i.model.npv)}</td><td className="num">{fmtPct(i.model.roi)}</td><td className="num">{i.model.payback === null ? '—' : `${i.model.payback.toFixed(1)}y`}</td></tr>
                  ))}</tbody>
                  <tfoot><tr><td>Portfolio</td><td /><td className="num">{m(pm.totalCost)}</td><td className="num">{m(pm.totalBenefit)}</td><td className="num">{m(pm.npv)}</td><td className="num">{fmtPct(pm.roi)}</td><td className="num">{pm.payback === null ? '—' : `${pm.payback.toFixed(1)}y`}</td></tr></tfoot>
                </table>
              </div>
            </Card>
            <Card title="Benefit by type" subtitle="Planned, all years">
              <Donut items={benTypes.map((t, i) => ({ label: t, value: sum(eng.benefitLines.filter((b) => b.type === t && countsFinancially(b, s)).map((b) => sum(b.planned || []) * (s.riskAdjustBenefits ? confidenceFactor(b) : 1))), display: m(sum(eng.benefitLines.filter((b) => b.type === t && countsFinancially(b, s)).map((b) => sum(b.planned || []) * (s.riskAdjustBenefits ? confidenceFactor(b) : 1)))), color: PALETTE[i % PALETTE.length] })).filter((x) => x.value)} center={m(pm.totalBenefit)} sub="benefit" size={180} legendW={220} />
              <p className="small muted mt-8">{eng.benefitLines.filter((b) => b.class === 'Non-financial').length} non-financial benefits tracked separately.</p>
            </Card>
          </div>
          <Card title="Value for money" subtitle="Total cost (x) against total benefit (y), in $m; bubble size shows NPV">
            <Bubble points={inits.filter((i) => i.model.totalCost || i.model.totalBenefit).map((i, k) => ({ id: i.id, label: i.name, x: +(i.model.totalCost / 1e6).toFixed(2), y: +(i.model.totalBenefit / 1e6).toFixed(2), color: i.model.npv >= 0 ? C.green : C.red, r: 6 + Math.min(14, Math.sqrt(Math.abs(i.model.npv) / 2e5)) }))}
              xLabel="Total cost ($m)" yLabel="Total benefit ($m)" xMax={Math.max(1, Math.ceil(Math.max(...inits.map((i) => i.model.totalCost / 1e6), 0)))} yMax={Math.max(1, Math.ceil(Math.max(...inits.map((i) => i.model.totalBenefit / 1e6), 0)))} threshold={null} size={640} />
          </Card>
        </>
      )}

      {tab === 'initiatives' && (
        <Card pad={false} title="Initiatives & solution components" subtitle="Create initiatives here, from recommendations (→ Initiative) or from AI use cases">
          <DataGrid rows={eng.initiatives} onChange={(r) => set('initiatives', r)} idPrefix="I" idWidth={2} entity="initiative" titleKey="name" filters={['type', 'status']} newRow={() => ({ status: 'Proposed', type: 'Project' })}
            columns={[
              { key: 'name', label: 'Initiative / solution component', width: 240 },
              { key: 'type', label: 'Type', type: 'select', options: eng.lists['Initiative type'], width: 150 },
              { key: 'dims', label: 'Dimensions', width: 110 },
              { key: 'recs', label: 'Linked recommendations', width: 130 },
              { key: 'description', label: 'Description', type: 'long', width: 280 },
              { key: 'owner', label: 'Owner', width: 150 },
              { key: 'start', label: 'Start', type: 'date', width: 130 },
              { key: 'end', label: 'End', type: 'date', width: 130 },
              { key: 'status', label: 'Status', type: 'select', options: eng.lists['Initiative status'], width: 110 },
              { key: 'rag', label: 'RAG', type: 'select', options: eng.lists.RAG, width: 80 },
              { key: 'tc', label: 'Total cost', calc: (i) => initiativeModel(eng, i.id).totalCost, type: 'money', width: 100, total: 'sum' },
              { key: 'tb', label: 'Total benefit', calc: (i) => initiativeModel(eng, i.id).totalBenefit, type: 'money', width: 100, total: 'sum' },
              { key: 'npv', label: 'NPV', calc: (i) => initiativeModel(eng, i.id).npv, type: 'money', width: 100, total: 'sum' },
            ]} />
        </Card>
      )}
      {tab === 'costs' && <Card pad={false} title="Cost lines"><LinesEditor kind="cost" lines={eng.costLines} onChange={(r) => set('costLines', r)} eng={eng} labels={labels} /></Card>}
      {tab === 'benefits' && <Card pad={false} title="Benefit lines"><LinesEditor kind="benefit" lines={eng.benefitLines} onChange={(r) => set('benefitLines', r)} eng={eng} labels={labels} /></Card>}

      {tab === 'tracking' && (
        <>
          <div className="callout small">Realisation to date covers {labels[0]} to {labels[cy]} (the current financial year). Enter actuals on the Costs and Benefits tabs using the “Actual by year” view.</div>
          <div className="grid g-2">
            <Card title="Costs: planned vs actual to date">
              <VBars categories={labels.slice(0, cy + 1)} series={[{ name: 'Planned', color: '#f5a67c', values: pm.cost.slice(0, cy + 1) }, { name: 'Actual', color: C.orange, values: pm.costActual.slice(0, cy + 1) }]} height={240} width={560} fmt={m} />
            </Card>
            <Card title="Benefits: planned vs actual to date">
              <VBars categories={labels.slice(0, cy + 1)} series={[{ name: 'Planned (unadjusted)', color: '#8fd3b4', values: pm.benefitGross.slice(0, cy + 1) }, { name: 'Actual', color: C.green, values: pm.benefitActual.slice(0, cy + 1) }]} height={240} width={560} fmt={m} />
            </Card>
          </div>
          <Card title="Benefits register — realisation" pad={false}>
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>ID</th><th>Benefit</th><th>Measure: baseline → target</th><th>Owner</th><th className="num">Planned to date</th><th className="num">Actual to date</th><th style={{ width: 140 }}>Realised</th><th>Status</th></tr></thead>
                <tbody>{eng.benefitLines.map((b) => {
                  const t = toDate(b, cy);
                  return (
                    <tr key={b.id}>
                      <td>{b.id}<div className="xsmall muted">{b.initiativeId}</div></td>
                      <td>{b.description}<div className="xsmall muted">{b.type} · {b.class}</div></td>
                      <td className="small">{b.kpi}{(isNum(b.baseline) || b.baseline) ? `: ${b.baseline} → ${b.target} ${b.unit || ''}` : ''}</td>
                      <td className="small">{b.owner}</td>
                      <td className="num">{b.class === 'Non-financial' ? '—' : m(t.planned)}</td>
                      <td className="num">{b.class === 'Non-financial' ? '—' : m(t.actual)}</td>
                      <td>{t.pct !== null && b.class !== 'Non-financial' ? <><Progress value={t.pct} color={t.pct >= 0.9 ? C.ok : t.pct >= 0.6 ? C.amber : C.red} /><span className="xsmall">{fmtPct(t.pct)}</span></> : ''}</td>
                      <td><select value={b.status || ''} onChange={(e) => set('benefitLines', eng.benefitLines.map((x) => (x.id === b.id ? { ...x, status: e.target.value } : x)))}><option value="" />{eng.lists['Benefit status'].map((o) => <option key={o}>{o}</option>)}</select></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
