// Browser-only mode: the shared domain service runs in the page against an in-memory store that is
// persisted to IndexedDB. Used for the hosted demonstration and for the offline workbench, a single HTML
// file that runs from disk without a server or a network. The client exposes the same calls as the REST
// client so every screen works in both modes.
//
// The store holds either the demonstration data or an organisation's own workbench. It can be backed up
// to a file and restored, and only one tab at a time works on it, so that two copies never overwrite each
// other's changes or the audit trail.
import { createStore, entries, setMany, delMany, promisifyRequest } from 'idb-keyval';
import { ApiError } from './http.js';

const DB_NAME = 'change-management-workbench';
const USER_KEY = 'cmw.demoUser';
const BACKUP_FORMAT = 'cmw-backup';
const PREFIX = { record: 'r', config: 'c', counter: 'n', audit: 'a', blob: 'b' };
const OFFLINE = typeof location !== 'undefined' && (location.protocol === 'file:' || import.meta.env?.MODE === 'offline');

// Some browsers block storage for files opened from disk. The workbench then runs in memory, says so,
// and backups keep the work.
let DB = null;
try { if (typeof indexedDB !== 'undefined') DB = createStore(DB_NAME, 'store'); } catch { DB = null; }

const memoryPrefs = new Map();
const prefs = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return memoryPrefs.get(k) ?? null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { memoryPrefs.set(k, v); } },
  remove: (k) => { try { localStorage.removeItem(k); } catch { memoryPrefs.delete(k); } },
};

function toApiError(e) {
  if (e instanceof ApiError) return e;
  const status = e?.status || 500;
  const message = status >= 500 ? `Something went wrong: ${e?.message || e}` : e?.message || String(e);
  return new ApiError(status, message, { details: e?.details, current: e?.current, duplicates: e?.duplicates });
}

async function loadPersisted() {
  if (!DB) return { available: false, initial: null };
  let rows;
  try { rows = await entries(DB); } catch { return { available: false, initial: null }; }
  if (!rows.length) return { available: true, initial: null };
  const initial = { records: [], config: {}, counters: {}, audit: [], blobs: {}, seq: 0 };
  for (const [key, value] of rows) {
    const k = String(key);
    const i = k.indexOf(':');
    const kind = k.slice(0, i);
    const id = k.slice(i + 1);
    if (kind === 'r') initial.records.push(value);
    else if (kind === 'c') initial.config[id] = value;
    else if (kind === 'n') initial.counters[id] = value;
    else if (kind === 'a') initial.audit.push(value);
    else if (kind === 'b') initial.blobs[id] = value;
  }
  initial.audit.sort((a, b) => a.seq - b.seq);
  initial.seq = initial.records.reduce((m, r) => Math.max(m, r.seq || 0), 0);
  return { available: true, initial: initial.records.length ? initial : null };
}

// Replaces everything in browser storage in one transaction, so a restore is never left half done.
async function replaceAll(store) {
  const all = [];
  for (const r of store.records) all.push([`r:${r.id}`, r]);
  for (const [k, v] of Object.entries(store.config || {})) all.push([`c:${k}`, v]);
  for (const [k, v] of Object.entries(store.counters || {})) all.push([`n:${k}`, v]);
  for (const a of store.audit || []) all.push([`a:${a.seq}`, a]);
  for (const [k, v] of Object.entries(store.blobs || {})) all.push([`b:${k}`, v]);
  await DB('readwrite', (os) => {
    os.clear();
    for (const [k, v] of all) os.put(v, k);
    return promisifyRequest(os.transaction);
  });
}

// Writes are batched so a burst of changes (seeding, imports) becomes one IndexedDB transaction.
function createPersister(onError) {
  const pending = new Map();
  let timer = null;
  let flushing = Promise.resolve();
  let stopped = false;
  const flush = () => {
    clearTimeout(timer);
    timer = null;
    if (!pending.size) return flushing;
    const batch = [...pending.entries()];
    pending.clear();
    const sets = batch.filter(([, v]) => v !== undefined);
    const dels = batch.filter(([, v]) => v === undefined).map(([k]) => k);
    flushing = flushing.then(async () => {
      try {
        if (sets.length) await setMany(sets, DB);
        if (dels.length) await delMany(dels, DB);
      } catch (err) {
        console.warn('Could not save to browser storage', err);
        onError(err);
      }
    });
    return flushing;
  };
  return {
    persist(kind, key, value) {
      if (stopped) return;
      pending.set(`${PREFIX[kind]}:${key}`, value);
      if (!timer) timer = setTimeout(flush, 250);
    },
    flush,
    // Saves what is pending, then stops writing (another tab takes over, or the store is replaced).
    async stop() { const done = flush(); stopped = true; await done; },
  };
}

