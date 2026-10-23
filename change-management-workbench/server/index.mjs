// Change Management Workbench server: REST API (INT-007), authentication (INT-001, SEC-01), static app
// hosting, background jobs (scheduled generation, locking, cadence alerts, retention) and integrations.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes } from 'node:crypto';
import { openDatabase } from './db.mjs';
import { createService } from '../shared/service/index.js';
import { hashPassword, verifyPassword, passwordProblems, createSessions, createTokenService, createOidc, mapIdpRoles } from './auth.mjs';
import { buildOpenApi } from './openapi.mjs';
import { startScheduler } from './scheduler.mjs';
import { createMailer } from './mailer.mjs';
import { AppError, uid, asArray } from '../shared/util.js';
import { roleLabel, can, canSeeSensitive } from '../shared/access.js';
import { ENTITIES } from '../shared/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const PORT = Number(env.PORT) || 8080;
const DIST = path.join(root, 'dist');
const VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const DEMO = env.CMW_DEMO === '1';
const SECURE_COOKIE = env.COOKIE_SECURE === '1';
const TRUST_PROXY = env.TRUST_PROXY === '1';

function log(level, msg, extra) {
  const line = { ts: new Date().toISOString(), level, msg, ...(extra !== undefined ? { detail: extra } : {}) };
  (level === 'error' ? console.error : console.log)(JSON.stringify(line));
}

const driver = openDatabase(env.CMW_DB || path.join(root, 'data', 'cmw.db'));
const mailer = await createMailer(env, log);
let aiModule = null;
const aiAvailable = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) && env.DISABLE_AI !== '1';
if (aiAvailable) aiModule = await import('./ai.mjs');

const service = createService({
  driver,
  env: {
    mode: 'server',
    version: VERSION,
    log,
    // Master size above which each initiative's working set holds only the stakeholders it uses (PER-04).
    ...(env.CMW_SCOPE_THRESHOLD ? { scopeThreshold: Number(env.CMW_SCOPE_THRESHOLD) } : {}),
    aiAvailable,
    emailAvailable: mailer.enabled,
    ssoAvailable: Boolean(env.OIDC_ISSUER),
    onNotify: async (n, S) => {
      const user = await S.driver.get('user', n.userId);
      if (!user || user.status !== 'active') return;
      const prefs = user.notify || {};
      if (prefs.email !== false && mailer.enabled) await mailer.send(user.email, `[Change Workbench] ${n.title}`, `${n.body || ''}\n\n${env.PUBLIC_URL || ''}`);
      if (env.TEAMS_WEBHOOK_URL && prefs.teams && ['approval', 'resistance', 'leaver'].includes(n.kind)) {
        fetch(env.TEAMS_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `**${n.title}**\n\n${n.body || ''}` }) }).catch(() => {});
      }
    },
    onEvent: async (event, payload, S) => deliverWebhooks(S, event, payload),
    publish: async (artefact, destination) => {
      // ART-017: publish to a folder (for example a synchronised SharePoint library) when configured.
      const dir = env.CMW_PUBLISH_DIR;
      if (destination === 'folder' && dir) {
        const target = path.join(dir, artefact.initiativeId, `${artefact.title} v${artefact.versionLabel}`.replace(/[^\w\- .]+/g, ''));
        fs.mkdirSync(target, { recursive: true });
        for (const f of artefact.files) {
          const b = await driver.getBlob(f.blobId);
          fs.writeFileSync(path.join(target, f.filename), b.bytes);
        }
        fs.writeFileSync(path.join(target, 'metadata.json'), JSON.stringify({ title: artefact.title, version: artefact.versionLabel, status: artefact.status, generatedAt: artefact.createdAt, classification: artefact.docControl?.classification }, null, 2));
        return { destination: 'folder', path: target };
      }
      return { destination: 'library', path: `Artefact library / ${artefact.title} / v${artefact.versionLabel}` };
    },
  },
});

