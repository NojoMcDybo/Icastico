import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Tauri expects a fixed port in dev and a static build in dist/.
export default defineConfig({
  clearScreen: false,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
