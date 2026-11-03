import { describe, expect, it } from 'vitest';
import { frac, ZERO } from './time';
import { freshToneId, measuresOf, validateScore, type Score } from './model';
import { parseLine } from './line';
import { demoScore } from './demo';

const base = (overrides: Partial<Score> = {}): Score => ({
  title: 'Test',
  meter: [{ at: ZERO, sig: { count: 4, unit: 4 } }],
  keys: [{ at: ZERO, fifths: 0 }],
  parts: [],
  ...overrides,
});

describe('measuresOf', () => {
  it('derives measures from content length', () => {
    const ms = measuresOf(demoScore());
    expect(ms).toHaveLength(4);
    expect(ms[3]!.start).toEqual(frac(3));
    expect(ms[0]!.fifths).toBe(1);
  });

  it('handles meter changes', () => {
    const score = base({
      meter: [
        { at: ZERO, sig: { count: 4, unit: 4 } },
        { at: frac(1), sig: { count: 3, unit: 4 } },
      ],
    });
    const ms = measuresOf(score, 3);
    expect(ms.map((m) => `${m.sig.count}/${m.sig.unit}`)).toEqual(['4/4', '3/4', '3/4']);
    expect(ms[2]!.start).toEqual(frac(7, 4));
  });

  it('always yields at least one measure', () => {
    expect(measuresOf(base())).toHaveLength(1);
  });
});

describe('validateScore', () => {
  it('accepts the demo', () => {
    expect(validateScore(demoScore())).toEqual([]);
  });

  it('finds overlaps, bad staves and bad ids', () => {
    const events = [...parseLine('C4:1/2', 'a'), { ...parseLine('D4:1/2', 'b')[0]!, onset: frac(1, 4) }];
    const score = base({
      parts: [
        {
          id: 'p',
          name: 'Gesang',
          instrument: 'voice',
          voices: [
            { id: 'v1', staff: 0, events },
            { id: 'v2', staff: 3, events: [{ ...parseLine('E4:1/4', 'x')[0]!, id: '1 bad' }] },
          ],
        },
      ],
    });
    const problems = validateScore(score).join('\n');
    expect(problems).toMatch(/überlappt/);
    expect(problems).toMatch(/nicht vorhandenes System/);
    expect(problems).toMatch(/Ungültige Event-ID/);
  });

  it('hands out unused tone ids and rejects duplicates', () => {
    const events = parseLine('C4:1/4 [E4,G4]:1/4', 'e');
    const score = base({
      parts: [{ id: 'p', name: 'Gesang', instrument: 'voice', voices: [{ id: 'v1', staff: 0, events }] }],
    });
    expect(freshToneId(score, 'e1')).toBe('e1-t2');
    expect(freshToneId(score, 'e2')).toBe('e2-t3');
    expect(freshToneId(score, 'new')).toBe('new-t1');
    const clash = base({
      parts: [
        {
          id: 'p',
          name: 'Gesang',
          instrument: 'voice',
          voices: [{ id: 'v1', staff: 0, events: [events[0]!, { ...events[1]!, tones: [{ id: 'e1-t1', pitch: events[1]!.tones[0]!.pitch }] }] }],
        },
      ],
    });
    expect(validateScore(clash).join()).toMatch(/Doppelte Ton-ID e1-t1/);
  });

  it('rejects meter changes off the barline', () => {
    const score = base({
      meter: [
        { at: ZERO, sig: { count: 4, unit: 4 } },
        { at: frac(1, 2), sig: { count: 3, unit: 4 } },
      ],
    });
    expect(validateScore(score).join()).toMatch(/Taktstrich/);
  });
});
