// Record-type hooks applied by the service on create, update and delete.
import { AppError, asArray, uid, isEmpty, stripHtml } from '../util.js';
import { canTransition, transitionRequirements, completionGaps } from '../rules/engagements.js';
import { findDuplicates, isNegative } from '../rules/stakeholders.js';
import { makeCalendar, addDays, diffDays } from '../dates.js';
import { holidaysOf } from '../model.js';

const ANALYSIS_FIELDS = ['influence', 'interest', 'impactOverride', 'currentEngagement', 'desiredEngagement', 'priorityOverride', 'salience'];
const PERSON_RATINGS = ['influence', 'interest', 'currentEngagement', 'desiredEngagement', 'priorityOverride'];

function groupLevelOnly(config, initiative) {
  return !!(config.settings.privacy?.groupLevelOnly || initiative?.groupLevelOnly);
}

// Engagement status changes (Section 7.9, RUL-08, RUL-09).
function applyTransition(S, actor, cur, next, opts) {
  const from = cur?.status || null;
  const to = next.status;
  if (from === to) return next;
  if (from && !canTransition(from, to)) throw new AppError(422, `An engagement cannot move from ${from} to ${to}.`);
  const req = transitionRequirements(to);
  if (req.reason && !String(opts.reason || '').trim()) throw new AppError(422, `A reason is required to set an engagement to ${to} (RUL-09).`);
  if (req.newDate && !(opts.newDate || next.plannedDate !== cur?.plannedDate)) throw new AppError(422, 'A new date is required to reschedule an engagement.');
  if (req.completion) {
    const gaps = completionGaps(next);
    if (gaps.length) throw Object.assign(new AppError(422, `The engagement cannot be completed until these are recorded: ${gaps.join(', ')} (RUL-08).`), { details: gaps });
  }
  const entry = { at: S.nowIso(), by: actor.id, from, to, reason: opts.reason || null };
  if (to === 'rescheduled' || (from && next.plannedDate !== cur.plannedDate)) {
    entry.fromDate = cur?.plannedDate || null;
    entry.toDate = next.plannedDate || opts.newDate || null;
    if (opts.newDate) next.plannedDate = opts.newDate;
    next.manualDate = true;
  }
  next.statusHistory = [...asArray(cur?.statusHistory), entry];
  if (to === 'completed' && next.quickCapture && completionGaps(next).length === 0 && opts.clearQuickCapture) next.quickCapture = false;
  return next;
}

async function onEngagementCompleted(S, actor, rec) {
  const initiative = await S.initiative(rec.initiativeId);
  // RUL-12 / UC-05 4a: negative sentiment from a high-influence stakeholder in two consecutive engagements.
  const profiles = await S.driver.list('profile', { initiativeId: rec.initiativeId });
  const engagements = (await S.driver.list('engagement', { initiativeId: rec.initiativeId })).filter((e) => ['completed', 'locked'].includes(e.status) && e.actualDate);
  for (const s of asArray(rec.sentiments)) {
    if (!isNegative(s.sentiment)) continue;
    const p = profiles.find((x) => x.stakeholderId === s.subjectId && x.influence === 'high');
    if (!p) continue;
    const prior = engagements.filter((e) => e.id !== rec.id && e.actualDate <= rec.actualDate && asArray(e.sentiments).some((x) => x.subjectId === s.subjectId))
      .sort((a, b) => a.actualDate.localeCompare(b.actualDate)).slice(-1)[0];
    const prevSent = prior ? asArray(prior.sentiments).find((x) => x.subjectId === s.subjectId)?.sentiment : null;
    if ((prevSent && isNegative(prevSent)) || p.currentEngagement === 'resistant') {
      const st = await S.driver.get('stakeholder', s.subjectId);
      const name = st ? [st.preferredName || st.givenName, st.familyName].join(' ') : 'A stakeholder';
      await S.notify([p.relationshipOwnerId, initiative?.changeLeadId], { kind: 'resistance', initiativeId: rec.initiativeId, title: `Resistance escalation: ${name}`, body: `${name} is high influence and showed negative sentiment in consecutive engagements. Consider creating a resistance item (RUL-12).`, link: { type: 'profile', id: p.id } });
    }
  }
  if (rec.followUpRequired && rec.followUpDate) {
    await S.create(S.SYSTEM, 'task', { initiativeId: rec.initiativeId, title: `Follow up: ${rec.objective || rec.purpose || rec.code}`, assigneeId: actor.id === 'system' ? initiative?.changeLeadId : actor.id, dueDate: rec.followUpDate, priority: 'medium', status: 'open', recordType: 'engagement', recordId: rec.id }, { system: true });
  }
  await S.emit('engagement.completed', { initiativeId: rec.initiativeId, engagementId: rec.id, code: rec.code, actualDate: rec.actualDate, outcome: rec.outcome });
}

