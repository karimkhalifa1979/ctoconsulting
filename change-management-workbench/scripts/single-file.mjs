// Vite plugin for the offline workbench: puts the script, styles, fonts and icon inside one HTML file
// that opens from disk (file://) with no server and no network. Browsers do not load module files or
// chunks from disk, so everything is inlined; the build makes one chunk and inlines every asset.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// Text inside <script> or <style> must not close the element or open an HTML comment. Each sequence is
// written with a \x3C escape, which means "<" in JavaScript strings, template literals and regular
// expressions alike; the build checks that nothing else needed changing.
function scriptSafe(code) {
  let n = 0;
  const out = code.replace(/<(\/script|!--)/gi, (_, rest) => { n++; return `\\x3C${rest}`; });
  return { code: out, escaped: n };
}

export function singleFile({ fileName }) {
  return {
    name: 'cmw-single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!html) this.error('No HTML page in the build.');
      let page = String(html.source);
      let escapedTotal = 0;
      page = page.replace(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g, (tag, file) => {
        const chunk = bundle[file];
        if (!chunk || chunk.type !== 'chunk') this.error(`Script ${file} is not in the build.`);
        // With one chunk there are no import() calls left, so Vite leaves its preload placeholders in
        // place; there is nothing to preload.
        const { code, escaped } = scriptSafe(chunk.code.replaceAll('__VITE_PRELOAD__', 'void 0'));
        escapedTotal += escaped;
        delete bundle[file];
        return `<script type="module">${code}</script>`;
      });
      page = page.replace(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g, (tag, file) => {
        const css = bundle[file];
        if (!css || css.type !== 'asset') this.error(`Stylesheet ${file} is not in the build.`);
        delete bundle[file];
        return `<style>${String(css.source).replace(/<\/style/gi, '\\3C/style')}</style>`;
      });
      page = page.replace(/<link rel="modulepreload"[^>]*>/g, '');
      const icon = readFileSync(`${root}public/favicon.svg`);
      page = page.replace(/href="\.\/favicon\.svg"/, `href="data:image/svg+xml;base64,${icon.toString('base64')}"`);
      const left = Object.keys(bundle).filter((k) => k !== html.fileName);
      if (left.length) this.error(`Not inlined: ${left.join(', ')}`);
      if (/(?:src|href)="\.\//.test(page)) this.error('The page still refers to a separate file.');
      delete bundle[html.fileName];
      this.emitFile({ type: 'asset', fileName, source: page });
      this.info?.(`${fileName}: ${(page.length / 1048576).toFixed(1)} MB, ${escapedTotal} script sequences escaped`);
    },
  };
}

// Modern browsers all read WOFF2, so the WOFF copies of the interface fonts are left out of the offline
// file. (Generated PDFs embed their own WOFF fonts, loaded separately.)
export function woff2Only() {
  return {
    name: 'cmw-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!/@fontsource[\\/]inter[\\/][^\\/]+\.css$/.test(id)) return null;
      return { code: code.replace(/,\s*url\([^)]*\.woff\)\s*format\('woff'\)/g, ''), map: null };
    },
  };
}
