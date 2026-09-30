// Command layer: every change to platform state goes through execute(), which checks permissions,
// applies workflow rules and appends a hash-chained audit event (WF-15). The browser store and the
// Node server run exactly this code, so authorisation is enforced in one place.
import { clone, uid, stableStringify, todayISO, addDays, daysBetween, htmlWords, htmlToText, truncate, slug } from './util.js';
import { sha256 } from './sha256.js';
import { PermissionError, userOf, hasRole, hasAnyRole, can, assert, assertCan, isTeam, canSeeBid, activeDelegation, authorityOf } from './permissions.js';
import { STAGES, GATES, gateLabel, stageLabel, roleLabel, LIB_TYPES } from './constants.js';
import {
  workflowOf, stagesOf, gateCoverage, gateState, gatePreconditions, stageBlockers, nextStageId, sectionApproval,
  aiPendingCount, unmappedMandatory, gateEnabled, eligibleApprovers,
} from './workflow.js';
import { backSchedule, defaultSectionDue } from './schedule.js';
import { sanitizeHtml, citationsIn, parseSrc } from './html.js';
import { computePricing } from './pricing.js';
import { checksPass } from './checks.js';
import { latestVersion, approvedVersion } from './library.js';

export class CommandError extends Error {
  constructor(message) { super(message); this.name = 'CommandError'; this.status = 400; }
}
const fail = (msg) => { throw new CommandError(msg); };

export const SYSTEM = { id: 'system', name: 'Platform scheduler', roles: ['admin'], email: 'noreply@ctoconsulting.com.au' };
const LOCK_MINUTES = 10;
const MAX_BID_BYTES = 200 * 1024 * 1024;
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

// ---------- Context ----------

function makeCtx(state, actor, now) {
  const ctx = {
    state, actor, now, today: now.slice(0, 10), label: '', detail: null, bidId: null, touched: new Set(), skipAudit: false,
    bid(id) {
      const b = state.bids.find((x) => x.id === id);
      if (!b) fail('Bid not found.');
      if (actor.id !== 'system' && !canSeeBid(state, actor.id, b)) throw new PermissionError('You do not have access to this bid.');
      ctx.bidId = b.id;
      ctx.touched.add(`bid:${b.id}`);
      return b;
    },
    section(bid, id) {
      const s = bid.sections.find((x) => x.id === id);
      if (!s) fail('Section not found.');
      return s;
    },
    can(cap, c = {}) { return actor.id === 'system' || can(state, actor.id, cap, c); },
    require(cap, c = {}, what) { if (actor.id !== 'system') assertCan(state, actor.id, cap, c, what); },
    notify(userIds, n) { notify(state, now, [...new Set(userIds)].filter((id) => id && id !== actor.id), n); ctx.touched.add('notifications'); },
    user: (id) => userOf(state, id),
    name: (id) => userOf(state, id)?.name || (id === 'system' ? 'Platform' : 'Unknown user'),
  };
  return ctx;
}

// In-app notification plus email outbox, and a Teams card for approvals and mentions (WF-11, WF-12).
function notify(state, now, userIds, n) {
  for (const id of userIds) {
    const u = userOf(state, id);
    if (!u || u.active === false) continue;
    const note = { id: uid('nt'), userId: id, at: now, kind: n.kind || 'info', title: n.title, text: n.text || '', bidId: n.bidId || null, link: n.link || null, read: false, dedupe: n.dedupe || null };
    if (n.dedupe && state.notifications.some((x) => x.userId === id && x.dedupe === n.dedupe)) continue;
    state.notifications.push(note);
    if (u.prefs?.email !== false) state.outbox.push({ id: uid('ob'), at: now, channel: 'email', to: u.email, toName: u.name, userId: id, subject: `[CTO Proposals] ${n.title}`, text: n.text || '', bidId: n.bidId || null, link: n.link || null });
    if (state.settings.teamsEnabled && (n.teams || ['approval', 'mention', 'escalation'].includes(n.kind))) {
      state.outbox.push({ id: uid('ob'), at: now, channel: 'teams', to: u.email, toName: u.name, userId: id, subject: n.title, text: n.text || '', bidId: n.bidId || null, link: n.link || null, card: n.card || null });
    }
  }
  if (state.notifications.length > 3000) state.notifications.splice(0, state.notifications.length - 3000);
  if (state.outbox.length > 2000) state.outbox.splice(0, state.outbox.length - 2000);
}

function entityOf(state, type, id) {
  if (type === 'bid') return state.bids.find((b) => b.id === id);
  if (type === 'library') return state.library.find((i) => i.id === id);
  if (type === 'consultant') return state.consultants.find((c) => c.id === id);
  if (type === 'user') return state.users.find((u) => u.id === id);
  if (type === 'rateCard') return state.rateCards.find((c) => c.id === id);
  if (type === 'workflow') return state.workflows.find((w) => w.id === id);
  if (type === 'template') return state.templates.find((t) => t.id === id);
  if (type === 'recipe') return state.recipes.find((r) => r.id === id);
  if (type === 'client') return state.clients.find((c) => c.id === id);
  if (type === 'settings') return { settings: state.settings, taxonomy: state.taxonomy };
  return null;
}

const hashOf = (obj) => (obj ? sha256(stableStringify(obj)) : null);

export function appendAudit(state, e) {
  const prev = state.audit[state.audit.length - 1];
  const event = { seq: (prev?.seq || 0) + 1, at: e.at, actor: e.actor, actorName: e.actorName, action: e.action, label: e.label || e.action, objectType: e.objectType || null, objectId: e.objectId || null, bidId: e.bidId || null, detail: e.detail || null, beforeHash: e.beforeHash || null, afterHash: e.afterHash || null, prevHash: prev?.hash || '0'.repeat(64) };
  event.hash = sha256(event.prevHash + stableStringify({ ...event, hash: undefined }));
  state.audit.push(event);
  return event;
}

export function verifyAudit(events) {
  let prevHash = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (prevHash !== null && e.prevHash !== prevHash) return { ok: false, at: e.seq, reason: 'Chain broken: previous hash does not match' };
    const h = sha256(e.prevHash + stableStringify({ ...e, hash: undefined }));
    if (h !== e.hash) return { ok: false, at: e.seq, reason: 'Event content does not match its hash' };
    prevHash = e.hash;
  }
  return { ok: true, count: events.length };
}

export function execute(state, actorId, name, args = {}, opts = {}) {
  const cmd = COMMANDS[name];
  if (!cmd) fail(`Unknown command: ${name}`);
  const now = opts.now || new Date().toISOString();
  const next = clone(state);
  const actor = actorId === 'system' ? SYSTEM : userOf(next, actorId);
  if (!actor) throw new PermissionError('Unknown user. Sign in again.');
  if (actor.active === false) throw new PermissionError('This account is disabled.');
  const ctx = makeCtx(next, actor, now);
  const target = cmd.target ? cmd.target(args) : null;
  const before = target ? hashOf(entityOf(next, target.type, target.id)) : null;
  const result = cmd.run(ctx, args) ?? null;
  if (!cmd.noAudit && !ctx.skipAudit) {
    const tgt = ctx.target || target;
    appendAudit(next, {
      at: now, actor: actor.id, actorName: actor.name, action: name, label: ctx.label || name,
      objectType: tgt?.type, objectId: tgt?.id, bidId: ctx.bidId, detail: ctx.detail,
      beforeHash: ctx.target ? null : before, afterHash: tgt ? hashOf(entityOf(next, tgt.type, tgt.id)) : null,
    });
    ctx.touched.add('audit');
  }
  if (!ctx.skipAudit || cmd.noAudit) next.version = (next.version || 0) + 1;
  next.updatedAt = now;
  return { state: next, result, touched: [...ctx.touched], changed: !ctx.skipAudit || Boolean(cmd.noAudit) };
}

const COMMANDS = {};
const def = (name, spec) => { COMMANDS[name] = spec; };
export const commandNames = () => Object.keys(COMMANDS);

const bidTarget = (a) => ({ type: 'bid', id: a.bidId });
const libTarget = (a) => (a.itemId ? { type: 'library', id: a.itemId } : null);

// ---------- Helpers ----------

function newBidRef(state, now) {
  const y = now.slice(0, 4);
  const n = state.bids.filter((b) => b.ref?.startsWith(`CTO-${y}-`)).map((b) => Number(b.ref.split('-')[2]) || 0);
  return `CTO-${y}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0')}`;
}

export function emptyBid() {
  return {
    documents: [], requirements: [], criteria: [], extraction: null, brief: null, scorecard: null,
    plan: { winThemes: [], published: false, publishedAt: null, milestones: [] },
    sections: [], staffing: [], pricing: { model: 'tm', rateCardId: null, discountPct: 0, contingencyPct: 0, expenses: [], milestones: [], cap: null, retainerMonths: 12, assumptions: [], risks: [], departures: [] },
    clarifications: [], outputs: [], deck: null, snapshots: [], members: [], ethicalWall: { users: [], reason: '' },
    gates: { g1: { status: 'pending', decisions: [], requestId: 'g1' }, g2: { status: 'not_requested', decisions: [] }, g3: { status: 'not_requested', decisions: [] } },
    stageHistory: [], flags: {}, aiEnabled: true, aiDisclosure: false,
  };
}

function setStage(ctx, bid, stage, why) {
  if (bid.stage === stage) return;
  const prev = bid.stage;
  bid.stage = stage;
  bid.stageHistory.push({ stage, at: ctx.now, by: ctx.actor.id, from: prev, why: why || null });
  ctx.notify([bid.bidManagerId, bid.partnerId], { kind: 'stage', title: `${bid.ref} moved to ${stageLabel(stage)}`, text: `${bid.title} is now at the ${stageLabel(stage)} stage.${why ? ` ${why}` : ''}`, bidId: bid.id, link: `/bids/${bid.id}` });
}

function teamUserIds(bid) {
  const ids = new Set([bid.partnerId, bid.bidManagerId, ...(bid.members || []).map((m) => m.userId)]);
  for (const s of bid.sections) { ids.add(s.ownerId); (s.contributors || []).forEach((x) => ids.add(x)); (s.reviewers || []).forEach((x) => ids.add(x)); }
  ids.delete(undefined); ids.delete(null);
  return [...ids].filter((id) => !(bid.ethicalWall?.users || []).includes(id));
}

function snapshot(ctx, bid, label, gateId) {
  const snap = {
    id: uid('snap'), label, gateId: gateId || null, at: ctx.now, by: ctx.actor.id,
    sections: bid.sections.map((s) => ({ id: s.id, title: s.title, v: s.v || 0, status: s.status, hash: sha256(s.content || '') })),
    pricingHash: sha256(stableStringify({ p: bid.pricing, s: bid.staffing })),
    pricing: (() => { const p = computePricing(ctx.state, bid); return { subtotal: p.subtotal, gst: p.gst, total: p.total, model: p.model }; })(),
  };
  bid.snapshots.push(snap);
  return snap;
}

function voidSectionApprovals(ctx, bid, s, reason) {
  const live = (s.approvals || []).filter((a) => !a.void);
  for (const a of live) { a.void = true; a.voidReason = reason; a.voidedAt = ctx.now; }
  if (live.length) ctx.notify(live.map((a) => a.by), { kind: 'approval', title: `Approval voided: ${s.title}`, text: `${ctx.name(ctx.actor.id)} changed “${s.title}” (${bid.ref}) after you approved it, so your approval was voided (${reason}). Please review the new version.`, bidId: bid.id, link: `/bids/${bid.id}/sections/${s.id}` });
  return live.length;
}

// Voids a gate's current request: decisions voided, covered sections unlocked (WF-08).
function reopenGate(ctx, bid, gateId, reason, { keepSections = [] } = {}) {
  const g = bid.gates[gateId];
  if (!g || g.status === 'not_requested') return false;
  const affected = (g.decisions || []).filter((d) => !d.void && d.requestId === g.requestId);
  for (const d of affected) { d.void = true; d.voidReason = reason; d.voidedAt = ctx.now; }
  const wasPassed = g.status === 'passed';
  g.status = 'not_requested';
  g.history = [...(g.history || []), { at: ctx.now, by: ctx.actor.id, event: 'reopened', reason }];
  for (const s of bid.sections) {
    if (s.lockedBy === gateId && !keepSections.includes(s.id)) {
      const other = ['g2', 'g3'].find((x) => x !== gateId && bid.gates[x]?.status !== 'not_requested' && gateCoverage(bid, x).includes(s.id) && bid.gates[x]?.status !== 'rejected');
      if (other) s.lockedBy = other; else { s.status = 'approved'; s.lockedBy = null; }
    }
  }
  if (gateId === 'g2' || gateId === 'g3') bid.pricingLocked = ['g2', 'g3'].some((x) => bid.gates[x]?.status === 'pending' || bid.gates[x]?.status === 'passed') ? bid.pricingLocked : null;
  if (affected.length || wasPassed) ctx.notify(affected.map((d) => d.by), { kind: 'approval', title: `Gate ${gateId.slice(1)} reopened: ${bid.ref}`, text: `Your ${gateLabel(gateId).toLowerCase()} decision on ${bid.title} was voided: ${reason}. The gate will be requested again.`, bidId: bid.id, link: `/bids/${bid.id}/approvals` });
  if (bid.stage === 'produce' || bid.stage === 'submit') {
    if (!bid.submission) setStage(ctx, bid, 'approve', `Gate ${gateId.slice(1)} reopened.`);
  }
  return true;
}

function pricingEditable(ctx, bid, reopen) {
  const locked = ['g2', 'g3'].filter((g) => ['pending', 'passed'].includes(bid.gates[g]?.status));
  if (!locked.length) return;
  if (!reopen) fail(`Pricing is locked by gate ${locked.map((g) => g.slice(1)).join(' and ')}. Reopen the gate to change it; its approvals will be voided.`);
  ctx.require('planSections', { bid }, 'reopen commercial approval');
  for (const g of locked) reopenGate(ctx, bid, g, 'pricing or team changed after approval');
}

function autoAdvance(ctx, bid) {
  // Move forward while the current stage's exit conditions hold (only for automatic transitions).
  let guard = 3;
  while (guard-- > 0 && !['archived', 'closed'].includes(bid.stage)) {
    const auto = { qualify: true, plan: true, approve: true, submit: true, outcome: true }[bid.stage];
    if (!auto || stageBlockers(ctx.state, bid).length) break;
    const next = nextStageId(ctx.state, bid);
    if (!next) break;
    setStage(ctx, bid, next, `${stageLabel(bid.stage)} exit conditions met.`);
  }
}

function mentions(state, text) {
  const out = [];
  for (const m of String(text || '').matchAll(/@([A-Z][\w’'-]+(?:\s[A-Z][\w’'-]+)?)/g)) {
    const name = m[1].toLowerCase();
    const u = state.users.find((x) => x.name.toLowerCase() === name) || state.users.find((x) => x.name.toLowerCase().split(' ')[0] === name.split(' ')[0]);
    if (u) out.push(u.id);
  }
  return [...new Set(out)];
}

