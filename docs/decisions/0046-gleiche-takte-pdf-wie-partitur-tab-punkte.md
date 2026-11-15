# 0046 – Gleich breite Takte, Druck wie in der Partitur, Punkte in der Tabulatur, mehr Luft unter dem Komponisten

- Status: angenommen
- Datum: 2026-11-16

Rückmeldungen nach 0.28.1: (1) In der Tabulatur steht bei Wiederholungszeichen nur ein Punkt unter der zweiten Linie von oben und einer über der zweiten Linie von unten.
(2) Punktierte Noten in der Tabulatur haben einen Punkt hinter der Zahl. (3) Aufeinanderfolgende Akkoladen mit gleicher Taktzahl haben gleich breite Takte, die Taktstriche
liegen übereinander. (4) Der in der Noteneingabe festgelegte Seitenaufbau gilt genauso im PDF. (5) Zwischen Komponist und erster Akkolade ist eine Zeile mehr Platz.

## Was neu ist

- **Wiederholungspunkte in der Tabulatur**: Verovio setzt auf ein Sechs-Linien-System drei Punkte; der mittlere entfällt (`trimRepeatDots` in `src/render/tab.ts`).
- **Punktierte Tabulaturzahlen**: Verovio setzte den Punkt klein in den Zwischenraum über der Saitenlinie, weit von der Zahl. Er wird entfernt und unmittelbar hinter der Zahl, auf
  gleicher Höhe, neu gezeichnet (mit weißem Untergrund, damit die Saitenlinie ihn nicht schneidet); ein Doppelpunkt ergibt zwei Punkte (`moveDots`).
- **Gleich breite Takte** (`src/render/equalBars.ts`): Verovio verteilt jede Akkolade für sich, darum stehen die Taktstriche untereinander nicht an gleicher Stelle. Das fertige Bild wird
  deshalb nachträglich neu verteilt: für aufeinanderfolgende Akkoladen mit gleicher Taktzahl gehen die Taktstriche an dieselben Stellen, die Musik dazwischen wird gedehnt oder gestaucht.
  Dinge mit fester Gestalt (Note, Akkord, Pause, Text, Schlüssel, …) werden als Ganzes verschoben – ein Hals bleibt am Notenkopf –, nur Linien und Bögen (Notenlinien, Taktstriche,
  Haltebögen, Bindebögen, Balken) bekommen ihre Endpunkte einzeln verschoben. Der Raum vor der ersten Note des ersten Taktes (Schlüssel, Vorzeichen, Taktart) bleibt unverändert;
  die breiteste Vorzeichnung bestimmt, wo der erste Taktstrich steht. Wo ein Takt dafür auf unter 60 % seiner Breite gedrückt werden müsste, bleibt es bei Verovios Verteilung.
  Die letzte Akkolade mit weniger Takten wird nicht verändert.
- **Instrumentennamen**: Damit alle Akkoladen am selben Platz beginnen, gibt Verovio jeder den Platz des Namens; die Namen der zweiten und folgenden Akkolade werden aus dem
  Bild genommen (`dropRepeatedLabels`). So bleibt es bei „nur links neben der ersten Akkolade“ (ADR 0045), und die Taktstriche können übereinander liegen.
- **Druck wie in der Partitur**: Im Drucken-Fenster ist „Notengröße: wie in der Partitur“ jetzt die erste und vorbelegte Wahl. Dann hat der Druck die Seite der Bildschirmansicht
  (gleiche Seitenbreite in Verovio-Einheiten, gleicher Maßstab, A4-Verhältnis): dieselben Takte pro Akkolade, dieselben Akkoladen pro Seite, dieselben Ränder – auch wenn der Notensatz
  die Zeilen selbst bricht. Die festen Größen Klein/Mittel/Groß bleiben wählbar. Gespeichert wird unter einem neuen Schlüssel (`icastico.pdf.v2`), damit die alte Voreinstellung
  „Mittel“ nicht weiter gilt.
- **Kopfzeile**: nach dem Komponisten eine leere Zeile (ein Platzhalter-Text aus einem geschützten Leerzeichen im `pgHead`).

## Folgen

- Die Breite des Bildschirms bestimmt, wie viele Takte der Notensatz auf eine Zeile setzt, wenn die Zeilen nicht festgelegt sind; der Druck „wie in der Partitur“ folgt dem Fenster, wie es gerade ist.
  Wer unabhängig vom Fenster drucken will, legt die Takte pro Akkolade im Seitenaufbau-Fenster fest (Strg+Umschalt+A) oder wählt eine feste Größe.
- Das Verteilen arbeitet auf dem fertigen SVG; die Bildkennungen bleiben, die Teile bekommen eine Verschiebung (`transform`). Erkennt es etwas nicht, bleibt das Bild unverändert.
