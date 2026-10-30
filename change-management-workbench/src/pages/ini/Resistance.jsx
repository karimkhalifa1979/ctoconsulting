// Resistance (RES-001 to RES-006): the Resistance Management Plan of anticipated resistance, the register
// of observed resistance with its source records, escalation of high-influence resistant stakeholders
// (RUL-12), and trends by group, form and ADKAR barrier point. Items about named individuals are
// sensitive (RES-006): access follows the stakeholder rules and they stay out of artefacts by default.
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, StatusBadge, Spinner, BarrierBadge } from '../../ui/core.jsx';
import Register from '../../ui/Register.jsx';
import { ColumnChart, StackedBars, SERIES } from '../../charts/index.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, label, SEVERITY_BADGE } from '../../lib/format.js';
import { ADKAR, adkarLabel } from '../../../shared/refdata.js';
import { addMonths, monthKey, periodRange } from '../../../shared/dates.js';
import { sortBy } from '../../../shared/util.js';

const OPEN = ['open', 'monitoring', 'escalated'];

export default function Resistance() {
  const { m, base } = useIniPage();
  const [tab, setTab] = useTab('register');
  if (!m) return <Spinner />;
  const observed = m.resistance.filter((r) => r.kind === 'observed');
  const escalations = m.profiles.filter((p) => p.escalation);
  return (
    <>
      <PageHead eyebrow="Extended plan · Resistance Management Plan" title="Resistance" actions={<Link className="btn btn-primary" to={`${base}/artefacts?type=resistancePlan`}><Icon name="file" />Resistance Management Plan</Link>}>
        Resistance is a normal reaction to change. Anticipate where it will come from, prevent what you can, and respond to what you see by finding its root cause and the ADKAR barrier point behind it.
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'register', label: 'Observed resistance', count: observed.filter((r) => OPEN.includes(r.status)).length || null },
        { id: 'plan', label: 'Anticipated resistance', count: m.resistance.length - observed.length },
        { id: 'escalation', label: 'Escalations', count: escalations.filter((p) => !p.hasOpenResistance).length || null },
        { id: 'trends', label: 'Trends' },
      ]} />
      {tab === 'register' && <Observed />}
      {tab === 'plan' && <Anticipated />}
      {tab === 'escalation' && <Escalations />}
      {tab === 'trends' && <Trends />}
    </>
  );
}

const sourceCell = (m) => ({
  key: 'source', label: 'Source',
  render: (r) => (r.sourceType === 'stakeholder' && r.stakeholderId
    ? <span><Icon name="lock" size={12} label="Sensitive: about a named individual" /> {m.stakeholderName(r.stakeholderId) || 'Restricted'}</span>
    : m.groupsById[r.groupId]?.name || '—'),
  value: (r) => (r.sourceType === 'stakeholder' ? m.stakeholderName(r.stakeholderId) : m.groupsById[r.groupId]?.name),
});

