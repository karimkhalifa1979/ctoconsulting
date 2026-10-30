// node:url helpers. Server modules see import.meta.url rewritten to file:///app/<path> at build time.
export function fileURLToPath(u) {
  return decodeURIComponent(String(u?.href || u).replace(/^file:\/\//, ''));
}
export const pathToFileURL = (p) => new URL(`file://${p}`);
export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;
export default { fileURLToPath, pathToFileURL, URL, URLSearchParams };
