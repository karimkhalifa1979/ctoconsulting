// Word-level diff (Myers O(ND)) for version comparison and addendum comparison.
import { htmlToText } from './util.js';
import { textSimilarity } from './search.js';

export function diffTokens(a, b) {
  const n = a.length, m = b.length, max = n + m;
  const v = new Int32Array(2 * max + 2);
  const trace = [];
  const off = max + 1;
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { found = true; break; }
    }
  }
  // Backtrack.
  const ops = [];
  let x = n, y = m;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vv = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && vv[off + k - 1] < vv[off + k + 1]) ? k + 1 : k - 1;
    const prevX = vv[off + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push({ t: 'eq', v: a[x - 1] }); x--; y--; }
    if (d > 0) {
      if (x === prevX) ops.push({ t: 'ins', v: b[y - 1] });
      else ops.push({ t: 'del', v: a[x - 1] });
    }
    x = prevX; y = prevY;
  }
  ops.reverse();
  // Merge runs.
  const out = [];
  for (const o of ops) {
    const last = out[out.length - 1];
    if (last && last.t === o.t) last.v.push(o.v);
    else out.push({ t: o.t, v: [o.v] });
  }
  return out;
}

const splitWords = (s) => String(s || '').split(/(\s+)/).filter((x) => x !== '');

export function diffText(a, b) {
  const ta = splitWords(a), tb = splitWords(b);
  if (ta.length * tb.length > 25_000_000) return [{ t: 'del', v: ta }, { t: 'ins', v: tb }];
  return diffTokens(ta, tb).map((r) => ({ t: r.t, text: r.v.join('') }));
}

export function diffHtml(a, b) {
  return diffText(htmlToText(a), htmlToText(b));
}

export function diffStats(ops) {
  let ins = 0, del = 0, eq = 0;
  for (const o of ops) {
    const w = (o.text.match(/\S+/g) || []).length;
    if (o.t === 'ins') ins += w; else if (o.t === 'del') del += w; else eq += w;
  }
  return { ins, del, eq, changed: eq + del ? (ins + del) / (eq + del + ins) : 1 };
}

// Compares two requirement lists (earlier request vs addendum) by reference, then by text similarity.
export function compareRequirements(oldList, newList) {
  const out = [];
  const usedNew = new Set();
  for (const o of oldList) {
    let match = newList.find((n) => !usedNew.has(n) && o.ref && n.ref && o.ref === n.ref);
    if (!match) {
      let best = null, bestScore = 0;
      for (const n of newList) {
        if (usedNew.has(n)) continue;
        const s = textSimilarity(o.text, n.text);
        if (s > bestScore) { best = n; bestScore = s; }
      }
      if (bestScore >= 0.55) match = best;
    }
    if (!match) { out.push({ kind: 'removed', before: o, after: null }); continue; }
    usedNew.add(match);
    const same = o.text.replace(/\s+/g, ' ').trim() === match.text.replace(/\s+/g, ' ').trim() && o.kind === match.kind;
    out.push({ kind: same ? 'unchanged' : 'changed', before: o, after: match, ops: same ? null : diffText(o.text, match.text) });
  }
  for (const n of newList) if (!usedNew.has(n)) out.push({ kind: 'added', before: null, after: n });
  return out;
}
