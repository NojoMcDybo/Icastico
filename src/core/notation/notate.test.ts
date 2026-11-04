import { describe, expect, it } from 'vitest';
import { frac, ZERO, eq } from '../time';
import { measuresOf, measureLength, type Score } from '../model';
import { parseLine } from '../line';
import { demoScore } from '../demo';
import {
  beamGroups,
  decomposeNote,
  decomposeRest,
  decomposeTuplet,
  tupletGroups,
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

  it('plain decomposition refuses tuplet lengths; decomposeTuplet scales them', () => {
    expect(() => decomposeNote(frac(1, 12))).toThrow(/N-Tole/);
    expect(decomposeTuplet(frac(1, 12))).toEqual({ pieces: [dur(8)], tuplet: { num: 3, numbase: 2 } });
    expect(decomposeTuplet(frac(1, 20))).toEqual({ pieces: [dur(16)], tuplet: { num: 5, numbase: 4 } });
    expect(decomposeTuplet(frac(1, 28))).toEqual({ pieces: [dur(16)], tuplet: { num: 7, numbase: 4 } });
    expect(() => decomposeTuplet(frac(1, 11))).toThrow(/lässt sich nicht schreiben/);
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

describe('tuplets (ADR 0020)', () => {
  const score = (spec: string): Score => ({
    title: 't',
    meter: [{ at: ZERO, sig: { count: 4, unit: 4 } }],
    keys: [{ at: ZERO, fifths: 0 }],
    parts: [{ id: 'p', name: 'P', instrument: 'voice', voices: [{ id: 'v', staff: 0, events: parseLine(spec, 'e') }] }],
  });
  const first = (spec: string) => {
    const s = score(spec);
    return notateVoice(s.parts[0]!.voices[0]!, measuresOf(s))[0]!;
  };

  it('three eighth triplets are one beamed group; the bar still adds up to a whole', () => {
    const items = first('C5:1/12 D5:1/12 E5:1/12 F5:1/4 G5:1/2');
    expect(items.map((i) => (i.kind === 'measureRest' ? '' : i.duration.base))).toEqual([8, 8, 8, 4, 2]);
    expect(tupletGroups(items)).toEqual([{ start: 0, end: 2, ratio: { num: 3, numbase: 2 } }]);
    expect(beamGroups(items, measuresOf(score('C5:1/4'))[0]!)).toEqual([[0, 2]]);
    expect(eq(itemsLength(items, frac(1)), frac(1))).toBe(true);
  });

  it('a triplet with a rest inside stays one group; two triplets in a row are two groups', () => {
    const rest = first('C5:1/12 r:1/12 E5:1/12');
    expect(tupletGroups(rest).map((g) => [g.start, g.end])).toEqual([[0, 2]]);
    const two = first('C5:1/6 D5:1/6 E5:1/6 F5:1/12 G5:1/12 A5:1/12');
    expect(tupletGroups(two).map((g) => [g.start, g.end])).toEqual([[0, 2], [3, 5]]);
  });

  it('a quintuplet of sixteenths fills one quarter', () => {
    const items = first('C5:1/20 D5:1/20 E5:1/20 F5:1/20 G5:1/20');
    expect(tupletGroups(items)).toEqual([{ start: 0, end: 4, ratio: { num: 5, numbase: 4 } }]);
  });
});

describe('durationName', () => {
  it('speaks musician', () => {
    expect(durationName(frac(3, 4))).toBe('punktierte Halbe');
    expect(durationName(frac(1, 8))).toBe('Achtel');
    expect(durationName(frac(5, 8))).toBe('Halbe + Achtel');
    expect(durationName(frac(1, 12))).toBe('Achtel (Triole)');
    expect(durationName(frac(1, 20))).toBe('Sechzehntel (Quintole)');
    expect(durationName(frac(1, 11))).toBe('1/11 (N-Tole)');
  });
});
