// Fonts embedded in generated PDFs (Inter, SIL Open Font Licence). PDF/A requires every font to be
// embedded, so the standard PDF fonts are never used. The same files are read from disk on the server
// and fetched as bundled assets in the browser-only demonstration.
const FILES = {
  regular: new URL('../../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff', import.meta.url),
  italic: new URL('../../node_modules/@fontsource/inter/files/inter-latin-400-italic.woff', import.meta.url),
  semibold: new URL('../../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff', import.meta.url),
  bold: new URL('../../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff', import.meta.url),
};

async function read(url) {
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return new Uint8Array(await readFile(url));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font ${url.pathname} could not be loaded (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

let cache = null;
export function loadFonts() {
  cache ||= Promise.all(Object.entries(FILES).map(async ([k, u]) => [k, await read(u)])).then(Object.fromEntries).catch((e) => { cache = null; throw e; });
  return cache;
}
