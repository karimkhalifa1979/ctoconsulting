// Dashboards and standard reports for one initiative (RPT-001 to RPT-003, RPT-006): role-based views
// for the change management lead, sponsor, project manager and people managers, and the standard
// reports, each filterable, drillable to the underlying records and exportable to Excel and CSV.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, StatusBadge, Spinner, Kpi, Rag, BarrierBadge, RiskBadge } from '../../ui/core.jsx';
import DataGrid from '../../ui/DataGrid.jsx';
import { BarChart, ColumnChart, StackedBars, GapChart, Heatmap, LineChart, adkarFill, adkarInk, SERIES } from '../../charts/index.jsx';
import { ImpactTimeline } from './Impact.jsx';
import { AlertList } from './Overview.jsx';
import { cadenceBadge } from './Stakeholders.jsx';
import { trainingIndex } from './Training.jsx';
import { managersOf } from './Managers.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, fmtNum, fmtPct, label, RAG_LABEL } from '../../lib/format.js';
import { ADKAR, adkarLabel } from '../../../shared/refdata.js';
import { QUADRANT_LABELS } from '../../../shared/rules/stakeholders.js';
import { MEASURE_STATUS_LABELS } from '../../../shared/rules/measures.js';
import { addDays, addMonths, periodRange, monthKey, weekStart } from '../../../shared/dates.js';
import { asArray, sortBy, round, uniq } from '../../../shared/util.js';
import { hasRole } from '../../../shared/access.js';
import { STANDARD_REPORTS } from '../../../shared/reporting.js';

const ROLE_VIEWS = [
  { id: 'lead', label: 'Change management lead' },
  { id: 'sponsor', label: 'Sponsor' },
  { id: 'pm', label: 'Project manager' },
  { id: 'manager', label: 'People manager' },
];

export default function Dashboards() {
  const { m, user, base } = useIniPage();
  const preferred = hasRole(user, 'changeLead') || hasRole(user, 'practitioner') ? 'lead' : hasRole(user, 'sponsor') ? 'sponsor' : hasRole(user, 'pm') ? 'pm' : hasRole(user, 'peopleManager') ? 'manager' : 'lead';
  const [tab, setTab] = useTab(preferred, 'view');
  if (!m) return <Spinner />;
  return (
    <>
      <PageHead eyebrow="Track performance" title="Dashboards and reports" actions={<><Link className="btn" to={`${base}/artefacts?type=steeringPack`}><Icon name="file" />Steering pack</Link><Link className="btn" to={`${base}/artefacts?tab=schedules`}><Icon name="clock" />Schedule distribution</Link></>}>
        Role-based dashboards and the standard reports. Select any figure or row to see the records behind it; export any report to Excel or CSV.
      </PageHead>
      <Tabs value={tab} onChange={setTab} label="Dashboards" tabs={[...ROLE_VIEWS, { id: 'reports', label: 'Standard reports', icon: 'report' }]} />
      {tab === 'lead' && <LeadView />}
      {tab === 'sponsor' && <SponsorView />}
      {tab === 'pm' && <PmView />}
      {tab === 'manager' && <ManagerView />}
      {tab === 'reports' && <StandardReports />}
    </>
  );
}

// --- Report definitions (RPT-002) ------------------------------------------------------------------
// Each report returns a chart, the rows behind it (with columns for filtering and export) and where a
// row drills down to.

const BUILDERS = { coverage: coverageReport, plannedActual: plannedActualReport, gap: gapReport, adkar: adkarReport, impact: impactReport, comms: commsReport, training: trainingReport, resistance: resistanceReport, readiness: readinessReport, progress: progressReport, risks: risksReport, actions: actionsReport, sponsor: sponsorReport, agents: agentsReport, measures: measuresReport };
const REPORTS = STANDARD_REPORTS.map((r) => ({ ...r, build: BUILDERS[r.id] }));

function coverageReport(m, { base }) {
  const persons = m.profiles.filter((p) => p.person && p.cadenceDays);
  const quads = ['manageClosely', 'keepSatisfied', 'keepInformed', 'monitor'];
  const data = quads.map((q) => {
    const xs = persons.filter((p) => p.quadrant === q);
    return { key: q, label: QUADRANT_LABELS[q], value: xs.length ? round((xs.filter((p) => !p.cadence.overdue).length / xs.length) * 100) : 0, sub: `${xs.filter((p) => !p.cadence.overdue).length} of ${xs.length} within cadence` };
  }).filter((d) => d.sub !== '0 of 0 within cadence');
  return {
    summary: m.kpis.engagementCoverage != null ? `${m.kpis.engagementCoverage}% of stakeholders with a required cadence were engaged within it; ${m.kpis.outsideCadence} are outside cadence.` : 'No stakeholder has a required cadence yet.',
    chart: <BarChart data={data} max={100} unit="%" format={(v) => fmtNum(v)} threshold={m.settings.rag.greenFrom} ariaLabel="Engaged within cadence by quadrant" />,
    columns: [
      { key: 'name', label: 'Stakeholder', render: (p) => <strong>{p.name}</strong>, value: (p) => p.name },
      { key: 'quadrant', label: 'Quadrant', render: (p) => QUADRANT_LABELS[p.quadrant] || '—', value: (p) => QUADRANT_LABELS[p.quadrant] || '' },
      { key: 'cadence', label: 'Required every', align: 'num', render: (p) => `${p.cadenceDays} days`, value: (p) => p.cadenceDays },
      { key: 'last', label: 'Last engaged', render: (p) => fmtDate(p.cadenceBasis) || 'Never', value: (p) => p.cadenceBasis || '' },
      { key: 'next', label: 'Next planned', render: (p) => fmtDate(p.nextPlanned) || '—', value: (p) => p.nextPlanned || '' },
      { key: 'status', label: 'Cadence', render: (p) => cadenceBadge(p, m.today), value: (p) => (p.cadence.overdue ? 'Outside cadence' : 'Within cadence') },
    ],
    rows: persons,
    drill: (p) => `${base}/stakeholders/${p.stakeholderId}`,
    facets: [{ key: 'q', label: 'Quadrant', options: quads.map((q) => ({ id: q, label: QUADRANT_LABELS[q] })), value: (p) => p.quadrant }, { key: 'st', label: 'Cadence', options: [{ id: 'in', label: 'Within cadence' }, { id: 'out', label: 'Outside cadence' }], value: (p) => (p.cadence.overdue ? 'out' : 'in') }],
  };
}

