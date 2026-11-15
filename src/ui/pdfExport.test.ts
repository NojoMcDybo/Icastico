import { beforeAll, describe, expect, it } from 'vitest';
import { frac } from '../core/time';
import { parsePitch } from '../core/pitch';
import { createScore, DEFAULT_SETUP } from '../core/templates';
import type { Score } from '../core/model';
import { engraveScore, systemStartsOf } from '../render/engraveScore';
import { Engraver } from '../render/verovio';
import { printPages } from './pdfExport';

function longScore(bars: number): Score {
  const base = createScore(DEFAULT_SETUP);
  const part = base.parts[0]!;
  const events = Array.from({ length: bars }, (_, i) => ({ id: `n${i}`, onset: frac(i, 1), duration: frac(1, 1), tones: [{ id: `n${i}-t`, pitch: parsePitch('C4') }] }));
  return { ...base, parts: [{ ...part, voices: [{ ...part.voices[0]!, events }, ...part.voices.slice(1)] }, ...base.parts.slice(1)] };
}

describe('print as on the screen (ADR 0046)', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });

  it('size "wie in der Partitur" gives the pages and Akkoladen of the screen, also for lines the engraver chooses', () => {
    const score = { ...longScore(40), layout: { systemsPerPage: 2, margins: { top: 10, bottom: 10, left: 12, right: 12 } } };
    const view = { pageWidth: 2000, scale: 55 };
    const screen = engraveScore(engraver, score, {}, { ...view, pageHeight: Math.round((view.pageWidth * 297) / 210) });
    const pages = printPages(engraver, score, { landscape: false, scale: 0, pack: false, like: view });
    expect(pages.length).toBe(screen.engraved.pages.length);
    expect(systemStartsOf(pages, screen.mei.measureIds)).toEqual(systemStartsOf(screen.engraved.pages, screen.mei.measureIds));
  });

  it('a fixed staff size still works', () => {
    const pages = printPages(engraver, longScore(12), { landscape: false, scale: 60, pack: false });
    expect(pages.length).toBeGreaterThan(0);
  });
});
