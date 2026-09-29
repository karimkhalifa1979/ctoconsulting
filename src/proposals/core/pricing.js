// Pricing and staffing calculations (spec section 11). Prices are AUD, GST shown separately.
import { round2, sum } from './util.js';

export function cardValid(card, onDate) {
  if (!card || card.status === 'retired') return false;
  if (card.validFrom && onDate < card.validFrom) return false;
  if (card.validTo && onDate > card.validTo) return false;
  return true;
}

// Picks the rate for a level: manual override, then the bid's chosen panel/contract card, then a client card, then standard.
export function rateFor(state, bid, line) {
  const on = bid.closing?.date || new Date().toISOString().slice(0, 10);
  if (line.rateOverride) return { rate: Number(line.rateOverride), source: 'Manual override', cardId: null };
  const cards = state.rateCards || [];
  const find = (card) => (cardValid(card, on) ? card.rates.find((r) => r.level === line.level) : null);
  const chosen = cards.find((c) => c.id === bid.pricing?.rateCardId);
  if (chosen && chosen.kind !== 'standard') {
    const r = find(chosen);
    if (r) return { rate: r.rate, source: chosen.name, cardId: chosen.id, kind: chosen.kind };
  }
  const clientCard = cards.find((c) => c.kind === 'client' && c.clientId === bid.clientId && cardValid(c, on));
  if (clientCard) {
    const r = find(clientCard);
    if (r) return { rate: r.rate, source: clientCard.name, cardId: clientCard.id, kind: 'client' };
  }
  const standard = (chosen?.kind === 'standard' && cardValid(chosen, on) ? chosen : null) || cards.find((c) => c.kind === 'standard' && cardValid(c, on)) || cards.find((c) => c.kind === 'standard');
  const r = standard?.rates.find((x) => x.level === line.level);
  return { rate: r?.rate || 0, source: standard?.name || 'No rate card', cardId: standard?.id || null, kind: 'standard' };
}

export function costFor(state, line) {
  const c = (state.consultants || []).find((x) => x.id === line.consultantId);
  if (c?.costRate) return Number(c.costRate);
  return Number(state.settings?.costRates?.[line.level]) || 0;
}

export function computePricing(state, bid) {
  const p = bid.pricing || {};
  const gstRate = state.settings?.gstRate ?? 0.1;
  const staffing = (bid.staffing || []).filter((l) => l.include !== false);
  const lines = staffing.map((l) => {
    const r = rateFor(state, bid, l);
    const days = Number(l.days) || 0;
    const costRate = costFor(state, l);
    return { ...l, days, rate: r.rate, rateSource: r.source, rateKind: r.kind, sell: round2(days * r.rate), costRate, cost: round2(days * costRate) };
  });
  const days = sum(lines, (l) => l.days);
  const labour = sum(lines, (l) => l.sell);
  const discount = round2(labour * (Number(p.discountPct) || 0) / 100);
  let labourNet = labour - discount;
  const model = p.model || 'tm';
  const months = Math.max(1, Number(p.retainerMonths) || 12);
  const monthly = model === 'retainer' ? labourNet : null;
  if (model === 'retainer') labourNet = labourNet * months;
  const contingency = model === 'fixed' ? round2(labourNet * (Number(p.contingencyPct) || 0) / 100) : 0;
  const expenses = sum(p.expenses || [], (e) => e.amount);
  const fees = round2(labourNet + contingency);
  const subtotal = round2(fees + expenses);
  const gst = round2(subtotal * gstRate);
  const total = round2(subtotal + gst);
  const labourCost = round2(sum(lines, (l) => l.cost) * (model === 'retainer' ? months : 1));
  const marginPct = fees > 0 ? (fees - labourCost) / fees : null;
  const cap = model === 'capped' ? Number(p.cap) || subtotal : null;
  const milestones = model === 'fixed'
    ? (p.milestones || []).map((m) => ({ ...m, amount: round2(fees * (Number(m.pct) || 0) / 100) }))
    : [];
  const milestonePct = sum(p.milestones || [], (m) => m.pct);
  const issues = [];
  if (!lines.length) issues.push('No team members are priced.');
  if (lines.some((l) => !l.rate)) issues.push('A line has no rate. Choose a rate card that covers its level.');
  if (model === 'fixed' && Math.round(milestonePct) !== 100 && (p.milestones || []).length) issues.push(`Milestones add up to ${milestonePct}% of the fixed price, not 100%.`);
  if (model === 'capped' && cap < subtotal) issues.push('The cap is below the estimated time and materials price.');
  return {
    model, lines, days, labour: round2(labour), discount, labourNet: round2(labourNet), monthly: monthly === null ? null : round2(monthly), months: model === 'retainer' ? months : null,
    contingency, expenses: round2(expenses), fees, subtotal, gst, gstRate, total, labourCost, marginPct, cap, milestones, issues,
  };
}

// Margin threshold that triggers an extra commercial approval (from the bid's workflow rules, else settings).
export function marginThreshold(state, bid) {
  const wf = (state.workflows || []).find((w) => w.id === bid.workflowId);
  const rule = wf?.rules?.find((r) => r.field === 'marginPct');
  return rule ? Number(rule.value) : Number(state.settings?.marginThreshold ?? 25);
}
