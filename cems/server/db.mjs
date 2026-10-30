// SQLite storage (node:sqlite). Business records are JSON documents in one table per entity,
// with scope columns (client, engagement, project) and generated columns for frequent filters.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ENTITIES } from '../shared/schema.js';
import { now } from '../shared/clock.js';

// Tables used by specialised modules, stored in the same document shape as entities.
export const DOC_TABLES = {
  time_entries: ['person_id', 'date', 'status', 'timesheet_id', 'task_id'],
  timesheets: ['person_id', 'week_start', 'status'],
  status_updates: ['period_end', 'status'],
  baselines: ['kind'],
  budget_versions: ['status'],
  forecast_cycles: ['period', 'status'],
  forecast_versions: ['cycle_id', 'kind', 'status'],
  report_templates: ['status', 'report_type'],
  template_versions: ['template_id'],
  reports: ['status', 'period_end', 'report_type', 'audience'],
  snapshots: ['report_id'],
  distributions: ['report_id'],
  approvals: ['status', 'entity', 'entity_id'],
  periods: ['status'],
  delivery_profiles: [],
  project_templates: [],
  custom_fields: ['entity'],
  imports: ['kind'],
  webhooks: [],
  delegations: ['from_user'],
  revenue_postings: ['period'],
};

const BASE_COLUMNS = `
  id TEXT PRIMARY KEY,
  type TEXT,
  client_id TEXT,
  engagement_id TEXT,
  project_id TEXT,
  ref TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  rev INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  deleted_at TEXT`;

const SYSTEM_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE COLLATE NOCASE, name TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1, external INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
  project_ids TEXT, grants TEXT, start_date TEXT, end_date TEXT, ended_at TEXT, created_at TEXT NOT NULL, created_by TEXT);
CREATE INDEX IF NOT EXISTS memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS memberships_eng ON memberships(engagement_id);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, csrf TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, ip TEXT, ua TEXT, data TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS audit (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT,
  engagement_id TEXT, summary TEXT, before TEXT, after TEXT, ip TEXT, prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS audit_entity ON audit(entity, entity_id);
CREATE INDEX IF NOT EXISTS audit_user ON audit(user_id);
CREATE INDEX IF NOT EXISTS audit_eng ON audit(engagement_id);
CREATE TRIGGER IF NOT EXISTS audit_immutable_u BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'The audit trail is immutable (NFR-025)'); END;
CREATE TRIGGER IF NOT EXISTS audit_immutable_d BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'The audit trail is immutable (NFR-025)'); END;
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT, size INTEGER, sha256 TEXT, path TEXT NOT NULL, scan_status TEXT,
  engagement_id TEXT, purpose TEXT, uploaded_by TEXT, uploaded_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT, updated_by TEXT);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT, title TEXT NOT NULL, body TEXT, link TEXT, entity TEXT, entity_id TEXT,
  engagement_id TEXT, severity TEXT, mandatory INTEGER DEFAULT 0, dedupe TEXT, created_at TEXT NOT NULL, read_at TEXT, emailed_at TEXT);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, read_at);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe ON notifications(user_id, dedupe) WHERE dedupe IS NOT NULL;
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY, kind TEXT, to_addr TEXT NOT NULL, cc TEXT, subject TEXT NOT NULL, html TEXT, attachments TEXT,
  status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, related TEXT, created_at TEXT NOT NULL, sent_at TEXT);
CREATE TABLE IF NOT EXISTS integration_log (
  id TEXT PRIMARY KEY, system TEXT NOT NULL, direction TEXT, operation TEXT NOT NULL, idempotency_key TEXT UNIQUE, payload TEXT,
  response TEXT, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (
  name TEXT PRIMARY KEY, last_run_at TEXT, last_status TEXT, last_message TEXT, next_run_at TEXT, runs INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS sequences (scope TEXT NOT NULL, key TEXT NOT NULL, value INTEGER NOT NULL, PRIMARY KEY (scope, key));
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL, engagement_id TEXT, user_id TEXT NOT NULL, body TEXT NOT NULL,
  mentions TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS comments_record ON comments(entity, entity_id);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`;

const BASE_NAMES = new Set(['id', 'type', 'client_id', 'engagement_id', 'project_id', 'ref', 'data', 'rev', 'created_at', 'created_by', 'updated_at', 'updated_by', 'deleted_at']);

function docTableDDL(table, allColumns) {
  const columns = allColumns.filter((c) => !BASE_NAMES.has(c));
  const gen = columns.map((c) => `,\n  ${c} TEXT GENERATED ALWAYS AS (json_extract(data, '$.${c}')) VIRTUAL`).join('');
  const idx = ['engagement_id', 'project_id', 'client_id', 'type', 'ref', ...columns]
    .map((c) => `CREATE INDEX IF NOT EXISTS ${table}_${c} ON ${table}(${c});`).join('\n');
  return `CREATE TABLE IF NOT EXISTS ${table} (${BASE_COLUMNS}${gen});\n${idx}`;
}

// All document tables: entity tables from the registry plus specialised module tables.
export function documentTables() {
  const tables = new Map();
  for (const def of Object.values(ENTITIES)) {
    const cols = new Set(tables.get(def.table) || []);
    for (const c of def.columns || []) cols.add(c);
    if (def.table === 'raid') cols.add('status');
    tables.set(def.table, [...cols]);
  }
  for (const [t, cols] of Object.entries(DOC_TABLES)) tables.set(t, cols);
  return tables;
}

export function openDb(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
  db.exec(SYSTEM_DDL);
  for (const [table, cols] of documentTables()) db.exec(docTableDDL(table, cols));
  let depth = 0;
  // Nested transactions use savepoints so services can compose.
  db.tx = (fn) => {
    const sp = `sp${depth++}`;
    db.exec(depth === 1 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
    try {
      const out = fn();
      db.exec(depth === 1 ? 'COMMIT' : `RELEASE ${sp}`);
      return out;
    } catch (e) {
      db.exec(depth === 1 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
      throw e;
    } finally {
      depth--;
    }
  };
  return db;
}

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
export function newId(prefix = 'id') {
  const bytes = crypto.randomBytes(10);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % 32];
  return `${prefix}_${s}`;
}

export const nowIso = () => now().toISOString();

export function nextSequence(db, scope, key) {
  const row = db.prepare('SELECT value FROM sequences WHERE scope = ? AND key = ?').get(scope, key);
  const value = (row?.value || 0) + 1;
  db.prepare('INSERT INTO sequences (scope, key, value) VALUES (?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value').run(scope, key, value);
  return value;
}
