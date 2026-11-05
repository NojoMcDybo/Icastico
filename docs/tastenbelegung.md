# Tastenbelegung – Bibliothek

> Erzeugt aus `src/ui/keymaps/library.json` mit `npm run keys:doc` – nicht von Hand ändern.

Alle Funktionen eines Notenprogramms mit ihren Tasten in **Finale**, **Logic Pro** und der
Belegung **Finale-Ziffernblock** (Ziffernblock = Notenwert, obere Zahlenreihe = Intervall) –
auch solche, die Icastico noch nicht kann („geplant“). In Icastico ist die Belegung
umschaltbar (Tastenhilfe F1). `Strg` ist auf dem Mac `⌘`, `Alt` ist `⌥`.

**Herkunft:** ohne Markierung = aus der Dokumentation des Programms ·
*(Annahme)* = von uns gewählt, bitte prüfen · *(Icastico)* = eigene Ergänzung.

## Eingabe

| Funktion | Finale | Logic Pro | Finale-Ziffernblock | Icastico |
|---|---|---|---|---|
| Eingabe starten / beenden | `Enter` | `Enter` *(Icastico)* – In Logic schaltet der Knopf „MIDI In“ die Schritteingabe ein. | *Enter wiederholt hier die Note; die Eingabe beendet Esc.* | ✓ |
| Notenwert der nächsten Note | `1` 64tel, `2` 32tel, `3` 16tel, `4` Achtel, `5` Viertel, `6` Halbe, `7` Ganze | `1` Ganze, `2` Halbe, `3` Viertel, `4` Achtel, `5` 16tel, `6` 32tel, `7` 64tel – Logic: 8 = 128tel (gibt es in Icastico noch nicht). | *Hier gilt der Ziffernblock („Notenwert“ unten).* | ✓ |
| Note nach Stammton (Tonart wird beachtet) | `C` C, `D` D, `E` E, `F` F, `G` G, `A` A, `B` / `H` H – B ist wie in Finale das englische B (= H). H ist eine Icastico-Ergänzung. | – | (wie Finale) | ✓ |
| Note nach Klaviertaste (schwarze Tasten nach Tonart) | – | `A` C, `W` Cis/Des, `S` D, `E` Dis/Es, `D` E, `F` F, `T` Fis/Ges, `G` G, `Y` Gis/As, `H` A, `U` Ais/B, `J` H – Auf deutschen Tastaturen liegt Y unten links (Z und Y sind vertauscht). | (wie Finale) | ✓ |
| Pause eingeben | `0` | `Leertaste` | `Ziffernblock 0` / `0` *(Annahme)* – Ziffernblock 0 wie bei Finale. | ✓ |
| Punktierung | `.` – In der Eingabe gilt der Punkt für die nächste Note (Annahme), sonst für die ausgewählte. | `0` – Logic: „nächste zwei Noten punktiert“; Icastico punktiert die nächste Note. | (wie Finale) | ✓ |
| Ton zum Akkord hinzufügen (darüber) | `Umschalt+C` C, `Umschalt+D` D, `Umschalt+E` E, `Umschalt+F` F, `Umschalt+G` G, `Umschalt+A` A, `Umschalt+B` / `Umschalt+H` H *(Annahme)* | – | (wie Finale) | ✓ |
| Akkordmodus an/aus (nächste Töne übereinander) | `` ` `` *(Icastico)* – Finale hat das nicht als Taste; wir nehmen dieselbe wie Logic. Alternativ: Umschalt + Buchstabe fügt einen Ton zum Akkord. | `` ` `` – Gemeint ist die Taste links neben der 1 – auf deutschen Tastaturen ist das ^. | (wie Finale) | ✓ |
| Triolen / Quintolen für die nächsten Noten (noch einmal: aus) | `Alt+0` Septolen, `Alt+8` Quintolen, `Alt+9` Triolen *(Icastico)* – Finale Simple Entry nutzt hier ein Menü; die Tasten sind von uns gewählt. | `9` Triolen – Quintolen und Septolen: Taste von uns. | (wie Finale) | ✓ |
| Kreuz für die nächste Note | – | `Umschalt+3` – Auf US-Tastaturen ist Umschalt+3 das #. | (wie Finale) | geplant |
| B für die nächste Note | – | `Umschalt+B` | (wie Finale) | geplant |
| Eingabe-Oktave höher / tiefer | – | `X` höher, `Umschalt+X` zwei höher, `Z` tiefer, `Umschalt+Z` zwei tiefer – Icastico wählt die Oktave automatisch nah an der vorigen Note. | (wie Finale) | geplant |
| Vorschau-Note setzen und weiter (Enter wiederholt sie) | – | – | `Enter` *(Annahme)* – Die Vorschau-Note steht am Eingabe-Cursor; ↑/↓, Ziffernblock und Zahlenreihe ändern sie. Ohne Eingabe beginnt Enter die Eingabe. | ✓ |
| Notenwert der Vorschau-Note (ohne Eingabe: der gewählten Note) | – | – | `Ziffernblock 1` 64tel, `Ziffernblock 2` 32tel, `Ziffernblock 3` 16tel, `Ziffernblock 4` Achtel, `Ziffernblock 5` Viertel, `Ziffernblock 6` Halbe, `Ziffernblock 7` Ganze *(Annahme)* | ✓ |
| Ton im Intervall über / unter der Vorschau-Note hinzufügen | – | – | `2` Sekunde darüber, `3` Terz darüber, `4` Quarte darüber, `5` Quinte darüber, `6` Sexte darüber, `7` Septime darüber, `8` Oktave darüber, `Umschalt+2` Sekunde darunter, `Umschalt+3` Terz darunter, `Umschalt+4` Quarte darunter, `Umschalt+5` Quinte darunter, `Umschalt+6` Sexte darunter, `Umschalt+7` Septime darunter, `Umschalt+8` Oktave darunter *(Annahme)* – Obere Zahlenreihe; mit Umschalt nach unten. | ✓ |
| Einfügen statt Überschreiben | `Einfg` / `Strg+I` *(Icastico)* | `Einfg` / `Strg+I` *(Icastico)* | (wie Finale) | ✓ |

