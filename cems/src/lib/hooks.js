import { useCallback, useEffect, useRef, useState } from 'react';
import { get } from './api.js';

// Loads JSON from the API; reload() refetches, setData() updates locally.
export function useApi(path, query, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const key = path ? path + JSON.stringify(query || {}) : null;
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await get(path, query);
      if (n === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (n === seq.current) setState({ data: null, error, loading: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

export function useLocalState(key, initial) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(`cems:${key}`); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  const set = (x) => { setV(x); try { localStorage.setItem(`cems:${key}`, JSON.stringify(x)); } catch { /* storage unavailable */ } };
  return [v, set];
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
