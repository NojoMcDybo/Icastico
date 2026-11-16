# Bauplan „Feinschliff-Runde“ (nach 0.28.2)

> Für die Umsetzung durch ein anderes Modell (Sonnet oder Opus) geschrieben. Stand des Codes: Commit `95e7e79` (Release 0.28.2), Zweig `main`.
> Zeilennummern sind Hinweise – **immer über den genannten Funktions- oder Suchbegriff finden**.
> Entscheidungen in diesem Plan sind getroffen (vom Owner oder hier begründet). Nicht neu aufrollen; Offenes steht in Abschnitt 6.

## Ausgangslage

Der Owner hat erneut um eine Durchsicht gebeten (Vollständigkeit, Leistung, Oberfläche) und will den Bau später einem anderen
Modell geben. Geprüft am Stand 0.28.2: 756 Tests grün, Typprüfung grün, Oberflächentest 376 Schritte grün, CI und beide
Installer-Builds auf GitHub grün. **Kein Fehler gefunden**, aber:

| Befund | Messung / Beleg |
|---|---|
| „Akkoladen pro Seite“ (ohne feste Takte pro Akkolade) setzt die Noten bei jeder Änderung **zweimal** | 64 Takte × 3 Zeilen: 421 ms statt 233 ms; 128 Takte: 781 statt 450 ms |
| Glas-Flächen (Zeichen-Menü, Liedtext-Feld, Quintenzirkel) sind **über dem weißen Notenblatt kaum lesbar** – seit die A4-Ansicht Standard ist, liegt fast immer Papier darunter | Bildschirmfoto: weiße Schrift auf hellgrauem Glas |
| Dialog „Seitenaufbau“: Platzhalter abgeschnitten („unver…“, „so vie…“), Seitenränder brechen ungleich um | Bildschirmfoto |
| Dialog „Akkord nach Namen“: Beschriftung liegt auf dem Eingabefeld, Häkchen steht über seinem Text | Bildschirmfoto |
| Doku veraltet: README nennt v0.25; in der Roadmap sind fertige Punkte offen; `docs/architecture.md` kennt die neuen Dateien nicht | siehe Paket A5 |
| Noteneingabe selbst ist schnell | Demo-Partitur in A4-Ansicht: 35 ms je Note, Cursor 2–3 ms |

Dazu drei offene Roadmap-Funktionen, die der Owner gewählt hat: **Lautstärke mehrerer Töne**, **Gleichlauf Notenschrift/Piano-Roll**,
**Tasten frei belegen**.

## 0. Für alle Pakete

| Paket | Inhalt | Dateiformat | ADR |
|---|---|---|---|
| A | Feinschliff: einmal setzen statt zweimal, lesbares Glas, zwei Dialoge, Doku | – | Nachtrag in 0042 |
| B | Lautstärke mehrerer Töne ändern und dabei hören | – | 0047 |
| C | Notenschrift und Piano-Roll scrollen im Gleichlauf | – | 0048 |
| D | Tasten frei belegen | – (nur lokale Einstellung) | 0049 |

Kein Paket ändert das Dateiformat (bleibt 23). Reihenfolge A → B → C → D; die Pakete hängen nicht voneinander ab.

### Arbeitsweise

- Zweig: `feature/feinschliff` besteht schon (von `main` bei 0.28.2 abgezweigt, enthält diesen Plan): `git checkout feature/feinschliff`.
- **Ein Commit pro Paket**, Commit-Text englisch. Nicht pushen, keine Tags – das entscheidet der Owner.
- Vor jedem Commit:
  ```bash
  npm run typecheck
  npm test
  npm run build
  NODE_PATH="$(npm root -g)" npm run e2e     # Playwright ist global installiert; läuft gegen dist/, dauert ~2 Minuten
  ```
  Bei Oberflächen-Änderungen die App ansehen (`npm run dev`, Port 1420, Startkonfiguration in `.claude/launch.json`) –
  **immer auch mit dem weißen Notenblatt hinter Menüs** und bei 900 × 600 Fenstergröße.
- Hilfsdateien `*.tmp.*` nennen (steht in `.gitignore`) und wieder löschen.

### Regeln, die leicht übersehen werden

