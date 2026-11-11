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
| Punktierung | `.` – In der Eingabe gilt der Punkt für die nächste Note (Annahme), sonst für die ausgewählte. | `0` / `.` – Logic: „nächste zwei Noten punktiert“; Icastico punktiert die nächste Note. Das Komma des Ziffernblocks punktiert auch hier. | (wie Finale) | ✓ |
| Ton zum Akkord hinzufügen (darüber) | `Umschalt+C` C, `Umschalt+D` D, `Umschalt+E` E, `Umschalt+F` F, `Umschalt+G` G, `Umschalt+A` A, `Umschalt+B` / `Umschalt+H` H *(Annahme)* | – | (wie Finale) | ✓ |
| Akkordmodus an/aus (nächste Töne übereinander) | `` ` `` *(Icastico)* – Finale hat das nicht als Taste; wir nehmen dieselbe wie Logic. Alternativ: Umschalt + Buchstabe fügt einen Ton zum Akkord. | `` ` `` – Gemeint ist die Taste links neben der 1 – auf deutschen Tastaturen ist das ^. | (wie Finale) | ✓ |
| Triolen / Quintolen für die nächsten Noten (noch einmal: aus) | `Alt+0` Septolen, `Alt+8` Quintolen, `Alt+9` Triolen *(Icastico)* – Finale Simple Entry nutzt hier ein Menü; die Tasten sind von uns gewählt. | `9` Triolen – Quintolen und Septolen: Taste von uns. | (wie Finale) | ✓ |
| Kreuz für die nächste Note (vor dem Buchstaben tippen; nochmal: aufheben) | – | `Umschalt+3` – Auf US-Tastaturen ist Umschalt+3 das #. | (wie Finale) | ✓ |
| B für die nächste Note (vor dem Buchstaben tippen; nochmal: aufheben) | – | `Umschalt+B` | (wie Finale) | ✓ |
| Oktave für die nächste Note höher / tiefer | `Alt+X` höher, `Alt+Z` tiefer *(Icastico)* – Gilt nur für die nächste Note; sonst wählt Icastico die Oktave nah an der vorigen Note. | `X` höher, `Umschalt+X` zwei höher, `Z` tiefer, `Umschalt+Z` zwei tiefer – Gilt nur für die nächste Note; sonst wählt Icastico die Oktave nah an der vorigen Note. | (wie Finale) | ✓ |
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
| Bogen zur nächsten Note: bei gleicher Tonhöhe ein Haltebogen (eine durchgehende Note), sonst ein Bindebogen (nochmal: lösen) | `T` | `Umschalt+T` *(Icastico)* – T ist in Logic die Taste für Fis. | (wie Finale) | ✓ |
| Gleiten zur nächsten Note (nochmal: lösen). Die Lücke dazwischen ist die Gleitdauer | `Strg+Umschalt+G` *(Icastico)* | `Strg+Umschalt+G` *(Icastico)* | (wie Finale) | ✓ |
| Note in Pause umwandeln | `Strg+Entf` *(Icastico)* – In Finale R; hier ist R die Aufnahmetaste. Anders als Entf wird auch bei einem gewählten Akkordton die ganze Note zur Pause. | `Strg+Entf` *(Icastico)* | (wie Finale) | ✓ |
| Note löschen (wird zur Pause) | `Entf` *(Annahme)* | `Entf` | (wie Finale) | ✓ |
| Letzte Note löschen und zurückgehen | `⌫` *(Annahme)* | `⌫` *(Icastico)* | (wie Finale) | ✓ |
| Angeklickten Akkordton in eine eigene Stimme lösen | `Strg+Umschalt+D` *(Icastico)* | `Strg+Umschalt+D` *(Icastico)* | (wie Finale) | ✓ |
| Note in der Zeit verschieben (um den gewählten Notenwert) | `Alt+→` später, `Alt+←` früher *(Icastico)* | `Alt+→` später, `Alt+←` früher *(Icastico)* | (wie Finale) | ✓ |
| Note verlängern / verkürzen (um den gewählten Notenwert) | `Strg+Umschalt+→` länger, `Strg+Umschalt+←` kürzer *(Icastico)* – Umschalt+Pfeil markiert einen Bereich, deshalb liegt das Verlängern auf Strg+Umschalt+Pfeil. | `Strg+Umschalt+→` länger, `Strg+Umschalt+←` kürzer *(Icastico)* – Umschalt+Pfeil markiert einen Bereich, deshalb liegt das Verlängern auf Strg+Umschalt+Pfeil. | (wie Finale) | ✓ |
| Note mit der Maus nach oben / unten ziehen | `Ziehen` *(Icastico)* – Stufenweise in der Tonart. | `Ziehen` *(Icastico)* – Stufenweise in der Tonart; mit Alt in Halbtönen. | (wie Finale) | ✓ |
| Note auf eine andere Note ziehen (Akkord) | `Ziehen` *(Icastico)* – Die gezogene Note übernimmt Anfang und Länge der anderen und klingt mit ihr zusammen. | `Ziehen` *(Icastico)* – Die gezogene Note übernimmt Anfang und Länge der anderen und klingt mit ihr zusammen. | (wie Finale) | ✓ |
| Piano-Roll: neue Note über eine bestehende zeichnen | `Alt+Ziehen` *(Icastico)* – Gleicher Anfang und gleiche Länge = Akkord, sonst eine zweite Stimme. | `Alt+Ziehen` *(Icastico)* – Gleicher Anfang und gleiche Länge = Akkord, sonst eine zweite Stimme. | (wie Finale) | ✓ |
| Piano-Roll: Balken anklicken – Lautstärke und Ein-/Ausblenden | `Klick` *(Icastico)* – Menü mit Lautstärke und einer Linie über die Länge der Note. | `Klick` *(Icastico)* – Menü mit Lautstärke und einer Linie über die Länge der Note. | (wie Finale) | ✓ |
| Ab einer Stelle abspielen: Leertaste halten und in die Notenschrift klicken | `Klick` *(Icastico)* – Leertaste halten. Ein Klick neben das Notensystem spielt von Anfang an. Die Auswahl bleibt, wie sie war. | `Klick` *(Icastico)* – Leertaste halten. In Logic ist die Leertaste sonst die Pause; sie wirkt erst beim Loslassen und nur, wenn nicht geklickt wurde. | (wie Finale) | ✓ |
| Tempo: in der Anzeige nach oben ziehen = schneller, nach unten = langsamer (wie bei Logic); ein Klick tippt die Zahl ein | `Ziehen` *(Icastico)* – Ein Pixel = ein Schlag pro Minute; das ganze Ziehen ist ein Rückgängig-Schritt. | `Ziehen` *(Icastico)* – Ein Pixel = ein Schlag pro Minute; das ganze Ziehen ist ein Rückgängig-Schritt. | (wie Finale) | ✓ |
| Tonart: die Anzeige anklicken öffnet den Quintenzirkel (außen Dur, innen Moll) | `Klick` *(Icastico)* – Gilt ab dem Takt der Auswahl. | `Klick` *(Icastico)* – Gilt ab dem Takt der Auswahl. | (wie Finale) | ✓ |
| Piano-Roll: mehrere Noten in eine Note gleiten lassen – vom Punkt jeder Note auf den Zielbalken ziehen, mit Umschalt gleichen alle Töne eines Akkords | `Umschalt+Ziehen` *(Icastico)* – Ohne Umschalt gleitet der eine Ton, auf dessen Punkt gezogen wird. | `Umschalt+Ziehen` *(Icastico)* – Ohne Umschalt gleitet der eine Ton, auf dessen Punkt gezogen wird. | (wie Finale) | ✓ |
| Piano-Roll: auf eine Taste der Klaviatur links klicken spielt den Ton | `Klick` *(Icastico)* | `Klick` *(Icastico)* | (wie Finale) | ✓ |
| Zeichen: aus dem Menü auf eine Note ziehen, oder ein gesetztes Zeichen an eine andere Stelle ziehen | `Ziehen` *(Icastico)* – Im Zeichen-Menü setzt ein Doppelklick das Zeichen an die gewählte Note. | `Ziehen` *(Icastico)* – Im Zeichen-Menü setzt ein Doppelklick das Zeichen an die gewählte Note. | (wie Finale) | ✓ |
| Piano-Roll: Gleit-Linie anklicken – Verlauf des Übergangs | `Klick` *(Icastico)* – Die Linie bestimmt, wie Tonhöhe und Lautstärke durch die Lücke wandern. | `Klick` *(Icastico)* – Die Linie bestimmt, wie Tonhöhe und Lautstärke durch die Lücke wandern. | (wie Finale) | ✓ |
| Im Lautstärke-/Verlaufsmenü: Punkt auf die Linie setzen | `P` *(Icastico)* – An der Stelle des Mauszeigers. Punkt ziehen formt die ganze Linie, Doppelklick oder Entf entfernt ihn. | `P` *(Icastico)* – An der Stelle des Mauszeigers. Punkt ziehen formt die ganze Linie, Doppelklick oder Entf entfernt ihn. | (wie Finale) | ✓ |
| Rückgängig | `Strg+Z` | `Strg+Z` | (wie Finale) | ✓ |
| Wiederholen | `Strg+Y` / `Strg+Umschalt+Z` | `Strg+Umschalt+Z` | (wie Finale) | ✓ |
| Mehrere Noten / Takte markieren: von der gewählten Note nach rechts / links erweitern (auch Umschalt + Klick, einen Rahmen aufziehen oder Doppelklick auf einen Takt); Entf löscht, Strg+C / X / V, Esc hebt auf | `Umschalt+→` / `Alt+Umschalt+→` weiter nach rechts, `Umschalt+←` / `Alt+Umschalt+←` weiter nach links *(Icastico)* | `Umschalt+→` / `Alt+Umschalt+→` weiter nach rechts, `Umschalt+←` / `Alt+Umschalt+←` weiter nach links *(Icastico)* | (wie Finale) | ✓ |
| Transponieren: um ein Intervall, chromatisch oder diatonisch (Rad zum Auswählen); gilt für den markierten Bereich, die gewählte Zeile oder die ganze Partitur | `Strg+Umschalt+T` *(Icastico)* | `Strg+Umschalt+T` *(Icastico)* | (wie Finale) | ✓ |
| Kopieren (den markierten Bereich oder die gewählte Note) | `Strg+C` | `Strg+C` | (wie Finale) | ✓ |
| Einfügen (an der Schreibmarke oder der gewählten Note) | `Strg+V` | `Strg+V` | (wie Finale) | ✓ |
| Ausschneiden (den markierten Bereich oder die gewählte Note) | `Strg+X` | `Strg+X` | (wie Finale) | ✓ |
| Alle Noten der Stimme markieren | `Strg+A` | `Strg+A` | (wie Finale) | ✓ |
| Quantisieren: eingespielte Noten ins Raster rücken (markierter Bereich, sonst die ganze Zeile) | `Q` *(Icastico)* | `Q` | (wie Finale) | ✓ |
| Piano-Roll: Synth-Klang an / aus (Orgelklang, nichts klingt aus) | *Knopf „Synth“ in der Leiste der Roll* | *Knopf „Synth“ in der Leiste der Roll* | (wie Finale) | ✓ |
| Piano-Roll: Höhe ändern (Doppelklick: Standardhöhe) | *Kante über der Roll ziehen oder mit ↑ / ↓* | *Kante über der Roll ziehen oder mit ↑ / ↓* | (wie Finale) | ✓ |
| Zeile als Noten, als Piano-Roll oder als beides zeigen | *Schalter „Noten · Beides · Roll“ an der Zeile (Strg+Umschalt+P schaltet die Roll um)* | *Schalter „Noten · Beides · Roll“ an der Zeile (Strg+Umschalt+P schaltet die Roll um)* | (wie Finale) | ✓ |
| Tabulatur: die Bundzahl einer markierten Note ändern – Zahl tippen (zwei Ziffern schnell hintereinander: 10 bis 22) | *Note in der Tabulaturzeile anklicken und die Zahl tippen* | *Note in der Tabulaturzeile anklicken und die Zahl tippen* | (wie Finale) | ✓ |
| Tabulatur: die markierte Zahl auf eine andere Saite legen (der Ton bleibt, der Bund passt sich an) | *↑ / ↓ bei einer markierten Note der Tabulaturzeile* | *↑ / ↓ bei einer markierten Note der Tabulaturzeile* | (wie Finale) | ✓ |
| Akkord: einzelne Töne durchgehen und mit ↑ / ↓ verändern | *Alt+↑ / Alt+↓ bei einem markierten Akkord (Mac: ⌥); danach wirkt ↑ / ↓ nur auf diesen Ton* | *Alt+↑ / Alt+↓ bei einem markierten Akkord (Mac: ⌥); danach wirkt ↑ / ↓ nur auf diesen Ton* | (wie Finale) | ✓ |
| Markierte Noten in eine andere Zeile ziehen (z. B. in die Tabulatur): sie werden dort zur gleichen Zeit eingefügt | *Mit der Maus: markierte Noten greifen und auf die andere Zeile ziehen* | *Mit der Maus: markierte Noten greifen und auf die andere Zeile ziehen* | (wie Finale) | ✓ |
| Liedtext in der Partitur: eine Silbe anklicken (Umschalt+Klick: bis zu dieser Silbe), dann löschen, kopieren, ausschneiden, einfügen | *Silbe unter den Noten anklicken: Entf nimmt sie weg, Strg+C / Strg+X kopiert / schneidet aus, Strg+V legt sie ab der gewählten Note auf die Noten* | *Silbe unter den Noten anklicken: Entf nimmt sie weg, Strg+C / Strg+X kopiert / schneidet aus, Strg+V legt sie ab der gewählten Note auf die Noten* | (wie Finale) | ✓ |
| Eine Silbe auf eine andere Note verschieben | *Mit der Maus: die Silbe unter den Noten greifen und auf die andere Note ziehen* | *Mit der Maus: die Silbe unter den Noten greifen und auf die andere Note ziehen* | (wie Finale) | ✓ |
| Das Liedtext-Fenster verschieben | *Mit der Maus: den Kopf des Liedtext-Fensters (Titel) greifen und ziehen; die Stelle wird gemerkt* | *Mit der Maus: den Kopf des Liedtext-Fensters (Titel) greifen und ziehen; die Stelle wird gemerkt* | (wie Finale) | ✓ |
| Strophe 1 bis 4 des Liedtexts wählen | *Liedtext-Feld (L): Schalter Strophe 1–4* | *Liedtext-Feld (L): Schalter Strophe 1–4* | (wie Finale) | ✓ |