## Letzte / ausgewählte Note ändern

| Funktion | Finale | Logic Pro | Finale-Ziffernblock | Icastico |
|---|---|---|---|---|
| Vorschau-Note eine Stufe höher / tiefer (in der Tonart) | – | – | `↑` höher, `↓` tiefer *(Annahme)* | ✓ |
| Vorschau-Note: Kreuz / B | – | – | `+` Kreuz, `−` B *(Annahme)* | ✓ |
| Eine Stufe höher / tiefer (in der Tonart) | `↑` höher, `↓` tiefer *(Annahme)* | – | *Hier gilt ↑/↓ für die Vorschau-Note („Vorschau-Note eine Stufe“).* | ✓ |
| Einen Halbton höher / tiefer (E → F) | – | `Alt+↑` höher, `Alt+↓` tiefer | (wie Finale) | ✓ |
| Eine Oktave höher / tiefer | `Strg+↑` höher, `Strg+↓` tiefer *(Annahme)* | `Alt+Umschalt+↑` höher, `Alt+Umschalt+↓` tiefer | (wie Finale) | ✓ |
| Vorzeichen ändern (E → Eis, E → Es) | `+` Kreuz, `−` B *(Annahme)* | `+` Kreuz, `−` B *(Icastico)* | *Hier gilt +/− für die Vorschau-Note („Vorschau-Note: Vorzeichen“).* | ✓ |
| Notenwert der Note ändern | `Alt+1` 64tel, `Alt+2` 32tel, `Alt+3` 16tel, `Alt+4` Achtel, `Alt+5` Viertel, `Alt+6` Halbe, `Alt+7` Ganze | `Alt+1` Ganze, `Alt+2` Halbe, `Alt+3` Viertel, `Alt+4` Achtel, `Alt+5` 16tel, `Alt+6` 32tel, `Alt+7` 64tel *(Icastico)* | (wie Finale) | ✓ |
| Haltebogen zur nächsten Note gleicher Tonhöhe (nochmal: lösen) | `T` | `Umschalt+T` *(Icastico)* – T ist in Logic die Taste für Fis. | (wie Finale) | ✓ |
| Gleiten zur nächsten Note (nochmal: lösen). Die Lücke dazwischen ist die Gleitdauer | `Strg+Umschalt+G` *(Icastico)* | `Strg+Umschalt+G` *(Icastico)* | (wie Finale) | ✓ |
| Note in Pause umwandeln | `R` | – | (wie Finale) | ✓ |
| Note löschen (wird zur Pause) | `Entf` *(Annahme)* | `Entf` | (wie Finale) | ✓ |
| Letzte Note löschen und zurückgehen | `⌫` *(Annahme)* | `⌫` *(Icastico)* | (wie Finale) | ✓ |
| Angeklickten Akkordton in eine eigene Stimme lösen | `Strg+Umschalt+D` *(Icastico)* | `Strg+Umschalt+D` *(Icastico)* | (wie Finale) | ✓ |
| Note in der Zeit verschieben (um den gewählten Notenwert) | `Alt+→` später, `Alt+←` früher *(Icastico)* | `Alt+→` später, `Alt+←` früher *(Icastico)* | (wie Finale) | ✓ |
| Note verlängern / verkürzen (um den gewählten Notenwert) | `Umschalt+→` länger, `Umschalt+←` kürzer *(Icastico)* | `Umschalt+→` länger, `Umschalt+←` kürzer *(Icastico)* | (wie Finale) | ✓ |
| Note mit der Maus nach oben / unten ziehen | `Ziehen` *(Icastico)* – Stufenweise in der Tonart. | `Ziehen` *(Icastico)* – Stufenweise in der Tonart; mit Alt in Halbtönen. | (wie Finale) | ✓ |
| Note auf eine andere Note ziehen (Akkord) | `Ziehen` *(Icastico)* – Die gezogene Note übernimmt Anfang und Länge der anderen und klingt mit ihr zusammen. | `Ziehen` *(Icastico)* – Die gezogene Note übernimmt Anfang und Länge der anderen und klingt mit ihr zusammen. | (wie Finale) | ✓ |
| Piano-Roll: neue Note über eine bestehende zeichnen | `Alt+Ziehen` *(Icastico)* – Gleicher Anfang und gleiche Länge = Akkord, sonst eine zweite Stimme. | `Alt+Ziehen` *(Icastico)* – Gleicher Anfang und gleiche Länge = Akkord, sonst eine zweite Stimme. | (wie Finale) | ✓ |
| Piano-Roll: Balken anklicken – Lautstärke und Ein-/Ausblenden | `Klick` *(Icastico)* – Menü mit Lautstärke und einer Linie über die Länge der Note. | `Klick` *(Icastico)* – Menü mit Lautstärke und einer Linie über die Länge der Note. | (wie Finale) | ✓ |
| Ab einer Stelle abspielen: Leertaste halten und in die Notenschrift klicken | `Klick` *(Icastico)* – Leertaste halten. Ein Klick neben das Notensystem spielt von Anfang an. Die Auswahl bleibt, wie sie war. | `Klick` *(Icastico)* – Leertaste halten. In Logic ist die Leertaste sonst die Pause; sie wirkt erst beim Loslassen und nur, wenn nicht geklickt wurde. | (wie Finale) | ✓ |
| Zeichen: aus dem Menü auf eine Note ziehen, oder ein gesetztes Zeichen an eine andere Stelle ziehen | `Ziehen` *(Icastico)* – Im Zeichen-Menü setzt ein Doppelklick das Zeichen an die gewählte Note. | `Ziehen` *(Icastico)* – Im Zeichen-Menü setzt ein Doppelklick das Zeichen an die gewählte Note. | (wie Finale) | ✓ |
| Piano-Roll: Gleit-Linie anklicken – Verlauf des Übergangs | `Klick` *(Icastico)* – Die Linie bestimmt, wie Tonhöhe und Lautstärke durch die Lücke wandern. | `Klick` *(Icastico)* – Die Linie bestimmt, wie Tonhöhe und Lautstärke durch die Lücke wandern. | (wie Finale) | ✓ |
| Im Lautstärke-/Verlaufsmenü: Punkt auf die Linie setzen | `P` *(Icastico)* – An der Stelle des Mauszeigers. Punkt ziehen formt die ganze Linie, Doppelklick oder Entf entfernt ihn. | `P` *(Icastico)* – An der Stelle des Mauszeigers. Punkt ziehen formt die ganze Linie, Doppelklick oder Entf entfernt ihn. | (wie Finale) | ✓ |
| Rückgängig | `Strg+Z` | `Strg+Z` | (wie Finale) | ✓ |
| Wiederholen | `Strg+Y` / `Strg+Umschalt+Z` | `Strg+Umschalt+Z` | (wie Finale) | ✓ |
| Kopieren | `Strg+C` | `Strg+C` | (wie Finale) | geplant |
| Einfügen | `Strg+V` | `Strg+V` | (wie Finale) | geplant |
| Ausschneiden | `Strg+X` | `Strg+X` | (wie Finale) | geplant |
| Alles auswählen | `Strg+A` | `Strg+A` | (wie Finale) | geplant |
| Quantisieren (eingespielte Noten ins Raster) | – | `Q` | (wie Finale) | geplant |

