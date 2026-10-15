// Benefits map (Results Chain) model: graph queries, modelling rules, layout, backtracking and diffs.
// Elements: initiative | outcome | assumption. Links are directed contributions; an assumption
// attaches to the element it conditions through a link from the assumption.
import { MEDIC, VAGUE, ELEMENT_RISK } from './config.js';
import { sum } from './util.js';

export const chainOf = (p) => p.chain || { elements: [], links: [], paths: [], versions: [] };
export const elById = (chain, id) => chain.elements.find((e) => e.id === id);
const STRENGTH = { high: 3, medium: 2, low: 1 };
export const strengthValue = (s) => STRENGTH[s] || 2;

export function outgoing(chain, id) { return chain.links.filter((l) => l.from === id); }
export function incoming(chain, id) { return chain.links.filter((l) => l.to === id); }

// Elements reachable downstream from the given ids (inclusive).
export function downstream(chain, ids) {
  const seen = new Set(); const stack = [...(Array.isArray(ids) ? ids : [ids])];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const l of outgoing(chain, id)) stack.push(l.to);
  }
  return seen;
}
export function upstream(chain, ids) {
  const seen = new Set(); const stack = [...(Array.isArray(ids) ? ids : [ids])];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const l of incoming(chain, id)) stack.push(l.from);
  }
  return seen;
}

// Benefits whose outcome sits downstream of an assumption matching the predicate.
export function affectedBenefitIds(program, pred) {
  const chain = chainOf(program);
  const assumptions = chain.elements.filter((e) => e.kind === 'assumption' && pred(e));
  const ids = new Set();
  for (const a of assumptions) {
    const down = downstream(chain, a.id);
    for (const b of program.benefits || []) if (b.outcomeId && down.has(b.outcomeId)) ids.add(b.id);
  }
  return ids;
}

// Benefits affected by one assumption (for value-at-risk, RCM-22).
export function benefitsBehind(program, assumptionId) {
  const down = downstream(chainOf(program), assumptionId);
  return (program.benefits || []).filter((b) => b.outcomeId && down.has(b.outcomeId));
}

export function findCycles(chain) {
  const color = {}; const cycles = [];
  const visit = (id, path) => {
    color[id] = 1;
    for (const l of outgoing(chain, id)) {
      if (color[l.to] === 1) cycles.push([...path.slice(path.indexOf(l.to)), l.to]);
      else if (!color[l.to]) visit(l.to, [...path, l.to]);
    }
    color[id] = 2;
  };
  for (const e of chain.elements) if (!color[e.id]) visit(e.id, [e.id]);
  return cycles;
}

// MEDIC wording check (RCM-04, BR-06).
export function wording(title) {
  const w = String(title || '').toLowerCase();
  const medic = MEDIC.find((v) => new RegExp(`\\b${v}\\b`).test(w));
  const vague = VAGUE.filter((v) => new RegExp(`\\b${v}\\b`).test(w));
  return { ok: Boolean(medic) && !vague.length, medic, vague };
}

export const elementRisk = (e) => (e.importance && e.confidence ? ELEMENT_RISK[e.importance]?.[e.confidence] : null);

