// Sanity checks for the selection and folder-tree logic: node scripts/check.mjs
import assert from 'node:assert/strict';
import { applyChanges, effectiveChanges, emptyDoc, isSelected, missingEntries, normaliseDoc } from '../src/lib/selections.js';
import { buildTree, inFolder } from '../src/lib/tree.js';
import { SECTIONS, clientOf, SUGGEST_AT, relevance, relevanceTerms, daysUntil, duplicateProposal, missingRequired, newProposal, normaliseProposal, personName, readiness, sectionStatus } from '../src/lib/proposal.js';

const f = (id, name, path) => ({ id, name, path, webUrl: `https://x/${id}` });
const a = f('A', 'Proposal.docx', 'Client 1/Final');
const b = f('B', 'Pricing.xlsx', 'Client 1/Pricing');
const c = f('C', 'Case study.pdf', 'Client 2');

// Selecting and deselecting.
let doc = applyChanges(emptyDoc(), { proposalFiles: new Map([['A', a], ['B', b]]) }, 'Karim', 't1');
assert.deepEqual(Object.keys(doc.proposalFiles).sort(), ['A', 'B']);
assert.equal(doc.proposalFiles.A.selectedBy, 'Karim');
assert.equal(doc.updatedAt, 't1');
doc = applyChanges(doc, { proposalFiles: new Map([['B', null]]), activeResumes: new Map([['R1', f('R1', 'CV.docx', '')]]) }, 'Karim', 't2');
assert.deepEqual(Object.keys(doc.proposalFiles), ['A']);
assert.deepEqual(Object.keys(doc.activeResumes), ['R1']);

// Re-selecting keeps the original selection date but refreshes a renamed file's name and path.
doc = applyChanges(doc, { proposalFiles: new Map([['A', { ...a, name: 'Proposal v2.docx' }]]) }, 'Someone else', 't3');
assert.equal(doc.proposalFiles.A.selectedAt, 't1');
assert.equal(doc.proposalFiles.A.selectedBy, 'Karim');
assert.equal(doc.proposalFiles.A.name, 'Proposal v2.docx');

// Changes merge onto another person's newer save rather than overwriting it.
const theirs = applyChanges(doc, { proposalFiles: new Map([['C', c]]) }, 'Colleague', 't4');
const merged = applyChanges(theirs, { proposalFiles: new Map([['A', null]]) }, 'Karim', 't5');
assert.deepEqual(Object.keys(merged.proposalFiles), ['C']);
assert.deepEqual(Object.keys(merged.activeResumes), ['R1']);

// Pending toggles that return to the saved state are not changes.
const saved = { A: {} };
const pending = new Map([['A', a], ['B', null], ['C', c]]);
assert.deepEqual([...effectiveChanges(saved, pending).keys()], ['C']);
assert.equal(isSelected(saved, new Map(), 'A'), true);
assert.equal(isSelected(saved, new Map([['A', null]]), 'A'), false);

// Saved files that disappeared from the folder are reported.
assert.deepEqual(missingEntries({ A: { name: 'x.pdf', path: 'p' }, Z: { name: 'gone.docx', path: 'old' } }, [a]).map((m) => [m.id, m.ext, m.missing]), [['Z', 'docx', true]]);

// Malformed saved files load as empty.
assert.deepEqual(normaliseDoc(null).proposalFiles, {});
assert.deepEqual(normaliseDoc({ proposalFiles: [] }).proposalFiles, {});

// Folder tree counts and folder filtering.
const tree = buildTree([a, b, c, f('D', 'Top.docx', '')], (id) => id === 'A' || id === 'C');
assert.equal(tree.files, 4);
assert.equal(tree.selected, 2);
assert.equal(tree.children.get('Client 1').files, 2);
assert.equal(tree.children.get('Client 1').selected, 1);
assert.equal(tree.children.get('Client 1').children.get('Final').path, 'Client 1/Final');
assert.ok(inFolder(a, 'Client 1'));
assert.ok(!inFolder(a, 'Client'));
assert.ok(inFolder(a, ''));