function plannedActualReport(m, { base, today }) {
  const periods = periodRange(addMonths(today, -5), addMonths(today, 2), 'month');
  const live = m.engagements.filter((e) => e.status !== 'cancelled');
  const data = periods.map((p) => ({
    key: p.key, label: p.label,
    values: {
      planned: live.filter((e) => e.plannedDate && monthKey(e.plannedDate) === p.key).length,
      completed: live.filter((e) => e.done && e.actualDate && monthKey(e.actualDate) === p.key).length,
      unplanned: live.filter((e) => e.done && e.actualDate && monthKey(e.actualDate) === p.key && (e.unplanned || !e.planItemId)).length,
    },
  }));
  const from = periods[0]?.start || today;
  const rows = live.filter((e) => (e.plannedDate || e.actualDate || '') >= from);
  return {
    summary: `In the last 30 days ${m.kpis.plannedCompletedLast30} of ${m.kpis.plannedLast30} planned engagements were completed; ${m.kpis.completedLast30} engagements were completed in total.`,
    chart: <ColumnChart periods={data} series={[{ key: 'planned', label: 'Planned', color: SERIES[0] }, { key: 'completed', label: 'Completed', color: SERIES[1] }, { key: 'unplanned', label: 'Completed without a plan', color: SERIES[2] }]} ariaLabel="Planned and completed engagements by month" />,
    columns: [
      { key: 'date', label: 'Date', render: (e) => fmtDate(e.date), value: (e) => e.date || '' },
      { key: 'label', label: 'Engagement', render: (e) => <strong>{e.label}</strong>, value: (e) => e.label },
      { key: 'audience', label: 'With', render: (e) => e.audienceLabel, value: (e) => e.audienceLabel },
      { key: 'type', label: 'Type', render: (e) => label('engagementType', e.engagementType, m.config), value: (e) => label('engagementType', e.engagementType, m.config) },
      { key: 'planned', label: 'Planned', render: (e) => (e.planItemId && !e.unplanned ? 'Planned' : 'Unplanned'), value: (e) => (e.planItemId && !e.unplanned ? 'Planned' : 'Unplanned') },
      { key: 'status', label: 'Status', render: (e) => <StatusBadge status={e.status} labelText={label('engagementStatus', e.status, m.config)} />, value: (e) => label('engagementStatus', e.status, m.config) },
    ],
    rows: sortBy(rows, '-date'),
    drill: (e) => `${base}/engagement?tab=log&open=engagement:${e.id}`,
  };
}

function gapReport(m, { base }) {
  const ps = m.profiles.filter((p) => p.person && p.gap != null);
  return {
    summary: `${ps.filter((p) => p.gap > 0).length} stakeholders are below their desired engagement level; ${ps.filter((p) => p.priorityFlag).length} have a gap of two or more levels.`,
    chart: ps.length ? <GapChart profiles={sortBy(ps, (p) => -p.gap).slice(0, 15)} /> : <Empty title="No engagement levels recorded, or you cannot see them" />,
    columns: [
      { key: 'name', label: 'Stakeholder', render: (p) => <strong>{p.name}</strong>, value: (p) => p.name },
      { key: 'current', label: 'Current', render: (p) => label('engagementLevel', p.currentEngagement, m.config), value: (p) => label('engagementLevel', p.currentEngagement, m.config) },
      { key: 'desired', label: 'Desired', render: (p) => label('engagementLevel', p.desiredEngagement, m.config), value: (p) => label('engagementLevel', p.desiredEngagement, m.config) },
      { key: 'gap', label: 'Gap (levels)', align: 'num', render: (p) => (p.gap >= 2 ? <Badge tone="serious">{p.gap}</Badge> : p.gap), value: (p) => p.gap },
      { key: 'priority', label: 'Priority score', align: 'num', render: (p) => p.priority ?? '—', value: (p) => p.priority ?? '' },
    ],
    rows: sortBy(ps, (p) => -p.gap),
    drill: (p) => `${base}/stakeholders/${p.stakeholderId}`,
  };
}

