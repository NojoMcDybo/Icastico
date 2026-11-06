/**
 * Transposing by an interval (the "Transponieren" dialog).
 *
 * Chromatic: every note moves by the interval and is spelled the way the interval says (C up a major third is E,
 * F up a major third is A, Bb up a major third is D) – the notes of the piece keep their relation, the key moves too.
 * Diatonic: every note moves by a number of steps of the scale of the key and stays in the key (in C major C up a
 * third is E, in G major F# up a third is A); the key signature stays.
 */
import { type Pitch, type Step, STEPS, keyAlteration, midiOf, spellMidi } from './pitch';
import { type Fraction, le, lt } from './time';
import { type NoteEvent, type Score, keyAt } from './model';

/** A signed interval: scale steps (a third = 2) and semitones (a major third = 4). */
export interface Interval {
  readonly steps: number;
  readonly semitones: number;
}

export type TransposeMode = 'chromatic' | 'diatonic';

export interface IntervalChoice {
  /** "große Terz aufwärts" */
  readonly label: string;
  readonly interval: Interval;
}

/** The intervals of an octave: name, steps, semitones. */
const BASIC: readonly (readonly [string, number, number])[] = [
  ['Prim', 0, 0],
  ['kleine Sekunde', 1, 1],
  ['große Sekunde', 1, 2],
  ['kleine Terz', 2, 3],
  ['große Terz', 2, 4],
  ['reine Quarte', 3, 5],
  ['übermäßige Quarte', 3, 6],
  ['verminderte Quinte', 4, 6],
  ['reine Quinte', 4, 7],
  ['kleine Sexte', 5, 8],
  ['große Sexte', 5, 9],
  ['kleine Septime', 6, 10],
  ['große Septime', 6, 11],
  ['Oktave', 7, 12],
];

/** For the wheel: from an octave down to an octave up, the unison in the middle. */
export const CHROMATIC_CHOICES: readonly IntervalChoice[] = [
  ...[...BASIC].slice(1).reverse().map(([name, steps, semitones]) => ({ label: `${name} abwärts`, interval: { steps: -steps, semitones: -semitones } })),
  { label: 'Prim', interval: { steps: 0, semitones: 0 } },
  ...BASIC.slice(1).map(([name, steps, semitones]) => ({ label: `${name} aufwärts`, interval: { steps, semitones } })),
];

const DIATONIC_NAMES = ['Prim', 'Sekunde', 'Terz', 'Quarte', 'Quinte', 'Sexte', 'Septime', 'Oktave'];
export const DIATONIC_CHOICES: readonly IntervalChoice[] = [
  ...DIATONIC_NAMES.slice(1).reverse().map((name, i) => ({ label: `${name} abwärts`, interval: { steps: -(7 - i), semitones: 0 } })),
  { label: 'Prim', interval: { steps: 0, semitones: 0 } },
  ...DIATONIC_NAMES.slice(1).map((name, i) => ({ label: `${name} aufwärts`, interval: { steps: i + 1, semitones: 0 } })),
];

/** Index of the unison in a list of choices (where the wheel starts). */
export const unisonIndex = (choices: readonly IntervalChoice[]): number => choices.findIndex((c) => c.interval.steps === 0);

const stepIndex = (step: Step): number => STEPS.indexOf(step);

/** Chromatic: move by scale steps, then fix the alteration so the semitones come out right. Null if it would need more than a double sharp/flat. */
export function transposeChromatic(p: Pitch, interval: Interval): Pitch | null {
  const number = p.octave * 7 + stepIndex(p.step) + interval.steps;
  const step = STEPS[((number % 7) + 7) % 7]!;
  const octave = Math.floor(number / 7);
  const natural = midiOf({ step, alter: 0, octave });
  const alter = midiOf(p) + interval.semitones - natural;
  return Math.abs(alter) <= 2 ? { step, alter, octave } : null;
}

