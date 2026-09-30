// Server checks for the Proposal Platform API: sessions, server-side permissions, ethical walls, cost redaction,
// cross-origin refusal, file access control and virus scanning, the AI endpoint (offline and with a stubbed Claude
// client), and PDF rendering when LibreOffice is installed. Run: npm run check:server
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProposalsApi } from '../server/proposals.mjs';
import { createProposalAi } from '../server/proposalsAi.mjs';
import { buildSeed } from '../src/proposals/core/seed/index.js';
import { viewFor } from '../src/proposals/core/view.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PROPOSALS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cto-pp-check-'));
const api = createProposalsApi({ root });
const server = http.createServer((req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  if (pathname.startsWith('/api/p/')) return void api.handle(req, res, pathname, searchParams);
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/api/p`;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}`); } };
const signIn = async (userId) => {
  const r = await fetch(`${BASE}/signin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
  return r.headers.get('set-cookie').split(';')[0];
};
const call = async (cookie, route, body, extra = {}) => {
  const r = await fetch(`${BASE}/${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, ...extra }, body: body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body) });
  const type = r.headers.get('content-type') || '';
  return { status: r.status, headers: r.headers, body: type.includes('json') ? await r.json() : new Uint8Array(await r.arrayBuffer()) };
};

console.log('Sessions and reads');
const anon = await call('', 'state');
ok(anon.status === 401, 'Unauthenticated reads are refused');
const session = await call('', 'session');
ok(session.body.mode === 'server' && session.body.users.length > 5, 'Session endpoint reports server mode and the demonstration users');
const sophie = await signIn('u_sophie');
const sv = (await call(sophie, 'state')).body.view;
ok(sv.me.id === 'u_sophie', 'Sign-in creates a session for the chosen user');
ok(sv.bids.find((b) => b.id === 'bid_kestrel')._d.pricing.labourCost === null, 'Bid manager does not receive cost or margin (PR-08)');
const rebecca = await signIn('u_rebecca');
const rv = (await call(rebecca, 'state')).body.view;
ok(rv.bids.find((b) => b.id === 'bid_kestrel')._d.pricing.labourCost > 0, 'Commercial approver on the team receives margin data');
const ethan = await signIn('u_ethan');
ok(!(await call(ethan, 'state')).body.view.bids.some((b) => b.id === 'bid_tasman'), 'Ethical wall hides the confidential bid from the walled user');

console.log('Commands');
const c1 = await call(sophie, 'cmd', { cmd: 'clar.upsert', args: { bidId: 'bid_srwa', clar: { question: 'How many OT sites are in scope?' } } });
ok(c1.status === 200 && c1.body.view.bids.find((b) => b.id === 'bid_srwa').clarifications.some((c) => c.question.startsWith('How many OT')), 'A permitted command runs and returns the updated view');
const c2 = await call(sophie, 'cmd', { cmd: 'lib.approve', args: { itemId: 'lib_sa015' } });
ok(c2.status === 400 || c2.status === 403, 'The server refuses a command the role does not allow');
const c3 = await call(ethan, 'cmd', { cmd: 'comment.add', args: { bidId: 'bid_tasman', sectionId: 'x', quote: 'x', text: 'x' } });
ok(c3.status >= 400, 'A walled user cannot act on the bid');
const c4 = await call(sophie, 'cmd', { cmd: 'notif.read', args: { all: true } }, { Origin: 'http://attacker.example' });
ok(c4.status === 403, 'Cross-origin commands are refused');
const audit = (await call(sophie, 'query/audit', { bidId: 'bid_srwa' })).body.result;
ok(audit.integrity?.ok && audit.events.some((e) => e.action === 'clar.upsert'), 'Audit trail records the command and the hash chain verifies');