function setCitations(section) {
  section.citations = citationsIn(section.content).map((c) => {
    const p = parseSrc(c.src);
    return { src: c.src, label: c.label, kind: p?.kind || c.kind || 'other', refId: p?.id || null, v: p?.v || null };
  }).filter((c, i, arr) => arr.findIndex((x) => x.src === c.src) === i);
}

function libKey(state, type) {
  const prefix = { case_study: 'CS', standard_answer: 'SA', method: 'MT', evidence: 'EV', past_proposal: 'PP', media: 'MD', proposal_template: 'TP', presentation_template: 'PT', rate_card: 'RC', consultant_profile: 'CP' }[type] || 'LI';
  const n = state.library.filter((i) => i.key?.startsWith(`${prefix}-`)).map((i) => Number(i.key.split('-')[1]) || 0);
  return `${prefix}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0')}`;
}

const librarians = (state) => state.users.filter((u) => hasRole(u, 'librarian') && u.active !== false).map((u) => u.id);

// ---------- Bids ----------

def('bid.create', {
  run(ctx, a) {
    ctx.require('createBid');
    const s = ctx.state;
    if (!a.title?.trim()) fail('Enter the opportunity title.');
    let clientId = a.clientId;
    if (!clientId && a.newClient?.name) {
      const c = { id: uid('cl'), name: a.newClient.name.trim(), shortName: a.newClient.shortName || '', abn: a.newClient.abn || '', sector: a.newClient.sector || '', jurisdiction: a.newClient.jurisdiction || '', confidentiality: a.newClient.confidentiality || 'OFFICIAL', aliases: [] };
      s.clients.push(c);
      clientId = c.id;
      ctx.touched.add('clients');
    }
    if (!clientId) fail('Choose or add the client.');
    const wf = s.workflows.find((w) => w.id === a.workflowId) || s.workflows.find((w) => w.default) || s.workflows[0];
    const partnerId = a.partnerId || (hasRole(ctx.actor, 'partner') ? ctx.actor.id : null);
    if (!partnerId || !hasRole(userOf(s, partnerId), 'partner')) fail('Choose the accountable partner.');
    const bidManagerId = a.bidManagerId || (hasRole(ctx.actor, 'bidManager') ? ctx.actor.id : null);
    if (!bidManagerId) fail('Choose the bid manager.');
    const bid = {
      ...emptyBid(), id: uid('bid'), ref: newBidRef(s, ctx.now), title: a.title.trim(), clientId, stage: 'intake', workflowId: wf.id,
      value: Number(a.value) || 0, closing: a.closing?.date ? { date: a.closing.date, time: a.closing.time || '14:00', tz: a.closing.tz || 'Australia/Sydney' } : null,
      partnerId, bidManagerId, channel: a.channel || '', clientRef: a.clientRef || '', offering: a.offering || '', sector: a.sector || s.clients.find((c) => c.id === clientId)?.sector || '',
      confidential: Boolean(a.confidential), source: a.source || 'manual', notes: a.notes || '', createdAt: ctx.now, createdBy: ctx.actor.id,
      aiEnabled: a.aiEnabled ?? s.settings.ai?.defaultOn !== false,
    };
    if (![partnerId, bidManagerId].includes(ctx.actor.id)) bid.members.push({ userId: ctx.actor.id, role: hasRole(ctx.actor, 'admin') ? 'admin' : 'member' });
    bid.stageHistory.push({ stage: 'intake', at: ctx.now, by: ctx.actor.id });
    if (bid.closing) bid.plan.milestones = backSchedule(bid.closing.date, ctx.today);
    s.bids.push(bid);
    ctx.bidId = bid.id;
    ctx.target = { type: 'bid', id: bid.id };
    ctx.touched.add(`bid:${bid.id}`);
    ctx.label = `Created bid ${bid.ref}: ${bid.title}`;
    ctx.notify([partnerId, bidManagerId], { kind: 'assignment', title: `New bid ${bid.ref}: ${bid.title}`, text: `${ctx.name(ctx.actor.id)} registered a new opportunity. You are the ${partnerId === bidManagerId ? 'partner and bid manager' : 'accountable partner or bid manager'}.`, bidId: bid.id, link: `/bids/${bid.id}` });
    return { bidId: bid.id, ref: bid.ref };
  },
});

const BID_FIELDS = ['title', 'value', 'closing', 'channel', 'clientRef', 'offering', 'sector', 'flags', 'aiEnabled', 'aiDisclosure', 'confidential', 'workflowId', 'notes', 'partnerId', 'bidManagerId', 'clientId'];
def('bid.update', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'update the bid');
    const changed = [];
    for (const k of Object.keys(a.patch || {})) {
      if (!BID_FIELDS.includes(k)) fail(`Field ${k} cannot be changed here.`);
      if (k === 'workflowId' && !ctx.state.workflows.some((w) => w.id === a.patch[k])) fail('Unknown workflow template.');
      if (k === 'partnerId' && !hasRole(userOf(ctx.state, a.patch[k]), 'partner')) fail('The accountable partner must hold the Partner role.');
      if (JSON.stringify(bid[k]) !== JSON.stringify(a.patch[k])) { bid[k] = a.patch[k]; changed.push(k); }
    }
    if (changed.includes('value') && bid.value < 0) fail('Value cannot be negative.');
    ctx.label = `Updated bid details (${changed.join(', ') || 'no changes'})`;
    ctx.detail = { changed };
    if (changed.includes('aiEnabled')) ctx.label = bid.aiEnabled ? 'Enabled AI assistance for this bid' : 'Switched off AI for this bid (client prohibits AI)';
  },
});

def('bid.members', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'change the bid team');
    const added = (a.members || []).filter((m) => !(bid.members || []).some((x) => x.userId === m.userId)).map((m) => m.userId);
    bid.members = (a.members || []).filter((m) => userOf(ctx.state, m.userId)).map((m) => ({ userId: m.userId, role: m.role || 'member' }));
    ctx.label = `Updated the bid team (${bid.members.length} members)`;
    ctx.notify(added, { kind: 'assignment', title: `Added to bid ${bid.ref}`, text: `You were added to the team for ${bid.title}.`, bidId: bid.id, link: `/bids/${bid.id}` });
  },
});

def('bid.ethicalWall', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    assert(ctx.actor.id === 'system' || bid.partnerId === ctx.actor.id || hasRole(ctx.actor, 'admin'), 'Only the accountable partner or an administrator can set an ethical wall.');
    const users = [...new Set(a.users || [])].filter((id) => id !== bid.partnerId && id !== ctx.actor.id);
    if (users.includes(bid.bidManagerId)) fail('The bid manager cannot be behind the ethical wall. Change the bid manager first.');
    bid.ethicalWall = { users, reason: a.reason || '', setBy: ctx.actor.id, at: ctx.now };
    bid.members = (bid.members || []).filter((m) => !users.includes(m.userId));
    for (const s of bid.sections) {
      if (users.includes(s.ownerId)) s.ownerId = null;
      s.contributors = (s.contributors || []).filter((x) => !users.includes(x));
      s.reviewers = (s.reviewers || []).filter((x) => !users.includes(x));
    }
    for (const [sid, l] of Object.entries(ctx.state.locks)) if (l.bidId === bid.id && users.includes(l.userId)) delete ctx.state.locks[sid];
    ctx.label = users.length ? `Set an ethical wall excluding ${users.map(ctx.name).join(', ')}` : 'Removed the ethical wall';
    ctx.detail = { reason: a.reason };
  },
});

def('bid.advance', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'move the bid to the next stage');
    const blockers = stageBlockers(ctx.state, bid);
    if (blockers.length) fail(`The ${stageLabel(bid.stage)} stage is not complete: ${blockers.join(' ')}`);
    const next = nextStageId(ctx.state, bid);
    if (!next) fail('This bid has no next stage.');
    const from = bid.stage;
    setStage(ctx, bid, next, a.note);
    ctx.label = `Moved from ${stageLabel(from)} to ${stageLabel(next)}`;
  },
});

def('bid.archive', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    assert(ctx.can('decideBid') || ctx.can('planSections', { bid }), 'You cannot archive this bid.');
    if (!a.reason?.trim()) fail('Give the reason for archiving.');
    bid.archived = { reason: a.reason, at: ctx.now, by: ctx.actor.id, fromStage: bid.stage };
    setStage(ctx, bid, 'archived', a.reason);
    ctx.label = `Archived the bid: ${a.reason}`;
  },
});

// ---------- Client request intake ----------

def('doc.add', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'upload client documents');
    const d = a.doc || {};
    if (!d.name) fail('Document name is required.');
    const text = (d.pages || []).map((p) => p.paras.join('\n')).join('\n');
    if (text.includes(EICAR) || d.scan === 'infected') {
      ctx.label = `Blocked upload of ${d.name}: virus scan detected a threat`;
      fail(`Upload blocked: the virus scan detected a threat in ${d.name}.`);
    }
    const total = bid.documents.reduce((n, x) => n + (x.size || 0), 0) + (d.size || 0);
    if (total > MAX_BID_BYTES) fail('Uploads for a bid are limited to 200 MB (CR-01).');
    const base = d.name.replace(/\.[^.]+$/, '').toLowerCase();
    const prior = bid.documents.filter((x) => x.name.replace(/\.[^.]+$/, '').toLowerCase() === base);
    const doc = {
      id: d.id || uid('doc'), name: d.name, type: d.type || 'request', size: d.size || 0, mime: d.mime || '', fileId: d.fileId || null, hash: d.hash || sha256(text),
      version: prior.length ? Math.max(...prior.map((x) => x.version || 1)) + 1 : 1, uploadedAt: ctx.now, by: ctx.actor.id, scan: 'clean', pages: d.pages || [],
      ocr: Boolean(d.ocr), warnings: d.warnings || [], textLength: text.length,
    };
    if (bid.documents.some((x) => x.hash === doc.hash)) fail(`${d.name} has already been uploaded (identical content).`);
    bid.documents.push(doc);
    ctx.label = `Uploaded ${doc.type} document ${doc.name}${doc.version > 1 ? ` (version ${doc.version})` : ''}`;
    ctx.detail = { docId: doc.id, pages: doc.pages.length, hash: doc.hash };
    return { docId: doc.id };
  },
});

def('doc.remove', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'remove documents');
    const doc = bid.documents.find((d) => d.id === a.docId);
    if (!doc) fail('Document not found.');
    if (bid.requirements.some((r) => r.src?.docId === doc.id && r.confirmed)) fail('Confirmed requirements come from this document. Remove or re-source them first.');
    bid.documents = bid.documents.filter((d) => d.id !== a.docId);
    bid.requirements = bid.requirements.filter((r) => r.src?.docId !== doc.id);
    ctx.label = `Removed document ${doc.name}`;
  },
});

def('extraction.set', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'extract requirements');
    const ext = a.extraction || {};
    const keep = bid.requirements.filter((r) => r.confirmed || r.manual);
    const refs = new Set(keep.map((r) => r.ref));
    const incoming = (a.requirements || []).filter((r) => !refs.has(r.ref)).map((r) => ({ ...r, id: r.id || uid('rq'), confirmed: false, sectionIds: r.sectionIds || [], compliance: r.compliance || '', evidence: r.evidence || '', extracted: { text: r.text, kind: r.kind } }));
    bid.requirements = [...keep, ...incoming];
    if (!bid.criteria.length || a.replaceCriteria) bid.criteria = (ext.criteria || []).map((c) => ({ ...c, id: c.id || uid('cr') }));
    // Re-link requirement criteria IDs to the stored criteria.
    for (const r of bid.requirements) if (r.criterionId && !bid.criteria.some((c) => c.id === r.criterionId)) r.criterionId = null;
    bid.extraction = {
      status: 'draft', mode: ext.mode || 'rules', model: ext.model || null, at: ctx.now, by: ctx.actor.id, docIds: a.docIds || bid.documents.map((d) => d.id),
      fields: ext.fields || {}, closing: ext.closing || null, dates: ext.dates || [], submission: ext.submission || [], pricing: ext.pricing || {}, forms: ext.forms || [],
      confirmed: {}, corrections: bid.extraction?.corrections || [], ms: ext.ms || null,
    };
    if (bid.stage === 'intake' && bid.documents.length) setStage(ctx, bid, 'qualify', 'Request documents attached and extracted.');
    ctx.label = `Extracted ${incoming.length} requirements, ${bid.extraction.dates.length} dates and ${bid.criteria.length} evaluation criteria (${ext.mode === 'claude' ? 'Claude' : 'rules engine'})`;
    ctx.detail = { requirements: incoming.length, mode: ext.mode };
  },
});

def('extraction.confirm', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'confirm extracted items');
    const ex = bid.extraction;
    if (!ex) fail('Nothing has been extracted yet.');
    const { field, value } = a;
    let original;
    if (field.startsWith('date:')) {
      const d = ex.dates.find((x) => x.id === field.slice(5));
      if (!d) fail('Date not found.');
      original = { date: d.date, time: d.time, tz: d.tz, label: d.label };
      if (a.remove) ex.dates = ex.dates.filter((x) => x !== d);
      else Object.assign(d, value, { confirmed: true });
    } else if (field.startsWith('sub:')) {
      const s = ex.submission.find((x) => x.id === field.slice(4));
      if (!s) fail('Instruction not found.');
      original = { label: s.label, value: s.value, number: s.number };
      if (a.remove) ex.submission = ex.submission.filter((x) => x !== s);
      else Object.assign(s, value, { confirmed: true });
    } else {
      original = ex.fields[field]?.value ?? (field === 'closing' ? ex.closing : null);
      if (field === 'closing') ex.closing = { ...(ex.closing || {}), ...value, confirmed: true };
      else ex.fields[field] = { ...(ex.fields[field] || {}), value, confirmed: true };
      if (a.apply !== false) {
        if (field === 'title' && value) bid.title = value;
        if (field === 'reference') bid.clientRef = value;
        if (field === 'channel') bid.channel = value;
        if (field === 'closing' && value?.date) { bid.closing = { date: value.date, time: value.time || '14:00', tz: value.tz || 'Australia/Sydney' }; bid.plan.milestones = backSchedule(bid.closing.date, ctx.today); }
        if (field === 'client' && a.clientId) bid.clientId = a.clientId;
      }
    }
    ex.confirmed[field] = { by: ctx.actor.id, at: ctx.now };
    const corrected = a.remove || stableStringify(original) !== stableStringify(field.includes(':') ? { ...original, ...value } : value);
    if (corrected) ex.corrections.push({ field, from: original, to: a.remove ? null : value, by: ctx.actor.id, at: ctx.now });
    ctx.label = `${a.remove ? 'Removed' : corrected ? 'Corrected' : 'Confirmed'} extracted ${field.split(':')[0]}`;
  },
});

