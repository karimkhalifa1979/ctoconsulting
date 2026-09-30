// Server-side AI for the Proposal Platform (spec 9.1, 10 and 16). Claude writes only from the sources it is given:
// approved library content (anonymised where the client has not consented), the bid's requirements and approved
// sections. Every sentence returns the source IDs it relies on; sentences without a source are flagged
// "needs evidence" and all AI text stays labelled until a person accepts or edits it. Without an API key, or if a
// call fails, the offline engines in src/proposals/core produce the same structures.
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { draftSection, executiveSummary, shorten, strengthen, tailorCaseStudy, checkAgainstRequirements, bulkAnswer, suggestMetadata, retrieve, clientShort, renderBlocks, PROMPT_VERSION } from '../src/proposals/core/drafting.js';
import { extractRequest } from '../src/proposals/core/extract.js';
import { buildBrief, prefillScorecard } from '../src/proposals/core/qualify.js';
import { buildStoryboard, rehearsalPack, overflowIssues, CAPACITY, DECK_PROMPT_VERSION } from '../src/proposals/core/deck.js';
import { topBlocks, blockSentences, textOf } from '../src/proposals/core/html.js';
import { otherClientNames, clientConsented } from '../src/proposals/core/checks.js';
import { htmlToText, wordCount, truncate } from '../src/proposals/core/util.js';

const CLAUDE_ACTIONS = new Set(['draft', 'exec_summary', 'shorten', 'strengthen', 'tailor', 'storyboard']);
const ACTIONS = new Set([...CLAUDE_ACTIONS, 'check', 'bulk_answer', 'extract', 'brief', 'scorecard', 'metadata', 'rehearsal']);
const CLAUDE_PROMPT = { draft: 'draft-claude-2026.09.1', exec_summary: 'exec-claude-2026.09.1', shorten: 'shorten-claude-2026.09.1', strengthen: 'strengthen-claude-2026.09.1', tailor: 'tailor-claude-2026.09.1', storyboard: 'deck-claude-2026.09.1' };
// USD per million tokens (input, output) for cost reporting on the AI usage dashboard.
const PRICES = [[/opus-5-5|sonnet-5|sonnet-4/, [4, 20]], [/opus/, [5, 25]], [/haiku/, [1, 5]], [/fable|mythos/, [10, 50]]];
const priceOf = (m) => (PRICES.find(([re]) => re.test(m || '')) || [null, [4, 20]])[1];

const SENTENCE = { type: 'object', properties: { text: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } } }, required: ['text', 'sources'], additionalProperties: false };
const BLOCKS_SCHEMA = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['heading', 'paragraph', 'list'] },
          heading: { type: 'string' },
          sentences: { type: 'array', items: SENTENCE },
          items: { type: 'array', items: { type: 'object', properties: { sentences: { type: 'array', items: SENTENCE } }, required: ['sentences'], additionalProperties: false } },
        },
        required: ['kind', 'heading', 'sentences', 'items'],
        additionalProperties: false,
      },
    },
  },
  required: ['blocks'],
  additionalProperties: false,
};
const DECK_SCHEMA = {
  type: 'object',
  properties: { slides: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, points: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } }, required: ['id', 'title', 'points', 'notes'], additionalProperties: false } } },
  required: ['slides'],
  additionalProperties: false,
};

const RULES = `Rules you must follow:
- Use only facts found in the numbered sources. Never invent clients, numbers, certifications, dates or people.
- Every sentence lists the IDs of the sources that support it. A sentence that no source supports gets an empty sources list; the platform flags it "needs evidence" for a person to resolve. Prefer fewer, supported sentences.
- Australian English spelling (organisation, prioritise, programme only for broadcast; use "program"). Plain, confident, active voice. Short sentences.
- Write about CTO Consulting in the first person plural ("we").
- Do not name any organisation listed under "Do not name". Use the anonymised wording the sources already use.`;

