// Immutable audit trail (NFR-025, FIN-045, ACC-007): who, what, when, before and after values.
// Each event is chained to the previous one with SHA-256, so tampering is detectable (verifyChain).
import crypto from 'node:crypto';
import { nowIso } from '../db.mjs';

const GENESIS = '0'.repeat(64);

function digest(prev, e) {
  return crypto.createHash('sha256')
    .update([prev, e.at, e.user_id || '', e.action, e.entity || '', e.entity_id || '', e.engagement_id || '', e.summary || '', e.before || '', e.after || '', e.ip || ''].join('␟'))
    .digest('hex');
}

// Only changed fields are kept in before/after, so the trail shows exactly what moved.
export function diff(before, after) {
  if (!before) return { before: null, after: after ? clean(after) : null };
  if (!after) return { before: clean(before), after: null };
  const b = {}, a = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (['rev', 'updated_at', 'updated_by', 'created_at', 'created_by'].includes(k)) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) { b[k] = before[k] ?? null; a[k] = after[k] ?? null; }
  }
  return { before: b, after: a };
}

function clean(o) {
  const { rev, updated_at, updated_by, created_at, created_by, ...rest } = o; // eslint-disable-line no-unused-vars
  return rest;
}

export function createAudit(db) {
  const last = db.prepare('SELECT hash FROM audit ORDER BY seq DESC LIMIT 1');
  const insert = db.prepare(`INSERT INTO audit (at, user_id, action, entity, entity_id, engagement_id, summary, before, after, ip, prev_hash, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  function record({ userId = null, action, entity = null, entityId = null, engagementId = null, summary = '', before = null, after = null, ip = null }) {
    const e = {
      at: nowIso(), user_id: userId, action, entity, entity_id: entityId, engagement_id: engagementId, summary,
      before: before == null ? null : JSON.stringify(before), after: after == null ? null : JSON.stringify(after), ip,
    };
    const prev = last.get()?.hash || GENESIS;
    const hash = digest(prev, e);
    insert.run(e.at, e.user_id, e.action, e.entity, e.entity_id, e.engagement_id, e.summary, e.before, e.after, e.ip, prev, hash);
    return hash;
  }

  function change(ctx, { action, entity, rec, before, after, summary }) {
    const d = diff(before, after);
    if (action === 'update' && !Object.keys(d.after || {}).length) return null;
    return record({
      userId: ctx?.user?.id || null, ip: ctx?.ip || null, action, entity, entityId: rec?.id,
      engagementId: rec?.engagement_id || null, summary, before: d.before, after: d.after,
    });
  }

  function verifyChain() {
    let prev = GENESIS;
    let count = 0;
    for (const row of db.prepare('SELECT * FROM audit ORDER BY seq').iterate()) {
      if (row.prev_hash !== prev || digest(prev, row) !== row.hash) return { ok: false, brokenAt: row.seq, count };
      prev = row.hash;
      count++;
    }
    return { ok: true, count };
  }

  function query({ userId, entity, entityId, engagementId, from, to, action, limit = 200, offset = 0, engagementIds } = {}) {
    const c = [];
    const p = [];
    if (userId) { c.push('user_id = ?'); p.push(userId); }
    if (entity) { c.push('entity = ?'); p.push(entity); }
    if (entityId) { c.push('entity_id = ?'); p.push(entityId); }
    if (engagementId) { c.push('engagement_id = ?'); p.push(engagementId); }
    if (action) { c.push('action = ?'); p.push(action); }
    if (from) { c.push('at >= ?'); p.push(from); }
    if (to) { c.push('at <= ?'); p.push(`${to}T23:59:59.999Z`); }
    if (engagementIds) { c.push(`(engagement_id IS NULL OR engagement_id IN (${engagementIds.map(() => '?').join(',') || "''"}))`); p.push(...engagementIds); }
    const where = c.length ? `WHERE ${c.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM audit ${where} ORDER BY seq DESC LIMIT ? OFFSET ?`).all(...p, Number(limit), Number(offset));
    const total = db.prepare(`SELECT COUNT(*) n FROM audit ${where}`).get(...p).n;
    return { total, rows: rows.map((r) => ({ ...r, before: r.before ? JSON.parse(r.before) : null, after: r.after ? JSON.parse(r.after) : null })) };
  }

  return { record, change, verifyChain, query };
}
