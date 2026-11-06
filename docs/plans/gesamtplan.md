# Gesamtplan: alle Funktionen in sinnvoller Reihenfolge

> Stand: 2026-11-06 · Status: **Vorschlag, nicht freigegeben.** Er ersetzt die
> [Roadmap](../roadmap.md) erst, wenn der Owner „ja“ sagt. Grundlage: Roadmap,
> [Ideensammlung](../ideas.md), [Plan Sprachbefehle](sprachbefehle.md) und der
> echte Code (Stand v0.6.0).

## 1. Wie die Reihenfolge entsteht

Fünf Regeln, in dieser Priorität. Wenn du die Reihenfolge ändern willst,
ändere zuerst die Regeln.

1. **Bausteine vor Verbrauchern.** Was viele andere Funktionen brauchen,
   kommt früh (z. B. Auswahl, Tempo im Modell, Quantisierung).
2. **Jede Phase endet mit etwas, das du installierst und benutzt.** Keine
   Phase ist „nur Unterbau“.
3. **Risiko früh klein testen.** Unsichere Dinge (Spracherkennung,
   Tonhöhenerkennung, Quantisierung) bekommen einen kleinen Versuch *vor*
   dem großen Einbau. Scheitert er, kostet das Tage, nicht Monate.
4. **Daten sind heilig.** Sicherung und Versionsverlauf kommen *vor* Kopieren/
   Einfügen und anderen Funktionen, die ein Stück zerstören können.
5. **Erst die drei Instrumente richtig, dann in die Breite.** Gesang,
   Gitarre, Klavier. Der Weg für Finale-Umsteiger (MusicXML) steht, bevor
   Icastico breit angekündigt wird.

## 2. Was voneinander abhängt

```
 Auswahl/Kopieren ──┬─► Makros ──► Skripte/Erweiterungen
                    ├─► Schleife, Export von Auswahl
                    └─► Transponieren von Auswahl

 Tempo im Modell ───┬─► Wiedergabe ──► Metronom ──► Aufnahme zum Klick
                    └─► MIDI-Import/-Export

 Wiedergabe + Audio-Ausgabe (Rust) ─► Vorhören, Mixer, Schleife, Audio-Export

 N-Tolen ┐
 Stimmen ├─► QUANTISIERUNG ──┬─► MIDI-Datei-Import (aus Logic)
 Tonart  ┘  (Töne → Noten)   ├─► MIDI-Keyboard Echtzeit
                             └─► Audio → Noten (Gesang)

 Mikrofon (Rust) + Rechte ──┬─► Sprachbefehle (Erkennung)
                            └─► Audio → Noten

 Seitenlayout ──► PDF-Export ──► Stimmenauszüge, Liederbuch
 Liedtext + Akkorde + Ausdruckszeichen ──► MusicXML (verlustfrei)
 Panels/Workspaces ──► Korrekturansicht (Audio→Noten), Mixer-Panel
```

**Die zwei wichtigsten Engpässe:** *Auswahl* (ohne sie kein schnelles
Schreiben, kein Makro, kein Schleifen) und die *Quantisierung* (die Kette
„gespielte Töne → Notenwerte“; sie macht aus Logic-MIDI, Keyboard-Spiel und
Gesang Noten). Beides wird einmal gebaut und von mehreren Funktionen
mitbenutzt.

## 3. Die Phasen im Überblick

Größen: **S** ein Arbeitspaket · **M** mehrere · **L** eigener Brocken ·
**XL** Forschung nötig. Keine Zeitangaben, denn die hängen davon ab, wie
schnell du testest und entscheidest.

| Phase | Name | Danach kannst du … |
|---|---|---|
| **P1** | Fundament abschließen + erste Release | Icastico veröffentlicht installieren, Instrumente ändern, transponieren |
| **P2** | Schreibtempo + Sicherheitsnetz | Takte kopieren/einfügen, alles per Befehlspalette finden, ohne Datenverlust-Angst arbeiten |
| **P3** | Lieder schreiben & drucken | Ein komplettes Lied (Noten, Text, Akkorde) schreiben und als PDF weitergeben |
| **P4** | Hören & Keyboard | Anhören, was du schreibst; Noten mit dem MIDI-Keyboard Schritt für Schritt eingeben |
| **P5** | Notation vollständig | Klavier-Sätze, Dynamik, Bögen, Wiederholungen, Triolen |
| **P6** | Austausch | MusicXML hin und her, **MIDI aus Logic importieren** |
| **P7** | Einspielen & Sprechen | In Echtzeit einspielen, per Sprache steuern (`R` = Aufnahme) |
| **P8** | Workstation | Layouts pro Instrument, Makros, Englisch |
| **P9** | Audio → Noten | Melodie einsingen und Noten bekommen |
| **P10** | Ausbau | Tabulatur, Griffbrett, Skripte, Liederbuch, Tags … |

