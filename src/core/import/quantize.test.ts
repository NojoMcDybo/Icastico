import { describe, expect, it } from 'vitest';
import { midiOf } from '../pitch';
import { frac, toNumber } from '../time';
import { estimateKey } from './key';
import { type PlayedNote, buildScore, quantize } from './quantize';

const note = (start: number, end: number, midi = 60): PlayedNote => ({ start, end, midi });
/** A deterministic wobble in [-amount, amount]. */
const wobble = (i: number, amount: number): number => Math.sin(i * 12.9898) * amount;
const sig44 = [{ at: frac(0), sig: { count: 4, unit: 4 } }];

describe('quantize', () => {
  it('snaps slightly uneven eighths onto the eighth grid', () => {
    const played = Array.from({ length: 16 }, (_, i) => note(i * 0.5 + wobble(i, 0.04), i * 0.5 + 0.45 + wobble(i + 99, 0.03)));
    const { notes } = quantize(played, { subdivision: 16, triplets: true });
    notes.forEach((n, i) => {
      expect(n.onset).toEqual(frac(i, 8));
      expect(n.duration).toEqual(frac(1, 8));
    });
  });

  it('does not turn straight sixteenths into triplets', () => {
    const played = Array.from({ length: 32 }, (_, i) => note(i * 0.25 + wobble(i, 0.03), i * 0.25 + 0.2));
    const { notes, tripletBeats } = quantize(played, { subdivision: 16, triplets: true });
    expect(tripletBeats).toBe(0);
    expect(notes.every((n) => n.onset.d <= 16)).toBe(true);
  });

  it('writes eighth triplets as triplets', () => {
    const played = Array.from({ length: 12 }, (_, i) => note(i / 3 + wobble(i, 0.03), i / 3 + 0.3));
    const { notes, tripletBeats } = quantize(played, { subdivision: 16, triplets: true });
    expect(tripletBeats).toBe(4);
    notes.forEach((n, i) => {
      expect(n.onset).toEqual(frac(i, 12));
      expect(n.duration).toEqual(frac(1, 12));
    });
  });

  it('keeps triplets out when asked', () => {
    const played = Array.from({ length: 6 }, (_, i) => note(i / 3, i / 3 + 0.3));
    const { notes } = quantize(played, { subdivision: 16, triplets: false });
    expect(notes.every((n) => n.onset.d <= 16)).toBe(true);
  });

  it('leaves no rests where notes were just played short', () => {
    const played = [note(0, 0.85), note(1, 1.9), note(2, 2.88), note(3, 4)];
    const { notes } = quantize(played, { subdivision: 16, triplets: true });
    expect(notes.map((n) => toNumber(n.duration))).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it('keeps a real rest', () => {
    const { notes } = quantize([note(0, 0.9), note(2, 2.9)], { subdivision: 16, triplets: true });
    expect(notes.map((n) => toNumber(n.onset))).toEqual([0, 0.5]);
    expect(notes[0]!.duration).toEqual(frac(1, 4));
  });

  it('gives every note a length, even a very short one', () => {
    const { notes } = quantize([note(1, 1.01)], { subdivision: 16, triplets: true });
    expect(notes[0]!.duration).toEqual(frac(1, 16));
  });
});

describe('buildScore', () => {
  const voiceMelody = [note(0, 1.1, 64), note(1, 2, 66), note(2, 3, 68), note(3.05, 4, 69)];

  it('makes one line for a voice, even when notes overlap', () => {
    const { score } = buildScore({ title: 'T', parts: [{ name: 'Gesang', instrument: 'voice', notes: voiceMelody }], quantize: { subdivision: 16, triplets: true }, meter: sig44, fifths: 0 });
    const voices = score.parts[0]!.voices;
    expect(voices).toHaveLength(1);
    expect(voices[0]!.events.map((e) => e.onset)).toEqual([frac(0), frac(1, 4), frac(1, 2), frac(3, 4)]);
    expect(voices[0]!.events[0]!.duration).toEqual(frac(1, 4)); // cut at the next note
  });

  it('puts a long bass note under a melody into its own voice', () => {
    const notes = [note(0, 4, 40), note(0, 1, 64), note(1, 2, 65), note(2, 3, 67), note(3, 4, 69)];
    const { score, notes: remarks } = buildScore({ title: 'T', parts: [{ name: 'Gitarre', instrument: 'guitar', notes }], quantize: { subdivision: 16, triplets: true }, meter: sig44, fifths: 0 });
    expect(score.parts[0]!.voices).toHaveLength(2);
    expect(remarks.join(' ')).toMatch(/zusätzlichen Stimmen/);
  });

  it('splits the piano into two hands at middle C', () => {
    const notes = [note(0, 1, 72), note(0, 1, 48), note(1, 2, 60), note(1, 2, 59)];
    const { score } = buildScore({ title: 'T', parts: [{ name: 'Klavier', instrument: 'piano', notes }], quantize: { subdivision: 16, triplets: true }, meter: sig44, fifths: 0 });
    const [right, left] = [0, 1].map((staff) => score.parts[0]!.voices.filter((v) => v.staff === staff).flatMap((v) => v.events));
    expect(right!.map((e) => midiOf(e.tones[0]!.pitch))).toEqual([72, 60]);
    expect(left!.map((e) => midiOf(e.tones[0]!.pitch))).toEqual([48, 59]);
  });

  it('merges notes that start together into a chord', () => {
    const notes = [note(0, 1, 60), note(0.02, 1, 64), note(0, 1.1, 67)];
    const { score } = buildScore({ title: 'T', parts: [{ name: 'Klavier', instrument: 'guitar', notes }], quantize: { subdivision: 16, triplets: true }, meter: sig44, fifths: 0 });
    const events = score.parts[0]!.voices.flatMap((v) => v.events);
    expect(events).toHaveLength(1);
    expect(events[0]!.tones.map((t) => midiOf(t.pitch))).toEqual([60, 64, 67]);
  });

  it('spells the notes for the key', () => {
    const { score } = buildScore({ title: 'T', parts: [{ name: 'Gesang', instrument: 'voice', notes: [note(0, 1, 70)] }], quantize: { subdivision: 16, triplets: true }, meter: sig44, fifths: -2 });
    expect(score.parts[0]!.voices[0]!.events[0]!.tones[0]!.pitch).toMatchObject({ step: 'B', alter: -1 });
  });

  it('sets the tempo and refuses an empty recording', () => {
    expect(buildScore({ title: 'T', parts: [{ name: 'Gesang', instrument: 'voice', notes: voiceMelody }], quantize: { subdivision: 16, triplets: true }, meter: sig44, tempo: 132, fifths: 0 }).score.tempo).toBe(132);
    expect(() => buildScore({ title: 'T', parts: [{ name: 'Gesang', instrument: 'voice', notes: [] }], quantize: { subdivision: 16, triplets: true }, meter: sig44, fifths: 0 })).toThrow(/keine Töne/);
  });
});

describe('estimateKey', () => {
  const scale = (tonic: number, steps: number[]) => steps.map((s) => ({ midi: 60 + tonic + s, weight: 1 }));
  const major = [0, 2, 4, 5, 7, 9, 11, 0, 4, 7];
  it('finds major keys', () => {
    expect(estimateKey(scale(0, major))).toBe(0);
    expect(estimateKey(scale(7, major))).toBe(1);
    expect(estimateKey(scale(5, major))).toBe(-1);
    expect(estimateKey(scale(3, major))).toBe(-3);
  });
  it('gives the signature of the relative major for a minor key', () => {
    const minor = [0, 2, 3, 5, 7, 8, 10, 0, 3, 7, 0];
    expect(estimateKey(scale(9, minor))).toBe(0); // A minor
    expect(estimateKey(scale(2, minor))).toBe(-1); // D minor
  });
});
