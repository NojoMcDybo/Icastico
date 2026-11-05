# 0025 – Sprachtest: Vosk im Fenster, Entscheidung offen

- Status: vorgeschlagen (Test läuft; angenommen erst nach dem Test mit der Stimme des Owners)
- Datum: 2026-11-05

## Kontext

Plan „Sprachbefehle“, Paket 3: Bevor die Spracherkennung fest eingebaut wird, soll ein Test zeigen, welcher
Erkenner mit einem kleinen deutschen Wortschatz (39 Wörter) offline zuverlässig genug ist (Ziele im Plan:
richtig ≥ 95 % im ruhigen Raum, ≥ 85 % mit Instrument, falsch < 2 %, Antwort < 0,5 s). Der Plan sah dafür
einen Erkenner in Rust vor.

## Entscheidung

Der Test läuft **im Fenster der App** (WebAssembly), nicht in Rust:

- **Erkenner A: Vosk** (`vosk-browser`, Apache-2.0) mit dem kleinen deutschen Modell `vosk-model-small-de-0.15`
  (Apache-2.0, 46 MB, von `npm run voice` nach `public/voice` geladen, nicht in git). Zwei Varianten:
  *mit Wortliste* (der Erkenner kann nur Wörter des Wortschatzes antworten) und *frei*.
- **Mikrofon** über die Fenster-Schnittstelle des Systems (`getUserMedia`); macOS bekommt
  `NSMicrophoneUsageDescription` (`src-tauri/Info.plist`).
- **Sprachtest-Dialog** (Strg+Umschalt+V): der Owner spricht die Wortliste, sieht je Wort, was verstanden wurde,
  und speichert das Ergebnis samt Aufnahmen als Datei. `node scripts/voice-eval.mjs <Datei>` spielt solche
  Aufnahmen später durch jeden anderen Erkenner – der Owner muss nicht noch einmal sprechen.
- Gründe gegen Rust **für den Test**: kein neuer nativer Baustein im Windows-/macOS-Build (häufigster Grund
  für rote Builds), und der ganze Weg (Aufnahme → Erkenner → Auswertung) lässt sich hier automatisch mit
  Referenzaufnahmen prüfen.

## Erste Messung (nur zur Einordnung, mit synthetischer Stimme)

Windows-Stimme „Hedda“, saubere Aufnahmen, 39 Wörter: *Vosk mit Wortliste* 35 richtig (89,7 %), 1 falsch
(„Be“ → „weg“), 3 nicht verstanden; *Vosk frei* 34 richtig (87,2 %), 0 falsch. Schwach sind lange
Zusammensetzungen („Vierundsechzigstel“, „Zweiunddreißigstel“, „Haltebogen“) und das kurze „Be“. Bei der
Wortliste meldet Vosk immer die Sicherheit 1 – der Schwellwert des Plans greift dort nicht, „unsicher =
nichts tun“ muss anders gelöst werden (z. B. Wort verwerfen, wenn „[unk]“ nahe liegt, oder die freie Variante
zur Gegenprobe). Die Aussagekraft ist begrenzt: eine saubere Computerstimme ist leichter als eine echte.

## Alternativen

- **whisper.cpp / Whisper** (Erkenner B des Plans): nicht eingebaut. Es bräuchte eine schwere Bibliothek
  (`@huggingface/transformers` zieht native Pakete und lädt Modelle aus dem Netz) oder eine eigene Rust-Anbindung;
  Whisper ist für Einzelwörter nicht gebaut. Wird nur geprüft, wenn Vosk bei der Stimme des Owners durchfällt.
- **Systemeigene Erkennung (C)**: zwei völlig verschiedene Umsetzungen, nicht ausprobiert.
- **Rust-Erkenner**: bleibt die Option für den Einbau, wenn Vosk gewinnt und das Fenster-Mikrofon im
  Desktop-Build Probleme macht.

## Folgen

- Das Modell (46 MB) liegt im Testbuild im Installer; ein Update lädt es mit.
- Noch **keine Sprachbefehle per Mikrofon** in der Workstation (Paket 4: Taste `R`, Statuszeile „● Aufnahme“).
- Offen bis zum Test des Owners: Läuft das Mikrofon im Desktop-Fenster (Windows: Systemabfrage, macOS:
  Mikrofonfreigabe) und wie gut erkennt Vosk seine Stimme?
