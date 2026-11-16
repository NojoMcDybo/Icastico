# 0048 – Notenschrift und Piano-Roll zeigen denselben Takt

- Status: angenommen
- Datum: 2026-11-16

Sind Notenschrift und Piano-Roll zugleich zu sehen, musste man bisher in beiden Ansichten getrennt suchen.

## Entscheidung

- **Gekoppelt wird über den Takt.** Verschiebt der Nutzer die Roll seitlich, steht am linken Rand eine Zeit (auf 1/64 gerundet); der Takt, der dort beginnt oder läuft
  (`measureIndexAt` in `src/ui/lanes.ts`), wird in der Notenschrift gezeigt. Verschiebt er die Notenschrift, zeigen alle offenen Rollen den ersten Takt der obersten
  sichtbaren Akkolade.
- **Kein Zittern**: Die Notenschrift folgt der Roll nur, wenn der Takt nicht zur Hälfte schon sichtbar ist (bei Takten, die höher sind als das Fenster, zählt das Fenster).
  Sonst wird der Takt in die Mitte gerückt (`scrollIntoView`). Die Roll folgt der Notenschrift immer auf den Taktanfang. Mehrere Rollen folgen einander.
- **Eigene Bewegungen melden nichts.** Bewegt das Programm eine Ansicht selbst (`PianoRoll.scrollToTime`, Abspielmarke, Note ins Bild holen, Notenschrift in die Mitte
  rücken), wird das Ereignis mit einem Merker (`quiet`, `quietCanvas`) verschluckt – sonst würden sich die Ansichten gegenseitig hin- und herschieben.
- **Ruhe** bei Wiedergabe (dort führt die Abspielmarke), bei einer Ziehgeste und wenn keine Notenschrift zu sehen ist.
- Kein Schalter zum Abstellen; erst bauen, wenn es stört.

## Grenzen

- Die Roll zeigt nur eine Stimmenzeile; ist ihre Zeitachse kürzer als die Partitur (ein Takt hinter ihrem Ende), bleibt sie am Ende stehen.
- Nicht im Browser-Test abgedeckt: Wiedergabe gleichzeitig mit Scrollen (dort ruht der Gleichlauf nach Entwurf).
