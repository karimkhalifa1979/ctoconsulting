// Core API: sign-in, current user, generic registers, lookups, files, notifications, approvals,
// comments and record history.
import { ENTITIES, RAID_TYPES } from '../../shared/schema.js';
import { FileResponse, Redirect, cookie, badRequest, forbidden, notFound, unprocessable } from '../http.mjs';
import { sniff, MIME } from '../lib/files.mjs';
import { inspectPackage } from '../lib/reports/docx.mjs';
import { toXlsx, toCsv } from '../lib/xlsx.mjs';
import { sofficeAvailable } from '../lib/reports/pdf.mjs';
import { chartsAvailable } from '../lib/reports/charts.mjs';
import { newId, nowIso } from '../db.mjs';

export function registerCoreRoutes(r, app) {
  const { entities, auth, notify, workflow, files, repos, settings, config, audit } = app;

  // ---------- Sign-in (INT-001, NFR-001) ----------
  r.get('/api/auth/config', () => ({
    mode: config.authMode, oidc: config.oidc.enabled, env: config.env,
    personas: config.authMode === 'demo' ? app.db.prepare('SELECT * FROM users WHERE active = 1').all().map(auth.rowToUser).filter((u) => u.persona)
      .map((u) => ({ id: u.id, name: u.name, title: u.title, persona: u.persona, external: u.external, roles: u.roles })) : [],
  }), { public: true });

  r.post('/api/auth/demo', (ctx) => {
    if (config.authMode !== 'demo') throw forbidden('Demo sign-in is disabled. Use single sign-on.');
    const user = auth.getUser(ctx.body?.userId);
    if (!user || !user.active) throw notFound('User not found');
    const { token, csrf } = auth.createSession(user, ctx.req);
    ctx.setCookie = cookie(auth.COOKIE, token, { secure: config.cookieSecure, sameSite: 'Strict' });
    return { ok: true, csrf };
  }, { public: true });

  r.get('/auth/login', async (ctx) => {
    if (!config.oidc.enabled) return new Redirect('/login?error=Single%20sign-on%20is%20not%20configured');
    return new Redirect(await auth.oidcStart(ctx.query.returnTo || '/'));
  }, { public: true });

  r.get('/auth/callback', async (ctx) => {
    try {
      const { user, returnTo } = await auth.oidcCallback(ctx.query, ctx.req);
      const { token } = auth.createSession(user, ctx.req);
      // Lax for the cross-site redirect back from the identity provider; Strict on later requests.
      return new Redirect(returnTo || '/', { 'Set-Cookie': cookie(auth.COOKIE, token, { secure: config.cookieSecure, sameSite: 'Lax' }) });
    } catch (e) {
      audit.record({ action: 'sign-in-failed', entity: 'user', summary: e.message, ip: ctx.ip });
      return new Redirect(`/login?error=${encodeURIComponent(e.message)}`);
    }
  }, { public: true });

  r.post('/api/auth/logout', (ctx) => {
    auth.endSession(ctx.cookies[auth.COOKIE], ctx.user, ctx.req);
    ctx.setCookie = cookie(auth.COOKIE, '', { maxAge: 0, secure: config.cookieSecure });
    return { ok: true };
  });

  r.get('/api/me', async (ctx) => {
    const a = ctx.access;
    const person = ctx.personId ? repos.person.get(ctx.personId) : null;
    const g = (k) => a.canGlobal(k);
    return {
      user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, title: ctx.user.title, roles: ctx.user.roles, external: ctx.user.external, client_id: ctx.user.client_id || null, notify_pref: ctx.user.notify_pref || 'immediate', persona: ctx.user.persona || null },
      csrf: ctx.session.csrf,
      person: person ? { id: person.id, name: person.name, grade: person.grade } : null,
      access: a.summary(),
      can: {
        portfolio: !a.isExternal && (g('finance.portfolio') || a.hasGlobal('pmo') || a.memberships.some((m) => ['engagement_manager', 'engagement_executive'].includes(m.role))),
        createEngagement: g('engagements.create'), clientsWrite: g('clients.write'), templatesLibrary: g('templates.library'), configDelivery: g('config.delivery'),
        adminUsers: g('admin.users'), adminSystem: g('admin.system'), audit: g('audit.read'), finance: a.hasGlobal('finance'), pmo: a.hasGlobal('pmo'),
        resources: a.hasGlobal('resource_manager'), costRates: g('costrates.read'), rateCards: g('ratecards.read'), bulkExport: g('export.bulk'),
      },
      settings: {
        firm: settings.get('firm'), lists: settings.get('lists'), riskMatrix: settings.get('riskMatrix'), reporting: settings.get('reporting'),
        timesheets: settings.get('timesheets'), ragRules: settings.get('ragRules'), tolerances: settings.get('tolerances'), alerts: settings.get('alerts'),
        finance: { gstRate: settings.get('finance').gstRate, fyStartMonth: settings.get('finance').fyStartMonth, forecastCommentary: settings.get('finance').forecastCommentary },
        security: { sessionIdleMinutes: settings.get('security').sessionIdleMinutes, uploadMaxMb: settings.get('security').uploadMaxMb },
      },
      unread: notify.unreadCount(ctx.user.id),
      env: config.env, authMode: config.authMode,
      features: { pdf: await sofficeAvailable(config.soffice), charts: chartsAvailable(), email: config.m365.enabled ? 'Microsoft 365' : 'Outbox (simulated)', ai: false },
      delegation: workflow.delegations.find({ from_user: ctx.user.id }).filter((d) => !d.to || d.to >= nowIso().slice(0, 10)).map((d) => ({ id: d.id, to_user: d.to_user, from: d.from, to: d.to })),
    };
  });

  // WFL-004 notification preference; WFL-006 approval delegation during leave.
  r.patch('/api/me', (ctx) => {
    const data = JSON.parse(app.db.prepare('SELECT data FROM users WHERE id = ?').get(ctx.user.id).data || '{}');
    if (ctx.body.notify_pref) {
      if (!['immediate', 'digest'].includes(ctx.body.notify_pref)) throw badRequest('Choose immediate or digest');
      data.notify_pref = ctx.body.notify_pref;
    }
    app.db.prepare('UPDATE users SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(data), nowIso(), ctx.user.id);
    audit.record({ userId: ctx.user.id, action: 'update', entity: 'user', entityId: ctx.user.id, summary: `Notification preference: ${data.notify_pref}` });
    return { ok: true };
  });

  r.post('/api/me/delegation', (ctx) => {
    const { to_user: to, from, to: until, reason } = ctx.body;
    if (ctx.user.external) throw forbidden();
    if (!auth.getUser(to) || to === ctx.user.id) throw badRequest('Choose a colleague to delegate to.');
    if (!from) throw badRequest('Choose the start date.');
    const rec = workflow.delegations.insert({ from_user: ctx.user.id, to_user: to, from, to: until || null, reason: reason || null }, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'delegate', entity: 'delegation', entityId: rec.id, summary: `Approvals delegated to ${auth.getUser(to).name} from ${from}${until ? ` to ${until}` : ''} (WFL-006)` });
    return rec;
  });

  r.delete('/api/me/delegation/:id', (ctx) => {
    const d = workflow.delegations.get(ctx.params.id);
    if (!d || d.from_user !== ctx.user.id) throw notFound();
    workflow.delegations.softDelete(d.id, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'delegate', entity: 'delegation', entityId: d.id, summary: 'Approval delegation ended' });
    return { ok: true };
  });

  // ---------- Generic registers ----------
  r.get('/api/e/:entity', (ctx) => entities.list(ctx, ctx.params.entity, ctx.query));
  r.get('/api/e/:entity/export', async (ctx) => exportList(ctx, ctx.params.entity, entities.list(ctx, ctx.params.entity, ctx.query)));
  r.get('/api/e/:entity/:id', (ctx) => entities.get(ctx, ctx.params.entity, ctx.params.id));
  r.post('/api/e/:entity', (ctx) => entities.create(ctx, ctx.params.entity, ctx.body || {}));
  r.patch('/api/e/:entity/:id', (ctx) => {
    const { _rev, ...input } = ctx.body || {};
    return entities.update(ctx, ctx.params.entity, ctx.params.id, input, { rev: _rev });
  });
  r.delete('/api/e/:entity/:id', (ctx) => entities.remove(ctx, ctx.params.entity, ctx.params.id));
  r.post('/api/e/:entity/bulk', (ctx) => entities.bulk(ctx, ctx.params.entity, ctx.body.ids, ctx.body.changes || {}), { internal: true });
  r.post('/api/e/:entity/:id/do/:action', (ctx) => entities.action(ctx, ctx.params.entity, ctx.params.id, ctx.params.action, ctx.body || {}));

  // RSK-009 / NFR-025: record history from the audit trail, with cost fields filtered.
  r.get('/api/e/:entity/:id/history', (ctx) => {
    const d = entities.def(ctx.params.entity);
    const rec = entities.get(ctx, ctx.params.entity, ctx.params.id);
    if (ctx.access.isExternal) throw forbidden();
    const costs = rec._can?.costs;
    const hidden = new Set(costs ? [] : d.fields.filter((f) => f.sensitive).map((f) => f.key));
    const strip = (o) => (o ? Object.fromEntries(Object.entries(o).filter(([k]) => !hidden.has(k) && !k.startsWith('_') && k !== 'score_history')) : o);
    return audit.query({ entity: ctx.params.entity, entityId: ctx.params.id, limit: 200 }).rows.map((x) => ({ ...x, before: strip(x.before), after: strip(x.after), user: auth.getUser(x.user_id)?.name || 'System', prev_hash: undefined }));
  });

  // RAI-008 combined RAID view and export.
  r.get('/api/raid', (ctx) => app.raid.combined(ctx, ctx.query));
  r.get('/api/raid/export', async (ctx) => {
    const rows = app.raid.combined(ctx, ctx.query);
    const columns = [{ key: 'type_label', label: 'Register' }, { key: 'ref', label: 'ID' }, { key: 'title', label: 'Title' }, { key: 'project', label: 'Project' }, { key: 'status', label: 'Status' },
      { key: 'level', label: 'Rating / severity' }, { key: 'owner', label: 'Owner' }, { key: 'due', label: 'Due / need by' }, { key: 'age_days', label: 'Age (days)' }, { key: 'review', label: 'Review overdue' }, { key: 'client_visible', label: 'Client-visible' }, { key: 'reportable', label: 'In report' }];
    const projects = new Map(repos.project.find({}).map((p) => [p.id, p.name]));
    const data = rows.map((x) => ({
      ...x, project: projects.get(x.project_id) || 'Engagement', level: x.residual_level || x.inherent_level || x.severity || '', owner: x.owner_name || auth.getUser(x.owner_id)?.name || '',
      due: x.due_date || x.target_date || x.need_by || x.validate_by || x.next_review || '', review: x.review_overdue ? 'Yes' : '', client_visible: x.client_visible ? 'Yes' : 'No', reportable: x.reportable ? 'Yes' : 'No',
    }));
    return exportRows(ctx, 'RAID', columns, data, ctx.query.format);
  });

  async function exportList(ctx, name, rows) {
    const d = entities.def(name);
    const columns = [...(d.fieldMap.ref ? [{ key: 'ref', label: 'ID' }] : []), ...d.fields.filter((f) => f.key !== 'ref' && !f.hidden && !['links', 'checklist', 'conditions', 'findings', 'measurements', 'versions', 'rates', 'invoicelines', 'estimate', 'recipients'].includes(f.type))
      .filter((f) => rows.some((r) => r[f.key] !== undefined)).map((f) => ({ key: f.key, label: f.label, type: f.type }))];
    const labels = labeller(ctx);
    const data = rows.map((r) => Object.fromEntries(columns.map((c) => [c.key, labels(d.fieldMap[c.key], r[c.key])])));
    return exportRows(ctx, d.plural, columns, data, ctx.query.format);
  }

  // NFR-010: exports are logged, and bulk exports are limited to authorised roles.
  async function exportRows(ctx, name, columns, rows, format = 'xlsx') {
    if (ctx.access.isExternal) throw forbidden();
    const bulk = rows.length > 500 || !ctx.query.engagement_id;
    if (bulk && !ctx.access.canGlobal('export.bulk') && rows.length > 50) throw forbidden('Bulk export is limited to authorised roles (NFR-010). Filter to one engagement.');
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'export', entity: name, engagementId: ctx.query.engagement_id || null, summary: `Exported ${rows.length} ${name} rows (${format})` });
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'csv') return new FileResponse(toCsv(columns, rows), { type: 'text/csv; charset=utf-8', name: `${name}_${stamp}.csv` });
    return new FileResponse(await toXlsx([{ name, columns, rows }]), { type: MIME.xlsx, name: `${name}_${stamp}.xlsx` });
  }

  function labeller(ctx) {
    const cache = new Map();
    const label = (entity, id) => {
      const k = `${entity}:${id}`;
      if (!cache.has(k)) {
        const rec = repos[entity]?.get(id);
        const d = ENTITIES[entity];
        cache.set(k, rec ? [rec.ref, rec[d?.title] || rec.name || rec.title].filter(Boolean).join(' ') : id);
      }
      return cache.get(k);
    };
    return (f, v) => {
      if (v === null || v === undefined || !f) return v;
      if (f.type === 'user') return auth.getUser(v)?.name || v;
      if (f.type === 'users') return (v || []).map((u) => auth.getUser(u)?.name || u).join(', ');
      if (f.type === 'person') return repos.person.get(v)?.name || v;
      if (f.type === 'contact') return repos.contact.get(v)?.name || v;
      if (f.type === 'ref' && f.ref) return label(f.ref, v);
      if (f.type === 'refs' && f.ref) return (v || []).map((x) => label(f.ref, x)).join(', ');
      if (f.type === 'skills') return (v || []).map((s) => `${s.name} (${s.level})`).join(', ');
      if (f.type === 'expiring') return (v || []).map((s) => `${s.level || s.name}${s.expiry ? ` to ${s.expiry}` : ''}`).join(', ');
      if (f.type === 'tags' || f.type === 'list') return (v || []).join(', ');
      if (f.type === 'bool') return v ? 'Yes' : 'No';
      void ctx;
      return v;
    };
  }

  // Labels for reference fields in forms, scoped to what the user can see.
  r.get('/api/lookups', (ctx) => {
    const engId = ctx.query.engagement_id;
    const out = { users: directory(ctx), people: [], projects: [], stages: [], milestones: [], deliverables: [], contracts: [], pos: [], contacts: [], changes: [], risks: [], issues: [], work_items: [], meetings: [], rate_cards: [], agreements: [], clients: [] };
    const safe = (fn) => { try { return fn(); } catch { return []; } };
    out.clients = safe(() => entities.list(ctx, 'client', {})).map((c) => ({ id: c.id, label: c.trading_name || c.legal_name, code: c.code }));
    if (!ctx.access.isExternal) out.people = repos.person.find({}).filter((p) => p.active !== false).map((p) => ({ id: p.id, label: p.name, grade: p.grade, user_id: p.user_id }));
    if (engId) {
      if (!ctx.access.canSeeEngagement(engId)) throw notFound();
      const e = repos.engagement.get(engId);
      const L = (name, fn = (x) => x[entities.def(name).title] || x.name) => safe(() => entities.list(ctx, name, { engagement_id: engId })).map((x) => ({ id: x.id, label: [x.ref, fn(x)].filter(Boolean).join(' '), project_id: x.project_id }));
      out.projects = L('project');
      out.stages = L('stage');
      out.milestones = L('milestone');
      out.deliverables = L('deliverable');
      out.contracts = L('contract', (x) => `${x.reference} ${x.title || ''}`.trim());
      out.pos = L('po', (x) => x.number);
      out.changes = L('change');
      out.risks = L('risk');
      out.issues = L('issue');
      out.meetings = L('meeting');
      out.work_items = L('work_item');
      out.contacts = safe(() => entities.list(ctx, 'contact', { client_id: e.client_id })).map((c) => ({ id: c.id, label: c.name, title: c.title }));
      out.agreements = safe(() => entities.list(ctx, 'agreement', { client_id: e.client_id })).map((c) => ({ id: c.id, label: `${c.reference} ${c.title}` }));
    }
    if (ctx.access.canGlobal('ratecards.read')) out.rate_cards = repos.rate_card.find({}).map((c) => ({ id: c.id, label: c.name }));
    if (ctx.query.client_id) {
      out.contacts = safe(() => entities.list(ctx, 'contact', { client_id: ctx.query.client_id })).map((c) => ({ id: c.id, label: c.name, title: c.title }));
      out.agreements = safe(() => entities.list(ctx, 'agreement', { client_id: ctx.query.client_id })).map((c) => ({ id: c.id, label: `${c.reference} ${c.title}` }));
    }
    return out;
  });

  function directory(ctx) {
    const rows = app.db.prepare('SELECT * FROM users WHERE active = 1').all().map(auth.rowToUser);
    if (!ctx.access.isExternal) return rows.map((u) => ({ id: u.id, label: u.name, email: u.email, title: u.title, external: u.external }));
    const engs = new Set(ctx.access.visibleEngagementIds());
    const members = new Set(app.db.prepare('SELECT user_id, engagement_id FROM memberships WHERE ended_at IS NULL').all().filter((m) => engs.has(m.engagement_id)).map((m) => m.user_id));
    return rows.filter((u) => members.has(u.id)).map((u) => ({ id: u.id, label: u.name, title: u.title }));
  }
  r.get('/api/directory', (ctx) => directory(ctx));

  // ---------- Files (receipts, logos, evidence) ----------
  const IMAGE = ['png', 'jpg', 'gif'];
  // Checks an upload by content (NFR-008), scans it and stores it.
  async function storeUpload(ctx, { purpose, engagementId }) {
    const buffer = ctx.body;
    const name = ctx.fileName || 'upload';
    const ext = name.split('.').pop().toLowerCase();
    const kind = sniff(buffer);
    if (['docm', 'xlsm', 'pptm', 'dotm', 'exe', 'js', 'bat', 'cmd', 'ps1', 'html', 'htm', 'svg'].includes(ext)) throw unprocessable('This file type is not accepted (NFR-008).');
    if (['logo', 'receipt'].includes(purpose) && !IMAGE.includes(kind) && !(purpose === 'receipt' && kind === 'pdf')) throw unprocessable('Upload a PNG, JPEG or GIF image.');
    if (!['png', 'jpg', 'gif', 'pdf', 'zip'].includes(kind) && !['csv', 'txt'].includes(ext)) throw unprocessable('Unsupported file type; files are checked by content, not extension.');
    if (kind === 'zip') {
      const pkg = await inspectPackage(buffer);
      const fatal = pkg.issues.filter((i) => i.severity === 'error');
      if (fatal.length) throw unprocessable(fatal.map((i) => i.message).join('; '));
    }
    const scan = await app.integrations.scan(buffer);
    if (scan.status === 'infected') throw unprocessable('The file failed the malware scan.');
    const meta = files.save(buffer, { name, mime: MIME[kind] || MIME[ext], engagementId, purpose, userId: ctx.user.id, scan: scan.status });
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'upload', entity: 'file', entityId: meta.id, engagementId, summary: `Uploaded ${name} (${purpose}, scan: ${scan.status})` });
    return { ...meta, scan: scan.status };
  }

  r.post('/api/files', async (ctx) => {
    const purpose = ctx.req.headers['x-purpose'] || 'document';
    const engagementId = ctx.req.headers['x-engagement-id'] || null;
    if (engagementId && !ctx.access.canSeeEngagement(engagementId)) throw forbidden();
    const meta = await storeUpload(ctx, { purpose, engagementId });
    return { id: meta.id, name: meta.name, size: meta.size, mime: meta.mime, scan: meta.scan };
  }, { raw: true });

  // DOC-004: documents and evidence attached to any record. Adding needs edit rights on the
  // record; approved or locked items still accept evidence from people who could edit them.
  const attachmentTarget = (ctx) => {
    const d = entities.def(ctx.params.entity);
    const rec = d && entities.raw(ctx.params.entity, ctx.params.id);
    if (!rec || ctx.access.isExternal || !entities.canRead(ctx, d, rec)) throw notFound();
    if (!entities.canWrite(ctx, d, rec, 'U')) throw forbidden('You cannot change attachments on this record.');
    return { d, rec };
  };
  r.post('/api/e/:entity/:id/attachments', async (ctx) => {
    const { d, rec } = attachmentTarget(ctx);
    const meta = await storeUpload(ctx, { purpose: 'attachment', engagementId: rec.engagement_id || null });
    const list = [...(rec.attachments || []), { file_id: meta.id, name: meta.name, size: meta.size, mime: meta.mime, by: ctx.user.id, at: nowIso() }];
    entities.repos[d.name].patch(rec.id, { attachments: list }, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'update', entity: d.name, entityId: rec.id, engagementId: rec.engagement_id, summary: `Attachment ${meta.name} added to ${d.label.toLowerCase()} ${rec.ref || ''}`.trim() });
    return list;
  }, { raw: true, internal: true });
  r.delete('/api/e/:entity/:id/attachments/:fileId', (ctx) => {
    const { d, rec } = attachmentTarget(ctx);
    const gone = (rec.attachments || []).find((a) => a.file_id === ctx.params.fileId);
    if (!gone) throw notFound('Attachment not found');
    const list = (rec.attachments || []).filter((a) => a.file_id !== ctx.params.fileId);
    entities.repos[d.name].patch(rec.id, { attachments: list }, ctx.user.id);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'update', entity: d.name, entityId: rec.id, engagementId: rec.engagement_id, summary: `Attachment ${gone.name} removed from ${d.label.toLowerCase()} ${rec.ref || ''} (file kept for the audit trail)`.trim() });
    return list;
  }, { internal: true });

  r.get('/api/files/:id', (ctx) => {
    const f = files.read(ctx.params.id);
    if (!f || !canReadFile(ctx, f.meta)) throw notFound('File not found');
    const inline = ctx.query.inline === '1' && (/^image\//.test(f.meta.mime) || f.meta.mime === MIME.pdf);
    return new FileResponse(f.buffer, { type: f.meta.mime || 'application/octet-stream', name: f.meta.name, inline });
  });

  function canReadFile(ctx, meta) {
    const a = ctx.access;
    if (meta.purpose === 'logo') return !a.isExternal || repos.client.find({}).some((c) => c.logo_file_id === meta.id && c.id === ctx.user.client_id);
    if (a.isExternal) {
      const reports = repos.reports.find({ engagement_id: meta.engagement_id }).filter((x) => x.status === 'Issued' && x.audience === 'client' && Object.values(x.files || {}).includes(meta.id));
      const docs = repos.document.find({ engagement_id: meta.engagement_id }).filter((d) => d.client_visible && d.file_id === meta.id);
      return (reports.length || docs.length) && a.rolesOn(meta.engagement_id).includes('client');
    }
    if (meta.purpose === 'receipt') {
      const exp = repos.expense.find({}).find((x) => x.receipt_file_id === meta.id);
      return meta.uploaded_by === ctx.user.id || (exp && a.can(exp.engagement_id, 'time_approve', 'A')) || a.hasGlobal('finance');
    }
    if (!meta.engagement_id) return meta.uploaded_by === ctx.user.id || ['template', 'report'].includes(meta.purpose);
    return a.canSeeEngagement(meta.engagement_id);
  }

  // ---------- Notifications (WFL-002) ----------
  r.get('/api/notifications', (ctx) => ({ unread: notify.unreadCount(ctx.user.id), items: notify.list(ctx.user.id, { unread: ctx.query.unread === '1', limit: Number(ctx.query.limit) || 50 }) }));
  r.post('/api/notifications/read', (ctx) => { notify.markRead(ctx.user.id, ctx.body.ids || 'all'); return { unread: notify.unreadCount(ctx.user.id) }; });

  // ---------- Approvals (WFL-001) ----------
  const approvalView = (a) => ({
    ...a, requested_by_name: auth.getUser(a.requested_by)?.name,
    steps: a.steps.map((s) => ({ ...s, approver_names: s.approvers.map((u) => auth.getUser(u)?.name || u), decisions: s.decisions.map((d) => ({ ...d, by_name: auth.getUser(d.by)?.name, for_name: auth.getUser(d.for)?.name })) })),
    engagement: a.engagement_id ? repos.engagement.get(a.engagement_id)?.name : null,
  });
  r.get('/api/approvals', (ctx) => ({
    inbox: workflow.inbox(ctx.user.id).map(approvalView),
    requested: workflow.repo.find({}).filter((a) => a.requested_by === ctx.user.id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 30).map(approvalView),
  }));
  r.get('/api/approvals/entity/:entity/:id', (ctx) => {
    const d = ENTITIES[ctx.params.entity];
    if (d) entities.get(ctx, ctx.params.entity, ctx.params.id);
    else if (ctx.access.isExternal) throw forbidden();
    return workflow.forEntity(ctx.params.entity, ctx.params.id).map(approvalView);
  });
  r.post('/api/approvals/:id/decide', (ctx) => approvalView(workflow.decide(ctx, ctx.params.id, ctx.body || {})));

  // ---------- Comments and @mentions (WFL-007) ----------
  r.get('/api/comments/:entity/:id', (ctx) => {
    if (ctx.access.isExternal) throw forbidden();
    entities.get(ctx, ctx.params.entity, ctx.params.id);
    return app.db.prepare('SELECT * FROM comments WHERE entity = ? AND entity_id = ? ORDER BY created_at').all(ctx.params.entity, ctx.params.id)
      .map((c) => ({ ...c, mentions: JSON.parse(c.mentions || '[]'), user: auth.getUser(c.user_id)?.name }));
  });
  r.post('/api/comments/:entity/:id', (ctx) => {
    if (ctx.access.isExternal) throw forbidden();
    const rec = entities.get(ctx, ctx.params.entity, ctx.params.id);
    const body = String(ctx.body?.body || '').trim();
    if (!body) throw badRequest('Write a comment.');
    const mentioned = [...body.matchAll(/@\[([^\]]+)\]\(([\w]+)\)/g)].map((m) => m[2]).filter((uid) => {
      const u = auth.getUser(uid);
      if (!u) return false;
      const c = app.contextFor(u);
      return entities.canRead(c, entities.def(ctx.params.entity), repos[ctx.params.entity].get(ctx.params.id));
    });
    const id = newId('cmt');
    app.db.prepare('INSERT INTO comments (id, entity, entity_id, engagement_id, user_id, body, mentions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, ctx.params.entity, ctx.params.id, rec.engagement_id || null, ctx.user.id, body, JSON.stringify(mentioned), nowIso());
    const d = entities.def(ctx.params.entity);
    const link = rec.project_id ? `/projects/${rec.project_id}?open=${rec.id}&entity=${ctx.params.entity}` : rec.engagement_id ? `/engagements/${rec.engagement_id}?open=${rec.id}&entity=${ctx.params.entity}` : '/my-work';
    notify.send(mentioned.filter((u) => u !== ctx.user.id), { kind: 'mention', title: `${ctx.user.name} mentioned you on ${d.label.toLowerCase()} ${rec.ref || rec[d.title] || ''}`, body: body.replace(/@\[([^\]]+)\]\([\w]+\)/g, '@$1').slice(0, 300), link, engagementId: rec.engagement_id });
    return { id };
  });

  // Shared enumerations for the UI.
  r.get('/api/schema', () => ({ raidTypes: RAID_TYPES }));
}
