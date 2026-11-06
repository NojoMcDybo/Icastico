# 0028 – MIDI und Einzelstimmen-Aufnahmen importieren (Quantisierung)

- Status: angenommen
- Datum: 2026-11-06

## Entscheidung

Aus Logic (oder jedem anderen Programm) kommen zwei Dinge hinein: eine **MIDI-Datei** (Spuren mit gespielten Noten) und
eine **Aufnahme einer einzelnen Stimme** (WAV, AIFF, MP3, M4A …). Beide laufen durch denselben Baustein, die
**Quantisierung**: gespielte, leicht ungleichmäßige Zeiten werden zu exakten Notenwerten. Der Weg ist in der Bibliothek
„⋯ → Importieren …“ (Strg+Umschalt+I); Dateien werden an ihren ersten Bytes erkannt (MIDI, WAV/AIFF), sonst am Namen.

- **Quantisierer** (`core/import/quantize.ts`): Zeiten in Vierteln als Kommazahl → `Fraction`. Raster wählbar (Achtel,
  Sechzehntel, 32tel). Jeder Schlag (Viertel) wird einzeln geprüft: liegen seine Notenanfänge deutlich besser auf Triolen-
  als auf Rasterstellen, wird er als **Triole** geschrieben (Achtel-Triolen; bei 32tel auch Sechzehntel-Triolen). Notenenden
  werden etwas großzügig aufgerundet (Noten werden meist leicht zu kurz gespielt – das soll keine Pausen machen); eine Länge,
  die sich nicht schreiben lässt, fällt auf das Raster des Anfangs oder das binäre Raster zurück. Töne, die zusammen
  anfangen (und etwa gleich lang sind), werden ein Akkord.
- **Stimmen**: Gesang = eine Linie (Überlappungen werden am nächsten Ton abgeschnitten); Gitarre und Klavier bekommen
  zusätzliche Stimmen, wo sich Noten wirklich überlappen (kleine Überlappungen bis eine Rasterstelle werden gekürzt).
  Das Klavier wird beim eingestrichenen C (MIDI 60) in rechte und linke Hand geteilt – eine einfache Handtrennung.
- **Tonart** (`core/import/key.ts`): aus der Datei, sonst geschätzt (Krumhansl–Schmuckler über die Tonhöhen-Häufigkeit);
  Moll gibt die Vorzeichen der Paralleltonart. Töne werden für die Tonart geschrieben (`spellMidi`). Bei Arpeggien und
  Dreiklängen sind Dur und Quintverwandte nicht eindeutig – darum ist die Tonart im Fenster wählbar.
- **MIDI-Leser** (`core/import/midi.ts`): Format 0/1/2 mit Takt-Auflösung (SMPTE wird abgelehnt), Running Status, Tempo,
  Taktart, Tonart, Spurnamen, Programmwechsel. Spuren mit mehreren Kanälen werden getrennt; der Schlagzeugkanal wird
  ausgelassen (es gibt noch kein Schlagzeug). Von mehreren Tempi gilt das erste, von mehreren Taktarten die, die auf einer
  Taktgrenze liegen; was nicht passt, steht als Hinweis nach dem Import. Das Instrument wird aus Spurname und Programm
  geraten (Gitarre / Klavier / Gesang), im Fenster änderbar. Anschlagstärke wird als Lautstärke übernommen.
