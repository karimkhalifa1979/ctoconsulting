// Master Change Management Plan (PLN-001 to PLN-010): plan selection by approach (RUL-14), activities
// across every plan, timeline, coverage warnings and acknowledgements (RUL-15, PLN-005), progress
// (PLN-009), baselines and the change log (PLN-006), approval (PLN-007) and Microsoft Project export.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, StatusBadge, Spinner, Modal, AdkarTags, Meter } from '../../ui/core.jsx';
import DataGrid from '../../ui/DataGrid.jsx';
import { ImportButton } from '../../ui/ImportWizard.jsx';
import ApprovalPanel from '../../ui/Approvals.jsx';
import { RefPicker, AdkarPicker } from '../../ui/fields.jsx';
import { Gantt, Heatmap, StackedBars, impactFill, impactInk } from '../../charts/index.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, label } from '../../lib/format.js';
import { ADKAR, PLAN_TYPES, PLANNING_APPROACHES, CORE_PLANS, EXTEND_PLANS, adkarLabel } from '../../../shared/refdata.js';
import { compareBaseline, targetsGroup } from '../../../shared/rules/plan.js';
import { asArray, sortBy, uid } from '../../../shared/util.js';
import { saveBlob } from '../../data/client.js';

// Each plan's own document in the artefact catalogue.
export const PLAN_ARTEFACT = { blueprint: 'blueprint', sponsor: 'sponsorPack', peopleManager: 'managerBriefing', communications: 'commsPlan', training: 'trainingPlan', resistance: 'resistancePlan', changeAgent: 'canPlan', sponsorCoalition: 'coalitionPlan', sustainment: 'sustainmentPlan' };

export default function Plan() {
  const { m, base, ini } = useIniPage();
  const [tab, setTab] = useTab('activities');
  if (!m) return <Spinner />;
  const open = m.coverage.filter((w) => !w.ack).length;
  const exportMsp = async () => {
    const { toMspdi } = await import('../../../shared/integrations/msproject.js');
    saveBlob(new Blob([toMspdi({ initiative: m.initiative, activities: m.activities.filter((a) => a.status !== 'cancelled'), milestones: m.milestones })], { type: 'application/xml' }), `${m.initiative.shortName || m.initiative.name} change plan.xml`);
  };
  return (
    <>
      <PageHead eyebrow="Phase 2 deliverable · Plan and Act" title="Master Change Management Plan"
        actions={<><button type="button" className="btn" onClick={exportMsp}><Icon name="download" />Microsoft Project</button><Link className="btn btn-primary" to={`${base}/artefacts?type=masterPlan`}><Icon name="file" />Generate document</Link></>}>
        Every plan's activities in one place, targeted by impacted group and ADKAR element, scheduled against the project's milestones.
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'activities', label: 'Activities', count: m.activities.filter((a) => a.status !== 'cancelled').length },
        { id: 'timeline', label: 'Timeline' },
        { id: 'coverage', label: 'Coverage', count: open || null },
        { id: 'progress', label: 'Progress' },
        { id: 'plans', label: 'Plans in scope' },
        { id: 'baselines', label: 'Baselines and changes', count: m.planChanges.length || null },
        { id: 'approval', label: 'Approval' },
      ]} />
      {tab === 'activities' && <Activities />}
      {tab === 'timeline' && <Timeline />}
      {tab === 'coverage' && <Coverage />}
      {tab === 'progress' && <Progress />}
      {tab === 'plans' && <PlanSelection />}
      {tab === 'baselines' && <Baselines />}
      {tab === 'approval' && <PlanApproval />}
    </>
  );
}