---

## 4. Die Phasen im Einzelnen

### P1 – Fundament abschließen + erste Release

*Warum zuerst:* Alles danach baut darauf auf. Ein halb fertiges Fundament
macht jede spätere Funktion unzuverlässig. Dazu testet die erste Release den
Update-Weg echt (ADR 0010).

| Funktion | Größe | Anmerkung |
|---|---|---|
| Tasten prüfen (ADR 0006, Annahmen) | S | **Du** |
| Instrumente hinzufügen/entfernen/umbenennen | M | offen in Roadmap |
| Transponieren (ganze Partitur) | M | nach **Intervall** (Stufen + Halbtöne), damit Fis/Ges stimmt |
| Synkopen, Halbtakt-Balken in 4/4 | M | Notationsregeln |
| Partituren per Ziehen in Sammlungen | S | |
| Mac-Build testen | S | Wer testet? Du nutzt Logic, also hast du einen Mac (siehe Fragen) |
| **Erste Release** | S | du legst sie auf GitHub an (Tag-Push ist für mich gesperrt) |
| Texte zentral sammeln (Vorarbeit für Englisch) | S | unsichtbar, spart später viel |

*Abnahme:* Du installierst die Release, öffnest eine alte Datei, transponierst
ein Lied, Update-Hinweis erscheint bei der nächsten Version.

### P2 – Schreibtempo + Sicherheitsnetz

*Warum jetzt:* Der größte Hebel auf Schreibgeschwindigkeit fehlt noch ganz.
Die Auswahl kennt bisher nur *eine* Note oder *eine* Lücke.

| Funktion | Größe | Anmerkung |
|---|---|---|
| **Sicherung** (Backup in anderen Ordner) | S | vor Kopieren/Einfügen! |
| **Versionsverlauf** („Stand von gestern“) | M | Autosave überschreibt sonst alles |
| **Auswahl erweitern**: Bereich/Takte markieren, Kopieren, Ausschneiden, Einfügen, Wiederholen | M | Engpass #1 |
| Transponieren nur für Auswahl / eine Stimme | S | folgt aus Auswahl |
| **Befehlspalette** (Strg+K) | M | alles per Tippen erreichbar |
| Tastenbelegung anpassbar | M | Datensatz gibt es schon (ADR 0006) |
| Sprachbefehle Paket 1–2 (Wortschatz + Matcher, Test-Attrappe) | S+S | gleiche Idee wie Befehlspalette |

*Abnahme:* Ein 16-Takte-Lied mit Wiederholungsteilen in einem Bruchteil der
Zeit schreiben. Danach: „Strg+Z“ und „Stand von gestern“ retten jeden Fehler.

### P3 – Lieder schreiben & drucken (Gesang, Gitarre)

*Warum jetzt:* Gesang und Gitarre sind deine ersten Instrumente, und ohne
Text und Akkorde ist es kein Lied. Dazu das Weitergeben als PDF: erst damit
ist Icastico im Alltag nutzbar.

| Funktion | Größe | Anmerkung |
|---|---|---|
| **Liedtext** (Silben, Bindestriche, Melismen) | M | Diktat über das Betriebssystem geht schon im Textfeld |
| **Akkordsymbole** über den Noten + schnelles Tippen („Am7“) | M | |
| Capo (klingend vs. gegriffen) | S | kleine Rechnung auf den Akkorden |
| **Mehrere Systeme/Seiten, Seitenlayout** | L | Voraussetzung für Druck |
| **PDF-Export** | M | |
| Dateiformat-Version erhöhen (Text, Akkorde, Seiten) | S | ADR 0007, Migration + Test |

*Entscheidungen:* ADR zum PDF-Weg (Verovio-SVG → PDF auf beiden Systemen).
*Kleiner Vorversuch:* mehrseitiges Rendern + PDF auf Windows **und** macOS.

*Abnahme:* Ein eigenes Lied (Melodie, Text, Gitarrenakkorde) als PDF, das
du ausdrucken würdest.

### P4 – Hören & Keyboard

*Warum jetzt:* Hören ist das stärkste Feedback beim Schreiben. Die
Audio-Ausgabe (Rust) brauchen später Metronom, Aufnahme zum Klick und
Vorhören. Das MIDI-Keyboard (Schritt für Schritt) braucht *keine*
Quantisierung und bringt Klavier-Leuten sofort viel.

