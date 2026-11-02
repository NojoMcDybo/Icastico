# 0008 – Auftakt und globale Partitur-Einstellungen

- Status: angenommen
- Datum: 2026-11-02

## Kontext

Neue Partituren brauchen Titel, Instrumente, Tonart, Taktart – und für
Lieder fast immer einen **Auftakt**. Diese Einstellungen müssen sich auch
nachträglich ändern lassen, ohne dass Noten verloren gehen.

## Entscheidung

- `Score.pickup` (optional, Bruch): Länge des unvollständigen ersten Takts.
  Takt 0 = Auftakt, volle Takte zählen ab 1. Pausen und Balken im Auftakt
  richten sich nach dem Raster eines *vollen* Takts, dessen Ende der Auftakt
  ist (`Measure.gridStart`).
- Änderungen über `applyScoreChanges` (`src/core/templates.ts`):
  - **Tonart ab Takt n:** Noten behalten ihren Klang, Vorzeichen werden neu
    verteilt (kein automatisches Transponieren).
  - **Taktart ab Takt n bis zum Ende:** spätere Taktwechsel werden ersetzt;
    die Noten bleiben an ihrem Platz in der Zeit, nur Taktstriche wandern.
  - **Auftakt nachträglich setzen/entfernen:** Taktstriche verschieben sich,
    Noten nicht – wer ohne Auftakt angefangen hat, korrigiert das mit einem
    Klick.
  - „Ab Takt 1“ bedeutet immer das ganze Stück (auch mit Auftakt).
  - Erlaubt sind vorhandene Takte und der nächste leere.
- Jede Änderung ist ein normaler Rückgängig-Schritt.
- Der Neu-Dialog merkt sich Instrumente, Tonart und Taktart für das nächste Mal.
- Dateiformat Version 2 (ADR 0007): optionales Feld `"pickup"`.

## Alternativen

- **Transponieren beim Tonartwechsel** (wie Finales Option): später als
  eigener Befehl – Tonart *ändern* und Musik *transponieren* sind zwei Dinge.
- **Taktart nur für einen Abschnitt** (zwischen zwei Takten): selten nötig,
  später möglich.

## Folgen

- Weil Takte nur abgeleitet sind (ADR 0003), sind Taktart- und Auftakt-
  Änderungen verlustfrei. In einem Takt-Modell müsste Musik umverteilt werden.
- Instrumente hinzufügen/entfernen in einer bestehenden Partitur fehlt noch.
