# Plan: Sprachbefehle (Notation per Stimme)

> Stand: 2026-11-04 · Status: **Plan, nicht freigegeben** (der Owner hat die
> Idee, aber noch nicht „los“ gesagt – siehe „Entscheidungen“ unten).
> Herkunft: Ideensammlung [`../ideas.md`](../ideas.md), Abschnitt „Diktieren“.
> Dieses Dokument ist so geschrieben, dass eine neue Claude-Session ohne den
> alten Chat sofort loslegen kann (Startauftrag ganz unten).

## 1. Ziel in einem Satz

Der Owner **hält eine Taste und spricht kurze Befehle** („fünf“, „Punkt“,
„Pause“, „höher“), Icastico führt dieselben Aktionen aus wie bei der
Tastatureingabe – offline, ohne Cloud, ohne neue Notenlogik.

**Nicht-Ziele (v1):** Tonnamen sprechen (c, d, e …) · freies Diktat ·
Liedtext diktieren (eigene Idee, dafür reicht das Betriebssystem-Diktat) ·
Cloud-Erkennung · Dauer-Mikrofon ohne Taste · andere Sprachen als Deutsch.

## 2. So fühlt es sich an

1. Eingabe läuft (Cursor blinkt). Hände sind am Instrument oder an der Maus.
2. **`R` drücken** (wie „Record“ in Logic; einstellbar; später auch
   Fußschalter über MIDI) und ein Wort sagen: „fünf“. **Kurz tippen** =
   Aufnahme an, nochmal tippen = aus (wie Logic). **Gedrückt halten** =
   nur solange du die Taste hältst (robuster, wenn Musik im Raum ist).
   Beides auf derselben Taste; die Statuszeile zeigt „● Aufnahme“, solange
   das Mikrofon offen ist.
3. Wort fertig (Taste loslassen bzw. kurze Sprechpause). In der Statuszeile steht kurz **„verstanden: fünf →
   Viertel“**, und der Befehl wirkt wie die Taste `5`.
4. Unsicher erkannt = **nichts passiert**, Statuszeile: „nicht verstanden“.
   (Lieber ein Befehl zu wenig als ein falscher.)
5. Jeder Sprachbefehl ist ein normaler Befehl → **Strg+Z macht ihn rückgängig**.

Mehrere Befehle in einem Atemzug („fünf Punkt höher“) sind ein späterer
Ausbau (v1.1); v1 = ein Wort pro Tastendruck, das ist am robustesten.

### Tastenkonflikt: `R` ist heute „Note → Pause“

In der Finale-Belegung (ADR 0006) steht `R` für **Note in Pause umwandeln**
(`edit.toRest`). **Entf** tut aber schon genau dasselbe (`edit.delete` ist
derselbe Befehl). Es geht also **keine Funktion verloren**, wenn `R` zur
Aufnahmetaste wird – nur die Finale-Gewohnheit „R = Pause machen“ fällt weg
(Finale-Umsteiger greifen automatisch zu `R`). Entscheidung vom Owner:
**`R` = Aufnahme**. Folgen, die bei der Umsetzung zu erledigen sind:

- `src/ui/keymaps/finale.ts`: `R` aus `edit.toRest` entfernen, `Delete` bleibt;
  Hilfetext „R / Entf“ → „Entf“.
- **ADR 0006** ergänzen: Abweichung von Finale, vom Owner bestimmt.
- Sprachbefehl „zur Pause“ (siehe unten) bleibt als Ersatz auf der Stimme.

**Weitsicht – `R` meint später dreierlei „Aufnahme“** (wie in Logic):
Sprache (dieser Plan, v1), **MIDI einspielen** (Schritt 3) und **Einsingen →
Noten** (Schritt 4). Ein Knopf, drei Quellen. Vorschlag, damit das nicht
kollidiert: Die **aktive Eingabequelle** (Sprache / MIDI / Mikrofon-Gesang)
wird in der Workstation gewählt (Workspace pro Instrument, Schritt 2); `R`
startet immer die Aufnahme der aktiven Quelle. Für v1 gibt es nur
„Sprache“, also keine Auswahl nötig – die Frage steht erst bei Schritt 3 an.

## 3. Wortschatz v1

Daten, keine Logik (wie die Tastenbelegung, ADR 0004/0006). Rechte Spalte sind
**echte Befehls-IDs** aus `src/core/editor/commands.ts`; sie ändern sich nicht.
Mehrere Auslösewörter pro Befehl = Synonyme (Zahl *und* Wort).

