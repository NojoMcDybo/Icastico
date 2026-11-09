# 0033 – Silben wählen und verschieben, Druckvorschau, Tabulatur-Zeile mit TAB und Stimmung, durchgehende Taktstriche

- Status: angenommen
- Datum: 2026-11-09

Rückmeldungen des Owners nach 0.22.0 (Referenz: ein mit Finale erzeugtes PDF „Blues Co“).

## Liedtext in der Partitur

- Die Silben unter den Noten sind **eigene Dinge**: ein Klick wählt die Silbe (nicht die Note), Umschalt+Klick alle Silben bis zur
  angeklickten. Das Modell bleibt `NoteEvent.lyric`; es gibt kein neues Dateiformat.
- Bei gewählter Silbe wirken **Entf / Rücktaste** (Silbe weg, Note bleibt), **Strg+C / Strg+X** (kopieren / ausschneiden) und **Strg+V**
  (ab der gewählten Note, eine Silbe je Note; ein Eintrag „ohne Silbe“ nimmt die Silbe dort weg) auf die Silben statt auf die Noten. Jeder
  andere Befehl lässt die Silbe wieder los. Die Silben gehen zusätzlich als Text in die Zwischenablage des Systems.
- **Ziehen** einer Silbe auf eine andere Note derselben Stimme verschiebt sie (die alte Note bleibt ohne, die Silbe dort wird ersetzt).
- Verovio bekommt dafür `xml:id="syl-<Notenkennung>"`; `scoreToMei` liefert `syllables` (Kennung → Note). Der Klickbereich ist der ganze Kasten
  der Silbe (er ist breiter als die Buchstaben, wegen des Bindestrichs), solange keine Note getroffen wird.
- Das **Liedtext-Fenster** lässt sich am Kopf verschieben; die Stelle wird gemerkt (`icastico.lyricsPosition`).
- Reine Logik in `core/editor/lyricOps.ts` mit Tests.

## Drucken und PDF: ein Dialog mit Vorschau

- Strg+P und „Als PDF speichern“ (Strg+Umschalt+F, Bibliotheks-Menü) öffnen **denselben Dialog**: links Seite (hoch / quer), Notengröße, Takte
  pro Zeile (wie in der Partitur / automatisch / 1 bis 16), rechts die Seiten als Vorschau. Jede Änderung zeichnet die Vorschau nach 120 ms neu.
  Unten: „PDF speichern“ und „Drucken“ (das Drucken nur für die offene Partitur, nicht für mehrere aus der Bibliothek).
- „Takte pro Zeile“ gilt **nur für diesen Druck** (`PdfSetup.perSystem`); die Partitur selbst bleibt, wie sie ist. Gemerkt werden Seite und
  Notengröße (wie bisher), nicht die Takte pro Zeile (die gehören zur Partitur).
- Die Vorschau lässt die Kennungen der gezeichneten Formen weg, damit sie nicht doppelt im Dokument stehen.

## Taktstriche durch alle Zeilen

Die äußerste Gruppe der Zeilen bekommt `bar.thru="true"`: Taktstriche (auch Wiederholungszeichen) laufen durch alle Zeilen des Systems, nicht nur
durch Klavier-Akkoladen. Die Wiederholungspunkte stehen in jeder Zeile, in der Tabulatur als zwei Punkte in der Mitte der sechs Linien.

## Tabulaturzeile: „TAB“ und Stimmung

- Am Anfang jeder Zeile der Tabulatur stehen die Buchstaben **T A B** untereinander statt eines Notenschlüssels. Verovios eigener Tab-Schlüssel
  gibt es nur in seinem Saiten-Modus, den wir nicht benutzen (ADR 0022); die Buchstaben werden wie die Bundzahlen nach dem Zeichnen in die SVG
  gesetzt (`applyTabClefs`, `render/tab.ts`).
- Ist die Stimmung nicht die Standardstimmung, steht ihr Name (Drop D, DADGAD …) oder – bei eigener Stimmung – die sechs Saitennamen von der
  tiefsten an (`tuningLabel`, `noteNameDe`) **einmal über der ersten Tabulaturzeile**, in Notenschrift, Druck, PDF und Vorschaubildern.
- **MusicXML** schreibt und liest die Stimmung jetzt (`<staff-details>` / `<staff-tuning>`, Linie 1 = tiefste Saite, geschrieben wie die Noten, also
  bei der Gitarre eine Oktave höher). Standardstimmung wird nicht geschrieben und nicht als eigene gelesen.

## In die Tabulatur kopieren und ziehen

- Mehrere Stimmen (Klavier, zwei Hände) gingen in die eine Stimme der Tabulatur und verloren dabei Noten („keinen Platz“). Jetzt: Noten, die
  zugleich beginnen, werden **ein Akkord** (kürzere Länge), eine Note, die eine andere überlappt, **kürzt die frühere** dort, wo die spätere
  beginnt. Es geht keine Note mehr verloren (`foldInto`, `range.ts`).
- Das Ziel beim Ziehen ist die **Zeile unter dem Zeiger** (nicht mehr nur eine Note oder Pause in der Nähe): ein beliebiger Punkt auf der
  Tabulaturzeile genügt.

## Einzelner Akkordton

Ein angeklickter Akkordton wird jetzt **allein** markiert (nur sein Notenkopf in Akzentfarbe), nicht mehr der ganze Akkord; ↑ / ↓ ändert wie
bisher nur diesen Ton.

## Grenzen

- Silben: keine Auswahl über mehrere Stimmen, kein Verschieben in eine andere Stimme, nur die erste Strophe.
- Die Druckvorschau zeigt die erste Partitur; beim PDF aus mehreren Partituren wird „Mehrere pro Seite“ nicht in der Vorschau gezeigt.
- Das Drucken selbst (Systemdialog) und das Aussehen im Desktop-Fenster sind nur im Browser geprüft.
- Die Buchstaben TAB und der Stimmungsname sind eine Nachbearbeitung der SVG-Zeichnung: sie sind nicht anklickbar und nicht Teil von MEI.
