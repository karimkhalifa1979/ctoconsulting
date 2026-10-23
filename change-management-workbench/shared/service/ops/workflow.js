// Workflow operations: approvals (WFL-001, STR-006, PLN-007, COM-005, ART-014), coverage acknowledgement
// (RUL-15), tasks, comments, notifications (WFL-002 to WFL-004) and attachments (WFL-005, SEC-10).
import { AppError, asArray, uid, clone, base64ToBytes, sortBy } from '../../util.js';
import { addDays } from '../../dates.js';
import { approvalNotice } from '../notices.js';
import { entity } from '../../schema.js';
import { can, initiativeAccess } from '../../access.js';
import { initiativeSummary } from './initiatives.js';

const SUBJECTS = {
  strategy: { type: 'strategy', label: 'Change Management Strategy' },
  masterPlan: { type: 'initiative', label: 'Master Change Management Plan' },
  plan: { type: 'initiative', label: 'Component plan' },
  blueprint: { type: 'blueprint', label: 'ADKAR Blueprint' },
  keyMessage: { type: 'keyMessage', label: 'Key message' },
  faq: { type: 'faq', label: 'FAQ' },
  communication: { type: 'activity', label: 'Communication' },
  artefact: { type: 'artefact', label: 'Artefact' },
  closeout: { type: 'closeout', label: 'Change Management Closeout' },
};

// RUL-16: drafts are 0.1, 0.2 …; approval sets the next major version (1.0, 2.0); later drafts are 1.1, 1.2 …
export function nextDraftVersion(prev) {
  if (!prev) return '0.1';
  const [maj, min] = String(prev).split('.').map(Number);
  return `${maj}.${(min || 0) + 1}`;
}
export function approvedVersion(draft) {
  const [maj] = String(draft || '0.1').split('.').map(Number);
  return `${maj + 1}.0`;
}

