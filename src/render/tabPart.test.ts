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
