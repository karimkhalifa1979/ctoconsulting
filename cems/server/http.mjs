// Minimal HTTP toolkit: router with path parameters, typed errors, body parsing and responses.

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const forbidden = (msg = 'You do not have access to this.') => new HttpError(403, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const conflict = (msg, details) => new HttpError(409, msg, details);
export const unprocessable = (msg, details) => new HttpError(422, msg, details);

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler, opts = {}) {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/\/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; })}/?$`);
    this.routes.push({ method, re, keys, handler, opts });
    return this;
  }

  get(p, h, o) { return this.add('GET', p, h, o); }
  post(p, h, o) { return this.add('POST', p, h, o); }
  patch(p, h, o) { return this.add('PATCH', p, h, o); }
  put(p, h, o) { return this.add('PUT', p, h, o); }
  delete(p, h, o) { return this.add('DELETE', p, h, o); }

  match(method, pathname) {
    let allowed = false;
    for (const r of this.routes) {
      const m = pathname.match(r.re);
      if (!m) continue;
      if (r.method !== method) { allowed = true; continue; }
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return { ...r, params };
    }
    return allowed ? { methodNotAllowed: true } : null;
  }
}

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, `Upload is larger than the ${Math.round(limit / 1048576)} MB limit.`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson(req, limit = 4_000_000) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw badRequest('Invalid JSON body');
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name, value, { maxAge, secure, httpOnly = true, sameSite = 'Strict', path = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

// A handler may return a FileResponse to stream bytes instead of JSON.
export class FileResponse {
  constructor(body, { type = 'application/octet-stream', name, inline = false, status = 200, headers = {} } = {}) {
    this.body = body;
    this.type = type;
    this.name = name;
    this.inline = inline;
    this.status = status;
    this.headers = headers;
  }
}

export class Redirect {
  constructor(location, headers = {}) {
    this.location = location;
    this.headers = headers;
  }
}

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob:", "connect-src 'self'",
    "frame-src 'self' blob:", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'self'",
  ].join('; '),
};

export function contentDisposition(name, inline) {
  const safe = String(name || 'download').replace(/[^\w.\- ()]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name || 'download')}`;
}