export function activityColumns({ m, config, lookups, usersById }) {
  return [
    { key: 'code', label: 'ID', render: (a) => <span className="code">{a.code}</span>, value: (a) => a.code, width: 80 },
    { key: 'title', label: 'Activity', render: (a) => <span><strong>{a.title}</strong>{a.kind === 'communication' && <> <Badge tone="info">Communication</Badge></>}{a.aiDrafted && <> <Badge tone="warning" icon="sparkles">AI draft</Badge></>}</span>, value: (a) => a.title },
    { key: 'plans', label: 'Plans', render: (a) => <span className="sub-line" style={{ maxWidth: 200 }}>{asArray(a.plans).map((p) => m.planTypes.find((t) => t.id === p)?.label || p).join(', ')}</span>, value: (a) => asArray(a.plans).map((p) => m.planTypes.find((t) => t.id === p)?.label || p).join(', ') },
    { key: 'adkar', label: 'ADKAR', render: (a) => <AdkarTags value={a.adkar} />, value: (a) => asArray(a.adkar).join(' ') },
    { key: 'groups', label: 'Groups', render: (a) => <span className="sub-line" style={{ maxWidth: 220 }}>{asArray(a.groupIds).length ? asArray(a.groupIds).map((g) => m.byId.impactedGroup[g]?.name).filter(Boolean).join(', ') : <span className="muted">All groups</span>}</span>, value: (a) => asArray(a.groupIds).map((g) => m.byId.impactedGroup[g]?.name).join(', ') },
    { key: 'owner', label: 'Owner', render: (a) => usersById[a.ownerId]?.name || '—', value: (a) => usersById[a.ownerId]?.name || '' },
    { key: 'startDate', label: 'Start', render: (a) => <span className="nowrap">{fmtDate(a.startDate) || '—'}</span>, value: (a) => a.startDate || '' },
    { key: 'endDate', label: 'End', render: (a) => <span className="nowrap">{fmtDate(a.endDate) || '—'}{a.overdue && <> <Badge tone="critical" icon="octagon">Overdue</Badge></>}</span>, value: (a) => a.endDate || '' },
    { key: 'status', label: 'Status', render: (a) => <StatusBadge status={a.status} labelText={`${label('activityStatus', a.status, config)}${a.status === 'inProgress' && a.percentComplete ? ` ${a.percentComplete}%` : ''}`} />, value: (a) => a.status },
    { key: 'deliverer', label: 'Deliverer', hidden: true, render: (a) => lookups.nameOf('stakeholder', a.delivererId) || '—', value: (a) => lookups.nameOf('stakeholder', a.delivererId) },
  ];
}

function Activities() {
  const { m, ini, config, lookups, usersById, drawer, canDo } = useIniPage();
  const [suggest, setSuggest] = useState(false);
  const rows = sortBy(m.activities, (a) => a.startDate || '9999');
  const facets = [
    { key: 'plan', label: 'Plan', options: m.planTypes.filter((p) => rows.some((a) => asArray(a.plans).includes(p.id))).map((p) => ({ id: p.id, label: p.label })), value: (a) => asArray(a.plans) },
    { key: 'element', label: 'ADKAR', options: ADKAR.map((x) => ({ id: x.id, label: x.label })), value: (a) => asArray(a.adkar) },
    { key: 'group', label: 'Group', options: m.groups.map((g) => ({ id: g.id, label: g.name })), value: (a) => (asArray(a.groupIds).length ? asArray(a.groupIds) : m.groups.map((g) => g.id)) },
    { key: 'status', label: 'Status', options: ['notStarted', 'inProgress', 'complete', 'onHold', 'cancelled', 'overdue'].map((s) => ({ id: s, label: s === 'overdue' ? 'Overdue' : label('activityStatus', s, config) })), value: (a) => [a.status, a.overdue ? 'overdue' : null].filter(Boolean) },
  ];
  return (
    <div className="stack">
      <div className="row-between">
        <p className="small muted" style={{ margin: 0, maxWidth: 760 }}>Activities with no target group apply to every group. Once the plan is baselined, changes to scope and dates need a reason and are kept in the change log (PLN-006).</p>
        {canDo('C', 'activity') && <div className="btn-row"><ImportButton type="activity" initiativeId={ini.id} /><button type="button" className="btn" onClick={() => setSuggest(true)}><Icon name="lightbulb" />Interventions for a barrier point</button><button type="button" className="btn btn-primary" onClick={() => drawer.open({ type: 'activity', defaults: { kind: 'activity', status: 'notStarted' }, wide: true })}><Icon name="plus" />Add activity</button></div>}
      </div>
      <DataGrid id="activities" type="activity" title="Plan activities" rows={rows} columns={activityColumns({ m, config, lookups, usersById })} facets={facets}
        onRowClick={(a) => drawer.open({ type: 'activity', id: a.id, wide: true })} selectable={canDo('U', 'activity')} bulkFields={['ownerId', 'status', 'percentComplete', 'startDate', 'endDate']} defaultSort={{ key: 'startDate', dir: 'asc' }} />
      {suggest && <InterventionPicker onClose={() => setSuggest(false)} />}
    </div>
  );
}

