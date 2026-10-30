// Sponsorship (SPN-001 to SPN-007): the sponsor roadmap of visible activities, sponsor confirmation of
// completed commitments with observations (SPN-005), overdue commitments (SPN-006) and the sponsor
// coalition with alignment actions (SPN-002).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, StatusBadge, Spinner, Modal, KV } from '../../ui/core.jsx';
import DataGrid from '../../ui/DataGrid.jsx';
import Register from '../../ui/Register.jsx';
import { Gantt, GapChart } from '../../charts/index.jsx';
import { activityColumns } from './Plan.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, label } from '../../lib/format.js';
import { asArray, sortBy } from '../../../shared/util.js';
import { hasRole } from '../../../shared/access.js';

export default function Sponsor() {
  const { m, base } = useIniPage();
  const [tab, setTab] = useTab('roadmap');
  if (!m) return <Spinner />;
  const overdue = m.alerts.filter((a) => a.kind === 'sponsorOverdue').length;
  return (
    <>
      <PageHead eyebrow="Core plan · Sponsor Plan and Sponsor Coalition Plan" title="Sponsorship" actions={<Link className="btn btn-primary" to={`${base}/artefacts?type=sponsorPack`}><Icon name="file" />Sponsor briefing pack</Link>}>
        Active and visible sponsorship is the strongest predictor of change success. Plan what the primary sponsor will do, confirm it was done, and align the coalition of senior leaders.
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'roadmap', label: 'Sponsor roadmap', count: overdue || null }, { id: 'coalition', label: 'Sponsor coalition', count: m.coalition.length }, { id: 'sponsor', label: 'Primary sponsor' }]} />
      {tab === 'roadmap' && <Roadmap />}
      {tab === 'coalition' && <Coalition />}
      {tab === 'sponsor' && <PrimarySponsor />}
    </>
  );
}

function Roadmap() {
  const { m, config, lookups, usersById, drawer, canDo, user, today } = useIniPage();
  const [confirming, setConfirming] = useState(null);
  const rows = sortBy(m.activities.filter((a) => asArray(a.plans).some((p) => p === 'sponsor' || p === 'sponsorCoalition')), (a) => a.startDate || '9999');
  const isSponsor = hasRole(user, 'sponsor');
  const cols = [
    ...activityColumns({ m, config, lookups, usersById }).filter((c) => !['plans', 'owner'].includes(c.key)),
    { key: 'deliverer', label: 'Delivered by', render: (a) => lookups.nameOf('stakeholder', a.delivererId) || '—', value: (a) => lookups.nameOf('stakeholder', a.delivererId) },
    { key: 'confirmation', label: 'Sponsor confirmation', render: (a) => (a.confirmation?.confirmed ? <Badge tone="good" icon="checkCircle">Confirmed {fmtDate(String(a.confirmation.at).slice(0, 10))}</Badge> : a.status === 'complete' ? <Badge>Not confirmed</Badge> : '—'), value: (a) => (a.confirmation?.confirmed ? 1 : 0) },
    { key: '_c', label: '', sortable: false, render: (a) => !a.confirmation?.confirmed && a.status !== 'cancelled' && (canDo('U', 'activity', a) || (isSponsor && user.stakeholderId === a.delivererId)) && <button type="button" className="btn btn-xs" onClick={() => setConfirming(a)}>Confirm done</button> },
  ];
  const item = (a) => ({ id: a.id, label: a.title, start: a.startDate, end: a.endDate, pct: a.status === 'complete' ? 100 : a.percentComplete, state: a.status === 'complete' ? 'complete' : a.overdue ? 'overdue' : '', statusLabel: label('activityStatus', a.status, config) });
  return (
    <div className="stack">
      {m.alerts.filter((a) => a.kind === 'sponsorOverdue').map((a) => <div key={a.id} className="callout warn small"><strong>{a.title}.</strong> {a.detail}</div>)}
      <DataGrid id="sponsorRoadmap" type="activity" title="Sponsor roadmap" rows={rows} columns={cols} onRowClick={(a) => drawer.open({ type: 'activity', id: a.id, wide: true })}
        toolbar={canDo('C', 'activity') && <button type="button" className="btn btn-sm btn-primary" onClick={() => drawer.open({ type: 'activity', defaults: { kind: 'activity', plans: ['sponsor'], responsibleRole: 'sponsor', delivererId: m.initiative.primarySponsorId, status: 'notStarted' }, wide: true })}><Icon name="plus" />Sponsor activity</button>} />
      <Card title="Roadmap timeline" flush><Gantt groups={[{ key: 'sponsor', label: 'Sponsor activities', items: rows.filter((a) => a.startDate).map(item) }]} milestones={m.milestones} today={today} onSelect={(it) => drawer.open({ type: 'activity', id: it.id, wide: true })} /></Card>
      {confirming && <ConfirmDialog activity={confirming} onClose={() => setConfirming(null)} />}
    </div>
  );
}

