# Roadmap

Jeder Schritt endet mit einem Build, den der Owner installiert und testet.

## Schritt 0 – Fundament ✅

- [x] Repo, Lizenz (GPL-3.0-or-later), Doku, Entscheidungen
- [x] Tauri-2-Hülle (Windows + macOS aus einer Codebasis)
- [x] GitHub Actions: Tests bei jedem Push, Installer für Windows/macOS bei Push auf `main`
- [x] Zeitstrahl-Modell mit exakten Brüchen, Tonhöhen mit Schreibweise
- [x] Instrumente als Daten: Gesang, Gitarre (Violinschlüssel 8vb), Klavier (Akkolade)
- [x] Notationsschicht: Takte, Haltebögen über Taktstriche, Pausen, Ganztaktpausen, Balken
- [x] Vorzeichenlogik (Tonart, Auflösungszeichen, Gültigkeit bis Taktende)
- [x] Verovio-Rendering, Klick auf Note → Modell-Event (mit Toleranz)
- [x] Demo-Partitur „Erste Skizze“

## Schritt 1 – Schnelle Eingabe (in Arbeit, v0.2.0)

- [x] Command-System (reine Funktionen) mit Undo/Redo
- [x] Eingabe-Cursor (blinkend; gestrichelt im Einfügemodus), springt hinter Schlüssel/Taktart
- [x] Tastenbelegung nach Finale Simple Entry als austauschbarer Datensatz (ADR 0006)
- [x] Noten, Pausen, Punktierung, Akkorde, Haltebögen (auch über Taktstriche), Tonart-bewusst
- [x] Letzte/ausgewählte Note ändern: Stufe, Oktave, Halbton, Notenwert, löschen
- [x] Überschreiben (Standard) und Einfügen
- [x] Navigation: vor/zurück, System wechseln, Klick setzt Cursor
- [x] Tastenhilfe (F1 / ?), Statuszeile mit Modus
- [x] Neue leere Partitur (Strg+N) mit Gesang, Gitarre, Klavier
- [x] Sicherheitsnetz: Befehl, der nicht darstellbar ist, wird automatisch rückgängig gemacht
- [x] Speichern/Öffnen: Format `.icastico` (lesbar, versioniert, streng geprüft), ADR 0007
- [x] Absturzsicheres Speichern (Zwischendatei + Umbenennen, in Rust)
- [x] Nachfrage bei ungespeicherten Änderungen: Neu, Öffnen, Fenster schließen
- [x] Doppelklick auf `.icastico` öffnet Icastico (Dateizuordnung im Installer)
- [x] Ende-zu-Ende-Test der Oberfläche (`npm run e2e`)
- [ ] Owner prüft die als „Annahme“ markierten Tasten (ADR 0006)
- [ ] Titel und Komponist bearbeiten (aktuell heißt jede neue Partitur „Neue Partitur“)
- [ ] Neue Partitur mit Auswahl: Instrumente, Tonart, Taktart, Titel
- [ ] Tonart/Taktart ändern
- [ ] Wiederherstellung nach Absturz (automatische Sicherung)
- [ ] Zuletzt geöffnete Dateien
- [ ] Notationsregeln verfeinern (Synkopen, Halbtakt-Balken in 4/4)

## Schritt 2 – Workstation

- [ ] Befehlspalette (Strg+K)
- [ ] Panels andockbar, Layout speicherbar
- [ ] Workspaces pro Instrument/Aufgabe
- [ ] Tastenbelegung anpassbar

## Schritt 3 – Klang & Austausch

- [ ] Wiedergabe (SoundFont-Synth in Rust), Cursor läuft mit
- [ ] MIDI-Keyboard-Eingabe (Step + Echtzeit mit Quantisierer)
- [ ] MusicXML Export/Import (Brücke zu Finale/MuseScore/Dorico)
- [ ] PDF-Export

## Schritt 4 – Audio→Noten

- [ ] Aufnahme zum Klick
- [ ] Einstimmig (Gesang) → Noten
- [ ] Mehrstimmig (Klavier, Gitarre) → Noten (experimentell)

## Später

- Gitarren-Tabulatur, Akkordsymbole, Liedtext
- N-Tolen
- Eigene Funktionen des Owners (Makros/Skripte)
- Signierte Installer (Windows SmartScreen, macOS Gatekeeper)
