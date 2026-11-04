import { describe, expect, it } from 'vitest';
import { frac } from './time';
import { withTempo, type Score } from './model';
import { emptyScore } from './templates';
import { keyName, barBeat, pitchAt, planFrom, planPlayback, secondsOf, timeAt } from './playback';
import { runCommand } from './editor/commands';
import { applyRollEdit } from './editor/rollEdits';
import { createEditorState, getVoice, type EditorState, type VoiceRef } from './editor/state';

const VOICE: VoiceRef = { partId: 'voice', voiceId: 'voice-v1' };
const events = (s: EditorState) => getVoice(s.score, VOICE).voice.events;
const cmd = (s: EditorState, id: Parameters<typeof runCommand>[1], arg = 0) => runCommand(s, id, arg);
const at = (s: EditorState, i: number): EditorState => ({ ...s, selection: { kind: 'event', ...VOICE, eventId: events(s)[i]!.id } });

/** Quarters C5, C5, rest, D5 at the default tempo of 100. */
function melody(): EditorState {
  let s = createEditorState(withTempoScore(emptyScore(), 120));
  s = cmd(s, 'input.duration', 5);
  s = cmd(cmd(s, 'input.note', 0), 'input.note', 0);
  s = cmd(cmd(s, 'input.rest'), 'input.note', 1);
  return cmd(s, 'edit.escape');
}
const withTempoScore = (s: Score, bpm: number): Score => withTempo(s, bpm);

describe('playback plan', () => {
  it('times follow the tempo: at 120 a quarter note is half a second', () => {
    const s = melody();
    expect(secondsOf(s.score, frac(1, 4))).toBe(0.5);
    const plan = planPlayback(s.score);
    expect(plan.notes.map((n) => [n.start, n.end])).toEqual([[0, 0.5], [0.5, 1], [1.5, 2]]);
    expect(plan.length).toBe(2);
    expect(secondsOf(withTempo(s.score, 60), frac(1, 4))).toBe(1);
  });

  it('every chord tone sounds on its own line, together', () => {
    const s = cmd(cmd(createEditorState(emptyScore()), 'input.note', 0), 'input.chordNote', 4);
    const plan = planPlayback(s.score);
    expect(plan.notes).toHaveLength(2);
    expect(new Set(plan.notes.map((n) => n.start)).size).toBe(1);
  });

  it('a tie joins two notes into one sound without a second attack', () => {
    const tied = cmd(at(melody(), 0), 'edit.tie');
    const plan = planPlayback(tied.score);
    expect(plan.notes).toHaveLength(2); // C+C tied, D
    expect([plan.notes[0]!.start, plan.notes[0]!.end]).toEqual([0, 1]);
    expect(new Set(plan.notes[0]!.path.map((p) => p.midi))).toEqual(new Set([72]));
  });

  it('a glide with a gap is one sound whose pitch moves through the gap, linearly in semitones', () => {
    const glided = cmd(at(melody(), 1), 'edit.slide'); // second C → D after a quarter of rest
    const plan = planPlayback(glided.score);
    expect(plan.notes).toHaveLength(2); // C, and C→D as one sound
    const sound = plan.notes[1]!;
    expect([sound.start, sound.end]).toEqual([0.5, 2]);
    expect(pitchAt(sound.path, 0.9)).toBe(72); // still C when the note ends
    expect(pitchAt(sound.path, 1)).toBe(72);
    expect(pitchAt(sound.path, 1.25)).toBe(73); // half way through the gap
    expect(pitchAt(sound.path, 1.5)).toBe(74);
    expect(pitchAt(sound.path, 1.9)).toBe(74);
  });

  it('a glide without a gap is a direct change: the second note is struck anew', () => {
    const s = melody();
    const closed = applyRollEdit(cmd(at(s, 1), 'edit.slide'), { kind: 'change', voice: VOICE, eventId: events(s)[2]!.id, onset: frac(1, 2) });
    expect(closed.score.links).toHaveLength(1);
    expect(planPlayback(closed.score).notes).toHaveLength(3);
  });

  it('starting in the middle: finished notes drop out, a running one starts at that moment with its current pitch', () => {
    const glided = cmd(at(melody(), 1), 'edit.slide');
    const later = planFrom(planPlayback(glided.score), 1.25);
    expect(later.notes).toHaveLength(1);
    expect(later.notes[0]!.start).toBe(1.25);
    expect(later.notes[0]!.path[0]).toEqual({ t: 1.25, midi: 73 });
    expect(planFrom(planPlayback(glided.score), 5).notes).toEqual([]);
  });

  it('an empty score plans nothing', () => {
    expect(planPlayback(emptyScore())).toEqual({ notes: [], length: 0 });
  });

  it('seconds and times convert back (display only)', () => {
    const s = melody();
    expect(timeAt(s.score, 0.5)).toEqual(frac(240, 960));
  });
});

describe('transport display', () => {
  it('shows bar and beat of a time', () => {
    const score = emptyScore(); // 4/4
    expect(barBeat(score, frac(0))).toEqual({ bar: 1, beat: 1 });
    expect(barBeat(score, frac(1, 2))).toEqual({ bar: 1, beat: 3 });
    expect(barBeat(score, frac(1))).toEqual({ bar: 2, beat: 1 });
    expect(barBeat(score, frac(7, 4))).toEqual({ bar: 2, beat: 4 });
  });

  it('counts the upbeat as bar 0 with its own beats', () => {
    const score = { ...emptyScore(), pickup: frac(1, 4) };
    expect(barBeat(score, frac(0))).toEqual({ bar: 0, beat: 4 });
    expect(barBeat(score, frac(1, 4))).toEqual({ bar: 1, beat: 1 });
  });

  it('names the key as the display shows it', () => {
    expect(keyName(0)).toBe('Cmaj');
    expect(keyName(1)).toBe('Gmaj');
    expect(keyName(-2)).toBe('Bbmaj');
    expect(keyName(99)).toBe('Cmaj');
  });
});
