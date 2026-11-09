import { describe, expect, it } from 'vitest';
import { CHORD_END, START_CHORD, modeValue, plateValue, toneLevel } from './chladni';

describe('start-up chord', () => {
  it('is E7♯9: E, G♯, B, D and the ♯9 (G)', () => {
    const classes = new Set(START_CHORD.map((t) => t.midi % 12));
    expect([...classes].sort((a, b) => a - b)).toEqual([2, 4, 7, 8, 11]);
    expect(START_CHORD[0]!.midi % 12).toBe(4); // the root is the lowest tone
  });

  it('builds up: the tones enter one after another, from low to high', () => {
    const ats = START_CHORD.map((t) => t.at);
    expect(ats).toEqual([...ats].sort((a, b) => a - b));
    expect(new Set(ats).size).toBe(ats.length);
    expect(START_CHORD.map((t) => t.midi)).toEqual([...START_CHORD.map((t) => t.midi)].sort((a, b) => a - b));
  });

  it('is silent before a tone enters, loud right after, quiet again after the end', () => {
    const tone = START_CHORD[1]!;
    expect(toneLevel(tone, tone.at - 0.01)).toBe(0);
    expect(toneLevel(tone, tone.at + 0.05)).toBeCloseTo(1, 1);
    expect(toneLevel(tone, tone.at + 1)).toBeLessThan(toneLevel(tone, tone.at + 0.1));
    expect(toneLevel(tone, CHORD_END + 1)).toBeLessThan(0.001);
  });

  it('gives higher notes higher plate modes', () => {
    const size = START_CHORD.map((t) => t.mode.n ** 2 + t.mode.m ** 2);
    expect(size).toEqual([...size].sort((a, b) => a - b));
  });
});

describe('plate', () => {
  it('rests on the diagonal of the square, except for the mirrored kind of figure', () => {
    for (const { mode } of START_CHORD) for (const p of [0.1, 0.35, 0.8]) if (!mode.plus) expect(modeValue(mode, p, p)).toBeCloseTo(0, 12);
    expect(START_CHORD.some((t) => t.mode.plus)).toBe(true);
  });

  it('is mirrored along the diagonal for the "plus" kind', () => {
    const mode = START_CHORD[1]!.mode;
    expect(mode.plus).toBe(true);
    expect(modeValue(mode, 0.2, 0.7)).toBeCloseTo(modeValue(mode, 0.7, 0.2), 12);
  });

  it('is turned over when x and y are swapped', () => {
    const mode = START_CHORD[2]!.mode;
    expect(modeValue(mode, 0.2, 0.7)).toBeCloseTo(-modeValue(mode, 0.7, 0.2), 12);
  });

  it('does not move without a sounding tone', () => {
    expect(plateValue(0.3, 0.6, [0, 0, 0, 0, 0])).toBe(0);
  });
});
