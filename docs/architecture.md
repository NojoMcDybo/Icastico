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
- `model.ts` – `Score → Part → Voice → NoteEvent`.

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

### 4. UI – `src/main.ts` (wird in Schritt 1–2 zu `src/ui/`)

Workstation-Hülle: Kopfzeile, Papier, Statuszeile. Auswahl per Klick mit
Toleranz (hohle Notenköpfe).

### 5. Native Hülle – `src-tauri/`

Tauri 2. Aktuell nur Fenster. Geplant: MIDI (`midir`), Audio-Ein/Ausgabe
(`cpal`), Synthesizer, ONNX-Inferenz für Audio→Noten, Dateien.

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
