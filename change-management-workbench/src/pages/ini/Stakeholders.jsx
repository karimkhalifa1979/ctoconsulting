// Stakeholder analysis for an initiative (STK-009 to STK-019, STK-041, STK-042): profiles of people and
// groups with change roles, influence and interest, engagement levels, priority and cadence, plus the
// power/interest grid, engagement gap chart, influence network and sentiment trends.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, Spinner, Help, Modal, AdkarTags, BarrierBadge } from '../../ui/core.jsx';
import DataGrid from '../../ui/DataGrid.jsx';
import { RefPicker } from '../../ui/fields.jsx';
import { PowerInterestGrid, GapChart, NetworkGraph, LineChart, SERIES } from '../../charts/index.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, label, options, relative } from '../../lib/format.js';
import { QUADRANT_LABELS, sentimentValue } from '../../../shared/rules/stakeholders.js';
import { asArray, personName, sortBy } from '../../../shared/util.js';

export function cadenceBadge(p, today) {
  if (!p.cadenceDays) return <span className="muted">—</span>;
  if (p.cadence?.overdue) return <Badge tone="critical" icon="octagon">{p.cadence.neverEngaged ? 'Not yet engaged' : `Overdue ${p.cadence.daysSince - p.cadenceDays}d`}</Badge>;
  if (p.cadence?.dueIn != null && p.cadence.dueIn <= 3) return <Badge tone="warning" icon="clock">Due in {p.cadence.dueIn}d</Badge>;
  return <Badge tone="good" icon="checkCircle">Within cadence</Badge>;
}

export function trendBadge(t) {
  if (!t?.direction) return <span className="muted">—</span>;
  if (t.direction === 'deteriorating') return <Badge tone="critical" icon="trend">Deteriorating</Badge>;
  if (t.direction === 'improving') return <Badge tone="good" icon="trend">Improving</Badge>;
  return <Badge>Stable</Badge>;
}

export default function Stakeholders() {
  const { m, ini, settings } = useIniPage();
  const [tab, setTab] = useTab('register');
  if (!m) return <Spinner />;
  const groupOnly = !!(settings.privacy?.groupLevelOnly || ini.initiative.groupLevelOnly);
  return (
    <>
      <PageHead eyebrow="Phase 1 · Define Impact" title="Stakeholders">
        Who matters to this change, how they are affected, how engaged they are now and need to be, and how often they must be engaged <Help term="Power/interest quadrant" />.
      </PageHead>
      {groupOnly && <div className="callout warn mb-3 small"><strong>Group-level analysis only.</strong> Ratings of named individuals are switched off for this initiative (STK-018); analyse groups instead.</div>}
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'register', label: 'Profiles', count: m.profiles.length },
        { id: 'grid', label: 'Power and interest' },
        { id: 'gap', label: 'Engagement gap' },
        { id: 'network', label: 'Influence network' },
        { id: 'sentiment', label: 'Sentiment' },
      ]} />
      {tab === 'register' && <ProfileRegister />}
      {tab === 'grid' && <GridView />}
      {tab === 'gap' && <GapView />}
      {tab === 'network' && <NetworkView />}
      {tab === 'sentiment' && <SentimentView />}
    </>
  );
}

function useOpenProfile() {
  const navigate = useNavigate();
  const { base, drawer } = useIniPage();
  return (p) => (p.person ? navigate(`${base}/stakeholders/${p.stakeholderId}`) : drawer.open({ type: 'profile', id: p.id }));
}