// Modelling rules (RCM-04/05/21, STR-04, BR-04/05/06/13). Severity: error | warning | info.
export function modelChecks(program, ws) {
  const chain = chainOf(program);
  const out = [];
  const add = (severity, rule, text, ids = []) => out.push({ severity, rule, text, ids });
  const els = chain.elements;
  if (!els.length) { add('error', 'RCM-04', 'The benefits map is empty. Start with the final outcomes the program must deliver.'); return out; }

  const finals = els.filter((e) => e.kind === 'outcome' && e.final);
  if (!finals.length) add('error', 'RCM-04', 'The map has no final outcome. Mark the end benefits to be harvested as final outcomes.');

  for (const i of els.filter((e) => e.kind === 'initiative')) {
    const down = downstream(chain, i.id);
    const reachesOutcome = [...down].some((id) => elById(chain, id)?.kind === 'outcome');
    if (!reachesOutcome) add('error', 'BR-04', `Initiative “${i.title}” does not lead to any outcome (blocks gate submission).`, [i.id]);
    if (!i.btopp || !i.btopp.length) add('warning', 'RCM-05', `Initiative “${i.title}” has no BTOPP element.`, [i.id]);
  }
  for (const o of els.filter((e) => e.kind === 'outcome')) {
    const w = wording(o.title);
    if (w.vague.length) add('warning', 'BR-06', `Outcome “${o.title}” uses vague wording (${w.vague.join(', ')}). Reword using MEDIC: maintained, eliminated, decreased, increased or created.`, [o.id]);
    else if (!w.medic) add('warning', 'BR-06', `Outcome “${o.title}” has no MEDIC verb, so it may not be measurable.`, [o.id]);
    if (o.final && !(o.driverIds || []).length) add('error', 'STR-04', `Final outcome “${o.title}” is not linked to a strategic driver (blocks Commitment).`, [o.id]);
    if (!o.ownerId) add('warning', 'ACC-02', `Outcome “${o.title}” has no owner.`, [o.id]);
    if (o.final && !(program.benefits || []).some((b) => b.outcomeId === o.id)) add('warning', 'BEN-01', `Final outcome “${o.title}” has no benefit record in the register.`, [o.id]);
    if (!o.final && !outgoing(chain, o.id).length) add('warning', 'RCM-04', `Intermediate outcome “${o.title}” does not contribute to anything (ask “so what?”).`, [o.id]);
  }
  for (const a of els.filter((e) => e.kind === 'assumption')) {
    if (!outgoing(chain, a.id).length) add('warning', 'RCM-03', `Assumption “${a.title}” is not attached to any element.`, [a.id]);
    if (!a.assumption?.monitorId) add('info', 'RCM-03', `Assumption “${a.title}” has no monitor.`, [a.id]);
    if (a.assumption?.status === 'invalid') add('error', 'RCM-22', `Assumption “${a.title}” is invalid — review the dependent outcomes and benefits.`, [a.id]);
    else if (a.assumption?.status === 'at-risk') add('warning', 'RCM-22', `Assumption “${a.title}” is at risk.`, [a.id]);
  }
  for (const e of els) {
    if (e.kind !== 'assumption' && !incoming(chain, e.id).length && !outgoing(chain, e.id).length) add('warning', 'RCM-04', `“${e.title}” is an orphan (not linked to anything).`, [e.id]);
    if (elementRisk(e) === 'Contingency plan required' && !e.contingency) add('error', 'BR-13', `“${e.title}” is high importance with low confidence and needs a contingency plan before Commitment.`, [e.id]);
  }
  for (const c of findCycles(chain)) add('warning', 'RCM-04', `Circular contribution: ${c.map((id) => elById(chain, id)?.code || '?').join(' → ')}.`, c);
  if (!els.some((e) => e.kind === 'assumption')) add('info', 'GDA-01', 'No assumptions recorded. Most programs depend on conditions outside their control.');

  // BTOPP balance (RCM-05): warn when technology-only or OPP share is low.
  const mix = btoppMix(program);
  if (mix.initiatives > 0 && mix.count.T === mix.initiatives) add('warning', 'RCM-05', 'Technology-only program: no organisation, process or people initiatives.');
  const oppMin = ws?.settings?.thresholds?.oppMin ?? 0.5;
  if (mix.initiatives > 1 && mix.oppShareCount < oppMin) add('warning', 'RCM-05', `Organisation, process and people initiatives are ${Math.round(mix.oppShareCount * 100)}% of the total (threshold ${Math.round(oppMin * 100)}%).`);
  return out;
}

export function btoppMix(program) {
  const inits = chainOf(program).elements.filter((e) => e.kind === 'initiative');
  const count = { B: 0, T: 0, O: 0, Pr: 0, P: 0 };
  for (const i of inits) for (const t of i.btopp || []) count[t] = (count[t] || 0) + 1 / (i.btopp.length || 1);
  const cost = { B: 0, T: 0, O: 0, Pr: 0, P: 0 };
  for (const c of program.costs || []) {
    const total = c.basis === 'annual' ? (Number(c.amount) || 0) * ((Number(c.months) || 120) / 12) : Number(c.amount) || 0;
    cost[c.btopp || 'T'] = (cost[c.btopp || 'T'] || 0) + total;
  }
  const totalCost = sum(Object.values(cost));
  const opp = (o) => (o.O || 0) + (o.Pr || 0) + (o.P || 0);
  return {
    initiatives: inits.length, count, cost, totalCost,
    oppShareCount: inits.length ? opp(count) / inits.length : 0,
    oppShareCost: totalCost ? opp(cost) / totalCost : 0,
  };
}