## Bewegen

| Funktion | Finale | Logic Pro | Finale-Ziffernblock | Icastico |
|---|---|---|---|---|
| Vor / zurück | `→` vor, `←` zurück *(Annahme)* | `→` vor, `←` zurück – Logic: nächstes / voriges Ereignis auswählen. | (wie Finale) | ✓ |
| System wechseln | `Alt+↓` darunter, `Alt+↑` darüber *(Annahme)* | `↓` darunter, `↑` darüber – Logic: Spur darüber / darunter auswählen. | (wie Finale) | ✓ |
| Eingabe beenden, dann Auswahl aufheben | `Esc` *(Icastico)* | `Esc` *(Icastico)* | (wie Finale) | ✓ |
| Notenschrift vergrößern / verkleinern (in 10-%-Schritten) | `Strg+0` normale Größe, `Strg++` größer, `Strg+−` kleiner *(Icastico)* | `Strg+0` normale Größe, `Strg+→` / `Strg++` größer, `Strg+←` / `Strg+−` kleiner – Strg+Pfeil rechts / links wie in Logic; Strg+Plus / Minus wie in anderen Programmen. | (wie Finale) | ✓ |

## Datei & Ansicht

| Funktion | Finale | Logic Pro | Finale-Ziffernblock | Icastico |
|---|---|---|---|---|
| Neue Partitur | `Strg+N` | `Strg+N` | (wie Finale) | ✓ |
| Bibliothek | `Strg+O` *(Icastico)* – In Finale/Logic: Öffnen. | `Strg+O` *(Icastico)* – In Finale/Logic: Öffnen. | (wie Finale) | ✓ |
| Datei von außerhalb der Bibliothek öffnen | `Strg+Umschalt+O` *(Icastico)* | `Strg+Umschalt+O` *(Icastico)* | (wie Finale) | ✓ |
| Importieren: MusicXML (Finale), MIDI-Datei oder Einzelstimmen-Aufnahme (Logic) | `Strg+Umschalt+I` *(Icastico)* | `Strg+Umschalt+I` *(Icastico)* | (wie Finale) | ✓ |
| Speichern (Bibliothek speichert auch selbst) | `Strg+S` | `Strg+S` | (wie Finale) | ✓ |
| Kopie speichern unter … | `Strg+Umschalt+S` | `Strg+Umschalt+S` | (wie Finale) | ✓ |
| Partitur-Einstellungen (Titel, Tonart, Taktart, Auftakt) | `Strg+,` *(Icastico)* – Auch: den Titel oben oder die Anzeige „Taktart“ anklicken. | `Strg+,` *(Icastico)* – Auch: den Titel oben oder die Anzeige „Taktart“ anklicken. | (wie Finale) | ✓ |
| Drucken / PDF: Dialog mit Seitenvorschau (Seite, Notengröße, Takte pro Zeile), dann drucken oder als PDF speichern | `Strg+P` | `Strg+P` | (wie Finale) | ✓ |
| Piano-Roll für die gewählte Zeile ein / aus | `Strg+Umschalt+P` *(Icastico)* | `Strg+Umschalt+P` *(Icastico)* – In Logic öffnet P den Piano-Roll-Editor; hier ist P ein Ton. | (wie Finale) | ✓ |
| Als MusicXML exportieren (für Finale, MuseScore …) | `Strg+Umschalt+E` *(Icastico)* | `Strg+Umschalt+E` *(Icastico)* | (wie Finale) | ✓ |
| Tabulatur: den markierten Bereich (oder die ganze gewählte Zeile) in die Gitarrenzeile übersetzen; die Gitarrenzeile wird angelegt, wenn es sie noch nicht gibt | `Strg+Umschalt+B` *(Icastico)* | `Strg+Umschalt+B` *(Icastico)* | (wie Finale) | ✓ |
| Als MIDI-Datei exportieren (zum Abspielen und für Klangprogramme) | `Strg+Umschalt+M` *(Icastico)* | `Strg+Umschalt+M` *(Icastico)* | (wie Finale) | ✓ |
| Tabulatur unter der Gitarrenzeile an/aus (gibt es noch keine Gitarrenzeile, wird sie hinzugefügt) | `Strg+T` *(Icastico)* | `Strg+T` *(Icastico)* | (wie Finale) | ✓ |
| Als PDF speichern (derselbe Dialog wie beim Drucken, mit Seitenvorschau) | `Strg+Umschalt+F` *(Icastico)* – Strg+P öffnet denselben Dialog; aus der Bibliothek lassen sich mehrere Partituren zusammen als PDF speichern. | `Strg+Umschalt+F` *(Icastico)* – Strg+P öffnet denselben Dialog. | (wie Finale) | ✓ |
| Einzelstimme: ein Instrument als neue Partitur herausziehen | `Strg+Umschalt+X` *(Icastico)* – Die Stimme steht danach als eigene Partitur in der Bibliothek (Titel – Instrument). | `Strg+Umschalt+X` *(Icastico)* | (wie Finale) | ✓ |
| Liedtext-Feld: Text mit Bindestrichen eintippen, dann Silbe und Noten anklicken | `L` *(Icastico)* – Silbe im Feld anklicken, dann die Noten der Reihe nach: jede bekommt die Silbe, danach springt das Feld zur nächsten. „_“ = Note ohne Silbe; „Ab gewählter Note alle setzen“ legt den Text auf einmal darunter. | `L` *(Icastico)* | (wie Finale) | ✓ |
| Akkordsymbol an dieser Stelle eingeben (leer = löschen) | `K` *(Icastico)* – Zum Beispiel Am7 oder C/G; das Symbol bleibt an seiner Zeit stehen. | `Umschalt+K` *(Icastico)* – In dieser Belegung ist K das Metronom. | (wie Finale) | ✓ |
| Akkord nach Namen eingeben (Cm7, G7, C/G): setzt die Töne an der Schreibmarke | `Strg+Umschalt+K` *(Icastico)* – Fenster: Namen eintippen, Umkehrung wählen, wahlweise das Akkordsymbol darüber. | `Strg+Umschalt+K` *(Icastico)* – Fenster: Namen eintippen, Umkehrung wählen, wahlweise das Akkordsymbol darüber. | (wie Finale) | ✓ |
| Tastenhilfe | `F1` / `?` *(Icastico)* | `F1` / `?` *(Icastico)* | (wie Finale) | ✓ |
| Befehlspalette: jede Funktion suchen und ausführen | `Strg+K` *(Icastico)* | `Strg+K` *(Icastico)* | (wie Finale) | ✓ |
| Partitur in der Bibliothek: Öffnen, Duplizieren, in eine Sammlung verschieben, Speicherort öffnen, in den Papierkorb | *Bibliothek (Strg+O): Menü ⋯ an der Partitur* | *Bibliothek (Strg+O): Menü ⋯ an der Partitur* | (wie Finale) | ✓ |
| Partitur in eine Sammlung verschieben: Kachel auf die Sammlung, auf „Alle“ (aus der Sammlung heraus) oder auf den Papierkorb ziehen | *Bibliothek (Strg+O): Kachel mit der Maus ziehen* | *Bibliothek (Strg+O): Kachel mit der Maus ziehen* | (wie Finale) | ✓ |
| Exportieren: PDF, MusicXML, MIDI oder Icastico-Datei | *Bibliothek: Menü ⋯ → Exportieren (PDF, MusicXML und MIDI auch mit den Tasten oben)* | *Bibliothek: Menü ⋯ → Exportieren (PDF, MusicXML und MIDI auch mit den Tasten oben)* | (wie Finale) | ✓ |
| Sammlungen: Partituren ordnen, Sammlung umbenennen oder (leer) löschen | *Bibliothek: Reiter oben und Menü ⋯ an der Sammlung* | *Bibliothek: Reiter oben und Menü ⋯ an der Sammlung* | (wie Finale) | ✓ |
| Papierkorb: Partitur wiederherstellen, endgültig löschen, Papierkorb leeren | *Bibliothek: Reiter „Papierkorb“* | *Bibliothek: Reiter „Papierkorb“* | (wie Finale) | ✓ |
| Partituren suchen; Pfeile wählen, Enter öffnet, Esc schließt | *Bibliothek: einfach lostippen* | *Bibliothek: einfach lostippen* | (wie Finale) | ✓ |
| Alle Partituren der Ansicht in einem PDF | *Bibliothek: Link „Als PDF speichern …“ unten* | *Bibliothek: Link „Als PDF speichern …“ unten* | (wie Finale) | ✓ |
| Den Ordner der Bibliothek im Explorer / Finder zeigen | *Bibliothek: Link unten* | *Bibliothek: Link unten* | (wie Finale) | ✓ |
| Neuigkeiten der letzten Versionen anzeigen | *Bibliothek: Link „Neuigkeiten“ unten; Tastenhilfe (F1): Knopf „Neuigkeiten“* | *Bibliothek: Link „Neuigkeiten“ unten; Tastenhilfe (F1): Knopf „Neuigkeiten“* | (wie Finale) | ✓ |
| Nach Updates suchen | *Bibliothek: Link unten; der Knopf „Update“ oben erscheint, wenn eine neue Version bereitsteht* | *Bibliothek: Link unten; der Knopf „Update“ oben erscheint, wenn eine neue Version bereitsteht* | (wie Finale) | ✓ |
| In der Tastenhilfe suchen | *Suchfeld in der Tastenhilfe (F1)* | *Suchfeld in der Tastenhilfe (F1)* | (wie Finale) | ✓ |
| Tabulatur als eigene Zeile neben der Notenschrift; Noten mit Strg+C / Strg+V hineinkopieren | *Partitur-Einstellungen (Strg+Komma): „+ Tabulatur“* | *Partitur-Einstellungen (Strg+Komma): „+ Tabulatur“* | (wie Finale) | ✓ |
| Takte pro Zeile festlegen (Zeilenumbrüche aus einer MusicXML-Datei bleiben erhalten) | *Partitur-Einstellungen (Strg+Komma): „Takte pro Zeile“* | *Partitur-Einstellungen (Strg+Komma): „Takte pro Zeile“* | (wie Finale) | ✓ |
| Tabulatur und Gitarre: Stimmung wählen (Drop D, Offen G …) oder jede Saite einzeln einstellen | *Partitur-Einstellungen (Strg+Komma): „Stimmung“* | *Partitur-Einstellungen (Strg+Komma): „Stimmung“* | (wie Finale) | ✓ |

