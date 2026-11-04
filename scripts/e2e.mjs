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
  check(/"dur": "1\/4", "tones": \[\{ "id": "[^"]+", "pitch": "C5" \}\][\s\S]*"pitch": "D5"/.test(logicFile), 'Logic-Tasten: 3 = Viertel, A = C, W = Cis, Alt+↑ = Halbton (→ D), Leertaste = Pause');
  check((await page.evaluate(() => localStorage.getItem('icastico.keymap'))) === 'logic', 'Gewählte Belegung wird gemerkt');
  await type('F1');
  await page.click('[data-preset="finale"]');
  await type('Escape');

  // ── Piano-Roll: zweite Ansicht derselben Töne ──
  await type('Control+Shift+P');
  check(await page.locator('#roll').isVisible(), 'Piano-Roll öffnet sich (Strg+Umschalt+P)');
  const bars = page.locator('.roll__bar');
  const barTitle = (i) => bars.nth(i).evaluate((e) => e.querySelector('title').textContent);
  const barsBefore = await bars.count();
  check(barsBefore >= 2, `Piano-Roll zeigt die Töne als Balken (${barsBefore})`);
  const firstTitle = await barTitle(0);

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
  const refused = await status();
  await page.mouse.up();
  check(/schon eine Note/.test(refused) && (await barTitle(0)) === firstTitle, 'Ziehen auf eine andere Note wird abgelehnt, nichts wird überschrieben');

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
  const barWidth = async (i) => (await bars.nth(i).boundingBox()).width;
  const chordLowBefore = await barWidth(0);

  await bars.nth(1).click(); // the G of the chord
  await type('Control+Shift+D');
  check((await page.locator('.roll__bar.is-secondary').count()) === 1 && (await page.locator('.roll__bar.is-secondary.is-selected').count()) === 1, 'T7: Der angeklickte Akkordton liegt in einer eigenen Stimme (gestrichelter Balken)');
  check((await page.locator('.page g.layer').count()) >= 2, 'T7: Die Notenschrift zeigt jetzt zwei Stimmen auf der Zeile');
  await type('Shift+ArrowRight'); // lengthen the lone G by the chosen value (a quarter)
  const lone = await page.locator('.roll__bar.is-secondary title').textContent();
  check(Math.abs((await barWidth(0)) - chordLowBefore) < 1 && /Halbe/.test(lone), 'T7: Der gelöste Ton wird länger, das C im Akkord bleibt gleich lang');
  await type('Control+z', 'Control+z');
  check((await page.locator('.roll__bar.is-secondary').count()) === 0 && (await bars.count()) === 5, 'T7: Zweimal Rückgängig stellt den Akkord wieder her');

  await bars.nth(3).click(); // the second single C – its neighbour is the D
  await type('t');
  check((await page.locator('.roll__link--tie').count()) === 0 && /andere Tonhöhe/.test(await status()), 'T8: Haltebogen zu einer anderen Tonhöhe wird abgelehnt');
  await bars.nth(2).click(); // the first single C – next is the other C
  await type('t');
  check((await page.locator('.roll__link--tie').count()) === 1 && (await page.locator('.page g.tie').count()) === 1, 'T8: Haltebogen zwischen zwei gleichen Noten – in Roll und Notenschrift gezeichnet');
  await type('ArrowUp');
  check(/zerreißen/.test(await status()) && (await page.locator('.roll__link--tie').count()) === 1, 'T8: Ein Ton unter Haltebogen lässt sich nicht umstimmen (der Bogen risse)');
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
  await page.click('.transport__play');
  await page.waitForFunction(() => document.querySelector('.transport__play')?.getAttribute('aria-pressed') === 'false');
  check(true, 'Stopp hält die Wiedergabe an');
  await type('Control+Enter');
  await page.waitForFunction(() => document.querySelector('.transport__play')?.getAttribute('aria-pressed') === 'true');
  await type('Control+Enter');
  check(true, 'Strg+Eingabe startet und stoppt die Wiedergabe');
  check((await page.locator('.transport__record').isDisabled()), 'Der Aufnahmeknopf ist noch gesperrt (kommt später)');
  await page.screenshot({ path: join(outDir, 'transport.png') });

  check(errors.length === 0, `Keine Fehler in der Konsole${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  console.log(`\nAlle ${step} Prüfungen bestanden. Screenshots: ${outDir}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