- **Aufnahmen** (`core/import/wav.ts`, `pitch.ts`, `audio.ts`): WAV (8/16/24/32 Bit, Float) und AIFF liest das Programm
  selbst; MP3/M4A/FLAC/OGG gehen über den Audio-Dekoder des Systems (`platform/audio.ts`). Die Tonhöhe alle 10 ms
  findet das **YIN-Verfahren** (Selbstvergleich mit verzögerter Kopie) bei ca. 11 kHz; daraus werden Noten geschnitten:
  Halbton runden (nach Abzug einer gleichbleibenden Verstimmung), Vibrato glätten, kurze Ausreißer (< 50 ms) und
  Rauschen weglassen, Einbruch der Lautstärke mitten im Ton = neuer Anschlag. Das Tempo wird aus den Notenanfängen
  **geschätzt** (halbes / doppeltes Tempo passen gleich gut, die Wahl neigt zur Mitte um 100) und ist im Fenster
  änderbar – am besten trägt man das Projekttempo aus Logic ein. Die Aufnahme beginnt als Takt 1, Schlag 1.
  Auswertung in Stücken mit Pausen für die Oberfläche; länger als 10 Minuten wird abgeschnitten.
- Das Dateiformat ändert sich nicht (Ergebnis ist eine gewöhnliche Partitur).

## Warum so

- **Ein Quantisierer für alles**: Logic-MIDI, später MIDI-Keyboard in Echtzeit und Aufnahmen brauchen dieselbe Rundung
  (Gesamtplan P6/P7/P9). Hier ist er an einer reproduzierbaren Quelle (MIDI-Datei) und einer unsicheren (Audio) geprüft.
- **YIN statt eines neuronalen Netzes**: kommt ohne Modelldatei aus (kein Download, läuft in Windows, Mac und Browser),
  ist für eine einzelne Stimme ausreichend genau und mit künstlichen Tönen exakt testbar. Ein Netz (CREPE/pYIN-Familie)
  wäre nur für schwierige Aufnahmen (Rauschen, Hall, mehrere Stimmen) besser – das bleibt eine Option, wenn YIN nicht reicht.
- **Dialog vor dem Import statt automatisch**: Logic-Exporte sehen verschieden aus (Spuren, Tempo, Taktart); die wenigen
  Fragen – Spuren, Instrument, Taktart, Tempo, Tonart, Raster, Triolen – sind klar und schnell beantwortet.

## Grenzen (bewusst)

- Aufnahmen: nur **eine Stimme** auf einmal; Akkorde, Hall, Chor und Rauschen liefern falsche oder keine Töne. Es gibt noch
  **keine Korrekturansicht** (Gesamtplan P9); korrigiert wird in der Partitur. Lautstärke der Aufnahme wird nicht übernommen.
- Tempowechsel im Stück werden nicht nachgebildet; die Aufnahme muss in gleichmäßigem Tempo gespielt sein (am besten zum Klick).
- Ein Auftakt wird nicht erkannt (alles beginnt auf Takt 1, Schlag 1); Haltebögen zwischen Takten entstehen aus der Länge.
- Quintolen/Septolen werden nicht erkannt, nur Triolen. Verzierungen, Pedal und Bögen kommen nicht aus MIDI.
- Die Handtrennung beim Klavier ist ein fester Schnitt bei c¹, keine musikalische Analyse.
- Mac und Desktop-App sind nicht getestet (Tests laufen im Browser und mit künstlichen Dateien).

## Tests

- `quantize.test.ts`: Wackeln um Achtel, Sechzehntel dürfen keine Triolen werden, Triolen werden erkannt, zu kurz gespielte
  Noten machen keine Pausen, echte Pause bleibt; Akkorde, Stimmen, Klavier-Hände, Schreibweise, Tonartschätzung.
- `midi.test.ts`: Aufbau von Dateien von Hand (Running Status, Format 0 mit Kanälen, abgeschnitten, SMPTE) und
  Rundlauf mit unserem eigenen MIDI-Export (`exportMidi`).
- `audio.test.ts`: künstliche Stimmen (Obertöne, Vibrato, Verstimmung, 16–48 kHz, Wiederholungen, Stille, Rauschen, Klick),
  Temposchätzung, WAV/AIFF-Leser, ganzer Weg Aufnahme → Partitur.
- Ende-zu-Ende: MIDI-Datei und WAV-Datei über „Importieren …“, kaputte Datei mit klarer Meldung.
