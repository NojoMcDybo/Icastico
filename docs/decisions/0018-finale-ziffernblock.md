# 0018 – Dritte Tastenbelegung „Finale-Ziffernblock“

- Status: angenommen
- Datum: 2026-11-04

## Kontext

Der Vater des Owners tippt in Finale mit dem Ziffernblock (siehe
`docs/anforderungen-gitarre.md`): Ziffernblock wählt den Notenwert, Enter setzt die Note und
den Cursor weiter (gleiche Tonhöhe und Notenwert), ↑/↓ ändert die Tonhöhe, die obere
Zahlenreihe fügt ein Intervall hinzu. Die bestehende Finale-Belegung (ADR 0006) meint
Finale Simple Entry (Buchstaben = Tonhöhen) und liest Ziffernblock und Zahlenreihe gleich.

## Entscheidung

- **Dritte, wählbare Belegung** `speedy` („Finale-Ziffernblock“) neben „Finale“ und „Logic Pro“.
  Alles Bestehende bleibt unverändert. Wo `library.json` für `speedy` nichts nennt, gelten die
  Finale-Tasten (Pfeile, T, Plus/Minus, Buchstaben, Datei- und Ansichtsbefehle).
- **Ziffernblock unterscheidbar:** Tasten wie `Num5` (nur Ziffernblock); jede Belegung ohne
  `Num…`-Eintrag liest den Ziffernblock weiter wie die Zahlenreihe. Umschalt bleibt bei Ziffern
  erhalten (`Shift+2` = Intervall darunter).
- **Neue Befehle:** `input.repeat` (Enter: Kopie der Note vor dem Cursor dahinter, Akkorde
  ganz; ohne Note davor beginnt die Eingabe), `input.length` (Ziffernblock: Notenwert der
  letzten *und* der nächsten Note), `input.interval` (Zahlenreihe 2–8 darüber, Umschalt
  darunter, diatonisch in der Tonart), `edit.dot` (Punkt an der letzten Note).
- **Keine Geisternote:** Finale zeigt vor Enter eine Vorschau-Note. Wir setzen die Note sofort
  (Enter) und ändern die *letzte* Note mit ↑/↓, Ziffernblock und Zahlenreihe. Das Ergebnis ist
  dasselbe, die Reihenfolge ist „Enter, dann anpassen“ statt „anpassen, dann Enter“.

## Folgen

- Eine echte Vorschau-Note am Cursor (Geisternote) wäre ein späterer Ausbau.
- Ziffernblock 8 (Doppelganze) gibt es nicht; die Taste fällt auf die Zahlenreihe zurück.
- Die Tabelle in `docs/tastenbelegung.md` hat eine vierte Spalte.
