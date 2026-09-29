import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/store.jsx';
import { Card, Stat, BarList, Donut, Gauge, StatusBar, LevelBadge, includesAll } from '../components/ui.jsx';
import { computeStats } from '../lib/assessment.js';
import { buildEvents, eventDeadlinesFor } from '../lib/calendar.js';
import { SECTOR_TYPES, INDUSTRIES } from '../lib/profile.js';

export const LEVEL_COLORS = { mandatory: 'var(--series-1)', conditional: 'var(--series-2)', recommended: 'var(--series-3)' };

export function levelMap(org) {
  return Object.fromEntries((org.sources || []).map((s) => [s.name, s.level]));
}

function tally(list, fn) {
  const m = {};
  for (const x of list) { const k = fn(x) || 'Unspecified'; m[k] = (m[k] || 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
}

export default function Dashboard() {
  const { org, data, assessments, docs } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const levels = useMemo(() => levelMap(org), [org]);
  const stats = useMemo(() => computeStats(data.requirements, assessments), [data, assessments]);
  const events = useMemo(() => buildEvents({ org, data, assessments, docs }), [org, data, assessments, docs]);
  const today = new Date().toISOString().slice(0, 10);
  const in90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.date >= today).slice(0, 7);
  const overdue = events.filter((e) => e.date < today && (e.kind === 'remediation' || e.kind === 'exemption'));
  const next90 = events.filter((e) => e.date >= today && e.date <= in90).length;

  const byLevel = ['mandatory', 'conditional', 'recommended'].map((l) => ({ label: l[0].toUpperCase() + l.slice(1), value: data.obligations.filter((o) => (o.level || levels[o.name]) === l).length, color: LEVEL_COLORS[l] })).filter((x) => x.value);
  const bySource = tally(data.obligations, (o) => o.name);
  const byPolicy = tally(data.obligations, (o) => data.policies[o.policyCode]?.title || o.policyCode);
  const byPublisher = tally(data.obligations, (o) => (o.publisher || '').split(/\s*[/;]\s*/)[0]);
  const byPriority = ['Critical', 'High', 'Medium', 'Low'].map((p) => ({ label: p, value: data.requirements.filter((r) => r.priority === p).length })).filter((x) => x.value);
  const sources = (org.sources || []).filter((s) => s.selected !== false);
  const shownSources = sources.filter((s) => includesAll(`${s.name} ${s.publisher} ${s.reason} ${s.level}`, q));
  const policyCount = Object.keys(data.policies).length;
  const sector = SECTOR_TYPES.find((s) => s.id === org.profile?.sectorType)?.label;
  const inds = (org.profile?.industries || []).map((i) => INDUSTRIES.find((x) => x.id === i)?.label).filter(Boolean);

  return (
    <div className="stack">
      <div className="hero">
        <div className="eyebrow" style={{ color: '#7fd6de' }}>Regulatory obligations dashboard</div>
        <h1>{org.name}</h1>
        <div style={{ marginTop: 6, position: 'relative', zIndex: 1 }}>
          {sector}{inds.length ? ` · ${inds.join(', ')}` : ''}{org.profile?.states?.length ? ` · ${org.profile.states.length === 8 ? 'National' : org.profile.states.join(', ')}` : ''}
        </div>
        <div className="kpis">
          <div><strong className="tabular">{sources.length}</strong><span>Applicable sources</span></div>
          <div><strong className="tabular">{data.obligations.length.toLocaleString()}</strong><span>Obligations</span></div>
          <div><strong className="tabular">{data.requirements.length}</strong><span>Policy requirements</span></div>
          <div><strong className="tabular">{policyCount}</strong><span>Target policies</span></div>
          <div><strong className="tabular">{stats.score === null ? '—' : `${stats.score}%`}</strong><span>Compliance score</span></div>
          <div><strong className="tabular">{next90}</strong><span>Deadlines in 90 days</span></div>
        </div>
      </div>

      <div className="grid g-3">
        <Card title="Obligations by applicability" subtitle="How each obligation applies to this organisation">
          <Donut items={byLevel} center={data.obligations.length.toLocaleString()} sub="obligations" />
        </Card>
        <Card title="Control assessment" subtitle={`${stats.assessed} of ${stats.total} requirements assessed (${stats.coverage}%)`} actions={<Link className="btn btn-sm" to="/assessment">Assess</Link>}>
          <div className="row" style={{ justifyContent: 'center' }}><Gauge value={stats.score} size={180} /></div>
          <StatusBar counts={stats.byStatus} total={stats.total} />
        </Card>
        <Card title="Upcoming regulatory deadlines" actions={<Link className="btn btn-sm" to="/calendar">Calendar</Link>}>
          {overdue.length > 0 && <div className="callout warn small" style={{ marginBottom: 10 }}>{overdue.length} overdue exemption or remediation item{overdue.length > 1 ? 's' : ''}</div>}
          <div className="stack" style={{ gap: 8 }}>
            {upcoming.map((e) => (
              <div key={e.id} className="row small" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <span className="badge badge-navy tabular">{e.date}</span>
                <span className="clamp-2">{e.title}{e.indicative ? <span className="muted"> (indicative)</span> : ''}</span>
              </div>
            ))}
            {!upcoming.length && <span className="muted">No scheduled items.</span>}
          </div>
          {eventDeadlinesFor(org).length > 0 && <p className="small muted" style={{ marginBottom: 0 }}>+ {eventDeadlinesFor(org).length} event-driven deadlines (e.g. breach and incident notification).</p>}
        </Card>
      </div>

      <div className="grid g-2">
        <Card title="Obligations by source" subtitle={`Top 12 of ${bySource.length} sources — select a bar to filter the register`}>
          <BarList items={bySource.map((b) => ({ ...b, color: LEVEL_COLORS[levels[b.label]] }))} limit={12} onClick={(it) => nav(`/obligations?source=${encodeURIComponent(it.label)}`)} />
          <div className="legend">{Object.entries(LEVEL_COLORS).map(([k, c]) => <span key={k}><i style={{ background: c }} />{k[0].toUpperCase() + k.slice(1)}</span>)}</div>
        </Card>
        <Card title="Obligations by target policy" subtitle="Suggested policy that gives effect to each obligation">
          <BarList items={byPolicy} onClick={(it) => nav(`/obligations?policy=${encodeURIComponent(it.label)}`)} />
        </Card>
      </div>

      <div className="grid g-3">
        <Card title="Obligations by publisher / regulator"><BarList items={byPublisher} limit={10} /></Card>
        <Card title="Requirements by priority"><BarList items={byPriority} /></Card>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignContent: 'start' }}>
          <Stat label="Findings" value={stats.findings} sub="Partial, largely or non-compliant" accent />
          <Stat label="Exemptions" value={(data.exemptions || []).length} sub="Recorded in the register" accent />
          <Stat label="ISM controls" value={new Set(data.requirements.flatMap((r) => r.ismList || [])).size} sub="Linked to requirements" accent />
          <Stat label="Policy docs" value={Object.keys(docs || {}).length} sub={`of ${policyCount} authored`} accent />
        </div>
      </div>

      <Card title="Applicable obligation sources" subtitle="Legislation, mandatory policies and standards discovered for this organisation" pad={false}
        actions={<input type="search" placeholder="Filter sources…" value={q} onChange={(e) => setQ(e.target.value)} />}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Source</th><th>Applicability</th><th>Why it applies</th><th>Publisher</th><th className="nowrap">Obligations</th></tr></thead>
            <tbody>
              {shownSources.map((s) => (
                <tr key={s.name} className="clickable" onClick={() => nav(`/obligations?source=${encodeURIComponent(s.name)}`)}>
                  <td><strong>{s.name}</strong>{s.origin === 'ai' && <span className="badge badge-teal" style={{ marginLeft: 6 }}>AI</span>}</td>
                  <td><LevelBadge level={s.level} /></td>
                  <td className="small">{s.reason}</td>
                  <td className="small muted">{s.publisher}</td>
                  <td className="tabular">{data.obligations.filter((o) => o.name === s.name).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
