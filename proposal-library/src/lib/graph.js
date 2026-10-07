// Microsoft Graph access to the CTO Consulting SharePoint document library.
import { config } from '../config.js';
import { getToken } from './auth.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const ITEM_FIELDS = 'id,name,size,file,folder,webUrl,lastModifiedDateTime,lastModifiedBy';

export class GraphError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Graph request with throttling/transient-failure retries (honours Retry-After).
export async function graph(pathOrUrl, { method = 'GET', headers = {}, body, raw = false } = {}) {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : GRAPH + pathOrUrl;
  for (let attempt = 0; ; attempt++) {
    const token = await getToken();
    const res = await fetch(url, { method, body, headers: { Authorization: `Bearer ${token}`, ...headers } });
    if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < 6) {
      const wait = Number(res.headers.get('Retry-After')) || 2 ** attempt;
      await sleep(Math.min(wait, 60) * 1000);
      continue;
    }
    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`;
      let code;
      try {
        const j = await res.json();
        message = j.error?.message || message;
        code = j.error?.code;
      } catch { /* non-JSON error body */ }
      throw new GraphError(res.status, message, code);
    }
    if (raw) return res;
    return res.status === 204 ? null : res.json();
  }
}

// Path segments are encoded individually so names like "CV's" or "Sales and Marketing" resolve.
export const encodePath = (p) => p.split('/').filter(Boolean).map(encodeURIComponent).join('/');

let driveIdPromise = null;
export function getDriveId() {
  if (!driveIdPromise) {
    driveIdPromise = (async () => {
      const site = await graph(`/sites/${config.spHostname}:${encodeURI(config.spSitePath)}?$select=id`);
      const { value } = await graph(`/sites/${site.id}/drives?$select=id,name,webUrl`);
      const wanted = config.spLibrary.toLowerCase();
      const drive = value.find((d) => d.name.toLowerCase() === wanted)
        || value.find((d) => decodeURIComponent(d.webUrl).toLowerCase().endsWith('/' + wanted))
        || (wanted === 'documents' && value.find((d) => decodeURIComponent(d.webUrl).toLowerCase().endsWith('/shared documents')));
      if (!drive) throw new Error(`Document library "${config.spLibrary}" was not found on ${config.spHostname}${config.spSitePath}.`);
      return drive.id;
    })().catch((e) => { driveIdPromise = null; throw e; });
  }
  return driveIdPromise;
}

const toFile = (item, path) => ({
  id: item.id,
  name: item.name,
  path,
  webUrl: item.webUrl,
  size: item.size ?? null,
  modified: item.lastModifiedDateTime || null,
  modifiedBy: item.lastModifiedBy?.user?.displayName || null,
});

// Lists every file below a library folder (all sub-folders), several folders at a time.
// `path` on each file is its folder relative to the scanned folder ('' for files directly in it).
export async function scanFolder(folderPath, onProgress = () => {}) {
  const driveId = await getDriveId();
  let start;
  try {
    start = await graph(`/drives/${driveId}/root:/${encodePath(folderPath)}?$select=id,folder`);
  } catch (e) {
    if (e.status === 404) throw new Error(`Folder "${folderPath}" was not found in the ${config.spLibrary} library.`);
    throw e;
  }
  const files = [];
  const queue = [{ id: start.id, path: '' }];
  let folders = 0;
  let active = 0;
  const CONCURRENCY = 6;

  await new Promise((resolve, reject) => {
    let failed = false;
    const pump = () => {
      if (failed) return;
      if (!queue.length && !active) { resolve(); return; }
      while (active < CONCURRENCY && queue.length) {
        const folder = queue.shift();
        active++;
        listChildren(driveId, folder)
          .then(() => { active--; folders++; onProgress({ folders, files: files.length, pending: queue.length + active }); pump(); })
          .catch((e) => { failed = true; reject(e); });
      }
    };
    const listChildren = async (driveIdArg, folder) => {
      let next = `/drives/${driveIdArg}/items/${folder.id}/children?$top=999&$select=${ITEM_FIELDS}`;
      while (next) {
        const page = await graph(next);
        for (const item of page.value) {
          if (item.folder) queue.push({ id: item.id, path: folder.path ? `${folder.path}/${item.name}` : item.name });
          else if (item.file) files.push(toFile(item, folder.path));
        }
        next = page['@odata.nextLink'] || null;
      }
    };
    pump();
  });
  return files;
}

// Reads a JSON file from the library; returns { data, eTag } or null when it does not exist yet.
export async function readJsonFile(filePath) {
  const driveId = await getDriveId();
  let item;
  try {
    item = await graph(`/drives/${driveId}/root:/${encodePath(filePath)}`);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
  // The pre-authenticated download URL avoids a cross-origin redirect from the /content endpoint.
  const url = item['@microsoft.graph.downloadUrl'];
  const res = url ? await fetch(url, { cache: 'no-store' }) : await graph(`/drives/${driveId}/items/${item.id}/content`, { raw: true });
  if (!res.ok) throw new GraphError(res.status, `Could not download ${filePath}`);
  return { data: await res.json(), eTag: item.eTag };
}

async function ensureFolder(driveId, folderPath) {
  let parent = '';
  for (const name of folderPath.split('/').filter(Boolean)) {
    const here = parent ? `${parent}/${name}` : name;
    try {
      await graph(`/drives/${driveId}/root:/${encodePath(here)}?$select=id`);
    } catch (e) {
      if (e.status !== 404) throw e;
      const parentRef = parent ? `root:/${encodePath(parent)}:` : 'root';
      await graph(`/drives/${driveId}/${parentRef}/children`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      }).catch((err) => { if (err.status !== 409) throw err; });
    }
    parent = here;
  }
}

// Writes a JSON file. With an eTag the write only succeeds if nobody changed the file since it was read
// (412 otherwise); without one it only succeeds if the file does not exist yet (409 otherwise).
export async function writeJsonFile(filePath, data, eTag) {
  const driveId = await getDriveId();
  const folder = filePath.split('/').slice(0, -1).join('/');
  if (!eTag && folder) await ensureFolder(driveId, folder);
  const query = eTag ? '' : '?@microsoft.graph.conflictBehavior=fail';
  const item = await graph(`/drives/${driveId}/root:/${encodePath(filePath)}:/content${query}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(eTag ? { 'If-Match': eTag } : {}) },
    body: JSON.stringify(data, null, 2),
  });
  return { eTag: item.eTag, webUrl: item.webUrl };
}

export async function getMe() {
  return graph('/me?$select=displayName,mail,userPrincipalName');
}
