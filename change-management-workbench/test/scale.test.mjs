// Large stakeholder masters (PER-02, PER-04): above the threshold an initiative's working set holds only the
// stakeholders it uses, changes bring in stakeholders that records start to refer to, pickers find anyone
// in the master on the server, and the master's group counts and links are worked out on the server.
// The threshold is lowered so the demonstration data behaves as a large master would.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../shared/service/index.js';
import { createMemoryDriver } from '../shared/memoryDriver.js';
import { seedDemo } from '../shared/seed/demo.js';
import { groupMemberIds } from '../shared/rules/engagements.js';

let S;
let ini;
let lead;
let master;

before(async () => {
  S = createService({ driver: createMemoryDriver(), env: { mode: 'standalone', scopeThreshold: 50 } });
  await seedDemo(S, {});
  lead = (await S.driver.list('user')).find((u) => u.name === 'Priya Raman');
  ini = (await S.driver.list('initiative')).find((i) => i.shortName === 'Digital Workplace');
  master = (await S.driver.list('stakeholder')).filter((s) => !s.mergedInto);
});

test('an initiative holds the stakeholders it uses, the members of its groups and their managers', async () => {
  const d = await S.loadInitiative(lead, ini.id);
  assert.equal(d.scoped, true);
  const ids = new Set(d.records.stakeholder.map((s) => s.id));
  assert.ok(ids.size < master.length, `${ids.size} of ${master.length}`);
  for (const p of d.records.profile.filter((x) => x.stakeholderId)) assert.ok(ids.has(p.stakeholderId), 'every profiled stakeholder');
  const byId = Object.fromEntries(master.map((s) => [s.id, s]));
  for (const id of ids) { const mgr = byId[id]?.managerId; if (mgr && byId[mgr] && d.records.profile.some((p) => p.stakeholderId === id)) assert.ok(ids.has(mgr), 'managers of profiled people'); }
  const ctx = { groups: await S.driver.list('stakeholderGroup'), memberships: await S.driver.list('membership'), stakeholders: master, today: await S.today() };
  for (const g of d.records.impactedGroup.filter((x) => x.stakeholderGroupId)) for (const sid of groupMemberIds(g.stakeholderGroupId, ctx)) assert.ok(ids.has(sid), 'members of impacted groups');
  const m = await S.model(ini.id);
  assert.ok(m.groups.every((g) => g.memberIds.size === (g.stakeholderGroupId ? groupMemberIds(g.stakeholderGroupId, ctx).size : 0)), 'group sizes match the full master');
});

test('a stakeholder that a record starts to refer to arrives with the changes, and pickers find anyone', async () => {
  const d = await S.loadInitiative(lead, ini.id);
  const inSet = new Set(d.records.stakeholder.map((s) => s.id));
  const outsider = master.find((s) => !inSet.has(s.id) && s.status === 'active');
  assert.ok(outsider, 'someone outside the working set');
  const found = await S.ops.findStakeholders(lead, { q: `${outsider.givenName} ${outsider.familyName}` });
  assert.ok(found.some((s) => s.id === outsider.id), 'found by name');
  const other = master.find((s) => !inSet.has(s.id) && s.id !== outsider.id);
  await S.update(S.SYSTEM, 'stakeholder', other.id, { availability: 'Mornings only' }, {});
  await S.create(lead, 'profile', { initiativeId: ini.id, subjectType: 'person', stakeholderId: outsider.id, changeRoles: ['impacted'], relationshipOwnerId: lead.id, influence: 'medium', interest: 'medium' }, { skipValidation: true });
  const ch = await S.changes(lead, ini.id, d.seq);
  assert.ok(ch.records.some((r) => r.type === 'stakeholder' && r.id === outsider.id), 'the newly referenced stakeholder is sent');
  assert.ok(!ch.records.some((r) => r.type === 'stakeholder' && r.id === other.id), 'changes outside the scope are not');
});

test("group member counts include rule-based groups, and a stakeholder's links come from the server", async () => {
  const counts = await S.ops.groupMemberCounts(lead, {});
  const dynamic = (await S.driver.list('stakeholderGroup')).find((g) => g.membershipType === 'dynamic');
  assert.ok(counts[dynamic.id] > 0, 'rule-based members are counted');
  const rel = (await S.driver.list('relationship'))[0];
  const links = await S.ops.stakeholderLinks(lead, { stakeholderId: rel.fromId });
  assert.ok(links.relationships.some((r) => r.id === rel.id));
  assert.ok(links.names[rel.toId], 'names the other end');
});
