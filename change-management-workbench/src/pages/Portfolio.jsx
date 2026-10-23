// Portfolio (PRT-001 to PRT-005): the change heatmap and calendar across initiatives, change load and
// saturation by impacted group and period, comparison of initiatives by risk, readiness and adoption,
// stakeholders engaged by several initiatives, and the libraries shared for reuse.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, Spinner, ErrorBox, Kpi, Rag, RiskBadge, Seg } from '../ui/core.jsx';
import DataGrid from '../ui/DataGrid.jsx';
import { ColumnChart, HeatScale, SEQ, SERIES } from '../charts/index.jsx';
import { useApp } from '../state/app.jsx';
import { useTab } from '../lib/hooks.js';
import { fmtDate, fmtNum, fmtPct, label, RAG_LABEL } from '../lib/format.js';
import { QUADRANT_LABELS } from '../../shared/rules/stakeholders.js';
import { asArray, sortBy, uniq, plural } from '../../shared/util.js';

const MEASURES = [
  { id: 'impact', label: 'Aggregate impact', short: 'Impact', get: (c) => c.impact, fmt: (v) => fmtNum(v) },
  { id: 'initiatives', label: 'Initiatives', short: 'Initiatives', get: (c) => c.initiatives.length, fmt: (v) => fmtNum(v) },
  { id: 'hours', label: 'Hours per person', short: 'Hours', get: (c) => c.hours, fmt: (v) => fmtNum(v, 1) },
];
const UNITS = [{ id: 'month', label: 'Months' }, { id: 'quarter', label: 'Quarters' }, { id: 'week', label: 'Weeks' }];

export default function Portfolio() {
  const { api } = useApp();
  const [tab, setTab] = useTab('heatmap');
  const [q, setQ] = useState({ unit: 'month', from: '', to: '', includeClosed: false });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    setData(null);
    api.op('portfolio', { unit: q.unit, includeClosed: q.includeClosed, from: q.from ? `${q.from}-01` : undefined, to: q.to ? `${q.to}-28` : undefined }).then((d) => { setData(d); setError(null); }).catch(setError);
  }, [api, q]);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  return (
    <>
      <PageHead eyebrow="Enterprise change" title="Portfolio">
        The combined effect of every initiative on each impacted group over time, where change load exceeds the saturation thresholds, how initiatives compare, and the stakeholders several initiatives rely on.
      </PageHead>
      <Tabs value={tab} onChange={setTab} label="Portfolio" tabs={[
        { id: 'heatmap', label: 'Change heatmap', icon: 'grid' },
        { id: 'calendar', label: 'Change calendar', icon: 'calendar' },
        { id: 'compare', label: 'Compare initiatives', icon: 'scale' },
        { id: 'shared', label: 'Shared stakeholders', icon: 'users', count: data?.shared.length || null },
        { id: 'reuse', label: 'Shared libraries', icon: 'book' },
      ]} />
      {['heatmap', 'calendar'].includes(tab) && <Controls q={q} setQ={setQ} />}
      {!data ? <Spinner label="Combining initiatives" /> : (
        <>
          {tab === 'heatmap' && <HeatmapView data={data} />}
          {tab === 'calendar' && <CalendarView data={data} />}
          {tab === 'compare' && <CompareView data={data} />}
          {tab === 'shared' && <SharedView data={data} />}
          {tab === 'reuse' && <ReuseView />}
        </>
      )}
    </>
  );
}

function Controls({ q, setQ }) {
  return (
    <div className="toolbar-row mb-4">
      <Seg label="Period" options={UNITS} value={q.unit} onChange={(unit) => setQ({ ...q, unit })} />
      <label className="field field-inline"><span>From</span><input type="month" value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} /></label>
      <label className="field field-inline"><span>To</span><input type="month" value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={q.includeClosed} onChange={(e) => setQ({ ...q, includeClosed: e.target.checked })} /><span>Include closed initiatives</span></label>
    </div>
  );
}