| Auslösewörter | Befehl (`id`, `arg`) | entspricht Taste |
|---|---|---|
| „eins“ · „Vierundsechzigstel“ | `input.duration` 1 | 1 |
| „zwei“ · „Zweiunddreißigstel“ | `input.duration` 2 | 2 |
| „drei“ · „Sechzehntel“ | `input.duration` 3 | 3 |
| „vier“ · „Achtel“ | `input.duration` 4 | 4 |
| „fünf“ · „Viertel“ | `input.duration` 5 | 5 |
| „sechs“ · „Halbe“ | `input.duration` 6 | 6 |
| „sieben“ · „Ganze“ | `input.duration` 7 | 7 |
| „null“ · „Pause“ | `input.rest` | 0 |
| „Punkt“ | `input.dot` | . |
| „Bogen“ · „Haltebogen“ | `edit.tie` | T |
| „zur Pause“ | `edit.toRest` | R |
| „höher“ · „tiefer“ | `edit.step` +1 / −1 | ↑ / ↓ |
| „Oktave hoch“ · „Oktave runter“ | `edit.octave` +1 / −1 | Strg+↑ / ↓ |
| „Kreuz“ · „Be“ | `edit.alter` +1 / −1 | + / − |
| „ändern“ + Zahl (zwei Wörter, v1.1) | `edit.duration` 1–7 | Alt+1–7 |
| „weg“ · „löschen“ | `edit.backspace` | ⌫ |
| „weiter“ · „vor“ | `nav.horizontal` +1 | → |
| „zurück“ · „davor“ | `nav.horizontal` −1 | ← |
| „darüber“ · „darunter“ | `nav.staff` −1 / +1 | Alt+↑ / ↓ |
| „rückgängig“ | `history.undo` (UI-Befehl) | Strg+Z |
| „wiederherstellen“ | `history.redo` (UI-Befehl) | Strg+Y |
| „Eingabe“ | `input.toggle` | Enter |
| „Einfügen“ | `input.insertMode` | Einfg |
| „fertig“ | `edit.escape` | Esc |

**Bewusste Entscheidungen im Wortschatz:**

- „zurück“ = Cursor zurück, **nicht** Undo (Undo heißt „rückgängig“) – sonst
  ist die Verwechslung vorprogrammiert. (Das weicht von der ersten Skizze in
  der Ideensammlung ab; die wird mit diesem Plan angepasst.)
- Kurze Wörter sind Risikokandidaten: „zwei/drei“, „Be“, „vor“. Der Test
  (Schritt 2 unten) entscheidet, welche bleiben; Ersatzwörter bereithalten.
- **Gefährliche Befehle sind immer rückgängig machbar** (alles läuft über
  Commands/Undo). Nichts im Wortschatz löscht dauerhaft.
- Tonhöhen kommen in v1 weiter von **Tastatur oder MIDI-Keyboard**.

## 4. Technische Umsetzung

### 4.1 Schichten (halten die Architekturregeln ein)

```
Sprechtaste ─► [Rust: Mikrofon + Erkenner] ─► Wort + Sicherheit
                                                   │  Tauri-Ereignis
                                                   ▼
        [TS: src/ui/voice/matcher]  Wort → Befehl (Wortschatz = Daten)
                                                   ▼
        Workstation.run(befehl, arg)  ← derselbe Weg wie die Tastatur
```

- **Modell (`src/core`) bleibt unberührt** (Regel 1). Kein neues Command nötig:
  Sprache ruft die bestehenden auf (Regel 4, Undo/Makros funktionieren
  automatisch).
- **Rust nur für das Native** (Regel 7): Mikrofon und Erkennung. Das Zuordnen
  „Wort → Befehl“ bleibt TypeScript.
- **Plattformunterschiede hinter einer Schnittstelle** (Regel 8):
  `src/platform/voice.ts` mit zwei Umsetzungen – Desktop (Rust) und Browser
  (Attrappe: Test-Hook `window.__voiceHear('fünf', 0.9)`), damit die Oberfläche
  ohne Mikrofon testbar ist.
- **Dateiformat unberührt** (keine Versionserhöhung nötig).
- Einstiegspunkt in der Oberfläche: `Workstation.run(command, arg)` in
  `src/ui/workstation.ts` (nimmt `CommandId | UiCommandId`).

