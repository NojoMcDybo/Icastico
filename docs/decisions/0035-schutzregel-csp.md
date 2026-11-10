# 0035 – Schutzregel für geladene Inhalte (CSP)

- Status: angenommen
- Datum: 2026-11-10

## Kontext

Icastico öffnet Dateien, die nicht von uns stammen (MusicXML, MIDI, `.icastico` aus dem Netz). Titel, Liedtext und Akkordsymbole daraus
landen als Text in der gezeichneten Partitur. Die native Seite (Rust) darf Dateien an beliebigen Orten lesen und schreiben. Bisher war dem
Fenster nichts verboten (`"csp": null`): Hätte eine Datei es je geschafft, ein Skript in die Seite zu schmuggeln, hätte dieses Skript
alles gedurft, was die App darf. Gefunden wurde so eine Lücke nicht – Texte werden beim Zeichnen maskiert –, aber es gab kein zweites Netz.

## Entscheidung

Die gebaute App bekommt eine Regel, was sie laden und ausführen darf (Content Security Policy), als `<meta>`-Zeile in `index.html`.
`vite.config.ts` setzt sie beim Bauen ein; sie gilt damit im Desktop-Fenster **und** im Browser-Build, den der Oberflächentest prüft.

- Skripte, Bilder, Klänge, Schriften: nur die eigenen Dateien der App (dazu `blob:`/`data:` für Vorschaubilder, Downloads und die
  Arbeits-Threads, die die App selbst anlegt).
- Verbindungen: nur zur App selbst und zur nativen Seite (`ipc:`). Nichts kann Daten an fremde Adressen schicken.
  Die Update-Prüfung läuft in Rust und ist davon nicht betroffen.
- Verboten bleiben: Skripte im HTML, `onclick=…` und Ähnliches, fremde Skripte, Plugins. Der eine `onclick` am „?“-Knopf ist in den Code gewandert.
- Erlaubt werden muss WebAssembly (Notensatz, Spracherkennung) und `unsafe-eval`: Die Spracherkennung (vosk-browser, ein alter
  Emscripten-Bau) benennt ihre Funktionen mit `new Function` und startet sonst nicht. Unser eigener Code wertet nirgends Text als Programm aus.
- Im Entwicklungsmodus (`npm run dev`) gilt die Regel nicht – das automatische Neuladen von Vite braucht mehr.

## Alternativen

- **Regel in `tauri.conf.json`** (`app.security.csp`): gälte nur im Desktop-Fenster; der Oberflächentest im Browser würde einen Verstoß nicht bemerken.
- **Ohne `unsafe-eval`**: dann lädt die Spracherkennung nicht (geprüft: „Sprachmodell wird geladen …“ bleibt stehen).
  Erst möglich mit einem anderen Erkenner oder einem neu gebauten Vosk.
- **So lassen**: kein zweites Netz, obwohl der Import fremder Dateien eine Kernfunktion ist.

## Folgen

- Neue Bibliotheken, die Skripte nachladen, fremde Adressen ansprechen oder Inline-Skripte brauchen, funktionieren im Build nicht,
  auch wenn sie im Entwicklungsmodus laufen. Deshalb: neue Bibliotheken immer mit `npm run build && npm run e2e` prüfen
  (der letzte Schritt „Keine Fehler in der Konsole“ meldet Verstöße).
- Wird Vosk ersetzt, `unsafe-eval` wieder streichen.