function ProfileRegister() {
  const { m, ini, lookups, usersById, today, config, canDo, drawer } = useIniPage();
  const openProfile = useOpenProfile();
  const [adding, setAdding] = useState(false);
  const owners = [...new Set(m.profiles.map((p) => p.relationshipOwnerId).filter(Boolean))];
  const roles = options('changeRole', config);
  const columns = [
    { key: 'name', label: 'Stakeholder', render: (p) => <span><strong>{p.name}</strong>{!p.person && <> <Badge>Group</Badge></>}<span className="tiny muted sub-line">{[p.positionTitle, p.organisation].filter(Boolean).join(' · ')}</span></span>, value: (p) => p.name },
    { key: 'roles', label: 'Change roles', render: (p) => <span className="sub-line" style={{ maxWidth: 200 }}>{asArray(p.changeRoles).map((r) => label('changeRole', r, config)).join(', ')}</span>, value: (p) => asArray(p.changeRoles).map((r) => label('changeRole', r, config)).join(', ') },
    { key: 'quadrant', label: 'Quadrant', render: (p) => (p.quadrant ? QUADRANT_LABELS[p.quadrant] : '—'), value: (p) => (p.quadrant ? QUADRANT_LABELS[p.quadrant] : '') },
    { key: 'impact', label: 'Impact', align: 'num', hidden: true, render: (p) => p.impact ?? '—', value: (p) => p.impact },
    { key: 'engagement', label: 'Current → desired', render: (p) => (p._redacted?.includes('currentEngagement') ? <span className="muted"><Icon name="lock" size={13} /> Restricted</span> : p.currentEngagement ? <span>{label('engagementLevel', p.currentEngagement, config)} → {label('engagementLevel', p.desiredEngagement, config)}{p.gap >= 2 && <> <Badge tone="warning" icon="alert">Gap {p.gap}</Badge></>}</span> : '—'), value: (p) => p.gap },
    { key: 'priority', label: 'Priority', align: 'num', render: (p) => <span>{p.priority ?? '—'}{p.isPriority && <> <Badge tone="serious" icon="star">Priority</Badge></>}</span>, value: (p) => p.priority },
    { key: 'barrier', label: 'Barrier point', hidden: true, render: (p) => (p.barrierPoint ? <BarrierBadge element={p.barrierPoint} /> : <span className="muted">—</span>), value: (p) => p.barrierPoint || '' },
    { key: 'cadence', label: 'Cadence', render: (p) => <span>{cadenceBadge(p, today)}<div className="tiny muted">{p.cadenceDays ? `Every ${p.cadenceDays} days` : ''}</div></span>, value: (p) => (p.cadence?.overdue ? 0 : 1) },
    { key: 'last', label: 'Last engaged', render: (p) => (p.cadenceBasis ? <span className="nowrap">{fmtDate(p.cadenceBasis)}<div className="tiny muted">{relative(p.cadenceBasis, today)}{p.cadenceBasis !== p.lastEngaged ? ' (communication)' : ''}</div></span> : '—'), value: (p) => p.cadenceBasis || '' },
    { key: 'next', label: 'Next planned', render: (p) => (p.nextPlanned ? <span className="nowrap">{fmtDate(p.nextPlanned)}</span> : <span className="muted">None</span>), value: (p) => p.nextPlanned || '' },
    { key: 'sentiment', label: 'Sentiment', render: (p) => trendBadge(p.sentimentTrend), value: (p) => p.sentimentTrend?.direction || '' },
    { key: 'owner', label: 'Relationship owner', render: (p) => usersById[p.relationshipOwnerId]?.name || '—', value: (p) => usersById[p.relationshipOwnerId]?.name || '' },
  ];
  const facets = [
    { key: 'quadrant', label: 'Quadrant', options: Object.entries(QUADRANT_LABELS).map(([id, l]) => ({ id, label: l })), value: (p) => p.quadrant },
    { key: 'role', label: 'Change role', options: roles.filter((r) => m.profiles.some((p) => asArray(p.changeRoles).includes(r.id))), value: (p) => asArray(p.changeRoles) },
    { key: 'owner', label: 'Owner', options: owners.map((id) => ({ id, label: usersById[id]?.name || id })), value: (p) => p.relationshipOwnerId },
    { key: 'flag', label: 'Show', options: [{ id: 'priority', label: 'Priority only' }, { id: 'overdue', label: 'Outside cadence' }, { id: 'person', label: 'People' }, { id: 'group', label: 'Groups' }], value: (p) => [p.isPriority && 'priority', p.cadence?.overdue && 'overdue', p.person ? 'person' : 'group'].filter(Boolean) },
  ];
  return (
    <div className="stack">
      <div className="row-between">
        <p className="small muted" style={{ margin: 0, maxWidth: 760 }}>Priority combines influence, impact, engagement gap, barrier point and change role (weights are configurable). Cadence comes from the quadrant: manage closely {m.settings.cadenceDays.manageClosely} days, keep satisfied {m.settings.cadenceDays.keepSatisfied}, keep informed {m.settings.cadenceDays.keepInformed}, monitor {m.settings.cadenceDays.monitor} (RUL-06).</p>
        {canDo('C', 'profile') && <div className="btn-row"><button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" />Add stakeholders</button></div>}
      </div>
      <DataGrid id="profiles" type="profile" title="Stakeholder profiles" rows={sortBy(m.profiles, '-priority')} columns={columns} facets={facets} onRowClick={openProfile}
        selectable={canDo('U', 'profile')} bulkFields={['relationshipOwnerId', 'delegateId', 'influence', 'interest', 'cadenceOverrideDays']}
        rowClass={(p) => (p.cadence?.overdue ? '' : '')} exportName={`${ini.initiative.shortName} stakeholders`}
        toolbar={<button type="button" className="btn btn-sm" onClick={() => drawer.open({ type: 'profile', defaults: { subjectType: 'group', relationshipOwnerId: ini.initiative.changeLeadId } })}><Icon name="users" />Add group profile</button>} />
      {adding && <AddStakeholders onClose={() => setAdding(false)} lookups={lookups} />}
    </div>
  );
}

function AddStakeholders({ onClose, lookups }) {
  const { m, ini, mut, toast, user, config } = useIniPage();
  const [ids, setIds] = useState([]);
  const [roles, setRoles] = useState(['impactedEmployee']);
  const [owner, setOwner] = useState(user.id);
  const [influence, setInfluence] = useState('');
  const [interest, setInterest] = useState('');
  const existing = useMemo(() => new Set(m.profiles.filter((p) => p.person).map((p) => p.stakeholderId)), [m.profiles]);
  const opts = lookups.optionsFor('stakeholder').filter((o) => !existing.has(o.id));
  const find = lookups.search?.stakeholder;
  const search = useMemo(() => (find ? (q) => find(q).then((found) => found.filter((o) => !existing.has(o.id))) : undefined), [find, existing]);
  const add = async () => {
    const res = await mut.op('addProfiles', { initiativeId: ini.id, stakeholderIds: ids, defaults: { changeRoles: roles, relationshipOwnerId: owner, influence: influence || null, interest: interest || null } });
    toast.success(`${Array.isArray(res) ? res.length : ids.length} stakeholder${(Array.isArray(res) ? res.length : ids.length) === 1 ? '' : 's'} added`);
    onClose();
  };
  return (
    <Modal title="Add stakeholders to this initiative" onClose={onClose} wide footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!ids.length || !roles.length} onClick={add}>Add {ids.length || ''} stakeholder{ids.length === 1 ? '' : 's'}</button></>}>
      <p className="small muted">Choose people from the enterprise stakeholder register. New people are added on the Stakeholders page (with duplicate checks). Profiles are specific to this initiative; the person's details stay in one place (STK-001, STK-009).</p>
      <div className="stack">
        <label className="field"><span>Stakeholders</span><RefPicker multiple options={opts} search={search} value={ids} onChange={setIds} placeholder="Search by name, position or organisation…" /></label>
        <div className="form-grid">
          <label className="field span-2"><span>Change roles</span><RefPicker multiple options={options('changeRole', config).map((o) => ({ id: o.id, label: o.label }))} value={roles} onChange={setRoles} /></label>
          <label className="field"><span>Relationship owner</span><RefPicker options={lookups.optionsFor('user')} value={owner} onChange={setOwner} /></label>
          <div />
          <label className="field"><span>Influence (optional)</span><select value={influence} onChange={(e) => setInfluence(e.target.value)}><option value="">Rate later</option>{options('influence', config).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          <label className="field"><span>Interest (optional)</span><select value={interest} onChange={(e) => setInterest(e.target.value)}><option value="">Rate later</option>{options('interest', config).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        </div>
      </div>
    </Modal>
  );
}

function GridView() {
  const { m } = useIniPage();
  const openProfile = useOpenProfile();
  const [scope, setScope] = useState('all');
  const list = m.profiles.filter((p) => (scope === 'all' ? true : scope === 'people' ? p.person : !p.person));
  const counts = Object.fromEntries(Object.keys(QUADRANT_LABELS).map((q) => [q, list.filter((p) => p.quadrant === q).length]));
  return (
    <div className="grid g-main">
      <Card title="Power and interest grid" sub="Each dot is a stakeholder or group, placed by influence (power) and interest (RUL-04). Select a dot to open the profile." actions={(
        <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Show"><option value="all">People and groups</option><option value="people">People</option><option value="groups">Groups</option></select>
      )}>
        <PowerInterestGrid profiles={list} onSelect={openProfile} />
      </Card>
      <Card title="By quadrant" flush>
        <table className="tbl">
          <thead><tr><th>Quadrant</th><th className="num">Count</th><th className="num">Cadence</th></tr></thead>
          <tbody>{Object.entries(QUADRANT_LABELS).map(([q, l]) => <tr key={q}><td>{l}</td><td className="num">{counts[q]}</td><td className="num">{m.settings.cadenceDays[q]} days</td></tr>)}</tbody>
        </table>
        <div className="card-body small muted">Not yet rated: {list.filter((p) => !p.quadrant).length}</div>
      </Card>
    </div>
  );
}

function GapView() {
  const { m } = useIniPage();
  const openProfile = useOpenProfile();
  const rows = sortBy(m.profiles.filter((p) => p.currentEngagement && p.desiredEngagement), '-gap', 'name');
  const redacted = m.profiles.some((p) => p._redacted?.includes('currentEngagement'));
  return (
    <Card title="Engagement gap" sub="Current and desired engagement for each stakeholder (unaware, resistant, neutral, supportive, leading). A gap of two or more levels, or a current level of resistant, makes the stakeholder a priority (RUL-05).">
      {redacted && <div className="callout small mb-3">Some engagement levels are restricted and not shown (STK-048).</div>}
      {rows.length ? <GapChart profiles={rows} onSelect={openProfile} labelWidth={190} /> : <Empty icon="quadrant" title="No engagement levels recorded" />}
    </Card>
  );
}

function NetworkView() {
  const { m, config } = useIniPage();
  const navigate = useNavigate();
  const { base } = useIniPage();
  const people = m.profiles.filter((p) => p.person);
  const ids = new Set(people.map((p) => p.stakeholderId));
  const rels = m.relationships.filter((r) => ids.has(r.fromId) && ids.has(r.toId));
  const nodes = people.filter((p) => rels.some((r) => r.fromId === p.stakeholderId || r.toId === p.stakeholderId)).map((p) => ({ id: p.stakeholderId, label: p.name, sub: p.positionTitle, group: p.quadrant ? QUADRANT_LABELS[p.quadrant] : 'Not rated' }));
  const edges = rels.map((r) => ({ from: r.fromId, to: r.toId, strength: r.strength, directed: ['influences', 'isInfluencedBy', 'reportsTo', 'represents'].includes(r.relType), label: `${m.stakeholderName(r.fromId)} ${label('relationshipType', r.relType, config).toLowerCase()} ${m.stakeholderName(r.toId)}` }));
  return (
    <div className="grid g-main">
      <Card title="Influence network" sub="Recorded relationships between stakeholders in this initiative (STK-042). Larger circles have more relationships; colour shows the quadrant. Line weight shows relationship strength.">
        {nodes.length ? <NetworkGraph nodes={nodes} edges={edges} onSelect={(n) => navigate(`${base}/stakeholders/${n.id}`)} /> : <Empty icon="network" title="No relationships recorded">Record relationships on stakeholder records.</Empty>}
      </Card>
      <Card title="Relationships" flush>
        <div style={{ maxHeight: 520, overflowY: 'auto' }} tabIndex={0} role="region" aria-label="Recorded relationships">
          <table className="tbl tbl-compact">
            <tbody>{rels.map((r) => <tr key={r.id}><td className="small"><strong>{m.stakeholderName(r.fromId)}</strong> {label('relationshipType', r.relType, config).toLowerCase()} <strong>{m.stakeholderName(r.toId)}</strong><div className="tiny muted">{label('strength', r.strength) || r.strength}{r.notes ? ` · ${r.notes}` : ''}</div></td></tr>)}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SentimentView() {
  const { m } = useIniPage();
  const openProfile = useOpenProfile();
  const withData = sortBy(m.profiles.filter((p) => p.sentiments.length), (p) => (p.sentimentTrend?.direction === 'deteriorating' ? 0 : 1), 'name');
  const [sel, setSel] = useState(() => withData.filter((p) => p.sentimentTrend?.direction === 'deteriorating').slice(0, 3).map((p) => p.id));
  const series = sel.map((id, i) => {
    const p = m.profiles.find((x) => x.id === id);
    return p ? { key: p.id, label: p.name, color: SERIES[i % 8], points: p.sentiments.map((s) => ({ date: s.date, value: s.value })) } : null;
  }).filter(Boolean);
  if (!withData.length) return <Empty icon="heart" title="No observed sentiment yet">Sentiment is recorded when engagements are logged.</Empty>;
  return (
    <div className="grid g-main">
      <Card title="Sentiment trend" sub="Observed sentiment at each completed engagement, from very negative (−2) to very positive (+2) (STK-038). Choose up to four stakeholders to compare.">
        {series.length ? <LineChart series={series} yMin={-2} yMax={2} threshold={0} thresholdLabel="Neutral" format={(v) => (v > 0 ? `+${v}` : String(v))} ariaLabel="Sentiment trend" /> : <Empty title="Choose stakeholders to compare" />}
      </Card>
      <Card title="Stakeholders with recorded sentiment" flush>
        <div style={{ maxHeight: 520, overflowY: 'auto' }} tabIndex={0} role="region" aria-label="Stakeholders with recorded sentiment">
          <table className="tbl tbl-compact">
            <thead><tr><th>Compare</th><th>Stakeholder</th><th>Latest</th><th>Trend</th></tr></thead>
            <tbody>{withData.map((p) => (
              <tr key={p.id}>
                <td><input type="checkbox" aria-label={`Compare ${p.name}`} checked={sel.includes(p.id)} disabled={!sel.includes(p.id) && sel.length >= 4} onChange={() => setSel((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))} /></td>
                <td><button type="button" className="link-btn" onClick={() => openProfile(p)}>{p.name}</button></td>
                <td className="small">{p.latestSentiment ? `${label('sentiment', p.latestSentiment)} (${sentimentValue(p.latestSentiment) > 0 ? '+' : ''}${sentimentValue(p.latestSentiment)})` : '—'}</td>
                <td>{trendBadge(p.sentimentTrend)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export { AdkarTags, personName };
