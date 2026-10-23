// Service-level acceptance criteria (Section 14) and controls that need the whole service: milestone-
// relative engagements, engagement completion, import duplicates, artefact completeness, sensitive
// fields, Office document structure and reproduction, plus the reporting feed, the record API's write
// guard, schedules, duplicate review and the report builder. Each test runs against the demonstration data.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { createService } from '../shared/service/index.js';
import { createMemoryDriver } from '../shared/memoryDriver.js';
import { seedDemo } from '../shared/seed/demo.js';
import { nextRun } from '../shared/service/ops/artefacts.js';
import { runReport, datasetFields } from '../shared/reportBuilder.js';
import { addDays } from '../shared/dates.js';

let S;
let ini;
let users;
const who = (name) => users.find((u) => u.name === name);
const byRole = (role) => users.find((u) => u.roles?.includes(role) && u.status === 'active');
const blobText = async (blobId) => new TextDecoder().decode((await S.driver.getBlob(blobId)).bytes);

before(async () => {
  S = createService({ driver: createMemoryDriver(), env: { mode: 'standalone' } });
  const r = await seedDemo(S, {});
  users = await S.driver.list('user');
  ini = (await S.driver.list('initiative')).find((i) => i.shortName === 'Case Management') || await S.driver.get('initiative', Object.values(r.initiatives)[0]);
});

test('AC-04 / STK-023: an engagement ten business days before go-live moves with the milestone and its owner is told', async () => {
  const lead = who('Priya Raman');
  const sponsor = (await S.driver.list('stakeholder')).find((s) => s.id === ini.primarySponsorId);
  const ms = await S.create(lead, 'milestone', { initiativeId: ini.id, name: 'Test go-live', kind: 'goLive', date: '2027-03-01' });
  const r = await S.ops.savePlanItem(lead, {
    initiativeId: ini.id, loadAck: 'Test',
    item: { objective: 'Readiness briefing before go-live', adkar: ['knowledge'], engagementLevel: 'inform', engagementType: 'briefing', channel: 'virtual', stakeholderIds: [sponsor.id], timingMode: 'milestone', milestoneId: ms.id, offsetBusinessDays: -10, cadence: 'oneOff', senderId: sponsor.id, relationshipOwnerId: lead.id },
  });
  const item = r.planItem;
  const occ = () => S.driver.list('engagement', { initiativeId: ini.id }).then((l) => l.filter((e) => e.planItemId === item.id));
  assert.equal((await occ())[0].plannedDate, '2027-02-15');
  await S.update(lead, 'milestone', ms.id, { date: '2027-03-15' }, { version: ms.version });
  assert.equal((await occ())[0].plannedDate, '2027-03-01');
  const notes = (await S.driver.list('notification')).filter((n) => n.userId === lead.id && n.kind === 'reschedule');
  assert.ok(notes.length >= 1, 'the owner is notified');
});

test('AC-05 / RUL-08: logging an engagement completes it, it appears in the history, and missing details block completion', async () => {
  const lead = who('Priya Raman');
  const profile = (await S.driver.list('profile', { initiativeId: ini.id })).find((p) => p.stakeholderId && p.subjectType !== 'group');
  const e = await S.create(lead, 'engagement', { initiativeId: ini.id, status: 'planned', plannedDate: '2026-11-20', objective: 'Check-in', engagementType: 'oneToOne', channel: 'virtual', stakeholderIds: [profile.stakeholderId] });
  await assert.rejects(S.ops.logEngagement(lead, { initiativeId: ini.id, engagementId: e.id, version: e.version, data: { actualDate: '2026-11-20', engagementType: 'oneToOne', stakeholderIds: [profile.stakeholderId], summary: '<p>Discussed the timeline.</p>' } }), /cannot be completed/i);
  const done = await S.ops.logEngagement(lead, { initiativeId: ini.id, engagementId: e.id, version: e.version, data: { actualDate: '2026-11-20', engagementType: 'oneToOne', stakeholderIds: [profile.stakeholderId], summary: '<p>Discussed the timeline.</p>', outcome: 'met' } });
  assert.equal(done.engagement.status, 'completed');
  const m = await S.model(ini.id);
  assert.ok(m.profiles.find((p) => p.id === profile.id).history.some((h) => h.id === e.id), 'in the participant history');
});