// --- Heatmap and saturation (PRT-001, PRT-002) -------------------------------------------------------------
function HeatmapView({ data }) {
  const [measure, setMeasure] = useState('impact');
  const [sel, setSel] = useState(null);
  const def = MEASURES.find((x) => x.id === measure);
  const max = Math.max(1, ...data.rows.flatMap((r) => r.cells.map((c) => def.get(c) || 0)));
  const step = (v) => (!v ? 0 : Math.min(7, 1 + Math.floor((v / max) * 6.999)));
  const saturated = data.rows.flatMap((r) => r.cells.filter((c) => c.saturated).map((c) => ({ r, c })));
  const satGroups = uniq(saturated.map((x) => x.r.key));
  const byPeriod = data.periods.map((p) => ({ p, n: saturated.filter((x) => x.c.period === p.key).length }));
  const peak = sortBy(byPeriod.filter((x) => x.n), '-n')[0];
  const t = data.thresholds;
  const selected = sel && data.rows.find((r) => r.key === sel.row)?.cells.find((c) => c.period === sel.period);
  const selRow = sel && data.rows.find((r) => r.key === sel.row);
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="Impacted groups" value={data.rows.length} sub={`across ${plural(data.comparison.length, 'initiative')}`} />
        <Kpi label="Group-periods over a threshold" value={saturated.length} tone={saturated.length ? 'critical' : undefined} sub={saturated.length ? `${plural(satGroups.length, 'group')} affected` : 'No saturation'} />
        <Kpi label="Peak period" value={peak ? peak.p.label : '—'} sub={peak ? `${plural(peak.n, 'group')} over a threshold` : 'No period over a threshold'} />
      </div>
      <Card title="Change heatmap" sub={`${def.label} for each impacted group by ${data.unit}. Groups with the same name or stakeholder group are combined across initiatives. Select a cell for the detail.`} flush
        actions={<Seg label="Measure" options={MEASURES.map((m) => ({ id: m.id, label: m.short }))} value={measure} onChange={setMeasure} />}>
        {!data.rows.length ? <Empty icon="grid" title="No impacted groups">Record impacted groups and impacts in each initiative to see the combined change load.</Empty> : (
          <div className="heat-wrap">
            <table className="heat sat-heat">
              <caption className="sr-only">{def.label} by impacted group and period; cells over a saturation threshold are marked</caption>
              <thead><tr><th scope="col">Impacted group</th><th scope="col" className="num">People</th>{data.periods.map((p) => <th key={p.key} scope="col" className="col">{p.label}</th>)}</tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row"><span>{r.name}</span><span className="sub-line tiny muted">{plural(r.initiatives.length, 'initiative')}</span></th>
                    <td className="num small">{r.headcount ? fmtNum(r.headcount) : '—'}</td>
                    {r.cells.map((c) => {
                      const v = def.get(c) || 0;
                      const s = step(v);
                      const isSel = sel?.row === r.key && sel?.period === c.period;
                      return (
                        <td key={c.period} className={`cell ${c.saturated ? 'sat' : ''} ${isSel ? 'sel' : ''} ${v ? '' : 'empty'}`} style={v ? { background: SEQ[s], color: `var(--seq-ink-${s})` } : undefined}
                          tabIndex={0} role="button" aria-pressed={isSel} aria-label={`${r.name}, ${data.periods.find((p) => p.key === c.period)?.label}: ${def.label} ${def.fmt(v)}${c.saturated ? `, over threshold: ${c.reasons.join('; ')}` : ''}`}
                          title={`${def.label}: ${def.fmt(v)}${c.items.length ? ` · ${c.items.map((i) => i.initiative).join(', ')}` : ''}${c.saturated ? `\nOver threshold: ${c.reasons.join('; ')}` : ''}`}
                          onClick={() => setSel(isSel ? null : { row: r.key, period: c.period })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(isSel ? null : { row: r.key, period: c.period }); } }}>
                          {v ? def.fmt(v) : '–'}{c.saturated && <Icon name="alert" size={12} className="sat-icon" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="legend card-pad" style={{ paddingTop: 8 }}>
          <HeatScale steps={SEQ.slice(1)} labels={['Lower', 'Higher']} />
          <span><i className="sat-swatch" />Over a saturation threshold</span>
          <span className="small muted">Thresholds: more than {t.maxInitiatives} initiatives, aggregate impact above {t.maxAggregateImpact}, or more than {t.maxHoursPerPersonPerMonth} hours per person a month (set in Administration).</span>
        </div>
      </Card>
      {selected && (
        <Card title={`${selRow.name} · ${data.periods.find((p) => p.key === sel.period)?.label}`} sub={selected.saturated ? `Over threshold: ${selected.reasons.join('; ')}.` : 'Within the saturation thresholds.'} actions={<button type="button" className="btn btn-sm btn-ghost" aria-label="Close detail" onClick={() => setSel(null)}><Icon name="x" /></button>}>
          {!selected.items.length ? <p className="small muted">No change lands on this group in this period.</p> : (
            <table className="tbl tbl-compact">
              <thead><tr><th>Initiative</th><th className="num">Highest impact</th><th className="num">Hours per person</th><th>Aspects changing</th></tr></thead>
              <tbody>{selected.items.map((i) => <tr key={i.initiativeId}><td><Link to={`/i/${i.initiativeId}/impact`}>{i.initiative}</Link></td><td className="num">{i.impact || '—'}</td><td className="num">{fmtNum(i.hours, 1)}</td><td className="small">{uniq(asArray(i.aspects)).join(', ') || '—'}</td></tr>)}</tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}

// --- Calendar (PRT-001) --------------------------------------------------------------------------------------
function CalendarView({ data }) {
  const { config } = useApp();
  const months = data.periods;
  const inis = uniq(data.milestones.map((m) => m.initiative));
  const colour = Object.fromEntries(inis.map((n, i) => [n, SERIES[i % SERIES.length]]));
  return (
    <div className="stack">
      <Card title="Change calendar" sub="Releases, go-lives and other milestones of every initiative, with the impacted groups over a saturation threshold in each period." flush>
        {inis.length > 0 && <div className="legend card-pad" style={{ paddingBottom: 0 }}>{inis.map((n) => <span key={n}><i style={{ background: colour[n] }} />{n}</span>)}</div>}
        <div className="cal-months">
          {months.map((p) => {
            const ms = data.milestones.filter((m) => m.date >= p.start && m.date <= p.end);
            const sat = data.rows.filter((r) => r.cells.find((c) => c.period === p.key)?.saturated);
            return (
              <section key={p.key} className={`cal-month ${data.today >= p.start && data.today <= p.end ? 'current' : ''}`} aria-label={p.label}>
                <h3>{p.label}</h3>
                {!ms.length && !sat.length && <p className="tiny muted">Nothing scheduled.</p>}
                <ul>
                  {ms.map((m) => (
                    <li key={`${m.initiativeId}:${m.id}`} className={m.kind === 'goLive' ? 'golive' : ''}>
                      <i style={{ background: colour[m.initiative] }} aria-hidden="true" />
                      <span><span className="tiny muted nowrap">{fmtDate(m.date, { short: true })}</span> <Link to={`/i/${m.initiativeId}/setup?tab=milestones`}>{m.name}</Link><span className="sub-line tiny muted">{m.initiative} · {label('milestoneKind', m.kind, config)}</span></span>
                    </li>
                  ))}
                </ul>
                {sat.length > 0 && <div className="cal-sat"><Icon name="alert" size={13} />{sat.map((r) => r.name).join(', ')} over threshold</div>}
              </section>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// --- Comparison (PRT-003) --------------------------------------------------------------------------------------
function CompareView({ data }) {
  const rows = sortBy(data.comparison, 'name');
  return (
    <div className="stack">
      <Card title="Readiness, adoption and engagement coverage" sub="Readiness index, adoption (individual performance measures against target) and stakeholders engaged within cadence, for each initiative.">
        {rows.length ? <ColumnChart periods={rows.map((r) => ({ key: r.id, label: r.shortName || r.name, values: { readiness: r.readiness ?? 0, adoption: r.adoption ?? 0, coverage: r.engagementCoverage ?? 0 } }))}
          series={[{ key: 'readiness', label: 'Readiness', color: SERIES[0] }, { key: 'adoption', label: 'Adoption', color: SERIES[1] }, { key: 'coverage', label: 'Engagement coverage', color: SERIES[2] }]} format={(v) => `${fmtNum(v)}%`} ariaLabel="Readiness, adoption and engagement coverage by initiative" /> : <Empty icon="scale" title="No initiatives to compare" />}
      </Card>
      <DataGrid id="portfolio-compare" type="initiative" title="Initiative comparison" rows={rows} exportName="Initiative comparison"
        columns={[
          { key: 'name', label: 'Initiative', render: (r) => <span><Link to={`/i/${r.id}`} onClick={(e) => e.stopPropagation()}><strong>{r.shortName || r.name}</strong></Link><span className="sub-line tiny muted">{r.status === 'closed' ? 'Closed' : `${r.phase} · ${r.stage}`}</span></span>, value: (r) => r.name },
          { key: 'rag', label: 'Status', render: (r) => (r.status === 'closed' ? <Badge>Closed</Badge> : <Rag value={r.rag} text={RAG_LABEL[r.rag]} />), value: (r) => r.rag },
          { key: 'risk', label: 'Risk profile', render: (r) => (r.riskProfile ? <span className="row" style={{ flexWrap: 'nowrap' }}><RiskBadge rating={r.riskProfile} /><span className="tiny muted">{r.pct != null ? `PCT ${r.pct}` : ''}</span></span> : '—'), value: (r) => ({ high: 3, medium: 2, low: 1 }[r.riskProfile] || 0) },
          { key: 'readiness', label: 'Readiness', align: 'num', render: (r) => fmtPct(r.readiness), value: (r) => r.readiness ?? -1 },
          { key: 'adoption', label: 'Adoption', align: 'num', render: (r) => fmtPct(r.adoption), value: (r) => r.adoption ?? -1 },
          { key: 'coverage', label: 'Coverage', align: 'num', render: (r) => fmtPct(r.engagementCoverage), value: (r) => r.engagementCoverage ?? -1 },
          { key: 'high', label: 'High-impact groups', align: 'num', render: (r) => r.highImpactGroups ?? '—', value: (r) => r.highImpactGroups ?? -1 },
          { key: 'people', label: 'People impacted', align: 'num', render: (r) => fmtNum(r.headcount), value: (r) => r.headcount ?? -1 },
          { key: 'golive', label: 'Go-lives', render: (r) => <span className="small">{asArray(r.goLives).map((g) => fmtDate(g.date)).join(', ') || '—'}</span>, value: (r) => asArray(r.goLives)[0]?.date || '' },
        ]} />
    </div>
  );
}

// --- Shared stakeholders (PRT-004) ------------------------------------------------------------------------------
function SharedView({ data }) {
  const { settings } = useApp();
  const limit = (settings.load?.stakeholderMaxPer7Days ?? 3) * 4;
  return (
    <DataGrid id="portfolio-shared" type="stakeholder" title="Stakeholders engaged by several initiatives" rows={data.shared.map((s) => ({ ...s, id: s.stakeholderId }))} exportName="Shared stakeholders"
      columns={[
        { key: 'name', label: 'Stakeholder', render: (s) => <span><Link to={`/stakeholders/${s.stakeholderId}`} onClick={(e) => e.stopPropagation()}><strong>{s.name}</strong></Link><span className="sub-line tiny muted">{s.position}</span></span>, value: (s) => s.name },
        { key: 'initiatives', label: 'Initiatives', render: (s) => <span className="btn-row">{s.initiatives.map((i) => <Badge key={i.id} title={i.cadenceDays ? `Engage every ${i.cadenceDays} days` : ''}>{i.name}{i.quadrant ? ` · ${QUADRANT_LABELS[i.quadrant]}` : ''}</Badge>)}</span>, value: (s) => s.initiatives.length },
        { key: 'upcoming', label: 'Planned, next 30 days', align: 'num', render: (s) => (s.upcoming > limit ? <Badge tone="warning" icon="alert" title={`More than ${limit} engagements in 30 days`}>{s.upcoming}</Badge> : s.upcoming), value: (s) => s.upcoming },
        { key: 'last30', label: 'Engaged, last 30 days', align: 'num', render: (s) => s.last30, value: (s) => s.last30 },
      ]}
      empty={<Empty icon="users" title="No stakeholder is shared">Stakeholders who appear in more than one initiative, and their combined engagement load, are listed here.</Empty>} />
  );
}

// --- Shared libraries (PRT-005) -----------------------------------------------------------------------------------
function ReuseView() {
  const { api, templates, config, user } = useApp();
  const [messages, setMessages] = useState(null);
  useEffect(() => { api.op('enterpriseMessages', {}).then(setMessages).catch(() => setMessages([])); }, [api]);
  const published = templates.filter((t) => t.state === 'published');
  const libraries = [
    { to: '/stakeholders', icon: 'users', title: 'Stakeholder master', text: 'One record per person and group, reused by every initiative, with duplicate checks on entry and import.' },
    { to: '/lessons', icon: 'lightbulb', title: 'Lessons learned', text: 'Lessons from every initiative, searchable by category, phase and keyword.' },
    { to: user.roles?.includes('admin') ? '/admin/templates' : '/help#templates', icon: 'file', title: `Artefact templates (${published.length} published)`, text: 'Organisation templates for every artefact in the catalogue, with branding, sections and tagged Word templates.' },
    { to: user.roles?.includes('admin') ? '/admin/library' : '/help', icon: 'target', title: `Intervention library (${asArray(config?.interventions).length})`, text: 'Interventions for each ADKAR element, suggested when a group\'s barrier point is identified.' },
  ];
  return (
    <div className="stack">
      <div className="grid g-2">
        {libraries.map((l) => <Link key={l.title} className="tile-link" to={l.to}><Icon name={l.icon} /><span><strong>{l.title}</strong><span className="small muted sub-line" style={{ whiteSpace: 'normal' }}>{l.text}</span></span></Link>)}
      </div>
      <h2 className="mt-2">Key message library</h2>
      {!messages ? <Spinner /> : (
        <DataGrid id="enterprise-messages" type="keyMessage" title="Key message library" rows={messages} exportName="Key message library"
          columns={[
            { key: 'title', label: 'Message', render: (m) => <span><strong>{m.title}</strong><span className="sub-line small" style={{ whiteSpace: 'normal', maxWidth: 560 }}>{m.text}</span></span>, value: (m) => `${m.title} ${m.text}` },
            { key: 'focus', label: 'Focus', render: (m) => label('messageFocus', m.messageFocus, config) || '—', value: (m) => m.messageFocus || '' },
            { key: 'initiative', label: 'From', render: (m) => <Link to={`/i/${m.initiativeId}/comms?tab=messages`} onClick={(e) => e.stopPropagation()}>{m.initiativeName}</Link>, value: (m) => m.initiativeName },
            { key: 'version', label: 'Version', align: 'num', render: (m) => m.messageVersion || 1, value: (m) => m.messageVersion || 1 },
          ]}
          empty={<Empty icon="megaphone" title="No shared messages yet">Approved key messages marked for enterprise reuse appear here for other initiatives to adapt.</Empty>} />
      )}
    </div>
  );
}