function Observed() {
  const { m, config, base } = useIniPage();
  const columns = [
    { key: 'code', label: 'ID', render: (r) => <span className="code">{r.code}</span>, value: (r) => r.code, width: 80 },
    { key: 'title', label: 'Resistance', render: (r) => <span><strong>{r.title}</strong><span className="tiny muted sub-line">{label('resistanceForm', r.form, config)}</span></span>, value: (r) => r.title },
    sourceCell(m),
    { key: 'barrier', label: 'Barrier point', render: (r) => (r.barrierPoint ? <BarrierBadge element={r.barrierPoint} /> : '—'), value: (r) => r.barrierPoint },
    { key: 'severity', label: 'Severity', render: (r) => <Badge tone={SEVERITY_BADGE[r.severity]}>{label('severity', r.severity, config)}</Badge>, value: (r) => ['low', 'medium', 'high', 'critical'].indexOf(r.severity) },
    { key: 'owner', label: 'Owner', render: (r) => m.userName(r.ownerId) || '—', value: (r) => m.userName(r.ownerId) },
    { key: 'date', label: 'Observed', render: (r) => fmtDate(r.date), value: (r) => r.date },
    { key: 'from', label: 'Raised from', hidden: true, render: (r) => (r.raisedFromType ? <Badge>{r.raisedFromType}</Badge> : '—'), value: (r) => r.raisedFromType },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status === 'resolved' ? 'complete' : r.status === 'escalated' ? 'atRisk' : r.status === 'monitoring' ? 'inProgress' : 'open'} labelText={label('resistanceStatus', r.status, config)} />, value: (r) => r.status },
  ];
  return (
    <Register type="resistance" title="Observed resistance" filter={(r) => r.kind === 'observed'} columns={columns}
      sub="Raise resistance here or directly from an engagement, feedback, survey comment or assessment so the source stays linked (RES-003)."
      defaults={{ kind: 'observed', status: 'open', date: m.today }} facets={['status', 'severity', 'form']} bulkFields={['status', 'ownerId', 'severity']}
      after={(rec) => rec?.raisedFromType && (
        <div className="callout small mt-3">Raised from a {rec.raisedFromType} record{rec.raisedFromType === 'engagement' && rec.raisedFromId ? <> · <Link to={`${base}/engagement?open=engagement:${rec.raisedFromId}`}>open the engagement</Link></> : ''}.</div>
      )} />
  );
}

function Anticipated() {
  const { m, config } = useIniPage();
  const columns = [
    { key: 'title', label: 'Anticipated resistance', render: (r) => <span><strong>{r.title}</strong><span className="tiny muted sub-line">{r.description}</span></span>, value: (r) => r.title },
    sourceCell(m),
    { key: 'form', label: 'Likely form', render: (r) => label('resistanceForm', r.form, config) || '—', value: (r) => r.form },
    { key: 'root', label: 'Root cause', wrap: true, render: (r) => r.rootCause || '—', value: (r) => r.rootCause },
    { key: 'barrier', label: 'Barrier point', render: (r) => (r.barrierPoint ? <BarrierBadge element={r.barrierPoint} /> : '—'), value: (r) => r.barrierPoint },
    { key: 'prevent', label: 'Prevention', wrap: true, render: (r) => r.preventionActions || <Badge tone="warning" icon="alert">None planned</Badge>, value: (r) => r.preventionActions },
    { key: 'role', label: 'Responsible', render: (r) => label('responsibleRole', r.responsibleRole, config) || '—', value: (r) => r.responsibleRole },
  ];
  return (
    <Register type="resistance" title="Resistance Management Plan" filter={(r) => r.kind === 'anticipated'} columns={columns}
      sub="Anticipated sources and forms of resistance, their root causes, the actions that prevent them and the roles that manage them (RES-001)."
      defaults={{ kind: 'anticipated', status: 'monitoring', sourceType: 'group' }} facets={['severity', 'form']} />
  );
}

