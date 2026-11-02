import { describe, expect, it } from 'vitest';
import { keyAlteration, midiOf, parsePitch, pitchToString } from './pitch';

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
