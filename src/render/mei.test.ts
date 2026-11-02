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
      measureNumber: 3,
      staffN: 1,
      kind: 'note',
      onset: frac(2),
    });
    expect(elements.get('g1-m1-1-2')).toMatchObject({ eventId: 'g1', kind: 'chordNote' }); // a note inside a chord
    expect(elements.get('piano-lh-m4-r1')).toMatchObject({ kind: 'rest', staffN: 4, onset: frac(7, 2) });
  });

  it('adds an empty measure for the caret when asked', () => {
    const covered = scoreToMei(demoScore(), { coverTime: frac(4) });
    expect(covered.mei).toContain('<measure xml:id="m5" n="5">');
    expect(covered.elements.get('voice-v1-m5-mr')).toMatchObject({ kind: 'measureRest', onset: frac(4) });
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
});