// RUL-12: high-influence stakeholders whose engagement is resistant or whose last two sentiments were negative.
function Escalations() {
  const { m, drawer, canDo, base, config } = useIniPage();
  const rows = sortBy(m.profiles.filter((p) => p.escalation), (p) => (p.hasOpenResistance ? 1 : 0), 'name');
  if (!rows.length) return <Empty icon="checkCircle" title="No escalations">No high-influence stakeholder is resistant or has shown negative sentiment in two consecutive engagements (RUL-12).</Empty>;
  return (
    <Card title="High-influence stakeholders needing escalation" sub="The relationship owner and change management lead are notified. Create a resistance item and agree a response with the sponsor (RES-004)." flush>
      <table className="tbl">
        <thead><tr><th>Stakeholder</th><th>Why flagged</th><th>Current engagement</th><th>Relationship owner</th><th>Resistance item</th><th /></tr></thead>
        <tbody>
          {rows.map((p) => {
            const items = m.resistance.filter((r) => r.stakeholderId === p.stakeholderId && OPEN.includes(r.status));
            return (
              <tr key={p.id}>
                <td><Link to={`${base}/stakeholders/${p.stakeholderId}`}><strong>{p.name}</strong></Link><span className="tiny muted sub-line">{p.positionTitle}</span></td>
                <td>{p.escalation}</td>
                <td>{label('engagementLevel', p.currentEngagement, config) || 'Restricted'}</td>
                <td>{m.userName(p.relationshipOwnerId) || '—'}</td>
                <td>{items.length ? items.map((r) => <button key={r.id} type="button" className="btn btn-xs" onClick={() => drawer.open({ type: 'resistance', id: r.id })}>{r.code} · {label('resistanceStatus', r.status, config)}</button>) : <Badge tone="critical" icon="alert">None</Badge>}</td>
                <td>{!items.length && canDo('C', 'resistance') && <button type="button" className="btn btn-xs btn-primary" onClick={() => drawer.open({ type: 'resistance', defaults: { kind: 'observed', sourceType: 'stakeholder', stakeholderId: p.stakeholderId, title: `Resistance: ${p.name}`, severity: 'high', status: 'escalated', date: m.today, ownerId: p.relationshipOwnerId, evidence: p.escalation, barrierPoint: p.barrierPoint && p.barrierPoint !== 'none' ? p.barrierPoint : undefined } })}>Create resistance item</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

// RES-005: resistance over time by group, form and ADKAR element.
function Trends() {
  const { m, config, today } = useIniPage();
  const observed = m.resistance.filter((r) => r.kind === 'observed' && r.date);
  const start = observed.length ? sortBy(observed, 'date')[0].date : addMonths(today, -5);
  const months = periodRange(start < addMonths(today, -11) ? addMonths(today, -11) : start, today, 'month');
  const periods = months.map((p) => ({
    key: p.key, label: p.label,
    values: {
      raised: observed.filter((r) => monthKey(r.date) === p.key).length,
      resolved: observed.filter((r) => r.resolutionDate && monthKey(r.resolutionDate) === p.key).length,
    },
  }));
  const byGroup = m.groups.map((g) => {
    const rs = observed.filter((r) => r.groupId === g.id);
    return { key: g.id, label: g.name, values: Object.fromEntries(ADKAR.map((a) => [a.id, rs.filter((r) => r.barrierPoint === a.id).length]).concat([['unknown', rs.filter((r) => !r.barrierPoint).length]])) };
  }).filter((r) => Object.values(r.values).some(Boolean));
  const forms = Object.entries(observed.reduce((acc, r) => { acc[r.form || 'other'] = (acc[r.form || 'other'] || 0) + 1; return acc; }, {}));
  return (
    <div className="stack">
      <Card title="Resistance raised and resolved by month">
        {observed.length ? <ColumnChart periods={periods} series={[{ key: 'raised', label: 'Raised', color: SERIES[0] }, { key: 'resolved', label: 'Resolved', color: SERIES[1] }]} ariaLabel="Resistance raised and resolved by month" /> : <Empty title="No observed resistance recorded" />}
      </Card>
      <div className="grid g-2">
        <Card title="By group and ADKAR barrier point" sub="Where resistance is coming from, and the element behind it">
          {byGroup.length ? <StackedBars rows={byGroup} series={[...ADKAR.map((a, i) => ({ key: a.id, label: adkarLabel(a.id), color: SERIES[i] })), { key: 'unknown', label: 'Not identified', color: 'var(--series-muted)' }]} ariaLabel="Resistance by group and barrier point" /> : <Empty title="No group-level resistance" />}
        </Card>
        <Card title="By form of resistance" flush>
          <table className="tbl">
            <thead><tr><th>Form</th><th className="num">Items</th><th className="num">Open</th></tr></thead>
            <tbody>{sortBy(forms, ([, n]) => -n).map(([f, n]) => <tr key={f}><td>{label('resistanceForm', f, config)}</td><td className="num">{n}</td><td className="num">{observed.filter((r) => (r.form || 'other') === f && OPEN.includes(r.status)).length}</td></tr>)}</tbody>
          </table>
          <div className="card-pad small muted">Root causes recorded: {observed.filter((r) => r.rootCause).length} of {observed.length}. Items without a root cause are harder to resolve; identify the barrier point and cause first.</div>
        </Card>
      </div>
    </div>
  );
}

