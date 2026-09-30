// Proposal Platform API (/api/p/*). The server owns the state: every command is executed here with the signed-in
// user's permissions (the browser's checks are only for display), every read is filtered through viewFor (bid
// membership, ethical walls, cost redaction), and every action lands in the hash-chained audit trail.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { execute, appendAudit, PermissionError } from '../src/proposals/core/commands.js';
import { viewFor, query as runQuery } from '../src/proposals/core/view.js';
import { buildSeed } from '../src/proposals/core/seed/index.js';
import { canSeeBid, userOf } from '../src/proposals/core/permissions.js';
import { todayISO } from '../src/proposals/core/util.js';
import { createProposalAi } from './proposalsAi.mjs';

const SCHEMA = 1;
const IDLE_MS = 30 * 60 * 1000;
const MAX_SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_FILE = 200 * 1024 * 1024;
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const has = (cmd) => spawnSync('which', [cmd], { encoding: 'utf8' }).status === 0;

export function createProposalsApi({ root, client = null, model = null, aiEnabled = false } = {}) {
  const DATA = path.resolve(process.env.PROPOSALS_DATA_DIR || path.join(root, 'data', 'proposals'));
  const FILES = path.join(DATA, 'files');
  const STATE_FILE = path.join(DATA, 'state.json');
  fs.mkdirSync(FILES, { recursive: true });
  const demoSignIn = process.env.DEMO_SIGNIN !== '0';
  const tools = { pdf: has('soffice'), pdftotext: has('pdftotext'), ocr: has('tesseract') };

  // ---------- State ----------
  let state = null;
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (s.schema === SCHEMA) state = s;
  } catch { /* first run */ }
  if (!state) { state = buildSeed(); writeNow(); }
  let saveTimer = null;
  function writeNow() {
    const tmp = `${STATE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, STATE_FILE);
  }
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveTimer = null; writeNow(); }, 150); }
  function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; writeNow(); } }
  process.on('exit', () => { try { flush(); } catch (e) { console.error('Could not save proposal state:', e.message); } });
  const run = (actorId, cmd, args) => {
    const r = execute(state, actorId, cmd, args);
    if (r.changed) { state = r.state; save(); broadcast({ type: 'version', version: state.version }); }
    return r.result;
  };

  // ---------- Sessions (demonstration sign-in; Entra ID OIDC replaces it in production) ----------
  const sessions = new Map();
  const cookieOf = (req) => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
  function sessionOf(req) {
    const sid = cookieOf(req).cto_pp;
    const s = sid && sessions.get(sid);
    if (!s) return null;
    const now = Date.now();
    if (now - s.last > IDLE_MS || now - s.at > MAX_SESSION_MS) { sessions.delete(sid); return null; }
    s.last = now;
    const u = userOf(state, s.userId);
    if (!u || u.active === false) { sessions.delete(sid); return null; }
    return { sid, userId: s.userId };
  }
  const setCookie = (req, res, sid, maxAge) => {
    const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : '';
    res.setHeader('Set-Cookie', `cto_pp=${sid ? encodeURIComponent(sid) : ''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
  };

  // ---------- Live updates and presence ----------
  const streams = new Set();
  const presence = new Map();
  function broadcast(msg) {
    const data = `data: ${JSON.stringify(msg)}\n\n`;
    for (const s of streams) s.res.write(data);
  }
  function presenceList() {
    const now = Date.now();
    for (const [k, p] of presence) if (now - p.seen > 45000) presence.delete(k);
    return [...presence.values()];
  }

  // ---------- Scheduled jobs: reminders, escalations and the daily digest ----------
  const tick = () => {
    try {
      const hour = Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', hour12: false }).format(new Date()));
      if (state.jobs?.digest !== todayISO() && hour >= (state.settings.digestHour ?? 7)) run('system', 'jobs.run', {});
    } catch (e) { console.warn('Scheduled jobs failed:', e.message); }
  };
  setInterval(tick, 10 * 60 * 1000).unref();
  setTimeout(tick, 5000).unref();

  const ai = createProposalAi({ client, model, enabled: aiEnabled });

  // ---------- Files ----------
  async function putFile(req, userId, params) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_FILE) throw Object.assign(new Error('Files are limited to 200 MB.'), { status: 413 });
      chunks.push(c);
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.includes(Buffer.from(EICAR))) throw Object.assign(new Error('Upload blocked: the virus scan detected a threat.'), { status: 422 });
    const id = `file_${crypto.randomBytes(12).toString('hex')}`;
    const bidId = params.get('bidId') || null;
    if (bidId) {
      const bid = state.bids.find((b) => b.id === bidId);
      if (!bid || !canSeeBid(state, userId, bid)) throw Object.assign(new Error('You cannot add files to this bid.'), { status: 403 });
    }
    await fsp.writeFile(path.join(FILES, `${id}.bin`), bytes);
    await fsp.writeFile(path.join(FILES, `${id}.json`), JSON.stringify({ name: params.get('name') || 'file', type: params.get('type') || 'application/octet-stream', bidId, by: userId, at: new Date().toISOString(), size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }));
    return id;
  }
  async function getFile(id, userId) {
    if (!/^file_[a-f0-9]{24}$/.test(id)) return null;
    let meta;
    try { meta = JSON.parse(await fsp.readFile(path.join(FILES, `${id}.json`), 'utf8')); } catch { return null; }
    if (meta.bidId) {
      const bid = state.bids.find((b) => b.id === meta.bidId);
      if (!bid || !canSeeBid(state, userId, bid)) return { forbidden: true };
    }
    return { meta, bytes: await fsp.readFile(path.join(FILES, `${id}.bin`)) };
  }

  // ---------- PDF and PDF/A rendering with LibreOffice (WD-08) ----------
  let renderQueue = Promise.resolve();
  function renderPdf(bytes, { pdfa, ext }) {
    const job = renderQueue.then(async () => {
      const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cto-render-'));
      try {
        const src = path.join(dir, `input.${ext}`);
        await fsp.writeFile(src, bytes);
        const filter = ext === 'pptx' ? 'impress_pdf_Export' : 'writer_pdf_Export';
        const target = pdfa ? `pdf:${filter}:{"SelectPdfVersion":{"type":"long","value":"2"}}` : 'pdf';
        await new Promise((resolve, reject) => {
          const p = spawn('soffice', [`-env:UserInstallation=file://${path.join(dir, 'profile')}`, '--headless', '--norestore', '--convert-to', target, '--outdir', dir, src], { stdio: ['ignore', 'pipe', 'pipe'] });
          let err = '';
          p.stderr.on('data', (d) => { err += d; });
          const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('Rendering timed out.')); }, 180000);
          p.on('close', (code) => { clearTimeout(t); code === 0 ? resolve() : reject(new Error(`LibreOffice failed (${code}): ${err.slice(0, 300)}`)); });
        });
        const pdf = await fsp.readFile(path.join(dir, 'input.pdf'));
        let pages = null, bodyPages = null;
        if (tools.pdftotext) {
          const text = spawnSync('pdftotext', ['-layout', path.join(dir, 'input.pdf'), '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout || '';
          const pageTexts = text.split('\f');
          if (pageTexts.length && !pageTexts[pageTexts.length - 1].trim()) pageTexts.pop();
          pages = pageTexts.length;
          // Body pages exclude the cover and contents pages, which page limits usually do not count.
          const tocLast = pageTexts.slice(0, 6).reduce((last, t, i) => (/^\s*(table of )?contents\s*$/im.test(t) ? i : last), -1);
          bodyPages = ext === 'docx' ? pages - (tocLast >= 0 ? tocLast + 1 : 1) : pages;
        } else {
          pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length || null;
        }
        return { pdf, pages, bodyPages };
      } finally {
        fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    });
    renderQueue = job.catch(() => {});
    return job;
  }

  // ---------- HTTP ----------
  const json = (res, code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }); res.end(JSON.stringify(body)); };
  const readJson = async (req, limit = 80 * 1024 * 1024) => {
    const chunks = [];
    let size = 0;
    for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('Request too large'), { status: 413 }); chunks.push(c); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
  };
  const sameOrigin = (req) => {
    const o = req.headers.origin;
    if (!o) return true;
    try { return new URL(o).host === req.headers.host; } catch { return false; }
  };
  const isAdmin = (userId) => userOf(state, userId)?.roles.includes('admin');

  async function handle(req, res, pathname, searchParams) {
    const route = pathname.slice('/api/p/'.length);
    if (req.method === 'POST' && !sameOrigin(req)) return json(res, 403, { error: 'Cross-origin request refused.' });
    const s = sessionOf(req);

    if (route === 'session') {
      // The demonstration sign-in picker lists the (fictitious) users; with Entra ID only, no directory is exposed.
      const users = demoSignIn ? state.users.filter((u) => u.active !== false).map((u) => ({ id: u.id, name: u.name, title: u.title, roles: u.roles, active: true })) : [];
      return json(res, 200, { mode: 'server', userId: s?.userId || null, demoSignIn, entra: Boolean(process.env.ENTRA_CLIENT_ID), users });
    }
    if (route === 'signin' && req.method === 'POST') {
      if (!demoSignIn) return json(res, 403, { error: 'Demonstration sign-in is disabled. Sign in with Microsoft Entra ID.' });
      const { userId } = await readJson(req, 10000);
      const u = userOf(state, userId);
      if (!u || u.active === false) return json(res, 400, { error: 'Unknown or inactive user.' });
      const sid = crypto.randomBytes(24).toString('hex');
      sessions.set(sid, { userId: u.id, at: Date.now(), last: Date.now() });
      setCookie(req, res, sid, MAX_SESSION_MS / 1000);
      return json(res, 200, { userId: u.id });
    }
    if (route === 'signout' && req.method === 'POST') {
      if (s) sessions.delete(s.sid);
      setCookie(req, res, '', 0);
      return json(res, 200, { ok: true });
    }
    if (!s) return json(res, 401, { error: 'Sign in to continue.' });
    const userId = s.userId;

    if (route === 'state') return json(res, 200, { view: viewFor(state, userId) });
    if (route === 'cmd' && req.method === 'POST') {
      const { cmd, args } = await readJson(req);
      if (typeof cmd !== 'string') return json(res, 400, { error: 'Missing command.' });
      const result = run(userId, cmd, args || {});
      return json(res, 200, { result, view: viewFor(state, userId) });
    }
    if (route.startsWith('query/') && req.method === 'POST') {
      const args = await readJson(req, 100000);
      return json(res, 200, { result: runQuery(state, userId, route.slice(6), args) });
    }
    if (route === 'events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`data: ${JSON.stringify({ type: 'version', version: state.version })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'presence', presence: presenceList() })}\n\n`);
      const entry = { res, userId };
      streams.add(entry);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); streams.delete(entry); });
      return undefined;
    }
    if (route === 'presence' && req.method === 'POST') {
      const where = await readJson(req, 5000);
      presence.set(`${s.sid}`, { userId, bidId: where.bidId || null, sectionId: where.sectionId || null, at: Date.now(), seen: Date.now(), tabId: s.sid.slice(0, 8) });
      broadcast({ type: 'presence', presence: presenceList() });
      return json(res, 200, { ok: true });
    }
    if (route === 'files' && req.method === 'POST') {
      const id = await putFile(req, userId, searchParams);
      return json(res, 200, { id });
    }
    if (route.startsWith('files/') && req.method === 'GET') {
      const f = await getFile(decodeURIComponent(route.slice(6)), userId);
      if (!f) return json(res, 404, { error: 'File not found.' });
      if (f.forbidden) return json(res, 403, { error: 'You do not have access to this file.' });
      res.writeHead(200, { 'Content-Type': f.meta.type || 'application/octet-stream', 'Content-Length': f.bytes.length, 'X-File-Name': encodeURIComponent(f.meta.name), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.meta.name)}` });
      return void res.end(f.bytes);
    }
    if (route === 'render' && req.method === 'POST') {
      if (!tools.pdf) return json(res, 503, { error: 'PDF rendering needs LibreOffice on the server.' });
      const chunks = [];
      let size = 0;
      for await (const c of req) { size += c.length; if (size > MAX_FILE) return json(res, 413, { error: 'File too large.' }); chunks.push(c); }
      const bytes = Buffer.concat(chunks);
      const name = decodeURIComponent(req.headers['x-file-name'] || 'document.docx');
      const ext = /\.pptx$/i.test(name) ? 'pptx' : 'docx';
      const r = await renderPdf(bytes, { pdfa: searchParams.get('format') === 'pdfa', ext });
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'X-Page-Count': String(r.pages ?? ''), 'X-Body-Pages': String(r.bodyPages ?? ''), 'Cache-Control': 'no-store', 'Access-Control-Expose-Headers': 'X-Page-Count, X-Body-Pages' });
      return void res.end(r.pdf);
    }
    if (route === 'ai' && req.method === 'POST') {
      const payload = await readJson(req, 20 * 1024 * 1024);
      const view = viewFor(state, userId);
      const out = await ai.handle(payload, { view, userId });
      if (out.log) run(userId, 'ai.log', { entry: out.log });
      return json(res, 200, out.body);
    }
    if (route === 'export' && req.method === 'GET') {
      if (!isAdmin(userId)) return json(res, 403, { error: 'Only administrators export platform data.' });
      return json(res, 200, { state });
    }
    if (route === 'import' && req.method === 'POST') {
      if (!isAdmin(userId)) return json(res, 403, { error: 'Only administrators import platform data.' });
      const { state: next } = await readJson(req, 500 * 1024 * 1024);
      if (!next?.bids || !next?.users || !next?.audit) return json(res, 400, { error: 'This is not a platform export.' });
      state = { ...next, schema: SCHEMA, version: (state.version || 0) + 1 };
      const u = userOf(state, userId);
      appendAudit(state, { at: new Date().toISOString(), actor: userId, actorName: u?.name || userId, action: 'platform.import', label: `Imported platform data (${state.bids.length} bids, ${state.library.length} library items)` });
      save(); broadcast({ type: 'version', version: state.version });
      return json(res, 200, { ok: true, auditHead: state.audit[state.audit.length - 1]?.hash || null });
    }
    if (route === 'reset' && req.method === 'POST') {
      if (!isAdmin(userId)) return json(res, 403, { error: 'Only administrators reset the platform.' });
      const v = state.version || 0;
      const u = userOf(state, userId);
      state = buildSeed();
      state.version = v + 1;
      appendAudit(state, { at: new Date().toISOString(), actor: userId, actorName: u?.name || userId, action: 'platform.reset', label: 'Reset the platform to the demonstration data' });
      save(); broadcast({ type: 'version', version: state.version });
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'Not found.' });
  }

  return {
    flush,
    health: () => ({ ai: aiEnabled, model: aiEnabled ? model : null, pdf: tools.pdf, ocr: tools.ocr, embeddings: false, demoSignIn }),
    async handle(req, res, pathname, searchParams) {
      try {
        await handle(req, res, pathname, searchParams);
      } catch (e) {
        if (res.headersSent) { res.end(); return; }
        const status = e.status || (e instanceof PermissionError || e.name === 'PermissionError' ? 403 : 400);
        json(res, status, { error: e.message || 'Request failed.' });
      }
    },
  };
}