## Wiedergabe & Aufnahme

| Funktion | Finale | Logic Pro | Finale-Ziffernblock | Icastico |
|---|---|---|---|---|
| Wiedergabe starten / stoppen | `Strg+Enter` / `Leertaste` – Wie bei Finale startet und stoppt die Leertaste. Während der Wiedergabe stoppt sie in jeder Belegung. | `Strg+Enter` *(Icastico)* – In Logic startet die Leertaste die Wiedergabe; hier ist sie die Pause der Schritteingabe – nur während der Wiedergabe stoppt sie. | (wie Finale) | ✓ |
| Den markierten Bereich in Schleife abspielen (noch einmal: Schleife aus) | `Strg+L` *(Icastico)* | `Strg+L` *(Icastico)* | (wie Finale) | ✓ |
| Aufnahme: Sprache und MIDI-Keyboard hören zu | `R` *(Icastico)* – Vom Owner bestimmt (Plan Sprachbefehle). In Finale macht R aus einer Note eine Pause; das geht hier mit Entf. | `R` | (wie Finale) | ✓ |
| MIDI-Keyboard: Taste spielen gibt die Note ein (bei laufender Aufnahme; mehrere Tasten zugleich = Akkord) | `MIDI` *(Icastico)* | `MIDI` *(Icastico)* | (wie Finale) | ✓ |
| Metronom an / aus (bei der Wiedergabe ein Klick auf jedem Schlag) | `M` *(Icastico)* | `K` – Die Akkordsymbole liegen in dieser Belegung auf Umschalt+K. | (wie Finale) | ✓ |
| Tempowechsel ab diesem Takt (♩ = …) | *Zeichen-Menü (Strg+J): Tempo-Anweisungen → ♩ = …* | *Zeichen-Menü (Strg+J): Tempo-Anweisungen → ♩ = …* | (wie Finale) | ✓ |
| Cycle: die markierte Passage (sonst das ganze Stück) immer wieder abspielen – an / aus | `Strg+Umschalt+L` *(Icastico)* | `C` | (wie Finale) | ✓ |
| Zum Anfang springen (der Stopp-Knopf springt dorthin, wenn nichts läuft) | *Knopf ⏮ in der oberen Leiste* | *Knopf ⏮ in der oberen Leiste* | (wie Finale) | ✓ |
| Einen Takt zurück / vor | *Knöpfe ⏪ und ⏩ in der oberen Leiste* | *Knöpfe ⏪ und ⏩ in der oberen Leiste* | (wie Finale) | ✓ |
| Dauerschleife: das ganze Stück wiederholen | *Schleifen-Knopf in der oberen Leiste* | *Schleifen-Knopf in der oberen Leiste* | (wie Finale) | ✓ |
| Sprachbefehle: Notennamen, Notenwerte, Vorzeichen, Oktave, „zurück“ … bei eingeschalteter Aufnahme sprechen | *Aufnahme (R) einschalten; die Wörter zeigt der Sprachtest (Strg+Umschalt+V)* | *Aufnahme (R) einschalten; die Wörter zeigt der Sprachtest (Strg+Umschalt+V)* | (wie Finale) | ✓ |

