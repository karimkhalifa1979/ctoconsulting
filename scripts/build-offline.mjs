// Builds a single self-contained HTML file that runs by double-clicking it:
// no server, install or internet needed. Run with: npm run build:offline
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist-offline');
const target = path.join(root, 'offline', 'CTO_Regulatory_Assessment_Offline.html');

// Pages opened from disk cannot load ES modules or split chunks, so emit one classic script.
await build({
  root,
  logLevel: 'error',
  build: {
    outDir,
    emptyOutDir: true,
    copyPublicDir: false,
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
});

const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const assets = path.join(outDir, 'assets');
const files = fs.readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
const css = files.filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
const safe = (s) => s.replace(/<\/(script|style)/gi, '<\\/$1');

// Embed every data file the app loads, keyed by its path under data/ndia/.
const dataDir = path.join(root, 'public', 'data', 'ndia');
const data = {};
for (const rel of ['requirements.json', 'obligations.json', 'exemptions.json', 'pspf.json', 'meta.json', 'sheets/index.json',
  ...fs.readdirSync(path.join(dataDir, 'sheets')).filter((f) => f !== 'index.json').map((f) => `sheets/${f}`)]) {
  data[rel] = JSON.parse(fs.readFileSync(path.join(dataDir, rel), 'utf8'));
}
const favicon = `data:image/svg+xml;base64,${fs.readFileSync(path.join(root, 'public', 'favicon.svg')).toString('base64')}`;

const out = html
  .replace(/<script type="module"[^>]*><\/script>\s*/g, '')
  .replace(/<link rel="stylesheet"[^>]*href="\.\/assets[^>]*>\s*/g, '')
  // Function replacers insert text literally ("$'" in the bundle would otherwise be a replace pattern).
  .replace(/<link rel="icon"[^>]*>/, () => `<link rel="icon" type="image/svg+xml" href="${favicon}" />`)
  .replace('</head>', () => `<style>${safe(css)}</style>\n</head>`)
  .replace('</body>', () => `<script>window.__CTO_DATA__ = ${safe(JSON.stringify(data))};</script>\n<script>${safe(js)}</script>\n</body>`);

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out);
fs.rmSync(outDir, { recursive: true, force: true });
console.log(`Offline build written to ${path.relative(root, target)} (${(out.length / 1e6).toFixed(1)} MB)`);
