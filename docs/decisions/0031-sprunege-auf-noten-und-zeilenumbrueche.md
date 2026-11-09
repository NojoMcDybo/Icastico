# 0031 – Sprünge und Tempoanweisungen genau auf der Note; Takte pro Zeile und Zeilenumbrüche

- Status: angenommen
- Datum: 2026-11-08

## Genaue Stelle für Segno, Coda, Sprünge und Tempoanweisungen

- Bisher gehörten alle Taktzeichen zu einem Takt (`BarMark.at` = Taktanfang): Segno und Coda standen am ersten Schlag, die Wörter
  (D.C., rit. …) am letzten. Jetzt kann **Segno, Coda, Sprung (To Coda, Fine, D.C., D.S. …) und Tempoanweisung (rit., accel., a tempo)**
  genau auf einer Note stehen: `BarMark.exact` (Dateiformat 13), `at` ist dann die Zeit der Note. Wiederholungen, Klammern (Volta),
  Doppel- und Schlussstrich gehören weiter zum Takt (`canSitOnNote` in `core/symbols.ts`).
- Gesetzt wird das Zeichen aus der Palette (Doppelklick: auf die gewählte Note) oder durch Ziehen auf eine Note; ein gesetztes Zeichen
  wird wie bisher angeklickt, gezogen und mit der Rücktaste gelöscht, auch auf eine andere Note im selben oder einem anderen Takt. Von jeder
  Art gibt es weiter eines pro Takt; ein neues ersetzt das alte (und seine Ausschluss-Nachbarn, z. B. D.C. und D.S.).
- Der Notensatz setzt es mit `tstamp` auf den Schlag der Note. Die **Wiedergabe-Reihenfolge ändert sich nicht**: sie wertet den Takt aus,
  in dem das Zeichen steht (Sprung am Taktende, wie es Finale macht). Ältere Dateien öffnen unverändert (ihre Zeichen gehören zum Takt).
- MusicXML schreibt die Wörter weiter am Taktanfang (die genaue Stelle geht dort verloren).

## Takte pro Zeile und Zeilenumbrüche

- **`Score.layout`** (Dateiformat 14): `perSystem` = feste Zahl Takte pro Zeile (1–16) oder `breaks` = die Takte (0-basiert), mit denen eine
  neue Zeile beginnt. Ohne beides setzt der Notensatz so viele Takte in eine Zeile, wie passen.
- **Einstellen:** Partitur-Einstellungen → „Takte pro Zeile“ (wie bisher, automatisch, oder 1 bis 8). Eine Zahl ersetzt importierte Umbrüche;
  „automatisch“ nimmt alles weg.
- **MusicXML-Import** übernimmt die Umbrüche der Datei (`<print new-system>` und `new-page` im ersten Instrument) als `breaks`; der
  **Export** schreibt `new-system` an diese Stellen (oder an jede n-te Taktgrenze bei „Takte pro Zeile“), damit das Zeilenbild in Finale
  und MuseScore erhalten bleibt. PDF und Druck zeigen es so, wie es am Bildschirm steht.
- Verovio folgt den Umbrüchen genau (`breaks: encoded`); hat die Partitur keine, bleibt es bei der Automatik. Zu viele Takte in einer festen
  Zeile werden eng gesetzt – das liegt an der gewählten Zahl.
- Nicht übernommen aus MusicXML: Seitenumbrüche als eigene Sache (sie zählen als Zeilenumbruch), Abstände, Seitenränder, Schriftgrößen.
