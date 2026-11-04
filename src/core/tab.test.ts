import { describe, expect, it } from 'vitest';
import { assignFrets } from './tab';
import { parseLine } from './line';

const fingering = (spec: string) => {
  const events = parseLine(spec, 'e');
  const map = assignFrets(events);
  return events.map((e) => e.tones.map((t) => { const f = map.get(t.id); return f ? `${f.string}:${f.fret}` : '-'; }).join(','));
};

describe('guitar fingering', () => {
  it('open strings and low notes land on the expected strings', () => {
    expect(fingering('E2:1/4 A2:1/4 D3:1/4 G3:1/4 B3:1/4 E4:1/4')).toEqual(['6:0', '5:0', '4:0', '3:0', '2:0', '1:0']);
  });

  it('a scale stays in one hand position instead of jumping strings', () => {
    // C major scale from C3: every note within frets 0–5 on neighbouring strings
    const frets = fingering('C3:1/4 D3:1/4 E3:1/4 F3:1/4 G3:1/4 A3:1/4 B3:1/4 C4:1/4').map((f) => Number(f.split(':')[1]));
    expect(Math.max(...frets)).toBeLessThanOrEqual(5);
  });

  it('a chord uses distinct strings (C major open shape)', () => {
    const [chord] = fingering('[C3,E3,G3,C4,E4]:1/2');
    const strings = chord!.split(',').map((f) => f.split(':')[0]);
    expect(new Set(strings).size).toBe(5);
    expect(chord).toBe('5:3,4:2,3:0,2:1,1:0');
  });

  it('tones outside the guitar are left out, not invented', () => {
    expect(fingering('C2:1/4 C7:1/4')).toEqual(['-', '-']);
  });
});