function adkarReport(m, { base }) {
  const t = m.settings.adkar.threshold;
  const rows = m.groups.flatMap((g) => g.adkarResults.filter((r) => !r.suppressed).map((r) => ({ id: `${g.id}:${r.id || r.date}`, g, r })));
  const trend = ADKAR.map((el, i) => ({ key: el.id, label: el.label, color: SERIES[i], points: m.groups.length ? uniq(rows.map((x) => x.r.date)).sort().map((d) => { const vals = rows.filter((x) => x.r.date === d && x.r.scores[el.id] != null).map((x) => x.r.scores[el.id]); return vals.length ? { date: d, value: round(vals.reduce((a, b) => a + b, 0) / vals.length, 2) } : null; }).filter(Boolean) : [] }));
  return {
    summary: `${m.groups.filter((g) => g.barrierPoint && g.barrierPoint !== 'none').length} of ${m.groups.length} groups have a barrier point. Scores at or below ${t} are below the barrier threshold.`,
    chart: (
      <div className="stack">
        <Heatmap rows={m.groups.map((g) => ({ key: g.id, label: g.name, g }))} cols={[...ADKAR.map((a) => ({ key: a.id, label: a.label })), { key: '_bp', label: 'Barrier point' }]}
          value={(r, c) => (c.key === '_bp' ? (r.g.barrierPoint ? (r.g.barrierPoint === 'none' ? 'None' : adkarLabel(r.g.barrierPoint)) : null) : r.g.adkar?.scores?.[c.key] ?? null)}
          fill={(v, r, c) => (c.key === '_bp' ? (v === 'None' ? 'var(--st-good-soft)' : 'var(--st-critical-soft)') : adkarFill(v, t))} ink={(v, r, c) => (c.key === '_bp' ? 'var(--ink)' : adkarInk(v, t))} format={(v) => (typeof v === 'number' ? v.toFixed(1) : v)} caption="ADKAR results by group" />
        <h4 className="mt-2">Average across groups over time</h4>
        <LineChart series={trend.filter((s) => s.points.length)} yMin={1} yMax={5} threshold={t} thresholdLabel="Threshold" ariaLabel="ADKAR trend" />
      </div>
    ),
    columns: [
      { key: 'group', label: 'Group', render: (x) => x.g.name, value: (x) => x.g.name },
      { key: 'date', label: 'Date', render: (x) => fmtDate(x.r.date), value: (x) => x.r.date },
      { key: 'round', label: 'Round', render: (x) => label('assessmentRound', x.r.round, m.config), value: (x) => label('assessmentRound', x.r.round, m.config) },
      ...ADKAR.map((a) => ({ key: a.id, label: a.label, align: 'num', render: (x) => (x.r.scores[a.id] != null ? Number(x.r.scores[a.id]).toFixed(1) : '—'), value: (x) => x.r.scores[a.id] })),
      { key: 'bp', label: 'Barrier point', render: (x) => <BarrierBadge element={x.r.barrierPoint} />, value: (x) => (x.r.barrierPoint === 'none' ? 'None' : adkarLabel(x.r.barrierPoint)) },
    ],
    rows: sortBy(rows, (x) => x.g.name, '-r.date'),
    drill: () => `${base}/adkar`,
  };
}

function impactReport(m, { base }) {
  const rows = m.impacts.map((i) => ({ ...i, groupName: m.groupsById[i.impactedGroupId]?.name || '—' }));
  return {
    summary: `${m.kpis.highImpactGroups} of ${m.groups.length} groups are highly impacted (overall 4 or more); ${rows.length} impacts recorded.`,
    chart: <ImpactTimeline />,
    columns: [
      { key: 'group', label: 'Group', render: (i) => i.groupName, value: (i) => i.groupName },
      { key: 'aspect', label: 'Aspect', render: (i) => label('impactAspect', i.aspect, m.config), value: (i) => label('impactAspect', i.aspect, m.config) },
      { key: 'degree', label: 'Degree', align: 'num', render: (i) => i.degree, value: (i) => i.degree },
      { key: 'desc', label: 'Description', wrap: true, render: (i) => i.description || i.futureState || '—', value: (i) => i.description || i.futureState },
      { key: 'ms', label: 'Milestone', render: (i) => m.byId.milestone[i.milestoneId]?.name || '—', value: (i) => m.byId.milestone[i.milestoneId]?.name || '' },
    ],
    rows,
    drill: () => `${base}/impact`,
  };
}

function commsReport(m, { base, today }) {
  const from = weekStart(today);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(from, i * 7));
  const rows = m.comms.filter((c) => c.status !== 'cancelled' && c.startDate && c.startDate >= addDays(today, -30));
  return {
    summary: `${m.comms.filter((c) => c.commsStatus === 'sent').length} communications sent; ${m.comms.filter((c) => ['approved', 'scheduled'].includes(c.commsStatus)).length} approved or scheduled; ${m.comms.filter((c) => c.commsStatus === 'inReview').length} awaiting approval.`,
    chart: (
      <div className="cal-weeks">
        {weeks.map((w) => {
          const items = m.comms.filter((c) => c.startDate >= w && c.startDate <= addDays(w, 6) && c.status !== 'cancelled');
          return (
            <div key={w} className="cal-week">
              <div className="tiny muted">Week of {fmtDate(w, { short: true })}</div>
              {items.length ? items.map((c) => <div key={c.id} className="small"><StatusBadge status={c.commsStatus} labelText={label('commsStatus', c.commsStatus, m.config)} /> {c.title}</div>) : <div className="tiny muted">—</div>}
            </div>
          );
        })}
      </div>
    ),
    columns: [
      { key: 'date', label: 'Date', render: (c) => fmtDate(c.startDate), value: (c) => c.startDate },
      { key: 'title', label: 'Communication', render: (c) => <strong>{c.title}</strong>, value: (c) => c.title },
      { key: 'audience', label: 'Audience', render: (c) => asArray(c.groupIds).map((g) => m.groupsById[g]?.name).filter(Boolean).join(', ') || c.audience || 'All', value: (c) => asArray(c.groupIds).map((g) => m.groupsById[g]?.name).join(', ') },
      { key: 'sender', label: 'Sender', render: (c) => m.stakeholderName(c.delivererId) || '—', value: (c) => m.stakeholderName(c.delivererId) },
      { key: 'channel', label: 'Channel', render: (c) => c.channel || '—', value: (c) => c.channel },
      { key: 'status', label: 'Status', render: (c) => label('commsStatus', c.commsStatus, m.config), value: (c) => label('commsStatus', c.commsStatus, m.config) },
    ],
    rows: sortBy(rows, 'startDate'),
    drill: (c) => `${base}/comms?open=activity:${c.id}`,
  };
}

