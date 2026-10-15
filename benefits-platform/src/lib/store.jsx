// Application state. Each workspace (one organisation) is a single document persisted in the
// browser's IndexedDB; every change is recorded in an audit trail (HIS-01) with before/after values
// for field edits. Rapid edits to the same field are coalesced into one audit event.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { get, set, del } from 'idb-keyval';
import { demoWorkspace, blankWorkspace } from './seed.js';
import { setCurrency, uid } from './util.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);
const LIST_KEY = 'brp.workspaces';
const wsKey = (id) => `brp.ws:${id}`;
const safeLocal = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
// IndexedDB can be unavailable (private windows, sandboxed previews, some browsers when the app
// is opened as a local file); fall back to memory and tell the user so they can keep a backup.
const memory = new Map();
let onVolatile = null;
const volatile = () => onVolatile?.();
async function load(key) { try { return await get(key); } catch { volatile(); return memory.get(key); } }
async function save(key, value) { try { await set(key, value); } catch { volatile(); memory.set(key, value); } }
async function remove(key) { try { await del(key); } catch { volatile(); memory.delete(key); } }

const COALESCE_MS = 90_000;
const brief = (v) => {
  if (v === undefined) return undefined;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > 300 ? `${s.slice(0, 300)}…` : s;
};

export function AppProvider({ children }) {
  const [list, setList] = useState(null);
  const [ws, setWs] = useState(null);
  const [error, setError] = useState(null);
  const [storageOk, setStorageOk] = useState(true);
  const saveTimer = useRef(null);
  const latest = useRef(null);

  useEffect(() => {
    onVolatile = () => setStorageOk(false);
    (async () => {
      try {
        let l = (await load(LIST_KEY)) || [];
        if (!l.length) {
          const demo = demoWorkspace();
          await save(wsKey(demo.id), demo);
          l = [{ id: demo.id, name: demo.name, kind: demo.kind }];
          await save(LIST_KEY, l);
        }
        const current = safeLocal.get('brp.current');
        const id = l.some((w) => w.id === current) ? current : l[0].id;
        let w = await load(wsKey(id));
        if (!w) { w = demoWorkspace(); await save(wsKey(w.id), w); }
        setCurrency(w.settings?.currency);
        setList(l); setWs(w);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  // Debounced persistence.
  useEffect(() => {
    if (!ws) return;
    latest.current = ws;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(wsKey(ws.id), latest.current), 350);
  }, [ws]);
  useEffect(() => {
    const flush = () => { if (latest.current) save(wsKey(latest.current.id), latest.current); };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  // Generic mutation: fn receives a deep copy to change in place.
  const mutate = useCallback((summary, fn, meta = {}) => {
    setWs((prev) => {
      const next = structuredClone(prev);
      const res = fn(next);
      const actor = next.currentUser || 'system';
      const now = new Date().toISOString();
      const last = next.audit[next.audit.length - 1];
      const key = `${meta.object || ''}|${meta.objectId || ''}|${meta.field || summary}`;
      if (last && last.actor === actor && last.key === key && Date.now() - Date.parse(last.ts) < COALESCE_MS) {
        last.ts = now;
        if (meta.after !== undefined) last.after = brief(meta.after);
      } else {
        next.audit.push({ id: uid('au'), ts: now, actor, action: meta.action || 'update', object: meta.object || 'workspace', objectId: meta.objectId || null, programId: meta.programId || null, summary, key, before: brief(meta.before), after: brief(meta.after) });
        if (next.audit.length > 5000) next.audit.splice(0, next.audit.length - 5000);
      }
      if (res && res.__abort) return prev;
      return next;
    });
  }, []);

  const updateProgram = useCallback((id, fn, summary = 'Program updated', meta = {}) => {
    mutate(summary, (d) => { const p = d.programs.find((x) => x.id === id); if (p) fn(p, d); }, { object: 'program', objectId: id, programId: id, ...meta });
  }, [mutate]);

  // Field patch with before/after recorded.
  const patchProgram = useCallback((id, patch, label) => {
    const p = latest.current?.programs.find((x) => x.id === id);
    const field = Object.keys(patch).join(', ');
    mutate(label || `Changed ${field}`, (d) => { Object.assign(d.programs.find((x) => x.id === id), patch); }, {
      object: 'program', objectId: id, programId: id, field, before: p ? Object.fromEntries(Object.keys(patch).map((k) => [k, p[k]])) : undefined, after: patch,
    });
  }, [mutate]);

  const switchWorkspace = useCallback(async (id) => {
    if (latest.current) await save(wsKey(latest.current.id), latest.current);
    const w = await load(wsKey(id));
    if (!w) return;
    setCurrency(w.settings?.currency);
    safeLocal.set('brp.current', id);
    setWs(w);
  }, []);

  const addWorkspace = useCallback(async (w) => {
    await save(wsKey(w.id), w);
    const l = [...(list || []).filter((x) => x.id !== w.id), { id: w.id, name: w.name, kind: w.kind }];
    await save(LIST_KEY, l);
    setList(l);
    await switchWorkspace(w.id);
  }, [list, switchWorkspace]);

  const createBlank = useCallback((name) => addWorkspace(blankWorkspace(name)), [addWorkspace]);
  const resetDemo = useCallback(() => addWorkspace(demoWorkspace()), [addWorkspace]);

  const deleteWorkspace = useCallback(async (id) => {
    await remove(wsKey(id));
    let l = (list || []).filter((x) => x.id !== id);
    if (!l.length) { const d = demoWorkspace(); await save(wsKey(d.id), d); l = [{ id: d.id, name: d.name, kind: d.kind }]; }
    await save(LIST_KEY, l);
    setList(l);
    if (ws?.id === id) await switchWorkspace(l[0].id);
  }, [list, ws, switchWorkspace]);

  const renameWorkspace = useCallback(async (name) => {
    mutate('Workspace renamed', (d) => { d.name = name; d.settings.orgName = name; });
    const l = (list || []).map((x) => (x.id === ws.id ? { ...x, name } : x));
    await save(LIST_KEY, l);
    setList(l);
  }, [list, ws, mutate]);

  const importBackup = useCallback(async (data) => {
    if (data?.format !== 'brp-workspace' || !data.workspace?.id || !Array.isArray(data.workspace.programs)) throw new Error('Not a Benefits Realisation Platform backup file');
    await addWorkspace({ ...data.workspace, kind: data.workspace.kind === 'demo' ? 'user' : data.workspace.kind });
  }, [addWorkspace]);

  const value = useMemo(() => ({
    list, ws, error, storageOk, mutate, updateProgram, patchProgram, switchWorkspace, createBlank, resetDemo, deleteWorkspace, renameWorkspace, importBackup,
    me: ws?.people.find((p) => p.id === ws.currentUser) || null,
    setMe: (id) => mutate('Changed current user', (d) => { d.currentUser = id; }, { action: 'session' }),
  }), [list, ws, error, storageOk, mutate, updateProgram, patchProgram, switchWorkspace, createBlank, resetDemo, deleteWorkspace, renameWorkspace, importBackup]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const exportBackup = (ws) => ({ format: 'brp-workspace', version: 1, exportedAt: new Date().toISOString(), workspace: ws });

// Convenience selectors.
export const person = (ws, id) => ws.people.find((p) => p.id === id);
export const personName = (ws, id) => person(ws, id)?.name || '—';
export const areaName = (ws, id) => ws.areas.find((a) => a.id === id)?.name || '—';
export const categoryOf = (ws, id) => ws.categories.find((c) => c.id === id);
export const programById = (ws, id) => ws.programs.find((p) => p.id === id);
export const measureById = (ws, id) => ws.measures.find((m) => m.id === id);
export const driverById = (ws, id) => ws.drivers.find((d) => d.id === id);
