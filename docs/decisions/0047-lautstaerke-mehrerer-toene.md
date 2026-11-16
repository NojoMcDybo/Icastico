# 0047 – Lautstärke mehrerer Töne zugleich, und jede Änderung ist zu hören

- Status: angenommen
- Datum: 2026-11-16

Bisher ließ sich die Lautstärke nur Ton für Ton im Menü der Piano-Roll einstellen, und der Regler dort blieb stumm.

## Entscheidung

- **Relativ, nicht absolut**: Strg+Alt+↑ / Strg+Alt+↓ stellt jeden Ton des markierten Bereichs (alle Stimmen der Zeile, wie beim Löschen) um 8 lauter oder leiser – eine halbe
  Dynamikstufe (die Stufen von `volumeMark` liegen 16 auseinander). Unterschiede zwischen den Tönen bleiben erhalten, bis einer an die Grenze 1 bzw. 127 stößt.
  Ohne Bereich wirkt es auf die gewählte Note, bei einem angeklickten Akkordton nur auf diesen.
- **Gespeichert wie bisher** als `Tone.volume`; bei 100 (Vorgabe) wird nichts geschrieben – das Dateiformat bleibt 23. Dynamikzeichen (pp, f …) bleiben unberührt.
- **Ein Schritt für Undo**: ein Befehl `edit.volume` (`changeVolume` in `src/core/editor/range.ts`).
- **Hören**: `audition(…, velocity?)` in Synth, Sampler und einfachem Klang. `auditionEdits` (Workstation) spielt die gewählte Note nun auch, wenn sich nur ihre Lautstärke
  geändert hat – mit dieser Lautstärke (bei einer ganzen Note die größte ihrer Töne). Bei reinen Lautstärke-Änderungen gilt eine Sperre von 150 ms (der Regler im Menü feuert bei
  jeder Bewegung), bei Tonhöhen weiter 40 ms. Damit klingt auch der Regler im Lautstärke-Menü der Piano-Roll.

## Grenzen

- Beim Anhören klingt nur die gewählte Note (bei einem Bereich: die erste), nicht der ganze Bereich.
- Taste und Befehl stehen in der Tastenbibliothek (`edit.volume`), in Finale- und Logic-Belegung gleich (`Strg+Alt+↑/↓`, Herkunft „icastico“).
