// Production server: serves the built app (dist/) and the optional AI endpoint used to refine
// business-case narrative (GDA-03). AI is enabled when an Anthropic credential is available;
// without one the platform runs entirely on its rules engine.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(root, 'dist');
const PORT = Number(process.env.PORT) || 8081;
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const AI_ENABLED = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) && process.env.DISABLE_AI !== '1';
const client = AI_ENABLED ? new Anthropic() : null;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readJson(req, limit = 500_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Request too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

const SYSTEM = `You are a senior value-management consultant at CTO Consulting, an Australian consultancy. You write business cases in clear, plain Australian English for executive investment boards.
You improve the wording of a section of a business case that was drafted automatically from program data.
Rules: keep every figure, percentage, date, name and claim exactly as given; never invent numbers, benefits, risks or facts; keep it concise and decision-focused; no headings, bullet points or markdown — plain paragraphs separated by a blank line.`;

// Rewrites one narrative section. Refusal fallback is enabled server-side (fallbacks: "default").
async function narrative(body) {
  const { section, text, program, org, context } = body;
  if (!text || typeof text !== 'string') throw new Error('Section text is required');
  const prompt = `Organisation: ${String(org || '').slice(0, 200)}
Program: ${String(program || '').slice(0, 200)}
Section: ${String(section || '').slice(0, 200)}
Key figures (JSON, for consistency only): ${String(context || '').slice(0, 4000)}

Current draft:
${text.slice(0, 20000)}

Return only the improved section inside <result></result> tags.`;
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('The model declined to rewrite this section.');
  const out = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const m = out.match(/<result>([\s\S]*?)<\/result>/);
  return { text: (m ? m[1] : out).trim(), model: msg.model };
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/health') return send(res, 200, { ok: true, ai: AI_ENABLED, model: AI_ENABLED ? MODEL : null });
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (!AI_ENABLED) return send(res, 503, { error: 'AI assistance is not configured on this server (set ANTHROPIC_API_KEY).' });
  try {
    const body = await readJson(req);
    if (pathname === '/api/ai/narrative') return send(res, 200, await narrative(body));
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
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname.startsWith('/api/')) return void handleApi(req, res, pathname);
  serveStatic(res, pathname);
}).listen(PORT, () => {
  console.log(`CTO Consulting Benefits Realisation Platform on http://localhost:${PORT} (AI ${AI_ENABLED ? `enabled, ${MODEL}` : 'disabled'})`);
});