console.log('Files');
const bytes = new TextEncoder().encode('fictitious request document');
const up = await call(sophie, 'files?name=request.txt&type=text/plain&bidId=bid_srwa', bytes, { 'Content-Type': 'application/octet-stream' });
ok(up.status === 200 && /^file_/.test(up.body.id), 'Upload stores a file against the bid');
const down = await call(sophie, `files/${up.body.id}`);
ok(down.status === 200 && new TextDecoder().decode(down.body) === 'fictitious request document', 'The uploader can download it');
const priya = await signIn('u_priya');
const tUp = await call(priya, 'files?name=t.txt&bidId=bid_tasman', bytes, { 'Content-Type': 'application/octet-stream' });
const blocked = await call(ethan, `files/${tUp.body.id}`);
ok(tUp.status === 200 && blocked.status === 403, 'A walled user cannot download the confidential bid’s files');
const eicar = new TextEncoder().encode('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
ok((await call(sophie, 'files?name=e.txt', eicar, { 'Content-Type': 'application/octet-stream' })).status === 422, 'The virus scan blocks the EICAR test file');

console.log('AI');
const aisha = await signIn('u_aisha');
const d = await call(aisha, 'ai', { action: 'draft', bidId: 'bid_srwa', sectionId: 'sec_srwa_essential_eight', html: '', mode: 'append' });
ok(d.status === 200 && d.body.engine === 'offline' && d.body.result.stats.cited > 0, 'Without an API key the offline engine drafts with citations');
ok((await call(aisha, 'ai', { action: 'brief', bidId: 'bid_tasman' })).status === 404, 'AI cannot be pointed at a bid the user cannot see');
const log = (await call(aisha, 'query/aiLog', { bidId: 'bid_srwa' })).body.result;
ok(log.some((e) => e.action === 'draft' && e.engine === 'offline' && e.userId === 'u_aisha'), 'The server logs the AI call');

const fake = { beta: { messages: { stream: () => ({ finalMessage: async () => ({ model: 'stub', stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 100 }, content: [{ type: 'text', text: JSON.stringify({ blocks: [{ kind: 'paragraph', heading: '', sentences: [{ text: 'We will reach Maturity Level 2.', sources: ['R-M6'] }, { text: 'Unsupported claim.', sources: ['NOPE'] }], items: [] }] }) }] }) }) } } };
const stub = createProposalAi({ client: fake, model: 'stub', enabled: true });
const st = buildSeed();
const out = await stub.handle({ action: 'draft', bidId: 'bid_srwa', sectionId: 'sec_srwa_essential_eight', html: '' }, { view: viewFor(st, 'u_aisha') });
ok(out.body.engine === 'claude' && /data-src="req:rq_srwa_M6"/.test(out.body.result.html), 'Claude’s source IDs become citations');
ok(/data-flag="needs-evidence">Unsupported claim/.test(out.body.result.html) && out.body.result.stats.flagged === 1, 'Sentences without a valid source are flagged “needs evidence” (WD-02)');
ok((out.body.result.html.match(/data-ai="pending"/g) || []).length === 2, 'All Claude text is labelled as AI text awaiting review (WD-03)');
const refusing = createProposalAi({ client: { beta: { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: 'refusal', content: [] }) }) } } }, model: 'stub', enabled: true });
const fb = await refusing.handle({ action: 'draft', bidId: 'bid_srwa', sectionId: 'sec_srwa_essential_eight', html: '' }, { view: viewFor(st, 'u_aisha') });
ok(fb.body.engine === 'offline' && /declined/.test(fb.body.result.fallbackReason), 'A refusal falls back to the offline engine and says why');

const health = api.health();
if (health.pdf) {
  console.log('PDF rendering');
  const { buildDocument } = await import('../src/proposals/gen/wordTemplate.js');
  const docx = await buildDocument({ bodyXml: '<w:p><w:r><w:t>Fictitious test document</w:t></w:r></w:p>', title: 'Test' });
  const r = await call(sophie, 'render?format=pdfa', docx, { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'test.docx' });
  ok(r.status === 200 && new TextDecoder().decode(r.body.slice(0, 5)) === '%PDF-' && Number(r.headers.get('x-page-count')) >= 1, 'LibreOffice renders a PDF/A and reports the page count');
} else console.log('PDF rendering: skipped (LibreOffice not installed)');

server.close();
api.flush();
fs.rmSync(process.env.PROPOSALS_DATA_DIR, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