def('extraction.complete', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'confirm the compliance matrix');
    if (!bid.extraction) fail('Nothing has been extracted yet.');
    const unconfirmed = bid.requirements.filter((r) => !r.confirmed && !r.excluded);
    if (unconfirmed.length && !a.confirmAll) fail(`${unconfirmed.length} requirements are not yet confirmed.`);
    for (const r of unconfirmed) { r.confirmed = true; r.confirmedBy = ctx.actor.id; r.confirmedAt = ctx.now; }
    bid.extraction.status = 'confirmed';
    bid.extraction.confirmedAt = ctx.now;
    bid.extraction.confirmedBy = ctx.actor.id;
    const mins = Math.round((new Date(ctx.now) - new Date(bid.extraction.at)) / 60000);
    ctx.label = `Confirmed the compliance matrix (${bid.requirements.length} requirements, ${bid.extraction.corrections.length} corrections)`;
    ctx.detail = { minutesFromExtraction: mins };
  },
});

def('req.upsert', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'edit requirements');
    const r = a.req || {};
    if (!r.text?.trim()) fail('Requirement text is required.');
    const ex = r.id ? bid.requirements.find((x) => x.id === r.id) : null;
    if (!ex && bid.requirements.some((x) => x.ref === r.ref)) fail(`Reference ${r.ref} is already used.`);
    if (ex) {
      const before = { text: ex.text, kind: ex.kind, ref: ex.ref };
      Object.assign(ex, { ref: r.ref ?? ex.ref, text: r.text.trim(), kind: r.kind || ex.kind, category: r.category ?? ex.category, criterionId: r.criterionId ?? ex.criterionId, src: r.src ?? ex.src });
      if (ex.extracted && (ex.extracted.text !== ex.text || ex.extracted.kind !== ex.kind)) {
        ex.corrected = true;
        (bid.extraction?.corrections || []).push({ field: `req:${ex.ref}`, from: before, to: { text: ex.text, kind: ex.kind }, by: ctx.actor.id, at: ctx.now });
      }
      ex.confirmed = a.confirm ?? true;
      ctx.label = `Edited requirement ${ex.ref}`;
    } else {
      const n = bid.requirements.filter((x) => /^R-\d+$/.test(x.ref)).length + 1;
      bid.requirements.push({ id: uid('rq'), ref: r.ref || `R-${String(n).padStart(3, '0')}`, text: r.text.trim(), kind: r.kind || 'mandatory', category: r.category || 'Service', criterionId: r.criterionId || null, src: r.src || null, confirmed: true, manual: true, compliance: '', sectionIds: [], evidence: '' });
      ctx.label = `Added requirement ${bid.requirements[bid.requirements.length - 1].ref}`;
    }
  },
});

def('req.confirm', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'confirm requirements');
    let n = 0;
    for (const r of bid.requirements) if ((a.ids || []).includes(r.id)) { r.confirmed = a.confirmed !== false; r.confirmedBy = ctx.actor.id; r.confirmedAt = ctx.now; n++; }
    ctx.label = `${a.confirmed === false ? 'Unconfirmed' : 'Confirmed'} ${n} requirement${n === 1 ? '' : 's'}`;
  },
});

def('req.delete', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'remove requirements');
    const r = bid.requirements.find((x) => x.id === a.reqId);
    if (!r) fail('Requirement not found.');
    if (r.extracted) (bid.extraction?.corrections || []).push({ field: `req:${r.ref}`, from: { text: r.text }, to: null, by: ctx.actor.id, at: ctx.now });
    bid.requirements = bid.requirements.filter((x) => x.id !== a.reqId);
    ctx.label = `Removed requirement ${r.ref}`;
  },
});

def('req.update', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const r = bid.requirements.find((x) => x.id === a.reqId);
    if (!r) fail('Requirement not found.');
    const p = a.patch || {};
    const mappingChange = 'sectionIds' in p || 'ownerId' in p || 'excluded' in p || 'criterionId' in p || 'kind' in p;
    const ownsSection = bid.sections.some((s) => (r.sectionIds || []).includes(s.id) && (s.ownerId === ctx.actor.id || s.contributors?.includes(ctx.actor.id)));
    if (mappingChange) ctx.require('planSections', { bid }, 'map requirements');
    else assert(ctx.can('planSections', { bid }) || ownsSection, 'Only the bid manager or the owner of a mapped section can update compliance.');
    for (const k of ['sectionIds', 'compliance', 'evidence', 'ownerId', 'excluded', 'criterionId', 'kind', 'note']) if (k in p) r[k] = p[k];
    if ('sectionIds' in p) r.sectionIds = [...new Set(p.sectionIds)].filter((id) => bid.sections.some((s) => s.id === id));
    ctx.label = `Updated requirement ${r.ref} (${Object.keys(p).join(', ')})`;
  },
});

def('req.bulkMap', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'map requirements');
    let n = 0;
    for (const [reqId, sectionIds] of Object.entries(a.map || {})) {
      const r = bid.requirements.find((x) => x.id === reqId);
      if (!r) continue;
      r.sectionIds = [...new Set(sectionIds)].filter((id) => bid.sections.some((s) => s.id === id));
      n++;
    }
    ctx.label = `Mapped ${n} requirements to response sections`;
  },
});

def('criteria.set', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'edit evaluation criteria');
    bid.criteria = (a.criteria || []).filter((c) => c.name?.trim()).map((c) => ({ id: c.id || uid('cr'), name: c.name.trim(), weight: c.weight === '' || c.weight == null ? null : Number(c.weight), src: c.src || null }));
    for (const r of bid.requirements) if (r.criterionId && !bid.criteria.some((c) => c.id === r.criterionId)) r.criterionId = null;
    ctx.label = `Updated evaluation criteria (${bid.criteria.length})`;
  },
});

def('addendum.apply', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'apply an addendum');
    const doc = bid.documents.find((d) => d.id === a.docId);
    if (!doc) fail('Upload the addendum first.');
    const affectedSections = new Set();
    const summary = [];
    for (const c of a.changes || []) {
      if (c.accept === false) continue;
      if (c.kind === 'changed') {
        const r = bid.requirements.find((x) => x.ref === c.ref);
        if (!r) continue;
        r.history = [...(r.history || []), { text: r.text, kind: r.kind, at: ctx.now, docId: doc.id }];
        r.text = c.after.text;
        r.kind = c.after.kind || r.kind;
        r.changedBy = doc.id;
        r.confirmed = false;
        r.src = c.after.src || r.src;
        (r.sectionIds || []).forEach((id) => affectedSections.add(id));
        summary.push(`${r.ref} changed`);
      } else if (c.kind === 'added') {
        const ref = bid.requirements.some((x) => x.ref === c.ref) ? `${c.ref}-A` : c.ref;
        bid.requirements.push({ id: uid('rq'), ref, text: c.after.text, kind: c.after.kind || 'mandatory', category: c.after.category || 'Service', criterionId: null, src: c.after.src || { docId: doc.id, page: 1, para: 1 }, confirmed: false, compliance: '', sectionIds: [], evidence: '', addedBy: doc.id });
        summary.push(`${ref} added`);
      } else if (c.kind === 'removed') {
        const r = bid.requirements.find((x) => x.ref === c.ref);
        if (!r) continue;
        r.excluded = true;
        r.withdrawnBy = doc.id;
        (r.sectionIds || []).forEach((id) => affectedSections.add(id));
        summary.push(`${r.ref} withdrawn`);
      }
    }
    for (const d of a.dateChanges || []) {
      if (d.accept === false) continue;
      const ex = bid.extraction?.dates.find((x) => x.label === d.label);
      if (ex) { ex.history = [...(ex.history || []), { date: ex.date, time: ex.time, docId: doc.id }]; Object.assign(ex, { date: d.after.date, time: d.after.time || ex.time, tz: d.after.tz || ex.tz, src: d.after.src, changedBy: doc.id }); } else bid.extraction?.dates.push({ ...d.after, id: uid('dt'), changedBy: doc.id });
      if (/closing/i.test(d.label)) {
        bid.closing = { date: d.after.date, time: d.after.time || bid.closing?.time || '14:00', tz: d.after.tz || bid.closing?.tz || 'Australia/Sydney' };
        summary.push(`closing moved to ${d.after.date}`);
      } else summary.push(`${d.label} changed`);
    }
    for (const s of a.submission || []) {
      if (s.accept === false || !bid.extraction) continue;
      const ex = bid.extraction.submission.find((x) => x.label === s.label);
      if (ex) { ex.history = [...(ex.history || []), { value: ex.value, number: ex.number }]; Object.assign(ex, { value: s.value, number: s.number, src: s.src, changedBy: doc.id }); } else bid.extraction.submission.push({ ...s, id: uid('si'), changedBy: doc.id });
      summary.push(`${s.label} changed`);
    }
    doc.appliedAt = ctx.now;
    const owners = bid.sections.filter((s) => affectedSections.has(s.id)).map((s) => s.ownerId);
    ctx.notify([...owners, bid.bidManagerId, bid.partnerId], { kind: 'addendum', title: `Addendum applied to ${bid.ref}`, text: `${doc.name}: ${summary.join('; ')}. ${affectedSections.size ? `Affected sections: ${bid.sections.filter((s) => affectedSections.has(s.id)).map((s) => s.title).join(', ')}.` : ''}`, bidId: bid.id, link: `/bids/${bid.id}/requirements` });
    ctx.label = `Applied addendum ${doc.name}: ${summary.join('; ') || 'no changes'}`;
    return { affected: [...affectedSections] };
  },
});

def('brief.set', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    assert(ctx.can('planSections', { bid }) || ctx.can('decideBid'), 'You cannot edit the opportunity brief.');
    bid.brief = { ...a.brief, updatedAt: ctx.now, updatedBy: ctx.actor.id };
    if (a.winThemes) bid.plan.winThemes = a.brief.winThemes || bid.plan.winThemes;
    ctx.label = 'Updated the opportunity brief';
  },
});

def('scorecard.set', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    assert(ctx.can('planSections', { bid }) || ctx.can('decideBid'), 'You cannot edit the bid/no-bid scorecard.');
    bid.scorecard = { ...a.scorecard, updatedAt: ctx.now, updatedBy: ctx.actor.id };
    ctx.label = `Updated the bid/no-bid scorecard (${a.scorecard?.average ?? '—'} average)`;
  },
});

// ---------- Gates ----------

def('gate.request', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'request gate approval');
    const gateId = a.gateId;
    if (!['g2', 'g3'].includes(gateId)) fail('Gate 1 is decided directly by a partner.');
    if (!['review', 'approve'].includes(bid.stage) && !(bid.stage === 'author' && !stagesOf(ctx.state, bid).some((s) => s.id === 'review'))) fail(`Gates 2 and 3 are requested at the Approve stage. This bid is at ${stageLabel(bid.stage)}.`);
    const g = bid.gates[gateId];
    if (['pending', 'passed'].includes(g.status)) fail(`Gate ${gateId.slice(1)} is already ${g.status}.`);
    const pre = gatePreconditions(ctx.state, bid, gateId);
    if (pre.length) fail(pre.join(' '));
    if (bid.stage !== 'approve' && !stageBlockers(ctx.state, bid).length) setStage(ctx, bid, 'approve', `Gate ${gateId.slice(1)} requested.`);
    const snap = snapshot(ctx, bid, `Gate ${gateId.slice(1)} request: ${gateLabel(gateId)}`, gateId);
    g.status = 'pending';
    g.requestId = snap.id;
    g.requestedAt = ctx.now;
    g.requestedBy = ctx.actor.id;
    g.snapshotId = snap.id;
    for (const s of bid.sections) if (gateCoverage(bid, gateId).includes(s.id)) { s.status = 'locked'; s.lockedBy = gateId; }
    bid.pricingLocked = gateId;
    const approvers = eligibleApprovers(ctx.state, bid, gateId).map((x) => x.userId);
    const p = computePricing(ctx.state, bid);
    ctx.notify(approvers, {
      kind: 'approval', teams: true, title: `Approval needed: gate ${gateId.slice(1)} for ${bid.ref}`, text: `${ctx.name(ctx.actor.id)} requested ${gateLabel(gateId).toLowerCase()} for ${bid.title}. The content is locked at snapshot ${snap.id.slice(-6)}.`, bidId: bid.id, link: `/bids/${bid.id}/approvals`,
      card: { gateId, bidId: bid.id, requestId: snap.id, facts: [['Bid', `${bid.ref} ${bid.title}`], ['Gate', gateLabel(gateId)], ['Price (ex GST)', `$${Math.round(p.subtotal).toLocaleString('en-AU')}`], ['Closes', bid.closing?.date || '—']] },
    });
    ctx.label = `Requested gate ${gateId.slice(1)} (${gateLabel(gateId)}); locked snapshot of ${gateCoverage(bid, gateId).length} sections`;
    return { snapshotId: snap.id };
  },
});

def('gate.withdraw', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'withdraw a gate request');
    if (bid.gates[a.gateId]?.status !== 'pending') fail('Only a pending gate request can be withdrawn.');
    reopenGate(ctx, bid, a.gateId, a.reason || 'request withdrawn by the bid manager');
    ctx.label = `Withdrew the gate ${a.gateId.slice(1)} request`;
  },
});

def('gate.reopen', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'reopen a gate');
    if (!a.reason?.trim()) fail('Give the reason for reopening the gate.');
    if (bid.submission) fail('The bid has been submitted; its approvals can no longer be reopened.');
    if (!reopenGate(ctx, bid, a.gateId, a.reason)) fail('This gate has not been requested.');
    if (a.gateId === 'g2' && ['pending', 'passed'].includes(bid.gates.g3.status)) reopenGate(ctx, bid, 'g3', 'gate 2 reopened');
    ctx.label = `Reopened gate ${a.gateId.slice(1)}: ${a.reason}`;
  },
});