1. **Neue Funktion = Eintrag in `src/ui/keymaps/library.json`**, danach `npm run keys:doc`. `src/ui/keys.test.ts` prüft das.
   Herkunft neuer Tasten `"icastico"`; ohne Taste: `"via"` (wo man sie findet).
2. Modell (`src/core`) unveränderlich, kennt keine Pixel, importiert nichts aus `src/ui` / `src/render`. Jede Änderung besteht `validateScore`.
3. Schutzregel (ADR 0035): keine `onclick="…"`-Attribute, keine Skripte von außen, keine neuen Bibliotheken.
4. Keine neuen Farben – nur Variablen oben in `src/styles.css`. Auswahl/Fokus: `var(--accent)` bzw. `rgb(117 184 255 / 0.18)`.
5. Texte für Nutzer deutsch, Code/Kommentare englisch; Kommentare nur für das Warum.
6. `src/ui/workstation.ts` (3 000 Zeilen) **nicht umbauen**, nur gezielt ergänzen.
7. e2e: nie feste Pausen; `type(...)` wartet schon auf verzögertes Neuzeichnen, sonst `page.waitForSelector` / `waitForFunction`.
8. Am Ende jedes Pakets: `docs/roadmap.md`, ADR nach Vorlage in `docs/decisions/README.md` (Liste nach Nummer sortiert),
   `docs/architecture.md` bei neuen Dateien. Versionen und „Neuigkeiten“ erst zur Release (Abschnitt 5).

---

## Paket A – Feinschliff

### A1 – „Akkoladen pro Seite“ in einem Durchgang setzen

**Heute** (`src/render/engraveScore.ts`, `engraveScore`): Sind Akkoladen pro Seite gesetzt, aber die Zeilenumbrüche dem Notensatz
überlassen, wird einmal gesetzt, um die Zeilenanfänge zu erfahren (`systemStartsOf`), dann mit `<pb>`-Seitenumbrüchen ein zweites Mal.

**Neu:** Verovio kann das selbst: Option **`systemMaxPerPage`**. Am echten Notensatz geprüft (48 Takte, 3 je Seite): dieselbe
Seitenaufteilung (3 · 3 · 3 Akkoladen) in einem Durchgang.

1. `src/render/verovio.ts`: `EngraveOptions` bekommt `readonly systemsPerPage?: number`. In `engrave(...)` bei `setOptions`
   **immer** setzen: `systemMaxPerPage: options.systemsPerPage ?? 0` (0 = keine Grenze).
   Wichtig: Verovio **merkt sich Optionen** zwischen den Aufrufen – ein nur bei Bedarf gesetzter Wert bliebe für die nächste
   Partitur (Vorschaubild, Druck) stehen. Deshalb nie mit `...(wert ? {…} : {})` setzen.
   Bei der Gelegenheit die unbenutzte Option `measureMinWidth` (Interface und `setOptions`-Zeile) löschen – niemand übergibt sie.
2. `engraveScore`: im Zweig „keine festen Zeilen“ (`lines.length === 0`) nicht mehr zweimal setzen, sondern
   `run(first)` mit `systemsPerPage: per`.
3. Zweig „feste Zeilen“ (`systemBreaks(score, count)` liefert Umbrüche; dann gilt `breaks: 'encoded'`): **zuerst mit einem Test
   prüfen**, ob `systemMaxPerPage` auch dort dieselben Seiten ergibt wie die heutigen `<pb>`. Wenn ja: auch dort nur die Option
   setzen und `pageBreaks` aus `MeiOptions` (`src/render/mei.ts`, Suchbegriff `pageBreaks`) samt `<pb>`-Zeile und `systemStartsOf`
   löschen, sofern sonst unbenutzt (`grep`). Wenn nein: diesen Zweig unverändert lassen (er setzt ohnehin nur einmal).
4. Tests: `src/render/engraveScore.test.ts` – die vorhandenen Erwartungen (Akkoladen je Seite) müssen unverändert gelten; neu:
   nach einem Aufruf mit Grenze liefert ein Aufruf ohne Grenze wieder alle Akkoladen auf einer Seite (Option bleibt nicht hängen).
   `src/render/perf.test.ts`: zweiter Fall „64 Takte × 3 Zeilen mit `layout.systemsPerPage: 4` über `engraveScore`“ mit derselben
   großzügigen Grenze (1,5 s; erwartet ~250 ms) – damit der doppelte Durchgang nicht unbemerkt zurückkommt.
