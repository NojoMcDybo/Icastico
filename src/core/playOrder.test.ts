import { describe, expect, it } from 'vitest';
import { playMapOf, playOrder } from './playOrder';
import { planPlayback } from './playback';
import { emptyScore } from './templates';
import { parseLine } from './line';
import { frac, ZERO } from './time';
import { type BarMark, type Score } from './model';
import { type BarSignKind } from './symbols';

/** Eight bars of 4/4, one whole note each: C D E F G A B C. */
function bars(marks: [number, BarSignKind][] = []): Score {
  const base = emptyScore();
  const voice = base.parts[0]!.voices[0]!;
  const events = parseLine('C5:1 D5:1 E5:1 F5:1 G5:1 A5:1 B5:1 C6:1', 'e');
  const m: BarMark[] = marks.map(([bar, kind]) => ({ at: frac(bar), kind }));
  return { ...base, ...(m.length ? { marks: m } : {}), parts: [{ ...base.parts[0]!, voices: [{ ...voice, events }] }] };
}

/** The bars in the order they are played, as bar numbers (1 = first bar). */
function played(score: Score): number[] {
  const map = playMapOf(score);
  return map.score.parts[0]!.voices[0]!.events.map((e) => Math.round(Number(e.id.slice(1, e.id.indexOf('~') < 0 ? undefined : e.id.indexOf('~'))))).map((n) => n);
}

describe('play order', () => {
  it('without repeat signs the bars simply follow each other', () => {
    expect(playOrder(bars())).toBeNull();
    expect(playOrder(bars([[1, 'segno'], [3, 'coda']]))).toBeNull(); // signs alone do not change the order
  });

  it('a repeat plays its bars twice', () => {
    expect(played(bars([[1, 'repeatStart'], [2, 'repeatEnd']]))).toEqual([1, 2, 3, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('without a start sign a repeat goes back to the beginning', () => {
    expect(played(bars([[1, 'repeatEnd']]))).toEqual([1, 2, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('endings: the first time bar 3 (1.), the second time bar 4 (2.)', () => {
    // bars 1–2 repeated, bar 3 is the 1st ending (with the repeat sign), bar 4 the 2nd ending
    const s = bars([[0, 'repeatStart'], [2, 'volta1'], [2, 'repeatEnd'], [3, 'volta2']]);
    expect(played(s)).toEqual([1, 2, 3, 1, 2, 4, 5, 6, 7, 8]);
  });

  it('D.C. al Fine plays from the start to Fine and does not repeat again', () => {
    const s = bars([[0, 'repeatStart'], [1, 'repeatEnd'], [3, 'fine'], [5, 'dcFine']]);
    expect(played(s)).toEqual([1, 2, 1, 2, 3, 4, 5, 6, 1, 2, 3, 4]);
  });

  it('D.S. al Coda jumps to the segno and from "To Coda" to the coda', () => {
    const s = bars([[1, 'segno'], [3, 'toCoda'], [5, 'dsCoda'], [6, 'coda']]);
    expect(played(s)).toEqual([1, 2, 3, 4, 5, 6, 2, 3, 4, 7, 8]);
  });

  it('a runaway score ends instead of looping forever', () => {
    const s = bars([[0, 'dc'], [7, 'dc']]);
    expect(played(s).length).toBeLessThan(200);
  });

  it('the playhead maps back to the written bar and forward to where playing starts', () => {
    const map = playMapOf(bars([[0, 'repeatStart'], [1, 'repeatEnd']]));
    expect(map.fromScore(frac(1))).toEqual(frac(1)); // bar 2, first time
    expect(map.toScore(frac(3))).toEqual(frac(1)); // the second time through bar 2
    expect(map.toScore(ZERO)).toEqual(ZERO);
  });
});

describe('dynamics and articulation in the sound', () => {
  const withMarks = (spec: Record<number, string[]>): Score => {
    const s = bars();
    const part = s.parts[0]!;
    return { ...s, parts: [{ ...part, voices: part.voices.map((v) => ({ ...v, events: v.events.map((e, i) => (spec[i] ? { ...e, marks: spec[i]! } : e)) })) }] };
  };

  it('a dynamic sign sets the strength of this and the following notes', () => {
    const plan = planPlayback(withMarks({ 0: ['p'], 3: ['f'] }));
    expect(plan.notes.map((n) => n.volume ?? 100)).toEqual([48, 48, 48, 96, 96, 96, 96, 96]);
  });

  it('a crescendo moves in even steps up to the next dynamic', () => {
    const plan = planPlayback(withMarks({ 0: ['p'], 1: ['cresc'], 4: ['f'] }));
    const v = plan.notes.map((n) => n.volume ?? 100);
    expect(v[0]).toBe(48);
    expect(v[1]).toBeLessThan(v[2]!);
    expect(v[2]).toBeLessThan(v[3]!);
    expect(v[4]).toBe(96);
  });

  it('staccato shortens the sound, tenuto keeps it, an accent strikes harder', () => {
    const plan = planPlayback(withMarks({ 0: ['stacc'], 1: ['ten'], 2: ['acc'] }));
    const length = plan.notes.map((n) => n.end - n.start);
    expect(length[0]).toBeCloseTo(length[1]! / 2, 5);
    expect(plan.notes[2]!.volume!).toBeGreaterThan(100);
  });
});
