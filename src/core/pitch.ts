/**
 * Spelled pitch. Notation needs the spelling (F# vs. Gb), not just a MIDI
 * number, so the model stores step + alteration + octave and derives MIDI.
 *
 * Octaves follow scientific pitch notation: C4 = middle C = MIDI 60.
 * Pitches in the model are always SOUNDING (concert) pitch. Display
 * transposition (e.g. guitar sounds an octave lower than written) is the
 * job of the instrument definition and the renderer.
 */
export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export interface Pitch {
  readonly step: Step;
  /** Semitones: -2 = double flat, -1 = flat, 0 = natural, 1 = sharp, 2 = double sharp. */
  readonly alter: number;
  readonly octave: number;
}

const STEP_SEMITONES: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const STEPS: readonly Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

export function midiOf(p: Pitch): number {
  return (p.octave + 1) * 12 + STEP_SEMITONES[p.step] + p.alter;
}

/**
 * Parses pitch names like "C4", "F#3", "Bb2", "Ebb5", "Gx4" (x = double sharp).
 * German "H" is accepted as B.
 */
export function parsePitch(text: string): Pitch {
  const m = /^\s*([A-Ha-h])(bb|b|##|#|x)?(-?\d+)\s*$/.exec(text);
  if (!m) throw new Error(`Invalid pitch: "${text}"`);
  let letter = m[1]!.toUpperCase();
  if (letter === 'H') letter = 'B';
  const acc = m[2] ?? '';
  const alter = { '': 0, b: -1, bb: -2, '#': 1, '##': 2, x: 2 }[acc]!;
  return { step: letter as Step, alter, octave: Number(m[3]) };
}

export function pitchToString(p: Pitch): string {
  const acc = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: 'x' }[p.alter] ?? '?';
  return `${p.step}${acc}${p.octave}`;
}

/** Transposes by whole octaves (spelling is preserved). */
export function transposeOctaves(p: Pitch, octaves: number): Pitch {
  return { ...p, octave: p.octave + octaves };
}

/**
 * Alteration that a key signature applies to a step.
 * fifths > 0: sharps (F C G D A E B), fifths < 0: flats (B E A D G C F).
 */
export function keyAlteration(fifths: number, step: Step): number {
  const sharpOrder: Step[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  if (fifths > 0) return sharpOrder.slice(0, fifths).includes(step) ? 1 : 0;
  if (fifths < 0) return [...sharpOrder].reverse().slice(0, -fifths).includes(step) ? -1 : 0;
  return 0;
}
