# Ideensammlung

> Parkplatz für alles, was *irgendwann* kommen könnte. Hier darf alles stehen –
> nichts davon ist versprochen. Was der Owner freigibt, wandert in die
> [Roadmap](roadmap.md); Grundsatzentscheidungen werden zu einem ADR
> (`docs/decisions/`).

## So wird gearbeitet

**Status** jeder Idee:

| Zeichen | Bedeutung |
|---|---|
| 💡 | Idee, nur aufgeschrieben |
| ❓ | Braucht erst eine Antwort vom Owner |
| 📌 | Freigegeben, steht in der Roadmap |
| 📋 | Ausgearbeiteter Plan liegt vor, noch nicht freigegeben |
| ✅ | Umgesetzt |
| ❌ | Verworfen (bleibt stehen, mit Grund – damit wir nicht zweimal darüber reden) |

**Aufwand** (grobe Schätzung, nur zum Sortieren): **S** = ein Arbeitspaket,
**M** = mehrere, **L** = eigener Roadmap-Schritt, **XL** = Forschung nötig.

**Herkunft:** *Owner* = von dir, *Vision* = steht schon in `vision.md`,
*Vorschlag* = von Claude – darfst du gnadenlos streichen.

**Wert für dich** ist die einzige Spalte, die zählt: Macht es das Schreiben
schneller oder einfacher? Wenn nein, wandert es nach unten.

---

## 1. Eingabe – schnell schreiben

