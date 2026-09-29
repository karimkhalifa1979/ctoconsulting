// Opportunity brief (CR-06) and pre-filled bid/no-bid scorecard (CR-07).
import { SCORECARD_FACTORS } from './constants.js';
import { retrieve, clientOf } from './drafting.js';
import { flattenDocs } from './extract.js';
import { daysBetween, todayISO, audShort, splitSentences, truncate } from './util.js';
import { textSimilarity } from './search.js';
import { hasRole } from './permissions.js';

const THEME_BANK = [
  { re: /migrat|cloud|landing zone|data centre/i, theme: 'A proven, low-risk migration method with a rehearsed rollback for every wave' },
  { re: /essential eight|cyber|security|ism\b/i, theme: 'Evidence-based cyber uplift that an auditor will accept' },
  { re: /change|capability|knowledge|transition|training/i, theme: 'Capability left behind: the client’s team runs what we build' },
  { re: /utilit|water|energy/i, theme: 'Deep experience with regulated utilities' },
  { re: /benefit|value|cost/i, theme: 'Measurable benefits tracked from day one' },
  { re: /architecture|business case|roadmap|target.state/i, theme: 'Investment-ready business case aligned with government frameworks' },
  { re: /record|registry|archive/i, theme: 'Specialist records and registry modernisation expertise' },
  { re: /clearance|nv1|baseline|personnel/i, theme: 'A cleared, available team ready to start on day one' },
  { re: /accessib|user|resident|customer/i, theme: 'Services designed with the people who use them' },
  { re: /data|ai\b|analytics|governance/i, theme: 'Responsible data and AI governance that enables innovation' },
];

export function buildBrief(state, bid) {
  const client = clientOf(state, bid);
  const paras = flattenDocs(bid.documents.filter((d) => d.type !== 'form'));
  const background = paras.filter((p) => ['background', 'scope'].includes(p.context) && !p.isHeading);
  const need = background.slice(0, 4).flatMap((p) => splitSentences(p.text.replace(/^\d+(\.\d+)*\s+/, '')).slice(0, 1)).slice(0, 3);
  const scope = paras.filter((p) => p.context === 'scope' && !p.isHeading).map((p) => p.text.replace(/^\d+(\.\d+)*\s+/, ''));
  const all = paras.map((p) => p.text).join(' ');
  const mand = bid.requirements.filter((r) => r.kind === 'mandatory').length;
  const des = bid.requirements.filter((r) => r.kind === 'desirable').length;
  const days = bid.closing?.date ? daysBetween(todayISO(), bid.closing.date) : null;
  const risks = [];
  if (days !== null && days < 15) risks.push(`Short response window: ${days} days to closing.`);
  if (/fixed price/i.test(all)) risks.push('Fixed-price component: delivery risk sits with CTO Consulting.');
  if (/liabilit[^.]*(unlimited|uncapped)/i.test(all)) risks.push('Uncapped liability in the draft contract.');
  else if (/liabilit/i.test(all)) risks.push('Liability terms need commercial review.');
  if (/\bNV1\b|negative vetting/i.test(all)) risks.push('NV1 clearances required: limits the available team.');
  else if (/baseline/i.test(all)) risks.push('Baseline clearances required for all personnel.');
  if (/incumbent|current provider|existing supplier/i.test(all)) risks.push('An incumbent supplier is referred to.');
  const pageLimit = bid.extraction?.submission?.find((s) => s.label === 'Page limit');
  if (pageLimit) risks.push(`Page limit: ${pageLimit.number} pages.`);
  if (/24\/7|24x7/i.test(all)) risks.push('24/7 support commitment required.');
  const themes = THEME_BANK.filter((t) => t.re.test(all)).map((t) => t.theme).slice(0, 4);
  const dates = (bid.extraction?.dates || []).map((d) => `${d.label}: ${d.date}${d.time ? ` ${d.time}` : ''}`);
  return {
    client: client.name,
    need: need.join(' ') || truncate(all, 400),
    scope: scope.slice(0, 5),
    timing: [bid.closing?.date ? `Closes ${bid.closing.date} ${bid.closing.time || ''} (${bid.closing.tz})` : null, ...dates.filter((d) => !/^Closing/.test(d))].filter(Boolean),
    requirements: `${mand} mandatory and ${des} desirable requirements; ${bid.criteria.length} weighted evaluation criteria.`,
    risks,
    winThemes: themes,
    generatedAt: new Date().toISOString(),
  };
}

const clamp = (n) => Math.max(1, Math.min(5, Math.round(n)));

