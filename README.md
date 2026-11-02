# Icastico

**Notensatz als individuelle Workstation.** Schnell schreiben statt suchen –
für Gesang, Gitarre und Klavier, mit Audio→Noten als Ziel.
Open Source, angelehnt an Finale, aber neu gedacht.

*Music notation software built as a customizable workstation. Early development.*

> **Status:** v0.2.0 – Noteneingabe per Tastatur wie in Finale (Simple Entry),
> Speichern und Öffnen (`.icastico`). Strg+N neu, Strg+S speichern,
> Strg+O öffnen, F1 zeigt alle Tasten. Siehe [Roadmap](docs/roadmap.md).

## Ausprobieren

Fertige Installer baut GitHub automatisch:
**Actions → „Desktop-Build“ → neuester Lauf → Artifacts** (`Icastico-Windows`
bzw. `Icastico-macOS`). Die Installer sind noch nicht signiert:

- **Windows**: SmartScreen warnt → „Weitere Informationen“ → „Trotzdem ausführen“.
- **macOS**: Rechtsklick auf die App → „Öffnen“.

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
