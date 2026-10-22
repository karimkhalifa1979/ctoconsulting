// In-memory storage driver. Used by tests and, with a persistence adapter, by the browser-only
// demo mode (IndexedDB). The server uses the SQLite driver in server/db.mjs with the same interface.
import { canonicalJson, sha256Hex, clone } from './util.js';

export class ConflictError extends Error {
  constructor(current) {
    super('The record was changed by someone else');
    this.status = 409;
    this.current = current;
  }
}

export function createMemoryDriver({ persist = null, initial = null } = {}) {
  const records = new Map(); // id -> record
  const config = new Map();
  const counters = new Map();
  const blobs = new Map();
  const audit = [];
  let seq = 0;
  let lastHash = 'genesis';

  if (initial) {
    for (const r of initial.records || []) { records.set(r.id, r); seq = Math.max(seq, r.seq || 0); }
    for (const [k, v] of Object.entries(initial.config || {})) config.set(k, v);
    for (const [k, v] of Object.entries(initial.counters || {})) counters.set(k, v);
    for (const a of initial.audit || []) audit.push(a);
    for (const [k, v] of Object.entries(initial.blobs || {})) blobs.set(k, v);
    if (audit.length) lastHash = audit[audit.length - 1].hash;
    seq = Math.max(seq, initial.seq || 0);
  }

  const save = (kind, key, value) => persist?.(kind, key, value);

  return {
    kind: 'memory',
    async get(type, id) {
      const r = records.get(id);
      return r && r.type === type ? clone(r) : null;
    },
    async getAny(id) {
      const r = records.get(id);
      return r ? clone(r) : null;
    },
    async list(type, { initiativeId, includeDeleted = false } = {}) {
      const out = [];
      for (const r of records.values()) {
        if (r.type !== type) continue;
        if (!includeDeleted && r.deleted) continue;
        if (initiativeId !== undefined && r.initiativeId !== initiativeId) continue;
        out.push(clone(r));
      }
      return out;
    },
    async listInitiative(initiativeId, { includeDeleted = false } = {}) {
      const out = [];
      for (const r of records.values()) if (r.initiativeId === initiativeId && (includeDeleted || !r.deleted)) out.push(clone(r));
      return out;
    },
    async put(rec, { expectedVersion = null } = {}) {
      const cur = records.get(rec.id);
      if (expectedVersion != null && (!cur || cur.version !== expectedVersion)) throw new ConflictError(cur ? clone(cur) : null);
      const stored = { ...clone(rec), seq: ++seq };
      records.set(rec.id, stored);
      await save('record', rec.id, stored);
      return clone(stored);
    },
    async hardDelete(id) {
      records.delete(id);
      await save('record', id, undefined);
    },
    async nextCode(scope, prefix) {
      const key = `${scope}:${prefix}`;
      const n = (counters.get(key) || 0) + 1;
      counters.set(key, n);
      await save('counter', key, n);
      return n;
    },
    async getConfig(key) {
      return config.has(key) ? clone(config.get(key)) : null;
    },
    async setConfig(key, value) {
      config.set(key, clone(value));
      await save('config', key, value);
    },
    async appendAudit(evt) {
      const e = { ...evt, seq: audit.length + 1, prevHash: lastHash };
      e.hash = await sha256Hex(lastHash + canonicalJson({ ...e, hash: undefined }));
      lastHash = e.hash;
      audit.push(e);
      await save('audit', e.seq, e);
      return e;
    },
    async queryAudit({ initiativeId, recordId, userId, action, type, from, to, q, limit = 200, offset = 0 } = {}) {
      let rows = audit.filter((e) => (!initiativeId || e.initiativeId === initiativeId) && (!recordId || e.recordId === recordId) && (!userId || e.userId === userId)
        && (!action || e.action === action) && (!type || e.type === type) && (!from || e.ts >= from) && (!to || e.ts <= `${to}~`)
        && (!q || JSON.stringify(e).toLowerCase().includes(String(q).toLowerCase())));
      const total = rows.length;
      rows = rows.slice().reverse().slice(offset, offset + limit);
      return { rows: clone(rows), total };
    },
    async allAudit() {
      return clone(audit);
    },
    async putBlob(id, bytes, meta = {}) {
      const value = { bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), meta: { ...meta, size: bytes.byteLength ?? bytes.length } };
      blobs.set(id, value);
      await save('blob', id, value);
    },
    async getBlob(id) {
      return blobs.get(id) || null;
    },
    async deleteBlob(id) {
      blobs.delete(id);
      await save('blob', id, undefined);
    },
    async changesSince(since, initiativeId) {
      const out = [];
      for (const r of records.values()) if (r.seq > since && (r.initiativeId === initiativeId || !r.initiativeId)) out.push(clone(r));
      return { seq, records: out };
    },
    async currentSeq() {
      return seq;
    },
    async transaction(fn) {
      return fn();
    },
    async stats() {
      return { records: records.size, audit: audit.length, blobs: blobs.size };
    },
    // Full export of the store (used by the demo mode's backup and by tests).
    async dump() {
      return { records: [...records.values()].map(clone), config: Object.fromEntries([...config.entries()].map(([k, v]) => [k, clone(v)])), counters: Object.fromEntries(counters), audit: clone(audit), seq };
    },
  };
}
