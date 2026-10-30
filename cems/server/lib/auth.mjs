// Sessions and sign-in.
// - Sessions: random token in an HttpOnly, SameSite=Strict cookie; only its SHA-256 is stored.
//   Inactive sessions end after the configured idle time (NFR-009). State-changing requests carry a
//   per-session CSRF token header.
// - Sign-in: Microsoft Entra ID through OpenID Connect with PKCE (INT-001, NFR-001), or demo personas
//   for evaluation (CEMS_AUTH_MODE=demo, never in production).
import crypto from 'node:crypto';
import { nowIso, newId } from '../db.mjs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function createAuth(app) {
  const { db, config, settings, audit } = app;
  const COOKIE = 'cems_sid';

  function rowToUser(row) {
    if (!row) return null;
    const data = JSON.parse(row.data || '{}');
    return { id: row.id, email: row.email, name: row.name, active: Boolean(row.active), external: Boolean(row.external), ...data, roles: data.roles || [] };
  }
  const getUser = (id) => rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  const getUserByEmail = (email) => rowToUser(db.prepare('SELECT * FROM users WHERE email = ?').get(email));

  function createSession(user, req) {
    const token = b64url(crypto.randomBytes(32));
    const csrf = b64url(crypto.randomBytes(24));
    const now = Date.now();
    const maxHours = settings.get('security').sessionMaxHours || 12;
    db.prepare('INSERT INTO sessions (id, user_id, csrf, created_at, last_seen, expires_at, ip, ua) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(sha(token), user.id, csrf, now, now, now + maxHours * 3600_000, ipOf(req), String(req.headers['user-agent'] || '').slice(0, 200));
    const data = JSON.parse(db.prepare('SELECT data FROM users WHERE id = ?').get(user.id).data || '{}');
    db.prepare('UPDATE users SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify({ ...data, last_login: nowIso() }), nowIso(), user.id);
    audit.record({ userId: user.id, action: 'sign-in', entity: 'user', entityId: user.id, summary: `Signed in (${config.authMode})`, ip: ipOf(req) });
    return { token, csrf };
  }

  // Returns { session, user } or null; ends sessions idle for longer than the configured limit.
  function loadSession(token) {
    if (!token) return null;
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sha(token));
    if (!row) return null;
    const now = Date.now();
    const idle = (settings.get('security').sessionIdleMinutes || 30) * 60_000;
    if (row.expires_at < now || now - row.last_seen > idle) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
      return { expired: true };
    }
    const user = getUser(row.user_id);
    if (!user || !user.active) return null;
    if (now - row.last_seen > 30_000) db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?').run(now, row.id);
    return { session: row, user };
  }

  function endSession(token, user, req) {
    if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(sha(token));
    if (user) audit.record({ userId: user.id, action: 'sign-out', entity: 'user', entityId: user.id, summary: 'Signed out', ip: ipOf(req) });
  }

  // ---- OpenID Connect (Microsoft Entra ID) ----
  let discovery = null;
  let jwks = { at: 0, keys: [] };

  async function oidcDiscovery() {
    if (discovery) return discovery;
    const url = `${config.oidc.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`OIDC discovery failed (${r.status})`);
    discovery = await r.json();
    return discovery;
  }

  async function signingKey(kid) {
    if (!jwks.keys.length || Date.now() - jwks.at > 3600_000 || !jwks.keys.some((k) => k.kid === kid)) {
      const d = await oidcDiscovery();
      const r = await fetch(d.jwks_uri);
      if (!r.ok) throw new Error('Could not fetch signing keys');
      jwks = { at: Date.now(), keys: (await r.json()).keys || [] };
    }
    const jwk = jwks.keys.find((k) => k.kid === kid);
    if (!jwk) throw new Error('Unknown signing key');
    return crypto.createPublicKey({ key: jwk, format: 'jwk' });
  }

  // Validates an ID token: RS256 signature, issuer, audience, expiry and nonce.
  async function verifyIdToken(idToken, nonce) {
    const [h, p, s] = String(idToken).split('.');
    if (!h || !p || !s) throw new Error('Malformed ID token');
    const header = JSON.parse(Buffer.from(h, 'base64url').toString());
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (header.alg !== 'RS256') throw new Error('Unsupported token algorithm');
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), await signingKey(header.kid), Buffer.from(s, 'base64url'));
    if (!ok) throw new Error('Invalid token signature');
    const d = await oidcDiscovery();
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== d.issuer && !String(d.issuer).includes('{tenantid}')) throw new Error('Wrong token issuer');
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(config.oidc.clientId)) throw new Error('Wrong token audience');
    if (claims.exp < now - 60 || (claims.nbf && claims.nbf > now + 60)) throw new Error('Expired token');
    if (claims.nonce !== nonce) throw new Error('Nonce mismatch');
    return claims;
  }

  const pending = new Map(); // state -> { verifier, nonce, at, returnTo }

  async function oidcStart(returnTo = '/') {
    const d = await oidcDiscovery();
    const state = b64url(crypto.randomBytes(16));
    const nonce = b64url(crypto.randomBytes(16));
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    pending.set(state, { verifier, nonce, at: Date.now(), returnTo: returnTo.startsWith('/') ? returnTo : '/' });
    for (const [k, v] of pending) if (Date.now() - v.at > 600_000) pending.delete(k);
    const u = new URL(d.authorization_endpoint);
    u.search = new URLSearchParams({
      client_id: config.oidc.clientId, response_type: 'code', redirect_uri: config.oidc.redirectUri, scope: config.oidc.scopes,
      state, nonce, code_challenge: challenge, code_challenge_method: 'S256', response_mode: 'query',
    }).toString();
    return u.toString();
  }

  async function oidcCallback(query, req) {
    const p = pending.get(query.state);
    pending.delete(query.state);
    if (!p) throw new Error('Sign-in session expired; please try again.');
    if (query.error) throw new Error(`Identity provider: ${query.error_description || query.error}`);
    const d = await oidcDiscovery();
    const r = await fetch(d.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code: query.code, redirect_uri: config.oidc.redirectUri, client_id: config.oidc.clientId,
        client_secret: config.oidc.clientSecret, code_verifier: p.verifier,
      }),
    });
    if (!r.ok) throw new Error(`Token exchange failed (${r.status})`);
    const tokens = await r.json();
    const claims = await verifyIdToken(tokens.id_token, p.nonce);
    if (config.oidc.requireMfa && !(claims.amr || []).some((m) => ['mfa', 'fido', 'hwk', 'wia'].includes(m))) {
      audit.record({ action: 'sign-in-failed', entity: 'user', summary: `MFA not satisfied for ${claims.preferred_username || claims.email}`, ip: ipOf(req) });
      throw new Error('Multi-factor authentication is required (NFR-001).');
    }
    const email = String(claims.email || claims.preferred_username || '').toLowerCase();
    let user = getUserByEmail(email);
    const groupRoles = (claims.groups || []).map((g) => config.oidc.groupRoles[g]).filter(Boolean);
    if (!user && config.oidc.autoProvision) {
      const id = newId('usr');
      const ts = nowIso();
      db.prepare('INSERT INTO users (id, email, name, data, active, external, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, ?, ?)')
        .run(id, email, claims.name || email, JSON.stringify({ roles: groupRoles, oid: claims.oid, source: 'entra' }), ts, ts);
      audit.record({ action: 'provision', entity: 'user', entityId: id, summary: `Provisioned ${email} from Entra ID`, after: { roles: groupRoles } });
      user = getUser(id);
    } else if (user && groupRoles.length) {
      // ADM-001: Firm-wide roles follow Entra ID group membership.
      const data = JSON.parse(db.prepare('SELECT data FROM users WHERE id = ?').get(user.id).data);
      const roles = [...new Set(groupRoles)].sort();
      if (JSON.stringify(roles) !== JSON.stringify([...(data.roles || [])].sort())) {
        db.prepare('UPDATE users SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify({ ...data, roles }), nowIso(), user.id);
        audit.record({ action: 'grant', entity: 'user', entityId: user.id, summary: 'Firm-wide roles synchronised from Entra ID groups', before: { roles: data.roles }, after: { roles } });
        user = getUser(user.id);
      }
    }
    if (!user || !user.active) throw new Error('Your account is not enabled in CEMS. Contact the system administrator.');
    return { user, returnTo: p.returnTo };
  }

  return { COOKIE, getUser, getUserByEmail, rowToUser, createSession, loadSession, endSession, oidcStart, oidcCallback, verifyIdToken };
}

export function ipOf(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}