def('gate.decide', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const { gateId, decision } = a;
    if (!['approve', 'approve_conditions', 'reject'].includes(decision)) fail('Choose approve, approve with conditions or reject.');
    if (decision === 'approve_conditions' && !a.conditions?.trim()) fail('State the conditions of approval.');
    if (decision === 'reject' && !a.comment?.trim() && !a.reason?.trim()) fail('Give the reason for rejecting.');
    const g = bid.gates[gateId];
    if (!g) fail('Unknown gate.');

    if (gateId === 'g1') {
      ctx.require('decideBid', {}, 'record the bid/no-bid decision');
      if (bid.stage !== 'qualify') fail(`The bid/no-bid decision is made at the Qualify stage. This bid is at ${stageLabel(bid.stage)}.`);
      const snap = snapshot(ctx, bid, 'Gate 1: bid/no-bid', 'g1');
      g.decisions.push({ id: uid('dc'), requestId: g.requestId || 'g1', by: ctx.actor.id, role: 'partner', decision, conditions: a.conditions || '', comment: a.comment || a.reason || '', at: ctx.now, snapshotId: snap.id, scorecard: bid.scorecard ? { average: bid.scorecard.average, recommendation: bid.scorecard.recommendation } : null });
      if (decision === 'reject') {
        g.status = 'rejected';
        bid.archived = { reason: a.reason || a.comment, at: ctx.now, by: ctx.actor.id, fromStage: 'qualify', noBid: true };
        setStage(ctx, bid, 'archived', `No-bid: ${a.reason || a.comment}`);
        ctx.label = `Gate 1: no-bid (${a.reason || a.comment})`;
      } else {
        g.status = 'passed';
        g.passedAt = ctx.now;
        const next = nextStageId(ctx.state, bid);
        setStage(ctx, bid, next, 'Gate 1 passed: decision to bid.');
        ctx.label = `Gate 1: decision to bid${decision === 'approve_conditions' ? ` with conditions (${a.conditions})` : ''}`;
        ctx.notify(teamUserIds(bid), { kind: 'gate', title: `${bid.ref}: we are bidding`, text: `${ctx.name(ctx.actor.id)} approved the bid for ${bid.title}.${a.conditions ? ` Conditions: ${a.conditions}` : ''}`, bidId: bid.id, link: `/bids/${bid.id}` });
      }
      return { status: g.status };
    }

    if (g.status !== 'pending') fail(`Gate ${gateId.slice(1)} is not awaiting a decision (status: ${g.status.replace('_', ' ')}).`);
    // Who is deciding: the actor, or the actor as delegate for an absent approver (WF-14).
    let deciderId = ctx.actor.id;
    let onBehalfOf = null;
    if (a.onBehalfOf) {
      const principal = userOf(ctx.state, a.onBehalfOf);
      const d = activeDelegation(principal, ctx.now);
      if (!d || d.toUserId !== ctx.actor.id) fail(`${principal?.name || 'That approver'} has not delegated approvals to you.`);
      if (authorityOf(ctx.actor) < authorityOf(principal)) fail('A delegate must have equal or higher approval authority.');
      onBehalfOf = principal.id;
      deciderId = principal.id;
    }
    const decider = userOf(ctx.state, deciderId);
    if (ctx.actor.id !== 'system' && !can(ctx.state, deciderId, 'approveGate', { bid }) && !(onBehalfOf && isTeam(bid, onBehalfOf))) throw new PermissionError('You are not an approver on this bid’s team.');
    const st = gateState(ctx.state, bid, gateId);
    const role = st.reqs.find((r) => hasRole(decider, r.role) && !r.met)?.role || st.reqs.find((r) => hasRole(decider, r.role))?.role;
    if (!role) throw new PermissionError(`Gate ${gateId.slice(1)} needs ${st.reqs.map((r) => `${r.count} × ${roleLabel(r.role)}`).join(' and ')}. You do not hold a required role.`);
    if (st.decisions.some((d) => (d.onBehalfOf || d.by) === deciderId)) fail('You have already decided this gate request.');
    const covered = bid.sections.filter((s) => gateCoverage(bid, gateId).includes(s.id));
    if (decision !== 'reject') {
      const ai = covered.filter((s) => aiPendingCount(s.content));
      if (ai.length) fail(`Unreviewed AI text remains in ${ai.map((s) => s.title).join(', ')}. It must be accepted or edited before approval (WD-03).`);
      if (gateId === 'g3') {
        const um = unmappedMandatory(bid);
        if (um.length) fail(`Mandatory requirements ${um.map((r) => r.ref).join(', ')} are not mapped to response content. Gate 3 cannot pass.`);
      }
    }
    g.decisions.push({ id: uid('dc'), requestId: g.requestId, by: ctx.actor.id, onBehalfOf, role, decision, conditions: a.conditions || '', comment: a.comment || '', at: ctx.now, snapshotId: g.snapshotId, sectionIds: a.sectionIds || [] });
    if (decision === 'reject') {
      g.status = 'rejected';
      const named = new Set(a.sectionIds || []);
      for (const s of covered) {
        if (named.has(s.id)) { s.status = 'drafting'; s.lockedBy = null; voidSectionApprovals(ctx, bid, s, `rejected at gate ${gateId.slice(1)}`); } else if (s.lockedBy === gateId) { s.status = 'approved'; s.lockedBy = null; }
      }
      bid.pricingLocked = null;
      ctx.notify([bid.bidManagerId, bid.partnerId, ...covered.filter((s) => named.has(s.id)).map((s) => s.ownerId)], { kind: 'gate', title: `Gate ${gateId.slice(1)} rejected: ${bid.ref}`, text: `${ctx.name(ctx.actor.id)} rejected ${gateLabel(gateId).toLowerCase()}: ${a.comment}.${named.size ? ` Sections returned to drafting: ${covered.filter((s) => named.has(s.id)).map((s) => s.title).join(', ')}.` : ''}`, bidId: bid.id, link: `/bids/${bid.id}/approvals` });
      ctx.label = `Gate ${gateId.slice(1)} rejected by ${ctx.name(ctx.actor.id)}${onBehalfOf ? ` for ${ctx.name(onBehalfOf)}` : ''}`;
    } else {
      const after = gateState(ctx.state, bid, gateId);
      if (after.allMet) {
        g.status = 'passed';
        g.passedAt = ctx.now;
        const snap = bid.snapshots.find((x) => x.id === g.snapshotId);
        if (snap) snap.passedAt = ctx.now;
        ctx.notify([bid.bidManagerId, bid.partnerId], { kind: 'gate', title: `Gate ${gateId.slice(1)} passed: ${bid.ref}`, text: `${gateLabel(gateId)} is complete for ${bid.title}.`, bidId: bid.id, link: `/bids/${bid.id}/approvals` });
        autoAdvance(ctx, bid);
      }
      ctx.label = `Gate ${gateId.slice(1)}: ${decision === 'approve' ? 'approved' : 'approved with conditions'} by ${ctx.name(ctx.actor.id)}${onBehalfOf ? ` for ${ctx.name(onBehalfOf)}` : ''} as ${roleLabel(role)}${g.status === 'passed' ? ' — gate passed' : ''}`;
    }
    ctx.detail = { gateId, decision, role, snapshotId: g.snapshotId };
    return { status: g.status };
  },
});

// ---------- Planning ----------

def('plan.update', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'edit the plan');
    if (a.winThemes) bid.plan.winThemes = a.winThemes.map((t) => t.trim()).filter(Boolean);
    if (a.milestones) bid.plan.milestones = a.milestones.map((m) => ({ ...m, id: m.id || uid('ms') }));
    if ('notes' in a) bid.plan.notes = a.notes;
    ctx.label = 'Updated the response plan';
  },
});

def('plan.reschedule', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'back-schedule milestones');
    if (!bid.closing?.date) fail('Set the closing date first.');
    const start = bid.stageHistory[0]?.at?.slice(0, 10) || ctx.today;
    const done = new Map((bid.plan.milestones || []).map((m) => [m.key, m.done]));
    bid.plan.milestones = backSchedule(bid.closing.date, a.fromToday ? ctx.today : start).map((m) => ({ ...m, done: done.get(m.key) || false }));
    if (a.sectionDues) { const due = defaultSectionDue(bid); for (const s of bid.sections) if (!s.due || a.overwrite) s.due = due; }
    ctx.label = `Back-scheduled ${bid.plan.milestones.length} milestones from the ${bid.closing.date} deadline`;
  },
});

function newSection(bid, s, order) {
  return {
    id: uid('sec'), key: s.key || slug(s.title), title: s.title, order, parentId: s.parentId || null, brief: s.brief || '', wordLimit: s.wordLimit ? Number(s.wordLimit) : null, pageLimit: s.pageLimit ? Number(s.pageLimit) : null,
    ownerId: s.ownerId || null, contributors: s.contributors || [], reviewers: s.reviewers || [], due: s.due || defaultSectionDue(bid), status: 'not_started', commercial: Boolean(s.commercial),
    content: '', v: 0, versions: [], comments: [], approvals: [], scores: [], citations: [], aiHistory: [], lockedBy: null, updatedAt: null, lastEditedBy: null, clientForm: s.clientForm || null,
  };
}

def('outline.apply', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'build the outline');
    const list = a.sections || [];
    if (!list.length) fail('The outline is empty.');
    if (a.mode === 'replace') {
      if (bid.sections.some((s) => s.content)) fail('Sections already have content. Add to the outline instead of replacing it.');
      bid.sections = [];
    }
    const base = bid.sections.length;
    const created = list.map((s, i) => newSection(bid, s, base + i + 1));
    bid.sections.push(...created);
    // Auto-map requirements when the outline came with suggested mappings.
    for (const s of list) {
      const sec = created[list.indexOf(s)];
      for (const reqId of s.reqIds || []) {
        const r = bid.requirements.find((x) => x.id === reqId);
        if (r && !(r.sectionIds || []).includes(sec.id)) r.sectionIds = [...(r.sectionIds || []), sec.id];
      }
    }
    ctx.label = `${a.mode === 'replace' ? 'Built' : 'Extended'} the response outline (${created.length} sections, ${a.source || 'template'})`;
    return { ids: created.map((s) => s.id) };
  },
});

def('section.add', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'add sections');
    if (!a.section?.title?.trim()) fail('Section title is required.');
    const s = newSection(bid, a.section, bid.sections.length + 1);
    bid.sections.push(s);
    if (s.ownerId && bid.plan.published) ctx.notify([s.ownerId], { kind: 'assignment', title: `Section assigned: ${s.title}`, text: `You own “${s.title}” for ${bid.ref} ${bid.title}. Due ${s.due || 'TBC'}.`, bidId: bid.id, link: `/bids/${bid.id}/sections/${s.id}` });
    ctx.label = `Added section “${s.title}”`;
    return { sectionId: s.id };
  },
});

const SECTION_FIELDS = ['title', 'brief', 'wordLimit', 'pageLimit', 'ownerId', 'contributors', 'reviewers', 'due', 'parentId', 'commercial', 'key'];
def('section.update', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const s = ctx.section(bid, a.sectionId);
    ctx.require('planSections', { bid }, 'change section assignments');
    const prevOwner = s.ownerId;
    const prevReviewers = [...(s.reviewers || [])];
    for (const k of Object.keys(a.patch || {})) {
      if (!SECTION_FIELDS.includes(k)) fail(`Field ${k} cannot be changed here.`);
      s[k] = k === 'wordLimit' || k === 'pageLimit' ? (a.patch[k] ? Number(a.patch[k]) : null) : a.patch[k];
    }
    const walled = bid.ethicalWall?.users || [];
    if ([s.ownerId, ...(s.contributors || []), ...(s.reviewers || [])].some((id) => walled.includes(id))) fail('That person is behind the ethical wall for this bid.');
    if (bid.plan.published) {
      if (s.ownerId && s.ownerId !== prevOwner) ctx.notify([s.ownerId], { kind: 'assignment', title: `Section assigned: ${s.title}`, text: `You now own “${s.title}” for ${bid.ref}. Due ${s.due || 'TBC'}.`, bidId: bid.id, link: `/bids/${bid.id}/sections/${s.id}` });
      const newRev = (s.reviewers || []).filter((x) => !prevReviewers.includes(x));
      ctx.notify(newRev, { kind: 'assignment', title: `Review assigned: ${s.title}`, text: `You are a reviewer for “${s.title}” (${bid.ref}).`, bidId: bid.id, link: `/bids/${bid.id}/sections/${s.id}` });
    }
    ctx.label = `Updated section “${s.title}” (${Object.keys(a.patch || {}).join(', ')})`;
  },
});

def('section.delete', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const s = ctx.section(bid, a.sectionId);
    ctx.require('planSections', { bid }, 'delete sections');
    if (s.content && !a.force) fail('This section has content. Confirm deletion to remove it.');
    if (['approved', 'locked'].includes(s.status)) fail('Approved or locked sections cannot be deleted.');
    bid.sections = bid.sections.filter((x) => x.id !== s.id).map((x) => (x.parentId === s.id ? { ...x, parentId: null } : x));
    for (const r of bid.requirements) r.sectionIds = (r.sectionIds || []).filter((id) => id !== s.id);
    ctx.label = `Deleted section “${s.title}”`;
  },
});

def('section.reorder', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'reorder sections');
    const order = a.ids || [];
    bid.sections.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
    bid.sections.forEach((s, i) => { s.order = i + 1; });
    ctx.label = 'Reordered the outline';
  },
});

def('plan.publish', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'publish the plan');
    if (!bid.sections.length) fail('Build the outline first.');
    const missing = bid.sections.filter((s) => !s.ownerId || !s.due);
    if (missing.length) fail(`Every section needs an owner and a due date: ${missing.map((s) => s.title).join(', ')}.`);
    bid.plan.published = true;
    bid.plan.publishedAt = ctx.now;
    bid.plan.publishedBy = ctx.actor.id;
    const byOwner = new Map();
    for (const s of bid.sections) byOwner.set(s.ownerId, [...(byOwner.get(s.ownerId) || []), s]);
    for (const [owner, list] of byOwner) ctx.notify([owner], { kind: 'assignment', title: `${bid.ref}: ${list.length} section${list.length === 1 ? '' : 's'} assigned to you`, text: `${list.map((s) => `“${s.title}” due ${s.due}`).join('; ')}. Closing ${bid.closing?.date || 'TBC'}.`, bidId: bid.id, link: '/work' });
    const reviewers = [...new Set(bid.sections.flatMap((s) => s.reviewers || []))];
    ctx.notify(reviewers, { kind: 'assignment', title: `${bid.ref}: you are a reviewer`, text: `You will review sections of ${bid.title}.`, bidId: bid.id, link: '/work' });
    if (bid.stage === 'plan') autoAdvance(ctx, bid);
    ctx.label = `Published the plan to ${byOwner.size} section owner${byOwner.size === 1 ? '' : 's'}`;
  },
});

// ---------- Authoring ----------

function lockHolder(state, sectionId, now) {
  const l = state.locks[sectionId];
  if (!l) return null;
  if ((new Date(now) - new Date(l.at)) / 60000 > LOCK_MINUTES) return null;
  return l;
}

def('section.claim', {
  noAudit: true,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const s = ctx.section(bid, a.sectionId);
    ctx.require('editSection', { bid, section: s }, 'edit this section');
    const l = lockHolder(ctx.state, s.id, ctx.now);
    if (l && l.userId !== ctx.actor.id) fail(`${ctx.name(l.userId)} is editing this section. It is read-only until they finish (section-level locking).`);
    ctx.state.locks[s.id] = { userId: ctx.actor.id, at: ctx.now, bidId: bid.id, since: l?.since || ctx.now };
    ctx.touched.add('locks');
  },
});

