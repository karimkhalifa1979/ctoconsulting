// Dashboards and reporting (spec section 12). All functions take bids the user can already see.
import { STAGES, stageIndex } from './constants.js';
import { daysBetween, todayISO, zonedToDate, sum, htmlToText } from './util.js';
import { diffText, diffStats } from './diff.js';
import { aiPendingCount, sectionApproval } from './workflow.js';
import { displayStatus, usageIndex, reviewDue } from './library.js';
import { Index } from './search.js';

export const isActive = (b) => !['closed', 'archived'].includes(b.stage) && !b.submission;

export function closingDate(bid) {
  return bid.closing?.date ? zonedToDate(bid.closing.date, bid.closing.time || '14:00', bid.closing.tz || 'Australia/Sydney') : null;
}

export function hoursToClose(bid, now = new Date()) {
  const c = closingDate(bid);
  return c ? (c - now) / 3600000 : null;
}

// At-risk: overdue sections, or approvals pending within 48 hours of the deadline.
export function riskFlags(bid, now = new Date()) {
  const flags = [];
  const today = todayISO(now);
  const overdue = bid.sections.filter((s) => s.due && s.due < today && !['in_review', 'approved', 'locked'].includes(s.status));
  if (overdue.length) flags.push(`${overdue.length} overdue section${overdue.length === 1 ? '' : 's'}`);
  const h = hoursToClose(bid, now);
  const pending = ['g2', 'g3'].filter((g) => ['pending', 'not_requested'].includes(bid.gates[g]?.status) && bid.gates[g]?.status !== 'passed');
  if (h !== null && h >= 0 && h <= 48 && pending.length && isActive(bid)) flags.push(`Approvals pending ${Math.round(h)}h before the deadline`);
  if (h !== null && h < 0 && isActive(bid)) flags.push('Closing time has passed');
  return flags;
}

export function bidHealth(bid) {
  const counts = Object.fromEntries(['not_started', 'drafting', 'in_review', 'approved', 'locked'].map((k) => [k, bid.sections.filter((s) => s.status === k).length]));
  const mand = bid.requirements.filter((r) => r.kind === 'mandatory' && !r.excluded);
  const mapped = mand.filter((r) => (r.sectionIds || []).length);
  const comply = bid.requirements.filter((r) => !r.excluded && r.compliance === 'comply');
  const scores = bid.sections.flatMap((s) => (s.scores || []).flatMap((x) => Object.values(x.scores)));
  const openComments = sum(bid.sections, (s) => (s.comments || []).filter((c) => c.status === 'open').length);
  const ai = sum(bid.sections, (s) => aiPendingCount(s.content));
  return {
    counts, total: bid.sections.length, mandatory: mand.length, mapped: mapped.length, coverage: mand.length ? mapped.length / mand.length : null,
    complyShare: bid.requirements.length ? comply.length / bid.requirements.filter((r) => !r.excluded).length : null,
    avgScore: scores.length ? sum(scores) / scores.length : null, openComments, aiPending: ai,
    daysToClose: bid.closing?.date ? daysBetween(todayISO(), bid.closing.date) : null,
  };
}

