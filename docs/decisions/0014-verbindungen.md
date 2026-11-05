# 0014 – Haltebögen und Gleiten als Verbindungen zwischen Tönen

- Status: angenommen
- Datum: 2026-11-04

## Kontext

Bisher war ein Haltebogen nur eine längere Note (zwei gleiche Noten wurden mit
`T` zu einer verschmolzen). Damit ließ sich nicht sagen „diese zwei Viertel
sind gebunden, die anderen nicht“ – und gleitende Töne (Portamento) hatten
keinen Platz im Modell. Vorbereitet war das durch die Ton-IDs (ADR 0012).

## Entscheidung

- **Verbindungen sind eigene Datensätze** im `Score` (`links`): `{ id, kind,
  from, to }` mit `kind` = `tie` oder `slide` und den **Ton-IDs** der beiden
  Enden. Sie hängen an Tönen, nicht an Events: Verschieben, Verlängern und
  Umsortieren ändern sie nicht.
- **Haltebogen (`tie`):** zwei *getrennte* Noten gleicher Tonhöhe, die
  unmittelbar aufeinander folgen, in derselben Stimme. Bewusste Unterteilung
  bleibt erhalten (zwei gebundene Viertel ≠ eine Halbe). Haltebögen über
  Taktstriche bleiben wie bisher aus langen Noten *abgeleitet*.
- **Gleiten (`slide`):** zwei Töne derselben Stimme, der zweite beginnt nicht
  vor dem Ende des ersten. **Die Lücke dazwischen ist die Gleitdauer** – es gibt
  keine gespeicherte Dauer. Ziehen am Balkenende oder -anfang ändert sie.
  Berühren sich die Balken, gibt es nur den **direkten Wechsel**, die
  Verbindung bleibt gespeichert und gleitet wieder, sobald man die Balken
  auseinanderzieht.
- Pro Ton höchstens eine ausgehende und eine ankommende Verbindung; Halten und
  Gleiten schließen sich auf demselben Ton aus (ein neues ersetzt das alte).
- **Schutz vor Zerreißen:** Jede Änderung geht durch `withValidLinks`. Fällt ein
  Ton weg, verschwinden seine Verbindungen im selben Rückgängig-Schritt. Eine
  Änderung, die eine Verbindung unmöglich machen würde (gebundene Noten
  auseinanderziehen, eine gebundene Note kürzen), wird mit Meldung **abgelehnt**,
  nichts wird still repariert.
- **Gebundene Noten sind eine Note:** Wird ein gebundener Ton umgestimmt (Taste,
  Ziehen in der Notenschrift oder in der Roll), ziehen alle Töne der Kette mit
  (`carryTies`, gleiche Schreibweise). Nur wenn ein Partner dadurch mit einem
  anderen Ton seines Akkords zusammenfiele, wird die Änderung abgelehnt.
- **Bedienung:** `T` setzt/löst einen Haltebogen zur nächsten Note, `Strg+Umschalt+G`
  setzt/löst Gleiten. Bei einem gewählten Akkordton wirkt es nur auf ihn, sonst
  auf alle Töne der Note (Haltebogen: gleiche Tonhöhen; Gleiten: je Ton der
  nächstliegende Zielton). `T` vor dem Eingeben einer Note bindet die nächste
  gleiche Note an.
- **Notenschrift:** Haltebogen als `<tie>`, Gleiten als `<gliss>` mit „port.“;
  die Lücke eines Gleitens wird als **unsichtbare Pause** (`<space>`) gesetzt, ohne
  Lücke als gepunktete Linie. **Roll:** Haltebogen als kleiner Bogen, Gleiten als
  Linie vom Ende des ersten zum Anfang des zweiten Balkens.
- **Dateiformat 4:** optionale Liste `links`; Version 3 wird beim Öffnen
  unverändert übernommen, vor dem ersten Speichern wird gesichert (ADR 0012).

## Akkordton lösen

Ein einzelner Akkordton lässt sich mit `Strg+Umschalt+D` in eine **eigene Stimme
derselben Zeile** lösen (gleiche Ton-ID, Beginn und Länge). Danach lässt sich
seine Länge unabhängig ändern; Rückgängig stellt den Akkord her. Es entsteht nur
auf diesen ausdrücklichen Befehl eine Stimme. Stimmen ohne Noten werden nicht
gezeichnet. Die Roll zeigt alle Stimmen einer Zeile (weitere gestrichelt).

## Folgen

- Die **Wiedergabe** (Klang, Tonhöhenverlauf) ist noch nicht gebaut; die Daten
  und Regeln dafür stehen. Legato/Phrasierungsbögen folgen als eigene Art.
- Der frühere Befehl „zwei gleiche Noten zu einer verschmelzen“ entfällt: `T`
  bindet jetzt.
- Verbindungen über Stimmen oder Instrumentenstimmen hinweg gibt es nicht.