// ADK-011 / UC-06 steps 6–7: library interventions for a group's barrier point, accepted into the plan.
export function InterventionPicker({ onClose, groupId: initialGroup }) {
  const { m, ini, mut, toast, lookups, user, today } = useIniPage();
  const [groupId, setGroupId] = useState(initialGroup || m.groups.find((g) => g.barrierPoint && g.barrierPoint !== 'none')?.id || m.groups[0]?.id);
  const [res, setRes] = useState(null);
  const [chosen, setChosen] = useState({});
  const load = async (gid) => {
    setGroupId(gid);
    setChosen({});
    setRes(await mut.op('suggestInterventions', { initiativeId: ini.id, groupId: gid }, { quiet: true }));
  };
  useEffect(() => { if (groupId) load(groupId); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const accept = async () => {
    const items = Object.entries(chosen).filter(([, v]) => v.on).map(([id, v]) => ({ interventionId: id, ownerId: v.ownerId || user.id, startDate: v.startDate || today, endDate: v.endDate || v.startDate || today }));
    await mut.op('acceptInterventions', { initiativeId: ini.id, groupId, items });
    toast.success(`${items.length} intervention(s) added to the plan`);
    onClose();
  };
  const n = Object.values(chosen).filter((v) => v.on).length;
  return (
    <Modal title="Interventions for a barrier point" onClose={onClose} wide footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!n} onClick={accept}>Add {n || ''} to the plan</button></>}>
      <div className="stack">
        <label className="field"><span>Impacted group</span><select value={groupId || ''} onChange={(e) => load(e.target.value)}>{m.groups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.barrierPoint ? ` · barrier: ${g.barrierPoint === 'none' ? 'none' : adkarLabel(g.barrierPoint)}` : ''}</option>)}</select></label>
        {res && (
          <>
            <div className={`callout ${res.onTrack ? 'good' : 'warn'} small`}>
              {res.onTrack ? <>No barrier point: the group is on track, so the library suggests <strong>Reinforcement</strong> actions.</> : <>Barrier point: <strong>{adkarLabel(res.barrierPoint)}</strong>. Signs: {res.signs}</>}
            </div>
            <table className="tbl">
              <thead><tr><th className="cb" /><th>Intervention</th><th>Owner</th><th>Start</th><th>End</th></tr></thead>
              <tbody>{res.items.map((iv) => {
                const c = chosen[iv.id] || {};
                const upd = (patch) => setChosen((x) => ({ ...x, [iv.id]: { ...c, ...patch } }));
                return (
                  <tr key={iv.id}>
                    <td><input type="checkbox" aria-label={`Add ${iv.title}`} checked={!!c.on} disabled={iv.alreadyPlanned} onChange={(e) => upd({ on: e.target.checked })} /></td>
                    <td style={{ whiteSpace: 'normal', minWidth: 260 }}><strong>{iv.title}</strong>{iv.alreadyPlanned && <> <Badge tone="good" icon="checkCircle">Already planned</Badge></>}<div className="small muted">{iv.description}</div><div className="tiny muted">{m.planTypes.find((p) => p.id === iv.plan)?.label} · {label('responsibleRole', iv.role)}</div></td>
                    <td style={{ minWidth: 160 }}>{c.on && <RefPicker options={lookups.optionsFor('user')} value={c.ownerId || user.id} onChange={(v) => upd({ ownerId: v })} />}</td>
                    <td>{c.on && <input type="date" value={c.startDate || today} onChange={(e) => upd({ startDate: e.target.value })} aria-label="Start" />}</td>
                    <td>{c.on && <input type="date" value={c.endDate || c.startDate || today} onChange={(e) => upd({ endDate: e.target.value })} aria-label="End" />}</td>
                  </tr>
                );
              })}</tbody>
            </table>
            <p className="tiny muted">The intervention library is maintained by administrators (Appendix B). Accepted interventions become plan activities linked to the group and the barrier point.</p>
          </>
        )}
      </div>
    </Modal>
  );
}

