import { describe, expect, it } from 'vitest';
import { frac } from '../time';
import { BAR_SIGNS, NOTE_SYMBOLS, toggleNoteSymbol } from '../symbols';
import { validateScore } from '../model';
import { type CommandId, dropBarSign, dropNoteSign, newScoreState, runCommand, signsAtFocus } from './commands';
import { getVoice, staffCenter, type EditorState, type VoiceRef } from './state';
import { CLEF_IDS } from '../instruments';
import { parsePitch } from '../pitch';

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
    expect(signsAtFocus(s)).toMatchObject({ note: ['mf'], bar: ['repeatEnd'] });
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

describe('brackets and braces around parts', () => {
  const selectPart = (s: EditorState, partId: string): EditorState => ({ ...s, caret: null, selection: { kind: 'event', partId, voiceId: `${partId}-v1`, eventId: 'x' } });
  const group = (s: EditorState, id: 'bracket' | 'brace') => runCommand(s, 'mark.group', id === 'bracket' ? 0 : 1);

  it('a bracket joins the selected line with the one below, the same sign again takes it out', () => {
    let s = selectPart(eight(), 'voice');
    s = group(s, 'bracket');
    expect(s.score.groups).toEqual([{ symbol: 'bracket', parts: ['voice', 'guitar'] }]);
    expect(validateScore(s.score)).toEqual([]);
    expect(signsAtFocus(s).group).toEqual(['bracket']);
    s = group(s, 'bracket');
    expect(s.score.groups).toBeUndefined();
  });

  it('another symbol changes it, a third line extends it, and the last line has nothing below', () => {
    let s = group(selectPart(eight(), 'voice'), 'bracket');
    s = group(s, 'brace');
    expect(s.score.groups).toEqual([{ symbol: 'brace', parts: ['voice', 'guitar'] }]);
    s = group(selectPart(s, 'guitar'), 'brace');
    expect(s.score.groups![0]!.parts).toEqual(['voice', 'guitar', 'piano']);
    const last = group(selectPart(eight(), 'piano'), 'bracket');
    expect(last.message).toMatch(/keine weitere/);
    expect(last.score.groups).toBeUndefined();
  });

  it('double bar and final bar replace each other and a repeat end (one right barline per bar)', () => {
    const idx = (id: string) => BAR_SIGNS.findIndex((b) => b.id === id);
    let s = eight();
    s = run(s, 'mark.bar', idx('doubleBar'));
    s = run(s, 'mark.bar', idx('finalBar'));
    expect(s.score.marks!.map((m) => m.kind)).toEqual(['finalBar']);
    s = run(s, 'mark.bar', idx('repeatEnd'));
    expect(s.score.marks!.map((m) => m.kind)).toEqual(['repeatEnd']);
  });
});

describe('a clef from a bar on (ADR 0040)', () => {
  const BASS = CLEF_IDS.indexOf('bass');
  const ALTO = CLEF_IDS.indexOf('alto');
  const TREBLE = CLEF_IDS.indexOf('treble');
  const pick = (s: EditorState, i: number): EditorState => ({ ...s, caret: null, selection: { kind: 'event', ...VOICE, eventId: events(s)[i]!.id } });
  const clefs = (s: EditorState) => s.score.parts.find((p) => p.id === 'voice')!.clefs;

  it('the clef holds from the start of the bar of the selected note; the same clef again takes it off', () => {
    let s = run(pick(eight(), 5), 'mark.clef', BASS); // the sixth note sits in bar 2
    expect(clefs(s)).toEqual([{ at: frac(1), staff: 0, clef: 'bass' }]);
    expect(s.message).toBe('Bassschlüssel ab Takt 2');
    expect(validateScore(s.score)).toEqual([]);
    s = run(s, 'mark.clef', BASS);
    expect(clefs(s)).toBeUndefined();
    expect(s.message).toBe('Schlüsselwechsel in Takt 2 entfernt');
  });

  it('in the first bar it replaces the clef of the instrument; the instrument\'s own clef takes it off again', () => {
    let s = run(pick(eight(), 0), 'mark.clef', ALTO);
    expect(clefs(s)).toEqual([{ at: frac(0), staff: 0, clef: 'alto' }]);
    expect(staffCenter(s.score, VOICE, frac(0))).toEqual(parsePitch('C4'));
    s = run(s, 'mark.clef', TREBLE);
    expect(clefs(s)).toBeUndefined();
    expect(staffCenter(s.score, VOICE, frac(0))).toEqual(parsePitch('B4'));
  });

  it('a change that only repeats the clef in force changes nothing and says so', () => {
    const s = pick(eight(), 5);
    const same = run(s, 'mark.clef', TREBLE);
    expect(same.score).toBe(s.score);
    expect(same.message).toBe('Hier gilt schon dieser Schlüssel.');
  });

  it('a later change that becomes redundant disappears with the earlier one', () => {
    let s = run(pick(eight(), 5), 'mark.clef', BASS); // bar 2: bass
    s = run(pick(s, 0), 'mark.clef', BASS); // bar 1: bass, so the change in bar 2 repeats it
    expect(clefs(s)).toEqual([{ at: frac(0), staff: 0, clef: 'bass' }]);
  });

  it('works per staff: the left hand of the piano', () => {
    const left = { ...eight(), selection: null, caret: { partId: 'piano', voiceId: 'piano-s2', time: frac(1) } };
    const placed = run(left, 'mark.clef', TREBLE); // the left hand has the bass clef of the piano: treble from bar 2 is a change
    expect(placed.score.parts.find((p) => p.id === 'piano')!.clefs).toEqual([{ at: frac(1), staff: 1, clef: 'treble' }]);
    expect(validateScore(placed.score)).toEqual([]);
    expect(staffCenter(placed.score, { partId: 'piano', voiceId: 'piano-s2' }, frac(0))).toEqual(parsePitch('D3'));
    expect(staffCenter(placed.score, { partId: 'piano', voiceId: 'piano-s2' }, frac(1))).toEqual(parsePitch('B4'));
  });

  it('without a note or caret nothing happens', () => {
    expect(run({ ...newScoreState(), caret: null, selection: null }, 'mark.clef', BASS).message).toMatch(/Keine Note/);
  });
});
