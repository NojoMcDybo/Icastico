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

## Schritt 1 – Schnelle Eingabe (in Arbeit, v0.7.0)

- [x] Command-System (reine Funktionen) mit Undo/Redo
- [x] Eingabe-Cursor (blinkend; gestrichelt im Einfügemodus), springt hinter Schlüssel/Taktart
- [x] Tastenbelegung nach Finale Simple Entry als austauschbarer Datensatz (ADR 0006)
- [x] Noten, Pausen, Punktierung, Akkorde, Haltebögen (auch über Taktstriche), Tonart-bewusst
- [x] Letzte/ausgewählte Note ändern: Stufe, Oktave, Halbton, Notenwert, löschen
- [x] Überschreiben (Standard) und Einfügen
- [x] Navigation: vor/zurück, System wechseln, Klick setzt Cursor
- [x] Tastenhilfe (F1 / ?), Statuszeile mit Modus
- [x] Sicherheitsnetz: Befehl, der nicht darstellbar ist, wird automatisch rückgängig gemacht
- [x] Speichern/Öffnen: Format `.icastico` (lesbar, versioniert, streng geprüft), ADR 0007
- [x] Absturzsicheres Speichern (Zwischendatei + Umbenennen, in Rust)
- [x] Nachfrage bei ungespeicherten Änderungen: Neu, Öffnen, Fenster schließen
- [x] Doppelklick auf `.icastico` öffnet Icastico (Dateizuordnung im Installer)
- [x] Ende-zu-Ende-Test der Oberfläche (`npm run e2e`)
- [ ] Owner prüft die als „Annahme“ markierten Tasten (ADR 0006)
- [x] Neue Partitur (Strg+N) mit Dialog: Titel, Komponist, Instrumente (Reihenfolge, mehrfach), Tonart, Taktart, Auftakt; merkt sich die letzte Wahl
- [x] Partitur-Einstellungen (Strg+, oder Klick auf den Titel): Titel, Komponist, Tonart/Taktart ab Takt, Auftakt – rückgängig machbar (ADR 0008)
- [x] Auftakt im Modell, in der Notation und im Dateiformat (Version 2, alte Dateien werden weiter geöffnet)
- [ ] Instrumente in bestehender Partitur hinzufügen/entfernen/umbenennen
- [ ] Transponieren
- [x] Bibliothek `Dokumente/Icastico` mit Sammlungen, Suche, Papierkorb, Explorer-Knopf (ADR 0009)
- [x] Automatisches Speichern, Dateiname folgt dem Titel, Start mit der zuletzt bearbeiteten Partitur
- [x] Design nach der Owner-App Folio: Bibliothek als Startbildschirm mit Vorschau-Kacheln, Farben/Schrift/Knöpfe (ADR 0009)
- [x] Update-Hinweis in der Bibliothek statt Dialog (wie Folio)
- [ ] Rahmenloses Fenster mit schwebenden Glas-Bedienelementen (wie Folio) – mit Owner abstimmen
- [x] Installer mit Desktop-Verknüpfung, automatische Updates über GitHub Releases (ADR 0010)
- [x] Owner hat den Update-Schlüssel als GitHub-Secret hinterlegt
- [x] Erste Release v0.6.0 veröffentlicht (Owner legt Releases auf GitHub an); Owner hat installiert: „Eingabe ist intuitiv“
- [x] Noten mit der Maus hoch/runter ziehen (Stufen in der Tonart, mit Alt Halbtöne), ADR 0011
- [x] Bibliothek der Tastenbelegungen: Finale + Logic Pro, umschaltbar in F1, inkl. geplanter Funktionen (`docs/tastenbelegung.md`), ADR 0011
- [ ] Owner prüft die Finale-Annahmen und ergänzt unbekannte Finale-Tasten (z. B. Triolen)
- [ ] Mac-Release nachholen (bei v0.6.0 war kein GitHub-Mac-Rechner frei)
- [ ] Partituren per Ziehen in Sammlungen verschieben
- [ ] Notationsregeln verfeinern (Synkopen, Halbtakt-Balken in 4/4)

## Schritt 2 – Workstation

- [ ] Befehlspalette (Strg+K)
- [ ] Panels andockbar, Layout speicherbar
- [ ] Workspaces pro Instrument/Aufgabe
- [ ] Tastenbelegung frei anpassbar (Grundlage: Bibliothek, ADR 0011)

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