function styleText(view) {
  const g = view.settings.styleGuide || {};
  return `Tone: ${g.tone || ''}\nNever use: ${(g.bannedPhrases || []).join(', ')}\nPreferred terms: ${(g.preferredTerms || []).map((t) => `"${t.use}" not "${t.avoid}"`).join('; ')}`;
}

// Other clients' names that must not appear. Only names that occur in the text being sent are listed, so the
// request carries no more client information than the sources themselves.
function blockedNames(view, bid, text = '') {
  const t = String(text).toLowerCase();
  return otherClientNames(view, bid)
    .filter((n) => !clientConsented(view, bid, view.clients.find((c) => c.id === n.clientId)?.name || n.name))
    .map((n) => n.name)
    .filter((name) => t.includes(name.toLowerCase()));
}

// Converts the model's blocks into the platform's block structure, resolving source IDs to citations.
function toBlocks(data, cites) {
  const sent = (s) => {
    const cs = [...new Map((s.sources || []).map((id) => cites[id]).filter(Boolean).map((c) => [c.src, c])).values()];
    return { text: String(s.text || '').trim(), cites: cs, flag: !cs.length };
  };
  const out = [];
  for (const b of data.blocks || []) {
    if (b.kind === 'heading' && b.heading?.trim()) out.push({ type: 'h3', text: b.heading.trim() });
    else if (b.kind === 'list') { const items = (b.items || []).map((it) => ({ sentences: (it.sentences || []).map(sent).filter((s) => s.text) })).filter((it) => it.sentences.length); if (items.length) out.push({ type: 'ul', items }); }
    else { const sentences = (b.sentences || []).map(sent).filter((s) => s.text); if (sentences.length) out.push({ type: 'p', sentences }); }
  }
  return out;
}

function statsOf(blocks) {
  let sentences = 0, cited = 0, flagged = 0, words = 0;
  const each = (s) => { sentences++; words += wordCount(s.text); if (s.cites?.length) cited++; if (s.flag) flagged++; };
  for (const b of blocks) {
    if (b.text) words += wordCount(b.text);
    (b.sentences || []).forEach(each);
    for (const it of b.items || []) it.sentences.forEach(each);
  }
  return { sentences, cited, flagged, words };
}

function sourcesOf(blocks) {
  const m = new Map();
  for (const b of blocks) {
    for (const s of b.sentences || []) (s.cites || []).forEach((c) => m.set(c.src, c));
    for (const it of b.items || []) for (const s of it.sentences) (s.cites || []).forEach((c) => m.set(c.src, c));
  }
  return [...m.values()];
}

// Turns existing section HTML into numbered text with its citations, so rewrites keep their sources.
function numberedFromHtml(html, cites, prefix = 'E') {
  const lines = [];
  let n = 0;
  const idFor = new Map();
  for (const b of topBlocks(html)) {
    if (b.name === 'h2' || b.name === 'h3') { lines.push(`## ${textOf(b).trim()}`); continue; }
    const sents = ['p', 'ul', 'ol'].includes(b.name) ? blockSentences(b) : [];
    const parts = sents.map((x) => {
      const ids = x.cites.map((c) => {
        if (!idFor.has(c.src)) { n += 1; idFor.set(c.src, `${prefix}${n}`); cites[`${prefix}${n}`] = c; }
        return idFor.get(c.src);
      });
      return `${x.text}${ids.length ? ` [${ids.join(', ')}]` : ''}`;
    });
    if (parts.length) lines.push(`${b.name === 'p' ? '' : '- '}${parts.join(' ')}`);
  }
  return lines.join('\n\n');
}