async function deliverWebhooks(S, event, payload) {
  const hooks = (await S.driver.list('webhook')).filter((h) => h.active && asArray(h.events).includes(event));
  for (const h of hooks) {
    const body = JSON.stringify({ event, at: new Date().toISOString(), data: payload });
    const sig = createHmac('sha256', h.secret || '').update(body).digest('hex');
    let status;
    try {
      const r = await fetch(h.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CMW-Event': event, 'X-CMW-Signature': `sha256=${sig}` }, body, signal: AbortSignal.timeout(8000) });
      status = `${r.status} at ${new Date().toISOString()}`;
    } catch (e) {
      status = `failed: ${e.message}`;
    }
    await S.driver.put({ ...h, lastStatus: status, version: h.version + 1 });
  }
}

// --- First start ---------------------------------------------------------------------------------------
if (driver.isEmpty()) {
  if (DEMO || env.CMW_SEED === 'demo') {
    const { seedDemo } = await import('./seed.mjs');
    log('info', 'Empty database: loading the demonstration data set');
    await seedDemo(service, { setPassword: (id, pw) => driver.credentials.set(id, hashPassword(pw)) });
  } else {
    const email = (env.CMW_ADMIN_EMAIL || 'admin@example.org').toLowerCase();
    const password = env.CMW_ADMIN_PASSWORD || randomBytes(12).toString('base64url');
    const admin = await service.create(service.SYSTEM, 'user', { name: 'Administrator', email, roles: ['admin'], status: 'active', authProvider: 'local' }, { system: true, raw: true });
    driver.credentials.set(admin.id, hashPassword(password));
    log('info', 'Created the break-glass administrator account', { email, password: env.CMW_ADMIN_PASSWORD ? '(from CMW_ADMIN_PASSWORD)' : password });
  }
}

const sessions = createSessions(driver, { timeoutMinutes: () => serviceSettingsCache?.sessionTimeoutMinutes || 30 });
let serviceSettingsCache = (await service.getConfig()).settings;
const tokens = createTokenService(driver);
const oidc = await createOidc(env, log);

// --- HTTP helpers ------------------------------------------------------------------------------------------
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  ...(SECURE_COOKIE ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
};

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body) || body instanceof Uint8Array;
  const payload = isBuf ? body : typeof body === 'string' ? body : JSON.stringify(body ?? null);
  res.writeHead(status, { 'Content-Type': isBuf ? 'application/octet-stream' : typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(payload);
}

function readBody(req, limit = 4_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new AppError(413, 'Request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req, limit) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch { throw new AppError(400, 'Invalid JSON'); }
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

function sessionCookie(id, maxAgeSeconds) {
  return `cmw_sid=${id ? encodeURIComponent(id) : ''}; Path=/; HttpOnly; SameSite=Lax${SECURE_COOKIE ? '; Secure' : ''}${maxAgeSeconds != null ? `; Max-Age=${maxAgeSeconds}` : ''}`;
}

const clientIp = (req) => (TRUST_PROXY && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';

// Token-bucket rate limiting (INT-007).
const buckets = new Map();
function rateLimit(key, perMinute) {
  const now = Date.now();
  const b = buckets.get(key) || { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60000) * perMinute);
  b.at = now;
  if (b.tokens < 1) { buckets.set(key, b); return false; }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 50000) buckets.clear();
  return true;
}

async function userFromSession(req) {
  const sid = cookies(req).cmw_sid;
  const s = sessions.resolve(sid);
  if (!s || s.expired) return { user: null, expired: !!s?.expired, sid };
  const user = await driver.get('user', s.userId);
  if (!user || user.status !== 'active') return { user: null, sid };
  return { user, sid, via: 'session' };
}

async function authenticate(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) {
    const t = tokens.resolve(auth.slice(7).trim());
    if (!t) return { user: null };
    const client = (await driver.list('apiClient')).find((c) => c.id === t.clientId && c.active);
    if (!client) return { user: null };
    if (!rateLimit(`api:${client.id}`, Number(env.API_RATE_PER_MIN) || 600)) throw new AppError(429, 'Rate limit exceeded');
    const roles = asArray(client.roles?.length ? client.roles : ['portfolio']);
    return { user: { id: `api:${client.id}`, name: `API client ${client.name}`, roles, initiativeIds: [], scopes: client.scopes || [], api: true }, via: 'token' };
  }
  return userFromSession(req);
}

// --- Routing -----------------------------------------------------------------------------------------------
const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ method, re, keys, handler, opts });
};

