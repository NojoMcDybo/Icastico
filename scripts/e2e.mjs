// End-to-end check of the real UI in headless Chromium (browser platform:
// the library lives in local storage, external saves are downloads).
// Run after `npm run build`:
//   npm run e2e [-- <output-dir>]
// Exits non-zero on the first failed expectation. Screenshots go to the
// output dir (default: a temp folder).
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs';
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
// A fake microphone (Chromium's own beeps) for the voice test dialog
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true, permissions: ['microphone'] });
  await context.addInitScript(() => {
    try {
      if (!localStorage.getItem('icastico.keymap')) localStorage.setItem('icastico.keymap', 'finale');
    } catch {
      // no storage
    }
  });
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
    // After a slow redraw the app draws the next key presses a moment later (one redraw for all): wait for the paper.
    await page.waitForFunction(() => !document.querySelector('#pages[aria-busy]'));
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

  // ── Partitur mit der Maus auf eine Sammlung ziehen ──
  await openLibrary();
  await view('Alle');
  /** Drags the tile of a score onto a pill; tells whether the pill lit up on the way. */
  const dragTile = async (name, pillView) => {
    const from = await page.locator('.tile-item', { hasText: name }).first().locator('.tile__cover').boundingBox();
    const to = await page.locator(`.home__pills .pill[data-view="${pillView}"]`).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 - 30, from.y + from.height / 2 - 30, { steps: 3 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
    const lit = (await page.locator(`.home__pills .pill.is-drop[data-view="${pillView}"]`).count()) === 1 && (await page.locator('.home__drag').count()) === 1;
    await page.mouse.up();
    return lit;
  };
  const hasFile = (path) => page.waitForFunction((p) => p in JSON.parse(localStorage.getItem('icastico.browserLibrary') ?? '{"files":{}}').files, path, { timeout: 5000 });
  const litAll = await dragTile('Wiegenlied', 'all');
  await hasFile('/Icastico/Wiegenlied.icastico');
  check(litAll && !('/Icastico/Volkslieder/Wiegenlied.icastico' in (await files())), 'Bibliothek: eine Kachel auf „Alle“ gezogen holt die Partitur aus ihrer Sammlung (die Pille leuchtet beim Darüberziehen)');
  check(await page.locator('#library').isVisible(), 'Bibliothek: nach dem Ziehen bleibt die Bibliothek offen, die Partitur wird nicht geöffnet');
  const litBack = await dragTile('Wiegenlied', 'collection:Volkslieder');
  await hasFile('/Icastico/Volkslieder/Wiegenlied.icastico');
  check(litBack && (await page.locator('.home__drag').count()) === 0, 'Bibliothek: auf die Sammlung „Volkslieder“ gezogen liegt sie wieder dort');
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
  check(/"dur": "1\/4", "tones": \[\{ "id": "[^"]+", "pitch": "C5" \}\][\s\S]*"pitch": "D5"/.test(logicFile), 'Logic-Tasten: 3 = Viertel, A = C, W = Cis, Alt+↑ = Halbton (→ D), Leertaste = Pause');
  check((await page.evaluate(() => localStorage.getItem('icastico.keymap'))) === 'logic', 'Gewählte Belegung wird gemerkt');
  await type('F1');
  await page.click('[data-preset="finale"]');
  await type('Escape');
  // Suchleiste in der Tastenbelegung
  await type('F1');
  const helpRows = () => page.locator('.help__box dt:not([hidden])').count();
  const allRows = await helpRows();
  await page.fill('.help__search', 'oktave');
  const found = await helpRows();
  check(found >= 1 && found < allRows && (await page.locator('.help__box dt:not([hidden])').first().isVisible()), 'Tastenhilfe: die Suchleiste zeigt nur die Funktionen zum Suchwort');
  await page.fill('.help__search', 'xyzqq');
  check((await helpRows()) === 0 && (await page.locator('.help__none').isVisible()), 'Tastenhilfe: ohne Treffer steht dort „Dazu gibt es keine Taste“');
  await page.fill('.help__search', '?');
  check(await page.locator('.help').isVisible(), 'Tastenhilfe: ein „?“ im Suchfeld schließt die Hilfe nicht');
  await type('Escape');
  check(await page.locator('.help').isHidden(), 'Tastenhilfe: Esc schließt sie auch aus dem Suchfeld');

  // ── Piano-Roll: zweite Ansicht derselben Töne ──
  await type('Control+Shift+P');
  check(await page.locator('#roll').isVisible(), 'Piano-Roll öffnet sich (Strg+Umschalt+P)');
  const bars = page.locator('.roll__bar');
  const barTitle = (i) => bars.nth(i).evaluate((e) => e.querySelector('title').textContent);
  const barsBefore = await bars.count();
  check(barsBefore >= 2, `Piano-Roll zeigt die Töne als Balken (${barsBefore})`);
  const firstTitle = await barTitle(0);
  // Klaviatur links: bleibt beim seitlichen Scrollen sichtbar und spielt beim Klick
  check((await page.locator('.roll__keycol .roll__pkey').count()) > 12 && (await page.locator('.roll__keycol .roll__pkey--black').count()) > 4, 'Piano-Roll: links steht eine Klaviatur mit weißen und schwarzen Tasten');
  const keyX = () => page.locator('.roll__keycol').evaluate((e) => Math.round(e.getBoundingClientRect().x));
  await page.setViewportSize({ width: 600, height: 900 }); // narrow and zoomed in, so the roll has to scroll
  for (let k = 0; k < 4; k++) await page.locator('.roll__zoom[aria-label^="Vergrößern"]').first().click();
  await page.waitForTimeout(300);
  const keysAt0 = await keyX();
  await page.locator('.roll__scroll').first().evaluate((e) => { e.scrollLeft = 5000; });
  await page.waitForTimeout(150);
  check(Math.abs((await keyX()) - keysAt0) <= 1 && (await page.locator('.roll__scroll').first().evaluate((e) => e.scrollLeft)) > 10, 'Piano-Roll: die Klaviatur bleibt beim Scrollen nach rechts an ihrem Platz');
  await page.screenshot({ path: join(outDir, 'klaviatur.png') });
  // Synthesizer-Klang der Roll: Schalter, gemerkt
  const synthButton = page.locator('.roll__synth').first();
  check((await synthButton.getAttribute('aria-pressed')) === 'false', 'Piano-Roll: der Synthesizer-Klang ist zunächst aus');
  await synthButton.click();
  check((await synthButton.getAttribute('aria-pressed')) === 'true' && (await page.evaluate(() => localStorage.getItem('icastico.rollSynth'))) === '1', 'Piano-Roll: „Synth“ schaltet den Synthesizer-Klang ein (und merkt es sich)');
  await page.click('.transport__buttons button[aria-label="Zum Anfang"]');
  await page.click('.transport__play');
  await page.waitForFunction(() => document.querySelector('.transport__play')?.getAttribute('aria-pressed') === 'true');
  await page.waitForTimeout(500);
  check(!/Fehler|nicht verfügbar/.test(await status()), 'Piano-Roll: mit Synthesizer-Klang läuft die Wiedergabe ohne Fehler');
  await page.click('.transport__stop');
  await synthButton.click();
  check((await synthButton.getAttribute('aria-pressed')) === 'false', 'Piano-Roll: „Synth“ schaltet wieder auf die Instrumentenklänge');
  await page.locator('.roll__scroll').first().evaluate((e) => { e.scrollLeft = 0; });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.waitForTimeout(300);

  await bars.first().click();
  check((await page.locator('.roll__bar.is-selected').count()) === 1 && /Note C5/.test(await status()), 'Klick auf einen Balken wählt den Ton (auch in der Statuszeile)');

  const barBox = await bars.first().boundingBox();
  const bx = barBox.x + barBox.width / 2;
  const by = barBox.y + barBox.height / 2;
  await page.mouse.move(bx, by);
  await page.mouse.down();
  await page.mouse.move(bx, by - 28, { steps: 6 });
  const during = await barTitle(0);
  await page.mouse.up();
  check(during !== firstTitle && (await barTitle(0)) === during, `Balken zwei Reihen nach oben gezogen (${firstTitle.split(' · ')[0]} → ${during.split(' · ')[0]})`);
  await type('Control+z');
  check((await barTitle(0)) === firstTitle, 'Strg+Z nimmt das ganze Ziehen in einem Schritt zurück');

  await page.mouse.move(bx, by);
  await page.mouse.down();
  await page.mouse.move(bx, by - 28, { steps: 6 });
  await type('Escape');
  await page.mouse.up();
  check((await barTitle(0)) === firstTitle, 'Esc während des Ziehens verwirft die Änderung vollständig');

  const nextBox = await bars.nth(1).boundingBox();
  await page.mouse.move(bx, by);
  await page.mouse.down();
  await page.mouse.move(bx + (nextBox.x - barBox.x), by, { steps: 6 });
  await page.mouse.up();
  const dropped = await Promise.all([bars.nth(0).boundingBox(), bars.nth(1).boundingBox()]);
  check((await bars.count()) === barsBefore && Math.abs(dropped[0].x - dropped[1].x) < 1.5 && !/schon eine Note/.test(await status()), 'Ziehen auf eine andere Note überschreibt nichts: beide Töne stehen jetzt übereinander (Akkord oder zweite Stimme)');
  await type('Control+z');
  check((await barTitle(0)) === firstTitle && (await bars.count()) === barsBefore, 'Strg+Z nimmt das Aufeinanderziehen zurück');

  const endBox = await bars.nth(1).boundingBox();
  await page.mouse.move(endBox.x + endBox.width - 3, endBox.y + endBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox.x + endBox.width + 57, endBox.y + endBox.height / 2, { steps: 8 });
  await page.mouse.up();
  check((await bars.nth(1).boundingBox()).width > endBox.width + 40, 'Am Balkenende ziehen verlängert die Note (Raster Sechzehntel)');
  await type('Control+z');
  // Empty cell in the free third beat, three rows above the first bar (which is in view).
  const emptyY = barBox.y - 14 * 3 + 7;
  const emptyX = barBox.x + barBox.width * 2.3;
  await page.mouse.move(emptyX, emptyY);
  await page.mouse.down();
  await page.mouse.move(emptyX + 40, emptyY, { steps: 6 });
  await page.mouse.up();
  check((await bars.count()) === barsBefore + 1, 'Auf leerer Fläche ziehen zeichnet einen neuen Balken');
  await type('Control+z');
  check((await bars.count()) === barsBefore, 'Strg+Z entfernt den gezeichneten Balken');
  await page.screenshot({ path: join(outDir, 'piano-roll.png') });
  await type('Control+Shift+P');
  check(await page.locator('#roll').isHidden(), 'Strg+Umschalt+P schließt die Piano-Roll wieder');

  // ── Zeilenart und Ansichtsgrößen (T15) ──
  const switchBtn = page.locator('.staff-mode').first();
  check((await switchBtn.count()) === 1 && (await page.locator('#roll').isHidden()), 'Neben der Notenzeile sitzt ein Schalter; ohne Roll ist die Dock leer');
  await switchBtn.click();
  check((await page.locator('.roll').count()) === 1 && (await page.locator('.roll').isVisible()) && (await page.locator('.canvas').isVisible()), 'Schalter 1: „Beides“ – Notenschrift und Piano-Roll stehen untereinander');
  await bars.first().click();
  check((await page.locator('.page .is-selected').count()) >= 1, 'Klick in der Roll markiert denselben Ton in der Notenschrift');
  await page.locator('.page g.note').first().locator('use').first().click();
  check((await page.locator('.roll__bar.is-selected').count()) === 1, 'Klick in der Notenschrift markiert denselben Ton in der Roll');

  const handle = page.locator('.roll__resize');
  const rollHeight = () => page.locator('.roll').evaluate((e) => Math.round(e.getBoundingClientRect().height));
  const dragHandle = async (dy) => {
    const b = await handle.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + dy, { steps: 8 });
    await page.mouse.up();
  };
  const h0 = await rollHeight();
  await dragHandle(-150);
  check((await rollHeight()) > h0 + 100 && !(await page.locator('.roll').evaluate((e) => e.classList.contains('is-compact'))), 'Oberkante nach oben gezogen: die Roll bekommt mehr Platz');
  await dragHandle(-400);
  check((await page.locator('.canvas').getAttribute('data-size')) === 'small' && (await page.locator('.page g.note').count()) > 0, 'Sehr groß gezogen: die Notenschrift wird zur schmalen Übersicht und bleibt sichtbar');
  await page.screenshot({ path: join(outDir, 'roll-gross.png') });
  await handle.dblclick();
  check((await rollHeight()) === h0 && (await page.locator('.canvas').getAttribute('data-size')) === 'normal', 'Doppelklick auf die Kante gibt die Standardhöhe zurück');
  await dragHandle(400);
  check((await page.locator('.roll').evaluate((e) => e.classList.contains('is-compact'))) && (await rollHeight()) < 120, 'Nach unten gezogen: die Roll ist eine schmale Leiste');
  await page.locator('.roll__bar').first().click();
  check((await page.locator('.roll__bar.is-selected').count()) === 1, 'In der schmalen Leiste lässt sich ein Ton anklicken');
  await handle.focus();
  await type('ArrowUp', 'ArrowUp', 'ArrowUp');
  check(!(await page.locator('.roll').evaluate((e) => e.classList.contains('is-compact'))), 'Pfeil hoch an der Kante macht die Roll auch per Tastatur größer');
  await handle.dblclick();

  await page.locator('.roll .lane__group[aria-label="Zeilenart"] button:text-is("Roll")').click();
  check((await page.locator('.canvas').isHidden()) && (await page.locator('.staff-mode').count()) === 0 && (await page.locator('.roll').isVisible()), 'Zeilenart „Roll“: die Zeile verschwindet aus der Notenschrift');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#doc-title')?.textContent === 'Logic-Test');
  check((await page.locator('.roll').isVisible()) && (await page.locator('.canvas').isHidden()), 'Nach Neustart ist die Zeilenart der Partitur wieder da');
  await type('Escape'); // the library opens first after a start
  await page.locator('.roll .lane__group[aria-label="Zeilenart"] button:text-is("Noten")').click();
  check((await page.locator('.canvas').isVisible()) && (await page.locator('#roll').isHidden()) && (await page.locator('.page g.note').count()) >= 2, 'Zeilenart „Noten“: die Zeile ist zurück, die Roll weg');
  await page.screenshot({ path: join(outDir, 'zeilenart.png') });

  // ── T7–T9: Akkordton lösen, Haltebögen, Gleiten ──
  await type('Control+n');
  await page.waitForSelector('.modal h2:text("Neue Partitur")');
  await page.fill('#f-title', 'Bogen-Test');
  await page.selectOption('#f-key', '0');
  await page.click('.modal button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('#doc-title')?.textContent === 'Bogen-Test');
  await type('5', 'c', 'Shift+g', 'c', 'c', 'd', 'Escape'); // chord C+G, C, C, D – quarters without gaps
  await type('Control+Shift+P');
  check((await bars.count()) === 5, 'Neue Partitur: Akkord C+G, C, C, D – fünf Balken in der Roll');
  const barWidth = async (i) => {
    // The roll draws its bars anew when its size settles: a bar caught in between has no box yet.
    for (let attempt = 0; attempt < 20; attempt++) {
      const box = await bars.nth(i).boundingBox();
      if (box) return box.width;
      await page.waitForTimeout(50);
    }
    throw new Error(`Balken ${i} der Piano-Roll ist nicht zu sehen`);
  };
  const chordLowBefore = await barWidth(0);

  await bars.nth(1).click(); // the G of the chord
  await type('Control+Shift+D');
  check((await page.locator('.roll__bar.is-secondary').count()) === 1 && (await page.locator('.roll__bar.is-secondary.is-selected').count()) === 1, 'T7: Der angeklickte Akkordton liegt in einer eigenen Stimme (gestrichelter Balken)');
  check((await page.locator('.page g.layer').count()) >= 2, 'T7: Die Notenschrift zeigt jetzt zwei Stimmen auf der Zeile');
  await type('Control+Shift+ArrowRight'); // lengthen the lone G by the chosen value (a quarter)
  const lone = await page.locator('.roll__bar.is-secondary title').textContent();
  check(Math.abs((await barWidth(0)) - chordLowBefore) < 1 && /Halbe/.test(lone), 'T7: Der gelöste Ton wird länger, das C im Akkord bleibt gleich lang');
  await type('Control+z', 'Control+z');
  check((await page.locator('.roll__bar.is-secondary').count()) === 0 && (await bars.count()) === 5, 'T7: Zweimal Rückgängig stellt den Akkord wieder her');

  await bars.nth(3).click(); // the second single C – its neighbour is the D
  await type('t');
  check((await page.locator('.roll__link--tie').count()) === 0 && /Bindebogen/.test(await status()) && (await page.locator('.page g.slur').count()) === 1, 'T8: zu einer anderen Tonhöhe gibt T keinen Haltebogen, sondern einen Bindebogen');
  await type('t');
  check((await page.locator('.page g.slur').count()) === 0, 'T8: noch einmal T löst den Bindebogen');
  await bars.nth(2).click(); // the first single C – next is the other C
  await type('t');
  check((await page.locator('.roll__link--tie').count()) === 1 && (await page.locator('.page g.tie').count()) === 1, 'T8: Haltebogen zwischen zwei gleichen Noten – in Roll und Notenschrift gezeichnet');
  await type('ArrowUp');
  check(!/zerreißen/.test(await status()) && (await page.locator('.roll__link--tie').count()) === 1, 'T8: Ein Ton unter Haltebogen lässt sich umstimmen, der Bogen bleibt (der Partner zieht mit)');
  await type('ArrowDown');
  await type('t');
  check((await page.locator('.roll__link--tie').count()) === 0 && (await bars.count()) === 5, 'T8: Noch einmal T löst den Haltebogen, beide Noten bleiben');

  await bars.nth(3).click();
  await type('Control+Shift+G');
  check((await page.locator('.roll__link--slide').count()) === 1 && (await page.locator('.roll__link--slide.is-direct').count()) === 1, 'T9: Gleiten gesetzt; ohne Lücke nur der direkte Wechsel (gepunktet)');
  await bars.nth(4).click();
  await type('Alt+ArrowRight');
  check((await page.locator('.roll__link--slide:not(.is-direct)').count()) === 1 && (await page.locator('.page g.gliss').count()) === 1, 'T9: Nach dem Auseinanderziehen gleitet es durch die Lücke – Linie in Roll und Notenschrift');
  check((await page.locator('.page').first().textContent()).includes('port.'), 'T9: Die Notenschrift trägt „port.“');
  await page.screenshot({ path: join(outDir, 'verbindungen.png') });
  await type('Alt+ArrowLeft');
  check((await page.locator('.roll__link--slide.is-direct').count()) === 1, 'T9: Wieder zusammengeschoben bleibt die Gleitverbindung erhalten');
  // Gleiten per Ziehen: vom Punkt am Balkenende auf einen beliebigen anderen Balken (nicht nur den nächsten)
  await bars.nth(3).click();
  await type('Control+Shift+G'); // takes the glide away again
  check((await page.locator('.roll__link--slide').count()) === 0, 'Gleiten per Tastatur wieder gelöst');
  const sourceTone = await bars.nth(2).getAttribute('data-tone');
  const dot = page.locator(`.roll__dot[data-tone="${sourceTone}"][data-end="end"]`);
  const db = await dot.boundingBox();
  const targetBox = await bars.nth(4).boundingBox(); // skips the neighbour
  await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  check((await page.locator('.roll__rubber').count()) === 1, 'Beim Ziehen vom Punkt erscheint eine Gummilinie');
  await page.mouse.up();
  check((await page.locator('.roll__link--slide').count()) === 1 && (await page.locator('.page g.gliss').count()) === 1, 'Punkt per Ziehen mit einem entfernteren Balken verbunden: Gleiten in Roll und Notenschrift');
  await type('Control+z');
  check((await page.locator('.roll__link--slide').count()) === 0, 'Die Verbindung per Ziehen ist ein einziger Rückgängig-Schritt');
  await type('Control+Shift+Z');
  await saved();
  const linked = Object.entries(await page.evaluate(() => JSON.parse(localStorage.getItem('icastico.browserLibrary')).files)).find(([p]) => p.endsWith('Bogen-Test.icastico'))[1].contents;
  check(/"links": \[\s*\{ "id": "link-1", "kind": "slide"/.test(linked), 'T9: Die Gleitverbindung steht in der gespeicherten Datei');
  await type('Control+Shift+P');

  // ── Transportleiste: Anzeige, Tempo, Wiedergabe ──
  const lcd = (label) => page.locator('.lcd__cell', { hasText: label }).locator('.lcd__value');
  check((await lcd('TAKT').first().textContent()) !== '' && (await lcd('TEMPO').textContent()) === '100' && (await lcd('TONART').textContent()) === 'Cmaj', 'Transportleiste zeigt Takt, Tempo 100 und Tonart Cmaj');
  await page.click('.lcd__cell:has-text("TEMPO")');
  await page.fill('.lcd__input', '132');
  await type('Enter');
  check((await lcd('TEMPO').textContent()) === '132', 'Tempo antippen und 132 eintippen ändert das Tempo');
  await type('Control+z');
  check((await lcd('TEMPO').textContent()) === '100', 'Das Tempo lässt sich mit Strg+Z zurücknehmen');
  await page.click('.lcd__cell:has-text("TAKTART")');
  check(await page.locator('.modal').isVisible(), 'Auf die Taktart klicken öffnet die Partitur-Einstellungen');
  await type('Escape');
  // Tempo wie bei Logic: auf die Zahl drücken und nach oben / unten ziehen
  const tempoBox = await page.locator('.lcd__cell:has-text("TEMPO")').boundingBox();
  await page.mouse.move(tempoBox.x + tempoBox.width / 2, tempoBox.y + tempoBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(tempoBox.x + tempoBox.width / 2, tempoBox.y + tempoBox.height / 2 - 30, { steps: 6 });
  await page.mouse.up();
  check((await lcd('TEMPO').textContent()) === '130' && !(await page.locator('.lcd__input').count()), 'Tempo: nach oben ziehen macht schneller (30 Pixel = 30 Schläge), kein Eingabefeld');
  await type('Control+z');
  check((await lcd('TEMPO').textContent()) === '100', 'Tempo: das ganze Ziehen ist ein einziger Rückgängig-Schritt');
  await page.mouse.move(tempoBox.x + tempoBox.width / 2, tempoBox.y + tempoBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(tempoBox.x + tempoBox.width / 2, tempoBox.y + tempoBox.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  check((await lcd('TEMPO').textContent()) === '80', 'Tempo: nach unten ziehen macht langsamer');
  await type('Control+z');
  // Quintenzirkel statt Einstellungsmenü
  await page.click('.lcd__cell:has-text("TONART")');
  await page.waitForSelector('.keypicker');
  await page.screenshot({ path: join(outDir, 'quintenzirkel.png'), clip: { x: 500, y: 0, width: 460, height: 400 } });
  check(!(await page.locator('.modal').count()) && (await page.locator('.keypicker__seg--major').count()) >= 12 && (await page.locator('.keypicker__seg--minor').count()) >= 12 && (await page.locator('.keypicker__seg.is-current title').first().textContent())?.startsWith('C-Dur'), 'Tonart: ein Klick öffnet den Quintenzirkel (kein Einstellungsmenü), C-Dur ist markiert');
  await page.click('.keypicker__seg--major:has(title:text-is("D-Dur / h-Moll (2 ♯)"))');
  await page.waitForFunction(() => document.querySelectorAll('.lcd__value')[4]?.textContent === 'Dmaj');
  check((await page.locator('.keypicker').count()) === 0, 'Tonart: ein Klick auf D im Quintenzirkel setzt D-Dur und schließt ihn');
  await type('Control+z');
  await page.waitForFunction(() => document.querySelectorAll('.lcd__value')[4]?.textContent === 'Cmaj');
  await page.click('.lcd__cell:has-text("TONART")');
  await page.waitForSelector('.keypicker');
  await type('Escape');
  check((await page.locator('.keypicker').count()) === 0, 'Tonart: Esc schließt den Quintenzirkel');
  // Die Leiste oben bleibt, wo sie ist: ein sehr langer Titel und eine lange Anzeige verschieben nichts
  const spots = () => page.evaluate(() => ['#roll-button', '#symbols-button', '.lcd', '.transport__buttons', '.help-button'].map((q) => Math.round(document.querySelector(q).getBoundingClientRect().x)));
  const barBefore = await spots();
  await page.evaluate(() => {
    document.getElementById('doc-title').textContent = 'Ein ganz langer Titel '.repeat(8);
    document.getElementById('mode').textContent = '● Aufnahme · Eingabe · Zweiunddreißigstel · Einfügen · Akkord · Haltebogen ⌒';
  });
  check(JSON.stringify(barBefore) === JSON.stringify(await spots()), 'Obere Leiste: Knöpfe, Anzeige und Transport bleiben bei langem Titel und langer Modus-Anzeige an ihrem Platz');
  await page.screenshot({ path: join(outDir, 'leiste.png'), clip: { x: 0, y: 0, width: 1400, height: 64 } });
  await page.click('.transport__buttons button[aria-label="Zum Anfang"]');
  check((await lcd('SCHLAG').textContent()) === '1', 'Zum Anfang springt auf Takt 1, Schlag 1');
  await page.click('.transport__buttons button[aria-label="Einen Takt vor"]');
  check((await lcd('TAKT').first().textContent()) === '2', 'Einen Takt vor');
  await page.click('.transport__buttons button[aria-label="Zum Anfang"]');
  await page.click('.transport__play');
  await page.waitForFunction(() => document.querySelector('.transport__play')?.getAttribute('aria-pressed') === 'true');
  await page.waitForFunction(() => document.querySelectorAll('.lcd__value')[1]?.textContent !== '1', null, { timeout: 30000 });
  check(true, 'Wiedergabe läuft: Schlag und Takt in der Anzeige laufen mit der Audiouhr (die Instrumentenklänge sind geladen)');
  check((await page.evaluate(() => globalThis.__icasticoHz?.() ?? -1)) >= 0 && !/nicht verfügbar/.test(await status()), 'Die Instrumentenklänge wurden geladen, kein Rückfall auf den einfachen Klang');
  await page.click('.transport__stop');
  await page.waitForFunction(() => document.querySelector('.transport__play')?.getAttribute('aria-pressed') === 'false');
  check(true, 'Stopp hält die Wiedergabe an');
  // Sound wirklich weg: schon eingeplante Noten (bis zu einer Sekunde im Voraus) dürfen nach „Stopp“ nicht mehr klingen
  await page.click('.transport__buttons button[aria-label="Zum Anfang"]');
  await page.click('.transport__play');
  await page.waitForFunction(() => (globalThis.__icasticoHz?.() ?? 0) > 0, null, { timeout: 30000 });
  await page.click('.transport__stop');
  // innerhalb einer halben Sekunde still – und danach bleibt es still (nichts Eingeplantes klingt später nach)
  await page.waitForFunction(() => (globalThis.__icasticoHz?.() ?? 1) === 0, null, { polling: 50, timeout: 700 });
  let quiet = true;
  for (let k = 0; k < 25; k++) {
    await page.waitForTimeout(100);
    if ((await page.evaluate(() => globalThis.__icasticoHz?.() ?? -1)) !== 0) quiet = false;
  }
  check(quiet, 'Stopp macht still und es bleibt still: auch bereits eingeplante Noten klingen nicht weiter');
  // Leertaste halten + Klick: ab dort abspielen; neben dem Notensystem: von vorn
  const pressed = () => page.waitForFunction(() => document.querySelector('.transport__play')?.getAttribute('aria-pressed') === 'true');
  await page.keyboard.down('Space');
  await page.locator('.page g.note').last().click({ force: true });
  await page.keyboard.up('Space');
  await pressed();
  // in Takt 2 angeklickt: schon in der ersten halben Sekunde Takt 2 (von vorn bräuchte es mehrere Sekunden)
  await page.waitForFunction(() => Number(document.querySelectorAll('.lcd__value')[0]?.textContent) >= 2, null, { timeout: 600 });
  check(true, 'Leertaste halten und in die letzte Note klicken: spielt ab dieser Stelle (Takt 2), nicht von vorn');
  await page.click('.transport__stop');
  await page.waitForFunction(() => document.querySelector('.transport__play')?.getAttribute('aria-pressed') === 'false');
  await page.keyboard.down('Space');
  const pageBox = await page.locator('.page').first().boundingBox();
  await page.mouse.click(pageBox.x + 14, pageBox.y + pageBox.height - 10);
  await page.keyboard.up('Space');
  await pressed();
  await page.waitForFunction(() => document.querySelectorAll('.lcd__value')[0]?.textContent === '1', null, { timeout: 10000 });
  check(true, 'Leertaste halten und neben das Notensystem klicken: spielt von Anfang an');
  await page.click('.transport__stop');
  await page.waitForFunction(() => document.querySelector('.transport__play')?.getAttribute('aria-pressed') === 'false');
  await type('Control+Enter');
  await page.waitForFunction(() => document.querySelector('.transport__play')?.getAttribute('aria-pressed') === 'true');
  await type('Control+Enter');
  check(true, 'Strg+Eingabe startet und stoppt die Wiedergabe');
  // Leertaste wie bei Finale: startet und stoppt, ohne dass man vorher ins Bild klicken muss (der Fokus darf auf einem Knopf liegen)
  const isPlaying = (on) => page.waitForFunction((v) => document.querySelector('.transport__play')?.getAttribute('aria-pressed') === v, String(on), { timeout: 30000 });
  await page.keyboard.press('Space');
  await isPlaying(true);
  await page.keyboard.press('Space');
  await isPlaying(false);
  check(true, 'Die Leertaste startet und stoppt die Wiedergabe');
  await page.click('.transport__play');
  await isPlaying(true);
  await page.keyboard.press('Space');
  await isPlaying(false);
  check(true, 'Die Leertaste stoppt, auch wenn der Fokus auf dem Abspielknopf liegt (kein Klick ins Bild nötig)');
  await page.click('.transport__play');
  await isPlaying(true);
  await page.click('.transport__stop');
  await isPlaying(false);
  await page.click('.transport__stop');
  check((await lcd('TAKT').first().textContent()) === '1', 'Der Stopp-Knopf hält an, ein zweites Mal springt er zum Anfang');
  // Beim Abspielen wird die klingende Note blau; nach dem Stopp ist sie es nicht mehr
  await page.click('.transport__buttons button[aria-label="Zum Anfang"]');
  await page.click('.transport__play');
  await isPlaying(true);
  await page.waitForFunction(() => document.querySelectorAll('.page g.is-playing').length > 0, null, { timeout: 8000 });
  check(true, 'Beim Abspielen wird die klingende Note blau');
  await page.click('.transport__stop');
  await isPlaying(false);
  check((await page.locator('.page g.is-playing').count()) === 0, 'Nach dem Stopp ist keine Note mehr blau');
  // Eine geänderte Note wird angehört – auch mit den Pfeiltasten (die Klänge sind vom Abspielen schon geladen)
  await page.locator('.page g.note').first().click({ force: true });
  await page.waitForTimeout(700);
  await type('ArrowUp');
  await page.waitForFunction(() => (globalThis.__icasticoHz?.() ?? 0) > 0, null, { polling: 30, timeout: 3000 });
  check(true, 'Pfeil hoch auf einer Note: der neue Ton wird angespielt');
  await page.waitForFunction(() => (globalThis.__icasticoHz?.() ?? 1) === 0, null, { timeout: 4000 });
  await type('Control+z');
  for (let k = 0; k < 8; k++) await page.click('.transport__buttons button[aria-label="Einen Takt vor"]');
  const lastBar = Number(await lcd('TAKT').first().textContent());
  check(lastBar >= 2, `Vorspulen bleibt am letzten Takt (Takt ${lastBar}) stehen, springt nicht zurück zum Anfang`);
  check(!(await page.locator('.transport__record').isDisabled()), 'Der Aufnahmeknopf ist bedienbar');
  await page.screenshot({ path: join(outDir, 'transport.png') });

  // ── Akkorde: Akkordmodus, Aufeinanderziehen, Überzeichnen ──
  const newScore = async (name) => {
    await type('Control+n');
    await page.waitForSelector('.modal h2:text("Neue Partitur")');
    await page.fill('#f-title', name);
    await page.selectOption('#f-key', '0');
    await page.click('.modal button[type="submit"]');
    await page.waitForFunction((n) => document.querySelector('#doc-title')?.textContent === n, name);
  };
  await newScore('Akkord-Test');
  await type('5', 'Backquote', 'c', 'e', 'g');
  check(/Akkord/.test(await page.textContent('#mode')) && (await page.locator('.page g.chord').count()) === 1, 'Akkordmodus (Taste links neben der 1): C, E, G stehen als ein Akkord, die Anzeige sagt „Akkord“');
  await type('Backquote', 'd', 'Escape');
  check((await page.locator('.page g.chord').count()) === 1 && (await notes()) === 4, 'Akkordmodus aus: das nächste D folgt hinter dem Akkord');
  await type('Control+Shift+P');
  const chordBars = await Promise.all([0, 1, 2, 3].map((i) => bars.nth(i).boundingBox()));
  check((await bars.count()) === 4 && Math.abs(chordBars[0].x - chordBars[2].x) < 1 && chordBars[3].x > chordBars[0].x + 20, 'Roll: drei Balken übereinander (Akkord), das D dahinter');
  await type('Control+Shift+P');

  // Notenschrift: eine Note auf eine andere ziehen
  await newScore('Zieh-Test');
  await type('5', 'c', 'e', 'g', 'Escape');
  const noteCount = await notes();
  const heads = page.locator('.page g.note');
  const h1 = await heads.nth(0).boundingBox();
  const h3 = await heads.nth(2).boundingBox();
  await page.mouse.move(h1.x + h1.width / 2, h1.y + h1.height / 2);
  await page.mouse.down();
  await page.mouse.move(h3.x + h3.width / 2, h3.y + h3.height / 2, { steps: 12 });
  await page.mouse.up();
  check((await page.locator('.page g.chord').count()) === 1 && (await notes()) === noteCount, 'Notenschrift: Note auf eine andere gezogen – beide klingen jetzt zusammen (ein Akkord)');
  await type('Control+z');
  check((await page.locator('.page g.chord').count()) === 0, 'Strg+Z nimmt das Aufeinanderziehen zurück');

  // Piano-Roll: mit Alt über eine bestehende Note zeichnen
  await type('Control+Shift+P');
  const rollBars = await bars.count();
  const target = await bars.nth(1).boundingBox();
  await page.keyboard.down('Alt');
  await page.mouse.move(target.x + 4, target.y + target.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 4 + 70, target.y + target.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  check((await bars.count()) === rollBars + 1 && (await page.locator('.roll__bar.is-secondary').count()) === 1, 'Roll: Alt + Ziehen über einer Note zeichnet eine neue – anderer Anfang/Länge = zweite Stimme (gestrichelt)');
  await type('Escape');
  await page.screenshot({ path: join(outDir, 'akkorde.png') });
  await type('Control+z');
  check((await bars.count()) === rollBars, 'Strg+Z nimmt die überzeichnete Note zurück');
  // gleicher Anfang und gleiche Länge = Akkord
  const same = await bars.nth(1).boundingBox();
  await page.keyboard.down('Alt');
  await page.mouse.move(same.x + 3, same.y - 14 * 2 + 7);
  await page.mouse.down();
  await page.mouse.move(same.x + same.width - 2, same.y - 14 * 2 + 7, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const stacked = (await Promise.all([0, 1, 2, 3].map((i) => bars.nth(i).boundingBox()))).filter((b) => Math.abs(b.x - same.x) < 1).length;
  check((await bars.count()) === rollBars + 1 && (await page.locator('.roll__bar.is-secondary').count()) === 0 && stacked === 2, 'Roll: gleicher Anfang und gleiche Länge – die neue Note wird Teil des Akkords (keine zweite Stimme)');
  await type('Control+Shift+P');

  // ── Lautstärke, Ein-/Ausblenden und Gleitverlauf (Menü an Balken und Gleit-Linie) ──
  await newScore('Verlauf-Test');
  await type('5', 'c', '0', 'd', 'Escape');
  await type('Control+Shift+P');
  await bars.nth(0).click();
  const shape = page.locator('.shape');
  check((await shape.isVisible()) && /Lautstärke · C5/.test(await shape.locator('.shape__title').textContent()), 'Klick auf einen Balken öffnet das Lautstärke-Menü');
  await shape.locator('input[type="range"]').fill('50');
  check(/mp · 50/.test(await shape.locator('output').textContent()) && /mp/.test(await barTitle(0)), 'Lautstärke-Regler: 50 = mp, auch im Hinweis des Balkens');
  const curveBox = await shape.locator('.shape__curve').boundingBox();
  const lineY = curveBox.y + 14; // full loudness = the top line
  await page.mouse.move(curveBox.x + 14 + 118, lineY);
  await page.mouse.down();
  await page.mouse.move(curveBox.x + 14 + 118, lineY + 80, { steps: 8 });
  await page.mouse.up();
  check((await shape.locator('.shape__point').count()) === 3 && (await page.locator('.roll__env').count()) === 1, 'Auf die Linie klicken setzt einen Punkt, Ziehen formt die Linie – in der Roll erscheint die Lautstärkelinie im Balken');
  await page.mouse.move(curveBox.x + 14 + 40, curveBox.y + 60);
  await type('p');
  check((await shape.locator('.shape__point').count()) === 4, 'Taste P setzt einen weiteren Punkt an der Mausstelle');
  await page.screenshot({ path: join(outDir, 'lautstaerke-menue.png') });
  await shape.locator('.shape__preset', { hasText: 'Einblenden' }).click();
  check((await shape.locator('.shape__point').count()) === 3, 'Voreinstellung „Einblenden“ ersetzt die Linie');
  await type('Escape');
  check(await shape.isHidden(), 'Esc schließt das Menü');
  await type('Control+z', 'Control+z', 'Control+z', 'Control+z');
  check(!/mp/.test(await barTitle(0)) && (await page.locator('.roll__env').count()) === 0, 'Rückgängig nimmt Lautstärke und Linie Schritt für Schritt zurück');

  await bars.nth(0).click();
  await type('Escape');
  await type('Control+Shift+G');
  check((await page.locator('.roll__link--slide:not(.is-direct)').count()) === 1, 'Gleiten mit Lücke gesetzt');
  await page.locator('.roll__linkhit').click();
  check((await shape.isVisible()) && /Übergang · C5 → D5/.test(await shape.locator('.shape__title').textContent()) && (await shape.locator('input[type="range"]').isHidden()), 'Klick auf die Gleit-Linie öffnet das Verlaufsmenü');
  await shape.locator('.shape__preset', { hasText: 'Erst langsam' }).click();
  check((await page.locator('.roll__link--slide.is-shaped').count()) === 1, 'Voreinstellung „Erst langsam“: die Gleit-Linie wird gekrümmt gezeichnet');
  await page.screenshot({ path: join(outDir, 'gleitverlauf.png') });
  await type('Escape');
  await saved();
  const shaped = Object.entries(await page.evaluate(() => JSON.parse(localStorage.getItem('icastico.browserLibrary')).files)).find(([p]) => p.endsWith('Verlauf-Test.icastico'))[1].contents;
  check(/"version": 15/.test(shaped) && /"curve": \[\[0, 0\], \[0\.5, 0\.15\], \[1, 1\]\]/.test(shaped), 'Der Gleitverlauf steht in der gespeicherten Datei (Format 15)');
  await type('Control+Enter');
  await page.waitForFunction(() => document.querySelector('.transport__play')?.getAttribute('aria-pressed') === 'true', null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await type('Control+Enter');
  check(!/nicht verfügbar|Fehler/.test(await status()), 'Wiedergabe mit Gleitverlauf läuft ohne Fehler');
  await type('Control+Shift+P');

  // ── MusicXML importieren (Strg+Umschalt+I) ──
  const xmlNote = (step, octave, duration, more = '') => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration>${more}</note>`;
  const sample = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>Aus Finale</work-title></work>
  <part-list><score-part id="P1"><part-name>Klavier</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>2</divisions><key><fifths>1</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
      <direction><sound tempo="96"/></direction>
      ${xmlNote('B', 4, 2, '<voice>1</voice><staff>1</staff>')}${xmlNote('D', 5, 2, '<chord/><voice>1</voice><staff>1</staff><lyric number="1"><text>la</text></lyric><lyric number="2"><text>li</text></lyric>')}${xmlNote('G', 4, 4, '<voice>1</voice><staff>1</staff><tie type="start"/>')}
      <backup><duration>6</duration></backup>
      ${xmlNote('G', 2, 6, '<voice>2</voice><staff>2</staff>')}
    </measure>
    <measure number="2">
      ${xmlNote('G', 4, 4, '<voice>1</voice><staff>1</staff><tie type="stop"/>')}${xmlNote('A', 4, 2, '<voice>1</voice><staff>1</staff>')}
      <backup><duration>6</duration></backup>
      ${xmlNote('D', 3, 6, '<voice>2</voice><staff>2</staff>')}
    </measure>
  </part>
</score-partwise>`;
  const chooser = page.waitForEvent('filechooser');
  await type('Control+Shift+I');
  await (await chooser).setFiles({ name: 'finale-export.musicxml', mimeType: 'application/xml', buffer: Buffer.from(sample) });
  await page.waitForSelector('.modal h2:text("Import abgeschlossen")');
  check(/Weitere Strophen: 1×/.test(await page.locator('.modal').textContent()), 'MusicXML-Import: ein Hinweis nennt, was nicht übernommen wurde (zweite Strophe)');
  await page.click('.modal button:text("OK")');
  await page.waitForFunction(() => document.querySelector('#doc-title')?.textContent === 'Aus Finale');
  check((await page.locator('.page g.note').count()) >= 5 && (await page.locator('.page g.chord').count()) === 1 && (await page.locator('.page g.tie').count()) === 1, 'MusicXML-Import: Noten, Akkord und Haltebogen erscheinen in der Notenschrift');
  check((await lcd('TEMPO').textContent()) === '96' && (await lcd('TAKT').first().textContent()) !== '', 'MusicXML-Import: Tempo 96 übernommen');
  await page.screenshot({ path: join(outDir, 'import.png') });
  await saved();
  check(Object.keys(await files()).some((p) => p.endsWith('Aus Finale.icastico')), 'Die importierte Partitur liegt in der Bibliothek');
  const bad = page.waitForEvent('filechooser');
  await type('Control+Shift+I');
  await (await bad).setFiles({ name: 'kaputt.xml', mimeType: 'application/xml', buffer: Buffer.from('<html></html>') });
  await page.waitForSelector('.modal h2:text-matches("konnte nicht importiert werden")');
  check(/keine MusicXML-Partitur/.test(await page.locator('.modal').textContent()), 'Eine Datei, die kein MusicXML ist, wird mit klarer Meldung abgelehnt');
  await page.click('.modal button:text("OK")');

  // ── MIDI aus Logic und Einzelstimmen-Aufnahmen importieren (ADR 0028) ──
  const varLen = (n) => { const b = [n & 0x7f]; for (let r = n >>> 7; r > 0; r >>>= 7) b.unshift((r & 0x7f) | 0x80); return b; };
  const midiTrack = (events) => { const body = events.flatMap(([d, bytes]) => [...varLen(d), ...bytes]).concat([0, 0xff, 0x2f, 0]); return [0x4d, 0x54, 0x72, 0x6b, (body.length >>> 24) & 255, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255, ...body]; };
  const name = 'Melodie';
  const midiEvents = [[0, [0xff, 0x03, name.length, ...Buffer.from(name)]], [0, [0xff, 0x51, 3, 0x07, 0xa1, 0x20]], [0, [0xff, 0x58, 4, 4, 2, 24, 8]]];
  let lastTick = 0;
  [60, 62, 64, 65].forEach((key, i) => { const on = i * 480 + [0, 12, -8, 10][i]; midiEvents.push([Math.max(0, on - lastTick), [0x90, key, 90]], [430, [0x80, key, 0]]); lastTick = on + 430; });
  const midiBytes = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0, ...midiTrack(midiEvents)]);
  const midiChooser = page.waitForEvent('filechooser');
  await type('Control+Shift+I');
  await (await midiChooser).setFiles({ name: 'logic-spur.mid', mimeType: 'audio/midi', buffer: midiBytes });
  await page.waitForSelector('.modal h2:text("MIDI importieren")');
  check((await page.inputValue('#imp-tempo')) === '120' && /Melodie/.test(await page.locator('.import__tracks').textContent()) && (await page.inputValue('#imp-meter')) === '4/4', 'MIDI-Import: das Fenster zeigt Spur, Taktart und das Tempo aus der Datei');
  await page.screenshot({ path: join(outDir, 'import-midi-fenster.png') });
  await page.click('.modal button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('#doc-title')?.textContent === 'logic-spur');
  check((await page.locator('.page g.note').count()) === 4 && (await lcd('TEMPO').textContent()) === '120', 'MIDI-Import: vier Noten stehen auf dem Raster, Tempo 120');
  await saved();

  const sampleRate = 22050;
  const frames = [];
  [67, 69, 71, 72].forEach((midi, i) => { const f = 440 * 2 ** ((midi - 69) / 12); for (let k = 0; k < sampleRate * 0.54; k++) { const t = k / sampleRate; const edge = Math.min(1, t / 0.01, (0.54 - t) / 0.01); frames.push(0.3 * edge * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t))); } for (let k = 0; k < sampleRate * 0.06; k++) frames.push(0); });
  const pcm = Buffer.alloc(frames.length * 2);
  frames.forEach((v, i) => pcm.writeInt16LE(Math.round(v * 32767), i * 2));
  const wavHeader = Buffer.alloc(44);
  wavHeader.write('RIFF', 0); wavHeader.writeUInt32LE(36 + pcm.length, 4); wavHeader.write('WAVEfmt ', 8); wavHeader.writeUInt32LE(16, 16); wavHeader.writeUInt16LE(1, 20); wavHeader.writeUInt16LE(1, 22); wavHeader.writeUInt32LE(sampleRate, 24); wavHeader.writeUInt32LE(sampleRate * 2, 28); wavHeader.writeUInt16LE(2, 32); wavHeader.writeUInt16LE(16, 34); wavHeader.write('data', 36); wavHeader.writeUInt32LE(pcm.length, 40);
  const wavChooser = page.waitForEvent('filechooser');
  await type('Control+Shift+I');
  await (await wavChooser).setFiles({ name: 'gesang.wav', mimeType: 'audio/wav', buffer: Buffer.concat([wavHeader, pcm]) });
  await page.waitForSelector('.modal h2:text("Aufnahme in Noten umwandeln")');
  check(/4 Töne erkannt/.test(await page.locator('.modal').textContent()), 'Aufnahme-Import: die Aufnahme wird ausgewertet, vier Töne werden gefunden');
  await page.fill('#imp-tempo', '100');
  await page.click('.modal button[type="submit"]');
  await page.waitForSelector('.modal h2:text("Import abgeschlossen")');
  check(/4 Töne aus der Aufnahme erkannt/.test(await page.locator('.modal').textContent()), 'Aufnahme-Import: ein Hinweis bittet, Tonhöhen und Rhythmus durchzusehen');
  await page.click('.modal button:text("OK")');
  await page.waitForFunction(() => document.querySelector('#doc-title')?.textContent === 'gesang');
  check((await page.locator('.page g.note').count()) === 4, 'Aufnahme-Import: vier Noten in der Partitur');
  await page.screenshot({ path: join(outDir, 'import-aufnahme.png') });
  await saved();

  const badAudio = page.waitForEvent('filechooser');
  await type('Control+Shift+I');
  await (await badAudio).setFiles({ name: 'kaputt.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('das ist keine Musik') });
  await page.waitForSelector('.modal h2:text-matches("konnte nicht importiert werden")');
  check(/WAV oder AIFF/.test(await page.locator('.modal').textContent()), 'Eine kaputte Audiodatei wird mit klarer Meldung abgelehnt (Hinweis auf WAV / AIFF)');
  await page.click('.modal button:text("OK")');

  // ── Finale-Ziffernblock: Enter wiederholt, Ziffernblock = Notenwert, Zahlenreihe = Intervall ──
  await type('F1');
  await page.click('[data-preset="speedy"]');
  check((await page.textContent('.help__desc')).includes('Ziffernblock'), 'Tastenhilfe: auf Finale-Ziffernblock umgeschaltet');
  await type('Escape');
  await newScore('Ziffernblock-Test');
  await type('Numpad4', 'ArrowUp');
  check((await notes()) === 0 && (await page.locator('.ghost__head').count()) === 1 && (await page.locator('.ghost__label').textContent()) !== '', 'Ziffernblock: Die Vorschau-Note steht am Cursor, noch ist keine Note gesetzt');
  await page.screenshot({ path: join(outDir, 'vorschau-note.png') });
  await type('Enter', '3', 'Enter');
  check((await notes()) === 3 && (await page.locator('.page g.chord').count()) === 1, 'Ziffernblock: Enter setzt die Vorschau-Note, mit der 3 kommt eine Terz darüber, Enter setzt den Akkord');
  await saved();
  const speedyFile = Object.entries(await page.evaluate(() => JSON.parse(localStorage.getItem('icastico.browserLibrary')).files)).find(([path]) => path.endsWith('Ziffernblock-Test.icastico'))[1].contents;
  check((speedyFile.match(/"dur": "1\/8"/g) ?? []).length === 2, 'Ziffernblock 4 macht die Vorschau-Note zum Achtel, beide gesetzten Noten sind Achtel');
  await type('F1');
  await page.click('[data-preset="finale"]');
  await type('Escape');

  // ── Sprachbefehle (Attrappe ohne Mikrofon, Paket 1–2 des Plans) ──
  await newScore('Sprach-Test');
  const mode = () => page.textContent('#mode');
  await page.evaluate(() => window.__voiceHear('vier', 0.95));
  check(/Achtel/.test(await mode()) && /verstanden: vier → Achtel/.test(await status()), 'Sprache: „vier“ stellt auf Achtel und die Statuszeile sagt, was verstanden wurde');
  await page.evaluate(() => window.__voiceHear('Viertel', 0.9));
  check(/Viertel/.test(await mode()), 'Sprache: „Viertel“ wirkt wie die Taste 5');
  await page.evaluate(() => window.__voiceHear('vier', 0.4));
  check(/Viertel/.test(await mode()) && /nicht verstanden/.test(await status()), 'Sprache: unsicher erkannt = nichts passiert, Statuszeile sagt „nicht verstanden“');
  await page.evaluate(() => window.__voiceHear('Blumenkohl', 0.99));
  check(/Viertel/.test(await mode()) && /nicht verstanden/.test(await status()), 'Sprache: unbekanntes Wort = nichts passiert');
  await page.evaluate(() => window.__voiceHear('Achtel', 0.95));
  await type('c');
  await page.evaluate(() => window.__voiceHear('rückgängig', 0.95));
  check((await notes()) === 0, 'Sprache: „rückgängig“ nimmt die eingegebene Note zurück');
  await type('Escape');
  check((await page.locator('.voice-field').count()) === 0, 'Das Sprach-Testfeld ist im normalen Start nicht da');
  const testPage = await context.newPage();
  await testPage.goto(`${url}?voice=test`);
  await testPage.waitForSelector('.voice-field input');
  await testPage.fill('.voice-field input', 'Blumenkohl');
  await testPage.keyboard.press('Enter');
  check(/nicht verstanden/.test((await testPage.textContent('#status')) ?? '') || (await testPage.locator('.voice-field input').inputValue()) === '', 'Sprach-Testfeld (?voice=test): ein getipptes Wort wird entgegengenommen');
  await testPage.close();

  // ── Startbild: Akkord als Sand auf der Platte (nur mit ?splash, sonst stört es die Tests) ──
  check((await page.locator('#splash').count()) === 0, 'Startbild: im automatischen Test nicht da');
  const splashPage = await context.newPage();
  await splashPage.goto(`${url}?splash`);
  await splashPage.waitForSelector('#splash canvas');
  await splashPage.waitForFunction(() => document.querySelector('.splash__chord')?.classList.contains('is-on'));
  check(/E7♯9/.test((await splashPage.textContent('.splash__chord')) ?? ''), 'Startbild: der Akkord E7♯9 wird gezeigt');
  await splashPage.waitForTimeout(400);
  const sand = await splashPage.evaluate(() => {
    const c = document.querySelector('.splash canvas');
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) lit++;
    return lit;
  });
  check(sand > 5000, 'Startbild: der Sand ist auf der Platte gezeichnet');
  await splashPage.keyboard.press('x');
  await splashPage.waitForSelector('#splash', { state: 'detached', timeout: 15000 });
  check((await splashPage.locator('.workstation').count()) === 1, 'Startbild: ein Tastendruck beendet es, die Anwendung ist da');
  await splashPage.close();

  // ── Aufnahmeknopf: Sprache und MIDI-Keyboard hören zu ──
  await newScore('Aufnahme-Test');
  await page.evaluate(() => {
    const keyboard = { name: 'Test-Keyboard', onmidimessage: null };
    window.__midiKeyboard = keyboard;
    navigator.requestMIDIAccess = async () => ({ inputs: { forEach: (cb) => cb(keyboard) }, onstatechange: null });
  });
  const press = (...keys) => page.evaluate((k) => k.forEach((n) => window.__midiKeyboard.onmidimessage?.({ data: new Uint8Array([0x90, n, 100]) })), keys);
  await type('5');
  await page.click('.transport__record');
  await page.waitForFunction(() => /hört zu/.test(document.querySelector('#status')?.textContent ?? ''), null, { timeout: 90000 });
  const listening = await status();
  check(/Sprache/.test(listening) && /Test-Keyboard/.test(listening) && /● Aufnahme/.test(await mode()), 'Aufnahme: der Knopf startet Sprache (Mikrofon, Sprachmodell) und MIDI-Keyboard, die Anzeige zeigt „● Aufnahme“');
  await press(64);
  check((await notes()) === 1, 'Aufnahme: eine MIDI-Taste gibt eine Note ein');
  await page.waitForTimeout(150); // a pause between the chords (a key within 60 ms of the first joins it)
  await press(67, 71);
  check((await notes()) === 3 && (await page.locator('.page g.chord').count()) === 1, 'Aufnahme: zwei Tasten zugleich werden ein Akkord auf einer Note');
  await type('r');
  check((await page.getAttribute('.transport__record', 'aria-pressed')) === 'false' && !/● Aufnahme/.test(await mode()), 'Aufnahme: die Taste R schaltet die Aufnahme wieder aus');
  await press(72);
  check((await notes()) === 3, 'Aufnahme aus: das Keyboard gibt keine Noten mehr ein');
  await type('Escape');

  // ── Mehrere Noten und Takte markieren: Umschalt+Pfeil, Rahmen aufziehen, Doppelklick auf einen Takt ──
  await newScore('Auswahl-Test');
  await type('5', 'c', 'd', 'e', 'f', 'g', 'a', 'b', 'c', 'Escape');
  await page.locator('.page g.note').nth(1).click({ force: true });
  await type('Shift+ArrowRight', 'Shift+ArrowRight');
  check((await page.locator('.page g.is-range').count()) >= 3 && /3 Noten markiert/.test(await status()), 'Auswahl: Umschalt + Pfeil nach rechts markiert mehrere Noten');
  await type('Escape', 'Escape');
  const firstBox = await page.locator('.page g.note').first().boundingBox();
  const lastNoteBox = await page.locator('.page g.note').nth(3).boundingBox();
  const frameBox = await page.locator('.page').first().boundingBox();
  await page.mouse.move(firstBox.x - 8, frameBox.y + frameBox.height - 12);
  await page.mouse.down();
  await page.mouse.move(lastNoteBox.x + lastNoteBox.width + 8, firstBox.y - 6, { steps: 8 });
  check((await page.locator('.frame-select').count()) === 1, 'Auswahl: ein Rahmen über leerem Papier aufziehen zeigt einen blauen Rahmen');
  await page.mouse.up();
  check((await page.locator('.page g.is-range').count()) >= 4 && /Noten markiert/.test(await status()), 'Auswahl: die Noten im Rahmen sind markiert');
  await type('Escape', 'Escape');
  const barNote = await page.locator('.page g.note').nth(5).boundingBox();
  await page.mouse.dblclick(barNote.x + barNote.width / 2, barNote.y + barNote.height / 2);
  check((await page.locator('.page g.is-range').count()) >= 3 && /Noten markiert/.test(await status()), 'Auswahl: ein Doppelklick auf einen Takt markiert alle seine Noten');
  await type('Escape', 'Escape');

  // ── Partitur-Einstellungen: Instrumente und Tabulatur nachträglich ──
  await page.click('#doc-title');
  await page.waitForSelector('.modal h2:text("Partitur-Einstellungen")');
  await page.click('.modal [data-instrument="guitar"]');
  check((await page.locator('.instruments--new li').count()) === 1 && (await page.locator('.instruments--new input[type="checkbox"]').isChecked()), 'Einstellungen: „+ Gitarre“ fügt eine neue Zeile hinzu, die Tabulatur ist gleich mit an');
  await page.click('.modal button[type="submit"]');
  await page.waitForFunction(() => document.querySelectorAll('.page g.staff').length >= 3);
  check((await page.locator('.page text, .page tspan').filter({ hasText: /^Tab$/ }).count()) >= 1 || (await page.locator('.page g.staff').count()) >= 3, 'Einstellungen: die neue Gitarrenzeile mit Tabulatur steht in der Partitur');
  await type('Control+z');

  // ── Partitur-Einstellungen: Zeile umbenennen und entfernen ──
  const openSettings = async () => {
    await page.click('#doc-title');
    await page.waitForSelector('.modal h2:text("Partitur-Einstellungen")');
  };
  const applySettings = async () => {
    await page.click('.modal button[type="submit"]');
    await page.waitForSelector('.modal', { state: 'detached' });
  };
  await openSettings();
  const linesBefore = await page.locator('.instruments--have li').count();
  await page.click('.modal [data-instrument="piano"]');
  await applySettings();
  await openSettings();
  await page.fill('.instruments--have li:first-child .instruments__name', 'Sopran-Test');
  await page.click('.instruments--have li:last-child [data-remove]');
  check((await page.locator('.instruments--have li').count()) === linesBefore + 1 && (await page.locator('.instruments--have li.is-removed').count()) === 1, 'Einstellungen: ✕ streicht eine Zeile durch, sie bleibt bis „Übernehmen“ stehen');
  await applySettings();
  check((await page.locator('.page g.label').filter({ hasText: 'Sopran-Test' }).count()) >= 1, 'Einstellungen: die umbenannte Zeile heißt in der Partitur „Sopran-Test“');
  await openSettings();
  check((await page.locator('.instruments--have li').count()) === linesBefore, 'Einstellungen: die entfernte Zeile ist aus der Partitur verschwunden');
  for (const b of await page.locator('.instruments--have [data-remove]').all()) await b.click();
  await page.click('.modal button[type="submit"]');
  check(/Mindestens ein Instrument/.test(await page.textContent('.modal .form__error')), 'Einstellungen: die letzte Zeile lässt sich nicht entfernen');
  await type('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
  await type('Control+z', 'Control+z');
  check((await page.locator('.page g.label').filter({ hasText: 'Sopran-Test' }).count()) === 0, 'Einstellungen: Strg+Z nimmt Umbenennen und Entfernen zurück');

  // ── Tonart-Fenster: Transponieren steht darunter ──
  await page.click('.lcd__cell:has-text("TONART")');
  await page.waitForSelector('.keypicker');
  await page.click('.keypicker__transpose');
  await page.waitForSelector('.transpose .wheel');
  check((await page.locator('.keypicker').count()) === 0, 'Tonart: der Knopf „Transponieren …“ unter dem Quintenzirkel öffnet das Transponieren-Fenster');
  await page.click('.transpose button:has-text("Abbrechen")');
  await page.waitForSelector('.transpose', { state: 'detached' });

  // ── Transponieren: Schalter chromatisch / diatonisch und ein Rad mit den Intervallen ──
  await newScore('Transpo-Test');
  await type('5', 'c', 'd', 'e', 'Escape');
  await page.locator('.page g.note').first().click({ force: true });
  await type('Control+Shift+t');
  await page.waitForSelector('.transpose .wheel');
  check((await page.locator('.wheel__item').count()) === 27 && (await page.locator('.wheel__item.is-chosen').textContent()) === 'Prim' && /Ganze/.test(await page.locator('.transpose__scope').textContent()), 'Transponieren: das Rad zeigt die Intervalle von der Oktave abwärts bis aufwärts, die Prim in der Mitte');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => /große Sekunde|kleine Terz/.test(document.querySelector('.wheel__item.is-chosen')?.textContent ?? ''));
  await page.waitForFunction(() => /^Beispiel: C → /.test(document.querySelector('.transpose__example')?.textContent ?? ''));
  const chosen = await page.locator('.wheel__item.is-chosen').textContent();
  check(/aufwärts/.test(chosen) && /Beispiel: C → /.test(await page.locator('.transpose__example').textContent()), `Transponieren: ↓ dreht das Rad zum nächsten Intervall (${chosen}), darunter steht ein Beispiel`);
  const wheelBox = await page.locator('.wheel').boundingBox();
  await page.mouse.move(wheelBox.x + wheelBox.width / 2, wheelBox.y + wheelBox.height / 2);
  await page.mouse.wheel(0, 76);
  await page.waitForFunction((before) => document.querySelector('.wheel__item.is-chosen')?.textContent !== before, chosen);
  check(true, 'Transponieren: das Mausrad dreht das Rad (wie der iPhone-Timer), die Zeile rastet in der Mitte ein');
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(outDir, 'transponieren.png') });
  await page.click('.transpose__toggle button:has-text("Diatonisch")');
  check((await page.locator('.wheel__item').count()) === 15, 'Transponieren: der Schalter „Diatonisch“ zeigt die Stufen (Sekunde bis Oktave)');
  await page.keyboard.press('Escape');
  check((await page.locator('.transpose').count()) === 0, 'Transponieren: Esc schließt den Dialog, nichts ändert sich');
  await type('Control+Shift+t');
  await page.waitForSelector('.transpose .wheel');
  await page.click('.transpose__toggle button:has-text("Chromatisch")');
  await page.waitForFunction(() => document.querySelectorAll('.wheel__item').length === 27);
  await page.locator('.wheel__item:text-is("reine Quinte aufwärts")').click({ force: true });
  await page.waitForFunction(() => /Quinte aufwärts/.test(document.querySelector('.wheel__item.is-chosen')?.textContent ?? ''));
  await page.keyboard.press('Enter');
  check(/Töne transponiert/.test(await status()) && (await page.locator('.transpose').count()) === 0, 'Transponieren: Enter transponiert um die gewählte Quinte, die Statuszeile meldet es');
  await type('Control+z');
  check(!/Töne transponiert/.test(await status()), 'Transponieren: Strg+Z nimmt es in einem Schritt zurück');

  // ── Bereich markieren: löschen, kopieren, einfügen, in Schleife abspielen ──
  await newScore('Bereich-Test');
  await type('5', 'c', 'd', 'e', 'f', 'g', 'Escape');
  check((await notes()) === 5, 'Bereich: fünf Noten stehen in der Notenschrift');
  await page.locator('.page g.note').first().click({ force: true });
  await type('Alt+Shift+ArrowRight', 'Alt+Shift+ArrowRight');
  check((await page.locator('.page g.is-range').count()) >= 3 && /3 Noten markiert/.test(await status()), 'Bereich: Alt+Umschalt+→ markiert die gewählte und die nächsten Noten (blau)');
  await type('Control+c');
  await page.locator('.page g.note').nth(4).click({ force: true });
  await type('Control+v');
  check((await notes()) === 7, 'Bereich: Strg+C und Strg+V fügen die drei Noten an der gewählten Stelle ein');
  await page.locator('.page g.note').first().click({ force: true });
  await type('Alt+Shift+ArrowRight', 'Delete');
  check((await notes()) === 5, 'Bereich: Entf löscht die markierten Noten (sie werden zu Pausen)');
  await type('Control+z');
  await page.locator('.page g.note').first().click({ force: true });
  await page.keyboard.down('Shift');
  await page.locator('.page g.note').nth(2).click({ force: true });
  await page.keyboard.up('Shift');
  check((await page.locator('.page g.is-range').count()) >= 3, 'Bereich: Umschalt + Klick markiert von der gewählten bis zur angeklickten Note');
  await type('Control+x');
  check((await notes()) === 4, 'Bereich: Strg+X schneidet den Bereich aus (3 Noten weg, eine Pause bleibt als Lücke)');
  await type('Control+z');
  await page.locator('.page g.note').first().click({ force: true });
  await type('Alt+Shift+ArrowRight', 'Control+l');
  await page.waitForFunction(() => document.querySelector('.transport__play')?.getAttribute('aria-pressed') === 'true', null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  check((await page.locator('.transport__play').getAttribute('aria-pressed')) === 'true', 'Bereich: Strg+L spielt den markierten Bereich in Schleife (läuft auch nach seinem Ende weiter)');
  await page.click('.transport__stop');
  await page.waitForFunction(() => document.querySelector('.transport__play')?.getAttribute('aria-pressed') === 'false');

  // ── Noten diktieren: Notennamen per Sprache ──
  await newScore('Diktat-Test');
  await page.evaluate(() => window.__voiceHear('fünf', 0.95));
  await page.evaluate(() => window.__voiceHear('zeh', 0.5)); // the recogniser reports letters with about 0.5
  await page.evaluate(() => window.__voiceHear('fis', 0.53));
  check(/verstanden: fis → Fis/.test(await status()), 'Diktat: „fünf“, „zeh“ (= C) und „fis“ einzeln gesprochen: Viertel, C und Fis, die Statuszeile nennt das letzte Wort');
  check((await notes()) === 2 && (await page.locator('.page g.accid').count()) >= 1, 'Diktat: die zwei Noten stehen in der Notenschrift, Fis mit Kreuz');
  await page.evaluate(() => window.__voiceHear('b', 0.95));
  await page.evaluate(() => window.__voiceHear('c d', 0.95));
  check((await notes()) === 3 && /nicht verstanden/.test(await status()), 'Diktat: „b“ gibt B ein; zwei Wörter in einem Atemzug werden nicht ausgeführt');
  await page.evaluate(() => window.__voiceHear('d', 0.5));
  check((await notes()) === 3, 'Diktat: ein unsicher erkanntes „d“ (unter 0,8) wird nicht ausgeführt');
  await type('Escape');

  // ── Sprachtest-Dialog (Paket 3): Mikrofon, Sprachmodell, Erkennung, Auswertung, Ergebnisdatei ──
  await type('Control+Shift+v');
  await page.waitForSelector('.voicetest');
  await page.waitForFunction(() => /Bereit/.test(document.querySelector('.voicetest__status')?.textContent ?? ''), null, { timeout: 90000 });
  check(true, 'Sprachtest: Mikrofon und Sprachmodell (Vosk) sind geladen');
  await page.keyboard.down('Space');
  await page.waitForTimeout(1500);
  await page.keyboard.up('Space');
  await page.waitForSelector('.voicetest__answer b', { timeout: 30000 });
  check((await page.locator('.voicetest__answer b').count()) === 2, 'Sprachtest: nach dem Loslassen antworten beide Erkenner (Wortliste und frei)');
  await page.screenshot({ path: join(outDir, 'sprachtest.png') });
  await page.click('.voicetest button:has-text("Beenden und auswerten")');
  await page.waitForSelector('.voicetest__table');
  check((await page.locator('.voicetest__table tr').count()) === 3, 'Sprachtest: die Auswertung zeigt eine Zeile je Erkenner');
  const voiceDownload = page.waitForEvent('download');
  await page.click('.voicetest button:has-text("Ergebnis speichern")');
  const resultFile = JSON.parse(readFileSync(await (await voiceDownload).path(), 'utf8'));
  check(resultFile.format === 'icastico-sprachtest' && resultFile.words.length > 39 && resultFile.words.some((w) => w.clip), 'Sprachtest: die Ergebnisdatei enthält Wortliste, Ergebnisse und die Aufnahme');
  await page.click('.voicetest button:has-text("Schließen")');
  await page.waitForSelector('.voicetest', { state: 'detached' });

  // ── Liedtext und Akkordsymbole (L, K) ──
  await newScore('Leadsheet-Test');
  await type('5', 'c', 'd', 'e', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft');
  await type('k');
  await page.waitForSelector('.modal h2:text("Akkordsymbol")');
  await page.fill('#prompt-input', 'Am7');
  await page.click('.modal button[type="submit"]');
  await type('l');
  await page.waitForSelector('.lyrics:not([hidden])');
  await page.fill('.lyrics__text', 'Hal-lo Welt');
  check((await page.locator('.lyrics__chip').count()) === 3 && /Silbe 1 von 3/.test(await page.locator('.lyrics__status').textContent()), 'Liedtext-Feld: der Text mit Bindestrichen wird in drei Silben zerlegt');
  const noteAt = (i) => page.locator('.page g.note').nth(i).click({ force: true });
  await noteAt(0);
  check(/Silbe 2 von 3/.test(await page.locator('.lyrics__status').textContent()) && (await page.locator('.lyrics__chip.is-done').count()) === 1, 'Liedtext-Feld: nach dem Klick auf eine Note springt das Feld zur nächsten Silbe');
  await noteAt(1);
  await noteAt(2);
  await page.waitForFunction(() => document.querySelectorAll('.page g.harm').length === 1 && document.querySelectorAll('.page g.verse').length === 3);
  check(/Am7/.test(await page.locator('.page g.harm').textContent()), 'Akkordsymbol Am7 erscheint über der Notenzeile');
  check((await page.locator('.page g.verse').allTextContents()).map((t) => t.replace(/\s+/g, '')).join('|') === 'Hal|lo|Welt', 'Liedtext „Hal-lo Welt“ steht unter den drei Noten, jede Silbe nach einem Klick');
  check(/Alle Silben sind zugeordnet/.test(await page.locator('.lyrics__status').textContent()), 'Liedtext-Feld: nach der letzten Silbe meldet es, dass alles zugeordnet ist');
  await page.screenshot({ path: join(outDir, 'leadsheet.png') });
  await saved();
  const leadFile = Object.entries(await page.evaluate(() => JSON.parse(localStorage.getItem('icastico.browserLibrary')).files)).find(([path]) => path.endsWith('Leadsheet-Test.icastico'))[1].contents;
  check(/"lyric": "Hal-"/.test(leadFile) && /"text": "Am7"/.test(leadFile), 'Liedtext und Akkordsymbol stehen in der gespeicherten Datei');
  await page.click('.lyrics__close');
  await type('Control+z');
  check((await page.locator('.page g.verse').count()) === 2, 'Rückgängig nimmt die zuletzt gesetzte Silbe zurück');
  await type('Control+z', 'Control+z');
  check((await page.locator('.page g.verse').count()) === 0, 'Rückgängig nimmt den ganzen Liedtext Silbe für Silbe zurück');
  await page.locator('.page g.note').first().click({ force: true }); // the field is closed: the click only selects
  await type('l');
  await page.click('.lyrics__foot .pill:has-text("alle setzen")');
  await page.waitForFunction(() => document.querySelectorAll('.page g.verse').length === 3);
  check((await page.locator('.page g.verse').allTextContents()).map((t) => t.replace(/\s+/g, '')).join('|') === 'Hal|lo|Welt', 'Liedtext-Feld: „Ab gewählter Note alle setzen“ legt den ganzen Text auf einmal unter die Noten');
  await page.click('.lyrics__close');

  // ── Punktierung per Ziffernblock-Komma, Bindebogen mit T ──
  await newScore('Bogen-Test');
  await type('5', 'c', 'd', 'Escape');
  await page.locator('.page g.note').first().click({ force: true });
  await type('t');
  check((await page.locator('.page g.slur').count()) === 1 && /Bindebogen/.test(await status()), 'T verbindet die markierte Note mit der folgenden anderen Tonhöhe durch einen Bindebogen');
  await type('t');
  check((await page.locator('.page g.slur').count()) === 0, 'T nochmal löst den Bindebogen');
  await page.locator('.page g.note').nth(1).click({ force: true });
  await type('NumpadDecimal');
  check((await page.locator('.page g.dots').count()) >= 1, 'Das Komma des Ziffernblocks punktiert die markierte Note');
  await newScore('Haltebogen-Test');
  await type('5', 'c', 'c', 'Escape');
  await page.locator('.page g.note').first().click({ force: true });
  await type('t');
  check((await page.locator('.page g.tie').count()) === 1 && (await page.locator('.page g.slur').count()) === 0, 'T bei gleicher Tonhöhe macht einen Haltebogen (durchgehende Note), keinen Bindebogen');

  // ── Funktionen ohne Taste stehen in der Tastenhilfe; Strg+Entf macht die Note zur Pause ──
  await newScore('Pause-Test');
  await type('5', 'c', 'd', 'Escape');
  await page.locator('.page g.note').first().click({ force: true });
  await type('Control+Delete');
  check((await page.locator('.page g.note').count()) === 1 && (await page.locator('.page g.rest').count()) >= 1, 'Strg+Entf macht die gewählte Note zur Pause');
  // ── Tabulatur als eigenes Instrument: einfügen, Noten hineinkopieren ──
  await newScore('Tab-Instrument');
  await type('5', 'c', 'd', 'e', 'g', 'Escape');
  const tabStaffsBefore = await page.locator('.page g.staff').count();
  await page.click('#doc-title');
  await page.waitForSelector('.modal h2:text("Partitur-Einstellungen")');
  await page.click('.modal [data-instrument="tab"]');
  await page.click('.modal button[type="submit"]');
  await page.waitForFunction((n) => document.querySelectorAll('.page g.staff').length > n, tabStaffsBefore);
  check((await page.locator('.page g.staff').count()) > tabStaffsBefore, 'Tabulatur: „+ Tabulatur“ in den Einstellungen fügt eine eigene Zeile hinzu');
  await page.locator('.page g.note').first().click({ force: true });
  await type('Control+a', 'Control+c');
  await page.locator('.page g.mRest').last().click({ force: true });
  await type('Control+v');
  await page.waitForFunction(() => document.querySelectorAll('.page .tabnumber').length >= 4);
  check((await page.locator('.page .tabnumber').count()) >= 4 && /4 Noten eingefügt/.test(await status()), 'Tabulatur: kopierte Noten lassen sich in die Tabulaturzeile einfügen und erscheinen als Bundzahlen');
  await page.screenshot({ path: join(outDir, 'tabulatur-instrument.png') });
  await saved();
  const tabFile = Object.entries(await page.evaluate(() => JSON.parse(localStorage.getItem('icastico.browserLibrary')).files)).find(([path]) => path.endsWith('Tab-Instrument.icastico'))[1].contents;
  check(/"instrument": "tab"/.test(tabFile) && /"version": 15/.test(tabFile), 'Tabulatur: die Zeile steht als Instrument „tab“ in der Datei (Format 15)');
  await page.locator('.page g.note').first().click({ force: true });
  await type('Control+Delete');
  check((await page.locator('.page g.note').count()) >= 1, 'Tabulatur-Zeile: die Noten der anderen Zeile bleiben beim Bearbeiten erhalten');

  // ── Neue Funktionen: Zoom, Metronom, Cycle, Quantisieren, Drucken, Oktave ──
  await newScore('Funktionen-Test');
  await type('5', 'c', 'd', 'e', 'f', 'Escape');
  const pageWidth = async () => (await page.locator('.page svg').first().boundingBox()).width;
  const normal = await pageWidth();
  const noteBox = async () => (await page.locator('.page g.note').first().boundingBox()).width;
  const headNormal = await noteBox();
  await type('Control+NumpadAdd');
  await page.waitForTimeout(500);
  check(/110 %/.test(await status()) && (await noteBox()) > headNormal, 'Zoom: Strg+Plus macht die Notenschrift größer (110 %)');
  await type('Control+Minus', 'Control+Minus');
  await page.waitForTimeout(500); // a slow redraw is merged and comes a moment later
  check(/90 %/.test(await status()) && (await noteBox()) < headNormal, 'Zoom: Strg+Minus macht sie kleiner');
  await type('Control+0');
  await page.waitForTimeout(500);
  check(Math.abs((await noteBox()) - headNormal) < 0.5 && Math.abs((await pageWidth()) - normal) < 1, 'Zoom: Strg+0 stellt die normale Größe wieder her');

  const metro = page.locator('.transport__metronome');
  await type('m');
  check((await metro.getAttribute('aria-pressed')) === 'true' && /Metronom an/.test(await status()), 'Metronom: die Taste M schaltet es ein, der Knopf in der oberen Leiste zeigt es');
  await metro.click();
  check((await metro.getAttribute('aria-pressed')) === 'false', 'Metronom: der Knopf schaltet es wieder aus');

  const loopButton = page.locator('.transport__loop');
  await type('Control+Shift+L');
  check((await loopButton.getAttribute('aria-pressed')) === 'true' && /Wiederholen an/.test(await status()), 'Cycle: Strg+Umschalt+L schaltet das Wiederholen des ganzen Stücks ein');
  await type('Control+Shift+L');
  check((await loopButton.getAttribute('aria-pressed')) === 'false', 'Cycle: noch einmal schaltet es aus');

  await type('5', 'g', 'Escape');
  await type('Alt+x');
  check(/Oktave höher/.test(await status()), 'Eingabe-Oktave: Alt+X sagt, dass die nächste Note eine Oktave höher kommt');
  await type('Escape');

  await page.evaluate(() => {
    window.__printed = 0;
    window.print = () => {
      window.__printed = document.querySelectorAll('#print-root .print-page svg').length;
      window.__printLayout = document.querySelector('#print-root')?.textContent !== undefined;
    };
  });
  await type('Control+p');
  await page.waitForSelector('.modal h2:text("Drucken / PDF")');
  await page.waitForSelector('.print__page svg');
  check((await page.locator('.print__page').count()) >= 1 && (await page.locator('#pdf-print').isVisible()) && (await page.locator('#pdf-save').isVisible()), 'Drucken: Strg+P öffnet den Dialog mit Seitenvorschau, „Drucken“ und „PDF speichern“');
  check(
    await page.evaluate(() => {
      const uses = [...document.querySelectorAll('.print__page svg use')];
      return uses.length > 0 && uses.every((u) => document.getElementById((u.getAttribute('xlink:href') ?? u.getAttribute('href') ?? '').slice(1)) && u.getBoundingClientRect().width > 0);
    }),
    'Drucken: in der Seitenvorschau sind Notenköpfe und Schlüssel zu sehen (jedes Zeichen findet seine Vorlage)',
  );
  await page.click('#pdf-print');
  check((await page.evaluate(() => window.__printed)) >= 1, 'Drucken: „Drucken“ legt die Seiten der Partitur zum Drucken bereit und öffnet den Druckdialog');
  await page.emulateMedia({ media: 'print' });
  check((await page.locator('.workstation').isHidden()) && (await page.locator('#print-root').isVisible()), 'Drucken: im Druck sind nur die Notenseiten zu sehen, nicht die Bedienelemente');
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => document.getElementById('print-root')?.remove());
  // ── Obere Leiste in schmaleren Fenstern: nichts liegt übereinander, die Anzeige bleibt ──
  for (const width of [900, 1200, 1366, 1400, 1500]) {
    await page.setViewportSize({ width, height: 800 });
    const bar = await page.evaluate(() => {
      const shown = (c) => getComputedStyle(c).display !== 'none' && getComputedStyle(c).visibility !== 'hidden';
      const parts = [...document.querySelector('.topbar').children].filter(shown).flatMap((c) => (c.id === 'transport' ? [...c.children] : [c]));
      const boxes = parts.map((c) => c.getBoundingClientRect());
      const overlap = boxes.some((a, i) => boxes.some((b, j) => j > i && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5));
      const lcd = document.querySelector('.lcd');
      return { overlap, outside: boxes.some((r) => r.left < 0 || r.right > innerWidth + 0.5), clipped: lcd.scrollWidth > lcd.clientWidth, title: document.getElementById('doc-title').getBoundingClientRect().width };
    });
    check(!bar.overlap && !bar.outside && !bar.clipped && bar.title >= 100, `Obere Leiste bei ${width} px Breite: Titel, Transport, Anzeige und Knöpfe liegen nebeneinander, nichts ist abgeschnitten`);
  }
  await page.setViewportSize({ width: 1400, height: 900 });

  await newScore('Quantisieren-Test');
  await type('5', 'c', 'd', 'e', 'Escape');
  await type('q');
  await page.waitForSelector('.modal h2:text("Quantisieren")');
  await page.click('.modal button:has-text("Sechzehntel")');
  check(/schon im Raster/.test(await status()), 'Quantisieren: Q fragt nach dem Notenwert, Noten, die schon im Raster liegen, bleiben');
  // ── Akkordtöne einzeln wählen (Alt+Pfeil) und ändern ──
  await newScore('Akkordton-Test');
  await type('5', 'c', 'Shift+E', 'Shift+G', 'Escape');
  await page.locator('.page g.chord').first().click({ force: true });
  // the click picked the lowest tone (C): Alt+↑ goes up to the next one, E, then G
  await type('Alt+ArrowUp');
  check(/Akkordton E5/.test(await status()), 'Akkord: Alt+↑ geht vom angeklickten Ton zum nächsten darüber');
  await type('Alt+ArrowUp');
  check(/Akkordton G5/.test(await status()), 'Akkord: noch einmal Alt+↑ wählt den obersten Ton');
  await type('Alt+ArrowDown');
  check(/Akkordton E5/.test(await status()), 'Akkord: Alt+↓ geht wieder einen Ton hinunter');
  await type('ArrowUp');
  await saved();
  const chordFile = Object.entries(await page.evaluate(() => JSON.parse(localStorage.getItem('icastico.browserLibrary')).files)).find(([path]) => path.endsWith('Akkordton-Test.icastico'))[1].contents;
  check(/"pitch": "C5"/.test(chordFile) && /"pitch": "F5"/.test(chordFile) && /"pitch": "G5"/.test(chordFile) && !/"pitch": "E5"/.test(chordFile), 'Akkord: ↑ ändert nur den gewählten Ton (E → F), die anderen bleiben');

  // ── Sprünge und Tempoanweisungen stehen genau auf der Note ──
  await newScore('Zeichen-genau');
  await type('5', 'c', 'd', 'e', 'f', 'Escape');
  await page.locator('.page g.note').nth(2).click({ force: true });
  await type('Control+j');
  await page.waitForSelector('.symbols:not([hidden])');
  await page.dblclick('.symbols__btn[aria-label="D.C. (zurück zum Anfang)"]');
  await page.waitForSelector('#dir-dc-0');
  const dirBox = await page.locator('#dir-dc-0').boundingBox();
  const thirdNote = await page.locator('.page g.note').nth(2).boundingBox();
  check(Math.abs(dirBox.x + dirBox.width / 2 - (thirdNote.x + thirdNote.width / 2)) < 30, 'Zeichen: „D.C.“ steht genau über der gewählten Note, nicht am Taktende');
  await page.screenshot({ path: join(outDir, 'zeichen-genau.png') });
  await type('Control+j');
  await saved();
  const exactFile = Object.entries(await page.evaluate(() => JSON.parse(localStorage.getItem('icastico.browserLibrary')).files)).find(([path]) => path.endsWith('Zeichen-genau.icastico'))[1].contents;
  check(/"kind": "dc", "exact": true/.test(exactFile.replace(/\s+/g, ' ')) || /"exact": true/.test(exactFile), 'Zeichen: die genaue Stelle steht in der Datei');

  // ── Takte pro Zeile ──
  await newScore('Zeilen-Test');
  await type('5', ...Array(24).fill('c'), 'Escape');
  await page.click('#doc-title');
  await page.waitForSelector('.modal h2:text("Partitur-Einstellungen")');
  await page.selectOption('#f-perline', '2');
  await page.click('.modal button[type="submit"]');
  await page.waitForFunction(() => document.querySelectorAll('.page g.system').length === 4);
  check((await page.locator('.page g.system').count()) === 4, 'Zeilen: „2 Takte pro Zeile“ macht aus acht Takten vier Zeilen');
  await page.screenshot({ path: join(outDir, 'takte-pro-zeile.png') });
  await page.click('#doc-title');
  await page.waitForSelector('.modal h2:text("Partitur-Einstellungen")');
  await page.selectOption('#f-perline', '0');
  await page.click('.modal button[type="submit"]');
  await page.waitForFunction(() => document.querySelectorAll('.page g.system').length !== 4);
  check((await page.locator('.page g.system').count()) < 4, 'Zeilen: „automatisch“ nimmt die Vorgabe wieder weg');

  // ── Tabulatur: Stimmung, Ziehen in die Tabulatur, Bundzahl tippen, Saite wechseln ──
  await newScore('Tab-Edit');
  await type('5', 'c', 'd', 'e', 'g', 'Escape');
  await page.click('#doc-title');
  await page.waitForSelector('.modal h2:text("Partitur-Einstellungen")');
  await page.click('.modal [data-instrument="tab"]');
  await page.click('.modal button[type="submit"]');
  await page.waitForSelector('.page .staff');
  await page.waitForFunction(() => document.querySelectorAll('.page g.mRest').length > 0);
  await page.locator('.page g.note').first().click({ force: true });
  await type('Control+a');
  const firstNote = await page.locator('.page g.note').first().boundingBox();
  const tabTarget = await page.locator('.page g.mRest').last().boundingBox();
  await page.mouse.move(firstNote.x + firstNote.width / 2, firstNote.y + firstNote.height / 2);
  await page.mouse.down();
  await page.mouse.move(tabTarget.x + tabTarget.width / 2, tabTarget.y + tabTarget.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelectorAll('.page .tabnumber').length >= 4);
  check((await page.locator('.page .tabnumber').count()) >= 4 && /4 Noten eingefügt/.test(await status()), 'Tabulatur: markierte Noten lassen sich in die Tabulaturzeile ziehen');
  const numbers = async () => (await page.locator('.page .tabnumber').allTextContents()).join(',');
  await page.locator('.page .tabnumber').first().click({ force: true });
  await type('5');
  check(/Bund 5/.test(await status()), 'Tabulatur: eine getippte Zahl ändert den Bund der gewählten Note');
  const numbersBefore = await numbers();
  await type('ArrowDown');
  check(/Saite 2, Bund 10/.test(await status()) && (await numbers()) !== numbersBefore, 'Tabulatur: ↓ legt die Zahl auf die nächste Saite, der Ton bleibt');
  await type('ArrowUp');
  check(/Saite 1, Bund 5/.test(await status()), 'Tabulatur: ↑ bringt sie zurück');
  await page.click('#doc-title');
  await page.waitForSelector('.modal h2:text("Partitur-Einstellungen")');
  await page.selectOption('.tuning select:not(.tuning__string)', 'dropD');
  await page.click('.modal button[type="submit"]');
  await saved();
  const tuneFile = Object.entries(await page.evaluate(() => JSON.parse(localStorage.getItem('icastico.browserLibrary')).files)).find(([path]) => path.endsWith('Tab-Edit.icastico'))[1].contents;
  check(/"tuning": \[64, 59, 55, 50, 45, 38\]/.test(tuneFile) && /"string": 1/.test(tuneFile), 'Tabulatur: Stimmung „Drop D“ und die gewählte Saite stehen in der Datei');
  await page.screenshot({ path: join(outDir, 'tabulatur-bearbeiten.png') });

  // ── Drucken / PDF: Vorschau passt sich live an ──
  await newScore('Vorschau-Test');
  await type('5', ...Array(24).fill('c'), 'Escape');
  await page.evaluate(() => { window.print = () => undefined; });
  await type('Control+p');
  await page.waitForSelector('.print__page svg');
  const systemsInPreview = () => page.locator('.print__page').first().locator('g.system').count();
  const before2 = await systemsInPreview();
  await page.selectOption('#pdf-perline', '2');
  await page.waitForFunction((n) => document.querySelector('.print__page g.system') && document.querySelectorAll('.print__page:first-child g.system').length !== n, before2);
  check((await systemsInPreview()) === 4, 'Vorschau: „2 Takte pro Zeile“ zeichnet die Seite sofort neu (acht Takte, vier Zeilen)');
  check((await page.locator('.page g.system').count()) < 4, 'Vorschau: die Partitur selbst bleibt unverändert');
  await page.screenshot({ path: join(outDir, 'druckvorschau.png') });
  await type('Escape');
  check((await page.locator('.modal').count()) === 0, 'Vorschau: Esc schließt den Dialog ohne etwas zu tun');

  // ── Liedtext: Fenster verschieben, Silben wählen, löschen, kopieren, verschieben ──
  await newScore('Silben-Test');
  await type('4', 'c', 'd', 'e', 'f', 'g', 'a', 'Escape');
  await page.locator('.page g.note').first().click({ force: true });
  await type('l');
  await page.fill('.lyrics__text', 'Gu-ten A-bend gu-te');
  await page.click('.lyrics .pill:has-text("Ab gewählter Note alle setzen")');
  const syllables = async () => (await page.locator('.page g.syl').allTextContents()).map((t) => t.split(String.fromCharCode(10)).join('').split(' ').join(''));
  check((await syllables()).join(',') === 'Gu,ten,A,bend,gu,te', 'Liedtext: der Text liegt als Silben unter den Noten');
  const lyricsHead = await page.locator('.lyrics__head').boundingBox();
  await page.mouse.move(lyricsHead.x + 60, lyricsHead.y + 10);
  await page.mouse.down();
  await page.mouse.move(lyricsHead.x + 200, lyricsHead.y - 250, { steps: 8 });
  await page.mouse.up();
  const lyricsBox = await page.locator('.lyrics').boundingBox();
  check(Math.abs(lyricsBox.y - (lyricsHead.y - 250 - 12)) < 40 && lyricsBox.x > lyricsHead.x + 100, 'Liedtext: das Fenster lässt sich am Kopf verschieben');
  await page.click('.lyrics__close');
  await page.locator('.page g.syl').nth(1).click({ force: true });
  check((await page.locator('.page g.syl.is-selected').count()) === 1 && (await page.locator('.page g.note.is-selected').count()) === 0, 'Liedtext: ein Klick wählt die Silbe, nicht die Note');
  await type('Control+c');
  await page.locator('.page g.syl').nth(4).click({ force: true });
  await type('Control+v');
  check((await syllables()).join(',') === 'Gu,ten,A,bend,ten,te', 'Liedtext: Strg+C / Strg+V kopiert eine Silbe auf eine andere Note');
  await page.locator('.page g.syl').nth(0).click({ force: true });
  await page.locator('.page g.syl').nth(1).click({ force: true, modifiers: ['Shift'] });
  check((await page.locator('.page g.syl.is-selected').count()) === 2, 'Liedtext: Umschalt+Klick wählt mehrere Silben');
  await type('Control+x');
  check((await syllables()).join(',') === 'A,bend,ten,te', 'Liedtext: Strg+X schneidet die gewählten Silben aus');
  await type('Control+v');
  check((await syllables()).join(',') === 'Gu,ten,A,bend,ten,te', 'Liedtext: Strg+V legt sie wieder ab der gewählten Note ab');
  await type('Delete');
  check((await syllables()).join(',') === 'A,bend,ten,te', 'Liedtext: Entf nimmt die gewählten Silben weg, die Noten bleiben');
  check((await notes()) === 6, 'Liedtext: die Noten sind unverändert');
  await type('Control+z');
  const sylBox = await page.locator('.page g.syl').nth(1).boundingBox();
  const lyricTargetBox = await page.locator('.page g.note').nth(5).boundingBox();
  await page.mouse.move(sylBox.x + sylBox.width / 2, sylBox.y + sylBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(lyricTargetBox.x + lyricTargetBox.width / 2, lyricTargetBox.y + lyricTargetBox.height / 2, { steps: 10 });
  await page.mouse.up();
  check((await syllables()).join(',') === 'Gu,A,bend,ten,ten', 'Liedtext: eine Silbe lässt sich auf eine andere Note ziehen');
  await page.screenshot({ path: join(outDir, 'silben.png') });

  // ── Akkord: ein angeklickter Ton wird allein markiert ──
  await newScore('Akkordton-Markierung');
  await type('5', 'Backquote', 'c', 'e', 'g', 'Escape');
  await page.locator('.page g.chord g.note').nth(1).click({ force: true });
  check((await page.locator('.page .is-selected').count()) === 1 && (await page.locator('.page g.chord.is-selected').count()) === 0, 'Akkord: ein angeklickter Ton ist allein markiert, nicht der ganze Akkord');
  await type('ArrowUp');
  check((await page.locator('.page .is-selected').count()) === 1, 'Akkord: nach dem Verschieben bleibt nur dieser Ton markiert');

  // ── Tabulatur: kopieren in die Tabulatur, auch aus zwei Stimmen; Ziehen auf eine freie Stelle der Zeile ──
  await newScore('Tab-Ziehen');
  await type('4', 'c', 'd', 'e', 'f', 'g', 'a', 'b', 'c', 'Escape');
  await page.click('#doc-title');
  await page.waitForSelector('.modal h2:text("Partitur-Einstellungen")');
  await page.click('.modal [data-instrument="tab"]');
  await page.click('.modal button[type="submit"]');
  await page.waitForFunction(() => document.querySelectorAll('.page g.mRest').length > 0);
  await page.click('#doc-title');
  await page.waitForSelector('.modal h2:text("Partitur-Einstellungen")');
  await page.locator('.tuning select:not(.tuning__string)').last().selectOption('dropD');
  await page.click('.modal button[type="submit"]');
  await page.locator('.page g.note').first().click({ force: true });
  await type('Control+a');
  const dragFrom = await page.locator('.page g.note').first().boundingBox();
  const tabStaffBox = await page.locator('.page g.staff').last().boundingBox();
  await page.mouse.move(dragFrom.x + dragFrom.width / 2, dragFrom.y + dragFrom.height / 2);
  await page.mouse.down();
  await page.mouse.move(tabStaffBox.x + tabStaffBox.width * 0.6, tabStaffBox.y + tabStaffBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelectorAll('.page .tabnumber').length >= 8);
  check((await page.locator('.page .tabnumber').count()) === 8 && /8 Noten eingefügt/.test(await status()), 'Tabulatur: markierte Noten lassen sich auf eine beliebige Stelle der Tabulaturzeile ziehen');
  check((await page.locator('.page .tabclef').count()) === 3, 'Tabulatur: am Zeilenanfang stehen die Buchstaben T A B statt eines Notenschlüssels');
  check((await page.locator('.page .tabtuning').count()) === 1 && /Drop D/.test(await page.locator('.page .tabtuning').textContent()), 'Tabulatur: die Stimmung „Drop D“ steht über der Zeile');
  await page.screenshot({ path: join(outDir, 'tabulatur-ziehen.png') });

  await type('F1');
  const helpText = await page.locator('#help').textContent();

  check(/Einen Takt zurück/.test(helpText) && /Knöpfe ⏪ und ⏩/.test(helpText) && /Klammer oder Akkolade/.test(helpText) && /Menü ⋯ an der Partitur/.test(helpText), 'Tastenhilfe: auch Funktionen mit Knopf, Menü oder Palette stehen drin, mit Hinweis, wo man sie findet');
  await type('Escape');

  // ── Befehlspalette (Strg+K) ──
  await type('Control+k');
  await page.waitForSelector('.palette__input');
  await page.keyboard.type('transp');
  check(/^Transponieren/.test(await page.locator('.palette__item.is-active').textContent()), 'Befehlspalette: Strg+K öffnet das Suchfeld, „transp“ findet „Transponieren“');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.transpose .wheel');
  check((await page.locator('.palette').count()) === 0, 'Befehlspalette: Enter führt die Funktion aus (das Transponieren-Fenster öffnet sich)');
  await page.click('.transpose button:has-text("Abbrechen")');
  await page.waitForSelector('.transpose', { state: 'detached' });
  await type('Control+k');
  await page.waitForSelector('.palette__input');
  await page.keyboard.press('Escape');
  check((await page.locator('.palette').count()) === 0, 'Befehlspalette: Esc schließt sie, ohne etwas auszuführen');

  // ── Triolen (Alt+9 in der Finale-Belegung) ──
  await newScore('Triolen-Test');
  await type('4', 'Alt+9', 'c', 'd', 'e', 'Alt+9', '5', 'g');
  check((await page.locator('.page g.tuplet').count()) === 1 && (await notes()) === 4, 'Triolen: drei Achteltriolen haben eine Klammer mit der 3, danach folgt eine normale Viertel');
  await page.screenshot({ path: join(outDir, 'triolen.png') });

  // ── MusicXML exportieren (Strg+Umschalt+E) ──
  await newScore('Export-Test');
  await type('5', 'c', 'e', 'g');
  await type('k');
  await page.waitForSelector('.modal h2:text("Akkordsymbol")');
  await page.fill('#prompt-input', 'C');
  await page.click('.modal button[type="submit"]');
  const downloading = page.waitForEvent('download');
  await type('Control+Shift+E');
  const xmlDownload = await downloading;
  const exportedXml = readFileSync(await xmlDownload.path(), 'utf8');
  check(xmlDownload.suggestedFilename() === 'Export-Test.musicxml' && exportedXml.includes('<score-partwise') && (exportedXml.match(/<note>/g) ?? []).length >= 3 && exportedXml.includes('<root-step>C</root-step>'), 'MusicXML-Export: Datei „Export-Test.musicxml“ enthält Noten und das Akkordsymbol');

  // ── Tabulatur (Strg+T) ──
  await type('Control+n');
  await page.waitForSelector('.modal h2:text("Neue Partitur")');
  await page.fill('#f-title', 'Tab-Test');
  await page.click('.modal [data-instrument="guitar"]');
  await page.click('.modal button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('#doc-title')?.textContent === 'Tab-Test');
  await type('Alt+ArrowDown', 'Control+t');
  check((await page.locator('.page .tabnumber').count()) === 0 && /Tabulatur eingeschaltet/.test(await status()), 'Tabulatur: Strg+T schaltet sie in der Gitarrenzeile ein (ohne Noten noch keine Zahlen)');
  await type('5', 'e', 'a', 'd');
  await page.waitForFunction(() => document.querySelectorAll('.page .tabnumber').length === 3);
  check((await page.locator('.page .tabnumber').allTextContents()).every((t) => /^[0-9]+$/.test(t.trim())), 'Tabulatur: Jede der drei Noten bekommt eine Bundzahl');
  await page.screenshot({ path: join(outDir, 'tabulatur.png') });
  await type('Control+t');
  check((await page.locator('.page .tabnumber').count()) === 0, 'Tabulatur: Strg+T schaltet sie wieder aus');

  // ── PDF (Strg+Umschalt+F) ──
  await newScore('PDF-Test');
  await type('5', 'c', 'e', 'g');
  const pdfLoading = page.waitForEvent('download');
  await type('Control+Shift+f');
  await page.waitForSelector('.modal h2:text("Drucken / PDF")');
  await page.selectOption('#pdf-format', 'landscape');
  await page.click('#pdf-save');
  const pdfDownload = await pdfLoading;
  const pdfPath = await pdfDownload.path();
  const pdfBytes = readFileSync(pdfPath);
  copyFileSync(pdfPath, join(outDir, 'pdf-test.pdf'));
  check(pdfDownload.suggestedFilename() === 'PDF-Test.pdf' && pdfBytes.subarray(0, 8).toString() === '%PDF-1.4' && pdfBytes.subarray(-6).toString().includes('%%EOF') && pdfBytes.length > 20000, 'PDF: Strg+Umschalt+F speichert „PDF-Test.pdf“ als gültige PDF-Datei (Querformat)');
  check(pdfBytes.toString('latin1').includes('/MediaBox [0 0 841.89 595.28]'), 'PDF: Querformat ergibt eine Seite 841 × 595 Punkte');

  // ── Einzelstimme herausziehen (Strg+Umschalt+X) ──
  await type('Control+Shift+X');
  await page.waitForSelector('.modal h2:text("Einzelstimme herausziehen")');
  await page.click('.modal button:text("Gitarre")');
  await page.waitForFunction(() => document.querySelector('#doc-title')?.textContent?.startsWith('PDF-Test – Gitarre'));
  await saved();
  check(Object.keys(await files()).some((path) => path.endsWith('PDF-Test – Gitarre.icastico')), 'Einzelstimme: „PDF-Test – Gitarre“ liegt als eigene Partitur in der Bibliothek');
  check((await page.locator('.page g.staff').count()) >= 1 && !(await page.locator('.page').first().textContent())?.includes('Gesang'), 'Einzelstimme: die neue Partitur zeigt nur noch die Gitarre');

  // ── Gebundene Noten ändern ihre Tonhöhe gemeinsam ──
  await newScore('Bogen-Eins');
  await type('5', 'c', 'c', 'Escape');
  await page.locator('.page g.note').first().click({ force: true });
  await type('t', 'ArrowUp');
  await saved();
  const tiedFile = Object.entries(await page.evaluate(() => JSON.parse(localStorage.getItem('icastico.browserLibrary')).files)).find(([path]) => path.endsWith('Bogen-Eins.icastico'))[1].contents;
  const tiedPitches = [...tiedFile.matchAll(/"pitch": "([A-G][#b]?[0-9])"/g)].map((m) => m[1]);
  check(tiedPitches.length === 2 && tiedPitches[0] === tiedPitches[1] && tiedPitches[0].startsWith('D') && /"kind": "tie"/.test(tiedFile), 'Gebundene Noten: ↑ auf der ersten Note hebt beide gemeinsam an, der Haltebogen bleibt');

  // ── Zeichen: Taste, Palette, Wiederholung, Klammern ──
  await newScore('Zeichen-Test');
  await type('7', 'c', 'd', 'e', 'f', 'Escape');
  await page.locator('.page g.note').first().click({ force: true });
  await type('Alt+m', 'Alt+Period');
  await page.waitForFunction(() => document.querySelectorAll('.page g.dynam').length === 1 && document.querySelectorAll('.page g.artic').length === 1);
  check(true, 'Zeichen: Alt+M setzt mf, Alt+. setzt Staccato – beides erscheint in der Notenschrift');
  await page.setViewportSize({ width: 1400, height: 1100 }); // room for the whole menu below the score
  await type('Control+j');
  await page.waitForSelector('.symbols:not([hidden])');
  check((await page.locator('.symbols__btn.is-on').count()) >= 2, 'Palette (Strg+J): die Zeichen der gewählten Note leuchten');
  // Das Menü lässt sich am Kopf aus dem Weg ziehen (nach links unten, unter die Notenschrift)
  const head = await page.locator('.symbols__head').boundingBox();
  await page.mouse.move(head.x + 24, head.y + 10);
  await page.mouse.down();
  await page.mouse.move(300, 500, { steps: 8 });
  await page.mouse.up();
  check((await page.locator('.symbols').boundingBox()).y > 440, 'Das Zeichen-Menü lässt sich am Kopf verschieben');
  await page.dblclick('.symbols__btn[aria-label="Wiederholung beginnt (𝄆)"]');
  await page.locator('.page g.note').last().click({ force: true });
  await page.dblclick('.symbols__btn[aria-label="Wiederholung endet (𝄇)"]');
  await page.dblclick('.symbols__btn[aria-label="Fermate (Halt)"]');
  await page.waitForFunction(() => document.querySelectorAll('.page g.fermata').length === 1);
  check((await page.locator('.page g.fermata').count()) === 1 && (await page.locator('.page g.barLine').count()) >= 2, 'Palette: Wiederholungszeichen und Fermate werden gesetzt und gezeichnet');
  await page.dblclick('.symbols__btn[aria-label="1. Klammer"]');
  await page.waitForFunction(() => document.querySelectorAll('.page g.voltaBracket').length >= 1);
  check(true, 'Palette: eine 1. Klammer wird über dem Takt gezeichnet');
  await page.screenshot({ path: join(outDir, 'zeichen.png') });
  await saved();
  const signsFile = Object.entries(await page.evaluate(() => JSON.parse(localStorage.getItem('icastico.browserLibrary')).files)).find(([path]) => path.endsWith('Zeichen-Test.icastico'))[1].contents;
  check(/"version": 15/.test(signsFile) && signsFile.includes('"marks": ["mf", "stacc"]') && /"kind": "repeatStart"/.test(signsFile) && /"kind": "volta1"/.test(signsFile), 'Zeichen: Noten- und Taktzeichen stehen in der gespeicherten Datei (Format 15)');
  await page.click('.transport__buttons button[aria-label="Zum Anfang"]');
  await page.click('.transport__play');
  await page.waitForFunction(() => document.querySelector('.transport__play')?.getAttribute('aria-pressed') === 'true');
  await page.waitForTimeout(600);
  check(!/Fehler|nicht verfügbar/.test(await status()), 'Wiedergabe mit Wiederholung, Klammer und Dynamik läuft ohne Fehler');
  await page.click('.transport__stop');
  await page.waitForFunction(() => document.querySelector('.transport__play')?.getAttribute('aria-pressed') === 'false');
  // ── Zeichen-Menü: Knopf oben, Ziehen und Verschieben ──
  const boxOf = async (selector) => (await page.locator(selector).first().boundingBox());
  const dragTo = async (from, to) => {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
    await page.mouse.up();
  };
  const fermataBefore = await boxOf('.page g.fermata');
  await dragTo(fermataBefore, await boxOf('.page g.note'));
  await page.waitForFunction((x) => document.querySelector('.page g.fermata')?.getBoundingClientRect().x < x - 20, fermataBefore.x);
  check((await page.locator('.page g.fermata').count()) === 1, 'Ein gesetztes Zeichen (Fermate) lässt sich mit der Maus auf eine andere Note ziehen');
  await dragTo(await boxOf('.symbols__btn[aria-label="Triller"]'), await boxOf('.page g.note >> nth=2'));
  await page.waitForFunction(() => document.querySelectorAll('.page g.trill').length === 1);
  check(true, 'Ein Zeichen aus dem Menü lässt sich auf eine Note ziehen');
  await type('Control+j');
  await page.waitForSelector('.symbols', { state: 'hidden' });
  await page.click('#symbols-button');
  await page.waitForSelector('.symbols:not([hidden])');
  check((await page.getAttribute('#symbols-button', 'aria-pressed')) === 'true', 'Der Knopf „Zeichen“ oben öffnet das Menü');
  await page.waitForTimeout(500); // the menu fades in
  await page.screenshot({ path: join(outDir, 'zeichen-menue.png') });
  await page.evaluate(() => Object.assign(document.querySelector('.symbols').style, { left: '700px', top: '100px' })); // over the white paper: is the text still readable?
  await page.screenshot({ path: join(outDir, 'zeichen-glas.png') });
  await page.click('#symbols-button');
  await page.waitForSelector('.symbols', { state: 'hidden' });
  await page.setViewportSize({ width: 1400, height: 900 });

  // ── Zeichen: Taktstriche, Klammer um Zeilen, anklicken + Rücktaste löscht ──
  await page.setViewportSize({ width: 1400, height: 1100 });
  await openLibrary();
  await page.click('.tile-item:has-text("Zeichen-Test")');
  await page.waitForSelector('#library', { state: 'hidden' });
  await page.waitForSelector('.page svg');
  if (await page.locator('.symbols').isHidden()) await page.click('#symbols-button');
  check((await page.locator('.symbols h3').allTextContents()).join('|').includes('Taktstriche') && (await page.locator('.symbols__btn[aria-label^="Doppelstrich"]').count()) === 1 && (await page.locator('.symbols__btn[aria-label^="Schlussstrich"]').count()) === 1 && (await page.locator('.symbols__btn[aria-label^="Klammer um"]').count()) === 1, 'Zeichen: die Rubrik „Taktstriche“ hat Doppelstrich, Schlussstrich und die Klammer um Zeilen');
  check((await page.locator('.symbols__btn[aria-label^="Atemzeichen"]').count()) === 1 && (await page.locator('.symbols__btn[aria-label^="rit."]').count()) === 1, 'Zeichen: Atemzeichen, Zäsur, Arpeggio und Tempo-Anweisungen (rit., accel., a tempo) sind dazugekommen');
  await page.locator('.page g.note').first().click({ force: true });
  await page.dblclick('.symbols__btn[aria-label^="Klammer um"]');
  await page.waitForFunction(() => document.querySelectorAll('.page g.grpSym').length >= 1);
  check(true, 'Zeichen: die Klammer fasst die gewählte Zeile mit der nächsten zusammen (und wird gezeichnet)');
  await page.screenshot({ path: join(outDir, 'zeichen-rubriken.png') });
  await page.dblclick('.symbols__btn[aria-label^="Klammer um"]');
  await page.waitForFunction(() => document.querySelectorAll('.page g.grpSym').length === 0);
  check(true, 'Zeichen: dieselbe Taste noch einmal löst die Klammer wieder');
  await page.locator('.page g.note').nth(2).click({ force: true });
  await page.dblclick('.symbols__btn[aria-label^="Doppelstrich"]');
  check(/Doppelstrich.*gesetzt/.test(await status()), 'Zeichen: der Doppelstrich wird am Takt der gewählten Note gesetzt');
  await page.dblclick('.symbols__btn[aria-label^="Schlussstrich"]');
  const finalBarStatus = await status();
  const finalBarMeasure = /Takt ([0-9]+)/.exec(finalBarStatus)?.[1] ?? '1';
  check(/Schlussstrich.*gesetzt/.test(finalBarStatus), 'Zeichen: ein Schlussstrich ersetzt den Doppelstrich im selben Takt');
  // Ein gesetztes Zeichen anklicken und mit der Rücktaste löschen
  const fermataBox = await boxOf('.page g.fermata');
  const fermatasBefore = await page.locator('.page g.fermata').count();
  await page.mouse.click(fermataBox.x + fermataBox.width / 2, fermataBox.y + fermataBox.height / 2);
  check((await page.locator('.page .is-sign-selected').count()) >= 1, 'Zeichen: ein Klick auf ein gesetztes Zeichen (Fermate) wählt es aus (blau)');
  await type('Backspace');
  check((await page.locator('.page g.fermata').count()) === fermatasBefore - 1 && /entfernt/.test(await status()), 'Zeichen: die Rücktaste löscht das gewählte Zeichen');
  await type('Control+z');
  check((await page.locator('.page g.fermata').count()) === fermatasBefore, 'Zeichen: Strg+Z holt es zurück');
  // Taktstriche sind ebenso wählbar: der Schlussstrich am Ende von Takt 1
  const lines = page.locator(`.page #m${finalBarMeasure} > g.barLine`);
  const lastLine = await lines.last().boundingBox();
  await page.mouse.click(lastLine.x + lastLine.width / 2, lastLine.y + lastLine.height / 2);
  check((await page.locator('.page .is-sign-selected').count()) >= 1, 'Zeichen: auch ein Taktstrich lässt sich anklicken und wählen');
  await type('Backspace');
  check(/entfernt/.test(await status()), 'Zeichen: Rücktaste löscht den gewählten Taktstrich');
  await type('Control+z');
  await page.click('#symbols-button');
  await page.setViewportSize({ width: 1400, height: 900 });

  // ── Tabulatur: später hinzufügen, Bereich in Tabulatur übersetzen ──
  await newScore('Tabulatur-Neu');
  await type('5', 'c', 'd', 'e', 'f', 'Escape');
  await page.locator('.page g.note').first().click({ force: true });
  await type('Alt+Shift+ArrowRight', 'Alt+Shift+ArrowRight');
  const staffsBefore = await page.locator('.page g.staff').count();
  await type('Control+Shift+b');
  await page.waitForFunction((n) => document.querySelectorAll('.page g.staff').length > n, staffsBefore);
  check(/in die Gitarrenzeile übersetzt/.test(await status()), 'Tabulatur: „Auswahl übersetzen“ (Strg+Umschalt+B) legt die Gitarrenzeile an und übersetzt die markierten Noten');
  check((await page.locator('.page g.tabGrp, .page text, .page tspan').filter({ hasText: /^[0-9]+$/ }).count()) >= 1, 'Tabulatur: die übersetzten Noten erscheinen als Bundzahlen in der Tabulatur');
  await type('Control+z');
  check((await page.locator('.page g.staff').count()) === staffsBefore, 'Tabulatur: Strg+Z nimmt Zeile und Tabulatur in einem Schritt zurück');

  // Exportieren-Untermenü in der Bibliothek (Menü mit den drei Punkten)
  await openLibrary();
  await page.locator('.tile__more').first().click();
  const menuHeights = await page.locator('.menu button').evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)));
  check(Math.max(...menuHeights) <= 62, 'Bibliothek: kein Eintrag des Drei-Punkte-Menüs hat eine Leerzeile (Höhen ' + menuHeights.join('/') + ')');
  await page.click('.menu button:has-text("Exportieren")');
  check((await page.locator('.menu button').allTextContents()).some((t) => t.includes('MIDI')) && (await page.locator('.menu button').allTextContents()).some((t) => t.includes('MusicXML')) && (await page.locator('.menu button').allTextContents()).some((t) => t.includes('PDF')), 'Bibliothek: „Exportieren“ im Drei-Punkte-Menü öffnet ein Untermenü mit der Dateiart');
  await page.screenshot({ path: join(outDir, 'menue.png'), clip: { x: 0, y: 150, width: 1400, height: 500 } });
  const midiDownload = page.waitForEvent('download');
  await page.click('.menu button:has-text("MIDI")');
  const midiName = (await midiDownload).suggestedFilename();
  check(/.mid$/.test(midiName), 'Bibliothek: die Dateiart MIDI speichert eine .mid-Datei (' + midiName + ')');
  await openLibrary();
  await page.locator('.tile__more').first().click();
  await page.click('.menu button:has-text("Exportieren")');
  await page.click('.menu button:has-text("Zurück")');
  check((await page.locator('.menu button').allTextContents()).some((t) => t.includes('Duplizieren')), 'Bibliothek: im Untermenü führt „Zurück“ zum Menü');
  await type('Escape');
  // Neuigkeiten nach einem Update: Popup mit den neuen Funktionen, nur einmal
  await page.evaluate(() => localStorage.setItem('icastico.seenVersion', '0.15.0'));
  await page.reload();
  await page.waitForSelector('.patchnotes', { timeout: 30000 });
  check((await page.locator('.patchnotes li').count()) >= 2 && /Version 0.24.0/.test(await page.locator('.patchnotes').textContent()), 'Update: ein Popup listet die neuen Funktionen der Versionen seit dem letzten Start');
  await page.click('.patchnotes button:has-text("Verstanden")');
  await page.waitForSelector('.patchnotes', { state: 'detached' });
  check((await page.evaluate(() => localStorage.getItem('icastico.seenVersion'))) !== '0.15.0', 'Update: die Version wird gemerkt, das Popup kommt nicht noch einmal');
  await page.reload();
  await page.waitForSelector('.page svg, #library:not([hidden])', { timeout: 30000 });
  check((await page.locator('.patchnotes').count()) === 0, 'Update: beim nächsten Start ohne Update gibt es kein Popup');

  check(errors.length === 0, `Keine Fehler in der Konsole${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  console.log(`\nAlle ${step} Prüfungen bestanden. Screenshots: ${outDir}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
