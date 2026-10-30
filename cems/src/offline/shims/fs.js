// node:fs over an in-memory file system. The host preloads read-only assets (report templates,
// the requirements list) and persists what the server writes under /data to IndexedDB.
import { Buffer } from 'buffer';
import { normalize, dirname, basename } from './path.js';

const files = new Map();
const dirs = new Set(['/']);
let listener = () => {};

const err = (code, p) => Object.assign(new Error(`${code}: no such file or directory, '${p}'`), { code });
const key = (p) => normalize(String(p));

function addDir(p) {
  for (let d = key(p); d && !dirs.has(d); d = dirname(d)) dirs.add(d);
}

// Host hooks.
export function preload(p, bytes) {
  const k = key(p);
  addDir(dirname(k));
  files.set(k, Buffer.from(bytes));
}
export const onChange = (fn) => { listener = fn; };
export const allFiles = () => [...files.entries()];

export const existsSync = (p) => files.has(key(p)) || dirs.has(key(p));
export function mkdirSync(p) { addDir(p); }
export function writeFileSync(p, data, enc) {
  const k = key(p);
  addDir(dirname(k));
  const buf = typeof data === 'string' ? Buffer.from(data, typeof enc === 'string' ? enc : enc?.encoding || 'utf8') : Buffer.from(data);
  files.set(k, buf);
  listener(k, buf);
}
export function readFileSync(p, enc) {
  const b = files.get(key(p));
  if (!b) throw err('ENOENT', p);
  const encoding = typeof enc === 'string' ? enc : enc?.encoding;
  return encoding ? b.toString(encoding) : b;
}
export function statSync(p) {
  const k = key(p);
  if (files.has(k)) return { isFile: () => true, isDirectory: () => false, size: files.get(k).length, mtime: new Date() };
  if (dirs.has(k)) return { isFile: () => false, isDirectory: () => true, size: 0, mtime: new Date() };
  throw err('ENOENT', p);
}
export function readdirSync(p) {
  const k = key(p);
  const prefix = k === '/' ? '/' : `${k}/`;
  const names = new Set();
  for (const f of [...files.keys(), ...dirs]) if (f.startsWith(prefix) && f !== k) names.add(f.slice(prefix.length).split('/')[0]);
  return [...names];
}
export function unlinkSync(p) {
  const k = key(p);
  if (files.delete(k)) listener(k, null);
}
export function rmSync(p) {
  const k = key(p);
  for (const f of [...files.keys()]) if (f === k || f.startsWith(`${k}/`)) { files.delete(f); listener(f, null); }
  for (const d of [...dirs]) if (d === k || d.startsWith(`${k}/`)) dirs.delete(d);
}
let temp = 0;
export function mkdtempSync(prefix) {
  const d = `${prefix}${Date.now().toString(36)}${(temp++).toString(36)}`;
  addDir(d);
  return d;
}
export function createReadStream(p) { throw err('ENOTSUP', basename(String(p))); }

export const promises = {
  readFile: async (p, enc) => readFileSync(p, enc),
  writeFile: async (p, d, enc) => writeFileSync(p, d, enc),
};

export default { existsSync, mkdirSync, writeFileSync, readFileSync, statSync, readdirSync, unlinkSync, rmSync, mkdtempSync, createReadStream, promises };
