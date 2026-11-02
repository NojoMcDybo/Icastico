import { defineConfig } from 'vitest/config';

// Tauri expects a fixed port in dev and a static build in dist/.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    target: 'es2022',
    // Verovio ships its WASM inlined in a ~7 MB module; that is expected.
    chunkSizeWarningLimit: 10000,
  },
  optimizeDeps: { exclude: ['verovio'] },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