function Timeline() {
  const { m, today, drawer, config } = useIniPage();
  const [by, setBy] = useState('plan');
  const acts = m.activities.filter((a) => a.status !== 'cancelled' && (a.startDate || a.endDate));
  const item = (a) => ({ id: a.id, label: a.title, start: a.startDate, end: a.endDate, pct: a.status === 'complete' ? 100 : Number(a.percentComplete) || 0, state: a.status === 'complete' ? 'complete' : a.overdue ? 'overdue' : '', statusLabel: label('activityStatus', a.status, config) });
  const groups = by === 'plan'
    ? m.planTypes.map((p) => ({ key: p.id, label: p.label, items: sortBy(acts.filter((a) => asArray(a.plans)[0] === p.id), 'startDate').map(item) })).filter((g) => g.items.length)
    : ADKAR.map((el) => ({ key: el.id, label: el.label, items: sortBy(acts.filter((a) => asArray(a.adkar)[0] === el.id), 'startDate').map(item) })).filter((g) => g.items.length);
  return (
    <Card title="Timeline" sub="Activities grouped by their first plan or ADKAR element, with milestones and today." actions={<select value={by} onChange={(e) => setBy(e.target.value)} aria-label="Group by"><option value="plan">By plan</option><option value="adkar">By ADKAR element</option></select>} flush>
      <Gantt groups={groups} milestones={m.milestones} today={today} onSelect={(it) => drawer.open({ type: 'activity', id: it.id, wide: true })} />
    </Card>
  );
}

function Coverage() {
  const { m, mut, toast, canDo, ini, dialog } = useIniPage();
  const [sel, setSel] = useState(new Set());
  const unacked = m.coverage.filter((w) => !w.ack);
  const ack = async () => {
    const note = await dialog.prompt({ title: `Acknowledge ${sel.size} warning(s)`, message: 'Warnings do not block approval but must be acknowledged with a reason before the plan is submitted (RUL-15).', label: 'Why this is acceptable' });
    if (!note) return;
    await mut.op('acknowledgeCoverage', { initiativeId: ini.id, warningIds: [...sel], note });
    setSel(new Set());
    toast.success('Acknowledged');
  };
  const acts = m.activities.filter((a) => a.status !== 'cancelled');
  return (
    <div className="stack">
      <div className="grid g-main">
        <Card title="Coverage warnings" sub="Groups without activity for an ADKAR element, high-impact groups without People Manager activities, unaddressed barrier points, and priority stakeholders without a planned engagement (RUL-15)."
          actions={canDo('U', 'activity') && sel.size > 0 && <button type="button" className="btn btn-sm btn-primary" onClick={ack}>Acknowledge {sel.size}</button>} flush>
          {m.coverage.length === 0 && <Empty icon="checkCircle" title="No coverage gaps" />}
          {m.coverage.map((w) => (
            <div key={w.id} className={`alert-item ${w.ack ? 'info' : w.severity === 'high' ? 'critical' : 'warning'}`}>
              {!w.ack && canDo('U', 'activity') ? <input type="checkbox" aria-label={`Select: ${w.message}`} checked={sel.has(w.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(w.id) ? n.delete(w.id) : n.add(w.id); return n; })} style={{ marginTop: 3 }} /> : <Icon name="checkCircle" className="ai-icon" />}
              <div className="grow">
                <div>{w.message}</div>
                {w.ack && <div className="tiny muted">Acknowledged by {w.ack.byName || 'the change team'}: {w.ack.note || w.ack.reason}</div>}
              </div>
              <Badge tone={w.ack ? '' : w.severity === 'high' ? 'serious' : 'warning'}>{w.ack ? 'Acknowledged' : w.severity === 'high' ? 'High' : 'Medium'}</Badge>
            </div>
          ))}
        </Card>
        <Card title="Summary">
          <div className="hero-figure">{unacked.length}</div>
          <p className="small muted">open warnings · {m.coverage.length - unacked.length} acknowledged</p>
          {unacked.length > 0 && <p className="small">The Master Change Management Plan cannot be submitted for approval until every warning is resolved or acknowledged.</p>}
        </Card>
      </div>
      <Card title="Activities by group and ADKAR element" sub="Number of live activities targeting each group for each element (PLN-005). Empty cells are gaps.">
        <Heatmap rows={m.groups.map((g) => ({ key: g.id, label: g.name }))} cols={ADKAR.map((el) => ({ key: el.id, label: el.label }))}
          value={(r, c) => { const n = acts.filter((a) => targetsGroup(a, r.key) && asArray(a.adkar).includes(c.key)).length; return n || null; }}
          fill={(v) => impactFill(Math.min(5, v))} ink={(v) => impactInk(Math.min(5, v))} caption="Activities by group and element" />
      </Card>
    </div>
  );
}

