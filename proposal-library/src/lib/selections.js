// The saved selections document and the pure logic around it (no I/O, so it is unit-tested in scripts/check.mjs).
//
// Shape (stored as JSON in the document library):
// {
//   schema: 'cto-proposal-library/v1',
//   updatedAt: ISO string, updatedBy: string,
//   proposalFiles: { [driveItemId]: Entry },
//   activeResumes: { [driveItemId]: Entry },
//   proposals: { [proposalId]: Proposal }      (see proposal.js)
// }
// Entry = { name, path, webUrl, selectedAt, selectedBy }
// Entries are keyed by the SharePoint item id, which survives renames and moves within the library.

export const SCHEMA = 'cto-proposal-library/v1';

export function emptyDoc() {
  return { schema: SCHEMA, updatedAt: null, updatedBy: null, proposalFiles: {}, activeResumes: {}, proposals: {} };
}

export function normaliseDoc(raw) {
  const doc = emptyDoc();
  if (!raw || typeof raw !== 'object') return doc;
  for (const key of ['proposalFiles', 'activeResumes', 'proposals']) {
    if (raw[key] && typeof raw[key] === 'object' && !Array.isArray(raw[key])) doc[key] = { ...raw[key] };
  }
  doc.updatedAt = raw.updatedAt || null;
  doc.updatedBy = raw.updatedBy || null;
  return doc;
}

// changes: { [listKey]: Map<id, file | null> } where a file means "select" and null means "deselect".
// For `proposals` the value is the whole proposal record (or null to delete it).
// Applied on top of the latest saved document so concurrent edits by other people are kept.
export function applyChanges(doc, changes, user, now = new Date().toISOString()) {
  const next = normaliseDoc(doc);
  for (const [key, map] of Object.entries(changes)) {
    const list = { ...next[key] };
    for (const [id, file] of map) {
      if (key === 'proposals') {
        if (file) list[id] = { ...file, id, createdAt: list[id]?.createdAt || file.createdAt || now, createdBy: list[id]?.createdBy || file.createdBy || user, updatedAt: now, updatedBy: user };
        else delete list[id];
      } else if (file) {
        list[id] = list[id] || { name: file.name, path: file.path, webUrl: file.webUrl, selectedAt: now, selectedBy: user };
        // Keep the snapshot current if the file was renamed or moved since it was selected.
        list[id] = { ...list[id], name: file.name, path: file.path, webUrl: file.webUrl };
      } else {
        delete list[id];
      }
    }
    next[key] = list;
  }
  next.updatedAt = now;
  next.updatedBy = user;
  return next;
}

// Changes that actually differ from what is saved (toggling twice cancels out).
export function effectiveChanges(saved, pending) {
  const out = new Map();
  for (const [id, file] of pending) {
    if (Boolean(file) !== Boolean(saved[id])) out.set(id, file);
  }
  return out;
}

export function isSelected(saved, pending, id) {
  return pending.has(id) ? Boolean(pending.get(id)) : Boolean(saved[id]);
}

// Saved selections whose file no longer appears in the latest scan (deleted, or moved out of the folder).
export function missingEntries(saved, files) {
  const present = new Set(files.map((f) => f.id));
  return Object.entries(saved)
    .filter(([id]) => !present.has(id))
    .map(([id, e]) => ({ id, name: e.name, path: e.path || '', webUrl: e.webUrl, ext: extOf(e.name), size: null, modified: null, modifiedBy: null, missing: true }));
}

export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}