function trainingReport(m, { base }) {
  const ix = trainingIndex(m);
  const all = ix.rollup(Object.keys(ix.required));
  const rows = m.groups.filter((g) => g.training.applicable).map((g) => {
    const prof = m.proficiency.filter((p) => p.impactedGroupId === g.id);
    return { id: g.id, g, prof: prof.length, proficient: prof.filter((p) => p.result === 'proficient').length };
  });
  return {
    summary: `Overall completion ${fmtPct(all.pct)} (${all.done} of ${all.need} required completions); ${m.proficiency.filter((p) => p.result === 'proficient').length} of ${m.proficiency.length} proficiency records show proficiency.`,
    chart: <BarChart data={rows.map((r) => ({ key: r.id, label: r.g.name, value: r.g.training.pct ?? 0, sub: `${r.g.training.completed} of ${r.g.training.denominator} fully trained` }))} max={100} unit="%" format={(v) => fmtNum(v)} threshold={90} ariaLabel="Training completion by group" />,
    columns: [
      { key: 'group', label: 'Group', render: (r) => r.g.name, value: (r) => r.g.name },
      { key: 'people', label: 'People in scope', align: 'num', render: (r) => r.g.training.denominator, value: (r) => r.g.training.denominator },
      { key: 'pct', label: 'Completion', align: 'num', render: (r) => fmtPct(r.g.training.pct), value: (r) => r.g.training.pct },
      { key: 'full', label: 'Fully trained', align: 'num', render: (r) => r.g.training.completed, value: (r) => r.g.training.completed },
      { key: 'prof', label: 'Proficiency evidence', align: 'num', render: (r) => r.prof, value: (r) => r.prof },
      { key: 'profPct', label: 'Proficient', align: 'num', render: (r) => (r.prof ? fmtPct((r.proficient / r.prof) * 100) : '—'), value: (r) => (r.prof ? round((r.proficient / r.prof) * 100) : '') },
    ],
    rows,
    drill: () => `${base}/training`,
  };
}

function resistanceReport(m, { base }) {
  const obs = m.resistance.filter((r) => r.kind === 'observed');
  const open = obs.filter((r) => ['open', 'monitoring', 'escalated'].includes(r.status));
  const sev = ['critical', 'high', 'medium', 'low'];
  return {
    summary: `${open.length} open resistance items (${open.filter((r) => r.status === 'escalated').length} escalated); ${m.profiles.filter((p) => p.escalation).length} high-influence stakeholders flagged for escalation.`,
    chart: <StackedBars rows={m.groups.map((g) => ({ key: g.id, label: g.name, values: Object.fromEntries(sev.map((s) => [s, open.filter((r) => r.groupId === g.id && r.severity === s).length])) })).filter((r) => Object.values(r.values).some(Boolean))} series={sev.map((s, i) => ({ key: s, label: label('severity', s, m.config), color: ['var(--st-critical)', 'var(--st-serious)', 'var(--st-warning)', 'var(--seq-3)'][i] }))} ariaLabel="Open resistance by group and severity" />,
    columns: [
      { key: 'code', label: 'ID', render: (r) => r.code, value: (r) => r.code },
      { key: 'title', label: 'Resistance', render: (r) => <strong>{r.title}</strong>, value: (r) => r.title },
      { key: 'group', label: 'Group', render: (r) => m.groupsById[r.groupId]?.name || '—', value: (r) => m.groupsById[r.groupId]?.name || '' },
      { key: 'barrier', label: 'Barrier point', render: (r) => (r.barrierPoint ? adkarLabel(r.barrierPoint) : '—'), value: (r) => (r.barrierPoint ? adkarLabel(r.barrierPoint) : '') },
      { key: 'severity', label: 'Severity', render: (r) => label('severity', r.severity, m.config), value: (r) => label('severity', r.severity, m.config) },
      { key: 'status', label: 'Status', render: (r) => label('resistanceStatus', r.status, m.config), value: (r) => label('resistanceStatus', r.status, m.config) },
    ],
    rows: obs,
    drill: (r) => `${base}/resistance?open=resistance:${r.id}`,
  };
}

function readinessReport(m, { base }) {
  const c = m.readiness;
  return {
    summary: c ? `${c.checklist.name}: ${c.score ?? '—'}% of criteria met. Recommendation: ${c.decision ? label('goNoGo', c.decision, m.config) : 'not yet available'}.` : 'No go-live readiness checklist recorded.',
    chart: <BarChart data={m.groups.filter((g) => g.readiness.index != null).map((g) => ({ key: g.id, label: g.name, value: g.readiness.index, sub: RAG_LABEL[g.rag] }))} max={100} format={(v) => fmtNum(v)} threshold={m.settings.readinessThreshold} colorOf={(d) => (d.value < m.settings.readinessThreshold ? 'var(--st-warning)' : 'var(--series-1)')} ariaLabel="Readiness index by group" />,
    columns: [
      { key: 'group', label: 'Group', render: (g) => g.name, value: (g) => g.name },
      { key: 'index', label: 'Readiness index', align: 'num', render: (g) => g.readiness.index ?? '—', value: (g) => g.readiness.index },
      { key: 'rag', label: 'Status', render: (g) => <Rag value={g.rag} />, value: (g) => RAG_LABEL[g.rag] || 'No data' },
      { key: 'barrier', label: 'Barrier point', render: (g) => <BarrierBadge element={g.barrierPoint} />, value: (g) => (g.barrierPoint ? adkarLabel(g.barrierPoint) : '') },
      { key: 'training', label: 'Training', align: 'num', render: (g) => fmtPct(g.training.pct), value: (g) => g.training.pct },
    ],
    rows: m.groups,
    drill: () => `${base}/measures?tab=readiness`,
  };
}

function progressReport(m, { base }) {
  const p = m.progress;
  return {
    summary: `${p.overall.complete} of ${p.overall.total} activities complete (${fmtPct(p.overall.pct)} average progress); ${p.overall.overdue} overdue.`,
    chart: <StackedBars rows={p.byPlan.map((x) => ({ key: x.plan.id, label: x.plan.label, values: { complete: x.complete, inProgress: x.inProgress, notStarted: Math.max(0, x.total - x.complete - x.inProgress) } }))} series={[{ key: 'complete', label: 'Complete', color: SERIES[1] }, { key: 'inProgress', label: 'In progress', color: SERIES[0] }, { key: 'notStarted', label: 'Not started', color: 'var(--seq-2)' }]} ariaLabel="Plan progress by plan" />,
    columns: [
      { key: 'title', label: 'Activity', render: (a) => <strong>{a.title}</strong>, value: (a) => a.title },
      { key: 'plans', label: 'Plans', render: (a) => asArray(a.plans).map((x) => m.planTypes.find((t) => t.id === x)?.label || x).join(', '), value: (a) => asArray(a.plans).join(', ') },
      { key: 'owner', label: 'Owner', render: (a) => m.userName(a.ownerId) || '—', value: (a) => m.userName(a.ownerId) },
      { key: 'end', label: 'Due', render: (a) => fmtDate(a.endDate || a.startDate), value: (a) => a.endDate || a.startDate || '' },
      { key: 'pct', label: '% complete', align: 'num', render: (a) => (a.status === 'complete' ? 100 : a.percentComplete || 0), value: (a) => (a.status === 'complete' ? 100 : a.percentComplete || 0) },
      { key: 'status', label: 'Status', render: (a) => (a.overdue ? <Badge tone="critical" icon="octagon">Overdue</Badge> : label('activityStatus', a.status, m.config)), value: (a) => (a.overdue ? 'Overdue' : label('activityStatus', a.status, m.config)) },
    ],
    rows: m.activities.filter((a) => a.status !== 'cancelled'),
    drill: (a) => `${base}/plan?open=activity:${a.id}`,
    facets: [{ key: 'st', label: 'Status', options: [{ id: 'overdue', label: 'Overdue' }, { id: 'complete', label: 'Complete' }, { id: 'open', label: 'Not complete' }], value: (a) => (a.overdue ? 'overdue' : a.status === 'complete' ? 'complete' : 'open') }],
  };
}

