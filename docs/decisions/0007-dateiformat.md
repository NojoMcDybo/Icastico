# 0007 – Dateiformat `.icastico` und Speichern

- Status: angenommen
- Datum: 2026-11-02

## Kontext

Partituren müssen gespeichert und wieder geöffnet werden. Das Format bleibt
über Jahre bestehen – Fehler hier kosten später Nutzerdaten.

## Entscheidung

**Format:** JSON mit Kopf `{"format": "icastico", "version": 1, "app": "…", "score": {…}}`.

- Lesbar: Zeiten als Brüche (`"3/8"`), Tonhöhen als Namen (`"F#4"`),
  **eine Note pro Zeile**. Eine Datei lässt sich im Texteditor lesen und mit
  Git vergleichen.
- Speichert genau das Modell (Zeitstrahl), keine abgeleitete Notation.
- **Versioniert:** Ältere Versionen werden beim Laden schrittweise
  hochgestuft (`migrate()` in `src/core/file/format.ts`). Dateien aus einer
  *neueren* Icastico-Version werden mit klarer Meldung abgelehnt statt
  halb gelesen.
- **Streng beim Laden:** Jede Unstimmigkeit (unbekannte Tonhöhe, unbekanntes
  Instrument, überlappende Noten …) führt zu einer deutschen Fehlermeldung;
  die offene Partitur bleibt unangetastet.

**Speichern** (Rust, `write_score_file`): erst in eine Zwischendatei neben dem
Ziel, auf die Platte gezwungen (`sync_all`), dann per Umbenennen ersetzt.
Ein Absturz oder Stromausfall beim Speichern zerstört nie die alte Datei.

**Ungespeicherte Änderungen** (gilt seit ADR 0009 nur noch für Dateien außerhalb der Bibliothek; Bibliotheks-Partituren speichern automatisch): Neu, Öffnen und Fenster-Schließen fragen nach
(Speichern / Nicht speichern / Abbrechen). „Ungespeichert“ heißt: Die
aktuelle Partitur ist nicht dieselbe wie die zuletzt gespeicherte – wer per
Rückgängig zum gespeicherten Stand zurückkehrt, hat keine Änderungen mehr.

**Dateizuordnung:** Installer registrieren `.icastico`; Doppelklick öffnet
die Datei (Windows/Linux: Programmargument, macOS: Systemereignis).

**Verlauf:** Öffnen und Neu beginnen einen frischen Rückgängig-Verlauf.

## Versionen

| Version | Icastico | Änderung |
|---|---|---|
| 1 | 0.2.0 | erstes Format |
| 2 | 0.3.0 | optionales Feld `pickup` (Auftakt, ADR 0008) |
| 3 | ab 0.7.0 | `tones` mit Ton-IDs statt `pitches` (ADR 0012); ältere Dateien werden beim Öffnen umgewandelt und vor dem ersten Speichern gesichert |
| 4 | ab 0.8.0 | optionale Liste `links` (Haltebögen und Gleiten zwischen Tönen, ADR 0014); Version 3 wird unverändert übernommen und vor dem ersten Speichern gesichert |

## Alternativen

- **MusicXML als Hauptformat:** Austauschstandard, aber taktbasiert – passt
  nicht zum Zeitstrahl-Modell (ADR 0003) und verliert Icastico-eigene
  Informationen. Kommt als Import/Export (Schritt 3).
- **Binärformat / ZIP:** kompakter, aber nicht lesbar und schwerer zu
  reparieren. Bei Bedarf (z. B. eingebettete Audioaufnahmen) später als
  Container mit dieser JSON-Datei darin.

## Folgen

- Format-Änderungen erfordern: Version erhöhen, Migration schreiben, Test mit
  einer Datei der alten Version.
- Im Browser (Entwicklung, Tests) heißt Speichern „Herunterladen“, Öffnen
  „Hochladen“ – die Desktop-App nutzt native Dialoge.
