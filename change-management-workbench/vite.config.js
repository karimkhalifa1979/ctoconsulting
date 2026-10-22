import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The same build serves two modes: behind the Node server (REST API) or as a static, browser-only
// demonstration that runs the shared service against an IndexedDB store.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8080' } },
  build: {
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
});
