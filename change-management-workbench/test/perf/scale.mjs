// Scale and performance checks (ART-018, PER-02 to PER-05), run on demand with `npm run test:perf`.
// Grows the demonstration initiative to 2,000 stakeholders and 1,000 plan activities and times the Master
// Change Management Plan and the steering committee presentation, times survey results for a campaign of
// 20,000 responses, then grows the stakeholder master to 100,000 records and times search, the master
// register and opening an initiative. Set CMW_PERF_DRIVER=sqlite to use the server's SQLite storage (in a
// temporary file) instead of memory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import JSZip from 'jszip';
import { createService } from '../../shared/service/index.js';
import { createMemoryDriver } from '../../shared/memoryDriver.js';
import { seedDemo } from '../../shared/seed/demo.js';
import { uid } from '../../shared/util.js';

const RUNS = Number(process.env.CMW_PERF_RUNS || 3);
const SQLITE = process.env.CMW_PERF_DRIVER === 'sqlite';
const MASTER = Number(process.env.CMW_PERF_MASTER || 100000);

let driver;
let tmp;
if (SQLITE) {
  const { openDatabase } = await import('../../server/db.mjs');
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cmw-perf-'));
  driver = openDatabase(path.join(tmp, 'perf.db'));
} else driver = createMemoryDriver();

