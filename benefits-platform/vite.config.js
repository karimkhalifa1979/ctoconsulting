import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the built app run from any path (static hosting or the Node server).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5174, proxy: { '/api': 'http://localhost:8081' } },
  build: { chunkSizeWarningLimit: 1500 },
});
