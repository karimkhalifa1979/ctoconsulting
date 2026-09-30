// Storage backends. Local mode keeps platform state in this browser (IndexedDB) and runs the command
// layer here; server mode sends every command to the Node server, which enforces the same rules.
import { createStore, get, set, del } from 'idb-keyval';
import { execute } from '../core/commands.js';
import { viewFor, query as runQuery } from '../core/view.js';
import { buildSeed } from '../core/seed/index.js';
import { uid } from '../core/util.js';

const BASE = import.meta.env.BASE_URL;
const stateStore = createStore('cto-proposals', 'state');
const fileStore = createStore('cto-proposals-files', 'files');
const SCHEMA = 1;

const safeLocal = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
export { safeLocal };

async function detectServer() {
  try {
    const r = await fetch(`${BASE}api/p/session`, { credentials: 'same-origin' });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.mode === 'server' ? j : null;
  } catch {
    return null;
  }
}

class LocalBackend {
  constructor() {
    this.mode = 'local';
    this.state = null;
    this.userId = safeLocal.get('cto.pp.user');
    this.listeners = new Set();
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cto-proposals') : null;
    this.presence = new Map();
    this.tabId = uid('tab');
    this.saveTimer = null;
    if (this.channel) this.channel.onmessage = (e) => this.onMessage(e.data);
  }

  async init() {
    let s = null;
    try { s = await get('state', stateStore); } catch { s = null; }
    if (!s || s.schema !== SCHEMA) {
      s = buildSeed();
      await this.persist(s, true);
    }
    this.state = s;
    return this;
  }

  async persist(s = this.state, now = false) {
    clearTimeout(this.saveTimer);
    const write = async () => {
      try { await set('state', s, stateStore); } catch (e) { console.warn('Could not save state', e); }
      this.channel?.postMessage({ type: 'state', version: s.version, from: this.tabId });
    };
    if (now) return write();
    return new Promise((resolve) => { this.saveTimer = setTimeout(() => write().then(resolve), 250); });
  }

  async onMessage(msg) {
    if (msg?.from === this.tabId) return;
    if (msg.type === 'state' && msg.version > (this.state?.version || 0)) {
      const s = await get('state', stateStore);
      if (s && s.version > this.state.version) { this.state = s; this.emit(); }
    }
    if (msg.type === 'presence') {
      this.presence.set(msg.tabId, { ...msg, seen: Date.now() });
      this.emit('presence');
    }
  }

  view() { return this.userId && this.state ? viewFor(this.state, this.userId) : null; }

  signIn(userId) { this.userId = userId; safeLocal.set('cto.pp.user', userId); safeLocal.set('cto.pp.signedInAt', new Date().toISOString()); }
  signOut() { this.userId = null; safeLocal.set('cto.pp.user', null); }

  async dispatch(cmd, args) {
    const r = execute(this.state, this.userId, cmd, args);
    if (r.changed) {
      this.state = r.state;
      await this.persist();
    }
    return r.result;
  }

  async system(cmd, args) {
    const r = execute(this.state, 'system', cmd, args);
    if (r.changed) { this.state = r.state; await this.persist(); }
    return r.result;
  }

  async query(name, args) { return runQuery(this.state, this.userId, name, args); }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(kind = 'state') { for (const fn of this.listeners) fn(kind); }
  close() { this.channel?.close(); this.listeners.clear(); }

  heartbeat(where) {
    const msg = { type: 'presence', tabId: this.tabId, userId: this.userId, ...where, at: Date.now() };
    this.presence.set(this.tabId, { ...msg, seen: Date.now() });
    this.channel?.postMessage(msg);
  }

  presenceList() {
    const now = Date.now();
    return [...this.presence.values()].filter((p) => now - p.seen < 45000 && p.userId);
  }

  async putFile(bytes, meta = {}) {
    const id = uid('file');
    await set(id, { bytes, name: meta.name || 'file', type: meta.type || 'application/octet-stream', at: new Date().toISOString(), bidId: meta.bidId || null }, fileStore);
    return id;
  }

