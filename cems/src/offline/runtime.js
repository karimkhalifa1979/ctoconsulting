// The CEMS server running inside the browser. SQLite runs as WebAssembly (sql.js) and the files
// the server writes live in a virtual file system; both are kept in IndexedDB. Requests from the
// web client go to the same request handler the Node server uses, so every rule, permission and
// workflow behaves as it does on the server.
import { Buffer } from 'buffer';
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import sqlWasm from 'sql.js/dist/sql-wasm.wasm?b64';
import requirements from '../../shared/requirements.json';
import { attach, exportBytes } from './shims/sqlite.js';
import * as vfs from './shims/fs.js';
import * as store from './store.js';
import { setRasteriser } from '../../server/lib/reports/charts.mjs';
import { createApp } from '../../server/app.mjs';
import { seed } from '../../server/seed/seed.mjs';

const TEMPLATES = import.meta.glob('../../server/seed/templates/*.docx', { query: '?b64', import: 'default', eager: true });
const ORIGIN = 'https://cems.offline';
const FORMAT = 1;

let app = null;
let cookie = null;
let saveTimer = null;
let saving = Promise.resolve();
let dirty = false;
let ready = false; // nothing is saved until the demo data is complete
const changedFiles = new Map();

// ---------- Persistence ----------
function scheduleSave() {
  dirty = true;
  if (!ready) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 1200);
}

// The database and the files changed with it are written in one transaction.
export function saveNow() {
  clearTimeout(saveTimer);
  if (!dirty || !ready) return saving;
  dirty = false;
  saving = saving.then(async () => {
    if (!ready) return;
    const files = [...changedFiles];
    changedFiles.clear();
    try {
      await store.write([['format', FORMAT], ['db', exportBytes()], ...files.map(([path, bytes]) => [`file:${path}`, bytes])]);
    } catch (e) {
      console.error('Saving the offline database failed', e);
      for (const [path, bytes] of files) if (!changedFiles.has(path)) changedFiles.set(path, bytes);
      scheduleSave();
    }
  });
  return saving;
}

// The database is written when the page is hidden or closed, as well as shortly after changes.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  window.addEventListener('pagehide', () => saveNow());
}

