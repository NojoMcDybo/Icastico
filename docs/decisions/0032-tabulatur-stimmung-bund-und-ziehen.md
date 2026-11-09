# 0032 – Tabulatur: Stimmung, Bund und Saite einstellen, Noten hineinziehen; einzelne Akkordtöne wählen

- Status: angenommen
- Datum: 2026-11-08

## Stimmung (Dateiformat 15)

- **`Part.tuning`** für Gitarren- und Tabulaturzeilen: die sechs leeren Saiten (MIDI), Saite 1 (die höchste) zuerst. Fehlt es, gilt die
  Standardstimmung E A d g h e. Wählbar in den Partitur-Einstellungen → „Stimmung“: Standard, Drop D, Halbton tiefer, DADGAD, Offen G,
  Offen D, Offen E, oder jede Saite einzeln auf einen Ton zwischen E1 und G5 (Eigene Stimmung).
- Die **Töne der Noten bleiben**, nur die Bundzahlen werden aus der Stimmung berechnet (`assignFrets(events, tuning)`). Liegt ein Ton unter
  der tiefsten Saite oder über Bund 22, bekommt er keine Zahl.

## Saite und Bund bearbeiten (nur Tabulaturzeile als eigenes Instrument, ADR 0030)

- **`Tone.string`**: die Saite, auf die der Ton gelegt wurde (1 = höchste); fehlt sie, wählt die Berechnung sie.
- **↑ / ↓** bei einer markierten Zahl legt sie auf die nächste höhere / tiefere Saite, der **Ton bleibt**, der Bund passt sich an. Geht der
  Ton dort nicht (negativer Bund oder über 22), steht eine Meldung da. Bei einem Akkord wirkt es auf den angeklickten Ton (sonst auf alle
  Töne), und die Saiten der anderen werden festgehalten, damit sie nicht umspringen.
- **Zahl tippen** ändert den Bund auf der Saite, auf der der Ton liegt; die **Tonhöhe folgt** (Saite 1 + Bund 5 = A). Zwei Ziffern kurz
  hintereinander ergeben 10 bis 22. Bei einem Akkord erst den Ton anklicken oder mit Alt+↑ / ↓ wählen.
- **Noten hineinziehen:** markierte Noten (Umschalt+Pfeil, Rahmen, Strg+A) mit der Maus greifen und auf eine andere Zeile ziehen: sie
  werden dort **zur gleichen Zeit** eingefügt (Strg+C / Strg+V geht weiter, dann an die gewünschte Stelle). Das gilt für jede Zeile, nicht
  nur für die Tabulatur.
- **Keine Notenwerte:** die Tabulaturzeile zeichnet keine Hälse, Fähnchen und Balken, nur Zahlen auf den Saitenlinien; Notenwerte bleiben im
  Modell (Wiedergabe, Export). Pausen bleiben sichtbar, weil man sie anklickt, um dorthin einzufügen.

## Akkordtöne einzeln (Alt+↑ / Alt+↓)

Bei einem markierten Akkord wählt Alt+↑ / ↓ nacheinander die einzelnen Töne (wie in Finale); danach ändert ↑ / ↓ nur diesen Ton. Ist kein
Ton mehr in der Richtung, wechselt die Taste wie bisher die Zeile. Auf dem Mac ist es Option statt Alt.

## Grenzen

- Sechs Saiten (keine Bässe mit vier oder Gitarren mit sieben); kein Kapodaster; Spieltechniken (Bendings, Hammer-ons) fehlen.
- Eine Zahl tippen geht nicht beim Eingeben neuer Noten (dort sind die Ziffern die Notenwerte); neue Noten entstehen über Tonhöhe, Kopieren
  oder Ziehen und werden dann in der Tabulatur nachbearbeitet.
- MusicXML kennt die Stimmung und die Saiten nicht und schreibt die Tabulaturzeile als Gitarrenzeile.
