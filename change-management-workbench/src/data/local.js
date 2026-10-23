// Browser-only mode: the shared domain service runs in the page against an in-memory store that is
// persisted to IndexedDB. Used for the hosted demonstration and for evaluation without a server.
// The client exposes the same calls as the REST client so every screen works in both modes.
import { createStore, entries, setMany, delMany, clear } from 'idb-keyval';
import { ApiError } from './http.js';

const DB = createStore('change-management-workbench', 'store');
const USER_KEY = 'cmw.demoUser';

function toApiError(e) {
  if (e instanceof ApiError) return e;
  const status = e?.status || 500;
  const message = status >= 500 ? `Something went wrong: ${e?.message || e}` : e?.message || String(e);
  return new ApiError(status, message, { details: e?.details, current: e?.current, duplicates: e?.duplicates });
}

async function loadPersisted() {
  let rows = [];
  try { rows = await entries(DB); } catch { return null; }
  if (!rows.length) return null;
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
  return initial.records.length ? initial : null;
}

// Writes are batched so a burst of changes (seeding, imports) becomes one IndexedDB transaction.
function createPersister() {
  const pending = new Map();
  let timer = null;
  let flushing = Promise.resolve();
  const flush = () => {
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
      }
    });
    return flushing;
  };
  const persist = (kind, key, value) => {
    const prefix = { record: 'r', config: 'c', counter: 'n', audit: 'a', blob: 'b' }[kind];
    pending.set(`${prefix}:${key}`, value);
    if (!timer) timer = setTimeout(flush, 250);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  }
  return { persist, flush };
}

export async function createLocalClient({ onProgress } = {}) {
  onProgress?.('Loading the workbench');
  const [{ createService }, { createMemoryDriver }, { buildOpenApi }] = await Promise.all([
    import('../../shared/service/index.js'),
    import('../../shared/memoryDriver.js'),
    import('../../server/openapi.mjs'),
  ]);
  const persister = createPersister();
  const initial = await loadPersisted();
  const driver = createMemoryDriver({ initial, persist: persister.persist });
  const service = createService({ driver, env: { mode: 'standalone', aiAvailable: false, emailAvailable: false, ssoAvailable: false, log: (level, msg, detail) => console[level === 'error' ? 'error' : 'log'](msg, detail ?? '') } });
  if (!initial) {
    onProgress?.('Creating the demonstration data');
    const { seedDemo } = await import('../../shared/seed/demo.js');
    await seedDemo(service, {});
    await persister.flush();
  } else {
    // Background jobs the server would run: lock completed engagements (RUL-10).
    try { await service.ops.lockDueEngagements(service.SYSTEM, {}); } catch { /* not critical */ }
  }

  const actor = async () => {
    const id = localStorage.getItem(USER_KEY);
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

  const client = {
    mode: 'standalone',
    service,
    health: async () => ({ status: 'ok', mode: 'standalone', storage: await driver.stats() }),
    authOptions: () => open(async () => {
      const users = (await driver.list('user')).filter((u) => u.status === 'active' && u.demo);
      const { roleLabel } = await import('../../shared/access.js');
      return { sso: false, local: false, demo: true, standalone: true, demoUsers: users.map((u) => ({ id: u.id, name: u.name, roles: u.roles.map(roleLabel), title: u.demoTitle || '' })), organisation: (await service.getConfig()).settings.organisationName };
    }),
    session: () => call(async (u) => ({ user: service.publicUser(u) })),
    login: async () => { throw new ApiError(400, 'This browser-only demonstration has no passwords. Choose a demonstration user instead.'); },
    demoLogin: (userId) => open(async () => {
      const u = await driver.get('user', userId);
      if (!u || !u.demo) throw new ApiError(404, 'Unknown demonstration user.');
      localStorage.setItem(USER_KEY, u.id);
      await service.audit(u, { action: 'login', type: 'session', summary: 'Signed in (browser-only demonstration)' });
      return { user: service.publicUser(u) };
    }),
    logout: async () => { localStorage.removeItem(USER_KEY); return { ok: true }; },
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
    ai: async () => { throw new ApiError(503, 'AI assistance needs the server with an Anthropic API key configured. It is not available in the browser-only demonstration.'); },
    publicSurvey: (token) => open(() => service.publicSurvey(token)),
    submitSurvey: (token, body) => open(() => service.submitSurveyResponse(token, body)),
    openapi: async () => buildOpenApi(service, { version: '1.0.0' }),
    setPassword: async () => { throw new ApiError(400, 'Passwords are managed by the server. The browser-only demonstration signs in without passwords.'); },
    createApiClient: async () => { throw new ApiError(400, 'API clients need the server.'); },
    createWebhook: async () => { throw new ApiError(400, 'Webhooks need the server.'); },
    upload: ({ recordType, recordId, file }) => call(async (u) => service.runOp(u, 'uploadAttachment', { recordType, recordId, filename: file.name, mime: file.type, data: new Uint8Array(await file.arrayBuffer()) })),
    fileBlob: (blobId) => call(async (u) => {
      const b = await service.getFile(u, blobId);
      return new Blob([b.bytes], { type: b.meta?.mime || 'application/octet-stream' });
    }),
    fileUrl: () => null,
    // Demonstration controls.
    async resetDemo() {
      await persister.flush();
      await clear(DB);
      localStorage.removeItem(USER_KEY);
      location.reload();
    },
    async exportStore() {
      return driver.dump();
    },
  };
  return client;
}
