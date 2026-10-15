import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, personName } from '../lib/store.jsx';
import { DEPENDENCY_TYPES } from '../lib/config.js';
import { changeLoad } from '../lib/scoring.js';
import { PageHead, Card, Select, PersonSelect, Pill, NumberInput, TextInput, useTip, Guidance } from '../components/ui.jsx';
import { quarterKey, quarterRange, quarterLabel, todayISO, addMonths, uid, monthsBetween, fmtDate, num } from '../lib/util.js';

const TYPE_COLOR = { sequential: 'var(--series-1)', overlap: 'var(--series-2)', resource: 'var(--series-3)', bottleneck: 'var(--series-7)' };

export function ChangeHeatmap({ compact = false }) {
  const { ws } = useApp();
  const [bind, tip] = useTip();
  const from = quarterKey(todayISO()); const to = quarterKey(addMonths(todayISO(), compact ? 21 : 33));
  const programs = ws.programs.filter((p) => !['withdrawn', 'completed'].includes(p.state));
  const cl = useMemo(() => changeLoad(ws, programs, from, to), [ws]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = Math.max(1, ...cl.rows.flatMap((r) => r.cells.map((c) => c.load)));
  const rows = cl.rows.filter((r) => r.cells.some((c) => c.load > 0) || !compact);
  const shade = (v) => (v <= 0 ? '#f6f8fb' : ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'][Math.min(5, Math.floor((v / max) * 6))]);
  return (
    <Card title="Change-load heatmap" subtitle="DEP-05 / 7.2.6 — impact (1–3) × share of group affected, summed across programs; outlined cells exceed the area's absorption threshold" pad={false}>
      <div className="table-wrap"><table className="table compact heat">
        <thead><tr><th>Business area</th><th className="num">Threshold</th>{cl.quarters.map((q) => <th key={q} className="num">{quarterLabel(q)}</th>)}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.area.id}><td>{r.area.name}</td><td className="num">{r.area.absorption}</td>
            {r.cells.map((c) => <td key={c.q} className={`hcell ${c.over ? 'over' : ''}`} style={{ background: shade(c.load), color: c.load / max > 0.5 ? '#fff' : 'var(--ink)' }} tabIndex={0} {...bind(<><strong>{r.area.name} · {quarterLabel(c.q)}</strong><div>Load {c.load.toFixed(2)} (threshold {r.area.absorption}){c.over ? ' — bottleneck' : ''}</div>{c.contributors.map((x) => <div key={x.group.id} className="mini" style={{ color: '#c9d5e6' }}>{x.program.code} {x.group.name}: {x.value.toFixed(2)}</div>)}</>)}>{c.load ? c.load.toFixed(1) : ''}{c.over ? ' ▲' : ''}</td>)}
          </tr>
        ))}</tbody>
      </table></div>
      {tip}
    </Card>
  );
}

