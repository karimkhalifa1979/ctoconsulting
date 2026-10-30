// Composition root: creates every service, the HTTP pipeline and the router.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { openDb, nextSequence } from './db.mjs';
import { Router, HttpError, FileResponse, Redirect, readJson, readBody, parseCookies, cookie, SECURITY_HEADERS, contentDisposition } from './http.mjs';
import { createAudit } from './lib/audit.mjs';
import { createSettings } from './lib/settings.mjs';
import { createFiles } from './lib/files.mjs';
import { createIntegrations } from './lib/integrations.mjs';
import { createNotify } from './lib/notify.mjs';
import { createAuth, ipOf } from './lib/auth.mjs';
import { createAccess } from './lib/access.mjs';
import { createEntities } from './lib/entities.mjs';
import { createMemberships } from './lib/memberships.mjs';
import { createWorkflow } from './lib/workflow.mjs';
import { createRates } from './lib/rates.mjs';
import { createSchedule } from './lib/schedule.mjs';
import { createRaid } from './lib/raid.mjs';
import { createFinance } from './lib/finance.mjs';
import { createChanges } from './lib/changes.mjs';
import { createProjects } from './lib/projects.mjs';
import { createStatus } from './lib/status.mjs';
import { createForecast } from './lib/forecast.mjs';
import { createTime } from './lib/time.mjs';
import { createBilling } from './lib/billing.mjs';
import { createResources } from './lib/resources.mjs';
import { createDashboards } from './lib/dashboards.mjs';
import { createReports } from './lib/reports/service.mjs';
import { registerHooks } from './lib/hooks.mjs';
import { createJobs } from './lib/jobs.mjs';
import { registerCoreRoutes } from './routes/core.mjs';
import { registerDeliveryRoutes } from './routes/delivery.mjs';
import { registerFinanceRoutes } from './routes/finance.mjs';
import { registerReportRoutes } from './routes/reports.mjs';
import { registerAdminRoutes } from './routes/admin.mjs';

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
};

