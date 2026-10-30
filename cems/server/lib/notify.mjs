// Notifications (WFL-002, WFL-004): in-app, plus email immediately or as a daily digest.
// Mandatory notifications (approvals, threshold breaches) are always emailed immediately.
import { newId, nowIso } from '../db.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function createNotify(app) {
  const { db, config } = app;
  const insert = db.prepare(`INSERT OR IGNORE INTO notifications (id, user_id, kind, title, body, link, entity, entity_id, engagement_id, severity, mandatory, dedupe, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  function emailHtml(title, body, link) {
    return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;color:#16212f">
      <div style="background:#0b1f3a;color:#fff;padding:14px 20px;font-weight:700">CTO Consulting · CEMS</div>
      <div style="padding:18px 20px;border:1px solid #e2e7ee;border-top:0">
        <h2 style="margin:0 0 8px;font-size:17px;color:#0b1f3a">${esc(title)}</h2>
        ${body ? `<p style="margin:0 0 14px;white-space:pre-wrap">${esc(body)}</p>` : ''}
        ${link ? `<a href="${esc(config.baseUrl + link)}" style="background:#0fa3b1;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Open in CEMS</a>` : ''}
      </div></div>`;
  }

  function queueEmail({ to, cc = [], subject, html, attachments = [], kind = 'notification', related = null }) {
    const id = newId('mail');
    db.prepare('INSERT INTO outbox (id, kind, to_addr, cc, subject, html, attachments, status, related, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, kind, JSON.stringify(to), JSON.stringify(cc), subject, html, JSON.stringify(attachments), 'queued', related ? JSON.stringify(related) : null, nowIso());
    return id;
  }

  function send(userIds, n) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    const created = [];
    for (const uid of ids) {
      const user = app.auth.getUser(uid);
      if (!user || !user.active) continue;
      const id = newId('ntf');
      const res = insert.run(id, uid, n.kind || 'info', n.title, n.body || null, n.link || null, n.entity || null, n.entityId || null, n.engagementId || null,
        n.severity || 'info', n.mandatory ? 1 : 0, n.dedupe || null, nowIso());
      if (!res.changes) continue;
      created.push(id);
      const pref = user.notify_pref || 'immediate';
      if (user.email && (n.mandatory || pref === 'immediate')) {
        queueEmail({ to: [user.email], subject: `[CEMS] ${n.title}`, html: emailHtml(n.title, n.body, n.link), related: { notification: id } });
        db.prepare('UPDATE notifications SET emailed_at = ? WHERE id = ?').run(nowIso(), id);
      }
      if (n.teamsWebhook) {
        app.integrations.call({ system: 'teams', operation: 'post', key: `teams:${id}`, payload: { url: n.teamsWebhook, title: n.title, text: n.body || '', link: n.link }, fn: (p) => app.integrations.postTeams(p.url, p) });
      }
    }
    return created;
  }

  function admins(n) {
    const ids = db.prepare("SELECT id FROM users WHERE active = 1 AND json_extract(data, '$.roles') LIKE '%sysadmin%'").all().map((r) => r.id);
    return send(ids, n);
  }

  // Sends queued email through Microsoft 365, or records it as simulated when no tenant is configured.
  async function processOutbox() {
    const rows = db.prepare("SELECT * FROM outbox WHERE status IN ('queued', 'failed') AND attempts < 5 ORDER BY created_at LIMIT 50").all();
    let sent = 0;
    for (const row of rows) {
      const attachments = JSON.parse(row.attachments || '[]').map((a) => {
        if (a.base64 || !a.file_id) return a;
        const f = app.files.read(a.file_id);
        return f ? { name: a.name || f.meta.name, type: f.meta.mime, base64: f.buffer.toString('base64') } : null;
      }).filter(Boolean);
      try {
        const r = await app.integrations.sendMail({ to: JSON.parse(row.to_addr), cc: JSON.parse(row.cc || '[]'), subject: row.subject, html: row.html, attachments });
        db.prepare('UPDATE outbox SET status = ?, attempts = attempts + 1, sent_at = ?, last_error = NULL WHERE id = ?').run(r.simulated ? 'simulated' : 'sent', nowIso(), row.id);
        sent++;
      } catch (e) {
        db.prepare("UPDATE outbox SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE id = ?").run(String(e.message).slice(0, 500), row.id);
      }
    }
    return `${sent} processed`;
  }

  // WFL-004: one daily email of unread, not-yet-emailed notifications for digest users.
  function digest() {
    const users = db.prepare("SELECT id, email, data FROM users WHERE active = 1 AND json_extract(data, '$.notify_pref') = 'digest'").all();
    let n = 0;
    for (const u of users) {
      const items = db.prepare('SELECT * FROM notifications WHERE user_id = ? AND read_at IS NULL AND emailed_at IS NULL ORDER BY created_at').all(u.id);
      if (!items.length || !u.email) continue;
      const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px"><h2 style="color:#0b1f3a">Your CEMS daily digest</h2><ul>${items.map((i) => `<li><a href="${esc(config.baseUrl + (i.link || '/my-work'))}">${esc(i.title)}</a>${i.body ? ` — ${esc(i.body)}` : ''}</li>`).join('')}</ul></div>`;
      queueEmail({ to: [u.email], subject: `[CEMS] Daily digest: ${items.length} update${items.length > 1 ? 's' : ''}`, html, kind: 'digest' });
      db.prepare(`UPDATE notifications SET emailed_at = ? WHERE id IN (${items.map(() => '?').join(',')})`).run(nowIso(), ...items.map((i) => i.id));
      n++;
    }
    return `${n} digests`;
  }

  function list(userId, { unread = false, limit = 50 } = {}) {
    return db.prepare(`SELECT * FROM notifications WHERE user_id = ? ${unread ? 'AND read_at IS NULL' : ''} ORDER BY created_at DESC LIMIT ?`).all(userId, limit);
  }
  const unreadCount = (userId) => db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId).n;
  function markRead(userId, ids) {
    if (ids === 'all') db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(nowIso(), userId);
    else for (const id of ids || []) db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?').run(nowIso(), id, userId);
  }

  return { send, admins, queueEmail, emailHtml, processOutbox, digest, list, unreadCount, markRead };
}
