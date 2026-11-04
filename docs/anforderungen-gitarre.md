# Anforderungen aus dem Umfeld des Owners (Gitarre, Unterricht, Ensemble)

Stand 04.11.2026. Quelle: Nachrichten des Vaters des Owners, der Finale benutzt und ein
eigenes Programm für seine Arbeit möchte. **Noch kein vollständiges Anforderungsprofil**, nur der
Zwischenstand; offene Punkte stehen unten. Vergleich mit dem Stand von Icastico 0.10.0.

## Was geschrieben werden soll

| Wunsch | Stand |
|---|---|
| Gitarrennoten, mehrstimmig (Melodie + Bass in einem System) | Mehrere Stimmen pro Zeile gehen (bis 4, ADR 0016); Halsrichtung automatisch durch Verovio, nicht einstellbar |
| Leadsheets: Melodie, Akkordsymbole, Liedtext | fehlt (Akkordsymbole, Liedtext) |
| Ensemblepartituren und Einzelstimmen | Mehrere Instrumente im Modell möglich; Auszug von Einzelstimmen fehlt |
| Unterrichtsmaterial: mehrere kurze Notenbeispiele auf einer Seite | fehlt (Seitenlayout) |
| Gitarrentabulatur, allein oder mit Noten | fehlt |
| Klavier mit verbundenem Violin-/Bassschlüsselsystem | geht (Klavier-Instrument) |
| **MusicXML importieren** (und damit Finale-Dateien übernehmen) | geht (ADR 0017, noch nicht veröffentlicht): Strg+Umschalt+I; N-Tolen gerundet, Liedtext/Akkordsymbole noch nicht |

## Bedienung (Tastatur, Finale-gewohnt)

| Wunsch | Stand |
|---|---|
| Zifferblock wählt den Notenwert, obere Zahlenreihe etwas anderes | Heute lesen wir Ziffernblock und obere Reihe gleich (Notenwert). Für diesen Wunsch müsste die obere Reihe Intervalle liefern (eigene Belegung). |
| Enter bestätigt die Note und setzt den Cursor weiter, dort gleiche Tonhöhe und Notenwert | anders: Enter startet/beendet heute die Eingabe |
| 0 (Ziffernblock) = Pause | geht (Finale-Belegung: 0) |
| ↑/↓ ändert die Tonhöhe, ←/→ wählt andere Noten | geht |
| Obere Zahlenreihe: Ton im Intervall über der Note; Umschalt + Zahl darunter | fehlt (heute: Umschalt + Buchstabe, und der Akkordmodus) |
| + / − im Ziffernblock: Halbton höher/tiefer | geht (Vorzeichen) |
| Punkt im Ziffernblock punktiert | geht |
| T = Haltebogen | geht |

## Mehrstimmigkeit – Sonderwunsch

Vier Achtel in einer Ebene, gleichzeitig in einer zweiten Ebene eine halbe Note auf der Tonhöhe des
ersten Achtels. Die Darstellung soll sich **zusammenführen** lassen: ein gemeinsamer hohler Notenkopf
mit zwei Hälsen (einer mit Achtelbalken, einer ohne). **Dieses Detail ist noch nicht abschließend
geklärt.** Technisch ist es ein Sonderfall in der Notendarstellung (Verovio kennt das so nicht), also
nicht billig.

## Noch zu besprechen

- Übernahme vorhandener Finale-Dateien (Weg: MusicXML-Export aus Finale, später ggf. `.musx` direkt)
- Seitenlayout, Ausdruck/PDF, Wiedergabe
- Liedtext, Akkordsymbole, Tabulatur: genaue Bedienung

## Mögliche Reihenfolge (Empfehlung)

1. ~~MusicXML-Import~~ (gebaut, ADR 0017)
2. Eigene Tastenbelegung „Gitarre/Finale-Ziffernblock“ (Enter-Weiterschalten, Intervalle über der oberen Reihe)
3. Akkordsymbole und Liedtext (Leadsheet)
4. Tabulatur
5. Seitenlayout, PDF, Einzelstimmen
6. Der Notenkopf-Sonderfall