// "My work" (WF-10): sections, reviews, approvals and overdue items for a user.
export function myWork(view, userId, now = new Date()) {
  const today = todayISO(now);
  const items = [];
  for (const b of view.bids) {
    if (!isActive(b) && b.stage !== 'produce') continue;
    for (const s of b.sections) {
      if ((s.ownerId === userId || s.contributors?.includes(userId)) && !['approved', 'locked'].includes(s.status)) {
        const reqChanges = (s.comments || []).some((c) => c.kind === 'change-request' && c.status === 'open');
        items.push({ kind: 'section', bid: b, section: s, due: s.due, title: s.title, detail: `${s.status === 'not_started' ? 'Not started' : s.status === 'in_review' ? 'In review' : reqChanges ? 'Changes requested' : 'Drafting'}${aiPendingCount(s.content) ? ' · AI text to review' : ''}`, overdue: s.due && s.due < today && s.status !== 'in_review', link: `/bids/${b.id}/sections/${s.id}`, done: s.status === 'in_review' });
      }
      if (s.status === 'in_review' && (s.reviewers || []).includes(userId)) {
        const st = sectionApproval(b, s);
        if (st.outstanding.includes(userId)) items.push({ kind: 'review', bid: b, section: s, due: s.due, title: `Review: ${s.title}`, detail: `v${s.v} ready for review`, overdue: s.due && s.due < today, link: `/bids/${b.id}/sections/${s.id}` });
      }
      for (const c of s.comments || []) if (c.status === 'open' && c.mentions?.includes(userId) && !c.replies.some((r) => r.by === userId)) items.push({ kind: 'mention', bid: b, section: s, due: null, title: `Mentioned in ${s.title}`, detail: c.text, link: `/bids/${b.id}/sections/${s.id}` });
    }
    for (const g of ['g1', 'g2', 'g3']) {
      const gd = b._d?.gates?.[g];
      if (!gd || b.gates[g]?.status !== 'pending') continue;
      if (g === 'g1' && b.stage !== 'qualify') continue;
      const already = (b.gates[g].decisions || []).some((d) => !d.void && d.requestId === b.gates[g].requestId && (d.onBehalfOf || d.by) === userId);
      const eligible = gd.eligible.includes(userId) || (view.delegators || []).some((id) => gd.eligible.includes(id));
      if (eligible && !already && !gd.allMet) items.push({ kind: 'approval', bid: b, due: b.closing?.date, title: `Approve gate ${g.slice(1)}: ${g === 'g1' ? 'bid/no-bid' : g === 'g2' ? 'commercial approval' : 'partner sign-off'}`, detail: `${b.ref} ${b.title}`, overdue: false, link: g === 'g1' ? `/bids/${b.id}/qualify` : `/bids/${b.id}/approvals`, gate: g });
    }
    if (b.bidManagerId === userId || b.partnerId === userId) {
      if (b._d?.blockers?.length === 0 && isActive(b) && ['intake', 'author', 'review', 'produce'].includes(b.stage)) items.push({ kind: 'stage', bid: b, due: b.closing?.date, title: `Ready to move ${b.ref} on`, detail: `The ${b.stage} stage is complete`, link: `/bids/${b.id}` });
    }
  }
  for (const a of view.availability || []) if (a.availability === 'pending') items.push({ kind: 'availability', due: a.closing?.date, title: `Confirm availability: ${a.ref}`, detail: `${a.role} · ${a.days} days · ${a.client}`, link: '/work', availability: a });
  for (const i of view.library) {
    if (i.ownerId !== userId || i.retired || !i.approvedV) continue;
    const due = reviewDue(i, view.settings, today);
    if (due && (due.overdue || due.soon)) items.push({ kind: 'library', due: due.date, title: `Review library item ${i.key}`, detail: i.title, overdue: due.overdue, link: `/library/${i.id}` });
  }
  items.sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0) || (a.due || '9999').localeCompare(b.due || '9999'));
  return items;
}

export function pipeline(bids, now = new Date()) {
  const active = bids.filter((b) => isActive(b) || (b.submission && !b.outcome));
  const byStage = STAGES.map((s) => ({ stage: s, bids: active.filter((b) => b.stage === s.id) }));
  return { active, byStage, value: sum(active, (b) => b.value), atRisk: active.filter((b) => riskFlags(b, now).length) };
}

