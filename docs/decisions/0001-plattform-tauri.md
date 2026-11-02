# 0001 – Plattform: Tauri 2, TypeScript, Rust

- Status: angenommen
- Datum: 2026-11-02

## Kontext

- Zuerst Windows, später macOS – ohne zweites Programm.
- Der Owner programmiert nicht; Claude schreibt den Code und muss die
  Oberfläche selbst prüfen können (Headless-Browser in der Cloud-Umgebung).
- Der Owner soll nie einen Compiler installieren müssen.
- Der Kern des Produkts ist Bedienung/Workflow – dort muss schnell iteriert werden.

## Entscheidung

- **Tauri 2** als Desktop-Hülle (Windows: WebView2, macOS: WKWebView).
- **TypeScript** für Modell, Notationslogik, Commands und UI.
- **Rust** für native Dienste: MIDI, Audio, KI-Inferenz, Dateisystem.
- GitHub Actions bauen die Installer.

## Alternativen

- **MuseScore forken (Qt/C++)**: Notensatz und Wiedergabe fertig, aber genau
  der Teil, der Icastico ausmacht (UI/Workflow), müsste herausgerissen werden;
  riesige Codebasis, komplexer Build, Merge-Aufwand bei jedem Upstream-Update.
- **Qt 6 / C++ eigen**: sehr leistungsfähig, aber langsamere UI-Iteration und
  für Claude ohne Windows-Rechner schwerer zu verifizieren.
- **Electron**: überall gleiches Chromium (weniger Plattformunterschiede), aber
  ~150 MB Installer und kein Rust-Kern für Audio. Bleibt Plan B, falls
  WebView-Unterschiede zu teuer werden – der TS-Code wäre übertragbar.

## Folgen

- UI-Entwicklung schnell, Screenshots direkt aus der Cloud-Umgebung.
- Zwei Sprachen (TS + Rust) mit klarer Grenze.
- macOS nutzt die Safari-Engine: kein Web MIDI → MIDI muss über Rust laufen
  (ist ohnehin die bessere Architektur).
