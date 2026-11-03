import { describe, expect, it } from 'vitest';
import { emptyScore } from '../templates';
import { pitchToString } from '../pitch';
import { runCommand } from './commands';
import { createEditorState, getVoice, type EditorState, type VoiceRef } from './state';
import { History } from './history';

const VOICE: VoiceRef = { partId: 'voice', voiceId: 'voice-v1' };
const tones = (s: EditorState) =>
  getVoice(s.score, VOICE).voice.events.map((e) => e.tones.map((t) => pitchToString(t.pitch)).join('+')).join(' ');

/** A history holding one entered note, C5. */
function withNote(): History {
  const h = new History(createEditorState(emptyScore()));
  h.apply(runCommand(h.state, 'input.note', 0));
  return h;
}

describe('gestures', () => {
  it('many previews are one undo step', () => {
    const h = withNote();
    h.beginGesture();
    for (let i = 0; i < 3; i++) h.apply(runCommand(h.state, 'edit.octave', 1));
    expect(tones(h.state)).toBe('C8');
    h.commitGesture();
    expect(tones(h.state)).toBe('C8');
    h.undo();
    expect(tones(h.state)).toBe('C5');
    h.redo();
    expect(tones(h.state)).toBe('C8');
  });

  it('while a gesture runs, the committed state (what autosave writes) stays the old one', () => {
    const h = withNote();
    const before = h.state.score;
    h.beginGesture();
    h.apply(runCommand(h.state, 'edit.octave', 1));
    expect(h.state.score).not.toBe(before);
    expect(h.committed.score).toBe(before);
    h.commitGesture();
    expect(h.committed.score).toBe(h.state.score);
  });

  it('a cancelled gesture leaves no trace, not even in the undo list', () => {
    const h = withNote();
    const before = h.state.score;
    h.beginGesture();
    h.apply(runCommand(h.state, 'edit.octave', 1));
    h.cancelGesture();
    expect(h.state.score).toBe(before);
    expect(h.inGesture).toBe(false);
    h.undo(); // undoes the note, not a phantom drag step
    expect(tones(h.state)).toBe('');
  });

  it('a gesture that changes nothing adds no undo step', () => {
    const h = withNote();
    h.beginGesture();
    h.apply({ ...h.state, message: 'Vorschau' });
    h.commitGesture();
    h.undo();
    expect(tones(h.state)).toBe('');
  });

  it('undo and redo wait until the gesture is finished', () => {
    const h = withNote();
    h.beginGesture();
    h.apply(runCommand(h.state, 'edit.octave', 1));
    h.undo();
    expect(tones(h.state)).toBe('C6');
    expect(h.inGesture).toBe(true);
  });
});

describe('rollback after a view error', () => {
  it('takes back only the last change, never an earlier valid one', () => {
    const h = withNote();
    h.apply(runCommand(h.state, 'edit.octave', 1)); // earlier valid change
    h.apply({ ...h.state, selection: null }); // last thing: no score change at all
    h.rollback();
    expect(tones(h.state)).toBe('C6');
    expect(h.state.selection).not.toBeNull();
  });

  it('removes a faulty score change completely and leaves no redo step', () => {
    const h = withNote();
    h.apply(runCommand(h.state, 'edit.octave', 1));
    h.apply(runCommand(h.state, 'edit.octave', 1)); // the one the view cannot draw
    h.rollback();
    expect(tones(h.state)).toBe('C6');
    h.redo();
    expect(h.state.message).toMatch(/Nichts/);
    h.undo();
    expect(tones(h.state)).toBe('C5'); // the earlier change is still one normal undo step
  });

  it('also rolls back a running gesture', () => {
    const h = withNote();
    h.beginGesture();
    h.apply(runCommand(h.state, 'edit.octave', 1));
    h.rollback();
    expect(h.inGesture).toBe(false);
    expect(tones(h.state)).toBe('C5');
  });

  it('after an undo it returns to the state before the undo', () => {
    const h = withNote();
    h.apply(runCommand(h.state, 'edit.octave', 1));
    h.undo();
    h.rollback();
    expect(tones(h.state)).toBe('C6');
  });
});

describe('tone selection', () => {
  it('selecting a single chord tone changes no score and makes no undo step', () => {
    const h = withNote();
    h.apply(runCommand(h.state, 'input.chordNote', 2));
    const score = h.state.score;
    const event = getVoice(score, VOICE).voice.events[0]!;
    const second = event.tones[1]!;
    h.apply({ ...h.state, selection: { kind: 'event', ...VOICE, eventId: event.id, toneId: second.id } });
    expect(h.state.score).toBe(score);
    h.undo(); // takes back the chord note, not a selection step
    expect(tones(h.state)).toBe('C5');
  });

  it('a command that works on the whole note selects the whole note again', () => {
    const h = withNote();
    h.apply(runCommand(h.state, 'input.chordNote', 2));
    const event = getVoice(h.state.score, VOICE).voice.events[0]!;
    const toneId = event.tones[1]!.id;
    h.apply({ ...h.state, selection: { kind: 'event', ...VOICE, eventId: event.id, toneId } });
    h.apply(runCommand(h.state, 'edit.octave', 1));
    expect(h.state.selection).toMatchObject({ kind: 'event', eventId: event.id });
    expect(h.state.selection).not.toHaveProperty('toneId');
    expect(getVoice(h.state.score, VOICE).voice.events[0]!.tones.map((t) => t.id).sort()).toEqual(
      event.tones.map((t) => t.id).sort(),
    );
  });
});
