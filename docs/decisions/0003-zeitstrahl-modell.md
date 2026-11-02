# 0003 – Zeitstrahl-Modell statt Takt-Modell

- Status: angenommen
- Datum: 2026-11-02

## Kontext

Finale und MuseScore speichern Musik in Takten. Folge: Einfügen „läuft über“,
Noten über Taktstriche müssen manuell gebunden werden, Taktartwechsel
zerstören Inhalte. Für Audio→Noten und MIDI-Einspielung entsteht Musik
ohnehin als Zeitstrahl (Ereignis bei 1,37 s, Dauer 0,4 s).

## Entscheidung

- Events haben `onset` und `duration` als **exakte Brüche** (Ganze = 1).
- Pausen sind Lücken, keine Objekte.
- Takte, Haltebögen über Taktstriche, Notenwerte, Pausenaufteilung und Balken
  werden von der Notationsschicht **abgeleitet**.
- Tonhöhen sind klingend, mit Schreibweise.

## Alternativen

- **Takt-Modell** (Finale/MuseScore/MusicXML): direkter abbildbar auf
  MusicXML, aber genau die Bedienprobleme, die Icastico vermeiden will.

## Folgen

- Einfügen/Löschen verschiebt Musik natürlich; Taktartwechsel sind harmlos.
- Audio/MIDI-Eingabe landet direkt im Modell.
- Die Notationsschicht muss Notensatz-Regeln beherrschen (gut testbar, aber
  Arbeit: Synkopen, N-Tolen, Stimmen).
- Bewusste Notationsabweichungen (z. B. „hier bitte zwei gebundene Viertel statt
  einer Halben“) brauchen später Notations-Hinweise am Event.
