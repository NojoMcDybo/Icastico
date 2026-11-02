# 0009 – Bibliothek: eigener Ordner, Sammlungen, automatisches Speichern

- Status: angenommen
- Datum: 2026-11-02

## Kontext

Der Owner möchte, dass Icastico selbst einen Ordner anlegt, dort speichert
und die Projekte über ein Menü zugänglich macht. Referenz: „Folio“.

**Annahme:** gemeint ist die Open-Source-Notiz-App *Folio* (GNOME, Nachfolger
von „Paper“): Notizbücher = Ordner, Notizen = Dateien, farbige Notizbuch-
Kacheln mit Initialen, Notizliste, Papierkorb, automatisches Speichern. Die
Referenz-Seiten waren aus der Arbeitsumgebung nicht abrufbar; das Design
beruht auf diesem Wissensstand und ist vom Owner zu bestätigen.

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
- **Bibliothek als Menü** (Strg+O / Knopf oben links): Sammlungen links,
  Partituren rechts (Titel, Instrumente, Tonart, Takt, „vor 5 Min.“), Suche,
  Tastatur (tippen, ↑/↓, Enter, Esc), Aktionen pro Partitur (Duplizieren,
  Verschieben, Papierkorb), Sammlung anlegen/umbenennen/löschen (nur leer).
- **Start:** zuletzt bearbeitete Partitur, sonst die neueste.
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