5. `docs/decisions/0042-seitenaufbau-akkoladen.md`: ein Absatz „Nachtrag“ (ein Durchgang über `systemMaxPerPage`, Messwerte).

**Fertig, wenn:** der e2e-Block zum Seitenaufbau unverändert besteht und die Messung für 64 Takte unter 300 ms liegt.

### A2 – Glas-Flächen über dem Notenblatt lesbar machen

- `src/styles.css`, `:root`: `--glass-tint: rgb(30 31 36 / 0.72)` → **`0.9`**. Das ist die eine Stelle, von der Zeichen-Menü
  (`.symbols`), Quintenzirkel (`.keypicker`), Liedtext-Feld, Zeichen-Schatten (`.sign-ghost`) und das Testfeld erben.
- Die Befehlspalette hat eine eigene, dichtere Angabe (Suchbegriff `denser than the other glass panes`): durch `var(--glass-tint)`
  ersetzen und den Kommentar streichen – eine Quelle.
- Prüfen (Bildschirmfotos, je über dem weißen Papier **und** über dem dunklen Rand): Zeichen-Menü (Strg+J), Liedtext-Feld (L),
  Quintenzirkel (Klick auf „Tonart“ oben), Befehlspalette (Strg+K), Lautstärke-Menü der Piano-Roll (Klick auf einen Balken).
  Schrift und Rubrik-Überschriften müssen überall klar lesbar sein; wenn 0.9 nicht reicht, bis 0.94 gehen, nicht höher
  (der Glas-Charakter soll bleiben).

### A3 – Dialog „Seitenaufbau“ (`src/ui/layoutDialog.ts`, Strg+Umschalt+A)

- Die Zahlenfelder „Takte pro Akkolade“ und „Akkoladen pro Seite“ sind zu schmal für ihre Platzhalter („unverändert“,
  „so viele wie passen“): Felder auf die Breite des Auswahlfelds „Bereich“ darüber bringen (CSS-Klasse am Feld, Regel in
  `src/styles.css` bei den übrigen `.form`-Regeln), **oder** die Platzhalter auf „–“ kürzen und den Sinn in den Hinweistext
  darunter schreiben. Empfehlung: breiter machen.
- Seitenränder (Suchbegriff `marginRow.append('oben '`): als Raster mit vier gleich breiten Spalten, je Spalte Beschriftung über
  dem Feld (oben · unten · links · rechts), „mm“ in die Zeilenbeschriftung („Seitenränder (mm)“). Vorbild für ein solches Raster:
  `.tuning__strings` in `src/styles.css`.
- e2e: der vorhandene Seitenaufbau-Block muss unverändert bestehen (die Feld-IDs `layout-perpage`, `layout-m-top` … bleiben).

### A4 – Dialog „Akkord nach Namen“ (`src/ui/chordDialog.ts`, Strg+Umschalt+K)

- Die Beschriftung „Name des Akkords (B = deutsches H, Bb = deutsches B)“ überlappt das Eingabefeld: Sie benutzt `form__label`
  (für die zweispaltigen Formularzeilen gedacht) außerhalb einer `form__row`. Entweder in `row(...)`-Struktur wie in
  `src/ui/scoreDialog.ts` setzen oder der Beschriftung hier `display: block; margin-bottom: 6px; padding: 0` geben (eigene Klasse).
- Häkchen „Akkordsymbol über die Noten schreiben“: Kästchen und Text auf einer Linie (`display: inline-flex; align-items: center; gap: 8px`).
- Die gewählte Umkehrung muss wie eine aktive Pille aussehen (`.pill.is-active`: heller Grund, dunkle Schrift), nicht grau mit
  blauem Rand.
- Prüfen per Bildschirmfoto; e2e-Block „Akkord nach Namen“ unverändert grün.

### A5 – Doku nachführen (nur Texte)

- `README.md`, Statuszeile: v0.28 – ergänzen um Strophen, Akkord nach Namen, weitere Instrumente, Tempo- und Schlüsselwechsel,
  zwei Ebenen je Zeile, Seitenaufbau/A4-Ansicht, freie Texte.
