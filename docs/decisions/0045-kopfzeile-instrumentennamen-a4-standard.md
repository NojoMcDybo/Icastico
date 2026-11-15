# 0045 – Titel und Komponist über der Partitur, Instrumentennamen nur am Anfang, A4-Ansicht als Standard

- Status: angenommen
- Datum: 2026-11-15

Rückmeldung nach 0.28.0: „Bei der Noteneingabe wird eine DinA4-Ansicht gezeigt“ (also nicht erst auf Knopfdruck), der Komponist steht rechtsbündig mit dem
Notensystem eine Zeile unter dem Titel und kleiner als dieser, die Instrumente stehen nur links neben der ersten Akkolade.

## Was neu ist

- **A4-Ansicht ist jetzt der Standard** (ADR 0044 hatte sie zuschaltbar gelassen). Strg+Umschalt+Y schaltet sie weiterhin aus; die Wahl bleibt gespeichert.
- **Kopfzeile**: Titel mittig und groß, der Komponist darunter, rechtsbündig und kleiner. Das gilt für die Anzeige, das Drucken/PDF und die Vorschaubilder; nur auf der ersten Seite.
- **Instrumentennamen** stehen nur vor der ersten Akkolade, nicht vor den folgenden (ohne Kurzname zeichnet Verovio dort nichts).

## Umsetzung

- `src/render/mei.ts`: schreibt ein `<pgHead func="first">` mit zwei `<rend>` (Titel `halign="center" fontsize="x-large"`, Komponist `halign="right" fontsize="small"`);
  die `labelAbbr`-Kurznamen entfallen. `src/render/verovio.ts`: Option `header` ist `encoded`, wenn ein `pgHead` vorhanden ist, sonst `none`.
  Die bisherige Automatik (`header: auto`) zeichnete nur den Titel, nie den Komponisten.
- Verovio zeichnet ein `pgHead` nur mit `func="first"` oder `func="all"`; ohne `func` bleibt es unsichtbar. `<lb/>` im `pgHead` wird ignoriert, ein `<rend>` ohne `valign`
  rutscht von selbst in die Zeile darunter. `fontsize="medium"` kennt Verovio nicht, deshalb `small`.
- `src/ui/preferences.ts`: `loadA4` ist an, solange nicht „0“ gespeichert ist. Der Ende-zu-Ende-Test setzt „0“, damit seine älteren Prüfungen die flache Ansicht behalten.

## Folgen

- Die Instrumentenkurznamen (`shortName` in `instruments.ts`) werden von der Darstellung nicht mehr gebraucht; sie bleiben als Daten stehen.
- Der Platz für den Titel kommt vom Notensatz selbst; die erste Seite hat dadurch eine Akkolade weniger Platz als die folgenden.
