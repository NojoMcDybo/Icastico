# 0011 – Bibliothek der Tastenbelegungen (Finale + Logic) und Ziehen mit der Maus

- Status: angenommen
- Datum: 2026-11-03

## Kontext

Der Owner findet die Eingabe intuitiv und wünscht sich (1) Noten mit der Maus
nach oben/unten ziehen und (2) eine Bibliothek von Tastenbelegungen auf
Grundlage von Finale **und** Logic Pro – unabhängig davon, was die App
schon kann.

## Entscheidung

**Bibliothek als Daten:** `src/ui/keymaps/library.json` beschreibt jede
Funktion eines Notenprogramms *einmal*, mit ihren Tasten in Finale und in
Logic Pro und der Herkunft jeder Taste:

- `doku` – aus der Dokumentation des Programms,
- `annahme` – von uns gewählt, vom Owner zu prüfen,
- `icastico` – eigene Ergänzung (z. B. wo die Taste im Vorbild etwas
  anderes tut: Logic-T = Fis, daher Haltebogen = Umschalt+T).

Funktionen ohne `command` sind **geplant** (Triolen, Wiedergabe, Kopieren …)
und stehen trotzdem schon drin. Daraus entstehen:

- die beiden **Belegungen** („Finale“, „Logic Pro“), umschaltbar in der
  Tastenhilfe (F1), gemerkt pro Rechner,
- die **Tastenhilfe** in der App (nur, was schon geht),
- das **Dokument** `docs/tastenbelegung.md` (alles, auch Geplantes) –
  erzeugt mit `npm run keys:doc`; ein Test schlägt fehl, wenn es veraltet ist.

**Logic denkt anders als Finale**, dafür zwei neue Befehle:

- `input.pitchClass`: Tasten wie eine Klaviatur (A = C, W = Cis …). Schwarze
  Tasten werden nach Tonart geschrieben (F-Dur: Des; C-Dur: Cis, Es, Fis,
  Gis, B).
- `edit.semitone`: echter Halbtonschritt (E + 1 = F), neben Finales
  Vorzeichen-Änderung (`edit.alter`: E → Eis).

Tasten: `Mod` = Strg (Windows) / ⌘ (Mac), `Alt` = Alt / ⌥. Anzeige
plattformgerecht („Strg+Umschalt+Z“ bzw. „⌘⇧Z“).

**Ziehen:** Note packen und hoch/runter ziehen – stufenweise in der Tonart
(wie Finale), mit Alt in Halbtönen (wie Logic). Live-Vorschau, Statuszeile
zeigt die neue Tonhöhe, Loslassen = ein Rückgängig-Schritt. Schrittweite =
halber Linienabstand des Systems, gemessen am gezeichneten Notensystem.

## Quellen

- Finale Simple Entry: siehe ADR 0006.
- Logic Pro: Apple, [Step-Input-Tastatur](https://support.apple.com/en-gw/guide/logicpro/lgcp4fe41fb3/10.7/mac/11.0),
  [Hauptfenster und Editoren](https://support.apple.com/guide/logicpro/main-window-tracks-and-various-editors-lgcpe8314fe2/mac)
  (über Suchergebnisse geprüft; help.apple.com war aus der Arbeitsumgebung
  nicht erreichbar).

## Folgen

- Eine neue Belegung (z. B. Sibelius, Dorico) = ein weiterer Eintrag pro
  Funktion, kein Code.
- Was der Owner aus Finale besser weiß, ändert er in einer Datei – die
  Herkunft „annahme“ zeigt, wo nachzusehen ist.
- Logics Schritteingabe kennt Vorzeichen/Oktave *für die nächste Note*;
  Icastico wählt die Oktave automatisch – diese Logic-Tasten sind „geplant“.