- `docs/roadmap.md` – abhaken bzw. umformulieren (jeweils mit ADR-Nummer):
  - „Akkordnamen tippen („Cm7“) und Akkord-Menü“ → erledigt (ADR 0037).
  - „Aufnahmeknopf: Noten diktieren oder einspielen“ → erledigt (steht weiter unten bereits als fertig: Taste `R`).
  - „MIDI-Keyboard-Eingabe (Step + Echtzeit mit Quantisierer)“ → aufteilen: Step erledigt (Windows/Browser), offen bleiben
    „Echtzeit mit Taktgeber“ und „Mac“.
  - „Legato/Phrasierungsbögen“ → Bindebogen zur nächsten Note erledigt (Taste `T`, ADR 0029); offen: Bogen über mehrere Noten.
  - „Seitenlayout von Hand (Umbrüche, Systemabstand, Kopf-/Fußzeile), Tabulatur-Spieltechniken“ → erledigt: Takte pro Akkolade,
    Akkoladen pro Seite, Seitenränder, Kopfzeile (ADR 0042–0046); offen: Systemabstand, Fußzeile, Tabulatur-Spieltechniken.
  - Vor dem Abhaken jeden Punkt kurz im Code bzw. ADR gegenprüfen – nichts abhaken, was nicht da ist.
- `docs/architecture.md`, Abschnitt 5 (UI) und 3 (Rendering): neue Dateien in je einem Halbsatz –
  `render/engraveScore.ts`, `render/equalBars.ts`, `core/chordNames.ts`, `ui/chordDialog.ts`, `ui/instrumentPicker.ts`,
  `ui/layoutDialog.ts`, `ui/textDialog.ts`.

---

## Paket B – Lautstärke mehrerer Töne

**Ziel:** Markierte Noten gemeinsam lauter oder leiser stellen; jede Lautstärke-Änderung ist sofort zu hören – auch am Regler
im Lautstärke-Menü der Piano-Roll.

### Entscheidungen

- Die Änderung ist **relativ**: jeder Ton ±8 (eine halbe Dynamikstufe; Stufen stehen in `MARKS` in `src/core/curve.ts`),
  begrenzt auf `MIN_VOLUME`–`MAX_VOLUME`. Unterschiede zwischen den Tönen bleiben erhalten, bis einer an die Grenze stößt.
- Wirkt auf: den markierten Bereich (`rangeSpan`, alle Stimmen der Zeile – wie `deleteRange`); sonst auf die gewählte Note;
  ist ein einzelner Akkordton gewählt (`selection.toneId`), nur auf diesen.
- Gespeichert wird wie bisher `Tone.volume` (fehlt = `DEFAULT_VOLUME` 100). Dynamikzeichen (pp, f …) bleiben unberührt.

### Befehl (`src/core/editor/range.ts` + `src/core/editor/commands.ts`)

```ts
/** Makes the marked passage (else the selected note or chord tone) louder or softer by `steps` × 8. */
export function changeVolume(s: EditorState, steps: number): EditorState   // in range.ts
```

- Töne einsammeln wie oben beschrieben; ohne Auswahl: `say(s, 'Erst eine Note auswählen oder einen Bereich markieren.')`.
- Neuer Wert je Ton: `clamp((tone.volume ?? DEFAULT_VOLUME) + steps * 8)`; `volume` weglassen, wenn es `DEFAULT_VOLUME` ist
  (so macht es auch `shape` in `src/core/editor/rollEdits.ts` – gleiche Regel, damit Dateien stabil bleiben).
- Ändert sich kein Ton (alle an der Grenze): Partitur unverändert, Meldung „Lauter geht es nicht.“ / „Leiser geht es nicht.“
- Meldung sonst: `„5 Töne lauter (mf · 88)“` – Zeichen und Zahl des **gewählten** Tons bzw. des ersten betroffenen,
  mit `volumeMark` aus `src/core/curve.ts`.
- In `COMMANDS`: `'edit.volume': { title: 'Lautstärke der markierten Noten', run: changeVolume }`.

### Hören

