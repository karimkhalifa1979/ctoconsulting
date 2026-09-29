// Sanity checks for the regulatory knowledge base and the discovery engine.
// Run with: npm run check
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { LIBRARY_RULES, EXTRA_SOURCES } from '../src/lib/catalog.js';
import { inferProfile } from '../src/lib/profile.js';
import { discoverSources, generateRegister, orgPrefix, makeGeneraliser } from '../src/lib/discovery.js';
import { frequencyMonths, buildEvents } from '../src/lib/calendar.js';
import { policiesOf } from '../src/lib/discovery.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../public/data/ndia/${f}`, import.meta.url)));
const library = { requirements: read('requirements.json'), obligations: read('obligations.json'), exemptions: read('exemptions.json') };
const reqIds = new Set(library.requirements.map((r) => r.id));

// Every obligation source in the reference register has an applicability rule.
const names = new Set(library.obligations.map((o) => o.name));
assert.deepEqual([...names].filter((n) => !LIBRARY_RULES[n]), [], 'register sources without rules');
// Every catalogue obligation maps to an existing requirement template.
assert.deepEqual(EXTRA_SOURCES.flatMap((s) => s.obligations).filter((o) => !reqIds.has(o[3])).map((o) => o[0]), [], 'bad template references');
// Every register obligation maps to a requirement.
assert.equal(library.obligations.filter((o) => !o.requirementIds.some((id) => reqIds.has(id))).length, 0, 'unmapped obligations');

const cases = [
  ['National Insurance Disability Agency', 'cth-cce', ['Protective Security Policy Framework (PSPF) Release 2025', 'NDIS Act 2013', 'PGPA Act 2013']],
  ['Commonwealth Bank of Australia', 'listed', ['APRA CPS 234 Information Security', 'AML/CTF Act 2006 and Rules', 'Consumer Data Right information security and conformance']],
  ['Sydney Water', 'state-gov', ['Security of Critical Infrastructure Act 2018', 'NSW Cyber Security Policy']],
  ['Department of Health Victoria', 'state-gov', ['Victorian Privacy and Data Protection Act 2014 and VPDSS']],
];
for (const [name, sector, expected] of cases) {
  const { profile } = inferProfile(name);
  assert.equal(profile.sectorType, sector, `${name} sector`);
  const found = discoverSources(profile, library);
  for (const e of expected) assert.ok(found.some((s) => s.name === e), `${name} should include ${e}`);
  if (sector !== 'cth-cce') assert.ok(!found.some((s) => s.name === 'PGPA Act 2013'), `${name} should not include the PGPA Act`);
  const org = { name, shortName: profile.shortName, prefix: orgPrefix(profile.shortName), profile };
  const reg = generateRegister(org, found.filter((s) => s.selected), library);
  assert.ok(reg.requirements.length > 50 && reg.obligations.length > 200, `${name} register size`);
  const ids = new Set(reg.requirements.map((r) => r.id));
  assert.ok(reg.obligations.every((o) => o.requirementIds.every((id) => ids.has(id))), `${name} obligation mapping`);
  console.log(`✓ ${name}: ${found.length} sources, ${reg.obligations.length} obligations, ${reg.requirements.length} requirements`);
}

const g = makeGeneraliser({ name: 'Commonwealth Bank of Australia', shortName: 'CBA', profile: inferProfile('Commonwealth Bank of Australia').profile });
assert.equal(g('An NDIA system must'), 'A CBA system must');
assert.equal(frequencyMonths('Annual; test quarterly'), 12);
assert.equal(frequencyMonths('Quarterly'), 3);
assert.equal(frequencyMonths('Continuous'), null);

const { profile } = inferProfile('National Insurance Disability Agency');
const events = buildEvents({ org: { sources: discoverSources(profile, library) }, data: { ...library, policies: policiesOf(library.requirements) }, assessments: {}, docs: {}, today: new Date('2026-09-29') });
assert.ok(events.some((e) => e.title.startsWith('Annual report to responsible Minister')), 'PGPA annual report event');
assert.ok(events.some((e) => e.kind === 'exemption'), 'exemption events');
console.log(`✓ calendar: ${events.length} events`);
console.log('All checks passed');
