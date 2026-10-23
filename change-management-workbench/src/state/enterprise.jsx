// Enterprise records for screens outside an initiative: the stakeholder master and stakeholder groups
// (PRT-005). Loaded on first use, so pickers and registers on the global screens can name and choose
// stakeholders, and refreshed after changes.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './app.jsx';

const EntCtx = createContext(null);
export const useEnterprise = () => useContext(EntCtx);

export function EnterpriseProvider({ children }) {
  const { api, status } = useApp();
  const [records, setRecords] = useState(null);
  const pending = useRef(null);
  const load = useCallback(async () => {
    const [st, gr] = await Promise.all([api.list('stakeholder', {}), api.list('stakeholderGroup', {})]);
    setRecords({ stakeholder: st.rows, stakeholderGroup: gr.rows });
  }, [api]);
  const ensure = useCallback(() => {
    if (!pending.current) pending.current = load().catch(() => { pending.current = null; });
    return pending.current;
  }, [load]);
  const refresh = useCallback(() => { pending.current = null; return ensure(); }, [ensure]);
  useEffect(() => { if (status !== 'ready') { setRecords(null); pending.current = null; } }, [status]);
  const value = useMemo(() => ({ records, ensure, refresh }), [records, ensure, refresh]);
  return <EntCtx.Provider value={value}>{children}</EntCtx.Provider>;
}
