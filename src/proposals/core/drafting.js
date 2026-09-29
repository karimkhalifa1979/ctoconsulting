// Grounded drafting (spec 9.1). The offline engine assembles drafts only from approved library content,
// the bid's own request documents and proposed consultants, cites every sentence it uses and flags gaps
// as "needs evidence". Claude (server) returns the same block structure, rendered by renderBlocks().
import { Index, tokens, textSimilarity } from './search.js';
import { approvedVersion, itemHtml, itemTitle, usageMode, isUsable } from './library.js';
import { parseHtml, blockSentences, topBlocks, textOf, renderHtml, sentenceHtml } from './html.js';
import { splitSentences, escapeHtml, htmlToText, htmlWords, wordCount } from './util.js';
import { DRAFTABLE_TYPES } from './constants.js';

export const PROMPT_VERSION = 'draft-2026.09.2';

export const clientOf = (state, bid) => state.clients.find((c) => c.id === bid.clientId) || { name: 'the client' };
export const clientShort = (state, bid) => { const c = clientOf(state, bid); return c.shortName || c.name; };

const libCite = (c) => ({ src: `lib:${c.item.id}@${c.v}`, label: c.item.key || c.title.slice(0, 18), kind: 'library' });
const reqCite = (r) => ({ src: `req:${r.id}`, label: r.ref, kind: 'request' });
const conCite = (c) => ({ src: `con:${c.id}`, label: c.name, kind: 'consultant' });

// ---------- Retrieval ----------

export function candidates(state, bid, { types = DRAFTABLE_TYPES } = {}) {
  const out = [];
  for (const item of state.library) {
    if (!types.includes(item.type) || !isUsable(item)) continue;
    const mode = usageMode(item, bid.clientId);
    if (mode === 'excluded') continue;
    const v = approvedVersion(item);
    const html = itemHtml(item, v, { mode });
    out.push({ id: item.id, item, v: v.v, mode, title: itemTitle(item, v, mode), html, text: htmlToText(html), tags: Object.values(item.tags || {}).flat().concat(v.fields?.technologies || [], v.fields?.services || [], v.variants || []) });
  }
  return out;
}

export function retrieve(state, bid, query, { limit = 8, types } = {}) {
  const cands = candidates(state, bid, { types });
  const ix = new Index(cands);
  return ix.search(query, { limit }).map((r) => ({ ...r.item, score: r.score }));
}

// Names of other clients who have not consented to be named, with their anonymised label.
function anonymisers(state, bid) {
  const out = [];
  for (const i of state.library) {
    if (i.type !== 'case_study' || !i.approvedV || i.clientId === bid.clientId) continue;
    const v = approvedVersion(i);
    if (usageMode(i, bid.clientId) === 'named') continue;
    const name = v.fields?.client;
    if (name) out.push([name, v.anonymised?.title || v.fields?.anonymisedName || 'a previous client']);
  }
  return out;
}

function sentencePool(cands, consultants = [], anon = []) {
  const pool = [];
  for (const c of cands) {
    const blocks = topBlocks(c.html);
    for (const b of blocks) {
      if (b.name === 'ul' || b.name === 'ol') {
        for (const li of b.children.filter((x) => x.name === 'li')) {
          const t = textOf(li).trim();
          if (t) pool.push({ text: /[.!?]$/.test(t) ? t : `${t}.`, cite: libCite(c), cand: c, outcome: true });
        }
        continue;
      }
      for (const s of splitSentences(textOf(b))) if (s.split(/\s+/).length >= 6 && !/:$/.test(s)) pool.push({ text: s, cite: libCite(c), cand: c });
    }
  }
  const clean = (t) => anon.reduce((acc, [name, label]) => acc.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), label.charAt(0).toLowerCase() + label.slice(1)), t);
  for (const con of consultants) for (const s of splitSentences(clean(con.bio || ''))) pool.push({ text: s, cite: conCite(con), consultant: con });
  for (const p of pool) p.tokens = new Set(tokens(p.text));
  return pool;
}

