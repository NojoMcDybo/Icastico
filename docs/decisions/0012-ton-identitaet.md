# 0012 – Jeder Ton hat eine dauerhafte Nummer (Ton-ID)

- Status: angenommen (Vorbereitung für Piano-Roll, explizite Haltebögen und gleitende Töne)
- Datum: 2026-11-03

## Kontext

Bisher kannte das Modell einen Akkord nur als Liste von Tonhöhen. Wer „den
mittleren Ton dieses Akkords“ meinen wollte, hatte nur die Position in der
Liste – und die ändert sich, sobald ein Ton dazukommt oder die Reihenfolge
wechselt. Für das, was als Nächstes kommt (einzelne Töne als Balken
bearbeiten, Haltebögen und Gleiten zwischen zwei bestimmten Tönen), muss ein
Ton dauerhaft wiedererkennbar sein.

## Entscheidung

- Ein `NoteEvent` hat `tones: { id, pitch }[]` statt `pitches`. Beginn und
  Dauer bleiben am Event, alle Töne eines Events sind gleich lang.
- Die **Ton-ID** gehört dem Ton für immer: Tonhöhe, Oktave, Schreibweise und
  Länge ändern sie nicht; Töne hinzufügen oder entfernen auch nicht. Weder
  Listenposition noch MIDI-Nummer sind eine Identität.
- IDs sind in der ganzen Partitur eindeutig und XML-tauglich (wie Event-IDs).
  Neue IDs entstehen als `<Event-ID>-t<n>` (`freshToneId`).
- In der Datei und im Notenbild (SVG/MEI) tauchen Töne als `tones`-Liste
  bzw. `<Notenkopf-ID>-<Ton-ID>` auf; `ElementRef.toneId` führt einen
  angeklickten Notenkopf auf den einzelnen Ton zurück.
- Dateiformat **Version 3**. Alte Dateien (Version 1/2) werden beim Öffnen
  umgewandelt: Die Töne bekommen deterministisch die IDs `<Event-ID>-t1`,
  `-t2` … in der gespeicherten Reihenfolge. Die Musik bleibt unverändert.
- **Sicherung:** Der erste Speichervorgang einer älteren Datei in der
  Bibliothek (auch das automatische Speichern) legt vorher eine unveränderte
  Kopie in `Dokumente/Icastico/.sicherungen/<Dateiname>.v<alte Version>.bak`
  ab. Scheitert die Sicherung, wird nicht gespeichert und die alte Datei
  bleibt, wie sie ist. Der Ordner ist für die Bibliothek unsichtbar.

## Alternativen

- **Jede Note sofort ein eigenes Event mit freier Überlappung:** würde
  Stimmen- und Pausenberechnung stark ändern (Plan, Abschnitt 5). Verworfen;
  einzelne Akkordtöne werden später bei Bedarf in eine eigene Stimme gelöst.
- **ID aus Position und Tonhöhe ableiten:** ändert sich bei jeder Bearbeitung.
- **Zusätzliche Tonhöhenliste behalten:** zwei Wahrheiten im Modell.

## Folgen

- Alle Stellen, die Töne lesen, gehen über `tones[i].pitch` (Befehle, Notation,
  MEI, Datei, Statuszeile).
- Beim Verschmelzen zweier Events (Haltebogen-Befehl) bleibt das erste Event
  mit seinen Ton-IDs; die IDs des zweiten verschwinden. Sobald Verbindungen
  (Haltebogen, Gleiten) gespeichert werden, müssen sie beim Löschen von Tönen
  mitgelöscht werden (spätere Schritte).
- Sicherungen wachsen nicht mit: pro Datei und Formatwechsel entsteht eine.
  Außerhalb der Bibliothek geöffnete Dateien werden nicht gesichert, sie
  werden nur durch ausdrückliches Speichern ersetzt.
- Ältere Icastico-Versionen können Dateien der Version 3 nicht mehr öffnen und
  sagen das verständlich.
