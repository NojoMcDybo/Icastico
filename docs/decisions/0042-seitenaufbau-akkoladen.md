# 0042 – Seitenaufbau: Takte pro Akkolade für markierte Takte, Akkoladen pro Seite

- Status: angenommen
- Datum: 2026-11-11

Wunsch aus der Rückmelderunde: Die Aufteilung der Partitur soll auch in der App-Anzeige einstellbar sein – Takte pro Zeile für die ganze Partitur
**und** für markierte Takte, außerdem die Zahl der **Akkoladen** pro Seite. In der Oberfläche heißt eine Notenzeile über alle Instrumente jetzt „Akkolade“
(vorher „Zeile“, das blieb für die Instrumentenzeilen).

## Was neu ist

- **Takte pro Akkolade für die markierten Takte** (Befehlspalette Strg+K: „Takte pro Akkolade für markierte Takte“): eine Zahl 1–16.
  Markiert ist der Bereich (Alt+Umschalt+Pfeile / Umschalt+Klick), sonst der Takt der gewählten Note. Vor den markierten Takten und danach beginnt eine neue Akkolade;
  alles andere bleibt, wie es gezeichnet ist.
- **Akkoladen pro Seite**: Partitur-Einstellungen und Drucken/PDF-Dialog (dort „wie in der Partitur“ / „so viele wie passen“ / 1–8). Gilt in der App-Anzeige
  (die Seiten werden getrennt gezeichnet) und im PDF.
- Beschriftungen in beiden Dialogen: „Takte pro Akkolade“.

## Umsetzung

- `ScoreLayout.systemsPerPage` (1–12, optional) – **Dateiformat 20 → 21**. Dateien der Version 20 öffnen sich unverändert (keine Vorgabe = so viele wie passen).
- Markierte Takte brauchen keine neue Datenform: `withBarsPerLine` (`src/core/templates.ts`) schreibt feste Zeilenanfänge (`layout.breaks`, wie beim MusicXML-Import,
  ADR 0031) und löscht dabei `perSystem`. Ist die Aufteilung noch automatisch, werden die Zeilenanfänge zuerst aus der Anzeige gelesen („einfrieren“) –
  so verschiebt sich außerhalb der markierten Takte nichts.
- Seitenumbrüche: `src/render/engraveScore.ts`. Stehen die Zeilen fest (Takte pro Zeile oder Umbrüche), kommt nach jeder n-ten Akkolade ein `<pb/>` in die MEI
  (`MeiOptions.pageBreaks`). Überlässt die Partitur die Zeilen dem Notensatz, wird **zweimal gezeichnet**: erst automatisch, um die Zeilenanfänge zu lesen
  (`systemStartsOf`, aus den Takt-Ids der Zeichnung), dann mit festen Zeilen und Seitenumbrüchen. Ohne die Einstellung bleibt es bei einem Durchgang.
- Verovio nimmt dann nur noch die geschriebenen Umbrüche (`breaks: 'encoded'`). Passen mehr Akkoladen auf eine Seite, als gewählt, bleibt der Rest der Seite frei.
  Eine Zahl, die für das Papierformat zu hoch ist, wurde nicht geprüft (vermutlich laufen die Akkoladen über den Rand); die Zahl wählt der Nutzer.

## Grenzen

- „Markierte Takte“ gelten für die Takte, in denen markierte Noten liegen (ganze Takte, nicht Teile davon). Eine Zahl, bei der alles in eine Akkolade passt,
  entspricht einer automatischen Aufteilung ohne feste Umbrüche.
- Kein Systemabstand, keine Kopf-/Fußzeile (Roadmap).