test('AC-06 / STK-046: an imported row with an existing email is flagged and is not created without a decision', async () => {
  const lead = who('Priya Raman');
  const existing = (await S.driver.list('stakeholder')).find((s) => s.email && !s.mergedInto);
  const before = (await S.driver.list('stakeholder')).length;
  const row = { givenName: 'Jane', familyName: 'Citizen', positionTitle: 'Analyst', organisation: existing.organisation, employmentType: 'employee', status: 'active', email: existing.email };
  const v = await S.ops.importRecords(lead, { type: 'stakeholder', rows: [row], mode: 'validate' });
  assert.equal(v.report[0].status, 'duplicate');
  assert.equal(v.report[0].duplicateOf.id, existing.id);
  const skipped = await S.ops.importRecords(lead, { type: 'stakeholder', rows: [row], mode: 'commit' });
  assert.equal(skipped.result.skipped, 1);
  assert.equal((await S.driver.list('stakeholder')).length, before, 'nothing created without a decision');
  const merged = await S.ops.importRecords(lead, { type: 'stakeholder', rows: [row], mode: 'commit', decisions: { 1: 'merge' } });
  assert.equal(merged.result.merged, 1);
  assert.equal((await S.driver.get('stakeholder', existing.id)).positionTitle, 'Analyst');
});

test('AC-07 / ART-010: without a primary sponsor the completeness check asks, and proceeding shows a placeholder', async () => {
  const lead = who('Priya Raman');
  const cur = await S.driver.get('initiative', ini.id);
  await S.update(lead, 'initiative', ini.id, { primarySponsorId: null }, { version: cur.version });
  const c = await S.ops.checkCompleteness(lead, { initiativeId: ini.id, artefactType: 'strategy', params: {} });
  assert.ok(c.gaps.some((g) => /primary sponsor/i.test(g.message)));
  const asked = await S.ops.generateArtefact(lead, { initiativeId: ini.id, artefactType: 'strategy', params: { formats: ['html'] } });
  assert.equal(asked.needsDecision, true);
  const made = await S.ops.generateArtefact(lead, { initiativeId: ini.id, artefactType: 'strategy', params: { formats: ['html'] }, proceed: true });
  assert.match(await blobText(made.artefact.files[0].blobId), /<mark class="ph">/);
  const after = await S.driver.get('initiative', ini.id);
  await S.update(lead, 'initiative', ini.id, { primarySponsorId: cur.primarySponsorId }, { version: after.version });
});

test('AC-08 / RUL-17: without permission to include sensitive fields only group-level ADKAR results appear', async () => {
  const lead = who('Priya Raman');
  const sponsorUser = byRole('sponsor');
  await assert.rejects(S.ops.generateArtefact(sponsorUser, { initiativeId: ini.id, artefactType: 'masterPlan', params: { includeSensitive: true, formats: ['html'] }, proceed: true }), (e) => e.status === 403);
  const plain = await S.ops.generateArtefact(lead, { initiativeId: ini.id, artefactType: 'adkarReport', params: { formats: ['html'] }, proceed: true });
  const snapshot = JSON.parse(await blobText(plain.artefact.snapshotId));
  assert.ok(!(await blobText(plain.artefact.files[0].blobId)).includes('Individual assessments'));
  assert.ok(!JSON.stringify(snapshot).includes('"currentEngagement"'), 'sensitive analysis is not in the snapshot');
});

test('AC-09 / ART-004 / ART-005: the Word plan has real headings and a contents field; the PowerPoint pack has editable text, tables and charts', async () => {
  const lead = who('Priya Raman');
  const plan = await S.ops.generateArtefact(lead, { initiativeId: ini.id, artefactType: 'masterPlan', params: { formats: ['docx'] }, proceed: true });
  const docx = await JSZip.loadAsync((await S.driver.getBlob(plan.artefact.files[0].blobId)).bytes);
  const doc = await docx.file('word/document.xml').async('string');
  assert.match(doc, /w:pStyle w:val="Heading1"/);
  assert.match(doc, /<w:instrText[^>]*>TOC [^<]*\\o/);
  const pack = await S.ops.generateArtefact(lead, { initiativeId: ini.id, artefactType: 'steeringPack', params: { formats: ['pptx'] }, proceed: true });
  const pptx = await JSZip.loadAsync((await S.driver.getBlob(pack.artefact.files[0].blobId)).bytes);
  const names = Object.keys(pptx.files);
  assert.ok(names.some((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n)), 'native charts');
  const slides = await Promise.all(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map((n) => pptx.file(n).async('string')));
  assert.ok(slides.some((x) => x.includes('<a:tbl>')), 'native tables');
  assert.ok(slides.every((x) => x.includes('<a:t>')), 'every slide has editable text');
});

