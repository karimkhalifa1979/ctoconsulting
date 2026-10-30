// Generic document repository over one table. Objects are the JSON data merged with the
// row's scope and metadata columns; reserved keys are never written into the JSON.
import { newId, nowIso } from '../db.mjs';

const META = ['id', 'type', 'client_id', 'engagement_id', 'project_id', 'ref', 'rev', 'created_at', 'created_by', 'updated_at', 'updated_by', 'deleted_at'];
const META_SET = new Set(META);

export function rowToObject(row) {
  if (!row) return null;
  const data = JSON.parse(row.data || '{}');
  const out = { ...data };
  for (const k of META) if (row[k] !== undefined && row[k] !== null) out[k] = row[k];
  if (out.type === undefined) delete out.type;
  return out;
}

export function splitObject(obj) {
  const data = {};
  for (const [k, v] of Object.entries(obj)) if (!META_SET.has(k) && !k.startsWith('_') && v !== undefined) data[k] = v;
  return data;
}

export class Repo {
  constructor(db, table, { type = null, idPrefix } = {}) {
    this.db = db;
    this.table = table;
    this.type = type;
    this.idPrefix = idPrefix || table.replace(/s$/, '').slice(0, 4);
  }

  get(id, { includeDeleted = false } = {}) {
    const row = this.db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id);
    if (!row || (!includeDeleted && row.deleted_at) || (this.type && row.type !== this.type)) return null;
    return rowToObject(row);
  }

  // where: equality on columns (base or generated); arrays mean IN (...).
  find(where = {}, { includeDeleted = false, order = 'created_at', limit } = {}) {
    const clauses = [];
    const params = [];
    if (this.type) { clauses.push('type = ?'); params.push(this.type); }
    if (!includeDeleted) clauses.push('deleted_at IS NULL');
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (!/^[a-z_]+$/.test(k)) throw new Error(`Bad column ${k}`);
      if (Array.isArray(v)) {
        if (!v.length) return [];
        clauses.push(`${k} IN (${v.map(() => '?').join(',')})`);
        params.push(...v);
      } else if (v === null) clauses.push(`${k} IS NULL`);
      else { clauses.push(`${k} = ?`); params.push(v); }
    }
    const sql = `SELECT * FROM ${this.table}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY ${order}${limit ? ` LIMIT ${Number(limit)}` : ''}`;
    return this.db.prepare(sql).all(...params).map(rowToObject);
  }

  findOne(where) {
    return this.find(where, { limit: 1 })[0] || null;
  }

  insert(obj, actorId = null) {
    const now = nowIso();
    const rec = { ...obj, id: obj.id || newId(this.idPrefix), rev: 1, created_at: obj.created_at || now, created_by: obj.created_by ?? actorId, updated_at: now, updated_by: actorId };
    if (this.type) rec.type = this.type;
    this.db.prepare(`INSERT INTO ${this.table} (id, type, client_id, engagement_id, project_id, ref, data, rev, created_at, created_by, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`).run(
      rec.id, rec.type || null, rec.client_id || null, rec.engagement_id || null, rec.project_id || null, rec.ref || null,
      JSON.stringify(splitObject(rec)), rec.created_at, rec.created_by, rec.updated_at, rec.updated_by,
    );
    return this.get(rec.id);
  }

  // Replaces the record with `next` (already merged by the caller); bumps the revision.
  replace(id, next, actorId = null, { expectRev } = {}) {
    const cur = this.get(id, { includeDeleted: true });
    if (!cur) throw Object.assign(new Error('Record not found'), { status: 404 });
    if (expectRev !== undefined && expectRev !== null && Number(expectRev) !== cur.rev) {
      throw Object.assign(new Error('This record was changed by someone else. Reload and try again.'), { status: 409 });
    }
    const now = nowIso();
    this.db.prepare(`UPDATE ${this.table} SET client_id = ?, engagement_id = ?, project_id = ?, ref = ?, data = ?, rev = rev + 1, updated_at = ?, updated_by = ? WHERE id = ?`).run(
      next.client_id ?? cur.client_id ?? null, next.engagement_id ?? cur.engagement_id ?? null, next.project_id === undefined ? cur.project_id ?? null : next.project_id,
      next.ref ?? cur.ref ?? null, JSON.stringify(splitObject(next)), now, actorId, id,
    );
    return this.get(id, { includeDeleted: true });
  }

  patch(id, changes, actorId = null, opts = {}) {
    const cur = this.get(id, { includeDeleted: true });
    if (!cur) throw Object.assign(new Error('Record not found'), { status: 404 });
    return this.replace(id, { ...cur, ...changes }, actorId, opts);
  }

  softDelete(id, actorId = null) {
    this.db.prepare(`UPDATE ${this.table} SET deleted_at = ?, updated_by = ?, rev = rev + 1 WHERE id = ?`).run(nowIso(), actorId, id);
  }

  hardDelete(id) {
    this.db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
  }
}
