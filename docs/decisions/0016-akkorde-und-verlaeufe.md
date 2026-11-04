# 0016 – Akkorde aus mehreren Wegen, Lautstärke-Linien und Gleitverläufe

- Status: angenommen
- Datum: 2026-11-04

## Kontext

Akkorde gab es nur über Tasten (Umschalt + Buchstabe) und als Auswahl in der
Notenschrift. In der Piano-Roll war ein Balken auf einem anderen verboten
(„Dort liegt schon eine Note“). Außerdem hatten alle Töne dieselbe Lautstärke,
und ein Gleiten lief immer geradlinig.

## Entscheidung

### Akkorde und gleichzeitige Töne

- **Gleicher Anfang und gleiche Länge = Akkord** (ein Ereignis mit mehreren
  Tönen, wie bisher). Das gilt, wenn man in der Roll einen Balken genau auf
  einen anderen zieht oder zeichnet, und wenn man in der Notenschrift eine
  Note auf eine andere zieht (dann übernimmt sie Anfang und Länge der anderen,
  ihre Tonhöhe bleibt).
- **Alles andere, was sich überlappt, geht automatisch in eine weitere Stimme
  derselben Zeile** (höchstens vier, `MAX_VOICES`). Eine neue Stimme entsteht
  nur, wenn keine vorhandene Platz hat; eine leer gewordene zusätzliche Stimme
  verschwindet wieder. Nichts wird überschrieben (`placeTones` in
  `core/editor/rollEdits.ts`). Gleiche Tonhöhe im selben Akkord wird abgelehnt.
- **Roll: Alt + Ziehen** zeichnet eine neue Note auch dort, wo schon ein Balken
  liegt (ohne Alt greift man den Balken).
- **Notenschrift:** Beim Ziehen über eine andere Note ändert sich die Tonhöhe
  nicht (sonst läge der Ton genau auf dem Zielton); sonst bestimmt die Höhe
  des Zeigers die Tonhöhe wie bisher. Ein einzelner Akkordton, auf eine andere
  Note gezogen, verlässt seinen Akkord (`only` in der Änderung).
- **Akkordmodus** (Taste links neben der 1, in Logic und bei uns auch in der
  Finale-Belegung): Die nächsten Töne werden übereinander auf dieselbe Stelle
  gesetzt (jeder über dem vorigen), der Cursor bleibt stehen. Taste noch einmal,
  Pause, Esc oder ←/→ beenden ihn; mit der Taste rückt der Cursor hinter den
  Akkord. Zustand `input.chord` / `input.chordEvent`, die Anzeige nennt „Akkord“.
- Akkordnamen tippen („Cm7“) und ein Akkord-Menü sind **nicht** gebaut; der
  Owner hat den Akkordmodus gewählt.

### Lautstärke-Linie und Gleitverlauf

- **Ton** (`Tone`): optional `volume` (1–127, Standard 100 wird nicht
  gespeichert) und `curve` (Lautstärke über die Länge der Note, 0–1).
- **Gleit-Verbindung** (`Link`, nur `slide`): optional `curve` – der Weg durch die
  Lücke, 0 = erster Ton, 1 = zweiter Ton. **Derselbe Verlauf bestimmt Tonhöhe
  und Lautstärke** (Überblendung von der Endlautstärke des ersten zur
  Anfangslautstärke des zweiten Tons).
- **Eine Kurve** (`core/curve.ts`) ist eine glatte Linie durch 2–16 Punkte
  (x und y von 0 bis 1, x aufsteigend, erster Punkt bei 0, letzter bei 1; bei
  einem Gleitverlauf liegen die Enden bei y = 0 und y = 1). Die Linie läuft
  durch jeden Punkt und schwingt zwischen zwei Punkten nie über
  (monotone kubische Interpolation, Fritsch–Butland): Zieht man einen Punkt,
  folgt die ganze Linie weich. Gerade Linie = nichts gespeichert.
- **Bedienung in der Piano-Roll:** Klick auf einen Balken (ohne Ziehen) öffnet
  ein kleines Menü mit Lautstärke-Regler (mit Dynamikzeichen pp … ff) und der
  Linie; Klick auf eine Gleit-Linie öffnet das Menü für den Verlauf. In der
  Linie: auf die Linie klicken oder **Taste P** (an der Mausstelle) setzt einen
  Punkt, Ziehen formt die Linie, Doppelklick oder Entf entfernt einen Punkt,
  Voreinstellungen (Einblenden, Ausblenden, Ein & aus; Erst langsam, Erst
  schnell, S-Kurve). Das Menü nimmt der Notenschrift keine Tasten weg (es holt
  sich nie den Fokus); ein Ziehen ist ein Rückgängig-Schritt.
- **Dateiformat 6:** `vol` und `curve` ([x, y]-Paare) an Tönen, `curve` an
  Verbindungen. Version 5 wird unverändert übernommen und vor dem ersten
  Speichern gesichert; eine Datei von 0.9.0 wird mit Test geprüft.
- **Wiedergabe:** `SoundNote` bekommt `volume` (Anschlagstärke) und `gain`
  (Pegel 0–1 über die Zeit, linear zwischen den Punkten). Ein getrennter
  Haltebogen-Klang wird so laut angeschlagen wie sein lautester Teil, die
  leiseren Teile folgen relativ. Ein Klang mit Pegelverlauf bekommt wie ein
  Gleitklang einen eigenen MIDI-Kanal und folgt dem Pegel per Expression
  (CC 11, alle 10 ms ein Schritt, nur wenn sich der Wert ändert); der Kanal wird
  danach zurückgesetzt. Sind alle zwölf Kanäle belegt, klingen die übrigen
  gleichmäßig. Der einfache Ersatzklang hat dafür eine eigene Lautstärkestufe.

## Folgen

- Alle Bearbeitungen laufen über `applyRollEdit` (`shape`, `blend`, `change` mit
  `into`/`only`), sind rein und getestet.
- Mehr als vier gleichzeitige Stimmen auf einer Zeile gehen nicht; die Meldung
  sagt das.
- Haltebögen (`tie`) haben keine Kurve; ein Haltebogen über zwei Noten mit
  verschiedener Lautstärke springt an der Stelle.
- Die Pegelstufen laufen auf den 12 Gleitkanälen mit; sehr viele gleichzeitig
  geformte Töne klingen dann gleichmäßig statt falsch.
- Nicht gebaut: Anhören beim Einstellen, Lautstärke für mehrere Töne zugleich,
  Kurven für Haltebögen.
