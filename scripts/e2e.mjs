// End-to-end check of the real UI in headless Chromium (browser platform:
// save = download, open = file chooser). Run after `npm run build`:
//   npm run e2e [-- <output-dir>]
// Exits non-zero on the first failed expectation. Screenshots go to the
// output dir (default: a temp folder).
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { preview } from 'vite';

// Playwright is not a project dependency (Claude's environment provides it globally).
const { chromium } = createRequire(import.meta.url)('playwright');

const outDir = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'icastico-e2e-'));
mkdirSync(outDir, { recursive: true });

let step = 0;
function check(condition, what) {
  step++;
  if (!condition) throw new Error(`✗ Schritt ${step}: ${what}`);
  console.log(`✓ ${what}`);
}

const server = await preview({ preview: { port: 4174, strictPort: false }, logLevel: 'silent' });
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('.page svg');

  const title = () => page.textContent('#doc-title');
  const status = () => page.textContent('#status');
  const notes = () => page.locator('.page g.note').count();
  const type = async (...keys) => {
    for (const k of keys) await page.keyboard.press(k);
  };
  const saveDownload = async (keys, file) => {
    const [download] = await Promise.all([page.waitForEvent('download'), type(...keys)]);
    await download.saveAs(file);
    return download.suggestedFilename();
  };
  const openFile = async (file) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), type('Control+o')]);
    await chooser.setFiles(file);
  };

  check((await title()) === 'Erste Skizze', 'Start: Demo geladen, nichts ungespeichert');

  await type('Control+n');
  await page.waitForSelector('.modal');
  check((await page.textContent('.modal h2')) === 'Neue Partitur', 'Strg+N bei sauberer Partitur: direkt der Neu-Dialog');
  await page.keyboard.type('Mein Lied');
  await type('Enter');
  check((await page.locator('.modal').count()) === 0 && (await title()) === 'Mein Lied', 'Titel tippen + Enter legt die Partitur an');
  check((await page.locator('.page').textContent()).includes('Mein Lied'), 'Titel steht auf dem Notenblatt');

  await type('5', 'c', 'd', 'e');
  check((await title()) === 'Mein Lied •', 'Nach Eingabe: Punkt im Titel = ungespeichert');

  const saved = join(outDir, 'Mein Lied.icastico');
  const name = await saveDownload(['Control+s'], saved);
  check(name === 'Mein Lied.icastico', `Strg+S schlägt Dateinamen aus dem Titel vor (${name})`);
  check((await title()) === 'Mein Lied.icastico', 'Nach Speichern: Dateiname im Titel, kein Punkt');
  check((await status()) === 'Gespeichert: Mein Lied.icastico', 'Statuszeile bestätigt Speichern');
  const text = readFileSync(saved, 'utf8');
  check(/"pitches": \["C5"\][\s\S]*"pitches": \["D5"\][\s\S]*"pitches": \["E5"\]/.test(text), 'Datei enthält C5 D5 E5');

  await type('f');
  await type('Control+n');
  await page.waitForSelector('.modal');
  check((await page.textContent('.modal h2')) === 'Ungespeicherte Änderungen', 'Strg+N mit Änderungen fragt nach');
  await page.screenshot({ path: join(outDir, 'nachfrage.png') });
  await page.keyboard.press('Escape');
  check((await page.locator('.modal').count()) === 0 && (await notes()) === 4, 'Esc bricht ab, Noten bleiben');

  await type('Control+n');
  await page.click('.modal button[data-id="discard"]');
  await page.waitForSelector('.modal h2:text("Neue Partitur")');
  await type('Enter');
  check((await title()) === 'Ohne Titel' && (await notes()) === 0, '„Nicht speichern“ verwirft, leerer Titel = „Ohne Titel“');

  await openFile(saved);
  await page.waitForFunction(() => document.querySelectorAll('.page g.note').length === 3);
  check((await status()) === 'Geöffnet: Mein Lied.icastico', 'Strg+O öffnet die gespeicherte Datei');
  check((await notes()) === 3, 'Geöffnete Partitur hat genau die 3 gespeicherten Noten');

  await type('Control+z');
  check((await status()) === 'Nichts rückgängig zu machen.', 'Nach dem Öffnen beginnt der Verlauf neu');

  await type('Enter', 'g');
  check((await title()) === 'Mein Lied.icastico •', 'Änderung nach dem Öffnen markiert ungespeichert');
  await type('Control+z');
  check((await title()) === 'Mein Lied.icastico', 'Rückgängig bis zum gespeicherten Stand = wieder sauber');

  const broken = join(outDir, 'Zukunft.icastico');
  writeFileSync(broken, JSON.stringify({ format: 'icastico', version: 99, score: {} }));
  await openFile(broken);
  await page.waitForSelector('.modal');
  check((await page.textContent('.modal p')).includes('neueren Icastico-Version'), 'Datei aus der Zukunft: klare Meldung');
  await page.screenshot({ path: join(outDir, 'fehler.png') });
  await page.click('.modal button');
  check((await notes()) === 3, 'Nach Fehlermeldung ist die alte Partitur unverändert da');

  const junk = join(outDir, 'Einkaufsliste.icastico');
  writeFileSync(junk, 'Milch, Eier, Brot');
  await openFile(junk);
  await page.waitForSelector('.modal');
  check((await page.textContent('.modal p')).includes('keine Icastico-Datei'), 'Fremde Datei: klare Meldung');
  await page.click('.modal button');

  await type('Control+Shift+s');
  check((await page.locator('.modal').count()) === 0, 'Speichern unter: kein Fehler');

  // ── Neue Partitur mit eigenen Einstellungen ──
  await type('Control+n');
  await page.waitForSelector('.modal h2:text("Neue Partitur")');
  await page.fill('#f-title', 'Wiegenlied');
  await page.click('.instruments li:nth-child(3) button[aria-label$="entfernen"]'); // Klavier raus
  await page.click('.instruments li:nth-child(2) button[aria-label$="entfernen"]'); // Gitarre raus
  await page.selectOption('#f-key', '2'); // D-Dur
  await page.click('button[data-meter="3/4"]');
  await page.selectOption('#f-pickup', '1/4');
  await page.screenshot({ path: join(outDir, 'neu-dialog.png') });
  await page.click('.modal button[type="submit"]');
  check((await page.locator('.page g.staff').count()) >= 1 && (await page.textContent('.page')).includes('Wiegenlied'), 'Partitur „Wiegenlied“ angelegt');
  check((await page.locator('.page g.label').allTextContents()).map((t) => t.trim()).join() === 'Gesang', 'Nur Gesang, keine weiteren Instrumente');
  check((await page.locator('.page g.keySig').first().locator('use').count()) === 2, 'D-Dur: zwei Kreuze');
  // Auftakt (Viertel) + zwei volle 3/4-Takte
  await type('5', 'a', 'd', 'e', 'f', '6', 'g', '5', 'f');
  check((await page.locator('.page g.measure').count()) === 4, 'Auftakt + 3/4: Takte richtig aufgeteilt (Auftakt, 2 volle, 1 leerer für den Cursor)');
  check((await page.locator('.page g.measure').first().locator('g.note').count()) === 1, 'Auftakt enthält genau eine Note');
  check((await page.locator('.page g.accid use').count()) === 0, 'F in D-Dur ist Fis: kein Vorzeichen gezeichnet');
  await page.screenshot({ path: join(outDir, 'wiegenlied.png') });

  // ── Einstellungen nachträglich ──
  await type('Escape', 'Control+Comma');
  await page.waitForSelector('.modal h2:text("Partitur-Einstellungen")');
  await page.fill('#f-title', 'Wiegenlied für Anna');
  await page.selectOption('#f-pickup', '0');
  await page.click('.modal button[type="submit"]');
  check((await page.textContent('.page')).includes('Wiegenlied für Anna'), 'Strg+, ändert den Titel');
  check((await page.locator('.page g.measure').first().locator('g.note').count()) === 3, 'Auftakt entfernt: Taktstriche verschieben sich, Noten bleiben');
  await type('Control+z');
  check((await page.locator('.page g.measure').first().locator('g.note').count()) === 1 && (await title()).startsWith('Wiegenlied •'), 'Strg+Z macht die Einstellungen rückgängig');

  await page.click('#doc-title');
  await page.waitForSelector('.modal h2:text("Partitur-Einstellungen")');
  check((await page.inputValue('#f-from')) === '2', 'Einstellungen beziehen sich auf den Takt der Auswahl (2)');
  await page.fill('#f-from', '1');
  await page.selectOption('#f-pickup', '1/2');
  await page.click('button[data-meter="2/4"]');
  check((await page.inputValue('#f-pickup')) === '0', 'Klick auf Titel öffnet Einstellungen; 2/4 verwirft den zu langen Auftakt');
  await page.fill('#f-from', '99');
  await page.click('.modal button[type="submit"]');
  check((await page.textContent('.form__error')).includes('Takt 99 gibt es nicht'), 'Unmöglicher Takt: Meldung im Dialog, Dialog bleibt offen');
  await page.screenshot({ path: join(outDir, 'einstellungen-fehler.png') });
  await type('Escape');
  check((await page.locator('.modal').count()) === 0, 'Esc schließt die Einstellungen ohne Änderung');

  check(errors.length === 0, `Keine Fehler in der Konsole${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  console.log(`\nAlle ${step} Prüfungen bestanden. Screenshots: ${outDir}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