## Bewegen

| Funktion | Finale | Logic Pro | Finale-Ziffernblock | Icastico |
|---|---|---|---|---|
| Vor / zurück | `→` vor, `←` zurück *(Annahme)* | `→` vor, `←` zurück – Logic: nächstes / voriges Ereignis auswählen. | (wie Finale) | ✓ |
| System wechseln | `Alt+↓` darunter, `Alt+↑` darüber *(Annahme)* | `↓` darunter, `↑` darüber – Logic: Spur darüber / darunter auswählen. | (wie Finale) | ✓ |
| Eingabe beenden, dann Auswahl aufheben | `Esc` *(Icastico)* | `Esc` *(Icastico)* | (wie Finale) | ✓ |
| Vergrößern / verkleinern | – | `Strg+→` größer, `Strg+←` kleiner | (wie Finale) | geplant |

## Datei & Ansicht

| Funktion | Finale | Logic Pro | Finale-Ziffernblock | Icastico |
|---|---|---|---|---|
| Neue Partitur | `Strg+N` | `Strg+N` | (wie Finale) | ✓ |
| Bibliothek | `Strg+O` *(Icastico)* – In Finale/Logic: Öffnen. | `Strg+O` *(Icastico)* – In Finale/Logic: Öffnen. | (wie Finale) | ✓ |
| Datei von außerhalb der Bibliothek öffnen | `Strg+Umschalt+O` *(Icastico)* | `Strg+Umschalt+O` *(Icastico)* | (wie Finale) | ✓ |
| MusicXML importieren (z. B. aus Finale) | `Strg+Umschalt+I` *(Icastico)* | `Strg+Umschalt+I` *(Icastico)* | (wie Finale) | ✓ |
| Speichern (Bibliothek speichert auch selbst) | `Strg+S` | `Strg+S` | (wie Finale) | ✓ |
| Kopie speichern unter … | `Strg+Umschalt+S` | `Strg+Umschalt+S` | (wie Finale) | ✓ |
| Partitur-Einstellungen (Titel, Tonart, Taktart, Auftakt) | `Strg+,` *(Icastico)* | `Strg+,` *(Icastico)* | (wie Finale) | ✓ |
| Drucken | `Strg+P` | `Strg+P` | (wie Finale) | geplant |
| Piano-Roll für die gewählte Zeile ein / aus | `Strg+Umschalt+P` *(Icastico)* | `Strg+Umschalt+P` *(Icastico)* – In Logic öffnet P den Piano-Roll-Editor; hier ist P ein Ton. | (wie Finale) | ✓ |
| Als MusicXML exportieren (für Finale, MuseScore …) | `Strg+Umschalt+E` *(Icastico)* | `Strg+Umschalt+E` *(Icastico)* | (wie Finale) | ✓ |
| Tabulatur unter der Gitarrenzeile an/aus | `Strg+T` *(Icastico)* | `Strg+T` *(Icastico)* | (wie Finale) | ✓ |
| Als PDF speichern (A4, Notengröße wählbar) | `Strg+P` *(Icastico)* – Aus der Bibliothek lassen sich mehrere Partituren zusammen als PDF speichern. | `Strg+P` *(Icastico)* | (wie Finale) | ✓ |
| Einzelstimme: ein Instrument als neue Partitur herausziehen | `Strg+Umschalt+X` *(Icastico)* – Die Stimme steht danach als eigene Partitur in der Bibliothek (Titel – Instrument). | `Strg+Umschalt+X` *(Icastico)* | (wie Finale) | ✓ |
| Liedtext ab der gewählten Note eingeben | `L` *(Icastico)* – Eine Silbe pro Note, Bindestrich am Ende = das Wort geht weiter, _ = Note ohne Silbe. | `L` *(Icastico)* | (wie Finale) | ✓ |
| Akkordsymbol an dieser Stelle eingeben (leer = löschen) | `K` *(Icastico)* – Zum Beispiel Am7 oder C/G; das Symbol bleibt an seiner Zeit stehen. | `K` *(Icastico)* | (wie Finale) | ✓ |
| Tastenhilfe | `F1` / `?` *(Icastico)* | `F1` / `?` *(Icastico)* | (wie Finale) | ✓ |

