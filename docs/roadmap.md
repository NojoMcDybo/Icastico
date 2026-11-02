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

## Schritt 1 – Schnelle Eingabe (als Nächstes)

- [ ] Command-System mit Undo/Redo (Grundlage für alles Weitere)
- [ ] Eingabe-Cursor: sichtbare Position im Zeitstrahl
- [ ] Tastatureingabe: Notenwert wählen, Tonhöhe per Buchstabe, Oktave, Vorzeichen, Pause
- [ ] Auswahl bearbeiten: Tonhöhe hoch/runter, Dauer ändern, löschen
- [ ] Neue Partitur: Instrumente wählen, Tonart, Taktart
- [ ] Speichern/Öffnen (eigenes JSON-Format, versioniert)
- [ ] Notationsregeln verfeinern (Synkopen, Halbtakt-Balken in 4/4)
- [ ] Offen: Owner definiert „schnell“ (siehe `vision.md`)

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