// ---------- Charts: the browser's canvas rasterises the report charts ----------
function rasterise(svg, px) {
  return new Promise((resolve) => {
    const m = /width="([\d.]+)"[^>]*height="([\d.]+)"/.exec(svg);
    const w = m ? Number(m[1]) : px;
    const h = m ? Number(m[2]) : px * 0.6;
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = px;
        c.height = Math.max(1, Math.round((h / w) * px));
        const g = c.getContext('2d');
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(async (b) => resolve(b ? Buffer.from(await b.arrayBuffer()) : null), 'image/png');
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

// ---------- Start-up ----------
export async function boot(onStatus = () => {}) {
  onStatus({ phase: 'Opening this browser’s storage' });
  const persistent = await store.open();
  const SQL = await initSqlJs({ wasmBinary: Buffer.from(sqlWasm, 'base64') });
  const format = await store.get('format');
  const saved = format === FORMAT ? await store.get('db') : null;
  if (!saved && format !== undefined) await store.clear(); // data from an older offline edition
  attach(saved ? new SQL.Database(saved) : new SQL.Database(), scheduleSave);

  // Read-only files the server reads from disk.
  vfs.preload('/app/shared/requirements.json', Buffer.from(JSON.stringify(requirements)));
  for (const [file, b64] of Object.entries(TEMPLATES)) vfs.preload(`/app/server/seed/templates/${file.split('/').pop()}`, Buffer.from(b64, 'base64'));
  // Files written by the server (reports, uploads, logos) live under /data.
  if (saved) for (const [k, v] of await store.entries('file:')) vfs.preload(k.slice(5), v);
  vfs.onChange((path, bytes) => {
    if (!path.startsWith('/data/')) return;
    changedFiles.set(path, bytes);
    scheduleSave();
  });
  cookie = saved ? (await store.get('cookie')) || null : null;

  setRasteriser(rasterise);
  app = createApp({
    dataDir: '/data',
    env: { CEMS_ENV: 'offline', CEMS_AUTH_MODE: 'demo', CEMS_BASE_URL: ORIGIN, CEMS_JOBS: 'true', CEMS_SEED: 'false' },
  });

  let seeded = false;
  if (!app.db.prepare('SELECT COUNT(*) n FROM users').get().n) {
    onStatus({ phase: 'Creating the demo firm', progress: 0 });
    await new Promise((r) => setTimeout(r, 30));
    await seed(app, {
      pdf: false, reports: true, quiet: true,
      onProgress: async (progress, label) => {
        onStatus({ phase: 'Replaying sixteen months of engagement history', progress, label });
        await new Promise((r) => setTimeout(r, 0));
      },
    });
    onStatus({ phase: 'Saving to this browser', progress: 1 });
    ready = true;
    await saveNow();
    seeded = true;
  }
  ready = true;
  app.jobs.start();
  const info = { persistent, seeded, others: false };
  await watchWindows(info);
  return info;
}

// Several windows on the same browser data would overwrite each other's saves, so each window
// announces itself; both the new and the existing windows then show a warning (cems:offline).
async function watchWindows(info) {
  if (typeof BroadcastChannel === 'undefined') return;
  const ch = new BroadcastChannel('cems-offline');
  const seen = () => {
    if (info.others) return;
    info.others = true;
    window.dispatchEvent(new Event('cems:offline'));
  };
  ch.onmessage = (e) => {
    if (e.data === 'hello') ch.postMessage('here');
    seen();
  };
  ch.postMessage('hello');
  await new Promise((r) => setTimeout(r, 250));
}

// ---------- Requests ----------
function request(method, url, headers, body) {
  const on = {};
  return {
    method, url, headers, socket: { remoteAddress: '127.0.0.1' }, connection: { remoteAddress: '127.0.0.1' },
    on(event, cb) {
      on[event] = cb;
      if (event === 'end') queueMicrotask(() => { if (body?.length) on.data?.(body); on.end?.(); });
      return this;
    },
    destroy() {},
  };
}

function response() {
  return {
    statusCode: 200, headers: {}, body: null,
    writeHead(status, headers = {}) {
      this.statusCode = status;
      for (const [k, v] of Object.entries(headers)) this.headers[k.toLowerCase()] = String(v);
      return this;
    },
    setHeader(k, v) { this.headers[k.toLowerCase()] = String(v); },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(body) { this.body = body ?? null; },
  };
}

function keepCookie(header) {
  const [pair, ...attrs] = String(header).split(';');
  const value = pair.slice(pair.indexOf('=') + 1);
  const expired = !value || attrs.some((a) => /^\s*max-age\s*=\s*0\s*$/i.test(a));
  cookie = expired ? null : pair.trim();
  (cookie ? store.put('cookie', cookie) : store.del('cookie')).catch(() => {});
}

// Same contract as fetch() for the web client: returns a Response.
export async function transport(url, init = {}) {
  const u = new URL(url, ORIGIN);
  const headers = {};
  for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = String(v);
  if (cookie) headers.cookie = cookie;
  let body = null;
  if (init.body != null) body = typeof init.body === 'string' ? Buffer.from(init.body) : Buffer.from(await new Response(init.body).arrayBuffer());
  const req = request((init.method || 'GET').toUpperCase(), u.pathname + u.search, headers, body);
  const res = response();
  await app.handle(req, res);
  if (res.headers['set-cookie']) keepCookie(res.headers['set-cookie']);
  const empty = [204, 304].includes(res.statusCode) || res.body == null || res.body === '';
  return new Response(empty ? null : res.body, { status: res.statusCode, headers: res.headers });
}

// ---------- Reset, back-up and restore ----------
export async function reset() {
  clearTimeout(saveTimer);
  ready = false;
  await saving;
  await store.clear();
  location.reload();
}

export async function backup() {
  dirty = true;
  await saveNow();
  const files = {};
  for (const [path, bytes] of vfs.allFiles()) if (path.startsWith('/data/')) files[path] = Buffer.from(bytes).toString('base64');
  return new Blob([JSON.stringify({ app: 'CEMS offline', format: FORMAT, saved_at: new Date().toISOString(), db: Buffer.from(exportBytes()).toString('base64'), files })], { type: 'application/json' });
}

export async function restore(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'CEMS offline' || !data.db) throw new Error('This file is not a CEMS offline back-up.');
  clearTimeout(saveTimer);
  ready = false;
  await saving;
  await store.clear();
  await store.write([['format', FORMAT], ['db', Buffer.from(data.db, 'base64')],
    ...Object.entries(data.files || {}).map(([path, b64]) => [`file:${path}`, Buffer.from(b64, 'base64')])]);
  location.reload();
}
