// Hooks shared by the module screens.
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp, useToast, useDialog } from '../state/app.jsx';
import { useIni, useMutator } from '../state/initiative.jsx';
import { useRecordDrawer } from '../ui/RecordDrawer.jsx';
import { useLookups } from '../ui/RecordForm.jsx';
import { can } from '../../shared/access.js';

// Tab state kept in the URL (?tab=…) so views can be linked and bookmarked.
export function useTab(defaultTab, key = 'tab') {
  const [params, setParams] = useSearchParams();
  const tab = params.get(key) || defaultTab;
  const setTab = useCallback((t) => {
    const p = new URLSearchParams(params);
    if (t === defaultTab) p.delete(key); else p.set(key, t);
    setParams(p, { replace: true });
  }, [params, setParams, defaultTab, key]);
  return [tab, setTab];
}

export function useIniPage() {
  const app = useApp();
  const ini = useIni();
  const mut = useMutator();
  const drawer = useRecordDrawer();
  const lookups = useLookups();
  const toast = useToast();
  const dialog = useDialog();
  const canDo = useCallback((action, type, record = null) => !(ini.readOnly && action !== 'R') && can(app.user, action, type, record), [app.user, ini.readOnly]);
  return useMemo(() => ({ ...app, ini, m: ini.model, records: ini.records, mut, drawer, lookups, canDo, toast, dialog, base: `/i/${ini.id}` }), [app, ini, mut, drawer, lookups, canDo, toast, dialog]);
}
