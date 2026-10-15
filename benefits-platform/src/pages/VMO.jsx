import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, personName } from '../lib/store.jsx';
import { STATES } from '../lib/config.js';
import { summaries } from '../lib/portfolio.js';
import { sortChecks } from '../lib/rules.js';
import { PageHead, Card, Pill, PersonSelect, TextArea, StackBar, ChecksList, includesAll, Tabs } from '../components/ui.jsx';
import { money, pct, todayISO, quarterKey, daysBetween } from '../lib/util.js';

export default function VMO() {
  const { ws, updateProgram } = useApp();
  const nav = useNavigate();
  const s = summaries(ws);
  const [tab, setTab] = useState('queue');
  const [q, setQ] = useState('');
  const live = ws.programs.filter((p) => !['withdrawn'].includes(p.state));
  const queue = ws.programs.flatMap((p) => (p.valueCases || []).filter((v) => ['draft', 'in-review', 'submitted'].includes(v.status)).map((v) => ({ p, v }))).sort((a, b) => (b.v.reviewCycles || 0) - (a.v.reviewCycles || 0));
  const exceptions = live.flatMap((p) => s.get(p.id).checks.filter((c) => c.severity === 'error' || ['GOV-03', 'PRJ-05', 'GOV-07', 'BR-23', 'GDA-04', 'MEA-11'].includes(c.rule)).map((c) => ({ ...c, program: p.name, pid: p.id })));
  const lastQ = quarterKey(todayISO());
  const prevQ = (() => { const [y, n] = lastQ.split('-Q').map(Number); return n === 1 ? `${y - 1}-Q4` : `${y}-Q${n - 1}`; })();
  // Data quality (DAT-07): completeness, timeliness, ranges, orphans.
  const dq = [];
  for (const p of live) {
    for (const b of p.benefits) {
      if (!b.ownerId) dq.push({ severity: 'error', rule: 'Completeness', text: `${p.code} “${b.title}” has no owner`, program: p.name });
      if (!b.measureId) dq.push({ severity: 'warning', rule: 'Completeness', text: `${p.code} “${b.title}” has no measure`, program: p.name });
      if ((b.actuals || []).length && ['harvesting', 'completed'].includes(p.state) && !(b.actuals || []).some((a) => a.period >= prevQ)) dq.push({ severity: 'warning', rule: 'Timeliness', text: `${p.code} “${b.title}” actuals overdue (last ${b.actuals.map((a) => a.period).sort().pop()})`, program: p.name });
      for (const a of b.actuals || []) if (a.value === '' || a.value === null) dq.push({ severity: 'info', rule: 'Missing value', text: `${p.code} “${b.title}” ${a.period} has no value (shown as a gap, not zero)`, program: p.name });
      if (b.type !== 'nonfinancial' && (b.actuals || []).some((a) => Number(a.value) < 0)) dq.push({ severity: 'warning', rule: 'Range', text: `${p.code} “${b.title}” has a negative actual`, program: p.name });
    }
    if (!p.projects.length && ['active', 'harvesting'].includes(p.state)) dq.push({ severity: 'warning', rule: 'Orphan', text: `${p.code} is active but has no projects`, program: p.name });
  }
  for (const m of ws.measures) if (m.active !== false && !m.ownerId) dq.push({ severity: 'error', rule: 'MEA-03', text: `Measure “${m.name}” is active without an owner`, program: '—' });
  const statusOverdue = live.filter((p) => ['active', 'definition'].includes(p.state)).filter((p) => { const last = (p.statusReports || []).map((r) => r.date).sort().pop(); return !last || daysBetween(last, todayISO()) > 35; });

  // Estimating accuracy (VMO-05): value-case figures at the gate vs current.
  const accuracy = ws.programs.flatMap((p) => (p.valueCases || []).filter((v) => v.figures).map((v) => ({ p, v, now: s.get(p.id) }))).concat(ws.programs.flatMap((p) => (p.projects || []).filter((x) => (x.estimates || []).length).map((x) => ({ p, project: x }))));
  const kb = useMemo(() => {
    if (!q.trim()) return [];
    const out = [];
    for (const l of ws.lessons) if (includesAll(`${l.lesson} ${l.context} ${l.tags.join(' ')}`, q)) out.push({ kind: 'Lesson', text: l.lesson, sub: ws.programs.find((p) => p.id === l.programId)?.name, to: `/programs/${l.programId}/logs` });
    for (const p of ws.programs) {
      if (includesAll(`${p.name} ${p.purpose} ${p.problem} ${p.scope}`, q)) out.push({ kind: 'Program', text: `${p.code} ${p.name}`, sub: p.purpose, to: `/programs/${p.id}` });
      for (const v of p.valueCases || []) if (includesAll(`${p.name} ${Object.values(v.narrative || {}).join(' ')} ${(v.reviewComments || []).map((c) => c.text).join(' ')}`, q)) out.push({ kind: 'Value case', text: `${p.name} v${v.version} (${v.gate})`, sub: v.status, to: `/programs/${p.id}/business-case` });
      for (const e of p.chain?.elements || []) if (includesAll(e.title, q)) out.push({ kind: 'Benefits map element', text: `${e.code} ${e.title}`, sub: p.name, to: `/programs/${p.id}/map` });
    }
    return out.slice(0, 40);
  }, [q, ws]);

  return (
    <div className="stack">
      <PageHead eyebrow="Governance" title="Value office workspace">The value management office runs the process: it watches program value (not just project cost), coaches teams, reviews value cases independently, tracks funds and keeps the archive — as coach, not methodology police.</PageHead>
      <div className="kpi-grid">
        <div className="card stat accent"><div className="label">Review queue</div><div className="value">{queue.length}</div><div className="sub">{queue.filter((x) => (x.v.reviewCycles || 0) > ws.settings.thresholds.reviewCycles).length} over the review-cycle limit</div></div>
        <div className="card stat"><div className="label">Exceptions</div><div className="value">{exceptions.length}</div><div className="sub">blocking rules, tolerances, overdue gates</div></div>
        <div className="card stat"><div className="label">Data-quality issues</div><div className="value">{dq.length}</div></div>
        <div className="card stat"><div className="label">Status reports overdue</div><div className="value">{statusOverdue.length}</div></div>
        <div className="card stat"><div className="label">Funds approved / spent</div><div className="value" style={{ fontSize: 20 }}>{money(live.reduce((a, p) => a + s.get(p.id).funding, 0))} / {money(live.reduce((a, p) => a + s.get(p.id).spend, 0))}</div></div>
      </div>
      <Card title="Programs by stage"><StackBar segments={STATES.map((st) => ({ label: st.label, value: ws.programs.filter((p) => p.state === st.id).length, color: st.color }))} /></Card>
      <Tabs value={tab} onChange={setTab} tabs={[['queue', 'Review queue'], ['exceptions', 'Exceptions'], ['dq', 'Data quality'], ['analysts', 'Analysts and coaching'], ['funds', 'Funds'], ['accuracy', 'Estimating accuracy'], ['kb', 'Knowledge base']]} />
      {tab === 'queue' && <Card pad={false}><div className="table-wrap"><table className="table"><thead><tr><th>Program</th><th>Version</th><th>Status</th><th className="num">Review cycles</th><th>Latest comment</th><th>Analyst</th></tr></thead><tbody>{queue.map(({ p, v }) => <tr key={v.id} className="clickable" onClick={() => nav(`/programs/${p.id}/business-case`)}><td><strong>{p.code}</strong> {p.name}</td><td>v{v.version} · {v.gate}</td><td><Pill tone={v.status === 'in-review' ? 'warning' : v.status === 'submitted' ? 'progress' : 'none'}>{v.status}</Pill></td><td className="num">{v.reviewCycles || 0}{(v.reviewCycles || 0) > ws.settings.thresholds.reviewCycles && <> <Pill tone="warning">BR-23</Pill></>}</td><td className="small">{v.reviewComments?.slice(-1)[0]?.text || '—'}</td><td>{personName(ws, p.analystId)}</td></tr>)}</tbody></table></div>{!queue.length && <div className="empty-sm">Queue empty.</div>}</Card>}
      {tab === 'exceptions' && <Card subtitle="From the rules engine across all live programs"><ChecksList checks={sortChecks(exceptions)} /></Card>}
      {tab === 'dq' && <Card subtitle="DAT-07 — completeness, timeliness, ranges and orphan records"><ChecksList checks={sortChecks(dq)} />{statusOverdue.length > 0 && <div className="callout warn" style={{ marginTop: 10 }}>Status reports overdue (PRG-06): {statusOverdue.map((p) => p.name).join(', ')}</div>}</Card>}
      {tab === 'analysts' && <Card title="Value analyst assignments (VMO-02)" pad={false}><div className="table-wrap"><table className="table compact"><thead><tr><th>Program</th><th>Value analyst</th><th>Coaching notes</th><th>Independent VMO assessment</th></tr></thead><tbody>{live.map((p) => <tr key={p.id}><td><strong>{p.code}</strong> {p.name}</td><td><PersonSelect ws={ws} value={p.analystId} onChange={(v) => updateProgram(p.id, (x) => { x.analystId = v; }, 'Value analyst assigned')} /></td><td><TextArea rows={2} value={p.coaching} onChange={(v) => updateProgram(p.id, (x) => { x.coaching = v; }, 'Coaching notes', { field: 'coaching' })} /></td><td><TextArea rows={2} value={p.vmoAssessment} onChange={(v) => updateProgram(p.id, (x) => { x.vmoAssessment = v; }, 'VMO assessment', { field: 'vmoAssessment' })} /></td></tr>)}</tbody></table></div></Card>}
      {tab === 'funds' && <Card title="Program funds (VMO-03)" pad={false}><div className="table-wrap"><table className="table compact"><thead><tr><th>Program</th><th className="num">Approved (tranches)</th><th className="num">Spent</th><th className="num">Remaining</th><th className="num">Lifetime forecast</th><th>Use of tranche</th></tr></thead><tbody>{live.map((p) => { const x = s.get(p.id); return <tr key={p.id}><td><strong>{p.code}</strong> {p.name}</td><td className="num">{money(x.funding)}</td><td className="num">{money(x.spend)}</td><td className={`num ${x.funding - x.spend < 0 ? 'neg' : ''}`}>{money(x.funding - x.spend)}</td><td className="num">{money(x.fin.totalCosts)}</td><td>{x.funding ? <Pill tone={x.spend / x.funding > 1 + ws.settings.thresholds.contingency ? 'critical' : x.spend / x.funding > 0.85 ? 'warning' : 'good'}>{pct(x.spend / x.funding)}</Pill> : '—'}</td></tr>; })}</tbody></table></div></Card>}
      {tab === 'accuracy' && <Card title="Estimating accuracy (VMO-05, RP-12)" subtitle="Value-case figures at the gate compared with today, and project estimates by gate" pad={false}><div className="table-wrap"><table className="table compact"><thead><tr><th>Program</th><th>Basis</th><th className="num">Estimate</th><th className="num">Now</th><th className="num">Variance</th></tr></thead><tbody>
        {accuracy.map((a, i) => a.v ? <tr key={i}><td>{a.p.name}</td><td>Value case v{a.v.version} ({a.v.gate}) — NPV</td><td className="num">{money(a.v.figures.npv)}</td><td className="num">{money(a.now.fin.npv)}</td><td className="num">{a.v.figures.npv ? pct((a.now.fin.npv - a.v.figures.npv) / Math.abs(a.v.figures.npv)) : '—'}</td></tr> : <tr key={i}><td>{a.p.name}</td><td>{a.project.name} — {a.project.estimates.map((e) => `${e.gate} ${money(e.cost)}`).join(' → ')}</td><td className="num">{money(a.project.estimates[0].cost)}</td><td className="num">{money(Number(a.project.forecast) || a.project.actual)}</td><td className="num">{pct(((Number(a.project.forecast) || a.project.actual) - a.project.estimates[0].cost) / a.project.estimates[0].cost)}</td></tr>)}
      </tbody></table></div><div className="card-body mini">Use these to calibrate future estimates; first estimates are routinely optimistic.</div></Card>}
      {tab === 'kb' && <Card title="Knowledge base (VMO-04)" subtitle="Search past value cases, benefits maps, programs and lessons"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. vendor, baseline, contact centre" style={{ width: '100%' }} aria-label="Search the knowledge base" />{kb.map((r, i) => <div key={i} className="check-row" style={{ cursor: 'pointer' }} onClick={() => nav(r.to)}><span className="ic">⌕</span><span><strong>{r.kind}:</strong> {r.text}<div className="mini">{r.sub}</div></span><span /></div>)}{q && !kb.length && <div className="empty-sm">No matches.</div>}</Card>}
    </div>
  );
}