### 4.2 Neue Dateien (Vorschlag)

| Datei | Inhalt |
|---|---|
| `src/ui/voice/vocabulary.de.ts` | Wortschatz-Tabelle von oben als Daten |
| `src/ui/voice/matcher.ts` | Reine Logik: normalisieren (Klein, Umlaute/ß, Zahlwörter), Synonyme, Schwellwert → Befehl oder `null` |
| `src/ui/voice/matcher.test.ts` | Tests: jedes Auslösewort, Verwechslungen, Schwellwert, unbekannte Wörter |
| `src/ui/voice/controller.ts` | Sprechtaste (keydown/keyup), Statuszeile, ruft `workstation.run` |
| `src/platform/voice.ts` | Schnittstelle + Desktop/Browser-Umsetzung |
| `src-tauri/src/voice.rs` | Mikrofon (`cpal`), Erkenner, Tauri-Befehle `voice_start`/`voice_stop`, Ereignis `voice-heard` |
| `docs/decisions/0011-sprachbefehle.md` | ADR zur Technikwahl (Entwurf unten) |

### 4.3 Rechte und Auslieferung

- **Mikrofon-Erlaubnis:** macOS braucht einen Eintrag „Mikrofonzugriff“ in der
  App-Beschreibung (Info.plist) und ein Entitlement; Windows fragt über die
  Datenschutzeinstellungen. Tauri-Capabilities anpassen
  (`src-tauri/capabilities/default.json`). *Genaue Schlüssel in Schritt 3
  prüfen, nicht aus dem Gedächtnis übernehmen.*
- **Modell-Datei:** liegt entweder im Installer (größer, funktioniert sofort)
  oder wird beim ersten Benutzen einmalig geladen (kleiner Installer, braucht
  Internet). Empfehlung: **im Installer**, solange das Modell klein bleibt.
- **Updater:** große Modelle würden jedes Update aufblähen → Modell separat
  versionieren, falls >50 MB.
- **Lizenz:** muss mit GPL-3.0-or-later vereinbar sein; Erkenner *und* Modell
  prüfen (Modelle haben oft eigene Lizenzen).

### 4.4 Technikwahl – ADR-Entwurf 0011 (Status: *vorgeschlagen*)

**Kontext:** Erkennt werden soll ein kleiner, fester Wortschatz (~30 Wörter),
Deutsch, offline, auf Windows zuerst, dann macOS, kurze Verzögerung nach dem
Loslassen. Entscheidung **nicht jetzt aus dem Bauch**, sondern nach einem
Test mit der echten Stimme des Owners (Schritt 2).

| Kandidat | Idee | Vorteil | Bedenken | Prüfstatus |
|---|---|---|---|---|
| **A. Vosk** (Kaldi-Erkenner) | Offline-Erkenner, Wortliste als „Grammatik“ vorgebbar | Läuft auf Windows/macOS, kleine Modelle (Projektseite nennt ~50 MB), Wortschatz einschränkbar | **Keine fertige Rust-Anbindung gefunden** → eigene Anbindung an die C-Bibliothek, Bau auf CI für beide Systeme | Projektangaben nur teilweise bestätigt, Lizenz/Rust-Anbindung **offen** |
| **B. whisper.cpp** (über `whisper-rs`) | Allround-Erkenner, auch für Audio-Aufgaben später interessant | Gut bei Deutsch, ein Baustein für mehrere Ideen | Nicht für Einzelwörter gebaut → neigt bei kurzem Audio zum „Erfinden“ von Text; Modelle 75 MB+; ob Wortliste hart erzwungen werden kann, **nicht geprüft** | **ungeprüft** |
| **C. Systemeigene Erkennung** (Windows-Sprachsteuerung mit eigener Wortliste; macOS-Diktatdienst lokal) | Betriebssystem erkennt, wir geben nur die Wortliste | Kein Modell im Installer, auf Windows für Befehlslisten gebaut | Zwei völlig verschiedene Umsetzungen; Deutsch-Sprachpaket nötig; Offline-Fähigkeit pro System prüfen | **ungeprüft** |
| D. sherpa-onnx (Stichwort-Erkennung) | Fertige Stichworterkennung | passt in die geplante ONNX-Schiene | Deutsche Stichwortmodelle in der Recherche **nicht auffindbar** | Recherche ohne Ergebnis, vermutlich raus |
| E. Browser-Spracherkennung (Web Speech) | – | – | Cloud in WebView2, unter macOS nicht zuverlässig → **verworfen** (Vision: Cloud = Nicht-Ziel) | verworfen |