function risksReport(m, { base }) {
  const open = m.risks.filter((r) => r.status !== 'closed');
  const order = ['extreme', 'high', 'medium', 'low'];
  return {
    summary: `${open.length} open change risks and issues; ${open.filter((r) => ['extreme', 'high'].includes(r.rating)).length} rated high or extreme. Overall change risk profile: ${m.risk.profile ? `${m.risk.profile} risk` : 'not assessed'}.`,
    chart: <BarChart data={order.map((o) => ({ key: o, label: o[0].toUpperCase() + o.slice(1), value: open.filter((r) => r.rating === o).length }))} format={(v) => fmtNum(v)} colorOf={(d) => ({ extreme: 'var(--st-critical)', high: 'var(--st-serious)', medium: 'var(--st-warning)', low: 'var(--st-good)' })[d.key]} ariaLabel="Open risks by rating" />,
    columns: [
      { key: 'code', label: 'ID', render: (r) => r.code, value: (r) => r.code },
      { key: 'title', label: 'Risk or issue', render: (r) => <strong>{r.title}</strong>, value: (r) => r.title },
      { key: 'kind', label: 'Type', render: (r) => (r.kind === 'issue' ? 'Issue' : 'Risk'), value: (r) => r.kind },
      { key: 'rating', label: 'Rating', render: (r) => <RiskBadge rating={r.rating} />, value: (r) => order.indexOf(r.rating) },
      { key: 'owner', label: 'Owner', render: (r) => m.userName(r.ownerId) || '—', value: (r) => m.userName(r.ownerId) },
      { key: 'status', label: 'Status', render: (r) => label('riskStatus', r.status, m.config), value: (r) => label('riskStatus', r.status, m.config) },
    ],
    rows: sortBy(open, (r) => order.indexOf(r.rating)),
    drill: (r) => `${base}/risk?tab=register&open=risk:${r.id}`,
  };
}

function actionsReport(m, { base, today }) {
  const tasks = m.tasks.filter((t) => ['open', 'inProgress'].includes(t.status)).map((t) => ({ ...t, source: 'Task', title: t.title, ownerId: t.assigneeId, due: t.dueDate, type: 'task' }));
  const cas = m.correctiveActions.filter((c) => ['open', 'inProgress'].includes(c.status)).map((c) => ({ ...c, source: 'Corrective action', title: c.action, due: c.dueDate, type: 'correctiveAction' }));
  const rows = [...tasks, ...cas];
  return {
    summary: `${rows.length} open actions; ${rows.filter((r) => r.due && r.due < today).length} overdue.`,
    chart: <BarChart data={uniq(rows.map((r) => r.ownerId)).map((o) => ({ key: o || 'none', label: m.userName(o) || 'Unassigned', value: rows.filter((r) => r.ownerId === o).length, sub: `${rows.filter((r) => r.ownerId === o && r.due && r.due < today).length} overdue` }))} format={(v) => fmtNum(v)} ariaLabel="Open actions by owner" />,
    columns: [
      { key: 'title', label: 'Action', render: (r) => <strong>{r.title}</strong>, value: (r) => r.title },
      { key: 'source', label: 'Source', render: (r) => r.source, value: (r) => r.source },
      { key: 'owner', label: 'Owner', render: (r) => m.userName(r.ownerId) || '—', value: (r) => m.userName(r.ownerId) },
      { key: 'due', label: 'Due', render: (r) => (r.due && r.due < today ? <Badge tone="critical" icon="octagon">{fmtDate(r.due)}</Badge> : fmtDate(r.due) || '—'), value: (r) => r.due || '' },
    ],
    rows: sortBy(rows, (r) => r.due || '9999'),
    drill: (r) => (r.type === 'task' ? '/work' : `${base}/measures?tab=corrective&open=correctiveAction:${r.id}`),
  };
}

