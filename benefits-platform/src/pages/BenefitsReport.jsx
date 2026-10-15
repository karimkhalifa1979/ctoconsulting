import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, personName, measureById } from '../lib/store.jsx';
import { benefitsRollup } from '../lib/portfolio.js';
import { isFinancial, annualValue, profileQuarters, benefitStart } from '../lib/finance.js';
import { benefitTypeLabel } from '../lib/config.js';
import { PageHead, Card, ChartCard, Stat, Seg, StackBar, Pill } from '../components/ui.jsx';
import { ProfileChart } from '../components/charts.jsx';
import { StatusPill } from './program/Benefits.jsx';
import { money, pct, num, fmtDate, addMonths, quarterLabel } from '../lib/util.js';
import { exportXlsx } from '../lib/exporters.js';

export default function BenefitsReport() {
  const { ws } = useApp();
  const nav = useNavigate();
  const [by, setBy] = useState('benefit');
  const [pick, setPick] = useState(null);
  const roll = benefitsRollup(ws);
  const rows = roll.rows.filter((r) => !r.b.disbenefit);
  const groupBy = (keyFn, labelFn) => {
    const m = new Map();
    for (const r of rows) for (const k of [].concat(keyFn(r))) { if (!m.has(k)) m.set(k, { key: k, label: labelFn(k), rows: [] }); m.get(k).rows.push(r); }
    return [...m.values()].map((g) => { const fin = g.rows.filter((x) => x.financial && x.r.status !== 'no-data'); const nf = g.rows.filter((x) => !x.financial && x.r.status !== 'no-data'); return { ...g, actual: fin.reduce((a, x) => a + x.r.actual / Math.max(1, by === 'driver' ? (x.b.driverIds || []).length : 1), 0), forecast: fin.reduce((a, x) => a + x.r.forecast / Math.max(1, by === 'driver' ? (x.b.driverIds || []).length : 1), 0), target: g.rows.filter((x) => x.financial).reduce((a, x) => a + annualValue(x.b) * (x.b.attribution ?? 1) / Math.max(1, by === 'driver' ? (x.b.driverIds || []).length : 1), 0), onTrack: nf.length ? nf.filter((x) => x.r.status === 'on-track').length / nf.length : null, count: g.rows.length }; });
  };
  const groups = by === 'program' ? groupBy((r) => r.p.id, (k) => ws.programs.find((p) => p.id === k)?.name) : by === 'driver' ? groupBy((r) => (r.b.driverIds?.length ? r.b.driverIds : ['none']), (k) => ws.drivers.find((d) => d.id === k)?.name || 'No driver') : null;
  const post = ws.programs.filter((p) => p.state === 'completed' && p.completion);
  const sel = pick ? rows.find((r) => r.b.id === pick) : null;

  const exportX = () => exportXlsx([{ name: 'Benefits realisation', columns: [{ label: 'Program', get: (r) => r.p.name }, { label: 'Benefit', get: (r) => r.b.title }, { label: 'Type', get: (r) => benefitTypeLabel(r.b.type) }, { label: 'Owner', get: (r) => personName(ws, r.b.ownerId) }, { label: 'Measure', get: (r) => measureById(ws, r.b.measureId)?.name }, { label: 'Attribution', get: (r) => r.b.attribution ?? 1 }, { label: 'Actual to date', get: (r) => r.r.actual }, { label: 'Forecast to date', get: (r) => r.r.forecast }, { label: 'Realisation', get: (r) => r.r.ratio }, { label: 'Status', get: (r) => r.r.status }], rows }], 'benefits_realisation_report.xlsx');

  return (
    <div className="stack">
      <PageHead eyebrow="Value" title="Benefits realisation" actions={<button className="btn dl" onClick={exportX}>Export Excel</button>}>Realised, forecast and target benefits by benefit, program and strategic driver — adjusted for attribution and split by cash-releasing and non-cash-releasing (RPT-03). Non-financial benefits are aggregated as the share on track, never by adding unlike units.</PageHead>
      <div className="kpi-grid">
        <Stat accent label="Financial benefits realised to date" value={money(roll.realised)} sub={`vs ${money(roll.forecast)} forecast to the same dates`} />
        <Stat label="Realisation to date" value={roll.forecast ? pct(roll.realised / roll.forecast) : '—'} sub="cumulative actual ÷ cumulative forecast" />
        <Stat label="Cash-releasing realised" value={money(roll.cashRealised)} sub={`of ${money(roll.cashForecast)} forecast`} />
        <Stat label="Non-financial on track" value={roll.nonfinOnTrack === null ? '—' : pct(roll.nonfinOnTrack)} sub="share of measured non-financial benefits" />
      </div>
      <Card title="Status of benefits with actuals"><StackBar segments={[{ label: 'On track', value: roll.counts['on-track'] || 0, color: 'var(--st-good)' }, { label: 'At risk', value: roll.counts['at-risk'] || 0, color: 'var(--st-warning)' }, { label: 'Off track', value: roll.counts['off-track'] || 0, color: 'var(--st-critical)' }, { label: 'No actuals yet', value: roll.counts['no-data'] || 0, color: 'var(--st-none)' }]} /></Card>
      <Seg value={by} onChange={setBy} options={[['benefit', 'By benefit'], ['program', 'By program'], ['driver', 'By strategic driver']]} label="Group by" />
      {by === 'benefit' ? (
        <Card pad={false}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Benefit</th><th>Program</th><th>Type</th><th>Owner</th><th className="num">Attribution</th><th className="num">Actual to date</th><th className="num">Forecast to date</th><th>Status</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.b.id} className={`clickable ${pick === r.b.id ? 'selected' : ''}`} onClick={() => setPick(r.b.id)}>
                <td><strong>{r.b.title}</strong><div className="mini">{measureById(ws, r.b.measureId)?.name || 'No measure'}</div></td>
                <td>{r.p.code}</td><td>{benefitTypeLabel(r.b.type)}</td><td>{personName(ws, r.b.ownerId)}</td><td className="num">{pct(r.b.attribution ?? 1)}</td>
                <td className="num">{r.r.status === 'no-data' ? '—' : r.financial ? money(r.r.actual) : `${num(r.r.actual, 1)} ${r.b.unit || ''}`}</td>
                <td className="num">{r.r.status === 'no-data' ? '—' : r.financial ? money(r.r.forecast) : `${num(r.r.forecast, 1)} ${r.b.unit || ''}`}</td>
                <td><StatusPill status={r.r.status} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      ) : (
        <Card pad={false}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>{by === 'program' ? 'Program' : 'Strategic driver'}</th><th className="num">Benefits</th><th className="num">Target / yr (financial)</th><th className="num">Realised to date</th><th className="num">Forecast to date</th><th className="num">Realisation</th><th className="num">Non-financial on track</th></tr></thead>
            <tbody>{groups.map((g) => <tr key={g.key}><td><strong>{g.label}</strong></td><td className="num">{g.count}</td><td className="num">{money(g.target)}</td><td className="num">{money(g.actual)}</td><td className="num">{money(g.forecast)}</td><td className="num">{g.forecast ? pct(g.actual / g.forecast) : '—'}</td><td className="num">{g.onTrack === null ? '—' : pct(g.onTrack)}</td></tr>)}</tbody>
          </table></div>
          {by === 'driver' && <div className="card-body mini">Benefits linked to several drivers are split equally between them.</div>}
        </Card>
      )}
      {sel && (
        <ChartCard title={sel.b.title} subtitle={`${sel.p.name} · starts ${fmtDate(benefitStart(sel.p, sel.b))}`} actions={<button className="btn btn-sm" onClick={() => nav(`/programs/${sel.p.id}/benefits`)}>Open benefit</button>}>
          <ProfileChart rows={profileQuarters(sel.p, sel.b, addMonths(benefitStart(sel.p, sel.b), -6), 24)} financial={isFinancial(sel.b)} unit={sel.b.unit} baseline={sel.b.baseline?.value} target={sel.b.target} />
        </ChartCard>
      )}
      <Card title="Post-handover benefits (BEN-10, RP-13)" subtitle="Tracked under operational owners after completion">
        {!post.length ? <div className="empty-sm">No completed programs.</div> : post.map((p) => (
          <div key={p.id} style={{ marginBottom: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><strong>{p.name}</strong><span className="mini">Completed {fmtDate(p.completion.date)} · tracking until {fmtDate(p.completion.postHandoverUntil)}</span></div>
            {rows.filter((r) => r.p.id === p.id).map((r) => <div key={r.b.id} className="check-row"><span className="ic">◎</span><span>{r.b.title}<div className="mini">Operational owner {personName(ws, r.b.operationalOwnerId)}{r.b.bau ? ' · in BAU reporting' : ''} · last actual {r.r.last ? quarterLabel(r.r.last) : '—'}</div></span><StatusPill status={r.r.status} /></div>)}
          </div>
        ))}
        <Pill tone="none" icon="i">A report one year after implementation goes to the board.</Pill>
      </Card>
    </div>
  );
}
