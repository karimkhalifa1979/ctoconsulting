// Home (Section 5.4; RPT-001): the personal starting point. What needs attention today, the initiatives I
// work on, approvals awaiting me, my tasks and next engagements, my alerts and recently viewed records,
// with shortcuts suited to my role.
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import { Card, PageHead, Empty, Badge, Spinner, ErrorBox, Kpi, Rag, RiskBadge } from '../ui/core.jsx';
import { useApp } from '../state/app.jsx';
import { useMyWork, ApprovalCard, Alerts, useDecide, PRIORITY_TONE } from './Work.jsx';
import { recordPath } from '../Layout.jsx';
import { recentItems } from '../lib/recent.js';
import { fmtDate, fmtPct, relative, label, RAG_LABEL } from '../lib/format.js';
import { homeDashboard, roleLabel, hasRole } from '../../shared/access.js';
import { entity } from '../../shared/schema.js';
import { plural } from '../../shared/util.js';

const DASHBOARD_VIEW = { lead: 'lead', sponsor: 'sponsor', pm: 'pm', manager: 'manager' };
const TYPE_ICON = { initiative: 'layers', stakeholder: 'user', profile: 'user', engagement: 'calendar', activity: 'gantt', artefact: 'file', risk: 'shield', resistance: 'hand', impactedGroup: 'impact', task: 'task', blueprint: 'target', keyMessage: 'megaphone' };

