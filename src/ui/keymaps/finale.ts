/**
 * Keyboard layout modelled on Finale's Simple Entry.
 *
 * This is DATA (ADR 0004): another layout = another file like this one.
 * Keys marked "Finale" follow the Finale manuals; the others are Icastico
 * choices where Finale's behaviour could not be verified – see
 * docs/decisions/0006-eingabe-nach-finale.md.
 */
import type { CommandId } from '../../core/editor/commands';

export type UiCommandId =
  | 'history.undo'
  | 'history.redo'
  | 'view.help'
  | 'file.new'
  | 'file.open'
  | 'file.save'
  | 'file.saveAs'
  | 'score.settings';

export interface KeyBinding {
  readonly combo: string;
  readonly command: CommandId | UiCommandId;
  readonly arg?: number;
}

export interface HelpGroup {
  readonly title: string;
  readonly entries: readonly { readonly keys: string; readonly text: string }[];
}

export interface Keymap {
  readonly name: string;
  readonly bindings: readonly KeyBinding[];
  readonly help: readonly HelpGroup[];
}

/** Letter → step index (C = 0 … B = 6). German H = B. */
const LETTERS: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6, H: 6 };

const digits = [1, 2, 3, 4, 5, 6, 7];

export const FINALE_KEYMAP: Keymap = {
  name: 'Finale (Simple Entry)',
  bindings: [
    { combo: 'Enter', command: 'input.toggle' },
    { combo: 'Escape', command: 'edit.escape' },
    ...digits.map((n) => ({ combo: `${n}`, command: 'input.duration' as const, arg: n })),
    ...digits.map((n) => ({ combo: `Alt+${n}`, command: 'edit.duration' as const, arg: n })),
    ...Object.entries(LETTERS).map(([l, i]) => ({ combo: l, command: 'input.note' as const, arg: i })),
    ...Object.entries(LETTERS).map(([l, i]) => ({ combo: `Shift+${l}`, command: 'input.chordNote' as const, arg: i })),
    { combo: '0', command: 'input.rest' },
    { combo: 'Period', command: 'input.dot' },
    { combo: 'T', command: 'edit.tie' },
    { combo: 'R', command: 'edit.toRest' },
    { combo: 'Delete', command: 'edit.delete' },
    { combo: 'Backspace', command: 'edit.backspace' },
    { combo: 'ArrowUp', command: 'edit.step', arg: 1 },
    { combo: 'ArrowDown', command: 'edit.step', arg: -1 },
    { combo: 'Mod+ArrowUp', command: 'edit.octave', arg: 1 },
    { combo: 'Mod+ArrowDown', command: 'edit.octave', arg: -1 },
    { combo: 'Plus', command: 'edit.alter', arg: 1 },
    { combo: 'Minus', command: 'edit.alter', arg: -1 },
    { combo: 'ArrowRight', command: 'nav.horizontal', arg: 1 },
    { combo: 'ArrowLeft', command: 'nav.horizontal', arg: -1 },
    { combo: 'Alt+ArrowDown', command: 'nav.staff', arg: 1 },
    { combo: 'Alt+ArrowUp', command: 'nav.staff', arg: -1 },
    { combo: 'Insert', command: 'input.insertMode' },
    { combo: 'Mod+I', command: 'input.insertMode' },
    { combo: 'Mod+Z', command: 'history.undo' },
    { combo: 'Mod+Y', command: 'history.redo' },
    { combo: 'Mod+Shift+Z', command: 'history.redo' },
    { combo: 'Mod+N', command: 'file.new' },
    { combo: 'Mod+O', command: 'file.open' },
    { combo: 'Mod+S', command: 'file.save' },
    { combo: 'Mod+Shift+S', command: 'file.saveAs' },
    { combo: 'Mod+Comma', command: 'score.settings' },
    { combo: 'F1', command: 'view.help' },
    { combo: '?', command: 'view.help' },
  ],
  help: [
    {
      title: 'Eingabe',
      entries: [
        { keys: 'Enter', text: 'Eingabe starten / beenden (Cursor erscheint)' },
        { keys: '1 – 7', text: 'Notenwert der nächsten Note: 1 = 64stel … 4 = Achtel · 5 = Viertel · 6 = Halbe · 7 = Ganze' },
        { keys: 'A – G (H)', text: 'Note eingeben – Oktave möglichst nah an der vorigen Note' },
        { keys: '0', text: 'Pause eingeben' },
        { keys: '.', text: 'Punktierung (nächste Note; ohne Eingabe: ausgewählte Note)' },
        { keys: 'Umschalt + A – G', text: 'Ton zum Akkord hinzufügen (darüber)' },
        { keys: 'Einfg / Strg+I', text: 'Einfügen statt Überschreiben' },
      ],
    },
    {
      title: 'Letzte / ausgewählte Note ändern',
      entries: [
        { keys: '↑ / ↓', text: 'eine Stufe höher / tiefer (in der Tonart)' },
        { keys: 'Strg + ↑ / ↓', text: 'eine Oktave höher / tiefer' },
        { keys: '+ / −', text: 'Halbton höher / tiefer (Kreuz / B)' },
        { keys: 'Alt + 1 – 7', text: 'Notenwert ändern' },
        { keys: 'T', text: 'Haltebogen zur nächsten Note gleicher Tonhöhe' },
        { keys: 'R / Entf', text: 'Note in Pause umwandeln' },
        { keys: '⌫', text: 'Letzte Note löschen und zurückgehen' },
      ],
    },
    {
      title: 'Datei',
      entries: [
        { keys: 'Strg+N', text: 'Neue Partitur (Titel, Instrumente, Tonart, Taktart, Auftakt)' },
        { keys: 'Strg+, / Klick auf Titel', text: 'Partitur-Einstellungen: Titel, Tonart, Taktart, Auftakt' },
        { keys: 'Strg+O', text: 'Partitur öffnen' },
        { keys: 'Strg+S', text: 'Speichern' },
        { keys: 'Strg+Umschalt+S', text: 'Speichern unter …' },
      ],
    },
    {
      title: 'Bewegen & Allgemein',
      entries: [
        { keys: '← / →', text: 'vor / zurück' },
        { keys: 'Alt + ↑ / ↓', text: 'System wechseln' },
        { keys: 'Klick', text: 'Note auswählen (in der Eingabe: Cursor dorthin)' },
        { keys: 'Strg+Z / Strg+Y', text: 'Rückgängig / Wiederholen' },
        { keys: 'Esc', text: 'Eingabe beenden, dann Auswahl aufheben' },
        { keys: 'F1 / ?', text: 'Diese Hilfe' },
      ],
    },
  ],
};

export function findBinding(keymap: Keymap, combo: string): KeyBinding | undefined {
  return keymap.bindings.find((b) => b.combo === combo);
}
