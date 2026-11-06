/**
 * Turns what the recogniser heard into an editor command (plan "Sprachbefehle", package 1). Pure logic, no
 * microphone: exact match against the vocabulary after normalising, and nothing at all when the recogniser
 * was not sure – better one command too few than a wrong one.
 */
import type { CommandId } from '../../core/editor/commands';
import type { UiCommandId } from '../keymaps/library';
import { VOCABULARY_DE, type VoiceCommand } from './vocabulary.de';

/** Below this confidence (0–1) a heard word is ignored. */
export const MIN_CONFIDENCE = 0.8;

export interface VoiceMatch {
  readonly command: CommandId | UiCommandId;
  readonly arg: number;
  readonly label: string;
  /** The phrase as it was understood (normalised). */
  readonly heard: string;
}

const NUMBER_WORDS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fuenf', 'sechs', 'sieben'];

/** Lower case, umlauts and ß spelled out, punctuation gone, single digits as number words: "Fünf." → "fuenf". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => (/^[0-7]$/.test(word) ? NUMBER_WORDS[Number(word)]! : word))
    .join(' ');
}

const indexes = new WeakMap<readonly VoiceCommand[], Map<string, VoiceCommand>>();

/** Normalised phrase → entry. Throws when two entries claim the same phrase: a vocabulary must be unambiguous. */
export function indexOf(vocabulary: readonly VoiceCommand[]): Map<string, VoiceCommand> {
  let index = indexes.get(vocabulary);
  if (!index) {
    index = new Map();
    for (const entry of vocabulary) {
      for (const word of entry.words) {
        const key = normalize(word);
        const other = index.get(key);
        if (other && other !== entry) throw new Error(`Sprachbefehl „${word}“ gehört zu zwei Befehlen (${other.label} und ${entry.label})`);
        index.set(key, entry);
      }
    }
    indexes.set(vocabulary, index);
  }
  return index;
}

/** The command for what was heard, or null when it is unknown or the recogniser was not sure enough. */
export function matchVoice(
  text: string,
  confidence: number,
  vocabulary: readonly VoiceCommand[] = VOCABULARY_DE,
  minConfidence = MIN_CONFIDENCE,
): VoiceMatch | null {
  const heard = normalize(text);
  const entry = indexOf(vocabulary).get(heard);
  if (!entry || !(confidence >= Math.min(minConfidence, entry.minConfidence ?? minConfidence))) return null;
  return { command: entry.command, arg: entry.arg ?? 0, label: entry.label, heard };
}