## Zeichen

| Funktion | Finale | Logic Pro | Finale-Ziffernblock | Icastico |
|---|---|---|---|---|
| Zeichen an der gewählten Note (nochmal: weg) | `Alt+Umschalt+P` pp, `Alt+P` p, `Alt+Umschalt+M` mp, `Alt+M` mf, `Alt+F` f, `Alt+Umschalt+F` ff, `Alt+S` sfz, `Alt+C` Crescendo, `Alt+Umschalt+C` Decrescendo, `Alt+.` Staccato, `Alt+−` Tenuto, `Alt+A` Akzent, `Alt+Umschalt+A` Marcato, `Alt+T` Triller, `Alt+Y` Fermate *(Icastico)* – Lautstärken ersetzen sich gegenseitig, ebenso Crescendo/Decrescendo. Alle Zeichen stehen auch in der Palette (Strg+J); Atemzeichen, Zäsur und Arpeggio nur dort, der Bindebogen auf T. | `Alt+Umschalt+P` pp, `Alt+P` p, `Alt+Umschalt+M` mp, `Alt+M` mf, `Alt+F` f, `Alt+Umschalt+F` ff, `Alt+S` sfz, `Alt+C` Crescendo, `Alt+Umschalt+C` Decrescendo, `Alt+.` Staccato, `Alt+−` Tenuto, `Alt+A` Akzent, `Alt+Umschalt+A` Marcato, `Alt+T` Triller, `Alt+Y` Fermate *(Icastico)* | (wie Finale) | ✓ |
| Zeichen am Takt der gewählten Note: Wiederholung, Klammer, Segno, Coda, Sprung (nochmal: weg) | *Zeichen-Palette (Strg+J): Zeichen doppelklicken oder ziehen – Segno, Coda, Sprünge und Tempoanweisungen stehen genau auf der Note, auf die sie fallen; Wiederholungen und Klammern gehören zum Takt – Aufeinanderfolgende Takte mit derselben Klammer bilden eine gemeinsame Klammer.* | *Zeichen-Palette (Strg+J): Zeichen doppelklicken oder ziehen – Segno, Coda, Sprünge und Tempoanweisungen stehen genau auf der Note, auf die sie fallen; Wiederholungen und Klammern gehören zum Takt* | (wie Finale) | ✓ |
| Sprachtest: Wörter einsprechen und Erkenner prüfen (noch ohne Befehle per Sprache) | `Strg+Umschalt+V` *(Icastico)* | `Strg+Umschalt+V` *(Icastico)* | (wie Finale) | ✓ |
| Zeichen-Palette zeigen / verbergen | `Strg+J` *(Icastico)* | `Strg+J` *(Icastico)* | (wie Finale) | ✓ |
| Klammer oder Akkolade um die Zeilen der Partitur | *Zeichen-Palette (Strg+J): Rubrik „Taktstriche“* | *Zeichen-Palette (Strg+J): Rubrik „Taktstriche“* | (wie Finale) | ✓ |
| Schlüssel ab diesem Takt | *Zeichen-Menü (Strg+J): Rubrik „Schlüssel“* | *Zeichen-Menü (Strg+J): Rubrik „Schlüssel“* | (wie Finale) | ✓ |

## Quellen

- Finale: [Simple Entry (Finale-Handbuch)](https://usermanuals.finalemusic.com/Finale2010Mac/Content/Finale/Simple_Entry2.htm), siehe ADR 0006
- Logic Pro: [Tastaturbefehle Step-Input-Tastatur (Apple)](https://support.apple.com/en-gw/guide/logicpro/lgcp4fe41fb3/10.7/mac/11.0),
  [Tastaturbefehle Hauptfenster/Editoren (Apple)](https://support.apple.com/guide/logicpro/main-window-tracks-and-various-editors-lgcpe8314fe2/mac)
