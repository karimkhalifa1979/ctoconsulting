// Administration and integration API: users (ADM-001), configuration (ADM-002..007), audit
// (NFR-025/026), system health and jobs (ADM-008), imports (DAT-005..007), webhooks and REST
// documentation (INT-013), SCIM provisioning (INT-001), CRM and accounting inbound (ENG-002, FIN-036),
// the analytics model (DSH-006) and requirements traceability.
import fs from 'node:fs';
import path from 'node:path';
import { FileResponse, badRequest, forbidden, notFound, unprocessable } from '../http.mjs';
import { newId, nowIso } from '../db.mjs';
import { ENTITIES, RAID_TYPES } from '../../shared/schema.js';
import { GLOBAL_ROLES, ROLES } from '../../shared/permissions.js';
import { DELIVERY_PROFILES, PROJECT_TEMPLATES } from '../../shared/defaults.js';
import { SETTINGS_DEFAULTS } from '../lib/settings.mjs';
import { parseCsv, parseXlsx, toXlsx } from '../lib/xlsx.mjs';
import { MIME, sniff } from '../lib/files.mjs';
import { sofficeAvailable } from '../lib/reports/pdf.mjs';
import { chartsAvailable } from '../lib/reports/charts.mjs';
import { TRACEABILITY } from '../../shared/traceability.js';
import { ROOT } from '../config.mjs';

let requirements = null;
const REQUIREMENTS = () => (requirements ||= JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'requirements.json'), 'utf8')));
const started = Date.now();

// Which Firm-wide roles may change each configuration area (NFR-030).
const SETTING_ROLES = {
  firm: ['sysadmin'], security: ['sysadmin'], permissions: ['sysadmin'], authority: ['sysadmin', 'finance'], numbering: ['sysadmin', 'pmo'], retention: ['sysadmin'], ai: ['sysadmin'],
  riskMatrix: ['pmo', 'sysadmin'], ragRules: ['pmo', 'sysadmin'], tolerances: ['pmo', 'sysadmin'], reporting: ['pmo', 'sysadmin'], raidReportRules: ['pmo', 'sysadmin'],
  closureChecklist: ['pmo', 'sysadmin'], engagementClosure: ['pmo', 'sysadmin'], riskLibrary: ['pmo', 'sysadmin'], lists: ['pmo', 'sysadmin'], alerts: ['pmo', 'sysadmin'],
  timesheets: ['pmo', 'finance', 'sysadmin'], finance: ['finance', 'sysadmin'], publicHolidays: ['finance', 'pmo', 'sysadmin'],
};

