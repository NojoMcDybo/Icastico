# 0036 – Mehrere Strophen Liedtext

- Status: angenommen
- Datum: 2026-11-10

Bis zu **vier Strophen** je Note; in der Notenschrift stehen sie untereinander (Bauplan „Liederrunde“, Paket 1).

## Modell und Datei

- Strophe 1 bleibt `NoteEvent.lyric`, damit aller vorhandene Code und jede alte Datei gültig bleiben.
- Strophen 2 bis 4 liegen in `NoteEvent.verses` (`{ 2: "la-", 3: "lu" }`). `MAX_VERSES = 4`.
- Hilfen in `core/lyrics.ts`: `lyricOf(note, strophe)`, `withLyric(note, strophe, silbe)` (ein leeres `verses` verschwindet), `versesUsed`.
- **Dateiformat 15 → 16**: optionales `verses` (Objekt mit Schlüsseln `"2"` … `"4"`), streng gelesen: eine andere Strophe oder eine leere
  Silbe wird abgelehnt. Dateien der Version 15 öffnen sich unverändert (Test mit Datei aus 0.25.0).
- `validateScore` prüft jede Strophe wie die erste (nicht leer, kein Leerzeichen) und den Schlüssel.

## Bedienung

- Im **Liedtext-Feld (L)** wählen vier Pillen „Strophe 1“ bis „Strophe 4“, welche Strophe eingegeben wird. Der Entwurf wird je Strophe
  gemerkt (Strophe 1 unter dem bisherigen Schlüssel); ein leerer Entwurf nimmt den Text der Strophe aus der Partitur.
- Die **Silben in der Partitur** (ADR 0033) gehören zu ihrer Strophe: Löschen, Kopieren, Ausschneiden, Einfügen und Ziehen wirken nur dort.
  Die Strophe steht in der Kennung der gezeichneten Silbe (`syl-…` = 1, `syl3-…` = 3).

## Notensatz, MusicXML

- Verovio: je Strophe ein `<verse n="k">`. Nummern „1.“, „2.“ … stehen nur, wenn die Stimme mindestens zwei Strophen hat, und nur an der ersten
  Note, die in dieser Strophe eine Silbe hat. Der Bindestrich-Zustand („das Wort geht weiter“) wird je Strophe geführt.
- MusicXML schreibt je Strophe ein `<lyric number="k">` und liest alle bis zur vierten (nach `number`, sonst der Reihe nach); ab der fünften meldet der
  Import „Strophen ab der fünften“. Das bisherige „Weitere Strophen“ entfällt.

## Grenzen

- Höchstens vier Strophen; keine Auswahl über mehrere Stimmen; Silben lassen sich nicht in eine andere Strophe ziehen.
- Welche Strophe das Feld gerade bearbeitet, ist Zustand der Oberfläche, nicht der Partitur.