def('section.release', {
  noAudit: true,
  run(ctx, a) {
    const l = ctx.state.locks[a.sectionId];
    if (l && l.userId === ctx.actor.id) delete ctx.state.locks[a.sectionId];
    ctx.touched.add('locks');
  },
});

def('section.breakLock', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const s = ctx.section(bid, a.sectionId);
    ctx.require('planSections', { bid }, 'release another user’s editing lock');
    const l = ctx.state.locks[s.id];
    if (!l) fail('The section is not locked.');
    delete ctx.state.locks[s.id];
    ctx.touched.add('locks');
    ctx.notify([l.userId], { kind: 'info', title: `Editing lock released: ${s.title}`, text: `${ctx.name(ctx.actor.id)} released your editing lock on “${s.title}”. Unsaved changes may need to be re-entered.`, bidId: bid.id, link: `/bids/${bid.id}/sections/${s.id}` });
    ctx.label = `Released ${ctx.name(l.userId)}’s editing lock on “${s.title}”`;
  },
});

def('section.save', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const s = ctx.section(bid, a.sectionId);
    ctx.require('editSection', { bid, section: s }, 'edit this section');
    if (s.status === 'locked') fail(`“${s.title}” is locked by gate ${s.lockedBy?.slice(1) || ''}. Ask the bid manager to reopen it; the gate approval will be voided.`);
    const l = lockHolder(ctx.state, s.id, ctx.now);
    if (l && l.userId !== ctx.actor.id) fail(`${ctx.name(l.userId)} is editing this section. Your changes were not saved.`);
    if (bid.stage === 'archived' || bid.stage === 'closed' || bid.submission) fail('This bid is closed to edits.');
    const html = sanitizeHtml(a.html || '');
    if (html === s.content && !a.label) { ctx.skipAudit = true; return { unchanged: true, v: s.v }; }
    const prevStatus = s.status;
    let voided = 0;
    if (s.status === 'approved') {
      voided = voidSectionApprovals(ctx, bid, s, 'edited after approval');
      s.status = 'drafting';
    }
    if (s.status === 'not_started') s.status = 'drafting';
    s.content = html;
    s.updatedAt = ctx.now;
    s.lastEditedBy = ctx.actor.id;
    setCitations(s);
    const last = s.versions[s.versions.length - 1];
    const recent = last && last.by === ctx.actor.id && (new Date(ctx.now) - new Date(last.at)) / 60000 < 10;
    const approvedLast = last && (s.approvals || []).some((x) => x.v === last.v);
    const canCoalesce = a.coalesce && recent && !last.label && !approvedLast && !a.ai && !last.ai && !voided;
    if (canCoalesce) {
      Object.assign(last, { html, at: ctx.now, words: htmlWords(html), hash: sha256(html) });
    } else {
      s.v = (s.v || 0) + 1;
      s.versions.push({ v: s.v, html, by: ctx.actor.id, at: ctx.now, label: a.label || null, words: htmlWords(html), hash: sha256(html), ai: a.ai ? { action: a.ai.action, engine: a.ai.engine } : null });
      if (s.versions.length > 60) s.versions.splice(1, s.versions.length - 60);
    }
    if (a.ai) {
      s.aiHistory = [...(s.aiHistory || []), { at: ctx.now, by: ctx.actor.id, action: a.ai.action, engine: a.ai.engine, model: a.ai.model || null, promptVersion: a.ai.promptVersion || null, v: s.v, text: truncate(htmlToText(a.ai.generatedHtml || html), 6000), sources: (a.ai.sources || []).map((x) => x.src) }].slice(-20);
    }
    ctx.label = a.ai ? `AI ${a.ai.action} for “${s.title}” (${a.ai.engine === 'claude' ? a.ai.model || 'Claude' : 'offline engine'}) — pending human review` : `Edited “${s.title}” (v${s.v}${voided ? ', approval voided' : ''})`;
    ctx.detail = { sectionId: s.id, v: s.v, words: htmlWords(html), prevStatus, voided, aiPending: aiPendingCount(html) };
    return { v: s.v, status: s.status, voided };
  },
});

def('section.restore', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const s = ctx.section(bid, a.sectionId);
    const ver = s.versions.find((x) => x.v === Number(a.v));
    if (!ver) fail('Version not found.');
    const res = COMMANDS['section.save'].run(ctx, { bidId: a.bidId, sectionId: a.sectionId, html: ver.html, label: `Restored from v${ver.v}` });
    ctx.label = `Restored “${s.title}” to v${ver.v} (as v${res.v})`;
    return res;
  },
});

def('section.submit', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const s = ctx.section(bid, a.sectionId);
    ctx.require('editSection', { bid, section: s }, 'mark this section ready for review');
    if (!['drafting', 'not_started'].includes(s.status)) fail(`“${s.title}” is ${s.status.replace('_', ' ')}.`);
    if (!s.content || htmlWords(s.content) < 5) fail('Write the section before marking it ready for review.');
    s.status = 'in_review';
    s.submittedAt = ctx.now;
    if (s.versions.length) s.versions[s.versions.length - 1].label = s.versions[s.versions.length - 1].label || 'Ready for review';
    delete ctx.state.locks[s.id];
    ctx.touched.add('locks');
    const to = s.reviewers?.length ? s.reviewers : [bid.bidManagerId];
    ctx.notify(to, { kind: 'review', title: `Ready for review: ${s.title}`, text: `${ctx.name(ctx.actor.id)} marked “${s.title}” (${bid.ref}) ready for review.${aiPendingCount(s.content) ? ' It contains AI text awaiting human review.' : ''}`, bidId: bid.id, link: `/bids/${bid.id}/sections/${s.id}` });
    ctx.label = `Marked “${s.title}” ready for review (v${s.v})`;
  },
});

def('section.requestChanges', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const s = ctx.section(bid, a.sectionId);
    assert(ctx.can('approveGate', { bid }) || ctx.can('planSections', { bid }), 'Only reviewers and approvers can request changes.');
    if (!['in_review', 'approved'].includes(s.status)) fail('Changes can be requested on sections in review or approved.');
    if (!a.comment?.trim()) fail('Describe the changes needed.');
    voidSectionApprovals(ctx, bid, s, 'changes requested');
    s.status = 'drafting';
    s.comments.push({ id: uid('cm'), quote: '', text: a.comment, by: ctx.actor.id, at: ctx.now, status: 'open', replies: [], kind: 'change-request', v: s.v });
    ctx.notify([s.ownerId, ...(s.contributors || [])], { kind: 'review', title: `Changes requested: ${s.title}`, text: `${ctx.name(ctx.actor.id)}: ${a.comment}`, bidId: bid.id, link: `/bids/${bid.id}/sections/${s.id}` });
    ctx.label = `Requested changes to “${s.title}”`;
  },
});

def('section.approve', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const s = ctx.section(bid, a.sectionId);
    ctx.require('approveGate', { bid }, 'approve sections');
    if (s.status !== 'in_review') fail(`Only sections in review can be approved. “${s.title}” is ${s.status.replace('_', ' ')}.`);
    if (s.ownerId === ctx.actor.id) fail('You cannot approve a section you own.');
    if (s.reviewers?.length && !s.reviewers.includes(ctx.actor.id) && !hasRole(ctx.actor, 'partner')) fail('Only the section’s assigned reviewers (or a partner) can approve it.');
    if (aiPendingCount(s.content)) fail('This section still contains AI text that no person has accepted or edited (WD-03).');
    if ((s.approvals || []).some((x) => !x.void && x.v === s.v && x.by === ctx.actor.id)) fail('You have already approved this version.');
    s.approvals.push({ id: uid('ap'), by: ctx.actor.id, v: s.v, at: ctx.now, comment: a.comment || '', decision: a.conditions ? 'approve_conditions' : 'approve', conditions: a.conditions || '' });
    const st = sectionApproval(bid, s);
    if (st.complete) {
      s.status = 'approved';
      s.approvedAt = ctx.now;
      const ver = s.versions.find((x) => x.v === s.v);
      if (ver) ver.label = ver.label && ver.label !== 'Ready for review' ? ver.label : 'Approved';
      ctx.notify([s.ownerId, bid.bidManagerId], { kind: 'review', title: `Approved: ${s.title}`, text: `“${s.title}” (${bid.ref}) v${s.v} is approved.`, bidId: bid.id, link: `/bids/${bid.id}/sections/${s.id}` });
    }
    ctx.label = `Approved “${s.title}” v${s.v}${st.complete ? ' — section approved' : ` (${st.outstanding.length} reviewer approval${st.outstanding.length === 1 ? '' : 's'} outstanding)`}`;
    return { complete: st.complete };
  },
});

def('section.reopen', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const s = ctx.section(bid, a.sectionId);
    ctx.require('planSections', { bid }, 'reopen sections');
    if (!a.reason?.trim()) fail('Give the reason for reopening.');
    if (bid.submission) fail('The bid has been submitted.');
    for (const g of ['g3', 'g2']) if (['pending', 'passed'].includes(bid.gates[g]?.status) && gateCoverage(bid, g).includes(s.id)) reopenGate(ctx, bid, g, `“${s.title}” reopened: ${a.reason}`, { keepSections: [s.id] });
    voidSectionApprovals(ctx, bid, s, `reopened: ${a.reason}`);
    s.status = 'drafting';
    s.lockedBy = null;
    ctx.notify([s.ownerId], { kind: 'review', title: `Reopened: ${s.title}`, text: `${ctx.name(ctx.actor.id)} reopened “${s.title}”: ${a.reason}`, bidId: bid.id, link: `/bids/${bid.id}/sections/${s.id}` });
    ctx.label = `Reopened “${s.title}”: ${a.reason}`;
  },
});

def('comment.add', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const s = ctx.section(bid, a.sectionId);
    ctx.require('comment', { bid }, 'comment');
    if (!a.text?.trim() && !a.suggestion) fail('Write a comment.');
    if (a.suggestion && !a.quote) fail('Select the text you want to change.');
    const m = mentions(ctx.state, a.text);
    const c = { id: uid('cm'), quote: a.quote || '', text: a.text || '', by: ctx.actor.id, at: ctx.now, status: 'open', replies: [], mentions: m, v: s.v, suggestion: a.suggestion ? { replacement: a.suggestion.replacement ?? '' } : null };
    s.comments.push(c);
    const visible = m.filter((id) => canSeeBid(ctx.state, id, bid));
    ctx.notify(visible, { kind: 'mention', title: `${ctx.name(ctx.actor.id)} mentioned you in ${s.title}`, text: a.text, bidId: bid.id, link: `/bids/${bid.id}/sections/${s.id}` });
    ctx.notify([s.ownerId].filter((x) => !visible.includes(x)), { kind: 'comment', title: `New ${c.suggestion ? 'suggestion' : 'comment'} on ${s.title}`, text: `${ctx.name(ctx.actor.id)}: ${a.text || `Replace “${truncate(a.quote, 60)}” with “${truncate(a.suggestion?.replacement, 60)}”`}`, bidId: bid.id, link: `/bids/${bid.id}/sections/${s.id}` });
    ctx.label = `${c.suggestion ? 'Suggested an edit' : 'Commented'} on “${s.title}”`;
    return { commentId: c.id };
  },
});

def('comment.reply', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const s = ctx.section(bid, a.sectionId);
    ctx.require('comment', { bid }, 'reply');
    const c = s.comments.find((x) => x.id === a.commentId);
    if (!c) fail('Comment not found.');
    if (!a.text?.trim()) fail('Write a reply.');
    const m = mentions(ctx.state, a.text);
    c.replies.push({ id: uid('rp'), text: a.text, by: ctx.actor.id, at: ctx.now, mentions: m });
    ctx.notify([c.by, ...m.filter((id) => canSeeBid(ctx.state, id, bid))], { kind: m.length ? 'mention' : 'comment', title: `Reply on ${s.title}`, text: `${ctx.name(ctx.actor.id)}: ${a.text}`, bidId: bid.id, link: `/bids/${bid.id}/sections/${s.id}` });
    ctx.label = `Replied to a comment on “${s.title}”`;
  },
});

def('comment.resolve', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const s = ctx.section(bid, a.sectionId);
    const c = s.comments.find((x) => x.id === a.commentId);
    if (!c) fail('Comment not found.');
    const editor = ctx.can('editSection', { bid, section: s });
    if (['accepted'].includes(a.status)) assert(editor, 'Only the section’s editors can accept suggestions.');
    else assert(editor || c.by === ctx.actor.id || ctx.can('planSections', { bid }), 'Only the comment author or the section’s editors can resolve this.');
    c.status = a.status || 'resolved';
    c.resolvedBy = ctx.actor.id;
    c.resolvedAt = ctx.now;
    if (c.by !== ctx.actor.id && c.suggestion) ctx.notify([c.by], { kind: 'comment', title: `Suggestion ${c.status}: ${s.title}`, text: `${ctx.name(ctx.actor.id)} ${c.status} your suggestion.`, bidId: bid.id, link: `/bids/${bid.id}/sections/${s.id}` });
    ctx.label = `${c.suggestion ? `Suggestion ${c.status}` : `Comment ${c.status}`} on “${s.title}”`;
  },
});

def('review.score', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    const s = ctx.section(bid, a.sectionId);
    assert(ctx.can('approveGate', { bid }) || ctx.can('comment', { bid }), 'You cannot score this bid.');
    const round = a.round || 'solution';
    s.scores = (s.scores || []).filter((x) => !(x.by === ctx.actor.id && x.round === round));
    const scores = Object.fromEntries(Object.entries(a.scores || {}).filter(([k, v]) => bid.criteria.some((c) => c.id === k) && v !== '' && v != null).map(([k, v]) => [k, Math.max(0, Math.min(10, Number(v)))]));
    s.scores.push({ id: uid('sc'), by: ctx.actor.id, round, scores, comment: a.comment || '', at: ctx.now, v: s.v });
    ctx.label = `Scored “${s.title}” (${round} review)`;
  },
});

// ---------- Team and pricing ----------

def('staffing.set', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'build the team');
    pricingEditable(ctx, bid, a.reopen);
    const prev = new Map((bid.staffing || []).map((l) => [l.id, l]));
    bid.staffing = (a.staffing || []).map((l) => {
      const old = prev.get(l.id);
      const changedPerson = !old || old.consultantId !== l.consultantId;
      return {
        id: l.id || uid('st'), consultantId: l.consultantId || null, role: l.role || '', level: l.level || 'Consultant', days: Number(l.days) || 0,
        rateOverride: l.rateOverride ? Number(l.rateOverride) : null, include: l.include !== false, keyPerson: Boolean(l.keyPerson),
        availability: l.consultantId ? (changedPerson ? 'pending' : old.availability) : null, availabilityNote: changedPerson ? '' : old?.availabilityNote || '', cvFormat: l.cvFormat || old?.cvFormat || null,
      };
    });
    for (const l of bid.staffing) {
      const was = prev.get(l.id);
      if (l.consultantId && (!was || was.consultantId !== l.consultantId)) {
        const c = ctx.state.consultants.find((x) => x.id === l.consultantId);
        if (c?.userId) ctx.notify([c.userId], { kind: 'availability', title: `Please confirm availability: ${bid.ref}`, text: `You are proposed as ${l.role || l.level} (${l.days} days) for ${bid.title}. Confirm your availability in My work.`, bidId: bid.id, link: '/work' });
      }
    }
    ctx.label = `Updated the proposed team (${bid.staffing.length} lines, ${bid.staffing.reduce((n, l) => n + l.days, 0)} days)`;
  },
});