// Base64 for stored files in backups.
function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const stamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}${p(d.getMinutes())}`;
};

// One tab at a time: a new tab asks whether another one has the workbench open, and can take it over.
function createTabGuard() {
  let channel = null;
  try { if (DB && typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel('cmw-workbench'); } catch { channel = null; }
  const me = Math.random().toString(36).slice(2);
  let active = false;
  let onTakeover = null;
  const ask = (type, reply, wait) => new Promise((resolve) => {
    if (!channel) { resolve(false); return; }
    const onMsg = (e) => { if (e.data?.type === reply && e.data.to === me) { done(); resolve(true); } };
    const done = () => { channel.removeEventListener('message', onMsg); clearTimeout(t); };
    channel.addEventListener('message', onMsg);
    channel.postMessage({ type, from: me });
    const t = setTimeout(() => { done(); resolve(false); }, wait);
  });
  channel?.addEventListener('message', async (e) => {
    const m = e.data || {};
    if (!active || m.from === me) return;
    if (m.type === 'hello') channel.postMessage({ type: 'here', from: me, to: m.from });
    if (m.type === 'takeover') {
      active = false;
      await onTakeover?.();
      channel.postMessage({ type: 'released', from: me, to: m.from });
    }
  });
  return {
    otherTabOpen: () => ask('hello', 'here', 400),
    takeOver: () => ask('takeover', 'released', 3000),
    activate(fn) { active = true; onTakeover = fn; },
  };
}

export async function createLocalClient({ onProgress, onBusy, onReset } = {}) {
  onProgress?.('Loading the workbench');
  const [{ createService }, { createMemoryDriver }, { buildOpenApi }, { createJobs }] = await Promise.all([
    import('../../shared/service/index.js'),
    import('../../shared/memoryDriver.js'),
    import('../../server/openapi.mjs'),
    import('../../shared/jobs.js'),
  ]);
  const log = (level, msg, detail) => console[level === 'error' ? 'error' : 'log'](msg, detail ?? '');

  // Status the screens show: where the data is kept, which workbench it is, and when it was backed up.
  const status = { persistent: false, offline: OFFLINE, workspace: 'demo', organisation: '', lastBackupAt: null, unsaved: false, saveError: null, released: false };
  const listeners = new Set();
  const emit = (patch) => { Object.assign(status, patch); for (const fn of listeners) fn({ ...status }); };

  const guard = createTabGuard();
  if (await guard.otherTabOpen()) {
    await onBusy?.();
    await guard.takeOver();
  }
  onProgress?.('Loading the workbench');
  const { available, initial } = await loadPersisted();
  status.persistent = available;

  let persister = null;
  let driver;
  let service;
  let jobs;
  const record = (kind, key, value) => {
    if (persister) persister.persist(kind, key, value);
    else if (!status.persistent && !status.unsaved && !(kind === 'config' && key === 'workspace')) emit({ unsaved: true });
  };
  const startPersisting = () => { persister = status.persistent ? createPersister((err) => emit({ saveError: err?.message || String(err) })) : null; };
  const build = (data) => {
    driver = createMemoryDriver({ initial: data, persist: record });
    service = createService({ driver, env: { mode: 'standalone', offline: OFFLINE, aiAvailable: false, emailAvailable: false, ssoAvailable: false, log } });
    jobs = createJobs(service, { log });
  };
  const describe = async () => {
    const ws = (await driver.getConfig('workspace')) || {};
    const kind = ws.kind || ((await driver.list('user')).some((u) => u.demo) ? 'demo' : 'own');
    emit({ workspace: kind, organisation: (await service.getConfig()).settings.organisationName, lastBackupAt: ws.lastBackupAt || null });
  };
  // Builds a new store (demonstration data, a restored backup or an empty workbench), saves it in one
  // step and restarts the screens on it.
  const replace = async (data, fill) => {
    await persister?.stop();
    persister = null;
    build(data);
    if (fill) await fill();
    if (status.persistent) await replaceAll(await driver.dump({ withBlobs: true }));
    startPersisting();
    emit({ unsaved: !status.persistent && !data, saveError: null });
    await describe();
  };
  const seedDemoData = async () => {
    const { seedDemo } = await import('../../shared/seed/demo.js');
    await seedDemo(service, {});
    await driver.setConfig('workspace', { kind: 'demo', createdAt: new Date().toISOString() });
  };

  build(initial);
  if (!initial) {
    onProgress?.('Creating the demonstration data');
    await replace(null, seedDemoData);
    emit({ unsaved: false });
  } else {
    startPersisting();
    await describe();
  }

  // Background jobs the server would run, while the workbench is open: scheduled generation, engagement
  // locking (RUL-10), cadence and measure alerts, and survey opening and closing.
  // The first run waits until the page is idle, as it can generate a scheduled document.
  const tick = () => { if (!status.released) jobs.tick(); };
  setTimeout(() => (typeof requestIdleCallback === 'function' ? requestIdleCallback(tick, { timeout: 10000 }) : tick()), 10000);
  setInterval(tick, 60000);
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => persister?.flush());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persister?.flush(); });
    // Without browser storage, leaving the page loses an own workbench's unsaved changes: ask first.
    window.addEventListener('beforeunload', (e) => {
      if (!status.persistent && status.unsaved && status.workspace === 'own') { e.preventDefault(); e.returnValue = ''; }
    });
  }
  guard.activate(async () => { await persister?.stop(); persister = null; emit({ released: true }); });

  const actor = async () => {
    const id = prefs.get(USER_KEY);
    const u = id ? await driver.get('user', id) : null;
    if (!u || u.status !== 'active') throw new ApiError(401, 'Choose a demonstration user to continue.');
    return u;
  };
  const call = async (fn) => {
    try {
      return await fn(await actor());
    } catch (e) {
      throw toApiError(e);
    }
  };
  const open = async (fn) => {
    try { return await fn(); } catch (e) { throw toApiError(e); }
  };
  const canSignIn = (u) => u.status === 'active' && (u.demo || status.workspace === 'own');
  const restart = () => onReset?.();
  const keepStorage = () => { try { navigator.storage?.persist?.(); } catch { /* not supported */ } };

  const client = {
    mode: 'standalone',
    offline: OFFLINE,
    get service() { return service; },
    health: async () => ({ status: 'ok', mode: 'standalone', storage: await driver.stats() }),
    authOptions: () => open(async () => {
      const users = (await driver.list('user')).filter(canSignIn);
      const { roleLabel } = await import('../../shared/access.js');
      return {
        sso: false, local: false, demo: true, standalone: true, offline: OFFLINE, workspace: status.workspace, persistent: status.persistent,
        demoUsers: users.map((u) => ({ id: u.id, name: u.name, roles: u.roles.map(roleLabel), title: u.demoTitle || '' })),
        organisation: (await service.getConfig()).settings.organisationName,
      };
    }),
    session: () => call(async (u) => ({ user: service.publicUser(u) })),
    login: async () => { throw new ApiError(400, 'This browser-only workbench has no passwords. Choose your name instead.'); },
    demoLogin: (userId) => open(async () => {
      const u = await driver.get('user', userId);
      if (!u || !canSignIn(u)) throw new ApiError(404, 'Unknown user.');
      prefs.set(USER_KEY, u.id);
      await service.audit(u, { action: 'login', type: 'session', summary: status.workspace === 'own' ? 'Signed in (offline workbench)' : 'Signed in (browser-only demonstration)' });
      return { user: service.publicUser(u) };
    }),
    logout: async () => { prefs.remove(USER_KEY); return { ok: true }; },
    ssoUrl: () => null,
    bootstrap: () => call((u) => service.bootstrap(u)),
    loadInitiative: (id) => call((u) => service.loadInitiative(u, id)),
    changes: (id, since) => call((u) => service.changes(u, id, since)),
    list: (type, params = {}) => call((u) => service.list(u, type, params)),
    get: (type, id) => call((u) => service.get(u, type, id)),
    create: (type, data, opts = {}) => call((u) => service.create(u, type, data, { allowDuplicate: !!opts.allowDuplicate, reason: opts.reason, external: true })),
    update: (type, id, data, opts = {}) => call((u) => service.update(u, type, id, data, { version: opts.version, reason: opts.reason, clearQuickCapture: opts.clearQuickCapture, external: true })),
    remove: (type, id, opts = {}) => call((u) => service.remove(u, type, id, { reason: opts.reason, external: true })),
    bulkUpdate: (type, ids, patch, opts = {}) => call((u) => service.bulkUpdate(u, type, ids, patch, { reason: opts.reason, external: true })),
    op: (name, payload = {}) => call((u) => {
      if (name.startsWith('_') || service.opMeta[name]?.internal) throw new ApiError(404, 'Unknown operation');
      return service.runOp(u, name, payload);
    }),
    search: (q) => call((u) => service.search(u, q)),
    reporting: (name, params = {}) => call((u) => service.reportingFeed(u, name, params)),
    ai: async () => { throw new ApiError(503, 'AI assistance needs the server with an Anthropic API key configured. It is not available in the browser-only workbench.'); },
    publicSurvey: (token) => open(() => service.publicSurvey(token)),
    submitSurvey: (token, body) => open(() => service.submitSurveyResponse(token, body)),
    openapi: async () => buildOpenApi(service, { version: '1.0.0' }),
    setPassword: async () => { throw new ApiError(400, 'Passwords are managed by the server. The browser-only workbench signs in without passwords.'); },
    createApiClient: async () => { throw new ApiError(400, 'API clients need the server.'); },
    createWebhook: async () => { throw new ApiError(400, 'Webhooks need the server.'); },
    upload: ({ recordType, recordId, file }) => call(async (u) => service.runOp(u, 'uploadAttachment', { recordType, recordId, filename: file.name, mime: file.type, data: new Uint8Array(await file.arrayBuffer()) })),
    fileBlob: (blobId) => call(async (u) => {
      const b = await service.getFile(u, blobId);
      return new Blob([b.bytes], { type: b.meta?.mime || 'application/octet-stream' });
    }),
    fileUrl: () => null,

    // --- The browser-only workbench's own data ------------------------------------------------------
    status: () => ({ ...status }),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // A full backup: every record, the configuration, the audit trail and stored files. Administrators and
    // change management leads can take one, and each backup is recorded in the audit trail.
    backup: () => call(async (u) => {
      if (!u.roles?.some((r) => r === 'admin' || r === 'changeLead')) throw new ApiError(403, 'Administrators and change management leads can back up the workbench.');
      const createdAt = new Date().toISOString();
      await driver.setConfig('workspace', { ...((await driver.getConfig('workspace')) || { kind: status.workspace }), lastBackupAt: createdAt });
      await service.audit(u, { action: 'export', type: 'workspace', summary: 'Downloaded a full backup of the workbench' });
      const store = await driver.dump({ withBlobs: true });
      const blobs = Object.fromEntries(Object.entries(store.blobs || {}).map(([k, v]) => [k, { meta: v.meta, data: toBase64(v.bytes) }]));
      const payload = { format: BACKUP_FORMAT, formatVersion: 1, createdAt, organisation: status.organisation, workspace: status.workspace, store: { ...store, blobs } };
      emit({ lastBackupAt: createdAt, unsaved: false });
      return { blob: new Blob([JSON.stringify(payload)], { type: 'application/json' }), filename: `Change Management Workbench backup ${stamp()}.json` };
    }),
    // Reads a backup file without changing anything, so the screen can say what it holds.
    readBackup: async (file) => {
      let data;
      try { data = JSON.parse(await file.text()); } catch { throw new ApiError(400, 'This file is not a workbench backup.'); }
      if (data?.format !== BACKUP_FORMAT || !Array.isArray(data.store?.records)) throw new ApiError(400, 'This file is not a workbench backup.');
      return { data, organisation: data.organisation || '', createdAt: data.createdAt, records: data.store.records.length, workspace: data.workspace };
    },
    // Replaces everything in this browser with a backup, then returns to the sign-in screen.
    restoreBackup: (data) => open(async () => {
      const s = data.store;
      const store = { records: s.records, config: s.config || {}, counters: s.counters || {}, audit: s.audit || [], seq: s.seq || 0, blobs: Object.fromEntries(Object.entries(s.blobs || {}).map(([k, v]) => [k, { meta: v.meta, bytes: fromBase64(v.data) }])) };
      await replace(store, async () => {
        await service.audit(service.SYSTEM, { action: 'import', type: 'workspace', summary: `Restored from a backup taken ${data.createdAt || 'at an unknown time'}` });
      });
      emit({ unsaved: false });
      prefs.remove(USER_KEY);
      keepStorage();
      restart();
    }),
    // Starts an empty workbench for the organisation, with the person as administrator and change
    // management lead, and signs them in.
    startOwn: ({ organisation, name, email, timeZone = 'Australia/Sydney' }) => open(async () => {
      if (!String(organisation || '').trim() || !String(name || '').trim() || !String(email || '').trim()) throw new ApiError(422, 'Enter the organisation, your name and your email address.');
      let userId;
      await replace(null, async () => {
        await driver.setConfig('settings', { organisationName: organisation.trim(), timeZone });
        await driver.setConfig('workspace', { kind: 'own', createdAt: new Date().toISOString() });
        service.invalidateConfig();
        const u = await service.create(service.SYSTEM, 'user', { name: name.trim(), email: email.trim().toLowerCase(), roles: ['changeLead', 'admin'], status: 'active', authProvider: 'local', timeZone }, { system: true, raw: true });
        await service.audit(u, { action: 'create', type: 'workspace', summary: `Started the workbench for ${organisation.trim()}` });
        userId = u.id;
      });
      prefs.set(USER_KEY, userId);
      keepStorage();
      restart();
    }),
    // Replaces everything in this browser with the demonstration data.
    loadDemo: () => open(async () => {
      await replace(null, seedDemoData);
      emit({ unsaved: false });
      prefs.remove(USER_KEY);
      restart();
    }),
    async resetDemo() { return client.loadDemo(); },
    // Takes the workbench back from another tab, then reloads it from storage.
    async reclaim() {
      await guard.takeOver();
      location.reload();
    },
  };
  return client;
}