route('GET', '/api/health', async () => ({ status: 'ok', version: VERSION, time: new Date().toISOString(), storage: (await driver.stats()), ai: aiAvailable, sso: Boolean(oidc), email: mailer.enabled, demo: DEMO }), { public: true });

route('GET', '/api/auth/session', async (ctx) => {
  if (!ctx.user) throw new AppError(401, ctx.expired ? 'Your session timed out after a period of inactivity. Sign in again.' : 'Not signed in');
  return { user: service.publicUser(ctx.user) };
}, { public: true });

route('GET', '/api/auth/options', async () => {
  const demoUsers = DEMO ? (await driver.list('user')).filter((u) => u.status === 'active' && u.demo).map((u) => ({ id: u.id, name: u.name, roles: u.roles.map(roleLabel), title: u.demoTitle || '' })) : [];
  return { sso: Boolean(oidc), local: true, demo: DEMO, demoUsers, organisation: serviceSettingsCache.organisationName };
}, { public: true });

route('POST', '/api/auth/login', async (ctx) => {
  if (!rateLimit(`login:${ctx.ip}`, 10)) throw new AppError(429, 'Too many sign-in attempts. Wait a minute and try again.');
  const { email, password } = await readJson(ctx.req);
  const user = (await driver.list('user')).find((u) => u.email?.toLowerCase() === String(email || '').toLowerCase() && u.status === 'active');
  const stored = user ? driver.credentials.get(user.id) : null;
  if (!user || !stored || !verifyPassword(password, stored)) {
    await service.audit({ id: 'anonymous', name: String(email || '').slice(0, 80) }, { action: 'loginFailed', type: 'session', summary: `Failed sign-in for ${String(email || '').slice(0, 80)} from ${ctx.ip}` });
    throw new AppError(401, 'The email address or password is incorrect.');
  }
  return startSession(ctx, user, 'local');
}, { public: true });

route('POST', '/api/auth/demo', async (ctx) => {
  if (!DEMO) throw new AppError(404, 'Demo sign-in is not enabled.');
  const { userId } = await readJson(ctx.req);
  const user = await driver.get('user', userId);
  if (!user || !user.demo) throw new AppError(404, 'Unknown demo user.');
  return startSession(ctx, user, 'demo');
}, { public: true });

route('GET', '/api/auth/oidc/login', async (ctx) => {
  if (!oidc) throw new AppError(404, 'Single sign-on is not configured.');
  return { redirect: await oidc.loginUrl(ctx.url.searchParams.get('returnTo') || '/') };
}, { public: true, raw: true });

route('GET', '/api/auth/oidc/callback', async (ctx) => {
  if (!oidc) throw new AppError(404, 'Single sign-on is not configured.');
  const base = env.OIDC_REDIRECT_URI ? new URL(env.OIDC_REDIRECT_URI) : new URL(`http://${ctx.req.headers.host}`);
  const current = new URL(ctx.req.url, `${base.protocol}//${base.host}`);
  const info = await oidc.callback(current.href);
  let user = (await driver.list('user')).find((u) => u.email?.toLowerCase() === info.email);
  const roles = mapIdpRoles(info.idpRoles, env).filter((r) => ['changeLead', 'practitioner', 'commsAdviser', 'trainingLead', 'pm', 'sponsor', 'peopleManager', 'changeAgent', 'portfolio', 'admin', 'auditor'].includes(r));
  if (!user && env.OIDC_JIT === '1') {
    user = await service.create(service.SYSTEM, 'user', { name: info.name, email: info.email, roles: roles.length ? roles : ['practitioner'], status: 'active', authProvider: 'sso' }, { system: true, raw: true });
  }
  if (!user || user.status !== 'active') {
    await service.audit({ id: 'anonymous', name: info.email }, { action: 'loginFailed', type: 'session', summary: `SSO user ${info.email} is not registered or not active` });
    throw new AppError(403, 'Your account is not set up in the Change Management Workbench. Contact your administrator.');
  }
  if (roles.length && env.OIDC_SYNC_ROLES === '1') user = await service.update(service.SYSTEM, 'user', user.id, { roles }, { system: true, raw: true });
  const res = await startSession(ctx, user, 'sso');
  return { redirect: `/#${info.returnTo || '/'}`, headers: res.headers };
}, { public: true, raw: true });