// Proposals: saved as whole records, creation stamp kept, deletion, and other lists untouched.
const p1 = newProposal('Karim');
p1.details.title = 'Capability Review';
let pdoc = applyChanges(merged, { proposals: new Map([[p1.id, p1]]) }, 'Karim', 't6');
assert.equal(pdoc.proposals[p1.id].createdAt, 't6');
assert.equal(pdoc.proposals[p1.id].details.title, 'Capability Review');
pdoc = applyChanges(pdoc, { proposals: new Map([[p1.id, { ...pdoc.proposals[p1.id], details: { title: 'Renamed' } }]]) }, 'Colleague', 't7');
assert.equal(pdoc.proposals[p1.id].createdAt, 't6');
assert.equal(pdoc.proposals[p1.id].createdBy, 'Karim');
assert.equal(pdoc.proposals[p1.id].updatedBy, 'Colleague');
assert.deepEqual(Object.keys(pdoc.proposalFiles), ['C']);
pdoc = applyChanges(pdoc, { proposals: new Map([[p1.id, null]]) }, 'Karim', 't8');
assert.deepEqual(pdoc.proposals, {});
assert.deepEqual(normaliseDoc({}).proposals, {});

// Section progress and readiness.
const p2 = newProposal('Karim');
const overview = SECTIONS.find((s) => s.id === 'overview');
assert.equal(sectionStatus(p2, overview).state, 'missing');
assert.deepEqual(missingRequired(p2).map((f) => f.id), ['title', 'client', 'dueDate']);
Object.assign(p2.details, { title: 'T', client: 'Client 1', dueDate: '2026-10-20' });
assert.equal(sectionStatus(p2, overview).state, 'partial');
assert.equal(sectionStatus(p2, SECTIONS.find((s) => s.id === 'team')).state, 'empty');
p2.team.push({ id: 'R1', name: 'Resume - Jane Citizen.docx', path: '', role: '' });
assert.equal(readiness(p2).find((c) => c.label === 'A role for every team member').ok, false);
assert.equal(readiness(p2).find((c) => c.label === 'At least one team member').ok, true);
const copy = duplicateProposal({ ...p2, createdAt: 'x', updatedAt: 'y' }, 'Colleague');
assert.notEqual(copy.id, p2.id);
assert.equal(copy.details.title, 'Copy of T');
assert.equal(copy.details.status, 'Draft');
assert.equal(copy.createdAt, null);
copy.team[0].role = 'Changed';
assert.equal(p2.team[0].role, '');

// Case studies: progress, readiness and suggestions.
const p3 = newProposal('Karim');
assert.deepEqual(p3.caseStudies, []);
assert.equal(sectionStatus(p3, SECTIONS.find((s) => s.id === 'caseStudies')).state, 'empty');
assert.equal(readiness(p3).find((c) => c.label === 'At least one case study').ok, false);
p3.caseStudies.push({ id: 'CS1', name: 'x.docx', path: 'Word Case Studies' });
assert.equal(sectionStatus(p3, SECTIONS.find((s) => s.id === 'caseStudies')).count, 1);
Object.assign(p3.details, { title: 'Service Management Uplift', client: 'Example University', services: ['IT service management', 'Cyber security'] });
Object.assign(p3.details, { summary: 'Deliver a roadmap' });
const terms = relevanceTerms(p3);
assert.equal(terms.get('university'), 3);
assert.equal(terms.get('cyber'), 2);
assert.equal(terms.get('roadmap'), 1);
assert.ok(!terms.has('management') && !terms.has('service'));
const r1 = relevance({ name: 'IT service management uplift - university.docx', path: 'Word Case Studies' }, terms);
assert.deepEqual(r1.matches.sort(), ['university', 'uplift']);
assert.equal(r1.score, 6);
assert.ok(relevance({ name: 'Cyber security maturity assessment - health.pptx', path: 'Powerpoint Case Studies' }, terms).score >= SUGGEST_AT);
assert.ok(relevance({ name: 'Enterprise architecture roadmap - agency.pdf', path: 'Web Case Studies' }, terms).score < SUGGEST_AT);
assert.equal(relevance({ name: 'Case study template.docx', path: 'Supporting Information' }, terms).score, 0);
assert.deepEqual(normaliseProposal({ details: {} }).caseStudies, []);

// Helpers.
assert.equal(personName('Resume - Jane Citizen.docx'), 'Jane Citizen');
assert.equal(personName('John Smith CV.pdf'), 'John Smith');
assert.equal(personName('Jane Citizen - Resume.docx'), 'Jane Citizen');
assert.equal(clientOf('Austrade/Response/Final'), 'Austrade');
assert.equal(clientOf(''), '(top level)');
assert.equal(daysUntil('2026-10-10', new Date(2026, 9, 7, 23, 0)), 3);
assert.equal(daysUntil('2026-10-01', new Date(2026, 9, 7)), -6);
assert.equal(daysUntil('', new Date()), null);

console.log('All checks passed.');
