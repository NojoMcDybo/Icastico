# Icastico

**Notensatz als individuelle Workstation.** Schnell schreiben statt suchen –
für Gesang, Gitarre und Klavier, mit Audio→Noten als Ziel.
Open Source, angelehnt an Finale, aber neu gedacht.

*Music notation software built as a customizable workstation. Early development.*

> **Status:** v0.25 – Befehlspalette (Strg+K), Noteneingabe wie in Finale (Simple Entry oder Ziffernblock) oder Logic Pro
> ([alle Tasten](docs/tastenbelegung.md)), Piano-Roll unter der Notenschrift, Wiedergabe mit
> Instrumentenklängen, Gitarrentabulatur mit Stimmungen, Liedtext, Akkordsymbole, Triolen,
> Sonderzeichen (Dynamik, Wiederholungen, Sprünge), Transponieren, Import von MusicXML, MIDI und
> Einzelstimmen-Aufnahmen, Export als PDF, MusicXML und MIDI, Drucken, Noten diktieren und
> MIDI-Keyboard (Windows). Eigene Bibliothek in `Dokumente/Icastico` mit Sammlungen und Papierkorb,
> automatisches Speichern, automatische Updates. Strg+O Bibliothek, Strg+N neu, F1 alle Tasten.
> Siehe [Roadmap](docs/roadmap.md).

## Installieren

**[Neueste Version herunterladen](https://github.com/NojoMcDybo/Icastico/releases/latest)** → unten bei „Assets“:

- **Windows:** `Icastico_…_x64-setup.exe` ausführen. Am Ende „Desktop-Verknüpfung
  erstellen“ angehakt lassen.
- **macOS (Apple Silicon):** `Icastico_…_aarch64.dmg` öffnen, Icastico in „Programme“ ziehen.

Das ist nur beim ersten Mal nötig: **Icastico aktualisiert sich danach selbst**
(beim Start, mit Rückfrage). Die Installer sind noch nicht von Microsoft/Apple
signiert, deshalb beim ersten Installieren:

- **Windows**: SmartScreen warnt → „Weitere Informationen“ → „Trotzdem ausführen“.
- **macOS**: Rechtsklick auf die App → „Öffnen“.

Testbuilds jedes Entwicklungsstands: Actions → „Desktop-Build“ → Artifacts.

## Entwickeln

Voraussetzungen: Node.js 22, Rust (stable), für Linux zusätzlich die
[Tauri-Systembibliotheken](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm test
npm run tauri dev
```

## Dokumentation

- [Vision](docs/vision.md) – was Icastico sein soll
- [Architektur](docs/architecture.md) – wie es gebaut ist
- [Roadmap](docs/roadmap.md) – wo wir stehen
- [Entscheidungen](docs/decisions/README.md) – warum es so gebaut ist

## Lizenz

GPL-3.0-or-later. Notensatz durch [Verovio](https://www.verovio.org) (LGPL-3.0).
