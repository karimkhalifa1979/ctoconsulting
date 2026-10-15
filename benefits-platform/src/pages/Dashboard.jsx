import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp, personName } from '../lib/store.jsx';
import { STATES, decisionOf, gateOf } from '../lib/config.js';
import { summaries, benefitsRollup, categoryFunds } from '../lib/portfolio.js';
import { forecastForQuarter, isFinancial } from '../lib/finance.js';
import { benefitsBehind, chainOf } from '../lib/chain.js';
import { Card, ChartCard, Pill, StackBar, BarList, RiskIcon } from '../components/ui.jsx';
import { ValuePlot, TrendChart } from '../components/charts.jsx';
import { ChangeHeatmap } from './Dependencies.jsx';
import { money, pct, fmtDate, todayISO, quarterKey, quarterRange, quarterLabel, fiscalYear, fyLabel, addMonths } from '../lib/util.js';

export default function Dashboard() {
  const { ws } = useApp();
  const nav = useNavigate();
  const s = summaries(ws);
  const live = ws.programs.filter((p) => !['withdrawn', 'completed'].includes(p.state));
  const roll = benefitsRollup(ws);
  const fy = fiscalYear(todayISO(), ws.settings.fyStartMonth);
  const funds = categoryFunds(ws, fy).filter((f) => f.allocation || f.forecast);
  const released = ws.programs.filter((p) => p.state === 'withdrawn').reduce((a, p) => a + (Number(p.withdrawal?.released) || 0), 0);
  const totalNpv = live.reduce((a, p) => a + s.get(p.id).fin.npv, 0);
  const lifetime = live.reduce((a, p) => a + s.get(p.id).fin.totalCosts, 0);

  // Cumulative forecast vs realised financial benefits by quarter (portfolio).
  const series = useMemo(() => {
    const now = quarterKey(todayISO());
    const qs = quarterRange('2025-Q1', quarterKey(addMonths(todayISO(), 18)));
    let cf = 0; let ca = 0; const f = []; const act = [];
    for (const q of qs) {
      let fq = 0; let aq = 0; let hasA = false;
      for (const p of ws.programs) for (const b of (p.benefits || []).filter(isFinancial)) {
        fq += forecastForQuarter(p, b, q);
        const a = (b.actuals || []).find((x) => x.period === q);
        if (a && a.value !== '') { aq += Number(a.value); hasA = true; }
      }
      cf += fq; f.push(cf);
      if (q <= now) { ca += hasA ? aq : 0; act.push(ca); } else act.push(null);
    }
    return { qs, f, act };
  }, [ws]);

  const assumptions = ws.programs.flatMap((p) => chainOf(p).elements.filter((e) => e.kind === 'assumption' && e.assumption?.status !== 'holding').map((a) => ({ p, a, value: benefitsBehind(p, a.id).length })));
  const decisions = ws.programs.flatMap((p) => (p.gates || []).filter((g) => g.decision && !g.decision.supersededBy).map((g) => ({ p, g }))).sort((a, b) => (a.g.decision.date < b.g.decision.date ? 1 : -1)).slice(0, 6);
  const upcoming = ws.programs.flatMap((p) => (p.gates || []).filter((g) => !g.decision).map((g) => ({ p, g }))).sort((a, b) => (a.g.planned < b.g.planned ? -1 : 1)).slice(0, 6);
  const topRisks = ws.programs.flatMap((p) => (p.log || []).filter((l) => l.type === 'risk' && l.status !== 'closed' && (l.impact === 'high' || l.level === 'idb' || l.level === 'vmo')).map((l) => ({ p, l }))).slice(0, 6);
  const points = ws.programs.filter((p) => p.state !== 'withdrawn').map((p) => ({ id: p.id, code: p.code, name: p.name, npv: s.get(p.id).fin.npv, risk: s.get(p.id).risk.overall, cost: s.get(p.id).lifetimeCost, band: p.band, state: p.state }));

  return (
    <div className="stack">
      <div className="hero">
        <div className="eyebrow" style={{ color: '#9fd9df' }}>{ws.settings.orgName} · {fyLabel(fy, ws.settings.fyStartMonth)}</div>
        <h1>Portfolio dashboard</h1>
        <p style={{ margin: '4px 0 0', maxWidth: 760, position: 'relative', zIndex: 1 }}>Every significant investment in change, with a named owner of its benefits, a living model of how they will be realised, and governance that keeps asking whether it is still the right thing to do.</p>
        <div className="kpis">
          <div><strong>{live.length}</strong><span>Live programs</span></div>
          <div><strong>{money(lifetime)}</strong><span>Lifetime cost (live)</span></div>
          <div><strong>{money(totalNpv)}</strong><span>Portfolio NPV</span></div>
          <div><strong>{roll.forecast ? pct(roll.realised / roll.forecast) : '—'}</strong><span>Realised vs forecast to date</span></div>
          <div><strong>{roll.nonfinOnTrack === null ? '—' : pct(roll.nonfinOnTrack)}</strong><span>Non-financial benefits on track</span></div>
          <div><strong>{money(released)}</strong><span>Resources released by stopping work</span></div>
        </div>
      </div>

      <div className="grid g-2" data-layout>
        <ChartCard title="Value plot — financial worth against overall risk" subtitle="VAL-08 · bubble size is lifetime cost · click a program to open it" table={{ columns: [{ label: 'Program', get: (r) => `${r.code} ${r.name}` }, { label: 'NPV', num: true, get: (r) => money(r.npv) }, { label: 'Risk', num: true, get: (r) => (r.risk === null ? '—' : Math.round(r.risk)) }, { label: 'Lifetime cost', num: true, get: (r) => money(r.cost) }, { label: 'Band', get: (r) => r.band || '—' }], rows: points }}>
          <ValuePlot points={points} xKey="risk" xLabel="Overall risk" invertX onOpen={(pt) => nav(`/programs/${pt.id}`)} height={330} />
        </ChartCard>
        <div className="stack">
          <Card title="Pipeline by lifecycle state" subtitle="INV-08">
            <StackBar segments={STATES.map((st) => ({ label: st.label, value: ws.programs.filter((p) => p.state === st.id).length, color: st.color }))} />
            <div className="mini" style={{ marginTop: 8 }}>{ws.ideas.filter((i) => i.status === 'new').length} new ideas awaiting triage · <Link to="/ideas">Ideas and intake</Link></div>
          </Card>
          <ChartCard title={`Category allocation and forecast spend — ${fyLabel(fy, ws.settings.fyStartMonth)}`} subtitle="PFM-02 · forecast lifecycle cost falling in the year" table={{ columns: [{ label: 'Category', get: (f) => f.category.name }, { label: 'Allocation', num: true, get: (f) => money(f.allocation) }, { label: 'Forecast spend', num: true, get: (f) => money(f.forecast) }, { label: 'Available', num: true, get: (f) => money(f.available) }], rows: funds }}>
            {funds.map((f) => (
              <div key={f.category.id} style={{ marginBottom: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}><span>{f.category.name}</span><span className={f.available < 0 ? 'neg' : 'muted'}>{money(f.forecast)} of {money(f.allocation)}{f.available < 0 ? ' — over' : ''}</span></div>
                <div className="meter" style={{ height: 10 }}><span style={{ width: `${Math.min(100, f.allocation ? (f.forecast / f.allocation) * 100 : 100)}%`, background: f.available < 0 ? 'var(--st-critical)' : 'var(--series-1)' }} /></div>
              </div>
            ))}
          </ChartCard>
        </div>
      </div>

      <div className="grid g-2" data-layout>
        <ChartCard title="Cumulative financial benefits — forecast and realised" subtitle="RPT-03 · after attribution" table={{ columns: [{ label: 'Quarter', get: (i) => quarterLabel(series.qs[i]) }, { label: 'Cumulative forecast', num: true, get: (i) => money(series.f[i]) }, { label: 'Cumulative realised', num: true, get: (i) => (series.act[i] === null ? '—' : money(series.act[i])) }], rows: series.qs.map((_, i) => i) }}>
          <TrendChart labels={series.qs.map((q) => (q.endsWith('Q1') ? q.slice(0, 4) : ''))} series={[{ name: 'Forecast', color: 'var(--ben)', values: series.f }, { name: 'Realised', color: 'var(--net)', values: series.act }]} yMin={0} yMax={Math.max(...series.f, 1)} fmt={(v) => money(v)} height={230} />
        </ChartCard>
        <Card title="Benefits status" subtitle="Benefits with actuals, by realisation status">
          <StackBar segments={[{ label: 'On track', value: roll.counts['on-track'] || 0, color: 'var(--st-good)' }, { label: 'At risk', value: roll.counts['at-risk'] || 0, color: 'var(--st-warning)' }, { label: 'Off track', value: roll.counts['off-track'] || 0, color: 'var(--st-critical)' }, { label: 'No actuals yet', value: roll.counts['no-data'] || 0, color: 'var(--st-none)' }]} />
          <div className="section-title">Benefits needing attention</div>
          {roll.rows.filter((r) => ['at-risk', 'off-track'].includes(r.r.status)).map((r) => <div key={r.b.id} className="check-row" style={{ cursor: 'pointer' }} onClick={() => nav(`/programs/${r.p.id}/benefits`)}><span className={`ic ${r.r.status === 'off-track' ? 'sev-error' : 'sev-warning'}`}>{r.r.status === 'off-track' ? '■' : '▲'}</span><span>{r.b.title}<div className="mini">{r.p.name} · {pct(r.r.ratio)} of forecast · owner {personName(ws, r.b.ownerId)}</div></span><span /></div>)}
        </Card>
      </div>

      <div className="grid g-3" data-layout>
        <Card title="Assumptions at risk" subtitle="RCM-22 — with dependent benefits">
          {!assumptions.length ? <div className="empty-sm">All assumptions holding.</div> : assumptions.map(({ p, a, value }) => <div key={a.id} className="check-row" style={{ cursor: 'pointer' }} onClick={() => nav(`/programs/${p.id}/map`)}><span className={`ic ${a.assumption.status === 'invalid' ? 'sev-error' : 'sev-warning'}`}>{a.assumption.status === 'invalid' ? '✕' : '!'}</span><span>{a.title}<div className="mini">{p.name} · {value} benefit{value === 1 ? '' : 's'} downstream · monitor {personName(ws, a.assumption.monitorId)}</div></span><span /></div>)}
        </Card>
        <Card title="Recent gate decisions" subtitle="Withdrawals shown as resources released (BR-19)">
          {decisions.map(({ p, g }) => <div key={g.id} className="check-row"><span className="ic">◆</span><span><strong>{p.code}</strong> {gateOf(g.gate)?.short}: {decisionOf(g.decision.option)?.label}{g.decision.option === 'withdraw' && <> <Pill tone="good">resources released</Pill></>}<div className="mini">{fmtDate(g.decision.date)} · {money(g.decision.fundingApproved)} released</div></span><span /></div>)}
        </Card>
        <Card title="Upcoming gates" subtitle={<Link to="/governance">Gate calendar and board</Link>}>
          {upcoming.map(({ p, g }) => <div key={g.id} className="check-row" style={{ cursor: 'pointer' }} onClick={() => nav(`/programs/${p.id}/gates`)}><span className={`ic ${g.planned < todayISO() ? 'sev-error' : ''}`}>{g.planned < todayISO() ? '!' : '○'}</span><span><strong>{p.code}</strong> {gateOf(g.gate)?.name}{g.eventTriggered ? ' (event)' : ''}<div className="mini">{fmtDate(g.planned)}{g.planned < todayISO() ? ' · overdue' : ''}</div></span><span><RiskIcon byAre={s.get(p.id).risk.byAre} ws={ws} size={20} /></span></div>)}
        </Card>
      </div>

      <div className="grid g-2" data-layout>
        <Card title="Top risks escalated" subtitle="High impact, or escalated to the VMO or board">
          {!topRisks.length ? <div className="empty-sm">No escalated risks.</div> : topRisks.map(({ p, l }) => <div key={l.id} className="check-row"><span className="ic sev-warning">!</span><span>{l.title}<div className="mini">{p.name} · {l.likelihood} likelihood / {l.impact} impact · {l.level?.toUpperCase()}</div></span><span /></div>)}
        </Card>
        <Card title="Programs by health" subtitle="PRG-13 — open a program to see the components">
          <BarList items={ws.programs.filter((p) => s.get(p.id).health.score !== null && p.state !== 'withdrawn').map((p) => ({ key: p.id, label: `${p.code} ${p.name}`, value: Math.round(s.get(p.id).health.score), color: s.get(p.id).health.score >= 70 ? 'var(--st-good)' : s.get(p.id).health.score >= 50 ? 'var(--st-warning)' : 'var(--st-critical)', id: p.id })).sort((a, b) => a.value - b.value)} max={100} onClick={(it) => nav(`/programs/${it.id}`)} />
        </Card>
      </div>
      <ChangeHeatmap compact />
    </div>
  );
}