export function createProposalAi({ client, model, enabled }) {
  async function callJson({ system, prompt, schema, effort = 'medium', maxTokens = 16000 }) {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort, format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new Error('The model declined this request.');
    if (msg.stop_reason === 'max_tokens') throw new Error('The response exceeded the output limit.');
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { data: JSON.parse(text), usage: msg.usage || {}, model: msg.model || model };
  }

  const SYSTEM = (view) => `You write sections of competitive proposals for ${view.settings.orgName || 'CTO Consulting'}, an Australian digital transformation consultancy (${view.settings.website || 'www.ctoconsulting.com.au'}). You ground every claim in the sources provided and cite them.\n\n${RULES}\n\nStyle guide:\n${styleText(view)}`;

  const claude = {
    async draft({ view, bid, section, p }) {
      const reqs = bid.requirements.filter((r) => (r.sectionIds || []).includes(section.id) && !r.excluded);
      const query = [section.title, section.brief, ...reqs.map((r) => r.text)].join(' ');
      const lib = retrieve(view, bid, query, { limit: 10 });
      const team = (bid.staffing || []).map((l) => ({ l, c: view.consultants.find((c) => c.id === l.consultantId) })).filter((x) => x.c);
      const cites = {};
      const src = [];
      lib.forEach((c, i) => { const id = `S${i + 1}`; cites[id] = { src: `lib:${c.item.id}@${c.v}`, label: c.item.key, kind: 'library' }; src.push(`[${id}] ${c.item.key} “${c.title}” (${c.item.type.replace('_', ' ')}):\n${truncate(c.text, 2400)}`); });
      reqs.forEach((r) => { const id = `R-${r.ref}`; cites[id] = { src: `req:${r.id}`, label: r.ref, kind: 'request' }; src.push(`[${id}] Client requirement ${r.ref} (${r.kind}): ${r.text}`); });
      team.forEach(({ l, c }, i) => { const id = `C${i + 1}`; cites[id] = { src: `con:${c.id}`, label: c.name, kind: 'consultant' }; src.push(`[${id}] Proposed team member ${c.name}, ${l.role} (${c.level}, clearance ${c.clearance}): ${c.bio}`); });
      const limit = p.wordLimit || section.wordLimit || 600;
      const existing = p.mode === 'replace' ? '' : htmlToText(p.html || '');
      const prompt = `Client: ${view.clients.find((c) => c.id === bid.clientId)?.name} (${clientShort(view, bid)})
Opportunity: ${bid.title}${bid.clientRef ? ` (${bid.clientRef})` : ''}
Section: ${section.title}
Brief: ${section.brief || '—'}
Word limit: ${limit} words for the whole section${existing ? ` (about ${Math.max(0, limit - wordCount(existing))} words remain)` : ''}.
Win themes: ${(bid.plan?.winThemes || []).join('; ') || '—'}
Do not name: ${blockedNames(view, bid, `${src.join(' ')} ${existing}`).join(', ') || '—'}

Sources:
${src.join('\n\n') || '(no approved library content matched this section)'}
${existing ? `\nThe section already contains this text. Add to it without repeating any of it:\n${truncate(existing, 6000)}\n` : ''}
Write ${existing ? 'additional content for' : ''} this section. Address each linked client requirement explicitly, restating it as our commitment and supporting it with evidence from the library sources. Use short "heading" blocks only where they help the evaluator. Return the blocks.`;
      const r = await callJson({ system: SYSTEM(view), prompt, schema: BLOCKS_SCHEMA, effort: 'medium' });
      const blocks = toBlocks(r.data, cites);
      return { res: { html: renderBlocks(blocks), sources: sourcesOf(blocks), stats: statsOf(blocks) }, r, sources: Object.values(cites).map((c) => c.src) };
    },

    async exec_summary({ view, bid, section }) {
      const cites = {};
      const src = [];
      bid.sections.filter((s) => s.id !== section?.id && !/exec/i.test(`${s.key} ${s.title}`) && wordCount(htmlToText(s.content)) > 20).forEach((s, i) => {
        const id = `T${i + 1}`;
        cites[id] = { src: `sec:${s.id}`, label: s.title, kind: 'section' };
        src.push(`[${id}] Section “${s.title}” (${s.status.replace('_', ' ')}):\n${truncate(htmlToText(s.content), 2600)}`);
      });
      const prompt = `Client: ${view.clients.find((c) => c.id === bid.clientId)?.name}\nOpportunity: ${bid.title}\nWin themes: ${(bid.plan?.winThemes || []).join('; ') || '—'}\nWord limit: ${section?.wordLimit || 500}\nEvaluation criteria: ${bid.criteria.map((c) => `${c.name}${c.weight ? ` (${c.weight}%)` : ''}`).join('; ') || '—'}\nDo not name: ${blockedNames(view, bid, src.join(' ')).join(', ') || '—'}\n\nSources (the response's own sections):\n${src.join('\n\n')}\n\nWrite the executive summary: open with what the client gets, organise the body around the win themes and the highest-weighted criteria, and close with a clear commitment. Cite the sections each sentence draws on.`;
      const r = await callJson({ system: SYSTEM(view), prompt, schema: BLOCKS_SCHEMA, effort: 'medium' });
      const blocks = toBlocks(r.data, cites);
      return { res: { html: renderBlocks(blocks), sources: sourcesOf(blocks), stats: statsOf(blocks) }, r, sources: Object.values(cites).map((c) => c.src) };
    },

    async shorten({ view, bid, section, p }) {
      const cites = {};
      const text = numberedFromHtml(p.html, cites);
      const limit = p.limit || section?.wordLimit || Math.round(wordCount(htmlToText(p.html)) * 0.8);
      const prompt = `Shorten this section to at most ${limit} words (it is ${wordCount(htmlToText(p.html))} words now). Keep every commitment to a client requirement and the strongest evidence. Keep each sentence's source IDs (shown in brackets) on the sentences that still rely on them. Do not add facts.\nDo not name: ${blockedNames(view, bid, text).join(', ') || '—'}\n\n${text}`;
      const r = await callJson({ system: SYSTEM(view), prompt, schema: BLOCKS_SCHEMA, effort: 'low' });
      const blocks = toBlocks(r.data, cites);
      return { res: { html: renderBlocks(blocks), sources: sourcesOf(blocks), stats: statsOf(blocks) }, r, sources: Object.values(cites).map((c) => c.src) };
    },

    async strengthen({ view, bid, section, p }) {
      const cites = {};
      const text = numberedFromHtml(p.html, cites);
      const reqs = bid.requirements.filter((r) => (r.sectionIds || []).includes(section.id) && !r.excluded);
      reqs.forEach((r) => { cites[`R-${r.ref}`] = { src: `req:${r.id}`, label: r.ref, kind: 'request' }; });
      const crit = bid.criteria.filter((c) => reqs.some((r) => r.criterionId === c.id));
      const prompt = `Strengthen this section against the client's evaluation criteria${crit.length ? `: ${crit.map((c) => `${c.name}${c.weight ? ` (${c.weight}%)` : ''}${c.description ? ` — ${c.description}` : ''}`).join('; ')}` : ''}.
Linked requirements: ${reqs.map((r) => `[R-${r.ref}] ${r.text}`).join(' ') || '—'}
Make benefits explicit, lead with outcomes, answer each requirement in the evaluator's words, and move the strongest evidence forward. Keep the source IDs in brackets on the sentences that rely on them; do not add facts that no source supports. Stay within ${section.wordLimit || 'the current'} words.
Do not name: ${blockedNames(view, bid, text).join(', ') || '—'}

${text}`;
      const r = await callJson({ system: SYSTEM(view), prompt, schema: BLOCKS_SCHEMA, effort: 'medium' });
      const blocks = toBlocks(r.data, cites);
      return { res: { html: renderBlocks(blocks), sources: sourcesOf(blocks), stats: statsOf(blocks) }, r, sources: Object.values(cites).map((c) => c.src) };
    },

    async tailor({ view, bid, p }) {
      const base = tailorCaseStudy(view, bid, view.library.find((i) => i.id === p.itemId));
      const c = base.sources?.find((x) => x.kind === 'library');
      const cites = c ? { S1: c } : {};
      const prompt = `Tailor this case study for ${view.clients.find((x) => x.id === bid.clientId)?.name} (${bid.title}). Emphasise what is relevant to the client's requirements: ${bid.requirements.filter((r) => r.kind === 'mandatory').slice(0, 8).map((r) => r.text).join(' ')}\nUse only the case study's facts. Cite [S1] on every sentence drawn from it.\nDo not name: ${blockedNames(view, bid, base.html).join(', ') || '—'}\n\n[S1] ${htmlToText(base.html)}`;
      const r = await callJson({ system: SYSTEM(view), prompt, schema: BLOCKS_SCHEMA, effort: 'low' });
      const blocks = toBlocks(r.data, cites);
      return { res: { ...base, html: renderBlocks(blocks), sources: sourcesOf(blocks), stats: statsOf(blocks) }, r, sources: Object.values(cites).map((x) => x.src) };
    },

    async storyboard({ view, bid, p }) {
      const recipe = view.recipes.find((x) => x.id === p.recipeId) || view.recipes[0];
      const base = buildStoryboard(view, bid, recipe, { include: p.include });
      const slides = base.slides.filter((s) => s.include !== false && !['title', 'questions'].includes(s.kind));
      const prompt = `Improve this presentation storyboard for ${view.clients.find((x) => x.id === bid.clientId)?.name} (${bid.title}).
For each slide: an action title that states the slide's message (at most ${CAPACITY.title} characters), ${CAPACITY.minPoints} to ${CAPACITY.points} points (each at most ${CAPACITY.point} characters), and speaker notes of 60 to 150 words. Use only the facts already in each slide's points and notes. Return every slide ID.
Do not name: ${blockedNames(view, bid, JSON.stringify(slides)).join(', ') || '—'}

${slides.map((s) => `Slide ${s.id} (${s.kind}):\nTitle: ${s.title}\nPoints:\n${(s.points || []).map((x) => `- ${x}`).join('\n')}\nNotes: ${truncate(s.notes || '', 1500)}`).join('\n\n')}`;
      const r = await callJson({ system: SYSTEM(view), prompt, schema: DECK_SCHEMA, effort: 'medium' });
      const byId = new Map((r.data.slides || []).map((s) => [s.id, s]));
      const out = base.slides.map((s) => {
        const x = byId.get(s.id);
        if (!x) return s;
        const next = { ...s, title: x.title || s.title, points: (x.points || []).filter(Boolean).length && !['team', 'timeline', 'plan'].includes(s.kind) ? x.points.filter(Boolean) : s.points, notes: x.notes || s.notes };
        return { ...next, overflow: overflowIssues(next) };
      });
      return { res: { ...base, slides: out, engine: 'claude', model: r.model, promptVersion: CLAUDE_PROMPT.storyboard }, r, sources: [] };
    },
  };

  function offline(action, { view, bid, section, p }) {
    const reqs = bid ? bid.requirements.filter((r) => (p.reqIds || []).includes(r.id)) : [];
    switch (action) {
      case 'draft': return draftSection(view, bid, section, { wordLimit: p.wordLimit, existing: p.mode === 'replace' ? '' : p.html });
      case 'exec_summary': return executiveSummary(view, bid, section);
      case 'shorten': return shorten(p.html || '', p.limit, { title: section?.title });
      case 'strengthen': return strengthen(p.html || '', bid, section);
      case 'tailor': return tailorCaseStudy(view, bid, view.library.find((i) => i.id === p.itemId));
      case 'check': return { results: checkAgainstRequirements(p.html || '', reqs) };
      case 'bulk_answer': return { answers: bulkAnswer(view, bid, p.questions || []) };
      case 'extract': return extractRequest(bid.documents.filter((d) => (p.docIds || []).includes(d.id)), { clients: view.clients });
      case 'brief': return buildBrief(view, bid);
      case 'scorecard': return prefillScorecard(view, bid);
      case 'metadata': return { tags: suggestMetadata(p.text || '', view.taxonomy) };
      case 'storyboard': return buildStoryboard(view, bid, view.recipes.find((x) => x.id === p.recipeId) || view.recipes[0], { include: p.include });
      case 'rehearsal': return { questions: rehearsalPack(view, bid) };
      default: throw new Error(`Unknown AI action: ${action}`);
    }
  }

  return {
    async handle(p, { view }) {
      const action = p.action;
      if (!ACTIONS.has(action)) throw Object.assign(new Error(`Unknown AI action: ${action}`), { status: 400 });
      const bid = p.bidId ? view.bids.find((b) => b.id === p.bidId) : null;
      if (p.bidId && !bid) throw Object.assign(new Error('Bid not found or not visible to you.'), { status: 404 });
      if (!bid && action !== 'metadata') throw Object.assign(new Error('This action needs a bid.'), { status: 400 });
      if (bid && bid.aiEnabled === false && action !== 'extract') throw Object.assign(new Error('AI is switched off for this bid because the client prohibits its use.'), { status: 403 });
      const section = p.sectionId ? bid?.sections.find((s) => s.id === p.sectionId) : null;
      if (['draft', 'strengthen'].includes(action) && !section) throw Object.assign(new Error('Section not found.'), { status: 404 });
      const t0 = Date.now();
      const ctx = { view, bid, section, p };
      let res, engine = 'offline', usedModel = null, usage = null, sources = [], fallbackReason = null;
      if (enabled && client && CLAUDE_ACTIONS.has(action)) {
        try {
          const out = await claude[action](ctx);
          res = out.res; engine = 'claude'; usedModel = out.r.model; usage = out.r.usage; sources = out.sources;
        } catch (e) {
          fallbackReason = e instanceof Anthropic.APIError ? `Claude unavailable (${e.status || 'error'})` : `Claude output could not be used (${e.message})`;
        }
      }
      if (!res) res = offline(action, ctx);
      const [pin, pout] = priceOf(usedModel);
      const inputTokens = usage ? (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0) : null;
      const costUsd = usage ? Math.round(((usage.input_tokens || 0) * pin + (usage.cache_read_input_tokens || 0) * pin * 0.1 + (usage.cache_creation_input_tokens || 0) * pin * 1.25 + (usage.output_tokens || 0) * pout) / 1e4) / 100 : 0;
      const input = JSON.stringify({ ...p, html: p.html ? `${p.html.length} chars` : null });
      const output = JSON.stringify(res).slice(0, 200000);
      const promptVersion = engine === 'claude' ? CLAUDE_PROMPT[action] : action === 'storyboard' ? DECK_PROMPT_VERSION : PROMPT_VERSION;
      const log = action === 'metadata' ? null : {
        bidId: bid?.id || null, sectionId: section?.id || null, action, engine, model: usedModel, promptVersion,
        inputHash: crypto.createHash('sha256').update(input).digest('hex'), outputHash: crypto.createHash('sha256').update(output).digest('hex'),
        inputChars: input.length + (p.html?.length || 0), outputChars: output.length, sources: ((res.sources || []).map((s) => s.src || s).concat(sources)).slice(0, 40),
        ms: Date.now() - t0, inputTokens, outputTokens: usage?.output_tokens ?? null, costUsd, ok: true,
        summary: fallbackReason ? `${fallbackReason}; used the offline engine.` : res.stats ? `${res.stats.words} words, ${res.stats.cited}/${res.stats.sentences} sentences cited` : '',
      };
      return { body: { result: { ...res, promptVersion, fallbackReason }, engine, model: usedModel, usage }, log };
    },
  };
}
