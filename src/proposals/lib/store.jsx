// React context for the proposal platform: the signed-in user's view of platform state, commands and files.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createBackend, safeLocal } from './backend.js';
import { todayISO } from '../core/util.js';
import { can } from '../core/permissions.js';

const Ctx = createContext(null);
export const useP = () => useContext(Ctx);

const IDLE_MS = 30 * 60 * 1000;
const MAX_SESSION_MS = 12 * 60 * 60 * 1000;
const BASE = import.meta.env.BASE_URL;

let assetsPromise = null;
export function loadAssets() {
  if (!assetsPromise) {
    const f = (n) => fetch(`${BASE}brand/${n}`).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? new Uint8Array(b) : null)).catch(() => null);
    assetsPromise = Promise.all([f('logo-color.png'), f('logo-white.png'), f('mark.png')]).then(([logoColor, logoWhite, mark]) => ({ logoColor, logoWhite, mark }));
  }
  return assetsPromise;
}

export function ProposalProvider({ children }) {
  const [backend, setBackend] = useState(null);
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [presence, setPresence] = useState([]);
  const [busy, setBusy] = useState(0);
  const lastActivity = useRef(Date.now());

  const toast = useCallback((text, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  const refresh = useCallback((b = backend) => { if (b) setView(b.view()); }, [backend]);

  useEffect(() => {
    let off = null;
    let cancelled = false;
    createBackend().then((b) => {
      if (cancelled) { b.close?.(); return; }
      setBackend(b);
      setView(b.view());
      off = b.on((kind) => { if (kind === 'presence') setPresence(b.presenceList()); else setView(b.view()); });
    }).catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; off?.(); };
  }, []);

  // Session limits (spec 16): 30 minutes idle or 12 hours since sign-in.
  useEffect(() => {
    const touch = () => { lastActivity.current = Date.now(); };
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    const t = setInterval(async () => {
      if (!backend?.userId) return;
      const signedIn = Date.parse(safeLocal.get('cto.pp.signedInAt') || '') || Date.now();
      if (Date.now() - lastActivity.current > IDLE_MS || Date.now() - signedIn > MAX_SESSION_MS) {
        await backend.signOut();
        setView(null);
        toast('You were signed out after a period of inactivity.', 'info');
      }
    }, 30000);
    return () => { clearInterval(t); window.removeEventListener('pointerdown', touch); window.removeEventListener('keydown', touch); };
  }, [backend, toast]);

  // Daily reminders, escalations and digests (the server runs these on a timer).
  useEffect(() => {
    if (!backend || backend.mode !== 'local' || !view) return;
    const today = todayISO();
    if (view.jobs?.digest === today) return;
    backend.system('jobs.run', {}).then(() => refresh(backend)).catch(() => {});
  }, [backend, view?.jobs?.digest]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!backend) return;
    const t = setInterval(() => setPresence(backend.presenceList()), 15000);
    return () => clearInterval(t);
  }, [backend]);

  const dispatch = useCallback(async (cmd, args = {}, { quiet = false, success } = {}) => {
    setBusy((n) => n + 1);
    try {
      const result = await backend.dispatch(cmd, args);
      setView(backend.view());
      if (success) toast(success, 'success');
      return result;
    } catch (e) {
      if (!quiet) toast(e.message, 'error');
      throw e;
    } finally {
      setBusy((n) => n - 1);
    }
  }, [backend, toast]);

  const signIn = useCallback(async (userId) => {
    await backend.signIn(userId);
    lastActivity.current = Date.now();
    setView(backend.view());
  }, [backend]);

  const signOut = useCallback(async () => { await backend.signOut(); setView(null); }, [backend]);

  const value = useMemo(() => ({
    backend, view, error, toast, dispatch, signIn, signOut, presence, busy: busy > 0,
    mode: backend?.mode, me: view?.me || null,
    query: (name, args) => backend.query(name, args),
    putFile: (bytes, meta) => backend.putFile(bytes, meta),
    getFile: (id) => backend.getFile(id),
    heartbeat: (where) => backend?.heartbeat(where),
    reset: async () => { await backend.reset(); setView(backend.view()); },
    exportAll: () => backend.exportAll(),
    importAll: async (s) => { await backend.importAll(s); setView(backend.view()); },
    users: view?.users || [],
    userName: (id) => view?.users.find((u) => u.id === id)?.name || (id === 'system' ? 'Platform' : '—'),
    client: (id) => view?.clients.find((c) => c.id === id) || null,
  }), [backend, view, error, toast, dispatch, signIn, signOut, presence, busy]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast-item ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>{t.text}</div>)}
      </div>
    </Ctx.Provider>
  );
}

export function useBid(bidId) {
  const { view } = useP();
  return view?.bids.find((b) => b.id === bidId) || null;
}

// Reports where this user is working (bid and section) so others see live presence.
export function usePresence(where) {
  const { heartbeat, presence, me } = useP();
  const key = JSON.stringify(where);
  useEffect(() => {
    if (!me) return undefined;
    heartbeat?.(where);
    const t = setInterval(() => heartbeat?.(where), 20000);
    return () => clearInterval(t);
  }, [key, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return presence.filter((p) => p.userId !== me?.id && (!where.bidId || p.bidId === where.bidId));
}

// Permission check against the signed-in user's view (the server re-checks every command).
export function useCan() {
  const { view, me } = useP();
  return (cap, ctx = {}) => Boolean(view && me && can(view, me.id, cap, ctx));
}
