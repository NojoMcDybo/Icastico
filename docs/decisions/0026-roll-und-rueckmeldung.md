# 0026 – Piano-Roll-Klaviatur, Synth-Klang, Gleiten in einen Ton, Rückmeldung beim Bearbeiten

- Status: angenommen
- Datum: 2026-11-06

## Entscheidung

- **Mehrere Noten in eine Note auflösen:** Mehrere Gleiten dürfen in **einen** Ton ankommen (Dateiformat 9;
  ADR 0014 gilt sonst unverändert: pro Ton eine ausgehende Verbindung, ein Haltebogen kommt allein an). In der Roll
  zieht man vom Punkt jeder Note auf den Zielbalken; **Umschalt** lässt alle Töne eines Akkords auf einmal gleiten.
  Beim Abspielen geht die erste Quelle als Zielton weiter, die anderen gleiten bis zum Beginn des Zielbalkens auf
  dessen Tonhöhe und enden dort (sonst klänge der Zielton mehrfach und zu laut).
- **Klaviatur in der Roll:** Eine eigene Spalte (weiße und schwarze Tasten, eine Zeile je Halbton) klebt per CSS
  links (`position: sticky`) und bleibt beim seitlichen Scrollen sichtbar; ein Klick auf eine Taste spielt den Ton.
- **Synthesizer-Klang** (Schalter „Synth“ im Kopf jeder Roll, gemerkt): ein einfacher Orgelklang (`SimpleSynth`,
  Timbre `SUSTAINED`), bei dem nichts ausklingt, solange die Note steht; gilt für das Abspielen und das Anhören.
- **Rückmeldung:** Beim Abspielen werden die klingenden Noten auf dem Papier blau (`is-playing`, vom Abspielpunkt
  abgeleitet, nur bei Änderung neu gesetzt). Wird eine Note neu eingegeben oder ihre Tonhöhe geändert (Tasten,
  Pfeile, Ziehen, MIDI, Sprache), klingt sie kurz an (`Synth.audition`); eine Vorschau-Note klingt bei jeder
  Änderung. Beim Abspielen schweigt das Anhören.
- **Akkordtöne einzeln:** Ist ein Notenkopf eines Akkords angeklickt, ändern Pfeile, Oktave und Vorzeichen nur
  diesen Ton (er bleibt ausgewählt); landet er auf einem Ton des Akkords, wird abgelehnt.
- **Tonart per Quintenzirkel** statt Einstellungsdialog (außen Dur, innen Moll; gilt ab dem Takt der Auswahl);
  **Tempo** wie bei Logic: in der Anzeige ziehen (ein Pixel = ein Schlag), ein Klick tippt die Zahl.
- **Obere Leiste:** feste Spalten (`grid`), feste Breiten der Anzeigen; Titel und Modus kürzen mit „…“ statt zu schieben.
- **Leistung:** Eine Partitur, die länger als 60 ms zum Zeichnen braucht (Verovio ist der größte Teil), zeichnet nicht
  mehr nach jedem Tastendruck neu: Tasten kurz nach einem langsamen Zeichnen ändern nur das Modell, ein Neuzeichnen mit
  dem neuesten Stand folgt (`update` → `refresh`). Gemessen mit 60 Akkorden (3 Zeilen, 180 Töne, 177 Gleiten):
  ein Neuzeichnen etwa 170 ms (Verovio 116 ms, davon 71 ms Layout); 30 gehaltene Pfeiltasten gingen vorher in rund
  5 s Rückstau, jetzt in unter 0,5 s.
- **Startvorgabe der Tastenbelegung** ist jetzt der Finale-Ziffernblock (Vorschau-Note, Enter schreibt sie und die
  nächste folgt gleich hoch; Ziffernblock = Länge, Pfeile = Höhe); wer eine Belegung gewählt hat, behält sie.

## Folgen

- Dateien mit mehreren Gleiten in einen Ton lassen sich in Icastico vor 0.17.0 nicht öffnen ("neuere Version").
- Sehr große Partituren zeichnen leicht verzögert (bis zu einer Zeichenzeit); die Auswahlmarkierung folgt dann nach.
- Noch nicht gelöst: Verovio zeichnet immer die ganze Partitur; Seiten außerhalb des Bildes lazy zu zeichnen wäre der
  nächste Schritt, wenn 170 ms bei sehr großen Partituren nicht mehr reichen.
