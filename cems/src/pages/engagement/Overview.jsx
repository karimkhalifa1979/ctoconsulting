// ENG-010 engagement dashboard rolling up all projects.
import { Link } from 'react-router-dom';
import { useEngagement } from './Engagement.jsx';
import { Card, Tile, Table, Rag, Money, Pct, Status, Level, Empty, Meter, Badge, KV } from '../../components/ui.jsx';
import { DIMENSIONS } from '../../../shared/rag.js';
import { fmtMoneyShort, fmtPct, fmtDate } from '../../../shared/format.js';
import { diffDays, monthOf, addMonths } from '../../../shared/dates.js';
import { monthLabel } from '../../components/charts.jsx';

export default function Overview() {
  const { d, costs, lookups } = useEngagement();
  const fin = d.fin;
  const name = (id) => lookups?.users?.find((u) => u.id === id)?.label;
  return (
    <div className="stack">
      {fin && (
        <div className="grid g-6">
          <Tile label="Contract value" value={fmtMoneyShort(fin.contractValue)} sub={fin.pendingChanges?.count ? `${fin.pendingChanges.count} changes pending (${fmtMoneyShort(fin.pendingChanges.price)})` : 'Including approved variations'} />
          <Tile label="Invoiced" value={fmtMoneyShort(fin.invoicedToDate)} sub={`Remaining ${fmtMoneyShort(fin.remainingValue)}`} />
          <Tile label="Fees to date" value={fmtMoneyShort(fin.feesToDate)} sub={`As at ${fmtDate(fin.asAt)}`} />
          <Tile label="Fees at completion" value={fmtMoneyShort(fin.forecastFeesAtCompletion)} sub="Forecast" />
          {costs ? <Tile label="Forecast margin" value={fmtPct(fin.forecastMargin, 1)} sub={`Baseline ${fmtPct(fin.baselineMargin, 1)}`} tone={fin.forecastMargin < 0.25 ? 'bad' : fin.forecastMargin < 0.4 ? 'warn' : 'good'} /> : <Tile label="Hours to date" value={Math.round(fin.hours || 0).toLocaleString('en-AU')} />}
          <Tile label="PO consumed" value={fmtPct(fin.poConsumedPct)} sub={fin.poExhaustionDate ? `Runs out ${fmtDate(fin.poExhaustionDate)}` : 'No exhaustion forecast'} tone={fin.poExhaustionBeforeEnd ? 'bad' : fin.poConsumedPct > 0.75 ? 'warn' : ''} />
        </div>
      )}
      <Card title="Projects" sub="Overall and dimension ratings from the latest submitted status update; suggested ratings are calculated (BR-03)." flush>
        <Table rows={d.projects} columns={[
          { key: 'rag', label: 'Overall', render: (p) => <Rag v={p.rag} /> },
          { key: 'name', label: 'Project', render: (p) => <div><Link className="strong" to={`/projects/${p.id}`}>{p.name}</Link><div className="small muted">{p.code} · {name(p.manager_id)}{p.stage ? ` · ${p.stage}` : ''}</div></div> },
          { key: 'state', label: 'State', render: (p) => <Status v={p.state} /> },
          ...DIMENSIONS.map((dim) => ({ key: dim.key, label: dim.label.split(' ')[0], sort: false, render: (p) => <span title={p.suggested ? `Suggested: ${p.suggested[dim.key]}` : ''}><Rag v={p.ratings?.[dim.key]} sm /></span> })),
          { key: 'percent', label: '% done', num: true, render: (p) => <Pct v={p.percent} /> },
          { key: 'next', label: 'Next milestone', sort: (p) => p.next_milestone?.date || 'z', render: (p) => (p.next_milestone ? <span className="small">{p.next_milestone.name}<br /><span className="muted">{fmtDate(p.next_milestone.date)} · {p.next_milestone.status}</span></span> : '—') },
          { key: 'fees', label: 'Fees at completion', num: true, sort: (p) => p.fin?.forecastFeesAtCompletion || 0, render: (p) => <Money v={p.fin?.forecastFeesAtCompletion} /> },
          costs ? { key: 'margin', label: 'Margin', num: true, sort: (p) => p.fin?.forecastMargin ?? -1, render: (p) => <Pct v={p.fin?.forecastMargin} d={1} /> } : null,
        ].filter(Boolean)} />
      </Card>
      <div className="grid g-2">
        <Card title="Roadmap" sub="Project stages and key milestones.">
          <Roadmap rows={d.roadmap} />
        </Card>
        <Card title="Health by dimension" sub={`Engagement health: ${d.health?.rag || 'not rated'}${d.health?.overridden ? ' (overridden)' : ` · rule: ${d.health?.rule === 'budget_weighted' ? 'budget-weighted' : 'worst project'}`}`}>
          <div className="grid g-3">
            {[...DIMENSIONS, { key: 'overall', label: 'Overall' }].map((dim) => <div key={dim.key} className="flex"><Rag v={d.dimensions[dim.key] !== 'Green' || d.projects.some((p) => p.ratings) ? d.dimensions[dim.key] : null} sm /><span className="small">{dim.label}</span></div>)}
          </div>
          <h4 className="mt-3 mb-1">Reporting obligations (ENG-014)</h4>
          <KV items={[
            ['Cadence', d.obligations.cadence],
            ['Last issued report', d.obligations.lastIssued ? <>{fmtDate(d.obligations.lastIssued)} {d.obligations.compliant ? <Badge tone="green">On track</Badge> : <Badge tone="red">Overdue</Badge>}</> : <Badge tone="amber">None issued</Badge>],
            ['Reports issued', d.obligations.reportsIssued],
            ['Last steering committee', fmtDate(d.obligations.lastSteerco)],
            ['Next steering committee', fmtDate(d.obligations.nextSteerco)],
          ]} />
        </Card>
      </div>
      <div className="grid g-3">
        <Card title="Milestones in the next four weeks">
          {!d.milestones.length ? <Empty>No milestones due.</Empty> : (
            <ul className="list">{d.milestones.map((m) => <li key={m.id}><div className="grow"><Link to={`/projects/${m.project_id}/plan`}>{m.name}</Link><div className="small muted">{m.project} · {fmtDate(m.forecast_date || m.planned_date)}{m.baseline_date && m.forecast_date > m.baseline_date ? ` (baseline ${fmtDate(m.baseline_date)})` : ''}</div></div><Status v={m.status} /></li>)}</ul>
          )}
        </Card>
        <Card title="Top risks" actions={<Link className="btn btn-sm" to="raid">RAID</Link>}>
          {!d.risks.length ? <Empty>No open risks.</Empty> : (
            <ul className="list">{d.risks.map((r) => <li key={r.id}><Level v={r.residual_level || r.inherent_level} /><div className="grow"><Link to={r.project_id ? `/projects/${r.project_id}/raid?open=${r.id}&entity=risk` : `raid?open=${r.id}&entity=risk`}>{r.ref} {r.title}</Link><div className="small muted">{name(r.owner_id)}{r.escalated ? ' · escalated' : ''}{r.review_overdue ? ' · review overdue' : ''}</div></div></li>)}</ul>
          )}
        </Card>
        <Card title="Open issues">
          {!d.issues.length ? <Empty>No open issues.</Empty> : (
            <ul className="list">{d.issues.map((i) => <li key={i.id}><Level v={i.severity} /><div className="grow"><Link to={i.project_id ? `/projects/${i.project_id}/raid?open=${i.id}&entity=issue` : `raid?open=${i.id}&entity=issue`}>{i.ref} {i.title}</Link><div className="small muted">Target {fmtDate(i.target_date)}{i.overdue ? ' · overdue' : ''}</div></div></li>)}</ul>
          )}
        </Card>
      </div>
      <div className="grid g-3">
        <Card title="Change requests in progress" actions={<Link className="btn btn-sm" to="changes">Change log</Link>}>
          {!d.changes.length ? <Empty>No open changes.</Empty> : (
            <ul className="list">{d.changes.map((c) => <li key={c.id}><div className="grow"><Link to={c.project_id ? `/projects/${c.project_id}/changes?open=${c.id}&entity=change` : `changes?open=${c.id}&entity=change`}>{c.ref} {c.title}</Link><div className="small muted">{c.impact_price ? fmtMoneyShort(c.impact_price) : 'No price impact'}{c.impact_schedule_days ? ` · ${c.impact_schedule_days} days` : ''} · {c.approval_level}</div></div><Status v={c.status} /></li>)}</ul>
          )}
        </Card>
        <Card title="Purchase orders">
          {!fin?.po?.length ? <Empty>No purchase orders.</Empty> : (
            <ul className="list">{fin.po.map((p) => (
              <li key={p.id}><div className="grow"><div className="flex between"><b>PO {p.number}</b><span className="small"><Money v={p.value} /> {p.gst_basis === 'inclusive' ? 'inc GST' : 'ex GST'}</span></div><Meter value={p.consumedPct || 0} /><div className="tiny muted">{fmtPct(p.consumedPct)} consumed{p.exhaustionDate ? ` · runs out ${fmtDate(p.exhaustionDate)}` : ''}{p.exhaustsBeforeEnd ? ' — before the planned end' : ''}</div></div></li>
            ))}</ul>
          )}
        </Card>
        <Card title="Dependencies to watch" sub="Overdue client dependencies and cross-project links (ENG-008).">
          {!d.dependencies.length ? <Empty>None.</Empty> : (
            <ul className="list">{d.dependencies.map((x) => <li key={x.id}><div className="grow"><Link to={x.project_id ? `/projects/${x.project_id}/raid?open=${x.id}&entity=dependency` : `raid?open=${x.id}&entity=dependency`}>{x.ref} {x.title}</Link><div className="small muted">{x.provider} · need by {fmtDate(x.need_by)}</div></div>{x.overdue ? <Badge tone="red">Overdue</Badge> : <Status v={x.status} />}</li>)}</ul>
          )}
        </Card>
      </div>
      <Card title="Team" sub={`${d.team.count} people allocated`} actions={<Link className="btn btn-sm" to="team">Team and access</Link>}>
        <div className="chips">{d.team.rows.slice(0, 30).map((t, i) => <span className="chip" key={i}>{t.name}{t.role ? ` · ${t.role}` : ''}{t.key_person ? ' ★' : ''}</span>)}</div>
      </Card>
    </div>
  );
}

