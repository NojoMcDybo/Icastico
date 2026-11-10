import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// What the built app may load and run (desktop window and browser build alike): only its own files. Imported scores
// are foreign data, and the native commands can write files – a script smuggled into the page must not get to run.
// 'wasm-unsafe-eval': the engraver and the speech recogniser are WebAssembly. 'unsafe-eval': the speech recogniser
// (vosk-browser, an old Emscripten build) names its functions with `new Function` inside its worker and does not start
// without it; our own code evaluates no strings. Inline scripts and inline event handlers stay forbidden – that is
// what stops markup smuggled in through a file. blob:/data: are pictures, downloads and workers the app makes itself.
// ipc: is the line to the native side (Tauri). Not in dev: Vite's live reload needs more.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self' data: blob: ipc: http://ipc.localhost",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

// Tauri expects a fixed port in dev and a static build in dist/.
export default defineConfig({
  clearScreen: false,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    {
      name: 'icastico-csp',
      apply: 'build',
      transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    },
  ],
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
