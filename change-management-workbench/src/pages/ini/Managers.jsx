// People managers (PMG-001 to PMG-006): the People Manager Plan, the managers of impacted employees,
// the manager toolkit with versions and access records, and team-specific briefing packs.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, Spinner, Prose } from '../../ui/core.jsx';
import DataGrid from '../../ui/DataGrid.jsx';
import Register from '../../ui/Register.jsx';
import { activityColumns } from './Plan.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, fmtDateTime, label } from '../../lib/format.js';
import { asArray, personName, sortBy } from '../../../shared/util.js';

// People managers of impacted employees: managers of members of impacted groups (and accountable leaders).
export function managersOf(m) {
  const out = {};
  for (const g of m.groups) {
    for (const sid of g.memberIds) {
      const s = m.byId.stakeholder[sid];
      if (!s?.managerId) continue;
      const mgr = m.byId.stakeholder[s.managerId];
      if (!mgr) continue;
      const e = (out[mgr.id] ||= { id: mgr.id, name: personName(mgr), position: mgr.positionTitle, team: new Set(), groups: new Set() });
      e.team.add(sid);
      e.groups.add(g.id);
    }
  }
  return sortBy(Object.values(out).map((x) => ({ ...x, team: [...x.team], groups: [...x.groups] })), 'name');
}

export default function Managers() {
  const { m, base } = useIniPage();
  const [tab, setTab] = useTab('plan');
  if (!m) return <Spinner />;
  return (
    <>
      <PageHead eyebrow="Core plan · People Manager Plan" title="People managers" actions={<Link className="btn btn-primary" to={`${base}/artefacts?type=managerBriefing`}><Icon name="file" />Manager briefing packs</Link>}>
        Prepare managers to be communicator, liaison, advocate, resistance manager and coach for their teams (CLARC), with team-specific information they can use.
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'plan', label: 'People Manager Plan' }, { id: 'managers', label: 'Managers and teams' }, { id: 'toolkit', label: 'Manager toolkit', count: m.toolkit.length }]} />
      {tab === 'plan' && <PmPlan />}
      {tab === 'managers' && <ManagerList />}
      {tab === 'toolkit' && <Toolkit />}
    </>
  );
}

function PmPlan() {
  const { m, config, lookups, usersById, drawer, canDo } = useIniPage();
  const rows = sortBy(m.activities.filter((a) => asArray(a.plans).includes('peopleManager')), (a) => a.startDate || '9999');
  const highNoPm = m.coverage.filter((w) => w.kind === 'noManagerActivity' && !w.ack);
  return (
    <div className="stack">
      {highNoPm.map((w) => <div key={w.id} className="callout warn small">{w.message}</div>)}
      <DataGrid id="pmPlan" type="activity" title="People Manager Plan" rows={rows} columns={activityColumns({ m, config, lookups, usersById }).filter((c) => c.key !== 'plans')} onRowClick={(a) => drawer.open({ type: 'activity', id: a.id, wide: true })}
        toolbar={canDo('C', 'activity') && <button type="button" className="btn btn-sm btn-primary" onClick={() => drawer.open({ type: 'activity', defaults: { kind: 'activity', plans: ['peopleManager'], responsibleRole: 'peopleManager', status: 'notStarted' }, wide: true })}><Icon name="plus" />Manager activity</button>} />
    </div>
  );
}

function ManagerList() {
  const { m, base } = useIniPage();
  const managers = useMemo(() => managersOf(m), [m]);
  const trainedLeaders = new Set(m.sessions.filter((s) => m.byId.trainingIntervention[s.interventionId]?.forChangeRoles).flatMap((s) => asArray(s.enrolments).filter((e) => e.completed).map((e) => e.stakeholderId)));
  return (
    <DataGrid id="managers" title="People managers of impacted employees" rows={managers} savedViews={false}
      columns={[
        { key: 'name', label: 'Manager', render: (x) => <span><Link to={`${base}/stakeholders/${x.id}`}><strong>{x.name}</strong></Link><span className="tiny muted sub-line">{x.position}</span></span>, value: (x) => x.name },
        { key: 'team', label: 'Team members recorded', align: 'num', render: (x) => x.team.length, value: (x) => x.team.length },
        { key: 'groups', label: 'Impacted groups', render: (x) => <span className="sub-line" style={{ maxWidth: 260 }}>{x.groups.map((g) => m.groupsById[g]?.name).join(', ')}</span>, value: (x) => x.groups.map((g) => m.groupsById[g]?.name).join(', ') },
        { key: 'impact', label: 'Highest impact', align: 'num', render: (x) => Math.max(0, ...x.groups.map((g) => m.groupsById[g]?.overall || 0)), value: (x) => Math.max(0, ...x.groups.map((g) => m.groupsById[g]?.overall || 0)) },
        { key: 'trained', label: 'Change-role training', render: (x) => (trainedLeaders.has(x.id) ? <Badge tone="good" icon="checkCircle">Completed</Badge> : <Badge>Not yet</Badge>), value: (x) => (trainedLeaders.has(x.id) ? 1 : 0) },
        { key: 'engaged', label: 'Last engaged', render: (x) => fmtDate(m.profileByStakeholder[x.id]?.cadenceBasis) || <span className="muted">—</span>, value: (x) => m.profileByStakeholder[x.id]?.cadenceBasis || '' },
        { key: '_b', label: '', sortable: false, render: (x) => <Link className="btn btn-xs" to={`${base}/artefacts?type=managerBriefing&managerId=${x.id}`}>Briefing pack</Link> },
      ]}
      empty={<Empty icon="users" title="No managers found">Record team members and their managers in the stakeholder register, and link impacted groups to stakeholder groups.</Empty>} />
  );
}

function Toolkit() {
  const { m, settings } = useIniPage();
  return (
    <div className="stack">
      <Register type="toolkitItem" title="Manager toolkit" sub="Talking points, conversation guides, impact summaries, FAQs and training schedules for managers, with versions and a record of who opened them (PMG-003, PMG-004)." facets={['kind', 'status']}
        append={[{ key: 'access', label: 'Opened by', align: 'num', render: (t) => asArray(t.accessLog).length, value: (t) => asArray(t.accessLog).length }]}
        after={(rec) => rec && (
          <div className="form-section">
            <h3>Who has opened this item</h3>
            {asArray(rec.accessLog).length ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{rec.accessLog.map((a, i) => <li key={i}>{a.name} · {fmtDateTime(a.at, settings.timeZone)}</li>)}</ul> : <p className="small muted">Nobody yet.</p>}
          </div>
        )} />
      {m.toolkit.filter((t) => t.status === 'published').length > 0 && (
        <Card title="Preview: what managers see" sub="Published items, newest version">
          <div className="grid g-2">
            {m.toolkit.filter((t) => t.status === 'published').map((t) => (
              <div key={t.id} className="card card-pad" style={{ boxShadow: 'none' }}>
                <div className="row-between"><h3>{t.title}</h3><Badge>v{t.itemVersion || 1}</Badge></div>
                <div className="small muted mb-2">{label('toolkitKind', t.kind)} · for {asArray(t.audienceGroupIds).map((g) => m.groupsById[g]?.name).filter(Boolean).join(', ') || 'all managers'}</div>
                <Prose html={t.content} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

