# 0017 – MusicXML importieren

- Status: angenommen
- Datum: 2026-11-04

## Kontext

Der Vater des Owners arbeitet mit Finale und muss vorhandene Dateien übernehmen
(siehe `docs/anforderungen-gitarre.md`). Finale kann MusicXML schreiben (`.musicxml`,
`.xml` und komprimiert `.mxl`); das ist der Weg dorthin. Finales eigene Formate
(`.mus`, `.musx`) werden nicht gelesen.

## Entscheidung

- **Eigener, kleiner XML-Leser** (`core/import/xml.ts`, ohne DOM): läuft in der App,
  im Test und überall. **Nur „partwise“-Partituren**; „timewise“ wird mit Meldung
  abgelehnt.
- **`.mxl`** (Zip) wird mit `fflate` entpackt (`core/import/container.ts`, Datei laut
  `META-INF/container.xml`, sonst die erste XML-Datei); UTF-16 wird erkannt.
- **Übernommen** (`core/import/musicxml.ts`): Instrumente, Notensysteme, Stimmen,
  Noten, Akkorde, Pausen (als Lücken), Haltebögen (als ausdrückliche Verbindungen,
  auch über Taktstriche), Tonart (Quinten), Taktart und Taktwechsel, Auftakt,
  Tempo (`<sound tempo>`), Titel, Komponist. Überlappen sich Noten einer Stimme,
  kommt die Überlappung in eine zusätzliche Stimme.
- **Instrumente:** zwei oder mehr Systeme = Klavier; Gitarre/Laute/… oder
  MIDI-Programm 25–32 = Gitarre; sonst Gesang (mit Hinweis, weil Icastico noch
  keine weiteren Instrumente kennt).
- **Klingende Tonhöhe:** `<transpose>` des Instruments wird angewendet; eine Gitarre
  ohne `<transpose>` gilt als „eine Oktave höher notiert“ und wird entsprechend
  tiefer übernommen.
- **N-Tolen:** Icastico kann sie noch nicht schreiben. Noten in Triolen usw. werden
  auf das 1/32-Raster **gerundet** (der Takt bleibt vollständig), mit Hinweis.
  Auch sonstige Zeiten außerhalb des 1/64-Rasters werden gerundet.
- **Nicht übernommen und gemeldet:** Vorschlagsnoten, Liedtext, Akkordsymbole,
  Schlagzeugnoten, Textanweisungen. Alles andere (Bögen, Dynamik, Artikulation,
  Tabulatur, Seitenlayout) wird stillschweigend nicht gelesen – das steht in der
  Roadmap.
- **Ergebnis:** eine **neue Partitur in der Bibliothek** (Datei bleibt unberührt).
  Aufruf: Strg+Umschalt+I oder „MusicXML importieren …“ unten in der Bibliothek.
  Ein Hinweisdialog listet, was nicht übernommen wurde. Eine kaputte Datei ergibt eine
  klare Meldung, nichts wird halb angelegt.
- **Desktop:** neuer Befehl `read_file_bytes` (Rust) liest Bytes; im Browser liefert
  der Dateidialog die Bytes.

## Folgen

- Das Ergebnis ist nur so gut wie der Export: mehrstimmige Klaviersätze und Gitarre
  mit Stimmen gehen, Verzierungen und Layout nicht.
- Stimmen werden unverändert nach (System, Stimmennummer) übernommen, auch mehr als
  vier pro System; Bearbeiten in der Roll begrenzt neue Stimmen weiter auf vier.
- Nicht gebaut: Export nach MusicXML, Import von `.musx`, Liedtext/Akkordsymbole
  (fehlen noch im Modell), echte N-Tolen.