export function registerAdminRoutes(r, app) {
  const { db, auth, audit, settings, repos, entities, config } = app;
  const has = (ctx, roles) => roles.some((x) => ctx.user.roles?.includes(x)) && !ctx.user.external;
  const need = (ctx, roles, msg) => { if (!has(ctx, roles)) throw forbidden(msg || 'You do not have access to this administration area.'); };

  // ---------- Users (ADM-001, ACC-007, ACC-009) ----------
  r.get('/api/admin/users', (ctx) => {
    need(ctx, ['sysadmin', 'pmo', 'auditor']);
    return db.prepare('SELECT * FROM users ORDER BY name').all().map(auth.rowToUser).map((u) => ({
      ...u, memberships: app.memberships.forUser(u.id).map((m) => ({ id: m.id, engagement: repos.engagement.get(m.engagement_id)?.code, role: m.role, end_date: m.end_date })),
      client: u.client_id ? repos.client.get(u.client_id)?.legal_name : null, oid: undefined,
    }));
  });
  r.get('/api/admin/roles', () => ({ global: GLOBAL_ROLES, engagement: ROLES }));
  r.post('/api/admin/users', (ctx) => {
    need(ctx, ['sysadmin'], 'System administrators manage users (ADM-001).');
    const b = ctx.body;
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw unprocessable('Enter a valid email', { email: 'Invalid' });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw unprocessable('A user with this email exists', { email: 'Duplicate' });
    if (b.external && !b.client_id) throw unprocessable('External users belong to a client', { client_id: 'Required' });
    const roles = (b.roles || []).filter((x) => GLOBAL_ROLES.some((g) => g.id === x));
    if (b.external && roles.length) throw unprocessable('External users cannot hold Firm-wide roles');
    const id = newId('usr');
    const data = { roles, title: b.title || null, client_id: b.external ? b.client_id : null, contact_id: b.external ? b.contact_id || null : null, notify_pref: 'immediate' };
    db.prepare('INSERT INTO users (id, email, name, data, active, external, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)').run(id, email, b.name, JSON.stringify(data), b.external ? 1 : 0, nowIso(), nowIso());
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'grant', entity: 'user', entityId: id, summary: `User ${email} created${roles.length ? ` with ${roles.join(', ')}` : ''}`, after: { email, roles, external: Boolean(b.external) } });
    if (b.person && !b.external) app.entities.create({ ...ctx, system: true }, 'person', { name: b.name, email, user_id: id, grade: b.grade || 'Consultant', practice: b.practice, location_state: b.state || 'NSW', employment_type: 'Employee', active: true });
    return auth.getUser(id);
  });
  r.patch('/api/admin/users/:id', (ctx) => {
    need(ctx, ['sysadmin'], 'System administrators manage users (ADM-001).');
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(ctx.params.id);
    if (!row) throw notFound();
    const before = auth.rowToUser(row);
    const data = JSON.parse(row.data || '{}');
    if (ctx.body.roles) {
      if (row.external && ctx.body.roles.length) throw unprocessable('External users cannot hold Firm-wide roles');
      data.roles = ctx.body.roles.filter((x) => GLOBAL_ROLES.some((g) => g.id === x));
    }
    for (const k of ['title', 'contact_id']) if (k in ctx.body) data[k] = ctx.body[k];
    const active = 'active' in ctx.body ? (ctx.body.active ? 1 : 0) : row.active;
    db.prepare('UPDATE users SET name = ?, data = ?, active = ?, updated_at = ? WHERE id = ?').run(ctx.body.name || row.name, JSON.stringify(data), active, nowIso(), row.id);
    if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'access-change', entity: 'user', entityId: row.id, summary: `User ${row.email} updated${!active ? ' and deactivated' : ''}`, before: { roles: before.roles, active: before.active }, after: { roles: data.roles, active: Boolean(active) } });
    return auth.getUser(row.id);
  });

  // ---------- Configuration (ADM-003, ADM-004, ADM-006, NFR-030) ----------
  r.get('/api/admin/settings', (ctx) => {
    need(ctx, ['sysadmin', 'pmo', 'finance', 'auditor']);
    return Object.keys(SETTINGS_DEFAULTS).map((key) => ({ key, value: settings.get(key), customised: settings.isCustomised(key), editable: has(ctx, SETTING_ROLES[key] || ['sysadmin']) }));
  });
  r.put('/api/admin/settings/:key', (ctx) => {
    need(ctx, SETTING_ROLES[ctx.params.key] || ['sysadmin']);
    const v = settings.set(ctx.params.key, ctx.body.value, ctx);
    app.finance.clearMemo();
    return { key: ctx.params.key, value: v };
  });
  r.delete('/api/admin/settings/:key', (ctx) => {
    need(ctx, SETTING_ROLES[ctx.params.key] || ['sysadmin']);
    return { key: ctx.params.key, value: settings.reset(ctx.params.key, ctx) };
  });

  // ---------- Delivery profiles, project templates and custom fields (ADM-002, ADM-005, ADM-007) ----------
  const configTable = (name, table, defaults, roles) => {
    r.get(`/api/admin/${name}`, () => {
      const rows = repos[table].find({});
      return { custom: rows.length > 0, items: rows.length ? rows : defaults };
    });
    r.put(`/api/admin/${name}`, (ctx) => {
      need(ctx, roles);
      const items = ctx.body.items || [];
      db.tx(() => {
        for (const x of repos[table].find({})) repos[table].hardDelete(x.id);
        for (const it of items) repos[table].insert({ ...it, id: it.id && !String(it.id).includes(' ') ? `${table.slice(0, 3)}_${String(it.id).replace(/[^\w-]/g, '')}`.slice(0, 40) : undefined, key: it.id || it.key }, ctx.user.id);
      });
      audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'config', entity: table, summary: `${name} updated (${items.length} items)` });
      return { ok: true };
    });
  };
  configTable('profiles', 'delivery_profiles', DELIVERY_PROFILES, ['pmo', 'sysadmin']);
  configTable('project-templates', 'project_templates', PROJECT_TEMPLATES, ['pmo', 'sysadmin']);
  r.get('/api/admin/custom-fields', () => repos.custom_fields.find({}));
  r.post('/api/admin/custom-fields', (ctx) => {
    need(ctx, ['pmo', 'sysadmin']);
    const b = ctx.body;
    if (!['client', 'engagement', 'project', 'risk', 'issue', 'deliverable'].includes(b.entity)) throw unprocessable('Custom fields apply to clients, engagements, projects, RAID items and deliverables (ADM-005)');
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(b.key || '')) throw unprocessable('Key: lower case letters, digits and underscores', { key: 'Invalid' });
    if (repos.custom_fields.find({}).some((c) => c.key === b.key && c.entity === b.entity)) throw unprocessable('Key already used', { key: 'Duplicate' });
    const rec = repos.custom_fields.insert({ entity: b.entity, key: b.key, label: b.label, type: b.type || 'text', options: b.options || null, audience: b.audience === 'internal' ? 'internal' : 'client', required: Boolean(b.required) }, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'config', entity: 'custom_field', entityId: rec.id, summary: `Custom field ${b.entity}.${b.key} added; available as token custom.${b.key} (RPT-020)` });
    return rec;
  });
  r.delete('/api/admin/custom-fields/:id', (ctx) => {
    need(ctx, ['pmo', 'sysadmin']);
    repos.custom_fields.softDelete(ctx.params.id, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'config', entity: 'custom_field', entityId: ctx.params.id, summary: 'Custom field removed' });
    return { ok: true };
  });

  // ---------- Audit (NFR-025, NFR-026, ACC-009) ----------
  r.get('/api/admin/audit', async (ctx) => {
    need(ctx, ['auditor', 'sysadmin', 'pmo']);
    const q = ctx.query;
    const engagementIds = ctx.user.roles.includes('auditor') ? null : ctx.access.visibleEngagementIds();
    const out = audit.query({ userId: q.user_id, entity: q.entity, entityId: q.entity_id, engagementId: q.engagement_id, from: q.from, to: q.to, action: q.action, limit: Math.min(Number(q.limit) || 100, 1000), offset: Number(q.offset) || 0, engagementIds });
    const metadataOnly = !ctx.user.roles.includes('auditor');
    const rows = out.rows.map((x) => ({
      ...x, user: auth.getUser(x.user_id)?.name || 'System',
      before: metadataOnly && x.engagement_id && !ctx.access.canSeeCosts(x.engagement_id) ? null : x.before,
      after: metadataOnly && x.engagement_id && !ctx.access.canSeeCosts(x.engagement_id) ? null : x.after,
    }));
    if (q.format === 'xlsx') {
      audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'export', entity: 'audit', summary: `Audit log exported (${rows.length} rows)` });
      return new FileResponse(await toXlsx([{ name: 'Audit', columns: [{ key: 'seq', label: '#' }, { key: 'at', label: 'When (UTC)' }, { key: 'user', label: 'User' }, { key: 'action', label: 'Action' }, { key: 'entity', label: 'Record type' }, { key: 'entity_id', label: 'Record' }, { key: 'summary', label: 'Summary', width: 70 }, { key: 'before', label: 'Before', width: 50 }, { key: 'after', label: 'After', width: 50 }, { key: 'ip', label: 'IP' }, { key: 'hash', label: 'Hash' }], rows }]), { type: MIME.xlsx, name: 'CEMS_audit.xlsx' });
    }
    return { total: out.total, rows };
  });
  r.post('/api/admin/audit/verify', (ctx) => { need(ctx, ['auditor', 'sysadmin']); return audit.verifyChain(); });

  // ---------- System (ADM-008, INT-014, INT-002) ----------
  r.get('/api/admin/health', async (ctx) => {
    need(ctx, ['sysadmin', 'pmo', 'auditor']);
    const count = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE deleted_at IS NULL`).get().n;
    return {
      env: config.env, uptimeSeconds: Math.round((Date.now() - started) / 1000), node: process.version, authMode: config.authMode, oidc: config.oidc.enabled,
      email: config.m365.enabled ? 'Microsoft 365 (Graph)' : 'Outbox only (simulated)', malwareScanner: config.clamav.host ? `ClamAV ${config.clamav.host}` : 'Not configured',
      pdf: await sofficeAvailable(config.soffice), charts: chartsAvailable(),
      counts: { users: db.prepare('SELECT COUNT(*) n FROM users').get().n, engagements: count('engagements'), projects: count('projects'), timeEntries: count('time_entries'), reports: count('reports'), auditEvents: db.prepare('SELECT COUNT(*) n FROM audit').get().n },
      integrationErrors: db.prepare("SELECT COUNT(*) n FROM integration_log WHERE status IN ('failed', 'dead')").get().n,
      outboxQueued: db.prepare("SELECT COUNT(*) n FROM outbox WHERE status IN ('queued', 'failed')").get().n,
      jobs: app.jobs.list(),
    };
  });
  r.get('/api/admin/jobs', (ctx) => { need(ctx, ['sysadmin', 'pmo']); return app.jobs.list(); });
  r.post('/api/admin/jobs/:name/run', async (ctx) => { need(ctx, ['sysadmin']); const out = await app.jobs.run(ctx.params.name); audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'job', entity: 'job', entityId: ctx.params.name, summary: `Job run on demand: ${out.message}` }); return out; });
  r.get('/api/admin/integrations', (ctx) => { need(ctx, ['sysadmin']); return db.prepare('SELECT * FROM integration_log ORDER BY updated_at DESC LIMIT 200').all(); });
  r.post('/api/admin/integrations/retry', async (ctx) => { need(ctx, ['sysadmin']); db.prepare("UPDATE integration_log SET status = 'failed', next_attempt_at = NULL WHERE status = 'dead'").run(); return { result: await app.integrations.retryDue() }; });
  r.get('/api/admin/outbox', (ctx) => { need(ctx, ['sysadmin']); return db.prepare('SELECT id, kind, to_addr, subject, status, attempts, last_error, created_at, sent_at FROM outbox ORDER BY created_at DESC LIMIT 200').all().map((m) => ({ ...m, to: JSON.parse(m.to_addr) })); });
  r.get('/api/admin/outbox/:id', (ctx) => { need(ctx, ['sysadmin']); const m = db.prepare('SELECT * FROM outbox WHERE id = ?').get(ctx.params.id); if (!m) throw notFound(); return { ...m, to: JSON.parse(m.to_addr), attachments: JSON.parse(m.attachments || '[]') }; });
  r.get('/api/admin/webhooks', (ctx) => { need(ctx, ['sysadmin']); return repos.webhooks.find({}).map((w) => ({ ...w, secret: w.secret ? '••••' : null })); });
  r.post('/api/admin/webhooks', (ctx) => {
    need(ctx, ['sysadmin']);
    if (!/^https:\/\//.test(ctx.body.url || '')) throw unprocessable('Webhooks must use https', { url: 'Invalid' });
    const rec = repos.webhooks.insert({ url: ctx.body.url, events: ctx.body.events || [], secret: ctx.body.secret || newId('whs'), active: true }, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'config', entity: 'webhook', entityId: rec.id, summary: `Webhook added for ${rec.events.join(', ')}` });
    return rec;
  });
  r.delete('/api/admin/webhooks/:id', (ctx) => { need(ctx, ['sysadmin']); repos.webhooks.softDelete(ctx.params.id, ctx.user.id); return { ok: true }; });

  // ---------- Data import with validation and reconciliation (DAT-005..007) ----------
  const IMPORTERS = {
    clients: { entity: 'client', map: (row) => ({ legal_name: row.legal_name || row.name, trading_name: row.trading_name, abn: row.abn, sector: row.sector, sector_type: row.sector_type || 'Private', code: row.code, payment_terms_days: Number(row.payment_terms_days) || 30, status: 'Active' }) },
    people: { entity: 'person', map: (row) => ({ name: row.name, email: row.email, grade: row.grade, practice: row.practice, location_state: row.state || row.location_state, employment_type: row.employment_type || 'Employee', standard_hours: Number(row.standard_hours) || 37.5, skills: String(row.skills || '').split(';').filter(Boolean).map((s) => ({ name: s.trim(), level: 3 })), active: true }) },
    raid: { entity: null, map: (row) => ({ ...row }) },
    rates: { entity: null, map: (row) => row },
  };
  r.post('/api/admin/import/:kind', async (ctx) => {
    need(ctx, ['sysadmin', 'pmo', 'finance']);
    const imp = IMPORTERS[ctx.params.kind];
    if (!imp) throw notFound('Unknown import');
    const buf = ctx.body;
    const rows = sniff(buf) === 'zip' ? await parseXlsx(buf) : parseCsv(buf.toString('utf8'));
    if (!rows.length) throw badRequest('No rows found');
    const sys = { ...ctx, system: true };
    const results = { total: rows.length, created: 0, errors: [] };
    const recon = {};
    rows.forEach((row, i) => {
      try {
        if (ctx.params.kind === 'raid') {
          const type = String(row.type || '').toLowerCase();
          if (!RAID_TYPES.includes(type)) throw new Error(`Type must be one of ${RAID_TYPES.join(', ')}`);
          const eng = repos.engagement.find({}).find((e) => e.code === row.engagement_code);
          if (!eng) throw new Error(`Unknown engagement ${row.engagement_code}`);
          const proj = row.project_code ? repos.project.find({ engagement_id: eng.id }).find((p) => p.code === row.project_code) : null;
          if (row.project_code && !proj) throw new Error(`Unknown project ${row.project_code}`);
          const owner = row.owner_email ? db.prepare('SELECT id FROM users WHERE email = ?').get(String(row.owner_email).toLowerCase())?.id : null;
          const input = { engagement_id: eng.id, project_id: proj?.id || null, title: row.title, description: row.description || row.title, event: row.event || row.title, owner_id: owner, status: row.status || undefined, likelihood: row.likelihood ? Number(row.likelihood) : undefined, consequence: row.consequence ? Number(row.consequence) : undefined, severity: row.severity || undefined, due_date: row.due_date || undefined, need_by: row.need_by || undefined, target_date: row.target_date || undefined };
          entities.create(sys, type, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
          recon[type] = (recon[type] || 0) + 1;
        } else if (ctx.params.kind === 'rates') {
          const card = repos.rate_card.find({}).find((c) => c.name === row.rate_card);
          if (!card) throw new Error(`Unknown rate card ${row.rate_card}`);
          const rate = Number(row.rate);
          if (!rate) throw new Error('Rate must be a number');
          repos.rate_card.patch(card.id, { rates: [...(card.rates || []), { role: row.role, rate, effective_from: row.effective_from || card.effective_from }] }, ctx.user.id);
          recon.rateTotal = (recon.rateTotal || 0) + rate;
        } else {
          entities.create(sys, imp.entity, imp.map(row));
        }
        results.created++;
      } catch (e) {
        results.errors.push({ row: i + 2, error: e.details ? Object.values(e.details).join('; ') : e.message });
      }
    });
    const rec = repos.imports.insert({ kind: ctx.params.kind, file_name: ctx.fileName, rows: rows.length, created: results.created, errors: results.errors, reconciliation: { source_rows: rows.length, imported: results.created, rejected: results.errors.length, ...recon }, by: ctx.user.id }, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'import', entity: 'import', entityId: rec.id, summary: `${ctx.params.kind} import: ${results.created} of ${rows.length} rows imported (DAT-005)` });
    return { ...results, id: rec.id, reconciliation: rec.reconciliation };
  }, { raw: true });
  r.get('/api/admin/imports', (ctx) => { need(ctx, ['sysadmin', 'pmo', 'finance']); return repos.imports.find({}).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); });

  // DAT-001 retention view and legal hold.
  r.get('/api/admin/retention', (ctx) => {
    need(ctx, ['sysadmin', 'auditor']);
    const years = settings.get('retention').years || 7;
    return repos.engagement.find({}).map((e) => ({ id: e.id, code: e.code, name: e.name, status: e.status, closed_at: e.closed_at || null, legal_hold: Boolean(e.legal_hold), retain_until: e.closed_at ? `${Number(e.closed_at.slice(0, 4)) + years}${e.closed_at.slice(4)}` : null }));
  });

  // ---------- Requirements traceability ----------
  r.get('/api/requirements', () => REQUIREMENTS().map((q) => ({ ...q, ...(TRACEABILITY[q.id] || { status: 'Not started' }) })));

  // ---------- Analytics model with row-level security (DSH-006) ----------
  r.get('/api/analytics/:dataset', (ctx) => {
    if (ctx.access.isExternal) throw forbidden();
    const ids = ctx.access.visibleEngagementIds();
    const costsFor = (id) => ctx.access.canSeeCosts(id);
    switch (ctx.params.dataset) {
      case 'engagements': return ids.map((id) => { const e = repos.engagement.get(id); return { id, code: e.code, name: e.name, client: repos.client.get(e.client_id)?.legal_name, status: e.status, type: e.type, practice: e.practice, start_date: e.start_date, end_date: e.end_date, health: app.status.engagementHealth(e)?.rag || null }; });
      case 'projects': return ids.flatMap((id) => repos.project.find({ engagement_id: id }).map((p) => ({ id: p.id, engagement_id: id, code: p.code, name: p.name, state: p.state, approach: p.approach, start_date: p.start_date, end_date: p.end_date, rag: app.status.latestRag(p.id)?.overall || null })));
      case 'financials': return ids.filter((id) => ctx.access.can(id, 'budget', 'R')).flatMap((id) => repos.project.find({ engagement_id: id }).flatMap((p) => app.finance.position(p.id).months.map((m) => ({ engagement_id: id, project_id: p.id, month: m.month, revenue_budget: m.budgetRevenue, revenue_actual: m.actualRevenue, revenue_forecast: m.forecastRevenue, ...(costsFor(id) ? { cost_budget: m.budgetCost, cost_actual: m.actualCost, cost_forecast: m.forecastCost } : {}) }))));
      case 'raid': return RAID_TYPES.flatMap((t) => ids.flatMap((id) => app.entities.list(ctx, t, { engagement_id: id }).map((x) => ({ type: t, id: x.id, ref: x.ref, engagement_id: id, project_id: x.project_id, title: x.title, status: x.status, rating: x.residual_level || x.inherent_level || x.severity || null, raised_date: x.raised_date, age_days: x.age_days }))));
      case 'time': return ids.filter((id) => ctx.access.can(id, 'budget', 'R')).flatMap((id) => repos.time_entries.find({ engagement_id: id }).filter((t) => t.status === 'Approved').map((t) => ({ engagement_id: id, project_id: t.project_id, person_id: t.person_id, date: t.date, hours: t.hours, billable: t.billable !== false })));
      default: throw notFound('Unknown dataset: engagements, projects, financials, raid, time');
    }
  }, { internal: true });

  // ---------- REST API description (INT-013) ----------
  r.get('/api/openapi.json', () => openapi(app));

  // ---------- SCIM 2.0 user provisioning from Entra ID (INT-001) ----------
  const scimUser = (u) => ({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], id: u.id, userName: u.email, displayName: u.name, active: u.active, emails: [{ value: u.email, primary: true }], meta: { resourceType: 'User' } });
  r.get('/scim/v2/Users', (ctx) => {
    const m = String(ctx.query.filter || '').match(/userName eq "([^"]+)"/i);
    const list = (m ? [auth.getUserByEmail(m[1].toLowerCase())] : db.prepare('SELECT * FROM users WHERE external = 0').all().map(auth.rowToUser)).filter(Boolean);
    return { schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'], totalResults: list.length, Resources: list.map(scimUser) };
  }, { scim: true });
  r.post('/scim/v2/Users', (ctx) => {
    const email = String(ctx.body.userName || ctx.body.emails?.[0]?.value || '').toLowerCase();
    if (!email) throw badRequest('userName required');
    const existing = auth.getUserByEmail(email);
    if (existing) return scimUser(existing);
    const id = newId('usr');
    db.prepare('INSERT INTO users (id, email, name, data, active, external, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)').run(id, email, ctx.body.displayName || ctx.body.name?.formatted || email, JSON.stringify({ roles: [], source: 'scim', external_id: ctx.body.externalId || null }), ctx.body.active === false ? 0 : 1, nowIso(), nowIso());
    audit.record({ action: 'provision', entity: 'user', entityId: id, summary: `Provisioned ${email} by SCIM` });
    return scimUser(auth.getUser(id));
  }, { scim: true });
  const scimPatch = (ctx) => {
    const u = auth.getUser(ctx.params.id);
    if (!u) throw notFound();
    let active = u.active;
    let name = u.name;
    for (const op of ctx.body.Operations || []) {
      if (op.path === 'active' || op.value?.active !== undefined) active = op.path === 'active' ? op.value === true || op.value === 'True' : op.value.active;
      if (op.path === 'displayName') name = op.value;
    }
    if (ctx.body.active !== undefined) active = ctx.body.active;
    if (ctx.body.displayName) name = ctx.body.displayName;
    db.prepare('UPDATE users SET active = ?, name = ?, updated_at = ? WHERE id = ?').run(active ? 1 : 0, name, nowIso(), u.id);
    if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    audit.record({ action: 'provision', entity: 'user', entityId: u.id, summary: `SCIM update: ${active ? 'active' : 'deactivated'}` });
    return scimUser(auth.getUser(u.id));
  };
  r.patch('/scim/v2/Users/:id', scimPatch, { scim: true });
  r.put('/scim/v2/Users/:id', scimPatch, { scim: true });
  r.delete('/scim/v2/Users/:id', (ctx) => { ctx.body = { active: false }; return scimPatch(ctx); }, { scim: true });

  // ---------- Inbound integrations ----------
  // ENG-002: create an engagement from a won CRM opportunity (idempotent by opportunity id).
  r.post('/api/integrations/crm/won', (ctx) => {
    const b = ctx.body;
    if (!b.opportunity_id || !b.client?.name) throw badRequest('opportunity_id and client.name are required');
    const existing = repos.engagement.find({}).find((e) => e.crm_opportunity_id === b.opportunity_id);
    if (existing) return { engagement_id: existing.id, duplicate: true };
    const sys = { system: true, user: null, access: app.access.contextFor(null), ip: 'crm' };
    const abn = String(b.client.abn || '').replace(/\D/g, '');
    let client = repos.client.find({}).find((c) => (abn && String(c.abn || '').replace(/\D/g, '') === abn) || c.legal_name.toLowerCase() === b.client.name.toLowerCase());
    if (!client) client = entities.create(sys, 'client', { legal_name: b.client.name, abn: b.client.abn || null, sector: b.client.sector, sector_type: b.client.sector_type || 'Private', crm_id: b.client.crm_id || null, status: 'Active' }, {});
    const em = b.engagement_manager_email ? auth.getUserByEmail(b.engagement_manager_email) : null;
    const ee = b.engagement_executive_email ? auth.getUserByEmail(b.engagement_executive_email) : null;
    const eng = entities.create(sys, 'engagement', {
      client_id: client.id, name: b.name || `${b.client.name} engagement`, description: b.scope_summary || null, type: b.type || 'advisory', start_date: b.start_date, end_date: b.end_date,
      manager_id: em?.id, executive_id: ee?.id, status: 'Proposed', crm_opportunity_id: b.opportunity_id,
    });
    if (b.value) entities.create(sys, 'contract', { engagement_id: eng.id, kind: 'SOW', reference: b.sow_reference || `${b.opportunity_id}-SOW`, title: b.name || 'Statement of work', value: Number(b.value), commercial_model: b.commercial_model || 'T&M', start_date: b.start_date, end_date: b.end_date, status: 'Draft' });
    audit.record({ action: 'integration', entity: 'engagement', entityId: eng.id, engagementId: eng.id, summary: `Engagement created from won CRM opportunity ${b.opportunity_id} (ENG-002)`, after: { proposed_team: b.proposed_team || [] } });
    if (em) app.notify.send([em.id], { kind: 'engagement', title: `New engagement from CRM: ${eng.name}`, body: 'Complete set-up: contracts, POs, projects and governance (UC-01).', link: `/engagements/${eng.id}` });
    return { engagement_id: eng.id };
  }, { apiKey: true });

  // FIN-036: invoice status from the accounting system.
  r.post('/api/integrations/accounting/invoice-status', (ctx) => {
    const b = ctx.body;
    const inv = repos.invoice.find({}).find((i) => (b.external_id && i.external_id === b.external_id) || (b.number && i.number === b.number));
    if (!inv) throw notFound('Invoice not found');
    const map = { paid: 'Paid', overdue: 'Overdue', disputed: 'Disputed', issued: 'Issued' };
    const status = map[String(b.status).toLowerCase()];
    if (!status) throw badRequest('Unknown status');
    repos.invoice.patch(inv.id, { status, paid_date: status === 'Paid' ? b.paid_date || nowIso().slice(0, 10) : inv.paid_date }, null);
    audit.record({ action: 'integration', entity: 'invoice', entityId: inv.id, engagementId: inv.engagement_id, summary: `Invoice ${inv.number} ${status.toLowerCase()} (accounting sync)` });
    app.finance.clearMemo();
    return { ok: true };
  }, { apiKey: true });
}

function openapi(app) {
  const paths = {};
  for (const [name, def] of Object.entries(ENTITIES)) {
    const props = Object.fromEntries(def.fields.map((f) => [f.key, { type: ['int', 'number', 'money', 'percent', 'scale', 'scale5'].includes(f.type) ? 'number' : f.type === 'bool' ? 'boolean' : ['users', 'refs', 'tags', 'list'].includes(f.type) ? 'array' : 'string', description: f.label + (f.sensitive ? ' (restricted: ACC-003)' : '') + (f.internal ? ' (internal-only)' : '') }]));
    const schema = { type: 'object', properties: { id: { type: 'string' }, engagement_id: { type: 'string' }, project_id: { type: 'string' }, ...props } };
    paths[`/api/e/${name}`] = {
      get: { summary: `List ${def.plural}`, tags: [def.label], parameters: [{ name: 'engagement_id', in: 'query', schema: { type: 'string' } }, { name: 'project_id', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: schema } } } } } },
      post: { summary: `Create a ${def.label.toLowerCase()}`, tags: [def.label], requestBody: { content: { 'application/json': { schema } } }, responses: { 200: { description: 'Created' }, 422: { description: 'Validation errors' } } },
    };
    paths[`/api/e/${name}/{id}`] = {
      get: { summary: `Get a ${def.label.toLowerCase()}`, tags: [def.label], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' }, 404: { description: 'Not found or not visible' } } },
      patch: { summary: `Update a ${def.label.toLowerCase()}`, tags: [def.label], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' }, 409: { description: 'Changed by someone else' } } },
      delete: { summary: `Delete a ${def.label.toLowerCase()} (soft, audited)`, tags: [def.label], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
    };
  }
  const extra = [
    ['get', '/api/dash/portfolio', 'Portfolio dashboard'], ['get', '/api/dash/engagement/{id}', 'Engagement dashboard'], ['get', '/api/finance/project/{id}', 'Project financial position'],
    ['get', '/api/finance/engagement/{id}', 'Engagement financial roll-up'], ['post', '/api/reports/generate', 'Generate a report'], ['post', '/api/reports/{id}/issue', 'Issue a report'],
    ['get', '/api/time/week', 'Timesheet week'], ['post', '/api/status/{id}/submit', 'Submit a status update'], ['get', '/api/analytics/{dataset}', 'Analytics model (row-level security)'],
    ['post', '/api/integrations/crm/won', 'Inbound: won CRM opportunity (API key)'], ['post', '/api/integrations/accounting/invoice-status', 'Inbound: invoice status (API key)'],
  ];
  for (const [m, p, s] of extra) paths[p] = { ...(paths[p] || {}), [m]: { summary: s, responses: { 200: { description: 'OK' } } } };
  return {
    openapi: '3.0.3', info: { title: 'CTO Consulting CEMS API', version: '1.0.0', description: 'Engagement-scoped REST API. Authentication: session cookie with CSRF header for the web app; OAuth 2.0 (Microsoft Entra ID) for integrations. Webhooks: status.submitted, report.issued, change.approved, change.submitted, invoice.issued, threshold.breached (signed with X-CEMS-Signature).' },
    servers: [{ url: app.config.baseUrl }],
    components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'cems_sid' }, entra: { type: 'oauth2', flows: { authorizationCode: { authorizationUrl: `${app.config.oidc.issuer || 'https://login.microsoftonline.com/{tenant}/v2.0'}/authorize`, tokenUrl: `${app.config.oidc.issuer || 'https://login.microsoftonline.com/{tenant}/v2.0'}/token`, scopes: { openid: 'Sign in' } } } }, apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' } } },
    security: [{ session: [] }, { entra: ['openid'] }],
    paths,
  };
}
