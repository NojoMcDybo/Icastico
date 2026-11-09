/**
 * "Neu in dieser Version": after an update a small pane lists what is new – short, in musicians' words.
 * The list is data; every release adds an entry at the top.
 */
import { APP_VERSION } from '../version';

export interface PatchNote {
  readonly version: string;
  readonly items: readonly string[];
}

/** Newest first. Keep each line to one short sentence. */
export const PATCH_NOTES: readonly PatchNote[] = [
  {
    version: '0.23.0',
    items: [
      'Strg+P und „Als PDF speichern“ öffnen denselben Dialog: Seitenvorschau, Seite, Notengröße und Takte pro Zeile live anpassen, dann drucken oder als PDF speichern.',
      'Liedtext: das Fenster lässt sich verschieben; Silben in der Partitur anklicken, mit Entf löschen, mit Strg+C / X / V kopieren oder verschieben, per Ziehen auf eine andere Note setzen.',
      'Taktstriche und Wiederholungszeichen laufen durch alle Zeilen; die Tabulatur zeigt T A B statt eines Schlüssels und darüber die Stimmung (auch in MusicXML).',
      'Kopieren und Ziehen in die Tabulatur verliert keine Noten mehr; ein angeklickter Akkordton wird allein markiert.',
    ],
  },
  {
    version: '0.22.0',
    items: [
      'Tabulatur: Stimmung wählen (Drop D, offene Stimmungen, jede Saite einzeln); Zahl tippen ändert den Bund, ↑ / ↓ wechselt die Saite.',
      'Markierte Noten lassen sich mit der Maus in die Tabulatur ziehen; die Tabulaturzeile zeigt keine Notenwerte.',
      'Akkorde: Alt+↑ / ↓ wählt die einzelnen Töne, ↑ / ↓ ändert danach nur diesen Ton.',
      'Segno, Coda, Sprünge und Tempoanweisungen stehen genau auf der Note, auf die du sie setzt.',
      'Takte pro Zeile in den Partitur-Einstellungen; Zeilenumbrüche aus MusicXML-Dateien bleiben erhalten.',
    ],
  },
  {
    version: '0.21.0',
    items: [
      'Tabulatur als eigenes Instrument: über „+ Tabulatur“ in den Partitur-Einstellungen als eigene Zeile neben der Notenschrift; Noten aus anderen Zeilen lassen sich mit Strg+C und Strg+V hineinkopieren.',
      'Neue Funktionen: Metronom (M), Cycle, Zoom (Strg+Plus / Minus / 0), Quantisieren (Q), Drucken (Strg+P), Kreuz / B und Oktave für die nächste Note.',
      'PDF speichern liegt jetzt auf Strg+Umschalt+F, weil Strg+P druckt. Alle Funktionen stehen in der Tastenhilfe, auch die ohne Taste mit dem Hinweis, wo man sie findet.',
    ],
  },
  {
    version: '0.20.0',
    items: [
      'Liedtext-Feld (Taste L): den Text mit Bindestrichen eintippen, eine Silbe wählen und die Noten der Reihe nach anklicken – das Feld springt jedes Mal zur nächsten Silbe.',
      'Taste T: bei gleicher Tonhöhe ein Haltebogen (eine durchgehende Note), bei anderer Tonhöhe ein Bindebogen zur nächsten Note.',
      'Die Vorschau-Note klingt beim Verstellen mit den Pfeiltasten nicht mehr; erst Enter setzt sie und lässt sie hören. Das Komma des Ziffernblocks punktiert auch in der Logic-Belegung.',
    ],
  },
  {
    version: '0.19.0',
    items: [
      'Import aus Logic: MIDI-Dateien werden zur Partitur – du wählst Spuren, Instrument, Taktart, Tempo und Tonart, die Noten werden auf Notenwerte gerundet (auch Triolen).',
      'Einzelstimmen-Aufnahmen (WAV, AIFF, MP3, M4A) werden in Noten umgewandelt; das Tempo ist geschätzt, am besten trägst du das Projekttempo ein.',
      'Beides unter „⋯ → Importieren …“ in der Bibliothek (Strg+Umschalt+I). Bei Aufnahmen bitte Tonhöhen und Rhythmus danach durchsehen.',
    ],
  },
  {
    version: '0.18.1',
    items: [
      'Neuigkeiten erscheinen jetzt auch beim ersten Start nach einem Update von älteren Versionen; „Neuigkeiten“ in der Tastenhilfe und in der Bibliothek zeigt sie jederzeit.',
      'Partitur-Einstellungen: Instrumente und Tabulatur nachträglich hinzufügen.',
      'Mehrere Noten und Takte markieren: Umschalt + Pfeil, Umschalt + Klick, einen Rahmen aufziehen oder auf einen Takt doppelklicken.',
      'Transponieren steht jetzt im Fenster der Tonart (Klick auf die Tonart oben); das Menü der drei Punkte hat keine Leerzeile mehr.',
    ],
  },
  {
    version: '0.18.0',
    items: [
      'Transponieren (Strg+Umschalt+T): um ein Intervall, chromatisch oder diatonisch – das Intervall wählst du an einem Rad wie beim iPhone-Timer.',
      'Bereiche markieren (Alt+Umschalt+Pfeil oder Umschalt + Klick): löschen, ausschneiden, kopieren, einfügen oder mit Strg+L als Schleife abspielen.',
      'Zeichen: neue Rubrik Taktstriche mit Doppelstrich, Schlussstrich und Klammer / Akkolade um Zeilen; dazu Atemzeichen, Zäsur, Arpeggio und rit., accel., a tempo.',
      'Gesetzte Zeichen anklicken, frei verschieben und mit der Rücktaste löschen – auch Taktstriche und Wiederholungsklammern.',
      'Tabulatur jederzeit hinzufügen (Strg+T) und den markierten Bereich in die Tabulatur übersetzen (Strg+Umschalt+B).',
      'Quintenzirkel mit zwei Ringen, Suche in der Tastenhilfe, Export-Untermenü (PDF, MusicXML, MIDI, Icastico-Datei) im Bibliotheks-Menü und diese Neuigkeiten.',
    ],
  },
  {
    version: '0.17.0',
    items: [
      'Piano-Roll mit Klaviatur links, Synth-Klang-Schalter und mehreren Noten, die in eine Note gleiten.',
      'Die klingende Note wird beim Abspielen blau; jede neue oder geänderte Note klingt kurz an.',
      'Akkord-Notenköpfe einzeln mit Pfeiltasten änderbar; Tempo wie bei Logic ziehen; Tonart per Quintenzirkel.',
    ],
  },
  {
    version: '0.16.0',
    items: ['Noten diktieren: Notennamen sprechen (Aufnahmeknopf oder Taste R), eine Note pro Atemzug.'],
  },
  {
    version: '0.15.0',
    items: ['Aufnahmeknopf: hört auf Sprache und ein MIDI-Keyboard – gespielte Tasten werden zu Noten.'],
  },
];

