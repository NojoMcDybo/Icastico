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

## Schritt 1 – Schnelle Eingabe (in Arbeit, v0.12.0)

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
- [x] Vorbereitung Piano-Roll und Gleiten: jeder Ton hat eine dauerhafte Nummer, Dateiformat 3, ältere Dateien werden umgewandelt und vor dem ersten Speichern gesichert (ADR 0012)
- [x] Vorbereitung Piano-Roll: einzelne Akkordtöne sind auswählbar (Klick auf den Notenkopf), eine Ziehgeste ergibt später genau einen Rückgängig-Schritt und wird nie halbfertig gespeichert; ein Zeichenfehler macht nur die letzte Änderung rückgängig, nicht frühere
- [x] Piano-Roll unter der Notenschrift (Strg+Umschalt+P): Balken zeichnen (ziehen, Doppelklick), verschieben, verlängern, löschen; ein Klick wählt denselben Ton wie in der Notenschrift; Raster = gewählter Notenwert; Esc verwirft eine Geste; Tasten Alt+←/→ und Umschalt+←/→ (ADR 0013)
- [x] Zeilenart je Notenzeile (Notenschrift / Beides / Piano-Roll, Schalter neben jeder Zeile) und Ansichtsgrößen klein/normal/maximiert (Esc bringt zurück), wird je Partitur gemerkt (ADR 0013)
- [ ] Notenschrift und Piano-Roll scrollen taktweise im Gleichlauf
- [x] Einzelnen Akkordton in eine eigene Stimme lösen (Strg+Umschalt+D), Roll zeigt alle Stimmen einer Zeile
- [x] Ausdrückliche Haltebögen (zwei getrennte Noten, `T` setzt/löst) und Gleiten (Strg+Umschalt+G; die Lücke zwischen den Balken ist die Gleitdauer, ohne Lücke nur direkter Wechsel, Verbindung bleibt) in Notenschrift und Roll, Dateiformat 4 (ADR 0014)
- [x] Piano-Roll: Höhe der Roll durch Ziehen ihrer Oberkante (keine Größenknöpfe mehr), feineres Raster zum Zeichnen und Verlängern, Gleiten durch Ziehen von einem Punkt am Balkenende auf einen beliebigen anderen Balken
- [x] Transportleiste mit Anzeige (Takt, Schlag, Tempo, Taktart, Tonart), Wiedergabe mit eingebautem Klang (Haltebögen ohne neuen Anschlag, Gleiten als Tonhöhenverlauf), Tempo in der Partitur (Dateiformat 5, ADR 0015)
- [x] Echte Instrumentenklänge (SpessaSynth + MuseScore General, MIT) mit Gleiten per Pitch-Bend; Rückfall auf den einfachen Klang
- [x] Akkorde: Note auf eine andere ziehen (Notenschrift) bzw. genau darauf zeichnen (Roll, Alt + Ziehen) = Akkord, sonst automatisch zweite Stimme derselben Zeile; Akkordmodus (Taste links neben der 1) (ADR 0016)
- [x] Lautstärke je Ton und Lautstärke-Linie über die Note (Ein-/Ausblenden), Gleitverlauf als Kurve für Tonhöhe und Lautstärke; Menü per Klick auf Balken bzw. Gleit-Linie, Punkt mit Taste P setzen und ziehen; Dateiformat 6, Wiedergabe mit Expression (ADR 0016)
- [ ] Akkordnamen tippen („Cm7“) und Akkord-Menü (Umkehrungen, Septakkorde …)
- [ ] Lautstärke mehrerer Töne zugleich ändern; beim Einstellen anhören
- [ ] Bessere Einzelinstrumente (z. B. ein Konzertflügel als zweite Klangdatei) und Auswahl der Klänge je Instrument
- [ ] Aufnahmeknopf: Noten diktieren oder einspielen
- [ ] Legato/Phrasierungsbögen

## Schritt 2 – Workstation

- [ ] Befehlspalette (Strg+K)
- [ ] Panels andockbar, Layout speicherbar
- [ ] Workspaces pro Instrument/Aufgabe
- [ ] Tastenbelegung frei anpassbar (Grundlage: Bibliothek, ADR 0011)

## Schritt 3 – Klang & Austausch

- [ ] Wiedergabe (SoundFont-Synth in Rust), Cursor läuft mit
- [ ] MIDI-Keyboard-Eingabe (Step + Echtzeit mit Quantisierer)
- [x] MusicXML importieren (`.musicxml`, `.xml`, `.mxl`; Strg+Umschalt+I): Noten, Akkorde, Stimmen, Haltebögen, Tonart, Taktart, Auftakt, Tempo, Triolen/Quintolen/Septolen, Liedtext (1. Strophe), Akkordsymbole (ADR 0017, 0019, 0020)
- [x] Belegung „Finale-Ziffernblock“ (ADR 0018): Ziffernblock = Notenwert, Vorschau-Note am Cursor, Enter setzt sie, ↑/↓ und Zahlenreihe ändern sie
- [x] Liedtext (L) und Akkordsymbole (K), Dateiformat 7 (ADR 0019)
- [x] Triolen, Quintolen, Septolen: Eingabe-Modus, Notenschrift mit Klammer, MusicXML (ADR 0020)
- [x] MusicXML exportieren (Strg+Umschalt+E), Hin-und-zurück-Test (ADR 0021)
- [x] Gitarrentabulatur (Strg+T), berechnete Griffe (ADR 0022)
- [x] PDF-Export (Strg+P), Notenblatt mit mehreren Beispielen pro Seite, Einzelstimme herausziehen (ADR 0023)
- [ ] Finale-Dateien (`.musx`) direkt lesen – verschlüsseltes Binärformat, bewusst zurückgestellt (ADR 0021)
- [ ] Seitenlayout von Hand (Umbrüche, Systemabstand, Kopf-/Fußzeile), mehrere Strophen, Tabulatur-Spieltechniken

## Schritt 4 – Audio→Noten

- [ ] Aufnahme zum Klick
- [ ] Einstimmig (Gesang) → Noten
- [ ] Mehrstimmig (Klavier, Gitarre) → Noten (experimentell)

## Später

- Gitarren-Tabulatur, Akkordsymbole, Liedtext
- N-Tolen
- Eigene Funktionen des Owners (Makros/Skripte)
- Signierte Installer (Windows SmartScreen, macOS Gatekeeper)