| Funktion | Größe | Anmerkung |
|---|---|---|
| **Tempo im Modell** (Tempo, Tempowechsel) | M | fehlt komplett, Dateiformat-Version erhöhen |
| **Wiedergabe** mit mitlaufendem Cursor | L | Klangquelle: SoundFont (ADR) |
| Metronom/Klick | S | |
| Echo/Vorhören beim Eingeben | S | |
| Stummschalten/Solo pro Instrument | S | |
| Schleife über markierte Takte | S | braucht Auswahl (P2) |
| Tempo beim Abspielen ändern | S | |
| **MIDI-Keyboard: Schritt-Eingabe** | M | MIDI-Anbindung in Rust (Windows + macOS) |
| MIDI-Export | S | Rückweg zu Logic & Co. |
| Audio-Export (WAV) | M | |

*Abnahme:* Du spielst ein Lied ab, hörst Gitarre und Gesang getrennt,
tippst Klaviermelodie über dein Keyboard ein.

### P5 – Notation vollständig (Klavier & Ausdruck)

*Warum jetzt:* Erst muss Hören funktionieren (Dynamik soll hörbar werden),
und alles, was P6 importiert, muss vorher darstellbar sein, sonst geht
beim Import Inhalt verloren.

| Funktion | Größe | Anmerkung |
|---|---|---|
| **Mehrere Stimmen im selben System** | L | Das Modell kennt schon mehrere Voices pro Part (Klavier: je eine pro Hand); offen ist Darstellung und Eingabe **im selben System**. **ADR zuerst** |
| **N-Tolen** (Triolen, Quintolen …) | L | Voraussetzung für Quantisierung und Import |
| Bögen (Legato), Dynamik, Artikulation | L | in Wiedergabe als Lautstärke hörbar |
| Tempo-/Textangaben („Allegro“, „rit.“) | M | |
| Wiederholungen, Klammern (Volta), Coda/Segno | L | Wiedergabe muss sie auflösen |
| Verzierungen, Vorschlagsnoten | M | |
| Diatonisch transponieren (leitereigen) | S | für Sequenzen/Übungen |
| Weitere Instrumente (Bass, Streicher, Chor …) | S je | sind Daten (Regel 6) |
| Dateiformat-Version erhöhen | S | |

*Abnahme:* Ein Klavierstück mit zwei Händen, Triolen, Dynamik und Wiederholung
sieht nach Notenbild aus und klingt richtig.

### P6 – Austausch (MusicXML + MIDI-Datei, auch aus Logic)

*Warum jetzt:* Erst wenn alles darstellbar ist (P5), lohnt der Import.
Zugleich entsteht hier die **Quantisierung**, die danach Keyboard-Echtzeit
und Gesang mitbenutzen. Der MIDI-Import ist dafür der beste Prüfstand:
dieselbe Datei liefert immer dasselbe Ergebnis.

| Funktion | Größe | Anmerkung |
|---|---|---|
| **MusicXML-Export** | M | zuerst (einfacher, sofort prüfbar) |
| **MusicXML-Import** | L | Weg für Finale/MuseScore-Umsteiger, und für Logics Notations-Editor |
| **Quantisierung** (Raster, Triolen, Tonart/Schreibweise, Handtrennung) | L | ADR; Herzstück |
| **MIDI-Datei-Import** mit Import-Fenster (Spuren, Instrumente, Raster, Tonart) | L | Details: Ideensammlung „Import aus Logic“ |

*Vorarbeit jetzt (von dir):* ein paar echte `.mid`/`.musicxml`-Exporte aus
Logic als Testmaterial sammeln.
*Abnahme:* Eine echte Logic-Aufnahme mit Klick importieren und danach in
Icastico nur noch korrigieren.

### P7 – Einspielen & Sprechen

*Warum jetzt:* Mikrofon und Rechte-Abfrage sind gemeinsame Infrastruktur
für Sprachbefehle *und* Gesang (P9), die Quantisierung gibt es seit P6, und
`R` wird die gemeinsame **Aufnahmetaste**.

| Funktion | Größe | Anmerkung |
|---|---|---|
| **MIDI-Keyboard: Echtzeit** mit Quantisierer | L | Klick aus P4, Quantisierung aus P6 |
| Aufnahmetaste `R` (Quelle: MIDI/Sprache; später Gesang) | S | `R` verliert dafür „Note → Pause“ (bleibt auf `Entf`) |
| **Sprachbefehle Paket 3–6** (Test mit deiner Stimme → Technik wählen → einbauen) | L | siehe [sprachbefehle.md](sprachbefehle.md) |
| Fußschalter (MIDI) für Aufnahme | S | |
| „Rhythmus zuerst“ (Rhythmus tippen, dann Töne) | M | prüfen, ob du es überhaupt willst |