test('AC-10 / ART-012: an approved artefact regenerated from its snapshot matches', async () => {
  const lead = who('Priya Raman');
  const approver = byRole('sponsor');
  const g = await S.ops.generateArtefact(lead, { initiativeId: ini.id, artefactType: 'changeOnAPage', params: { formats: ['pdf', 'pptx'] }, proceed: true });
  const req = await S.ops.requestApproval(lead, { subjectType: 'artefact', subjectId: g.artefact.id, approverIds: [approver.id] });
  await S.ops.decideApproval(approver, { id: req.id || req.approval?.id, decision: 'approve' });
  const a = await S.driver.get('artefact', g.artefact.id);
  assert.equal(a.status, 'approved');
  const r = await S.ops.reproduceArtefact(lead, { id: a.id });
  assert.equal(r.matches, true);
});

test('RPT-005: the reporting feed applies access rights', async () => {
  const lead = who('Priya Raman');
  const feed = await S.reportingFeed(lead, 'engagements', {});
  assert.ok(feed.rows.length > 0);
  const agent = byRole('changeAgent');
  await assert.rejects(S.reportingFeed(agent, 'risks', {}), (e) => e.status === 403);
  await assert.rejects(S.reportingFeed(lead, 'nonsense', {}), (e) => e.status === 404);
});

test('The record API cannot set read-only fields or write workflow-managed records', async () => {
  const lead = who('Priya Raman');
  const locked = (await S.driver.list('engagement', { initiativeId: ini.id })).find((e) => e.lockedAt);
  await S.update(lead, 'engagement', locked.id, { lockedAt: null }, { external: true, reason: 'Test' });
  assert.ok((await S.driver.get('engagement', locked.id)).lockedAt, 'lock time kept');
  await assert.rejects(S.create(lead, 'approval', { initiativeId: ini.id, subjectType: 'strategy', subjectId: 'x', status: 'approved' }, { external: true }), (e) => e.status === 403);
  const n = (await S.driver.list('notification'))[0];
  await assert.rejects(S.remove(lead, 'notification', n.id, { external: true }), (e) => e.status === 403);
  const t = await S.create(lead, 'task', { initiativeId: ini.id, title: 'Linked', assigneeId: lead.id, recordType: 'engagement', recordId: locked.id }, { external: true });
  assert.equal(t.recordType, 'engagement', 'provenance may be set when a record is created');
});

test('ART-015: schedules run at wall-clock times in the organisation time zone, across daylight saving', () => {
  const tz = 'Australia/Sydney';
  assert.equal(nextRun({ frequency: 'weekly', dayOfWeek: '5', time: '15:00' }, new Date('2026-10-23T03:00:00Z'), tz), '2026-10-23T04:00:00.000Z');
  assert.equal(nextRun({ frequency: 'daily', time: '09:00' }, new Date('2026-10-03T00:00:00Z'), tz), '2026-10-03T22:00:00.000Z');
  assert.equal(nextRun({ frequency: 'monthly', time: '08:00', dayOfMonth: 31 }, new Date('2026-11-05T00:00:00Z'), tz), '2026-11-29T21:00:00.000Z');
});

test('STK-047: possible duplicates are found across the master and can be dismissed', async () => {
  const lead = who('Priya Raman');
  const pairs = await S.ops.duplicateScan(lead, {});
  assert.ok(pairs.length >= 2);
  assert.ok(pairs.every((p) => p.keep.source === 'hr'), 'the HR record is suggested to keep');
  await S.ops.dismissDuplicate(lead, { aId: pairs[0].keep.id, bId: pairs[0].merge.id });
  assert.equal((await S.ops.duplicateScan(lead, {})).length, pairs.length - 1);
});

