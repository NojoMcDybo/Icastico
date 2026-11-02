# Icastico – Arbeitsanweisungen für Claude

Icastico ist ein Open-Source-Notensatzprogramm (GPL-3.0-or-later): schneller,
schlanker Workflow für verschiedene Instrumente, Audio→Noten, keine überladenen
Menüs, sondern eine individuell anpassbare Workstation. Inspiriert von Finale,
aber bewusst neu gedacht.

## Rollen

- **Owner (NojoMcDybo)**: Produktverantwortung, Ideen, musikalische Fachlichkeit,
  testet Builds. **Keine Programmiererfahrung.** Erklärungen auf Deutsch, in
  musikalischen Begriffen, ohne Fachjargon. Entscheidungen, die das Produkt
  betreffen, trifft der Owner – technische Optionen mit Empfehlung vorlegen.
- **Claude**: schreibt den gesamten Code, hält Doku und Roadmap aktuell.

## Zuerst lesen

1. `docs/vision.md` – was das Produkt sein soll (Owner-Sicht)
2. `docs/roadmap.md` – wo wir stehen, was als Nächstes kommt
3. `docs/architecture.md` – Schichten und Regeln
4. `docs/decisions/` – warum Dinge so sind, wie sie sind (ADRs)

## Sprache

- Doku, UI-Texte, Fehlermeldungen für Nutzer: **Deutsch**
- Code, Bezeichner, Code-Kommentare, Commit-Messages: **Englisch**

## Architekturregeln (nicht verhandelbar ohne neues ADR)

1. **Das Modell (`src/core`) weiß nichts von Pixeln, DOM oder Verovio.**
2. **Zeitstrahl-Modell**: Events haben Onset + Dauer als exakte Brüche
   (`Fraction`, Ganze = 1). Takte, Haltebögen über Taktstriche, Pausen und
   Balken werden in `src/core/notation` *abgeleitet*, nie gespeichert.
3. **Tonhöhen im Modell sind klingend** und mit Schreibweise (Fis ≠ Ges).
4. **Modell ist immutable.** Änderungen erzeugen ein neues `Score`-Objekt.
   Ab Schritt 2 laufen alle Änderungen über Commands (Undo, Makros, Skripte).
5. **Verovio ist nur Renderer** (`src/render/verovio.ts`). MEI ist Renderformat,
   nicht Dateiformat. Alles, was Notationsentscheidung ist (Vorzeichen, Balken,
   Pausenaufteilung), passiert vorher in unserem Code.
6. **Instrumente sind Daten** (`src/core/instruments.ts`), kein Spezialcode.
7. **Rust (`src-tauri`) nur für native Dienste**: MIDI, Audio, KI-Inferenz,
   Dateisystem. Musiklogik bleibt in TypeScript.
8. Plattformunterschiede (Windows/Mac) nur hinter Schnittstellen.

## Befehle

```bash
npm install            # Abhängigkeiten
npm test               # Unit-Tests (Vitest), inkl. echtem Verovio-Rendering
npm run typecheck      # TypeScript strikt
npm run build          # Typecheck + Web-Build nach dist/
npm run screenshot -- out.png [--click=<svg-id>] [--keys=Control+n,5,c,d]
                       # App im Headless-Chromium, optional mit Klick/Tastendrücken
npm run e2e            # Ende-zu-Ende-Test der Oberfläche (nach npm run build;
                       # braucht das global installierte Playwright der Claude-Umgebung)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust-Tests
npm run tauri dev      # Desktop-App lokal (braucht Rust + Systemlibs)
npx tauri build        # Installer bauen
```

## Arbeitsweise

- **Jede Änderung verifizieren**: `npm test` + `npm run typecheck`. Bei UI-
  Änderungen zusätzlich `npm run build && npm run e2e` und
  `npm run screenshot`, Screenshot ansehen. Der Owner kann nicht debuggen –
  was wir ausliefern, muss laufen.
- Native Funktionen (Rust, Berechtigungen, Fenster) in der echten App prüfen:
  `npx tauri build --bundles deb`, dann unter `xvfb-run` (mit `openbox` für
  Fensterereignisse) starten und mit `xdotool`/`wmctrl` bedienen
  (`xdotool type` kann dort keine Umlaute – Umlaute im Browser-Test prüfen).
- **Dateiformat ändern** = Version in `src/core/file/format.ts` erhöhen,
  Migration schreiben, Test mit Datei der alten Version (ADR 0007).
- Neue Musiklogik bekommt Tests (Notationsregeln sind leicht falsch zu machen).
- Neue grundsätzliche Entscheidung → neues ADR in `docs/decisions/`
  (fortlaufende Nummer, Vorlage siehe `docs/decisions/README.md`).
- Nach jedem Arbeitspaket `docs/roadmap.md` aktualisieren.
- GitHub Actions bauen bei Push auf `main` Windows- und macOS-Installer
  (`.github/workflows/build.yml`). Ein roter Build ist ein Bug.

## Projektstruktur

```
src/core/            Modell, Zeit, Tonhöhen, Instrumente, Vorlagen/Einstellungen (reines TypeScript)
src/core/notation/   Zeitstrahl → Notation (Takte, Bögen, Pausen, Balken)
src/core/editor/     EditorState, Commands (reine Funktionen), Undo/Redo
src/core/file/       Dateiformat .icastico
src/render/          Modell → MEI → Verovio → SVG
src/ui/              Workstation (Rendering, Cursor, Auswahl), Tastatur, Dialoge
src/ui/keymaps/      Tastenbelegungen als Daten (Finale Simple Entry)
src/platform/        Desktop vs. Browser (Dateien, Fenster) hinter einer Schnittstelle
src/main.ts          Start
src-tauri/           Native Desktop-Hülle (Rust/Tauri 2)
docs/                Vision, Architektur, Roadmap, Entscheidungen
scripts/             Screenshot- und Ende-zu-Ende-Skripte
```
