# 0027 – Bereiche, Transponieren, mehr Zeichen, Tabulatur, Export

- Status: angenommen
- Datum: 2026-11-06

## Entscheidung

- **Bereich markieren** (`core/editor/range.ts`): von der gewählten Note bis zu einer anderen Note derselben Stimme
  (Alt+Umschalt+←/→, Umschalt + Klick, Strg+A für alle). Der Bereich gilt nur, solange seine Ankernote ausgewählt ist –
  jede andere Auswahl hebt ihn auf, ohne dass dafür ein Befehl etwas tun muss. Er umfasst die Zeit von der ersten bis zum
  Ende der letzten Note, in allen Stimmen der Zeile. **Entf / Rücktaste** löscht (Pausen), **Strg+X/C/V** schneidet aus,
  kopiert, fügt ein (Zwischenablage im Programm, nicht im Rückgängig-Verlauf; Einfügemodus schiebt die Musik weiter),
  **Strg+L** spielt ihn als Schleife (`planUntil`, Player mit Bereich).
- **Transponieren** (`core/transpose.ts`, Strg+Umschalt+T): *chromatisch* um ein Intervall aus Stufen und Halbtönen (die
  Schreibweise folgt dem Intervall: C + große Terz = E, B♭ + große Terz = D; mehr als Doppelkreuz wird nach der Tonart
  geschrieben) mit wählbarem Mitziehen der Tonart (nur bei der ganzen Partitur); *diatonisch* um Stufen der Tonleiter, die
  Töne bleiben in der Tonart. Gültig für den markierten Bereich, sonst die gewählte Zeile, sonst die ganze Partitur.
  Das Rad (`ui/wheel.ts`) ist ein CSS-`scroll-snap`-Rad wie der iPhone-Timer (Mausrad, Ziehen, Pfeile, Klick).
- **Zeichen** (Dateiformat 10): Doppelstrich, Schlussstrich, Atemzeichen, Zäsur, Arpeggio, rit., accel., a tempo;
  **Klammer / Akkolade um Zeilen** als `Score.groups` (Zeilen direkt untereinander, eine Zeile in höchstens einer Gruppe;
  MEI-`staffGrp`, MusicXML-`part-group`). Doppel- und Schlussstrich ersetzen sich und die Wiederholungsende
  (eine rechte Taktlinie je Takt). Die Palette ist nach Rubriken geordnet (… Taktstriche, Wiederholungsklammern, Sprünge,
  Tempo-Anweisungen). Alle gesetzten Zeichen lassen sich anklicken (blau), ziehen und mit der Rücktaste löschen; Taktlinien
  und Wiederholungsklammern werden über ihre Zeichnung gefunden (`.barLine`, `.voltaBracket`), die übrigen über ihre IDs.
- **Tabulatur**: Strg+T fügt die Gitarrenzeile mit Tabulatur hinzu, wenn es sie noch nicht gibt, sonst schaltet es sie.
  Strg+Umschalt+B übersetzt den markierten Bereich (oder die ganze gewählte Zeile) in die Gitarrenzeile (Töne von E2 bis D6;
  andere werden gezählt und ausgelassen). Die Tabulatur ist weiter abgeleitet (ADR 0022); Tab → Noten gibt es nicht.
- **Export** (Menü „⋯“ einer Partitur in der Bibliothek): Untermenü mit PDF, MusicXML, MIDI (Standard-MIDI-Datei, Format 1,
  aus dem Abspielplan – Wiederholungen, Bindungen, Lautstärke; Gleiten ohne Tonhöhenbogen) und Icastico-Datei.
- **Neuigkeiten** (`ui/patchNotes.ts`): nach einem Update ein Popup mit den neuen Funktionen (Daten, je Version ein Eintrag).
- **Tastenhilfe** mit Suchleiste, **Quintenzirkel** aus zwei sich berührenden Ringen.

## Nicht enthalten

Legato-/Phrasierungsbögen, Vorschlagsnoten, Pedal, Oktavierungsklammern (8va), freie Textanweisungen, Tab → Noten; rit./accel.
ändern das Tempo beim Abspielen nicht; Zeichen sind an Takte/Noten gebunden, nicht frei auf der Seite positionierbar.
