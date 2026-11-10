import { describe, expect, it } from 'vitest';
import { chordPitches, parseChordName } from './chordNames';
import { type Pitch, pitchToString } from './pitch';

/** The tones of a named chord with the root in octave 4, as text ("C4 E4 G4"). */
function tones(text: string, inversion = 0): string | null {
  const name = parseChordName(text);
  if (!name) return null;
  const root: Pitch = { ...name.root, octave: 4 };
  return chordPitches(name, root, inversion).map(pitchToString).join(' ');
}

describe('chord names (ADR 0037)', () => {
  it.each([
    ['C', 'C4 E4 G4'],
    ['Cm7', 'C4 Eb4 G4 Bb4'],
    ['F#m7b5', 'F#4 A4 C5 E5'],
    ['Bb', 'Bb4 D5 F5'],
    ['B7', 'B4 D#5 F#5 A5'],
    ['H7', 'B4 D#5 F#5 A5'],
    ['E7#9', 'E4 G#4 B4 D5 Fx5'],
    ['Cmaj7', 'C4 E4 G4 B4'],
    ['CM7', 'C4 E4 G4 B4'],
    ['CΔ', 'C4 E4 G4 B4'],
    ['Cdim7', 'C4 Eb4 Gb4 Bbb4'],
    ['Csus4', 'C4 F4 G4'],
    ['C7b9', 'C4 E4 G4 Bb4 Db5'],
    ['Am9', 'A4 C5 E5 G5 B5'],
    ['c', 'C4 E4 G4'],
  ])('%s → %s', (name, expected) => {
    expect(tones(name)).toBe(expected);
  });

  it('puts the note after the slash below the chord', () => {
    expect(tones('C/G')).toBe('G3 C4 E4');
    expect(tones('C/Bb')).toBe('Bb3 C4 E4 G4');
    expect(tones('Am/E')).toBe('E4 A4 C5');
  });

  it('turns the chord: the lowest tones go an octave up', () => {
    expect(tones('C', 1)).toBe('E4 G4 C5');
    expect(tones('C', 2)).toBe('G4 C5 E5');
    expect(tones('C', 9)).toBe('G4 C5 E5'); // as far as the chord has tones
    expect(tones('C', -1)).toBe('C4 E4 G4');
  });

  it('tells M from m and writes the symbol the normal way', () => {
    expect(parseChordName('CM7')!.intervals).not.toEqual(parseChordName('Cm7')!.intervals);
    expect(parseChordName(' CΔ ')!.label).toBe('Cmaj7');
    expect(parseChordName('H')!.label).toBe('B');
    expect(parseChordName('bb')!.label).toBe('Bb');
    expect(parseChordName('C/G')!.label).toBe('C/G');
  });

  it.each(['', 'X', 'Cm77', 'C/', 'C/X', 'Cmin8', 'CMaj7', 'Cm7 '.concat('x')])('does not know "%s"', (name) => {
    expect(parseChordName(name)).toBeNull();
  });
});
