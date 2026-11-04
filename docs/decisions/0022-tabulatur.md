# 0022 – Gitarrentabulatur

- Status: angenommen
- Datum: 2026-11-04

## Entscheidung

- **Pro Gitarren-Instrument ein Schalter** (`Part.tab`, Dateiformat 7): Strg+T schaltet unter der
  Gitarrenzeile eine Tabulaturzeile (6 Linien) ein oder aus.
- **Griffe werden berechnet** (`core/tab.ts`), nicht gespeichert: Standardstimmung E A d g h e, die Hand
  bleibt nahe ihrer letzten Lage, Akkordtöne liegen auf verschiedenen Saiten innerhalb einer Handspanne,
  leere Saiten sind günstig. Töne außerhalb des Gitarrenumfangs bekommen keine Zahl.
- **Darstellung:** Verovios eigener Tabulatur-Modus platziert Noten nach Tonhöhe, nicht nach Saite. Darum
  wird die Zeile als gewöhnliche Sechs-Linien-Zeile mit Noten auf den Saitenlinien gesetzt (`loc`), und
  `render/tab.ts` ersetzt jeden Notenkopf durch die Bundzahl auf weißem Grund. Hälse und Balken zeigen
  den Rhythmus wie im Druck. Die Zeile heißt „Tab“.
- Die Tab-Zeile gehört nicht zum Modell: sie ist weder auswählbar noch ein eigenes System (`staffs`).

## Folgen

- Keine Spielanweisungen (Bendings, Hammer-ons …), keine anderen Stimmungen/Kapodaster, kein
  Fingersatz zum Einstellen; die Berechnung kann ein anderer Griff sein als der des Gitarristen.
- Die Taktart steht auch auf der Tab-Zeile (Verovio blendet sie dort nicht aus).
- Nur Notenschrift und PDF; ins MusicXML geht die Tabulatur nicht.
