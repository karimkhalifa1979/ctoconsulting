// One interface over the two data sources: SharePoint (Microsoft Graph) or the built-in demo data.
import { get, set } from 'idb-keyval';
import { config, demoMode } from '../config.js';
import { readJsonFile, writeJsonFile, scanFolder } from './graph.js';
import { applyChanges, emptyDoc, normaliseDoc } from './selections.js';
import { demoFiles, demoSeed } from './demo.js';

const DEMO_KEY = 'cto-proposal-library:demo-selections';

// Cached folder scans so the app opens instantly; "Rescan" refreshes from SharePoint.
const cacheKey = (folder) => `scan:${demoMode ? 'demo' : config.spHostname + config.spSitePath}:${folder}`;

export async function loadCachedScan(folder) {
  if (demoMode) return null; // sample data is generated instantly; no cache to go stale
  try {
    return (await get(cacheKey(folder))) || null;
  } catch {
    return null;
  }
}

export async function scan(folder, onProgress) {
  const files = demoMode ? await demoFiles(folder, onProgress) : await scanFolder(folder, onProgress);
  const result = { files, scannedAt: new Date().toISOString() };
  if (!demoMode) {
    try { await set(cacheKey(folder), result); } catch { /* private mode: no cache, still works */ }
  }
  return result;
}

export function resetDemo() {
  try { localStorage.removeItem(DEMO_KEY); } catch { /* ignore */ }
}

// Returns { doc, eTag, location }.
export async function loadSelections() {
  if (demoMode) {
    // First run (or after Reset demo): start from the sample selections and example proposal.
    let raw = demoSeed();
    try {
      const stored = localStorage.getItem(DEMO_KEY);
      if (stored) raw = JSON.parse(stored);
      else localStorage.setItem(DEMO_KEY, JSON.stringify(raw));
    } catch { /* storage unavailable: use the sample data for this session */ }
    return { doc: normaliseDoc(raw), eTag: null, location: 'this browser (demo mode)' };
  }
  const found = await readJsonFile(config.selectionsPath);
  return { doc: found ? normaliseDoc(found.data) : emptyDoc(), eTag: found?.eTag || null, location: config.selectionsPath };
}

// Saves pending changes on top of the latest saved version, retrying if someone else saved in between.
export async function saveSelections(changes, user) {
  if (demoMode) {
    const { doc } = await loadSelections();
    const next = applyChanges(doc, changes, user);
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(next)); } catch { /* storage unavailable: kept for this session only */ }
    return { doc: next, eTag: null };
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const { doc, eTag } = await loadSelections();
    const next = applyChanges(doc, changes, user);
    try {
      const saved = await writeJsonFile(config.selectionsPath, next, eTag);
      return { doc: next, eTag: saved.eTag };
    } catch (e) {
      if (e.status === 412 || e.status === 409) continue; // changed by someone else: reload, re-apply, retry
      throw e;
    }
  }
  throw new Error('The selections file kept changing while saving. Please try again.');
}