async function startSession(ctx, user, method) {
  const sid = sessions.start(user.id, { method, ip: ctx.ip });
  await service.driver.put({ ...user, lastLoginAt: new Date().toISOString(), version: user.version + 1 });
  await service.audit(user, { action: 'login', type: 'session', summary: `Signed in (${method}) from ${ctx.ip}` });
  return { user: service.publicUser(user), headers: { 'Set-Cookie': sessionCookie(sid) } };
}

route('POST', '/api/auth/logout', async (ctx) => {
  if (ctx.user) await service.audit(ctx.user, { action: 'logout', type: 'session', summary: 'Signed out' });
  sessions.end(ctx.sid);
  return { ok: true, headers: { 'Set-Cookie': sessionCookie('', 0) } };
}, { public: true });

// OAuth 2.0 client credentials grant.
route('POST', '/api/oauth/token', async (ctx) => {
  if (!rateLimit(`token:${ctx.ip}`, 30)) throw new AppError(429, 'Rate limit exceeded');
  const raw = (await readBody(ctx.req)).toString('utf8');
  const form = ctx.req.headers['content-type']?.includes('json') ? JSON.parse(raw || '{}') : Object.fromEntries(new URLSearchParams(raw));
  let { client_id: cid, client_secret: secret } = form;
  const basic = String(ctx.req.headers.authorization || '');
  if (basic.startsWith('Basic ')) [cid, secret] = Buffer.from(basic.slice(6), 'base64').toString().split(':');
  if (form.grant_type !== 'client_credentials') throw new AppError(400, 'unsupported_grant_type');
  const client = (await driver.list('apiClient')).find((c) => c.clientId === cid && c.active);
  if (!client || !verifyPassword(secret, client.secretHash)) throw new AppError(401, 'invalid_client');
  await driver.put({ ...client, lastUsedAt: new Date().toISOString(), version: client.version + 1 });
  return tokens.issue(client);
}, { public: true });

// Public survey endpoints (survey respondents need no account).
route('GET', '/api/public/surveys/:token', async (ctx) => service.publicSurvey(ctx.params.token), { public: true });
route('POST', '/api/public/surveys/:token/responses', async (ctx) => {
  if (!rateLimit(`survey:${ctx.ip}`, 20)) throw new AppError(429, 'Too many responses from this address. Try again shortly.');
  return service.submitSurveyResponse(ctx.params.token, await readJson(ctx.req, 100_000));
}, { public: true });

// --- Authenticated API ---------------------------------------------------------------------------------------
route('GET', '/api/v1/openapi.json', async () => buildOpenApi(service, { version: VERSION }), { public: true });
route('GET', '/api/v1/bootstrap', async (ctx) => service.bootstrap(ctx.user));
route('GET', '/api/v1/initiatives/:id/data', async (ctx) => service.loadInitiative(ctx.user, ctx.params.id));
route('GET', '/api/v1/initiatives/:id/changes', async (ctx) => service.changes(ctx.user, ctx.params.id, ctx.url.searchParams.get('since')));
route('GET', '/api/v1/search', async (ctx) => service.search(ctx.user, ctx.url.searchParams.get('q')));

route('GET', '/api/v1/records/:type', async (ctx) => {
  checkType(ctx.params.type);
  const sp = ctx.url.searchParams;
  return service.list(ctx.user, ctx.params.type, { initiativeId: sp.get('initiativeId') || undefined, q: sp.get('q') || undefined, limit: sp.get('limit') || undefined, offset: Number(sp.get('offset') || 0), sort: sp.get('sort') || undefined });
});
route('GET', '/api/v1/records/:type/:id', async (ctx) => { checkType(ctx.params.type); return service.get(ctx.user, ctx.params.type, ctx.params.id); });
route('POST', '/api/v1/records/:type', async (ctx) => {
  checkType(ctx.params.type);
  const body = await readJson(ctx.req);
  const data = body.data || body;
  return { status: 201, body: await service.create(ctx.user, ctx.params.type, data, { allowDuplicate: !!body.allowDuplicate, reason: body.reason, external: true }) };
}, { write: true });
route('PATCH', '/api/v1/records/:type/:id', async (ctx) => {
  checkType(ctx.params.type);
  const body = await readJson(ctx.req);
  const version = body.version ?? (ctx.req.headers['if-match'] ? Number(String(ctx.req.headers['if-match']).replace(/[^0-9]/g, '')) : undefined);
  return service.update(ctx.user, ctx.params.type, ctx.params.id, body.data || {}, { version, reason: body.reason, clearQuickCapture: body.clearQuickCapture, external: true });
}, { write: true });
route('DELETE', '/api/v1/records/:type/:id', async (ctx) => { checkType(ctx.params.type); return service.remove(ctx.user, ctx.params.type, ctx.params.id, { reason: ctx.url.searchParams.get('reason'), external: true }); }, { write: true });
route('POST', '/api/v1/records/:type/bulk', async (ctx) => {
  checkType(ctx.params.type);
  const { ids, patch, reason } = await readJson(ctx.req);
  return service.bulkUpdate(ctx.user, ctx.params.type, ids, patch, { reason, external: true });
}, { write: true });

