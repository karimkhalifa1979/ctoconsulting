// API client: same-origin JSON calls with the session's CSRF token on every state-changing request.
let csrf = null;
export const setCsrf = (token) => { csrf = token; };

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.details = body?.details || null;
  }
}

const qs = (query) => {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export async function api(path, { method = 'GET', body, query, raw = false, headers = {} } = {}) {
  const init = { method, headers: { ...headers }, credentials: 'same-origin' };
  if (!['GET', 'HEAD'].includes(method) && csrf) init.headers['x-csrf-token'] = csrf;
  if (body !== undefined) {
    if (raw) init.body = body;
    else { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  }
  const res = await fetch(path + qs(query), init);
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json().catch(() => null) : null;
  if (res.status === 401 && !path.startsWith('/api/auth')) window.dispatchEvent(new CustomEvent('cems:signed-out', { detail: data?.error }));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const get = (path, query) => api(path, { query });
export const post = (path, body, query) => api(path, { method: 'POST', body: body ?? {}, query });
export const put = (path, body) => api(path, { method: 'PUT', body: body ?? {} });
export const patch = (path, body) => api(path, { method: 'PATCH', body: body ?? {} });
export const del = (path, query) => api(path, { method: 'DELETE', query });

// Raw file upload (multipart is not needed: the server reads the body as bytes).
export function upload(path, file, extraHeaders = {}) {
  return api(path, { method: 'POST', body: file, raw: true, headers: { 'x-file-name': encodeURIComponent(file.name), 'content-type': file.type || 'application/octet-stream', ...extraHeaders } });
}

// Downloads go through the browser so the session cookie applies and the file name is kept.
export function download(path, query) {
  const a = document.createElement('a');
  a.href = path + qs(query);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
export const fileUrl = (id, inline = false) => `/api/files/${id}${inline ? '?inline=1' : ''}`;
