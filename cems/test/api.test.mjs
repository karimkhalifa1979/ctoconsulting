// API tests against a freshly seeded, isolated instance: sign-in and CSRF, client data isolation
// enforced at the data layer (CPT-005), cost visibility (ACC-003), project-scoped access,
// business rules (BR-06, BR-08, BR-09, BR-13), the report lifecycle (RPT-040, RPT-041, BR-07),
// attachments (DOC-004, NFR-008) and the audit chain (NFR-025).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../server/app.mjs';
import { seed } from '../server/seed/seed.mjs';
import { addDays, weekStart, todayIn } from '../shared/dates.js';
import { isBetter } from '../shared/rag.js';

let app, server, base, dir;
const ids = {};

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cems-test-'));
  app = createApp({ dataDir: dir, env: { CEMS_AUTH_MODE: 'demo' } });
  await seed(app, { pdf: false, reports: true, quiet: true });
  server = http.createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const e = app.repos.engagement.find({}).find((x) => x.code === 'DRS-E001');
  ids.E = e.id;
  const projects = app.repos.project.find({ engagement_id: e.id });
  ids.P02 = projects.find((p) => p.code.endsWith('P02')).id;
  ids.P03 = projects.find((p) => p.code.endsWith('P03')).id;
});

after(() => {
  server?.close();
  app?.db?.close?.();
  fs.rmSync(dir, { recursive: true, force: true });
});

