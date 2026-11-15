# 0044 – Zwei Ebenen im Notensystem, Seitenaufbau-Fenster mit Seitenrändern, A4-Ansicht

- Status: angenommen
- Datum: 2026-11-15

Wünsche aus der Rückmelderunde: (1) Takte pro Akkolade „taktweise“ einstellen, in einem Fenster mit Bereich, Takten pro Akkolade und Akkoladen pro Seite;
(2) Noteneingabe in zwei Ebenen im selben Notensystem mit besonderen Regeln für gleiche Töne; (3) Seitenränder einstellbar, in der Partitur und in der
Druckvorschau; (4) bei der Noteneingabe eine A4-Ansicht; (5) Gitarren-Tabulatur soll in derselben Oktave klingen wie die Gitarren-Notation.

## Was neu ist

- **Seitenaufbau-Fenster** (Strg+Umschalt+A, auch Befehlspalette): Bereich („Ganzes Stück“ oder „Bestimmte Takte von … bis …“, vorbelegt mit den markierten Takten
  oder dem Takt der gewählten Note), Takte pro Akkolade (1–16; leer = unverändert; 0 = automatisch, nur fürs ganze Stück), Akkoladen pro Seite (1–12, leer = so viele wie passen)
  und die vier Seitenränder in Millimetern (0–40, vorbelegt mit 6). Ersetzt den kleinen Dialog „Takte pro Akkolade für markierte Takte“ aus ADR 0042 (Befehl `layout.page`).
- **Seitenränder**: Im Drucken-Fenster gibt es dazu „Seitenränder“ (wie in der Partitur, 0 … 25 mm, auf allen vier Seiten gleich) – nur für diesen Druck, mit sofortiger Vorschau.
- **Ebenen**: Strg+Umschalt+1 / Strg+Umschalt+2 setzen die Eingabe in Ebene 1 oder 2 des Notensystems, an derselben Zeitstelle. Ebene 2 wird beim ersten Mal angelegt.
  Das Eingabefeld oben nennt die Ebene („Ebene 2“). Ebene 1 = Hälse nach oben, Ebene 2 = Hälse nach unten.
- **Gleiche Töne in beiden Ebenen** (gleicher Beginn, gleiche Tonhöhen): ein gemeinsamer Notenkopf. Ist eine der beiden Noten eine Halbe oder Ganze, ist der Kopf hohl
  (die kürzere Note zeigt ihre Länge nur über den Hals, Fähnchen oder Balken); sonst gefüllt. Beide Hälse bleiben (oben für Ebene 1, unten für Ebene 2).
  Andere Töne auf demselben Schlag stehen übereinander wie bisher.
- **A4-Ansicht** (Strg+Umschalt+Y, bleibt gespeichert): die Seiten stehen im Verhältnis eines A4-Blatts, mit Seitenrändern und Akkoladen pro Seite wie beim Drucken.
  Anfangs standardmäßig aus – seit ADR 0045 standardmäßig an.

## Umsetzung

- **Dateiformat 22 → 23**: `layout.margins` (oben/unten/links/rechts, ganze Millimeter, 0–40). Dateien der Version 22 öffnen sich unverändert.
  `normalizeLayout` (`src/core/model.ts`) und `withLayoutChanges` (`src/core/templates.ts`) halten die Layout-Angaben an einer Stelle zusammen.
- Ränder: `Engraver.engrave` rechnet Millimeter in Verovio-Einheiten um (1 mm = 10 Einheiten bei 100 %, also `mm × 1000 / Maßstab`, höchstens 500 – Grenze von Verovio);
  ohne Angabe bleibt es bei den bisherigen 60 Einheiten.
- Ebenen: `src/core/editor/layerOps.ts` (`chooseLayer`, Befehl `input.layer`). Ebene 1/2 sind die erste und zweite Stimme des Notensystems (keine neue Datenform).
  Gemeinsame Köpfe entstehen erst beim Schreiben der MEI (`sharedHeads` in `src/render/mei.ts`): die Note, die ihren Kopf abgibt, bekommt `head.visible="false"`,
  beide `stem.dir`. Verovio selbst würde gleiche Töne in zwei Ebenen mit zwei versetzten Köpfen (hohl und gefüllt nebeneinander) zeichnen.
- A4-Ansicht: feste Seitenhöhe (Breite × 297/210) in `renderIfNeeded`; Verovio bricht dann nach Höhe auf neue Seiten um.

## Gitarre und Tabulatur (Wunsch 5)

Nachgeprüft: Notation (Violinschlüssel mit 8 darunter) und Tabulatur lesen dieselbe klingende Tonhöhe im Modell, die Wiedergabe spielt sie unverändert
(E4 = MIDI 64 = leere hohe Saite, in der Notation als E5 geschrieben). Ein Unterschied ließ sich **nicht** nachstellen; `src/core/playback.tab.test.ts` hält fest, dass beide gleich klingen.
Wo es dem Owner anders vorkommt, bitte die Datei und die Stelle nennen.

## Grenzen

- Gemeinsame Köpfe nur bei **gleichem Beginn und genau gleichen Tönen** (Akkord = alle Töne gleich). Teilweise gleiche Akkorde und Noten, die erst später beginnen, zeichnet Verovio wie bisher.
- Der gemeinsame Kopf gehört der Note, die ihn zeigt (Klick); die andere Note wählt man über ihren Hals.
- Nur Ebene 1 und 2 (zwei Ebenen); ein Dreiklang aus drei Stimmen ist nicht vorgesehen. Pausen werden in beiden Ebenen gezeichnet.
- A4-Ansicht und Drucken können im Zeilenumbruch geringfügig voneinander abweichen (andere Seitenbreite in Pixeln, andere Notengröße).
- Sehr große Ränder bei kleiner Notengröße werden auf Verovios Höchstwert begrenzt.