export function createApp(overrides = {}) {
  const config = loadConfig(overrides);
  const db = openDb(config.dbPath);
  const app = { config, db };
  app.sequence = (scope, key) => nextSequence(db, scope, key);
  app.audit = createAudit(db);
  app.settings = createSettings(db, app.audit);
  app.files = createFiles(app);
  app.integrations = createIntegrations(app);
  app.notify = createNotify(app);
  app.auth = createAuth(app);
  app.access = createAccess(app);
  app.entities = createEntities(app);
  app.repos = app.entities.repos;
  app.memberships = createMemberships(app);
  app.workflow = createWorkflow(app);
  app.rates = createRates(app);
  app.schedule = createSchedule(app);
  app.raid = createRaid(app);
  app.finance = createFinance(app);
  app.changes = createChanges(app);
  app.projects = createProjects(app);
  app.status = createStatus(app);
  app.forecast = createForecast(app);
  app.time = createTime(app);
  app.billing = createBilling(app);
  app.resources = createResources(app);
  app.dashboards = createDashboards(app);
  app.reports = createReports(app);
  registerHooks(app);
  app.jobs = createJobs(app);

  const router = new Router();
  registerCoreRoutes(router, app);
  registerDeliveryRoutes(router, app);
  registerFinanceRoutes(router, app);
  registerReportRoutes(router, app);
  registerAdminRoutes(router, app);
  app.router = router;

  // Builds the per-request context: user, engagement-scoped access and linked person.
  app.contextFor = (user, extra = {}) => {
    const access = app.access.contextFor(user);
    const person = user ? app.repos.person.findOne({ user_id: user.id }) : null;
    return { user, access, personId: person?.id || null, app, ...extra };
  };

  app.handle = (req, res) => handle(app, req, res);
  return app;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function handle(app, req, res) {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  const isApi = pathname.startsWith('/api/') || pathname.startsWith('/auth/') || pathname.startsWith('/scim/');
  if (!isApi) return serveStatic(app, req, res, pathname);
  const started = Date.now();
  const cookies = parseCookies(req.headers.cookie);
  const loaded = app.auth.loadSession(cookies[app.auth.COOKIE]);
  const headers = {};
  if (loaded?.expired) headers['Set-Cookie'] = cookie(app.auth.COOKIE, '', { maxAge: 0, secure: app.config.cookieSecure });
  const user = loaded?.user || null;
  try {
    const route = app.router.match(req.method, pathname);
    if (!route) throw new HttpError(404, 'Not found');
    if (route.methodNotAllowed) throw new HttpError(405, 'Method not allowed');
    const opts = route.opts || {};
    if (!opts.public && !user && !opts.apiKey && !opts.scim) throw new HttpError(401, loaded?.expired ? 'Your session ended after a period of inactivity (NFR-009). Please sign in again.' : 'Please sign in.');
    if (opts.apiKey && req.headers['x-api-key'] !== app.config.integrationKey) throw new HttpError(401, 'Invalid integration key');
    if (opts.scim && (!app.config.scimToken || req.headers.authorization !== `Bearer ${app.config.scimToken}`)) throw new HttpError(401, 'Invalid SCIM token');
    // CSRF: state-changing browser requests carry the session's token (SameSite=Strict cookies as well).
    if (user && !['GET', 'HEAD'].includes(req.method) && !opts.public && !opts.apiKey && !opts.scim) {
      if (req.headers['x-csrf-token'] !== loaded.session.csrf) throw new HttpError(403, 'Security token missing or invalid. Reload the page.');
    }
    if (opts.admin && !user?.roles?.includes('sysadmin')) throw new HttpError(403, 'System administrators only.');
    if (opts.internal && user?.external) throw new HttpError(403, 'Not available in the client portal.');
    let body;
    if (opts.raw) body = await readBody(req, (app.settings.get('security').uploadMaxMb || 20) * 1048576 + 1024);
    else if (!['GET', 'HEAD', 'DELETE'].includes(req.method)) body = await readJson(req);
    const ctx = app.contextFor(user, {
      req, res, ip: ipOf(req), params: route.params, query: Object.fromEntries(url.searchParams), body, session: loaded?.session || null, cookies,
      fileName: req.headers['x-file-name'] ? decodeURIComponent(String(req.headers['x-file-name'])) : null,
    });
    const out = await route.handler(ctx);
    if (out instanceof Redirect) {
      res.writeHead(302, { Location: out.location, 'Cache-Control': 'no-store', ...headers, ...out.headers });
      return res.end();
    }
    if (out instanceof FileResponse) {
      res.writeHead(out.status, {
        'Content-Type': out.type, 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers, ...out.headers,
        ...(out.name ? { 'Content-Disposition': contentDisposition(out.name, out.inline) } : {}),
      });
      return res.end(out.body);
    }
    send(res, 200, out ?? { ok: true }, { ...headers, ...(ctx.setCookie ? { 'Set-Cookie': ctx.setCookie } : {}) });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(`[${new Date().toISOString()}] ${req.method} ${pathname}`, e);
    send(res, status, { error: status >= 500 ? 'Something went wrong on the server.' : e.message, details: e.details || undefined, ...(status >= 500 && app.config.env !== 'production' ? { debug: e.message } : {}) }, headers);
  } finally {
    if (app.config.logLevel === 'debug') console.log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
  }
}

function serveStatic(app, req, res, pathname) {
  const dist = app.config.distDir;
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  let file = path.join(dist, rel);
  if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    return res.end('The web client is not built yet. Run: npm run build');
  }
  const ext = path.extname(file);
  res.writeHead(200, {
    'Content-Type': STATIC_TYPES[ext] || 'application/octet-stream', ...SECURITY_HEADERS,
    'Cache-Control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}