function sponsorReport(m, { base, today }) {
  const acts = m.activities.filter((a) => asArray(a.plans).some((p) => p === 'sponsor' || p === 'sponsorCoalition'));
  const periods = periodRange(addMonths(today, -5), addMonths(today, 2), 'month');
  return {
    summary: `${acts.filter((a) => a.status === 'complete').length} of ${acts.length} sponsor activities delivered, ${acts.filter((a) => a.confirmation?.confirmed).length} confirmed by the sponsor; ${acts.filter((a) => a.overdue).length} overdue. Sponsor assessment ${m.risk.sponsorScore != null ? `${m.risk.sponsorScore}/100` : 'not completed'}.`,
    chart: <ColumnChart periods={periods.map((p) => ({ key: p.key, label: p.label, values: { planned: acts.filter((a) => monthKey(a.startDate) === p.key).length, done: acts.filter((a) => a.status === 'complete' && monthKey(a.endDate || a.startDate) === p.key).length } }))} series={[{ key: 'planned', label: 'Planned', color: SERIES[0] }, { key: 'done', label: 'Delivered', color: SERIES[1] }]} ariaLabel="Sponsor activities by month" />,
    columns: [
      { key: 'title', label: 'Activity', render: (a) => <strong>{a.title}</strong>, value: (a) => a.title },
      { key: 'by', label: 'Delivered by', render: (a) => m.stakeholderName(a.delivererId) || '—', value: (a) => m.stakeholderName(a.delivererId) },
      { key: 'date', label: 'Date', render: (a) => fmtDate(a.startDate), value: (a) => a.startDate || '' },
      { key: 'status', label: 'Status', render: (a) => (a.overdue ? <Badge tone="critical" icon="octagon">Overdue</Badge> : label('activityStatus', a.status, m.config)), value: (a) => (a.overdue ? 'Overdue' : label('activityStatus', a.status, m.config)) },
      { key: 'conf', label: 'Confirmed', render: (a) => (a.confirmation?.confirmed ? 'Yes' : '—'), value: (a) => (a.confirmation?.confirmed ? 'Yes' : '') },
    ],
    rows: sortBy(acts, 'startDate'),
    drill: (a) => `${base}/sponsor?open=activity:${a.id}`,
  };
}

function agentsReport(m, { base }) {
  const gs = m.groups.filter((g) => g.agentCoverage.applicable);
  return {
    summary: `${m.agents.filter((a) => a.status === 'active').length} active change agents; ${gs.filter((g) => g.agentCoverage.gap).length} of ${gs.length} groups below their coverage target.`,
    chart: <StackedBars rows={gs.map((g) => ({ key: g.id, label: g.name, values: { have: Math.min(g.agentCoverage.count, g.agentCoverage.target), extra: Math.max(0, g.agentCoverage.count - g.agentCoverage.target), gap: g.agentCoverage.gap } }))} series={[{ key: 'have', label: 'Agents in place', color: SERIES[0] }, { key: 'extra', label: 'Above target', color: SERIES[1] }, { key: 'gap', label: 'Still needed', color: 'var(--st-warning)' }]} ariaLabel="Change agent coverage by group" />,
    columns: [
      { key: 'group', label: 'Group', render: (g) => g.name, value: (g) => g.name },
      { key: 'head', label: 'Headcount', align: 'num', render: (g) => fmtNum(g.headcount), value: (g) => g.headcount },
      { key: 'count', label: 'Agents', align: 'num', render: (g) => g.agentCoverage.count, value: (g) => g.agentCoverage.count },
      { key: 'target', label: 'Target', align: 'num', render: (g) => g.agentCoverage.target, value: (g) => g.agentCoverage.target },
      { key: 'gap', label: 'Gap', align: 'num', render: (g) => (g.agentCoverage.gap ? <Badge tone="warning">{g.agentCoverage.gap}</Badge> : 0), value: (g) => g.agentCoverage.gap },
    ],
    rows: gs,
    drill: () => `${base}/agents?tab=coverage`,
  };
}

function measuresReport(m, { base }) {
  return {
    summary: `${m.measures.filter((x) => x.status === 'onTrack').length} of ${m.measures.length} success measures on track; ${m.measures.filter((x) => x.belowThreshold).length} below their alert threshold.`,
    chart: <BarChart data={m.measures.filter((x) => x.progress != null).map((x) => ({ key: x.id, label: x.name, value: Math.max(0, Math.min(100, x.progress)), sub: `${fmtNum(x.latest, 2)}${x.unit || ''} against ${fmtNum(x.target, 2)}${x.unit || ''}` }))} max={100} unit="%" format={(v) => fmtNum(v)} labelWidth={220} colorOf={(d) => (m.measures.find((x) => x.id === d.key)?.status === 'onTrack' ? 'var(--series-1)' : 'var(--st-warning)')} ariaLabel="Progress from baseline to target" />,
    columns: [
      { key: 'name', label: 'Measure', render: (x) => <strong>{x.name}</strong>, value: (x) => x.name },
      { key: 'cat', label: 'Category', render: (x) => label('measureCategory', x.category, m.config), value: (x) => label('measureCategory', x.category, m.config) },
      { key: 'latest', label: 'Latest', align: 'num', render: (x) => (x.latest != null ? `${fmtNum(x.latest, 2)}${x.unit || ''}` : '—'), value: (x) => x.latest },
      { key: 'target', label: 'Target', align: 'num', render: (x) => `${fmtNum(x.target, 2)}${x.unit || ''}`, value: (x) => x.target },
      { key: 'status', label: 'Status', render: (x) => MEASURE_STATUS_LABELS[x.status], value: (x) => MEASURE_STATUS_LABELS[x.status] },
    ],
    rows: m.measures,
    drill: () => `${base}/measures`,
  };
}

// --- Standard reports ----------------------------------------------------------------------------

function StandardReports() {
  const { m, base, today } = useIniPage();
  const [id, setId] = useTab('coverage', 'report');
  const def = REPORTS.find((r) => r.id === id) || REPORTS[0];
  return (
    <div className="report-layout">
      <nav className="report-nav" aria-label="Standard reports">
        {REPORTS.map((r) => <button key={r.id} type="button" className={r.id === def.id ? 'active' : ''} aria-current={r.id === def.id ? 'page' : undefined} onClick={() => setId(r.id)}>{r.label}</button>)}
      </nav>
      <ReportView key={def.id} def={def} m={m} ctx={{ base, today }} />
    </div>
  );
}

function ReportView({ def, m, ctx }) {
  const navigate = useNavigate();
  const r = useMemo(() => def.build(m, ctx), [def, m, ctx.base, ctx.today]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="stack" style={{ minWidth: 0 }}>
      <Card title={def.label} sub={r.summary}>{r.chart}</Card>
      <DataGrid id={`report-${def.id}`} title={def.label} rows={r.rows.map((x, i) => ({ id: x.id || String(i), ...x }))} columns={r.columns} facets={r.facets || []} savedViews={false}
        exportName={`${m.initiative.shortName || m.initiative.name} ${def.label}`} onRowClick={r.drill ? (row) => navigate(r.drill(row)) : undefined} pageSize={25} />
    </div>
  );
}