**Vorläufige Empfehlung:** Im Test **A und B gegeneinander** antreten lassen
(beide plattformneutral, ein Code für Windows und macOS); **C nur als
Zusatzversuch auf Windows**, weil dort eine feste Wortliste die beste
Trefferquote verspricht. Alles Genannte stammt aus kurzer Recherche und
Vorwissen – **vor der Entscheidung in den Projektseiten nachlesen**, besonders
Lizenzen, Modellgrößen und Rust-Anbindung.

**Bewertungsmaßstab für den Test** (Vorschlag, Owner darf ändern):

| Kriterium | Mindestziel |
|---|---|
| Trefferquote auf dem Wortschatz, ruhiger Raum | ≥ 95 % |
| Trefferquote mit Instrument im Hintergrund | ≥ 85 % (sonst Fußschalter-Pflicht) |
| Verzögerung nach Loslassen bis „verstanden“ | < 0,5 s |
| Zusatzgröße im Installer | < 100 MB (Owner entscheidet) |
| Falsch erkannt statt „nicht verstanden“ | < 2 % (wichtiger als Trefferquote!) |
| Lizenz | vereinbar mit GPL-3.0-or-later |

## 5. Arbeitspakete (Reihenfolge)

Jedes Paket endet mit etwas, das getestet werden kann. Die Pakete 1–2 sind
billig und lohnen sich auch ohne Sprache.

| # | Paket | Inhalt | Aufwand | Ergebnis für den Owner |
|---|---|---|---|---|
| 1 | **Wortschatz + Matcher** | `vocabulary.de.ts`, `matcher.ts`, Tests. Rein TypeScript, kein Mikrofon | S | Nichts zu sehen – aber Grundlage, auch für Befehlspalette (Schritt 2) |
| 2 | **Befehlszeile als Attrappe** | `platform/voice.ts` mit Browser-Attrappe; kleines Textfeld (nur Entwicklung/Test), E2E: „fünf“ → Viertel | S | Tippen statt Sprechen, gleiche Wirkung |
| 3 | **Sprachtest-Build** (Spike) | Rust: Mikrofon + A/B (+ evtl. C). Eigener Dialog „Sprachtest“: Wort sagen, sehen was erkannt wurde, Ergebnisse als Datei speichern | M–L | **Owner spricht die Wortliste ein, schickt die Ergebnisdatei** → ADR 0011 wird entschieden |
| 4 | **Integration** | Aufnahmetaste `R` (Keymap + Hilfe + ADR 0006 anpassen), Statuszeile „● Aufnahme“, „unsicher = nichts tun“, Mikrofonrechte, Einstellung (Mikrofon, Taste) | M | Echtes Diktieren in der Workstation |
| 5 | **Auslieferung** | Modell in Installer/Update, Windows- und macOS-Build in CI grün, Größe prüfen | M | Installer mit Sprachbefehlen |
| 6 | **Feinschliff mit dem Owner** | Wortschatz anpassen (eigene Synonyme als Datei), Fußschalter (MIDI, passt zu Schritt 3 der Roadmap), Zwei-Wort-Befehle | S–M | Fühlt sich nach *seinem* Programm an |

**Später (nicht v1):** Tonnamen · mehrere Befehle in einem Atemzug ·
Befehlspalette per Stimme · Liedtext-Diktat · weitere Sprachen.

## 6. Verifikation (nach CLAUDE.md)

- `npm test` + `npm run typecheck` nach jedem Paket.
- Paket 1: Matcher-Tests über **jedes** Auslösewort, plus Negativtests
  („Sechzehntel“ darf nie als „Achtel“ gelten, unbekannte Wörter → `null`).
- Paket 2: `npm run build && npm run e2e` mit Attrappe; Screenshot der
  Statuszeile.
- Paket 3–5: Mikrofon gibt es unter `xvfb` nicht. Deshalb **Referenz­
  aufnahmen**: der Owner nimmt die Wortliste einmal auf (Handy genügt, WAV),
  die Aufnahmen liegen als Testdaten im Repo (Größe klein halten), die
  Rust-Tests füttern sie dem Erkenner. Echter Mikrofonweg: **Owner testet den
  Build** – das ausdrücklich in der Roadmap abhaken lassen.
