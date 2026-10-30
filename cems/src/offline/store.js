// Browser storage for the offline edition: one IndexedDB key-value store holding the database,
// the files the server writes and the session cookie. When IndexedDB is unavailable (some
// browsers restrict pages opened from disk), data lives in memory for the session only.
const NAME = 'cems-offline';
const STORE = 'kv';
let idb = null;
const memory = new Map();

export async function open() {
  try {
    idb = await new Promise((resolve, reject) => {
      const r = indexedDB.open(NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('Storage is in use by another CEMS window'));
      // Some browsers never answer for pages opened from disk.
      setTimeout(() => reject(new Error('Browser storage did not respond')), 10_000);
    });
    // Ask the browser not to evict the data under storage pressure. Not awaited: some browsers
    // ask the user first, and start-up should not wait for the answer.
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    idb = null;
  }
  return Boolean(idb);
}

export const persistent = () => Boolean(idb);

function run(mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const get = (k) => (idb ? run('readonly', (s) => s.get(k)) : Promise.resolve(memory.get(k)));
export const put = (k, v) => (idb ? run('readwrite', (s) => s.put(v, k)) : Promise.resolve(memory.set(k, v)));
export const del = (k) => (idb ? run('readwrite', (s) => s.delete(k)) : Promise.resolve(memory.delete(k)));

// Writes several keys in one transaction, so they are saved together or not at all; a null value
// deletes the key.
export function write(pairs) {
  if (!idb) {
    for (const [k, v] of pairs) (v == null ? memory.delete(k) : memory.set(k, v));
    return Promise.resolve();
  }
  return run('readwrite', (s) => { for (const [k, v] of pairs) (v == null ? s.delete(k) : s.put(v, k)); });
}

export async function entries(prefix) {
  if (!idb) return [...memory.entries()].filter(([k]) => k.startsWith(prefix));
  return new Promise((resolve, reject) => {
    const out = [];
    const tx = idb.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).openCursor(IDBKeyRange.bound(prefix, `${prefix}￿`));
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      out.push([c.key, c.value]);
      c.continue();
    };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
  });
}

export async function clear() {
  memory.clear();
  if (idb) await run('readwrite', (s) => s.clear());
}
