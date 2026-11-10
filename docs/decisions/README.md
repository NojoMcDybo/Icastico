# Entscheidungen (ADRs)

Jede grundsätzliche Entscheidung bekommt eine Datei `NNNN-titel.md`.
Entscheidungen werden nicht gelöscht, sondern durch neue ersetzt („Ersetzt durch 00XX“).

## Vorlage

```markdown
# NNNN – Titel

- Status: vorgeschlagen | angenommen | ersetzt durch NNNN
- Datum: JJJJ-MM-TT

## Kontext
Welches Problem, welche Randbedingungen?

## Entscheidung
Was machen wir?

## Alternativen
Was haben wir verworfen und warum?

## Folgen
Was wird dadurch leichter, was schwerer?
```

## Liste

| Nr. | Titel | Status |
|---|---|---|
| 0001 | [Plattform: Tauri 2, TypeScript, Rust](0001-plattform-tauri.md) | angenommen |
| 0002 | [Notensatz über Verovio](0002-notensatz-verovio.md) | angenommen |
| 0003 | [Zeitstrahl-Modell statt Takt-Modell](0003-zeitstrahl-modell.md) | angenommen |
| 0004 | [Commands und Workspaces als Daten](0004-commands-workspaces.md) | angenommen (Umsetzung ab Schritt 1) |
| 0005 | [Lizenz GPL-3.0-or-later](0005-lizenz-gpl3.md) | angenommen |
| 0006 | [Noteneingabe nach Finale (Simple Entry)](0006-eingabe-nach-finale.md) | angenommen – Annahmen vom Owner zu prüfen |
| 0007 | [Dateiformat `.icastico` und Speichern](0007-dateiformat.md) | angenommen |
| 0008 | [Auftakt und globale Partitur-Einstellungen](0008-auftakt-und-einstellungen.md) | angenommen |
| 0009 | [Bibliothek: eigener Ordner, Sammlungen, automatisches Speichern](0009-bibliothek.md) | angenommen (Referenz: Owner-App Folio) |
| 0010 | [Installer, Desktop-Verknüpfung, automatische Updates](0010-updates.md) | angenommen |
| 0011 | [Bibliothek der Tastenbelegungen (Finale + Logic), Ziehen mit der Maus](0011-tastenbelegung-bibliothek.md) | angenommen |
| 0012 | [Jeder Ton hat eine dauerhafte Nummer (Ton-ID)](0012-ton-identitaet.md) | angenommen |
| 0013 | [Piano-Roll als zweite Ansicht derselben Töne](0013-piano-roll.md) | angenommen |
| 0014 | [Haltebögen und Gleiten als Verbindungen zwischen Tönen](0014-verbindungen.md) | angenommen |
| 0015 | [Wiedergabe mit eingebautem Klang und Tempo in der Partitur](0015-wiedergabe.md) | angenommen (Klang vorläufig) |
| 0016 | [Akkorde aus mehreren Wegen, Lautstärke-Linien und Gleitverläufe](0016-akkorde-und-verlaeufe.md) | angenommen |
| 0017 | [MusicXML importieren](0017-musicxml-import.md) | angenommen |
| 0018 | [Dritte Tastenbelegung „Finale-Ziffernblock“](0018-finale-ziffernblock.md) | angenommen |
| 0019 | [Liedtext und Akkordsymbole](0019-liedtext-und-akkordsymbole.md) | angenommen |
| 0020 | [Triolen, Quintolen, Septolen](0020-n-tolen.md) | angenommen |
| 0021 | [MusicXML exportieren](0021-musicxml-export.md) | angenommen |
| 0022 | [Gitarrentabulatur](0022-tabulatur.md) | angenommen |
| 0023 | [PDF, Notenblätter und Einzelstimmen](0023-pdf-und-einzelstimmen.md) | angenommen |
| 0024 | [Bibliothek der Sonderzeichen](0024-zeichen-bibliothek.md) | angenommen |
| 0025 | [Sprachtest: Vosk im Fenster](0025-sprachtest.md) | angenommen |
| 0026 | [Roll-Klaviatur, Synth-Klang, Gleiten in einen Ton, Rückmeldung](0026-roll-und-rueckmeldung.md) | angenommen |
| 0027 | [Bereiche, Transponieren, mehr Zeichen, Tabulatur, Export](0027-bereich-transponieren-zeichen.md) | angenommen |
| 0028 | [MIDI und Einzelstimmen-Aufnahmen importieren (Quantisierung)](0028-midi-und-aufnahmen-importieren.md) | angenommen |
| 0029 | [Liedtext-Feld, Bindebogen mit T, stille Vorschau-Note](0029-liedtext-feld-und-bindebogen.md) | angenommen |
| 0030 | [Tabulatur als Instrument, Oktave/Vorzeichen für die nächste Note, Metronom, Cycle, Zoom, Quantisieren, Drucken](0030-tabulatur-instrument-und-schlussfunktionen.md) | angenommen |
| 0031 | [Sprünge genau auf der Note; Takte pro Zeile](0031-sprunege-auf-noten-und-zeilenumbrueche.md) | angenommen |
| 0032 | [Tabulatur: Stimmung, Bund und Saite, Noten hineinziehen; Akkordtöne einzeln](0032-tabulatur-stimmung-bund-und-ziehen.md) | angenommen |
| 0033 | [Silben wählen und verschieben, Druckvorschau, TAB-Zeile mit Stimmung, durchgehende Taktstriche](0033-silben-druckvorschau-und-tabulatur-zeile.md) | angenommen |
| 0034 | [Startbild: Akkord als Sand auf der Platte](0034-startbild-chladni.md) | angenommen |
| 0035 | [Schutzregel für geladene Inhalte (CSP)](0035-schutzregel-csp.md) | angenommen |
