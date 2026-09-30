// AI actions. With a server that has an Anthropic key, Claude does the work (grounded in the same retrieval);
// otherwise the offline engines in core/ produce the same structures. Every call is logged (spec 16, AI governance).
import { draftSection, executiveSummary, shorten, strengthen, tailorCaseStudy, checkAgainstRequirements, bulkAnswer, suggestMetadata, PROMPT_VERSION } from '../core/drafting.js';
import { extractRequest } from '../core/extract.js';
import { buildBrief, prefillScorecard } from '../core/qualify.js';
import { buildStoryboard, rehearsalPack, DECK_PROMPT_VERSION } from '../core/deck.js';
import { sha256 } from '../core/sha256.js';
import { htmlWords } from '../core/util.js';

const BASE = import.meta.env.BASE_URL;
let infoPromise = null;

export function platformInfo(force = false) {
  if (!infoPromise || force) {
    infoPromise = fetch(`${BASE}api/health`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((j) => ({
      claude: Boolean(j.proposals?.ai ?? j.ai), model: j.proposals?.model || j.model || null, pdf: Boolean(j.proposals?.pdf), ocr: Boolean(j.proposals?.ocr), server: Boolean(j.proposals), embeddings: Boolean(j.proposals?.embeddings),
    }));
  }
  return infoPromise;
}

const OFFLINE = {
  draft: ({ view, bid, section, wordLimit, html, mode }) => draftSection(view, bid, section, { wordLimit, existing: mode === 'replace' ? '' : html }),
  exec_summary: ({ view, bid, section }) => executiveSummary(view, bid, section),
  shorten: ({ html, limit, section }) => ({ ...shorten(html, limit, { title: section?.title }) }),
  strengthen: ({ html, bid, section }) => strengthen(html, bid, section),
  tailor: ({ view, bid, item }) => tailorCaseStudy(view, bid, item),
  check: ({ html, reqs }) => ({ results: checkAgainstRequirements(html, reqs) }),
  bulk_answer: ({ view, bid, questions }) => ({ answers: bulkAnswer(view, bid, questions) }),
  extract: ({ view, docs }) => extractRequest(docs, { clients: view.clients }),
  brief: ({ view, bid }) => buildBrief(view, bid),
  scorecard: ({ view, bid }) => prefillScorecard(view, bid),
  metadata: ({ view, text }) => ({ tags: suggestMetadata(text, view.taxonomy) }),
  storyboard: ({ view, bid, recipe, include }) => buildStoryboard(view, bid, recipe, { include }),
  rehearsal: ({ view, bid }) => ({ questions: rehearsalPack(view, bid) }),
};

const PROMPTS = { draft: PROMPT_VERSION, exec_summary: PROMPT_VERSION, shorten: PROMPT_VERSION, strengthen: PROMPT_VERSION, tailor: PROMPT_VERSION, storyboard: DECK_PROMPT_VERSION, extract: 'extract-2026.09.1' };

// Server payloads carry IDs only; the server rebuilds context from its own authorised state.
function serverPayload(action, p) {
  return {
    action, mode: p.mode || null, bidId: p.bid?.id || null, sectionId: p.section?.id || null, itemId: p.item?.id || null, html: p.html ?? null, limit: p.limit ?? null, wordLimit: p.wordLimit ?? null,
    docIds: p.docs?.map((d) => d.id) || null, questions: p.questions || null, recipeId: p.recipe?.id || null, include: p.include || null, reqIds: p.reqs?.map((r) => r.id) || null, text: p.text ?? null,
  };
}

export async function runAi(action, params, { backend, dispatch, allowClaude = true } = {}) {
  const { bid } = params;
  if (bid && bid.aiEnabled === false && action !== 'extract') throw new Error('AI is switched off for this bid because the client prohibits its use.');
  const info = await platformInfo();
  const t0 = performance.now();
  let res = null, engine = 'offline', model = null, usage = null, error = null;
  if (allowClaude && info.claude && backend?.mode === 'server' && !(bid && bid.aiEnabled === false)) {
    try {
      const r = await fetch(`${BASE}api/p/ai`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serverPayload(action, params)) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `AI request failed (${r.status})`);
      res = j.result;
      engine = j.engine || 'claude';
      model = j.model || null;
      usage = j.usage || null;
      // The server logs its own calls.
      return { ...res, engine, model, usage, logged: true };
    } catch (e) {
      error = e.message;
    }
  }
  const fn = OFFLINE[action];
  if (!fn) throw new Error(`Unknown AI action: ${action}`);
  res = await fn(params);
  const ms = Math.round(performance.now() - t0);
  const input = JSON.stringify(serverPayload(action, params));
  const output = JSON.stringify(res).slice(0, 200000);
  if (dispatch && action !== 'metadata') {
    dispatch('ai.log', {
      entry: {
        bidId: bid?.id || null, sectionId: params.section?.id || null, action, engine, model, promptVersion: PROMPTS[action] || 'offline-1', inputHash: sha256(input), outputHash: sha256(output),
        inputChars: input.length, outputChars: output.length, sources: (res.sources || []).map((s) => s.src || s).slice(0, 40), ms, costUsd: 0, ok: true,
        summary: error ? `Claude unavailable (${error}); used the offline engine.` : res.html ? `${htmlWords(res.html)} words` : '',
      },
    }).catch(() => {});
  }
  return { ...res, engine, model, usage, fallbackReason: error };
}
