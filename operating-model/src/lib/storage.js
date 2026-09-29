// Browser persistence: IndexedDB where available, then localStorage, then memory
// (e.g. private windows or sandboxed previews where storage is blocked).
import { get, set, del } from 'idb-keyval';

const mem = new Map();
let mode = null;

async function detect() {
  if (mode) return mode;
  try {
    await set('omat.probe', 1);
    if ((await get('omat.probe')) === 1) return (mode = 'idb');
  } catch { /* IndexedDB unavailable */ }
  try {
    localStorage.setItem('omat.probe', '1');
    localStorage.removeItem('omat.probe');
    return (mode = 'local');
  } catch { /* localStorage unavailable */ }
  return (mode = 'memory');
}

export async function load(key) {
  const m = await detect();
  try {
    if (m === 'idb') return await get(key);
    if (m === 'local') {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : undefined;
    }
  } catch { /* fall through */ }
  return mem.get(key);
}

export async function save(key, value) {
  const m = await detect();
  try {
    if (m === 'idb') return await set(key, value);
    if (m === 'local') return localStorage.setItem(key, JSON.stringify(value));
  } catch { /* fall through */ }
  mem.set(key, value);
}

export async function remove(key) {
  const m = await detect();
  try {
    if (m === 'idb') return await del(key);
    if (m === 'local') return localStorage.removeItem(key);
  } catch { /* fall through */ }
  mem.delete(key);
}

export const storageMode = () => mode;

export const prefs = {
  get: (k, d = null) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* unavailable */ } },
};