## Wiedergabe & Aufnahme

| Funktion | Finale | Logic Pro | Finale-Ziffernblock | Icastico |
|---|---|---|---|---|
| Wiedergabe starten / stoppen | `Strg+Enter` / `Leertaste` – Wie bei Finale startet und stoppt die Leertaste. Während der Wiedergabe stoppt sie in jeder Belegung. | `Strg+Enter` *(Icastico)* – In Logic startet die Leertaste die Wiedergabe; hier ist sie die Pause der Schritteingabe – nur während der Wiedergabe stoppt sie. | (wie Finale) | ✓ |
| Aufnahme | – | `R` | (wie Finale) | geplant |
| Metronom an / aus | – | `K` | (wie Finale) | geplant |
| Wiederholbereich (Cycle) an / aus | – | `C` | (wie Finale) | geplant |

## Zeichen

| Funktion | Finale | Logic Pro | Finale-Ziffernblock | Icastico |
|---|---|---|---|---|
| Zeichen an der gewählten Note (nochmal: weg) | `Alt+Umschalt+P` pp, `Alt+P` p, `Alt+Umschalt+M` mp, `Alt+M` mf, `Alt+F` f, `Alt+Umschalt+F` ff, `Alt+S` sfz, `Alt+C` Crescendo, `Alt+Umschalt+C` Decrescendo, `Alt+.` Staccato, `Alt+−` Tenuto, `Alt+A` Akzent, `Alt+Umschalt+A` Marcato, `Alt+T` Triller, `Alt+Y` Fermate *(Icastico)* – Lautstärken ersetzen sich gegenseitig, ebenso Crescendo/Decrescendo. Alle Zeichen stehen auch in der Palette (Strg+J). | `Alt+Umschalt+P` pp, `Alt+P` p, `Alt+Umschalt+M` mp, `Alt+M` mf, `Alt+F` f, `Alt+Umschalt+F` ff, `Alt+S` sfz, `Alt+C` Crescendo, `Alt+Umschalt+C` Decrescendo, `Alt+.` Staccato, `Alt+−` Tenuto, `Alt+A` Akzent, `Alt+Umschalt+A` Marcato, `Alt+T` Triller, `Alt+Y` Fermate *(Icastico)* | (wie Finale) | ✓ |
| Zeichen am Takt der gewählten Note: Wiederholung, Klammer, Segno, Coda, Sprung (nochmal: weg) | *Nur über die Palette (Strg+J). Aufeinanderfolgende Takte mit derselben Klammer bilden eine gemeinsame Klammer.* | *Nur über die Palette (Strg+J).* | (wie Finale) | ✓ |
| Sprachtest: Wörter einsprechen und Erkenner prüfen (noch ohne Befehle per Sprache) | `Strg+Umschalt+V` *(Icastico)* | `Strg+Umschalt+V` *(Icastico)* | (wie Finale) | ✓ |
| Zeichen-Palette zeigen / verbergen | `Strg+J` *(Icastico)* | `Strg+J` *(Icastico)* | (wie Finale) | ✓ |

## Quellen

- Finale: [Simple Entry (Finale-Handbuch)](https://usermanuals.finalemusic.com/Finale2010Mac/Content/Finale/Simple_Entry2.htm), siehe ADR 0006
- Logic Pro: [Tastaturbefehle Step-Input-Tastatur (Apple)](https://support.apple.com/en-gw/guide/logicpro/lgcp4fe41fb3/10.7/mac/11.0),
  [Tastaturbefehle Hauptfenster/Editoren (Apple)](https://support.apple.com/guide/logicpro/main-window-tracks-and-various-editors-lgcpe8314fe2/mac)
