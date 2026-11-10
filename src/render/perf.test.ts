import { expect, it } from 'vitest';
import { scoreToMei } from './mei';
import { Engraver } from './verovio';
import { parseLine } from '../core/line';
import type { Score } from '../core/model';
import { ZERO } from '../core/time';

/** A song of typical length: melody over a piano, `bars` bars of 4/4. */
function song(bars: number): Score {
  const repeat = (bar: string) => Array.from({ length: bars }, () => bar).join(' | ');
  return {
    title: 'Tempo',
    composer: '',
    meter: [{ at: ZERO, sig: { count: 4, unit: 4 } }],
    keys: [{ at: ZERO, fifths: 1 }],
    parts: [
      { id: 'voice', name: 'Gesang', instrument: 'voice', voices: [{ id: 'v', staff: 0, events: parseLine(repeat('G4:1/8 A4:1/8 B4:1/8 C5:1/8 D5:1/8 C5:1/8 B4:1/8 A4:1/8'), 'v') }] },
      {
        id: 'piano',
        name: 'Klavier',
        instrument: 'piano',
        voices: [
          { id: 'rh', staff: 0, events: parseLine(repeat('[B3,D4,G4]:1/4 [A3,D4,F#4]:1/4 [G3,C4,E4]:1/4 [A3,D4,F#4]:1/4'), 'r') },
          { id: 'lh', staff: 1, events: parseLine(repeat('G2:1/2 D3:1/2'), 'l') },
        ],
      },
    ],
  };
}

// Every change engraves the whole score again, so this time is what the owner waits for after each note.
// Measured: about 180 ms (2026-11, 64 bars × 3 staves). The limit is wide on purpose: it catches a change
// that makes engraving several times slower, not a slow CI machine.
it('engraves a 64-bar song for three staves well within 1.5 seconds', async () => {
  const engraver = await Engraver.create();
  const warmUp = scoreToMei(song(2));
  engraver.engrave(warmUp.mei);
  const score = song(64);
  const started = performance.now();
  const result = scoreToMei(score);
  const { pages } = engraver.engrave(result.mei, { pageWidth: 2750, scale: 40, tab: result.tab, tabStaffs: result.tabStaffs });
  const took = performance.now() - started;
  expect(pages.length).toBeGreaterThan(1);
  expect(took).toBeLessThan(1500);
});
