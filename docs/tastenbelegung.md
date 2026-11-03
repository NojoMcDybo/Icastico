# Tastenbelegung – Bibliothek

> Erzeugt aus `src/ui/keymaps/library.json` mit `npm run keys:doc` – nicht von Hand ändern.

Alle Funktionen eines Notenprogramms mit ihren Tasten in **Finale** und **Logic Pro** –
auch solche, die Icastico noch nicht kann („geplant“). In Icastico ist die Belegung
umschaltbar (Tastenhilfe F1). `Strg` ist auf dem Mac `⌘`, `Alt` ist `⌥`.

**Herkunft:** ohne Markierung = aus der Dokumentation des Programms ·
*(Annahme)* = von uns gewählt, bitte prüfen · *(Icastico)* = eigene Ergänzung.

## Eingabe

| Funktion | Finale | Logic Pro | Icastico |
|---|---|---|---|
| Eingabe starten / beenden | `Enter` | `Enter` *(Icastico)* – In Logic schaltet der Knopf „MIDI In“ die Schritteingabe ein. | ✓ |
| Notenwert der nächsten Note | `1` 64tel, `2` 32tel, `3` 16tel, `4` Achtel, `5` Viertel, `6` Halbe, `7` Ganze | `1` Ganze, `2` Halbe, `3` Viertel, `4` Achtel, `5` 16tel, `6` 32tel, `7` 64tel – Logic: 8 = 128tel (gibt es in Icastico noch nicht). | ✓ |
| Note nach Stammton (Tonart wird beachtet) | `C` C, `D` D, `E` E, `F` F, `G` G, `A` A, `B` / `H` H – B ist wie in Finale das englische B (= H). H ist eine Icastico-Ergänzung. | – | ✓ |
| Note nach Klaviertaste (schwarze Tasten nach Tonart) | – | `A` C, `W` Cis/Des, `S` D, `E` Dis/Es, `D` E, `F` F, `T` Fis/Ges, `G` G, `Y` Gis/As, `H` A, `U` Ais/B, `J` H – Auf deutschen Tastaturen liegt Y unten links (Z und Y sind vertauscht). | ✓ |
| Pause eingeben | `0` | `Leertaste` | ✓ |
| Punktierung | `.` – In der Eingabe gilt der Punkt für die nächste Note (Annahme), sonst für die ausgewählte. | `0` – Logic: „nächste zwei Noten punktiert“; Icastico punktiert die nächste Note. | ✓ |
| Ton zum Akkord hinzufügen (darüber) | `Umschalt+C` C, `Umschalt+D` D, `Umschalt+E` E, `Umschalt+F` F, `Umschalt+G` G, `Umschalt+A` A, `Umschalt+B` / `Umschalt+H` H *(Annahme)* | – | ✓ |
| Akkordmodus an/aus (nächste Töne übereinander) | – | `` ` `` | geplant |
| Triolen für die nächsten Noten | *Taste in Finale Simple Entry unbekannt – bitte ergänzen.* | `9` | geplant |
| Kreuz für die nächste Note | – | `Umschalt+3` – Auf US-Tastaturen ist Umschalt+3 das #. | geplant |
| B für die nächste Note | – | `Umschalt+B` | geplant |
| Eingabe-Oktave höher / tiefer | – | `X` höher, `Umschalt+X` zwei höher, `Z` tiefer, `Umschalt+Z` zwei tiefer – Icastico wählt die Oktave automatisch nah an der vorigen Note. | geplant |
| Einfügen statt Überschreiben | `Einfg` / `Strg+I` *(Icastico)* | `Einfg` / `Strg+I` *(Icastico)* | ✓ |

## Letzte / ausgewählte Note ändern

| Funktion | Finale | Logic Pro | Icastico |
|---|---|---|---|
| Eine Stufe höher / tiefer (in der Tonart) | `↑` höher, `↓` tiefer *(Annahme)* | – | ✓ |
| Einen Halbton höher / tiefer (E → F) | – | `Alt+↑` höher, `Alt+↓` tiefer | ✓ |
| Eine Oktave höher / tiefer | `Strg+↑` höher, `Strg+↓` tiefer *(Annahme)* | `Alt+Umschalt+↑` höher, `Alt+Umschalt+↓` tiefer | ✓ |
| Vorzeichen ändern (E → Eis, E → Es) | `+` Kreuz, `−` B *(Annahme)* | `+` Kreuz, `−` B *(Icastico)* | ✓ |
| Notenwert der Note ändern | `Alt+1` 64tel, `Alt+2` 32tel, `Alt+3` 16tel, `Alt+4` Achtel, `Alt+5` Viertel, `Alt+6` Halbe, `Alt+7` Ganze | `Alt+1` Ganze, `Alt+2` Halbe, `Alt+3` Viertel, `Alt+4` Achtel, `Alt+5` 16tel, `Alt+6` 32tel, `Alt+7` 64tel *(Icastico)* | ✓ |
| Haltebogen zur nächsten Note gleicher Tonhöhe | `T` | `Umschalt+T` *(Icastico)* – T ist in Logic die Taste für Fis. | ✓ |
| Note in Pause umwandeln | `R` | – | ✓ |
| Note löschen (wird zur Pause) | `Entf` *(Annahme)* | `Entf` | ✓ |
| Letzte Note löschen und zurückgehen | `⌫` *(Annahme)* | `⌫` *(Icastico)* | ✓ |
| Note mit der Maus nach oben / unten ziehen | `Ziehen` *(Icastico)* – Stufenweise in der Tonart. | `Ziehen` *(Icastico)* – Stufenweise in der Tonart; mit Alt in Halbtönen. | ✓ |
| Rückgängig | `Strg+Z` | `Strg+Z` | ✓ |
| Wiederholen | `Strg+Y` / `Strg+Umschalt+Z` | `Strg+Umschalt+Z` | ✓ |
| Kopieren | `Strg+C` | `Strg+C` | geplant |
| Einfügen | `Strg+V` | `Strg+V` | geplant |
| Ausschneiden | `Strg+X` | `Strg+X` | geplant |
| Alles auswählen | `Strg+A` | `Strg+A` | geplant |
| Quantisieren (eingespielte Noten ins Raster) | – | `Q` | geplant |

## Bewegen

| Funktion | Finale | Logic Pro | Icastico |
|---|---|---|---|
| Vor / zurück | `→` vor, `←` zurück *(Annahme)* | `→` vor, `←` zurück – Logic: nächstes / voriges Ereignis auswählen. | ✓ |
| System wechseln | `Alt+↓` darunter, `Alt+↑` darüber *(Annahme)* | `↓` darunter, `↑` darüber – Logic: Spur darüber / darunter auswählen. | ✓ |
| Eingabe beenden, dann Auswahl aufheben | `Esc` *(Icastico)* | `Esc` *(Icastico)* | ✓ |
| Vergrößern / verkleinern | – | `Strg+→` größer, `Strg+←` kleiner | geplant |

## Datei & Ansicht

| Funktion | Finale | Logic Pro | Icastico |
|---|---|---|---|
| Neue Partitur | `Strg+N` | `Strg+N` | ✓ |
| Bibliothek | `Strg+O` *(Icastico)* – In Finale/Logic: Öffnen. | `Strg+O` *(Icastico)* – In Finale/Logic: Öffnen. | ✓ |
| Datei von außerhalb der Bibliothek öffnen | `Strg+Umschalt+O` *(Icastico)* | `Strg+Umschalt+O` *(Icastico)* | ✓ |
| Speichern (Bibliothek speichert auch selbst) | `Strg+S` | `Strg+S` | ✓ |
| Kopie speichern unter … | `Strg+Umschalt+S` | `Strg+Umschalt+S` | ✓ |
| Partitur-Einstellungen (Titel, Tonart, Taktart, Auftakt) | `Strg+,` *(Icastico)* | `Strg+,` *(Icastico)* | ✓ |
| Drucken | `Strg+P` | `Strg+P` | geplant |
| Tastenhilfe | `F1` / `?` *(Icastico)* | `F1` / `?` *(Icastico)* | ✓ |

## Wiedergabe & Aufnahme

| Funktion | Finale | Logic Pro | Icastico |
|---|---|---|---|
| Wiedergabe starten / stoppen | – | `Leertaste` – In Logic hat die Schritteingabe Vorrang: dort ist die Leertaste die Pause. | geplant |
| Aufnahme | – | `R` | geplant |
| Metronom an / aus | – | `K` | geplant |
| Wiederholbereich (Cycle) an / aus | – | `C` | geplant |

## Quellen

- Finale: [Simple Entry (Finale-Handbuch)](https://usermanuals.finalemusic.com/Finale2010Mac/Content/Finale/Simple_Entry2.htm), siehe ADR 0006
- Logic Pro: [Tastaturbefehle Step-Input-Tastatur (Apple)](https://support.apple.com/en-gw/guide/logicpro/lgcp4fe41fb3/10.7/mac/11.0),
  [Tastaturbefehle Hauptfenster/Editoren (Apple)](https://support.apple.com/guide/logicpro/main-window-tracks-and-various-editors-lgcpe8314fe2/mac)
