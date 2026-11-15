import { beforeAll, describe, expect, it } from 'vitest';
import { frac } from '../core/time';
import { measuresOf, type Score } from '../core/model';
import { parsePitch } from '../core/pitch';
import { createScore, DEFAULT_SETUP, withBarsPerLine } from '../core/templates';
import { engraveScore, systemStartsOf } from './engraveScore';
import { getInstrument } from '../core/instruments';
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

describe('page margins (ADR 0044)', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });
  /** Where the first staff line starts, in the units of the drawing. */
  const staffLeft = (svg: string): number => Number(/class="page-margin" transform="translate\((\d+),/.exec(svg)![1]);

  it('a wider margin pushes the music in from the edge of the page', () => {
    const score = longScore(4);
    const plain = engraveScore(engraver, score, {}, { pageWidth: 2100, scale: 40 }).engraved.pages[0]!;
    const wide = engraveScore(engraver, { ...score, layout: { margins: { top: 6, bottom: 6, left: 30, right: 6 } } }, {}, { pageWidth: 2100, scale: 40 }).engraved.pages[0]!;
    const none = engraveScore(engraver, { ...score, layout: { margins: { top: 0, bottom: 0, left: 0, right: 0 } } }, {}, { pageWidth: 2100, scale: 40 }).engraved.pages[0]!;
    expect(staffLeft(wide)).toBeGreaterThan(staffLeft(plain));
    expect(staffLeft(none)).toBeLessThan(staffLeft(plain));
  });
});

describe('title, composer and instrument names (ADR 0045)', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });
  /** Position and size of the text line that holds `text`. */
  const line = (svg: string, text: string) => {
    const at = svg.indexOf(`>${text}<`);
    expect(at).toBeGreaterThan(-1);
    const head = svg.slice(0, at);
    const size = Number(/font-size="(\d+)px"[^>]*$/.exec(head)![1]);
    const pos = [...head.matchAll(/x="(\d+)" y="(\d+)"/g)].pop()!;
    return { x: Number(pos[1]), y: Number(pos[2]), size };
  };

  it('the composer stands at the right, one line below the title and smaller', () => {
    const score = { ...longScore(4), title: 'Mein Titel', composer: 'Max Muster' };
    const svg = engraveScore(engraver, score, {}, { pageWidth: 2100, scale: 40, pageHeight: 2970 }).engraved.pages[0]!;
    const title = line(svg, 'Mein Titel');
    const composer = line(svg, 'Max Muster');
    expect(composer.y).toBeGreaterThan(title.y);
    expect(composer.x).toBeGreaterThan(title.x);
    expect(composer.size).toBeLessThan(title.size);
  });

  it('the instrument name stands at the first Akkolade only', () => {
    const score = { ...longScore(12), layout: { perSystem: 2 } };
    const svg = engraveScore(engraver, score).engraved.pages[0]!;
    expect(svg.match(/class="system"/g)!.length).toBeGreaterThan(2);
    expect(svg.match(new RegExp(`>${score.parts[0]!.name}<`, 'g'))).toHaveLength(1);
    expect(svg).not.toContain(`>${getInstrument(score.parts[0]!.instrument).shortName}<`);
  });
});