- `src/audio/engine.ts` (Interface), `src/audio/synth.ts`, `src/audio/sampler.ts`, `src/audio/simpleSynth.ts`:
  `audition(...)` bekommt einen optionalen letzten Parameter `velocity?: number` (Vorgabe wie heute: `AUDITION_VELOCITY` im
  Sampler; im einfachen Klang skaliert er die Lautstärke linear, Vorgabe = heutiges Verhalten).
- `src/ui/workstation.ts`, `auditionEdits` (Suchbegriff `private auditionEdits`): Heute klingt eine Note nur an, wenn sich ihre
  **Tonhöhe** geändert hat (`sound(...)` vergleicht `id:midi`). Erweitern: auch wenn sich `volume` eines ihrer Töne geändert hat –
  dann mit `velocity` = neue Lautstärke des gewählten Tons (bei ganzer Note: die größte ihrer Töne). Für reine
  Lautstärke-Änderungen die Sperre von 40 ms auf **150 ms** setzen (der Regler feuert bei jeder Bewegung).
- Damit klingt auch der Regler im Lautstärke-Menü (`src/ui/curvePopup.ts`, er ruft `host.preview({ kind: 'shape', … })`) –
  **prüfen**, dass dabei die Auswahl auf der Note liegt, deren Balken angeklickt wurde; sonst im Menü beim Öffnen die Note wählen
  (über `RollHost.select`, wie ein Klick auf den Balken).

### Tasten und Liste

`library.json`, Gruppe „Letzte / ausgewählte Note ändern“:
`"id": "edit.volume"`, Titel „Lautstärke der markierten Noten (oder der gewählten Note)“, `"command": "edit.volume"`,
`"args": { "1": "lauter", "-1": "leiser" }`, in `finale` und `logic`:
`{ "keys": { "1": ["Mod+Alt+ArrowUp"], "-1": ["Mod+Alt+ArrowDown"] }, "source": "icastico" }` (beide Kombinationen sind frei – geprüft).
Dadurch steht beides auch einzeln in der Befehlspalette.

### Tests und e2e

- `src/core/editor/range.test.ts`: Bereich über zwei Stimmen einer Zeile → alle Töne +8; Unterschiede bleiben; Grenze 127;
  Rückweg −8 ergibt wieder keine `volume`-Angabe bei 100; einzelner Akkordton; ohne Auswahl nur Meldung; `validateScore` leer.
- e2e: drei Noten eingeben, `Control+a`, `Control+Alt+ArrowUp` → Statuszeile nennt „3 Töne lauter“; gespeicherte Datei
  (Helfer `files()` im Skript) enthält `"vol": 108` dreimal; `Control+z` nimmt alles in einem Schritt zurück.

---

## Paket C – Gleichlauf von Notenschrift und Piano-Roll

**Ziel:** Sind Notenschrift und Piano-Roll zugleich zu sehen, zeigen beide denselben Takt: Scrollt man in einer Ansicht,
folgt die andere taktweise.

### Entscheidungen

- Gekoppelt wird über den **Takt am linken Rand der Roll** bzw. den **ersten Takt der obersten sichtbaren Akkolade**.
- Die Notenschrift folgt nur, wenn der Takt der Roll **nicht schon sichtbar** ist (kein Zittern). Die Roll folgt der Notenschrift
  immer auf den Taktanfang.
- Während der Wiedergabe und während einer Ziehgeste (`history.inGesture`) ruht der Gleichlauf (dort führt die Abspielmarke bzw. die Maus).
- Kein Schalter zum Abstellen (Wunsch laut Roadmap; kleinere Variante wäre ein Schalter – erst bauen, wenn es stört).

### Reine Logik (neu in `src/ui/lanes.ts` oder eigene Datei `src/ui/scrollSync.ts`, mit Test)

```ts
/** The bar that starts at or before a time (index into `measures`). */
export function measureIndexAt(measures: readonly Measure[], time: Fraction): number;
```

### Piano-Roll (`src/ui/pianoRoll.ts`)

- `RollHost` bekommt `scrolled(time: Fraction): void` – „der Nutzer hat die Roll waagrecht bewegt; am linken Rand steht diese Zeit“.
- Neue Methode `scrollToTime(time: Fraction): void`: `this.scroller.scrollLeft = xOfTime(layout, time) - layout.labelWidth`
  (Helfer in `src/ui/pianoRollGeometry.ts`), ohne dass daraus ein `scrolled` wird.