function ConfirmDialog({ activity, onClose }) {
  const { mut, toast, user } = useIniPage();
  const [obs, setObs] = useState('');
  const save = async () => {
    await mut.update('activity', activity.id, { status: 'complete', percentComplete: 100, confirmation: { confirmed: true, at: new Date().toISOString(), by: user.name, observations: obs } }, { version: activity.version });
    toast.success('Sponsor activity confirmed');
    onClose();
  };
  return (
    <Modal title={`Confirm: ${activity.title}`} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" onClick={save}>Confirm completed</button></>}>
      <p className="small muted">Sponsors confirm their own commitments and record what they observed (SPN-005).</p>
      <label className="field"><span>Observations (what you heard, how people reacted)</span><textarea rows={4} value={obs} onChange={(e) => setObs(e.target.value)} /></label>
    </Modal>
  );
}

function Coalition() {
  const { m, config } = useIniPage();
  const asProfiles = m.coalition.map((c) => ({ id: c.id, name: m.stakeholderName(c.stakeholderId), currentEngagement: c.currentSupport, desiredEngagement: c.desiredSupport, gap: null }));
  return (
    <div className="stack">
      <Register type="coalitionMember" title="Sponsor coalition" sub="Senior leaders whose support the primary sponsor needs, with the actions to align them (SPN-002)." facets={['status']}
        columns={[
          { key: 'who', label: 'Leader', render: (c) => <span><strong>{m.stakeholderName(c.stakeholderId)}</strong><span className="tiny muted sub-line">{m.byId.stakeholder[c.stakeholderId]?.positionTitle}</span></span>, value: (c) => m.stakeholderName(c.stakeholderId) },
          { key: 'area', label: 'Area of influence', render: (c) => c.area, value: (c) => c.area },
          { key: 'support', label: 'Current → desired', render: (c) => `${label('engagementLevel', c.currentSupport, config) || '—'} → ${label('engagementLevel', c.desiredSupport, config) || '—'}`, value: (c) => c.currentSupport },
          { key: 'actions', label: 'Alignment actions', wrap: true, render: (c) => c.alignmentActions, value: (c) => c.alignmentActions },
          { key: 'status', label: 'Status', render: (c) => <StatusBadge status={c.status === 'aligned' ? 'aligned' : c.status === 'atRisk' ? 'atRisk' : 'inProgress'} labelText={{ aligned: 'Aligned', inProgress: 'Alignment in progress', atRisk: 'At risk' }[c.status]} />, value: (c) => c.status },
        ]} />
      {asProfiles.length > 0 && <Card title="Support gap" sub="Current and desired support for each coalition member"><GapChart profiles={asProfiles} /></Card>}
    </div>
  );
}

function PrimarySponsor() {
  const { m, base, lookups, config } = useIniPage();
  const sid = m.initiative.primarySponsorId;
  const p = m.profileByStakeholder[sid];
  const acts = m.activities.filter((a) => a.delivererId === sid);
  return (
    <div className="grid g-2">
      <Card title={lookups.nameOf('stakeholder', sid) || 'No primary sponsor recorded'} sub={m.byId.stakeholder[sid]?.positionTitle}>
        <KV items={[
          ['Sponsor assessment', m.risk.sponsorScore != null ? `${m.risk.sponsorScore}/100 (${fmtDate(m.risk.sponsorAssessment?.date)})` : 'Not assessed'],
          ['Activities delivered', `${acts.filter((a) => a.status === 'complete').length} of ${acts.length}`],
          ['Confirmed by the sponsor', acts.filter((a) => a.confirmation?.confirmed).length],
          ['Engagement', p ? `${label('engagementLevel', p.currentEngagement, config) || 'Restricted'} · last engaged ${fmtDate(p.cadenceBasis) || 'never'}` : '—'],
          ['Sponsorship gaps', m.strategy?.sponsorshipGaps],
          ['Actions', m.strategy?.sponsorshipActions],
        ]} />
        <div className="btn-row mt-3"><Link className="btn btn-sm" to={`${base}/risk?tab=sponsor`}>Sponsor assessment</Link>{sid && <Link className="btn btn-sm" to={`${base}/stakeholders/${sid}`}>360 profile</Link>}</div>
      </Card>
      <Card title="What the sponsor needs to know" sub="From the latest status: decisions required and readiness">
        {m.narratives.find((n) => n.key === 'decisionsRequired') ? <div className="prose small" dangerouslySetInnerHTML={{ __html: m.narratives.find((n) => n.key === 'decisionsRequired').content }} /> : <Empty title="No decisions recorded" />}
        <p className="small mt-2"><Link to={`${base}/artefacts?type=sponsorPack`}>Generate the sponsor briefing pack</Link> for the next one-to-one.</p>
      </Card>
    </div>
  );
}
