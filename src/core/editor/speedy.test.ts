import { describe, expect, it } from 'vitest';
import { frac } from '../time';
import { pitchToString } from '../pitch';
import { validateScore } from '../model';
import { type CommandId, chordSymbolText, enterChordByName, ghostPitches, lyricsText, newScoreState, runCommand, setChordSymbol, setLyrics } from './commands';
import { getVoice, type EditorState, type VoiceRef } from './state';

const VOICE: VoiceRef = { partId: 'voice', voiceId: 'voice-v1' };
const run = (s: EditorState, ...steps: [CommandId, number?][]): EditorState => steps.reduce((acc, [id, arg]) => runCommand(acc, id, arg ?? 0), s);
const notes = (s: EditorState): string[] =>
  getVoice(s.score, VOICE).voice.events.map((e) => `${e.tones.map((t) => pitchToString(t.pitch)).join(',')}:${e.duration.n}/${e.duration.d}`);

describe('Finale numpad typing: a ghost note at the caret (ADR 0018)', () => {
  it('Enter puts the ghost note (staff middle line at first) and the next Enter repeats it', () => {
    const s = run(newScoreState(), ['input.repeat'], ['input.repeat']);
    expect(notes(s)).toHaveLength(2);
    expect(notes(s)[0]).toBe(notes(s)[1]);
  });

  it('↑/↓ and the length key change the ghost, not the notes already there; Enter places it', () => {
    let s = run(newScoreState(), ['input.repeat']);
    const before = notes(s)[0]!;
    s = run(s, ['ghost.step', 2], ['input.length', 4]);
    expect(notes(s)).toEqual([before]); // nothing moved yet
    expect(ghostPitches(s)!.map(pitchToString)).not.toEqual(getVoice(s.score, VOICE).voice.events[0]!.tones.map((t) => pitchToString(t.pitch)));
    s = run(s, ['input.repeat'], ['input.repeat']);
    const [first, second, third] = notes(s);
    expect(first).toBe(before);
    expect(second).toMatch(/:1\/8$/);
    expect(third).toBe(second);
    expect(getVoice(s.score, VOICE).voice.events[2]!.onset).toEqual(frac(3, 8));
  });

  it('the length key changes the selected note when nothing is being typed', () => {
    let s = run(newScoreState(), ['input.repeat'], ['edit.escape']);
    s = run(s, ['input.length', 6]);
    expect(notes(s)[0]).toMatch(/:1\/2$/);
  });

  it('number row: interval above and below add tones to the ghost; Enter places the chord; the next proposal is only its lowest tone', () => {
    let s = run(newScoreState(), ['input.interval', 3], ['input.interval', -5]);
    expect(ghostPitches(s)).toHaveLength(3);
    s = run(s, ['input.repeat'], ['input.repeat']);
    const events = getVoice(s.score, VOICE).voice.events;
    expect(events.map((e) => e.tones.length)).toEqual([3, 1]);
    expect(pitchToString(events[1]!.tones[0]!.pitch)).toBe(pitchToString(events[0]!.tones[0]!.pitch));
    const pos = (p: { step: string; octave: number }) => p.octave * 7 + 'CDEFGAB'.indexOf(p.step);
    const [low, mid, high] = events[0]!.tones.map((t) => t.pitch);
    expect(pos(high!) - pos(mid!)).toBe(2); // a third above
    expect(pos(mid!) - pos(low!)).toBe(4); // a fifth below
  });

  it('the dot key dots the ghost note', () => {
    const s = run(newScoreState(), ['input.dot'], ['input.repeat']);
    expect(notes(s)[0]).toMatch(/:3\/8$/);
    expect(s.caret!.time).toEqual(frac(3, 8));
  });

  it('moving the caret forgets the ghost: the notes before it are the model again', () => {
    let s = run(newScoreState(), ['input.repeat'], ['ghost.step', 3]);
    expect(ghostPitches(s)).not.toBeNull();
    s = run(s, ['nav.horizontal', -1]);
    expect(s.input.ghost).toBeNull();
  });
});

