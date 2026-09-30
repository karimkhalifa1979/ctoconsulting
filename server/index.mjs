// Production server: serves the built apps (dist/), the Proposal Platform API (/api/p/*) and optional AI endpoints.
// AI features are enabled when ANTHROPIC_API_KEY (or another Anthropic credential) is available.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { createProposalsApi } from './proposals.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(root, 'dist');
const PORT = Number(process.env.PORT) || 8080;
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const AI_ENABLED = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) && process.env.DISABLE_AI !== '1';
const client = AI_ENABLED ? new Anthropic() : null;
const proposals = createProposalsApi({ root, client, model: MODEL, aiEnabled: AI_ENABLED });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readJson(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// Runs a Claude request with server-side web search, continuing paused turns, and returns the final text.
async function runClaude({ system, prompt, webSearch = false, effort = 'medium' }) {
  const messages = [{ role: 'user', content: prompt }];
  const tools = webSearch ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }] : undefined;
  for (let turn = 0; turn < 4; turn++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort },
      system,
      tools,
      messages,
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new Error('The model declined this request.');
    if (msg.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: msg.content });
      continue;
    }
    return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
  throw new Error('The research did not complete in the allowed number of turns.');
}

function extractJson(text) {
  const tagged = text.match(/<result>([\s\S]*?)<\/result>/);
  const raw = tagged ? tagged[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(raw.replace(/^```(?:json)?|```$/gm, '').trim());
}

const DISCOVER_SYSTEM = `You are a regulatory compliance analyst at CTO Consulting, an Australian digital transformation consultancy.
You identify the legislation, regulations, mandatory government policies and industry standards that apply to an organisation's ICT, information and cyber security obligations.
Be accurate and conservative: only claim an obligation applies when there is a clear basis, and say "conditional" when it depends on an activity you cannot confirm.`;

async function discover(body) {
  const { name, profile, catalogue = [], templates = [], profileOptions = {} } = body;
  if (!name || typeof name !== 'string') throw new Error('Organisation name is required');
  const prompt = `Research the organisation "${name.slice(0, 200)}" and determine which regulatory obligations and standards apply to it.

Current draft profile (from keyword inference — correct it where your research shows otherwise):
${JSON.stringify(profile || {}, null, 1)}

Allowed profile values:
${JSON.stringify(profileOptions)}

Known catalogue of obligation sources (use these exact names when selecting):
${catalogue.map((c) => `- ${c}`).join('\n')}

Policy requirement templates that additional obligations must map to (id — title):
${templates.map((t) => `${t.id} — ${t.title}`).join('\n')}

Steps:
1. Use web search to confirm what the organisation is: legal form, sector, jurisdictions, services, scale, whether it is regulated by APRA/ASIC/AUSTRAC, owns critical infrastructure, handles health or payment card data, uses AI, operates overseas.
2. Select every catalogue source that applies, with level "mandatory", "conditional" or "recommended" and a one-sentence reason specific to this organisation.
3. Propose up to 8 additional sources NOT in the catalogue that clearly apply (for example sector-specific legislation or state instruments), each with 2–5 concrete obligations mapped to the closest template id.

Return only this JSON inside <result></result> tags:
{"summary": "2–3 sentence description of the organisation and its regulatory position",
 "profile": {"sectorType": "...", "industries": ["..."], "states": ["..."], "international": ["..."], "flags": {"flagId": true}},
 "catalogue": [{"name": "exact catalogue name", "level": "mandatory|conditional|recommended", "reason": "..."}],
 "additional": [{"name": "...", "publisher": "...", "type": "Legislation|Regulation|Mandatory policy|Standard|Guidance", "url": "https://...", "level": "mandatory|conditional|recommended", "reason": "...",
   "obligations": [{"id": "SHORT-01", "reference": "section or clause", "description": "what the organisation must do", "req": "template id"}]}]}`;
  const text = await runClaude({ system: DISCOVER_SYSTEM, prompt, webSearch: true, effort: 'medium' });
  const result = extractJson(text);
  const catNames = new Set(catalogue);
  const templateIds = new Set(templates.map((t) => t.id));
  const levels = new Set(['mandatory', 'conditional', 'recommended']);
  return {
    summary: String(result.summary || ''),
    profile: result.profile || null,
    catalogue: (result.catalogue || []).filter((c) => catNames.has(c.name) && levels.has(c.level)),
    additional: (result.additional || []).filter((a) => a.name && !catNames.has(a.name) && levels.has(a.level)).slice(0, 8).map((a) => ({
      ...a,
      obligations: (a.obligations || []).filter((o) => o.description && templateIds.has(o.req)).slice(0, 6),
    })).filter((a) => a.obligations.length),
  };
}

async function policy(body) {
  const { orgName, policyTitle, heading, html, context } = body;
  if (!heading || !html) throw new Error('Section heading and content are required');
  const prompt = `Rewrite the "${heading}" section of the ${policyTitle} for ${orgName}.
Keep every obligation, requirement ID, role, date and fact. Improve clarity, flow and tone so it reads as a formal, plain-English policy document. Use "must" for mandatory requirements.
Return only an HTML fragment using <p>, <ul>, <li>, <ol>, <strong>, <em>, <h3>, <table>, <thead>, <tbody>, <tr>, <th>, <td> inside <result></result> tags.

Context: ${String(context || '').slice(0, 4000)}

Current section HTML:
${String(html).slice(0, 60000)}`;
  const text = await runClaude({ system: 'You are an expert policy writer at CTO Consulting who writes clear, authoritative ICT and cyber security policies for Australian organisations.', prompt, effort: 'medium' });
  const m = text.match(/<result>([\s\S]*?)<\/result>/);
  const out = (m ? m[1] : text).replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
  return { html: out.trim() };
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/health') return send(res, 200, { ok: true, ai: AI_ENABLED, model: AI_ENABLED ? MODEL : null, proposals: proposals.health() });
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (!AI_ENABLED) return send(res, 503, { error: 'AI features are not configured on this server (set ANTHROPIC_API_KEY).' });
  try {
    const body = await readJson(req);
    if (pathname === '/api/ai/discover') return send(res, 200, await discover(body));
    if (pathname === '/api/ai/policy') return send(res, 200, await policy(body));
    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'Rate limited by the AI service — try again shortly.' });
    if (e instanceof Anthropic.AuthenticationError) return send(res, 502, { error: 'The AI service rejected the configured credentials.' });
    if (e instanceof Anthropic.APIError) return send(res, 502, { error: `AI service error: ${e.message}` });
    return send(res, 400, { error: e.message });
  }
}

function serveStatic(res, pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) return send(res, 403, 'Forbidden', 'text/plain');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) return send(res, 500, 'Build the app first: npm run build', 'text/plain');
  const ext = path.extname(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  if (pathname.startsWith('/api/p/')) return void proposals.handle(req, res, pathname, searchParams);
  if (pathname.startsWith('/api/')) return void handleApi(req, res, pathname);
  serveStatic(res, pathname);
}).listen(PORT, () => {
  console.log(`CTO Consulting tools on http://localhost:${PORT} (AI ${AI_ENABLED ? `enabled, ${MODEL}` : 'disabled'})`);
  console.log(`  Regulatory Assessment: http://localhost:${PORT}/   Proposal Platform: http://localhost:${PORT}/proposals.html`);
});

// Save pending Proposal Platform state before the process stops.
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { proposals.flush(); process.exit(0); });
