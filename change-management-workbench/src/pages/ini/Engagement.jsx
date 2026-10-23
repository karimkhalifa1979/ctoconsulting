// Stakeholder engagement planning and logging (UC-04, UC-05; STK-020 to STK-044; RUL-06 to RUL-11).
// Plan items generate occurrences (one-off, recurring or milestone-relative) after cadence, load and
// blackout checks; each occurrence is scheduled, rescheduled, cancelled or logged with its outcome.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, StatusBadge, Spinner, Modal, Seg, AdkarTags, Help } from '../../ui/core.jsx';
import DataGrid from '../../ui/DataGrid.jsx';
import { ImportButton } from '../../ui/ImportWizard.jsx';
import { FieldControl, RefPicker, RichText, AdkarPicker } from '../../ui/fields.jsx';
import { MonthCalendar, ColumnChart, BarChart } from '../../charts/index.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, label, options, relative } from '../../lib/format.js';
import { fieldOf } from '../../../shared/schema.js';
import { adkarLabel } from '../../../shared/refdata.js';
import { completionGaps, canTransition, groupMemberIds, blackoutFor } from '../../../shared/rules/engagements.js';
import { addDays, addMonths, periodRange, monthKey } from '../../../shared/dates.js';
import { asArray, personName, sortBy, uid, stripHtml, countBy, parseCsv } from '../../../shared/util.js';
import { canSeeSensitive } from '../../../shared/access.js';
import { saveBlob } from '../../data/client.js';

const STATUS_LABEL = (s, config) => label('engagementStatus', s, config);

export default function Engagement() {
  const page = useIniPage();
  const { m } = page;
  const [tab, setTab] = useTab('upcoming');
  const [params, setParams] = useSearchParams();
  const [logging, setLogging] = useState(null);
  const [planning, setPlanning] = useState(null);

  // Deep links: ?log=<stakeholderId> and ?plan=<stakeholderId> from the 360 profile.
  useEffect(() => {
    if (!m) return;
    const log = params.get('log');
    const plan = params.get('plan');
    if (log || plan) {
      const p = new URLSearchParams(params);
      p.delete('log'); p.delete('plan');
      setParams(p, { replace: true });
      if (log) setLogging({ engagement: null, defaults: { stakeholderIds: [log] } });
      if (plan) setPlanning({ item: null, defaults: { stakeholderIds: [plan] } });
    }
  }, [m, params]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m) return <Spinner />;
  const open = m.engagements.filter((e) => e.open);
  const toLog = open.filter((e) => e.plannedDate && e.plannedDate < page.today);
  return (
    <>
      <PageHead eyebrow="Phase 2 · Plan and Act" title="Stakeholder engagement"
        actions={page.canDo('C', 'engagement') && (
          <>
            <button type="button" className="btn" onClick={() => setPlanning({ item: null, defaults: {} })}><Icon name="calendar" />Plan engagement</button>
            <button type="button" className="btn btn-primary" onClick={() => setLogging({ engagement: null, defaults: {} })}><Icon name="plus" />Log engagement</button>
          </>
        )}>
        Plan who is engaged, why, how and how often, then record what happened. Cadence comes from each stakeholder's quadrant (RUL-06); load and blackout rules are checked when you plan (RUL-07).
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'upcoming', label: 'Upcoming and to log', count: toLog.length || null },
        { id: 'calendar', label: 'Calendar' },
        { id: 'log', label: 'Engagement log', count: m.engagements.filter((e) => e.done).length },
        { id: 'plan', label: 'Engagement plan', count: m.planItems.filter((p) => p.status !== 'cancelled').length },
        { id: 'coverage', label: 'Coverage' },
      ]} />
      {tab === 'upcoming' && <Upcoming onLog={(e) => setLogging({ engagement: e })} />}
      {tab === 'calendar' && <CalendarView onLog={(e) => setLogging({ engagement: e })} />}
      {tab === 'log' && <Log />}
      {tab === 'plan' && <PlanItems onEdit={(item) => setPlanning({ item })} />}
      {tab === 'coverage' && <Coverage />}
      {logging && <LogEngagement engagement={logging.engagement} defaults={logging.defaults} onClose={() => setLogging(null)} />}
      {planning && <PlanItemEditor item={planning.item} defaults={planning.defaults} onClose={() => setPlanning(null)} />}
    </>
  );
}