// --- Role-based dashboards (RPT-001) -------------------------------------------------------------------

function MiniReport({ id, title, to, height }) {
  const { m, base, today } = useIniPage();
  const def = REPORTS.find((r) => r.id === id);
  const r = useMemo(() => def.build(m, { base, today }), [def, m, base, today]);
  return (
    <Card title={title || def.label} sub={r.summary} actions={<Link className="btn btn-sm" to={to || `${base}/dashboards?view=reports&report=${id}`}>Details</Link>}>
      <div style={height ? { maxHeight: height, overflow: 'hidden' } : undefined}>{r.chart}</div>
    </Card>
  );
}

function LeadView() {
  const { m, base } = useIniPage();
  const k = m.kpis;
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="Engaged within cadence" value={k.engagementCoverage} unit="%" sub={`${k.outsideCadence} outside cadence`} to={`#${base}/dashboards?view=reports&report=coverage`} />
        <Kpi label="Planned engagements done (30 days)" value={k.plannedLast30 ? `${k.plannedCompletedLast30}/${k.plannedLast30}` : '—'} sub={`${k.upcoming14} planned in the next 14 days`} to={`#${base}/dashboards?view=reports&report=plannedActual`} />
        <Kpi label="Average readiness" value={k.readinessAvg} sub={`${k.barrierGroups} groups with a barrier point`} to={`#${base}/dashboards?view=reports&report=readiness`} />
        <Kpi label="Plan progress" value={fmtPct(m.progress.overall.pct)} sub={`${m.progress.overall.overdue} overdue`} tone={m.progress.overall.overdue ? 'warning' : ''} to={`#${base}/dashboards?view=reports&report=progress`} />
        <Kpi label="Open resistance" value={k.openResistance} sub={`${m.profiles.filter((p) => p.escalation).length} escalations`} to={`#${base}/dashboards?view=reports&report=resistance`} />
      </div>
      <div className="grid g-2">
        <MiniReport id="plannedActual" />
        <MiniReport id="readiness" />
        <MiniReport id="coverage" />
        <MiniReport id="progress" />
      </div>
      <Card title="Needs attention" flush><AlertList alerts={m.alerts} base={base} limit={8} /></Card>
    </div>
  );
}

function SponsorView() {
  const { m, base, today } = useIniPage();
  const acts = m.activities.filter((a) => asArray(a.plans).some((p) => p === 'sponsor' || p === 'sponsorCoalition') && a.status !== 'cancelled');
  const due = sortBy(acts.filter((a) => a.status !== 'complete' && (a.startDate || '') <= addDays(today, 30)), 'startDate');
  const decisions = m.narratives.find((n) => n.key === 'decisionsRequired');
  const topRisks = sortBy(m.risks.filter((r) => r.status !== 'closed'), (r) => ['extreme', 'high', 'medium', 'low'].indexOf(r.rating)).slice(0, 5);
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="Overall readiness" value={m.kpis.readinessAvg} sub={<Rag value={m.kpis.readinessAvg == null ? null : m.kpis.readinessAvg >= m.settings.rag.greenFrom ? 'green' : m.kpis.readinessAvg >= m.settings.rag.amberFrom ? 'amber' : 'red'} />} />
        <Kpi label="Groups with a barrier point" value={m.kpis.barrierGroups} sub={`of ${m.groups.length} impacted groups`} />
        <Kpi label="Your activities due in 30 days" value={due.length} sub={`${acts.filter((a) => a.overdue).length} overdue`} tone={acts.some((a) => a.overdue) ? 'critical' : ''} to={`#${base}/sponsor`} />
        <Kpi label="High change risks" value={m.kpis.highRisks} to={`#${base}/dashboards?view=reports&report=risks`} />
      </div>
      <div className="grid g-2">
        <Card title="Where people are on the ADKAR Model" sub="Barrier point by group: the element to work on first" flush>
          <table className="tbl"><tbody>{m.groups.map((g) => <tr key={g.id}><td>{g.name}{g.high && <> <Badge tone="serious">High impact</Badge></>}</td><td><BarrierBadge element={g.barrierPoint} /></td><td><Rag value={g.rag} text={g.readiness.index != null ? String(g.readiness.index) : 'No data'} /></td></tr>)}</tbody></table>
        </Card>
        <Card title="Your sponsor activities" sub="Due in the next 30 days and overdue" flush actions={<Link className="btn btn-sm" to={`${base}/sponsor`}>Roadmap</Link>}>
          {due.length ? <table className="tbl"><tbody>{due.map((a) => <tr key={a.id}><td><strong>{a.title}</strong><span className="tiny muted sub-line">{label('activityStatus', a.status, m.config)}</span></td><td className="nowrap">{a.overdue ? <Badge tone="critical" icon="octagon">{fmtDate(a.startDate)}</Badge> : fmtDate(a.startDate)}</td></tr>)}</tbody></table> : <Empty icon="checkCircle" title="Nothing due" />}
        </Card>
        <Card title="Decisions required">{decisions ? <div className="prose small" dangerouslySetInnerHTML={{ __html: decisions.content }} /> : <Empty title="No decisions recorded" />}</Card>
        <Card title="Top change risks" flush>{topRisks.length ? <table className="tbl"><tbody>{topRisks.map((r) => <tr key={r.id}><td>{r.title}</td><td><RiskBadge rating={r.rating} /></td></tr>)}</tbody></table> : <Empty title="No open risks" />}</Card>
      </div>
    </div>
  );
}

