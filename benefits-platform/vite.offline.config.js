// Offline edition: one self-contained HTML file (scripts, styles, fonts and icon inlined) that
// runs by double-clicking it — no server, no install and no internet connection.
// Build with `npm run build:offline`; the file is written to dist-offline/.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const require = createRequire(import.meta.url);
const OUTPUT = 'CTO_Benefits_Realisation_Platform.html';

const fontFace = (family, pkg, file) => {
  const data = fs.readFileSync(require.resolve(`${pkg}/files/${file}`)).toString('base64');
  return `@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:100 900;src:url(data:font/woff2;base64,${data}) format('woff2')}`;
};

// Text inside an inline <script> or <style> must not close the element early.
const safeScript = (code) => code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const safeStyle = (css) => css.replace(/<\/(style)/gi, '<\\/$1');

function singleFile() {
  return {
    name: 'brp-single-file',
    enforce: 'post',
    transformIndexHtml(html) {
      const icon = fs.readFileSync(new URL('./public/favicon.svg', import.meta.url), 'utf8');
      const fonts = fontFace('Inter', '@fontsource-variable/inter', 'inter-latin-wght-normal.woff2')
        + fontFace('Montserrat', '@fontsource-variable/montserrat', 'montserrat-latin-wght-normal.woff2');
      return html
        .replace(/\s*<link rel="preconnect"[^>]*>/g, '')
        .replace(/\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, `\n    <style>${fonts}</style>`)
        .replace(/href="\.\/favicon\.svg"/, () => `href="data:image/svg+xml,${encodeURIComponent(icon)}"`)
        .replace('<title>CTO Consulting · Benefits Realisation Platform</title>', '<title>CTO Consulting · Benefits Realisation Platform (offline)</title>');
    },
    generateBundle(_, bundle) {
      const page = bundle['index.html'];
      let html = String(page.source);
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type === 'chunk') {
          const tag = new RegExp(`<script type="module" crossorigin src="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"></script>`);
          if (!tag.test(html)) throw new Error(`Could not inline ${name}`);
          // Lazy imports are already inside this one chunk, so there is nothing to preload.
          const code = item.code.replace(/__VITE_PRELOAD__/g, 'void 0');
          html = html.replace(tag, () => `<script type="module">${safeScript(code)}</script>`);
          delete bundle[name];
        } else if (name.endsWith('.css')) {
          const tag = new RegExp(`<link rel="stylesheet" crossorigin href="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`);
          if (!tag.test(html)) throw new Error(`Could not inline ${name}`);
          html = html.replace(tag, () => `<style>${safeStyle(String(item.source))}</style>`);
          delete bundle[name];
        }
      }
      html = html.replace(/\s*<link rel="modulepreload"[^>]*>/g, '');
      if (/\b(src|href)="\.?\/?assets\//.test(html)) throw new Error('An asset was left outside the offline file');
      delete bundle['index.html'];
      this.emitFile({ type: 'asset', fileName: OUTPUT, source: html });
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react(), singleFile()],
  define: { 'import.meta.env.VITE_OFFLINE': JSON.stringify('1') },
  build: {
    outDir: 'dist-offline',
    emptyOutDir: true,
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
