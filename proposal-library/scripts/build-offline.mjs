// Builds the offline demo: one self-contained HTML file (demo mode, sample data, no sign-in or network).
// Usage: npm run build:offline  ->  offline/CTO-Proposal-Library-Demo.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist-offline');
const target = path.join(root, 'offline', 'CTO-Proposal-Library-Demo.html');

process.env.VITE_DEMO_MODE = '1';
await build({ root, logLevel: 'warn', build: { outDir, emptyOutDir: true, assetsInlineLimit: Infinity, cssCodeSplit: false, modulePreload: false } });

let html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const read = (ref) => fs.readFileSync(path.join(outDir, ref.replace(/^\.\//, '')), 'utf8');

// Inline the stylesheet and the script (a "</script" inside the bundle would end the tag early, so escape it).
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => `<style>\n${read(href)}\n</style>`);
html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_, src) => `<script type="module">\n${read(src).replace(/<\/script/gi, '<\\/script')}\n</script>`);
// Inline the favicon; drop the web-font links (the page falls back to system fonts when offline).
const favicon = fs.readFileSync(path.join(root, 'public', 'favicon.svg'));
html = html.replace(/href="\.\/favicon\.svg"/, `href="data:image/svg+xml;base64,${favicon.toString('base64')}"`);
html = html.replace(/\s*<link rel="preconnect"[^>]*>/g, '').replace(/\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>/g, '');
html = html.replace('<title>CTO Consulting · Proposal Library</title>', '<title>CTO Consulting · Proposal Library (Demo)</title>');

if (/<(script|link)[^>]+(src|href)="(?!data:|#|https:\/\/www\.ctoconsulting)/.test(html)) throw new Error('Offline build still references an external file');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, html);
fs.rmSync(outDir, { recursive: true, force: true });
console.log(`Offline demo written to ${path.relative(root, target)} (${Math.round(html.length / 1024)} KB)`);