function PmView() {
  const { m, base, today } = useIniPage();
  const upcoming = m.milestones.filter((x) => x.date >= today).slice(0, 6);
  const overdue = m.activities.filter((a) => a.overdue);
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="Change activities complete" value={`${m.progress.overall.complete}/${m.progress.overall.total}`} sub={`${fmtPct(m.progress.overall.pct)} average progress`} />
        <Kpi label="Overdue change activities" value={overdue.length} tone={overdue.length ? 'critical' : 'good'} to={`#${base}/dashboards?view=reports&report=progress`} />
        <Kpi label="Go-live readiness" value={m.readiness ? `${m.readiness.score}%` : '—'} sub={m.readiness?.checklist?.name || 'No checklist'} to={`#${base}/risk?tab=readiness`} />
        <Kpi label="Open change risks" value={m.kpis.openRisks} sub={`${m.kpis.highRisks} high or extreme`} />
      </div>
      <div className="grid g-2">
        <Card title="Upcoming milestones and readiness" flush actions={<Link className="btn btn-sm" to={`${base}/plan?tab=timeline`}>Integrated timeline</Link>}>
          {upcoming.length ? <table className="tbl"><thead><tr><th>Milestone</th><th>Date</th><th className="num">Change activities before it</th></tr></thead><tbody>{upcoming.map((x) => { const before = m.activities.filter((a) => a.milestoneId === x.id); return <tr key={x.id}><td><strong>{x.name}</strong><span className="tiny muted sub-line">{label('milestoneKind', x.kind, m.config)}</span></td><td>{fmtDate(x.date)}</td><td className="num">{before.filter((a) => a.status === 'complete').length}/{before.length}</td></tr>; })}</tbody></table> : <Empty title="No upcoming milestones" />}
        </Card>
        <MiniReport id="risks" />
        <MiniReport id="progress" />
        <Card title="Overdue change activities" flush>{overdue.length ? <table className="tbl"><tbody>{overdue.slice(0, 10).map((a) => <tr key={a.id}><td><Link to={`${base}/plan?open=activity:${a.id}`}>{a.title}</Link></td><td>{m.userName(a.ownerId) || '—'}</td><td className="nowrap">{fmtDate(a.endDate || a.startDate)}</td></tr>)}</tbody></table> : <Empty icon="checkCircle" title="Nothing overdue" />}</Card>
      </div>
    </div>
  );
}

// People managers see their own team where their stakeholder record has direct reports; otherwise any
// manager can be chosen.
function ManagerView() {
  const { m, user, base, today } = useIniPage();
  const managers = useMemo(() => managersOf(m), [m]);
  const [sel, setSel] = useState(managers.find((x) => x.id === user.stakeholderId)?.id || managers[0]?.id || null);
  const mgr = managers.find((x) => x.id === sel);
  const ix = useMemo(() => trainingIndex(m), [m]);
  if (!managers.length) return <Empty icon="users" title="No managers with recorded team members">Record managers in the stakeholder register to see team views.</Empty>;
  const team = mgr ? mgr.team : [];
  const groups = mgr ? mgr.groups.map((g) => m.groupsById[g]).filter(Boolean) : [];
  const r = ix.rollup(team);
  const upcoming = m.engagements.filter((e) => e.open && e.plannedDate >= today && (asArray(e.stakeholderIds).some((s) => team.includes(s)) || asArray(e.groupIds).some((g) => groups.some((x) => x.stakeholderGroupId === g)))).slice(0, 8);
  const toolkit = m.toolkit.filter((t) => t.status === 'published' && (!asArray(t.audienceGroupIds).length || asArray(t.audienceGroupIds).some((g) => mgr?.groups.includes(g))));
  return (
    <div className="stack">
      <div className="row" style={{ gap: 8 }}>
        <span className="small muted">Team of</span>
        <select aria-label="Manager" value={sel || ''} onChange={(e) => setSel(e.target.value)}>{managers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      </div>
      <div className="kpis">
        <Kpi label="Team members affected" value={team.length} sub={groups.map((g) => g.name).join(', ')} />
        <Kpi label="Team training completion" value={fmtPct(r.pct)} sub={`${r.all} of ${r.people} fully trained`} />
        <Kpi label="Highest impact" value={Math.max(0, ...groups.map((g) => g.overall || 0)) || '—'} sub="on a scale of 1 to 5" />
        <Kpi label="Team barrier points" value={groups.filter((g) => g.barrierPoint && g.barrierPoint !== 'none').length} sub={groups.filter((g) => g.barrierPoint && g.barrierPoint !== 'none').map((g) => `${g.name}: ${adkarLabel(g.barrierPoint)}`).join('; ') || 'None'} />
      </div>
      <div className="grid g-2">
        <Card title="What is changing for your team" flush>
          <table className="tbl"><tbody>{groups.flatMap((g) => g.impacts.filter((i) => i.degree >= 3).map((i) => <tr key={i.id}><td>{g.name}</td><td>{label('impactAspect', i.aspect, m.config)}</td><td className="small">{i.description || i.futureState}</td><td className="num">{i.degree}</td></tr>))}</tbody></table>
        </Card>
        <Card title="Coming up for your team" flush>{upcoming.length ? <table className="tbl"><tbody>{upcoming.map((e) => <tr key={e.id}><td className="nowrap">{fmtDate(e.plannedDate)}</td><td>{e.label}</td></tr>)}</tbody></table> : <Empty title="Nothing planned" />}</Card>
        <Card title="Your manager toolkit" actions={<Link className="btn btn-sm" to={`${base}/managers?tab=toolkit`}>Toolkit</Link>}>{toolkit.length ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{toolkit.map((t) => <li key={t.id}>{t.title} <span className="muted">(v{t.itemVersion || 1})</span></li>)}</ul> : <Empty title="Nothing published yet" />}</Card>
        <Card title="Team members" flush>
          <table className="tbl"><tbody>{team.slice(0, 20).map((sid) => { const req = ix.required[sid]?.size || 0; const done = req ? [...ix.required[sid]].filter((id) => ix.completed[sid]?.has(id)).length : 0; return <tr key={sid}><td><Link to={`${base}/stakeholders/${sid}`}>{m.stakeholderName(sid)}</Link></td><td>{req ? (done === req ? <Badge tone="good" icon="checkCircle">Trained</Badge> : <Badge tone="warning">{done} of {req} done</Badge>) : <span className="muted small">No training required</span>}</td></tr>; })}</tbody></table>
        </Card>
      </div>
    </div>
  );
}

