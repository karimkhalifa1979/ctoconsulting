// Communications (COM-001 to COM-010): the Communications Plan and calendar, approval and sending (which
// records each communication in recipients' engagement history, COM-008), preferred senders (RUL-11),
// key messages with versions and enterprise reuse, and FAQs.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, StatusBadge, Spinner, Modal, AdkarTags } from '../../ui/core.jsx';
import DataGrid from '../../ui/DataGrid.jsx';
import Register from '../../ui/Register.jsx';
import ApprovalPanel from '../../ui/Approvals.jsx';
import { MonthCalendar, Heatmap, impactFill, impactInk } from '../../charts/index.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, fmtNum, label } from '../../lib/format.js';
import { proposeSender } from '../../../shared/rules/engagements.js';
import { addMonths, weekStart, addDays } from '../../../shared/dates.js';
import { asArray, sortBy } from '../../../shared/util.js';

export default function Comms() {
  const { m, base } = useIniPage();
  const [tab, setTab] = useTab('plan');
  if (!m) return <Spinner />;
  const review = m.comms.filter((c) => c.commsStatus === 'inReview').length;
  return (
    <>
      <PageHead eyebrow="Core plan · Communications Plan" title="Communications" actions={<><Link className="btn" to={`${base}/artefacts?type=keyMessages`}><Icon name="file" />Messages and FAQs</Link><Link className="btn btn-primary" to={`${base}/artefacts?type=commsPlan`}><Icon name="file" />Communications Plan</Link></>}>
        Who hears what, from whom, through which channel and when. Business reasons come from the primary sponsor; personal impacts from each person's direct manager (RUL-11).
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'plan', label: 'Communications Plan', count: review || null },
        { id: 'calendar', label: 'Calendar' },
        { id: 'messages', label: 'Key messages', count: m.keyMessages.length },
        { id: 'faqs', label: 'FAQs', count: m.faqs.length },
        { id: 'load', label: 'Load by group' },
      ]} />
      {tab === 'plan' && <CommsPlan />}
      {tab === 'calendar' && <CommsCalendar />}
      {tab === 'messages' && <Messages />}
      {tab === 'faqs' && <Register type="faq" title="FAQs" sub="Questions and approved answers, by audience. Concerns raised in engagements can be converted into FAQs (STK-033)." facets={['status']} bulkFields={['status', 'published', 'ownerId']} />}
      {tab === 'load' && <CommsLoad />}
    </>
  );
}

export function senderCheck(c, m) {
  const proposal = proposeSender({ messageFocus: c.messageFocus, stakeholderIds: c.stakeholderIds, groupIds: asArray(c.groupIds).map((g) => m.groupsById[g]?.stakeholderGroupId).filter(Boolean) }, { initiative: m.initiative, stakeholders: m.stakeholders, impactedGroups: m.groups, stakeholderGroups: m.stakeholderGroups });
  return { ...proposal, matches: !proposal.senderId || proposal.senderId === c.delivererId };
}

