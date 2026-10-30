// REST client for server mode (INT-007). Every call returns parsed JSON or throws an ApiError that
// carries the HTTP status, server message and any conflict, duplicate or validation details.
export class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

async function request(method, url, body, { raw = false, headers = {} } = {}) {
  const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json', 'X-CMW': '1', ...headers } };
  if (body !== undefined) {
    if (body instanceof Blob || body instanceof ArrayBuffer || body instanceof Uint8Array) init.body = body;
    else {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = 'application/json';
    }
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'The server could not be reached. Check your connection and try again.');
  }
  if (raw && res.ok) return res;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, { details: data?.details, current: data?.current, duplicates: data?.duplicates });
  return data;
}

const qs = (params = {}) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export function createHttpClient(base = '') {
  const api = (p) => `${base}/api${p}`;
  return {
    mode: 'server',
    health: () => request('GET', api('/health')),
    authOptions: () => request('GET', api('/auth/options')),
    session: () => request('GET', api('/auth/session')),
    login: (email, password) => request('POST', api('/auth/login'), { email, password }),
    demoLogin: (userId) => request('POST', api('/auth/demo'), { userId }),
    logout: () => request('POST', api('/auth/logout'), {}),
    ssoUrl: (returnTo) => api(`/auth/oidc/login${qs({ returnTo })}`),
    bootstrap: () => request('GET', api('/v1/bootstrap')),
    loadInitiative: (id) => request('GET', api(`/v1/initiatives/${encodeURIComponent(id)}/data`)),
    changes: (id, since) => request('GET', api(`/v1/initiatives/${encodeURIComponent(id)}/changes${qs({ since })}`)),
    list: (type, params = {}) => request('GET', api(`/v1/records/${type}${qs(params)}`)),
    get: (type, id) => request('GET', api(`/v1/records/${type}/${encodeURIComponent(id)}`)),
    create: (type, data, opts = {}) => request('POST', api(`/v1/records/${type}`), { data, allowDuplicate: !!opts.allowDuplicate, reason: opts.reason }),
    update: (type, id, data, opts = {}) => request('PATCH', api(`/v1/records/${type}/${encodeURIComponent(id)}`), { data, version: opts.version, reason: opts.reason, clearQuickCapture: opts.clearQuickCapture }),
    remove: (type, id, opts = {}) => request('DELETE', api(`/v1/records/${type}/${encodeURIComponent(id)}${qs({ reason: opts.reason })}`)),
    bulkUpdate: (type, ids, patch, opts = {}) => request('POST', api(`/v1/records/${type}/bulk`), { ids, patch, reason: opts.reason }),
    op: (name, payload = {}) => request('POST', api(`/v1/ops/${name}`), payload),
    search: (q) => request('GET', api(`/v1/search${qs({ q })}`)),
    reporting: (dataset, params = {}) => request('GET', api(`/v1/reporting/${dataset}${qs(params)}`)),
    ai: (feature, body) => request('POST', api(`/v1/ai/${feature}`), body),
    publicSurvey: (token) => request('GET', api(`/public/surveys/${encodeURIComponent(token)}`)),
    submitSurvey: (token, body) => request('POST', api(`/public/surveys/${encodeURIComponent(token)}/responses`), body),
    openapi: () => request('GET', api('/v1/openapi.json')),
    setPassword: (userId, password) => request('POST', api(`/v1/users/${encodeURIComponent(userId)}/password`), { password }),
    createApiClient: (body) => request('POST', api('/v1/api-clients'), body),
    createWebhook: (body) => request('POST', api('/v1/webhooks'), body),
    async upload({ recordType, recordId, file }) {
      return request('POST', api(`/v1/files${qs({ recordType, recordId, filename: file.name })}`), file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } });
    },
    async fileBlob(blobId) {
      const res = await request('GET', api(`/v1/files/${encodeURIComponent(blobId)}`), undefined, { raw: true });
      return res.blob();
    },
    fileUrl: (blobId, { inline = false } = {}) => api(`/v1/files/${encodeURIComponent(blobId)}${inline ? '?inline=1' : ''}`),
  };
}