- Ein `scroll`-Listener am `this.scroller` (passive), über `requestAnimationFrame` gebündelt, meldet
  `host.scrolled(Zeit am linken Rand)`. **Eigene Scrolls dürfen nichts melden:** vor jedem programmatischen Setzen von
  `scrollLeft` (in `scrollToTime`, `setPlayhead(…, true)`, `keepInView`) ein Merker `this.quiet = true`, den der Listener beim
  nächsten Ereignis verbraucht.

### Workstation (`src/ui/workstation.ts`)

- `rollHost(lane)` (Suchbegriff `private rollHost`): `scrolled: (time) => this.syncFromRoll(lane, time)`.
- `syncFromRoll`: nichts tun bei Wiedergabe / Geste / wenn keine Notenschrift gezeigt wird. Takt bestimmen
  (`measuresOf(score)`, `measureIndexAt`), Element `document.getElementById('m' + measure.number)` (die Takte tragen diese ID –
  siehe `mei.ts`, Suchbegriff `<measure xml:id="m`). Liegt es ganz im sichtbaren Bereich von `this.el.pages.parentElement`
  (`#canvas`): nichts. Sonst `scrollIntoView({ block: 'center' })`. Vorher Merker `this.quietCanvas = true`.
- Listener auf `#canvas` (`this.el.pages.parentElement`), `scroll`, passiv, per `requestAnimationFrame` gebündelt →
  `syncFromNotation()`: Merker verbrauchen; sonst die erste `g.measure` suchen, deren Unterkante unter der Oberkante des
  sichtbaren Bereichs + 40 px liegt; daraus die Taktnummer (ID ohne `m`) → `measureStart` → für **jede** offene Roll
  (`this.rollLanes`) `roll.scrollToTime(start)`.
- Die anderen offenen Rolls folgen der bewegten Roll ebenfalls (`scrollToTime` auf den anderen Lanes).

### Tests und e2e

- Unit: `measureIndexAt` (Auftakt, genau auf dem Taktstrich, hinter dem Ende).
- e2e: Partitur mit ~40 Takten (einmal `type` mit vielen Noten oder per Import einer kleinen MusicXML aus dem Skript),
  Roll öffnen (`Control+Shift+P`), `page.evaluate` setzt `scrollLeft` der Roll (`.roll__scroll`) weit nach rechts und löst `scroll` aus →
  `waitForFunction`: der Takt am linken Rand der Roll ist in `#canvas` sichtbar. Umgekehrt: `#canvas` ganz nach unten scrollen →
  `scrollLeft` der Roll ist größer als vorher. Während der Wiedergabe gestartet: kein Fehler in der Konsole.

### Tastenliste

Eintrag `view.sync`, `"command": "ui.control"`, Titel „Notenschrift und Piano-Roll zeigen denselben Takt“,
`"via": "geschieht von selbst beim Scrollen, sobald beide zu sehen sind"`.

---

## Paket D – Tasten frei belegen

**Ziel:** Jede Funktion mit Taste lässt sich je Belegung (Finale, Logic, Finale-Ziffernblock) auf eine eigene Taste legen,
die Taste wegnehmen oder auf den Standard zurücksetzen. Gilt sofort, bleibt nach Neustart.

### Entscheidungen

- Gespeichert wird **nur die Abweichung** vom Standard, lokal (wie die übrigen Einstellungen), je Belegung:
  `localStorage['icastico.keys.<preset>'] = { "<funktionsId>|<arg>": ["Mod+Shift+L"] }` (`arg` leer bei Funktionen ohne Varianten;
  leere Liste = Taste weggenommen).
- Eine Taste hat **eine** Funktion: Wird sie neu vergeben, verliert die bisherige Funktion sie (nach Rückfrage im Fenster).
- Nicht belegbar: `Escape` (bricht die Aufnahme der Taste ab). Maus-Funktionen (`MOUSE_COMMANDS`) sind nicht änderbar.
- `docs/tastenbelegung.md` und die Tests beschreiben weiter den **Standard**.

### Logik (`src/ui/keymaps/library.ts`, rein, mit Tests)