*Abnahme:* Ein Lied mit Klick auf dem Keyboard einspielen, mit Stimme
korrigieren.

### P8 – Workstation

*Warum jetzt:* Panels lohnen sich, wenn es etwas zu zeigen gibt (Mixer,
Transport, Import-Fenster, später Korrekturansicht). Sie müssen aber *vor*
der Korrekturansicht (P9) stehen.

| Funktion | Größe | Anmerkung |
|---|---|---|
| Andockbare Panels, Layouts speichern | L | |
| Workspaces pro Instrument („Gesang“, „Gitarre“) | M | |
| Fokusmodus | S | |
| Rahmenloses Fenster mit Glas-Bedienelementen (Folio) | M | mit dir abstimmen, hier statt P1 |
| **Makros** („noch mal wie eben“) | L | baut auf Befehlen + Auswahl |
| **Englische Oberfläche** | M | Texte seit P1 gesammelt, hier übersetzen |

*Abnahme:* Ein Workspace „Gesang“ und einer „Klavier mit MIDI“, per Tastendruck
umschaltbar.

### P9 – Audio → Noten

*Warum jetzt:* Hängt an Mikrofon (P7), Klick (P4), Quantisierung (P6) und
Panels für die Korrekturansicht (P8). Alles Nötige ist dann da.

| Funktion | Größe | Anmerkung |
|---|---|---|
| **Vorversuch Tonhöhen-Erkennung** (nur Tonhöhenverlauf anzeigen) | M | entscheidet, ob und wie |
| **Aufnahme zum Klick** + Einzähler | S | |
| **Melodie einsingen → Noten** (einstimmig) | XL | pYIN/CREPE-Familie, ADR |
| **Korrekturansicht** (Töne verschieben/löschen, Aufnahme anhörbar) | L | ohne sie ist Erkennung nutzlos |
| Tonart automatisch vorschlagen | M | |
| Fertige Aufnahme/Logic-Stems importieren | L | gleiche Technik |
| Mehrstimmig (Klavier, Gitarre) | XL | experimentell, nur wenn einstimmig überzeugt |

*Abnahme:* Du singst eine Melodie zum Klick ein und korrigierst nur noch zwei
Töne.

### P10 – Ausbau (nach Bedarf, nicht in fester Reihenfolge)

| Funktion | Größe | Anmerkung |
|---|---|---|
| Tabulatur | L | erst wenn Gitarristen sie brauchen |
| Griffbilder, Griffbrett-Eingabe | M, L | |
| Stimmenauszüge (Einzelstimmen drucken) | L | braucht Seitenlayout (P3) |
| Liederbuch/Setlist | L | Bibliothek + PDF sind da |
| Tags, Filter | M | |
| Skripte/Erweiterungen | XL | nach Makros |
| Schlagzeug (eigene Notationsregeln) | L | |
| Hell-Modus | S | nur wenn gewünscht |
| Signierte Installer | M | kostet Geld, du entscheidest |

---

## 5. Läuft in jeder Phase mit

- **Tests und Build grün** (`npm test`, `typecheck`, `e2e`, Windows- und
  macOS-Build). Ein roter Build ist ein Bug.
- **Dateiformat:** höchstens *ein* Versionssprung pro Phase; jede Änderung mit
  Migration und Test (ADR 0007). Alte Dateien öffnen immer.
- **Doku:** Roadmap und ADRs nach jedem Arbeitspaket.
- **Große Partituren:** früh messen (Rendern, Autosave), bevor P5 Last bringt.

## 6. Kleine Vorversuche, die früher laufen sollten

| Versuch | Wann | Entscheidet |
|---|---|---|
| Echte Logic-Exporte (`.mid`, `.musicxml`) sammeln | **jetzt**, 15 Minuten von dir | Qualitätsmaßstab für P6 |
| Mehrseitiges Rendern + PDF auf Windows und macOS | Anfang P3 | PDF-Weg |
| Erkennungstest Sprachbefehle mit deiner Stimme | Anfang P7 (früher möglich) | Technik, ob überhaupt |
| Tonhöhen-Erkennung am Gesang | Anfang P9 | ob Audio→Noten so funktioniert |

## 7. Alle Funktionen auf einen Blick (Zuordnung)

Jede Idee aus der Ideensammlung steht in genau einer Phase oder im Parkplatz.