const S = createService({ driver, env: { mode: 'standalone' } });
const results = [];
const check = (name, ms, limitMs, detail = '') => {
  const ok = ms <= limitMs;
  results.push({ name, ms, limitMs, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${(ms / 1000).toFixed(2)} s (limit ${(limitMs / 1000).toFixed(0)} s)${detail ? ` — ${detail}` : ''}`);
};
const time = async (fn) => { const t = performance.now(); const r = await fn(); return [performance.now() - t, r]; };
const worst = (list) => Math.max(...list);
// Direct writes in one transaction when the driver is SQLite.
const bulk = async (recs) => {
  driver.db?.exec('BEGIN');
  try { for (const r of recs) await driver.put(r); } finally { driver.db?.exec('COMMIT'); }
};
const GIVEN = ['Alex', 'Bree', 'Chen', 'Dana', 'Eli', 'Farah', 'Gus', 'Hana', 'Ivan', 'Jade', 'Kai', 'Lena', 'Milo', 'Nina', 'Omar', 'Pia', 'Quinn', 'Rosa', 'Sami', 'Tara'];
const FAMILY = ['Abbott', 'Baker', 'Cole', 'Duong', 'Evans', 'Fraser', 'Gill', 'Huang', 'Ito', 'Jones', 'Kaur', 'Lam', 'Moore', 'Nguyen', 'Owens', 'Patel', 'Quach', 'Reid', 'Singh', 'Tran'];
const person = (n) => ({ givenName: GIVEN[n % GIVEN.length], familyName: `${FAMILY[Math.floor(n / GIVEN.length) % FAMILY.length]}-${n}`, email: `person.${n}@example.gov.au` });
// The rest of the organisation: people in other places and roles, outside these initiatives' groups.
const CITIES = ['Adelaide', 'Brisbane', 'Darwin', 'Hobart', 'Melbourne', 'Perth', 'Sydney'];
const ROLES = ['Service Officer', 'Policy Officer', 'Analyst', 'Case Officer', 'Project Officer'];
const elsewhere = (n) => ({ location: CITIES[n % CITIES.length], positionTitle: ROLES[n % ROLES.length], businessUnit: `Branch ${n % 40}` });
const clone = (r, extra) => ({ ...r, id: uid(), seq: undefined, version: 1, createdAt: S.nowIso(), updatedAt: S.nowIso(), ...extra });

console.log(`Storage: ${SQLITE ? 'SQLite' : 'memory'}; ${RUNS} runs each; master of ${MASTER.toLocaleString('en-AU')} stakeholders.`);
await seedDemo(S, {});
const users = await driver.list('user');
const lead = users.find((u) => u.name === 'Priya Raman');
const initiatives = await driver.list('initiative');
const ini = initiatives.find((i) => i.shortName === 'Case Management');
const small = initiatives.find((i) => i.id !== ini.id && lead.initiativeIds?.includes(i.id)) || initiatives.find((i) => i.id !== ini.id);
const own = await driver.listInitiative(ini.id);
const of = (t) => own.filter((r) => r.type === t);

// --- ART-018: up to 2,000 stakeholders and 1,000 activities in one initiative --------------------------------
const people = (await driver.list('stakeholder')).filter((s) => !s.mergedInto);
const profiles = of('profile').filter((p) => people.some((s) => s.id === p.stakeholderId));
const memberships = await driver.list('membership');
const acts = of('activity');
const engs = of('engagement');
const newPeople = [];
let grown = { people: profiles.length, activities: acts.length, engagements: engs.length };
// Adds stakeholders (with their initiative profiles and group memberships), activities and engagements.
async function grow(target) {
  const add = [];
  for (let n = grown.people; n < target.people; n++) {
    const base = people[n % people.length];
    const st = clone(base, { ...person(n), code: `SH-P${n}`, sourceId: null });
    newPeople.push(st);
    add.push(st, clone(profiles[n % profiles.length], { stakeholderId: st.id, code: `SP-P${n}` }));
    const m = memberships.find((x) => x.stakeholderId === base.id);
    if (m) add.push(clone(m, { stakeholderId: st.id, code: `MEM-P${n}` }));
  }
  for (let n = grown.activities; n < target.activities; n++) add.push(clone(acts[n % acts.length], { code: `ACT-P${n}`, title: `${acts[n % acts.length].title} (${n})` }));
  for (let n = grown.engagements; n < target.engagements; n++) add.push(clone(engs[n % engs.length], { code: `ENG-P${n}`, stakeholderIds: [newPeople[n % newPeople.length].id], lockedAt: null }));
  await bulk(add);
  grown = { ...target };
  S.touch(ini.id);
  S.touch();
}
const pdfPages = async (file) => (Buffer.from((await driver.getBlob(file.blobId)).bytes).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
// Whether Word's contents came with page numbers worked out, or are left for Word to fill in.
const contentsNumbered = async (file) => !/<w:updateFields\s*\/>/.test(await (await JSZip.loadAsync((await driver.getBlob(file.blobId)).bytes)).file('word/settings.xml').async('string'));

for (const target of [{ people: 1250, activities: 600, engagements: 2500 }, { people: 2000, activities: 1000, engagements: 4000 }]) {
  await grow(target);
  console.log(`Initiative grown to ${target.people.toLocaleString('en-AU')} stakeholders, ${target.activities.toLocaleString('en-AU')} activities and ${target.engagements.toLocaleString('en-AU')} engagements.`);
  const plan = [];
  let pages = 0;
  let numbered = false;
  for (let i = 0; i < RUNS; i++) {
    S.touch(ini.id);
    const [ms, r] = await time(() => S.ops.generateArtefact(lead, { initiativeId: ini.id, artefactType: 'masterPlan', params: { formats: ['docx', 'pdf'] }, proceed: true }));
    plan.push(ms);
    pages = await pdfPages(r.artefact.files.find((f) => f.format === 'pdf'));
    numbered = await contentsNumbered(r.artefact.files.find((f) => f.format === 'docx'));
  }
  check(`ART-018 Master Change Management Plan, ${target.people.toLocaleString('en-AU')} stakeholders (Word and PDF)`, worst(plan), 60000, `${pages} pages, contents page numbers ${numbered ? 'worked out' : 'left for Word'}; runs ${plan.map((x) => (x / 1000).toFixed(1)).join(', ')} s`);
}
const deck = [];
let slides = 0;
for (let i = 0; i < RUNS; i++) {
  S.touch(ini.id);
  const [ms, r] = await time(() => S.ops.generateArtefact(lead, { initiativeId: ini.id, artefactType: 'steeringPack', params: { formats: ['pptx'] }, proceed: true }));
  deck.push(ms);
  const zip = await JSZip.loadAsync((await driver.getBlob(r.artefact.files[0].blobId)).bytes);
  slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length;
}
check('ART-018 Steering committee presentation (PowerPoint)', worst(deck), 30000, `${slides} slides; runs ${deck.map((x) => (x / 1000).toFixed(1)).join(', ')} s`);
// --- PER-05: 20,000 responses to one survey campaign ----------------------------------------------------------
const survey = (await driver.list('survey', { initiativeId: ini.id })).find((x) => x.status === 'open') || (await driver.list('survey', { initiativeId: ini.id }))[0];
const scored = (survey.questions || []).filter((q) => q.type !== 'text');
const surveyGroups = survey.groupIds?.length ? survey.groupIds : [null];
const answersFor = (n) => Object.fromEntries(scored.map((q, i) => [q.id, 1 + ((n * 7 + i * 3) % 5)]));
const responsesWanted = 20000;
const answered = (await driver.list('surveyResponse', { initiativeId: ini.id })).filter((r) => r.surveyId === survey.id).length;
const responses = [];
for (let n = answered; n < responsesWanted; n++) responses.push({ id: uid(), type: 'surveyResponse', initiativeId: ini.id, surveyId: survey.id, groupId: surveyGroups[n % surveyGroups.length], answers: answersFor(n), submittedAt: S.nowIso(), version: 1, code: `SR-P${n}` });
await bulk(responses);
S.touch(ini.id);
const [resultsMs, aggregate] = await time(() => S.ops.surveyResults(lead, { id: survey.id }));
check('PER-05 Survey results for 20,000 responses', resultsMs, 2000, `${aggregate.overall?.n?.toLocaleString('en-AU')} responses, ${Object.keys(aggregate.segments || {}).length} group segment(s)`);
const [submitMs] = await time(() => S.submitSurveyResponse(survey.token, { groupId: surveyGroups[0], answers: answersFor(1) }));
check('PER-05 Submit a response to a campaign of 20,000', submitMs, 2000);

const [openMs, data] = await time(() => S.loadInitiative(lead, ini.id));
check('PER-01 Open the large initiative (working set)', openMs, 2000, `${(JSON.stringify(data).length / 1e6).toFixed(1)} MB`);

// --- PER-02 / PER-04: a stakeholder master of 100,000 people -----------------------------------------------
const have = (await driver.list('stakeholder')).length;
const extra = [];
for (let n = have; n < MASTER; n++) extra.push(clone(people[n % people.length], { ...person(n + 10000), ...elsewhere(n), code: `SH-M${n}`, sourceId: null }));
await bulk(extra);
S.touch();
const total = (await driver.list('stakeholder')).length;
console.log(`Stakeholder master grown to ${total.toLocaleString('en-AU')} records.`);
const last = person(MASTER + 10000 - 1);
for (const [label, q] of [['one person by name', `${last.givenName} ${last.familyName}`], ['by email', last.email], ['a common word', GIVEN[3]], ['no match', 'zzqx']]) {
  const runs = [];
  let hits = 0;
  for (let i = 0; i < RUNS; i++) { const [ms, r] = await time(() => S.search(lead, q)); runs.push(ms); hits = r.length; }
  check(`PER-02 Search ${label}`, worst(runs), 2000, `${hits} results`);
}
const [listMs, list] = await time(() => S.list(lead, 'stakeholder', { limit: 5000, sort: 'familyName' }));
check('PER-04 Stakeholder master register (first 5,000)', listMs, 2000, `${list.rows.length.toLocaleString('en-AU')} of ${list.total.toLocaleString('en-AU')} rows, ${(JSON.stringify(list).length / 1e6).toFixed(1)} MB`);
const [findMs, found] = await time(() => S.list(lead, 'stakeholder', { q: last.familyName, limit: 500 }));
check('PER-02 Search the master register', findMs, 2000, `${found.total} found`);
const [pickMs, picked] = await time(() => S.ops.findStakeholders(lead, { q: `${GIVEN[5]} ${FAMILY[2]}` }));
check('PER-02 Stakeholder picker search', pickMs, 2000, `${picked.length} results`);
const [smallMs, smallData] = await time(() => S.loadInitiative(lead, small.id));
check(`PER-04 Open another initiative (${small.shortName || small.name})`, smallMs, 2000, `${(JSON.stringify(smallData).length / 1e6).toFixed(1)} MB`);
S.touch();
const [smallModelMs] = await time(() => S.model(small.id));
check('PER-04 Build that initiative\'s model', smallModelMs, 2000);

if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} of ${results.length} checks over their limit.` : `\nAll ${results.length} checks within their limits.`);
process.exit(failed.length ? 1 : 0);
