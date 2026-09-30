import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the built app run from any path (static hosting or the Node server).
// Two entry points: the Regulatory Assessment tool (index.html) and the Proposal Platform (proposals.html).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8080' } },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: { input: { main: 'index.html', proposals: 'proposals.html' } },
  },
});