function CommsPlan() {
  const { m, config, usersById, drawer, canDo, mut, toast, dialog, today } = useIniPage();
  const rows = sortBy(m.comms, (c) => c.startDate || '9999');
  const send = async (c) => {
    if (!(await dialog.confirm({ title: `Send: ${c.title}`, message: 'Mark this communication as sent today. It is recorded in the engagement history of every member of the target groups (COM-008).', confirmLabel: 'Mark as sent' }))) return;
    await mut.op('sendCommunication', { activityId: c.id });
    toast.success('Communication sent and recorded');
  };
  const cols = [
    { key: 'date', label: 'Date', render: (c) => <span className="nowrap">{fmtDate(c.startDate) || '—'}</span>, value: (c) => c.startDate || '' },
    { key: 'title', label: 'Communication', render: (c) => <span><strong>{c.title}</strong><span className="tiny muted sub-line">{c.objective}</span></span>, value: (c) => c.title },
    { key: 'audience', label: 'Audience', render: (c) => <span className="sub-line" style={{ maxWidth: 220 }}>{asArray(c.groupIds).length ? asArray(c.groupIds).map((g) => m.groupsById[g]?.name).filter(Boolean).join(', ') : c.audience || 'All staff'}</span>, value: (c) => asArray(c.groupIds).map((g) => m.groupsById[g]?.name).join(', ') },
    { key: 'sender', label: 'Sender', render: (c) => { const s = senderCheck(c, m); return <span>{m.stakeholderName(c.delivererId) || '—'}{!s.matches && <> <Badge tone="warning" icon="alert" title={s.rationale}>Not the preferred sender</Badge></>}</span>; }, value: (c) => m.stakeholderName(c.delivererId) },
    { key: 'channel', label: 'Channel', render: (c) => c.channel || '—', value: (c) => c.channel },
    { key: 'focus', label: 'Focus', hidden: true, render: (c) => label('messageFocus', c.messageFocus, config), value: (c) => c.messageFocus },
    { key: 'adkar', label: 'ADKAR', render: (c) => <AdkarTags value={c.adkar} />, value: (c) => asArray(c.adkar).join(' ') },
    { key: 'commsStatus', label: 'Status', render: (c) => <StatusBadge status={c.commsStatus} labelText={label('commsStatus', c.commsStatus, config)} />, value: (c) => c.commsStatus },
    { key: 'reach', label: 'Reach', align: 'num', render: (c) => (c.reach ? (c.reach.opened ? `${Math.round((c.reach.opened / c.reach.delivered) * 100)}% opened` : c.reach.viewed ? `${fmtNum(c.reach.viewed)} views` : '—') : '—'), value: (c) => c.reach?.opened || c.reach?.viewed || 0 },
    { key: '_a', label: '', sortable: false, render: (c) => canDo('U', 'activity', c) && ['approved', 'scheduled'].includes(c.commsStatus) && <button type="button" className="btn btn-xs btn-primary" onClick={() => send(c)}>Mark sent</button> },
  ];
  return (
    <div className="stack">
      <DataGrid id="comms" type="activity" title="Communications Plan" rows={rows} columns={cols}
        onRowClick={(c) => drawer.open({ type: 'activity', id: c.id, wide: true, before: (rec) => rec && <CommsSide c={rec} /> })}
        facets={[{ key: 'commsStatus', label: 'Status', options: ['draft', 'inReview', 'approved', 'scheduled', 'sent', 'cancelled'].map((s) => ({ id: s, label: label('commsStatus', s, config) })), value: (c) => c.commsStatus }, { key: 'month', label: 'Month', options: [...new Set(rows.map((c) => (c.startDate || '').slice(0, 7)).filter(Boolean))].map((k) => ({ id: k, label: new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' }) })), value: (c) => (c.startDate || '').slice(0, 7) }]}
        toolbar={canDo('C', 'activity') && <button type="button" className="btn btn-sm btn-primary" onClick={() => drawer.open({ type: 'activity', defaults: { kind: 'communication', plans: ['communications'], commsStatus: 'draft', status: 'notStarted', authorId: m.initiative.changeLeadId }, wide: true })}><Icon name="plus" />Communication</button>} />
    </div>
  );
}

function CommsSide({ c }) {
  const { m, canDo, users } = useIniPage();
  const s = senderCheck(c, m);
  const lead = users.find((u) => u.id === m.initiative.changeLeadId);
  return (
    <div className="stack-sm mb-3">
      {!s.matches && <div className="callout warn small"><strong>Preferred sender:</strong> {m.stakeholderName(s.senderId)}. {s.rationale}</div>}
      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
        <h4 className="mb-2">Approval</h4>
        <ApprovalPanel subjectType="communication" subjectId={c.id} label={c.title} canSubmit={canDo('U', 'activity', c) && ['draft'].includes(c.commsStatus)} defaultApprovers={c.approverId ? [c.approverId] : lead ? [lead.id] : []} compact />
      </div>
    </div>
  );
}

function CommsCalendar() {
  const { m, today, drawer } = useIniPage();
  const [month, setMonth] = useState(today.slice(0, 7));
  const events = [
    ...m.comms.filter((c) => c.startDate).map((c) => ({ id: c.id, date: c.startDate, label: c.title, cls: c.commsStatus === 'sent' ? 'done' : 'comm', kind: 'activity' })),
    ...m.milestones.map((x) => ({ id: x.id, date: x.date, label: `◆ ${x.name}`, cls: 'ms', kind: 'milestone' })),
  ];
  return (
    <Card title={new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })} actions={<><button type="button" className="btn btn-sm" onClick={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))} aria-label="Previous month"><Icon name="chevronLeft" /></button><button type="button" className="btn btn-sm" onClick={() => setMonth(today.slice(0, 7))}>Today</button><button type="button" className="btn btn-sm" onClick={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))} aria-label="Next month"><Icon name="chevronRight" /></button></>} flush>
      <MonthCalendar month={month} events={events} today={today} onSelect={(e) => drawer.open({ type: e.kind, id: e.id, wide: e.kind === 'activity' })} />
    </Card>
  );
}