def('staffing.respond', {
  run(ctx, a) {
    const bid = ctx.state.bids.find((b) => b.id === a.bidId);
    if (!bid) fail('Bid not found.');
    ctx.bidId = bid.id;
    ctx.touched.add(`bid:${bid.id}`);
    ctx.target = { type: 'bid', id: bid.id };
    const l = (bid.staffing || []).find((x) => x.id === a.lineId);
    if (!l) fail('Team line not found.');
    const c = ctx.state.consultants.find((x) => x.id === l.consultantId);
    assert(c && c.userId === ctx.actor.id, 'Only the proposed consultant can confirm their availability.');
    if (!['confirmed', 'declined'].includes(a.response)) fail('Respond confirmed or declined.');
    l.availability = a.response;
    l.availabilityNote = a.note || '';
    l.availabilityAt = ctx.now;
    ctx.notify([bid.bidManagerId], { kind: 'availability', title: `${c.name} ${a.response} availability for ${bid.ref}`, text: a.note || '', bidId: bid.id, link: `/bids/${bid.id}/pricing` });
    ctx.label = `${c.name} ${a.response} availability`;
  },
});

const PRICING_FIELDS = ['model', 'rateCardId', 'discountPct', 'contingencyPct', 'expenses', 'milestones', 'cap', 'retainerMonths', 'assumptions', 'risks', 'departures', 'notes'];
def('pricing.update', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    assert(ctx.can('planSections', { bid }) || (ctx.can('seeCost', { bid }) && hasAnyRole(ctx.actor, ['commercial', 'partner'])), 'You cannot change pricing on this bid.');
    const registersOnly = Object.keys(a.patch || {}).every((k) => ['assumptions', 'risks', 'departures', 'notes'].includes(k));
    if (!registersOnly) pricingEditable(ctx, bid, a.reopen);
    for (const k of Object.keys(a.patch || {})) {
      if (!PRICING_FIELDS.includes(k)) fail(`Field ${k} cannot be changed here.`);
      bid.pricing[k] = a.patch[k];
    }
    for (const k of ['expenses', 'milestones', 'assumptions', 'risks', 'departures']) if (Array.isArray(bid.pricing[k])) bid.pricing[k] = bid.pricing[k].map((x) => ({ ...x, id: x.id || uid(k.slice(0, 2)) }));
    ctx.label = `Updated pricing (${Object.keys(a.patch || {}).join(', ')})`;
  },
});

// ---------- Clarifications ----------

def('clar.upsert', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('comment', { bid }, 'record clarifications');
    const c = a.clar || {};
    if (!c.question?.trim()) fail('Enter the question.');
    const ex = c.id ? bid.clarifications.find((x) => x.id === c.id) : null;
    const answeredNow = c.answer?.trim() && !ex?.answer;
    if (ex) Object.assign(ex, { question: c.question, askedAt: c.askedAt || ex.askedAt, answer: c.answer || '', answeredAt: c.answer ? c.answeredAt || ex.answeredAt || ctx.today : null, sectionIds: c.sectionIds || [], status: c.answer ? 'answered' : c.askedAt ? 'asked' : 'draft', ref: c.ref || ex.ref });
    else bid.clarifications.push({ id: uid('cq'), ref: c.ref || `Q${bid.clarifications.length + 1}`, question: c.question, askedAt: c.askedAt || null, answer: c.answer || '', answeredAt: c.answer ? c.answeredAt || ctx.today : null, sectionIds: c.sectionIds || [], status: c.answer ? 'answered' : c.askedAt ? 'asked' : 'draft', by: ctx.actor.id, at: ctx.now });
    const rec = ex || bid.clarifications[bid.clarifications.length - 1];
    if (answeredNow) ctx.notify(bid.sections.filter((s) => (rec.sectionIds || []).includes(s.id)).map((s) => s.ownerId), { kind: 'clarification', title: `Clarification answered: ${rec.ref}`, text: `${rec.question} — ${rec.answer}`, bidId: bid.id, link: `/bids/${bid.id}/clarifications` });
    ctx.label = `${ex ? 'Updated' : 'Added'} clarification ${rec.ref}${answeredNow ? ' (answered)' : ''}`;
  },
});

def('clar.delete', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'remove clarifications');
    bid.clarifications = bid.clarifications.filter((x) => x.id !== a.id);
    ctx.label = 'Removed a clarification';
  },
});

// ---------- Outputs, submission and outcome ----------

def('deck.update', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('generateOutputs', { bid }, 'edit the presentation');
    bid.deck = { ...a.deck, updatedAt: ctx.now, updatedBy: ctx.actor.id };
    ctx.label = a.label || 'Updated the presentation storyboard';
  },
});

// Questionnaire returnables answered from standard answers, with a confidence per answer (spec 9.1).
def('returnable.set', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('generateOutputs', { bid }, 'answer questionnaires');
    const doc = bid.documents.find((d) => d.id === a.docId);
    if (!doc) fail('Document not found.');
    const answers = (a.answers || []).map((x) => ({
      id: x.id, ref: x.ref, question: x.question, answer: x.answer || '', itemId: x.itemId || null, key: x.key || null, v: x.v || null,
      confidence: typeof x.confidence === 'number' ? Math.round(x.confidence * 100) / 100 : null, status: x.status === 'accepted' ? 'accepted' : 'draft', src: x.src || null,
    }));
    bid.returnables = { ...(bid.returnables || {}), [doc.id]: { docId: doc.id, name: doc.name, answers, at: ctx.now, by: ctx.actor.id } };
    const accepted = answers.filter((x) => x.status === 'accepted').length;
    ctx.label = `Saved ${answers.length} questionnaire answer${answers.length === 1 ? '' : 's'} for ${doc.name} (${accepted} accepted)`;
  },
});

def('output.add', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('generateOutputs', { bid }, 'generate outputs');
    const o = a.output || {};
    if (!o.kind || !o.name) fail('Output kind and name are required.');
    const snapId = bid.gates.g3?.status === 'passed' ? bid.gates.g3.snapshotId : bid.snapshots[bid.snapshots.length - 1]?.id || null;
    const out = {
      id: uid('out'), kind: o.kind, name: o.name, fileId: o.fileId || null, size: o.size || 0, templateId: o.templateId || null, templateName: o.templateName || null, templateVersion: o.templateVersion || null,
      snapshotId: o.snapshotId || snapId, contentVersions: o.contentVersions || bid.sections.map((s) => ({ sectionId: s.id, v: s.v })), libraryVersions: o.libraryVersions || [],
      aiModel: o.aiModel || null, checks: o.checks || null, pages: o.pages ?? null, pagesEstimated: o.pagesEstimated ?? null, final: false, at: ctx.now, by: ctx.actor.id, manual: Boolean(o.manual), sourceOutputId: o.sourceOutputId || null, note: o.note || '',
    };
    bid.outputs.push(out);
    if (bid.stage === 'approve' && !stageBlockers(ctx.state, bid).length) setStage(ctx, bid, 'produce', 'Outputs generated.');
    const fails = (o.checks || []).filter((c) => c.status === 'fail').length;
    ctx.label = `${o.manual ? 'Uploaded final edit' : 'Generated'} ${o.name}${o.checks ? ` (${fails ? `${fails} check${fails === 1 ? '' : 's'} failed` : 'all checks passed'})` : ''}`;
    ctx.detail = { outputId: out.id, template: o.templateName, templateVersion: o.templateVersion, aiModel: o.aiModel, snapshotId: out.snapshotId };
    return { outputId: out.id };
  },
});

def('output.checks', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('generateOutputs', { bid }, 'run checks');
    const o = bid.outputs.find((x) => x.id === a.outputId);
    if (!o) fail('Output not found.');
    if (o.final) fail('Final outputs cannot be changed.');
    o.checks = a.checks;
    if (a.pages != null) { o.pages = a.pages; o.pagesEstimated = false; }
    if (a.pdfFileId) o.pdfFileId = a.pdfFileId;
    ctx.label = `Re-ran checks on ${o.name}`;
  },
});

def('output.markFinal', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('generateOutputs', { bid }, 'mark outputs final');
    const o = bid.outputs.find((x) => x.id === a.outputId);
    if (!o) fail('Output not found.');
    if (a.final === false) {
      if (o.submitted) fail('Submitted outputs are immutable.');
      o.final = false;
      ctx.label = `Unmarked ${o.name} as final`;
      return;
    }
    const gates = ['g2', 'g3'].filter((g) => gateEnabled(ctx.state, bid, g) && bid.gates[g]?.status !== 'passed');
    if (gates.length) fail(`Outputs cannot be marked final until gate ${gates.map((g) => g.slice(1)).join(' and ')} ${gates.length > 1 ? 'have' : 'has'} passed (WF-08).`);
    if (o.checks && !checksPass(o.checks)) fail('Resolve the failed checks before marking this output final (WD-07).');
    if (['docx', 'pptx'].includes(o.kind) && !o.checks) fail('Run the automated checks first.');
    const snap = bid.snapshots.find((x) => x.id === bid.gates.g3.snapshotId);
    const stale = snap && o.contentVersions?.some((cv) => { const ss = snap.sections.find((x) => x.id === cv.sectionId); return ss && ss.v !== cv.v; });
    if (stale && !o.manual) fail('This output was generated from content that differs from the approved snapshot. Generate it again.');
    o.final = true;
    o.finalAt = ctx.now;
    o.finalBy = ctx.actor.id;
    ctx.label = `Marked ${o.name} as final`;
  },
});

def('output.remove', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('generateOutputs', { bid }, 'remove outputs');
    const o = bid.outputs.find((x) => x.id === a.outputId);
    if (!o) fail('Output not found.');
    if (o.final || o.submitted) fail('Final or submitted outputs cannot be removed.');
    bid.outputs = bid.outputs.filter((x) => x.id !== a.outputId);
    ctx.label = `Removed ${o.name}`;
  },
});

def('bid.submit', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('recordSubmission', { bid }, 'record the submission');
    if (bid.submission) fail('The submission has already been recorded.');
    if (!['produce', 'submit'].includes(bid.stage)) fail(`Record the submission at the Produce or Submit stage. This bid is at ${stageLabel(bid.stage)}.`);
    const gates = ['g2', 'g3'].filter((g) => gateEnabled(ctx.state, bid, g) && bid.gates[g]?.status !== 'passed');
    if (gates.length) fail(`Submission is blocked until gate ${gates.map((g) => g.slice(1)).join(' and ')} pass (WF-08).`);
    const files = bid.outputs.filter((o) => (a.outputIds || []).includes(o.id));
    if (!files.length) fail('Select the final files that were submitted.');
    const notFinal = files.filter((o) => !o.final);
    if (notFinal.length) fail(`Only final outputs can be submitted: ${notFinal.map((o) => o.name).join(', ')}.`);
    if (!a.at) fail('Enter the date and time of submission.');
    const snap = snapshot(ctx, bid, 'Submitted: read-only snapshot', 'submission');
    for (const o of files) o.submitted = true;
    bid.submission = { at: a.at, method: a.method || bid.channel || '', receipt: a.receipt || '', notes: a.notes || '', outputIds: files.map((o) => o.id), by: ctx.actor.id, recordedAt: ctx.now, snapshotId: snap.id };
    let late = false;
    if (bid.closing?.date) {
      const closeAt = `${bid.closing.date}T${bid.closing.time || '23:59'}`;
      late = a.at.slice(0, 16) > closeAt;
    }
    if (bid.stage === 'produce') setStage(ctx, bid, 'submit', 'Submission recorded.');
    autoAdvance(ctx, bid);
    ctx.notify(teamUserIds(bid), { kind: 'stage', title: `${bid.ref} submitted`, text: `${bid.title} was submitted via ${bid.submission.method || 'the client channel'}${a.receipt ? ` (receipt ${a.receipt})` : ''}.${late ? ' Warning: the recorded time is after the closing time.' : ''}`, bidId: bid.id, link: `/bids/${bid.id}/submission` });
    ctx.label = `Recorded submission${a.receipt ? ` (receipt ${a.receipt})` : ''}; read-only snapshot kept`;
    ctx.detail = { files: files.map((o) => o.name), late };
  },
});

def('bid.outcome', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('recordSubmission', { bid }, 'record the outcome');
    if (!bid.submission && a.result !== 'withdrawn') fail('Record the submission first.');
    if (!['won', 'lost', 'withdrawn', 'cancelled'].includes(a.result)) fail('Choose won, lost, withdrawn or cancelled.');
    if (a.result === 'lost' && !(a.reasons || []).length) fail('Record at least one loss reason.');
    bid.outcome = { result: a.result, at: a.at || ctx.today, reasons: a.reasons || [], debrief: a.debrief || '', feedback: a.feedback || '', awardedValue: Number(a.awardedValue) || null, recordedBy: ctx.actor.id, recordedAt: ctx.now, orals: a.orals || '' };
    if (bid.stage !== 'outcome' && bid.stage !== 'closed') setStage(ctx, bid, 'outcome');
    setStage(ctx, bid, 'closed', `Outcome: ${a.result}.`);
    ctx.notify(teamUserIds(bid), { kind: 'stage', title: `${bid.ref} ${a.result}`, text: `${bid.title}: ${a.result}${a.reasons?.length ? ` (${a.reasons.join(', ')})` : ''}.`, bidId: bid.id, link: `/bids/${bid.id}/submission` });
    ctx.label = `Recorded outcome: ${a.result}${a.reasons?.length ? ` (${a.reasons.join(', ')})` : ''}`;
  },
});

