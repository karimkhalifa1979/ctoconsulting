// API client: same-origin JSON calls with the session's CSRF token on every state-changing request.
// The offline edition swaps the transport for the server running inside the browser.
let csrf = null;
export const setCsrf = (token) => { csrf = token; };

let transport = (url, init) => fetch(url, init);
let offline = null;
export function setTransport(fn, info) {
  transport = fn;
  offline = info || null;
}
// Details of the offline edition (persistent storage, other windows), or null on a server.
export const offlineInfo = () => offline;

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
  const res = await transport(path + qs(query), init);
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

const fileNameOf = (res) => {
  const cd = res.headers.get('content-disposition') || '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return star ? decodeURIComponent(star[1]) : plain ? plain[1] : 'download';
};

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// A file from the API as a blob (offline edition: there is no URL the browser can load).
export async function apiBlob(path) {
  const res = await transport(path, { method: 'GET' });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  return { blob: await res.blob(), name: fileNameOf(res) };
}

// Opens or saves an API file. On a server the browser fetches it (the session cookie applies and
// the file name is kept); offline the file is produced in the page and handed to the browser.
export async function openApiFile(path, { newTab = false } = {}) {
  if (!offline) {
    const a = document.createElement('a');
    a.href = path;
    a.rel = 'noopener';
    if (newTab) a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  try {
    const { blob, name } = await apiBlob(path);
    // A browser that blocks the new tab gets the file as a download instead.
    const tab = newTab ? window.open(URL.createObjectURL(blob), '_blank') : null;
    if (tab) tab.opener = null;
    else saveBlob(blob, name);
  } catch (e) {
    window.dispatchEvent(new CustomEvent('cems:error', { detail: e.message }));
  }
}

export function download(path, query) {
  return openApiFile(path + qs(query));
}
export const fileUrl = (id, inline = false) => `/api/files/${id}${inline ? '?inline=1' : ''}`;
