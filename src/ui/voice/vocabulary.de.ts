/**
 * The German vocabulary of spoken commands (plan "Sprachbefehle", package 1). Data only, like the key layouts:
 * every entry names a real command of the editor – speaking a word does exactly what the key does.
 * Several `words` of one entry are synonyms; a phrase may have more than one word ("Oktave hoch").
 * Single digits are understood as their number word, so "5" counts as "fünf".
 */
import type { CommandId } from '../../core/editor/commands';
import type { UiCommandId } from '../keymaps/library';

export interface VoiceCommand {
  readonly words: readonly string[];
  readonly command: CommandId | UiCommandId;
  readonly arg?: number;
  /** What the status line says the word was understood as ("fünf → Viertel"). */
  readonly label: string;
}

export const VOCABULARY_DE: readonly VoiceCommand[] = [
  { words: ['eins', 'Vierundsechzigstel'], command: 'input.duration', arg: 1, label: 'Vierundsechzigstel' },
  { words: ['zwei', 'Zweiunddreißigstel'], command: 'input.duration', arg: 2, label: 'Zweiunddreißigstel' },
  { words: ['drei', 'Sechzehntel'], command: 'input.duration', arg: 3, label: 'Sechzehntel' },
  { words: ['vier', 'Achtel'], command: 'input.duration', arg: 4, label: 'Achtel' },
  { words: ['fünf', 'Viertel'], command: 'input.duration', arg: 5, label: 'Viertel' },
  { words: ['sechs', 'Halbe'], command: 'input.duration', arg: 6, label: 'Halbe' },
  { words: ['sieben', 'Ganze'], command: 'input.duration', arg: 7, label: 'Ganze' },
  { words: ['null', 'Pause'], command: 'input.rest', label: 'Pause' },
  { words: ['Punkt'], command: 'input.dot', label: 'Punktierung' },
  { words: ['Bogen', 'Haltebogen'], command: 'edit.tie', label: 'Haltebogen' },
  { words: ['zur Pause'], command: 'edit.toRest', label: 'Note zur Pause machen' },
  { words: ['höher'], command: 'edit.step', arg: 1, label: 'eine Stufe höher' },
  { words: ['tiefer'], command: 'edit.step', arg: -1, label: 'eine Stufe tiefer' },
  { words: ['Oktave hoch'], command: 'edit.octave', arg: 1, label: 'eine Oktave höher' },
  { words: ['Oktave runter'], command: 'edit.octave', arg: -1, label: 'eine Oktave tiefer' },
  { words: ['Kreuz'], command: 'edit.alter', arg: 1, label: 'Kreuz' },
  { words: ['Be'], command: 'edit.alter', arg: -1, label: 'B' },
  { words: ['weg', 'löschen'], command: 'edit.backspace', label: 'Rückwärts löschen' },
  { words: ['weiter', 'vor'], command: 'nav.horizontal', arg: 1, label: 'eine Note weiter' },
  { words: ['zurück', 'davor'], command: 'nav.horizontal', arg: -1, label: 'eine Note zurück' },
  { words: ['darüber'], command: 'nav.staff', arg: -1, label: 'Zeile darüber' },
  { words: ['darunter'], command: 'nav.staff', arg: 1, label: 'Zeile darunter' },
  { words: ['rückgängig'], command: 'history.undo', label: 'rückgängig' },
  { words: ['wiederherstellen'], command: 'history.redo', label: 'wiederherstellen' },
  { words: ['Eingabe'], command: 'input.toggle', label: 'Eingabe an/aus' },
  { words: ['Einfügen'], command: 'input.insertMode', label: 'Einfügen an/aus' },
  { words: ['fertig'], command: 'edit.escape', label: 'fertig' },
];