export default function Home() {
  const { user, settings } = useApp();
  const { data, error, reload } = useMyWork();
  const decide = useDecide(reload);
  const recent = useMemo(() => recentItems(user?.id), [user?.id]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const role = homeDashboard(user);
  const openTasks = data.tasks.filter((t) => ['open', 'inProgress'].includes(t.status));
  const overdueTasks = openTasks.filter((t) => t.overdue);
  const notLogged = data.engagements.filter((e) => e.overdue);
  const upcoming = data.engagements.filter((e) => !e.overdue);
  const critical = data.alerts.filter((a) => a.severity === 'critical');
  const hour = Number(new Intl.DateTimeFormat('en-AU', { hour: 'numeric', hourCycle: 'h23', timeZone: user.timeZone || settings.timeZone || 'Australia/Sydney' }).format(new Date()));
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const attention = [
    data.awaiting.length && `${plural(data.awaiting.length, 'approval')} ${data.awaiting.length === 1 ? 'awaits' : 'await'} your decision`,
    overdueTasks.length && `${plural(overdueTasks.length, 'task')} ${overdueTasks.length === 1 ? 'is' : 'are'} overdue`,
    notLogged.length && `${plural(notLogged.length, 'engagement')} ${notLogged.length === 1 ? 'has' : 'have'} not been logged`,
    critical.length && `${plural(critical.length, 'critical alert')} need${critical.length === 1 ? 's' : ''} attention`,
  ].filter(Boolean);
  const active = data.initiatives.filter((i) => i.status !== 'closed');
  return (
    <>
      <PageHead eyebrow={`${user.roles?.map(roleLabel).join(' · ')} · ${fmtDate(data.today, { long: true })}`} title={`${greeting}, ${String(user.name || '').split(' ')[0]}`}>
        {attention.length ? `${sentence(attention)}.` : 'Nothing is overdue or waiting on you. '}
        {` You work on ${plural(active.length, 'active initiative')}.`}
      </PageHead>
      <div className="kpis mb-4">
        <Kpi label="Open tasks" value={openTasks.length} sub={overdueTasks.length ? `${overdueTasks.length} overdue` : 'None overdue'} tone={overdueTasks.length ? 'critical' : undefined} to="/work?tab=tasks" />
        <Kpi label="Awaiting your approval" value={data.awaiting.length} sub={data.awaiting.length ? `Oldest from ${fmtDate(String(data.awaiting[0].requestedAt).slice(0, 10))}` : 'Nothing waiting'} tone={data.awaiting.length ? 'warning' : undefined} to="/work?tab=approvals" />
        <Kpi label={`Engagements, next ${data.days} days`} value={upcoming.length} sub={notLogged.length ? `${notLogged.length} not yet logged` : 'All past engagements logged'} tone={notLogged.length ? 'warning' : undefined} to="/work?tab=engagements" />
        <Kpi label="Alerts for you" value={data.alerts.length} sub={critical.length ? `${critical.length} critical` : 'None critical'} tone={critical.length ? 'critical' : undefined} to="/work?tab=alerts" />
      </div>
      <div className="grid g-main">
        <div className="stack">
          <MyInitiatives initiatives={data.initiatives} role={role} />
          {data.awaiting.length > 0 && (
            <Card title="Awaiting your approval" flush actions={<Link className="btn btn-sm btn-ghost" to="/work?tab=approvals">All approvals</Link>}>
              <div className="approval-list">{data.awaiting.slice(0, 3).map((a) => <ApprovalCard key={a.id} a={a} onDecide={decide} />)}</div>
            </Card>
          )}
          <Card title="Alerts for you" flush actions={<Link className="btn btn-sm btn-ghost" to="/work?tab=alerts">All alerts</Link>}>
            <Alerts alerts={data.alerts} limit={6} />
          </Card>
        </div>
        <div className="stack">
          <RolePanel role={role} initiatives={active} />
          <TaskList tasks={openTasks} />
          <EngagementList engagements={[...notLogged, ...upcoming]} />
          <Recent items={recent} />
        </div>
      </div>
    </>
  );
}

const sentence = (parts) => {
  const s = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function MyInitiatives({ initiatives, role }) {
  const { usersById } = useApp();
  const view = DASHBOARD_VIEW[role] || 'lead';
  if (!initiatives.length) return <Card title="My initiatives"><Empty icon="layers" title="You are not assigned to an initiative">Ask a change management lead or administrator to add you, or create one from Initiatives.</Empty></Card>;
  return (
    <Card title="My initiatives" sub="Status, readiness and the next milestone for each initiative you work on." flush actions={<Link className="btn btn-sm btn-ghost" to="/initiatives">All initiatives</Link>}>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Initiative</th><th>Status</th><th>Risk</th><th className="num">Readiness</th><th className="num">Coverage</th><th>Next milestone</th><th><span className="sr-only">Links</span></th></tr></thead>
          <tbody>
            {initiatives.map((i) => (
              <tr key={i.id}>
                <td>
                  <Link to={`/i/${i.id}`}><strong>{i.shortName || i.name}</strong></Link>
                  <span className="sub-line tiny muted">{i.status === 'closed' ? 'Closed' : [i.phase, i.stage].filter(Boolean).join(' · ')}{i.changeLeadId ? ` · ${usersById[i.changeLeadId]?.name || ''}` : ''}</span>
                </td>
                <td><span className="row" style={{ flexWrap: 'nowrap' }}>{i.status === 'closed' ? <Badge>Closed</Badge> : <Rag value={i.rag} text={RAG_LABEL[i.rag]} />}{i.criticalAlerts > 0 && <Badge tone="critical" icon="octagon" title={`${i.criticalAlerts} critical alerts`}>{i.criticalAlerts}</Badge>}</span></td>
                <td>{i.riskProfile ? <RiskBadge rating={i.riskProfile} /> : <span className="muted">—</span>}</td>
                <td className="num">{fmtPct(i.readiness)}</td>
                <td className="num">{fmtPct(i.engagementCoverage)}</td>
                <td>{i.nextMilestone ? <span><span className="nowrap">{fmtDate(i.nextMilestone.date)}</span><span className="sub-line tiny muted">{i.nextMilestone.name}</span></span> : <span className="muted">—</span>}</td>
                <td><span className="btn-row" style={{ flexWrap: 'nowrap' }}><Link className="btn btn-xs" to={`/i/${i.id}/dashboards?view=${view}`}>Dashboard</Link><Link className="btn btn-xs" to={`/i/${i.id}/artefacts`}>Artefacts</Link></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Shortcuts for what each role does most often (RPT-001).
function RolePanel({ role, initiatives }) {
  const { user } = useApp();
  const first = initiatives[0];
  const links = [];
  if (role === 'portfolio' || hasRole(user, 'portfolio')) links.push(['/portfolio', 'grid', 'Change heatmap and saturation'], ['/portfolio?tab=compare', 'scale', 'Compare initiatives'], ['/portfolio?tab=shared', 'users', 'Stakeholders shared across initiatives']);
  if (role === 'sponsor') for (const i of initiatives) links.push([`/i/${i.id}/dashboards?view=sponsor`, 'star', `Sponsor dashboard: ${i.shortName || i.name}`]);
  if (role === 'manager') for (const i of initiatives) links.push([`/i/${i.id}/managers`, 'briefcase', `Manager briefing: ${i.shortName || i.name}`]);
  if (role === 'agent') for (const i of initiatives) links.push([`/i/${i.id}/agents`, 'network', `Change agent network: ${i.shortName || i.name}`]);
  if (role === 'pm') for (const i of initiatives) links.push([`/i/${i.id}/plan?tab=timeline`, 'gantt', `Integrated timeline: ${i.shortName || i.name}`]);
  if (role === 'lead' && first) links.push([`/i/${first.id}/capture`, 'mobile', 'Quick capture an engagement'], [`/i/${first.id}/engagement`, 'calendar', 'Engagement planner'], [`/i/${first.id}/artefacts?type=steeringPack`, 'file', 'Steering Committee Pack']);
  if (hasRole(user, 'admin')) links.push(['/admin/users', 'users', 'Users and roles'], ['/admin/templates', 'file', 'Artefact templates'], ['/admin/audit', 'history', 'Audit trail']);
  links.push(['/reports', 'report', 'Reports and report builder'], ['/help', 'question', 'Help and glossary']);
  return (
    <Card title="Shortcuts" flush>
      <ul className="link-list">
        {links.slice(0, 8).map(([to, icon, text]) => <li key={to}><Link to={to}><Icon name={icon} />{text}</Link></li>)}
      </ul>
    </Card>
  );
}

function TaskList({ tasks }) {
  const { config, today } = useApp();
  const navigate = useNavigate();
  return (
    <Card title="My tasks" flush actions={<Link className="btn btn-sm btn-ghost" to="/work?tab=tasks">All tasks</Link>}>
      {!tasks.length ? <Empty icon="checkCircle" title="No open tasks">You are up to date.</Empty> : (
        <ul className="link-list">
          {tasks.slice(0, 6).map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => navigate(`/work?open=task:${t.id}`)}>
                <span className="grow"><span className="ll-title">{t.title}</span><span className="ll-sub">{[t.initiative, t.dueDate ? `due ${fmtDate(t.dueDate)} (${relative(t.dueDate, today)})` : 'no due date'].filter(Boolean).join(' · ')}</span></span>
                {t.overdue ? <Badge tone="critical">Overdue</Badge> : <Badge tone={PRIORITY_TONE[t.priority]}>{label('taskPriority', t.priority, config)}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function EngagementList({ engagements }) {
  const { today } = useApp();
  const navigate = useNavigate();
  return (
    <Card title="My engagements" sub="The next two weeks, and any you have not yet logged." flush actions={<Link className="btn btn-sm btn-ghost" to="/work?tab=engagements">All</Link>}>
      {!engagements.length ? <Empty icon="calendar" title="No engagements coming up">Engagements you own or take part in appear here.</Empty> : (
        <ul className="link-list">
          {engagements.slice(0, 6).map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => navigate(`/i/${e.initiativeId}/engagement?open=engagement:${e.id}`)}>
                <span className="date-chip"><span>{fmtDate(e.plannedDate, { short: true })}</span>{e.plannedTime && <span>{e.plannedTime}</span>}</span>
                <span className="grow"><span className="ll-title">{e.label}</span><span className="ll-sub">{e.audience} · {e.initiative}</span></span>
                {e.overdue ? <Badge tone="warning">Log it</Badge> : <span className="tiny muted nowrap">{relative(e.plannedDate, today)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Recent({ items }) {
  const navigate = useNavigate();
  const what = (t) => { try { return entity(t).label; } catch { return t; } };
  return (
    <Card title="Recently viewed" flush>
      {!items.length ? <Empty icon="history" title="Nothing yet">Initiatives, stakeholders and records you open appear here.</Empty> : (
        <ul className="link-list">
          {items.slice(0, 8).map((x) => (
            <li key={`${x.type}:${x.id}`}>
              <button type="button" onClick={() => navigate(recordPath(x.type, x.id, x.initiativeId))}>
                <Icon name={TYPE_ICON[x.type] || 'file'} />
                <span className="grow"><span className="ll-title">{x.title || x.code}</span><span className="ll-sub">{what(x.type)}{x.code ? ` · ${x.code}` : ''}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