export function registerWorkflowOps(S) {
  async function subjectRecord(subjectType, subjectId) {
    const meta = SUBJECTS[subjectType];
    if (!meta) throw new AppError(422, `Unknown approval subject ${subjectType}.`);
    const rec = await S.driver.get(meta.type, subjectId);
    if (!rec) throw new AppError(404, `${meta.label} not found.`);
    return { meta, rec };
  }

  S.op('requestApproval', { area: 'workflow', summary: 'Submit a strategy, plan, communication, message, Blueprint, closeout or artefact for approval' }, async (actor, { subjectType, subjectId, component, approverIds = [], rule = 'all', note }) => {
    const { meta, rec } = await subjectRecord(subjectType, subjectId);
    const initiativeId = rec.initiativeId || (meta.type === 'initiative' ? rec.id : null);
    const initiative = await S.initiative(initiativeId);
    S.assertInitiative(actor, initiative);
    S.assertWritable(initiative, 'approval', actor);
    if (!actor.system && !can(actor, 'U', meta.type, rec, await S.accessCtx(actor, initiativeId)) && !(subjectType === 'artefact' && can(actor, 'C', 'artefact', rec))) {
      throw new AppError(403, `You cannot submit this ${meta.label.toLowerCase()} for approval.`);
    }
    if (!asArray(approverIds).length) throw new AppError(422, 'Choose at least one approver.');
    const existing = (await S.driver.list('approval', { initiativeId })).find((a) => a.subjectType === subjectType && a.subjectId === subjectId && (a.component || null) === (component || null) && a.status === 'pending');
    if (existing) throw new AppError(409, 'An approval request is already pending for this item.');
    // RUL-15: coverage warnings must be acknowledged before the Master Change Management Plan is submitted.
    if (subjectType === 'masterPlan') {
      const model = await S.model(initiativeId);
      const open = model.coverage.filter((w) => !w.ack);
      if (open.length) throw Object.assign(new AppError(422, `Acknowledge the ${open.length} plan coverage warning${open.length > 1 ? 's' : ''} before submitting the plan for approval (RUL-15).`), { details: open });
    }
    const users = await S.driver.list('user');
    const label = subjectType === 'artefact' ? `${rec.title} v${rec.versionLabel}` : subjectType === 'plan' ? `${component} plan` : subjectType === 'communication' ? rec.title : subjectType === 'keyMessage' ? rec.title : subjectType === 'faq' ? rec.question : subjectType === 'blueprint' ? rec.name : meta.label;
    const approval = await S.create(actor, 'approval', {
      initiativeId, subjectType, subjectId, component: component || null, subjectLabel: label, requestedBy: actor.id, requestedAt: S.nowIso(), rule, note: note || '', status: 'pending',
      approvers: asArray(approverIds).map((userId) => ({ userId, name: users.find((u) => u.id === userId)?.name || userId, decision: null, comment: null, decidedAt: null })),
    }, { raw: true });
    // Mark the subject as under review.
    if (subjectType === 'strategy' || subjectType === 'closeout') await S.update(S.SYSTEM, meta.type, rec.id, { status: 'forReview' }, { system: true, skipValidation: true });
    if (subjectType === 'artefact') await S.update(S.SYSTEM, 'artefact', rec.id, { status: 'forReview' }, { system: true, skipValidation: true });
    if (subjectType === 'keyMessage' || subjectType === 'faq') await S.update(S.SYSTEM, meta.type, rec.id, { status: 'inReview' }, { system: true, skipValidation: true });
    if (subjectType === 'communication') await S.update(S.SYSTEM, 'activity', rec.id, { commsStatus: 'inReview' }, { system: true, skipValidation: true });
    for (const a of approval.approvers) {
      await S.create(S.SYSTEM, 'task', { initiativeId, title: `Review and approve: ${label}`, assigneeId: a.userId, priority: 'high', status: 'open', recordType: 'approval', recordId: approval.id, description: note || '' }, { system: true });
      await S.notify([a.userId], approvalNotice(approval, a.name));
    }
    await S.audit(actor, { action: 'submit', type: 'approval', recordId: approval.id, initiativeId, summary: `Submitted ${label} for approval` });
    return approval;
  });

  S.op('decideApproval', { area: 'workflow', summary: 'Approve or reject an approval request' }, async (actor, { id, decision, comment }) => {
    const ap = await S.driver.get('approval', id);
    if (!ap) throw new AppError(404, 'Approval not found.');
    if (ap.status !== 'pending') throw new AppError(409, `This approval is already ${ap.status}.`);
    const mine = ap.approvers.find((a) => a.userId === actor.id);
    if (!mine) throw new AppError(403, 'You are not an approver for this item.');
    if (!['approve', 'reject'].includes(decision)) throw new AppError(422, 'Decision must be approve or reject.');
    if (decision === 'reject' && !String(comment || '').trim()) throw new AppError(422, 'Record a comment explaining the rejection.');
    const approvers = ap.approvers.map((a) => (a.userId === actor.id ? { ...a, decision, comment: comment || null, decidedAt: S.nowIso() } : a));
    let status = 'pending';
    if (approvers.some((a) => a.decision === 'reject')) status = 'rejected';
    else if (ap.rule === 'any' ? approvers.some((a) => a.decision === 'approve') : approvers.every((a) => a.decision === 'approve')) status = 'approved';
    let snapshot = ap.snapshot || null;
    if (status !== 'pending') snapshot = await applyDecision(actor, ap, status, comment);
    const updated = await S.update(S.SYSTEM, 'approval', ap.id, { approvers, status, snapshot }, { system: true, raw: true, skipValidation: true });
    // Close the reviewer's task.
    for (const t of (await S.driver.list('task', { initiativeId: ap.initiativeId })).filter((t) => t.recordType === 'approval' && t.recordId === ap.id && t.status !== 'done' && (t.assigneeId === actor.id || status !== 'pending'))) {
      await S.update(S.SYSTEM, 'task', t.id, { status: status === 'pending' || t.assigneeId === actor.id ? 'done' : 'cancelled' }, { system: true });
    }
    await S.audit(actor, { action: decision === 'approve' ? 'approve' : 'reject', type: 'approval', recordId: ap.id, initiativeId: ap.initiativeId, summary: `${decision === 'approve' ? 'Approved' : 'Rejected'} ${ap.subjectLabel}`, reason: comment || null });
    if (status !== 'pending') await S.notify([ap.requestedBy], { kind: 'approval', initiativeId: ap.initiativeId, title: `${ap.subjectLabel} ${status}`, body: comment || '', link: { type: 'approval', id: ap.id } });
    return updated;
  });

  async function applyDecision(actor, ap, status, comment) {
    const { meta, rec } = await subjectRecord(ap.subjectType, ap.subjectId);
    const ok = status === 'approved';
    switch (ap.subjectType) {
      case 'strategy': {
        const ver = ok ? approvedVersion(rec.approvedVersion ? `${rec.approvedVersion}` : '0.1') : rec.approvedVersion;
        await S.update(S.SYSTEM, 'strategy', rec.id, ok ? { status: 'approved', approvedVersion: ver, baselineAt: S.nowIso() } : { status: 'draft' }, { system: true, skipValidation: true });
        if (ok) await S.emit('strategy.approved', { initiativeId: rec.initiativeId, version: ver });
        return ok ? { record: clone(rec), version: ver } : null;
      }
      case 'masterPlan': {
        if (!ok) return null;
        const acts = await S.driver.list('activity', { initiativeId: rec.id });
        const n = (await S.driver.list('planBaseline', { initiativeId: rec.id })).length + 1;
        await S.create(S.SYSTEM, 'planBaseline', { initiativeId: rec.id, name: `Approved plan ${n}.0`, date: S.nowIso().slice(0, 10), reason: 'Master Change Management Plan approved', activities: acts.map(slimActivity) }, { system: true });
        await S.emit('plan.approved', { initiativeId: rec.id });
        return { activities: acts.length, version: `${n}.0` };
      }
      case 'blueprint':
      case 'closeout':
        await S.update(S.SYSTEM, meta.type, rec.id, { status: ok ? 'approved' : 'draft' }, { system: true, skipValidation: true });
        return ok ? clone(rec) : null;
      case 'keyMessage':
      case 'faq':
        await S.update(S.SYSTEM, meta.type, rec.id, { status: ok ? 'approved' : 'draft' }, { system: true, skipValidation: true });
        return ok ? clone(rec) : null;
      case 'communication':
        await S.update(S.SYSTEM, 'activity', rec.id, { commsStatus: ok ? 'approved' : 'draft' }, { system: true, skipValidation: true });
        return ok ? clone(rec) : null;
      case 'artefact': {
        const history = [...asArray(rec.approvalHistory), { at: S.nowIso(), status, approvers: ap.approvers.map((a) => a.name), comment: comment || null }];
        if (!ok) {
          await S.update(S.SYSTEM, 'artefact', rec.id, { status: 'draft', approvalHistory: history }, { system: true, skipValidation: true });
          return null;
        }
        const ver = approvedVersion(rec.versionLabel);
        // Earlier approved versions of the same artefact are superseded.
        for (const other of (await S.driver.list('artefact', { initiativeId: rec.initiativeId })).filter((x) => x.id !== rec.id && x.artefactType === rec.artefactType && x.status === 'approved' && JSON.stringify(x.params?.scopeKey ?? null) === JSON.stringify(rec.params?.scopeKey ?? null))) {
          await S.update(S.SYSTEM, 'artefact', other.id, { status: 'superseded' }, { system: true, skipValidation: true });
        }
        await S.update(S.SYSTEM, 'artefact', rec.id, { status: 'approved', versionLabel: ver, approvalHistory: history, approvedAt: S.nowIso() }, { system: true, skipValidation: true });
        // Re-render document control so the approved file states its approved version.
        if (S.ops._restampArtefact) await S.ops._restampArtefact(actor, rec.id);
        await S.emit('artefact.approved', { initiativeId: rec.initiativeId, artefactId: rec.id, version: ver });
        return { version: ver };
      }
      default:
        return null;
    }
  }

  S.op('withdrawApproval', { area: 'workflow', summary: 'Withdraw a pending approval request' }, async (actor, { id }) => {
    const ap = await S.driver.get('approval', id);
    if (!ap) throw new AppError(404, 'Approval not found.');
    if (ap.requestedBy !== actor.id && !actor.roles?.includes('changeLead')) throw new AppError(403, 'Only the requester or a change management lead can withdraw this request.');
    return S.update(S.SYSTEM, 'approval', id, { status: 'withdrawn' }, { system: true });
  });

  // RUL-15: warnings do not block approval but must be acknowledged.
  S.op('acknowledgeCoverage', { area: 'plans', summary: 'Acknowledge plan coverage warnings' }, async (actor, { initiativeId, warningIds = [], note }) => {
    const initiative = await S.initiative(initiativeId);
    S.assertInitiative(actor, initiative);
    S.assertCan(actor, 'U', 'activity', null);
    if (!String(note || '').trim()) throw new AppError(422, 'Record why the warning is acceptable.');
    const acks = { ...(initiative.coverageAcks || {}) };
    for (const id of warningIds) acks[id] = { by: actor.id, byName: actor.name, at: S.nowIso(), note };
    await S.update(S.SYSTEM, 'initiative', initiativeId, { coverageAcks: acks }, { system: true, skipValidation: true });
    await S.audit(actor, { action: 'acknowledge', type: 'initiative', recordId: initiativeId, initiativeId, summary: `Acknowledged ${warningIds.length} coverage warnings`, reason: note });
    return { acknowledged: warningIds.length };
  });

  S.op('markNotificationsRead', { area: 'workflow', summary: 'Mark notifications as read' }, async (actor, { ids, all }) => {
    const mine = (await S.driver.list('notification')).filter((n) => n.userId === actor.id && !n.read && (all || asArray(ids).includes(n.id)));
    for (const n of mine) await S.driver.put({ ...n, read: true, version: n.version + 1 }, { expectedVersion: n.version });
    return { updated: mine.length };
  });

  // Home and My work (Section 5.4, WFL-002): my tasks, approvals awaiting my decision, my upcoming and
  // unlogged engagements, my alerts and the initiatives I can see, across every initiative.
  S.op('myWork', { area: 'workflow', summary: 'My tasks, approvals, engagements and alerts across initiatives' }, async (actor, { days = 14 } = {}) => {
    const today = await S.today();
    const until = addDays(today, days);
    const initiatives = (await S.driver.list('initiative')).filter((i) => initiativeAccess(actor, i.id));
    const names = Object.fromEntries(initiatives.map((i) => [i.id, i.shortName || i.name]));
    const visible = (r) => !r.initiativeId || names[r.initiativeId];
    const tasks = sortBy((await S.driver.list('task')).filter((t) => t.assigneeId === actor.id && visible(t)), (t) => (['done', 'cancelled'].includes(t.status) ? 1 : 0), (t) => t.dueDate || '9999')
      .map((t) => ({ ...t, initiative: names[t.initiativeId] || '', overdue: !!(t.dueDate && t.dueDate < today && !['done', 'cancelled'].includes(t.status)) }));
    const approvals = (await S.driver.list('approval')).filter(visible).map((a) => ({ ...a, initiative: names[a.initiativeId] || '' }));
    const awaiting = sortBy(approvals.filter((a) => a.status === 'pending' && asArray(a.approvers).some((x) => x.userId === actor.id && !x.decision)), 'requestedAt');
    const requested = sortBy(approvals.filter((a) => a.requestedBy === actor.id), '-requestedAt').slice(0, 30);
    const engagements = [];
    const alerts = [];
    const summaries = [];
    for (const i of initiatives) {
      const m = await S.model(i.id);
      summaries.push(initiativeSummary(m));
      if (i.status === 'closed') continue;
      for (const e of m.engagements) {
        if (!e.open || !e.plannedDate || e.plannedDate > until) continue;
        const mine = asArray(e.internalParticipantIds).includes(actor.id) || e.planItem?.relationshipOwnerId === actor.id || (!e.planItemId && e.createdBy === actor.id);
        if (mine) engagements.push({ id: e.id, code: e.code, initiativeId: i.id, initiative: names[i.id], label: e.label, audience: e.audienceLabel, plannedDate: e.plannedDate, plannedTime: e.plannedTime || '', status: e.status, overdue: e.plannedDate < today });
      }
      for (const a of m.alerts) if (asArray(a.recipients).includes(actor.id)) alerts.push({ ...a, initiativeId: i.id, initiative: names[i.id] });
    }
    const rank = { critical: 0, warning: 1, info: 2 };
    return {
      today, days, tasks, awaiting, requested,
      engagements: sortBy(engagements, 'plannedDate', 'plannedTime'),
      alerts: sortBy(alerts, (a) => rank[a.severity] ?? 3, 'date').slice(0, 100),
      initiatives: sortBy(summaries, (x) => (x.status === 'closed' ? 1 : 0), 'name'),
    };
  });

  // AIA-004: AI-drafted content stays marked as such until a person has reviewed and accepted it.
  const AI_TYPES = ['narrative', 'activity', 'keyMessage', 'engagement'];
  S.op('acceptAiDraft', { area: 'workflow', summary: 'Accept AI-drafted content after review (AIA-004)' }, async (actor, { type, id }) => {
    if (!AI_TYPES.includes(type)) throw new AppError(422, 'This record type has no AI-drafted content.');
    const cur = await S.driver.get(type, id);
    if (!cur || cur.deleted) throw new AppError(404, 'Record not found.');
    S.assertCan(actor, 'U', type, cur, await S.accessCtx(actor, cur.initiativeId));
    if (!cur.aiDrafted) return cur;
    const patch = { aiDrafted: false, ...(type === 'narrative' ? { acceptedBy: actor.id, acceptedAt: S.nowIso() } : {}) };
    const rec = await S.update(actor, type, id, patch, { system: true, skipValidation: true, auditAction: 'aiAccept' });
    await S.audit(actor, { action: 'ai', type, recordId: id, initiativeId: cur.initiativeId, summary: `Accepted AI-drafted content in ${cur.code || entity(type).label} after review` });
    return rec;
  });

  // WFL-003: each person chooses how they are notified; they may also set their own time zone (USE-06).
  S.op('setMyPreferences', { area: 'workflow', summary: 'Change my notification preferences and time zone' }, async (actor, { notify, timeZone } = {}) => {
    if (actor.system || actor.api) throw new AppError(422, 'Preferences belong to a person.');
    const patch = {};
    if (notify) patch.notify = { inApp: true, email: !!notify.email, teams: !!notify.teams, mute: asArray(notify.mute).filter((k) => typeof k === 'string') };
    if (timeZone !== undefined) {
      try { new Intl.DateTimeFormat('en-AU', { timeZone }); } catch { throw new AppError(422, `Unknown time zone ${timeZone}.`); }
      patch.timeZone = timeZone;
    }
    const saved = await S.update(actor, 'user', actor.id, patch, { system: true, auditAction: 'preferences' });
    return { ...S.publicUser(saved), notify: saved.notify || {} };
  });

  S.op('listNotifications', { area: 'workflow', summary: 'List my notifications' }, async (actor) => {
    const mine = (await S.driver.list('notification')).filter((n) => n.userId === actor.id);
    return mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  });

  // WFL-005 / SEC-10: attachments with size limits, an allowed list of types and malware scanning.
  S.op('uploadAttachment', { area: 'workflow', summary: 'Attach a file to a record' }, async (actor, { recordType, recordId, filename, mime, data }) => {
    const config = await S.getConfig();
    const rec = await S.driver.get(recordType, recordId);
    if (!rec) throw new AppError(404, 'Record not found.');
    const initiativeId = rec.initiativeId || null;
    if (initiativeId) S.assertInitiative(actor, await S.initiative(initiativeId));
    S.assertCan(actor, 'R', recordType, rec, await S.accessCtx(actor, initiativeId));
    const bytes = data instanceof Uint8Array ? data : base64ToBytes(String(data || ''));
    const ext = String(filename || '').split('.').pop().toLowerCase();
    const allowed = config.settings.attachments.allowed || [];
    if (!allowed.includes(ext)) throw new AppError(415, `Files of type .${ext} are not allowed. Allowed types: ${allowed.join(', ')}.`);
    const maxBytes = (config.settings.attachments.maxMb || 20) * 1024 * 1024;
    if (bytes.length > maxBytes) throw new AppError(413, `The file is larger than the ${config.settings.attachments.maxMb} MB limit.`);
    const scan = S.env.scanFile ? await S.env.scanFile(bytes, filename) : basicScan(bytes, ext);
    if (scan.infected) {
      await S.audit(actor, { action: 'malwareBlocked', type: recordType, recordId, initiativeId, summary: `Blocked upload of ${filename}: ${scan.detail}` });
      throw new AppError(422, `The file was rejected by malware scanning: ${scan.detail}`);
    }
    const blobId = uid('blob');
    await S.driver.putBlob(blobId, bytes, { filename, mime: mime || 'application/octet-stream', recordType, recordId, initiativeId });
    const att = await S.create(S.SYSTEM, 'attachment', { initiativeId, recordType, recordId, filename, mime: mime || 'application/octet-stream', size: bytes.length, blobId, scan: scan.detail }, { system: true });
    await S.audit(actor, { action: 'upload', type: recordType, recordId, initiativeId, summary: `Attached ${filename} (${Math.round(bytes.length / 1024)} KB)` });
    return att;
  });

  S.op('removeAttachment', { area: 'workflow', summary: 'Remove an attachment' }, async (actor, { id }) => S.remove(actor, 'attachment', id));

  S.op('recordActivity', { area: 'workflow', summary: 'Comments, attachments, tasks and history for a record' }, async (actor, { recordType, recordId }) => {
    const rec = await S.driver.get(recordType, recordId);
    if (!rec) throw new AppError(404, 'Record not found.');
    const initiativeId = rec.initiativeId || (recordType === 'initiative' ? rec.id : null);
    if (initiativeId) S.assertInitiative(actor, await S.initiative(initiativeId));
    S.assertCan(actor, 'R', recordType, rec, await S.accessCtx(actor, initiativeId));
    const scope = initiativeId ? { initiativeId } : {};
    const [comments, attachments, tasks] = await Promise.all(['comment', 'attachment', 'task'].map((t) => S.driver.list(t, scope)));
    const mine = (x) => x.recordType === recordType && x.recordId === recordId;
    const audit = await S.driver.queryAudit({ recordId, limit: 100 });
    return { comments: comments.filter(mine), attachments: attachments.filter(mine), tasks: tasks.filter(mine), history: audit.rows, label: entity(recordType).label };
  });
}

