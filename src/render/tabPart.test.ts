import { beforeAll, describe, expect, it } from 'vitest';
import { addInstrument, emptyScore } from '../core/templates';
import { parseLine } from '../core/line';
import { Engraver } from './verovio';
import { scoreToMei } from './mei';
import { applyTabNumbers } from './tab';

describe('a tablature instrument (ADR 0030)', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });

  function score() {
    const base = emptyScore();
    const { score: withTab, partId } = addInstrument(base, 'tab');
    const events = parseLine('E3:1/4 A3:1/4 [E3,B3]:1/4 G4:1/4', 'tab-v1');
    return {
      partId,
      score: { ...withTab, parts: withTab.parts.map((p) => (p.id === partId ? { ...p, voices: [{ ...p.voices[0]!, events }] } : p)) },
    };
  }

  it('is a staff of the model: its notes keep their ids and can be clicked', () => {
    const { score: s, partId } = score();
    const result = scoreToMei(s);
    expect(result.staffs.some((x) => x.partId === partId)).toBe(true);
    const noteIds = [...result.elements.entries()].filter(([, ref]) => ref.partId === partId && (ref.kind === 'chordNote' || (ref.kind === 'note' && ref.toneId))).map(([id]) => id);
    expect(noteIds.length).toBeGreaterThanOrEqual(3);
    // fret numbers are known for every note id of the staff
    for (const id of noteIds) expect(result.tab.has(id), id).toBe(true);
  });

  it('draws six string lines with fret numbers instead of noteheads, and Verovio does not complain', () => {
    const { score: s } = score();
    const result = scoreToMei(s);
    const { log, pages } = engraver.engrave(result.mei);
    expect(log).toBe('');
    const svg = applyTabNumbers(pages[0]!, result.tab);
    expect((svg.match(/class="tabnumber"/g) ?? []).length).toBeGreaterThanOrEqual(5); // 3 single notes + the 2 of the chord
    expect(result.mei).toMatch(/lines="6"/);
  });

  it('works next to a classical guitar staff', () => {
    const { score: s } = score();
    const both = addInstrument(s, 'guitar').score;
    const result = scoreToMei(both);
    expect([...new Set(result.staffs.map((x) => x.partId))].sort()).toEqual([...new Set(both.parts.map((p) => p.id))].sort());
    expect(engraver.engrave(result.mei).log).toBe('');
  });
});

describe('a tablature line shows numbers, not note values (ADR 0032)', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });

  function tabScore(tuning?: readonly number[]) {
    const base = emptyScore();
    const { score: withTab, partId } = addInstrument(base, 'tab');
    const events = parseLine('E2:1/8 A2:1/8 [E2,B2]:1/4 G3:1/2', 'tab-v1');
    return { ...withTab, parts: withTab.parts.map((p) => (p.id === partId ? { ...p, ...(tuning ? { tuning } : {}), voices: [{ ...p.voices[0]!, events }] } : p)) };
  }
  const draw = (s: ReturnType<typeof tabScore>) => {
    const r = scoreToMei(s);
    const { pages, log } = engraver.engrave(r.mei);
    expect(log).toBe('');
    return { svg: applyTabNumbers(pages[0]!, r.tab), mei: r.mei, tab: r.tab };
  };
  const tabStaff = (svg: string) => svg.slice(svg.lastIndexOf('class="staff"'));

  it('draws no stems, flags or beams on the tab line, while the other lines keep theirs', () => {
    const s = tabScore();
    const out = draw(s);
    const tabOnly = tabStaff(out.svg);
    expect(tabOnly).not.toMatch(/class="stem"/);
    expect(tabOnly).not.toMatch(/class="flag"/);
    expect(tabOnly).not.toMatch(/class="beam"/);
    expect((tabOnly.match(/class="tabnumber"/g) ?? []).length).toBe(5);
  });

  it('a different tuning changes the numbers: in Drop D the low string is a whole tone lower', () => {
    const standard = [...draw(tabScore()).tab.values()];
    const drop = [...draw(tabScore([64, 59, 55, 50, 45, 38])).tab.values()];
    expect(standard).not.toEqual(drop);
    // E2 is the open low string in standard tuning (0) and the second fret in Drop D
    expect(standard).toContain('0');
    expect(drop).toContain('2');
  });

  it('a string that was chosen is kept', () => {
    const base = tabScore();
    const part = base.parts.find((p) => p.instrument === 'tab')!;
    const moved = { ...base, parts: base.parts.map((p) => (p.id === part.id ? { ...p, voices: [{ ...p.voices[0]!, events: p.voices[0]!.events.map((e, i) => (i === 3 ? { ...e, tones: e.tones.map((t) => ({ ...t, string: 4 })) } : e)) }] } : p)) };
    // G3 (midi 55) on string 4 (d, 50) is fret 5; automatically it would be the open string 3
    const numbers = [...scoreToMei(moved).tab.values()];
    expect(numbers).toContain('5');
  });
});

describe('TAB letters and the tuning in the printed score (ADR 0033)', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });
  const tabScore = (tuning?: readonly number[]) => {
    const { score, partId } = addInstrument(emptyScore(), 'tab');
    return { ...score, parts: score.parts.map((p) => (p.id === partId ? { ...p, ...(tuning ? { tuning } : {}), voices: [{ ...p.voices[0]!, events: parseLine('E3:1/4 A3:1/4', 'tab-v1') }] } : p)) };
  };
  const svgOf = (s: ReturnType<typeof tabScore>) => {
    const r = scoreToMei(s);
    const { pages } = engraver.engrave(r.mei, { tab: r.tab, tabStaffs: r.tabStaffs });
    return pages[0]!;
  };

  it('writes T A B in place of a clef at the start of the tab staff', () => {
    const svg = svgOf(tabScore());
    expect((svg.match(/class="tabclef"/g) ?? []).length).toBe(3);
    expect(svg).not.toMatch(/class="tabtuning"/); // standard tuning: nothing to say
  });

  it('names a tuning that is not the standard one, once, above the first line', () => {
    const svg = svgOf(tabScore([64, 59, 55, 50, 45, 38]));
    expect((svg.match(/class="tabtuning"/g) ?? []).length).toBe(1);
    expect(svg).toMatch(/>Drop D</);
  });

  it('a tuning of its own is written as the six string names', () => {
    expect(svgOf(tabScore([64, 59, 55, 50, 45, 37]))).toMatch(/>Cis A d g h e</);
  });

  it('barlines run through all staves of the system', () => {
    const r = scoreToMei(tabScore());
    expect(r.mei).toMatch(/<staffGrp bar\.thru="true">/);
  });
});
