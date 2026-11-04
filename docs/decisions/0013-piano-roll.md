# 0013 – Piano-Roll als zweite Ansicht derselben Töne

- Status: angenommen (erste Stufe: eine Roll unter der Notenschrift; Zeilenart und Ansichtsgrößen folgen)
- Datum: 2026-11-04

## Kontext

Die Partitur soll sich auch als Balkenansicht (Piano-Roll) bearbeiten lassen,
parallel zur Notenschrift. Beide Ansichten müssen dieselben Töne zeigen,
dieselbe Auswahl teilen und sich nicht auseinanderentwickeln können.

## Entscheidung

- **Eigene SVG-Ansicht** (`src/ui/pianoRoll.ts`), keine Fremdkomponente: Sie
  braucht Ton-IDs, Schreibweise, Abbrechen mit Esc und Tastaturzugang
  (Begründung in der Planung; Fremdbibliotheken kannten das nicht).
- **Ein Balken = ein Ton** mit der Ton-ID (ADR 0012). Ein Klick setzt dieselbe
  `Selection` (mit `toneId`) wie ein Klick auf den Notenkopf.
- **Zeit ist Sache des Events**, Tonhöhe Sache des Tons: Verschieben und
  Verlängern wirken auf das ganze Event (alle Akkordtöne zusammen), Hoch/Tief
  nur auf den gezogenen Ton. Einen einzelnen Ton zeitlich lösen ist ein
  eigener, späterer Schritt.
- **Strukturierte Bearbeitungen** laufen als reine Funktion durch
  `applyRollEdit` (`src/core/editor/rollEdits.ts`): `create`, `change`,
  `delete`. Die Tasten (Alt+←/→ verschieben, Umschalt+←/→ verlängern) rufen
  dieselbe Funktion auf.
- **Eine Ziehgeste = ein Rückgängig-Schritt** (`History.beginGesture` …
  `commitGesture`); Esc verwirft sie vollständig; gespeichert wird nur der
  abgeschlossene Stand.
- **Raster:** feinstens 1/64; die Roll rastet auf den gerade gewählten
  Notenwert (Zahlentaste) ein. Zeiten außerhalb des Rasters und Triolen
  werden nicht verschoben (Meldung).
- **Keine stillen Überschreibungen:** Ein Bearbeitungsschritt, der in eine
  andere Note derselben Stimme laufen würde, wird mit Meldung abgelehnt; die
  letzte gültige Vorschau bleibt. (Die Tastatureingabe überschreibt dagegen
  weiter wie in Finale.)
- Die Roll zeigt die **klingende** Tonhöhe (Regel 3); bei der Gitarre steht
  ein Hinweis, dass die Notenschrift eine Oktave höher notiert.
- Das Fenster-Layout (Größen klein/normal/maximiert, Zeilenart) ist
  Fensterzustand, nicht Teil der Datei.

## Folgen

- Kein neues Dateiformat.
- `Delete` löscht bei ausgewähltem einzelnen Akkordton nur diesen Ton.
- Rückfrage-Punkt für später: Soll das Zeichnen in eine belegte Stelle
  überschreiben statt ablehnen?