route('POST', '/api/v1/ops/:name', async (ctx) => {
  const name = ctx.params.name;
  if (name.startsWith('_') || service.opMeta[name]?.internal) throw new AppError(404, 'Unknown operation');
  const payload = await readJson(ctx.req, 40_000_000);
  return service.runOp(ctx.user, name, payload);
}, { write: true });

route('GET', '/api/v1/files/:blobId', async (ctx) => {
  const blob = await service.getFile(ctx.user, ctx.params.blobId);
  const name = blob.meta?.filename || ctx.params.blobId;
  return { raw: true, status: 200, body: Buffer.from(blob.bytes), headers: { 'Content-Type': blob.meta?.mime || 'application/octet-stream', 'Content-Disposition': `${ctx.url.searchParams.get('inline') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}` } };
});

route('POST', '/api/v1/files', async (ctx) => {
  const sp = ctx.url.searchParams;
  const max = (serviceSettingsCache.attachments?.maxMb || 20) * 1024 * 1024;
  const bytes = await readBody(ctx.req, max + 1024);
  return service.runOp(ctx.user, 'uploadAttachment', { recordType: sp.get('recordType'), recordId: sp.get('recordId'), filename: sp.get('filename'), mime: ctx.req.headers['content-type'], data: new Uint8Array(bytes) });
}, { write: true });

// RPT-005: read-only reporting feed for BI tools, enforcing access rights.
route('GET', '/api/v1/reporting/:dataset', async (ctx) => {
  if (ctx.user.api && !asArray(ctx.user.scopes).includes('reporting') && !asArray(ctx.user.scopes).includes('read')) throw new AppError(403, 'This client is not allowed to read the reporting feed.');
  return service.reportingFeed(ctx.user, ctx.params.dataset, { initiativeId: ctx.url.searchParams.get('initiativeId') || undefined });
});

// Administration endpoints that need server-side secrets.
route('POST', '/api/v1/users/:id/password', async (ctx) => {
  const { password } = await readJson(ctx.req);
  const self = ctx.user.id === ctx.params.id;
  if (!self && !ctx.user.roles?.includes('admin')) throw new AppError(403, 'Administrator access is required.');
  const problems = passwordProblems(password);
  if (problems.length) throw new AppError(422, `The password needs ${problems.join(', ')}.`);
  const user = await driver.get('user', ctx.params.id);
  if (!user) throw new AppError(404, 'User not found');
  driver.credentials.set(user.id, hashPassword(password));
  sessions.endAllFor(user.id);
  await service.audit(ctx.user, { action: 'credential', type: 'user', recordId: user.id, summary: `Password set for ${user.email}` });
  return { ok: true };
}, { write: true });

route('POST', '/api/v1/api-clients', async (ctx) => {
  if (!ctx.user.roles?.includes('admin')) throw new AppError(403, 'Administrator access is required.');
  const { name, scopes = ['read'], roles = ['portfolio'] } = await readJson(ctx.req);
  const secret = randomBytes(24).toString('base64url');
  const clientId = `cmw_${uid().slice(0, 16)}`;
  const rec = await service.create(ctx.user, 'apiClient', { name, clientId, secretHash: hashPassword(secret), scopes, roles, active: true });
  return { client: { ...rec, secretHash: undefined }, clientSecret: secret, note: 'Store the secret now; it is not shown again.' };
}, { write: true });

