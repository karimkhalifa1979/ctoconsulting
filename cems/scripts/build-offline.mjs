// Builds the offline edition: one self-contained HTML file that runs by opening it in a browser,
// with no server, install or internet. The CEMS server runs inside the page (see src/offline).
// Run with: npm run build:offline
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist-offline');
const target = path.join(root, 'offline', 'CEMS_Offline.html');
const shim = (file) => path.join(root, 'src', 'offline', 'shims', file);

// `import x from './file?b64'` gives the file's bytes as a base64 string (the SQLite WebAssembly
// binary and the starter report templates).
const base64 = {
  name: 'cems-offline-base64',
  enforce: 'pre',
  async resolveId(id, importer) {
    if (!id.endsWith('?b64')) return null;
    const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true });
    return resolved && `${resolved.id}?b64`;
  },
  load(id) {
    if (!id.endsWith('?b64')) return null;
    return `export default ${JSON.stringify(fs.readFileSync(id.slice(0, -4)).toString('base64'))};`;
  },
};

// Server modules locate their files from import.meta.url; in the page they live under /app in the
// virtual file system, laid out as in this repository.
const moduleUrls = {
  name: 'cems-offline-module-urls',
  enforce: 'pre',
  transform(code, id) {
    if (!code.includes('import.meta.url')) return null;
    const rel = path.relative(root, id.split('?')[0]).split(path.sep).join('/');
    if (!/^(server|shared)\//.test(rel)) return null;
    return { code: code.replaceAll('import.meta.url', JSON.stringify(`file:///app/${rel}`)), map: null };
  },
};

// Pages opened from disk cannot load ES modules or split chunks, so emit one classic script.
await build({
  root,
  configFile: false,
  logLevel: 'warn',
  plugins: [base64, moduleUrls, react()],
  resolve: {
    alias: [
      { find: /^(node:)?fs$/, replacement: shim('fs.js') },
      { find: /^(node:)?path$/, replacement: shim('path.js') },
      { find: /^(node:)?url$/, replacement: shim('url.js') },
      { find: /^(node:)?crypto$/, replacement: shim('crypto.js') },
      { find: /^node:sqlite$/, replacement: shim('sqlite.js') },
      { find: /^(node:)?module$/, replacement: shim('module.js') },
      { find: /^(node:)?(os|net|http|child_process)$/, replacement: shim('stubs.js') },
      { find: /^@resvg\/resvg-js$/, replacement: shim('resvg.js') },
      // Browser builds of the document libraries.
      { find: /^mammoth$/, replacement: 'mammoth/mammoth.browser.min.js' },
      { find: /^exceljs$/, replacement: 'exceljs/dist/exceljs.bare.min.js' },
    ],
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir,
    emptyOutDir: true,
    copyPublicDir: false,
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
    sourcemap: false,
    rollupOptions: {
      input: path.join(root, 'offline.html'),
      output: { format: 'iife' },
      // The only import.meta left is in Vite's preload helper, which a single script never uses.
      onwarn(warning, warn) { if (warning.code !== 'EMPTY_IMPORT_META') warn(warning); },
    },
  },
});

const html = fs.readFileSync(path.join(outDir, 'offline.html'), 'utf8');
const assets = path.join(outDir, 'assets');
const files = fs.readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
const css = files.filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
const safe = (s) => s.replace(/<\/(script|style)/gi, '<\\/$1');
const favicon = `data:image/svg+xml;base64,${fs.readFileSync(path.join(root, 'public', 'favicon.svg')).toString('base64')}`;

const out = html
  .replace(/<script type="module"[^>]*><\/script>\s*/g, '')
  .replace(/<link rel="stylesheet"[^>]*>\s*/g, '')
  // Function replacers insert text literally ("$'" in the bundle would otherwise be a replace pattern).
  .replace(/<link rel="icon"[^>]*>/, () => `<link rel="icon" type="image/svg+xml" href="${favicon}" />`)
  .replace('</head>', () => `<style>${safe(css)}</style>\n</head>`)
  .replace('</body>', () => `<script>${safe(js)}</script>\n</body>`);

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out);
fs.rmSync(outDir, { recursive: true, force: true });
console.log(`Offline build written to ${path.relative(root, target)} (${(out.length / 1e6).toFixed(1)} MB)`);