- Rust: `cargo test --manifest-path src-tauri/Cargo.toml`.
- GitHub Actions müssen für Windows **und** macOS grün bleiben (neue native
  Bibliothek = häufigster Grund für rote Builds → früh in Paket 3 prüfen).

## 7. Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Trefferquote im Alltag zu niedrig | Feature nervt statt zu helfen | Spike vor Integration; Schwellwert hoch; „unsicher = nichts tun“; Ausstieg: Idee verwerfen, Aufwand nur P1–2 |
| Fehlerkennung löst falschen Befehl aus | Vertrauen weg | Alles über Undo; Statuszeile zeigt, was verstanden wurde |
| Instrument/Raum im Mikrofon | Falschauslösung | Sprechtaste statt Dauer-Mikrofon; Fußschalter |
| Native Bibliothek bricht Windows-/macOS-Build | Roter Build = Bug | Früh auf CI prüfen, ggf. Alternative C/B |
| Modell zu groß für Installer/Updates | Download-Ärger | Größenbudget (Owner), Modell separat versionieren |
| Lizenz unverträglich mit GPL | Projekt-Blocker | Lizenz **vor** dem Spike für jeden Kandidaten prüfen |
| Zeit zieht vom Wesentlichen ab | Schritt 1 bleibt halbfertig | **Nicht vor Abschluss von Schritt 1 starten** (siehe 8) |

## 8. Einordnung in die Roadmap

- **Paket 1–2** haben keine Abhängigkeiten und können jederzeit dazwischen
  geschoben werden.
- **Paket 3–6** erst, wenn Schritt 1 abgeschlossen ist (offene Haken: Instrumente
  ändern, Transponieren, Synkopen, erste Release, Tastenprüfung durch Owner).
- Gemeinsame Bausteine mit späteren Schritten: Mikrofon-Zugriff (`cpal`) und
  Rechte-Abfrage werden für **Audio→Noten (Schritt 4)** ohnehin gebraucht;
  Fußschalter gehört zu **MIDI (Schritt 3)**; Wortschatz-Datei und Matcher
  teilen sich die Idee mit der **Befehlspalette (Schritt 2)**. Wer das hier
  zuerst baut, räumt Audio→Noten ein Stück Risiko aus dem Weg.

## 9. Entscheidungen, die der Owner treffen muss

| Frage | Empfehlung |
|---|---|
| Plan freigeben, ab wann? | Nach Schritt 1; Paket 1–2 darf vorher |
| Sprechtaste | **`R` – entschieden** (tippen = an/aus, halten = Sprechen); später Fußschalter |
| `R` kollidiert mit „Note → Pause“ (Finale) – ok? | Ja, `Entf` macht dasselbe; Finale-Hilfe und ADR 0006 anpassen |
| Soll `R` später auch MIDI- und Gesangsaufnahme starten (wie Logic)? | Ja, je nach aktiver Eingabequelle (Entscheidung bei Schritt 3) |
| Tonnamen in v1? | Nein, nur Befehle (steht so in der Ideensammlung) |
| Installer-Größe: wie viel Zuwachs ist ok? | bis ~100 MB |
| Wortliste: passen die Wörter in Abschnitt 3 zu dir? | Beim Sprachtest anpassen |
| Wann nutzt du es wirklich (Instrument in der Hand, oder nur „schneller“)? | Entscheidet, ob sich P3–6 lohnen |

## 10. Startauftrag für eine neue Claude-Session

> Lies `CLAUDE.md`, dann `docs/plans/sprachbefehle.md` (dieser Plan) und
> `docs/ideas.md` Abschnitt „Diktieren“. Setze **Paket 1 und 2** um
> (Wortschatz + Matcher mit Tests, Plattformschnittstelle mit Browser-
> Attrappe, E2E-Test), nichts darüber hinaus. Halte die Architekturregeln
> ein (Modell unberührt, nur bestehende Commands aufrufen). Verifiziere mit
> `npm test`, `npm run typecheck`, `npm run build && npm run e2e`. Aktualisiere
> `docs/roadmap.md`. Dann Bericht auf Deutsch, ohne Fachjargon, und die
> offenen Entscheidungen aus Abschnitt 9 an den Owner zurückgeben.