export const HOOKS = {
  profile: {
    beforeCreate: async (S, { actor, data, initiative, config }) => {
      if (data.subjectType !== 'group' && groupLevelOnly(config, initiative)) {
        for (const k of PERSON_RATINGS) if (!isEmpty(data[k])) throw new AppError(422, 'This initiative records analysis at group level only; ratings of named individuals are disabled (STK-018).');
      }
      if (data.subjectType === 'group' && !data.groupId) throw new AppError(422, 'Choose the stakeholder group this profile describes.');
      if (data.subjectType !== 'group' && !data.stakeholderId) throw new AppError(422, 'Choose the stakeholder this profile describes.');
      const existing = (await S.driver.list('profile', { initiativeId: initiative.id })).find((p) => (data.subjectType === 'group' ? p.groupId === data.groupId : p.stakeholderId === data.stakeholderId));
      if (existing) throw new AppError(409, 'This stakeholder already has a profile in this initiative.');
      data.ratingHistory = ANALYSIS_FIELDS.filter((k) => !isEmpty(data[k])).map((k) => ({ at: S.nowIso(), by: actor.id, field: k, from: null, to: data[k] }));
      return data;
    },
    beforeUpdate: async (S, { actor, cur, next, initiative, config }) => {
      if (cur.subjectType !== 'group' && groupLevelOnly(config, initiative)) {
        for (const k of PERSON_RATINGS) if (JSON.stringify(next[k] ?? null) !== JSON.stringify(cur[k] ?? null) && !isEmpty(next[k])) throw new AppError(422, 'Ratings of named individuals are disabled for this initiative (STK-018).');
      }
      if (next.priorityOverride != null && next.priorityOverride !== '' && next.priorityOverride !== cur.priorityOverride && !String(next.priorityJustification || '').trim()) {
        throw new AppError(422, 'A justification is required to override the priority score (STK-015).');
      }
      if (next.impactOverride != null && next.impactOverride !== '' && next.impactOverride !== cur.impactOverride && !String(next.impactOverrideReason || '').trim()) {
        throw new AppError(422, 'A reason is required to override the degree of impact (STK-012).');
      }
      // STK-017: date and author of every analysis rating.
      const hist = [...asArray(cur.ratingHistory)];
      for (const k of ANALYSIS_FIELDS) {
        if (JSON.stringify(next[k] ?? null) !== JSON.stringify(cur[k] ?? null)) hist.push({ at: S.nowIso(), by: actor.id, field: k, from: cur[k] ?? null, to: next[k] ?? null });
      }
      next.ratingHistory = hist;
      return next;
    },
  },

  engagement: {
    beforeCreate: async (S, { actor, data, opts }) => {
      data.status ||= 'planned';
      if (data.status === 'completed') {
        const gaps = completionGaps(data);
        if (gaps.length && !data.quickCapture) throw Object.assign(new AppError(422, `The engagement cannot be completed until these are recorded: ${gaps.join(', ')} (RUL-08).`), { details: gaps });
        if (!data.planItemId) data.unplanned = true;
      }
      data.statusHistory = [{ at: S.nowIso(), by: actor.id, from: null, to: data.status, reason: opts.reason || null }];
      if (!asArray(data.internalParticipantIds).length && actor.id !== 'system') data.internalParticipantIds = [actor.id];
      return data;
    },
    beforeUpdate: async (S, { actor, cur, next, opts }) => {
      if (cur.status === 'locked') {
        // RUL-10: edits after locking need a reason and are audited.
        if (!String(opts.reason || '').trim()) throw new AppError(422, 'This engagement is locked. Give a reason for the change (RUL-10).');
        next.editReasons = [...asArray(cur.editReasons), { at: S.nowIso(), by: actor.id, reason: opts.reason }];
        next.status = 'locked';
        opts.auditAction = 'lockedEdit';
        return next;
      }
      if (next.status !== cur.status || next.plannedDate !== cur.plannedDate) next = applyTransition(S, actor, cur, next, opts);
      else if (['completed'].includes(next.status)) {
        const gaps = completionGaps(next);
        if (gaps.length && !next.quickCapture) throw new AppError(422, `A completed engagement must keep: ${gaps.join(', ')} (RUL-08).`);
      }
      if (next.quickCapture && next.status === 'completed' && !completionGaps(next).length && opts.clearQuickCapture !== false && (next.summary !== cur.summary || next.outcome !== cur.outcome || opts.clearQuickCapture)) next.quickCapture = false;
      return next;
    },
    afterCreate: async (S, { actor, rec }) => {
      if (rec.status === 'completed') await onEngagementCompleted(S, actor, rec);
    },
    afterUpdate: async (S, { actor, cur, rec }) => {
      if (rec.status === 'completed' && cur.status !== 'completed') await onEngagementCompleted(S, actor, rec);
    },
  },

  milestone: {
    afterUpdate: async (S, { actor, cur, rec }) => {
      if (cur.date !== rec.date) await S.ops._milestoneMoved(actor, rec, cur.date);
    },
  },

  activity: {
    beforeCreate: async (S, { data, config, initiative }) => {
      if (data.milestoneId && data.offsetDays != null && data.offsetDays !== '') {
        const ms = await S.driver.get('milestone', data.milestoneId);
        if (ms?.date) {
          const cal = makeCalendar(holidaysOf(config.settings));
          const span = data.startDate && data.endDate ? diffDays(data.startDate, data.endDate) : 0;
          data.startDate = cal.addBusinessDays(ms.date, Number(data.offsetDays));
          data.endDate = addDays(data.startDate, Math.max(0, span));
        }
      }
      if (data.kind === 'communication' && !data.commsStatus) data.commsStatus = 'draft';
      if (initiative && !asArray(data.plans).length) data.plans = [];
      return data;
    },
    beforeUpdate: async (S, { actor, cur, next, opts, config }) => {
      if (next.milestoneId && next.offsetDays != null && next.offsetDays !== '' && (next.milestoneId !== cur.milestoneId || next.offsetDays !== cur.offsetDays)) {
        const ms = await S.driver.get('milestone', next.milestoneId);
        if (ms?.date) {
          const cal = makeCalendar(holidaysOf(config.settings));
          const span = cur.startDate && cur.endDate ? diffDays(cur.startDate, cur.endDate) : 0;
          next.startDate = cal.addBusinessDays(ms.date, Number(next.offsetDays));
          next.endDate = addDays(next.startDate, Math.max(0, span));
        }
      }
      if (next.status === 'complete' && cur.status !== 'complete') next.percentComplete = 100;
      // PLN-006: once baselined, scope and schedule changes are recorded with a reason.
      const baselines = await S.driver.list('planBaseline', { initiativeId: cur.initiativeId });
      const keyFields = ['title', 'startDate', 'endDate', 'ownerId', 'plans', 'adkar', 'groupIds'];
      const changed = keyFields.filter((k) => JSON.stringify(next[k] ?? null) !== JSON.stringify(cur[k] ?? null));
      if (next.status === 'cancelled' && cur.status !== 'cancelled') changed.push('status');
      if (baselines.length && changed.length && (!opts.system || opts.reason)) {
        if (!String(opts.reason || '').trim()) throw new AppError(422, 'The plan has been baselined: give a reason for this change (PLN-006).');
        opts.planChange = { activityId: cur.id, summary: `${cur.code} ${changed.join(', ')} changed`, reason: opts.reason, fields: changed.map((k) => ({ field: k, from: cur[k] ?? null, to: next[k] ?? null })) };
      }
      if (opts.planChange == null && next.aiDrafted && opts.acceptAi) next.aiDrafted = false;
      return next;
    },
    afterUpdate: async (S, { actor, rec, opts }) => {
      if (opts.planChange) await S.create(actor, 'planChange', { initiativeId: rec.initiativeId, ...opts.planChange }, { system: true });
    },
  },

  keyMessage: {
    beforeUpdate: async (S, { actor, cur, next }) => {
      if (next.text !== cur.text || next.title !== cur.title) {
        next.history = [...asArray(cur.history), { version: cur.messageVersion || 1, title: cur.title, text: cur.text, at: cur.updatedAt, by: cur.updatedBy, status: cur.status }];
        next.messageVersion = (cur.messageVersion || 1) + 1;
        if (cur.status === 'approved' && next.status === 'approved') next.status = 'draft';
      }
      return next;
    },
  },

  blueprint: {
    // An approved Blueprint that is changed goes back to draft and needs approval again.
    beforeUpdate: async (S, { cur, next, opts }) => {
      if (cur.status === 'approved' && !opts.system && (JSON.stringify(next.elements ?? null) !== JSON.stringify(cur.elements ?? null) || next.name !== cur.name)) next.status = 'draft';
      return next;
    },
  },

  toolkitItem: {
    beforeUpdate: async (S, { cur, next }) => {
      if (next.content !== cur.content || next.title !== cur.title) next.itemVersion = (cur.itemVersion || 1) + 1;
      return next;
    },
  },

  task: {
    beforeUpdate: async (S, { cur, next }) => {
      if (next.status === 'done' && cur.status !== 'done') next.completedAt = S.nowIso();
      return next;
    },
    afterCreate: async (S, { actor, rec }) => {
      if (rec.assigneeId && rec.assigneeId !== actor.id) await S.notify([rec.assigneeId], { kind: 'task', initiativeId: rec.initiativeId, title: `New task: ${rec.title}`, body: rec.dueDate ? `Due ${rec.dueDate}` : '', link: { type: 'task', id: rec.id } });
    },
    afterUpdate: async (S, { actor, cur, rec }) => {
      if (rec.assigneeId && rec.assigneeId !== cur.assigneeId && rec.assigneeId !== actor.id) await S.notify([rec.assigneeId], { kind: 'task', initiativeId: rec.initiativeId, title: `Task assigned to you: ${rec.title}`, link: { type: 'task', id: rec.id } });
    },
  },

  comment: {
    afterCreate: async (S, { actor, rec }) => {
      // WFL-004: @mentions notify the people mentioned.
      const ids = asArray(rec.mentions).filter((id) => id !== actor.id);
      if (ids.length) await S.notify(ids, { kind: 'mention', initiativeId: rec.initiativeId, title: `${actor.name} mentioned you`, body: stripHtml(rec.body).slice(0, 240), link: { type: rec.recordType, id: rec.recordId } });
    },
  },

  stakeholder: {
    beforeCreate: async (S, { data, opts }) => {
      if (!opts.allowDuplicate) {
        const dups = findDuplicates(data, await S.driver.list('stakeholder'));
        if (dups.length) throw Object.assign(new AppError(409, `Possible duplicate: ${dups.map((d) => `${[d.record.givenName, d.record.familyName].join(' ')} (${d.reason.toLowerCase()})`).join('; ')}. Open the existing record, merge, or confirm to create anyway (STK-046).`), { duplicates: dups.map((d) => ({ id: d.record.id, reason: d.reason })) });
      }
      return data;
    },
    afterUpdate: async (S, { actor, cur, rec }) => {
      if (rec.status === 'left' && cur.status !== 'left') await S.ops._stakeholderLeft(actor, rec);
    },
  },

  user: {
    afterUpdate: async (S, { actor, cur, rec }) => {
      if (rec.status === 'left' && cur.status !== 'left') await S.ops._userLeft(actor, rec);
    },
  },

  initiative: {
    beforeUpdate: async (S, { cur, next }) => {
      if (next.status === 'closed' && cur.status !== 'closed') next.closedAt = S.nowIso();
      return next;
    },
  },

  survey: {
    beforeCreate: async (S, { data }) => {
      data.token = uid().slice(0, 16);
      return data;
    },
  },

  artefact: {
    beforeUpdate: async (S, { cur, opts }) => {
      if (cur.status === 'approved' && !opts.system) throw new AppError(409, 'Approved artefacts cannot be changed (ART-014). Generate a new version instead.');
    },
  },

  template: {
    beforeUpdate: async (S, { cur, next }) => {
      const content = ['branding', 'sections', 'docxTemplateId', 'pptxThemeId', 'variant', 'businessUnit', 'artefactType'];
      const changed = content.some((k) => JSON.stringify(next[k] ?? null) !== JSON.stringify(cur[k] ?? null));
      if (changed && cur.state === 'published') {
        // ART-026: editing a published template starts a new draft version; the old version is kept.
        next.versions = [...asArray(cur.versions), { templateVersion: cur.templateVersion || 1, branding: cur.branding, sections: cur.sections, docxTemplateId: cur.docxTemplateId, pptxThemeId: cur.pptxThemeId, publishedAt: cur.publishedAt || cur.updatedAt }];
        next.templateVersion = (cur.templateVersion || 1) + 1;
        next.state = 'draft';
      }
      if (next.state === 'published' && cur.state !== 'published') next.publishedAt = S.nowIso();
      return next;
    },
  },

  resistance: {
    afterCreate: async (S, { actor, rec }) => {
      if (['high', 'critical'].includes(rec.severity) && rec.kind === 'observed') {
        const initiative = await S.initiative(rec.initiativeId);
        await S.notify([initiative?.changeLeadId, rec.ownerId], { kind: 'resistance', initiativeId: rec.initiativeId, title: `${rec.severity === 'critical' ? 'Critical' : 'High'} resistance raised: ${rec.title}`, link: { type: 'resistance', id: rec.id } });
      }
    },
  },
};
