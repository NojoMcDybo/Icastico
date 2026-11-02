# 0006 – Noteneingabe nach Finale (Simple Entry)

- Status: angenommen
- Datum: 2026-11-02

## Kontext

Der Owner will die Eingabe „erstmal wie bei Finale“. Finale hatte zwei
Tastatur-Methoden: *Simple Entry* (Buchstaben für Tonhöhen, Zahlen für
Notenwerte) und *Speedy Entry* (Ziffernblock + Pfeiltasten). Simple Entry ist
die zugänglichere und passt zu „schnell und simpel“.

## Entscheidung

Tastenbelegung nach Finale Simple Entry, als austauschbarer Datensatz
(`src/ui/keymaps/finale.ts`, ADR 0004). Eine eigene Icastico-Belegung kann
später daneben entstehen.

| Taste | Funktion | Quelle |
|---|---|---|
| Enter | Eingabe-Cursor an/aus | Finale-Doku |
| 1–7 | Notenwert: 1 = 64stel … 5 = Viertel, 6 = Halbe, 7 = Ganze | Finale-Doku (8 = Brevis weggelassen) |
| A–G | Note eingeben, Tonart wird berücksichtigt | Finale-Doku |
| 0 | Pause | Finale-Doku |
| . | Punktierung | Finale-Doku (ausgewählte Note); in der Eingabe: für die *nächste* Note – **Annahme** |
| T | Haltebogen | Finale-Doku |
| R | Note → Pause | Finale-Doku |
| Alt + 1–7 (Mac: Option) | Notenwert der eingegebenen Note ändern | Finale-Doku |
| H | wie B (deutsches H) | Icastico |
| ↑ / ↓ | letzte/ausgewählte Note eine Stufe höher/tiefer | **Annahme** – in Finale bewegen die Pfeile den Cursor vertikal |
| Strg + ↑ / ↓ | Oktave | **Annahme** |
| + / − | Halbton höher/tiefer | **Annahme** |
| Umschalt + Buchstabe | Akkordton hinzufügen | **Annahme** |
| Alt + ↑ / ↓ | System wechseln | **Annahme** |
| Einfg / Strg+I | Einfügen statt Überschreiben | **Annahme** |
| ⌫ | letzte Note löschen, Cursor zurück | **Annahme** |

**Oktavwahl:** Die Note landet in der Oktave, die der vorigen Note am nächsten
liegt – gemessen in Notenlinien/Stufen, nicht in Halbtönen (Quarte abwärts
schlägt Quinte aufwärts; kein Gleichstand möglich). Die erste Note eines
leeren Systems orientiert sich an der Mittellinie. In Finale bestimmt die
vertikale Cursorposition die Oktave – **Abweichung, vom Owner zu prüfen**.

**Überschreiben ist Standard** (wie Finale/MuseScore): Eine neue Note ersetzt,
was an der Stelle stand; andere Systeme bleiben synchron. Im Einfügemodus
rückt die Musik dieser Stimme nach hinten.

**Buchstabe B** bedeutet wie in Finale das englische B (= deutsches H).
Deutsches B = B, dann −.

## Quellen

Die Finale-Handbücher waren aus der Arbeitsumgebung nicht direkt abrufbar;
die belegten Tasten stammen aus Suchergebnissen zu diesen Seiten:

- [Finale 2010 Mac – Simple Entry: Tastatureingabe](https://usermanuals.finalemusic.com/Finale2010Mac/Content/Finale/Simple_Entry2.htm)
- [Finale 2009 Win – Simple Entry](https://usermanuals.finalemusic.com/Finale2009Win/Content/Finale/Simple_Entry.htm)
- [Finale 2012 Mac – Simple Entry Tool](https://usermanuals.finalemusic.com/Finale2012Mac/Content/Finale/ID_MAINTOOL_SIMPLEENTRY.htm)
- [CCARH Wiki – Finale Simple Note Entry](https://wiki.ccarh.org/wiki/Finale_Simple_Note_Entry)
- [University of Notre Dame – Finale Shortcuts](https://libguides.library.nd.edu/notation/finale-shortcuts)

## Folgen

- Finale-Umsteiger finden sich sofort zurecht.
- Alle **Annahmen** muss der Owner (Finale-Nutzer) bestätigen oder korrigieren.
  Korrektur = Änderung in `src/ui/keymaps/finale.ts`, kein Umbau.
