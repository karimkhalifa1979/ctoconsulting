// Define Impact (IMP-001 to IMP-012): impacted groups, impacts by aspect with degree 0–5, roll-up from
// role and process level (RUL-20), heatmap and timeline (IMP-008), adoption challenge, WIIFM and
// concerns (IMP-007) and business confirmation (IMP-010).
import { useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, StatusBadge, Spinner, Help, BarrierBadge, Seg } from '../../ui/core.jsx';
import Register from '../../ui/Register.jsx';
import DataGrid from '../../ui/DataGrid.jsx';
import { Heatmap, HeatScale, impactFill, impactInk, SEQ } from '../../charts/index.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, fmtNum, label, options } from '../../lib/format.js';
import { timeline } from '../../../shared/rules/impact.js';
import { periodRange, addMonths } from '../../../shared/dates.js';
import { groupBy, indexBy } from '../../../shared/util.js';

export default function Impact() {
  const { m, config } = useIniPage();
  const [tab, setTab] = useTab('heatmap');
  if (!m) return <Spinner />;
  const unconfirmed = m.groups.filter((g) => g.confirmationStatus !== 'confirmed').length;
  return (
    <>
      <PageHead eyebrow="Phase 1 · Define Impact" title="Change impact">
        Who will need to work differently, in what ways, how much and when. The overall impact for a group is its highest aspect score{m.settings.impact.rollup === 'weightedAverage' ? ' (weighted average configured)' : ''}; 4 or more is high impact <Help term="Degree of impact" text="Each aspect is rated 0 (none) to 5 (very high). Impacts recorded for roles or processes roll up to the group (RUL-20)." />.
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'heatmap', label: 'Heatmap' },
        { id: 'groups', label: 'Impacted groups', count: m.groups.length },
        { id: 'impacts', label: 'All impacts', count: m.impacts.length },
        { id: 'timeline', label: 'Timeline' },
        { id: 'confirm', label: 'Business confirmation', count: unconfirmed || null },
      ]} />
      {tab === 'heatmap' && <ImpactHeatmap config={config} />}
      {tab === 'groups' && <Groups />}
      {tab === 'impacts' && <AllImpacts />}
      {tab === 'timeline' && <ImpactTimeline />}
      {tab === 'confirm' && <Confirmation />}
    </>
  );
}

function ImpactHeatmap({ config }) {
  const { m, drawer } = useIniPage();
  const aspects = options('impactAspect', config);
  const used = aspects.filter((a) => m.groups.some((g) => g.degrees?.[a.id] != null));
  if (!m.groups.length) return <Empty icon="impact" title="No impacted groups yet">Add the groups who will need to work differently.</Empty>;
  return (
    <div className="grid g-main">
      <Card title="Impact heatmap" sub="Degree of impact by group and aspect. Select a group to see its impacts." actions={<HeatScale steps={[1, 2, 3, 4, 5].map(impactFill)} labels={['1', '5']} />}>
        <Heatmap rows={m.groups.map((g) => ({ key: g.id, label: g.name, g }))} cols={[...used.map((a) => ({ key: a.id, label: a.label })), { key: '_overall', label: 'Overall' }]}
          value={(r, c) => (c.key === '_overall' ? r.g.overall : r.g.degrees?.[c.key] ?? null)} fill={(v) => impactFill(v)} ink={(v) => impactInk(v)}
          onCell={(r) => drawer.open({ type: 'impactedGroup', id: r.key, wide: true, after: (rec) => rec && <GroupImpacts groupId={rec.id} /> })} caption="Degree of impact by impacted group and aspect" />
      </Card>
      <Card title="Summary" flush>
        <table className="tbl">
          <thead><tr><th>Group</th><th className="num">People</th><th className="num">Overall</th></tr></thead>
          <tbody>
            {m.groups.map((g) => <tr key={g.id}><td>{g.name}{g.high && <> <Badge tone="serious" icon="alert">High</Badge></>}</td><td className="num">{fmtNum(g.headcount)}</td><td className="num">{g.overall ?? '—'}</td></tr>)}
          </tbody>
          <tfoot><tr><td>Total</td><td className="num">{fmtNum(m.kpis.headcount)}</td><td className="num">{m.kpis.highImpactGroups} high</td></tr></tfoot>
        </table>
      </Card>
    </div>
  );
}

