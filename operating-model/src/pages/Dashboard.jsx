import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { Card, PageHead, Stat, Badge, StackBar, mClass, RagDot, Progress } from '../components/ui.jsx';
import { Radar, HBar, VBars, Donut, Gauge, C, SEV_COLORS, RAG_FILL, PALETTE } from '../components/charts.jsx';
import { dimensionStats, overallStats, inventorySummary, recProfile, CATEGORIES, maturityName, COST_TYPES, sum } from '../lib/calc.js';
import { aiOverall } from '../lib/aiCalc.js';
import { CANVAS_ELEMENTS } from '../data/tomLibrary.js';
import { executiveSummary } from '../lib/narrative.js';
import { fmtScore, fmtMoney, fmtPct, fmtNum } from '../lib/format.js';
import { engagementTitle } from '../lib/model.js';

export default function Dashboard() {
  const { eng } = useStore();
  const nav = useNavigate();
  const dims = dimensionStats(eng);
  const o = overallStats(eng);
  const inv = inventorySummary(eng);
  const ai = aiOverall(eng);
  const prof = recProfile(eng);
  const scored = dims.filter((d) => d.current !== null);
  const strengths = [...scored].sort((a, b) => b.current - a.current).slice(0, 3);
  const gaps = [...scored].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).slice(0, 5);
  const summary = executiveSummary(eng);
  const canvas = CANVAS_ELEMENTS.map((c) => {
    const ds = dims.filter((d) => c.dims.includes(d.code) && d.current !== null);
    const cur = ds.length ? ds.reduce((s, d) => s + d.current, 0) / ds.length : null;
    const gap = ds.length ? ds.reduce((s, d) => s + (d.gap || 0), 0) / ds.length : null;
    const rag = gap === null ? '' : gap >= eng.settings.ragRed ? 'Red' : gap >= eng.settings.ragAmber ? 'Amber' : 'Green';
    return { ...c, cur, gap, rag };
  });

  return (
    <div className="stack">
      <PageHead eyebrow="Step 5 · Analyse" title={`Dashboard · ${engagementTitle(eng)}`}
        actions={<><Link className="btn" to="/compare">Current vs target</Link><Link className="btn btn-primary" to="/report">Download report (PDF)</Link></>}>
        An at-a-glance view of the current operating model assessment. Averages exclude unscored and N/A questions. Click a dimension to open its questions.
      </PageHead>

      <div className="hero">
        <div className="grid g-21" style={{ alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <div>
            <div className="eyebrow" style={{ color: '#9fe3ea' }}>What the assessment says</div>
            <h2 style={{ marginBottom: 8 }}>The operating model is {o.current ? maturityName(o.current).toLowerCase() : 'not yet assessed'}{o.current ? ` (${fmtScore(o.current)} of 5)` : ''}</h2>
            <p>{summary.headline}</p>
            <div className="kpis">
              <div><strong>{fmtScore(o.current)} → {fmtScore(o.target)}</strong><span>Current → target maturity</span></div>
              <div><strong>{fmtScore(o.gap)}</strong><span>Average gap · {o.rag || '—'}</span></div>
              <div><strong>{o.openCritHigh}</strong><span>Open critical & high findings</span></div>
              <div><strong>{ai.index ?? '—'}</strong><span>AI readiness index</span></div>
            </div>
          </div>
          <div className="card" style={{ padding: 8 }}><Gauge value={o.current ? ((o.current - 1) / 4) * 100 : null} label="Maturity" sub={`Maturity index · ${Math.round(o.pctScored * 100)}% scored`} /></div>
        </div>
      </div>

      <div className="grid g-6">
        <Stat label="Questions scored" value={`${Math.round(o.pctScored * 100)}%`} sub={`${o.scored} of ${o.total}`} accent onClick={() => nav('/assessment')} />
        <Stat label="Interviews" value={`${o.interviewsDone} / ${o.interviewsTotal}`} sub="completed" onClick={() => nav('/stakeholders')} />
        <Stat label="Documents" value={`${o.docsReceived} / ${o.docsTotal}`} sub={`${o.docsPartial} partial`} onClick={() => nav('/documents')} />
        <Stat label="Findings" value={o.findings} sub={`${o.openCritHigh} open critical/high`} onClick={() => nav('/findings')} />
        <Stat label="Recommendations" value={o.recs} sub={`${CATEGORIES.map((c) => sum(Object.values(prof.matrix[c]))) [0]} quick wins`} onClick={() => nav('/recommendations')} />
        <Stat label="Operating cost" value={fmtMoney(inv.costs.total, { compact: true })} sub={`${fmtNum(inv.org.total)} FTE`} onClick={() => nav('/costs')} />
      </div>

      <Card title="Maturity heat map by dimension" subtitle="Colour shows current maturity; dot shows RAG of the gap to target">
        <div className="dim-tiles">
          {dims.map((d) => (
            <div key={d.code} className={`dim-tile ${mClass(d.current)}`} onClick={() => nav(`/assessment?dim=${d.code}`)} title={d.name}>
              <div className="row between"><span className="t">{d.code} · {d.short}</span><RagDot rag={d.rag} /></div>
              <div className="v">{fmtScore(d.current)}<span style={{ fontSize: 12, fontWeight: 500 }}> → {fmtScore(d.target)}</span></div>
              <div className="s">{d.current ? maturityName(d.current) : 'Not assessed'} · {d.findings} findings</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid g-2">
        <Card title="Current vs target maturity"><Radar labels={dims.map((d) => d.short)} series={[{ name: 'Current', color: C.orange, values: dims.map((d) => d.current || 0) }, { name: 'Target', color: C.teal, values: dims.map((d) => d.target || 0), fill: 0.07 }]} size={460} /></Card>
        <Card title="Average maturity gap by dimension" subtitle={`Red ≥ ${eng.settings.ragRed}, Amber ≥ ${eng.settings.ragAmber}`}>
          <HBar items={dims.map((d) => ({ label: `${d.code} ${d.short}`, value: d.gap === null ? null : +d.gap.toFixed(2), color: RAG_FILL[d.rag] }))} max={Math.max(2.5, ...dims.map((d) => d.gap || 0))} fmt={(v) => Number(v).toFixed(1)} width={600} rowH={24} labelW={200} />
        </Card>
      </div>

      <div className="grid g-3">
        <Card title="Top strengths">
          {strengths.map((d) => <div key={d.code} className="row between small" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}><span>{d.name}</span><span className={`badge ${mClass(d.current)}`}>{fmtScore(d.current)}</span></div>)}
        </Card>
        <Card title="Priority gaps" subtitle="Highest importance-weighted gaps">
          {gaps.map((d) => <div key={d.code} className="row between small" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}><span>{d.name}</span><span className="row" style={{ gap: 6 }}><Badge v={d.rag} /><strong>{fmtScore(d.priority)}</strong></span></div>)}
        </Card>
        <Card title="Operating Model Canvas view" subtitle="Dimensions grouped by canvas element">
          {canvas.map((c) => <div key={c.id} className="row between small" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}><span>{c.name}</span><span className="row" style={{ gap: 6 }}><RagDot rag={c.rag} /><span className={`badge ${mClass(c.cur)}`}>{fmtScore(c.cur)}</span></span></div>)}
        </Card>
      </div>

      <div className="grid g-2">
        <Card title="Findings by dimension and severity">
          <VBars categories={dims.map((d) => d.code)} stacked height={260} width={640} series={['Critical', 'High', 'Medium', 'Low'].map((s) => ({ name: s, color: SEV_COLORS[s], values: dims.map((d) => d.sev[s]) }))} />
        </Card>
        <Card title="Recommendation profile" subtitle="Category by horizon" pad={false}>
          <table className="table">
            <thead><tr><th>Category</th>{prof.horizons.map((h) => <th key={h} className="num">{h}</th>)}<th className="num">Total</th></tr></thead>
            <tbody>{CATEGORIES.map((c) => <tr key={c}><td><Badge v={c} /></td>{prof.horizons.map((h) => <td key={h} className="num">{prof.matrix[c][h] || ''}</td>)}<td className="num strong">{sum(Object.values(prof.matrix[c]))}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>

      <div className="section-title">Current-state health</div>
      <div className="grid g-4">
        <Card title="Organisation" actions={<Link className="btn btn-xs" to="/organisation">Open</Link>}>
          <dl className="kv"><dt>Total FTE</dt><dd>{fmtNum(inv.org.total)}</dd><dt>Average span</dt><dd>{fmtNum(inv.org.span, 1)}</dd><dt>Deepest layers</dt><dd>{inv.org.maxLayers} (max {eng.settings.maxLayers})</dd><dt>Contractor & outsourced</dt><dd>{fmtPct(inv.org.contractorPct)}</dd><dt>Units outside span range</dt><dd>{inv.org.spanIssues}</dd></dl>
        </Card>
        <Card title="Applications" actions={<Link className="btn btn-xs" to="/applications">Open</Link>}>
          <StackBar segments={['Invest', 'Tolerate', 'Migrate', 'Eliminate'].map((t, i) => ({ label: t, value: inv.apps.time[t] || 0, color: ['#1f9d58', '#f2c14e', '#eb6834', '#d03b3b'][i] }))} />
          <p className="small mt-8">{inv.apps.count} applications · {fmtMoney(inv.apps.cost, { compact: true })} a year · {inv.apps.eol} end of life</p>
        </Card>
        <Card title="Suppliers" actions={<Link className="btn btn-xs" to="/suppliers">Open</Link>}>
          <StackBar segments={['High', 'Medium', 'Low'].map((k, i) => ({ label: `${k} risk`, value: inv.suppliers.dependency[k] || 0, color: ['#d03b3b', '#f0a020', '#1f9d58'][i] }))} />
          <p className="small mt-8">{inv.suppliers.count} suppliers · {fmtMoney(inv.suppliers.spend, { compact: true })} spend · {inv.suppliers.renewals} renewals due</p>
        </Card>
        <Card title="Locations" actions={<Link className="btn btn-xs" to="/locations">Open</Link>}>
          <div className="small">Utilisation {fmtPct(inv.locations.utilisation)}</div><Progress value={inv.locations.utilisation} />
          <p className="small mt-8">{inv.locations.count} sites · {fmtMoney(inv.locations.cost, { compact: true })} a year · {inv.locations.expiring} leases expiring</p>
        </Card>
      </div>
      <div className="grid g-3">
        <Card title="Cost baseline by type"><Donut items={COST_TYPES.map((t, i) => ({ label: t.label, value: inv.costs.byType[t.key], display: fmtMoney(inv.costs.byType[t.key], { compact: true }), color: PALETTE[i] }))} center={fmtMoney(inv.costs.total, { compact: true })} sub="annual cost" size={180} /></Card>
        <Card title="Decision rights & capabilities">
          <dl className="kv"><dt>Decisions mapped</dt><dd>{inv.decisions.mapped} of {inv.decisions.total}</dd><dt>With RAPID issues</dt><dd>{inv.decisions.issues}</dd><dt>Avg decision time</dt><dd>{fmtNum(inv.decisions.avgDays)} days</dd><dt>Capabilities assessed</dt><dd>{inv.capabilities.assessed} of {inv.capabilities.total}</dd><dt>Processes documented</dt><dd>{inv.processes.documented} of {inv.processes.total}</dd></dl>
        </Card>
        <Card title="AI readiness" actions={<Link className="btn btn-xs" to="/ai">Open</Link>}>
          <div className="center"><Gauge value={ai.index} label="AI readiness" sub={ai.level ? ai.level.name : 'Not assessed'} size={220} /></div>
          <p className="small center">Guardrails in place: {ai.guardrails.implemented}/{ai.guardrails.applicable} · Use cases: {ai.useCases.count}</p>
        </Card>
      </div>
    </div>
  );
}
