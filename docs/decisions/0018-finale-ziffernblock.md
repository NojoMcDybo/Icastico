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
  Finale-Tasten (T, Buchstaben, Datei- und Ansichtsbefehle, Punkt).
- **Ziffernblock unterscheidbar:** Tasten wie `Num5` (nur Ziffernblock); jede Belegung ohne
  `Num…`-Eintrag liest den Ziffernblock weiter wie die Zahlenreihe. Umschalt bleibt bei Ziffern
  erhalten (`Shift+2` = Intervall darunter).
- **Vorschau-Note („Geisternote“):** Am Eingabe-Cursor steht eine blasse Note (Notenkopf, Hilfslinien,
  Tonname) – das, was Enter setzen würde. Zustand `input.ghost` (Tonhöhen; null = die Noten vor dem
  Cursor werden wiederholt). Sie wird gezeichnet, solange die Belegung „Finale-Ziffernblock“ aktiv ist.
- **Befehle:** `input.repeat` (Enter: Vorschau-Note setzen und weiter; die Vorschau bleibt, Enter
  wiederholt sie; ohne Eingabe beginnt Enter die Eingabe), `ghost.step` (↑/↓ in der Tonart),
  `ghost.alter` (+/−), `input.length` (Ziffernblock: Notenwert der Vorschau; ohne Eingabe: der gewählten
  Note), `input.interval` (Zahlenreihe 2–8 darüber, Umschalt darunter, diatonisch; auf die Vorschau,
  ohne Eingabe auf die gewählte Note). Der Punkt (`input.dot`) punktiert die Vorschau.
- Cursor bewegen, Mausklick oder Eingabe beenden setzen die Vorschau zurück.

## Folgen

- Ziffernblock 8 (Doppelganze) gibt es nicht; die Taste fällt auf die Zahlenreihe zurück.
- Die Tabelle in `docs/tastenbelegung.md` hat eine vierte Spalte.
- Frühere Fassung (0.11.0): ohne Vorschau, „Enter, dann anpassen“. Seit der Vorschau-Note ist es
  wie in Finale: „anpassen, dann Enter“.
