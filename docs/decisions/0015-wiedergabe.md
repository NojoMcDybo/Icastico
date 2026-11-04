# 0015 – Wiedergabe mit eingebautem Klang und Tempo in der Partitur

- Status: angenommen
- Datum: 2026-11-04

## Kontext

Die Transportleiste (Abspielknopf, Anzeige mit Takt, Schlag, Tempo, Taktart,
Tonart) braucht Klang, und zwar einen, der nach Instrumenten klingt. Der erste
Plan sah einen nativen Synthesizer in Rust (RustySynth) vor. Der braucht eigenen
Audio-Code für Windows und Mac, den wir hier nicht auf beiden Systemen
prüfen können.

## Entscheidung

- **Instrumentenklänge aus einer SoundFont, abgespielt im Fenster:**
  [SpessaSynth](https://github.com/spessasus/spessasynth_lib) (`spessasynth_lib`,
  Apache-2.0; Abhängigkeiten `spessasynth_core` Apache-2.0, `fflate` MIT,
  `stb-vorbis`) als AudioWorklet-Synthesizer plus **MuseScore_General.sf3**
  (MIT-Lizenz, ca. 40 MB, von musescore.org). Es läuft in der Desktop-App und im
  Browser mit demselben Code, ohne eigenen nativen Audio-Code, und lässt sich im
  Browser-Test prüfen. Klangqualität: gute Allround-Klänge (Klavier, Gitarre,
  Stimme), kein Konzertflügel-Niveau.
- **Die Klangdatei liegt nicht in git:** `npm run dev` und `npm run build` holen sie
  (`scripts/fetch-sounds.mjs`, mit fester SHA-256-Prüfsumme) nach `public/sounds`;
  sie kommt so in den Installer. Die Lizenzdatei liegt daneben und ist im Repository.
- **Gleiten mit Samples:** Ein gleitender Klang bekommt einen eigenen MIDI-Kanal;
  das Instrument wird per Pitch-Bend durch die Lücke gebogen (alle 10 ms ein
  Schritt, linear in Halbtönen), der Bend-Bereich wird passend gesetzt und der
  Kanal danach zurückgesetzt (`src/audio/midiPlan.ts`, getestet). Gibt es mehr
  gleichzeitige Gleitklänge als freie Kanäle (12), klingen die übrigen ohne
  Tonhöhenverlauf, statt andere Noten mitzuziehen.
- **Rückfall:** Fehlt die Klangdatei oder lässt sie sich nicht laden, spielt der
  kleine eingebaute Klang (`src/audio/simpleSynth.ts`) mit einem Hinweis in der
  Statuszeile.

- **Der Abspielplan ist reine Logik** (`src/core/playback.ts`, getestet, ohne
  Audio): Aus der Partitur werden klingende Linien mit Tonhöhenverlauf.
  - Ein **Haltebogen** verbindet die beiden Noten zu *einem* Klang, ohne neuen
    Anschlag.
  - **Gleiten** mit Lücke ist *ein* Klang, dessen Tonhöhe durch die Lücke linear
    in Halbtönen wandert (im Web Audio als exponentielle Frequenzrampe).
  - **Gleiten ohne Lücke** ist der direkte Wechsel: die zweite Note wird neu
    angeschlagen; die Verbindung bleibt gespeichert.
- **Tempo ist Eigenschaft der Partitur** (`Score.tempo`, Viertel pro Minute,
  Standard 100, erlaubt 20–400), änderbar in der Anzeige (anklicken und
  eintippen oder Mausrad), rückgängig-fähig. **Dateiformat 5**, Version 4 wird
  übernommen und vor dem ersten Speichern gesichert. Ein Tempo pro Partitur;
  Tempowechsel mitten im Stück gibt es noch nicht.
- **Anzeige:** Takt (0 = Auftakt) und Schlag laufen mit der Audiouhr; im Stand
  zeigt sie die Stelle der Auswahl. Taktart und Tonart öffnen die
  Partitur-Einstellungen. Tonart als Dur-Name der Vorzeichen („Gmaj“): die
  Partitur kennt keinen Moll-Modus.
- Knöpfe: Zum Anfang, Takt zurück/vor, Wiedergabe/Stopp (Strg+Eingabe),
  Wiederholen (ganze Partitur), Aufnahme (gesperrt – später zum Diktieren und
  Einspielen von Noten).

## Folgen

- Spielt die Wiedergabe, bleibt sie bei einer Änderung der Partitur beim
  Stand vom Start; erst ein neuer Start hört die Änderung.
- Der erste Start einer Wiedergabe braucht ein paar Sekunden zum Laden der Klänge
  (Hinweis in der Statuszeile).
- Eine native Wiedergabe in Rust bleibt eine Option, falls das Fenster-Audio nicht reicht.
- Lautstärken, Hall, Metronom und Mixer fehlen.