const parts = (version: string): number[] => version.split('.').map((n) => Number.parseInt(n, 10) || 0);

/** True when version `a` is older than `b` (numbers compared part by part). */
export function isOlder(a: string, b: string): boolean {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

/** The entries newer than `seen` up to `current`, newest first; at most the last three versions. */
export function notesSince(seen: string, current: string = APP_VERSION): readonly PatchNote[] {
  return PATCH_NOTES.filter((n) => isOlder(seen, n.version) && !isOlder(current, n.version)).slice(0, 3);
}

/** Opens the pane. Resolves when it was closed. */
export function showPatchNotes(notes: readonly PatchNote[]): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const box = document.createElement('div');
    box.className = 'modal__box patchnotes';
    const title = document.createElement('h2');
    title.textContent = 'Neu in Icastico';
    box.append(title);
    for (const note of notes) {
      const h = document.createElement('h3');
      h.textContent = `Version ${note.version}`;
      const list = document.createElement('ul');
      for (const item of note.items) {
        const li = document.createElement('li');
        li.textContent = item;
        list.append(li);
      }
      box.append(h, list);
    }
    const row = document.createElement('div');
    row.className = 'modal__buttons';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'is-primary';
    ok.textContent = 'Verstanden';
    row.append(ok);
    box.append(row);
    overlay.append(box);
    const close = () => {
      window.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    ok.addEventListener('click', close);
    window.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    ok.focus();
  });
}

/** The notes of the latest versions, for the "Neuigkeiten" buttons. */
export const latestNotes = (): readonly PatchNote[] => PATCH_NOTES.slice(0, 3);

/** At start: show what is new if the program was updated since it was last started; remember the version. */
export async function announceUpdate(seen: string | null, remember: (version: string) => void): Promise<void> {
  remember(APP_VERSION);
  if (seen === null || !isOlder(seen, APP_VERSION)) return; // first start, or nothing new
  const notes = notesSince(seen);
  if (notes.length > 0) await showPatchNotes(notes);
}
