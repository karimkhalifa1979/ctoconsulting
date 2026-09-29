// What a signed-in user may see: bids filtered by membership and ethical walls, cost data redacted
// unless the user may see cost rates and margin (PR-08). Used by the browser store and the server.
import { canSeeBid, can, seesCostAnywhere, userOf, hasRole, delegatorsFor } from './permissions.js';
import { computePricing, marginThreshold } from './pricing.js';
import { gateState, stageBlockers, gatePreconditions, stagesOf, eligibleApprovers } from './workflow.js';
import { verifyAudit } from './commands.js';

function derived(state, bid, userId) {
  const seeCost = can(state, userId, 'seeCost', { bid });
  const p = computePricing(state, bid);
  const pricing = seeCost ? p : {
    ...p, labourCost: null, marginPct: null,
    lines: p.lines.map((l) => ({ ...l, cost: null, costRate: null })),
  };
  const gates = {};
  for (const g of ['g1', 'g2', 'g3']) {
    const st = gateState(state, bid, g);
    gates[g] = {
      status: st.status, enabled: st.enabled, allMet: st.allMet,
      reqs: st.reqs.map((r) => ({ role: r.role, count: r.count, met: r.met, have: r.have.map((d) => d.onBehalfOf || d.by), reasons: seeCost ? r.reasons : r.reasons.map((x) => (/margin/i.test(x) ? 'Commercial rule (margin)' : x)) })),
      preconditions: g === 'g1' ? [] : gatePreconditions(state, bid, g),
      eligible: eligibleApprovers(state, bid, g).map((x) => x.userId),
    };
  }
  return {
    seeCost, pricing, gates, blockers: stageBlockers(state, bid), stages: stagesOf(state, bid).map((s) => s.id),
    marginThreshold: seeCost ? marginThreshold(state, bid) : null,
    marginBelow: seeCost && p.marginPct !== null ? p.marginPct * 100 < marginThreshold(state, bid) : null,
  };
}

export function viewFor(state, userId) {
  const user = userOf(state, userId);
  if (!user) return null;
  const seeCost = seesCostAnywhere(state, userId);
  const bids = state.bids.filter((b) => canSeeBid(state, userId, b)).map((b) => ({ ...b, _d: derived(state, b, userId) }));
  // Consultants see availability requests even for bids they cannot otherwise open.
  const me = state.consultants.find((c) => c.userId === userId);
  const availability = [];
  if (me) {
    for (const b of state.bids) {
      for (const l of b.staffing || []) {
        if (l.consultantId !== me.id || ['closed', 'archived'].includes(b.stage)) continue;
        const client = state.clients.find((c) => c.id === b.clientId);
        availability.push({ bidId: b.id, ref: b.ref, title: b.title, client: client?.name, closing: b.closing, lineId: l.id, role: l.role, days: l.days, availability: l.availability, note: l.availabilityNote || '' });
      }
    }
  }
  return {
    version: state.version, me: user, seeCost,
    settings: seeCost ? state.settings : { ...state.settings, costRates: null },
    users: state.users, clients: state.clients, taxonomy: state.taxonomy, workflows: state.workflows, recipes: state.recipes, templates: state.templates,
    library: state.library,
    consultants: seeCost ? state.consultants : state.consultants.map((c) => ({ ...c, costRate: null })),
    rateCards: state.rateCards,
    bids,
    notifications: state.notifications.filter((n) => n.userId === userId).slice(-300),
    locks: state.locks, availability, delegators: delegatorsFor(state, userId).map((u) => u.id), jobs: state.jobs,
    counts: { outbox: state.outbox.length, audit: state.audit.length, aiLog: state.aiLog.length },
  };
}

// Queries for data kept out of the main view (large or restricted).
export function query(state, userId, name, args = {}) {
  const user = userOf(state, userId);
  if (!user) return null;
  const admin = hasRole(user, 'admin');
  if (name === 'audit') {
    const events = state.audit.filter((e) => {
      if (args.bidId && e.bidId !== args.bidId) return false;
      if (e.bidId) { const b = state.bids.find((x) => x.id === e.bidId); return b ? canSeeBid(state, userId, b) : admin; }
      return admin || e.actor === userId;
    });
    return { events: events.slice(-(args.limit || 2000)), integrity: admin || args.bidId ? verifyAudit(state.audit) : null };
  }
  if (name === 'outbox') return state.outbox.filter((o) => admin || o.userId === userId).slice(-(args.limit || 500));
  if (name === 'aiLog') {
    return state.aiLog.filter((e) => {
      if (args.bidId && e.bidId !== args.bidId) return false;
      if (admin) return true;
      const b = state.bids.find((x) => x.id === e.bidId);
      return b ? canSeeBid(state, userId, b) : e.userId === userId;
    });
  }
  return null;
}
