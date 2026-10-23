// Initiative working set: every record the user may see for one initiative (plus the enterprise records
// it references), the derived model computed with the same rules as the server (Section 8.8), and
// mutation helpers that handle reasons (RUL-09, RUL-10, PLN-006), conflicts (WFL-007) and duplicates.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { buildModel } from '../../shared/model.js';
import { useApp, useDialog, useToast } from './app.jsx';
import { rememberRecent } from '../lib/recent.js';

const IniCtx = createContext(null);
export const useIni = () => {
  const v = useContext(IniCtx);
  if (!v) throw new Error('useIni must be used inside an initiative');
  return v;
};
export const useIniOptional = () => useContext(IniCtx);

function mergeChanges(data, changes) {
  if (!changes?.records?.length) return { ...data, seq: changes?.seq ?? data.seq };
  const records = { ...data.records };
  let initiative = data.initiative;
  for (const r of changes.records) {
    if (r.type === 'initiative' && r.id === initiative.id) {
      initiative = r.deleted ? initiative : r;
      continue;
    }
    if (!r.type) continue;
    const list = records[r.type] ? [...records[r.type]] : [];
    const i = list.findIndex((x) => x.id === r.id);
    if (r.deleted) {
      if (i >= 0) list.splice(i, 1);
    } else if (i >= 0) list[i] = r;
    else list.push(r);
    records[r.type] = list;
  }
  return { initiative, records, seq: changes.seq };
}

export function InitiativeProvider({ id, children }) {
  const { api, config, today, user, refresh: refreshApp } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const dataRef = useRef(null);
  dataRef.current = data;

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api.loadInitiative(id);
      setData(d);
      rememberRecent(user?.id, { type: 'initiative', id, code: d.initiative?.code, title: d.initiative?.name });
    } catch (e) {
      if (e.status === 401) refreshApp();
      setError(e);
    }
  }, [api, id, refreshApp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setData(null); load(); }, [load]);

  const refresh = useCallback(async () => {
    const cur = dataRef.current;
    if (!cur) return load();
    try {
      const ch = await api.changes(id, cur.seq);
      setData((d) => (d ? mergeChanges(d, ch) : d));
    } catch (e) {
      if (e.status === 401) refreshApp();
    }
  }, [api, id, load, refreshApp]);

  // Collaborative editing: pick up other people's changes (server mode).
  useEffect(() => {
    if (api.mode !== 'server') return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30000);
    return () => clearInterval(t);
  }, [api.mode, refresh]);

  const model = useMemo(() => {
    if (!data || !config) return null;
    try {
      return buildModel({ initiative: data.initiative, records: data.records }, { config, today });
    } catch (e) {
      console.error('Model build failed', e);
      return null;
    }
  }, [data, config, today]);

  const value = useMemo(() => ({
    id,
    data,
    initiative: data?.initiative || null,
    records: data?.records || {},
    model,
    error,
    loading: !data && !error,
    readOnly: data?.initiative?.status === 'closed',
    reload: load,
    refresh,
  }), [id, data, model, error, load, refresh]);

  return <IniCtx.Provider value={value}>{children}</IniCtx.Provider>;
}

// Mutations with consistent handling of reasons, conflicts, duplicates and errors. Works inside and
// outside an initiative; inside, the working set is refreshed after each change.
export function useMutator() {
  const { api, refresh: refreshApp } = useApp();
  const ini = useIniOptional();
  const toast = useToast();
  const dialog = useDialog();

  const after = useCallback(async () => { if (ini) await ini.refresh(); }, [ini]);

  const handle = useCallback(async (fn, { reason: givenReason, quiet = false, retry = true } = {}) => {
    try {
      const res = await fn(givenReason);
      await after();
      return res;
    } catch (e) {
      if (e.status === 401) { refreshApp(); throw e; }
      if (retry && e.status === 422 && /reason|justification/i.test(e.message) && !givenReason) {
        const reason = await dialog.prompt({ title: 'A reason is needed', message: e.message, label: 'Reason', placeholder: 'This is recorded in the audit trail.' });
        if (!reason) throw Object.assign(new Error('Cancelled'), { cancelled: true });
        return handle(fn, { reason, quiet, retry: false });
      }
      if (e.status === 409 && e.current) {
        await dialog.alert({ title: 'Someone else changed this record', message: `${e.message} The latest version has been loaded; review it and apply your change again.` });
        await after();
        throw Object.assign(e, { handled: true });
      }
      if (!quiet) toast.error(e);
      throw Object.assign(e, { handled: true });
    }
  }, [after, dialog, refreshApp, toast]);

  return useMemo(() => ({
    create: async (type, data, opts = {}) => {
      try {
        return await handle((reason) => api.create(type, data, { ...opts, reason: reason || opts.reason }), opts);
      } catch (e) {
        if (e.status === 409 && e.duplicates?.length) {
          const go = await dialog.confirm({ title: 'Possible duplicate', message: e.message, confirmLabel: 'Create anyway', cancelLabel: 'Go back' });
          if (go) return handle((reason) => api.create(type, data, { ...opts, allowDuplicate: true, reason }), opts);
        }
        throw e;
      }
    },
    update: (type, id, patch, opts = {}) => handle((reason) => api.update(type, id, patch, { ...opts, reason: reason || opts.reason }), opts),
    remove: async (type, id, opts = {}) => {
      if (!opts.skipConfirm) {
        const ok = await dialog.confirm({ title: 'Delete record', message: opts.message || 'This record will be deleted. The deletion is recorded in the audit trail.', confirmLabel: 'Delete', danger: true });
        if (!ok) return null;
      }
      return handle((reason) => api.remove(type, id, { reason: reason || opts.reason }), opts);
    },
    bulk: (type, ids, patch, opts = {}) => handle((reason) => api.bulkUpdate(type, ids, patch, { reason: reason || opts.reason }), opts),
    op: (name, payload = {}, opts = {}) => handle((reason) => api.op(name, reason ? { ...payload, reason } : payload), opts),
    refresh: after,
  }), [api, handle, after, dialog]);
}
