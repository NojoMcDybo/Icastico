import { describe, expect, it } from 'vitest';
import { keyAlteration, midiOf, parsePitch, pitchToString, spellMidi } from './pitch';

describe('Pitch', () => {
  it('maps to MIDI', () => {
    expect(midiOf(parsePitch('C4'))).toBe(60);
    expect(midiOf(parsePitch('A4'))).toBe(69);
    expect(midiOf(parsePitch('E2'))).toBe(40); // low guitar string
    expect(midiOf(parsePitch('B#3'))).toBe(60); // enharmonic to C4
    expect(midiOf(parsePitch('Cb4'))).toBe(59);
  });

  it('parses spellings incl. German H', () => {
    expect(parsePitch('F#3')).toEqual({ step: 'F', alter: 1, octave: 3 });
    expect(parsePitch('Bb2')).toEqual({ step: 'B', alter: -1, octave: 2 });
    expect(parsePitch('H4')).toEqual({ step: 'B', alter: 0, octave: 4 });
    expect(parsePitch('Gx4').alter).toBe(2);
    expect(pitchToString(parsePitch('Ebb5'))).toBe('Ebb5');
    expect(() => parsePitch('Q4')).toThrow();
  });

  it('knows key signatures', () => {
    expect(keyAlteration(1, 'F')).toBe(1); // G major
    expect(keyAlteration(1, 'C')).toBe(0);
    expect(keyAlteration(-1, 'B')).toBe(-1); // F major
    expect(keyAlteration(-3, 'A')).toBe(-1); // Eb major: B E A
    expect(keyAlteration(-3, 'D')).toBe(0);
    expect(keyAlteration(7, 'B')).toBe(1);
  });
});

describe('spellMidi', () => {
  const name = (midi: number, fifths: number) => pitchToString(spellMidi(midi, fifths));

  it('keeps the spelling of the key', () => {
    expect(name(66, 1)).toBe('F#4'); // G major
    expect(name(70, -1)).toBe('Bb4'); // F major
    expect(name(65, 6)).toBe('E#4'); // F# major has E#, not F
  });

  it('spells notes outside the key with sharps in sharp keys and flats in flat keys', () => {
    expect(name(61, 0)).toBe('C#4');
    expect(name(61, -2)).toBe('Db4');
    expect(name(63, 2)).toBe('D#4');
  });

  it('uses the natural where the key alters it', () => {
    expect(name(65, 2)).toBe('F4'); // D major: F natural, not E#
  });

  it('round-trips every MIDI number in every key', () => {
    for (let fifths = -7; fifths <= 7; fifths++) {
      for (let midi = 12; midi <= 120; midi++) {
        expect(midiOf(spellMidi(midi, fifths)), `${midi} in ${fifths}`).toBe(midi);
      }
    }
  });
});
