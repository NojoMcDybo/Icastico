import { describe, expect, it } from 'vitest';
import { frac } from '../time';
import { BAR_SIGNS, NOTE_SYMBOLS, toggleNoteSymbol } from '../symbols';
import { validateScore } from '../model';
import { type CommandId, dropBarSign, dropNoteSign, newScoreState, runCommand, signsAtFocus } from './commands';
import { getVoice, type EditorState, type VoiceRef } from './state';

const VOICE: VoiceRef = { partId: 'voice', voiceId: 'voice-v1' };
const note = (id: string) => NOTE_SYMBOLS.findIndex((s) => s.id === id);
const bar = (id: string) => BAR_SIGNS.findIndex((s) => s.id === id);
const run = (s: EditorState, id: CommandId, arg = 0): EditorState => runCommand(s, id, arg);
const events = (s: EditorState) => getVoice(s.score, VOICE).voice.events;

/** Eight quarter notes: two bars of 4/4. */
function eight(): EditorState {
  let s = newScoreState();
  s = run(s, 'input.duration', 5);
  for (let i = 0; i < 8; i++) s = run(s, 'input.note', 0);
  return s;
}

describe('signs on notes', () => {
  it('a sign goes on the selected note and a second press takes it off', () => {
    let s = eight();
    s = run(s, 'mark.toggle', note('stacc'));
    expect(events(s)[7]!.marks).toEqual(['stacc']);
    s = run(s, 'mark.toggle', note('stacc'));
    expect(events(s)[7]!.marks).toBeUndefined();
    expect(validateScore(s.score)).toEqual([]);
  });

  it('dynamics replace each other, hairpins replace each other, other signs stay', () => {
    expect(toggleNoteSymbol(['p', 'fermata'], 'f')).toEqual(['f', 'fermata']);
    expect(toggleNoteSymbol(['cresc', 'mf'], 'dim')).toEqual(['mf', 'dim']);
    expect(toggleNoteSymbol(['stacc'], 'ten')).toEqual(['ten']);
    expect(toggleNoteSymbol(['stacc'], 'acc')).toEqual(['stacc', 'acc']);
    expect(toggleNoteSymbol(['trill'], 'turn')).toEqual(['turn']);
  });

  it('with nothing selected the message says so and nothing changes', () => {
    const s = run(newScoreState(), 'mark.toggle', note('p'));
    expect(s.message).toMatch(/Keine Note/);
    expect(s.score.marks).toBeUndefined();
  });

  it('the palette is told which signs are on', () => {
    const s = run(run(eight(), 'mark.toggle', note('mf')), 'mark.bar', bar('repeatEnd'));
    expect(signsAtFocus(s)).toEqual({ note: ['mf'], bar: ['repeatEnd'] });
  });
});

describe('signs on bars', () => {
  it('belong to the bar of the selected note; volta signs replace each other; a second press removes', () => {
    let s = eight(); // 4/4: the last note is in bar 2, which starts at 1
    s = run(s, 'mark.bar', bar('volta1'));
    expect(s.score.marks).toEqual([{ at: frac(1, 1), kind: 'volta1' }]);
    s = run(s, 'mark.bar', bar('volta2'));
    expect(s.score.marks).toEqual([{ at: frac(1, 1), kind: 'volta2' }]);
    s = run(s, 'mark.bar', bar('repeatEnd'));
    expect(s.score.marks!.map((m) => m.kind)).toEqual(['repeatEnd', 'volta2']);
    s = run(run(s, 'mark.bar', bar('volta2')), 'mark.bar', bar('repeatEnd'));
    expect(s.score.marks).toBeUndefined();
    expect(validateScore(s.score)).toEqual([]);
  });

  it('jump signs replace each other', () => {
    let s = run(eight(), 'mark.bar', bar('dc'));
    s = run(s, 'mark.bar', bar('dsCoda'));
    expect(s.score.marks!.map((m) => m.kind)).toEqual(['dsCoda']);
  });
});

describe('drag and drop of signs', () => {
  it('a sign dropped on another note lands there; a moved sign leaves the old note', () => {
    const s = eight();
    const [first, , third] = events(s);
    let t = dropNoteSign(s, 'stacc', { ref: VOICE, eventId: first!.id });
    expect(events(t)[0]!.marks).toEqual(['stacc']);
    t = dropNoteSign(t, 'stacc', { ref: VOICE, eventId: third!.id }, { ref: VOICE, eventId: first!.id });
    expect(events(t)[0]!.marks).toBeUndefined();
    expect(events(t)[2]!.marks).toEqual(['stacc']);
    // dropping it on the note it already sits on changes nothing
    expect(events(dropNoteSign(t, 'stacc', { ref: VOICE, eventId: third!.id }, { ref: VOICE, eventId: third!.id }))[2]!.marks).toEqual(['stacc']);
    expect(validateScore(t.score)).toEqual([]);
  });

  it('a dynamic dropped on a note replaces the one that was there', () => {
    const s = eight();
    const id = events(s)[1]!.id;
    const t = dropNoteSign(dropNoteSign(s, 'p', { ref: VOICE, eventId: id }), 'f', { ref: VOICE, eventId: id });
    expect(events(t)[1]!.marks).toEqual(['f']);
  });

  it('a bar sign can be dropped on a bar and moved to another', () => {
    const s = eight();
    let t = dropBarSign(s, 'repeatStart', frac(0, 1));
    expect(t.score.marks).toEqual([{ at: frac(0, 1), kind: 'repeatStart' }]);
    t = dropBarSign(t, 'repeatStart', frac(1, 1), frac(0, 1));
    expect(t.score.marks).toEqual([{ at: frac(1, 1), kind: 'repeatStart' }]);
    expect(validateScore(t.score)).toEqual([]);
  });
});
