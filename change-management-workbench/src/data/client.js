// Chooses the data mode. With a server (GET /api/health answers) the app uses the REST API; on static
// hosting it runs the browser-only demonstration. `?mode=standalone` forces the browser-only mode.
import { createHttpClient } from './http.js';

export async function createClient({ onProgress } = {}) {
  const forced = new URLSearchParams(location.search).get('mode');
  if (forced !== 'standalone') {
    const http = createHttpClient('');
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 4000);
      const res = await fetch('./api/health', { signal: ctl.signal, headers: { Accept: 'application/json' } });
      clearTimeout(t);
      const type = res.headers.get('content-type') || '';
      if (res.ok && type.includes('json')) {
        const health = await res.json();
        if (health?.status === 'ok') return Object.assign(http, { serverInfo: health });
      }
    } catch { /* no server: fall through to the browser-only mode */ }
  }
  const { createLocalClient } = await import('./local.js');
  return createLocalClient({ onProgress });
}

// Downloads a stored file in either mode.
export async function downloadFile(api, blobId, filename) {
  const url = api.fileUrl(blobId);
  if (url) {
    const a = document.createElement('a');
    a.href = url;
    if (filename) a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const blob = await api.fileBlob(blobId);
  saveBlob(blob, filename || 'download');
}

export function saveBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30000);
}

export async function openFileInline(api, blobId) {
  const url = api.fileUrl(blobId, { inline: true });
  if (url) return window.open(url, '_blank', 'noopener');
  const blob = await api.fileBlob(blobId);
  const href = URL.createObjectURL(blob);
  window.open(href, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(href), 120000);
}