test('RPT-004: the report builder filters, groups and summarises a dataset', async () => {
  const lead = who('Priya Raman');
  const { rows } = await S.reportingFeed(lead, 'engagements', { initiativeId: ini.id });
  assert.ok(datasetFields(rows).some((f) => f.key === 'durationMinutes' && f.type === 'number'));
  const g = runReport(rows, { groupBy: 'status', measure: { fn: 'count' } });
  assert.equal(g.groups.reduce((a, x) => a + x.value, 0), rows.length);
  const f = runReport(rows, { filters: [{ field: 'planned', op: 'eq', value: 'true' }] });
  assert.ok(f.rows.every((r) => r.planned === true));
});

test('WFL-001 / WFL-002: my work shows approvals awaiting the approver and their tasks', async () => {
  const sponsorUser = byRole('sponsor');
  const w = await S.ops.myWork(sponsorUser, {});
  assert.ok(Array.isArray(w.awaiting) && Array.isArray(w.tasks) && w.initiatives.length > 0);
  for (const a of w.awaiting) assert.ok(a.approvers.some((x) => x.userId === sponsorUser.id && !x.decision));
});

test('RUL-03: individual survey responses stay on the server; the client gets response counts', async () => {
  const lead = who('Priya Raman');
  const d = await S.loadInitiative(lead, ini.id);
  assert.equal(d.records.surveyResponse, undefined, 'no raw responses in the working set');
  const all = await S.driver.list('surveyResponse', { initiativeId: ini.id });
  const open = d.records.survey.find((s) => s.status === 'open' && s.token);
  assert.equal(open.responseCount, all.filter((r) => r.surveyId === open.id).length);
  const q = open.questions.find((x) => x.type !== 'text');
  await S.submitSurveyResponse(open.token, { groupId: open.groupIds?.[0] || null, answers: { [q.id]: 4 } });
  const ch = await S.changes(lead, ini.id, d.seq);
  assert.ok(!ch.records.some((r) => r.type === 'surveyResponse'), 'no raw responses in the change feed');
  assert.equal(ch.records.find((r) => r.id === open.id)?.responseCount, open.responseCount + 1);
});

test('ADK-007: a scheduled campaign opens with its link emailed to its groups, and reminders are emailed', async () => {
  const sent = [];
  const M = createService({ driver: createMemoryDriver(), env: { mode: 'standalone', publicUrl: 'https://cmw.example.gov.au', sendMail: async (to, subject, text) => { sent.push({ to, subject, text }); } } });
  await seedDemo(M, {});
  const lead = (await M.driver.list('user')).find((u) => u.name === 'Priya Raman');
  const target = (await M.driver.list('initiative')).find((i) => i.shortName === 'Case Management');
  const m = await M.model(target.id);
  const groups = m.groups.filter((g) => g.memberIds.size > 0).slice(0, 2);
  const today = await M.today();
  const created = await M.ops.createAdkarCampaign(lead, { initiativeId: target.id, title: 'Pulse check', round: 'adHoc', groupIds: groups.map((g) => g.id), opensAt: addDays(today, 3), closesAt: addDays(today, 17), anonymous: true });
  const id = created.id || created.survey?.id;
  assert.equal((await M.ops.scheduleSurvey(lead, { id })).status, 'scheduled');
  assert.equal(sent.length, 0, 'nothing is sent until it opens');
  const opened = await M.ops.openSurvey(lead, { id });
  const withEmail = new Set(groups.flatMap((g) => [...g.memberIds]).filter((sid) => m.byId.stakeholder[sid]?.email && m.byId.stakeholder[sid].status !== 'left'));
  assert.equal(opened.emailed, withEmail.size);
  assert.ok(sent.every((x) => x.text.includes(`https://cmw.example.gov.au/#/survey/${opened.token}`)), 'everyone gets the same link');
  const reminded = await M.ops.sendSurveyReminder(lead, { id });
  assert.equal(reminded.emailed, withEmail.size);
  assert.ok(sent.slice(-reminded.emailed).every((x) => x.subject.startsWith('Reminder: ')));
});