def('bid.nominate', {
  target: bidTarget,
  run(ctx, a) {
    const bid = ctx.bid(a.bidId);
    ctx.require('planSections', { bid }, 'nominate sections for the library');
    const secs = bid.sections.filter((s) => (a.sectionIds || []).includes(s.id));
    if (!secs.length) fail('Choose sections to nominate.');
    const client = ctx.state.clients.find((c) => c.id === bid.clientId);
    const created = [];
    for (const s of secs) {
      const item = {
        id: uid('lib'), key: libKey(ctx.state, a.type || 'standard_answer'), type: a.type || 'standard_answer', title: s.title, ownerId: ctx.actor.id, createdAt: ctx.now, createdBy: ctx.actor.id,
        tags: { sectors: bid.sector ? [bid.sector] : [], offerings: bid.offering ? [bid.offering] : [], technologies: [], capabilities: [], regions: [] },
        clientId: bid.clientId, confidential: true, consent: 'pending', reviewDate: addDays(ctx.today, 365), expiry: null, retired: false, approvedV: null,
        nominatedFrom: { bidId: bid.id, sectionId: s.id, ref: bid.ref, outcome: bid.outcome?.result || null },
        versions: [{ v: 1, status: 'in_review', title: s.title, body: s.content.replace(/<cite\b[^>]*>[\s\S]*?<\/cite>/g, ''), topic: s.title, variants: [], by: ctx.actor.id, at: ctx.now, note: `Nominated from ${bid.ref} (${client?.name || ''}) after ${bid.outcome?.result || 'submission'}` }],
      };
      ctx.state.library.push(item);
      created.push(item);
      s.nominated = item.id;
    }
    ctx.touched.add('library');
    ctx.notify(librarians(ctx.state), { kind: 'library', title: `${created.length} section${created.length === 1 ? '' : 's'} nominated for the library`, text: `From ${bid.ref} ${bid.title}: ${created.map((i) => i.title).join(', ')}. Review, anonymise and approve.`, link: '/library?status=in_review' });
    ctx.label = `Nominated ${created.length} section${created.length === 1 ? '' : 's'} for the library`;
    return { itemIds: created.map((i) => i.id) };
  },
});

// ---------- Content library ----------

const LIB_META = ['tags', 'reviewDate', 'expiry', 'ownerId', 'confidential', 'clientId', 'consent', 'fileId', 'fileName'];
const VERSION_FIELDS = ['title', 'body', 'fields', 'anonymised', 'variants', 'topic', 'fileId', 'fileName', 'issuer', 'offering', 'phases', 'deliverables', 'usageRights', 'alt'];

def('lib.create', {
  run(ctx, a) {
    ctx.require('addLibrary');
    const i = a.item || {};
    if (!LIB_TYPES.some((t) => t.id === i.type)) fail('Choose a content type.');
    if (!i.title?.trim()) fail('Enter a title.');
    const version = { v: 1, status: a.submit ? 'in_review' : 'draft', by: ctx.actor.id, at: ctx.now, note: a.note || 'Created' };
    for (const k of VERSION_FIELDS) if (k in i) version[k] = i[k];
    version.title = i.title.trim();
    const item = {
      id: uid('lib'), key: libKey(ctx.state, i.type), type: i.type, title: i.title.trim(), ownerId: i.ownerId || ctx.actor.id, createdAt: ctx.now, createdBy: ctx.actor.id,
      tags: i.tags || { sectors: [], offerings: [], technologies: [], capabilities: [], regions: [] }, clientId: i.clientId || null, confidential: Boolean(i.confidential), consent: i.consent || null,
      reviewDate: i.reviewDate || addDays(ctx.today, 365), expiry: i.expiry || null, retired: false, approvedV: null, versions: [version], source: i.source || 'manual',
    };
    ctx.state.library.push(item);
    ctx.touched.add('library');
    ctx.target = { type: 'library', id: item.id };
    if (a.submit) ctx.notify(librarians(ctx.state), { kind: 'library', title: `Library item for review: ${item.title}`, text: `${ctx.name(ctx.actor.id)} submitted ${item.key} for approval.`, link: `/library/${item.id}` });
    ctx.label = `Added ${item.key} “${item.title}” to the library (${version.status.replace('_', ' ')})`;
    return { itemId: item.id, key: item.key };
  },
});

def('lib.import', {
  run(ctx, a) {
    ctx.require('addLibrary');
    const ids = [];
    for (const i of a.items || []) {
      const r = COMMANDS['lib.create'].run(ctx, { item: { ...i, source: a.source || 'bulk import' }, note: `Imported from ${a.source || 'bulk upload'}` });
      ids.push(r.itemId);
    }
    ctx.target = null;
    ctx.label = `Imported ${ids.length} item${ids.length === 1 ? '' : 's'} into the library from ${a.source || 'a bulk upload'}`;
    return { itemIds: ids };
  },
});

function libItem(ctx, id) {
  const item = ctx.state.library.find((x) => x.id === id);
  if (!item) fail('Library item not found.');
  ctx.touched.add('library');
  return item;
}

def('lib.update', {
  target: libTarget,
  run(ctx, a) {
    const item = libItem(ctx, a.itemId);
    const owner = item.ownerId === ctx.actor.id || item.createdBy === ctx.actor.id;
    assert(owner || ctx.can('approveLibrary') || ctx.can('configure'), 'Only the item owner or a librarian can edit this item.');
    if (item.retired) fail('Retired items cannot be edited. Restore it first.');
    for (const k of LIB_META) if (a.meta && k in a.meta) item[k] = a.meta[k];
    if (a.version) {
      let latest = latestVersion(item);
      if (['approved', 'superseded', 'rejected'].includes(latest.status)) {
        latest = { ...clone(latest), v: latest.v + 1, status: 'draft', by: ctx.actor.id, at: ctx.now, note: a.note || 'New version', approvedBy: null, approvedAt: null };
        item.versions.push(latest);
      } else {
        latest.status = 'draft';
        latest.at = ctx.now;
        latest.by = ctx.actor.id;
        if (a.note) latest.note = a.note;
      }
      for (const k of VERSION_FIELDS) if (k in a.version) latest[k] = a.version[k];
      if (a.version.title) item.title = item.approvedV ? item.title : a.version.title;
      ctx.label = `Edited ${item.key} (draft v${latest.v})`;
    } else ctx.label = `Updated ${item.key} details`;
    if (a.submit) COMMANDS['lib.submit'].run(ctx, { itemId: item.id });
  },
});

def('lib.submit', {
  target: libTarget,
  run(ctx, a) {
    const item = libItem(ctx, a.itemId);
    const latest = latestVersion(item);
    if (latest.status !== 'draft') fail('Only a draft version can be submitted for review.');
    latest.status = 'in_review';
    latest.submittedAt = ctx.now;
    ctx.notify(librarians(ctx.state), { kind: 'library', title: `Library item for review: ${item.title}`, text: `${ctx.name(ctx.actor.id)} submitted ${item.key} v${latest.v} for approval.`, link: `/library/${item.id}` });
    ctx.label = `Submitted ${item.key} v${latest.v} for librarian review`;
  },
});

def('lib.approve', {
  target: libTarget,
  run(ctx, a) {
    ctx.require('approveLibrary');
    const item = libItem(ctx, a.itemId);
    const ver = item.versions.find((x) => x.v === (a.v || latestVersion(item).v));
    if (!ver || !['in_review', 'draft'].includes(ver.status)) fail('This version is not awaiting approval.');
    if (item.type === 'case_study' && item.confidential && item.consent !== 'yes' && !(ver.anonymised?.title || ver.fields?.anonymisedName)) fail('A confidential case study needs an anonymised name before approval (CL-08).');
    for (const x of item.versions) if (x.status === 'approved') x.status = 'superseded';
    ver.status = 'approved';
    ver.approvedBy = ctx.actor.id;
    ver.approvedAt = ctx.now;
    const prevV = item.approvedV;
    item.approvedV = ver.v;
    item.title = ver.title || item.title;
    item.lastReviewed = ctx.today;
    if (a.reviewDate) item.reviewDate = a.reviewDate;
    ctx.notify([item.ownerId], { kind: 'library', title: `Approved: ${item.key} ${item.title}`, text: `v${ver.v} is approved and available to bids and the AI.`, link: `/library/${item.id}` });
    if (prevV) {
      // CL-06: tell authors of active bids that used an older version.
      const owners = new Set();
      for (const b of ctx.state.bids) {
        if (['closed', 'archived'].includes(b.stage) || b.submission) continue;
        for (const s of b.sections) if ((s.citations || []).some((c) => c.kind === 'library' && c.refId === item.id && c.v && c.v < ver.v)) owners.add(`${s.ownerId}|${b.id}|${s.id}`);
      }
      for (const o of owners) {
        const [uidv, bidId, sid] = o.split('|');
        ctx.notify([uidv], { kind: 'library', title: `Newer version of ${item.key} available`, text: `${item.title} v${ver.v} is approved. Your section cites an older version.`, bidId, link: `/bids/${bidId}/sections/${sid}` });
      }
    }
    ctx.label = `Approved ${item.key} v${ver.v}`;
  },
});

def('lib.reject', {
  target: libTarget,
  run(ctx, a) {
    ctx.require('approveLibrary');
    const item = libItem(ctx, a.itemId);
    const ver = latestVersion(item);
    if (ver.status !== 'in_review') fail('Only an item in review can be sent back.');
    ver.status = 'draft';
    ver.reviewNote = a.note || '';
    ctx.notify([item.ownerId], { kind: 'library', title: `Changes needed: ${item.key}`, text: a.note || 'The librarian sent this item back to draft.', link: `/library/${item.id}` });
    ctx.label = `Sent ${item.key} back to draft${a.note ? `: ${a.note}` : ''}`;
  },
});

def('lib.retire', {
  target: libTarget,
  run(ctx, a) {
    ctx.require('approveLibrary', {}, 'retire library content');
    const item = libItem(ctx, a.itemId);
    item.retired = !a.restore;
    item.retiredAt = a.restore ? null : ctx.now;
    item.retiredReason = a.restore ? null : a.reason || '';
    ctx.label = `${a.restore ? 'Restored' : 'Retired'} ${item.key}${a.reason ? `: ${a.reason}` : ''}`;
  },
});

// ---------- Consultants, rate cards ----------

def('consultant.update', {
  target: (a) => ({ type: 'consultant', id: a.consultantId }),
  run(ctx, a) {
    const c = ctx.state.consultants.find((x) => x.id === a.consultantId);
    if (!c) fail('Consultant not found.');
    const own = c.userId === ctx.actor.id;
    assert(own || ctx.can('approveLibrary') || ctx.can('configure'), 'You can only edit your own profile.');
    const patch = { ...(a.patch || {}) };
    if ('costRate' in patch && !hasAnyRole(ctx.actor, ['admin', 'commercial', 'partner'])) delete patch.costRate;
    if ('userId' in patch && !hasRole(ctx.actor, 'admin')) delete patch.userId;
    Object.assign(c, patch, { updatedAt: ctx.now, updatedBy: ctx.actor.id });
    ctx.touched.add('consultants');
    ctx.label = own ? 'Updated own consultant profile' : `Updated ${c.name}’s profile`;
  },
});

def('consultant.create', {
  run(ctx, a) {
    assert(ctx.can('approveLibrary') || ctx.can('configure'), 'Only a librarian or administrator can add consultant profiles.');
    const p = a.consultant || {};
    if (!p.name?.trim()) fail('Enter the consultant’s name.');
    const c = { id: uid('con'), name: p.name.trim(), userId: p.userId || null, role: p.role || '', level: p.level || 'Consultant', skills: p.skills || [], certifications: p.certifications || [], clearance: p.clearance || 'None', sectors: p.sectors || [], years: Number(p.years) || 0, availability: p.availability || { status: 'available', pct: 100, from: ctx.today }, rateBand: p.level || 'Consultant', costRate: p.costRate || null, bio: p.bio || '', experience: p.experience || [], education: p.education || '', photo: null, updatedAt: ctx.now };
    ctx.state.consultants.push(c);
    ctx.touched.add('consultants');
    ctx.target = { type: 'consultant', id: c.id };
    ctx.label = `Added consultant profile for ${c.name}`;
    return { consultantId: c.id };
  },
});

def('rateCard.upsert', {
  run(ctx, a) {
    assert(ctx.can('configure') || hasRole(ctx.actor, 'commercial'), 'Only administrators, librarians and commercial approvers maintain rate cards.');
    const c = a.card || {};
    if (!c.name?.trim()) fail('Enter the rate card name.');
    const ex = c.id ? ctx.state.rateCards.find((x) => x.id === c.id) : null;
    const rec = { id: c.id || uid('rc'), name: c.name.trim(), kind: c.kind || 'standard', clientId: c.clientId || null, panel: c.panel || '', currency: 'AUD', gst: 'exclusive', validFrom: c.validFrom || ctx.today, validTo: c.validTo || null, status: c.status || 'approved', rates: (c.rates || []).map((r) => ({ level: r.level, rate: Number(r.rate) || 0 })), updatedAt: ctx.now, updatedBy: ctx.actor.id };
    if (ex) Object.assign(ex, rec); else ctx.state.rateCards.push(rec);
    ctx.touched.add('rateCards');
    ctx.target = { type: 'rateCard', id: rec.id };
    ctx.label = `${ex ? 'Updated' : 'Added'} rate card “${rec.name}”`;
  },
});

// ---------- Administration ----------

def('user.upsert', {
  run(ctx, a) {
    assert(ctx.actor.id === 'system' || hasRole(ctx.actor, 'admin'), 'Only administrators manage users and roles.');
    const u = a.user || {};
    if (!u.name?.trim() || !u.email?.trim()) fail('Name and email are required.');
    if (!(u.roles || []).length) fail('Give the user at least one role.');
    const ex = u.id ? ctx.state.users.find((x) => x.id === u.id) : null;
    if (ex && ex.id === ctx.actor.id && !u.roles.includes('admin')) fail('You cannot remove your own administrator role.');
    const rec = { ...(ex || {}), id: u.id || uid('usr'), name: u.name.trim(), email: u.email.trim().toLowerCase(), title: u.title || '', roles: [...new Set(u.roles)], active: u.active !== false, consultantId: u.consultantId || ex?.consultantId || null, prefs: u.prefs || ex?.prefs || { email: true } };
    if (ex) Object.assign(ex, rec); else ctx.state.users.push(rec);
    ctx.touched.add('users');
    ctx.target = { type: 'user', id: rec.id };
    ctx.label = `${ex ? 'Updated' : 'Added'} user ${rec.name} (${rec.roles.map(roleLabel).join(', ')})`;
  },
});

def('user.delegate', {
  run(ctx, a) {
    const target = userOf(ctx.state, a.userId || ctx.actor.id);
    if (!target) fail('User not found.');
    assert(target.id === ctx.actor.id || hasRole(ctx.actor, 'admin'), 'You can only set your own delegation.');
    if (!a.toUserId) { target.delegation = null; ctx.label = `${target.name} removed their delegation`; ctx.touched.add('users'); ctx.target = { type: 'user', id: target.id }; return; }
    const to = userOf(ctx.state, a.toUserId);
    if (!to || to.id === target.id) fail('Choose someone else to delegate to.');
    if (authorityOf(to) < authorityOf(target)) fail(`${to.name} does not have equal or higher approval authority (WF-14).`);
    if (!a.until) fail('Set the end date of the delegation.');
    target.delegation = { toUserId: to.id, from: a.from || ctx.today, until: a.until, note: a.note || '' };
    ctx.touched.add('users');
    ctx.target = { type: 'user', id: target.id };
    ctx.notify([to.id], { kind: 'approval', title: `${target.name} delegated approvals to you`, text: `From ${target.delegation.from} to ${target.delegation.until}.`, link: '/work' });
    ctx.label = `${target.name} delegated approvals to ${to.name} until ${a.until}`;
  },
});

