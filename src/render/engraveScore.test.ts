import { beforeAll, describe, expect, it } from 'vitest';
import { frac } from '../core/time';
import { measuresOf, type Score } from '../core/model';
import { parsePitch } from '../core/pitch';
import { createScore, DEFAULT_SETUP, withBarsPerLine } from '../core/templates';
import { engraveScore, systemStartsOf } from './engraveScore';
import { Engraver } from './verovio';

/** A score of `bars` bars of one whole note each. */
function longScore(bars: number): Score {
  const base = createScore(DEFAULT_SETUP);
  const part = base.parts[0]!;
  const events = Array.from({ length: bars }, (_, i) => ({ id: `n${i}`, onset: frac(i, 1), duration: frac(1, 1), tones: [{ id: `n${i}-t1`, pitch: parsePitch('C4') }] }));
  return { ...base, parts: [{ ...part, voices: [{ ...part.voices[0]!, events }, ...part.voices.slice(1)] }, ...base.parts.slice(1)] };
}

describe('Akkoladen per page (ADR 0042)', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });

  it('with the lines fixed, every second Akkolade starts a new page', () => {
    const score = { ...longScore(12), layout: { perSystem: 2, systemsPerPage: 2 } };
    const { mei, engraved } = engraveScore(engraver, score);
    expect(engraved.pages).toHaveLength(3); // 6 systems, two per page
    expect(engraved.log).toBe('');
    expect(systemStartsOf(engraved.pages, mei.measureIds)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('with the lines left to the engraver, the page breaks fall between the lines it would draw', () => {
    const plain = longScore(40);
    const auto = engraveScore(engraver, plain, {}, { pageWidth: 1200 });
    const systems = systemStartsOf(auto.engraved.pages, auto.mei.measureIds);
    expect(systems.length).toBeGreaterThan(3);
    const paged = engraveScore(engraver, { ...plain, layout: { systemsPerPage: 2 } }, {}, { pageWidth: 1200 });
    expect(paged.engraved.pages).toHaveLength(Math.ceil(systems.length / 2));
    expect(systemStartsOf(paged.engraved.pages, paged.mei.measureIds)).toEqual(systems); // the same lines as before
  });

  it('without the setting nothing changes: one engraving, as many systems as fit on one page', () => {
    const { engraved } = engraveScore(engraver, longScore(12), {}, { pageWidth: 1200 });
    expect(engraved.pages).toHaveLength(1);
  });
});

describe('bars per Akkolade for marked bars', () => {
  it('starts a line at the first marked bar, fills it with n bars and starts a new one after the last marked bar', () => {
    const score = longScore(12);
    const next = withBarsPerLine(score, [4, 8], 5, 9, 2);
    expect(next.layout?.breaks).toEqual([4, 5, 7, 9, 10]);
    expect(measuresOf(next)).toHaveLength(12);
  });

  it('keeps the lines outside the marked bars and the Akkoladen per page', () => {
    const score = { ...longScore(12), layout: { perSystem: 4, systemsPerPage: 3 } };
    const next = withBarsPerLine(score, [4, 8], 0, 1, 1);
    expect(next.layout).toEqual({ breaks: [1, 2, 4, 8], systemsPerPage: 3 });
  });
});
