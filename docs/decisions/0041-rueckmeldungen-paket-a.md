# 0041 – Rückmeldungen Paket A: Tabulatur frei, Zeilenbeschriftung, Anklicken und Löschen, Tabulatur-Import

- Status: angenommen
- Datum: 2026-11-11

Sammelentscheidung zu fünf Wünschen aus der Rückmelderunde (Papa, Nojo).

## Tabulatur nimmt jede Zahl (Wunsch: „auch wenn sie nicht richtig sind“)

- `setFret` lehnt Bundzahlen über 22 nicht mehr ab. Die Zahl bleibt, wie getippt (die Tonhöhe folgt: offene Saite + Bund); die Statuszeile
  weist nur darauf hin („die Gitarre hat nur 22 Bünde“). Es gibt zwei Zahlen beim Tippen (0–99).
- Einzige Grenze: der Ton muss darstellbar bleiben (MIDI 127). Dahinter bleibt es bei einer Meldung, die Note ändert sich nicht.
- `assignFrets`: ein Ton, der seine Saite trägt, behält seine Zahl auch jenseits des Griffbretts. ↑/↓ (Saite wechseln) bleibt auf Bund 0–22 beschränkt.

## Zeilenbeschriftung ausblendbar (Format 20)

- `Part.hideLabel` (optional, nur wenn wahr gespeichert): kein Name („Gitarre“, „Tab“, Kurzname) am Zeilenanfang. Der Notensatz (`render/mei.ts`) lässt die `<label>`-Elemente weg.
- Partitur-Einstellungen: je Zeile ein Haken „Beschriftung“; auch ein geleerter Namensfeld-Inhalt schaltet die Beschriftung aus.
- **Dateiformat 19 → 20.** Dateien der Version 19 öffnen sich unverändert (alle Beschriftungen an).
- Nicht umgesetzt: MusicXML schreibt den Namen weiter (`part-name`); der Import kennt die Einstellung nicht.

## Anklicken und mit der Rücktaste löschen („alles in der Partitur“)

Schon vorher wählbar: Noten, Pausen-Lücken, Zeichen (Dynamik, Fermate, Verzierungen, Taktzeichen …), Silben.
Neu wählbar (blau) und mit Rücktaste/Entf löschbar, Strg+Z holt es zurück:

- Akkordsymbole, Tempowechsel (nicht das Anfangstempo), Schlüsselwechsel, Haltebögen und Gleit-Verbindungen, Bindebögen (das Zeichen „Legato“).
- Gewählt wird durch Klick auf das Objekt oder knapp daneben (außer auf einer Note); gezogen werden diese Objekte nicht.
- Später in Paket B dazu: Pausen und freie Texte.

## Tabulatur-Import aus MusicXML

- Notensysteme mit Schlüssel `TAB` werden erkannt. Neben einem Standard-System ergibt das **eine** Gitarre mit eingeschalteter Tabulatur
  (früher wurde daraus ein Klavier); steht die Tabulatur allein, wird es das Instrument „Tabulatur“.
- Aus `<technical><string>` (1 = höchste Saite) bekommt jeder Ton seine Saite (`Tone.string`), aus dem Tabulatur-System oder dem Standard-System.
  Eine Saite, auf der der Ton gar nicht spielbar wäre (tiefer als die leere Saite), wird nicht übernommen – dann rechnet Icastico die Saite selbst aus.
- Die Bundzahl ist keine Eingabe: sie ergibt sich aus Saite und Tonhöhe.
- Ungeprüft mit echten Dateien (keine Beispieldatei vorhanden): getestet mit selbst geschriebenem MusicXML (Standard + TAB, nur TAB).

## Ton nach einem Akkord

Nach einer Akkord-Eingabe (Enter) schlägt die nächste Note nicht den ganzen Akkord vor, sondern nur dessen **tiefsten Ton** – so liegt immer ein einzelner Ton in der Auswahl.
