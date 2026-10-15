import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, personName } from '../lib/store.jsx';
import { BSC, CONTRIB_TYPES } from '../lib/config.js';
import { alignmentScore } from '../lib/scoring.js';
import { summaries } from '../lib/portfolio.js';
import { isFinancial, realisation, annualValue } from '../lib/finance.js';
import { PageHead, Card, Select, PersonSelect, NumberInput, Pill, Guidance } from '../components/ui.jsx';
import { fmtDate, money, todayISO, uid } from '../lib/util.js';

export default function Strategy() {
  const { ws, mutate } = useApp();
  const nav = useNavigate();
  const s = summaries(ws);
  const upd = (id, k, v) => mutate(`Strategic driver ${k}`, (d) => { d.drivers.find((x) => x.id === id)[k] = v; }, { object: 'driver', objectId: id, field: `${id}:${k}` });
  const lastVersion = ws.strategyVersions[ws.strategyVersions.length - 1];
  const t = ws.settings.thresholds.alignmentChange;
  // STR-05 / BR-20: alignment recalculated under the current framework against the last saved version.
  const changes = useMemo(() => {
    if (!lastVersion) return [];
    const old = { ...ws, drivers: lastVersion.drivers, settings: { ...ws.settings, typeWeights: lastVersion.typeWeights } };
    return ws.programs.filter((p) => !['withdrawn', 'completed'].includes(p.state)).map((p) => ({ p, before: alignmentScore(p, old).score, after: alignmentScore(p, ws).score })).filter((x) => x.before !== null && x.after !== null && Math.abs(x.after - x.before) > t);
  }, [ws, lastVersion, t]);
  const weightsByType = CONTRIB_TYPES.map((ct) => ({ ct, sum: ws.drivers.filter((d) => d.type === ct.id && d.status !== 'retired').reduce((a, d) => a + (Number(d.weight) || 0), 0) }));

  // Coverage (STR-07).
  const coverage = ws.drivers.map((d) => {
    const progs = ws.programs.filter((p) => p.state !== 'withdrawn' && ((p.driverIds || []).includes(d.id) || (p.chain?.elements || []).some((e) => e.final && (e.driverIds || []).includes(d.id))));
    let forecast = 0; let realised = 0;
    for (const p of progs) for (const b of (p.benefits || []).filter((x) => isFinancial(x) && (x.driverIds || []).includes(d.id))) { forecast += annualValue(b) * (b.attribution ?? 1) / Math.max(1, (b.driverIds || []).length); const r = realisation(p, b, ws); realised += (r.actual || 0) / Math.max(1, (b.driverIds || []).length); }
    return { d, progs, forecast, realised };
  });
  const orphans = ws.programs.filter((p) => p.state !== 'withdrawn' && !(p.driverIds || []).length);

  return (
    <div className="stack">
      <PageHead eyebrow="Investments" title="Strategy and alignment" actions={<>
        <button className="btn" onClick={() => mutate('Strategy version saved', (d) => { d.strategyVersions.push({ id: uid('sv'), date: todayISO(), label: `Strategy version ${d.strategyVersions.length + 1}`, drivers: structuredClone(d.drivers), typeWeights: { ...d.settings.typeWeights } }); }, { action: 'version' })}>Save strategy version</button>
        <button className="btn btn-primary" onClick={() => mutate('Added strategic driver', (d) => { d.drivers.push({ id: uid('d'), name: 'New strategic driver', description: '', perspective: 'Financial', type: 'current', weight: 0.2, owner: d.currentUser, status: 'active', from: todayISO() }); })}>+ Driver</button>
      </>}>
        Strategic drivers are the few things the organisation must excel at. Every final outcome links to at least one; alignment scores recalculate when drivers or weights change.
      </PageHead>

      {changes.length > 0 && <div className="callout warn"><strong>Alignment changed by more than {t} points since “{lastVersion.label}” (STR-05):</strong> {changes.map((c) => `${c.p.name} ${Math.round(c.before)} → ${Math.round(c.after)}`).join('; ')}. <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => mutate('Sponsors notified of alignment change (BR-20)', (d) => { for (const c of changes) { const p = d.programs.find((x) => x.id === c.p.id); p.log.push({ id: uid('log'), type: 'action', title: `Review alignment: changed ${Math.round(c.before)} → ${Math.round(c.after)} after strategy change`, ownerId: p.sponsorId, date: todayISO(), status: 'open', level: 'program' }); } })}>Notify sponsors</button></div>}

      <Card title="Strategic drivers (STR-01/02/03)" subtitle={`Contribution-type weights: ${CONTRIB_TYPES.map((c) => `${c.label} ${ws.settings.typeWeights[c.id]}`).join(' · ')}`} pad={false}>
        <div className="table-wrap"><table className="table compact">
          <thead><tr><th>Driver</th><th>Scorecard perspective</th><th>Contribution type</th><th className="num">Weight</th><th>Owner</th><th>Effective</th><th>Status</th></tr></thead>
          <tbody>{ws.drivers.map((d) => (
            <tr key={d.id}>
              <td style={{ minWidth: 260 }}><input className="inline-input" style={{ fontWeight: 600 }} value={d.name} onChange={(e) => upd(d.id, 'name', e.target.value)} aria-label="Driver name" /><input className="inline-input mini" value={d.description} onChange={(e) => upd(d.id, 'description', e.target.value)} aria-label="Description" placeholder="Description" /></td>
              <td><Select value={d.perspective} onChange={(v) => upd(d.id, 'perspective', v)} options={BSC} /></td>
              <td><Select value={d.type} onChange={(v) => upd(d.id, 'type', v)} options={CONTRIB_TYPES.map((c) => [c.id, c.label])} /></td>
              <td><NumberInput value={d.weight} onChange={(v) => upd(d.id, 'weight', v)} step={0.05} style={{ width: 70 }} /></td>
              <td><PersonSelect ws={ws} value={d.owner} onChange={(v) => upd(d.id, 'owner', v)} /></td>
              <td><input type="date" value={d.from || ''} onChange={(e) => upd(d.id, 'from', e.target.value)} aria-label="Effective from" /></td>
              <td><Select value={d.status} onChange={(v) => upd(d.id, 'status', v)} options={['active', 'retired']} /></td>
            </tr>
          ))}</tbody>
        </table></div>
        <div className="card-body row mini">
          {weightsByType.map(({ ct, sum }) => <span key={ct.id}>{ct.label}: weights sum to {sum.toFixed(2)}{Math.abs(sum - 1) > 0.001 && sum > 0 ? ' (normalised in scoring)' : ''}</span>)}
          <span className="row" style={{ gap: 6 }}>Type weights: {CONTRIB_TYPES.map((c) => <NumberInput key={c.id} value={ws.settings.typeWeights[c.id]} onChange={(v) => mutate('Contribution type weight', (d) => { d.settings.typeWeights[c.id] = v; }, { field: `tw:${c.id}` })} step={0.05} style={{ width: 64 }} aria-label={`${c.label} weight`} />)}</span>
        </div>
      </Card>

      <Card title="Strategy coverage (STR-07)" subtitle="Contributing programs and their forecast annual and realised benefits by driver" pad={false}>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Driver</th><th>Programs contributing</th><th className="num">Forecast benefit / yr</th><th className="num">Realised to date</th><th>Coverage</th></tr></thead>
          <tbody>{coverage.map(({ d, progs, forecast, realised }) => (
            <tr key={d.id}><td><strong>{d.name}</strong><div className="mini">{d.perspective} · owner {personName(ws, d.owner)}</div></td>
              <td>{progs.map((p) => <button key={p.id} className="chip" style={{ margin: 2 }} onClick={() => nav(`/programs/${p.id}`)}>{p.code}</button>)}</td>
              <td className="num">{money(forecast)}</td><td className="num">{money(realised)}</td>
              <td>{progs.length ? <Pill tone="good">{progs.length} program{progs.length === 1 ? '' : 's'}</Pill> : <Pill tone="warning">No investment</Pill>}</td></tr>
          ))}</tbody>
        </table></div>
        {orphans.length > 0 && <div className="card-body"><Pill tone="warning">Investments with no driver: {orphans.map((p) => p.name).join(', ')}</Pill></div>}
      </Card>

      <div className="grid g-2" data-layout>
        <Card title="Alignment by program" subtitle="Recalculated live from ratings and current weights">
          {ws.programs.filter((p) => p.state !== 'withdrawn').map((p) => { const a = s.get(p.id).align; return <div key={p.id} className="comp-row" style={{ gridTemplateColumns: '220px 1fr 40px' }}><span className="clamp-2">{p.code} {p.name}</span><div className="meter"><span style={{ width: `${a.score ?? 0}%`, background: 'var(--series-1)' }} /></div><span className="num">{a.score === null ? '—' : Math.round(a.score)}</span></div>; })}
        </Card>
        <Card title="Strategy versions (STR-06)" subtitle="Historical assessments can be reproduced against the strategy in force at the time">
          {ws.strategyVersions.slice().reverse().map((v) => <div key={v.id} className="check-row"><span className="ic">◆</span><span><strong>{v.label}</strong><div className="mini">{fmtDate(v.date)} · {v.drivers.length} drivers</div></span><span /></div>)}
          <Guidance>Key business functions (STR-08): business areas act as functions — see the change-load heatmap and value plots to cross-check coverage.</Guidance>
        </Card>
      </div>
    </div>
  );
}
