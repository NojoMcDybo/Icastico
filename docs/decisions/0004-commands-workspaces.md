# 0004 – Commands und Workspaces als Daten

- Status: angenommen (Umsetzung ab Schritt 1)
- Datum: 2026-11-02

## Kontext

Vision: keine überladenen Menüs/Toolbars, individuell anpassbare Workstation,
später eigene Funktionen des Owners.

## Entscheidung

- Jede Funktion ist ein **Command** mit ID, Titel, optionaler Taste und
  Bedingung, wann er aktiv ist. Nur Commands ändern das Modell.
- Die Oberfläche (Panels, sichtbare Werkzeuge, Tastenbelegung) ist ein
  **Workspace** – reine Daten (JSON), speicherbar, pro Instrument/Aufgabe.
- Eine **Befehlspalette** (Strg+K) macht jeden Command auffindbar, ohne dass er
  irgendwo sichtbar sein muss.

## Alternativen

- Klassische Menüleiste + Toolbars (Finale-Muster): genau das, was vermieden
  werden soll.

## Folgen

- Undo/Redo, Makros, Tastenbelegung und Skripte nutzen dieselbe Grundlage.
- Neue Funktionen = neue Commands; die UI muss nicht umgebaut werden.
- Risiko: „Anpassbarkeit“ wird zum überladenen Einstellungsdialog.
  Gegenmittel: gute Voreinstellungen pro Instrument.
