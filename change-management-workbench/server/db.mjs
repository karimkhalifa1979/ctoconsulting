// SQLite storage driver (node:sqlite, no native build step). Implements the same interface as the
// in-memory driver. Records are stored as JSON documents, optionally encrypted at rest with a
// customer-managed AES-256-GCM key (SEC-03, SEC-04).
import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson } from '../shared/util.js';
import { ConflictError } from '../shared/memoryDriver.js';

function makeCrypto(keyB64) {
  if (!keyB64) return { enc: (s) => s, dec: (s) => s, encBytes: (b) => b, decBytes: (b) => b, enabled: false };
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('CMW_DATA_KEY must be 32 bytes, base64-encoded (for example: openssl rand -base64 32)');
  const encBytes = (buf) => {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    const out = Buffer.concat([c.update(buf), c.final()]);
    return Buffer.concat([Buffer.from('CMW1'), iv, c.getAuthTag(), out]);
  };
  const decBytes = (buf) => {
    const b = Buffer.from(buf);
    if (b.subarray(0, 4).toString() !== 'CMW1') return b;
    const iv = b.subarray(4, 16), tag = b.subarray(16, 32), data = b.subarray(32);
    const d = createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]);
  };
  return {
    enabled: true,
    enc: (s) => `enc:${encBytes(Buffer.from(s, 'utf8')).toString('base64')}`,
    dec: (s) => (s.startsWith('enc:') ? decBytes(Buffer.from(s.slice(4), 'base64')).toString('utf8') : s),
    encBytes,
    decBytes,
  };
}