```ts
export type KeyOverrides = Readonly<Record<string, readonly string[]>>;
export const overrideKey = (functionId: string, arg?: string): string => `${functionId}|${arg ?? ''}`;
/** The library with the user's own keys for one layout laid over it. */
export function withOverrides(library: KeyLibrary, id: PresetId, overrides: KeyOverrides): KeyLibrary;
/** Which function (title) holds a key in this layout, if any. */
export function holderOf(library: KeyLibrary, id: PresetId, combo: string): { functionId: string; arg?: string; title: string } | null;
```

- `withOverrides`: für jede Funktion die Tasten **dieser** Belegung ersetzen. Für `speedy` gilt heute „wo `speedy` fehlt, zählt
  `finale`“ (`fn[id] ?? (id === 'speedy' ? fn.finale : undefined)`): Bei einer Abweichung in `speedy` zuerst die Finale-Tasten
  nach `speedy` kopieren und dann ersetzen. Die Form der Tasten (`string[]` oder Objekt je `arg`) beibehalten; `source` der
  geänderten Funktion `"icastico"`.
- `PaletteEntry` bekommt `readonly id: string` (Funktions-ID) und `readonly arg?: number` gibt es schon – damit ist jede Zeile
  eindeutig (`overrideKey(entry.id, entry.arg?.toString())`). `paletteEntries` füllt sie.
- `buildKeymap(id, library)` und `paletteEntries(id, library)` nehmen die Bibliothek schon als Parameter – **nicht umbauen**,
  nur überall die überlagerte Bibliothek übergeben.

### Einstellungen (`src/ui/preferences.ts`)

`loadKeyOverrides(id: PresetId): KeyOverrides` / `saveKeyOverrides(id, overrides)` nach dem Muster von `loadKeymapPreset`
(defekter Inhalt → `{}`; nur Einträge übernehmen, deren Wert eine Liste von Zeichenketten ist).

### Stellen, die die überlagerte Bibliothek brauchen

| Datei | Suchbegriff | Änderung |
|---|---|---|
| `src/main.ts` | `buildKeymap(loadKeymapPreset())` | `buildKeymap(id, withOverrides(KEY_LIBRARY, id, loadKeyOverrides(id)))` |
| `src/ui/workstation.ts` | `setKeymap(id: PresetId)` | ebenso; eine private Hilfsmethode `library()` für die aktuelle Belegung |
| `src/ui/workstation.ts` | `paletteEntries(this.keymap.id)` | `paletteEntries(this.keymap.id, this.library())` |

### Oberfläche

- Neue Datei `src/ui/keysDialog.ts`: `keysDialog(options): Promise<void>` – Fenster „Tasten anpassen“ (Overlay `modal`, Esc schließt):
  - Suchfeld oben; Liste aus `paletteEntries` der überlagerten Bibliothek, gefiltert mit `searchPalette` (beides vorhanden).
  - Je Zeile: Titel, aktuelle Taste (leer: „–“), Knöpfe **„Ändern“**, **„✕“** (Taste wegnehmen), **„↺“** (Standard; nur sichtbar,
    wenn abweichend). Geänderte Zeilen tragen einen Punkt in der Akzentfarbe.
  - „Ändern“: Zeile zeigt „Neue Taste drücken … (Esc bricht ab)“; der nächste `keydown` wird mit `numpadComboOf(e) ?? comboOf(e)`
    (`src/ui/keys.ts`; den Ziffernblock nur in der Belegung `speedy` unterscheiden – so macht es `onKey` in der Workstation) in eine
    Kombination übersetzt; reine Umschalttasten (`comboOf` liefert `null`) ignorieren.
  - Gehört die Taste schon einer anderen Funktion (`holderOf`): in der Zeile fragen „Liegt auf „<Titel>“. Dort wegnehmen?“ mit
    „Ja“ / „Abbrechen“. Bei „Ja“ zwei Einträge speichern (neue Taste hier, leere bzw. verkürzte Liste dort).
  - Unten: „Alle zurücksetzen“ (löscht die Abweichungen dieser Belegung, mit `ask(...)` aus `src/ui/dialog.ts` bestätigen), „Fertig“.
  - Nach jeder Änderung: speichern und `options.changed()` aufrufen.
