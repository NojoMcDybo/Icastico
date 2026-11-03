// End-to-end check of the real UI in headless Chromium (browser platform:
// the library lives in local storage, external saves are downloads).
// Run after `npm run build`:
//   npm run e2e [-- <output-dir>]
// Exits non-zero on the first failed expectation. Screenshots go to the
// output dir (default: a temp folder).
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
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
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const url = server.resolvedUrls.local[0];
  await page.goto(url);
  await page.waitForSelector('.page svg');

  const title = () => page.textContent('#doc-title');
  const status = () => page.textContent('#status');
  const notes = () => page.locator('.page g.note').count();
  const type = async (...keys) => {
    for (const k of keys) await page.keyboard.press(k);
  };
  const saved = () => page.waitForFunction(() => !document.querySelector('#doc-title')?.textContent?.endsWith('•'), null, { timeout: 5000 });
  /** Files in the (browser) library: path → title. */
  const files = () =>
    page.evaluate(() => {
      const lib = JSON.parse(localStorage.getItem('icastico.browserLibrary') ?? '{"files":{}}');
      return Object.fromEntries(
        Object.entries(lib.files)
          .filter(([p]) => p.endsWith('.icastico'))
          .map(([p, f]) => [p, JSON.parse(f.contents).score.title]),
      );
    });
  const openLibrary = async () => {
    if (await page.locator('#library').isHidden()) await type('Control+o');
    await page.waitForSelector('#library:not([hidden])');
  };
  /** Titles of the tiles (without the collection label next to them). */
  const items = () => page.$$eval('.tile-item .tile__name', (els) => els.map((e) => e.firstChild?.textContent ?? ''));
  const itemMenu = async (titleText, entry) => {
    await page.locator('.tile-item', { hasText: titleText }).first().hover();
    await page.locator('.tile-item', { hasText: titleText }).first().locator('.tile__more').click();
    await page.locator('.menu button', { hasText: entry }).click();
  };
  const view = async (name) => page.locator('.home__pills .pill', { hasText: name }).first().click();
  const openExternal = async (file) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), type('Control+Shift+o')]);
    await chooser.setFiles(file);
  };

  // ── Erster Start ──
  check((await title()) === 'Erste Skizze', 'Erster Start: Beispiel „Erste Skizze“ aus der Bibliothek geöffnet');
  check(JSON.stringify(await files()) === '{"/Icastico/Erste Skizze.icastico":"Erste Skizze"}', 'Bibliotheksordner angelegt, Beispiel darin gespeichert');

  // ── Bibliothek als Startbildschirm (wie Folio) ──
  check(await page.locator('#library').isVisible(), 'Start: die Bibliothek ist der erste Bildschirm');
  await page.waitForSelector('.tile-item .tile__cover img');
  check((await page.locator('.tile-item .tile__cover img').count()) === 1, 'Kachel zeigt die erste Notenseite als Vorschau');
  check((await items()).map((t) => t.trim()).join() === 'Erste Skizze', 'Bibliothek zeigt die Partitur');
  check((await page.locator('.tile-item.is-current').count()) === 1, 'Geöffnete Partitur ist markiert');
  await type('Escape');
  check(await page.locator('#library').isHidden(), 'Esc schließt die Bibliothek');
  await page.click('#library-button');
  check(await page.locator('#library').isVisible(), 'Runder Knopf oben links öffnet sie wieder');
  await type('Escape');
  await type('Control+o');
  check(await page.locator('#library').isVisible(), 'Strg+O öffnet sie auch');

  // ── Neue Partitur landet in der Bibliothek ──
  await page.click('.tile--new');
  await page.waitForSelector('.modal h2:text("Neue Partitur")');
  await page.keyboard.type('Mein Lied');
  await type('Enter');
  await page.waitForFunction(() => document.querySelector('#doc-title')?.textContent === 'Mein Lied');
  check('/Icastico/Mein Lied.icastico' in (await files()), '„+ Neue Partitur“ legt „Mein Lied.icastico“ in der Bibliothek an');

  // ── Automatisch speichern ──
  await type('5', 'c', 'd', 'e');
  check((await title()) === 'Mein Lied •', 'Nach Eingabe: Punkt = noch nicht gespeichert');
  await saved();
  check((await title()) === 'Mein Lied', 'Nach einer Sekunde automatisch gespeichert');

  // ── Titel ändern → Datei wird umbenannt ──
  await type('Escape', 'Control+Comma');
  await page.waitForSelector('.modal h2:text("Partitur-Einstellungen")');
  await page.fill('#f-title', 'Ständchen für Anna');
  await page.click('.modal button[type="submit"]');
  await saved();
  const afterRename = await files();
  check(
    afterRename['/Icastico/Ständchen für Anna.icastico'] === 'Ständchen für Anna' && !('/Icastico/Mein Lied.icastico' in afterRename),
    'Neuer Titel → Datei heißt jetzt „Ständchen für Anna.icastico“ (alte ist weg)',
  );

  // ── Sammlungen ──
  await openLibrary();
  await page.click('.pill--ghost');
  await page.waitForSelector('.modal h2:text("Neue Sammlung")');
  await page.keyboard.type('papierkorb');
  await type('Enter');
  check((await page.textContent('.form__error')).includes('reserviert'), 'Name „Papierkorb“ wird abgelehnt');
  await page.fill('#prompt-input', 'Lieder');
  await type('Enter');
  await page.waitForSelector('.pill.is-active:has-text("Lieder")');
  check((await page.locator('.pill', { hasText: 'Lieder' }).locator('.pill__badge').textContent()) === 'Li', 'Sammlung „Lieder“ als Pille mit Abzeichen „Li“');

  await view('Alle');
  await itemMenu('Ständchen', 'Verschieben nach: Lieder');
  await page.waitForFunction(() => document.querySelector('.tile__where')?.textContent === 'Lieder');
  check('/Icastico/Lieder/Ständchen für Anna.icastico' in (await files()), 'Verschieben legt die Datei in den Ordner „Lieder“');
  await page.screenshot({ path: join(outDir, 'bibliothek.png') });

  // Die offene Partitur ist mitgewandert: weiter tippen speichert am neuen Ort
  // (Esc schließt die Bibliothek, Esc hebt die Auswahl auf, Enter = Cursor ans Ende)
  await type('Escape', 'Escape', 'Enter', 'f');
  check(await page.evaluate(() => document.activeElement === document.body), 'Nach dem Schließen tippt die Tastatur wieder in die Noten (nicht ins Suchfeld)');
  await saved();
  const moved = await page.evaluate(() => JSON.parse(localStorage.getItem('icastico.browserLibrary')).files['/Icastico/Lieder/Ständchen für Anna.icastico'].contents);
  check((moved.match(/"tones"/g) ?? []).length === 4, 'Offene Partitur ist mitgewandert: neue Note landet in der verschobenen Datei');

  // ── Suche + Tastatur ──
  await openLibrary();
  await view('Alle');
  await page.keyboard.type('skiz');
  check((await items()).map((t) => t.trim()).join() === 'Erste Skizze', 'Suche „skiz“ findet nur „Erste Skizze“');
  await type('Enter');
  await page.waitForFunction(() => document.querySelector('#doc-title')?.textContent === 'Erste Skizze');
  check(await page.locator('#library').isHidden(), 'Enter öffnet den Treffer und schließt die Bibliothek');

  // ── Papierkorb ──
  await openLibrary();
  await itemMenu('Ständchen', 'In den Papierkorb');
  await view('Papierkorb');
  check((await items()).map((t) => t.trim()).join() === 'Ständchen für Anna', 'Papierkorb enthält die Partitur');
  await itemMenu('Ständchen', 'Wiederherstellen');
  await view('Lieder');
  check((await items()).map((t) => t.trim()).join() === 'Ständchen für Anna', 'Wiederherstellen bringt sie zurück in „Lieder“');

  // Offene Partitur in den Papierkorb → leerer Zustand
  await view('Alle');
  await itemMenu('Erste Skizze', 'In den Papierkorb');
  check((await page.textContent('.empty-state h2')) === 'Keine Partitur geöffnet', 'Offene Partitur weggeworfen → „Keine Partitur geöffnet“');
  check((await page.locator('.home__back').isHidden()) && (await items()).map((t) => t.trim()).join() === 'Ständchen für Anna', 'Kein Zurück-Knopf mehr, die Kachel ist weg');
  await type('Escape');
  check(await page.locator('#library').isVisible(), 'Ohne offene Partitur bleibt die Bibliothek stehen (Esc führt nicht ins Leere)');
  await page.screenshot({ path: join(outDir, 'leer.png') });

  await openLibrary();
  await view('Papierkorb');
  await itemMenu('Erste Skizze', 'Endgültig löschen');
  await page.click('.modal button[data-id="delete"]');
  check(!('/Icastico/Papierkorb/Erste Skizze.icastico' in (await files())) && (await items()).length === 0, 'Endgültig löschen (mit Rückfrage)');

  // ── Neustart: zuletzt geöffnete Partitur kommt wieder ──
  await view('Lieder');
  await page.locator('.tile-item', { hasText: 'Ständchen' }).locator('.tile').click();
  await page.waitForFunction(() => document.querySelector('#doc-title')?.textContent === 'Ständchen für Anna');
  await page.reload();
  await page.waitForSelector('.page svg');
  check((await title()) === 'Ständchen für Anna' && (await notes()) === 4, 'Nach Neustart: zuletzt geöffnete Partitur, alle 4 Noten da');

  // ── Neue Partitur in der gerade angezeigten Sammlung ──
  await openLibrary();
  await view('Lieder');
  await page.click('.tile--new');
  await page.waitForSelector('.modal h2:text("Neue Partitur")');
  await page.fill('#f-title', 'Wiegenlied');
  await page.click('.instruments li:nth-child(3) button[aria-label$="entfernen"]');
  await page.click('.instruments li:nth-child(2) button[aria-label$="entfernen"]');
  await page.selectOption('#f-key', '2');
  await page.click('button[data-meter="3/4"]');
  await page.selectOption('#f-pickup', '1/4');
  await page.click('.modal button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('#doc-title')?.textContent === 'Wiegenlied');
  check('/Icastico/Lieder/Wiegenlied.icastico' in (await files()), 'Neue Partitur landet in der angezeigten Sammlung „Lieder“');
  check((await page.locator('.page g.keySig').first().locator('use').count()) === 2, 'D-Dur: zwei Kreuze');
  await type('5', 'a', 'd', 'e', 'f', '6', 'g', '5', 'f');
  check((await page.locator('.page g.measure').count()) === 4, 'Auftakt + 3/4: Takte richtig aufgeteilt');
  check((await page.locator('.page g.accid use').count()) === 0, 'F in D-Dur ist Fis: kein Vorzeichen gezeichnet');
  await saved();

  // ── Sammlung umbenennen: offene Partitur wandert mit ──
  await openLibrary();
  await view('Lieder');
  await page.click('.home__pills .round');
  await page.locator('.menu button', { hasText: 'Umbenennen' }).click();
  await page.fill('#prompt-input', 'Volkslieder');
  await type('Enter');
  await page.waitForSelector('.pill.is-active:has-text("Volkslieder")');
  await type('Escape', 'Enter', '7', 'g');
  await saved();
  check('/Icastico/Volkslieder/Wiegenlied.icastico' in (await files()), 'Sammlung umbenannt, offene Partitur speichert am neuen Ort');
  await openLibrary();
  await view('Volkslieder');
  await page.click('.home__pills .round');
  await page.locator('.menu button', { hasText: 'Sammlung löschen' }).click();
  await page.waitForSelector('.modal');
  check((await page.textContent('.modal p')).includes('enthält noch Partituren'), 'Volle Sammlung lässt sich nicht löschen');
  await page.click('.modal button');
  await type('Escape');

  // ── Dateien von außerhalb ──
  const broken = join(outDir, 'Zukunft.icastico');
  writeFileSync(broken, JSON.stringify({ format: 'icastico', version: 99, score: {} }));
  await openExternal(broken);
  await page.waitForSelector('.modal');
  check((await page.textContent('.modal p')).includes('neueren Icastico-Version'), 'Fremddatei aus der Zukunft: klare Meldung');
  await page.click('.modal button');
  check((await title()) === 'Wiegenlied', 'Nach der Fehlermeldung ist die offene Partitur unverändert');

  const junk = join(outDir, 'Einkaufsliste.icastico');
  writeFileSync(junk, 'Milch, Eier, Brot');
  await openExternal(junk);
  await page.waitForSelector('.modal');
  check((await page.textContent('.modal p')).includes('keine Icastico-Datei'), 'Keine Partitur: klare Meldung');
  await page.click('.modal button');

  const [download] = await Promise.all([page.waitForEvent('download'), type('Control+Shift+s')]);
  check(download.suggestedFilename() === 'Wiegenlied.icastico', 'Strg+Umschalt+S speichert eine Kopie außerhalb der Bibliothek');

  // ── Einstellungen: Fehler im Dialog ──
  await page.click('#doc-title');
  await page.waitForSelector('.modal h2:text("Partitur-Einstellungen")');
  await page.fill('#f-from', '99');
  await page.selectOption('#f-key', '3');
  await page.click('.modal button[type="submit"]');
  check((await page.textContent('.form__error')).includes('Takt 99 gibt es nicht'), 'Unmöglicher Takt: Meldung im Dialog, Dialog bleibt offen');
  await type('Escape');

  // ── Noten mit der Maus ziehen ──
  await type('Escape', 'Escape');
  const note = page.locator('.page g.note').first();
  await note.locator('use').first().click({ force: true });
  const before = await status();
  const stepPx = await page.evaluate(() => {
    const staff = document.querySelector('.page g.staff');
    const lines = [...staff.children].filter((c) => c.tagName.toLowerCase() === 'path').slice(0, 5);
    const y = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
    return (y(lines[4]) - y(lines[0])) / 8;
  });
  const box = await note.locator('use').first().boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - stepPx * 2, { steps: 6 });
  await page.mouse.up();
  const after = await status();
  check(after !== before && /Note /.test(after), `Note zwei Stufen nach oben gezogen (${before.split(' · ').slice(-2, -1)} → ${after.split(' · ').slice(-2, -1)})`);
  await type('Control+z');
  check((await status()).split(' · ').slice(-2).join() === before.split(' · ').slice(-2).join() || (await page.textContent('#status')) === 'Rückgängig', 'Strg+Z nimmt das ganze Ziehen in einem Schritt zurück');
  await page.screenshot({ path: join(outDir, 'ziehen.png') });

  // ── Tastenbelegung umschalten: Logic ──
  await type('F1');
  await page.click('[data-preset="logic"]');
  check((await page.textContent('.help__desc')).includes('Klaviatur'), 'Tastenhilfe: auf Logic umgeschaltet');
  await page.screenshot({ path: join(outDir, 'tasten-logic.png') });
  await type('Escape');
  await type('Control+n');
  await page.waitForSelector('.modal h2:text("Neue Partitur")');
  await page.fill('#f-title', 'Logic-Test');
  await page.selectOption('#f-key', '0');
  await page.click('.modal button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('#doc-title')?.textContent === 'Logic-Test');
  await type('3', 'a', 'w', 'Alt+ArrowUp', 'Space');
  await saved();
  const logicFile = Object.entries(await page.evaluate(() => JSON.parse(localStorage.getItem('icastico.browserLibrary')).files)).find(([p]) => p.endsWith('Logic-Test.icastico'))[1].contents;
  check(/"dur": "1\/4", "pitches": \["C5"\][\s\S]*"pitches": \["D5"\]/.test(logicFile), 'Logic-Tasten: 3 = Viertel, A = C, W = Cis, Alt+↑ = Halbton (→ D), Leertaste = Pause');
  check((await page.evaluate(() => localStorage.getItem('icastico.keymap'))) === 'logic', 'Gewählte Belegung wird gemerkt');
  await type('F1');
  await page.click('[data-preset="finale"]');
  await type('Escape');

  check(errors.length === 0, `Keine Fehler in der Konsole${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  console.log(`\nAlle ${step} Prüfungen bestanden. Screenshots: ${outDir}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