function Progress() {
  const { m, usersById } = useIniPage();
  const p = m.progress;
  const series = [{ key: 'complete', label: 'Complete', color: 'var(--series-3)' }, { key: 'inProgress', label: 'In progress', color: 'var(--series-1)' }, { key: 'notStarted', label: 'Not started', color: 'var(--series-muted)' }];
  const toRows = (list, lab) => list.map((x) => ({ key: lab(x), label: lab(x), values: { complete: x.complete, inProgress: x.inProgress, notStarted: x.total - x.complete - x.inProgress } }));
  return (
    <div className="stack">
      <div className="kpis">
        <div className="kpi"><span className="kpi-label">Activities complete</span><span className="kpi-value">{p.overall.complete}<small>/ {p.overall.total}</small></span><Meter value={p.overall.pct} label="Overall progress" /></div>
        <div className="kpi"><span className="kpi-label">In progress</span><span className="kpi-value">{p.overall.inProgress}</span></div>
        <div className="kpi"><span className="kpi-label">Overdue</span><span className="kpi-value" style={{ color: p.overall.overdue ? 'var(--st-critical-ink)' : undefined }}>{p.overall.overdue}</span></div>
        <div className="kpi"><span className="kpi-label">Average completion</span><span className="kpi-value">{p.overall.pct ?? '—'}<small>%</small></span></div>
      </div>
      <div className="grid g-2">
        <Card title="By plan"><StackedBars rows={toRows(p.byPlan, (x) => x.plan.label)} series={series} ariaLabel="Progress by plan" /></Card>
        <Card title="By ADKAR element"><StackedBars rows={toRows(p.byElement, (x) => x.element.label)} series={series} ariaLabel="Progress by ADKAR element" /></Card>
        <Card title="By impacted group"><StackedBars rows={toRows(p.byGroup, (x) => x.group.name)} series={series} ariaLabel="Progress by impacted group" labelWidth={210} /></Card>
        <Card title="By owner"><StackedBars rows={toRows(p.byOwner, (x) => usersById[x.ownerId]?.name || 'Unassigned')} series={series} ariaLabel="Progress by owner" /></Card>
      </div>
    </div>
  );
}