| Phase | Funktionen |
|---|---|
| P1 | Instrumente ändern · Transponieren (Intervall) · Synkopen/Balken · Sammlungen per Ziehen · Mac testen · erste Release · Tastenprüfung · Texte sammeln |
| P2 | Sicherung · Versionsverlauf · Auswahl/Kopieren · Befehlspalette · Tastenbelegung anpassbar · Sprachbefehle P1–2 |
| P3 | Liedtext · Akkordsymbole · Capo · Seitenlayout · PDF-Export |
| P4 | Tempo im Modell · Wiedergabe · Metronom · Vorhören · Mute/Solo · Schleife · Abspieltempo · MIDI-Keyboard Schritt · MIDI-Export · Audio-Export |
| P5 | Stimmen im System · N-Tolen · Bögen/Dynamik/Artikulation · Tempo-/Textangaben · Wiederholungen · Verzierungen · diatonisch Transponieren · weitere Instrumente |
| P6 | MusicXML Export/Import · Quantisierung · MIDI-Datei-Import (Logic) |
| P7 | MIDI Echtzeit · Aufnahmetaste `R` · Sprachbefehle P3–6 · Fußschalter · Rhythmus zuerst |
| P8 | Panels · Layouts · Workspaces · Fokusmodus · rahmenloses Fenster · Makros · Englisch |
| P9 | Tonhöhen-Versuch · Aufnahme zum Klick · Einsingen · Korrekturansicht · Tonart-Vorschlag · Aufnahme-Import · mehrstimmig |
| P10 | Tabulatur · Griffbilder · Griffbrett-Eingabe · Stimmenauszüge · Liederbuch · Tags · Skripte · Schlagzeug · Hell-Modus · signierte Installer |
| Verworfen/geparkt | Teilen per Link (❌) · gesungene Silben → Liedtext (❌?, eigenes hartes Problem) · `.logicx` direkt lesen (❌) |

## 8. Entscheidungen, die du treffen musst

| # | Frage | Empfehlung |
|---|---|---|
| 1 | Passt die **Reihenfolge-Logik** (Abschnitt 1)? | Ja; Streit lieber über die Regeln als über Einzelpunkte |
| 2 | **Workstation (P8) erst so spät?** Ursprünglich war sie Schritt 2. | Ja, weil Panels erst mit Inhalt Sinn ergeben. Wenn dir die „Workstation-Identität“ wichtiger ist: nach P3 ziehen, Preis: Panels werden gebaut, bevor klar ist, was hineinkommt |
| 3 | **Auf welchem System arbeitest du hauptsächlich?** Logic läuft nur auf Mac. | Entscheidet, was wir zuerst testen (Mac-Build, Mikrofon-Rechte) |
| 4 | **Erste Release nach P1?** | Ja, damit der Update-Weg echt erprobt ist |
| 5 | **Englisch** ja/nein, wann? | Texte jetzt sammeln (P1), übersetzen in P8 |
| 6 | **Finale-Umsteiger vor Audio→Noten?** (MusicXML in P6, Audio in P9) | Ja, weil Umsteiger sonst keinen Weg hinein haben |
| 7 | Sind **mehrere Stimmen pro Hand** (Klavier) wichtig? | Entscheidet, wie früh der Stimmen-ADR in P5 dran ist |
| 8 | **Rahmenloses Fenster** verschieben auf P8? | Ja, reine Optik |

## 9. Wann sich die Reihenfolge ändert

- Ein **Vorversuch scheitert** (z. B. Spracherkennung zu schlecht): Funktion
  fällt oder schrumpft, nichts anderes verschiebt sich.
- Du **brauchst etwas Dringendes** (z. B. Liedtext schon vor Auswahl): kein
  Problem, solange die Abhängigkeiten in Abschnitt 2 gelten.
- Ein **Baustein wird größer als gedacht** (am wahrscheinlichsten: Stimmen im
  System, Quantisierung): die Phase wird geteilt, die Reihenfolge bleibt.

## 10. Wenn du „ja“ sagst

1. `roadmap.md` auf diese Phasen umstellen (Schritt 0–1 bleiben als erledigt,
   P1 ersetzt den Rest von Schritt 1).
2. In `ideas.md` die Status auf 📌 setzen, mit Phasennummer.
3. Mit **P1** anfangen.

Startauftrag für eine neue Session: *Lies `CLAUDE.md`, `docs/plans/gesamtplan.md`
und `docs/roadmap.md`. Setze P1 um, in dieser Reihenfolge, jede Funktion mit
Tests, `npm test` + `typecheck` + `build` + `e2e`. Roadmap nachziehen. Bericht
auf Deutsch ohne Fachjargon.*
