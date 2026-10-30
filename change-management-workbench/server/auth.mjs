// Authentication: single sign-on through OpenID Connect (INT-001, SEC-01), local break-glass accounts,
// a demo sign-in for evaluation, sliding session timeout (SEC-09) and OAuth 2.0 client credentials for
// the REST API (INT-007).
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { tokenHash } from './db.mjs';

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const got = scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
    return timingSafeEqual(expected, got);
  } catch {
    return false;
  }
}

export function passwordProblems(pw) {
  const p = String(pw || '');
  const issues = [];
  if (p.length < 14) issues.push('at least 14 characters');
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p)) issues.push('upper and lower case letters');
  if (!/\d/.test(p)) issues.push('a number');
  return issues;
}

export function createSessions(driver, { timeoutMinutes }) {
  const minutes = () => Number(timeoutMinutes()) || 30;
  return {
    start(userId, data = {}) {
      const id = randomBytes(32).toString('base64url');
      const now = new Date();
      driver.sessions.create({ id: tokenHash(id), userId, createdAt: now.toISOString(), lastSeen: now.toISOString(), expiresAt: new Date(now.getTime() + minutes() * 60000).toISOString(), data });
      return id;
    },
    // Sliding expiry: each request extends the session by the timeout.
    resolve(id) {
      if (!id) return null;
      const s = driver.sessions.get(tokenHash(id));
      if (!s) return null;
      const now = new Date();
      if (s.expiresAt < now.toISOString()) {
        driver.sessions.remove(tokenHash(id));
        return { expired: true, userId: s.userId };
      }
      driver.sessions.touch(tokenHash(id), now.toISOString(), new Date(now.getTime() + minutes() * 60000).toISOString());
      return s;
    },
    end(id) {
      if (id) driver.sessions.remove(tokenHash(id));
    },
    endAllFor(userId) {
      driver.sessions.removeForUser(userId);
    },
    purge() {
      driver.sessions.purge(new Date().toISOString());
      driver.tokens.purge(new Date().toISOString());
    },
  };
}

// OAuth 2.0 client credentials (INT-007): POST /api/oauth/token.
export function createTokenService(driver) {
  return {
    issue(client, ttlSeconds = 3600) {
      const token = randomBytes(32).toString('base64url');
      driver.tokens.create({ id: tokenHash(token), clientId: client.id, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(), scopes: client.scopes || [] });
      return { access_token: token, token_type: 'Bearer', expires_in: ttlSeconds, scope: (client.scopes || []).join(' ') };
    },
    resolve(token) {
      const t = driver.tokens.get(tokenHash(token));
      if (!t || t.expiresAt < new Date().toISOString()) return null;
      return t;
    },
  };
}

// OpenID Connect (authorization code with PKCE). Configured with OIDC_ISSUER, OIDC_CLIENT_ID,
// OIDC_CLIENT_SECRET and OIDC_REDIRECT_URI; works with Microsoft Entra ID and other providers.
export async function createOidc(env, log) {
  if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID) return null;
  const client = await import('openid-client');
  let config;
  try {
    const opts = env.OIDC_ALLOW_HTTP === '1' ? { execute: [client.allowInsecureRequests] } : undefined;
    config = await client.discovery(new URL(env.OIDC_ISSUER), env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET || undefined, undefined, opts);
  } catch (e) {
    log('error', 'OIDC discovery failed; single sign-on is unavailable', e.message);
    return null;
  }
  const pending = new Map(); // state -> { verifier, nonce, at, returnTo }
  const scope = env.OIDC_SCOPES || 'openid profile email';
  return {
    async loginUrl(returnTo = '/') {
      const verifier = client.randomPKCECodeVerifier();
      const challenge = await client.calculatePKCECodeChallenge(verifier);
      const state = client.randomState();
      const nonce = client.randomNonce();
      pending.set(state, { verifier, nonce, at: Date.now(), returnTo });
      for (const [k, v] of pending) if (v.at < Date.now() - 600000) pending.delete(k);
      return client.buildAuthorizationUrl(config, { redirect_uri: env.OIDC_REDIRECT_URI, scope, code_challenge: challenge, code_challenge_method: 'S256', state, nonce }).href;
    },
    async callback(currentUrl) {
      const state = new URL(currentUrl).searchParams.get('state');
      const p = pending.get(state);
      if (!p) throw new Error('The sign-in request has expired. Please try again.');
      pending.delete(state);
      const tokens = await client.authorizationCodeGrant(config, new URL(currentUrl), { pkceCodeVerifier: p.verifier, expectedState: state, expectedNonce: p.nonce });
      const claims = tokens.claims() || {};
      const roleClaim = env.OIDC_ROLE_CLAIM || 'roles';
      return {
        email: String(claims.email || claims.preferred_username || claims.upn || '').toLowerCase(),
        name: claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(' ') || claims.email,
        subject: claims.sub,
        idpRoles: [].concat(claims[roleClaim] || []),
        returnTo: p.returnTo,
      };
    },
  };
}

// Maps identity-provider role or group claims to application roles (OIDC_ROLE_MAP is JSON).
export function mapIdpRoles(idpRoles, env) {
  let map = {};
  try { map = JSON.parse(env.OIDC_ROLE_MAP || '{}'); } catch { map = {}; }
  const out = new Set();
  for (const r of idpRoles) {
    if (map[r]) [].concat(map[r]).forEach((x) => out.add(x));
    else out.add(r);
  }
  return [...out];
}
