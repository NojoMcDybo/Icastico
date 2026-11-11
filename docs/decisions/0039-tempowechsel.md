# 0039 – Tempowechsel ab einem Takt

- Status: angenommen
- Datum: 2026-11-11

Ab einem Takt gilt ein anderes Tempo; Wiedergabe, Anzeige, Notenbild, MIDI- und MusicXML-Export folgen (Bauplan „Liederrunde“, Paket 4).

## Modell und Datei

- `Score.tempo` bleibt das **Anfangstempo**. Neu ist `Score.tempos`: die Wechsel danach (`{ at, bpm }`, aufsteigend, je am Anfang eines Taktes).
  Jede vorhandene Datei bleibt gültig.
- `tempoAt(score, zeit)`, `setTempoChange(score, zeit, bpm | null)` (ersetzt, entfernt, lässt einen Wechsel auf das Tempo, das schon gilt, weg;
  an der Zeit 0 ist es das Anfangstempo) und `withTempoAt(score, zeit, bpm)` (ändert das Tempo, das an dieser Stelle gilt, ohne einen neuen Wechsel anzulegen).
- `validateScore` prüft: ganzzahlig im Bereich 20–400, hinter dem Anfang, aufsteigend, jeder Wechsel auf einem Taktanfang.
- **Dateiformat 17 → 18**: optionales `tempos` (`[{ "at": "2", "bpm": 132 }]`, Zeit wie bei `keys`). Dateien der Version 17 öffnen sich unverändert.

## Wiedergabe

- `secondsOf` und `timeAt` rechnen stückweise (Abschnitte mit gleichem Tempo, je Partitur einmal berechnet). `wholeNotesAt` liefert die
  ungerundete Zeit für den MIDI-Export.
- Die abgerollte Partitur (Wiederholungen, ADR 0024) bekommt ihre **eigenen** Tempi: jedes Stück beginnt mit dem Tempo, das an seiner geschriebenen
  Stelle galt; Wechsel innerhalb werden um den Versatz verschoben. Die Sekunden der Wiedergabe gehören damit zur abgerollten Partitur
  (`workstation.ts` rechnet nicht mehr mit der geschriebenen).
- „rit.“, „accel.“, „a tempo“ bleiben reine Schrift ohne Wirkung auf die Wiedergabe.

## Bedienung

- **Tempowechsel ab diesem Takt** (`tempo.change`): Befehlspalette (Strg+K) oder Zeichen-Menü (Strg+J) → Tempo-Anweisungen → „♩ = …“.
  Das Fenster nennt den Takt der Auswahl, nimmt Viertel pro Minute (20–400); leer lassen entfernt einen vorhandenen Wechsel. Im ersten Takt setzt
  es das Anfangstempo.
- Ziehen, Mausrad und Eintippen in der Tempo-Zelle oben ändern das Tempo, das **an der angezeigten Stelle** gilt – es entsteht dadurch nie ein neuer Wechsel.

## Notensatz, Export

- Gedruckt wird „♩ = 132“ (reiner Text; das SMuFL-Symbol zeichnet viel zu groß) über der obersten Zeile an jedem Wechsel. Das Anfangstempo wird nur
  gedruckt, wenn das Stück mindestens einen Wechsel hat – alle vorhandenen Partituren sehen unverändert aus.
- MIDI: ein Tempo-Ereignis je Wechsel der abgerollten Partitur. Die Ticks zählen musikalische Zeit und bleiben gleich.
- MusicXML: dieselbe `<direction>` wie am Anfang auch an jedem Wechsel; der Import macht jedes weitere Tempo **am Taktanfang** zum Wechsel,
  mitten im Takt meldet er „Tempowechsel mitten im Takt“. MIDI-Import bleibt bei einem Tempo.

## Grenzen

- Nur am Taktanfang; keine stufenlosen Übergänge (ritardando als Verlauf) und keine anderen Notenwerte als Viertel in der Angabe.