// A signed-in session for a seeded persona.
async function as(name) {
  const config = await (await fetch(`${base}/api/auth/config`)).json();
  const persona = config.personas.find((p) => p.name.startsWith(name));
  assert.ok(persona, `persona ${name}`);
  const res = await fetch(`${base}/api/auth/demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: persona.id }) });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { csrf } = await res.json();
  const call = async (method, p, body, headers = {}) => {
    const r = await fetch(`${base}${p}`, {
      method, headers: { cookie, 'x-csrf-token': csrf, ...(body && !Buffer.isBuffer(body) ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined,
    });
    const type = r.headers.get('content-type') || '';
    return { status: r.status, body: type.includes('json') ? await r.json() : await r.arrayBuffer() };
  };
  return {
    userId: persona.id,
    cookie,
    get: (p) => call('GET', p),
    post: (p, b, h) => call('POST', p, b ?? {}, h),
    put: (p, b) => call('PUT', p, b ?? {}),
    patch: (p, b) => call('PATCH', p, b ?? {}),
    del: (p) => call('DELETE', p),
  };
}

// Keys that must never reach a client user (CPT-005).
const INTERNAL = ['internal_notes', 'margin_target', 'forecastMargin', 'baselineMargin', 'marginErosion', 'wip', 'wipAgeing', 'commercial', 'final_position',
  'impact_cost', 'impact_margin', 'cost', 'cost_rate', 'budget_cost', 'bac', 'eac', 'ac', 'labourCost', 'evm_history', 'current_eac', 'tolerances', 'raid_inclusions'];
function internalKeys(value, found = new Set(), trail = '') {
  if (Array.isArray(value)) value.forEach((v, i) => internalKeys(v, found, `${trail}[${i}]`));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (INTERNAL.includes(k) && v !== undefined && v !== null) found.add(`${trail}.${k}`);
      internalKeys(v, found, `${trail}.${k}`);
    }
  }
  return [...found];
}

test('the API requires a session, and state changes require the CSRF token', async () => {
  assert.equal((await fetch(`${base}/api/me`)).status, 401);
  assert.equal((await fetch(`${base}/api/e/risk`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  const tom = await as('Tom');
  assert.equal((await tom.get('/api/me')).status, 200);
  const noCsrf = await fetch(`${base}/api/e/risk`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: tom.cookie }, body: '{}' });
  assert.equal(noCsrf.status, 403);
});

test('client users never receive internal data, enforced at the data layer (CPT-005)', async () => {
  const rachel = await as('Rachel');
  const portal = await rachel.get('/api/portal');
  assert.equal(portal.status, 200);
  assert.deepEqual(internalKeys(portal.body), []);
  for (const name of ['project', 'engagement', 'risk', 'issue', 'action', 'change', 'deliverable', 'milestone', 'invoice', 'decision', 'dependency']) {
    const res = await rachel.get(`/api/e/${name}?engagement_id=${ids.E}`);
    if (res.status !== 200) continue; // not visible at all is also acceptable
    assert.deepEqual(internalKeys(res.body), [], `${name} leaks internal fields`);
    if (['risk', 'issue', 'action', 'decision', 'dependency', 'change'].includes(name)) {
      for (const r of res.body) assert.notEqual(app.repos[name].get(r.id).client_visible, false, `${name} ${r.ref} is not client-visible`);
    }
    if (name === 'invoice') for (const i of res.body) assert.ok(['Issued', 'Paid', 'Overdue', 'Disputed'].includes(i.status), `draft invoice ${i.id} visible`);
  }
  for (const p of [`/api/finance/engagement/${ids.E}`, `/api/dash/engagement/${ids.E}`, `/api/finance/project/${ids.P02}`, '/api/e/cost_rate', '/api/e/rate_card', '/api/admin/audit', `/api/engagements/${ids.E}/members`]) {
    const res = await rachel.get(p);
    assert.ok(res.status === 403 || res.status === 404 || (res.status === 200 && Array.isArray(res.body) && !res.body.length), `${p} returned ${res.status}`);
  }
  const reports = await rachel.get('/api/reports');
  for (const r of reports.body) assert.equal(r.status, 'Issued');
  for (const r of reports.body) assert.equal(app.repos.reports.get(r.id).audience, 'client');
  // Client users can change only the status and notes of actions their organisation owns (CPT-004).
  const risk = app.repos.risk.find({ engagement_id: ids.E }).find((x) => x.client_visible);
  assert.equal((await rachel.patch(`/api/e/risk/${risk.id}`, { title: 'Changed by client' })).status, 403);
});

test('cost rates, margins and WIP are restricted to finance, executives and engagement managers (ACC-003)', async () => {
  const tom = await as('Tom');
  const pos = await tom.get(`/api/finance/project/${ids.P03}`);
  assert.equal(pos.status, 200);
  for (const k of ['forecastMargin', 'baselineMargin', 'wip', 'wipAgeing']) assert.equal(pos.body[k], undefined, `${k} visible to a project manager`);
  const project = await tom.get(`/api/e/project/${ids.P02}`);
  assert.equal(project.body.margin_target, undefined);
  assert.equal(project.body.commercial?.margin, undefined);
  const dash = await tom.get(`/api/dash/project/${ids.P02}`);
  assert.equal(dash.body.project.commercial?.cost, undefined);
  const rates = await tom.get('/api/e/cost_rate');
  assert.ok(rates.status !== 200 || !rates.body.length, 'cost rates visible to a project manager');
  const marcus = await as('Marcus');
  const em = await marcus.get(`/api/finance/project/${ids.P02}`);
  assert.equal(typeof em.body.forecastMargin, 'number');
});

test('a project manager works on their own projects only (ACC-001)', async () => {
  const tom = await as('Tom');
  const me = await tom.get('/api/me');
  assert.ok(me.body.access[ids.E].projects[ids.P03].raid.some((x) => x.startsWith('C')));
  const ownerId = tom.userId;
  const risk = { title: 'Test risk', event: 'Something happens', owner_id: ownerId, likelihood: 3, consequence: 3, engagement_id: ids.E };
  assert.equal((await tom.post('/api/e/risk', { ...risk, project_id: ids.P03 })).status, 200);
  assert.equal((await tom.post('/api/e/risk', { ...risk, project_id: ids.P02 })).status, 403);
});

test('a rating better than the calculated one needs a justification before submission (BR-06)', async () => {
  const priya = await as('Priya');
  const periodEnd = addDays(todayIn('Australia/Sydney'), 7);
  const opened = await priya.post(`/api/projects/${ids.P02}/status/open`, { period_end: periodEnd });
  assert.equal(opened.status, 200);
  const su = opened.body;
  const worse = Object.entries(su.system_data.suggested).find(([k, v]) => k !== 'overall' && v.rag !== 'Green');
  assert.ok(worse, 'the demo project has a dimension calculated worse than Green');
  const [dim] = worse;
  const ratings = Object.fromEntries(Object.entries(su.ratings).map(([k, v]) => [k, { rag: v.rag, commentary: v.commentary || 'Commentary' }]));
  ratings[dim] = { rag: 'Green', commentary: 'We think it is fine', justification: '' };
  const narrative = { executive_summary: 'Summary', achievements: 'Done things', next_period: 'More things' };
  assert.equal((await priya.patch(`/api/status/${su.id}`, { content_rev: su.content_rev || 0, ratings, ...narrative })).status, 200);
  const blocked = await priya.post(`/api/status/${su.id}/submit`);
  assert.equal(blocked.status, 422);
  assert.match(blocked.body.error || blocked.body.message || '', /BR-06/);
  const fresh = (await priya.get(`/api/status/${su.id}`)).body;
  // Every rating better than calculated needs one, including those carried from last week.
  for (const [k, r] of Object.entries(ratings)) if (isBetter(r.rag, fresh.system_data.suggested[k]?.rag)) r.justification = 'Recovery plan agreed with the client sponsor';
  assert.equal((await priya.patch(`/api/status/${su.id}`, { content_rev: fresh.content_rev, ratings })).status, 200);
  const ok = await priya.post(`/api/status/${su.id}/submit`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'Submitted');
  assert.ok(ok.body.overrides.some((o) => o.dimension === dim));
});

test('time cannot be recorded for future weeks (BR-08) and approved time is locked (BR-09)', async () => {
  const aisha = await as('Aisha');
  const today = todayIn('Australia/Sydney');
  const next = addDays(weekStart(today), 7);
  const week = (await aisha.get(`/api/time/week?week_start=${weekStart(today)}`)).body;
  const code = week.codes.find((c) => !c.closed);
  const future = await aisha.put('/api/time/week', { week_start: next, entries: [{ date: addDays(next, 1), project_id: code.project_id, hours: 8 }] });
  assert.equal(future.status, 422);
  const past = addDays(weekStart(today), -14);
  const before = (await aisha.get(`/api/time/week?week_start=${past}`)).body;
  const approved = before.entries.find((x) => x.status === 'Approved');
  assert.ok(approved, 'an approved line two weeks ago');
  await aisha.put('/api/time/week', { week_start: past, entries: before.entries.map((x) => (x.id === approved.id ? { ...x, hours: 1 } : x)) });
  assert.equal(app.repos.time_entries.get(approved.id).hours, approved.hours);
});

test('PO consumption is compared on the PO’s own GST basis (BR-13)', () => {
  const po = app.repos.po.find({ engagement_id: ids.E }).find((x) => x.gst_basis === 'inclusive');
  const s = app.finance.poStatus(po);
  const issued = app.repos.invoice.find({ engagement_id: ids.E }).filter((i) => i.po_id === po.id && ['Issued', 'Paid', 'Overdue', 'Disputed', 'Sent to accounting'].includes(i.status));
  const exGst = issued.reduce((a, i) => a + Number(i.amount), 0);
  assert.ok(Math.abs(s.invoiced - exGst * 1.1) < 0.01, `invoiced ${s.invoiced} vs ${exGst * 1.1}`);
});

test('reports are approved, issued, locked, and only approved updates are marked reported (RPT-040, RPT-041, BR-07)', async () => {
  const marcus = await as('Marcus');
  const gen = await marcus.post('/api/reports/generate', { engagement_id: ids.E, report_type: 'Weekly status', audience: 'client', scope: 'all', proceed: true, formats: ['docx'] });
  assert.equal(gen.status, 200);
  assert.ok(gen.body.generated);
  const id = gen.body.report.id;
  assert.equal(gen.body.report.can.issue, false, 'client reports need approval first');
  assert.equal((await marcus.post(`/api/reports/${id}/submit`)).status, 200);
  const olivia = await as('Olivia');
  const inbox = (await olivia.get('/api/approvals')).body.inbox.find((a) => a.entity === 'report' && a.entity_id === id);
  assert.ok(inbox, 'approval routed to the engagement executive');
  assert.equal((await olivia.post(`/api/approvals/${inbox.id}/decide`, { decision: 'approve', comment: 'OK' })).status, 200);
  const issued = await marcus.post(`/api/reports/${id}/issue`, { distribute: false });
  assert.equal(issued.status, 200);
  assert.equal(issued.body.report.status, 'Issued');
  const rep = app.repos.reports.get(id);
  assert.equal(app.repos.snapshots.get(rep.snapshot_id).locked, true);
  for (const suId of rep.status_update_ids) {
    const su = app.repos.status_updates.get(suId);
    if (su.status === 'Reported') assert.ok(su.locked);
    else assert.ok(su.reported_unapproved, `unapproved update ${suId} recorded against the report`);
  }
  // A locked, issued report cannot be regenerated; corrections supersede it.
  assert.equal((await marcus.post(`/api/reports/${id}/regenerate`)).status, 400);
});

test('attachments are scanned, typed by content and stay inside the engagement (DOC-004, NFR-008)', async () => {
  const tom = await as('Tom');
  const risk = app.repos.risk.find({ project_id: ids.P03 })[0];
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  const up = await tom.post(`/api/e/risk/${risk.id}/attachments`, pdf, { 'x-file-name': 'evidence.pdf', 'content-type': 'application/pdf' });
  assert.equal(up.status, 200);
  const fileId = up.body.at(-1).file_id;
  const html = await tom.post(`/api/e/risk/${risk.id}/attachments`, Buffer.from('<script>alert(1)</script>'), { 'x-file-name': 'page.html', 'content-type': 'text/html' });
  assert.equal(html.status, 422);
  const marcus = await as('Marcus');
  assert.equal((await marcus.get(`/api/files/${fileId}`)).status, 200);
  const rachel = await as('Rachel');
  assert.equal((await rachel.get(`/api/files/${fileId}`)).status, 404);
});

test('the audit trail is hash-chained and verifies (NFR-025)', async () => {
  const arjun = await as('Arjun');
  const v = await arjun.post('/api/admin/audit/verify');
  assert.equal(v.status, 200);
  assert.equal(v.body.ok, true);
  assert.ok(v.body.count > 100);
});
