// WFL-005 "My work": everything waiting on the signed-in person.
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { useSession } from '../lib/session.jsx';
import { recordLink } from '../lib/util.js';
import { PageHead, Card, Tile, Async, Empty, Status, D, DT, Level, Badge } from '../components/ui.jsx';
import { ApprovalCard } from '../components/Record.jsx';
import Icon from '../components/Icon.jsx';
import { fmtDate } from '../../shared/format.js';

export default function MyWork() {
  const { me } = useSession();
  const q = useApi('/api/dash/my-work');
  const inbox = useApi('/api/approvals');
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <>
      <PageHead eyebrow={new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney' }).format(new Date())}
        title={`${greet}, ${me.user.name.split(' ')[0]}`} sub="Your approvals, deadlines and assigned work across all your engagements."
        actions={<>{me.person && <Link className="btn" to="/time"><Icon name="clock" /> Timesheet</Link>}<Link className="btn btn-primary" to="/approvals"><Icon name="inbox" /> Approvals</Link></>} />
      <Async q={q}>{(d) => {
        const overdue = d.raid.filter((r) => r.overdue).length + d.tasks.filter((t) => t.overdue).length;
        const tsLines = d.timesheetApprovals.reduce((a, g) => a + g.lines.length, 0);
        return (
          <div className="stack">
            <div className="grid g-4">
              <Tile label="Approvals waiting" value={d.approvals.length} tone={d.approvals.length ? 'warn' : 'good'} sub={d.approvals.some((a) => a.escalated) ? 'Includes escalated requests' : 'Change, status, budget and more'} />
              <Tile label="Time lines to approve" value={tsLines} tone={tsLines ? 'warn' : 'good'} sub={`${d.timesheetApprovals.length} timesheet${d.timesheetApprovals.length === 1 ? '' : 's'}`} />
              <Tile label="Status updates due" value={d.statusDue.length} tone={d.statusDue.some((s) => s.status === 'Late') ? 'bad' : d.statusDue.length ? 'warn' : 'good'} sub="This reporting week" />
              <Tile label="Overdue items" value={overdue} tone={overdue ? 'bad' : 'good'} sub="Tasks, actions and reviews" />
            </div>
            <div className="split">
              <div className="stack">
                <Card title="Waiting for your approval" sub="Approve, return or reject here, or open the record for the detail." actions={<Link className="btn btn-sm" to="/approvals">All approvals</Link>}>
                  {!(inbox.data?.inbox || []).length ? <Empty icon="checkCircle">Nothing waiting for you.</Empty> : (
                    <div className="stack-sm">{inbox.data.inbox.slice(0, 6).map((a) => (
                      <div key={a.id}>
                        <ApprovalCard a={a} compact onDecided={() => { q.reload(); inbox.reload(); }} />
                        {a.link && <div className="tiny mt-1"><Link to={a.link}>Open the record →</Link></div>}
                      </div>
                    ))}</div>
                  )}
                </Card>
                {d.statusDue.length > 0 && (
                  <Card title="Status updates due" sub="Submit by the Thursday cut-off (BR-17).">
                    <ul className="list">
                      {d.statusDue.map((s) => (
                        <li key={s.project_id}>
                          <div className="grow"><Link to={`/projects/${s.project_id}/status`} className="strong">{s.project}</Link><div className="small muted">{s.engagement} · week ending {fmtDate(s.period_end)} · cut-off <DT v={s.cutoff} /></div></div>
                          <Status v={s.status} />
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                {d.timesheetApprovals.length > 0 && (
                  <Card title="Timesheets to approve" actions={<Link className="btn btn-sm btn-primary" to="/time/approvals">Review time</Link>}>
                    <ul className="list">
                      {d.timesheetApprovals.map((g) => <li key={`${g.person_id}${g.week_start}`}><span className="grow"><b>{g.person}</b> · week of {fmtDate(g.week_start)}</span><span className="small muted">{g.lines.reduce((a, l) => a + Number(l.hours), 0)} h</span></li>)}
                    </ul>
                  </Card>
                )}
                <Card title="My tasks" sub="Assigned work items that are not done.">
                  {!d.tasks.length ? <Empty>No open tasks assigned to you.</Empty> : (
                    <ul className="list">
                      {d.tasks.map((t) => (
                        <li key={t.id}>
                          <div className="grow"><Link to={`/projects/${t.project_id}/plan?open=${t.id}&entity=work_item`}>{t.name}</Link><div className="small muted">{t.project} · due {fmtDate(t.finish_date)} · {Math.round((t.percent_complete || 0) * 100)}%</div></div>
                          {t.overdue ? <Badge tone="red">Overdue</Badge> : <Status v={t.status} />}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
              <div className="stack">
                {me.person && (
                  <Card title="My timesheets" actions={<Link className="btn btn-sm" to="/time">Open timesheet</Link>}>
                    {!d.timesheets.length ? <Empty icon="checkCircle">All submitted.</Empty> : (
                      <ul className="list">{d.timesheets.map((t) => <li key={t.week_start}><span className="grow">Week of {fmtDate(t.week_start)}<div className="small muted">Due <DT v={t.deadline} /></div></span>{t.late ? <Badge tone="red">Late</Badge> : <Status v={t.status} />}</li>)}</ul>
                    )}
                  </Card>
                )}
                <Card title="My RAID items" sub="Risks, issues, actions and dependencies you own.">
                  {!d.raid.length ? <Empty>Nothing assigned to you.</Empty> : (
                    <ul className="list">
                      {d.raid.map((r) => (
                        <li key={r.id}>
                          <div className="grow"><Link to={recordLink(r.type, r)}>{r.ref} {r.title}</Link><div className="small muted">{r.label}{r.due ? ` · ${r.type === 'risk' ? 'review' : 'due'} ${fmtDate(r.due)}` : ''}</div></div>
                          {r.level && <Level v={r.level} />}{r.overdue && <Badge tone="red">Overdue</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                {d.deliverables.length > 0 && (
                  <Card title="My deliverables">
                    <ul className="list">{d.deliverables.map((x) => <li key={x.id}><div className="grow"><Link to={`/projects/${x.project_id}/scope?open=${x.id}&entity=deliverable`}>{x.ref} {x.title}</Link><div className="small muted">{x.project} · due <D v={x.forecast_date || x.planned_date} /></div></div><Status v={x.status} /></li>)}</ul>
                  </Card>
                )}
                <Card title="Recent notifications">
                  {!d.notifications.length ? <Empty icon="bell">No notifications.</Empty> : (
                    <ul className="list">
                      {d.notifications.slice(0, 8).map((n) => (
                        <li key={n.id}><span className={`rag-dot ${n.severity === 'high' ? 'Red' : n.severity === 'action' ? 'Amber' : ''}`} style={{ marginTop: 6 }} /><div className="grow">{n.link ? <Link to={n.link}>{n.title}</Link> : n.title}<div className="tiny muted"><DT v={n.created_at} /></div></div></li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </div>
          </div>
        );
      }}</Async>
    </>
  );
}
