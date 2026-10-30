import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get, post, setCsrf } from './api.js';

const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

// Holds the signed-in user, their access summary and Firm settings from /api/me.
export function SessionProvider({ children }) {
  const [me, setMe] = useState(undefined);
  const [notice, setNotice] = useState(null);
  const load = useCallback(async () => {
    try {
      const m = await get('/api/me');
      setCsrf(m.csrf);
      setMe(m);
      return m;
    } catch {
      setMe(null);
      return null;
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onOut = (e) => { setNotice(e.detail || 'Your session has ended. Please sign in again.'); setMe(null); };
    window.addEventListener('cems:signed-out', onOut);
    return () => window.removeEventListener('cems:signed-out', onOut);
  }, []);
  const value = useMemo(() => ({
    me, reload: load, notice, setNotice,
    async signInDemo(userId) { const r = await post('/api/auth/demo', { userId }); setCsrf(r.csrf); setNotice(null); return load(); },
    async signOut() { try { await post('/api/auth/logout'); } catch { /* already signed out */ } setMe(null); },
  }), [me, load, notice]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// Engagement-level permission check from the access summary returned by /api/me.
export function canOn(me, engagementId, fn, action = 'R') {
  const a = me?.access?.[engagementId];
  if (!a) return false;
  return (a.fns[fn] || []).some((x) => x === action || x.startsWith(`${action}:`));
}
export const rolesOn = (me, engagementId) => me?.access?.[engagementId]?.roles || [];
export const costsOn = (me, engagementId) => Boolean(me?.access?.[engagementId]?.costs);