function PlanSelection() {
  const { m, mut, toast, canDo, ini, dialog } = useIniPage();
  const init = m.initiative;
  const [plans, setPlans] = useState(asArray(init.selectedPlans));
  const [custom, setCustom] = useState(asArray(init.customPlans));
  const [rationale, setRationale] = useState(init.planRationale || '');
  const rec = m.risk.recommended;
  const toggle = (id) => setPlans((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const save = async () => {
    await mut.op('selectPlans', { initiativeId: ini.id, plans, rationale, customPlans: custom });
    toast.success('Plans in scope saved');
  };
  const addCustom = async () => {
    const name = await dialog.prompt({ title: 'Add a custom plan type', label: 'Plan name', multiline: false });
    if (!name) return;
    const id = `custom-${uid().slice(0, 6)}`;
    setCustom((c) => [...c, { id, label: name, adkar: [], purpose: '' }]);
    setPlans((p) => [...p, id]);
  };
  const editable = canDo('U', 'initiative');
  const section = (title, list) => (
    <div className="form-section">
      <h3>{title}</h3>
      {list.map((p) => {
        const stats = m.progress.byPlan.find((x) => x.plan.id === p.id);
        return (
          <label key={p.id} className="check" style={{ display: 'flex', padding: '6px 0' }}>
            <input type="checkbox" checked={plans.includes(p.id)} disabled={!editable} onChange={() => toggle(p.id)} />
            <span className="grow"><strong>{p.label}</strong>{rec?.plans.includes(p.id) && <> <Badge tone="teal">Recommended</Badge></>}<div className="small muted">{p.purpose}</div></span>
            <span className="small muted nowrap">{stats ? `${stats.total} activities` : ''}</span>
          </label>
        );
      })}
    </div>
  );
  return (
    <div className="grid g-main">
      <Card title="Plans in the Master Change Management Plan" sub="The plans make up the Master Change Management Plan; each can be generated as its own artefact (PLN-002, Table 3).">
        {section('Foundation', PLAN_TYPES.filter((p) => p.category === 'foundation'))}
        {section('Core plans', PLAN_TYPES.filter((p) => CORE_PLANS.includes(p.id)))}
        {section('Extend plans', PLAN_TYPES.filter((p) => EXTEND_PLANS.includes(p.id)))}
        <div className="form-section">
          <div className="row-between"><h3 style={{ margin: 0 }}>Custom plans</h3>{editable && <button type="button" className="btn btn-xs" onClick={addCustom}><Icon name="plus" />Add custom plan</button>}</div>
          {custom.length ? custom.map((c) => (
            <div key={c.id} className="row mt-2" style={{ flexWrap: 'nowrap' }}>
              <input type="checkbox" checked={plans.includes(c.id)} disabled={!editable} onChange={() => toggle(c.id)} aria-label={`Include ${c.label}`} />
              <input type="text" value={c.label} disabled={!editable} onChange={(e) => setCustom((xs) => xs.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)))} aria-label="Custom plan name" style={{ flex: 1 }} />
              <AdkarPicker value={c.adkar} onChange={(v) => setCustom((xs) => xs.map((x) => (x.id === c.id ? { ...x, adkar: v } : x)))} disabled={!editable} />
            </div>
          )) : <p className="small muted mt-1">None. Add one for plans your organisation uses, for example a Partner Plan.</p>}
        </div>
        <label className="field mt-3"><span>Rationale for the plans selected<em className="req">*</em></span><textarea rows={3} value={rationale} disabled={!editable} onChange={(e) => setRationale(e.target.value)} /></label>
        {editable && <div className="btn-row mt-3" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-primary" disabled={!rationale.trim() || !plans.length} onClick={save}>Save plans in scope</button></div>}
      </Card>
      <Card title="Recommendation" sub="RUL-14">
        {rec ? <><p><strong>{rec.label}</strong> for a {label('riskProfile', m.risk.profile)} change risk profile.</p><p className="small muted">{rec.description}</p>{PLANNING_APPROACHES.map((a) => <div key={a.id} className="small">{a.id === rec.id ? <Icon name="check" size={13} /> : <span style={{ display: 'inline-block', width: 13 }} />} {a.label}</div>)}</> : <Empty title="Assess the change risk profile for a recommendation" />}
      </Card>
    </div>
  );
}

function Baselines() {
  const { m, mut, toast, canDo, ini, dialog, usersById, config } = useIniPage();
  const [baseId, setBaseId] = useState(m.baselines[m.baselines.length - 1]?.id || '');
  const baseline = m.baselines.find((b) => b.id === baseId);
  const diff = useMemo(() => (baseline ? compareBaseline(m.activities.filter((a) => a.status !== 'cancelled'), asArray(baseline.activities)) : null), [baseline, m.activities]);
  const take = async () => {
    const name = await dialog.prompt({ title: 'Baseline the plan', label: 'Baseline name', multiline: false, defaultValue: `Baseline ${m.baselines.length + 1}` });
    if (!name) return;
    await mut.op('baselinePlan', { initiativeId: ini.id, name, reason: 'Baseline taken by the change team' });
    toast.success('Plan baselined');
  };
  return (
    <div className="stack">
      <Card title="Compare with a baseline" sub="Added, removed and changed activities since the baseline, with schedule slippage (PLN-006)."
        actions={<>{m.baselines.length > 0 && <select value={baseId} onChange={(e) => setBaseId(e.target.value)} aria-label="Baseline">{m.baselines.map((b) => <option key={b.id} value={b.id}>{b.name} ({fmtDate(b.date)})</option>)}</select>}{canDo('U', 'activity') && <button type="button" className="btn btn-sm" onClick={take}><Icon name="archive" />Baseline now</button>}</>}>
        {!baseline && <Empty icon="archive" title="No baseline yet">Baseline the plan when it is approved; later changes then need a reason.</Empty>}
        {diff && (
          <div className="stack">
            <div className="row small"><Badge tone="info">{diff.added.length} added</Badge><Badge tone="warning">{diff.changed.length} changed</Badge><Badge>{diff.removed.length} removed</Badge></div>
            {diff.changed.length > 0 && (
              <table className="tbl tbl-compact">
                <thead><tr><th>Activity</th><th>What changed</th><th className="num">Slip (days)</th></tr></thead>
                <tbody>{diff.changed.map((c) => <tr key={c.activity.id}><td>{c.activity.code} {c.activity.title}</td><td className="small" style={{ whiteSpace: 'normal' }}>{c.diffs.map((x) => `${x.field}: ${Array.isArray(x.from) ? x.from.join(', ') : x.field.endsWith('Date') ? fmtDate(x.from) : x.from ?? '—'} → ${Array.isArray(x.to) ? x.to.join(', ') : x.field.endsWith('Date') ? fmtDate(x.to) : x.to ?? '—'}`).join('; ')}</td><td className="num">{c.slipDays ?? '—'}</td></tr>)}</tbody>
              </table>
            )}
            {diff.added.length > 0 && <div className="small"><strong>Added:</strong> {diff.added.map((a) => `${a.code} ${a.title}`).join('; ')}</div>}
            {diff.removed.length > 0 && <div className="small"><strong>Removed:</strong> {diff.removed.map((a) => `${a.code} ${a.title}`).join('; ')}</div>}
          </div>
        )}
      </Card>
      <Card title="Plan change log" sub="Every change to a baselined plan, with its reason (PLN-006)." flush>
        {m.planChanges.length ? (
          <table className="tbl"><thead><tr><th>Date</th><th>Change</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>{sortBy(m.planChanges, '-createdAt').map((c) => <tr key={c.id}><td className="nowrap">{fmtDate(String(c.createdAt).slice(0, 10))}</td><td style={{ whiteSpace: 'normal' }}>{c.summary}</td><td style={{ whiteSpace: 'normal' }}>{c.reason}</td><td>{usersById[c.createdBy]?.name || '—'}</td></tr>)}</tbody></table>
        ) : <Empty icon="history" title="No changes since the baseline" />}
      </Card>
    </div>
  );
}

function PlanApproval() {
  const { m, users, canDo, base } = useIniPage();
  const sponsorUser = users.find((u) => u.stakeholderId && u.stakeholderId === m.initiative.primarySponsorId);
  const open = m.coverage.filter((w) => !w.ack).length;
  return (
    <div className="grid g-main">
      <Card title="Approval of the Master Change Management Plan" sub="Approving the plan baselines it automatically (PLN-007).">
        {open > 0 && <div className="callout warn small mb-3">{open} coverage warning{open > 1 ? 's are' : ' is'} not yet acknowledged. Resolve or acknowledge them on the Coverage tab before submitting (RUL-15).</div>}
        <ApprovalPanel subjectType="masterPlan" subjectId={m.initiative.id} label="Master Change Management Plan" canSubmit={canDo('U', 'activity') && open === 0} defaultApprovers={sponsorUser ? [sponsorUser.id] : []} />
      </Card>
      <Card title="Component plans" sub="Each plan can be approved separately and generated as its own document." flush>
        <table className="tbl tbl-compact"><tbody>{m.planTypes.filter((p) => m.selectedPlans.includes(p.id)).map((p) => <tr key={p.id}><td>{p.label}</td><td className="right"><Link to={`${base}/artefacts?type=${PLAN_ARTEFACT[p.id] || 'masterPlan'}`} className="btn btn-xs">Generate</Link></td></tr>)}</tbody></table>
      </Card>
    </div>
  );
}

