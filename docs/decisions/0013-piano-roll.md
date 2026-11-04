# 0013 – Piano-Roll als zweite Ansicht derselben Töne

- Status: angenommen (Roll je Notenzeile, Zeilenart und Ansichtsgrößen umgesetzt)
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
- **Zeilenart je Notenzeile:** Notenschrift, Beides oder Piano-Roll
  (`src/ui/lanes.ts`, reiner Zustand). Ein kleiner Schalter links neben jeder
  Zeile schaltet Noten → Beides → Roll; in der Roll-Kopfzeile stehen alle drei
  Arten zur Wahl. Eine Zeile im Modus „Roll“ wird nicht mehr gestochen
  (`scoreToMei` mit `hiddenStaves`), ihre Töne sind nur in der Roll.
- **Ansichtsgrößen** je Ansicht: klein (schmale Leiste: Roll als Umriss, Notenschrift
  verkleinert, Töne bleiben anklickbar), normal, maximiert (die anderen werden
  Leisten; Esc bringt zurück). Eine Ansicht ist die aktive (Fokusring).
- Das alles ist Fensterzustand, nicht Teil der Datei: es wird je Partitur (nach
  Dateipfad) in den App-Einstellungen gemerkt.
- Die Roll einer Zeile zeigt deren **erste Stimme**; mehrere Stimmen auf einer
  Zeile gibt es in der Oberfläche noch nicht.

## Folgen

- Kein neues Dateiformat.
- Scrollen läuft noch nicht taktweise im Gleichlauf: eine Auswahl wird aber in
  der jeweils anderen Ansicht ins Bild geholt.
- `Delete` löscht bei ausgewähltem einzelnen Akkordton nur diesen Ton.
- Rückfrage-Punkt für später: Soll das Zeichnen in eine belegte Stelle
  überschreiben statt ablehnen?
