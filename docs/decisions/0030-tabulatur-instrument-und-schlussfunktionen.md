# 0030 – Tabulatur als eigenes Instrument; Oktave und Vorzeichen für die nächste Note, Metronom, Cycle, Zoom, Quantisieren, Drucken

- Status: angenommen
- Datum: 2026-11-08

## Tabulatur als Instrument

- **Neues Instrument „Tabulatur“** (`tab`, Dateiformat 12): eine Zeile mit sechs Saitenlinien und Bundzahlen statt Notenköpfen. Man
  fügt sie wie jedes Instrument hinzu („+ Tabulatur“ in den Partitur-Einstellungen, auch beim Anlegen einer Partitur) und sie steht
  als eigene Zeile **neben** der klassischen Notenschrift. Anders als die abgeleitete Tab-Zeile unter der Gitarre (ADR 0022, Strg+T)
  ist sie eine **richtige Zeile des Modells**: Noten lassen sich anklicken, markieren, eingeben, verschieben und löschen, sie hat
  Piano-Roll, Wiedergabe (Gitarrenklang), MIDI- und PDF-Ausgabe.
- **Noten hineinkopieren:** Strg+C in einer beliebigen Zeile, dann an die Stelle der Tabulaturzeile klicken und Strg+V. Hat die Zeile
  weniger Stimmen als das Kopierte (zwei Hände vom Klavier), kommen die Noten der weiteren Stimmen in die eine Stimme, soweit sie
  nicht mit schon vorhandenen zusammenfallen; was keinen Platz findet, wird gezählt und gemeldet. Töne außerhalb des Gitarrenumfangs
  (E2 bis D6) bleiben in der Zeile, bekommen aber keine Bundzahl – die Meldung nennt ihre Zahl. Strg+Umschalt+B („in Tabulatur
  übersetzen“) nutzt eine Tabulaturzeile als Ziel, wenn es keine Gitarrenzeile gibt.
- **Griffe** werden wie bisher berechnet (`core/tab.ts`), nicht gespeichert; gespeichert sind Tonhöhen. Die Noten der Zeile tragen
  ihre echten Kennungen (Anklicken wählt die Note), im MEI sind sie Noten mit `loc` auf der Saitenlinie, `render/tab.ts` ersetzt
  den Kopf durch die Zahl.
- Grenzen: Eingabe weiter nach Tonhöhe (keine Eingabe von Saite und Bund); MusicXML schreibt die Zeile als Gitarrenzeile ohne
  Bundzahlen (mit Hinweis); die Vorschau-Note wird auf dieser Zeile nicht gezeichnet.

## Die acht geplanten Funktionen

Alle stehen in der Tastenliste (Taste je Belegung siehe `docs/tastenbelegung.md`); die Tasten der Logic-Belegung sind die aus der
Logic-Dokumentation, wo sie nicht mit Icastico-Funktionen zusammenfallen.

- **Kreuz / B für die nächste Note** (`input.nextSharp`, `input.nextFlat`): vor dem Buchstaben tippen, gilt nur für diese Note,
  nochmal = aufheben; die Anzeige oben zeigt ♯ / ♭ nächste Note. Bei den Klaviertasten der Logic-Belegung verschiebt es die Taste um
  einen Halbton.
- **Oktave für die nächste Note** (`input.octave`, ±1 oder ±2): die Note kommt so viele Oktaven höher oder tiefer, als sie von allein
  gelandet wäre (nah an der vorigen). Nur für eine Note.
- **Metronom** (`play.metronome`, Knopf in der oberen Leiste, gemerkt): bei der Wiedergabe ein kurzer Klick auf jedem Schlag der
  Taktart, die Eins stärker, ein Auftakt ohne Klick. Der Klick ist ein kurzer hoher Klaviertonton im Abspielplan (`withClicks`) –
  nichts muss geladen werden, er läuft auch in der Schleife und im Synth-Klang mit. Umschalten während der Wiedergabe setzt sie
  ohne / mit Klick an der aktuellen Stelle fort.
- **Cycle** (`play.cycle`): die markierte Passage (sonst das ganze Stück) immer wieder – dasselbe wie Strg+L bzw. der
  Wiederholen-Knopf, auf einer Taste.
- **Zoom** (`view.zoom`): die Notenschrift in 10-%-Schritten von 50 bis 200 % (Strg+Plus / Minus / 0, Logic: Strg+Pfeil rechts /
  links), gemerkt. Verovio setzt die Notenschrift neu mit anderer Skalierung; verkleinert bleibt die Seite so breit, vergrößert wird
  sie breiter (bis zum Fenster).
- **Quantisieren** (`edit.quantize`, Q): fragt nach dem kleinsten Notenwert (Achtel, Sechzehntel, 32tel; Triolen werden erkannt) und
  rundet Anfang und Länge der markierten Noten – ohne Markierung der ganzen gewählten Zeile – mit demselben Quantisierer wie der
  MIDI-Import (ADR 0028, `quantizeTimes`). Noten, die auf derselben Stelle landen, werden ein Akkord (ihre Töne behalten die
  Kennungen, Verbindungen bleiben); eine Note, die ins nächste hineinragt, wird gekürzt. Ein Rückgängig-Schritt.
- **Drucken** (`file.print`, Strg+P): die Seiten der Partitur (A4, Größe und Format wie beim letzten PDF) kommen in ein verstecktes
  Blatt, das nur der Druck-Stil zeigt, dann öffnet sich der Druckdialog des Systems (der auch ein PDF speichern kann). Strg+P ist
  damit Drucken wie in Finale und Logic; **PDF speichern liegt jetzt auf Strg+Umschalt+F**.
- Wegen Logic-K = Metronom liegen die Akkordsymbole in der Logic-Belegung auf Umschalt+K.

## Nicht geprüft

Drucken in der Desktop-App und auf dem Mac (der Druckdialog der Systemansicht) ist nicht ausprobiert, geprüft wurden die Seiten und das
Druck-Layout im Browser. Das Metronom wurde nicht gehört, nur sein Plan (Zeitpunkte, Betonung) getestet.