def('user.prefs', {
  noAudit: true,
  run(ctx, a) {
    const u = userOf(ctx.state, ctx.actor.id);
    if (!u) return;
    u.prefs = { ...(u.prefs || {}), ...(a.prefs || {}) };
    ctx.touched.add('users');
  },
});

def('settings.update', {
  target: () => ({ type: 'settings', id: 'settings' }),
  run(ctx, a) {
    const keys = Object.keys(a.patch || {});
    const librarianKeys = ['styleGuide', 'cvFormats'];
    if (!keys.every((k) => librarianKeys.includes(k))) assert(ctx.actor.id === 'system' || hasRole(ctx.actor, 'admin'), 'Only administrators change platform settings.');
    else ctx.require('configure');
    if ('costRates' in (a.patch || {}) && !hasRole(ctx.actor, 'admin')) fail('Only administrators change cost rates.');
    Object.assign(ctx.state.settings, a.patch);
    ctx.touched.add('settings');
    ctx.label = `Changed settings: ${keys.join(', ')}`;
  },
});

def('taxonomy.set', {
  target: () => ({ type: 'settings', id: 'settings' }),
  run(ctx, a) {
    ctx.require('configure');
    ctx.state.taxonomy = { ...ctx.state.taxonomy, ...a.taxonomy };
    ctx.touched.add('taxonomy');
    ctx.label = 'Updated the library taxonomy';
  },
});

def('workflow.upsert', {
  run(ctx, a) {
    ctx.require('configure');
    const w = a.workflow || {};
    if (!w.name?.trim()) fail('Name the workflow template.');
    const stages = STAGES.map((s) => s.id).filter((id) => (w.stages || []).includes(id));
    for (const req of ['intake', 'produce', 'submit', 'outcome']) if (!stages.includes(req)) fail(`The ${stageLabel(req)} stage is required in every workflow.`);
    const gates = {};
    for (const g of GATES) {
      const src = w.gates?.[g.id] || { enabled: true, approvers: [] };
      gates[g.id] = { enabled: src.enabled !== false, approvers: (src.approvers || []).filter((x) => x.role).map((x) => ({ role: x.role, count: Math.max(1, Number(x.count) || 1) })) };
      if (gates[g.id].enabled && !gates[g.id].approvers.length) fail(`Gate ${g.n} needs at least one approver role.`);
    }
    if (!gates.g3.enabled) fail('Gate 3 (partner sign-off) cannot be disabled.');
    const rec = { id: w.id || uid('wf'), name: w.name.trim(), description: w.description || '', stages, gates, rules: (w.rules || []).filter((r) => r.gate && r.field && r.role).map((r) => ({ id: r.id || uid('rl'), gate: r.gate, field: r.field, op: r.op || '>=', value: Number(r.value) || 0, role: r.role, count: Math.max(1, Number(r.count) || 1), label: r.label || '' })), reviewRounds: w.reviewRounds || ['solution', 'red'], default: Boolean(w.default) };
    if (rec.default) for (const x of ctx.state.workflows) x.default = false;
    const ex = ctx.state.workflows.find((x) => x.id === rec.id);
    if (ex) Object.assign(ex, rec); else ctx.state.workflows.push(rec);
    if (!ctx.state.workflows.some((x) => x.default)) ctx.state.workflows[0].default = true;
    ctx.touched.add('workflows');
    ctx.target = { type: 'workflow', id: rec.id };
    ctx.label = `${ex ? 'Updated' : 'Added'} workflow template “${rec.name}”`;
  },
});

def('workflow.delete', {
  run(ctx, a) {
    ctx.require('configure');
    if (ctx.state.bids.some((b) => b.workflowId === a.id && !['closed', 'archived'].includes(b.stage))) fail('Active bids use this workflow.');
    if (ctx.state.workflows.length <= 1) fail('At least one workflow template is required.');
    ctx.state.workflows = ctx.state.workflows.filter((w) => w.id !== a.id);
    if (!ctx.state.workflows.some((x) => x.default)) ctx.state.workflows[0].default = true;
    ctx.touched.add('workflows');
    ctx.label = 'Deleted a workflow template';
  },
});

def('recipe.upsert', {
  run(ctx, a) {
    ctx.require('configure');
    const r = a.recipe || {};
    if (!r.name?.trim()) fail('Name the recipe.');
    if (!(r.slides || []).length) fail('Add at least one slide.');
    const rec = { id: r.id || uid('rcp'), name: r.name.trim(), use: r.use || '', could: Boolean(r.could), slides: r.slides.map((s) => ({ id: s.id || uid('sl'), kind: s.kind, title: s.title || '', layout: s.layout || 'content', optional: Boolean(s.optional) })) };
    const ex = ctx.state.recipes.find((x) => x.id === rec.id);
    if (ex) Object.assign(ex, rec); else ctx.state.recipes.push(rec);
    ctx.touched.add('recipes');
    ctx.target = { type: 'recipe', id: rec.id };
    ctx.label = `${ex ? 'Updated' : 'Added'} deck recipe “${rec.name}”`;
  },
});

def('recipe.delete', {
  run(ctx, a) {
    ctx.require('configure');
    ctx.state.recipes = ctx.state.recipes.filter((r) => r.id !== a.id);
    ctx.touched.add('recipes');
    ctx.label = 'Deleted a deck recipe';
  },
});

def('template.upsert', {
  run(ctx, a) {
    ctx.require('configure');
    const t = a.template || {};
    if (!t.name?.trim()) fail('Name the template.');
    const ex = t.id ? ctx.state.templates.find((x) => x.id === t.id) : null;
    const rec = { ...(ex || {}), id: t.id || uid('tpl'), kind: t.kind || 'word', name: t.name.trim(), fileId: t.fileId ?? ex?.fileId ?? null, fileName: t.fileName ?? ex?.fileName ?? null, builtIn: Boolean(ex?.builtIn), placeholders: t.placeholders || ex?.placeholders || [], issues: t.issues || [], layouts: t.layouts || ex?.layouts || [], mapping: t.mapping || ex?.mapping || {}, status: t.status || (t.issues?.some((i) => i.level === 'error') ? 'invalid' : 'approved'), version: ex ? (t.fileId && t.fileId !== ex.fileId ? (ex.version || 1) + 1 : ex.version || 1) : 1, uploadedAt: ctx.now, by: ctx.actor.id, default: Boolean(t.default ?? ex?.default), brandVersion: t.brandVersion || ex?.brandVersion || '2026.1' };
    if (rec.default) for (const x of ctx.state.templates) if (x.kind === rec.kind) x.default = false;
    if (ex) Object.assign(ex, rec); else ctx.state.templates.push(rec);
    ctx.touched.add('templates');
    ctx.target = { type: 'template', id: rec.id };
    ctx.label = `${ex ? 'Updated' : 'Uploaded'} ${rec.kind === 'word' ? 'Word' : 'PowerPoint'} template “${rec.name}” v${rec.version}${rec.status === 'invalid' ? ' (validation errors)' : ''}`;
  },
});

def('template.remove', {
  run(ctx, a) {
    ctx.require('configure');
    const t = ctx.state.templates.find((x) => x.id === a.id);
    if (!t) fail('Template not found.');
    if (t.builtIn) fail('The built-in CTO Consulting templates cannot be removed.');
    t.status = 'retired';
    t.default = false;
    ctx.touched.add('templates');
    ctx.label = `Retired template “${t.name}”`;
  },
});

def('client.upsert', {
  run(ctx, a) {
    assert(ctx.can('createBid') || ctx.can('configure'), 'You cannot edit clients.');
    const c = a.client || {};
    if (!c.name?.trim()) fail('Client name is required.');
    const ex = c.id ? ctx.state.clients.find((x) => x.id === c.id) : null;
    const rec = { ...(ex || {}), id: c.id || uid('cl'), name: c.name.trim(), shortName: c.shortName || '', abn: c.abn || '', sector: c.sector || '', jurisdiction: c.jurisdiction || '', confidentiality: c.confidentiality || 'OFFICIAL', aliases: (c.aliases || []).filter(Boolean) };
    if (ex) Object.assign(ex, rec); else ctx.state.clients.push(rec);
    ctx.touched.add('clients');
    ctx.target = { type: 'client', id: rec.id };
    ctx.label = `${ex ? 'Updated' : 'Added'} client ${rec.name}`;
    return { clientId: rec.id };
  },
});

// ---------- Notifications, AI log and scheduled jobs ----------

def('notif.read', {
  noAudit: true,
  run(ctx, a) {
    for (const n of ctx.state.notifications) if (n.userId === ctx.actor.id && (a.all || (a.ids || []).includes(n.id))) n.read = true;
    ctx.touched.add('notifications');
  },
});

def('ai.log', {
  noAudit: true,
  run(ctx, a) {
    const e = a.entry || {};
    ctx.state.aiLog.push({ id: uid('ai'), at: ctx.now, userId: ctx.actor.id, bidId: e.bidId || null, sectionId: e.sectionId || null, action: e.action, engine: e.engine, model: e.model || null, promptVersion: e.promptVersion || null, inputHash: e.inputHash || null, outputHash: e.outputHash || null, inputChars: e.inputChars || 0, outputChars: e.outputChars || 0, sources: (e.sources || []).slice(0, 40), ms: e.ms || null, inputTokens: e.inputTokens || null, outputTokens: e.outputTokens || null, costUsd: e.costUsd ?? null, ok: e.ok !== false, error: e.error || null, summary: truncate(e.summary || '', 300) });
    if (ctx.state.aiLog.length > 5000) ctx.state.aiLog.splice(0, ctx.state.aiLog.length - 5000);
    ctx.touched.add('aiLog');
  },
});

// Reminders, escalations and digests (CL-05, WF-11). Idempotent per day via dedupe keys.
def('jobs.run', {
  run(ctx, a) {
    assert(ctx.actor.id === 'system' || hasRole(ctx.actor, 'admin'), 'Only administrators run scheduled jobs.');
    const s = ctx.state;
    const today = ctx.today;
    const kinds = a.kinds || ['reminders', 'escalate', 'digest'];
    const counts = { reminders: 0, escalations: 0, digests: 0 };
    if (kinds.includes('reminders')) {
      const days = s.settings.expiryReminderDays ?? 30;
      for (const i of s.library) {
        if (i.retired || !i.approvedV) continue;
        const due = [i.expiry, i.reviewDate].filter(Boolean).sort()[0];
        if (due && due <= addDays(today, days)) {
          const before = s.notifications.length;
          ctx.notify([i.ownerId], { kind: 'library', title: `${due < today ? 'Overdue' : 'Due soon'}: review ${i.key} ${i.title}`, text: `${i.expiry ? 'Expires' : 'Review due'} ${due}.`, link: `/library/${i.id}`, dedupe: `rem:${i.id}:${due}` });
          counts.reminders += s.notifications.length - before;
        }
      }
      const staleMonths = s.settings.cvStaleMonths ?? 12;
      for (const c of s.consultants) {
        if (c.updatedAt && daysBetween(c.updatedAt.slice(0, 10), today) > staleMonths * 30.4 && c.userId) {
          const before = s.notifications.length;
          ctx.notify([c.userId], { kind: 'library', title: 'Please update your consultant profile', text: `Your profile and CV have not been updated for more than ${staleMonths} months.`, link: '/profile', dedupe: `cv:${c.id}:${today.slice(0, 7)}` });
          counts.reminders += s.notifications.length - before;
        }
      }
    }
    if (kinds.includes('escalate')) {
      const grace = s.settings.escalationDays ?? 2;
      for (const b of s.bids) {
        if (['closed', 'archived'].includes(b.stage) || b.submission) continue;
        for (const sec of b.sections) {
          if (!sec.due || ['in_review', 'approved', 'locked'].includes(sec.status)) continue;
          const late = daysBetween(sec.due, today);
          if (late >= grace) {
            const before = s.notifications.length;
            ctx.notify([b.bidManagerId], { kind: 'escalation', title: `Overdue ${late} days: ${sec.title} (${b.ref})`, text: `Owner ${ctx.name(sec.ownerId)}. Due ${sec.due}.`, bidId: b.id, link: `/bids/${b.id}/sections/${sec.id}`, dedupe: `esc:${sec.id}:${today}` });
            counts.escalations += s.notifications.length - before;
          }
        }
      }
    }
    if (kinds.includes('digest')) {
      for (const u of s.users.filter((x) => x.active !== false && x.prefs?.digest !== false)) {
        const items = [];
        for (const b of s.bids) {
          if (['closed', 'archived'].includes(b.stage) || !canSeeBid(s, u.id, b)) continue;
          for (const sec of b.sections) {
            if (sec.ownerId === u.id && !['approved', 'locked'].includes(sec.status)) items.push(`${b.ref} “${sec.title}” (${sec.status.replace('_', ' ')}) due ${sec.due || 'TBC'}`);
            if (sec.status === 'in_review' && (sec.reviewers || []).includes(u.id) && !(sec.approvals || []).some((x) => !x.void && x.by === u.id && x.v === sec.v)) items.push(`Review ${b.ref} “${sec.title}”`);
          }
          for (const g of ['g2', 'g3']) if (b.gates[g]?.status === 'pending' && eligibleApprovers(s, b, g).some((x) => x.userId === u.id) && !(b.gates[g].decisions || []).some((d) => !d.void && d.requestId === b.gates[g].requestId && (d.onBehalfOf || d.by) === u.id)) items.push(`Approve gate ${g.slice(1)} for ${b.ref}`);
        }
        if (!items.length) continue;
        const exists = s.outbox.some((o) => o.userId === u.id && o.digest === today);
        if (exists) continue;
        s.outbox.push({ id: uid('ob'), at: ctx.now, channel: 'email', to: u.email, toName: u.name, userId: u.id, subject: `[CTO Proposals] Your daily digest — ${items.length} item${items.length === 1 ? '' : 's'}`, text: items.map((x) => `• ${x}`).join('\n'), digest: today });
        counts.digests++;
      }
      ctx.touched.add('notifications');
    }
    s.jobs = { ...(s.jobs || {}), lastRun: ctx.now, ...Object.fromEntries(kinds.map((k) => [k, today])) };
    if (!counts.reminders && !counts.escalations && !counts.digests) ctx.skipAudit = true;
    ctx.label = `Scheduled jobs: ${counts.reminders} reminders, ${counts.escalations} escalations, ${counts.digests} digests`;
    return counts;
  },
});

export { gateState, stageBlockers, sectionApproval, PermissionError };
