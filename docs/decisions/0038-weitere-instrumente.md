# 0038 – Neun weitere Instrumente

- Status: angenommen
- Datum: 2026-11-11

Violine, Viola, Violoncello, Kontrabass, E-Bass, Querflöte, Blockflöte, Oboe und Fagott (Bauplan „Liederrunde“, Paket 3).
Instrumente sind Daten (Architekturregel 6): jedes ist ein Eintrag in `src/core/instruments.ts`.

## Modell und Datei

- Neues Feld `family` („Streicher“, „Holzbläser“, „Bass“); die vier ersten Instrumente (Gesang, Gitarre, Tabulatur, Klavier) haben keines.
- Klingende Tonhöhen bleiben die Regel. Oktavversetzte Instrumente zeigen das am Schlüssel, wie schon die Gitarre:
  Kontrabass und E-Bass **Bassschlüssel mit 8 darunter**, Blockflöte **Violinschlüssel mit 8 darüber**, Viola **Altschlüssel**.
  Transponierende Bläser (Klarinette, Horn …) sind nicht Teil dieser Runde.
- **Dateiformat 16 → 17**: Migration ohne Inhalt, Dateien der Version 16 öffnen sich unverändert (Test mit Datei mit Strophen aus Paket 1).

## Klang

- Jedes Instrument hat sein General-MIDI-Programm (40 Violine, 41 Viola, 42 Cello, 43 Kontrabass, 33 E-Bass, 73 Flöte, 74 Blockflöte, 68 Oboe, 70 Fagott).
- **MIDI-Kanäle**: Statt eines festen Kanals je Instrument bekommt jedes benutzte *Programm* einen von fünf gemeinsamen Kanälen
  (in der Reihenfolge des ersten Tons). Gitarre und Tabulatur teilen sich so von selbst einen Kanal. Die Rückmeldung beim Tippen
  hat Kanal 5 für sich, Gleiten und Lautstärkeverläufe die Kanäle 6–8 und 10–15.
- Grenze: mehr als fünf verschiedene Klänge in einem Stück – die überzähligen teilen sich den letzten gemeinsamen Kanal.
- Der einfache Not-Klang (`simpleSynth`) bekommt Klangfarben: Streicher und Bläser weich und haltend, Bässe gezupft.
- Der MIDI-Export verteilt seine Kanäle selbst und bleibt unverändert.

## Bedienung

- „Neue Partitur“ und „Partitur-Einstellungen“: die vier Grundinstrumente bleiben Knöpfe, alle anderen stehen in einem Auswahlfeld
  „+ Weiteres Instrument …“, nach Familie geordnet (`src/ui/instrumentPicker.ts`).
- Importdialog: das Instrumentenfeld ist nach Familie geordnet.
- Beim Import werden Namen und General-MIDI-Programme erkannt (`instrumentHint`). In einer MIDI-Datei ist eine Spur „Bass“ der E-Bass
  (früher Gitarre); in MusicXML bleibt „Bass“ allein ein Gesangsname.

## Grenzen

- Keine Instrumentenbereiche als Warnung beim Tippen (die Bereiche stehen nur als Daten da); keine Spielarten (pizzicato, Dämpfer).
