# 0024 – Bibliothek der Sonderzeichen: Dynamik, Artikulation, Verzierung, Wiederholungen

- Status: angenommen
- Datum: 2026-11-05

## Kontext

Für Leadsheets, Lieder und Unterrichtsmaterial fehlten die üblichen Zeichen der Notenschrift:
Lautstärke, Staccato und Akzent, Triller, Fermate – und die Wiederholungsstruktur mit Wiederholungszeichen,
1./2. Klammer, Segno, Coda und D.C./D.S.

## Entscheidung

- **Die Zeichen sind Daten** (`core/symbols.ts`, wie die Instrumente): Kennung, Gruppe, deutscher Name,
  Palettentext, Bedeutung für den Klang. Neue Zeichen = ein Eintrag dort.
- **Zeichen an Noten** (`NoteEvent.marks`, Liste von Kennungen): Lautstärke ppp–fff und sfz, Crescendo und
  Decrescendo, Staccato, Staccatissimo, Tenuto, Akzent, Marcato, Triller, Mordent, Pralltriller, Doppelschlag,
  Fermate. Zeichen derselben Art ersetzen sich (eine Lautstärke pro Note, Crescendo/Decrescendo,
  Staccato/Staccatissimo/Tenuto, Akzent/Marcato, eine Verzierung). Ein Crescendo läuft bis zur nächsten
  Lautstärke (sonst bis zur letzten Note der Stimme).
- **Zeichen am Takt** (`Score.marks`, Zeitpunkt = Anfang des Takts): Wiederholung Anfang/Ende, 1./2./3.
  Klammer, Segno, Coda, „To Coda“, Fine, D.C./D.S. (je auch al Fine / al Coda). Aufeinanderfolgende Takte
  mit derselben Klammer bilden eine gemeinsame Klammer.
- **Dateiformat 8:** optionale `marks` an Noten und an der Partitur; Version 7 wird unverändert übernommen
  und vor dem ersten Speichern gesichert (Test mit Datei der alten Version).
- **Bedienung:** `mark.toggle` / `mark.bar` (zweimal = entfernen), Tasten für die häufigsten (Alt+Buchstabe,
  siehe `docs/tastenbelegung.md`) und die **Palette** (Strg+J): schwebend und verschiebbar, nimmt der
  Notenzeile den Tastaturfokus nicht weg, leuchtet bei den Zeichen der gewählten Note und ihres Takts.
- **Notenschrift:** Artikulation als `@artic`, Lautstärke, Hakengabel, Fermate und Verzierungen als
  Steuerelemente, Wiederholungsstriche an den Takten (`rptstart`/`rptend`/`rptboth`), Klammern als `<ending>`,
  Segno/Coda als SMuFL-Symbol, D.C./D.S./Fine/To Coda als Text über der obersten Zeile.
- **Klang:** Wiederholungen, Klammern, D.C./D.S., Coda und Fine bestimmen die Spielreihenfolge
  (`core/playOrder.ts`; die Wiedergabe läuft über eine Kopie der Partitur in Spielreihenfolge, der
  Abspielpunkt wird auf den geschriebenen Takt zurückgerechnet). Lautstärke und Akzente steuern die
  Anschlagstärke, Staccato & Co. verkürzen den Klang. Nicht hörbar sind Verzierungen und Fermaten.
- **MusicXML:** Import und Export von Artikulation, Verzierung, Fermate, Lautstärke, Crescendo (wedge),
  Wiederholungsstrichen, Klammern (`ending`), Segno/Coda und den Wörtern; ein Hin-und-zurück-Test sichert das.

## Spielregeln der Reihenfolge

Eine Wiederholung spielt zweimal; ein Takt mit Klammer klingt nur im Durchgang seiner Nummer (nach einem
D.C./D.S. nur in der letzten Klammer); D.C. springt zum Anfang, D.S. zum Segno (ohne Segno zum Anfang);
nach einem Sprung werden Wiederholungen nicht noch einmal gespielt, „Fine“ beendet, „To Coda“ springt zur Coda.

## Folgen

- Zeichen hängen an Noten/Takten, nicht an der Zeit: wird ein Takt gelöscht, gehen seine Zeichen mit.
  Im Einfügemodus wandern Taktzeichen nicht mit der Musik (wie die Akkordsymbole, ADR 0019).
- Fermaten dehnen die Zeit nicht; Triller, Mordent und Doppelschlag klingen nicht.
- Eine Klammer über mehrere Takte mit mehreren Nummern („1.–3.“) und eine abweichende Wiederholungszahl
  („3×“) gibt es nicht.
- Vorschlagsnoten, Atemzeichen, Pedal und Textanweisungen („dolce“) sind nicht in der Bibliothek.
