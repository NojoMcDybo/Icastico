/**
 * Chords by name (ADR 0037): "Cm7" → the notes C Eb G Bb. Pure logic.
 *
 * International spelling like the chord symbols: roots C D E F G A B, accidentals # and b. "H" is read as B (the German H);
 * so "B" alone is the note B (German H) and "Bb" is B flat (German B).
 */
import { type Pitch, type Step, midiOf, transposeOctaves } from './pitch';
import { type Interval, transposeChromatic, transposePitch } from './transpose';

export interface ChordName {
  readonly root: { readonly step: Step; readonly alter: number };
  /** Above the root, ascending, without the root itself. */
  readonly intervals: readonly Interval[];
  /** Slash chord: the note below ("C/G"). */
  readonly bass?: { readonly step: Step; readonly alter: number };
  /** Normalised text for the chord symbol: "Cm7", "C/G". */
  readonly label: string;
}

const iv = (steps: number, semitones: number): Interval => ({ steps, semitones });
const MAJ2 = iv(1, 2);
const MIN3 = iv(2, 3);
const MAJ3 = iv(2, 4);
const P4 = iv(3, 5);
const DIM5 = iv(4, 6);
const P5 = iv(4, 7);
const AUG5 = iv(4, 8);
const MAJ6 = iv(5, 9);
const DIM7 = iv(6, 9);
const MIN7 = iv(6, 10);
const MAJ7 = iv(6, 11);
const MIN9 = iv(8, 13);
const MAJ9 = iv(8, 14);
const AUG9 = iv(8, 15);

export interface ChordQuality {
  /** The main form of the ending ("m7"); empty = major. */
  readonly suffix: string;
  /** Other writings that mean the same. */
  readonly aliases: readonly string[];
  /** What the chord is called, for the buttons. */
  readonly label: string;
  readonly intervals: readonly Interval[];
}

export const CHORD_QUALITIES: readonly ChordQuality[] = [
  { suffix: '', aliases: ['maj', 'M'], label: 'Dur', intervals: [MAJ3, P5] },
  { suffix: 'm', aliases: ['min', '-'], label: 'Moll', intervals: [MIN3, P5] },
  { suffix: 'dim', aliases: ['°'], label: 'vermindert', intervals: [MIN3, DIM5] },
  { suffix: 'aug', aliases: ['+'], label: 'übermäßig', intervals: [MAJ3, AUG5] },
  { suffix: 'sus2', aliases: [], label: 'sus2', intervals: [MAJ2, P5] },
  { suffix: 'sus4', aliases: ['sus'], label: 'sus4', intervals: [P4, P5] },
  { suffix: '5', aliases: [], label: 'Quinte', intervals: [P5] },
  { suffix: '6', aliases: [], label: '6', intervals: [MAJ3, P5, MAJ6] },
  { suffix: 'm6', aliases: [], label: 'm6', intervals: [MIN3, P5, MAJ6] },
  { suffix: '7', aliases: [], label: '7', intervals: [MAJ3, P5, MIN7] },
  { suffix: 'maj7', aliases: ['M7', 'Δ', 'j7'], label: 'maj7', intervals: [MAJ3, P5, MAJ7] },
  { suffix: 'm7', aliases: ['min7', '-7'], label: 'm7', intervals: [MIN3, P5, MIN7] },
  { suffix: 'mmaj7', aliases: ['mM7'], label: 'mmaj7', intervals: [MIN3, P5, MAJ7] },
  { suffix: 'dim7', aliases: ['°7'], label: 'dim7', intervals: [MIN3, DIM5, DIM7] },
  { suffix: 'm7b5', aliases: ['ø'], label: 'm7♭5', intervals: [MIN3, DIM5, MIN7] },
  { suffix: '7sus4', aliases: [], label: '7sus4', intervals: [P4, P5, MIN7] },
  { suffix: 'add9', aliases: [], label: 'add9', intervals: [MAJ3, P5, MAJ9] },
  { suffix: '9', aliases: [], label: '9', intervals: [MAJ3, P5, MIN7, MAJ9] },
  { suffix: 'maj9', aliases: [], label: 'maj9', intervals: [MAJ3, P5, MAJ7, MAJ9] },
  { suffix: 'm9', aliases: [], label: 'm9', intervals: [MIN3, P5, MIN7, MAJ9] },
  { suffix: '7b9', aliases: [], label: '7♭9', intervals: [MAJ3, P5, MIN7, MIN9] },
  { suffix: '7#9', aliases: [], label: '7♯9', intervals: [MAJ3, P5, MIN7, AUG9] },
];

const ROOT = /^([A-Ha-h])([#b]?)/;

/** A note name with accidental: "F#", "Bb", "H" → { step, alter }; null if it is not one. */
function noteName(text: string): { step: Step; alter: number } | null {
  const m = /^([A-Ha-h])([#b]?)$/.exec(text);
  if (!m) return null;
  const letter = m[1]!.toUpperCase();
  return { step: (letter === 'H' ? 'B' : letter) as Step, alter: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0 };
}

const labelOf = (n: { step: Step; alter: number }): string => `${n.step}${n.alter > 0 ? '#' : n.alter < 0 ? 'b' : ''}`;

/** Reads a chord name; null if it is not one of the chords known here. */
export function parseChordName(text: string): ChordName | null {
  const t = text.trim();
  const rootMatch = ROOT.exec(t);
  if (!rootMatch) return null;
  const root = noteName(rootMatch[0]);
  if (!root) return null;
  const rest = t.slice(rootMatch[0].length);
  const slash = rest.indexOf('/');
  const ending = slash < 0 ? rest : rest.slice(0, slash);
  const quality = CHORD_QUALITIES.find((q) => q.suffix === ending || q.aliases.includes(ending));
  if (!quality) return null;
  let bass: { step: Step; alter: number } | undefined;
  if (slash >= 0) {
    const named = noteName(rest.slice(slash + 1));
    if (!named) return null;
    bass = named;
  }
  return {
    root,
    intervals: quality.intervals,
    ...(bass ? { bass } : {}),
    label: `${labelOf(root)}${quality.suffix}${bass ? `/${labelOf(bass)}` : ''}`,
  };
}

/** The tones from low to high: close position on `root`, turned by `inversion` (0 = root position). */
export function chordPitches(name: ChordName, root: Pitch, inversion = 0): Pitch[] {
  let tones: Pitch[] = [root, ...name.intervals.map((i) => transposeChromatic(root, i) ?? transposePitch(root, i))];
  const turns = Math.max(0, Math.min(tones.length - 1, Math.trunc(inversion)));
  for (let k = 0; k < turns; k++) {
    const [lowest, ...others] = tones;
    tones = [...others, transposeOctaves(lowest!, 1)];
  }
  tones.sort((a, b) => midiOf(a) - midiOf(b));
  if (name.bass) {
    const low = midiOf(tones[0]!);
    let bass: Pitch = { ...name.bass, octave: -1 };
    while (midiOf({ ...bass, octave: bass.octave + 1 }) < low) bass = { ...bass, octave: bass.octave + 1 };
    // The bass note is not played twice: the chord tone of the same pitch class gives way to it.
    tones = [bass, ...tones.filter((p) => (midiOf(p) - midiOf(bass)) % 12 !== 0)];
  }
  return tones;
}
