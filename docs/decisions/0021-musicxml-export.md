# 0021 – MusicXML exportieren

- Status: angenommen
- Datum: 2026-11-04

## Entscheidung

- `core/export/musicxml.ts` schreibt **score-partwise 3.1** (`.musicxml`), Strg+Umschalt+E.
- Geschrieben wird aus der **Notenschrift-Ebene**, nicht aus der Roh-Zeitleiste: Takte, an Taktstrichen
  geteilte und gebundene Noten, Pausen, Ganztaktpausen und N-Tolen sind schon abgeleitet.
- **Enthalten:** Instrumente und Systeme, Stimmen (mit `<backup>`), Noten, Akkorde, Haltebögen (auch
  ausdrückliche), Tonart, Taktart(-wechsel), Auftakt, Tempo, Titel, Komponist, Liedtext, Akkordsymbole.
  Eine Gitarre wird, wie üblich, eine Oktave höher notiert geschrieben (der Import liest das zurück).
- **Nicht enthalten, aber gemeldet:** Gleiten, Gleit-Verläufe, Lautstärke und Lautstärkelinien, Tabulatur.
- **Probe:** Test „Hin und zurück“ – exportieren, wieder importieren, dieselbe Musik. Eine Note, die über
  einen Taktstrich reicht, kommt als zwei gebundene Noten zurück (MusicXML kann nichts anderes).
- Plattform: `Platform.exportFile` (Speichern-Dialog; im Browser ein Download); Rust: `write_file_bytes`
  (atomar wie die Partitur).

## Folgen

- Finales eigenes Format (`.musx`) wird weiter nicht gelesen: es ist ein verschlüsseltes, undokumentiertes
  Binärformat. Der Weg bleibt MusicXML-Export aus Finale.
- Komprimiertes `.mxl` schreiben wir nicht (nur lesen).