// RCM-12: trace back from an outcome, ordered by contribution strength.
export function backtrace(program, outcomeId) {
  const chain = chainOf(program);
  const rows = []; const seen = new Set();
  const walk = (id, weight, depth) => {
    for (const l of incoming(chain, id)) {
      const e = elById(chain, l.from);
      if (!e) continue;
      const w = weight * strengthValue(l.strength) / 3;
      const key = `${e.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ el: e, weight: w, depth, via: elById(chain, id) });
      if (e.kind !== 'assumption') walk(e.id, w, depth + 1);
    }
  };
  walk(outcomeId, 1, 1);
  return rows.sort((a, b) => b.weight - a.weight || a.depth - b.depth);
}

// Status for scorecard view (RCM-11): progress vs target, shown by label + icon + colour.
export function elementStatus(e) {
  if (e.kind === 'assumption') {
    const s = e.assumption?.status || 'holding';
    return { holding: { label: 'Holding', tone: 'good', icon: '✓' }, 'at-risk': { label: 'At risk', tone: 'warning', icon: '!' }, invalid: { label: 'Invalid', tone: 'critical', icon: '✕' } }[s];
  }
  const v = Number(e.progress) || 0;
  if (e.kind === 'initiative') return v >= 100 ? { label: 'Implemented', tone: 'good', icon: '✓' } : v > 0 ? { label: `${v}% implemented`, tone: 'progress', icon: '◐' } : { label: 'Not started', tone: 'none', icon: '○' };
  const expected = Number(e.expected) || 0;
  if (!v && !expected) return { label: 'Not yet due', tone: 'none', icon: '○' };
  const ratio = expected ? v / expected : 1;
  return ratio >= 0.9 ? { label: `${v}% achieved`, tone: 'good', icon: '✓' } : ratio >= 0.75 ? { label: `${v}% (below ${expected}%)`, tone: 'warning', icon: '!' } : { label: `${v}% (below ${expected}%)`, tone: 'critical', icon: '✕' };
}

// Left-to-right layered layout (RCM-16): rank by longest path, then barycentre ordering.
export const NODE_W = 200; export const NODE_H = 66; const COL_GAP = 92; const ROW_GAP = 26;
export function layout(chain, { swimlanes = null } = {}) {
  const els = chain.elements;
  const core = els.filter((e) => e.kind !== 'assumption');
  const rank = {};
  const coreLinks = chain.links.filter((l) => core.some((e) => e.id === l.from) && core.some((e) => e.id === l.to));
  for (const e of core) rank[e.id] = 0;
  // Longest-path ranking with a bounded number of relaxations (tolerates cycles).
  for (let i = 0; i < core.length + 1; i++) {
    let changed = false;
    for (const l of coreLinks) if (rank[l.to] < rank[l.from] + 1 && rank[l.from] + 1 <= core.length) { rank[l.to] = rank[l.from] + 1; changed = true; }
    if (!changed) break;
  }
  // Final outcomes go in the right-most column.
  const maxRank = Math.max(0, ...Object.values(rank));
  for (const e of core) if (e.kind === 'outcome' && e.final) rank[e.id] = maxRank;
  const cols = [];
  for (const e of core) (cols[rank[e.id]] ||= []).push(e);
  const order = {};
  cols.forEach((c) => c?.forEach((e, i) => { order[e.id] = i; }));
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let ci = 1; ci < cols.length; ci++) {
      if (!cols[ci]) continue;
      cols[ci].sort((a, b) => bary(a) - bary(b));
      cols[ci].forEach((e, i) => { order[e.id] = i; });
    }
  }
  function bary(e) {
    const ins = coreLinks.filter((l) => l.to === e.id).map((l) => order[l.from]).filter((v) => v !== undefined);
    return ins.length ? ins.reduce((a, b) => a + b, 0) / ins.length : order[e.id] ?? 0;
  }
  const pos = {};
  const laneOf = swimlanes ? (e) => swimlanes.indexOf(swimKey(e, swimlanes)) : null;
  cols.forEach((c, ci) => {
    if (!c) return;
    const list = laneOf ? c.slice().sort((a, b) => laneOf(a) - laneOf(b) || order[a.id] - order[b.id]) : c;
    list.forEach((e, i) => { pos[e.id] = { x: 30 + ci * (NODE_W + COL_GAP), y: 30 + i * (NODE_H + ROW_GAP) + 44 }; });
  });
  // Centre shorter columns vertically.
  const height = Math.max(...cols.filter(Boolean).map((c) => c.length), 1);
  cols.forEach((c) => {
    if (!c) return;
    const off = ((height - c.length) * (NODE_H + ROW_GAP)) / 2;
    for (const e of c) pos[e.id].y += off;
  });
  // Assumptions sit above their first target.
  const usedAbove = {};
  for (const a of els.filter((e) => e.kind === 'assumption')) {
    const t = chain.links.find((l) => l.from === a.id && pos[l.to]);
    if (t) {
      const p = pos[t.to];
      const k = `${p.x}`;
      usedAbove[k] = (usedAbove[k] || 0) + 1;
      pos[a.id] = { x: p.x + 14, y: p.y - NODE_H + 2 - (usedAbove[k] - 1) * 6 };
    } else {
      pos[a.id] = { x: 30 + (cols.length) * (NODE_W + COL_GAP), y: 74 + Object.keys(usedAbove).length * 10 };
    }
  }
  // Respect manual positions where stored.
  for (const e of els) if (e.x !== undefined && e.y !== undefined && e.pinned) pos[e.id] = { x: e.x, y: e.y };
  // Shift everything so nothing is above the top margin.
  const minY = Math.min(...Object.values(pos).map((p) => p.y), 30);
  if (minY < 30) for (const k of Object.keys(pos)) pos[k].y += 30 - minY;
  const w = Math.max(...Object.values(pos).map((p) => p.x + NODE_W), 400) + 30;
  const h = Math.max(...Object.values(pos).map((p) => p.y + NODE_H), 200) + 30;
  return { pos, w, h };
}
function swimKey(e, lanes) { return (e.btopp && e.btopp[0]) || (e.kind === 'outcome' ? 'Outcome' : lanes[lanes.length - 1]); }

// RCM-13: compare two snapshots.
export function diffChains(a, b) {
  const A = new Map(a.elements.map((e) => [e.id, e])); const B = new Map(b.elements.map((e) => [e.id, e]));
  const added = b.elements.filter((e) => !A.has(e.id));
  const removed = a.elements.filter((e) => !B.has(e.id));
  const changed = b.elements.filter((e) => A.has(e.id) && JSON.stringify(strip(A.get(e.id))) !== JSON.stringify(strip(e))).map((e) => ({ before: A.get(e.id), after: e, fields: Object.keys(strip(e)).filter((k) => JSON.stringify(A.get(e.id)[k]) !== JSON.stringify(e[k])) }));
  const key = (l) => `${l.from}>${l.to}`;
  const LA = new Set(a.links.map(key)); const LB = new Set(b.links.map(key));
  return { added, removed, changed, linksAdded: b.links.filter((l) => !LA.has(key(l))), linksRemoved: a.links.filter((l) => !LB.has(key(l))) };
}
function strip(e) { const { x, y, pinned, ...rest } = e; return rest; }

export function snapshot(chain) {
  return JSON.parse(JSON.stringify({ elements: chain.elements, links: chain.links, paths: chain.paths || [] }));
}

export function nextCode(chain, kind) {
  const prefix = kind === 'initiative' ? 'I' : kind === 'outcome' ? 'O' : 'A';
  const nums = chain.elements.filter((e) => e.kind === kind).map((e) => Number(String(e.code || '').replace(/\D/g, '')) || 0);
  return `${prefix}${Math.max(0, ...nums) + 1}`;
}