export function prefillScorecard(state, bid) {
  const client = clientOf(state, bid);
  const factors = {};
  const offerings = state.taxonomy.offerings || [];
  const reqText = bid.requirements.map((r) => r.text).join(' ');
  // Strategic fit: requirements that match our offerings.
  const matchedOfferings = offerings.filter((o) => textSimilarity(o, `${bid.title} ${reqText}`) > 0.1 || new RegExp(o.split(' ')[0], 'i').test(`${bid.title} ${reqText}`));
  factors.strategic = { score: clamp(2 + matchedOfferings.length * 0.8), evidence: matchedOfferings.length ? `Matches our offerings: ${matchedOfferings.slice(0, 4).join(', ')}.` : 'No clear match with our offerings.' };
  // Relationship: past bids and case studies with this client.
  const past = state.bids.filter((b) => b.clientId === bid.clientId && b.id !== bid.id && b.outcome);
  const won = past.filter((b) => b.outcome.result === 'won').length;
  const cs = state.library.filter((i) => i.type === 'case_study' && i.clientId === bid.clientId).length;
  factors.relationship = { score: clamp(1.5 + won * 1.2 + cs * 0.8 + (past.length - won) * 0.3), evidence: past.length || cs ? `${past.length} previous bid${past.length === 1 ? '' : 's'} with ${client.name} (${won} won); ${cs} case stud${cs === 1 ? 'y' : 'ies'}.` : `No previous work with ${client.name}.` };
  // Capability match: library evidence per requirement.
  const perReq = bid.requirements.map((r) => ({ r, hits: retrieve(state, bid, r.text, { limit: 2 }) }));
  const covered = perReq.filter((x) => x.hits.length && x.hits[0].score > 3.5);
  const ratio = bid.requirements.length ? covered.length / bid.requirements.length : 0;
  const topItems = [...new Map(perReq.flatMap((x) => x.hits.slice(0, 1)).map((h) => [h.item.id, h.item])).values()].slice(0, 5);
  factors.capability = { score: clamp(1 + ratio * 4.2), evidence: `${covered.length} of ${bid.requirements.length} requirements have strong library evidence. Best matches: ${topItems.map((i) => i.key).join(', ') || 'none'}.`, items: topItems.map((i) => i.id) };
  // Competition.
  const docsText = bid.documents.map((d) => (d.pages || []).map((p) => p.paras.join(' ')).join(' ')).join(' ');
  const incumbent = /incumbent|current provider|existing supplier/i.test(docsText);
  const panel = /panel/i.test(docsText);
  factors.competition = { score: incumbent ? 2 : panel ? 3 : 3, evidence: [incumbent ? 'An incumbent is referred to in the request.' : 'No incumbent is referred to.', panel ? 'Limited to panel members.' : 'Open market.'].join(' ') };
  // Capacity: consultants with matching skills who are available.
  const skillHits = state.consultants.filter((c) => c.skills.some((s) => new RegExp(s.split(' ')[0], 'i').test(reqText)));
  const available = skillHits.filter((c) => c.availability?.status !== 'unavailable');
  const needsNv1 = /NV1|negative vetting/i.test(reqText);
  const cleared = available.filter((c) => !needsNv1 || ['NV1', 'NV2', 'PV'].includes(c.clearance));
  factors.capacity = { score: clamp(1 + Math.min(4, cleared.length / 1.5)), evidence: `${cleared.length} available consultant${cleared.length === 1 ? '' : 's'} with matching skills${needsNv1 ? ' and NV1 clearance' : ''}: ${cleared.slice(0, 4).map((c) => c.name).join(', ') || 'none'}.` };
  // Risk.
  const brief = bid.brief || buildBrief(state, bid);
  factors.risk = { score: clamp(5 - brief.risks.length * 0.7), evidence: brief.risks.length ? brief.risks.join(' ') : 'No significant risks identified in the request.' };
  // Value.
  const values = state.bids.filter((b) => b.value && b.id !== bid.id).map((b) => b.value).sort((a, b) => a - b);
  const median = values.length ? values[Math.floor(values.length / 2)] : 1000000;
  factors.value = { score: clamp(2 + (bid.value / median) * 1.5), evidence: `Estimated value ${audShort(bid.value)} against a median bid value of ${audShort(median)}.` };
  return { factors, ...scoreSummary(factors), generatedAt: new Date().toISOString() };
}

export function scoreSummary(factors) {
  const list = SCORECARD_FACTORS.map((f) => Number(factors[f.id]?.score) || 0);
  const total = list.reduce((a, b) => a + b, 0);
  const avg = list.length ? total / list.length : 0;
  const recommendation = avg >= 3.4 ? 'Bid' : avg >= 2.6 ? 'Consider carefully' : 'No bid';
  return { total, max: list.length * 5, average: Math.round(avg * 10) / 10, recommendation };
}

export function partners(state) {
  return state.users.filter((u) => hasRole(u, 'partner') && u.active !== false);
}