describe('lyrics and chord symbols (ADR 0019)', () => {
  const three = (): EditorState => run(newScoreState(), ['input.repeat'], ['input.repeat'], ['input.repeat']);
  const lyrics = (s: EditorState): (string | undefined)[] => getVoice(s.score, VOICE).voice.events.map((e) => e.lyric);

  it('one syllable per note from the first note on, "_" skips a note', () => {
    let s = three();
    s = { ...s, caret: null, selection: { kind: 'event', ...VOICE, eventId: getVoice(s.score, VOICE).voice.events[0]!.id } };
    s = setLyrics(s, 'Hel- _ lo');
    expect(lyrics(s)).toEqual(['Hel-', undefined, 'lo']);
    expect(lyricsText(s)).toBe('Hel- _ lo');
  });

  it('notes after the last syllable lose their lyric; too many syllables are reported', () => {
    let s = three();
    const first = getVoice(s.score, VOICE).voice.events[0]!.id;
    s = { ...s, caret: null, selection: { kind: 'event', ...VOICE, eventId: first } };
    s = setLyrics(setLyrics(s, 'a b c'), 'x');
    expect(lyrics(s)).toEqual(['x', undefined, undefined]);
    expect(setLyrics(s, 'a b c d').message).toMatch(/1 Silbe/);
  });

  it('chord symbols sit at the caret time, are replaced and removed with empty text', () => {
    let s = run(newScoreState(), ['input.repeat']);
    s = setChordSymbol(s, 'Am7');
    expect(s.score.chords).toEqual([{ at: frac(1, 4), text: 'Am7' }]);
    expect(chordSymbolText(s)).toBe('Am7');
    s = setChordSymbol(setChordSymbol(s, 'F'), '');
    expect(s.score.chords).toBeUndefined();
  });
});

describe('tuplet mode (ADR 0020)', () => {
  it('triplet eighths: three notes fill exactly a quarter; the mode toggles off again', () => {
    let s = run(newScoreState(), ['input.length', 4], ['input.tuplet', 3], ['input.repeat'], ['input.repeat'], ['input.repeat']);
    expect(notes(s)).toHaveLength(3);
    expect(getVoice(s.score, VOICE).voice.events.map((e) => `${e.duration.n}/${e.duration.d}`)).toEqual(['1/12', '1/12', '1/12']);
    expect(s.caret!.time).toEqual(frac(1, 4));
    s = run(s, ['input.tuplet', 3], ['input.note', 4]);
    expect(getVoice(s.score, VOICE).voice.events[3]!.duration).toEqual(frac(1, 8));
  });

  it('quintuplet sixteenths fit a quarter', () => {
    const s = run(newScoreState(), ['input.length', 3], ['input.tuplet', 5], ...Array.from({ length: 5 }, (): [CommandId] => ['input.repeat']));
    expect(s.caret!.time).toEqual(frac(1, 4));
  });
});

describe('a chord entered by name (ADR 0037)', () => {
  const quarter = (): EditorState => run(newScoreState(), ['input.duration', 5]);

  it('puts all tones of "Cm7" on one note, moves the caret on by the note value, one undo step', () => {
    const s = enterChordByName(quarter(), 'Cm7');
    expect(getVoice(s.score, VOICE).voice.events).toHaveLength(1);
    const names = getVoice(s.score, VOICE).voice.events[0]!.tones.map((t) => pitchToString(t.pitch).replace(/\d/, ''));
    expect(names).toEqual(['C', 'Eb', 'G', 'Bb']);
    expect(s.caret!.time).toEqual(frac(1, 4));
    const ids = getVoice(s.score, VOICE).voice.events[0]!.tones.map((t) => t.id);
    expect(new Set(ids).size).toBe(4);
    expect(validateScore(s.score)).toEqual([]);
  });

  it('a second chord follows the first', () => {
    const s = enterChordByName(enterChordByName(quarter(), 'C'), 'G7');
    expect(getVoice(s.score, VOICE).voice.events.map((e) => e.tones.length)).toEqual([3, 4]);
    expect(s.caret!.time).toEqual(frac(1, 2));
    expect(validateScore(s.score)).toEqual([]);
  });

  it('turns the chord and can write the chord symbol above', () => {
    const s = enterChordByName(quarter(), 'C', { inversion: 1, symbol: true });
    expect(getVoice(s.score, VOICE).voice.events[0]!.tones.map((t) => pitchToString(t.pitch).replace(/\d/, ''))).toEqual(['E', 'G', 'C']);
    expect(s.score.chords).toEqual([{ at: frac(0), text: 'C' }]);
  });

  it('after a chord the next proposal is only its lowest tone', () => {
    const s = enterChordByName(quarter(), 'Cm7');
    expect(ghostPitches(s)!.map(pitchToString)).toEqual([pitchToString(getVoice(s.score, VOICE).voice.events[0]!.tones[0]!.pitch)]);
  });

  it('an unknown name changes nothing and says so', () => {
    const before = quarter();
    const s = enterChordByName(before, 'Xyz');
    expect(s.score).toBe(before.score);
    expect(s.message).toMatch(/kenne ich nicht/);
  });
});
