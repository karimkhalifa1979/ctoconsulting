// Application state: organisations, their registers and assessments.
// Persisted in the browser (IndexedDB); the reference organisation is seeded from /data.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get, set, del } from 'idb-keyval';
import { inferProfile } from './profile.js';
import { sourcesFromObligations, policiesOf } from './discovery.js';

const BASE = import.meta.env.BASE_URL;
export const SEED_ID = 'ndia';
export const SEED_NAME = 'National Insurance Disability Agency';

let libraryPromise = null;
export function loadLibrary() {
  if (!libraryPromise) {
    const j = (f) => fetch(`${BASE}data/ndia/${f}`).then((r) => {
      if (!r.ok) throw new Error(`Failed to load ${f}`);
      return r.json();
    });
    libraryPromise = Promise.all([j('requirements.json'), j('obligations.json'), j('exemptions.json'), j('pspf.json'), j('meta.json')])
      .then(([requirements, obligations, exemptions, pspf, meta]) => ({ requirements, obligations, exemptions, pspf, meta }));
  }
  return libraryPromise;
}

export async function loadSheetIndex() {
  return fetch(`${BASE}data/ndia/sheets/index.json`).then((r) => r.json());
}
export async function loadSheet(file) {
  return fetch(`${BASE}data/ndia/${file}`).then((r) => r.json());
}

function seedOrg(library) {
  const { profile } = inferProfile(SEED_NAME);
  profile.shortName = 'NDIA';
  return {
    id: SEED_ID,
    name: SEED_NAME,
    shortName: 'NDIA',
    prefix: 'NDIA',
    kind: 'seed',
    profile,
    createdAt: library.meta.generated,
    source: library.meta.source,
    sources: sourcesFromObligations(library.obligations, profile),
    counts: { obligations: library.obligations.length, requirements: library.requirements.length },
  };
}

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const safeLocal = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

export function AppProvider({ children }) {
  const [library, setLibrary] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [currentId, setCurrentId] = useState(safeLocal.get('cto.currentOrg') || SEED_ID);
  const [data, setData] = useState(null);
  const [assessments, setAssessments] = useState({});
  const [docs, setDocs] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const lib = await loadLibrary();
        setLibrary(lib);
        let list = (await get('orgs')) || [];
        if (!list.some((o) => o.id === SEED_ID)) {
          list = [seedOrg(lib), ...list];
          await set('orgs', list);
        }
        setOrgs(list);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  const org = orgs.find((o) => o.id === currentId) || orgs[0] || null;

  useEffect(() => {
    if (!org || !library) return;
    let cancelled = false;
    setData(null);
    (async () => {
      const d = org.kind === 'seed'
        ? { requirements: library.requirements, obligations: library.obligations, exemptions: library.exemptions }
        : (await get(`data:${org.id}`)) || { requirements: [], obligations: [], exemptions: [] };
      const a = (await get(`assess:${org.id}`)) || {};
      const docMap = (await get(`docs:${org.id}`)) || {};
      if (cancelled) return;
      setData({ ...d, policies: policiesOf(d.requirements) });
      setAssessments(a);
      setDocs(docMap);
    })();
    return () => { cancelled = true; };
  }, [org?.id, org?.updatedAt, library]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectOrg = useCallback((id) => {
    setCurrentId(id);
    safeLocal.set('cto.currentOrg', id);
  }, []);

  const saveOrgs = useCallback(async (list) => {
    setOrgs(list);
    await set('orgs', list);
  }, []);

  const createOrg = useCallback(async (rec, register) => {
    const orgRecord = { ...rec, counts: { obligations: register.obligations.length, requirements: register.requirements.length } };
    await set(`data:${orgRecord.id}`, register);
    const list = [...orgs.filter((o) => o.id !== orgRecord.id), orgRecord];
    await saveOrgs(list);
    selectOrg(orgRecord.id);
  }, [orgs, saveOrgs, selectOrg]);

  const updateOrg = useCallback(async (id, patch) => {
    await saveOrgs(orgs.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, [orgs, saveOrgs]);

  const deleteOrg = useCallback(async (id) => {
    if (id === SEED_ID) return;
    await Promise.all([del(`data:${id}`), del(`assess:${id}`), del(`docs:${id}`)]);
    await saveOrgs(orgs.filter((o) => o.id !== id));
    if (currentId === id) selectOrg(SEED_ID);
  }, [orgs, currentId, saveOrgs, selectOrg]);

  const updateAssessment = useCallback((reqId, record) => {
    setAssessments((prev) => {
      const next = { ...prev, [reqId]: { ...record, updatedAt: new Date().toISOString() } };
      if (org) set(`assess:${org.id}`, next);
      return next;
    });
  }, [org]);

  const replaceAssessments = useCallback(async (map) => {
    setAssessments(map);
    if (org) await set(`assess:${org.id}`, map);
  }, [org]);

  const saveDoc = useCallback((code, doc) => {
    setDocs((prev) => {
      const next = { ...prev, [code]: doc };
      if (org) set(`docs:${org.id}`, next);
      return next;
    });
  }, [org]);

  // Restores a backup file; the reference organisation only restores assessments and documents.
  const restoreBackup = useCallback(async (backup) => {
    const restored = await importOrgBackup(backup);
    const existing = orgs.find((o) => o.id === restored.id);
    const list = existing ? orgs.map((o) => (o.id === restored.id ? (o.kind === 'seed' ? o : restored) : o)) : [...orgs, restored];
    await saveOrgs(list);
    selectOrg(restored.id);
    if (currentId === restored.id) {
      setAssessments(backup.assessments || {});
      setDocs(backup.docs || {});
      if (backup.data) setData({ ...backup.data, policies: policiesOf(backup.data.requirements) });
    }
    return restored;
  }, [orgs, saveOrgs, selectOrg, currentId]);

  const value = useMemo(() => ({
    library, orgs, org, data, assessments, docs, error,
    selectOrg, createOrg, updateOrg, deleteOrg, updateAssessment, replaceAssessments, saveDoc, restoreBackup,
  }), [library, orgs, org, data, assessments, docs, error, selectOrg, createOrg, updateOrg, deleteOrg, updateAssessment, replaceAssessments, saveDoc, restoreBackup]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Export / import a full backup of one organisation.
export async function exportOrgBackup(org) {
  const [data, assess, docs] = await Promise.all([
    org.kind === 'seed' ? null : get(`data:${org.id}`),
    get(`assess:${org.id}`),
    get(`docs:${org.id}`),
  ]);
  return { format: 'cto-assessment-backup', version: 1, org, data, assessments: assess || {}, docs: docs || {} };
}

async function importOrgBackup(backup) {
  if (backup?.format !== 'cto-assessment-backup' || !backup.org?.id) throw new Error('Not a CTO Consulting assessment backup file');
  const { org } = backup;
  if (backup.data && org.kind !== 'seed') await set(`data:${org.id}`, backup.data);
  await set(`assess:${org.id}`, backup.assessments || {});
  await set(`docs:${org.id}`, backup.docs || {});
  return org;
}
