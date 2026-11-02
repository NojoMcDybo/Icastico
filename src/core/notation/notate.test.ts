import { describe, expect, it } from 'vitest';
import { frac, ZERO, eq } from '../time';
import { measuresOf, measureLength, type Score } from '../model';
import { parseLine } from '../line';
import { demoScore } from '../demo';
import {
  beamGroups,
  decomposeNote,
  decomposeRest,
  durationName,
  itemsLength,
  notateVoice,
  type NotatedNote,
} from './notate';

const dur = (base: number, dots = 0) => ({ base, dots });

describe('decomposition', () => {
  it('notes use dotted values greedily', () => {
    expect(decomposeNote(frac(3, 4))).toEqual([dur(2, 1)]);
    expect(decomposeNote(frac(7, 8))).toEqual([dur(2, 2)]);
    expect(decomposeNote(frac(5, 8))).toEqual([dur(2), dur(8)]);
    expect(decomposeNote(frac(1))).toEqual([dur(1)]);
  });

  it('rests follow the beat', () => {
    // Rest from beat 2 to the end of a 4/4 bar: quarter + half, not a dotted half.
    expect(decomposeRest(frac(1, 4), frac(3, 4))).toEqual([dur(4), dur(2)]);
    expect(decomposeRest(ZERO, frac(1, 2))).toEqual([dur(2)]);
    expect(decomposeRest(frac(1, 8), frac(3, 8))).toEqual([dur(8), dur(4)]);
  });

  it('refuses tuplets for now', () => {
    expect(() => decomposeNote(frac(1, 12))).toThrow(/N-Tolen/);
  });
});

describe('notateVoice', () => {
  const score = (spec: string): Score => ({
    title: 't',
    meter: [{ at: ZERO, sig: { count: 4, unit: 4 } }],
    keys: [{ at: ZERO, fifths: 0 }],
    parts: [{ id: 'p', name: 'P', instrument: 'voice', voices: [{ id: 'v', staff: 0, events: parseLine(spec, 'e') }] }],
  });

  it('splits a note across the barline and ties it', () => {
    const s = score('r:1/2 C5:3/4');
    const [m1, m2] = notateVoice(s.parts[0]!.voices[0]!, measuresOf(s));
    const first = m1!.at(-1) as NotatedNote;
    const second = m2![0] as NotatedNote;
    expect(first.duration).toEqual(dur(2));
    expect(first.tiedToNext).toBe(true);
    expect(first.tiedFromPrevious).toBe(false);
    expect(second.duration).toEqual(dur(4));
    expect(second.tiedFromPrevious).toBe(true);
    expect(second.tiedToNext).toBe(false);
    expect(second.eventId).toBe(first.eventId);
  });

  it('fills gaps with rests and empty bars with a measure rest', () => {
    const s = score('C4:1/4');
    const ms = measuresOf(s, 2);
    const [m1, m2] = notateVoice(s.parts[0]!.voices[0]!, ms);
    expect(m1!.map((i) => i.kind)).toEqual(['note', 'rest', 'rest']);
    expect(m2).toEqual([{ kind: 'measureRest', id: 'v-m2-mr' }]);
  });

  it('every measure of the demo adds up exactly', () => {
    const demo = demoScore();
    const ms = measuresOf(demo);
    for (const part of demo.parts) {
      for (const voice of part.voices) {
        notateVoice(voice, ms).forEach((items, i) => {
          const len = measureLength(ms[i]!.sig);
          expect(eq(itemsLength(items, len), len), `${voice.id} Takt ${i + 1}`).toBe(true);
        });
      }
    }
  });
});

describe('beamGroups', () => {
  const notate = (spec: string, count = 4, unit = 4) => {
    const s: Score = {
      title: 't',
      meter: [{ at: ZERO, sig: { count, unit } }],
      keys: [{ at: ZERO, fifths: 0 }],
      parts: [{ id: 'p', name: 'P', instrument: 'voice', voices: [{ id: 'v', staff: 0, events: parseLine(spec, 'e') }] }],
    };
    const ms = measuresOf(s);
    const items = notateVoice(s.parts[0]!.voices[0]!, ms)[0]!;
    return beamGroups(items, ms[0]!);
  };

  it('beams eighths per quarter beat in 4/4', () => {
    expect(notate('C4:1/8 D4:1/8 E4:1/8 F4:1/8 G4:1/2')).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('beams dotted eighth + sixteenth and breaks at rests', () => {
    expect(notate('C4:3/16 D4:1/16 E4:1/8 r:1/8 G4:1/2')).toEqual([[0, 1]]);
  });

  it('beams in groups of three in 6/8', () => {
    expect(notate('C4:1/8 D4:1/8 E4:1/8 F4:1/8 G4:1/8 A4:1/8', 6, 8)).toEqual([
      [0, 2],
      [3, 5],
    ]);
  });

  it('does not beam a lone eighth or quarters', () => {
    expect(notate('C4:1/4 D4:1/8 r:1/8 E4:1/2')).toEqual([]);
  });
});

describe('durationName', () => {
  it('speaks musician', () => {
    expect(durationName(frac(3, 4))).toBe('punktierte Halbe');
    expect(durationName(frac(1, 8))).toBe('Achtel');
    expect(durationName(frac(5, 8))).toBe('Halbe + Achtel');
    expect(durationName(frac(1, 12))).toBe('1/12 (N-Tole)');
  });
});