// --- Actions on an occurrence (STK-036, RUL-09) --------------------------------------------------
export function useEngagementActions() {
  const { mut, dialog, toast, config } = useIniPage();
  const transition = async (e, to) => {
    let reason = null, newDate = null, newTime = null;
    if (['cancelled', 'didNotProceed', 'rescheduled'].includes(to)) {
      reason = await dialog.prompt({ title: `${STATUS_LABEL(to, config)}: ${e.label}`, label: 'Reason (required, RUL-09)' });
      if (!reason) return;
    }
    if (to === 'rescheduled') {
      newDate = await dialog.prompt({ title: 'New date', label: 'New date (DD/MM/YYYY or YYYY-MM-DD)', multiline: false, defaultValue: e.plannedDate || '' });
      if (!newDate) return;
      const m2 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(newDate);
      if (m2) newDate = `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) { toast.error('Enter the new date as DD/MM/YYYY.'); return; }
    }
    await mut.op('transitionEngagement', { id: e.id, version: e.version, to, reason, newDate, newTime });
    toast.success(`${e.label}: ${STATUS_LABEL(to, config).toLowerCase()}`);
  };
  const invitation = async (e) => {
    const res = await mut.op('engagementInvitation', { id: e.id }, { quiet: true });
    saveBlob(new Blob([buildIcs(res.engagement, res.attendees, e.label)], { type: 'text/calendar' }), `${(e.label || 'engagement').slice(0, 60).replace(/[^\w\- ]+/g, '')}.ics`);
    toast.info(`Invitation for ${res.attendees.length} attendee(s) downloaded. Open it in Outlook to send (STK-028).`);
  };
  return { transition, invitation };
}

function buildIcs(e, attendees, title) {
  const dt = (date, time) => `${date.replace(/-/g, '')}T${(time || '09:00').replace(':', '')}00`;
  const end = (() => {
    const [h, mi] = (e.plannedTime || '09:00').split(':').map(Number);
    const total = h * 60 + mi + (Number(e.durationMinutes) || 60);
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  })();
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CTO Consulting//Change Management Workbench//EN', 'METHOD:REQUEST', 'BEGIN:VEVENT',
    `UID:${e.id}@change-workbench`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Australia/Sydney:${dt(e.plannedDate, e.plannedTime)}`, `DTEND;TZID=Australia/Sydney:${dt(e.plannedDate, end)}`,
    `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(stripHtml(e.objective || e.purpose || ''))}`, e.location ? `LOCATION:${esc(e.location)}` : null,
    ...attendees.map((a) => `ATTENDEE;CN=${esc(a.name)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${a.email}`),
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

function OccurrenceActions({ e, onLog }) {
  const { canDo } = useIniPage();
  const { transition, invitation } = useEngagementActions();
  if (!canDo('U', 'engagement', e)) return null;
  return (
    <div className="btn-row" style={{ flexWrap: 'nowrap' }}>
      <button type="button" className="btn btn-xs btn-primary" onClick={() => onLog(e)}>Log</button>
      {canTransition(e.status, 'scheduled') && e.status !== 'scheduled' && <button type="button" className="btn btn-xs" onClick={() => transition(e, 'scheduled')}>Schedule</button>}
      {canTransition(e.status, 'rescheduled') && <button type="button" className="btn btn-xs" onClick={() => transition(e, 'rescheduled')}>Reschedule</button>}
      {e.status === 'rescheduled' && <button type="button" className="btn btn-xs" onClick={() => transition(e, 'scheduled')}>Confirm</button>}
      {canTransition(e.status, 'cancelled') && <button type="button" className="btn btn-xs" onClick={() => transition(e, 'cancelled')}>Cancel</button>}
      {canTransition(e.status, 'didNotProceed') && <button type="button" className="btn btn-xs" onClick={() => transition(e, 'didNotProceed')}>Did not proceed</button>}
      <button type="button" className="btn btn-xs" title="Calendar invitation (.ics)" aria-label="Download calendar invitation" onClick={() => invitation(e)}><Icon name="mail" /></button>
    </div>
  );
}

function Upcoming({ onLog }) {
  const { m, today, usersById, config, drawer } = useIniPage();
  const [range, setRange] = useState('30');
  const list = m.engagements.filter((e) => e.open && e.plannedDate && e.plannedDate <= addDays(today, Number(range)));
  const overdue = list.filter((e) => e.plannedDate < today);
  const cols = [
    { key: 'date', label: 'Date', render: (e) => <span className="nowrap"><strong>{fmtDate(e.plannedDate)}</strong>{e.plannedTime ? ` ${e.plannedTime}` : ''}<div className="tiny muted">{relative(e.plannedDate, today)}</div></span>, value: (e) => e.plannedDate },
    { key: 'label', label: 'Engagement', render: (e) => <span><button type="button" className="link-btn" onClick={() => drawer.open({ type: 'engagement', id: e.id })}>{e.label}</button><span className="tiny muted sub-line">{label('engagementType', e.engagementType, config)} · {label('channel', e.channel, config)}</span></span>, value: (e) => e.label },
    { key: 'audience', label: 'With', render: (e) => <span className="sub-line" style={{ maxWidth: 240 }}>{e.audienceLabel}</span>, value: (e) => e.audienceLabel },
    { key: 'adkar', label: 'ADKAR', render: (e) => <AdkarTags value={e.adkar} />, value: (e) => asArray(e.adkar).join(' ') },
    { key: 'owner', label: 'Owner', render: (e) => usersById[e.planItem?.relationshipOwnerId || e.internalParticipantIds?.[0]]?.name || '—', value: (e) => usersById[e.planItem?.relationshipOwnerId]?.name || '' },
    { key: 'status', label: 'Status', render: (e) => (e.plannedDate < today ? <Badge tone="critical" icon="octagon">Not logged</Badge> : <StatusBadge status={e.status} labelText={STATUS_LABEL(e.status, config)} />), value: (e) => (e.plannedDate < today ? 'overdue' : e.status) },
    { key: '_actions', label: '', sortable: false, render: (e) => <OccurrenceActions e={e} onLog={onLog} /> },
  ];
  return (
    <div className="stack">
      {overdue.length > 0 && <div className="callout warn small"><strong>{overdue.length} engagement{overdue.length > 1 ? 's have' : ' has'} passed without being logged.</strong> Log what happened, or record that it was cancelled or did not proceed (target: within {m.settings.alerts.completionGraceBusinessDays} business days, BO-02).</div>}
      <DataGrid id="engUpcoming" title="Upcoming and to log" rows={sortBy(list, 'plannedDate', 'plannedTime')} columns={cols} savedViews={false} defaultSort={{ key: 'date', dir: 'asc' }}
        toolbar={<select aria-label="Period" value={range} onChange={(e) => setRange(e.target.value)}><option value="7">Next 7 days</option><option value="14">Next 14 days</option><option value="30">Next 30 days</option><option value="90">Next 90 days</option><option value="3650">All planned</option></select>}
        empty={<Empty icon="calendar" title="Nothing planned in this period" />} />
    </div>
  );
}

function CalendarView({ onLog }) {
  const { m, today, drawer, settings } = useIniPage();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [show, setShow] = useState('all');
  const events = useMemo(() => {
    const out = [];
    if (show !== 'comms') for (const e of m.engagements) {
      if (!e.date || e.communicationId) continue;
      out.push({ id: e.id, date: e.date, time: e.plannedTime || e.startTime, label: e.label, cls: e.status === 'cancelled' || e.status === 'didNotProceed' ? 'cancelled' : e.done ? 'done' : e.open && e.plannedDate < today ? 'overdue' : '', kind: 'engagement', e });
    }
    if (show !== 'engagements') for (const c of m.comms) if (c.startDate) out.push({ id: c.id, date: c.startDate, label: c.title, cls: 'comm', kind: 'activity' });
    for (const ms of m.milestones) out.push({ id: ms.id, date: ms.date, label: `◆ ${ms.name}`, cls: 'ms', kind: 'milestone' });
    return out;
  }, [m, show, today]);
  const step = (n) => setMonth(addMonths(`${month}-01`, n).slice(0, 7));
  return (
    <Card title={new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
      sub="Engagements, communications and milestones. Shaded days fall in a blackout period (STK-025)."
      actions={(
        <>
          <Seg label="Show" value={show} onChange={setShow} options={[{ id: 'all', label: 'All' }, { id: 'engagements', label: 'Engagements' }, { id: 'comms', label: 'Communications' }]} />
          <button type="button" className="btn btn-sm" onClick={() => step(-1)} aria-label="Previous month"><Icon name="chevronLeft" /></button>
          <button type="button" className="btn btn-sm" onClick={() => setMonth(today.slice(0, 7))}>Today</button>
          <button type="button" className="btn btn-sm" onClick={() => step(1)} aria-label="Next month"><Icon name="chevronRight" /></button>
        </>
      )} flush>
      <MonthCalendar month={month} events={events} today={today} blackout={(d) => !!blackoutFor(d, settings.blackouts)}
        onSelect={(ev) => (ev.kind === 'engagement' && ev.e.open && ev.e.plannedDate < today ? onLog(ev.e) : drawer.open({ type: ev.kind, id: ev.id }))} />
      <div className="legend" style={{ padding: '8px 14px' }}>
        <span><i style={{ background: 'var(--series-1)' }} />Planned</span><span><i style={{ background: 'var(--st-good)' }} />Completed</span><span><i style={{ background: 'var(--st-critical)' }} />Not logged</span><span><i style={{ background: 'var(--series-7)' }} />Communication</span><span><i style={{ background: 'var(--brand-gold)' }} />Milestone</span>
      </div>
    </Card>
  );
}

function Log() {
  const { m, ini, config, usersById, drawer, user, canDo } = useIniPage();
  const rows = sortBy(m.engagements.filter((e) => e.done || ['cancelled', 'didNotProceed'].includes(e.status)), '-date');
  const types = [...new Set(rows.map((e) => e.engagementType).filter(Boolean))];
  const cols = [
    { key: 'date', label: 'Date', render: (e) => <span className="nowrap">{fmtDate(e.date)}</span>, value: (e) => e.date },
    { key: 'code', label: 'ID', render: (e) => <span className="code">{e.code}</span>, value: (e) => e.code },
    { key: 'label', label: 'Engagement', render: (e) => <span><strong>{e.label}</strong>{e.quickCapture && <> <Badge tone="warning" icon="mobile">Quick capture</Badge></>}{e.unplanned && !e.communicationId && <> <Badge>Unplanned</Badge></>}{e.communicationId && <> <Badge tone="info">Communication</Badge></>}<span className="tiny muted sub-line">{stripHtml(e.summary || '').slice(0, 140)}</span></span>, value: (e) => `${e.label} ${stripHtml(e.summary || '')}` },
    { key: 'type', label: 'Type', render: (e) => label('engagementType', e.engagementType, config), value: (e) => label('engagementType', e.engagementType, config) },
    { key: 'audience', label: 'With', render: (e) => <span className="sub-line" style={{ maxWidth: 220 }}>{e.audienceLabel}</span>, value: (e) => e.audienceLabel },
    { key: 'outcome', label: 'Outcome', render: (e) => (e.outcome ? <StatusBadge status={e.outcome} labelText={label('outcomeRating', e.outcome, config)} /> : '—'), value: (e) => e.outcome },
    { key: 'status', label: 'Status', render: (e) => <StatusBadge status={e.status} labelText={STATUS_LABEL(e.status, config)} />, value: (e) => e.status },
    { key: 'by', label: 'Logged by', hidden: true, render: (e) => usersById[e.createdBy]?.name || '—', value: (e) => usersById[e.createdBy]?.name },
  ];
  return (
    <DataGrid id="engLog" type="engagement" title="Engagement log" rows={rows} columns={cols} onRowClick={(e) => drawer.open({ type: 'engagement', id: e.id, wide: true, after: (rec) => rec && <EngagementExtras e={rec} /> })}
      toolbar={canDo('C', 'engagement') && <ImportButton type="engagement" initiativeId={ini.id} label="Import past engagements" />}
      facets={[
        { key: 'type', label: 'Type', options: types.map((t) => ({ id: t, label: label('engagementType', t, config) })), value: (e) => e.engagementType },
        { key: 'status', label: 'Status', options: ['completed', 'locked', 'cancelled', 'didNotProceed'].map((s) => ({ id: s, label: STATUS_LABEL(s, config) })), value: (e) => e.status },
        { key: 'mine', label: 'Whose', options: [{ id: 'mine', label: 'Mine' }], value: (e) => (asArray(e.internalParticipantIds).includes(user.id) || e.createdBy === user.id ? 'mine' : '') },
      ]} />
  );
}

// Extra information on a logged engagement: status history and concern conversion (STK-033).
// STK-031: attendance from a meeting platform's attendance report or a sign-in sheet (CSV). People are
// matched by email, then by name, searching the whole stakeholder master when the working set holds only
// the initiative's stakeholders; anyone not found is listed and left out.
function AttendanceImport({ e }) {
  const { m, api, mut, toast } = useIniPage();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const statusOf = (v, hasColumn) => {
    const s = String(v ?? '').trim();
    if (!hasColumn || /^(y|yes|true|1|attended|present|joined|in person|online)$/i.test(s)) return 'attended';
    if (/apolog|declin|absent/i.test(s)) return 'apologies';
    if (/no response|unknown|tentative/i.test(s)) return 'noResponse';
    return /invit/i.test(s) ? 'invited' : 'attended';
  };
  const read = async (file) => {
    const [head = [], ...body] = parseCsv(await file.text());
    const idx = (re) => head.findIndex((h) => re.test(String(h).trim()));
    const c = { email: idx(/e-?mail/i), name: idx(/^(full name|name|participant|attendee|person)/i), status: idx(/attend|status|response/i) };
    const byEmail = Object.fromEntries(m.stakeholders.filter((s) => s.email).map((s) => [s.email.toLowerCase(), s]));
    const byName = Object.fromEntries(m.stakeholders.map((s) => [personName(s).toLowerCase(), s]));
    const out = [];
    for (const [i, r] of body.filter((x) => x.some((v) => String(v).trim())).entries()) {
      const email = c.email >= 0 ? String(r[c.email]).trim().toLowerCase() : '';
      const name = c.name >= 0 ? String(r[c.name]).trim() : '';
      let person = (email && byEmail[email]) || (name && byName[name.toLowerCase()]) || null;
      if (!person && email) person = (await api.op('findStakeholders', { q: email, limit: 5 }).catch(() => [])).find((s) => s.email?.toLowerCase() === email) || null;
      out.push({ row: i + 2, label: name || email || `Row ${i + 2}`, person, status: statusOf(c.status >= 0 ? r[c.status] : '', c.status >= 0) });
    }
    setRows(out);
  };
  const found = (rows || []).filter((r) => r.person);
  const save = async () => {
    setBusy(true);
    try {
      const merged = asArray(e.attendance).map((a) => ({ ...a }));
      for (const r of found) {
        const cur = merged.find((a) => a.stakeholderId === r.person.id);
        if (cur) cur.status = r.status; else merged.push({ stakeholderId: r.person.id, status: r.status });
      }
      await mut.update('engagement', e.id, { attendance: merged }, { version: e.version });
      toast.success(`Attendance recorded for ${found.length} ${found.length === 1 ? 'person' : 'people'}`);
      setRows(null);
    } catch { /* reported by the mutator */ } finally { setBusy(false); }
  };
  return (
    <div className="mb-3">
      <label className="btn btn-sm"><Icon name="upload" />Import attendance (CSV)<input type="file" accept=".csv,text/csv" hidden onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; if (f) read(f); }} /></label>
      <span className="tiny muted" style={{ marginLeft: 8 }}>A meeting attendance report or sign-in sheet with names or emails, and optionally a status.</span>
      {rows && (
        <div className="callout small mt-2">
          <strong>{found.length} of {rows.length} matched.</strong>{rows.length > found.length && <> Not found: {rows.filter((r) => !r.person).map((r) => r.label).join(', ')}.</>}
          <div className="btn-row mt-2"><button type="button" className="btn btn-sm btn-primary" disabled={!found.length || busy} onClick={save}>Record attendance</button><button type="button" className="btn btn-sm" onClick={() => setRows(null)}>Cancel</button></div>
        </div>
      )}
    </div>
  );
}

export function EngagementExtras({ e }) {
  const { mut, toast, canDo, settings, config, usersById } = useIniPage();
  const convert = async (index, to) => {
    const res = await mut.op('convertConcern', { engagementId: e.id, index, to });
    toast.success(`Concern converted to ${to === 'faq' ? 'an FAQ' : to === 'risk' ? 'a change risk' : 'a resistance item'} (${res.record?.code || ''})`);
  };
  return (
    <div className="form-section">
      {canDo('U', 'engagement', e) && (asArray(e.groupIds).length > 0 || asArray(e.attendance).length > 0 || ['townHall', 'workshop', 'briefing', 'training', 'focusGroup', 'demonstration'].includes(e.engagementType)) && (
        <>
          <h3>Attendance</h3>
          <AttendanceImport e={e} />
        </>
      )}
      {asArray(e.concerns).length > 0 && (
        <>
          <h3>Concerns raised</h3>
          <table className="tbl tbl-compact mb-3">
            <tbody>{asArray(e.concerns).map((c, i) => (
              <tr key={i}><td>{c.text}</td><td className="right">{c.convertedId ? <Badge tone="good" icon="checkCircle">Converted to {c.convertedType}</Badge> : canDo('C', 'resistance') && (
                <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-xs" onClick={() => convert(i, 'resistance')}>Resistance item</button>
                  <button type="button" className="btn btn-xs" onClick={() => convert(i, 'risk')}>Change risk</button>
                  <button type="button" className="btn btn-xs" onClick={() => convert(i, 'faq')}>FAQ</button>
                </div>
              )}</td></tr>
            ))}</tbody>
          </table>
        </>
      )}
      <h3>Status history</h3>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {asArray(e.statusHistory).map((h, i) => <li key={i}>{fmtDate(String(h.at).slice(0, 10))}: {h.from ? `${STATUS_LABEL(h.from, config)} → ` : ''}{STATUS_LABEL(h.to, config)}{h.fromDate && h.toDate ? ` (${fmtDate(h.fromDate)} → ${fmtDate(h.toDate)})` : ''}{h.reason ? ` · ${h.reason}` : ''} <span className="muted">by {usersById[h.by]?.name || (h.by === 'system' ? 'System' : 'someone')}</span></li>)}
        {asArray(e.editReasons).map((h, i) => <li key={`r${i}`}>Edited after locking: {h.reason}</li>)}
      </ul>
      {e.status === 'locked' && <p className="tiny muted mt-2">Locked records can still be corrected; each change needs a reason and is audited (RUL-10, after {settings.lockBusinessDays} business days).</p>}
    </div>
  );
}

// --- Plan items (STK-020 to STK-027) ---------------------------------------------------------------
function PlanItems({ onEdit }) {
  const { m, config, usersById, mut, dialog, toast, canDo, today } = useIniPage();
  const nextOf = (item) => m.engagements.filter((e) => e.planItemId === item.id && e.open && e.plannedDate >= today).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0];
  const cancel = async (item) => {
    const reason = await dialog.prompt({ title: `Cancel: ${item.objective}`, message: 'All future occurrences are cancelled. Completed occurrences are kept.', label: 'Reason (required, RUL-09)' });
    if (!reason) return;
    await mut.op('cancelPlanItem', { id: item.id, reason });
    toast.success('Plan item cancelled');
  };
  const cols = [
    { key: 'objective', label: 'Objective', render: (i) => <span><strong>{i.objective}</strong><span className="tiny muted sub-line">{label('engagementType', i.engagementType, config)} · {label('channel', i.channel, config)} · {label('engagementApproach', i.engagementLevel, config)}</span></span>, value: (i) => i.objective },
    { key: 'audience', label: 'Audience', render: (i) => <span className="sub-line" style={{ maxWidth: 240 }}>{[...asArray(i.stakeholderIds).map(m.stakeholderName), ...asArray(i.groupIds).map(m.stakeholderName)].join(', ')}</span>, value: (i) => [...asArray(i.stakeholderIds).map(m.stakeholderName), ...asArray(i.groupIds).map(m.stakeholderName)].join(', ') },
    { key: 'cadence', label: 'Cadence', render: (i) => `${label('cadence', i.cadence, config)}${i.timingMode === 'milestone' ? ` · ${i.offsetBusinessDays ?? 0} business days from ${m.byId.milestone[i.milestoneId]?.name || 'milestone'}` : ''}`, value: (i) => i.cadence },
    { key: 'next', label: 'Next', render: (i) => { const n = nextOf(i); return n ? fmtDate(n.plannedDate) : <span className="muted">—</span>; }, value: (i) => nextOf(i)?.plannedDate || '' },
    { key: 'done', label: 'Done', align: 'num', render: (i) => m.engagements.filter((e) => e.planItemId === i.id && e.done).length, value: (i) => m.engagements.filter((e) => e.planItemId === i.id && e.done).length },
    { key: 'sender', label: 'Sender', render: (i) => <span>{m.stakeholderName(i.senderId) || '—'}{i.senderOverridden && <> <Badge title="Different from the preferred sender (RUL-11)">Overridden</Badge></>}</span>, value: (i) => m.stakeholderName(i.senderId) },
    { key: 'owner', label: 'Owner', render: (i) => usersById[i.relationshipOwnerId]?.name || '—', value: (i) => usersById[i.relationshipOwnerId]?.name },
    { key: 'status', label: 'Status', render: (i) => <StatusBadge status={i.status === 'cancelled' ? 'cancelled' : 'active'} labelText={i.status === 'cancelled' ? 'Cancelled' : 'Active'} />, value: (i) => i.status },
    { key: '_a', label: '', sortable: false, render: (i) => canDo('U', 'engagementPlanItem') && i.status !== 'cancelled' && <div className="btn-row" style={{ flexWrap: 'nowrap' }}><button type="button" className="btn btn-xs" onClick={() => onEdit(i)}>Edit</button><button type="button" className="btn btn-xs" onClick={() => cancel(i)}>Cancel</button></div> },
  ];
  return <DataGrid id="planItems" type="engagementPlanItem" title="Engagement plan" rows={sortBy(m.planItems, 'status', 'objective')} columns={cols} onRowClick={onEdit} />;
}

const PLAN_FIELDS = ['objective', 'adkar', 'engagementLevel', 'messageFocus', 'engagementType', 'channel', 'durationMinutes', 'materials', 'facilitator', 'relationshipOwnerId', 'keyMessageIds', 'planType', 'activityId'];

export function PlanItemEditor({ item, defaults = {}, onClose }) {
  const { m, ini, mut, toast, config, lookups, user, today } = useIniPage();
  const [d, setD] = useState(() => ({ timingMode: 'fixed', cadence: 'oneOff', durationMinutes: 60, relationshipOwnerId: user.id, adkar: [], stakeholderIds: [], groupIds: [], engagementLevel: 'consult', ...defaults, ...(item || {}) }));
  const [check, setCheck] = useState(null);
  const [ack, setAck] = useState(item?.loadAck || '');
  const [saving, setSaving] = useState(false);
  const [needAck, setNeedAck] = useState(false);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      mut.op('checkPlanItem', { initiativeId: ini.id, item: d, id: item?.id }, { quiet: true }).then(setCheck).catch(() => setCheck(null));
    }, 350);
    return () => clearTimeout(timer.current);
  }, [JSON.stringify({ ...d, summary: undefined })]); // eslint-disable-line react-hooks/exhaustive-deps
  const fd = (k) => fieldOf('engagementPlanItem', k, config);
  const field = (k, extra = {}) => {
    const f = fd(k);
    return (
      <label className={`field ${['objective', 'adkar', 'keyMessageIds', 'materials'].includes(k) ? 'span-2' : ''}`} key={k}>
        <span>{f.label}{f.required && <em className="req">*</em>}</span>
        <FieldControl fd={f} value={d[k]} onChange={(v) => set(k, v)} lookups={lookups} config={config} model={m} {...extra} />
      </label>
    );
  };
  const missing = ['objective', 'engagementType', 'channel', 'senderId'].filter((k) => !d[k]).concat(!asArray(d.adkar).length ? ['adkar'] : []).concat(!asArray(d.stakeholderIds).length && !asArray(d.groupIds).length ? ['audience'] : []);
  const save = async () => {
    setSaving(true);
    try {
      const { id, version, code, type, initiativeId, createdAt, createdBy, updatedAt, updatedBy, seq, ...item2 } = d;
      const res = await mut.op('savePlanItem', { initiativeId: ini.id, id: item?.id, version: item?.version, item: item2, loadAck: ack }, { quiet: true });
      if (res.needsAck) { setNeedAck(true); setCheck((c) => ({ ...(c || {}), warnings: res.warnings })); return; }
      toast.success(`Plan item saved: ${res.created} occurrence${res.created === 1 ? '' : 's'} created${res.moved?.length ? `, ${res.moved.length} moved` : ''}${res.cancelled ? `, ${res.cancelled} cancelled` : ''}`);
      onClose();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  };
  const sender = check?.sender;
  const suggestion = check?.suggestion;
  return (
    <Modal title={item ? `Edit plan item: ${item.objective}` : 'Plan engagement'} onClose={onClose} wide footer={(
      <>
        <span className="grow small muted">{missing.length ? `Still needed: ${missing.join(', ')}` : check ? `${check.occurrences.length} occurrence(s), ${check.audienceCount} people` : ''}</span>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={saving || missing.length > 0 || (needAck && !ack.trim())} onClick={save}>{saving ? 'Saving…' : 'Save plan item'}</button>
      </>
    )}>
      <div className="grid g-main" style={{ gap: 20 }}>
        <div className="stack">
          <div className="form-grid">
            {field('objective')}
            {field('adkar')}
            {field('engagementLevel')}
            {field('messageFocus')}
            {field('engagementType')}
            {field('channel')}
            <label className="field span-2"><span>Stakeholders</span><RefPicker multiple options={lookups.optionsFor('stakeholder')} search={lookups.search?.stakeholder} value={asArray(d.stakeholderIds)} onChange={(v) => set('stakeholderIds', v)} /></label>
            <label className="field span-2"><span>Stakeholder groups</span><RefPicker multiple options={lookups.optionsFor('stakeholderGroup')} value={asArray(d.groupIds)} onChange={(v) => set('groupIds', v)} /></label>
          </div>
          <div className="form-section">
            <h3>When</h3>
            <div className="form-grid">
              <label className="field"><span>Timing</span><select value={d.timingMode} onChange={(e) => set('timingMode', e.target.value)}>{options('timingMode', config).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
              <label className="field"><span>Cadence</span><select value={d.cadence} onChange={(e) => set('cadence', e.target.value)}>{options('cadence', config).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
              {d.timingMode === 'fixed' && <><label className="field"><span>Date</span><input type="date" value={d.plannedDate || ''} onChange={(e) => set('plannedDate', e.target.value || null)} /></label><label className="field"><span>Time</span><input type="time" value={d.plannedTime || ''} onChange={(e) => set('plannedTime', e.target.value || null)} /></label></>}
              {d.timingMode === 'window' && <><label className="field"><span>Window start</span><input type="date" value={d.windowStart || ''} onChange={(e) => set('windowStart', e.target.value || null)} /></label><label className="field"><span>Window end</span><input type="date" value={d.windowEnd || ''} onChange={(e) => set('windowEnd', e.target.value || null)} /></label></>}
              {(d.timingMode === 'milestone' || d.cadence === 'milestoneTriggered') && <><label className="field"><span>Milestone</span><RefPicker options={lookups.optionsFor('milestone')} value={d.milestoneId || null} onChange={(v) => set('milestoneId', v)} /></label><label className="field"><span>Business days from milestone</span><input type="number" value={d.offsetBusinessDays ?? 0} onChange={(e) => set('offsetBusinessDays', Number(e.target.value))} /></label></>}
              {!['oneOff', 'milestoneTriggered'].includes(d.cadence) && <><label className="field"><span>Repeat until</span><input type="date" value={d.until || ''} onChange={(e) => set('until', e.target.value || null)} /></label><label className="field"><span>…or until milestone</span><RefPicker options={lookups.optionsFor('milestone')} value={d.untilMilestoneId || null} onChange={(v) => set('untilMilestoneId', v)} /></label></>}
              {field('durationMinutes')}
            </div>
          </div>
          <div className="form-section">
            <h3>Who and what</h3>
            <div className="form-grid">
              <label className="field"><span>Sender or presenter<em className="req">*</em> <Help term="Preferred sender" text="Business reasons are best delivered by the primary sponsor; personal impacts by each person's direct manager (RUL-11)." /></span><RefPicker options={lookups.optionsFor('stakeholder')} search={lookups.search?.stakeholder} value={d.senderId || null} onChange={(v) => set('senderId', v)} /></label>
              {field('facilitator')}
              {field('relationshipOwnerId')}
              {field('planType')}
              {field('keyMessageIds')}
              {field('materials')}
            </div>
          </div>
        </div>
        <div className="stack">
          <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
            <h3 className="mb-2">Checks</h3>
            {!check && <div className="small muted">Add an objective, audience and timing to see occurrences and checks.</div>}
            {check && (
              <div className="stack-sm small">
                <div><strong>{check.occurrences.length}</strong> occurrence{check.occurrences.length === 1 ? '' : 's'} · <strong>{check.audienceCount}</strong> people in the audience</div>
                {check.occurrences.length > 0 && <div className="muted">{check.occurrences.slice(0, 8).map((o) => fmtDate(o.date)).join(', ')}{check.occurrences.length > 8 ? ` … ${fmtDate(check.occurrences[check.occurrences.length - 1].date)}` : ''}</div>}
                {sender?.rationale && (
                  <div className="callout small">
                    {sender.senderId ? <>Preferred sender: <strong>{m.stakeholderName(sender.senderId) || 'unknown'}</strong>. </> : null}{sender.rationale}
                    {sender.senderId && d.senderId !== sender.senderId && <div className="mt-1"><button type="button" className="btn btn-xs" onClick={() => set('senderId', sender.senderId)}>Use preferred sender</button></div>}
                  </div>
                )}
                {suggestion && (
                  <div className="callout small">Suggested for this stakeholder: {suggestion.element ? <>focus on <strong>{adkarLabel(suggestion.element)}</strong> (their barrier point), </> : ''}engage at least every <strong>{suggestion.cadenceDays} days</strong> ({suggestion.quadrant}), approach <strong>{label('engagementApproach', suggestion.engagementLevel, config)}</strong>.
                    {suggestion.element && !asArray(d.adkar).includes(suggestion.element) && <div className="mt-1"><button type="button" className="btn btn-xs" onClick={() => set('adkar', [...asArray(d.adkar), suggestion.element])}>Add {adkarLabel(suggestion.element)}</button></div>}
                  </div>
                )}
                {check.warnings?.length > 0 && (
                  <div className="callout warn small">
                    <strong>{check.warnings.length} warning{check.warnings.length > 1 ? 's' : ''}</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{check.warnings.slice(0, 6).map((w, i) => <li key={i}>{w.message}{w.stakeholderId ? ` (${m.stakeholderName(w.stakeholderId)})` : ''}</li>)}</ul>
                    <label className="field mt-2"><span>Acknowledge to proceed (RUL-07)</span><textarea rows={2} value={ack} onChange={(e) => setAck(e.target.value)} placeholder="Why this is acceptable" /></label>
                  </div>
                )}
                {check.warnings?.length === 0 && <div className="small" style={{ color: 'var(--st-good-ink)' }}><Icon name="checkCircle" size={14} /> No load or blackout conflicts.</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// --- Logging (UC-05; STK-029 to STK-034; RUL-08) ---------------------------------------------------------
export function LogEngagement({ engagement, defaults = {}, onClose }) {
  const { m, ini, mut, toast, config, lookups, user, today, records } = useIniPage();
  const e0 = engagement ? (records.engagement || []).find((x) => x.id === engagement.id) || engagement : null;
  const [d, setD] = useState(() => ({
    actualDate: e0?.plannedDate && e0.plannedDate <= today ? e0.plannedDate : today, startTime: e0?.plannedTime || '', durationMinutes: e0?.durationMinutes || 45,
    engagementType: e0?.engagementType || '', channel: e0?.channel || '', stakeholderIds: asArray(e0?.stakeholderIds), groupIds: asArray(e0?.groupIds), internalParticipantIds: uniqueIds([user.id, ...asArray(e0?.internalParticipantIds)]),
    purpose: e0?.objective || e0?.purpose || '', adkar: asArray(e0?.adkar), keyMessageIds: asArray(e0?.keyMessageIds), summary: e0?.summary || '', questions: e0?.questions || '', concerns: asArray(e0?.concerns), feedback: e0?.feedback || '',
    sentiments: asArray(e0?.sentiments), outcome: e0?.outcome || '', followUpRequired: !!e0?.followUpRequired, followUpDate: e0?.followUpDate || '', location: e0?.location || '', meetingLink: e0?.meetingLink || '', attendance: asArray(e0?.attendance), senderId: e0?.senderId || null, ...defaults,
  }));
  const [actions, setActions] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const gaps = completionGaps(d);
  const mayRecordSentiment = canSeeSensitive(user, 'engagement', { createdBy: user.id, internalParticipantIds: d.internalParticipantIds }, {});
  // Audience resolved to members for attendance (STK-027, STK-031).
  const members = useMemo(() => {
    const ctx = { groups: m.stakeholderGroups, memberships: records.membership || [], stakeholders: m.stakeholders };
    const ids = new Set();
    for (const g of asArray(d.groupIds)) for (const sid of groupMemberIds(g, ctx)) ids.add(sid);
    return [...ids];
  }, [d.groupIds, m, records.membership]);
  const subjects = [...asArray(d.stakeholderIds).map((id) => ({ id, name: m.stakeholderName(id) })), ...asArray(d.groupIds).map((id) => ({ id, name: m.stakeholderName(id) }))];
  const sentimentOf = (id) => asArray(d.sentiments).find((s) => s.subjectId === id)?.sentiment || '';
  const setSentiment = (id, v) => set('sentiments', [...asArray(d.sentiments).filter((s) => s.subjectId !== id), ...(v ? [{ subjectId: id, sentiment: v }] : [])]);
  const attendanceOf = (sid) => asArray(d.attendance).find((a) => a.stakeholderId === sid)?.status || '';
  const setAttendance = (sid, v) => set('attendance', [...asArray(d.attendance).filter((a) => a.stakeholderId !== sid), ...(v ? [{ stakeholderId: sid, status: v }] : [])]);
  const save = async () => {
    setSaving(true);
    try {
      const data = { ...d, planItemId: e0?.planItemId || null };
      if (!mayRecordSentiment) delete data.sentiments;
      const res = await mut.op('logEngagement', { initiativeId: ini.id, engagementId: e0?.id || null, version: e0?.version, data, actions }, { quiet: true });
      toast.success(`Engagement ${res.engagement?.code || ''} logged${res.tasks?.length ? ` with ${res.tasks.length} action(s)` : ''}`);
      onClose();
    } catch (err) {
      if (!err.cancelled) toast.error(err);
    } finally { setSaving(false); }
  };
  const fd = (k) => fieldOf('engagement', k, config);
  const ctl = (k, extra) => <FieldControl fd={fd(k)} value={d[k]} onChange={(v) => set(k, v)} lookups={lookups} config={config} model={m} {...extra} />;
  return (
    <Modal title={e0 ? `Log: ${e0.objective || e0.purpose || e0.code}` : 'Log an engagement'} onClose={onClose} wide footer={(
      <>
        <span className="grow small">{gaps.length ? <span style={{ color: 'var(--st-critical-ink)' }}><Icon name="alert" size={14} /> To complete, record: {gaps.join(', ')} (RUL-08)</span> : <span style={{ color: 'var(--st-good-ink)' }}><Icon name="checkCircle" size={14} /> Ready to complete</span>}</span>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={saving || gaps.length > 0} onClick={save}>{saving ? 'Saving…' : 'Complete and save'}</button>
      </>
    )}>
      <div className="stack">
        {e0?.planItemId && <div className="callout small">Logging a planned occurrence{e0.plannedDate ? ` for ${fmtDate(e0.plannedDate)}` : ''}; planned and actual are compared in coverage reports.</div>}
        <div className="form-grid">
          <label className="field"><span>Actual date<em className="req">*</em></span>{ctl('actualDate')}</label>
          <label className="field"><span>Start time and duration</span><div className="row" style={{ flexWrap: 'nowrap' }}><input type="time" value={d.startTime || ''} onChange={(e) => set('startTime', e.target.value)} aria-label="Start time" /><input type="number" min={5} step={5} value={d.durationMinutes || ''} onChange={(e) => set('durationMinutes', e.target.value)} aria-label="Duration in minutes" style={{ width: 90 }} /><span className="small muted">min</span></div></label>
          <label className="field"><span>Engagement type<em className="req">*</em></span>{ctl('engagementType')}</label>
          <label className="field"><span>Channel</span>{ctl('channel')}</label>
          <label className="field span-2"><span>Stakeholders engaged</span><RefPicker multiple options={lookups.optionsFor('stakeholder')} search={lookups.search?.stakeholder} value={asArray(d.stakeholderIds)} onChange={(v) => set('stakeholderIds', v)} /></label>
          <label className="field span-2"><span>Groups engaged</span><RefPicker multiple options={lookups.optionsFor('stakeholderGroup')} value={asArray(d.groupIds)} onChange={(v) => set('groupIds', v)} /></label>
          <label className="field span-2"><span>Internal participants</span><RefPicker multiple options={lookups.optionsFor('user')} value={asArray(d.internalParticipantIds)} onChange={(v) => set('internalParticipantIds', v)} /></label>
          <label className="field span-2"><span>Purpose</span><textarea rows={2} value={d.purpose} onChange={(e) => set('purpose', e.target.value)} /></label>
          <label className="field span-2"><span>ADKAR elements addressed</span><AdkarPicker value={asArray(d.adkar)} onChange={(v) => set('adkar', v)} /></label>
          <label className="field span-2"><span>Key messages delivered</span>{ctl('keyMessageIds')}</label>
          <label className="field span-2"><span>Discussion summary<em className="req">*</em></span><RichText value={d.summary} onChange={(v) => set('summary', v)} /></label>
          <label className="field span-2"><span>Questions asked</span><textarea rows={2} value={d.questions} onChange={(e) => set('questions', e.target.value)} /></label>
        </div>
        {members.length > 0 && (
          <div className="form-section">
            <h3>Attendance ({members.length} members)</h3>
            <p className="small muted">Record attendance where you know it. Members are credited with the engagement only when attendance is recorded as attended (STK-031); without attendance, a group session counts as a broadcast.</p>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              <table className="tbl tbl-compact"><tbody>{members.map((sid) => (
                <tr key={sid}><td>{m.stakeholderName(sid)}</td><td style={{ width: 170 }}><select aria-label={`Attendance for ${m.stakeholderName(sid)}`} value={attendanceOf(sid)} onChange={(e) => setAttendance(sid, e.target.value)}><option value="">Not recorded</option>{options('attendance', config).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></td></tr>
              ))}</tbody></table>
            </div>
          </div>
        )}
        <div className="form-section">
          <h3>Concerns and feedback</h3>
          {asArray(d.concerns).map((c, i) => (
            <div key={i} className="row mb-2" style={{ flexWrap: 'nowrap' }}><input type="text" style={{ flex: 1 }} value={c.text} onChange={(e) => set('concerns', d.concerns.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} aria-label={`Concern ${i + 1}`} /><button type="button" className="icon-btn" aria-label="Remove concern" onClick={() => set('concerns', d.concerns.filter((_, j) => j !== i))}><Icon name="trash" /></button></div>
          ))}
          <button type="button" className="btn btn-xs" onClick={() => set('concerns', [...asArray(d.concerns), { text: '' }])}><Icon name="plus" />Add concern</button>
          <p className="tiny muted mt-1">After saving, concerns can be converted into resistance items, change risks or FAQs from the engagement record (STK-033).</p>
          <label className="field mt-2"><span>Feedback received</span><textarea rows={2} value={d.feedback} onChange={(e) => set('feedback', e.target.value)} /></label>
        </div>
        <div className="form-section">
          <h3>Result</h3>
          {mayRecordSentiment && subjects.length > 0 && (
            <table className="tbl tbl-compact mb-3"><thead><tr><th>Observed sentiment <Icon name="lock" size={12} /></th><th /></tr></thead><tbody>{subjects.map((s) => (
              <tr key={s.id}><td>{s.name}</td><td style={{ width: 200 }}><select aria-label={`Sentiment for ${s.name}`} value={sentimentOf(s.id)} onChange={(e) => setSentiment(s.id, e.target.value)}><option value="">Not observed</option>{options('sentiment', config).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></td></tr>
            ))}</tbody></table>
          )}
          <div className="form-grid">
            <label className="field"><span>Outcome against the objective<em className="req">*</em></span>{ctl('outcome')}</label>
            <div />
            <label className="check"><input type="checkbox" checked={!!d.followUpRequired} onChange={(e) => set('followUpRequired', e.target.checked)} /><span>Follow-up required</span></label>
            {d.followUpRequired && <label className="field"><span>Follow up by</span><input type="date" value={d.followUpDate || ''} onChange={(e) => set('followUpDate', e.target.value)} /></label>}
          </div>
        </div>
        <div className="form-section">
          <h3>Actions agreed</h3>
          <p className="small muted">Each action becomes a task for its owner (STK-032).</p>
          {actions.map((a, i) => (
            <div key={a.key} className="form-grid mb-2" style={{ gridTemplateColumns: '2fr 1fr 140px 34px' }}>
              <input type="text" placeholder="Action" value={a.title} onChange={(e) => setActions((xs) => xs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} aria-label="Action" />
              <RefPicker options={lookups.optionsFor('user')} value={a.assigneeId} onChange={(v) => setActions((xs) => xs.map((x, j) => (j === i ? { ...x, assigneeId: v } : x)))} />
              <input type="date" value={a.dueDate || ''} onChange={(e) => setActions((xs) => xs.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} aria-label="Due date" />
              <button type="button" className="icon-btn" aria-label="Remove action" onClick={() => setActions((xs) => xs.filter((_, j) => j !== i))}><Icon name="trash" /></button>
            </div>
          ))}
          <button type="button" className="btn btn-xs" onClick={() => setActions((xs) => [...xs, { key: uid(), title: '', assigneeId: user.id, dueDate: addDays(today, 7) }])}><Icon name="plus" />Add action</button>
        </div>
      </div>
    </Modal>
  );
}

const uniqueIds = (xs) => [...new Set(xs.filter(Boolean))];

// --- Coverage (STK-043) ---------------------------------------------------------------------------------
function Coverage() {
  const { m, today, config, usersById, settings } = useIniPage();
  const from = addMonths(today, -6);
  const periods = periodRange(from, addMonths(today, 1), 'month');
  const byMonth = periods.map((p) => ({
    key: p.key, label: p.label,
    values: {
      planned: m.engagements.filter((e) => e.planItemId && e.plannedDate && monthKey(e.plannedDate) === p.key && e.status !== 'cancelled').length,
      completed: m.engagements.filter((e) => e.done && e.actualDate && monthKey(e.actualDate) === p.key).length,
    },
  }));
  const persons = m.profiles.filter((p) => p.person && p.cadenceDays);
  const notEngaged = sortBy(persons.filter((p) => !p.cadenceBasis || p.cadence.daysSince > settings.alerts.notEngagedDays), (p) => -(p.cadence.daysSince ?? 9999));
  const done90 = m.engagements.filter((e) => e.done && e.actualDate >= addDays(today, -90));
  const byType = Object.entries(countBy(done90, (e) => e.engagementType || 'other')).map(([k, v]) => ({ key: k, label: label('engagementType', k, config), value: v })).sort((a, b) => b.value - a.value);
  const byOwner = Object.entries(countBy(done90, (e) => asArray(e.internalParticipantIds)[0] || 'unknown')).map(([k, v]) => ({ key: k, label: usersById[k]?.name || 'Unknown', value: v })).sort((a, b) => b.value - a.value);
  return (
    <div className="stack">
      <div className="kpis">
        <div className="kpi"><span className="kpi-label">Engaged within cadence</span><span className="kpi-value">{m.kpis.engagementCoverage ?? '—'}<small>%</small></span><span className="kpi-sub">{m.kpis.outsideCadence} of {persons.length} outside cadence</span></div>
        <div className="kpi"><span className="kpi-label">Planned in the last 30 days</span><span className="kpi-value">{m.kpis.plannedLast30}</span><span className="kpi-sub">{m.kpis.plannedCompletedLast30} completed as planned</span></div>
        <div className="kpi"><span className="kpi-label">Completed in the last 30 days</span><span className="kpi-value">{m.kpis.completedLast30}</span><span className="kpi-sub">including unplanned</span></div>
        <div className="kpi"><span className="kpi-label">Upcoming (14 days)</span><span className="kpi-value">{m.kpis.upcoming14}</span></div>
      </div>
      <div className="grid g-2">
        <Card title="Planned and completed by month" sub="Planned occurrences (not cancelled) and completed engagements"><ColumnChart periods={byMonth} series={[{ key: 'planned', label: 'Planned', color: 'var(--series-1)' }, { key: 'completed', label: 'Completed', color: 'var(--series-3)' }]} ariaLabel="Planned and completed engagements by month" /></Card>
        <Card title="Completed in the last 90 days by type">{byType.length ? <BarChart data={byType} format={(v) => v} ariaLabel="Completed engagements by type" /> : <Empty title="None yet" />}</Card>
      </div>
      <div className="grid g-2">
        <Card title={`Not engaged in ${settings.alerts.notEngagedDays} days or never`} sub="Stakeholders with a required cadence" flush>
          {notEngaged.length ? <table className="tbl tbl-compact"><thead><tr><th>Stakeholder</th><th>Last engaged</th><th className="num">Cadence</th></tr></thead><tbody>{notEngaged.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.cadenceBasis ? `${fmtDate(p.cadenceBasis)} (${p.cadence.daysSince} days)` : 'Never'}</td><td className="num">{p.cadenceDays} d</td></tr>)}</tbody></table> : <Empty icon="checkCircle" title="Everyone has been engaged recently" />}
        </Card>
        <Card title="Completed in the last 90 days by owner">{byOwner.length ? <BarChart data={byOwner} format={(v) => v} ariaLabel="Completed engagements by owner" /> : <Empty title="None yet" />}</Card>
      </div>
    </div>
  );
}

export { personName };
