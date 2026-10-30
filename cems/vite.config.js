import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The client imports the shared domain code (schema, formatting, RAG rules) directly from ../shared.
const api = { target: `http://localhost:${process.env.CEMS_PORT || 8090}`, changeOrigin: false };
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': api, '/auth': api, '/scim': api } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1600, sourcemap: false },
});
