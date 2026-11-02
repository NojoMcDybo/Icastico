# 0002 – Notensatz über Verovio

- Status: angenommen
- Datum: 2026-11-02

## Kontext

Eine eigene Notensatz-Engine (Abstände, Kollisionen, Umbrüche) kostet Jahre
und ist nicht das Alleinstellungsmerkmal von Icastico.

## Entscheidung

[Verovio](https://www.verovio.org) (LGPL-3.0, C++ als WASM) rendert MEI zu SVG.
Unser Code erzeugt MEI aus dem Modell (`src/render/mei.ts`) und trifft alle
Notationsentscheidungen vorher selbst (Vorzeichen, Balken, Pausenaufteilung,
Haltebögen). Version ist exakt gepinnt (`package.json`).

## Alternativen

- **Eigene Engine**: volle Kontrolle, aber Monate bis Jahre bis professionell.
- **VexFlow / OpenSheetMusicDisplay**: leichter, aber sichtbar geringere
  Satzqualität bei komplexen Partituren.

## Folgen

- Professioneller Satz ab Tag 1.
- Verovio ist kein Editor: Interaktion läuft über ID-Mapping SVG → Modell
  (umgesetzt in Schritt 0).
- Große Partituren: Rendern pro Seite nötig. Wird gemessen, wenn es relevant wird.
- Feinsteuerung à la Finale (manuelles Verschieben) nur begrenzt; MEI kennt
  visuelle Offsets (`@ho`, `@vo`), die Verovio teilweise unterstützt.
- Austauschbar: Nur `src/render/` kennt Verovio.
