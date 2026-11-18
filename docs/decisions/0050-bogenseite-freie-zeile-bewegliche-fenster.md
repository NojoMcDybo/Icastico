# 0050 – Seite der Bögen bei mehreren Ebenen, freie Zeile unter dem Komponisten, bewegliche Fenster

- Status: angenommen
- Datum: 2026-11-17

## Bögen (Bindebogen und Haltebogen) bei mehreren Ebenen

Recherche (Notensatz-Regeln nach Gould, „Behind Bars“, und Verhalten von Verovio): Bei **einer** Stimme in der Zeile steht der Bogen auf der Kopfseite, also **gegenüber den Hälsen**
(Hälse oben → Bogen unten). Das macht Verovio schon richtig; wir haben es mit Hals oben, Hals unten, gemischten Hälsen, Achteln mit Balken und Haltebögen nachgeprüft.
Bei **zwei Ebenen** in einer Zeile gilt: Solange beide Stimmen klingen, geht die **obere Stimme nach oben, die untere nach unten** – der Raum zwischen den Stimmen bleibt frei.
Verovio setzt das nur an den Hälsen fest (Ebene 1 Hälse oben, Ebene 2 unten) und kennt nicht, ob die andere Ebene gerade etwas spielt.

### Entscheidung

- In einer Zeile mit mehreren Ebenen schreibt `src/render/mei.ts` (`curveDir`) bei jedem Binde- und Haltebogen die Seite ausdrücklich ins MEI (`curvedir`):
  - klingt während des Bogens eine andere Ebene, geht Ebene 1 nach oben, jede weitere nach unten;
  - ist die Ebene allein, geht der Bogen **gegen die Hälse** (Ebene 1: unten, Ebene 2: oben; ein von Hand gesetzter Hals gilt).
- Bei nur einer Ebene wird nichts geschrieben (Verovios Wahl stimmt).
- Haltebögen, die ein Taktstrich teilt (`tie`-Attribut an den Noten), haben keine eigene Seitenangabe und bleiben bei Verovio.

### Grenzen

- Gemischte Hälse in einer Ebene (Melodie quert die Mittellinie): der Bogen geht wie bisher nach oben. Eine Bogenseite von Hand je Bogen gibt es noch nicht (würde das
  Dateiformat um ein Zeichen erweitern).

## Freie Zeile unter dem Komponisten

- `Score.freeLine` (optional), Eingabe im Fenster „Partitur-Einstellungen“ und „Neue Partitur“ als „Freie Zeile“ (z. B. „Text: … · Satz: …“).
- Gedruckt rechtsbündig, so klein wie der Komponist, direkt unter ihm (auch ohne Komponisten), danach die Leerzeile vor der ersten Akkolade (ADR 0045); auf der ersten Seite,
  in PDF und Vorschaubildern.
- **Dateiformat 24** (`freeLine`); Version 23 wird unverändert übernommen (ADR 0007), Test mit Datei der Version 23.
- MusicXML-Export und -Import kennen die Zeile noch nicht.

## Bewegliche Fenster

- Jedes Fenster (`.modal__box`) lässt sich an seiner Überschrift ziehen (`src/ui/movableDialogs.ts`, ein Beobachter für alle Fenster, einmal in `main.ts` eingeschaltet).
  Das Fenster bleibt ganz im sichtbaren Bereich; die Position gilt nur, solange das Fenster offen ist.