/** Chromatic with a fallback: a spelling that would need three sharps is written the simple way for the new key. */
export function transposePitch(p: Pitch, interval: Interval, fifths = 0): Pitch {
  return transposeChromatic(p, interval) ?? spellMidi(midiOf(p) + interval.semitones, fifths);
}

/** Diatonic: move by steps of the scale of the key; accidentals that were not in the key stay as accidentals. */
export function transposeDiatonic(p: Pitch, steps: number, fifths: number): Pitch {
  const number = p.octave * 7 + stepIndex(p.step) + steps;
  const step = STEPS[((number % 7) + 7) % 7]!;
  const away = p.alter - keyAlteration(fifths, p.step); // 0 for a note of the key, ±1 for a raised / lowered one
  return { step, alter: Math.max(-2, Math.min(2, keyAlteration(fifths, step) + away)), octave: Math.floor(number / 7) };
}

/** The tonic of the major key with `fifths` sharps (flats negative), spelled. */
function tonic(fifths: number): Pitch {
  const letter = STEPS[(((fifths * 4) % 7) + 7) % 7]!;
  const pc = (((fifths * 7) % 12) + 12) % 12;
  const natural = midiOf({ step: letter, alter: 0, octave: 4 });
  let alter = pc - (natural % 12);
  if (alter > 6) alter -= 12;
  if (alter < -6) alter += 12;
  return { step: letter, alter, octave: 4 };
}

/** The key signature after the music moved by `interval`: the same major key, moved. */
export function transposeKey(fifths: number, interval: Interval): number {
  const to = transposeChromatic(tonic(fifths), interval);
  const pc = (((midiOf(tonic(fifths)) + interval.semitones) % 12) + 12) % 12;
  let best: number | null = null;
  for (let f = -7; f <= 7; f++) {
    const t = tonic(f);
    if (to && t.step === to.step && t.alter === to.alter) return f; // the spelling the interval asks for
    if ((midiOf(t) % 12) === pc && (best === null || Math.abs(f) < Math.abs(best))) best = f;
  }
  return best ?? fifths;
}

export interface TransposeSpec {
  readonly mode: TransposeMode;
  readonly interval: Interval;
  /** Chromatic only: move the key signature(s) along (when the whole piece moves). */
  readonly adjustKey?: boolean;
}

/** Moves the notes of the events chosen by `inScope`; returns the new score and how many notes moved. */
export function transposeScore(
  score: Score,
  spec: TransposeSpec,
  scope: { readonly partId?: string; readonly from?: Fraction; readonly to?: Fraction },
): { score: Score; notes: number } {
  let notes = 0;
  const inTime = (e: NoteEvent) => (scope.from === undefined || le(scope.from, e.onset)) && (scope.to === undefined || lt(e.onset, scope.to));
  const parts = score.parts.map((part) =>
    scope.partId !== undefined && part.id !== scope.partId
      ? part
      : {
          ...part,
          voices: part.voices.map((voice) => ({
            ...voice,
            events: voice.events.map((e) => {
              if (!inTime(e)) return e;
              const fifths = keyAt(score, e.onset);
              const tones = e.tones.map((t) => {
                notes++;
                const pitch = spec.mode === 'chromatic' ? transposePitch(t.pitch, spec.interval, fifths) : transposeDiatonic(t.pitch, spec.interval.steps, fifths);
                return { ...t, pitch };
              });
              return { ...e, tones: [...tones].sort((a, b) => midiOf(a.pitch) - midiOf(b.pitch)) };
            }),
          })),
        },
  );
  const moveKeys = spec.mode === 'chromatic' && spec.adjustKey && scope.from === undefined && scope.partId === undefined;
  const keys = moveKeys ? score.keys.map((k) => ({ ...k, fifths: transposeKey(k.fifths, spec.interval) })) : score.keys;
  return { score: { ...score, parts, keys }, notes };
}
