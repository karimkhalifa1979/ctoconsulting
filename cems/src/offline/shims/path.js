// POSIX path functions for the server code running in the browser.
export const sep = '/';
export const delimiter = ':';

export function normalize(p) {
  const abs = String(p).startsWith('/');
  const out = [];
  for (const part of String(p).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (out.length && out.at(-1) !== '..') out.pop(); else if (!abs) out.push('..'); } else out.push(part);
  }
  return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.');
}
export const join = (...parts) => normalize(parts.filter((x) => x !== '' && x != null).join('/'));
export function resolve(...parts) {
  let r = '/app';
  for (const p of parts) if (p) r = String(p).startsWith('/') ? String(p) : `${r}/${p}`;
  return normalize(r);
}
export function dirname(p) {
  const n = normalize(p);
  const i = n.lastIndexOf('/');
  return i < 0 ? '.' : i === 0 ? '/' : n.slice(0, i);
}
export function basename(p, ext) {
  let b = String(p).split('/').filter(Boolean).pop() || '';
  if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length);
  return b;
}
export function extname(p) {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i) : '';
}
export function relative(from, to) {
  const a = resolve(from).split('/').filter(Boolean);
  const b = resolve(to).split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}
export const isAbsolute = (p) => String(p).startsWith('/');
export const posix = { sep, delimiter, normalize, join, resolve, dirname, basename, extname, relative, isAbsolute };
export default posix;
