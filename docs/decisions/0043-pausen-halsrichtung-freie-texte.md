# 0043 – Pausen verstecken und verschieben, Halsrichtung, freie Texte

- Status: angenommen
- Datum: 2026-11-11

Wünsche aus der Rückmelderunde: Pausen anklicken, unsichtbar machen (V) und mit den Pfeiltasten verschieben; die Halsrichtung gewählter Noten
mit einer Taste umdrehen; eigenen Text in die Partitur setzen – Schriftgröße wählbar, per Maus überall hinziehbar.

## Was neu ist

- **Pausen**: ein Klick wählt die Pause. **V** macht sie unsichtbar (nochmal V: sichtbar). **↑/↓** verschiebt sie um je eine Notenlinien-Stufe (höchstens 12).
  **Rücktaste/Entf** auf einer gewählten Pause macht sie unsichtbar – die Zeit bleibt, die Pause lässt sich ja nicht „löschen“. Markierte Passagen: V gilt für alle Pausen darin.
  Am Bildschirm bleibt eine unsichtbare Pause schwach grau stehen (sonst wäre sie nicht mehr wählbar), im Druck/PDF fehlt sie.
- **Halsrichtung**: Strg+Umschalt+H dreht den Hals der gewählten Note(n) um; nochmal gibt die Wahl dem Notensatz zurück.
- **Freier Text** (Befehlspalette Strg+K: „Text in die Partitur setzen“): Worte und Schriftgröße (6–72 Punkt) eingeben; der Text steht über der Zeile an der
  gewählten Note / am Cursor (sonst am Anfang) und ist danach gewählt. Mit der Maus lässt er sich überall hinziehen (auch in eine andere Zeile und an eine andere Stelle),
  Doppelklick ändert Worte und Größe (leer = entfernen), Rücktaste löscht.

## Umsetzung

- **Dateiformat 21 → 22**, alle Felder optional, alte Dateien öffnen sich unverändert (Migration `21 → 22` nur die Versionszahl):
  `Voice.rests` (`RestMark`: Beginn der Pause, `hidden`, `shift`), `NoteEvent.stem` (`'up' | 'down'`), `Score.texts` (`FreeText`: Zeile, Zeitpunkt, Worte, Größe, Versatz `dx/dy`).
- Pausen bleiben *abgeleitet* (Regel 2): die Markierung hängt am Beginn der Pause (Taktanfang bei Ganztaktpausen). Ändert man die Noten davor, kann sie ins Leere zeigen
  und wird dann ignoriert (sie bleibt aber in der Datei).
- Neue Logik in `src/core/editor/layoutOps.ts` (reine Funktionen, mit Tests); `commands.ts` hängt `stem.flip`, `rest.hide` und das Verhalten von ↑/↓/Rücktaste an.
- MEI (`src/render/mei.ts`): `<space>`/`<mSpace>` statt unsichtbarer Pause (für die App-Anzeige mit `showHiddenRests` trotzdem gezeichnet, Ids in `MeiResult.hiddenRests`);
  verschobene Pausen über `ploc/oloc`; `stem.dir`; Text als `<dir ho vo><rend fontsize>` je Takt.
- Ziehen eines Textes: Anker = nächste Note der nächsten Zeile; der Versatz wird in einem Undo-Schritt gemessen (erst ohne Versatz zeichnen, dann Abstand in Stufen umrechnen).

## Grenzen

- Eine Halsrichtung an Noten unter einem Balken ändert nur den Hals der Einzelnote – der Balken kann gleich aussehen (Verovio richtet den Balken nach der Mehrheit).
- Unsichtbare/verschobene Pausen und freie Texte werden **nicht** nach MusicXML/MIDI exportiert; im PDF-Druck sind sie dabei (Text) bzw. fehlen (unsichtbare Pause).
- Texte haben nur eine Schrift (kein Fett/Kursiv), keine Ausrichtung und keine Zeilenumbrüche.
