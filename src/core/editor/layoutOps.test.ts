import { describe, expect, it } from 'vitest';
import { validateScore } from '../model';
import { frac } from '../time';
import { newScoreState, runCommand } from './commands';
import { addText, changeText, defaultStem, eraseText, moveText, restStarts } from './layoutOps';
import { type EditorState, type VoiceRef, getVoice } from './state';

const VOICE: VoiceRef = { partId: 'voice', voiceId: 'voice-v1' };
const run = (s: EditorState, id: Parameters<typeof runCommand>[1], arg = 0) => runCommand(s, id, arg);
const events = (s: EditorState) => getVoice(s.score, VOICE).voice.events;
const select = (s: EditorState, i: number): EditorState => ({ ...s, caret: null, selection: { kind: 'event', ...VOICE, eventId: events(s)[i]!.id } });
const gapAt = (s: EditorState, time: ReturnType<typeof frac>): EditorState => ({ ...s, caret: null, selection: { kind: 'gap', ...VOICE, time } });

/** Quarter notes C D E: the rest of the first bar is a gap (a half rest at 3/4 would be a quarter rest). */
function three(): EditorState {
  let s = run(newScoreState(), 'input.duration', 5);
  for (const letter of [0, 1, 2]) s = run(s, 'input.note', letter);
  return s;
}

describe('flipping stems (ADR 0043)', () => {
  it('forces the other direction of what the engraver would draw, and a second flip gives the stem back to it', () => {
    const s = select(three(), 0); // C5 sits above the middle line of the treble clef: automatic = down
    expect(defaultStem(s.score, VOICE, events(s)[0]!)).toBe('down');
    const once = run(s, 'stem.flip');
    expect(events(once)[0]!.stem).toBe('up');
    expect(once.message).toMatch(/nach oben/);
    expect(validateScore(once.score)).toEqual([]);
    const twice = run(once, 'stem.flip');
    expect(events(twice)[0]!.stem).toBeUndefined();
  });

  it('turns every note of a marked passage, each the other way round', () => {
    let s = select(three(), 0);
    s = run(run(s, 'range.extend', 1), 'range.extend', 1);
    const flipped = run(s, 'stem.flip');
    expect(events(flipped).map((e) => e.stem)).toEqual(events(s).map((e) => (defaultStem(s.score, VOICE, e) === 'down' ? 'up' : 'down')));
    expect(flipped.message).toMatch(/umgedreht/);
  });

  it('asks for a note when none is chosen', () => {
    expect(run({ ...three(), selection: null }, 'stem.flip').message).toMatch(/Noten markieren/);
  });
});

describe('hiding and moving rests (ADR 0043)', () => {
  it('finds the rests of a voice as they are drawn', () => {
    const s = three();
    expect(restStarts(s.score, getVoice(s.score, VOICE).voice)).toEqual([frac(3, 4)]);
  });

  it('V hides the selected rest, V again shows it', () => {
    const hidden = run(gapAt(three(), frac(3, 4)), 'rest.hide');
    expect(getVoice(hidden.score, VOICE).voice.rests).toEqual([{ at: frac(3, 4), hidden: true }]);
    expect(hidden.message).toMatch(/unsichtbar/);
    expect(validateScore(hidden.score)).toEqual([]);
    const shown = run(hidden, 'rest.hide');
    expect(getVoice(shown.score, VOICE).voice.rests).toBeUndefined();
  });

  it('↑ / ↓ move the selected rest by staff steps, and keep it hidden or not as it was', () => {
    let s = gapAt(three(), frac(3, 4));
    s = run(run(s, 'edit.step', 1), 'edit.step', 1);
    expect(getVoice(s.score, VOICE).voice.rests).toEqual([{ at: frac(3, 4), shift: 2 }]);
    s = run(s, 'rest.hide');
    expect(getVoice(s.score, VOICE).voice.rests).toEqual([{ at: frac(3, 4), hidden: true, shift: 2 }]);
    s = run(run(run(s, 'edit.step', -1), 'edit.step', -1), 'rest.hide');
    expect(getVoice(s.score, VOICE).voice.rests).toBeUndefined(); // back where it was and visible: nothing left to store
  });

  it('Backspace and Delete on a selected rest hide it; the notes keep their pitch with ↑ / ↓', () => {
    const s = gapAt(three(), frac(3, 4));
    for (const command of ['edit.delete', 'edit.backspace'] as const) {
      expect(getVoice(run(s, command).score, VOICE).voice.rests).toEqual([{ at: frac(3, 4), hidden: true }]);
    }
    const note = run(select(three(), 0), 'edit.step', 1); // a note still moves its pitch
    expect(events(note)[0]!.tones[0]!.pitch.step).toBe('D');
  });

  it('hides all rests inside a marked passage', () => {
    let s = run(newScoreState(), 'input.duration', 5);
    s = run(run(s, 'input.note', 0), 'input.rest');
    s = run(s, 'input.note', 2);
    s = run(select(s, 0), 'range.extend', 1);
    const hidden = run(run(s, 'range.extend', 1), 'rest.hide');
    expect(getVoice(hidden.score, VOICE).voice.rests?.length).toBeGreaterThan(0);
  });

  it('says what to do when no rest is chosen', () => {
    expect(run(select(three(), 0), 'rest.hide').message).toMatch(/Pause anklicken/);
  });
});

describe('free texts (ADR 0043)', () => {
  it('sets a text above the staff, changes it, moves it and takes it away', () => {
    const s = three();
    const added = addText(s, VOICE, frac(1, 4), '  rit.  ', 20)!;
    expect(added.state.score.texts).toEqual([{ id: 'text-1', partId: 'voice', staff: 0, at: frac(1, 4), text: 'rit.', size: 20, dx: 0, dy: 4 }]);
    expect(validateScore(added.state.score)).toEqual([]);
    const changed = changeText(added.state, added.id, 'a tempo', 99);
    expect(changed.score.texts![0]).toMatchObject({ text: 'a tempo', size: 72 }); // the size is held to 6 … 72
    const moved = moveText(changed, added.id, { partId: 'voice', staff: 0, at: frac(2, 4), dx: 3.14159, dy: -2 });
    expect(moved.score.texts![0]).toMatchObject({ at: frac(2, 4), dx: 3.1, dy: -2 });
    expect(eraseText(moved, added.id).score.texts).toBeUndefined();
    expect(changeText(moved, added.id, '   ', 12).score.texts).toBeUndefined(); // an empty text is gone
    expect(addText(s, VOICE, frac(0, 1), '   ')).toBeNull();
  });

  it('numbers the texts so that none repeats', () => {
    const a = addText(three(), VOICE, frac(0, 1), 'A')!;
    const b = addText(a.state, VOICE, frac(0, 1), 'B')!;
    expect(b.id).toBe('text-2');
    expect(eraseText(b.state, 'text-1').score.texts!.map((t) => t.id)).toEqual(['text-2']);
    expect(addText(eraseText(b.state, 'text-1'), VOICE, frac(0, 1), 'C')!.id).toBe('text-1');
  });
});
