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

/** A spelled note for `input.spelled`: letter index (C = 0 … B = 6) and alteration. */
const spelled = (letter: number, alter: number): number => letter * 5 + alter + 2;

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
  { words: ['Bemol'], command: 'edit.alter', arg: -1, label: 'Be (Erniedrigung)' },
  { words: ['weg', 'löschen'], command: 'edit.backspace', label: 'Rückwärts löschen' },
  { words: ['weiter', 'vor'], command: 'nav.horizontal', arg: 1, label: 'eine Note weiter' },
  { words: ['zurück', 'davor'], command: 'nav.horizontal', arg: -1, label: 'eine Note zurück' },
  { words: ['darüber'], command: 'nav.staff', arg: -1, label: 'Zeile darüber' },
  { words: ['darunter'], command: 'nav.staff', arg: 1, label: 'Zeile darunter' },
  { words: ['rückgängig'], command: 'history.undo', label: 'rückgängig' },
  { words: ['wiederherstellen'], command: 'history.redo', label: 'wiederherstellen' },
  // Notes dictated by name. The plain letters follow the key signature like the keyboard letters do; "h" is B natural,
  // "b" is B flat (German names). Phonetic spellings ("zeh", "geh") are what the recogniser often writes for a spoken letter.
  { words: ['c', 'zeh'], command: 'input.note', arg: 0, label: 'C' },
  { words: ['d', 'deh'], command: 'input.note', arg: 1, label: 'D' },
  { words: ['e', 'eh'], command: 'input.note', arg: 2, label: 'E' },
  { words: ['f', 'eff'], command: 'input.note', arg: 3, label: 'F' },
  { words: ['g', 'geh'], command: 'input.note', arg: 4, label: 'G' },
  { words: ['a', 'ah'], command: 'input.note', arg: 5, label: 'A' },
  { words: ['h', 'hah'], command: 'input.note', arg: 6, label: 'H' },
  { words: ['cis'], command: 'input.spelled', arg: spelled(0, 1), label: 'Cis' },
  { words: ['ces'], command: 'input.spelled', arg: spelled(0, -1), label: 'Ces' },
  { words: ['dis'], command: 'input.spelled', arg: spelled(1, 1), label: 'Dis' },
  { words: ['des'], command: 'input.spelled', arg: spelled(1, -1), label: 'Des' },
  { words: ['eis'], command: 'input.spelled', arg: spelled(2, 1), label: 'Eis' },
  { words: ['es'], command: 'input.spelled', arg: spelled(2, -1), label: 'Es' },
  { words: ['fis'], command: 'input.spelled', arg: spelled(3, 1), label: 'Fis' },
  { words: ['fes'], command: 'input.spelled', arg: spelled(3, -1), label: 'Fes' },
  { words: ['gis'], command: 'input.spelled', arg: spelled(4, 1), label: 'Gis' },
  { words: ['ges'], command: 'input.spelled', arg: spelled(4, -1), label: 'Ges' },
  { words: ['ais'], command: 'input.spelled', arg: spelled(5, 1), label: 'Ais' },
  { words: ['as', 'ass'], command: 'input.spelled', arg: spelled(5, -1), label: 'As' },
  { words: ['his'], command: 'input.spelled', arg: spelled(6, 1), label: 'His' },
  { words: ['b'], command: 'input.spelled', arg: spelled(6, -1), label: 'B' },
  { words: ['Eingabe'], command: 'input.toggle', label: 'Eingabe an/aus' },
  { words: ['Einfügen'], command: 'input.insertMode', label: 'Einfügen an/aus' },
  { words: ['fertig'], command: 'edit.escape', label: 'fertig' },
];