- `Workstation`: neue UI-Funktion `'view.keys'` (`UiCommandId`, `UI_COMMANDS`, `case` in `run`) → `keysDialog({ preset: this.keymap.id, changed: () => this.setKeymap(this.keymap.id) })`.
  `setKeymap` baut Belegung und Tastenhilfe neu – dadurch gilt die Taste sofort.
  In `WITHOUT_DOCUMENT` aufnehmen (geht auch ohne offene Partitur).
- Tastenhilfe (`buildHelp`): neben „Neuigkeiten“ ein Knopf „Tasten anpassen …“ → `this.run('view.keys')`.
- `library.json`, Gruppe „Datei & Ansicht“: `"id": "view.keys"`, Titel „Tasten anpassen: jede Funktion auf eine eigene Taste legen“,
  `"command": "view.keys"`, `"via": "Tastenhilfe (F1): Knopf „Tasten anpassen …“"`.

### Tests und e2e

- `src/ui/keys.test.ts`: `withOverrides` – ersetzt nur die genannte Funktion/Variante; leere Liste nimmt die Taste weg;
  `speedy`-Abweichung lässt die übrigen aus Finale geerbten Tasten bestehen; `holderOf` findet den Besitzer;
  `buildKeymap` mit Überlagerung bindet die neue Taste und nicht mehr die alte; ohne Abweichungen ist alles wie vorher
  (die vorhandenen Tests bleiben unverändert grün).
- e2e: F1 → „Tasten anpassen …“ → nach „Transponieren“ suchen → „Ändern“ → `Control+Alt+t` drücken → Fenster schließen →
  `Control+Alt+t` öffnet das Transponieren-Fenster, `Control+Shift+t` nicht mehr; Seite neu laden: gilt weiter;
  „Alle zurücksetzen“ → `Control+Shift+t` öffnet es wieder. Zweiter Fall: eine schon vergebene Taste wählen → Rückfrage erscheint.
  **Am Ende des Blocks zurücksetzen**, damit die folgenden Schritte die Standardtasten vorfinden.

---

## 4. Bewusst nicht in dieser Runde

- Vorschaubilder der Bibliothek setzen das ganze Stück, um Seite 1 zu zeigen (32 Takte: 130 ms, 128 Takte: 510 ms, einmal je
  Start und Partitur). Bei den Stücklängen des Owners (meist unter 60 Takte) kaum spürbar – erst kürzen, wenn die Bibliothek groß wird.
- Nur sichtbare Seiten zeichnen / Notensatz im Hintergrund (lange Stücke) – steht weiter unter „Später“ in der Roadmap.
- `workstation.ts` aufteilen; die ~25 fest eingetragenen Farbwerte in `styles.css` auf Variablen umstellen.
- Tabulatur-Spieltechniken (vom Owner abgewählt), Aufnahme zum Klick, Korrekturansicht, MIDI am Mac, rahmenloses Fenster.

## 5. Abschluss und Release

- Nach Paket D alle vier Prüfungen aus Abschnitt 0, zusätzlich `cargo test --manifest-path src-tauri/Cargo.toml`.
- **Release nur auf Wunsch des Owners:** Version in `package.json`, `package-lock.json` (zwei Stellen oben),
  `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (Paket `icastico`) gleich erhöhen; Eintrag oben in `src/ui/patchNotes.ts`;
  Kopfzeile von Schritt 1 in `docs/roadmap.md`; Commit „Release 0.29.0“; `git push origin feature/feinschliff:main`.
  Den Tag legt der Owner auf GitHub an.
- Vorschlag: Paket A → 0.28.3, Pakete B–D → 0.29.0.

## 6. Offen für den Owner (nicht selbst entscheiden)

1. **Notationsregeln A–H** (`docs/notationsregeln-beispiele.html`) warten weiter auf Ja/Nein je Buchstabe.
2. **19 Tasten der Finale-Belegung** stehen in der Tastenliste noch als „Annahme“.
3. **Gleichlauf ohne Schalter:** Wenn das Mitscrollen beim Arbeiten stört, kommt ein Schalter dazu.
4. Mikrofon und MIDI-Keyboard in der installierten App kann nur der Owner testen.
