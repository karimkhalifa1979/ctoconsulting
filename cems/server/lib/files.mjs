// File storage for uploads (templates, receipts, logos, evidence) and generated reports.
// Bytes are stored on disk by SHA-256; metadata lives in the files table.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { newId, nowIso } from '../db.mjs';

export const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml',
  csv: 'text/csv', txt: 'text/plain', json: 'application/json', zip: 'application/zip',
};

export function sniff(buffer) {
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x504b0304) return 'zip';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'pdf';
  if (buffer.subarray(0, 6).toString() === 'GIF87a' || buffer.subarray(0, 6).toString() === 'GIF89a') return 'gif';
  if (buffer.length >= 8 && buffer.readUInt32BE(0) === 0xd0cf11e0) return 'ole'; // legacy Office binary
  return 'unknown';
}

export function createFiles(app) {
  const { db, config } = app;
  fs.mkdirSync(config.filesDir, { recursive: true });

  function save(buffer, { name, mime, engagementId = null, purpose = null, userId = null, scan = null }) {
    const sha = crypto.createHash('sha256').update(buffer).digest('hex');
    const rel = path.join(sha.slice(0, 2), sha);
    const abs = path.join(config.filesDir, rel);
    if (!fs.existsSync(abs)) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, buffer);
    }
    const id = newId('file');
    const ext = String(name || '').split('.').pop().toLowerCase();
    db.prepare('INSERT INTO files (id, name, mime, size, sha256, path, scan_status, engagement_id, purpose, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, name, mime || MIME[ext] || 'application/octet-stream', buffer.length, sha, rel, scan, engagementId, purpose, userId, nowIso());
    return meta(id);
  }

  const meta = (id) => db.prepare('SELECT * FROM files WHERE id = ?').get(id) || null;

  function read(id) {
    const m = meta(id);
    if (!m) return null;
    const abs = path.join(config.filesDir, m.path);
    if (!fs.existsSync(abs)) return null;
    return { meta: m, buffer: fs.readFileSync(abs) };
  }

  const rename = (id, name) => db.prepare('UPDATE files SET name = ? WHERE id = ?').run(name, id);

  return { save, meta, read, rename };
}
