// Initiative overview (INI-009, RUL-18, RPT-001): where the initiative is in the 3-Phase Process, what
// is still needed for each stage, the headline measures and everything that needs attention.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Kpi, Rag, Badge, StatusBadge, Spinner, ErrorBox, Empty, BarrierBadge, Help, Popover } from '../../ui/core.jsx';
import { BarChart, Heatmap, adkarFill, adkarInk, HeatScale } from '../../charts/index.jsx';
import { useApp, useDialog, useToast } from '../../state/app.jsx';
import { useIni, useMutator } from '../../state/initiative.jsx';
import { useRecordDrawer } from '../../ui/RecordDrawer.jsx';
import { recordPath } from '../../Layout.jsx';
import { overallRag, ragOf } from '../../../shared/model.js';
import { ADKAR, PHASES, adkarLabel } from '../../../shared/refdata.js';
import { ALERT_KINDS } from '../../../shared/rules/alerts.js';
import { hasRole } from '../../../shared/access.js';
import { fmtDate, relative, label } from '../../lib/format.js';
import { saveBlob } from '../../data/client.js';

export function StageTracker({ stageStatus, base, compact = false }) {
  const [openStage, setOpenStage] = useState(null);
  return (
    <div className="stage-track">
      {stageStatus.phases.map((p) => (
        <div className="phase-col" key={p.id}>
          <header style={{ background: p.color }}>
            <strong>Phase {p.n}: {p.label}</strong>
            <span>{p.status === 'complete' ? 'Complete' : p.status === 'inProgress' ? 'In progress' : 'Not started'}</span>
          </header>
          {p.stages.map((s) => {
            const current = stageStatus.current?.id === s.id;
            const icon = s.status === 'complete' ? 'checkCircle' : s.status === 'inProgress' ? 'halfCircle' : 'circle';
            const show = !compact && (openStage === s.id || (current && openStage == null));
            return (
              <div key={s.id} className={`stage ${current ? 'current' : ''}`}>
                <div className="row-between" style={{ gap: 6 }}>
                  <Link to={`${base}/${s.route === 'initiative' ? 'setup' : s.route}`} className="stage-name" style={{ color: 'inherit' }}>
                    <Icon name={icon} className={`stage-icon ${s.status}`} />{s.label}
                    {current && <Badge tone="teal">Current stage</Badge>}
                  </Link>
                  <button type="button" className="link-btn tiny" aria-expanded={show} onClick={() => setOpenStage(show ? '' : s.id)}>{s.done}/{s.total}</button>
                </div>
                <div className="stage-meta">{s.purpose}</div>
                {show && (
                  <ul className="check-list">
                    {s.checks.map((c) => <li key={c.id} className={c.ok ? 'ok' : 'no'}><Icon name={c.ok ? 'checkCircle' : 'circle'} /><span>{c.label}</span></li>)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function AlertList({ alerts, limit = 12, base }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState('');
  const [all, setAll] = useState(false);
  const kinds = [...new Set(alerts.map((a) => a.kind))];
  const list = alerts.filter((a) => !kind || a.kind === kind);
  const shown = all ? list : list.slice(0, limit);
  const icon = { critical: 'octagon', warning: 'alert', info: 'info' };
  return (
    <div>
      {kinds.length > 1 && (
        <div className="grid-toolbar">
          <select aria-label="Alert type" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All alerts ({alerts.length})</option>
            {kinds.map((k) => <option key={k} value={k}>{ALERT_KINDS[k] || k} ({alerts.filter((a) => a.kind === k).length})</option>)}
          </select>
        </div>
      )}
      {!shown.length && <Empty icon="checkCircle" title="Nothing needs attention">No alerts for this initiative.</Empty>}
      {shown.map((a) => (
        <div key={a.id} className={`alert-item ${a.severity}`}>
          <Icon name={icon[a.severity]} className="ai-icon" label={a.severity} />
          <div className="grow">
            <div className="ai-title">{a.link ? <button type="button" className="link-btn" onClick={() => navigate(recordPath(a.link.type, a.link.id, base.split('/')[2]))}>{a.title}</button> : a.title}</div>
            <div className="ai-detail">{a.detail}</div>
          </div>
          <span className="badge">{ALERT_KINDS[a.kind] || a.kind}</span>
        </div>
      ))}
      {list.length > limit && <div style={{ padding: '8px 14px' }}><button type="button" className="link-btn small" onClick={() => setAll((x) => !x)}>{all ? 'Show fewer' : `Show all ${list.length}`}</button></div>}
    </div>
  );
}

export default function Overview() {
  const { user, usersById, today } = useApp();
  const ini = useIni();
  const mut = useMutator();
  const toast = useToast();
  const dialog = useDialog();
  const drawer = useRecordDrawer();
  const navigate = useNavigate();
  const m = ini.model;
  const base = `/i/${ini.id}`;

  const upcoming = useMemo(() => (m ? m.engagements.filter((e) => e.open && e.plannedDate >= today).slice(0, 8) : []), [m, today]);
  const myTasks = useMemo(() => (m ? m.tasks.filter((t) => t.assigneeId === user.id && ['open', 'inProgress'].includes(t.status)) : []), [m, user.id]);
  if (ini.error) return <ErrorBox error={ini.error} onRetry={ini.reload} />;
  if (!m) return <Spinner />;
  const i = m.initiative;
  const rag = overallRag(m);
  const k = m.kpis;
  const st = m.stageStatus;
  const groupsReadiness = m.groups.filter((g) => g.readiness.index != null).map((g) => ({ key: g.id, label: g.name, value: g.readiness.index, sub: g.barrierPoint && g.barrierPoint !== 'none' ? `Barrier point: ${adkarLabel(g.barrierPoint)}` : '' }));

  const exportData = async () => {
    const data = await mut.op('exportInitiative', { id: ini.id });
    saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${i.shortName || i.name} export ${today}.json`);
    toast.success('Initiative data exported (INT-010)');
  };
  const close = async () => {
    const reason = await dialog.prompt({ title: 'Close initiative', message: 'Closing makes the initiative read-only. Open engagements are cancelled. Records are kept under the retention rules (SUS-007).', label: 'Reason or closing note' });
    if (!reason) return;
    await mut.op('closeInitiative', { id: ini.id, reason });
    toast.success('Initiative closed');
  };

  return (
    <>
      <PageHead
        eyebrow={`Phase ${st.currentPhase?.n}: ${st.currentPhase?.label} · ${st.current?.label}`}
        title={i.name}
        actions={(
          <>
            <Link className="btn" to={`${base}/setup`}><Icon name="edit" />Definition</Link>
            <Link className="btn btn-primary" to={`${base}/artefacts?type=steeringPack`}><Icon name="file" />Status pack</Link>
            <Popover button={({ toggle }) => <button type="button" className="btn" aria-label="More actions" onClick={toggle}><Icon name="more" /></button>}>
              <button type="button" data-close onClick={exportData}><Icon name="download" />Export all data (JSON)</button>
              {hasRole(user, 'changeLead') && !ini.readOnly && <button type="button" data-close onClick={close}><Icon name="archive" />Close initiative…</button>}
              {hasRole(user, 'admin') && ini.readOnly && <button type="button" data-close onClick={async () => { const reason = await dialog.prompt({ title: 'Reopen initiative', label: 'Reason' }); if (reason) await mut.op('reopenInitiative', { id: ini.id, reason }); }}><Icon name="unlock" />Reopen…</button>}
            </Popover>
          </>
        )}
      >
        <div className="row small" style={{ gap: 14 }}>
          <Rag value={rag} text={rag ? `Overall ${rag === 'green' ? 'on track' : rag === 'amber' ? 'at risk' : 'off track'}` : 'No status yet'} />
          <StatusBadge status={i.status} labelText={label('initiativeStatus', i.status)} />
          {m.risk.profile && <Badge tone={m.risk.profile === 'high' ? 'serious' : m.risk.profile === 'medium' ? 'warning' : 'good'} icon="shield">{label('riskProfile', m.risk.profile)} change risk</Badge>}
          <span>{fmtDate(i.startDate)} – {fmtDate(i.endDate)}</span>
          <span>Sponsor: <strong>{m.stakeholderName(i.primarySponsorId) || '—'}</strong></span>
          <span>Change lead: <strong>{usersById[i.changeLeadId]?.name || '—'}</strong></span>
        </div>
      </PageHead>
      {ini.readOnly && <div className="callout warn mb-4"><strong>Closed.</strong> This initiative was closed {fmtDate(i.closedAt)} and is read-only. Measures can still be recorded for post-closeout tracking.</div>}

      <div className="kpis mb-4">
        <Kpi label="Priority stakeholders" value={k.priorityStakeholders} sub={`${k.stakeholders} people · ${k.groupProfiles} groups`} to={`#${base}/stakeholders`} />
        <Kpi label="Engaged within cadence" value={k.engagementCoverage} unit="%" sub={<><Rag value={ragOf(k.engagementCoverage, m.settings.rag)} text={`${k.outsideCadence} outside cadence`} /></>} to={`#${base}/engagement`} />
        <Kpi label="Average readiness" value={k.readinessAvg} sub={<Rag value={ragOf(k.readinessAvg, m.settings.rag)} text={`${k.barrierGroups} groups with a barrier point`} />} to={`#${base}/adkar`} />
        <Kpi label="Plan activities complete" value={`${k.activitiesComplete}/${k.activitiesTotal}`} sub={k.activitiesOverdue ? <Badge tone="critical" icon="octagon">{k.activitiesOverdue} overdue</Badge> : 'None overdue'} to={`#${base}/plan`} />
        <Kpi label="Open change risks" value={k.openRisks} sub={k.highRisks ? <Badge tone="serious" icon="alert">{k.highRisks} high or extreme</Badge> : 'None high'} to={`#${base}/risk`} />
        <Kpi label="Open actions" value={k.openActions} sub={k.overdueActions ? <Badge tone="critical" icon="octagon">{k.overdueActions} overdue</Badge> : 'None overdue'} to="#/work" />
      </div>

      <Card title="Progress through the 3-Phase Process" sub="Stages are complete when their mandatory inputs are captured and approvals recorded (RUL-18). Select a count to see what is missing." className="mb-4">
        <StageTracker stageStatus={st} base={base} />
      </Card>

      <div className="grid g-main mt-4">
        <div className="stack">
          <Card title="Needs attention" sub="Alerts from cadence, engagement, sponsor, measure and survey rules" flush actions={<Badge tone={k.criticalAlerts ? 'critical' : ''} icon={k.criticalAlerts ? 'octagon' : undefined}>{k.criticalAlerts} critical</Badge>}>
            <AlertList alerts={m.alerts} base={base} />
          </Card>
          <Card title="Readiness by impacted group" sub={<>Weighted index of ADKAR results, training completion, readiness criteria and sentiment (MEA-005). Target {m.settings.readinessThreshold}. <Help term="Barrier point" /></>} actions={<Link to={`${base}/adkar`} className="btn btn-sm">ADKAR details</Link>}>
            {groupsReadiness.length ? <BarChart data={groupsReadiness} labelWidth={220} max={100} threshold={m.settings.readinessThreshold} format={(v) => Math.round(v)} ariaLabel="Readiness index by impacted group" onSelect={(d) => drawer.open({ type: 'impactedGroup', id: d.key })} /> : <Empty icon="target" title="No readiness data yet">Record ADKAR assessments, training and readiness criteria.</Empty>}
          </Card>
          <Card title="ADKAR results by group" sub="Latest visible result for each impacted group. Cells at or below 3 are below the barrier threshold." actions={<HeatScale steps={['var(--div-neg-3)', 'var(--div-neg-1)', 'var(--div-mid)', 'var(--div-pos-1)', 'var(--div-pos-3)']} labels={['1', '5']} />}>
            <Heatmap rows={m.groups.map((g) => ({ key: g.id, label: g.name, g }))} cols={ADKAR.map((a) => ({ key: a.id, label: a.label }))} value={(r, c) => r.g.adkar?.scores?.[c.key] ?? null}
              fill={(v) => adkarFill(v, m.settings.adkar.threshold)} ink={(v) => adkarInk(v, m.settings.adkar.threshold)} format={(v) => Number(v).toFixed(1)} caption="ADKAR scores by impacted group" />
          </Card>
        </div>
        <div className="stack">
          <Card title="Coverage warnings" sub="Plan gaps by group, ADKAR element and priority stakeholder (RUL-15)" flush actions={<Link to={`${base}/plan`} className="btn btn-sm">Master plan</Link>}>
            {m.coverage.length === 0 ? <Empty icon="checkCircle" title="No coverage gaps" /> : m.coverage.slice(0, 8).map((w) => (
              <div key={w.id} className={`alert-item ${w.ack ? 'info' : 'warning'}`}>
                <Icon name={w.ack ? 'checkCircle' : 'alert'} className="ai-icon" />
                <div className="grow"><div className="small">{w.message}</div>{w.ack && <div className="tiny muted">Acknowledged: {w.ack.note || w.ack.reason}</div>}</div>
              </div>
            ))}
            {m.coverage.length > 8 && <div style={{ padding: '8px 14px' }}><Link to={`${base}/plan`} className="small">All {m.coverage.length} warnings</Link></div>}
          </Card>
          <Card title="Coming up" sub="Planned engagements" flush actions={<Link to={`${base}/engagement`} className="btn btn-sm">Engagement</Link>}>
            {upcoming.length === 0 && <Empty icon="calendar" title="Nothing planned" />}
            {upcoming.map((e) => (
              <button key={e.id} type="button" className="alert-item info" style={{ width: '100%', border: 0, borderBottom: '1px solid var(--line)', background: 'none', textAlign: 'left', cursor: 'pointer' }} onClick={() => drawer.open({ type: 'engagement', id: e.id })}>
                <Icon name="calendar" className="ai-icon" />
                <span className="grow"><span className="ai-title" style={{ display: 'block' }}>{e.label}</span><span className="ai-detail">{fmtDate(e.plannedDate)}{e.plannedTime ? ` ${e.plannedTime}` : ''} ({relative(e.plannedDate, today)}) · {e.audienceLabel}</span></span>
              </button>
            ))}
          </Card>
          <Card title="My actions here" flush>
            {myTasks.length === 0 && <Empty icon="task" title="No open actions" />}
            {myTasks.map((t) => (
              <button key={t.id} type="button" className="alert-item info" style={{ width: '100%', border: 0, borderBottom: '1px solid var(--line)', background: 'none', textAlign: 'left', cursor: 'pointer' }} onClick={() => drawer.open({ type: 'task', id: t.id })}>
                <Icon name="task" className="ai-icon" />
                <span className="grow"><span className="ai-title" style={{ display: 'block' }}>{t.title}</span><span className="ai-detail">{t.dueDate ? `Due ${fmtDate(t.dueDate)} (${relative(t.dueDate, today)})` : 'No due date'}</span></span>
                {t.dueDate && t.dueDate < today && <Badge tone="critical" icon="octagon">Overdue</Badge>}
              </button>
            ))}
          </Card>
          <Card title="Impacted groups" flush actions={<Link to={`${base}/impact`} className="btn btn-sm">Impact</Link>}>
            <table className="tbl tbl-compact">
              <thead><tr><th>Group</th><th className="num">Impact</th><th>Barrier point</th></tr></thead>
              <tbody>{m.groups.map((g) => <tr key={g.id} className="clickable" onClick={() => navigate(`${base}/impact?open=impactedGroup:${g.id}`)}><td>{g.name}</td><td className="num">{g.overall ?? '—'}{g.high && <span className="sr-only"> (high impact)</span>}</td><td><BarrierBadge element={g.barrierPoint} /></td></tr>)}</tbody>
            </table>
          </Card>
        </div>
      </div>
      <p className="tiny muted mt-4">Phase deliverables: {PHASES.map((p) => `${p.label} — ${p.deliverable}`).join(' · ')}.</p>
    </>
  );
}
