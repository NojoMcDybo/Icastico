# 0009 – Bibliothek: eigener Ordner, Sammlungen, automatisches Speichern

- Status: angenommen
- Datum: 2026-11-02

## Kontext

Der Owner möchte, dass Icastico selbst einen Ordner anlegt, dort speichert
und die Projekte über ein Menü zugänglich macht. Referenz: „Folio“.

**Referenz (bestätigt):** Folio ist die eigene App des Owners, ein PDF-Reader
für Windows ([NojoMcDybo/folio](https://github.com/NojoMcDybo/folio), dort
`DESIGN.md`). Eine erste Fassung (v0.4.0) folgte irrtümlich der GNOME-App
gleichen Namens und wurde in v0.6.0 ersetzt.

## Entscheidung

- **Ordner:** `Dokumente/Icastico` (Windows: `C:\Users\…\Documents\Icastico`,
  macOS: `~/Documents/Icastico`), angelegt beim ersten Start. Dort landet
  „Erste Skizze“ als Beispiel.
- **Sammlungen** = Unterordner. **Papierkorb** = Unterordner `Papierkorb`;
  die Herkunft gelöschter Partituren steht in `Papierkorb/.herkunft.json`,
  damit „Wiederherstellen“ sie in ihre Sammlung zurückbringt.
- **Dateiname folgt dem Titel**, Windows-sicher, ohne Doppelte
  („Lied 2.icastico“). Titeländerung → Datei wird beim Speichern umbenannt.
- **Automatisches Speichern** von Bibliotheks-Partituren eine Sekunde nach
  der letzten Änderung, außerdem vor jedem Wechsel und beim Schließen – keine
  Nachfrage mehr. Strg+S speichert sofort. Dateien *außerhalb* der Bibliothek
  (Strg+Umschalt+O) verhalten sich wie bisher (Nachfrage, ADR 0007).
- **Bibliothek als Startbildschirm, wie in Folio** (beim Start, Strg+O,
  runder Knopf oben links): großer Titel, darunter Kachelraster. Jede Kachel
  zeigt die **erste Notenseite** (von Verovio gesetzt, als Bild), Titel und
  Kurzinfo. Erste Kachel „+ Neue Partitur“. Runder „⋯“-Knopf und Rechtsklick
  pro Kachel; Menüeinträge mit Erklärzeile, Papierkorb in Rot. Sammlungen
  (gibt es in Folio nicht) als Pillen unter dem Titel; Papierkorb als Pille
  rechts; Suche rechts. Tastatur: tippen = suchen, Pfeile durchs Raster,
  Enter öffnet, Esc zurück zur Partitur.
- **Start:** Bibliothek; die zuletzt bearbeitete Partitur ist dahinter schon
  geöffnet (Esc). Ohne offene Partitur bleibt die Bibliothek stehen.
- **Design-Sprache von Folio für die ganze App:** Anthrazit (`#202020`
  Leser, `#1c1c1e` Bibliothek), Schrift Segoe UI Variable, `#f5f5f7` /
  `#a1a1a6`, Akzent `#75b8ff` nur für Auswahl und Fokus (auf weißem
  Notenpapier dunkleres `#0b6bd6` für Kontrast), runde 40-px-Knöpfe, Drücken
  = 93 %, Federkurven, `prefers-reduced-motion`. Werte in `src/styles.css`.
- **Bewusst noch nicht übernommen:** rahmenloses Fenster mit schwebenden
  Glas-Bedienelementen (WebGL) – eigener Schritt, mit Owner abzustimmen.
- **Sicherheit:** Rust-Befehle zum Anlegen/Umbenennen/Löschen prüfen jeden
  Pfad und arbeiten *nur innerhalb* des Bibliotheksordners. Umbenennen
  überschreibt nie (unter Windows würde `rename` sonst stillschweigend
  ersetzen). Endgültig gelöscht wird nur aus dem Papierkorb, mit Rückfrage.

## Alternativen

- **Nur Datei-Dialoge** (bisher): flexibel, aber jedes Mal Ordner suchen –
  widerspricht „schnell und simpel“.
- **Datenbank statt Ordner:** schneller bei sehr vielen Partituren, aber die
  Dateien wären im Explorer nicht mehr sichtbar, Datensicherung schwieriger.

## Folgen

- Partituren sind normale Dateien in einem normalen Ordner: Backup, Cloud-
  Ordner, Weitergeben funktionieren mit Bordmitteln.
- Beim Öffnen der Bibliothek werden alle Dateien gelesen. Bei Tausenden
  Partituren wird ein Zwischenspeicher nötig.
- Wer Dateien im Explorer umbenennt, sieht das beim nächsten Öffnen der
  Bibliothek; die geöffnete Partitur bemerkt es erst beim Speichern.
