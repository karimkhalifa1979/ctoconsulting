// Change agents (CAN-001 to CAN-005): the register with assigned groups, time commitment and manager
// endorsement; coverage against targets by group, location and headcount; network activities and the
// feedback agents report; and activity levels and recognition.
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, Spinner, Kpi } from '../../ui/core.jsx';
import DataGrid from '../../ui/DataGrid.jsx';
import Register from '../../ui/Register.jsx';
import { BarChart } from '../../charts/index.jsx';
import { activityColumns } from './Plan.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, fmtNum, label } from '../../lib/format.js';
import { addDays } from '../../../shared/dates.js';
import { asArray, sortBy, sum } from '../../../shared/util.js';

export default function Agents() {
  const { m, base } = useIniPage();
  const [tab, setTab] = useTab('network');
  if (!m) return <Spinner />;
  const gaps = m.groups.filter((g) => g.agentCoverage.applicable && g.agentCoverage.gap > 0).length;
  const inScope = !m.initiative.selectedPlans?.length || m.initiative.selectedPlans.includes('changeAgent');
  return (
    <>
      <PageHead eyebrow="Extended plan · Change Agent Network Plan" title="Change agents" actions={<Link className="btn btn-primary" to={`${base}/artefacts?type=canPlan`}><Icon name="file" />Change Agent Network Plan</Link>}>
        Change agents extend the reach of the change team into each group: they share information, surface concerns and support their colleagues through the transition.
      </PageHead>
      {!inScope && <div className="callout small mb-3">The Change Agent Network Plan is not part of this initiative's approach, so coverage targets do not apply. <Link to={`${base}/plan?tab=plans`}>Change the plans selected</Link>.</div>}
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'network', label: 'Network', count: m.agents.length },
        { id: 'coverage', label: 'Coverage', count: gaps || null },
        { id: 'activities', label: 'Network activities' },
        { id: 'feedback', label: 'Reported feedback', count: m.feedback.filter((f) => f.changeAgentId).length },
        { id: 'activity', label: 'Activity and recognition' },
      ]} />
      {tab === 'network' && <Network />}
      {tab === 'coverage' && <Coverage />}
      {tab === 'activities' && <NetworkActivities />}
      {tab === 'feedback' && <AgentFeedback />}
      {tab === 'activity' && <ActivityLevels />}
    </>
  );
}

function Network() {
  const { m, base, config } = useIniPage();
  const columns = [
    { key: 'who', label: 'Change agent', render: (a) => <span><Link to={`${base}/stakeholders/${a.stakeholderId}`} onClick={(e) => e.stopPropagation()}><strong>{m.stakeholderName(a.stakeholderId)}</strong></Link><span className="tiny muted sub-line">{m.byId.stakeholder[a.stakeholderId]?.positionTitle}</span></span>, value: (a) => m.stakeholderName(a.stakeholderId) },
    { key: 'groups', label: 'Assigned groups', render: (a) => <span className="sub-line" style={{ maxWidth: 240 }}>{asArray(a.groupIds).map((g) => m.groupsById[g]?.name).filter(Boolean).join(', ')}</span>, value: (a) => asArray(a.groupIds).map((g) => m.groupsById[g]?.name).join(', ') },
    { key: 'locations', label: 'Locations', render: (a) => a.locations || m.byId.stakeholder[a.stakeholderId]?.location || '—', value: (a) => a.locations },
    { key: 'hours', label: 'Hours per week', align: 'num', render: (a) => fmtNum(a.hoursPerWeek, 1), value: (a) => a.hoursPerWeek || 0 },
    { key: 'endorsed', label: 'Manager endorsement', render: (a) => (a.managerEndorsed ? <Badge tone="good" icon="checkCircle">Endorsed {fmtDate(a.endorsedDate)}</Badge> : <Badge tone="warning" icon="alert">Not endorsed</Badge>), value: (a) => (a.managerEndorsed ? 1 : 0) },
    { key: 'status', label: 'Status', render: (a) => <Badge tone={a.status === 'active' ? 'good' : a.status === 'onLeave' ? 'warning' : ''}>{label('agentStatus', a.status, config)}</Badge>, value: (a) => a.status },
  ];
  const endorsed = m.agents.filter((a) => a.managerEndorsed).length;
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="Active change agents" value={m.agents.filter((a) => a.status === 'active').length} sub={`${m.agents.filter((a) => a.status === 'onLeave').length} on leave`} />
        <Kpi label="Manager endorsement" value={m.agents.length ? `${Math.round((endorsed / m.agents.length) * 100)}%` : '—'} sub={`${endorsed} of ${m.agents.length} endorsed`} tone={endorsed < m.agents.length ? 'warning' : 'good'} />
        <Kpi label="Time committed" value={`${fmtNum(sum(m.agents.filter((a) => a.status === 'active'), (a) => a.hoursPerWeek), 1)} h`} sub="per week, across the network" />
      </div>
      <Register type="changeAgent" title="Change agent register" columns={columns} sub="Agents need their manager's endorsement and a clear time commitment (CAN-001). Agents can log feedback and engagements for their assigned groups (CAN-004)." facets={['status']} bulkFields={['status']} defaults={{ status: 'active', startDate: m.today }} />
    </div>
  );
}

