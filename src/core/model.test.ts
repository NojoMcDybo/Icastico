import { describe, expect, it } from 'vitest';
import { frac, ZERO } from './time';
import { freshToneId, measuresOf, setTempoChange, tempoAt, validateScore, withTempoAt, type Score } from './model';
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

describe('tempo changes (ADR 0039)', () => {
  const start = base({ tempo: 120 });

  it('tempoAt: the start tempo, then each change from its bar on', () => {
    const s = setTempoChange(setTempoChange(start, frac(1), 90), frac(3), 140);
    expect([0, 1, 2, 3, 5].map((t) => tempoAt(s, frac(t)))).toEqual([120, 90, 90, 140, 140]);
    expect(tempoAt(base(), frac(7))).toBe(100);
  });

  it('setTempoChange: replaces, removes, drops a change equal to the tempo before it, keeps the order', () => {
    let s = setTempoChange(start, frac(2), 90);
    s = setTempoChange(s, frac(1), 100);
    expect(s.tempos).toEqual([{ at: frac(1), bpm: 100 }, { at: frac(2), bpm: 90 }]);
    expect(setTempoChange(s, frac(1), 120).tempos).toEqual([{ at: frac(2), bpm: 90 }]); // as the start tempo: no change
    expect(setTempoChange(s, frac(2), 100).tempos).toEqual([{ at: frac(1), bpm: 100 }]);
    expect(setTempoChange(setTempoChange(s, frac(1), null), frac(2), null).tempos).toBeUndefined();
    expect(setTempoChange(s, frac(2), 9999).tempos![1]!.bpm).toBe(400);
  });

  it('at the very start it is the start tempo', () => {
    expect(setTempoChange(start, ZERO, 80).tempo).toBe(80);
  });

  it('withTempoAt changes the tempo that is in force there, without making a new change', () => {
    const s = setTempoChange(start, frac(2), 90);
    expect(withTempoAt(s, frac(1), 110).tempo).toBe(110);
    expect(withTempoAt(s, frac(1), 110).tempos).toEqual(s.tempos);
    expect(withTempoAt(s, frac(3), 70).tempos).toEqual([{ at: frac(2), bpm: 70 }]);
    expect(withTempoAt(s, frac(3), 70).tempo).toBe(120);
  });

  it('validateScore: changes must start a bar, ascend and stay in range', () => {
    expect(validateScore(setTempoChange(start, frac(2), 90))).toEqual([]);
    expect(validateScore(base({ tempos: [{ at: frac(3, 2), bpm: 90 }] }))[0]).toMatch(/Taktanfang/);
    expect(validateScore(base({ tempos: [{ at: frac(2), bpm: 90 }, { at: frac(1), bpm: 80 }] }))[0]).toMatch(/aufsteigen/);
    expect(validateScore(base({ tempos: [{ at: ZERO, bpm: 90 }] }))[0]).toMatch(/Tempowechsel/);
    expect(validateScore(base({ tempos: [{ at: frac(1), bpm: 5 }] }))[0]).toMatch(/Tempo 5/);
  });
});
