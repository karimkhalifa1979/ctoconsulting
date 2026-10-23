// 360-degree stakeholder profile (STK-039): identity, analysis in this initiative, and in date order all
// planned and completed engagements, communications received, training, ADKAR assessments, analysis
// changes, sentiment, feedback, resistance items and open actions; plus relationships and groups.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import { Card, PageHead, Badge, StatusBadge, Spinner, ErrorBox, Empty, KV, BarrierBadge, Prose, AdkarTags, Avatar } from '../ui/core.jsx';
import { LineChart, AdkarProfile } from '../charts/index.jsx';
import { useApp, useDialog, useToast } from '../state/app.jsx';
import { saveBlob } from '../data/client.js';
import { useIniOptional, useMutator } from '../state/initiative.jsx';
import { useRecordDrawer } from '../ui/RecordDrawer.jsx';
import { useLookups } from '../ui/RecordForm.jsx';
import { cadenceBadge, trendBadge } from './ini/Stakeholders.jsx';
import { fmtDate, fmtDateTime, label, relative } from '../lib/format.js';
import { QUADRANT_LABELS } from '../../shared/rules/stakeholders.js';
import { asArray, personName, sortBy, stripHtml } from '../../shared/util.js';
import { can, hasRole } from '../../shared/access.js';
import { adkarLabel } from '../../shared/refdata.js';
import { rememberRecent } from '../lib/recent.js';

