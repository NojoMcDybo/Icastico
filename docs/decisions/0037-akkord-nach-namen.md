# 0037 – Akkord nach Namen eingeben

- Status: angenommen
- Datum: 2026-11-10

Strg+Umschalt+K öffnet ein kleines Fenster: „Cm7“ tippen, Enter – an der Schreibmarke stehen C–Es–G–B im gewählten Notenwert
(Bauplan „Liederrunde“, Paket 2).

## Schreibweise

- **International, wie bei den vorhandenen Akkordsymbolen:** Grundtöne `C D E F G A B`, Vorzeichen `#` und `b`. `H` wird als `B` gelesen.
  **`B` allein ist also das deutsche H, `Bb` das deutsche B.** Das Fenster zeigt deshalb sofort die Töne in deutschen Namen
  („B7 → H Dis Fis A“), damit niemand überrascht wird.
- 22 Akkordarten (Dur, Moll, dim, aug, sus2/sus4, 5, 6, m6, 7, maj7, m7, mmaj7, dim7, m7b5, 7sus4, add9, 9, maj9, m9, 7b9, 7#9) mit
  üblichen Schreibweisen (`M7`, `Δ`, `-7`, `ø` …); Groß und Klein zählen (`M7` ≠ `m7`). Ein `/` und ein Ton danach ergeben einen Basston („C/G“).
- Nicht erkannte Namen ändern nichts und sagen das in der Statuszeile.

## Wie die Noten entstehen

- **Enge Lage** ab dem Grundton, mit der richtigen Schreibweise (E7#9 → E Gis H D Fisis; über `transposeChromatic`). Der Grundton landet dort, wo eine
  getippte Note landen würde (vorhandene Oktavregel, Notenwert, Überschreiben / Einfügen, Triolen).
- **Umkehrung** (Fenster: Grundstellung bis 3. Umkehrung): die tiefsten Töne gehen je eine Oktave nach oben.
- **Basston:** der Ton in der Oktave unter dem tiefsten Akkordton; ist er schon Akkordton, wird dieser dafür weggelassen (C/G = G C E).
- Wahlweise steht das **Akkordsymbol** (normalisiert, „Cmaj7“) über den Noten; die Wahl wird gemerkt (`icastico.chordSymbolWithNotes`, vorgegeben: an).
- Alles ist **ein** Rückgängig-Schritt.

## Umsetzung

- Reine Logik in `core/chordNames.ts` (`parseChordName`, `chordPitches`, `CHORD_QUALITIES`) mit Tests; der Befehl `enterChordByName` in
  `core/editor/commands.ts` setzt den Grundton über die vorhandene Eingabe und ersetzt dann die Töne dieser einen Note.
- Fenster in `ui/chordDialog.ts`; Funktion `input.chordName` in der Tastenliste.

## Grenzen

- Griffe für die Gitarre werden **nicht** berechnet: die enge Lage kann auf der Gitarre unspielbar sein.
- Keine Akkordarten mit 11 oder 13, keine Klammer-Schreibweisen („C7(b9)“).
- Der Akkordname lässt sich nicht aus vorhandenen Noten erkennen (nur die andere Richtung).
