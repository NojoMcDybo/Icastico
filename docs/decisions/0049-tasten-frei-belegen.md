# 0049 – Tasten frei belegen

- Status: angenommen
- Datum: 2026-11-16

Die Tastenbibliothek (ADR 0011) liefert drei fertige Belegungen (Finale, Logic, Finale-Ziffernblock). Wer eine Taste anders haben will, musste bisher den Code ändern.

## Entscheidung

- **Nur die Abweichung wird gespeichert**, lokal und je Belegung: `localStorage['icastico.keys.<belegung>']` = `{ "<funktions-id>|<variante>": ["Mod+Alt+T"] }`. Eine leere Liste heißt
  „Taste weggenommen“. Ohne Abweichungen gilt wie bisher die Bibliothek; neue Funktionen künftiger Versionen bekommen ihre Standardtasten, ohne dass ein Nutzer etwas bemerkt.
- **Die Bibliothek wird überlagert, nicht umgebaut**: `withOverrides(KEY_LIBRARY, belegung, abweichungen)` (`src/ui/keymaps/library.ts`) liefert eine Bibliothek, aus der `buildKeymap`
  und `paletteEntries` wie gewohnt Belegung, Tastenhilfe und Befehlspalette bauen. Die Ziffernblock-Belegung erbt weiter von Finale; ändert man dort eine Funktion, werden die
  geerbten Tasten der übrigen Varianten dieser Funktion mitgenommen.
- **Eine Taste hat eine Funktion** (`holderOf`): Wer eine Taste neu vergibt, die schon belegt ist, wird gefragt; bei „Ja“ verliert die andere Funktion sie. `Esc` ist nicht belegbar
  (bricht die Aufnahme der Taste ab). Mausfunktionen sind nicht änderbar.
- **Fenster „Tasten anpassen“** (`src/ui/keysDialog.ts`, F1 → Knopf „Tasten anpassen …“, auch ohne offene Partitur): Suchfeld, je Funktion Taste, „Ändern“, „✕“ (wegnehmen),
  „↺“ (Standard, nur bei Abweichung), geänderte Zeilen mit blauem Punkt, „Alle zurücksetzen“ (mit Rückfrage). Jede Änderung gilt sofort (`Workstation.applyKeymap`) und bleibt
  nach dem Neustart.
- `docs/tastenbelegung.md` und die Tests beschreiben weiter den **Standard**.

## Grenzen

- Pro Funktion eine eigene Taste (ein Klick auf „Ändern“ ersetzt alle bisherigen Tasten dieser Funktion); mehrere Tasten für eine Funktion gibt es nur im Standard.
- Die Einstellungen gelten für diesen Rechner; Export/Import der eigenen Tasten gibt es noch nicht.
- Der Hilfetext einer Belegung („Beschreibung“) und Hinweise der Bibliothek („Annahme“, „Icastico“) beziehen sich auf den Standard.
