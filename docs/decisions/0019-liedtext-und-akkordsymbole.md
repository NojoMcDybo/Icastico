# 0019 – Liedtext und Akkordsymbole

- Status: angenommen
- Datum: 2026-11-04

## Kontext

Leadsheets brauchen Melodie, Akkordsymbole und Liedtext (`docs/anforderungen-gitarre.md`).

## Entscheidung

- **Liedtext** hängt an der Note: `NoteEvent.lyric` (eine Silbe, ein Vers). Ein „-“ am Ende heißt: das
  Wort geht weiter; „_“ beim Tippen = Note ohne Silbe. Gezeigt wird die Silbe an der ersten gezeichneten
  Hälfte einer Note (Verovio: `<verse><syl>` mit Wortposition und Trennstrich).
- **Akkordsymbole** hängen an der Zeit, nicht an Noten: `Score.chords` (Zeitpunkt + Text, je Zeit eines),
  über der obersten Zeile (`<harm>`). So überleben sie das Verschieben und Löschen von Noten; sie bewegen
  sich aber auch nicht mit, wenn im Einfügemodus Musik nach hinten rutscht.
- **Eingabe:** `L` öffnet eine Zeile mit allen Silben ab der gewählten Note (vorbelegt, bearbeitbar);
  `K` fragt das Akkordsymbol am Eingabe-Cursor / an der gewählten Note (leer = löschen). Beides ist
  ein Rückgängig-Schritt.
- **Dateiformat 7:** optionale `lyric` und `chords`; Version 6 wird unverändert übernommen und vor dem
  ersten Speichern gesichert (Test mit Datei der alten Version).
- **MusicXML:** Import übernimmt die erste Strophe (`<lyric>`, `syllabic`) und `<harmony>` (Grundton,
  Art, Bass); weitere Strophen werden gemeldet. Export schreibt beides.

## Folgen

- Nur ein Vers, nur ein Text pro Note; mehrere Strophen, Gesangstext in mehreren Stimmen, Bundgriffe-
  Diagramme und Akkordfunktionen (Stufen) fehlen.
- Der Akkordtext ist frei; nur das Muster Grundton/Art/Bass wird beim Export in MusicXML-Akkorde
  zerlegt, alles andere geht als Text.
