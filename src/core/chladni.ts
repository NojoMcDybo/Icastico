/**
 * The start-up chord and the sand plate that shows it (ADR 0034). Pure numbers – no audio, no drawing.
 *
 * A square plate that vibrates in the mode (n, m) has the pattern cos(nπx)·cos(mπy) ∓ cos(mπx)·cos(nπy) (the two signs are the two kinds of figure);
 * sand is shaken away from where the plate moves and stays on the lines where it rests (Chladni figures).
 * Higher notes get higher modes (the frequency of a plate grows with n² + m²), so every note that enters
 * changes the figure.
 */

export interface PlateMode {
  readonly n: number;
  readonly m: number;
  /** "+" instead of "−": the figure is mirrored along the diagonal instead of resting on it. */
  readonly plus?: boolean;
}

export interface ChordTone {
  readonly midi: number;
  readonly mode: PlateMode;
  /** Seconds after the start at which the tone enters. */
  readonly at: number;
}

/**
 * E7♯9, built up from the bottom like a rising arpeggio: E, G♯, D, G, B (the "Hendrix chord" with the root below).
 * Modes: n² + m² follows the frequency (E2 → 5, B4 → 29, ratio 6).
 */
export const START_CHORD: readonly ChordTone[] = [
  { midi: 40, mode: { n: 1, m: 2 }, at: 0 },
  { midi: 56, mode: { n: 2, m: 3, plus: true }, at: 0.2 },
  { midi: 62, mode: { n: 1, m: 4 }, at: 0.4 },
  { midi: 67, mode: { n: 3, m: 4, plus: true }, at: 0.6 },
  { midi: 71, mode: { n: 2, m: 5 }, at: 0.8 },
];

export const CHORD_NAME = 'E7♯9';

/** Second at which all tones are let go; the sound is over shortly after. */
export const CHORD_END = 2.2;

const ATTACK = 0.05;
/** The fall of the tone towards its resting level (same numbers as the piano sound of the fallback synthesizer). */
const DECAY = 0.9;
const RESTING = 0.25;
const RELEASE = 0.25 / 3;

/** How strongly the tone sounds (0–1) `t` seconds after the start. */
export function toneLevel(tone: ChordTone, t: number): number {
  const age = t - tone.at;
  if (age <= 0) return 0;
  const rise = Math.min(1, age / ATTACK);
  const level = RESTING + (1 - RESTING) * Math.exp(-Math.max(0, age - ATTACK) / DECAY);
  const let_go = t > CHORD_END ? Math.exp(-(t - CHORD_END) / RELEASE) : 1;
  return rise * level * let_go;
}

/** Deflection of a plate in the mode, −2 … 2; 0 on the lines where sand stays. x, y in 0 … 1. */
export function modeValue(mode: PlateMode, x: number, y: number): number {
  const a = Math.cos(mode.n * Math.PI * x) * Math.cos(mode.m * Math.PI * y);
  const b = Math.cos(mode.m * Math.PI * x) * Math.cos(mode.n * Math.PI * y);
  return mode.plus ? a + b : a - b;
}

/** Deflection of the plate at a point when the tones sound with these levels. */
export function plateValue(x: number, y: number, levels: readonly number[]): number {
  let sum = 0;
  for (let k = 0; k < START_CHORD.length; k++) {
    const level = levels[k] ?? 0;
    if (level > 0) sum += level * modeValue(START_CHORD[k]!.mode, x, y);
  }
  return sum;
}
