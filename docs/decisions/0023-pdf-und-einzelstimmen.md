# 0023 – PDF, Notenblätter und Einzelstimmen

- Status: angenommen
- Datum: 2026-11-04

## Entscheidung

- **PDF** (Strg+P): Verovio setzt A4-Seiten (hoch oder quer, Notengröße klein/mittel/groß); jede Seite
  wird auf eine Leinwand gezeichnet (300 dpi), als JPEG gespeichert und von `core/export/pdf.ts` in eine
  gültige PDF-1.4-Datei gelegt. Keine neue Abhängigkeit, überall dieselbe Ausgabe (Windows, Mac,
  Browser), gleiche Seite wie am Bildschirm. Nachteil: Text und Noten sind Bild (nicht auswählbar).
- **Notenblatt aus mehreren Partituren:** In der Bibliothek speichert „Als PDF speichern …“ alle
  Partituren der Ansicht (alle oder eine Sammlung); mit „Mehrere pro Seite“ stehen kurze Partituren
  untereinander auf gemeinsamen Seiten – für Unterrichtsmaterial mit mehreren Notenbeispielen.
- **Einzelstimme** (Strg+Umschalt+X): ein Instrument der Partitur wird als neue Partitur in der Bibliothek
  angelegt (`core/extract.ts`: Titel „… – Instrument“; Taktart, Tonart, Tempo und Akkordsymbole bleiben).
- Die letzte Seitenwahl wird gemerkt.

## Folgen

- Kein eigenes Seitenlayout (Systemabstände, Seitenumbrüche von Hand, Kopf- und Fußzeilen); Verovio
  entscheidet. Titelbilder und freie Textfelder fehlen.
- Eine Einzelstimme ist eine Kopie: spätere Änderungen an der Gesamtpartitur wandern nicht mit.
