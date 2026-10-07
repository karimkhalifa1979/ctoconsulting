// Sanity checks for the selection and folder-tree logic: node scripts/check.mjs
import assert from 'node:assert/strict';
import { applyChanges, effectiveChanges, emptyDoc, isSelected, missingEntries, normaliseDoc } from '../src/lib/selections.js';
import { buildTree, inFolder } from '../src/lib/tree.js';

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

console.log('All checks passed.');
