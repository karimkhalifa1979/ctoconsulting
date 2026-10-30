// Engagement planning and logging operations (UC-04, UC-05; STK-020 to STK-038; COM-008).
import { AppError, asArray, uniq, personName, stripHtml } from '../../util.js';
import { expandOccurrences, loadWarnings, proposeSender, resolveAudience, groupMemberIds, isOpen, lockDue, completionGaps } from '../../rules/engagements.js';
import { quadrant, requiredCadence } from '../../rules/stakeholders.js';
import { holidaysOf } from '../../model.js';
import { fmtDate, makeCalendar, diffDays, addDays } from '../../dates.js';
import { listLabel } from '../../schema.js';

const PLAN_TO_OCCURRENCE = ['objective', 'adkar', 'engagementLevel', 'engagementType', 'channel', 'stakeholderIds', 'groupIds', 'senderId', 'keyMessageIds', 'durationMinutes'];

export function registerEngagementOps(S) {
  const ctxFor = async (initiativeId) => {
    const [initiative, stakeholders, groups, memberships, milestones, impactedGroups, config] = await Promise.all([
      S.initiative(initiativeId), S.driver.list('stakeholder'), S.driver.list('stakeholderGroup'), S.driver.list('membership'),
      S.driver.list('milestone', { initiativeId }), S.driver.list('impactedGroup', { initiativeId }), S.getConfig(),
    ]);
    return { initiative, stakeholders, groups, memberships, milestones, impactedGroups, config, holidays: holidaysOf(config.settings) };
  };

  // Proposes defaults, expands occurrences and checks cadence, load and blackout rules (UC-04 steps 2–5).
  S.op('checkPlanItem', { area: 'engagement', summary: 'Check a draft engagement plan item: occurrences, preferred sender and load warnings' }, async (actor, { initiativeId, item = {}, id }) => {
    const c = await ctxFor(initiativeId);
    S.assertInitiative(actor, c.initiative);
    const occurrences = expandOccurrences(item, { milestones: c.milestones, holidays: c.holidays, initiativeEnd: c.initiative.endDate });
    const audienceIds = resolveAudience({ stakeholderIds: item.stakeholderIds, groupIds: item.groupIds }, { groups: c.groups, memberships: c.memberships, stakeholders: c.stakeholders });
    const existing = await S.driver.list('engagement', { initiativeId });
    const comms = (await S.driver.list('activity', { initiativeId })).filter((a) => a.kind === 'communication' && a.status !== 'cancelled');
    const memberCache = {};
    const warnings = loadWarnings({ occurrences: occurrences.filter((o) => o.date >= (S.nowIso().slice(0, 10))), audienceIds, groupIds: asArray(item.impactedGroupIds || []), engagementType: item.engagementType, excludePlanItemId: id }, {
      existing, comms, settings: c.config.settings,
      memberLookup: (gid) => (memberCache[gid] ||= groupMemberIds(gid, { groups: c.groups, memberships: c.memberships, stakeholders: c.stakeholders })),
    });
    const sender = proposeSender({ messageFocus: item.messageFocus, stakeholderIds: item.stakeholderIds, groupIds: item.groupIds }, { initiative: c.initiative, stakeholders: c.stakeholders, impactedGroups: c.impactedGroups, stakeholderGroups: c.groups });
    // Suggested ADKAR element and cadence for single-stakeholder plans (UC-04 step 2).
    let suggestion = null;
    if (asArray(item.stakeholderIds).length === 1) {
      const profile = (await S.driver.list('profile', { initiativeId })).find((p) => p.stakeholderId === item.stakeholderIds[0]);
      if (profile) {
        const model = await S.model(initiativeId);
        const p = model.profiles.find((x) => x.id === profile.id);
        const q = quadrant(profile.influence, profile.interest);
        suggestion = { element: p?.barrierPoint && p.barrierPoint !== 'none' ? p.barrierPoint : null, cadenceDays: requiredCadence(q, c.config.settings, profile.cadenceOverrideDays), quadrant: q, engagementLevel: q === 'manageClosely' ? 'collaborate' : q === 'keepSatisfied' ? 'consult' : q === 'keepInformed' ? 'inform' : 'inform' };
      }
    }
    return { occurrences, audienceCount: audienceIds.length, warnings, sender, suggestion };
  });

  // Creates or updates a plan item and its occurrences (UC-04 step 6; STK-022).
  S.op('savePlanItem', { area: 'engagement', summary: 'Create or update an engagement plan item and generate its occurrences' }, async (actor, { initiativeId, id, version, item, loadAck }) => {
    const check = await S.ops.checkPlanItem(actor, { initiativeId, item, id });
    if (check.warnings.length && !String(loadAck || item.loadAck || '').trim()) {
      return { needsAck: true, warnings: check.warnings };
    }
    const data = { ...item, initiativeId, loadAck: loadAck || item.loadAck || null };
    if (data.senderId && check.sender.senderId && data.senderId !== check.sender.senderId) data.senderOverridden = true;
    const planItem = id ? await S.update(actor, 'engagementPlanItem', id, data, { version, raw: true }) : await S.create(actor, 'engagementPlanItem', data, { raw: true });
    const occ = await syncOccurrences(actor, planItem);
    return { planItem: await S.redactFor(actor, 'engagementPlanItem', planItem), ...occ, warnings: check.warnings };
  });

  S.op('cancelPlanItem', { area: 'engagement', summary: 'Cancel a plan item and its open occurrences' }, async (actor, { id, reason }) => {
    if (!String(reason || '').trim()) throw new AppError(422, 'A reason is required to cancel planned engagements (RUL-09).');
    const item = await S.update(actor, 'engagementPlanItem', id, { status: 'cancelled' }, { reason, raw: true });
    const occ = await syncOccurrences(actor, item, { reason });
    return { planItem: item, ...occ };
  });

  async function syncOccurrences(actor, item, { reason, notifyMoves = false } = {}) {
    const c = await ctxFor(item.initiativeId);
    const existing = (await S.driver.list('engagement', { initiativeId: item.initiativeId })).filter((e) => e.planItemId === item.id);
    const desired = item.status === 'cancelled' ? [] : expandOccurrences(item, { milestones: c.milestones, holidays: c.holidays, initiativeEnd: c.initiative.endDate });
    const created = [], moved = [], cancelled = [];
    for (const o of desired) {
      const e = existing.find((x) => x.occurrence === o.index);
      if (!e) {
        const rec = await S.create(S.SYSTEM, 'engagement', {
          initiativeId: item.initiativeId, planItemId: item.id, occurrence: o.index, plannedDate: o.date, plannedTime: o.time || item.plannedTime || null, status: 'planned',
          ...Object.fromEntries(PLAN_TO_OCCURRENCE.map((k) => [k, item[k] ?? null])),
          internalParticipantIds: item.relationshipOwnerId ? [item.relationshipOwnerId] : [actor.id],
        }, { system: true, raw: true, noAudit: true });
        created.push(rec);
        continue;
      }
      if (!isOpen(e)) continue;
      const patch = {};
      for (const k of PLAN_TO_OCCURRENCE) if (JSON.stringify(e[k] ?? null) !== JSON.stringify(item[k] ?? null)) patch[k] = item[k] ?? null;
      if (!e.manualDate && e.plannedDate !== o.date) {
        patch.plannedDate = o.date;
        patch.statusHistory = [...asArray(e.statusHistory), { at: S.nowIso(), by: actor.id, from: e.status, to: e.status, fromDate: e.plannedDate, toDate: o.date, reason: reason || 'Plan item timing changed' }];
        moved.push({ id: e.id, code: e.code, from: e.plannedDate, to: o.date });
      }
      if (Object.keys(patch).length) await S.update(S.SYSTEM, 'engagement', e.id, patch, { system: true, raw: true, skipValidation: true });
    }
    for (const e of existing) {
      if (!isOpen(e)) continue;
      if (!desired.some((o) => o.index === e.occurrence)) {
        await S.update(S.SYSTEM, 'engagement', e.id, { status: 'cancelled' }, { system: true, raw: true, reason: reason || 'No longer required by the plan item schedule', skipValidation: true });
        cancelled.push(e.id);
      }
    }
    if (notifyMoves && moved.length) {
      const owners = uniq([item.relationshipOwnerId, item.createdBy].filter(Boolean));
      await S.notify(owners, { kind: 'reschedule', initiativeId: item.initiativeId, title: `${moved.length} engagement${moved.length > 1 ? 's' : ''} moved: ${item.objective}`, body: moved.map((m) => `${m.code}: ${fmtDate(m.from)} → ${fmtDate(m.to)}`).join('\n'), link: { type: 'engagementPlanItem', id: item.id } });
    }
    return { created: created.length, moved, cancelled: cancelled.length };
  }
  S.syncOccurrences = syncOccurrences;

  // STK-023 / AC-04: milestone dates move dependent engagements and activities, and owners are notified.
  S.op('_milestoneMoved', { internal: true }, async (actor, ms, oldDate) => {
    const items = (await S.driver.list('engagementPlanItem', { initiativeId: ms.initiativeId })).filter((i) => i.status !== 'cancelled' && (i.milestoneId === ms.id || i.untilMilestoneId === ms.id));
    const results = [];
    for (const item of items) results.push(await syncOccurrences(actor, item, { reason: `Milestone "${ms.name}" moved from ${fmtDate(oldDate)} to ${fmtDate(ms.date)}`, notifyMoves: true }));
    const acts = (await S.driver.list('activity', { initiativeId: ms.initiativeId })).filter((a) => a.milestoneId === ms.id && a.offsetDays != null && a.offsetDays !== '' && !['complete', 'cancelled'].includes(a.status));
    const config = await S.getConfig();
    const cal = makeCalendar(holidaysOf(config.settings));
    for (const a of acts) {
      const span = a.startDate && a.endDate ? diffDays(a.startDate, a.endDate) : 0;
      const start = cal.addBusinessDays(ms.date, Number(a.offsetDays));
      if (start === a.startDate) continue;
      await S.update(S.SYSTEM, 'activity', a.id, { startDate: start, endDate: addDays(start, Math.max(0, span)) }, { system: true, raw: true, skipValidation: true, reason: `Milestone "${ms.name}" moved from ${fmtDate(oldDate)} to ${fmtDate(ms.date)}` });
      if (a.ownerId) await S.notify([a.ownerId], { kind: 'reschedule', initiativeId: ms.initiativeId, title: `Activity moved: ${a.title}`, body: `${fmtDate(a.startDate)} → ${fmtDate(start)} because "${ms.name}" moved.`, link: { type: 'activity', id: a.id } });
    }
    return { planItems: items.length, activities: acts.length, results };
  });

  // Status changes with reasons (STK-036, RUL-09).
  S.op('transitionEngagement', { area: 'engagement', summary: 'Change the status of an engagement (schedule, reschedule, cancel, did not proceed)' }, async (actor, { id, version, to, reason, newDate, newTime, patch = {} }) => {
    const p = { ...patch, status: to };
    if (newDate) p.plannedDate = newDate;
    if (newTime) p.plannedTime = newTime;
    const rec = await S.update(actor, 'engagement', id, p, { version, reason, newDate });
    // Re-confirmation returns a rescheduled engagement to scheduled (Figure 2).
    return rec;
  });

  // Logs an engagement against a planned occurrence or as unplanned (UC-05).
  S.op('logEngagement', { area: 'engagement', summary: 'Log a completed engagement with participants, outcome, concerns and actions' }, async (actor, { initiativeId, engagementId, version, data = {}, actions = [], reason }) => {
    const payload = { ...data, status: 'completed' };
    let rec;
    if (engagementId) {
      const cur = await S.driver.get('engagement', engagementId);
      if (!cur) throw new AppError(404, 'Engagement not found.');
      if (cur.status === 'planned' || cur.status === 'scheduled') {
        rec = await S.update(actor, 'engagement', engagementId, payload, { version, reason, raw: true, clearQuickCapture: true });
      } else if (cur.status === 'rescheduled') {
        await S.update(actor, 'engagement', engagementId, { status: 'scheduled' }, { version, raw: true });
        rec = await S.update(actor, 'engagement', engagementId, payload, { reason, raw: true });
      } else {
        rec = await S.update(actor, 'engagement', engagementId, payload, { version, reason, raw: true, clearQuickCapture: true });
      }
    } else {
      rec = await S.create(actor, 'engagement', { ...payload, initiativeId, unplanned: !payload.planItemId }, { raw: true });
    }
    // STK-032: actions agreed become tasks.
    const tasks = [];
    for (const a of actions.filter((x) => String(x.title || '').trim())) {
      tasks.push(await S.create(actor, 'task', { initiativeId: rec.initiativeId, title: a.title, description: a.description || '', assigneeId: a.assigneeId || actor.id, dueDate: a.dueDate || null, priority: a.priority || 'medium', status: 'open', recordType: 'engagement', recordId: rec.id }));
    }
    return { engagement: await S.redactFor(actor, 'engagement', rec), tasks };
  });

  // STK-034: mobile quick capture with minimum fields, flagged for completion later.
  S.op('quickCapture', { area: 'engagement', summary: 'Quick-capture an engagement on a mobile device' }, async (actor, { initiativeId, stakeholderIds = [], groupIds = [], actualDate, engagementType, summary, sentiment, clientId }) => {
    if (clientId) {
      const dup = (await S.driver.list('engagement', { initiativeId })).find((e) => e.clientId === clientId);
      if (dup) return { engagement: await S.redactFor(actor, 'engagement', dup), duplicate: true };
    }
    const ctx = await S.accessCtx(actor, initiativeId);
    const data = { initiativeId, stakeholderIds, groupIds, actualDate, engagementType, summary: summary ? `<p>${stripHtml(summary).replace(/</g, '&lt;')}</p>` : '', status: 'completed', quickCapture: true, unplanned: true, clientId: clientId || null };
    const { canSeeSensitive } = await import('../../access.js');
    if (sentiment && canSeeSensitive(actor, 'engagement', { createdBy: actor.id, internalParticipantIds: [actor.id] }, ctx)) data.sentiments = [...stakeholderIds, ...groupIds].map((sid) => ({ subjectId: sid, sentiment }));
    const rec = await S.create(actor, 'engagement', data, { optional: [] });
    return { engagement: rec };
  });

  // STK-033: convert a concern into a resistance item, change risk or FAQ, keeping the link.
  S.op('convertConcern', { area: 'engagement', summary: 'Convert a concern raised in an engagement into a resistance item, risk or FAQ' }, async (actor, { engagementId, index, to, data = {} }) => {
    const e = await S.driver.get('engagement', engagementId);
    if (!e) throw new AppError(404, 'Engagement not found.');
    const concern = asArray(e.concerns)[index];
    if (!concern) throw new AppError(404, 'Concern not found.');
    if (concern.convertedId) throw new AppError(409, `This concern was already converted to a ${concern.convertedType}.`);
    let rec;
    const base = { initiativeId: e.initiativeId };
    if (to === 'resistance') {
      rec = await S.create(actor, 'resistance', { ...base, kind: 'observed', title: data.title || concern.text.slice(0, 80), description: concern.text, sourceType: asArray(e.stakeholderIds).length === 1 ? 'stakeholder' : 'group', stakeholderId: asArray(e.stakeholderIds).length === 1 ? e.stakeholderIds[0] : null, groupId: data.groupId || null, barrierPoint: data.barrierPoint || null, severity: data.severity || 'medium', status: 'open', date: e.actualDate || e.plannedDate, ownerId: data.ownerId || actor.id, raisedFromType: 'engagement', raisedFromId: e.id, ...data });
    } else if (to === 'risk') {
      rec = await S.create(actor, 'risk', { ...base, kind: data.kind || 'risk', title: data.title || concern.text.slice(0, 80), cause: concern.text, likelihood: data.likelihood || '3', consequence: data.consequence || '3', status: 'open', ownerId: data.ownerId || actor.id, stakeholderIds: e.stakeholderIds || [], sourceType: 'engagement', sourceId: e.id, ...data });
    } else if (to === 'faq') {
      rec = await S.create(actor, 'faq', { ...base, question: data.question || concern.text, answer: data.answer || '', ownerId: data.ownerId || actor.id, status: 'draft', sourceType: 'engagement', sourceId: e.id, adkar: e.adkar || [] });
    } else {
      throw new AppError(422, 'Convert to resistance, risk or faq.');
    }
    const concerns = asArray(e.concerns).map((c, i) => (i === Number(index) ? { ...c, convertedType: to, convertedId: rec.id } : c));
    await S.update(S.SYSTEM, 'engagement', e.id, { concerns }, { system: true, raw: true, skipValidation: true, reason: 'Concern converted' });
    return { record: rec, type: to === 'faq' ? 'faq' : to };
  });

  // COM-008: when a communication is sent, it is recorded in each recipient's engagement history.
  S.op('sendCommunication', { area: 'plans', summary: 'Mark a communication as sent and record it in recipients\' engagement history' }, async (actor, { activityId, sentDate }) => {
    const a = await S.driver.get('activity', activityId);
    if (!a || a.kind !== 'communication') throw new AppError(404, 'Communication not found.');
    if (!['approved', 'scheduled'].includes(a.commsStatus)) throw new AppError(422, 'Only approved or scheduled communications can be sent (COM-005).');
    const date = sentDate || S.nowIso().slice(0, 10);
    const updated = await S.update(actor, 'activity', a.id, { commsStatus: 'sent', status: 'complete', percentComplete: 100, sentAt: S.nowIso() }, { raw: true, system: false });
    const groups = await S.driver.list('impactedGroup', { initiativeId: a.initiativeId });
    const sgIds = uniq(asArray(a.groupIds).map((g) => groups.find((x) => x.id === g)?.stakeholderGroupId).filter(Boolean));
    const config = await S.getConfig();
    const type = { email: 'email', intranet: 'intranet', newsletter: 'newsletter', video: 'video' }[String(a.channel || '').toLowerCase()] || (String(a.channel || '').toLowerCase().includes('intranet') ? 'intranet' : 'email');
    const eng = await S.create(S.SYSTEM, 'engagement', {
      initiativeId: a.initiativeId, status: 'completed', actualDate: date, engagementType: type, channel: type === 'email' ? 'written' : 'digital',
      stakeholderIds: asArray(a.stakeholderIds), groupIds: sgIds, senderId: a.delivererId || null, purpose: a.objective || a.title, objective: a.title, adkar: asArray(a.adkar),
      keyMessageIds: asArray(a.keyMessageIds), summary: `<p>Communication sent: ${a.title}. ${stripHtml(a.content || '').slice(0, 400).replace(/</g, '&lt;')}</p>`, outcome: 'met', communicationId: a.id, unplanned: true,
      internalParticipantIds: [actor.id],
    }, { system: true, raw: true });
    await S.audit(actor, { action: 'send', type: 'activity', recordId: a.id, initiativeId: a.initiativeId, summary: `Communication ${a.code} sent to ${listLabel('channel', eng.channel, config)} audience` });
    return { activity: updated, engagement: eng };
  });

  // RUL-10: locks completed engagements after the configured number of business days.
  S.op('lockDueEngagements', { area: 'engagement', summary: 'Lock completed engagements older than the configured period', system: true }, async (actor) => {
    const config = await S.getConfig();
    const today = await S.today();
    let locked = 0;
    for (const i of await S.driver.list('initiative')) {
      for (const e of await S.driver.list('engagement', { initiativeId: i.id })) {
        if (lockDue(e, today, { lockBusinessDays: config.settings.lockBusinessDays, holidays: holidaysOf(config.settings) })) {
          await S.driver.put({ ...e, status: 'locked', lockedAt: S.nowIso(), version: e.version + 1, updatedAt: S.nowIso(), updatedBy: 'system', statusHistory: [...asArray(e.statusHistory), { at: S.nowIso(), by: 'system', from: 'completed', to: 'locked', reason: `Locked after ${config.settings.lockBusinessDays} business days (RUL-10)` }] }, { expectedVersion: e.version });
          locked++;
        }
      }
      if (locked) S.touch(i.id);
    }
    if (locked) await S.audit(actor, { action: 'lock', type: 'engagement', summary: `${locked} completed engagements locked (RUL-10)` });
    return { locked };
  });

  // STK-028: calendar invitation content for an engagement (the client downloads it as .ics).
  S.op('engagementInvitation', { area: 'engagement', summary: 'Build an iCalendar invitation for a planned engagement' }, async (actor, { id }) => {
    const e = await S.get(actor, 'engagement', id);
    const stakeholders = await S.driver.list('stakeholder');
    const attendees = resolveAudience({ stakeholderIds: e.stakeholderIds, groupIds: e.groupIds }, { groups: await S.driver.list('stakeholderGroup'), memberships: await S.driver.list('membership'), stakeholders })
      .map((sid) => stakeholders.find((s) => s.id === sid)).filter((s) => s?.email).map((s) => ({ name: personName(s), email: s.email }));
    return { engagement: e, attendees };
  });

  // Data quality check used before completion (RUL-08), exposed for the UI.
  S.op('completionGaps', { area: 'engagement', summary: 'List the fields still needed to complete an engagement' }, async (actor, { data }) => ({ gaps: completionGaps(data || {}) }));
}
