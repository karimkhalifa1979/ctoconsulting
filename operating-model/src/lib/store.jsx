// Application state: the list of engagements and the one currently open.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { load, save, remove, prefs, storageMode } from './storage.js';
import { blankEngagement, normalise, uid, engagementTitle } from './model.js';
import { createDemo } from '../data/demo.js';

const INDEX_KEY = 'omat.index';
const engKey = (id) => `omat.eng.${id}`;

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

// Immutable set of a nested path, e.g. setIn(e, ['tom', 'canvas', 'value', 'target'], 'text').
export function setIn(obj, path, value) {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const base = Array.isArray(obj) ? [...obj] : { ...(obj || {}) };
  base[k] = setIn(obj?.[k], rest, value);
  return base;
}

const meta = (e) => ({
  id: e.id, client: e.details.client, name: e.details.name, status: e.details.status, kind: e.kind,
  updatedAt: e.updatedAt, createdAt: e.createdAt,
});

export function StoreProvider({ children }) {
  const [index, setIndex] = useState([]);
  const [eng, setEng] = useState(null);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const [toast, setToast] = useState(null);
  const history = useRef([]);
  const lastPush = useRef(0);
  const dirty = useRef(false);

  // Initial load: the engagement index, seeding the demo engagement on first use.
  useEffect(() => {
    (async () => {
      let idx = (await load(INDEX_KEY)) || [];
      if (!idx.length) {
        const demo = createDemo();
        await save(engKey(demo.id), demo);
        idx = [meta(demo)];
        await save(INDEX_KEY, idx);
      }
      const last = prefs.get('omat.current');
      const id = idx.find((i) => i.id === last)?.id || idx[0].id;
      let e = await load(engKey(id));
      if (!e) {
        e = createDemo();
        idx = [meta(e), ...idx.filter((i) => i.id !== id)];
        await save(engKey(e.id), e);
        await save(INDEX_KEY, idx);
      }
      setIndex(idx);
      setEng(normalise(e));
      setReady(true);
    })();
  }, []);

  // Debounced save of the open engagement and its index entry.
  useEffect(() => {
    if (!eng || !dirty.current) return undefined;
    setSaved(false);
    const t = setTimeout(async () => {
      await save(engKey(eng.id), eng);
      setIndex((idx) => {
        const next = idx.some((i) => i.id === eng.id) ? idx.map((i) => (i.id === eng.id ? meta(eng) : i)) : [meta(eng), ...idx];
        save(INDEX_KEY, next);
        return next;
      });
      dirty.current = false;
      setSaved(true);
    }, 350);
    return () => clearTimeout(t);
  }, [eng]);

  useEffect(() => {
    const warn = (ev) => { if (dirty.current) { ev.preventDefault(); ev.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const update = useCallback((fn) => {
    setEng((prev) => {
      const next = typeof fn === 'function' ? fn(prev) : { ...prev, ...fn };
      if (next === prev) return prev;
      const now = Date.now();
      // Coalesce rapid edits (typing) into one undo step.
      if (now - lastPush.current > 1200) {
        history.current = [...history.current.slice(-39), prev];
      }
      lastPush.current = now;
      dirty.current = true;
      return { ...next, updatedAt: new Date().toISOString() };
    });
  }, []);

  const set = useCallback((key, value) => update((e) => ({ ...e, [key]: typeof value === 'function' ? value(e[key]) : value })), [update]);
  const setPath = useCallback((path, value) => update((e) => setIn(e, path, value)), [update]);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) {
      dirty.current = true;
      setEng({ ...prev, updatedAt: new Date().toISOString() });
    }
  }, []);

  const flush = useCallback(async () => {
    if (eng) await save(engKey(eng.id), eng);
    dirty.current = false;
  }, [eng]);

  const open = useCallback(async (id) => {
    await flush();
    const e = await load(engKey(id));
    if (!e) return;
    history.current = [];
    prefs.set('omat.current', id);
    setEng(normalise(e));
  }, [flush]);

  const add = useCallback(async (e) => {
    await flush();
    const n = normalise(e);
    await save(engKey(n.id), n);
    setIndex((idx) => {
      const next = [meta(n), ...idx.filter((i) => i.id !== n.id)];
      save(INDEX_KEY, next);
      return next;
    });
    history.current = [];
    prefs.set('omat.current', n.id);
    setEng(n);
    return n;
  }, [flush]);

  const create = useCallback((opts) => add(blankEngagement(opts)), [add]);
  const createDemoEngagement = useCallback(() => add(createDemo()), [add]);

  const duplicate = useCallback(async (id) => {
    const src = id === eng?.id ? eng : await load(engKey(id));
    if (!src) return null;
    const copy = structuredClone(src);
    copy.id = uid();
    copy.kind = 'client';
    copy.details = { ...copy.details, name: `${copy.details.name || engagementTitle(copy)} (copy)` };
    copy.createdAt = copy.updatedAt = new Date().toISOString();
    return add(copy);
  }, [add, eng]);

  const importEngagement = useCallback((obj) => {
    const e = { ...obj, id: uid(), updatedAt: new Date().toISOString() };
    return add(e);
  }, [add]);

  const removeEngagement = useCallback(async (id) => {
    await remove(engKey(id));
    const next = index.filter((i) => i.id !== id);
    if (!next.length) {
      const demo = createDemo();
      await save(engKey(demo.id), demo);
      next.push(meta(demo));
    }
    await save(INDEX_KEY, next);
    setIndex(next);
    if (eng?.id === id) {
      const e = await load(engKey(next[0].id));
      history.current = [];
      prefs.set('omat.current', next[0].id);
      dirty.current = false;
      setEng(normalise(e));
    }
  }, [index, eng]);

  const loadEngagement = useCallback((id) => (id === eng?.id ? Promise.resolve(eng) : load(engKey(id)).then((e) => (e ? normalise(e) : null))), [eng]);

  const notify = useCallback((text) => setToast({ text, id: Date.now() }), []);

  const value = useMemo(() => ({
    ready, index, eng, update, set, setPath, undo, canUndo: history.current.length > 0, saved,
    open, create, createDemoEngagement, duplicate, importEngagement, removeEngagement, loadEngagement,
    storage: storageMode(), toast, notify, clearToast: () => setToast(null),
  }), [ready, index, eng, update, set, setPath, undo, saved, open, create, createDemoEngagement, duplicate, importEngagement, removeEngagement, loadEngagement, toast, notify]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