| Idee | Status | Aufwand | Herkunft | Notiz |
|---|---|---|---|---|
| MIDI-Keyboard: Schritt für Schritt (Taste drücken = Note) | 📌 | M | Vision | Schritt 3 |
| MIDI-Keyboard: Echtzeit einspielen mit automatischer Rhythmus-Glättung | 📌 | L | Vision | Schritt 3; „Quantisierer“ = krumme Zeiten auf Raster ziehen |
| Rhythmus zuerst: erst den Rhythmus auf einer Taste tippen, danach Tonhöhen darüberlegen | 💡 | M | Vorschlag | Viele denken so (Rhythmus ≠ Tonhöhe). Passt zu „schnell statt suchen“ |
| Akkordsymbole schnell tippen („Am7“, „F#m/C#“) | 💡 | M | Vorschlag | Für Gitarre/Gesang wichtig, siehe Abschnitt 4 |
| Gitarre: Eingabe am Griffbrett (Bund anklicken) | 💡 | L | Vision | Setzt Tabulatur-Überlegungen voraus |
| Auswahl erweitern (Takte markieren, kopieren, einfügen, wiederholen) | ❓ | M | Vorschlag | Fehlt bisher komplett – ohne Kopieren ist kein Lied in vertretbarer Zeit fertig |
| **Sprachbefehle**: Notenwerte, Pause, Punkt, Navigation per Sprache, mit Synonymen (Zahlen oder Wörter) | 📋 | M | Owner | Nur Befehle, kein freies Diktat. Siehe „Diktieren“ unten. **Plan liegt vor:** [plans/sprachbefehle.md](plans/sprachbefehle.md) |
| Eigene Tastenbelegung | 📌 | M | Vision | Schritt 2 |
| Makros („mach das, was ich gerade getan habe, nochmal“) | 💡 | L | Owner/Vision | Bauen auf den Commands auf (ADR 0004) |

### Diktieren (Idee vom Owner)

**Entscheidung des Owners:** am liebsten **nur Befehle**, kein freies Diktat.
Verbessern über **Synonyme** (z. B. Zahlen statt Wörter).

**Gemeint ist:** Du sprichst kurze Befehle, Icastico führt dieselben Aktionen
aus wie bei der Tastatur (ADR 0004, 0006). Sprache ist nur ein weiterer Weg
zu denselben Befehlen, wie die Tastenbelegung, nur mit Mund statt Fingern.
Keine neue Notenlogik nötig. Nicht zu verwechseln mit *Einsingen* (Abschnitt 2):
dort kommt Musik rein, hier kommen Wörter rein.

**Warum „nur Befehle“ die richtige Wahl ist:** Eine kleine, feste Wortliste zu
erkennen ist viel leichter und zuverlässiger als freie Sprache. Das Programm
muss nicht verstehen, *was du sagst*, sondern nur, *welches von ~30 Wörtern*.

**Synonyme: ja, mit einer Einschränkung.** Pro Befehl gibt es mehrere
Auslösewörter, als Daten gepflegt (wie die Tastenbelegung). Die Zahlen sind
dieselben wie in Finale (ADR 0006), die du schon im Kopf hast:

| Befehl | Du kannst sagen | Taste heute |
|---|---|---|
| Notenwert Viertel | „fünf“ · „Viertel“ | 5 |
| Notenwert Achtel | „vier“ · „Achtel“ | 4 |
| Notenwert Sechzehntel | „drei“ · „Sechzehntel“ | 3 |
| Notenwert Halbe | „sechs“ · „Halbe“ | 6 |
| Notenwert Ganze | „sieben“ · „Ganze“ | 7 |
| Pause | „null“ · „Pause“ | 0 |
| Punktierung | „Punkt“ | . |
| Haltebogen | „Bogen“ · „Haltebogen“ | T |
| Note ↔ Pause | „Pause machen“ | R |
| Halbton höher / tiefer | „Kreuz“ · „Be“ | + / − |
| Stufe höher / tiefer | „hoch“ · „runter“ | ↑ / ↓ |
| Oktave höher / tiefer | „Oktave hoch“ · „Oktave runter“ | Strg + ↑ / ↓ |
| Letzte Note löschen | „weg“ · „löschen“ | ⌫ |
| Rückgängig | „rückgängig“ | Strg + Z |
| Cursor vor / zurück | „weiter“ / „zurück“ | → / ← |

(Beispiele, kein beschlossener Wortschatz; der wird beim Ausprobieren
festgelegt.)

**Die Einschränkung beim Synonym-Prinzip:** Synonyme helfen nur, wenn sie
*anders klingen*. Kurze Zahlen sind selbst Verwechslungskandidaten:
„zwei“ und „drei“ klingen fast gleich (Sechzehntel vs. 32stel!), das gilt
auch für Dialekt und schlechtes Mikrofon. Heißt: Wörter wie „Viertel“ und
„Achtel“ sind sicherer als die Zahl; die Zahl ist schneller. Darum beides
erlauben, und **wenn die Erkennung unsicher ist, passiert nichts** (lieber
ein Befehl zu wenig als ein falscher mitten im Satz).

**Tonhöhen:** Wenn du „nur Befehle“ sagst, verstehe ich: **Tonnamen bleiben
auf Tastatur oder MIDI-Keyboard**, die Stimme übernimmt Rhythmus, Zeichen und
Navigation. Das ist auch die sinnvolle Arbeitsteilung: Tonnamen sind die
unzuverlässigsten Wörter überhaupt („d/t“, „e/ä“, „h/a“), Notenwerte die
zuverlässigsten. Stimmt das, oder willst du auch Tonnamen sprechen?

**Praktische Punkte:**

- **Taste zum Sprechen statt Dauer-Mikrofon.** Wer Gitarre oder Klavier
  spielt, hat Musik im Mikrofon; die darf keine Befehle auslösen. Vorschlag:
  Sprechtaste gedrückt halten, ggf. Fußschalter. Gleiche Taste kann später
  für Einsingen dienen.
- **Offline**, nicht Cloud (Vision: Cloud ist Nicht-Ziel). Läuft nativ in
  Rust (Regel 7), Modell wird mitgeliefert oder einmalig geladen. Die
  konkrete Technik prüfe ich erst, wenn es ansteht, und lege sie dir mit
  Empfehlung vor (neues ADR).
- **Rückmeldung:** erkanntes Wort kurz in der Statuszeile anzeigen, damit man
  sieht, was verstanden wurde.
- **Mikrofonrechte:** Windows/macOS fragen nach Erlaubnis; kommt ohnehin für
  Audio→Noten.
- **Sprache:** zuerst Deutsch (passend zum Rest); weitere Sprachen später
  nur als zusätzliche Wortliste.

**Ehrliche Einschätzung:** Für reines Notenschreiben am Computer ist die
Tastatur kaum zu schlagen. Der Gewinn liegt dort, wo die **Hände nicht frei**
sind (Instrument in der Hand), oder wenn eine Hand auf der Maus liegt. Der
**Aufwand ist mit festem Wortschatz kleiner** als anfangs gedacht (Aufwand
jetzt M statt L), das Risiko ist die Erkennungsqualität im Alltag, die man nur
mit echten Aufnahmen prüfen kann.

**Offen:**

- Tonnamen auch sprechen, oder bleibt es bei Befehlen?
- Wann würdest du es nutzen: Instrument in den Händen oder einfach schneller?
- Liedtext diktieren ist eine **eigene Idee** (Abschnitt 4, Liedtext), weil
  dort freie Sprache nötig ist; dafür reicht das Betriebssystem-Diktat
  (Windows: Win+H, macOS: Diktat).

## 2. Audio → Noten

| Idee | Status | Aufwand | Herkunft | Notiz |
|---|---|---|---|---|
| Melodie einsingen (einstimmig) | 📌 | XL | Vision | Erster Audio-Fall, bestätigt |
| Einzähler + Klick beim Aufnehmen | 💡 | S | Vorschlag | Ohne festen Takt kommt nur Matsch heraus |
| Korrekturansicht: erkannte Noten über der Aufnahme, einzelne Töne verschieben/löschen, Aufnahme anhörbar | 💡 | L | Vorschlag | Erkennung ist nie perfekt – die Nachbearbeitung entscheidet, ob es nützlich ist |
| Tonart automatisch vorschlagen | 💡 | M | Vorschlag | Erst nach der Erkennung sinnvoll |
| Gesungene Silben → Liedtext | ❌? | XL | Vorschlag | Spracherkennung beim Singen ist ein anderes, hartes Problem. Eher nicht |
| Gitarre/Klavier mehrstimmig → Noten | 💡 | XL | Vision | „Experimentell“. Erst anfassen, wenn einstimmig überzeugt |
| Fertige Aufnahme (MP3/WAV) importieren und transkribieren | 💡 | L | Vorschlag | Gleiche Technik wie Aufnahme, andere Quelle |

Technische Optionen (Pitch-Erkennung, Modelle) werden erst bewertet, wenn der
Schritt ansteht – dann mit Empfehlung und ADR. Regel 7 gilt: Erkennung läuft
nativ in Rust, die Musiklogik danach (Quantisieren, Schreibweise) in TypeScript.

## 3. Workstation – Oberfläche

| Idee | Status | Aufwand | Herkunft | Notiz |
|---|---|---|---|---|
| Befehlspalette (Strg+K): alles per Tippen finden | 📌 | M | Vision | Schritt 2 |
| Andockbare Panels, Layouts speichern | 📌 | L | Vision | Schritt 2 |
| Workspaces pro Instrument („Gesang“, „Gitarre“) | 📌 | M | Vision | Schritt 2 |
| Fokusmodus: nur Noten, alles andere weg | 💡 | S | Vorschlag | Billig, sobald Panels existieren |
| Rahmenloses Fenster mit schwebenden Glas-Bedienelementen (wie Folio) | ❓ | M | Owner | Steht in der Roadmap als „mit Owner abstimmen“ |
| Hell-Modus | 💡 | S | Vorschlag | Nur wenn jemand ihn wirklich will; Anthrazit ist die Identität |
| Oberfläche auch auf Englisch | ❓ | M | Vorschlag | Open Source ohne Englisch = kaum Nutzer außerhalb des deutschsprachigen Raums. Besser früh einplanen als später alle Texte nachziehen |

## 4. Notation & Instrumente

| Idee | Status | Aufwand | Herkunft | Notiz |
|---|---|---|---|---|
| Liedtext unter den Noten (Silben, Bindestriche, Melismen) | 💡 | M | Vision | **Gesang ist das erste Instrument** – ohne Text ist es kein Lied. Empfehlung: vor Audio→Noten. Texteingabe per Betriebssystem-Diktat denkbar |
| Akkordsymbole über den Noten | 💡 | M | Vision | Gitarre + Gesang |
| Griffbilder (Akkorddiagramme) | ❓ | M | Vision | Offene Frage in `vision.md` |
| Tabulatur | 💡 | L | Vision | „Vorerst nicht nötig“ |
| Capo-Funktion (Akkorde klingend vs. gegriffen) | 💡 | S | Vorschlag | Gitarristen-Alltag, kleine Rechnung auf Akkordsymbolen |
| Zweite Stimme im selben System (z. B. Klavier rechte Hand) | ❓ | L | Vorschlag | Große Modellfrage: Stimmen im Zeitstrahl. Vor Klavier-Tiefgang klären |
| Synkopen und Balken über Taktmitte sauber | 📌 | M | Roadmap | Schritt 1 |
| N-Tolen (Triolen, Quintolen …) | 💡 | L | Roadmap | „Später“ |
| Dynamik, Artikulation, Bögen (Legato), Verzierungen | 💡 | L | Vorschlag | Fehlt noch fast alles an Ausdruckszeichen |
| Wiederholungen, Klammern (Volta), Coda/Segno | 💡 | L | Vorschlag | |
| Instrumente hinzufügen/entfernen/umbenennen | 📌 | M | Roadmap | Schritt 1 |
| Transponieren (ganze Partitur, auch Einzelstimmen) | 📌 | M | Roadmap | Schritt 1 |
| Weitere Instrumente (Bass, Schlagzeug, Streicher, Chor …) | 💡 | S je | Vorschlag | Instrumente sind Daten (Regel 6), also günstig. Schlagzeug braucht eigene Notationsregeln |
| Mehrere Systeme/Seiten, Seitenlayout, Stimmenauszüge | 💡 | L | Vorschlag | Für Druck unvermeidlich |

## 5. Klang & Üben

| Idee | Status | Aufwand | Herkunft | Notiz |
|---|---|---|---|---|
| Wiedergabe mit mitlaufendem Cursor | 📌 | L | Vision | Schritt 3 |
| Metronom / Klick | 💡 | S | Vorschlag | Fällt bei Wiedergabe ab |
| Schleife über markierte Takte | 💡 | S | Vorschlag | Zum Üben und Gegenhören |
| Tempo beim Abspielen ändern, ohne die Partitur zu ändern | 💡 | S | Vorschlag | |
| Stummschalten/Solo pro Instrument | 💡 | S | Vorschlag | |
| Echo/Vorhören: Note erklingt beim Eingeben | 💡 | S | Vorschlag | Gibt sofort Rückmeldung, ob man die richtige Taste erwischt hat |

## 6. Austausch & Ausgabe

| Idee | Status | Aufwand | Herkunft | Notiz |
|---|---|---|---|---|
| MusicXML Export/Import | 📌 | L | Vision | Brücke zu Finale, MuseScore, Dorico – der Weg für Finale-Umsteiger |
| PDF-Export | 📌 | M | Vision | Schritt 3 |
| MIDI-Export | 💡 | S | Vorschlag | |
| Audio-Export (WAV/MP3) | 💡 | M | Vorschlag | Nach Wiedergabe |
| Liederbuch/Setlist: mehrere Partituren zu einem Dokument, Reihenfolge, Inhaltsverzeichnis | 💡 | L | Vorschlag | Passt zu Gesang/Gitarre – Bibliothek ist schon da |
| Teilen per Link/QR | ❌ | – | Vision | Online ist Nicht-Ziel |

## 7. Bibliothek

| Idee | Status | Aufwand | Herkunft | Notiz |
|---|---|---|---|---|
| Partituren per Ziehen in Sammlungen verschieben | 📌 | S | Roadmap | Schritt 1 |
| Tags und Filter (z. B. „Gitarre“, „fertig“, „Entwurf“) | 💡 | M | Vorschlag | |
| Versionsverlauf („Stand von gestern“) | 💡 | M | Vorschlag | Autosave überschreibt – das ist die Absicherung dagegen |
| Backup/Sicherung in anderen Ordner | 💡 | S | Vorschlag | |

## 8. Plattform & Projekt

| Idee | Status | Aufwand | Herkunft | Notiz |
|---|---|---|---|---|
| Signierte Installer (kein SmartScreen/Gatekeeper-Warnscreen) | 💡 | M | Roadmap | Kostet Geld (Zertifikate) – Owner-Entscheidung |
| Erste öffentliche Release | 📌 | S | Roadmap | Owner legt sie auf GitHub an |
| Erweiterungen/Skripte vom Owner selbst schreibbar | 💡 | XL | Roadmap | Erst nach Makros |
| Mac-Build testen | ❓ | S | Vision | Wird gebaut, aber wer testet? |

---

## Empfohlene Reihenfolge (Vorschlag, nicht verbindlich)

1. **Schritt 1 sauber abschließen** – Instrumente ändern, Transponieren, Synkopen,
   Release, Owner prüft die Tasten. Ein halb fertiger Schritt 1 macht alles
   danach unzuverlässig.
2. **Kopieren/Auswählen von Takten** – größter Hebel auf Schreibtempo, steht
   noch nirgends.
3. **Liedtext + Akkordsymbole** – ohne die ist „Gesang“ und „Gitarre“ nur halb.
4. **Wiedergabe + PDF** – damit man hört und weitergibt, was man schreibt.
5. **Workstation (Schritt 2)** – Panels und Paletten lohnen sich erst, wenn es
   genug gibt, was man darin zeigen kann.
6. **MusicXML** – spätestens vor der ersten breiten Veröffentlichung, sonst
   haben Finale-Umsteiger keinen Weg hinein.
7. **Audio→Noten** – Herzstück der Vision, aber das größte Risiko. Vorher
   einen kleinen Versuchsaufbau (nur Tonhöhenverlauf anzeigen), um zu sehen,
   wie gut es mit echter Stimme klappt.

Die Reihenfolge weicht bewusst von der Roadmap ab (Audio ist dort Schritt 4,
Auswahl/Liedtext fehlen). Wenn du zustimmst, ziehe ich die Roadmap nach.

## Offene Fragen an den Owner

- Welche **eigenen Ideen** fehlen hier? (Alles oben ohne „Owner“ ist geraten.)
- Was soll ein Icastico-Nutzer in der **ersten Minute** erleben, damit er
  bleibt?
- Wer sind die ersten **fünf Menschen** außer dir, die es nutzen sollen, und
  was schreiben die damit?
- Englische Oberfläche: früh mitplanen oder erst nach der ersten Release?
- Welche Finale-Funktion hast du am meisten benutzt – und welche nie?

## Verworfen

*(noch leer – hier landen Ideen, die wir bewusst nicht machen, mit Begründung)*
