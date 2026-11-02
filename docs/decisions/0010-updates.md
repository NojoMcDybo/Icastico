# 0010 – Installer, Desktop-Verknüpfung und automatische Updates

- Status: angenommen
- Datum: 2026-11-02

## Kontext

Der Owner möchte einen Installer mit Desktop-Verknüpfung und automatischen
Updates. Er programmiert nicht – Updates müssen ohne sein Zutun ankommen,
dürfen aber nie ungefragt seine Arbeit unterbrechen.

## Entscheidung

- **Installer:** Windows NSIS-Setup (`…_x64-setup.exe`), macOS `.dmg`.
  Der Windows-Installer bietet am Ende „Desktop-Verknüpfung erstellen“ an
  (standardmäßig angehakt) und lässt sie bei Updates unangetastet – wer sie
  gelöscht hat, bekommt sie nicht zurück.
- **Updates:** `tauri-plugin-updater` fragt beim Start (nach 4 Sekunden,
  still) `latest.json` der neuesten GitHub-Release ab. Gibt es eine neuere
  Version: Dialog „Jetzt aktualisieren / Später“. Vor der Installation wird
  die offene Partitur gespeichert. Windows installiert im Modus „passive“
  (Fortschrittsbalken, keine Fragen) und startet Icastico neu.
- **Manuell:** „Nach Updates suchen“ unten in der Bibliothek.
- **Signatur:** Jedes Update ist mit einem privaten Schlüssel signiert; die
  App enthält den öffentlichen Schlüssel und lehnt alles andere ab. Der
  private Schlüssel liegt nur als GitHub-Secret `TAURI_SIGNING_PRIVATE_KEY`
  (und beim Owner als Sicherung) – nie im Repository.
- **Veröffentlichen** (`.github/workflows/release.yml`): Version in
  `package.json` und `src-tauri/Cargo.toml` erhöhen, committen, Tag
  `vX.Y.Z` pushen. Die Pipeline prüft Tag = Version und Secret vorhanden,
  baut signierte Installer, legt die Release an und hängt `latest.json` an.
  Testbuilds bei jedem Push auf `main` bleiben unsigniert.
- Fehler bei der *stillen* Prüfung (offline) bleiben still; hat der Owner
  „Jetzt aktualisieren“ gewählt, wird jedes Scheitern gemeldet.

## Alternativen

- **Microsoft Store / Mac App Store:** automatische Updates gratis, aber
  Konto, Prüfprozess, Kosten – zu früh.
- **Eigener Update-Server:** unnötig; GitHub Releases sind kostenlos und
  öffentlich, das Repo ist Open Source.

## Folgen

- **Geht der private Schlüssel verloren**, können installierte Apps keine
  Updates mehr annehmen: neuer Schlüssel, und jeder muss einmal von Hand neu
  installieren. Deshalb: Schlüssel sicher aufbewahren (Passwortmanager).
- Die Installer sind nicht von Microsoft/Apple signiert: Beim **ersten**
  Installieren warnen SmartScreen bzw. Gatekeeper. Updates laufen danach ohne
  Warnung. Code-Signing-Zertifikate kosten Geld – später entscheiden.
- Getestet in der Linux-Desktop-App mit gespieltem Update-Server: Dialog,
  Abfrage, Fehlermeldung bei gescheitertem Download. Ein echtes Update auf
  Windows wird erst mit der zweiten veröffentlichten Version sichtbar.
