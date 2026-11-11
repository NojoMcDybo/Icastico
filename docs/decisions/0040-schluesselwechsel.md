# 0040 – Schlüsselwechsel ab einem Takt

- Status: angenommen
- Datum: 2026-11-11

Ab einem Takt steht eine Zeile in einem anderen Schlüssel; am ersten Takt gesetzt, ersetzt er den Anfangsschlüssel (Bauplan „Liederrunde“, Paket 5).
Die Tonhöhen ändern sich nicht (das Modell ist klingend, Architekturregel 3) – nur die Schreibweise.

## Schlüssel als Daten

- `CLEFS` / `CLEF_IDS` in `src/core/instruments.ts`: Violin-, Violin 8 darunter, Violin 8 darüber, Bass-, Bass 8 darunter, Alt- und Tenorschlüssel, je mit der klingenden
  Tonhöhe der mittleren Linie. Die Schlüssel der Instrumente (ADR 0038) stammen aus dieser einen Tabelle.
- `Part.clefs`: `{ at, staff, clef }`, je am Anfang eines Taktes, je Zeile aufsteigend; ein Eintrag bei 0 ersetzt den Schlüssel des Instruments.
  `clefAt(part, zeile, zeit)` liefert Schlüssel und Mitte der Zeile; `staffCenter` nimmt dafür die Zeit der Schreibmarke.
- Nicht für Tabulaturzeilen. `validateScore` prüft Zeile, Schlüssel, Reihenfolge und den Taktanfang.
- **Dateiformat 18 → 19**: optionales `clefs` je Part. Dateien der Version 18 öffnen sich unverändert.

## Bedienung

- Zeichen-Menü (Strg+J), Rubrik „Schlüssel“, Doppelklick – oder Befehlspalette (Strg+K), jeder Schlüssel einzeln. Gilt für die Zeile der gewählten Note
  bzw. der Schreibmarke, ab dem Anfang ihres Taktes.
- Derselbe Schlüssel noch einmal nimmt den Wechsel heraus; ein Wechsel, der nur den schon geltenden Schlüssel wiederholt, entfällt
  („Hier gilt schon dieser Schlüssel.“). Ein folgender Wechsel, der dadurch überflüssig wird, fällt mit weg.

## Notensatz, Export

- Verovio: der Anfangsschlüssel kommt aus `clefAt(…, 0)`; ein Wechsel steht als **letztes Kind der ersten Ebene im Takt davor** – das zeichnet den kleinen
  Schlüssel vor dem Taktstrich. (Ein `<staffDef>` allein zwischen den Takten wird ignoriert, ein `<scoreDef>` zeichnet den Schlüssel in voller Größe *nach* dem Taktstrich.)
- MusicXML: der erste Takt schreibt `clefAt(…, 0)`, jeder Takt mit Wechsel ein `<attributes>` mit dem neuen `<clef>`; der Import liest `sign`, `line` und
  `clef-octave-change` (unbekannte Kombination und Wechsel mitten im Takt werden gemeldet; die übliche Gitarren-Notation im Violinschlüssel gilt nicht als Wechsel).
- **Oktavlage in MusicXML**: Nur Gitarre und Tabulatur werden weiter eine Oktave höher notiert, als sie klingen (wie bisher). Kontrabass, E-Bass und Blockflöte
  stehen mit den klingenden Tonhöhen in der Datei und mit dem Schlüssel mit 8 – so kommen sie im Import mit denselben Tönen zurück.

## Grenzen

- Nur am Taktanfang, keine Warnung außerhalb des Instrumentenbereichs. Die Klaviertasten-Ansicht (Piano-Roll) zeigt die Zeile weiter mit dem Schlüssel des Instruments.