route('POST', '/api/v1/webhooks', async (ctx) => {
  if (!ctx.user.roles?.includes('admin')) throw new AppError(403, 'Administrator access is required.');
  const { url, events = [] } = await readJson(ctx.req);
  const secret = randomBytes(24).toString('base64url');
  const rec = await service.create(ctx.user, 'webhook', { url, events, secret, active: true });
  return { webhook: { ...rec, secret: undefined }, signingSecret: secret };
}, { write: true });

// AI-assisted features (AIA-001 to AIA-007).
route('POST', '/api/v1/ai/:feature', async (ctx) => {
  if (!aiModule) throw new AppError(503, 'AI assistance is not configured on this server.');
  if (!rateLimit(`ai:${ctx.user.id}`, 20)) throw new AppError(429, 'Too many AI requests. Wait a minute and try again.');
  const body = await readJson(ctx.req, 2_000_000);
  return aiModule.runFeature(service, ctx.user, ctx.params.feature, body);
}, { write: true });

function checkType(type) {
  if (!ENTITIES[type] || ['apiClient', 'webhook'].includes(type)) throw new AppError(404, `Unknown record type ${type}`);
}

// --- Static files ------------------------------------------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json' };

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || !path.extname(p)) p = '/index.html';
  const file = path.normalize(path.join(DIST, p));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    if (!fs.existsSync(path.join(DIST, 'index.html'))) return send(res, 503, 'The web app has not been built. Run "npm run build" first.');
    return send(res, 404, 'Not found');
  }
  const immutable = p.startsWith('/assets/');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', ...SECURITY_HEADERS });
  fs.createReadStream(file).pipe(res);
}

// --- Server ------------------------------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const started = Date.now();
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
  const match = routes.map((r) => ({ r, m: r.method === req.method && r.re.exec(url.pathname) })).find((x) => x.m);
  if (!match) return send(res, 404, { error: 'Not found' });
  const { r, m } = match;
  const ctx = { req, res, url, ip: clientIp(req), params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  try {
    Object.assign(ctx, await authenticate(req));
    if (!r.opts.public && !ctx.user) throw new AppError(401, ctx.expired ? 'Your session timed out after a period of inactivity. Sign in again.' : 'Sign in to continue.');
    // CSRF defence: state-changing browser requests must carry the custom header.
    if (r.opts.write && ctx.via === 'session' && req.headers['x-cmw'] !== '1') throw new AppError(403, 'Missing request header.');
    if (ctx.user?.api && r.opts.write && !asArray(ctx.user.scopes).includes('write')) throw new AppError(403, 'This API client has read-only access.');
    if (ctx.user && !ctx.user.api && !rateLimit(`user:${ctx.user.id}`, Number(env.USER_RATE_PER_MIN) || 1200)) throw new AppError(429, 'Rate limit exceeded');
    const result = await r.handler(ctx);
    if (r.opts.raw && result?.redirect) {
      res.writeHead(302, { Location: result.redirect, ...SECURITY_HEADERS, ...(result.headers || {}) });
      return res.end();
    }
    if (result?.raw) return send(res, result.status || 200, result.body, result.headers);
    if (result && typeof result === 'object' && 'status' in result && 'body' in result && Object.keys(result).length === 2) return send(res, result.status, result.body);
    const headers = result?.headers;
    if (headers) delete result.headers;
    send(res, 200, result, headers || {});
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) log('error', `${req.method} ${url.pathname} failed`, e.stack || e.message);
    send(res, status, { error: status >= 500 ? 'Something went wrong on the server. The error has been logged.' : e.message, details: e.details, current: e.current, duplicates: e.duplicates });
  } finally {
    if (env.LOG_REQUESTS === '1') log('info', 'request', { method: req.method, path: url.pathname, ms: Date.now() - started, user: ctx.user?.id });
  }
});

// Keep the cached settings fresh for session timeouts.
setInterval(async () => { serviceSettingsCache = (await service.getConfig()).settings; sessions.purge(); }, 60000).unref();

startScheduler(service, { log, mailer });

server.listen(PORT, () => {
  log('info', `Change Management Workbench ${VERSION} listening on http://localhost:${PORT}`, { demo: DEMO, sso: Boolean(oidc), ai: aiAvailable, email: mailer.enabled, encryptedAtRest: driver.encrypted });
});

export { server, service };