  async getFile(id) {
    const f = await get(id, fileStore);
    return f ? { bytes: f.bytes, name: f.name, type: f.type } : null;
  }

  async reset() {
    await del('state', stateStore);
    this.state = buildSeed();
    await this.persist(this.state, true);
    this.emit();
  }

  async exportAll() { return this.state; }

  async importAll(s) {
    if (!s || s.schema !== SCHEMA || !Array.isArray(s.bids)) throw new Error('Not a CTO Consulting proposal platform backup.');
    this.state = s;
    await this.persist(s, true);
    this.emit();
  }
}

class ServerBackend {
  constructor(session) {
    this.mode = 'server';
    this.session = session;
    this.userId = session.userId || null;
    this.cached = null;
    this.listeners = new Set();
    this.presenceData = [];
    this.es = null;
  }

  async init() {
    await this.refresh();
    this.connect();
    return this;
  }

  connect() {
    try {
      this.es?.close();
      this.es = new EventSource(`${BASE}api/p/events`);
      this.es.onmessage = async (e) => {
        const msg = JSON.parse(e.data || '{}');
        if (msg.type === 'version' && msg.version > (this.cached?.version || 0)) { await this.refresh(); this.emit(); }
        if (msg.type === 'presence') { this.presenceData = msg.presence || []; this.emit('presence'); }
      };
    } catch { /* events unavailable */ }
  }

  async api(path, opts = {}) {
    const r = await fetch(`${BASE}api/p/${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `Request failed (${r.status})`); e.status = r.status; throw e; }
    return j;
  }

  async refresh() {
    if (!this.userId) { this.cached = null; return; }
    const j = await this.api('state');
    this.cached = j.view;
  }

  view() { return this.cached; }

  async signIn(userId) {
    const j = await this.api('signin', { method: 'POST', body: JSON.stringify({ userId }) });
    this.userId = j.userId;
    safeLocal.set('cto.pp.signedInAt', new Date().toISOString());
    await this.refresh();
    this.connect();
  }

  async signOut() { await this.api('signout', { method: 'POST', body: '{}' }).catch(() => {}); this.userId = null; this.cached = null; }

  async dispatch(cmd, args) {
    const j = await this.api('cmd', { method: 'POST', body: JSON.stringify({ cmd, args }) });
    if (j.view) this.cached = j.view;
    return j.result;
  }

  async system() { return null; }

  async query(name, args) { return (await this.api(`query/${name}`, { method: 'POST', body: JSON.stringify(args || {}) })).result; }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  close() { this.es?.close(); this.listeners.clear(); }
  emit(kind = 'state') { for (const fn of this.listeners) fn(kind); }

  heartbeat(where) { fetch(`${BASE}api/p/presence`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(where) }).catch(() => {}); }
  presenceList() { return this.presenceData; }

  async putFile(bytes, meta = {}) {
    const r = await fetch(`${BASE}api/p/files?name=${encodeURIComponent(meta.name || 'file')}&type=${encodeURIComponent(meta.type || '')}&bidId=${encodeURIComponent(meta.bidId || '')}`, { method: 'POST', credentials: 'same-origin', body: bytes });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Upload failed');
    return j.id;
  }

  async getFile(id) {
    const r = await fetch(`${BASE}api/p/files/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
    if (!r.ok) return null;
    return { bytes: new Uint8Array(await r.arrayBuffer()), name: decodeURIComponent(r.headers.get('X-File-Name') || 'file'), type: r.headers.get('Content-Type') };
  }

  async reset() { await this.api('reset', { method: 'POST', body: '{}' }); await this.refresh(); this.emit(); }
  async exportAll() { return (await this.api('export')).state; }
  async importAll(s) { await this.api('import', { method: 'POST', body: JSON.stringify({ state: s }) }); await this.refresh(); this.emit(); }
}

export async function createBackend() {
  const session = await detectServer();
  if (session) return new ServerBackend(session).init();
  return new LocalBackend().init();
}
