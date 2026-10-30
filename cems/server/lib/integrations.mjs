// Integration runtime (INT-014): every outbound call is logged with an idempotency key, retried with
// back-off, queued as an error after repeated failure, and surfaced to administrators.
// Adapters: Microsoft 365 email via Graph (INT-002), Teams webhooks (INT-004), accounting (INT-005),
// CRM (INT-006), ClamAV malware scanning (RPT-004, NFR-008), signed outbound webhooks (INT-013).
import crypto from 'node:crypto';
import net from 'node:net';
import { newId, nowIso } from '../db.mjs';

const MAX_ATTEMPTS = 5;

export function createIntegrations(app) {
  const { db, config } = app;

  function log(entry) {
    const ts = nowIso();
    db.prepare(`INSERT INTO integration_log (id, system, direction, operation, idempotency_key, payload, response, status, attempts, next_attempt_at, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(newId('int'), entry.system, entry.direction || 'outbound', entry.operation, entry.key || null,
      JSON.stringify(entry.payload ?? null), JSON.stringify(entry.response ?? null), entry.status, entry.attempts || 1, entry.next || null, entry.error || null, ts, ts);
  }

  // Runs fn once per idempotency key; failures are retried by the integration-retry job.
  async function call({ system, operation, key, payload, fn }) {
    const existing = key ? db.prepare('SELECT * FROM integration_log WHERE idempotency_key = ?').get(key) : null;
    if (existing?.status === 'success') return { ok: true, response: JSON.parse(existing.response || 'null'), duplicate: true };
    try {
      const response = await fn(payload);
      if (existing) {
        db.prepare("UPDATE integration_log SET status = 'success', response = ?, attempts = attempts + 1, error = NULL, updated_at = ? WHERE id = ?").run(JSON.stringify(response ?? null), nowIso(), existing.id);
      } else log({ system, operation, key, payload, response, status: 'success' });
      return { ok: true, response };
    } catch (e) {
      const attempts = (existing?.attempts || 0) + 1;
      const status = attempts >= MAX_ATTEMPTS ? 'dead' : 'failed';
      const next = new Date(Date.now() + 2 ** attempts * 60_000).toISOString();
      if (existing) {
        db.prepare('UPDATE integration_log SET status = ?, attempts = ?, next_attempt_at = ?, error = ?, updated_at = ? WHERE id = ?').run(status, attempts, next, String(e.message).slice(0, 500), nowIso(), existing.id);
      } else log({ system, operation, key, payload, status, attempts, next, error: String(e.message).slice(0, 500) });
      if (status === 'dead') app.notify?.admins({ kind: 'integration', title: `${system} ${operation} failed ${attempts} times`, body: e.message, severity: 'high', link: '/admin/system' });
      return { ok: false, error: e.message };
    }
  }

  const handlers = new Map(); // `${system}:${operation}` -> fn(payload)
  const register = (system, operation, fn) => handlers.set(`${system}:${operation}`, fn);

  async function retryDue() {
    const due = db.prepare("SELECT * FROM integration_log WHERE status = 'failed' AND (next_attempt_at IS NULL OR next_attempt_at <= ?) LIMIT 20").all(nowIso());
    let retried = 0;
    for (const row of due) {
      const fn = handlers.get(`${row.system}:${row.operation}`) || handlers.get(`${row.system}:*`);
      if (!fn) continue;
      await call({ system: row.system, operation: row.operation, key: row.idempotency_key, payload: JSON.parse(row.payload || 'null'), fn });
      retried++;
    }
    return `${retried} retried`;
  }

  // ---- Microsoft Graph (INT-002) ----
  let graphToken = { value: null, exp: 0 };
  async function graphAccessToken() {
    if (graphToken.value && graphToken.exp > Date.now() + 60_000) return graphToken.value;
    const r = await fetch(`https://login.microsoftonline.com/${config.m365.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: config.m365.clientId, client_secret: config.m365.clientSecret, scope: 'https://graph.microsoft.com/.default' }),
    });
    if (!r.ok) throw new Error(`Graph token request failed (${r.status})`);
    const j = await r.json();
    graphToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    return graphToken.value;
  }

  async function sendMail({ to, cc, subject, html, attachments = [] }) {
    if (!config.m365.enabled) return { simulated: true };
    const token = await graphAccessToken();
    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.m365.sender)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: to.map((address) => ({ emailAddress: { address } })),
          ccRecipients: (cc || []).map((address) => ({ emailAddress: { address } })),
          attachments: attachments.map((a) => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: a.name, contentType: a.type, contentBytes: a.base64 })),
        },
        saveToSentItems: true,
      }),
    });
    if (!r.ok) throw new Error(`Graph sendMail failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
    return { sent: true };
  }

  async function postTeams(webhookUrl, { title, text, link }) {
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, text: `${text}${link ? `\n\n[Open in CEMS](${config.baseUrl}${link})` : ''}` }),
    });
    if (!r.ok) throw new Error(`Teams webhook failed (${r.status})`);
    return { posted: true };
  }

  // ---- Outbound webhooks for key events (INT-013), signed with HMAC-SHA256 ----
  async function postWebhook(p) {
    const r = await fetch(p.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CEMS-Signature': `sha256=${p.signature}` }, body: p.body });
    if (!r.ok) throw new Error(`Webhook ${r.status}`);
    return { status: r.status };
  }
  register('webhook', '*', postWebhook);
  register('teams', 'post', (p) => postTeams(p.url, p));

  async function emitEvent(event, data) {
    const hooks = db.prepare('SELECT * FROM webhooks WHERE deleted_at IS NULL').all().map((r) => ({ id: r.id, ...JSON.parse(r.data) }));
    for (const h of hooks.filter((x) => x.active !== false && (x.events || []).includes(event))) {
      const body = JSON.stringify({ event, at: nowIso(), data });
      const signature = crypto.createHmac('sha256', h.secret || '').update(body).digest('hex');
      await call({ system: 'webhook', operation: event, key: `${h.id}:${event}:${data.id || ''}:${data.rev || ''}`, payload: { url: h.url, body, signature }, fn: postWebhook });
    }
  }

  // ---- ClamAV INSTREAM scan (RPT-004, NFR-008) ----
  function scan(buffer) {
    if (!config.clamav.host) return Promise.resolve({ status: 'not-scanned', detail: 'No malware scanner configured' });
    return new Promise((resolve) => {
      const sock = net.createConnection(config.clamav.port, config.clamav.host);
      let out = '';
      sock.setTimeout(30_000, () => { sock.destroy(); resolve({ status: 'error', detail: 'Scanner timeout' }); });
      sock.on('error', (e) => resolve({ status: 'error', detail: e.message }));
      sock.on('data', (d) => { out += d.toString(); });
      sock.on('end', () => resolve(/FOUND/.test(out) ? { status: 'infected', detail: out.trim() } : /OK/.test(out) ? { status: 'clean' } : { status: 'error', detail: out.trim() }));
      sock.on('connect', () => {
        sock.write('zINSTREAM\0');
        for (let i = 0; i < buffer.length; i += 65536) {
          const chunk = buffer.subarray(i, i + 65536);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(chunk.length);
          sock.write(len);
          sock.write(chunk);
        }
        sock.end(Buffer.alloc(4));
      });
    });
  }

  return { call, register, retryDue, sendMail, postTeams, emitEvent, scan };
}
