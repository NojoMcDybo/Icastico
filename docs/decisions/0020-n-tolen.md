# 0020 – Triolen, Quintolen, Septolen

- Status: angenommen
- Datum: 2026-11-04

## Kontext

Das Modell kennt beliebige Brüche; die Notenschrift konnte bisher nur Zweierpotenzen schreiben und hat
N-Tolen abgelehnt (der MusicXML-Import hat sie gerundet).

## Entscheidung

- Eine Länge ist eine **N-Tole**, wenn sie nach dem Umrechnen mit 3:2, 5:4 oder 7:4 eine Zweierpotenz
  (mit Punkten) ergibt: eine Achteltriole (1/12) wird als Achtel (1/8) geschrieben. Die Länge im Modell
  bleibt der exakte Bruch (nichts wird gerundet).
- **Gruppen werden abgeleitet** (Architekturregel 2): benachbarte Noten und Pausen mit demselben
  Verhältnis bilden eine Gruppe, bis ihre echten Längen eine Zweierpotenz ergeben (drei Achteltriolen =
  ein Viertel). MEI bekommt `<tuplet num numbase>`; Balken laufen nie über die Klammer hinaus.
- **Eingabe:** Modus „Triolen“ (Logic: `9`; Finale/Ziffernblock: `Alt+9` Triolen, `Alt+8` Quintolen,
  `Alt+0` Septolen), dieselbe Taste noch einmal schaltet aus. Die nächsten Noten haben die verkürzte Länge.
- **MusicXML:** Import behält unterstützte Verhältnisse; was nicht schreibbar ist (z. B. 11:8), wird auf
  1/64 gerundet und gemeldet. Export schreibt `<time-modification>` und `<tuplet>`.
- Klang und Dateiformat brauchen keine Änderung (Brüche).

## Folgen

- Piano-Roll-Zeichnen und Verschieben bleiben auf dem Zweierraster; N-Tolen entstehen über die Tastatur
  oder den Import und lassen sich in der Roll nicht verschieben.
- Verschachtelte Tolen, Triolen mit Klammer über Taktstriche und Verhältnisse wie 9:8 sind nicht vorgesehen.
- Punktieren einer N-Tole geht nicht (Meldung).
