// Renders the built app (dist/) in headless Chromium and saves a screenshot.
// Usage: npm run build && npm run screenshot -- [output.png] [--click=<svg-id>]
// Used by Claude to verify UI changes without a Windows machine.
import { createRequire } from 'node:module';
import { preview } from 'vite';

// Playwright is not a project dependency (Claude's environment provides it globally).
const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) ?? 'screenshot.png';
const click = args.find((a) => a.startsWith('--click='))?.slice(8);

const server = await preview({ preview: { port: 4173, strictPort: false }, logLevel: 'silent' });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const problems = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(url);
  await page.waitForSelector('.page svg', { timeout: 30000 });
  if (click) await page.locator(`[id="${click}"] use`).first().click({ force: true });
  await page.screenshot({ path: out });
  console.log(`status: ${await page.textContent('#status')}`);
  console.log(problems.length ? problems.join('\n') : 'console: clean');
  console.log(`saved ${out}`);
} finally {
  await browser.close();
  await server.close();
}