export default function Dependencies() {
  const { ws, mutate } = useApp();
  const nav = useNavigate();
  const [bind, tip] = useTip();
  const progs = ws.programs.filter((p) => p.state !== 'withdrawn');
  const deps = ws.dependencies;
  const upd = (id, k, v) => mutate(`Dependency ${k}`, (d) => { d.dependencies.find((x) => x.id === id)[k] = v; }, { object: 'dependency', objectId: id, field: `${id}:${k}` });
  const quarters = quarterRange(quarterKey(todayISO()), quarterKey(addMonths(todayISO(), 27)));

  // Resource demand vs capacity (DEP-04).
  const resource = ws.resources.map((r) => ({ r, cells: quarters.map((q) => { const items = progs.flatMap((p) => (p.demand || []).filter((d) => d.roleId === r.id && q >= d.from && q <= d.to).map((d) => ({ p, fte: d.fte }))); const total = items.reduce((a, b) => a + b.fte, 0); return { q, total, items, over: total > r.capacity }; }) }));

  // Automatic detection (DEP-02).
  const detected = useMemo(() => {
    const out = [];
    const exists = (type, a, b) => deps.some((d) => d.type === type && ((d.from === a && d.to === b) || (d.from === b && d.to === a)));
    for (let i = 0; i < progs.length; i++) for (let j = i + 1; j < progs.length; j++) {
      const A = progs[i]; const B = progs[j];
      const sharedMeasures = (A.benefits || []).map((b) => b.measureId).filter(Boolean).filter((m) => (B.benefits || []).some((b) => b.measureId === m));
      if (sharedMeasures.length && !exists('overlap', A.id, B.id)) out.push({ type: 'overlap', from: A.id, to: B.id, description: `Both claim benefits on ${sharedMeasures.map((m) => ws.measures.find((x) => x.id === m)?.name).join(', ')}.` });
    }
    for (const r of resource) for (const c of r.cells) if (c.over) { const ps = [...new Set(c.items.map((x) => x.p.id))]; for (let i = 1; i < ps.length; i++) if (!exists('resource', ps[0], ps[i]) && !out.some((o) => o.type === 'resource' && o.to === ps[i])) out.push({ type: 'resource', from: ps[0], to: ps[i], description: `${r.r.name}: demand ${c.total} FTE exceeds capacity ${r.r.capacity} in ${quarterLabel(c.q)}.` }); }
    const cl = changeLoad(ws, progs, quarters[0], quarters[quarters.length - 1]);
    for (const row of cl.rows) for (const c of row.cells) if (c.over) { const ps = [...new Set(c.contributors.map((x) => x.program.id))]; if (ps.length > 1 && !exists('bottleneck', ps[0], ps[1]) && !out.some((o) => o.type === 'bottleneck' && o.from === ps[0] && o.to === ps[1])) out.push({ type: 'bottleneck', from: ps[0], to: ps[1], description: `${row.area.name} change load ${c.load.toFixed(1)} exceeds ${row.area.absorption} in ${quarterLabel(c.q)}.` }); }
    return out;
  }, [ws]); // eslint-disable-line react-hooks/exhaustive-deps

  // Network layout: programs on a circle.
  const W = 560; const H = 380; const R = 140;
  const posOf = Object.fromEntries(progs.map((p, i) => [p.id, { x: W / 2 + R * Math.cos((2 * Math.PI * i) / progs.length - Math.PI / 2), y: H / 2 + R * Math.sin((2 * Math.PI * i) / progs.length - Math.PI / 2) }]));
  // Timeline with delay propagation (DEP-03).
  const minD = progs.map((p) => p.startDate).filter(Boolean).sort()[0] || todayISO();
  const maxD = progs.map((p) => p.endDate).filter(Boolean).sort().pop() || addMonths(todayISO(), 24);
  const span = Math.max(1, monthsBetween(minD, maxD) + 2);
  const endOf = (p) => (p.projects || []).map((x) => x.forecastEnd || x.end).filter(Boolean).sort().pop() || p.endDate;

  return (
    <div className="stack">
      <PageHead eyebrow="Portfolio" title="Dependencies and capacity">Programs interact in four ways: sequential dependencies, overlapping outcomes, competition for scarce resources and change bottlenecks. People’s capacity to absorb change is a scarce resource in its own right.</PageHead>
      <div className="grid g-2" data-layout>
        <Card title="Dependency network (DEP-03)" subtitle="Arrows point from predecessor to dependent program">
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Program dependency network">
            <defs>{Object.entries(TYPE_COLOR).map(([k, c]) => <marker key={k} id={`dm-${k}`} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={c} /></marker>)}</defs>
            {deps.map((d) => { const a = posOf[d.from]; const b = posOf[d.to]; if (!a || !b) return null; const dx = b.x - a.x; const dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1; const x2 = b.x - (dx / L) * 26; const y2 = b.y - (dy / L) * 26; return <g key={d.id} {...bind(`${DEPENDENCY_TYPES.find((t) => t.id === d.type)?.label}: ${d.description}`)}><line x1={a.x + (dx / L) * 26} y1={a.y + (dy / L) * 26} x2={x2} y2={y2} stroke={TYPE_COLOR[d.type]} strokeWidth={d.severity === 'high' ? 3 : 2} markerEnd={d.type === 'sequential' ? `url(#dm-${d.type})` : undefined} strokeDasharray={d.type === 'overlap' ? '6 4' : d.type === 'bottleneck' ? '2 4' : undefined} /><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="12" /></g>; })}
            {progs.map((p) => { const q = posOf[p.id]; return <g key={p.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/programs/${p.id}`)} tabIndex={0} role="link" aria-label={p.name}><circle cx={q.x} cy={q.y} r="24" fill="#fff" stroke="var(--brand-navy)" strokeWidth="2" /><text x={q.x} y={q.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--brand-navy)">{p.code.replace('PRG-', '')}</text><text x={q.x} y={q.y + (q.y > H / 2 ? 40 : -32)} textAnchor="middle" fontSize="10.5" fill="var(--ink-2)">{p.name.length > 26 ? `${p.name.slice(0, 24)}…` : p.name}</text></g>; })}
          </svg>
          <div className="legend inline">{DEPENDENCY_TYPES.map((t) => <span key={t.id}><i className="line" style={{ background: TYPE_COLOR[t.id] }} />{t.label}</span>)}</div>
          {tip}
        </Card>
        <Card title="Timeline and delay propagation (DEP-03)" subtitle="Bars use forecast finish; flags show predecessors finishing after dependents start">
          {progs.filter((p) => p.startDate).map((p) => {
            const s = monthsBetween(minD, p.startDate); const e = monthsBetween(minD, endOf(p) || p.endDate || maxD);
            const preds = deps.filter((d) => d.type === 'sequential' && d.to === p.id).map((d) => ws.programs.find((x) => x.id === d.from)).filter(Boolean);
            const late = preds.filter((x) => endOf(x) && (p.projects || []).some((pr) => pr.start && pr.start < endOf(x)) );
            return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
                <span className="clamp-2">{p.code} {p.name}</span>
                <div style={{ position: 'relative', height: 18, background: '#f3f6fa', borderRadius: 4 }}>
                  <div style={{ position: 'absolute', left: `${(s / span) * 100}%`, width: `${Math.max(1, ((e - s) / span) * 100)}%`, top: 3, height: 12, borderRadius: 4, background: late.length ? 'var(--st-warning)' : 'var(--series-1)' }} title={`${fmtDate(p.startDate)} – ${fmtDate(endOf(p))}`} />
                  {late.length > 0 && <span className="mini" style={{ position: 'absolute', right: 4, top: 1 }}>▲ waits on {late.map((x) => x.code).join(', ')}</span>}
                </div>
              </div>
            );
          })}
          <div className="mini">{fmtDate(minD)} → {fmtDate(maxD)}</div>
        </Card>
      </div>

      <Card title="Interdependency register (DEP-01)" pad={false} actions={<button className="btn btn-sm btn-primary" onClick={() => mutate('Added dependency', (d) => { d.dependencies.push({ id: uid('dep'), type: 'sequential', from: progs[0]?.id, to: progs[1]?.id, description: '', severity: 'medium', ownerId: d.currentUser, resolution: '' }); })}>+ Dependency</button>}>
        <div className="table-wrap"><table className="table compact">
          <thead><tr><th>Type</th><th>From</th><th>To</th><th>Description</th><th>Severity</th><th>Owner</th><th>Resolution</th><th /></tr></thead>
          <tbody>{deps.map((d) => (
            <tr key={d.id}>
              <td><Select value={d.type} onChange={(v) => upd(d.id, 'type', v)} options={DEPENDENCY_TYPES.map((t) => [t.id, t.label])} /></td>
              <td><Select value={d.from} onChange={(v) => upd(d.id, 'from', v)} options={progs.map((p) => [p.id, p.code])} /></td>
              <td><Select value={d.to} onChange={(v) => upd(d.id, 'to', v)} options={progs.map((p) => [p.id, p.code])} /></td>
              <td><TextInput value={d.description} onChange={(v) => upd(d.id, 'description', v)} className="inline-input" /></td>
              <td><Select value={d.severity} onChange={(v) => upd(d.id, 'severity', v)} options={['low', 'medium', 'high']} /></td>
              <td><PersonSelect ws={ws} value={d.ownerId} onChange={(v) => upd(d.id, 'ownerId', v)} /></td>
              <td><TextInput value={d.resolution} onChange={(v) => upd(d.id, 'resolution', v)} className="inline-input" placeholder="Open" /></td>
              <td><button className="btn btn-ghost btn-sm" aria-label="Delete" onClick={() => mutate('Deleted dependency', (x) => { x.dependencies = x.dependencies.filter((y) => y.id !== d.id); })}>✕</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>

      <Card title="Detected candidates (DEP-02)" subtitle="From shared measures, resource demand above capacity and change load above thresholds">
        {!detected.length ? <div className="empty-sm">No new candidates detected.</div> : detected.map((d, i) => <div key={i} className="check-row"><span className="ic" style={{ color: TYPE_COLOR[d.type] }}>●</span><span><strong>{DEPENDENCY_TYPES.find((t) => t.id === d.type)?.label}</strong>: {ws.programs.find((p) => p.id === d.from)?.name} ↔ {ws.programs.find((p) => p.id === d.to)?.name}<div className="mini">{d.description}</div></span><button className="btn btn-sm" onClick={() => mutate('Added detected dependency', (x) => { x.dependencies.push({ id: uid('dep'), ...d, severity: 'medium', ownerId: x.currentUser, resolution: '' }); })}>Add to register</button></div>)}
      </Card>

      <Card title="Scarce roles: demand against capacity (DEP-04)" subtitle="FTE by quarter; outlined cells exceed capacity" pad={false} actions={<button className="btn btn-sm" onClick={() => mutate('Added scarce role', (d) => { d.resources.push({ id: uid('r'), name: 'New scarce role', capacity: 2 }); })}>+ Role</button>}>
        <div className="table-wrap"><table className="table compact heat">
          <thead><tr><th>Role</th><th className="num">Capacity</th>{quarters.map((q) => <th key={q} className="num">{quarterLabel(q)}</th>)}</tr></thead>
          <tbody>{resource.map(({ r, cells }) => {
            const i = ws.resources.indexOf(r);
            return (
              <tr key={r.id}><td><input className="inline-input" value={r.name} onChange={(e) => mutate('Renamed role', (d) => { d.resources[i].name = e.target.value; }, { field: `res:${r.id}` })} aria-label="Role" /></td><td><NumberInput value={r.capacity} onChange={(v) => mutate('Role capacity', (d) => { d.resources[i].capacity = v; }, { field: `resc:${r.id}` })} style={{ width: 60 }} /></td>
                {cells.map((c) => <td key={c.q} className={`hcell ${c.over ? 'over' : ''}`} style={{ background: c.total ? (c.over ? '#fbe3e3' : '#e3eefc') : '#f6f8fb' }} tabIndex={0} {...bind(<><strong>{r.name} · {quarterLabel(c.q)}</strong><div>{c.total} of {r.capacity} FTE</div>{c.items.map((x, k) => <div key={k} className="mini" style={{ color: '#c9d5e6' }}>{x.p.code}: {x.fte}</div>)}</>)}>{c.total ? num(c.total, 1) : ''}{c.over ? ' ▲' : ''}</td>)}
              </tr>
            );
          })}</tbody>
        </table></div>
        <div className="card-body mini">Program demand profiles are recorded per program (role, from and to quarter, FTE). {tip}</div>
      </Card>

      <ChangeHeatmap />

      <Card title="Infrastructure enabling business programs (DEP-06)" subtitle="Rank infrastructure that delivers early business benefits first">
        {ws.programs.filter((p) => p.categoryId === 'infrastructure').map((p) => {
          const enabled = deps.filter((d) => d.from === p.id && d.type === 'sequential').map((d) => ws.programs.find((x) => x.id === d.to)).filter(Boolean);
          return <div key={p.id} className="check-row"><span className="ic">⚙</span><span><strong>{p.name}</strong> enables {enabled.length ? enabled.map((x) => x.name).join(', ') : <span className="sev-warning">no business program — check its rationale</span>}<div className="mini">Owner {personName(ws, p.sponsorId)}</div></span><Pill tone={enabled.length ? 'good' : 'warning'}>{enabled.length} enabled</Pill></div>;
        })}
        <Guidance>Where a program depends on a capability no current program delivers, bring the missing initiative into the dependent program (DEP-07).</Guidance>
      </Card>
    </div>
  );
}