function Messages() {
  const { m, mut, toast, canDo, ini, users } = useIniPage();
  const [library, setLibrary] = useState(null);
  const lead = users.find((u) => u.id === m.initiative.changeLeadId);
  return (
    <div className="stack">
      <Register type="keyMessage" title="Key messages" sub="Approved, versioned messages by audience and ADKAR element. Changing an approved message creates a new version that needs approval (COM-002, COM-004)." facets={['status', 'messageFocus']}
        toolbar={<button type="button" className="btn btn-sm" onClick={async () => setLibrary(await mut.op('enterpriseMessages', {}, { quiet: true }))}><Icon name="globe" />Reuse from other initiatives</button>}
        after={(rec) => rec && (
          <div className="form-section">
            <h3>Approval</h3>
            <ApprovalPanel subjectType="keyMessage" subjectId={rec.id} label={rec.title} canSubmit={canDo('U', 'keyMessage') && rec.status === 'draft'} defaultApprovers={lead ? [lead.id] : []} compact />
            {asArray(rec.history).length > 0 && (
              <>
                <h3 className="mt-3">Earlier versions</h3>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{rec.history.map((h, i) => <li key={i}>v{h.version} ({h.status}): {h.text}</li>)}</ul>
              </>
            )}
          </div>
        )} />
      {library && (
        <Modal title="Key messages shared by other initiatives" onClose={() => setLibrary(null)} wide footer={<button type="button" className="btn" onClick={() => setLibrary(null)}>Close</button>}>
          {library.filter((x) => x.initiativeId !== ini.id).length === 0 && <Empty title="No shared messages" />}
          {library.filter((x) => x.initiativeId !== ini.id).map((x) => (
            <div key={x.id} className="card card-pad mb-2" style={{ boxShadow: 'none' }}>
              <div className="row-between"><strong>{x.title}</strong><span className="small muted">{x.initiativeName}</span></div>
              <p className="small">{x.text}</p>
              {canDo('C', 'keyMessage') && <button type="button" className="btn btn-xs" onClick={async () => { await mut.create('keyMessage', { initiativeId: ini.id, title: x.title, text: x.text, adkar: x.adkar, messageFocus: x.messageFocus, status: 'draft' }); toast.success('Copied as a draft'); }}>Copy into this initiative</button>}
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}

// RUL-07: communications per group per week against the configured limit.
function CommsLoad() {
  const { m, today, settings } = useIniPage();
  const max = settings.load?.groupMaxCommsPer7Days ?? 5;
  const weeks = [];
  for (let d = weekStart(addDays(today, -21)), i = 0; i < 12; i++, d = addDays(d, 7)) weeks.push({ key: d, label: fmtDate(d, { short: true }), start: d, end: addDays(d, 6) });
  const count = (g, w) => m.comms.filter((c) => c.status !== 'cancelled' && c.startDate >= w.start && c.startDate <= w.end && (!asArray(c.groupIds).length || asArray(c.groupIds).includes(g.id))).length
    + m.engagements.filter((e) => ['email', 'intranet', 'newsletter', 'video', 'collabPost'].includes(e.engagementType) && !e.communicationId && e.date >= w.start && e.date <= w.end && g.stakeholderGroupId && asArray(e.groupIds).includes(g.stakeholderGroupId)).length;
  return (
    <Card title="Communications per group per week" sub={`Cells show how many communications reach each group in a week; more than ${max} breaches the load rule (RUL-07).`}>
      <Heatmap rows={m.groups.map((g) => ({ key: g.id, label: g.name, g }))} cols={weeks} value={(r, c) => count(r.g, c) || null}
        fill={(v) => (v > max ? 'var(--st-critical-soft)' : impactFill(Math.min(5, v)))} ink={(v) => (v > max ? 'var(--st-critical-ink)' : impactInk(Math.min(5, v)))} format={(v) => (v > max ? `${v}!` : v)} caption="Communications load by group and week" />
    </Card>
  );
}

