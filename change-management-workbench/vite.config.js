import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { singleFile, woff2Only } from './scripts/single-file.mjs';

// The same build serves two modes: behind the Node server (REST API) or as a static, browser-only
// workbench that runs the shared service against an IndexedDB store. `vite build --mode offline` makes
// the offline workbench: one HTML file, with everything inside it, that opens from disk.
export default defineConfig(({ mode }) => {
  const offline = mode === 'offline';
  return {
    base: './',
    plugins: [react(), ...(offline ? [woff2Only(), singleFile({ fileName: 'Change_Management_Workbench.html' })] : [])],
    server: { proxy: { '/api': 'http://localhost:8080' } },
    publicDir: offline ? false : 'public',
    build: offline
      ? {
        outDir: 'offline',
        emptyOutDir: true,
        assetsInlineLimit: () => true,
        cssCodeSplit: false,
        modulePreload: false,
        chunkSizeWarningLimit: 20000,
        reportCompressedSize: false,
        rolldownOptions: { output: { codeSplitting: false } },
      }
      : {
        chunkSizeWarningLimit: 4000,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
            },
          },
        },
      },
    // Node built-ins are not used in the browser bundle; these keep library feature checks happy.
    define: { 'process.env.NODE_DEBUG': 'false' },
  };
});