// CAN-002: agents per impacted group (target from headcount ratio or a group override), per location
// and per headcount.
function Coverage() {
  const { m, settings, drawer } = useIniPage();
  const ac = settings.agentCoverage;
  const groups = m.groups.filter((g) => g.agentCoverage.applicable);
  const active = m.agents.filter((a) => a.status === 'active');
  const locations = {};
  for (const g of m.groups) {
    for (const sid of g.memberIds) {
      const loc = m.byId.stakeholder[sid]?.location;
      if (!loc) continue;
      const e = (locations[loc] ||= { label: loc, people: new Set(), agents: new Set() });
      e.people.add(sid);
    }
  }
  for (const a of active) {
    const loc = m.byId.stakeholder[a.stakeholderId]?.location || a.locations;
    if (loc && locations[loc]) locations[loc].agents.add(a.id);
    for (const l of String(a.locations || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean)) if (locations[l]) locations[l].agents.add(a.id);
  }
  const target = ac.headcountPerAgent || 50;
  return (
    <div className="stack">
      <Card title="Agents per impacted group" sub={`Target: one agent per ${target} people (minimum ${ac.minPerGroup || 1}, maximum ${ac.maxPerGroup || '—'} per group), unless the group sets its own target.`}>
        {groups.length ? (
          <table className="tbl">
            <thead><tr><th>Impacted group</th><th className="num">Headcount</th><th className="num">Active agents</th><th className="num">Target</th><th className="num">People per agent</th><th>Coverage</th></tr></thead>
            <tbody>
              {sortBy(groups, (g) => -g.agentCoverage.gap).map((g) => (
                <tr key={g.id} className="clickable" onClick={() => drawer.open({ type: 'impactedGroup', id: g.id, include: ['name', 'headcount', 'agentTarget'] })}>
                  <td><strong>{g.name}</strong></td>
                  <td className="num">{fmtNum(g.headcount)}</td>
                  <td className="num">{g.agentCoverage.count}{g.agentCoverage.onLeave ? <span className="tiny muted"> (+{g.agentCoverage.onLeave} on leave)</span> : ''}</td>
                  <td className="num">{g.agentCoverage.target}{g.agentCoverage.fromRatio ? '' : <span className="tiny muted"> set</span>}</td>
                  <td className="num">{g.agentCoverage.count ? fmtNum((Number(g.headcount) || 0) / g.agentCoverage.count) : '—'}</td>
                  <td>{g.agentCoverage.gap ? <Badge tone="warning" icon="alert">{g.agentCoverage.gap} more needed</Badge> : <Badge tone="good" icon="checkCircle">Covered</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty title="No coverage targets apply" />}
      </Card>
      <div className="grid g-2">
        <Card title="People per agent by group" sub={`Lower is better; the dashed line is the target of ${target}.`}>
          {groups.length ? <BarChart data={groups.map((g) => ({ key: g.id, label: g.name, value: g.agentCoverage.count ? Math.round((Number(g.headcount) || 0) / g.agentCoverage.count) : Number(g.headcount) || 0, sub: g.agentCoverage.count ? `${g.agentCoverage.count} agents` : 'No agents' }))} threshold={target} format={(v) => fmtNum(v)} colorOf={(d) => (d.value > target ? 'var(--st-warning)' : 'var(--series-1)')} ariaLabel="People per change agent by group" /> : <Empty title="No groups" />}
        </Card>
        <Card title="By location" sub="Recorded members of impacted groups and the agents based at or assigned to each location" flush>
          <table className="tbl">
            <thead><tr><th>Location</th><th className="num">People recorded</th><th className="num">Agents</th></tr></thead>
            <tbody>{sortBy(Object.values(locations), 'label').map((l) => <tr key={l.label}><td>{l.label}</td><td className="num">{l.people.size}</td><td className="num">{l.agents.size || <Badge tone="warning" icon="alert">None</Badge>}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function NetworkActivities() {
  const { m, config, lookups, usersById, drawer, canDo } = useIniPage();
  const rows = sortBy(m.activities.filter((a) => asArray(a.plans).includes('changeAgent')), (a) => a.startDate || '9999');
  return (
    <DataGrid id="canActivities" type="activity" title="Network activities" rows={rows} columns={activityColumns({ m, config, lookups, usersById }).filter((c) => c.key !== 'plans')} onRowClick={(a) => drawer.open({ type: 'activity', id: a.id, wide: true })}
      empty={<Empty icon="network" title="No network activities">Plan agent briefings, network meetings and agent tasks here (CAN-003).</Empty>}
      toolbar={canDo('C', 'activity') && <button type="button" className="btn btn-sm btn-primary" onClick={() => drawer.open({ type: 'activity', defaults: { kind: 'activity', plans: ['changeAgent'], responsibleRole: 'changeAgents', status: 'notStarted', adkar: ['awareness', 'desire'] }, wide: true })}><Icon name="plus" />Network activity</button>} />
  );
}

function AgentFeedback() {
  const { m } = useIniPage();
  return (
    <Register type="feedback" title="Feedback reported by change agents" filter={(f) => !!f.changeAgentId} sub="What agents hear in their groups, linked to the group and ADKAR element so it feeds readiness and barrier analysis (CAN-003)."
      defaults={{ date: m.today, channel: 'changeAgent', status: 'new' }} facets={['sentiment', 'status']}
      prepend={[{ key: 'agent', label: 'Agent', render: (f) => m.stakeholderName(m.byId.changeAgent[f.changeAgentId]?.stakeholderId) || '—', value: (f) => m.stakeholderName(m.byId.changeAgent[f.changeAgentId]?.stakeholderId) }]} />
  );
}

// CAN-005: what each agent has done in the last 90 days, and how they have been recognised.
function ActivityLevels() {
  const { m, drawer, today } = useIniPage();
  const from = addDays(today, -90);
  const rows = m.agents.map((a) => {
    const eng = m.engagements.filter((e) => e.done && e.actualDate >= from && (asArray(e.internalParticipantIds).includes(a.stakeholderId) || e.senderId === a.stakeholderId));
    const fb = m.feedback.filter((f) => f.changeAgentId === a.id && f.date >= from);
    const attended = m.engagements.filter((e) => e.done && e.actualDate >= from && asArray(e.attendance).some((x) => x.stakeholderId === a.stakeholderId && x.status === 'attended')).length;
    const score = eng.length * 2 + fb.length + attended;
    return { ...a, eng: eng.length, fb: fb.length, attended, score, level: score >= 8 ? 'High' : score >= 3 ? 'Moderate' : 'Low' };
  });
  return (
    <Card title="Activity levels (last 90 days)" sub="Engagements delivered, feedback reported and network sessions attended. Record recognition on the agent's record." flush>
      {rows.length ? (
        <table className="tbl">
          <thead><tr><th>Agent</th><th className="num">Engagements</th><th className="num">Feedback reported</th><th className="num">Sessions attended</th><th>Activity level</th><th>Recognition</th></tr></thead>
          <tbody>{sortBy(rows, (r) => -r.score).map((r) => (
            <tr key={r.id} className="clickable" onClick={() => drawer.open({ type: 'changeAgent', id: r.id })}>
              <td><strong>{m.stakeholderName(r.stakeholderId)}</strong></td>
              <td className="num">{r.eng}</td><td className="num">{r.fb}</td><td className="num">{r.attended}</td>
              <td><Badge tone={r.level === 'High' ? 'good' : r.level === 'Low' ? 'warning' : 'info'}>{r.level}</Badge></td>
              <td className="small">{r.recognition || <span className="muted">—</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <Empty icon="users" title="No change agents yet" />}
    </Card>
  );
}
