# Architektur

## Überblick

```
┌ Workstation (UI) ──────────────────────────────────────────┐
│ Panels, Befehlspalette (Strg+K), Workspaces als JSON       │  Schritt 2
└──────────────┬─────────────────────────────────────────────┘
               │ ruft NUR Commands auf
┌ Command-Registry ──────────────────────────────────────────┐
│ jede Funktion = Command (ID, Taste, Bedingung)             │  Schritt 1–2
│ → Undo/Redo, Makros, Tastenbelegung, Skripte               │
└──────────────┬─────────────────────────────────────────────┘
               ▼
        Score-Modell  (src/core/model.ts – die eine Wahrheit)
      ▲                                  │
 Eingabe-Adapter                   Ausgabe-Adapter
 Tastatur, Maus          (S1)      Notationsschicht → MEI → Verovio → SVG  ✅
 MIDI-Keyboard (Rust)    (S3)      Wiedergabe: Synth (Rust)               (S3)
 Audio→Noten (Rust)      (S4)      MusicXML, MIDI, PDF                    (S3+)
```

## Schichten

### 1. Modell – `src/core/`

- `time.ts` – exakte Brüche. Ganze Note = 1. Nie Gleitkomma für Musikzeit.
- `pitch.ts` – Tonhöhe mit Schreibweise (Stufe, Alteration, Oktave), klingend.
- `instruments.ts` – Instrumente als Daten (Systeme, Schlüssel, Umfang, MIDI-Programm).
- `model.ts` – `Score → Part → Voice → NoteEvent → Tone`, optional mit Auftakt (`pickup`).
  Jeder Ton hat eine dauerhafte, partiturweit eindeutige ID (ADR 0012).
- `templates.ts` – Partitur aus dem Neu-Dialog anlegen, globale Änderungen
  (Titel, Tonart/Taktart ab Takt, Auftakt), deutsche Tonartnamen (ADR 0008).

**Zeitstrahl statt Takte** (ADR 0003): Ein `NoteEvent` hat `onset` und
`duration`. Ein Event kann über Taktstriche gehen – es bleibt *ein* Event.
Pausen sind Lücken. Takte entstehen aus der Taktart-Liste (`measuresOf`).

### 2. Notationsschicht – `src/core/notation/`

Übersetzt den Zeitstrahl in Notenschrift:
Taktaufteilung, Haltebögen, Notenwerte (mit Punktierung), beat-gerechte
Pausen, Ganztaktpausen, Balken. Hier landen später auch N-Tolen,
enharmonische Schreibweise für Audio/MIDI-Eingaben, Stimmenaufteilung.

Das ist die Schicht, in der Notensatz-*Wissen* steckt – deshalb
ausführlich getestet.

### 3. Rendering – `src/render/`

- `mei.ts` – Modell → MEI 5. Setzt Vorzeichen nach Taktregeln und Balken.
  Jedes Element bekommt eine ID; `elements` bildet SVG-IDs auf Modell-Events ab
  (Klick auf Note → Event).
- `verovio.ts` – Wrapper um Verovio (WASM). Einzige Stelle, die Verovio kennt.

### 4. Editor – `src/core/editor/`

- `state.ts` – `EditorState` = Partitur + Cursor + Auswahl + Eingabe-Einstellungen.
- `commands.ts` – jede Funktion ist ein Command: reine Funktion
  `(Zustand, Argument) → neuer Zustand` mit deutschem Titel.
- `voiceOps.ts` – Zeitstrahl-Operationen (Überschreiben, Einfügen).
- `history.ts` – Undo/Redo durch Aufbewahren alter Zustände (nur
  Partitur-Änderungen erzeugen Undo-Schritte; eine Geste (Ziehen in einer Ansicht)
  ist ein einziger Schritt, `committed` ist der Stand ohne laufende Vorschau,
  `rollback()` nimmt nur die letzte Änderung zurück).

### 5. UI – `src/ui/`

- `keys.ts` – Tastendruck → layoutunabhängige Kombination („Alt+5“, „Plus“).
- `keymaps/library.json` + `library.ts` – Bibliothek der Tastenbelegungen
  (Finale, Logic Pro), daraus Belegungen, Tastenhilfe und Doku (ADR 0012).
- `workstation.ts` – rendert nur bei Partitur-Änderungen neu, zeichnet Cursor
  und Auswahl über das SVG, Statuszeile, Tastenhilfe. Fehler in einem
  Command werden abgefangen und rückgängig gemacht.

### 6. Datei & Plattform

