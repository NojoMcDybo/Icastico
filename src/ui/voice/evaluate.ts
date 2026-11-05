/**
 * Scoring of the voice test (plan "Sprachbefehle", package 3): was a spoken word understood correctly, wrongly,
 * or not at all? Wrongly understood counts worse than not understood – a wrong command spoils the score,
 * a missed one only costs a second try.
 */
import { MIN_CONFIDENCE, matchVoice } from './matcher';
import { VOCABULARY_DE, type VoiceCommand } from './vocabulary.de';

export interface Recognition {
  readonly text: string;
  readonly confidence: number;
  /** Milliseconds from handing over the recording to the answer. */
  readonly ms: number;
}

export type Verdict = 'richtig' | 'falsch' | 'nicht verstanden';

export function judge(expected: VoiceCommand, heard: Recognition, vocabulary: readonly VoiceCommand[] = VOCABULARY_DE, minConfidence = MIN_CONFIDENCE): Verdict {
  const match = matchVoice(heard.text, heard.confidence, vocabulary, minConfidence);
  if (!match) return 'nicht verstanden';
  return match.command === expected.command && match.arg === (expected.arg ?? 0) ? 'richtig' : 'falsch';
}

export interface Summary {
  readonly total: number;
  readonly richtig: number;
  readonly falsch: number;
  readonly nichtVerstanden: number;
  /** Shares 0–1. */
  readonly trefferquote: number;
  readonly fehlerquote: number;
  readonly meanMs: number;
}

export function summarize(results: readonly { readonly verdict: Verdict; readonly ms: number }[]): Summary {
  const count = (v: Verdict) => results.filter((r) => r.verdict === v).length;
  const total = results.length;
  const share = (n: number) => (total ? n / total : 0);
  return {
    total,
    richtig: count('richtig'),
    falsch: count('falsch'),
    nichtVerstanden: count('nicht verstanden'),
    trefferquote: share(count('richtig')),
    fehlerquote: share(count('falsch')),
    meanMs: total ? Math.round(results.reduce((sum, r) => sum + r.ms, 0) / total) : 0,
  };
}

/** The goals of the plan (section 4.4), for the verdict at the end of the test. */
export const GOALS = { treffer: 0.95, trefferMitInstrument: 0.85, falsch: 0.02, ms: 500 } as const;

/** Every word to be spoken in the test: each trigger word of the vocabulary once. */
export function testWords(vocabulary: readonly VoiceCommand[] = VOCABULARY_DE): { word: string; entry: VoiceCommand }[] {
  return vocabulary.flatMap((entry) => entry.words.map((word) => ({ word, entry })));
}