export default function StakeholderProfile() {
  const { sid } = useParams();
  const { api, user, initiatives, config, today, usersById } = useApp();
  const ini = useIniOptional();
  const drawer = useRecordDrawer();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [st, setSt] = useState(null);
  const [error, setError] = useState(null);
  const [enterprise, setEnterprise] = useState(null);
  const [version, setVersion] = useState(0);

  const fromSet = ini?.records?.stakeholder?.find((s) => s.id === sid);
  useEffect(() => {
    if (fromSet) { setSt(fromSet); return; }
    api.get('stakeholder', sid).then(setSt).catch(setError);
  }, [api, sid, fromSet, version]);

  useEffect(() => {
    if (st?.id && !st.deidentified) rememberRecent(user?.id, { type: 'stakeholder', id: st.id, code: st.code, title: personName(st) });
  }, [st?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Relationships, memberships and profiles in other initiatives (enterprise view).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [rels, mems, groups] = await Promise.all([api.list('relationship', {}), api.list('membership', {}), api.list('stakeholderGroup', {})]);
        const profiles = [];
        for (const i of initiatives) {
          try {
            const r = await api.list('profile', { initiativeId: i.id });
            for (const p of r.rows) if (p.stakeholderId === sid) profiles.push({ ...p, initiative: i });
          } catch { /* no access */ }
        }
        if (alive) setEnterprise({ rels: rels.rows.filter((r) => r.fromId === sid || r.toId === sid), mems: mems.rows.filter((x) => x.stakeholderId === sid), groups: groups.rows, profiles });
      } catch (e) { if (alive) setEnterprise({ error: e }); }
    })();
    return () => { alive = false; };
  }, [api, sid, initiatives, version]);

  const m = ini?.model;
  const p = m?.profileByStakeholder?.[sid] || null;
  const items = useMemo(() => (m ? timelineItems(m, sid, p, config) : []), [m, sid, p, config]);

  if (error) return <ErrorBox error={error} />;
  if (!st) return <Spinner />;
  const name = personName(st);
  const manager = st.managerId ? (ini?.records?.stakeholder?.find((s) => s.id === st.managerId) || null) : null;
  const canEdit = can(user, 'U', 'stakeholder', st) && !st.deidentified;
  const allSentiment = p ? p.sentiments.map((s) => ({ date: s.date, value: s.value })) : [];
  const adkar = p?.adkarHistory || [];
  const lastAdkar = adkar[adkar.length - 1];
  const prevAdkar = adkar.length > 1 ? adkar[adkar.length - 2] : null;
  const refresh = () => setVersion((v) => v + 1);

  return (
    <>
      <PageHead eyebrow={ini ? `Stakeholder · ${ini.initiative?.shortName || ini.initiative?.name}` : 'Stakeholder'} title={<span className="row" style={{ gap: 12 }}><Avatar name={name} />{name}</span>}
        actions={(
          <>
            {canEdit && <button type="button" className="btn" onClick={() => drawer.open({ type: 'stakeholder', id: sid, onSaved: refresh })}><Icon name="edit" />Edit details</button>}
            {p && <button type="button" className="btn" onClick={() => drawer.open({ type: 'profile', id: p.id })}><Icon name="quadrant" />Edit analysis</button>}
            {p && ini && can(user, 'C', 'engagementPlanItem') && !ini.readOnly && <Link className="btn" to={`/i/${ini.id}/engagement?plan=${sid}`}><Icon name="calendar" />Plan engagement</Link>}
            {p && ini && can(user, 'C', 'engagement') && !ini.readOnly && <Link className="btn btn-primary" to={`/i/${ini.id}/engagement?log=${sid}`}><Icon name="plus" />Log engagement</Link>}
          </>
        )}>
        <div className="row small" style={{ gap: 12 }}>
          <span>{st.positionTitle}</span><span className="muted">·</span><span>{st.organisation}</span>
          {st.businessUnit && st.businessUnit !== st.organisation && <><span className="muted">·</span><span>{st.businessUnit}</span></>}
          {st.status !== 'active' && <StatusBadge status={st.status === 'left' ? 'overdue' : 'onHold'} labelText={label('stakeholderStatus', st.status, config)} />}
          {st.deidentified && <Badge tone="warning" icon="eyeOff">De-identified</Badge>}
        </div>
      </PageHead>

      <div className="grid g-side">
        <div className="stack">
          <Card title="Details">
            <KV items={[
              ['Email', st.email ? <a href={`mailto:${st.email}`}>{st.email}</a> : null],
              ['Phone', st.phone],
              ['Location', st.location],
              ['Manager', manager ? personName(manager) : lookups.nameOf('stakeholder', st.managerId)],
              ['Employment', label('employmentType', st.employmentType, config)],
              ['Preferred channels', asArray(st.preferredChannels).map((c) => label('channel', c, config)).join(', ')],
              ['Availability', st.availability],
              ['Engagement adjustments', st._redacted?.includes('engagementAdjustments') ? <span className="muted"><Icon name="lock" size={13} /> Restricted</span> : st.engagementAdjustments],
              ['Source', `${label('stakeholderSource', st.source, config)}${st.sourceId ? ` (${st.sourceId})` : ''}`],
              ['Collection notice', st.collectionNoticeId ? `${st.collectionNoticeId}${st.collectionNoticeDate ? `, ${fmtDate(st.collectionNoticeDate)}` : ''}` : <Badge tone="warning" icon="alert">Not recorded</Badge>],
              ['Record', `${st.code} · updated ${fmtDateTime(st.updatedAt, config?.settings?.timeZone)}`],
            ]} />
          </Card>

          {p && (
            <Card title="Analysis in this initiative" sub="Ratings are dated and attributed (STK-017).">
              <KV items={[
                ['Change roles', asArray(p.changeRoles).map((r) => label('changeRole', r, config)).join(', ')],
                ['Influence · interest', `${label('influence', p.influence, config) || '—'} · ${label('interest', p.interest, config) || '—'}`],
                ['Quadrant', p.quadrant ? QUADRANT_LABELS[p.quadrant] : '—'],
                ['Degree of impact', p.impact != null ? `${p.impact}/5${p.impactOverride != null && p.impactOverride !== '' ? ' (override)' : ''}` : '—'],
                ['Engagement', p._redacted?.includes('currentEngagement') ? <span className="muted"><Icon name="lock" size={13} /> Restricted</span> : p.currentEngagement ? `${label('engagementLevel', p.currentEngagement, config)} → ${label('engagementLevel', p.desiredEngagement, config)} (gap ${p.gap ?? 0})` : '—'],
                ['Priority', <span key="pr">{p.priority ?? '—'}{p.isPriority && <> <Badge tone="serious" icon="star">Priority</Badge></>}{p.priorityOverride != null && p.priorityOverride !== '' ? <span className="tiny muted"> override; computed {p.computedPriority}</span> : null}</span>],
                ['Barrier point', p.barrierPoint ? <BarrierBadge element={p.barrierPoint} /> : null],
                ['Cadence', <span key="cad">{cadenceBadge(p, today)} <span className="tiny muted">every {p.cadenceDays || '—'} days</span></span>],
                ['Last engaged', p.cadenceBasis ? `${fmtDate(p.cadenceBasis)} (${relative(p.cadenceBasis, today)})` : 'Not yet'],
                ['Next planned', p.nextPlanned ? `${fmtDate(p.nextPlanned)} (${relative(p.nextPlanned, today)})` : <Badge tone={p.isPriority ? 'warning' : ''} icon={p.isPriority ? 'alert' : undefined}>None planned</Badge>],
                ['Relationship owner', `${usersById[p.relationshipOwnerId]?.name || '—'}${p.delegateId ? `; delegate ${usersById[p.delegateId]?.name}` : ''}`],
                ['Impacted groups', p.impactedGroups.map((g) => m.groupsById[g]?.name).filter(Boolean).join(', ')],
                ['Sentiment', trendBadge(p.sentimentTrend)],
                p.escalation && ['Escalation', <Badge key="esc" tone="critical" icon="octagon">{p.escalation}</Badge>],
              ]} />
              {(p.interests || p.concerns || p.wiifm) && (
                <div className="mt-3 small stack-sm">
                  {p.interests && <div><strong>Interests: </strong>{p.interests}</div>}
                  {p.concerns && <div><strong>Concerns: </strong>{p.concerns}</div>}
                  {p.wiifm && <div><strong>What's in it for them: </strong>{p.wiifm}</div>}
                  {p.privateNotes && <div className="callout small"><Icon name="lock" size={13} /> <strong>Private notes: </strong>{p.privateNotes}</div>}
                </div>
              )}
            </Card>
          )}
          {ini && !p && <div className="callout small">This person has no profile in {ini.initiative?.name}. Add them on the Stakeholders page to analyse and plan engagement.</div>}

          <Card title="Relationships and groups" flush>
            {!enterprise && <Spinner />}
            {enterprise?.rels && (
              <div className="card-body">
                <h4 className="mb-2">Relationships</h4>
                {enterprise.rels.length ? (
                  <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                    {enterprise.rels.map((r) => {
                      const other = r.fromId === sid ? r.toId : r.fromId;
                      const otherName = lookups.nameOf('stakeholder', other) || 'another stakeholder';
                      return <li key={r.id}>{r.fromId === sid ? <>{label('relationshipType', r.relType, config)} <Link to={ini ? `/i/${ini.id}/stakeholders/${other}` : `/stakeholders/${other}`}>{otherName}</Link></> : <><Link to={ini ? `/i/${ini.id}/stakeholders/${other}` : `/stakeholders/${other}`}>{otherName}</Link> {label('relationshipType', r.relType, config).toLowerCase()} this person</>} <span className="muted">({r.strength})</span></li>;
                    })}
                  </ul>
                ) : <div className="small muted">None recorded.</div>}
                {can(user, 'C', 'relationship') && <button type="button" className="btn btn-xs mt-2" onClick={() => drawer.open({ type: 'relationship', defaults: { fromId: sid }, onSaved: refresh })}><Icon name="plus" />Add relationship</button>}
                <h4 className="mt-4 mb-2">Groups</h4>
                {enterprise.mems.length ? <div className="chips">{enterprise.mems.map((x) => <span key={x.id} className="chip">{enterprise.groups.find((g) => g.id === x.groupId)?.name || 'Group'}</span>)}</div> : <div className="small muted">No static group memberships.</div>}
                {enterprise.profiles.length > 0 && (
                  <>
                    <h4 className="mt-4 mb-2">Initiatives</h4>
                    <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                      {enterprise.profiles.map((x) => <li key={x.id}><Link to={`/i/${x.initiative.id}/stakeholders/${sid}`}>{x.initiative.name}</Link> · {asArray(x.changeRoles).map((r) => label('changeRole', r, config)).join(', ')}</li>)}
                    </ul>
                  </>
                )}
              </div>
            )}
          </Card>
          {hasRole(user, 'changeLead', 'admin') && <PrivacyTools stakeholder={st} onDone={refresh} />}
        </div>

        <div className="stack">
          {ini ? (
            <>
              {(allSentiment.length > 1 || lastAdkar) && (
                <div className="grid g-2">
                  {allSentiment.length > 1 && <Card title="Sentiment over time"><LineChart series={[{ key: 's', label: 'Sentiment', color: 'var(--series-1)', points: allSentiment }]} yMin={-2} yMax={2} threshold={0} thresholdLabel="Neutral" height={180} format={(v) => (v > 0 ? `+${v}` : String(v))} /></Card>}
                  {lastAdkar && <Card title="ADKAR (individual)" sub={`${label('assessmentRound', lastAdkar.round, config)} · ${fmtDate(lastAdkar.date)}`}><AdkarProfile scores={lastAdkar.scores} barrier={lastAdkar.barrierPoint} compare={prevAdkar?.scores} compareLabel={prevAdkar ? label('assessmentRound', prevAdkar.round, config) : undefined} currentLabel={label('assessmentRound', lastAdkar.round, config)} height={170} /></Card>}
                </div>
              )}
              <Card title="Everything with this stakeholder" sub="In date order: engagements, communications, training, assessments, analysis changes, feedback, resistance and actions.">
                {items.length ? (
                  <ul className="timeline">
                    {items.map((it) => (
                      <li key={it.key} className={`${it.done ? 'done' : 'planned'} ${it.negative ? 'neg' : ''}`}>
                        <div className="tl-date">{fmtDate(it.date)}{it.date > today ? ` · ${relative(it.date, today)}` : ''} · {it.kind}</div>
                        <div className="tl-title">{it.open ? <button type="button" className="link-btn" onClick={() => drawer.open(it.open)}>{it.title}</button> : it.title} {it.badge}</div>
                        {it.detail && <div className="small" style={{ color: 'var(--ink-2)' }}>{it.detail}</div>}
                      </li>
                    ))}
                  </ul>
                ) : <Empty icon="history" title="No history yet" />}
              </Card>
            </>
          ) : (
            <Card title="Initiatives">
              {enterprise?.profiles?.length ? (
                <div className="stack-sm">{enterprise.profiles.map((x) => (
                  <div key={x.id} className="row-between">
                    <div><strong>{x.initiative.name}</strong><div className="small muted">{asArray(x.changeRoles).map((r) => label('changeRole', r, config)).join(', ')}</div></div>
                    <button type="button" className="btn btn-sm" onClick={() => navigate(`/i/${x.initiative.id}/stakeholders/${sid}`)}>Open 360 view</button>
                  </div>
                ))}</div>
              ) : <Empty icon="layers" title="Not part of any initiative you can see" />}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function timelineItems(m, sid, p, config) {
  const out = [];
  if (p) {
    for (const e of p.history) {
      const sent = asArray(e.sentiments).find((s) => s.subjectId === sid)?.sentiment;
      const isComm = !!e.communicationId || ['email', 'intranet', 'newsletter', 'video', 'collabPost'].includes(e.engagementType);
      out.push({
        key: `e:${e.id}`, date: e.actualDate || e.plannedDate, kind: isComm ? 'Communication received' : e.viaGroup ? 'Group engagement' : 'Engagement', done: e.done,
        title: e.label, open: { type: 'engagement', id: e.id },
        badge: <><StatusBadge status={e.status} labelText={label('engagementStatus', e.status, config)} />{sent && <> <Badge tone={['negative', 'veryNegative'].includes(sent) ? 'critical' : ['positive', 'veryPositive'].includes(sent) ? 'good' : ''}>{label('sentiment', sent, config)}</Badge></>}</>,
        detail: [label('engagementType', e.engagementType, config), e.summary ? stripHtml(e.summary).slice(0, 220) : null].filter(Boolean).join(' · '),
        negative: ['negative', 'veryNegative'].includes(sent),
      });
    }
    for (const h of asArray(p.ratingHistory)) {
      out.push({ key: `h:${h.at}:${h.field}`, date: String(h.at).slice(0, 10), kind: 'Analysis change', done: true, title: `${h.field.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${h.from ?? '—'} → ${h.to ?? '—'}`, detail: `By ${m.userName(h.by) || 'someone'}` });
    }
  }
  for (const s of m.sessions) {
    const en = asArray(s.enrolments).find((x) => x.stakeholderId === sid);
    if (!en) continue;
    const iv = m.byId.trainingIntervention[s.interventionId];
    out.push({ key: `t:${s.id}`, date: s.date, kind: 'Training', done: s.status === 'completed', title: iv?.title || 'Training session', badge: en.completed ? <Badge tone="good" icon="checkCircle">Completed</Badge> : en.attended ? <Badge>Attended</Badge> : s.status === 'completed' ? <Badge tone="warning" icon="alert">Did not attend</Badge> : <Badge>Enrolled</Badge>, detail: [s.location, en.score != null ? `Score ${en.score}` : null].filter(Boolean).join(' · '), open: { type: 'trainingSession', id: s.id } });
  }
  for (const a of m.assessments.filter((x) => x.kind === 'adkar' && x.subjectType === 'stakeholder' && x.subjectId === sid)) {
    out.push({ key: `a:${a.id}`, date: a.date, kind: 'ADKAR assessment', done: true, title: `${label('assessmentRound', a.round, config)} (${label('assessmentMethod', a.method, config)})`, detail: a._redacted?.includes('scores') ? 'Scores restricted' : Object.entries(a.scores || {}).map(([k, v]) => `${adkarLabel(k)} ${typeof v === 'object' ? v?.score : v}`).join(' · '), open: { type: 'assessment', id: a.id } });
  }
  for (const f of m.feedback.filter((x) => x.stakeholderId === sid)) out.push({ key: `f:${f.id}`, date: f.date, kind: 'Feedback', done: true, title: f.text, open: { type: 'feedback', id: f.id } });
  for (const r of m.resistance.filter((x) => x.stakeholderId === sid)) out.push({ key: `r:${r.id}`, date: r.date, kind: 'Resistance', done: r.status === 'resolved', negative: r.status !== 'resolved', title: r.title, badge: <StatusBadge status={r.status} labelText={label('resistanceStatus', r.status, config)} />, open: { type: 'resistance', id: r.id } });
  const engIds = new Set(p?.history.map((e) => e.id) || []);
  for (const t of m.tasks.filter((x) => (x.recordType === 'stakeholder' && x.recordId === sid) || (x.recordType === 'engagement' && engIds.has(x.recordId)))) {
    out.push({ key: `k:${t.id}`, date: t.dueDate || String(t.createdAt).slice(0, 10), kind: 'Action', done: t.status === 'done', title: t.title, badge: <StatusBadge status={t.status} labelText={label('taskStatus', t.status, config)} />, open: { type: 'task', id: t.id } });
  }
  return sortBy(out.filter((x) => x.date), '-date');
}

function PrivacyTools({ stakeholder, onDone }) {
  const mut = useMutator();
  const dialog = useDialog();
  const toast = useToast();
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { setFound(await mut.op('personalInformation', { stakeholderId: stakeholder.id })); } finally { setBusy(false); }
  };
  const deidentify = async () => {
    const reason = await dialog.prompt({ title: 'De-identify this stakeholder', message: 'Names, contact details and free-text notes about this person are removed from the register and every initiative profile. This cannot be undone.', label: 'Reason (recorded in the audit trail)' });
    if (!reason) return;
    await mut.op('deidentifyStakeholder', { stakeholderId: stakeholder.id, reason });
    toast.success('Stakeholder de-identified');
    onDone();
  };
  return (
    <Card title="Privacy" sub="Respond to access and correction requests; de-identify when retention ends (PRV-05, PRV-06, STK-050).">
      <div className="btn-row">
        <button type="button" className="btn btn-sm" onClick={run} disabled={busy}><Icon name="search" />{busy ? 'Searching…' : 'Find all personal information'}</button>
        {!stakeholder.deidentified && <button type="button" className="btn btn-sm btn-danger" onClick={deidentify}><Icon name="eyeOff" />De-identify…</button>}
      </div>
      {found && (
        <div className="mt-3 small">
          <strong>{found.records.length} records</strong> reference this person:
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {Object.entries(found.records.reduce((a, r) => ({ ...a, [r.label]: (a[r.label] || 0) + 1 }), {})).map(([k, n]) => <li key={k}>{k}: {n}</li>)}
          </ul>
          <button type="button" className="btn btn-xs mt-2" onClick={() => saveBlob(new Blob([JSON.stringify(found, null, 2)], { type: 'application/json' }), `personal-information-${stakeholder.code}.json`)}><Icon name="download" />Download for the requester</button>
        </div>
      )}
    </Card>
  );
}

export { Prose, AdkarTags };