const slimActivity = (a) => ({ id: a.id, code: a.code, title: a.title, plans: a.plans, adkar: a.adkar, groupIds: a.groupIds, ownerId: a.ownerId, startDate: a.startDate, endDate: a.endDate, status: a.status, percentComplete: a.percentComplete });

// Built-in checks used when no external scanner (for example ClamAV) is configured.
export function basicScan(bytes, ext) {
  const head = Array.from(bytes.slice(0, 8));
  const text = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
  if (text.includes('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')) return { infected: true, detail: 'EICAR test signature detected' };
  const isExe = head[0] === 0x4d && head[1] === 0x5a; // MZ
  const isElf = head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46;
  if (isExe || isElf) return { infected: true, detail: 'Executable content is not allowed' };
  const zipLike = head[0] === 0x50 && head[1] === 0x4b;
  if (['docx', 'xlsx', 'pptx', 'vsdx'].includes(ext) && !zipLike) return { infected: true, detail: 'File content does not match its Office file type' };
  if (ext === 'pdf' && !text.startsWith('%PDF')) return { infected: true, detail: 'File content does not match the PDF type' };
  if (['docx', 'xlsx', 'pptx'].includes(ext) && /vbaProject\.bin/.test(new TextDecoder('latin1').decode(bytes))) return { infected: true, detail: 'Macro-enabled content is not allowed' };
  return { infected: false, detail: 'Passed built-in checks (no external scanner configured)' };
}
