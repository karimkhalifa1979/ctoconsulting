// Authorisation: platform roles + bid membership + ethical walls (spec section 4).
// The same module is used by the browser store and the Node server, so every command is checked in one place.
import { CAPABILITIES, PORTFOLIO_ROLES } from './constants.js';

export class PermissionError extends Error {
  constructor(message) { super(message); this.name = 'PermissionError'; this.status = 403; }
}

export const userOf = (state, id) => state.users.find((u) => u.id === id) || null;
export const hasRole = (user, role) => Boolean(user?.roles?.includes(role));
export const hasAnyRole = (user, roles) => roles.some((r) => hasRole(user, r));

export function isWalled(bid, userId) {
  return Boolean(bid?.ethicalWall?.users?.includes(userId));
}

// Team membership: partner, bid manager, listed members, and anyone assigned to a section.
export function teamRole(bid, userId) {
  if (!bid || !userId) return null;
  if (bid.partnerId === userId) return 'partner';
  if (bid.bidManagerId === userId) return 'bidManager';
  const m = (bid.members || []).find((x) => x.userId === userId);
  if (m) return m.role || 'member';
  for (const s of bid.sections || []) {
    if (s.ownerId === userId || s.contributors?.includes(userId)) return 'author';
    if (s.reviewers?.includes(userId)) return 'reviewer';
  }
  return null;
}

export const isTeam = (bid, userId) => !isWalled(bid, userId) && teamRole(bid, userId) !== null;

export function canSeeBid(state, userId, bid) {
  const user = userOf(state, userId);
  if (!user || !bid || isWalled(bid, userId)) return false;
  if (hasAnyRole(user, PORTFOLIO_ROLES)) return true;
  if (teamRole(bid, userId) !== null) return true;
  // A delegate sees the bids of the approvers who delegated to them (WF-14).
  return delegatorsFor(state, userId).some((d) => teamRole(bid, d.id) !== null && !isWalled(bid, d.id));
}

export function visibleBids(state, userId) {
  return state.bids.filter((b) => canSeeBid(state, userId, b));
}

export const canEditSectionAsOwner = (section, userId) => Boolean(section && (section.ownerId === userId || section.contributors?.includes(userId)));

// Returns true if the user may use a capability, optionally in the context of a bid (and section).
export function can(state, userId, capId, ctx = {}) {
  const user = userOf(state, userId);
  if (!user || user.active === false) return false;
  const cap = CAPABILITIES.find((c) => c.id === capId);
  if (!cap) return false;
  const { bid, section } = ctx;
  if (bid && isWalled(bid, userId)) return false;
  for (const role of user.roles) {
    const grant = cap.grants[role];
    if (!grant) continue;
    if (grant === 'yes') return true;
    if (grant === 'team') {
      if (bid && isTeam(bid, userId)) return true;
      if (!bid && ctx.anyBid) return true;
    }
    if (grant === 'own') {
      if (capId === 'editSection' && bid && isTeam(bid, userId) && canEditSectionAsOwner(section, userId)) return true;
      if (capId === 'viewDashboards' && ctx.own) return true;
      if (capId === 'editSection' && !section && ctx.anyBid) return true;
    }
  }
  return false;
}

export function assert(cond, message) {
  if (!cond) throw new PermissionError(message);
}

export function assertCan(state, userId, capId, ctx = {}, what) {
  if (!can(state, userId, capId, ctx)) {
    const cap = CAPABILITIES.find((c) => c.id === capId);
    throw new PermissionError(`You do not have permission to ${what || cap?.label.toLowerCase() || capId}${ctx.bid ? ' on this bid' : ''}.`);
  }
}

// Whether the user may see cost rates and margin anywhere (used to redact reference data).
export function seesCostAnywhere(state, userId) {
  const user = userOf(state, userId);
  return hasAnyRole(user, ['admin', 'partner', 'commercial']);
}

// Delegation (WF-14): an approver may delegate to someone with equal or higher authority while away.
const AUTHORITY = { partner: 3, commercial: 2, reviewer: 1 };
export function authorityOf(user) {
  return Math.max(0, ...(user?.roles || []).map((r) => AUTHORITY[r] || 0));
}

export function activeDelegation(user, now = new Date().toISOString()) {
  const d = user?.delegation;
  if (!d?.toUserId) return null;
  if (d.from && now.slice(0, 10) < d.from) return null;
  if (d.until && now.slice(0, 10) > d.until) return null;
  return d;
}

// Users who have delegated their approvals to `userId` (and are currently away).
export function delegatorsFor(state, userId, now) {
  return state.users.filter((u) => activeDelegation(u, now)?.toUserId === userId);
}