function rank(pool, query, used, { boost } = {}) {
  const q = tokens(query);
  const qs = new Set(q);
  return pool
    .filter((p) => !used.has(p.text))
    .map((p) => {
      let inter = 0;
      for (const t of qs) if (p.tokens.has(t)) inter++;
      let score = qs.size ? inter / Math.sqrt(qs.size * Math.max(4, p.tokens.size)) : 0;
      if (boost) score *= boost(p);
      return { ...p, score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ---------- Requirement restatement ----------

export function restate(req) {
  let t = req.text.trim().replace(/\s+/g, ' ');
  t = t
    .replace(/^(The|A)\s+(supplier|respondent|successful respondent|contractor|tenderer|provider)\s+(must|shall|should|will need to|is required to)\s+(be able to\s+)?/i, 'We will ')
    .replace(/^(Respondents|Suppliers)\s+(must|should)\s+/i, 'We will ')
    .replace(/^All\s+(personnel|staff)\s+(.*?)\s+must\s+/i, 'All our $1 $2 will ')
    .replace(/^(Personnel)\s+must\s+/i, 'Our personnel will ')
    .replace(/^All\s+(.+?)\s+must\s+/i, 'All $1 will ')
    .replace(/^(Experience|A proven|A method|The ability|Innovative|Demonstrated)\b/i, (m) => `We offer ${m.charAt(0).toLowerCase()}${m.slice(1)}`)
    .replace(/\bthe (Authority|Office|Council|Department|Agency|client)(’s|'s)?\b/gi, (m, n, pos) => `the ${n}${pos || ''}`)
    .replace(/\bmust\b/g, 'will')
    .replace(/\bshall\b/g, 'will');
  if (!/^(We|All|Our)\b/.test(t)) t = `We will meet this requirement: ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
  if (!/[.!?]$/.test(t)) t += '.';
  return t;
}

const LABEL_STOP = /^(that|which|to|with|for|by|across|including|of|in|on|at|from|during|within|under|so|and)$/i;
export function shortLabel(req) {
  const text = req.text.trim();
  if (/^(all\s+)?(our\s+)?(personnel|staff)\b/i.test(text)) return /clearance/i.test(text) ? 'Personnel security clearances' : 'Personnel';
  if (/remain in Australia|hosted in Australia|onshore/i.test(text) && /data/i.test(text)) return 'Data sovereignty';
  let t = text
    .replace(/^(The|A)\s+(supplier|respondent|successful respondent|contractor|tenderer|provider)\s+(must|should|shall|will|is required to)\s+(be able to\s+)?/i, '')
    .replace(/^(Respondents|Suppliers)\s+(must|should)\s+/i, '')
    .replace(/^(provide|design and build|design|build|hold|maintain|comply with|uplift|ensure|deliver|prepare|engage with|demonstrate|propose|establish|define|train and accredit|train|assess|implement|estimate|sign|identify|offer|develop|submit|meet)\s+/i, '')
    .replace(/^(a|an|the|current|its|their|all|at least)\s+/i, '')
    .replace(/^(a|an|the)\s+/i, '');
  const words = [];
  for (const w of t.split(/\s+/)) {
    if (words.length >= 2 && LABEL_STOP.test(w)) break;
    words.push(w.replace(/[,.;:]$/, ''));
    if (words.length >= 6 || /[,.;:]$/.test(w)) break;
  }
  const out = words.join(' ');
  return out ? `${out.charAt(0).toUpperCase()}${out.slice(1)}` : req.ref;
}

// ---------- Rendering ----------

export function renderBlocks(blocks, { ai = true } = {}) {
  return blocks.map((b) => {
    if (b.type === 'h3' || b.type === 'h2') return `<${b.type}>${ai ? `<span data-ai="pending">${escapeHtml(b.text)}</span>` : escapeHtml(b.text)}</${b.type}>`;
    if (b.type === 'ul' || b.type === 'ol') return `<${b.type}>${b.items.map((it) => `<li><p>${it.sentences.map((s) => sentenceHtml(s, { ai })).join(' ')}</p></li>`).join('')}</${b.type}>`;
    const lead = b.lead ? `<strong>${ai ? `<span data-ai="pending">${escapeHtml(b.lead)}</span>` : escapeHtml(b.lead)}</strong> ` : '';
    return `<p>${lead}${b.sentences.map((s) => sentenceHtml(s, { ai })).join(' ')}</p>`;
  }).join('');
}

function blocksWords(blocks) {
  let n = 0;
  for (const b of blocks) {
    if (b.text) n += wordCount(b.text);
    if (b.lead) n += wordCount(b.lead);
    for (const s of b.sentences || []) n += wordCount(s.text);
    for (const it of b.items || []) for (const s of it.sentences) n += wordCount(s.text);
  }
  return n;
}

function sourcesOf(blocks) {
  const m = new Map();
  const add = (c) => m.set(c.src, c);
  for (const b of blocks) {
    for (const s of b.sentences || []) (s.cites || []).forEach(add);
    for (const it of b.items || []) for (const s of it.sentences) (s.cites || []).forEach(add);
  }
  return [...m.values()];
}

// ---------- Section drafting ----------

const isKind = (section, re) => re.test(`${section.key} ${section.title}`);

export function draftSection(state, bid, section, { wordLimit } = {}) {
  const client = clientShort(state, bid);
  const reqs = bid.requirements.filter((r) => (r.sectionIds || []).includes(section.id) && !r.excluded);
  const consultants = (bid.staffing || []).map((l) => state.consultants.find((c) => c.id === l.consultantId)).filter(Boolean);
  const query = [section.title, section.brief, ...reqs.map((r) => r.text)].join(' ');
  const cands = retrieve(state, bid, query, { limit: 10 });
  const anon = anonymisers(state, bid);
  const pool = sentencePool(cands, consultants, anon);
  const used = new Set();
  const blocks = [];
  const take = (list, n) => list.slice(0, n).map((p) => { used.add(p.text); return { text: p.text, cites: [p.cite] }; });
  const limit = wordLimit || section.wordLimit || 600;

  if (isKind(section, /exec/i)) return executiveSummary(state, bid, section);

  // Opening: restate what the client asked for, cited to the request.
  if (reqs.length) {
    const refs = reqs.slice(0, 6).map((r) => r.ref);
    blocks.push({ type: 'p', sentences: [{ text: `This section responds to ${client}’s requirement${refs.length > 1 ? 's' : ''} ${refs.length > 1 ? `${refs.slice(0, -1).join(', ')} and ${refs[refs.length - 1]}` : refs[0]}.`, cites: reqs.slice(0, 6).map(reqCite) }] });
  }
  const methodLead = rank(pool.filter((p) => p.cand?.item.type === 'method' || p.cand?.item.type === 'standard_answer'), query, used);
  if (methodLead.length && methodLead[0].score > 0.12) blocks.push({ type: 'p', sentences: take(methodLead, 2) });

  if (isKind(section, /team|personnel|staff/i) && consultants.length) {
    for (const con of consultants.slice(0, 6)) {
      const line = (bid.staffing || []).find((l) => l.consultantId === con.id);
      blocks.push({ type: 'h3', text: `${con.name} — ${line?.role || con.role}` });
      blocks.push({ type: 'p', sentences: pool.filter((p) => p.consultant?.id === con.id).slice(0, 3).map((p) => { used.add(p.text); return { text: p.text, cites: [p.cite] }; }) });
    }
  } else if (isKind(section, /experience|case stud|credential/i)) {
    const cs = retrieve(state, bid, query, { limit: 3, types: ['case_study'] });
    for (const c of cs) {
      blocks.push({ type: 'h3', text: c.title });
      const v = approvedVersion(c.item);
      const f = v.fields || {};
      const sum = splitSentences(htmlToText(itemHtml(c.item, v, { mode: c.mode })).split('\n')[0]).slice(0, 2);
      blocks.push({ type: 'p', sentences: sum.map((t) => ({ text: t, cites: [libCite(c)] })) });
      const outs = rank(pool.filter((p) => p.cand?.id === c.id && p.outcome), query, used);
      const items = (outs.length ? outs : pool.filter((p) => p.cand?.id === c.id && p.outcome)).slice(0, 4);
      if (items.length) blocks.push({ type: 'ul', items: items.map((p) => { used.add(p.text); return { sentences: [{ text: p.text, cites: [p.cite] }] }; }) });
      if (!f.outcomes?.length) blocks.push({ type: 'p', sentences: [{ text: 'Add measurable outcomes for this case study.', cites: [], flag: true }] });
    }
  }

  // One paragraph per linked requirement: commitment (cited to the request) plus evidence (cited to the library).
  for (const r of reqs.slice(0, 10)) {
    const ev = rank(pool, r.text, used, { boost: (p) => (p.outcome ? 1.15 : 1) }).filter((p) => p.score >= 0.2);
    const sentences = [{ text: restate(r), cites: [reqCite(r)] }];
    if (ev.length) sentences.push(...take(ev, r.kind === 'mandatory' ? 2 : 1));
    else sentences.push({ text: `Add evidence showing how CTO Consulting meets ${r.ref}, such as a certification, method or case study outcome.`, cites: [], flag: true });
    blocks.push({ type: 'p', lead: `${shortLabel(r)} (${r.ref}).`, sentences });
  }

  // No linked requirements: compose from the most relevant content.
  if (!reqs.length && !isKind(section, /team|personnel|staff|experience|case stud/i)) {
    const top = rank(pool, query, used);
    if (top.length) {
      blocks.push({ type: 'p', sentences: take(top, 3) });
      const more = rank(pool, query, used);
      if (more.length) blocks.push({ type: 'p', sentences: take(more, 3) });
    } else {
      blocks.push({ type: 'p', sentences: [{ text: `No approved library content matches “${section.title}”. Draft this section from the brief and add sources.`, cites: [], flag: true }] });
    }
  }

  // Evidence from case studies to close approach-style sections.
  if (!isKind(section, /team|experience|case stud|pric|commercial|departure/i)) {
    const outs = rank(pool.filter((p) => p.outcome), query, used).filter((p) => p.score > 0.15);
    if (outs.length) {
      const o = outs[0];
      used.add(o.text);
      const label = o.cand.mode === 'anonymised' ? o.cand.title.split(' for ').pop() : approvedVersion(o.cand.item)?.fields?.client;
      blocks.push({ type: 'p', sentences: [{ text: `We have done this before. Result for ${label || 'a similar organisation'}: ${o.text.charAt(0).toLowerCase()}${o.text.slice(1)}`, cites: [o.cite] }] });
    }
  }

  trimToLimit(blocks, limit);
  const html = renderBlocks(blocks);
  const sources = sourcesOf(blocks);
  return { html, blocks, sources, stats: statsOf(blocks), engine: 'offline', promptVersion: PROMPT_VERSION };
}

function statsOf(blocks) {
  let sentences = 0, cited = 0, flagged = 0;
  const each = (s) => { sentences++; if (s.cites?.length) cited++; if (s.flag) flagged++; };
  for (const b of blocks) {
    (b.sentences || []).forEach(each);
    for (const it of b.items || []) it.sentences.forEach(each);
  }
  return { sentences, cited, flagged, words: blocksWords(blocks) };
}

function trimToLimit(blocks, limit) {
  let guard = 200;
  while (blocksWords(blocks) > limit && guard-- > 0) {
    // Drop the last evidence sentence of the longest paragraph, then whole trailing blocks.
    const paras = blocks.filter((b) => b.type === 'p' && b.sentences.length > 1);
    if (paras.length) {
      paras.sort((a, b) => b.sentences.length - a.sentences.length);
      paras[0].sentences.pop();
      continue;
    }
    const lastUl = [...blocks].reverse().find((b) => b.type === 'ul' && b.items.length > 1);
    if (lastUl) { lastUl.items.pop(); continue; }
    if (blocks.length > 1) blocks.pop(); else break;
  }
}

// ---------- Executive summary from approved sections ----------

export function executiveSummary(state, bid, section) {
  const client = clientShort(state, bid);
  const blocks = [];
  const reqDoc = bid.documents.find((d) => d.type === 'request');
  blocks.push({ type: 'p', sentences: [{ text: `CTO Consulting is pleased to respond to ${client}’s request for ${bid.title}${bid.clientRef ? ` (${bid.clientRef})` : ''}.`, cites: reqDoc ? [{ src: `doc:${reqDoc.id}#p1`, label: 'Request', kind: 'document' }] : [] }] });
  const rank = { locked: 0, approved: 0, in_review: 1, drafting: 2, not_started: 3 };
  const sources = bid.sections.filter((s) => s.id !== section?.id && !/exec/i.test(`${s.key} ${s.title}`) && htmlWords(s.content) > 20)
    .sort((a, b) => (rank[a.status] - rank[b.status]) || (a.order - b.order)).slice(0, 6).sort((a, b) => a.order - b.order);
  const all = [];
  const seen = new Set();
  for (const s of sources) {
    const sents = [];
    for (const b of topBlocks(s.content)) if (['p', 'ul', 'ol'].includes(b.name)) sents.push(...blockSentences(b));
    const scored = sents.filter((x) => x.text.split(/\s+/).length > 7 && !x.flag && !/^This section responds/.test(x.text)).map((x) => ({ ...x, score: (x.cites.length ? 1 : 0.2) + (/\d/.test(x.text) ? 0.5 : 0) + (/\bwill\b/.test(x.text) ? 0.3 : 0) }));
    scored.sort((a, b) => b.score - a.score);
    all.push(...scored.map((x) => ({ ...x, sectionTitle: s.title })));
    const pick = scored.filter((x) => !seen.has(x.text)).slice(0, 2);
    pick.forEach((x) => seen.add(x.text));
    if (pick.length) blocks.push({ type: 'p', lead: `${s.title}.`, sentences: pick.map((x) => ({ text: x.text, cites: x.cites.length ? x.cites : [{ src: `sec:${s.id}`, label: s.title.slice(0, 24), kind: 'section' }] })) });
  }
  const themes = bid.plan?.winThemes || [];
  if (themes.length) {
    blocks.push({ type: 'h3', text: 'Why CTO Consulting' });
    blocks.push({
      type: 'ul',
      items: themes.map((t) => {
        const best = all.map((x) => ({ ...x, sim: textSimilarity(t, x.text) })).sort((a, b) => b.sim - a.sim)[0];
        return { sentences: [{ text: /[.!?]$/.test(t) ? t : `${t}.`, cites: best && best.sim > 0.15 ? best.cites : [], flag: !(best && best.sim > 0.15) }] };
      }),
    });
  }
  if (!sources.length) blocks.push({ type: 'p', sentences: [{ text: 'No sections are ready yet. Draft the executive summary once other sections are in review or approved.', cites: [], flag: true }] });
  trimToLimit(blocks, section?.wordLimit || 500);
  return { html: renderBlocks(blocks), blocks, sources: sourcesOf(blocks), stats: statsOf(blocks), engine: 'offline', promptVersion: PROMPT_VERSION };
}

// ---------- Other AI actions (WD-04) ----------

function htmlToSentenceBlocks(html) {
  const blocks = [];
  for (const b of topBlocks(html)) {
    if (b.name === 'p') blocks.push({ type: 'p', sentences: blockSentences(b).map((s) => ({ text: s.text, cites: s.cites, flag: s.flag, ai: s.ai })) });
    else if (b.name === 'h2' || b.name === 'h3' || b.name === 'h4') blocks.push({ type: b.name === 'h4' ? 'h3' : b.name, text: textOf(b) });
    else if (b.name === 'ul' || b.name === 'ol') blocks.push({ type: b.name, items: b.children.filter((x) => x.name === 'li').map((li) => ({ sentences: blockSentences(li).map((s) => ({ text: s.text, cites: s.cites, flag: s.flag })) })) });
    else blocks.push({ type: 'raw', html: renderHtml(b) });
  }
  return blocks;
}

function renderMixed(blocks) {
  return blocks.map((b) => (b.type === 'raw' ? b.html : renderBlocks([b]))).join('');
}

export function shorten(html, limit, { title = '' } = {}) {
  const blocks = htmlToSentenceBlocks(html);
  const before = htmlWords(html);
  const entries = [];
  blocks.forEach((b, bi) => (b.sentences || []).forEach((s, si) => entries.push({ bi, si, s, score: (si === 0 ? 1 : 0) + (s.cites?.length ? 0.6 : 0) + (/\d/.test(s.text) ? 0.3 : 0) + textSimilarity(title, s.text) - si * 0.05 })));
  entries.sort((a, b) => a.score - b.score);
  let words = before;
  const drop = new Set();
  for (const e of entries) {
    if (words <= limit) break;
    drop.add(`${e.bi}:${e.si}`);
    words -= wordCount(e.s.text);
  }
  const out = blocks.map((b, bi) => (b.sentences ? { ...b, sentences: b.sentences.filter((_, si) => !drop.has(`${bi}:${si}`)) } : b)).filter((b) => !b.sentences || b.sentences.length);
  return { html: renderMixed(out), before, after: words, removed: drop.size };
}

const WEAK = [
  [/\bwe believe that\s+/gi, ''], [/\bwe think that\s+/gi, ''], [/\bwe feel that\s+/gi, ''], [/\bwe will try to\b/gi, 'we will'], [/\bwe hope to\b/gi, 'we will'],
  [/\bhopefully,?\s*/gi, ''], [/\baim to\b/gi, 'will'], [/\bmay be able to\b/gi, 'can'], [/\bendeavour to\b/gi, 'will'], [/\bwe would\b/gi, 'we will'],
];

export function strengthen(html, bid, section) {
  const reqs = bid.requirements.filter((r) => (r.sectionIds || []).includes(section.id));
  const crits = bid.criteria.filter((c) => reqs.some((r) => r.criterionId === c.id));
  const blocks = htmlToSentenceBlocks(html);
  let changes = 0;
  for (const b of blocks) {
    for (const s of b.sentences || []) {
      let t = s.text;
      for (const [re, rep] of WEAK) t = t.replace(re, rep);
      t = t.charAt(0).toUpperCase() + t.slice(1);
      if (t !== s.text) { s.text = t; changes++; }
    }
  }
  for (const c of crits) {
    const mentioned = blocks.some((b) => (b.sentences || []).some((s) => textSimilarity(s.text, c.name) > 0.5));
    if (mentioned) continue;
    const doc = c.src ? { src: `doc:${c.src.docId}#p${c.src.page}`, label: `Criterion ${c.weight ?? ''}%`.replace(' %', ''), kind: 'document' } : null;
    const linked = reqs.filter((r) => r.criterionId === c.id).map((r) => r.ref);
    blocks.push({ type: 'p', sentences: [{ text: `This directly addresses the “${c.name}” evaluation criterion${c.weight ? `, weighted at ${c.weight}%` : ''}, through our response to ${linked.join(', ')}.`, cites: doc ? [doc] : [] }] });
    changes++;
  }
  return { html: renderMixed(blocks), changes, criteria: crits.map((c) => c.name) };
}

export function tailorCaseStudy(state, bid, item) {
  const mode = usageMode(item, bid.clientId);
  if (mode === 'excluded') throw new Error('This case study is confidential to another client and has no anonymised variant.');
  const v = approvedVersion(item);
  const cand = { id: item.id, item, v: v.v, mode, title: itemTitle(item, v, mode), html: itemHtml(item, v, { mode }) };
  const pool = sentencePool([cand]);
  const reqText = bid.requirements.map((r) => r.text).join(' ');
  const relevant = bid.requirements.map((r) => ({ r, s: Math.max(...pool.map((p) => textSimilarity(r.text, p.text)), 0) })).filter((x) => x.s > 0.18).sort((a, b) => b.s - a.s).slice(0, 3);
  const client = clientShort(state, bid);
  const blocks = [{ type: 'h3', text: cand.title }];
  if (relevant.length) blocks.push({ type: 'p', lead: `Relevance to ${client}.`, sentences: [{ text: `This engagement is directly relevant to ${client}’s requirement${relevant.length > 1 ? 's' : ''} ${relevant.map((x) => x.r.ref).join(', ')}.`, cites: relevant.map((x) => reqCite(x.r)) }] });
  const summary = pool.filter((p) => !p.outcome).slice(0, 3);
  blocks.push({ type: 'p', sentences: summary.map((p) => ({ text: p.text, cites: [p.cite] })) });
  const outcomes = rank(pool.filter((p) => p.outcome), reqText, new Set());
  const rest = pool.filter((p) => p.outcome && !outcomes.includes(p));
  blocks.push({ type: 'ul', items: [...outcomes, ...rest].slice(0, 5).map((p) => ({ sentences: [{ text: p.text, cites: [p.cite] }] })) });
  return { html: renderBlocks(blocks), sources: sourcesOf(blocks), mode };
}

export function checkAgainstRequirements(html, reqs) {
  const text = htmlToText(html);
  const have = new Set(tokens(text));
  return reqs.map((r) => {
    const key = [...new Set(tokens(r.text))].filter((t) => t.length > 3 && !['supplier', 'authority', 'respondent', 'provide', 'require'].includes(t));
    const hit = key.filter((t) => have.has(t));
    let score = key.length ? hit.length / key.length : 0;
    if (new RegExp(`\\b${r.ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) score = Math.min(1, score + 0.15);
    return { reqId: r.id, ref: r.ref, kind: r.kind, score, status: score >= 0.6 ? 'addressed' : score >= 0.3 ? 'partial' : 'missing', missing: key.filter((t) => !have.has(t)).slice(0, 8) };
  });
}

// Bulk answers for questionnaire returnables from standard answers, with a confidence score each.
export function bulkAnswer(state, bid, questions) {
  const answers = candidates(state, bid, { types: ['standard_answer'] });
  const ix = new Index(answers.map((a) => ({ ...a, tags: [...(approvedVersion(a.item)?.variants || []), approvedVersion(a.item)?.topic].filter(Boolean) })), { fields: { title: 2.5, tags: 3, text: 0.6 } });
  return questions.map((q) => {
    const res = ix.search(q.text, { limit: 3 });
    const best = res[0];
    if (!best) return { ...q, confidence: 0, answer: null };
    const v = approvedVersion(best.item.item);
    const variantSim = Math.max(textSimilarity(q.text, best.item.title), ...(v.variants || []).map((x) => textSimilarity(q.text, x)));
    const rel = res[1] ? best.score / (best.score + res[1].score) : 1;
    const confidence = Math.max(0, Math.min(0.98, 0.25 + 0.5 * variantSim + 0.35 * best.coverage * rel));
    return { ...q, confidence, answer: { itemId: best.item.item.id, key: best.item.item.key, v: best.item.v, title: best.item.title, html: best.item.html } };
  });
}

export function suggestMetadata(text, taxonomy) {
  const lower = ` ${String(text).toLowerCase()} `;
  const toks = new Set(tokens(text));
  const out = {};
  for (const [k, list] of Object.entries(taxonomy)) {
    out[k] = list.filter((term) => {
      if (lower.includes(term.toLowerCase())) return true;
      const tt = tokens(term);
      return tt.length > 0 && tt.every((t) => toks.has(t));
    });
  }
  return out;
}

export function questionsFromDoc(doc) {
  const out = [];
  for (const p of doc.pages || []) {
    p.paras.forEach((t, i) => {
      const m = String(t).match(/^(Q\s?\d{1,3}[a-z]?)\s*[\t:.\-–]\s*(.+)$/i);
      if (m) out.push({ id: `${doc.id}:${m[1]}`, ref: m[1].replace(/\s/g, ''), text: m[2].trim(), src: { docId: doc.id, page: p.n, para: i + 1 } });
      else if (/\?\s*$/.test(t) && t.length > 20) out.push({ id: `${doc.id}:${p.n}:${i}`, ref: `Q${out.length + 1}`, text: t.trim(), src: { docId: doc.id, page: p.n, para: i + 1 } });
    });
  }
  return out;
}

export function acceptAllAi(html) {
  return String(html || '').replace(/<span data-ai="pending">([\s\S]*?)<\/span>/g, '$1');
}

export { parseHtml };