- `src/core/file/format.ts` – Format `.icastico` lesen/schreiben (ADR 0007).
- `src/platform/files.ts` – eine Schnittstelle, zwei Umsetzungen: Desktop
  (native Dialoge, Dateien über Rust, Fenstertitel, Schließen-Schutz,
  Doppelklick-Dateien) und Browser (Download/Upload, für Entwicklung und Tests).
- `src/ui/dialog.ts` – eigene Dialoge (überall gleich, testbar).
- `src/ui/scoreDialog.ts` – „Neue Partitur“ / „Partitur-Einstellungen“.
- `src/ui/preferences.ts` – letzte Auswahl im Neu-Dialog (lokal gespeichert).

### 7. Bibliothek – `src/library/` (ADR 0009)

- `library.ts` – reine Logik: Dateinamen aus Titeln, Übersicht pro Partitur,
  Filtern/Suchen, Anzeige-Helfer.
- `service.ts` – Schnittstelle für Dateioperationen; `memory.ts` setzt sie im
  Speicher um (Browser, Tests) mit denselben Regeln wie Rust.
- `store.ts` – „Bibliothekar“: anlegen, speichern (+ umbenennen), duplizieren,
  verschieben, Papierkorb mit Herkunft, Sammlungen.
- UI: `src/ui/libraryHome.ts` (Startbildschirm, Kacheln, Folio-Design),
  `src/ui/thumbnails.ts` (erste Seite als Bild, zwischengespeichert), Workstation speichert
  Bibliotheks-Partituren automatisch und folgt verschobenen Dateien.

### 8. Updates – `src/platform/updater.ts`, `src/ui/updates.ts` (ADR 0010)

Stille Prüfung beim Start, Dialog, Speichern vor dem Installieren, Neustart.
Veröffentlichung über `.github/workflows/release.yml` (Tag `vX.Y.Z`).

### 9. Native Hülle – `src-tauri/`

Tauri 2. `library.rs`: Bibliotheksordner finden/anlegen, durchsuchen,
anlegen/umbenennen/löschen – nur innerhalb des Ordners. `lib.rs`:
Plugins: Dialog, Opener, Process, Updater.
Dateien lesen und absturzsicher schreiben (`read_score_file`,
`write_score_file`), per Doppelklick übergebene Dateien (`take_pending_file`,
macOS-Ereignis `open-file`), Dialog-Plugin. Geplant: MIDI (`midir`),
Audio-Ein/Ausgabe (`cpal`), Synthesizer, ONNX-Inferenz für Audio→Noten.

## Geplant: Workstation als Daten (ADR 0004)

- **Command**: `{ id, titel, taste?, wennAktiv?, ausführen(score, auswahl) → score }`
- **Workspace**: JSON mit Panel-Anordnung, sichtbaren Werkzeugen, Tastenbelegung.
  Beispiele: „Gitarre schnell“, „Klavier mit MIDI“, „Einsingen“.
- **Befehlspalette** (Strg+K): findet jeden Command – nichts muss sichtbar sein,
  um erreichbar zu sein.
- Eigene Funktionen des Owners werden später Commands/Makros/Skripte, nicht
  Umbauten am Kern.

## Geplant: Audio→Noten (Schritt 4)

```
Audio ─► [Rust: Tonhöhen-/Onset-Erkennung] ─► Tonereignisse (Hz, Start, Ende)
                                                     │
MIDI-Einspielung ────────────────────────────────────┤
                                                     ▼
            [TS: Tempo/Takt, Quantisierung, Tonart & Schreibweise, Stimmen]
                                                     ▼
                                          Commands → Modell
```

- Einstimmig (Gesang): pYIN (Mauch & Dixon, ICASSP 2014) oder CREPE.
- Mehrstimmig (Klavier, Gitarre): basic-pitch (Bittner et al., ICASSP 2022), lokal als ONNX.
- Die eigentliche Arbeit ist die zweite Hälfte (Rhythmus-Transkription); sie
  wird für MIDI-Einspielung wiederverwendet.
- Aufnahme zum Klick ist Standard – das macht Quantisierung massiv robuster.

## Bekannte Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Verovio ist Renderer, kein Editor | Interaktion über ID-Mapping (funktioniert); bei großen Partituren nur sichtbare Seiten neu rendern; Renderer austauschbar |
| Windows (WebView2/Chromium) vs. macOS (WKWebView/Safari) | MIDI/Audio in Rust statt Web-APIs; CI baut beide Plattformen |
| Audio→Noten-Qualität bei Mehrstimmigkeit | Erwartungsmanagement; einstimmig zuerst |
| Claude hat kein Gedächtnis zwischen Sessions | Diese Doku, ADRs, Roadmap, `CLAUDE.md` |
