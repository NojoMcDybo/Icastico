# 0034 – Startbild: ein Akkord als Sand auf der Platte

- Status: angenommen
- Datum: 2026-11-10

Idee des Owners: beim Öffnen ein kurzer Startklang wie beim Mac, und der Klang wird sichtbar (Vorbilder: Chladni- und Cymatics-Projekte).

## Was passiert

- Beim Start deckt ein dunkles Bild das Fenster. Ein **E7♯9** baut sich von unten auf: E, G♯, D, G, H, alle 0,2 Sekunden ein Ton, danach klingen
  alle gemeinsam aus (insgesamt etwa 2,5 Sekunden, kurz und ohne Nachhall).
- Der Klang wird als **Chladni-Figur** gezeigt: Sand auf einer quadratischen Platte. Jeder Ton lässt die Platte in einer eigenen Schwingungsform
  schwingen (höhere Töne = feinere Muster, `n² + m²` wächst mit der Frequenz); der Sand wird dort weggeschüttelt, wo die Platte sich bewegt, und
  bleibt auf den ruhenden Linien liegen. Mit jedem neuen Ton ändert sich das Bild; zum Schluss bleibt die Figur stehen.
- Darunter „Icastico“ und der Akkordname. Das Bild bleibt mindestens 3,3 Sekunden, nie länger als das Laden dauert, und blendet dann in 0,6 Sekunden aus.
  **Klick oder eine beliebige Taste** überspringt es (die Taste geht nicht an die Anwendung dahinter).
- Nicht gezeigt bei „Bewegung reduzieren“ (Systemeinstellung) und im automatischen Test (außer mit `?splash` in der Adresse).

## Umsetzung

- Zahlen und Formeln ohne Zeichnen und Klang in `src/core/chladni.ts` (mit Tests); Zeichnen und Klang in `src/ui/splash.ts`.
- Der Klang kommt vom kleinen eingebauten Synthesizer (ADR 0015) – es muss nichts geladen werden (die große Klangdatei lädt erst später).
- Sand: 14 000 Körner, jedes springt pro Bild zufällig, so weit, wie die Platte dort schwingt; Zeichnen auf einer Leinwand, die Schwingungsformen
  stehen in einem Raster (192 × 192), damit es flüssig bleibt.
- **Eigene Umsetzung**, kein Code aus den genannten Projekten: ihre Lizenzen sind nicht geprüft, und die Formel einer Chladni-Platte ist
  allgemein bekannt.
- Windows: `additionalBrowserArgs` in `tauri.conf.json` erlaubt Klang ohne vorherigen Klick (`--autoplay-policy=no-user-gesture-required`).
  Die sonst von Tauri vorgegebenen Argumente stehen mit drin.

## Grenzen

- Ohne Erlaubnis zum Abspielen (Browser, vermutlich auch macOS) läuft das Bild stumm; der Klang wird nicht nachgeholt.
- Es gibt keinen Schalter zum Ausschalten, nur das Überspringen.
- Nur im Browser geprüft; Klang und Windows-/Mac-Fenster nicht gehört.