const quarterOf = (iso) => `${iso.slice(0, 4)} Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;

export function winLoss(bids, { clients = [], users = [] } = {}) {
  const decided = bids.filter((b) => ['won', 'lost'].includes(b.outcome?.result));
  const by = (keyFn) => {
    const m = new Map();
    for (const b of decided) {
      const k = keyFn(b) || 'Unspecified';
      const e = m.get(k) || { key: k, won: 0, lost: 0, wonValue: 0, value: 0 };
      if (b.outcome.result === 'won') { e.won++; e.wonValue += b.outcome.awardedValue || b.value || 0; } else e.lost++;
      e.value += b.value || 0;
      m.set(k, e);
    }
    return [...m.values()].map((e) => ({ ...e, total: e.won + e.lost, rate: e.won / (e.won + e.lost) })).sort((a, b) => b.total - a.total || b.rate - a.rate);
  };
  const clientName = (id) => clients.find((c) => c.id === id)?.name;
  const userName = (id) => users.find((u) => u.id === id)?.name;
  const reasons = new Map();
  for (const b of decided.filter((x) => x.outcome.result === 'lost')) for (const r of b.outcome.reasons || []) reasons.set(r, (reasons.get(r) || 0) + 1);
  // Cycle time per stage (days), from the stage history.
  const cycle = new Map();
  for (const b of bids) {
    const h = b.stageHistory || [];
    for (let i = 0; i < h.length - 1; i++) {
      if (stageIndex(h[i].stage) < 0) continue;
      const dd = (new Date(h[i + 1].at) - new Date(h[i].at)) / 86400000;
      const e = cycle.get(h[i].stage) || { n: 0, days: 0 };
      e.n++; e.days += dd;
      cycle.set(h[i].stage, e);
    }
  }
  const won = decided.filter((b) => b.outcome.result === 'won');
  return {
    decided: decided.length, won: won.length, rate: decided.length ? won.length / decided.length : null,
    wonValue: sum(won, (b) => b.outcome.awardedValue || b.value), bidValue: sum(decided, (b) => b.value),
    noBids: bids.filter((b) => b.archived?.noBid).length,
    bySector: by((b) => b.sector), byClient: by((b) => clientName(b.clientId)), byOffering: by((b) => b.offering), byPartner: by((b) => userName(b.partnerId)),
    byQuarter: by((b) => quarterOf(b.outcome.at || b.submission?.at || b.createdAt)).sort((a, b) => a.key.localeCompare(b.key)),
    lossReasons: [...reasons.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    cycle: STAGES.map((s) => ({ stage: s, avg: cycle.get(s.id) ? cycle.get(s.id).days / cycle.get(s.id).n : null, n: cycle.get(s.id)?.n || 0 })),
  };
}

export function contentInsight(library, bids, settings) {
  const usage = usageIndex(bids);
  const items = library.map((i) => ({ item: i, status: displayStatus(i, settings), usage: usage.get(i.id) || { bids: [], won: 0, lost: 0, decided: 0, winRate: null } }));
  const used = items.filter((x) => x.usage.bids.length).sort((a, b) => b.usage.bids.length - a.usage.bids.length);
  const due = items.filter((x) => ['expiring'].includes(x.status) || (x.item.expiry && x.item.expiry < todayISO() && !x.item.retired));
  // Library gaps: requirements in active bids with no strong library match.
  const docs = library.filter((i) => i.approvedV && !i.retired).map((i) => ({ id: i.id, title: i.title, text: htmlToText(i.versions.find((v) => v.v === i.approvedV)?.body || '') + ' ' + JSON.stringify(i.versions.find((v) => v.v === i.approvedV)?.fields || {}) }));
  const ix = new Index(docs);
  const gaps = [];
  for (const b of bids.filter(isActive)) {
    for (const r of b.requirements) {
      if (r.excluded) continue;
      const top = ix.search(r.text, { limit: 1, semantic: true })[0];
      if (!top || top.score < 3) gaps.push({ bid: b, req: r, best: top?.item?.title || null, score: top?.score || 0 });
    }
  }
  const byType = new Map();
  for (const x of items) byType.set(x.item.type, (byType.get(x.item.type) || 0) + 1);
  const reuseWin = (() => {
    const decided = used.filter((x) => x.usage.decided);
    const w = sum(decided, (x) => x.usage.won), d = sum(decided, (x) => x.usage.decided);
    return d ? w / d : null;
  })();
  return { items, used, due, gaps, byType, reuseWin };
}

// AI usage (spec section 12): drafts generated, share accepted without major edits, corrections, cost per bid.
export function aiUsage(bids, aiLog) {
  const drafts = [];
  for (const b of bids) {
    for (const s of b.sections) {
      for (const h of s.aiHistory || []) {
        if (!h.text) continue;
        const finalText = htmlToText(s.content).slice(0, 6000);
        const st = diffStats(diffText(h.text, finalText.slice(0, Math.max(h.text.length * 2, 400))));
        const pending = aiPendingCount(s.content) > 0;
        drafts.push({ bid: b, section: s, h, changed: st.changed, pending, acceptedAsIs: !pending && st.changed < 0.2 });
      }
    }
  }
  const reviewed = drafts.filter((d) => !d.pending);
  const extraction = bids.filter((b) => b.extraction);
  const corrections = sum(extraction, (b) => (b.extraction.corrections || []).length);
  const costByBid = new Map();
  for (const e of aiLog) {
    if (!e.bidId) continue;
    const x = costByBid.get(e.bidId) || { calls: 0, cost: 0, claude: 0, offline: 0 };
    x.calls++; x.cost += e.costUsd || 0;
    if (e.engine === 'claude') x.claude++; else x.offline++;
    costByBid.set(e.bidId, x);
  }
  return {
    drafts: drafts.length, reviewed: reviewed.length, acceptedAsIs: reviewed.filter((d) => d.acceptedAsIs).length,
    acceptedShare: reviewed.length ? reviewed.filter((d) => d.acceptedAsIs).length / reviewed.length : null,
    pending: drafts.filter((d) => d.pending).length, extractions: extraction.length, corrections,
    correctionsPerExtraction: extraction.length ? corrections / extraction.length : null,
    calls: aiLog.length, claudeCalls: aiLog.filter((e) => e.engine === 'claude').length, cost: sum(aiLog, (e) => e.costUsd || 0),
    byBid: bids.map((b) => ({ bid: b, ...(costByBid.get(b.id) || { calls: 0, cost: 0, claude: 0, offline: 0 }) })).filter((x) => x.calls).sort((a, b) => b.cost - a.cost),
    byAction: [...aiLog.reduce((m, e) => m.set(e.action, (m.get(e.action) || 0) + 1), new Map())].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    recent: drafts.slice(-50),
  };
}
