import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Cross-origin isolation is required for SharedArrayBuffer (Phase 2+),
    // so the dev server ships the headers from day one.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
