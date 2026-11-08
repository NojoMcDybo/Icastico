# 0029 – Liedtext-Feld, Bindebogen mit T, Ziffernblock-Komma, stille Vorschau-Note

- Status: angenommen
- Datum: 2026-11-08

## Kontext

Wünsche aus der Praxis des Gitarristen (Finale-Umsteiger, `docs/anforderungen-gitarre.md`): Liedtext nicht Silbe für Silbe unter
jede Note tippen, sondern erst als Ganzes schreiben und dann zuordnen; die Note beim Tippen nicht schon beim Verstellen der
Tonhöhe hören; ein Bogen auf einer Taste.

## Entscheidung

- **Liedtext-Feld** (`ui/lyricsPanel.ts`, Taste `L`, ersetzt die einzeilige Eingabe): ein Textfeld unten am Fenster. Der Text wird
  mit Bindestrichen geschrieben („Gu-ten A-bend“) und in Silben zerlegt (`core/lyrics.ts`; ein Bindestrich am Wortende bleibt
  als „Wort geht weiter“ erhalten, `_` = Note ohne Silbe). Die Silben stehen als Knöpfe darunter. Ist eine Silbe gewählt
  (am Anfang die erste), setzt **jeder Klick auf eine Note** diese Silbe darauf und das Feld springt zur nächsten; das ist je
  Klick ein Rückgängig-Schritt (`setLyricOf`), die Note wird dabei auch ausgewählt. Ein Klick auf einen Silbenknopf wählt eine
  andere Silbe, „Von vorn“ beginnt wieder bei der ersten. „Ab gewählter Note alle setzen“ legt den Rest auf einmal unter die
  Noten ab der gewählten (das frühere Verhalten von `L`, `setLyrics`). Der Text wird als Entwurf im Browserspeicher gemerkt.
  Beim Tippen im Feld gelten keine Tastenbefehle des Editors.
- **Bindebogen (Legato) mit T**: `T` bindet die markierte Note an die folgende. Gleiche Tonhöhe und unmittelbar anschließend:
  **Haltebogen** (eine durchgehende Note, wie bisher, ADR 0014). Sonst – andere Tonhöhe oder eine Pause dazwischen – ein
  **Bindebogen**: das Zeichen `slur` an der ersten Note, gezeichnet von ihr bis zur nächsten Note derselben Stimme (auch über
  den Taktstrich). Nochmal `T` löst ihn. Es ist ein Zeichen aus der Zeichen-Bibliothek (Rubrik Phrasierung, ADR 0024), kein
  Link; es wandert mit Kopieren und Einfügen und lässt sich in der Palette setzen. Die Wiedergabe klingt wie ohne Bogen
  (kein Legato-Klang).
- **Dateiformat 11**: neue Zeichen-ID `slur`; Version 10 wird unverändert übernommen (ADR 0007).
- **MusicXML**: Export schreibt `<slur type="start/stop">` auf die beiden Noten (bei geteilten Noten: Start auf dem letzten,
  Stop auf dem ersten Stück). Import übernimmt einen Bogen nur, wenn er auf der **unmittelbar nächsten** Note derselben Stimme
  endet; längere Bögen werden gemeldet („Bögen über mehrere Noten“), nicht falsch gezeichnet.
- **Punktierung** mit dem Komma des Ziffernblocks war schon da (`Period`, auch für `NumpadDecimal`); jetzt auch in der
  Logic-Belegung. Bei wartendem Eingabe-Cursor gilt sie für die nächste Note, nach einem Klick auf eine Note für diese.
- **Vorschau-Note** (Finale-Ziffernblock): das Verstellen ihrer Tonhöhe mit den Pfeiltasten klingt nicht mehr an; erst **Enter**
  setzt die Note und lässt sie hören. Verstellen einer markierten, gesetzten Note mit den Pfeiltasten klingt weiter (ADR 0026).

## Grenzen

- Ein Vers, ein Text pro Note (ADR 0019). Der Bindebogen reicht nur bis zur nächsten Note; lange Phrasierungsbögen über mehrere
  Noten gibt es nicht.
- Beim Zuordnen per Klick gilt die Reihenfolge der Klicks, nicht die der Noten – wer eine Note überspringt, klickt sie nicht an.
