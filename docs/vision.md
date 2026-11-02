# Vision

> Was Icastico sein soll – aus Sicht des Owners. Ändert sich nur, wenn der
> Owner es sagt.

## In einem Satz

Ein Notensatzprogramm, in dem man **schnell schreibt statt sucht**: eine
aufgeräumte, anpassbare Workstation statt Menü- und Toolbar-Dschungel, mit
Eingabewegen, die zum Instrument passen – bis hin zu Audio→Noten.

## Ausgangslage

- Finale wurde im August 2024 eingestellt. Viele Finale-Nutzer suchen eine neue
  Heimat; Icastico ist an Finale angelehnt, übernimmt aber nicht dessen
  Bedienkonzept.
- Open Source (GPL-3.0-or-later).
- Zuerst Windows, dann macOS – aus **derselben Codebasis**, kein Rewrite.

## Leitideen

1. **Schnell und simpel.** Häufige Aufgaben mit wenigen Tasten. Kein Suchen.
2. **Workstation statt Menüs.** Die Oberfläche zeigt, was gerade gebraucht wird.
   Alles andere ist über eine Befehlspalette erreichbar. Layouts sind
   speicherbar und pro Instrument/Aufgabe umschaltbar.
3. **Anpassbar, aber nicht anpassungspflichtig.** Gute Voreinstellungen pro
   Instrument; Anpassung ist ein Angebot, kein Einstellungsdialog-Marathon.
4. **Instrumentgerechte Eingabe.** Gitarre ≠ Klavier ≠ Gesang.
5. **Audio→Noten.** Einspielen oder einsingen, Noten bekommen.

## Erste Instrumente

| Instrument | Notation | Typische Eingabe (Idee, noch zu klären) |
|---|---|---|
| Gesang | Violinschlüssel (später: Bass/Tenor), Liedtext | Einsingen (Audio→Noten), Tastatur |
| Gitarre | Violinschlüssel mit 8 darunter; Tabulatur vorerst **nicht nötig** | Tastatur, Audio, später Griffbrett |
| Klavier | Akkolade (zwei Systeme) | MIDI-Keyboard, Tastatur |

## Erster Audio-Fall

**Melodie einsingen** (bestätigt) – einstimmig, technisch am verlässlichsten.

## Ablage

Icastico verwaltet seine Partituren selbst in `Dokumente/Icastico`
(Sammlungen = Ordner), speichert automatisch und zeigt alles in einer
Bibliothek – angelehnt an „Folio“ (ADR 0009).

## Eingabe

**Erstmal wie Finale** (Simple Entry): Zahlen für Notenwerte, Buchstaben für
Tonhöhen. Details und offene Punkte: ADR 0006.

## Offene Fragen an den Owner

- Stimmen die als **Annahme** markierten Tasten in ADR 0006 mit deinem Finale überein?
- Oktavwahl: „nächste Oktave zur vorigen Note“ ok, oder wie in Finale über die Cursorhöhe?
- Gitarre: Akkordsymbole/Griffbilder wichtig?
- Gesang: Liedtext-Eingabe wann?
- Was hat an Finale genervt, was war unverzichtbar?

## Nicht-Ziele (vorerst)

- Mobile Apps
- Cloud/Online-Zusammenarbeit
- Vollständige Finale-Feature-Parität
