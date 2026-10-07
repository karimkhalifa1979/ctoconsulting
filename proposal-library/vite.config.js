import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the built app run from any path on a static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 700 },
});