// Simple roadmap: one row per project with stage segments and key milestone markers.
function Roadmap({ rows }) {
  const all = rows.flatMap((r) => [r.start, r.end, ...r.milestones.map((m) => m.date)]).filter(Boolean).sort();
  if (!all.length) return <Empty>No projects yet.</Empty>;
  const start = all[0];
  const end = all.at(-1);
  const span = Math.max(1, diffDays(start, end));
  const pos = (dt) => `${Math.max(0, Math.min(100, (diffDays(start, dt) / span) * 100))}%`;
  const months = [];
  for (let m = monthOf(start); m <= monthOf(end); m = addMonths(m, 1)) months.push(m);
  const step = Math.ceil(months.length / 8);
  const today = new Date().toISOString().slice(0, 10);
  const tone = { Complete: '#9fb3c8', Active: '#2a78d6', 'Not started': '#cfd9e5' };
  return (
    <div className="stack-sm">
      <div style={{ position: 'relative', height: 16, marginLeft: 150 }}>
        {months.filter((_, i) => i % step === 0).map((m) => <span key={m} className="tiny muted" style={{ position: 'absolute', left: pos(`${m}-01` < start ? start : `${m}-01`) }}>{monthLabel(m)}</span>)}
      </div>
      {rows.map((r) => (
        <div key={r.id} className="flex" style={{ alignItems: 'center' }}>
          <Link to={`/projects/${r.id}`} className="small" style={{ width: 142, flex: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>{r.name}</Link>
          <div style={{ position: 'relative', height: 22, flex: 1, background: 'var(--surface-2)', borderRadius: 4 }}>
            {today >= start && today <= end && <span style={{ position: 'absolute', left: pos(today), top: -2, bottom: -2, width: 2, background: 'var(--brand-teal)' }} title="Today" />}
            {(r.stages.length ? r.stages : [{ name: r.name, start: r.start, end: r.end, status: 'Active' }]).filter((s) => s.start && s.end).map((s, i) => (
              <span key={i} title={`${s.name}: ${fmtDate(s.start)} – ${fmtDate(s.end)} (${s.status})`} style={{ position: 'absolute', left: pos(s.start), width: `calc(${pos(s.end)} - ${pos(s.start)} - 2px)`, top: 5, height: 12, borderRadius: 3, background: tone[s.status] || '#cfd9e5' }} />
            ))}
            {r.milestones.map((m, i) => <span key={i} title={`${m.name}: ${fmtDate(m.date)} (${m.status})`} style={{ position: 'absolute', left: pos(m.date), top: 4, width: 11, height: 11, marginLeft: -5, transform: 'rotate(45deg)', background: m.status === 'Achieved' ? '#1e8e3e' : ['Missed', 'Forecast late'].includes(m.status) ? '#c62828' : '#0b1f3a', border: '2px solid #fff' }} />)}
          </div>
        </div>
      ))}
      <div className="legend"><span><i className="box" style={{ background: '#9fb3c8' }} />Complete stage</span><span><i className="box" style={{ background: '#2a78d6' }} />Active stage</span><span><i className="box" style={{ background: '#cfd9e5' }} />Not started</span><span>◆ key milestone (green achieved, red late)</span></div>
    </div>
  );
}