export function openDatabase(file, { key = process.env.CMW_DATA_KEY } = {}) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, type TEXT NOT NULL, initiative_id TEXT, version INTEGER NOT NULL, seq INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_records_type ON records(type, deleted);
    CREATE INDEX IF NOT EXISTS idx_records_init ON records(initiative_id, type);
    CREATE INDEX IF NOT EXISTS idx_records_seq ON records(seq);
    CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, n INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY, ts TEXT, user_id TEXT, action TEXT, type TEXT, record_id TEXT, initiative_id TEXT, data TEXT NOT NULL, prev_hash TEXT, hash TEXT);
    CREATE INDEX IF NOT EXISTS idx_audit_init ON audit(initiative_id);
    CREATE INDEX IF NOT EXISTS idx_audit_record ON audit(record_id);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit(action);
    CREATE TABLE IF NOT EXISTS blobs (id TEXT PRIMARY KEY, meta TEXT, bytes BLOB);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT, last_seen TEXT, expires_at TEXT, data TEXT);
    CREATE TABLE IF NOT EXISTS credentials (user_id TEXT PRIMARY KEY, password_hash TEXT NOT NULL, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS tokens (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, expires_at TEXT NOT NULL, scopes TEXT);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  const crypt = makeCrypto(key);
  const q = (sql) => db.prepare(sql);
  const st = {
    get: q('SELECT data FROM records WHERE id = ?'),
    listType: q('SELECT data FROM records WHERE type = ? AND deleted = 0'),
    listTypeAll: q('SELECT data FROM records WHERE type = ?'),
    listTypeInit: q('SELECT data FROM records WHERE type = ? AND initiative_id = ? AND deleted = 0'),
    listTypeNullInit: q('SELECT data FROM records WHERE type = ? AND initiative_id IS NULL AND deleted = 0'),
    listInit: q('SELECT data FROM records WHERE initiative_id = ? AND deleted = 0'),
    listInitAll: q('SELECT data FROM records WHERE initiative_id = ?'),
    insert: q('INSERT INTO records (id, type, initiative_id, version, seq, deleted, data) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    update: q('UPDATE records SET type = ?, initiative_id = ?, version = ?, seq = ?, deleted = ?, data = ? WHERE id = ? AND version = ?'),
    upsert: q('INSERT INTO records (id, type, initiative_id, version, seq, deleted, data) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET type = excluded.type, initiative_id = excluded.initiative_id, version = excluded.version, seq = excluded.seq, deleted = excluded.deleted, data = excluded.data'),
    del: q('DELETE FROM records WHERE id = ?'),
    changes: q('SELECT data FROM records WHERE seq > ? AND (initiative_id = ? OR initiative_id IS NULL)'),
    getMeta: q('SELECT value FROM meta WHERE key = ?'),
    setMeta: q('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    getConfig: q('SELECT value FROM config WHERE key = ?'),
    setConfig: q('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    counter: q('INSERT INTO counters (key, n) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1 RETURNING n'),
    lastAudit: q('SELECT seq, hash FROM audit ORDER BY seq DESC LIMIT 1'),
    insertAudit: q('INSERT INTO audit (seq, ts, user_id, action, type, record_id, initiative_id, data, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    allAudit: q('SELECT data FROM audit ORDER BY seq'),
    putBlob: q('INSERT INTO blobs (id, meta, bytes) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET meta = excluded.meta, bytes = excluded.bytes'),
    getBlob: q('SELECT meta, bytes FROM blobs WHERE id = ?'),
    delBlob: q('DELETE FROM blobs WHERE id = ?'),
    count: q('SELECT (SELECT COUNT(*) FROM records) AS records, (SELECT COUNT(*) FROM audit) AS audit, (SELECT COUNT(*) FROM blobs) AS blobs'),
  };
  const parse = (row) => (row ? JSON.parse(crypt.dec(row.data)) : null);
  let seq = Number(st.getMeta.get('seq')?.value || 0);
  const nextSeq = () => {
    seq += 1;
    st.setMeta.run('seq', String(seq));
    return seq;
  };
  const last = st.lastAudit.get();
  let lastHash = last?.hash || 'genesis';
  let auditSeq = last?.seq || 0;

  const driver = {
    kind: 'sqlite',
    db,
    encrypted: crypt.enabled,
    async get(type, id) {
      const r = parse(st.get.get(id));
      return r && r.type === type ? r : null;
    },
    async getAny(id) {
      return parse(st.get.get(id));
    },
    async list(type, { initiativeId, includeDeleted = false } = {}) {
      if (initiativeId === null) return st.listTypeNullInit.all(type).map(parse);
      if (initiativeId !== undefined) return st.listTypeInit.all(type, initiativeId).map(parse);
      return (includeDeleted ? st.listTypeAll : st.listType).all(type).map(parse);
    },
    async listInitiative(initiativeId, { includeDeleted = false } = {}) {
      return (includeDeleted ? st.listInitAll : st.listInit).all(initiativeId).map(parse);
    },
    async put(rec, { expectedVersion = null } = {}) {
      const s = nextSeq();
      const stored = { ...rec, seq: s };
      const data = crypt.enc(JSON.stringify(stored));
      if (expectedVersion != null) {
        const res = st.update.run(rec.type, rec.initiativeId ?? null, rec.version, s, rec.deleted ? 1 : 0, data, rec.id, expectedVersion);
        if (res.changes === 0) throw new ConflictError(parse(st.get.get(rec.id)));
      } else {
        st.upsert.run(rec.id, rec.type, rec.initiativeId ?? null, rec.version, s, rec.deleted ? 1 : 0, data);
      }
      return stored;
    },
    async hardDelete(id) {
      st.del.run(id);
    },
    async nextCode(scope, prefix) {
      return Number(st.counter.get(`${scope}:${prefix}`).n);
    },
    async getConfig(key) {
      const row = st.getConfig.get(key);
      return row ? JSON.parse(crypt.dec(row.value)) : null;
    },
    async setConfig(key, value) {
      st.setConfig.run(key, crypt.enc(JSON.stringify(value)));
    },
    async appendAudit(evt) {
      auditSeq += 1;
      const e = { ...evt, seq: auditSeq, prevHash: lastHash };
      e.hash = createHash('sha256').update(lastHash + canonicalJson({ ...e, hash: undefined })).digest('hex');
      st.insertAudit.run(e.seq, e.ts, e.userId || null, e.action || null, e.type || null, e.recordId || null, e.initiativeId || null, JSON.stringify(e), e.prevHash, e.hash);
      lastHash = e.hash;
      return e;
    },
    async queryAudit({ initiativeId, recordId, userId, action, type, from, to, q: text, limit = 200, offset = 0 } = {}) {
      const where = [];
      const args = [];
      if (initiativeId) { where.push('initiative_id = ?'); args.push(initiativeId); }
      if (recordId) { where.push('record_id = ?'); args.push(recordId); }
      if (userId) { where.push('user_id = ?'); args.push(userId); }
      if (action) { where.push('action = ?'); args.push(action); }
      if (type) { where.push('type = ?'); args.push(type); }
      if (from) { where.push('ts >= ?'); args.push(from); }
      if (to) { where.push('ts <= ?'); args.push(`${to}~`); }
      if (text) { where.push('LOWER(data) LIKE ?'); args.push(`%${String(text).toLowerCase()}%`); }
      const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = db.prepare(`SELECT COUNT(*) AS n FROM audit ${w}`).get(...args).n;
      const rows = db.prepare(`SELECT data FROM audit ${w} ORDER BY seq DESC LIMIT ? OFFSET ?`).all(...args, Number(limit), Number(offset)).map((r) => JSON.parse(r.data));
      return { rows, total: Number(total) };
    },
    async allAudit() {
      return st.allAudit.all().map((r) => JSON.parse(r.data));
    },
    async putBlob(id, bytes, meta = {}) {
      const buf = Buffer.from(bytes);
      st.putBlob.run(id, JSON.stringify({ ...meta, size: buf.length }), crypt.encBytes(buf));
    },
    async getBlob(id) {
      const row = st.getBlob.get(id);
      return row ? { meta: JSON.parse(row.meta), bytes: new Uint8Array(crypt.decBytes(row.bytes)) } : null;
    },
    async deleteBlob(id) {
      st.delBlob.run(id);
    },
    async changesSince(since, initiativeId) {
      return { seq, records: st.changes.all(Number(since) || 0, initiativeId).map(parse) };
    },
    async currentSeq() {
      return seq;
    },
    async transaction(fn) {
      return fn();
    },
    async stats() {
      const c = st.count.get();
      return { records: Number(c.records), audit: Number(c.audit), blobs: Number(c.blobs), encrypted: crypt.enabled, file };
    },
    // Session and credential storage (server only).
    sessions: {
      create(s) { db.prepare('INSERT INTO sessions (id, user_id, created_at, last_seen, expires_at, data) VALUES (?, ?, ?, ?, ?, ?)').run(s.id, s.userId, s.createdAt, s.lastSeen, s.expiresAt, JSON.stringify(s.data || {})); },
      get(id) { const r = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id); return r ? { id: r.id, userId: r.user_id, createdAt: r.created_at, lastSeen: r.last_seen, expiresAt: r.expires_at, data: JSON.parse(r.data || '{}') } : null; },
      touch(id, lastSeen, expiresAt) { db.prepare('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE id = ?').run(lastSeen, expiresAt, id); },
      remove(id) { db.prepare('DELETE FROM sessions WHERE id = ?').run(id); },
      removeForUser(userId) { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId); },
      purge(now) { db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now); },
    },
    credentials: {
      get(userId) { return db.prepare('SELECT password_hash FROM credentials WHERE user_id = ?').get(userId)?.password_hash || null; },
      set(userId, hash) { db.prepare('INSERT INTO credentials (user_id, password_hash, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at').run(userId, hash, new Date().toISOString()); },
    },
    tokens: {
      create(t) { db.prepare('INSERT INTO tokens (id, client_id, expires_at, scopes) VALUES (?, ?, ?, ?)').run(t.id, t.clientId, t.expiresAt, JSON.stringify(t.scopes || [])); },
      get(id) { const r = db.prepare('SELECT * FROM tokens WHERE id = ?').get(id); return r ? { id: r.id, clientId: r.client_id, expiresAt: r.expires_at, scopes: JSON.parse(r.scopes || '[]') } : null; },
      purge(now) { db.prepare('DELETE FROM tokens WHERE expires_at < ?').run(now); },
    },
    close() { db.close(); },
    isEmpty() { return Number(db.prepare('SELECT COUNT(*) AS n FROM records').get().n) === 0; },
  };
  return driver;
}

// Hash for opaque tokens stored at rest.
export const tokenHash = (t) => createHash('sha256').update(String(t)).digest('hex');
