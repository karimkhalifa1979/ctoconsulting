// Enterprise records for screens outside an initiative: the stakeholder master and stakeholder groups
// (PRT-005). Loaded on first use, so pickers and registers on the global screens can name and choose
// stakeholders, and refreshed after changes. A large master loads its first page, alphabetically, and is
// searched on the server beyond that (PER-04).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './app.jsx';

const EntCtx = createContext(null);
const MASTER_PAGE = 5000;
export const useEnterprise = () => useContext(EntCtx);

export function EnterpriseProvider({ children }) {
  const { api, status } = useApp();
  const [records, setRecords] = useState(null);
  const [total, setTotal] = useState(0);
  const pending = useRef(null);
  const load = useCallback(async () => {
    const [st, gr] = await Promise.all([api.list('stakeholder', { limit: MASTER_PAGE, sort: 'familyName' }), api.list('stakeholderGroup', {})]);
    setRecords({ stakeholder: st.rows, stakeholderGroup: gr.rows });
    setTotal(st.total ?? st.rows.length);
  }, [api]);
  const ensure = useCallback(() => {
    if (!pending.current) pending.current = load().catch(() => { pending.current = null; });
    return pending.current;
  }, [load]);
  const refresh = useCallback(() => { pending.current = null; return ensure(); }, [ensure]);
  useEffect(() => { if (status !== 'ready') { setRecords(null); pending.current = null; } }, [status]);
  const partial = !!records && total > records.stakeholder.length;
  const value = useMemo(() => ({ records, total, partial, ensure, refresh }), [records, total, partial, ensure, refresh]);
  return <EntCtx.Provider value={value}>{children}</EntCtx.Provider>;
}
