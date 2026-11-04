import { beforeAll, describe, expect, it } from 'vitest';
import { scoreToMei } from './mei';
import { Engraver } from './verovio';
import { demoScore } from '../core/demo';
import { frac } from '../core/time';

describe('scoreToMei', () => {
  const { mei, elements } = scoreToMei(demoScore());

  it('writes key, meter and instrument clefs', () => {
    expect(mei).toContain('meter.count="4" meter.unit="4" keysig="1s"');
    expect(mei).toMatch(/<label>Gitarre<\/label>/);
    expect(mei).toContain('clef.dis="8" clef.dis.place="below"');
    expect(mei).toMatch(/<staffGrp symbol="brace" bar.thru="true">/);
  });

  it('ties the note that crosses bar 2 → 3', () => {
    expect(mei).toMatch(/<note xml:id="v6-m2-1" dur="2" pname="d" oct="5" tie="i"\/>/);
    expect(mei).toMatch(/<note xml:id="v6-m3-1" dur="4" pname="d" oct="5" tie="t"\/>/);
  });

  it('prints a natural against the key, but no sharp that the key already has', () => {
    expect(mei).toMatch(/pname="f" oct="4" accid="n"/); // voice, bar 3
    expect(mei).toMatch(/pname="f" oct="4" accid.ges="s"/); // guitar F#4 in G major
    expect(mei).not.toMatch(/accid="s"/);
  });

  it('beams the eighths in bar 3 of the voice', () => {
    expect(mei).toMatch(/<beam xml:id="v7-m3-1-beam">\s*<note xml:id="v7-m3-1"[^>]*\/>\s*<note xml:id="v8-m3-1"[^>]*\/>\s*<\/beam>/);
  });

  it('maps rendered ids back to model events', () => {
    expect(elements.get('v6-m3-1')).toEqual({
      partId: 'voice',
      voiceId: 'voice-v1',
      eventId: 'v6',
      toneId: 'v6-t1',
      measureNumber: 3,
      staffN: 1,
      kind: 'note',
      onset: frac(2),
    });
    // a note inside a chord is named after its tone, not its position
    expect(elements.get('g1-m1-1-g1-t2')).toMatchObject({ eventId: 'g1', toneId: 'g1-t2', kind: 'chordNote' });
    expect(elements.get('g1-m1-1')).not.toHaveProperty('toneId');
    expect(elements.get('piano-lh-m4-r1')).toMatchObject({ kind: 'rest', staffN: 4, onset: frac(7, 2) });
  });

  it('adds an empty measure for the caret when asked', () => {
    const covered = scoreToMei(demoScore(), { coverTime: frac(4) });
    expect(covered.mei).toContain('<measure xml:id="m5" n="5">');
    expect(covered.elements.get('voice-v1-m5-mr')).toMatchObject({ kind: 'measureRest', onset: frac(4) });
  });
});

describe('upbeat in MEI', () => {
  it('writes measure 0 as intentionally short', () => {
    const { mei } = scoreToMei({ ...demoScore(), pickup: frac(1, 4) });
    expect(mei).toContain('<measure xml:id="m0" n="0" metcon="false">');
    expect(mei).toContain('<measure xml:id="m1" n="1">');
  });
});

describe('Verovio renders our MEI', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });

  it('without warnings, keeping our ids in the SVG', () => {
    const { mei } = scoreToMei(demoScore());
    const { pages, log } = engraver.engrave(mei);
    expect(log).toBe('');
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]).toContain('id="v6-m2-1"');
    expect(pages[0]).toContain('Erste Skizze');
  });

  it('with an upbeat and key/meter changes, still without warnings', () => {
    const score = {
      ...demoScore(),
      pickup: frac(1, 4),
      keys: [{ at: frac(0), fifths: 1 }, { at: frac(9, 4), fifths: -2 }],
      meter: [{ at: frac(0), sig: { count: 4, unit: 4 } }, { at: frac(5, 4), sig: { count: 3, unit: 4 } }],
    };
    const { log, pages } = engraver.engrave(scoreToMei(score).mei);
    expect(log).toBe('');
    expect(pages[0]).toContain('id="m0"');
  });
});

describe('staves shown as piano roll are left out', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });
  const score = demoScore();
  const guitar = score.parts.find((p) => p.instrument === 'guitar')!;
  const piano = score.parts.find((p) => p.instrument === 'piano')!;

  it('drops the staff, its notes and renumbers the rest', () => {
    const all = scoreToMei(score);
    const some = scoreToMei(score, { hiddenStaves: new Set([`${guitar.id}:0`]) });
    expect(some.staffs.length).toBe(all.staffs.length - 1);
    expect(some.staffs.map((s) => s.n)).toEqual(some.staffs.map((_, i) => i + 1));
    expect(some.staffs.some((s) => s.partId === guitar.id)).toBe(false);
    const guitarIds = [...all.elements.values()].filter((r) => r.partId === guitar.id).length;
    expect(guitarIds).toBeGreaterThan(0);
    expect([...some.elements.values()].some((r) => r.partId === guitar.id)).toBe(false);
  });

  it('keeps the other staff of a two-staff instrument and renders without warnings', () => {
    const { mei, staffs } = scoreToMei(score, { hiddenStaves: new Set([`${piano.id}:1`, `${guitar.id}:0`]) });
    expect(staffs.filter((s) => s.partId === piano.id).map((s) => s.staffIndex)).toEqual([0]);
    const { log, pages } = engraver.engrave(mei);
    expect(log).toBe('');
    expect(pages.length).toBeGreaterThan(0);
  });

  it('refuses to engrave nothing', () => {
    const every = new Set(scoreToMei(score).staffs.map((s) => `${s.partId}:${s.staffIndex}`));
    expect(() => scoreToMei(score, { hiddenStaves: every })).toThrow(/Keine Zeile/);
  });
});
