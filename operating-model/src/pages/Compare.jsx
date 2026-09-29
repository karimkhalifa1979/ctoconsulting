import { Link } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { Card, PageHead, Tabs, useTab, CompareStat, Badge, mClass, RagDot } from '../components/ui.jsx';
import { Dumbbell, VBars, Waterfall, RiskMatrix, HBar, Donut, C, PALETTE, SEV_COLORS } from '../components/charts.jsx';
import { compareModel } from '../lib/compare.js';
import { CANVAS_ELEMENTS, CHANGE_AREAS, ADKAR, RISK_MATRIX_LABELS } from '../data/tomLibrary.js';
import { fmtPayback } from '../lib/finance.js';
import { sum } from '../lib/calc.js';
import { fmtMoney, fmtNum, fmtScore, fmtPct, num } from '../lib/format.js';

const m = (v) => fmtMoney(v, { compact: true });
export const fmtMetric = (v, type) => (v === null || v === undefined ? '—' : type === 'money' ? m(v) : type === 'score' ? fmtScore(v) : type === 'dec' ? fmtNum(v, 1) : fmtNum(v));
const HEAT = ['#f3f5f8', '#fdf0cc', '#fbd9b8', '#f2a67a'];

export default function Compare() {
  const { eng } = useStore();
  const [tab, setTab] = useTab('overview');
  const c = compareModel(eng);
  const pm = c.pm;
  const benTypes = [...new Set(eng.benefitLines.map((b) => b.type).filter(Boolean))];

  return (
    <div className="stack">
      <PageHead eyebrow="Step 7 · Compare" title="Current vs target operating model" actions={<Link className="btn btn-primary" to="/report">Include in PDF report</Link>}>
        Side-by-side comparison of the current and target operating models: maturity and key shifts, costs, benefits, risks, implementation requirements and change management requirements.
      </PageHead>
      <div className="grid g-4">
        {c.metrics.filter((x) => ['maturity', 'cost', 'fte', 'span', 'apps', 'suppliers', 'sites', 'ai'].includes(x.key)).map((x) => (
          <CompareStat key={x.key} label={x.label} from={fmtMetric(x.cur, x.type)} to={fmtMetric(x.tgt, x.type)} fromRaw={x.cur} toRaw={x.tgt} better={x.better}
            fmtDelta={x.type === 'money' ? (d, f) => `${m(d)}${f ? ` (${((d / f) * 100).toFixed(1)}%)` : ''}` : undefined} />
        ))}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Operating model' }, { id: 'costs', label: 'Costs' }, { id: 'benefits', label: 'Benefits' }, { id: 'risks', label: 'Risks' },
        { id: 'implementation', label: 'Implementation requirements' }, { id: 'change', label: 'Change management' },
      ]} />

      {tab === 'overview' && (
        <>
          <div className="grid g-2">
            <Card title="Maturity by dimension" subtitle="Current (orange) → target (teal)"><Dumbbell items={c.dims.map((d) => ({ label: `${d.code} ${d.short}`, from: d.current, to: d.designTarget }))} width={620} /></Card>
            <Card title="Key measures" pad={false}>
              <table className="table compact">
                <thead><tr><th>Measure</th><th className="num">Current</th><th className="num">Target</th><th className="num">Change</th></tr></thead>
                <tbody>{c.metrics.map((x) => {
                  const d = num(x.cur) !== null && num(x.tgt) !== null ? x.tgt - x.cur : null;
                  const good = d !== null && d !== 0 && ((x.better === 'higher') === d > 0);
                  return <tr key={x.key}><td>{x.label}</td><td className="num">{fmtMetric(x.cur, x.type)}</td><td className="num strong">{fmtMetric(x.tgt, x.type)}</td><td className="num" style={{ color: d ? (good ? C.ok : C.red) : undefined }}>{d === null ? '—' : `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtMetric(Math.abs(d), x.type)}`}</td></tr>;
                })}</tbody>
              </table>
            </Card>
          </div>
          <Card title="Current state → target state by dimension" pad={false}>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th style={{ width: 170 }}>Dimension</th><th className="num">Now</th><th>Current state</th><th>Target state</th><th className="num">Target</th><th>Key shifts</th></tr></thead>
                <tbody>{c.dims.map((d) => {
                  const t = eng.tom.dimensions[d.code] || {};
                  return (
                    <tr key={d.code}>
                      <td><strong>{d.code}</strong> {d.name}<div className="mt-8"><RagDot rag={d.rag} /> <span className="xsmall muted">{d.findings} findings</span></div></td>
                      <td className="num"><span className={`badge ${mClass(d.current)}`}>{fmtScore(d.current)}</span></td>
                      <td className="small">{t.currentSummary || <span className="muted">—</span>}</td>
                      <td className="small">{t.targetDescription || <span className="muted">Not yet described — <Link to="/tom?tab=target">TOM designer</Link></span>}</td>
                      <td className="num"><span className={`badge ${mClass(d.designTarget)}`}>{fmtScore(d.designTarget)}</span></td>
                      <td className="small" style={{ whiteSpace: 'pre-wrap' }}>{t.shifts}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </Card>
          <Card title="Operating Model Canvas: current → target" pad={false}>
            <table className="table">
              <thead><tr><th style={{ width: 180 }}>Element</th><th>Current</th><th>Target</th><th>Key shifts</th></tr></thead>
              <tbody>{CANVAS_ELEMENTS.map((el) => { const v = eng.tom.canvas[el.id] || {}; return <tr key={el.id}><td className="strong">{el.name}</td><td className="small">{v.current}</td><td className="small">{v.target}</td><td className="small">{v.shifts}</td></tr>; })}</tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'costs' && (
        <>
          <div className="grid g-4">
            <CompareStat label="Annual run cost" from={m(c.costC.total)} to={m(c.costT.total)} fromRaw={c.costC.total} toRaw={c.costT.total} better="lower" fmtDelta={(d) => m(d)} />
            <CompareStat label="Cost per FTE" from={fmtMoney(c.costC.perFte)} to={fmtMoney(c.costT.perFte)} fromRaw={c.costC.perFte} toRaw={c.costT.perFte} better="lower" fmtDelta={(d) => fmtMoney(d)} />
            <CompareStat label="One-off investment" from="—" to={m(c.investment)} sub={`${c.labels[0]}–${c.labels[c.labels.length - 1]}`} />
            <CompareStat label="Recurring cost of change" from="—" to={m(sum(pm.recurring))} sub="New recurring costs over the horizon" />
          </div>
          <div className="grid g-2">
            <Card title="Run cost bridge: current → target">
              <Waterfall steps={[{ label: 'Current', value: c.costC.total, total: true }, ...c.costByType.map((t) => ({ label: t.label, value: t.tgt - t.cur })).filter((s) => s.value), { label: 'Target', value: c.costT.total, total: true }]} fmt={m} width={620} />
            </Card>
            <Card title="Run cost by business unit"><VBars categories={c.costByUnit.map((u) => u.unit)} series={[{ name: 'Current', color: C.orange, values: c.costByUnit.map((u) => u.cur) }, { name: 'Target', color: C.teal, values: c.costByUnit.map((u) => u.tgt) }]} height={300} width={620} fmt={m} /></Card>
          </div>
          <Card title="Investment profile (initiatives)"><VBars categories={c.labels} series={[{ name: 'Capex', color: C.navy3, values: pm.capex }, { name: 'Opex', color: C.orange, values: pm.opex }]} stacked height={260} width={900} fmt={m} /></Card>
        </>
      )}

      {tab === 'benefits' && (
        <>
          <div className="grid g-5">
            <CompareStat label="Total benefit" from="—" to={m(pm.totalBenefit)} sub={eng.settings.riskAdjustBenefits ? 'Risk-adjusted' : 'Unadjusted'} />
            <CompareStat label="NPV" from="—" to={m(pm.npv)} sub={`${eng.settings.discountRate}% discount rate`} />
            <CompareStat label="ROI" from="—" to={fmtPct(pm.roi)} sub={`BCR ${pm.bcr ? pm.bcr.toFixed(2) : '—'}`} />
            <CompareStat label="Payback" from="—" to={pm.payback === null ? '—' : `${pm.payback.toFixed(1)} yrs`} sub={fmtPayback(pm.payback, c.labels)} />
            <CompareStat label="Annual benefit at steady state" from="—" to={m(pm.benefit[pm.benefit.length - 1])} sub={c.labels[c.labels.length - 1]} />
          </div>
          <div className="grid g-2">
            <Card title="Benefits and costs by year"><VBars categories={c.labels} series={[{ name: 'Costs', color: C.orange, values: pm.cost.map((v) => -v) }, { name: 'Benefits', color: C.green, values: pm.benefit }]} line={{ name: 'Cumulative net', values: pm.cumulative, color: C.navy }} height={300} width={620} fmt={m} /></Card>
            <Card title="Benefits by type">
              <Donut items={benTypes.map((t, i) => ({ label: t, value: sum(eng.benefitLines.filter((b) => b.type === t && b.class !== 'Non-financial').map((b) => sum(b.planned || []))), color: PALETTE[i % PALETTE.length] })).filter((x) => x.value).map((x) => ({ ...x, display: m(x.value) }))} center={m(pm.benefitGross.reduce((a, b) => a + b, 0))} sub="planned (gross)" size={180} legendW={230} />
            </Card>
          </div>
          <Card title="Measures: baseline → target" subtitle="Financial and non-financial benefit measures" pad={false}>
            <table className="table compact">
              <thead><tr><th>Benefit</th><th>Type</th><th>Measure</th><th className="num">Current (baseline)</th><th className="num">Target</th><th>Owner</th><th>Status</th></tr></thead>
              <tbody>{eng.benefitLines.filter((b) => b.kpi).map((b) => <tr key={b.id}><td>{b.description}</td><td className="small">{b.type}</td><td className="small">{b.kpi}</td><td className="num">{b.baseline === '' ? '—' : `${num(b.baseline) !== null ? fmtNum(b.baseline, num(b.baseline) % 1 ? 1 : 0) : b.baseline} ${b.unit || ''}`}</td><td className="num strong">{b.target === '' ? '—' : `${num(b.target) !== null ? fmtNum(b.target, num(b.target) % 1 ? 1 : 0) : b.target} ${b.unit || ''}`}</td><td className="small">{b.owner}</td><td><Badge v={b.status} /></td></tr>)}</tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'risks' && (
        <>
          <div className="grid g-3">
            <Card title="Current-state risk exposure" subtitle="Open findings by severity and current-state risk indicators">
              <HBar items={['Critical', 'High', 'Medium', 'Low'].map((s) => ({ label: `${s} findings`, value: c.sevCount[s] || 0, color: SEV_COLORS[s] }))} width={380} labelW={130} />
              <dl className="kv mt-8 small">
                <dt>High supplier dependency</dt><dd>{c.inv.suppliers.dependency.High || 0}</dd>
                <dt>End-of-life applications</dt><dd>{c.inv.apps.eol}</dd>
                <dt>Decisions with RAPID issues</dt><dd>{c.inv.decisions.issues}</dd>
                <dt>Units over max layers</dt><dd>{c.inv.org.layerIssues}</dd>
              </dl>
            </Card>
            <Card title="Transition & target risks — inherent"><RiskMatrix risks={c.risks.map((r) => ({ id: r.id, l: num(r.likelihood), i: num(r.impact) }))} likelihoodLabels={RISK_MATRIX_LABELS.likelihood} impactLabels={RISK_MATRIX_LABELS.impact} size={320} /></Card>
            <Card title="Transition & target risks — residual"><RiskMatrix risks={c.risks.map((r) => ({ id: r.id, l: num(r.residualLikelihood), i: num(r.residualImpact) }))} likelihoodLabels={RISK_MATRIX_LABELS.likelihood} impactLabels={RISK_MATRIX_LABELS.impact} size={320} /></Card>
          </div>
          <Card title="Top risks" pad={false} actions={<Link className="btn btn-xs" to="/transition?tab=risks">Risk register</Link>}>
            <table className="table compact">
              <thead><tr><th>ID</th><th>Risk</th><th>Stage</th><th className="num">Inherent</th><th>Mitigation</th><th className="num">Residual</th><th>Owner</th></tr></thead>
              <tbody>{[...c.risks].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10).map((r) => <tr key={r.id}><td>{r.id}</td><td>{r.title}<div className="xsmall muted">{r.category}</div></td><td className="small">{r.stage}</td><td className="num strong">{r.score ?? '—'}</td><td className="small">{r.mitigation}</td><td className="num">{r.rscore ?? '—'}</td><td className="small">{r.owner}</td></tr>)}</tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'implementation' && (
        <>
          <div className="grid g-2">
            <Card title="Requirements by category"><HBar items={eng.lists['Requirement category'].map((k, i) => ({ label: k, value: c.reqByCategory[k] || 0, color: PALETTE[i % PALETTE.length] }))} width={560} labelW={200} /></Card>
            <Card title="Requirements by horizon"><VBars categories={eng.lists.Horizon} series={eng.lists['Requirement priority'].map((p, i) => ({ name: p, color: [C.red, C.amber, C.grey][i], values: eng.lists.Horizon.map((h) => c.requirements.filter((r) => r.horizon === h && r.priority === p).length) }))} stacked height={260} width={560} /></Card>
          </div>
          <Card title="What must be in place" subtitle="Implementation requirements grouped by category, with enablers from the target state design" pad={false}>
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>Category</th><th>Requirement</th><th>Initiative</th><th>Priority</th><th>Horizon</th><th>Owner</th><th>Status</th></tr></thead>
                <tbody>{[...c.requirements].sort((a, b) => String(a.category).localeCompare(b.category)).map((r) => <tr key={r.id}><td className="small strong">{r.category}</td><td className="small">{r.requirement}</td><td className="small">{r.initiative}</td><td><Badge v={r.priority} /></td><td className="small nowrap">{r.horizon}</td><td className="small">{r.owner}</td><td><Badge v={r.status} /></td></tr>)}</tbody>
              </table>
            </div>
          </Card>
          <Card title="Enablers & dependencies from the target state design" pad={false}>
            <table className="table compact"><tbody>{c.dims.filter((d) => eng.tom.dimensions[d.code]?.enablers).map((d) => <tr key={d.code}><td className="strong" style={{ width: 220 }}>{d.code} {d.name}</td><td className="small">{eng.tom.dimensions[d.code].enablers}</td></tr>)}</tbody></table>
          </Card>
        </>
      )}

      {tab === 'change' && (
        <>
          <Card title="Change impact by stakeholder group" pad={false}>
            <div className="table-wrap">
              <table className="table compact heat">
                <thead><tr><th>Group</th><th className="num">People</th>{CHANGE_AREAS.map((a) => <th key={a.id} className="center">{a.name}</th>)}<th className="num">Impact</th><th className="num">Readiness</th><th>Barrier</th><th>Interventions</th></tr></thead>
                <tbody>{c.changeGroups.map((g) => (
                  <tr key={g.id}>
                    <td className="strong">{g.group}</td><td className="num">{Number(g.headcount || 0).toLocaleString()}</td>
                    {CHANGE_AREAS.map((a) => <td key={a.id} className="cell" style={{ background: HEAT[num(g[a.id]) || 0] }}>{['–', 'L', 'M', 'H'][num(g[a.id]) || 0]}</td>)}
                    <td className="num strong">{g.impact}</td><td className="num">{fmtScore(g.adkar)}</td>
                    <td>{g.barrier ? <Badge v="At risk">{g.barrier.name}</Badge> : <Badge v="On track">Ready</Badge>}</td>
                    <td className="xsmall">{g.barrier?.interventions || ''}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
          <div className="grid g-2">
            <Card title="Impact vs readiness" subtitle="Groups with high impact and low readiness need the most support">
              <HBar items={[...c.changeGroups].sort((a, b) => b.impact - a.impact).map((g) => ({ label: g.group, value: g.impact, marker: (g.adkar || 0) * 24 / 5, color: g.impact >= 12 ? C.orange : C.gold }))} max={24} marker="Readiness (scaled to 24)" width={600} labelW={240} />
            </Card>
            <Card title="Change activities" pad={false} actions={<Link className="btn btn-xs" to="/transition?tab=activities">Change plan</Link>}>
              <table className="table compact"><tbody>{eng.changeActivities.map((a) => <tr key={a.id}><td className="small">{a.activity}<div className="xsmall muted">{a.type} · {a.audience}</div></td><td className="small nowrap">{a.timing}</td><td><Badge v={a.status} /></td></tr>)}</tbody></table>
            </Card>
          </div>
          <Card title="ADKAR model">
            <div className="grid g-5">{ADKAR.map((a) => <div key={a.id}><strong className="small">{a.name}</strong><div className="xsmall muted">{a.of}</div><div className="xsmall mt-8">{a.interventions}</div></div>)}</div>
          </Card>
        </>
      )}
    </div>
  );
}