// Impacts of one group, shown inside the group's drawer.
export function GroupImpacts({ groupId }) {
  const { m, drawer, canDo, config } = useIniPage();
  const g = m.groupsById[groupId];
  if (!g) return null;
  return (
    <div className="form-section">
      <div className="row-between mb-2">
        <h3 style={{ margin: 0 }}>Impacts on this group</h3>
        {canDo('C', 'impact') && <button type="button" className="btn btn-sm" onClick={() => drawer.open({ type: 'impact', defaults: { impactedGroupId: groupId, level: 'group' } })}><Icon name="plus" />Add impact</button>}
      </div>
      {g.impacts.length ? (
        <table className="tbl tbl-compact">
          <thead><tr><th>Aspect</th><th>Level</th><th>Current → future</th><th className="num">Degree</th><th>When</th></tr></thead>
          <tbody>{g.impacts.map((i) => (
            <tr key={i.id} className="clickable" onClick={() => drawer.open({ type: 'impact', id: i.id })}>
              <td>{label('impactAspect', i.aspect, config)}</td><td className="small">{label('impactLevel', i.level, config)}{i.subject ? `: ${i.subject}` : ''}</td>
              <td className="small">{i.currentState} → <strong>{i.futureState}</strong></td><td className="num"><span className="adkar-tag" style={{ background: impactFill(i.degree), color: impactInk(i.degree) }}>{i.degree}</span></td>
              <td className="small nowrap">{m.byId.milestone[i.milestoneId]?.name || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <div className="muted small">No impacts recorded yet.</div>}
      <dl className="kv mt-3">
        <dt>Members recorded</dt><dd>{g.memberCount} in the stakeholder register</dd>
        <dt>Barrier point</dt><dd><BarrierBadge element={g.barrierPoint} /></dd>
        <dt>Readiness index</dt><dd>{g.readiness.index ?? '—'}</dd>
      </dl>
    </div>
  );
}

function Groups() {
  const { m, lookups, drawer } = useIniPage();
  const rows = m.groups;
  return (
    <Register type="impactedGroup" title="Impacted groups" sub="Groups defined by organisational unit, role, location, employment type or external category, linked to the stakeholder register for membership (IMP-001, IMP-002)."
      rows={rows} drawerWide after={(rec) => rec && <GroupImpacts groupId={rec.id} />}
      columns={[
        { key: 'name', label: 'Impacted group', render: (g) => <strong>{g.name}</strong>, value: (g) => g.name },
        { key: 'definitionType', label: 'Defined by', render: (g) => label('groupDefinition', g.definitionType), value: (g) => label('groupDefinition', g.definitionType) },
        { key: 'headcount', label: 'People', align: 'num', render: (g) => fmtNum(g.headcount), value: (g) => Number(g.headcount) || 0 },
        { key: 'overall', label: 'Overall impact', align: 'num', render: (g) => (g.overall == null ? '—' : <span className="adkar-tag" style={{ background: impactFill(g.overall), color: impactInk(g.overall) }}>{g.overall}</span>), value: (g) => g.overall },
        { key: 'impacts', label: 'Impacts', align: 'num', render: (g) => g.impacts.length, value: (g) => g.impacts.length },
        { key: 'barrier', label: 'Barrier point', render: (g) => <BarrierBadge element={g.barrierPoint} />, value: (g) => g.barrierPoint || '' },
        { key: 'leader', label: 'Accountable leader', render: (g) => lookups.nameOf('stakeholder', g.managerStakeholderId) || '—', value: (g) => lookups.nameOf('stakeholder', g.managerStakeholderId) },
        { key: 'confirmationStatus', label: 'Business confirmation', render: (g) => <StatusBadge status={g.confirmationStatus} labelText={label('confirmationStatus', g.confirmationStatus)} />, value: (g) => g.confirmationStatus },
      ]}
      onOpen={(g) => drawer.open({ type: 'impactedGroup', id: g.id, wide: true, after: (rec) => rec && <GroupImpacts groupId={rec.id} /> })}
    />
  );
}

function AllImpacts() {
  const { m, config } = useIniPage();
  const groupsById = indexBy(m.groups);
  return (
    <Register type="impact" title="All impacts" sub="Impacts captured at group, role or process level. Role and process impacts roll up to their group (IMP-009)." facets={['aspect', 'level']}
      columns={[
        { key: 'group', label: 'Group', render: (i) => groupsById[i.impactedGroupId]?.name || '—', value: (i) => groupsById[i.impactedGroupId]?.name || '' },
        { key: 'aspect', label: 'Aspect', render: (i) => label('impactAspect', i.aspect, config), value: (i) => label('impactAspect', i.aspect, config) },
        { key: 'level', label: 'Level', render: (i) => `${label('impactLevel', i.level, config)}${i.subject ? `: ${i.subject}` : ''}`, value: (i) => i.level },
        { key: 'currentState', label: 'Current state', wrap: true, render: (i) => i.currentState, value: (i) => i.currentState },
        { key: 'futureState', label: 'Future state', wrap: true, render: (i) => i.futureState, value: (i) => i.futureState },
        { key: 'degree', label: 'Degree', align: 'num', render: (i) => <span className="adkar-tag" style={{ background: impactFill(i.degree), color: impactInk(i.degree) }}>{i.degree}</span>, value: (i) => Number(i.degree) },
        { key: 'when', label: 'When felt', render: (i) => m.byId.milestone[i.milestoneId]?.name || (i.feltFrom ? fmtDate(i.feltFrom) : '—'), value: (i) => m.byId.milestone[i.milestoneId]?.date || i.feltFrom || '' },
      ]}
      bulkFields={['milestoneId', 'degree', 'transitionWeeks']} />
  );
}

export function ImpactTimeline() {
  const { m, today } = useIniPage();
  const [unit, setUnit] = useState('month');
  const msById = indexBy(m.milestones);
  const start = m.initiative.startDate && m.initiative.startDate > addMonths(today, -6) ? m.initiative.startDate : addMonths(today, -2);
  const end = m.initiative.endDate || addMonths(today, 12);
  const periods = periodRange(start, end, unit);
  const rows = timeline(m.groups, groupBy(m.impacts, 'impactedGroupId'), msById, periods);
  return (
    <Card title="When impacts are felt" sub="Highest degree of impact felt by each group in each period, from the milestone and expected transition period of each impact. Periods with more than one impact are marked with a count." actions={<Seg label="Period" value={unit} onChange={setUnit} options={[{ id: 'month', label: 'Months' }, { id: 'quarter', label: 'Quarters' }]} />}>
      <Heatmap rows={rows.map((r) => ({ key: r.group.id, label: r.group.name, r }))} cols={periods.map((p) => ({ key: p.key, label: p.label }))}
        value={(row, c) => { const cell = row.r.cells.find((x) => x.period === c.key); return cell?.count ? cell : null; }}
        fill={(cell) => impactFill(cell.max)} ink={(cell) => impactInk(cell.max)} format={(cell) => (cell.concurrent ? `${cell.max}·${cell.count}` : `${cell.max}`)}
        cellTitle={(row, c, cell) => (cell ? `${row.label}, ${c.label}: highest degree ${cell.max}; ${cell.count} impact(s): ${cell.aspects.join(', ')}` : `${row.label}, ${c.label}: no impacts`)} caption="Impact timeline" />
      <p className="tiny muted mt-2">Cell text shows the highest degree, then the number of concurrent impacts where there is more than one. Milestones: {m.milestones.map((x) => `${x.name} (${fmtDate(x.date)})`).join('; ')}.</p>
    </Card>
  );
}

function Confirmation() {
  const { m, mut, dialog, toast, canDo, lookups, today } = useIniPage();
  const decide = async (g, status) => {
    const comments = status === 'changesRequested' ? await dialog.prompt({ title: `Changes requested: ${g.name}`, label: 'What the business reviewer asked to change' }) : await dialog.prompt({ title: `Record confirmation: ${g.name}`, label: 'Reviewer comments (optional)', required: false });
    if (comments == null) return;
    await mut.update('impactedGroup', g.id, { confirmationStatus: status, confirmedDate: status === 'confirmed' ? today : null, reviewComments: comments }, { version: g.version });
    toast.success(status === 'confirmed' ? 'Confirmation recorded' : 'Changes requested recorded');
  };
  return (
    <DataGrid id="impactConfirm" title="Business confirmation" rows={m.groups} savedViews={false}
      columns={[
        { key: 'name', label: 'Impacted group', render: (g) => <strong>{g.name}</strong>, value: (g) => g.name },
        { key: 'reviewer', label: 'Business reviewer', render: (g) => lookups.nameOf('stakeholder', g.reviewerId) || <span className="muted">Not assigned</span>, value: (g) => lookups.nameOf('stakeholder', g.reviewerId) },
        { key: 'status', label: 'Status', render: (g) => <StatusBadge status={g.confirmationStatus} labelText={label('confirmationStatus', g.confirmationStatus)} />, value: (g) => g.confirmationStatus },
        { key: 'date', label: 'Confirmed', render: (g) => fmtDate(g.confirmedDate) || '—', value: (g) => g.confirmedDate },
        { key: 'comments', label: 'Reviewer comments', wrap: true, render: (g) => g.reviewComments || '—', value: (g) => g.reviewComments },
        { key: '_actions', label: '', sortable: false, render: (g) => canDo('U', 'impactedGroup') && (
          <div className="btn-row">
            <button type="button" className="btn btn-xs" onClick={() => decide(g, 'confirmed')}>Confirmed</button>
            <button type="button" className="btn btn-xs" onClick={() => decide(g, 'changesRequested')}>Changes requested</button>
          </div>
        ) },
      ]} />
  );
}

export { SEQ };
