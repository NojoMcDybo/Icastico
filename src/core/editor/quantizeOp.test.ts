import { describe, expect, it } from 'vitest';
import { validateScore } from '../model';
import { frac } from '../time';
import { newScoreState } from './commands';
import { quantizeEvents } from './quantizeOp';
import { type EditorState, type VoiceRef, getVoice } from './state';

const VOICE: VoiceRef = { partId: 'voice', voiceId: 'voice-v1' };
const ev = (id: string, onset: ReturnType<typeof frac>, duration: ReturnType<typeof frac>, step: 'C' | 'D' | 'E' | 'F', octave = 5) => ({
  id,
  onset,
  duration,
  tones: [{ id: id + '-t1', pitch: { step, alter: 0, octave } }],
});

function with_(events: ReturnType<typeof ev>[]): EditorState {
  const s = newScoreState();
  const score = { ...s.score, parts: s.score.parts.map((p) => (p.id === 'voice' ? { ...p, voices: [{ ...p.voices[0]!, events }] } : p)) };
  return { ...s, score, caret: null, selection: { kind: 'event', ...VOICE, eventId: events[0]!.id } };
}
const out = (s: EditorState) => getVoice(s.score, VOICE).voice.events;
const OPTIONS = { subdivision: 16, triplets: true } as const;

describe('quantise (Q)', () => {
  it('moves loose notes onto the grid and leaves music that is already straight alone', () => {
    // a 64th too late, a 64th too early, a 64th too long
    const s = with_([ev('a', frac(1, 64), frac(16, 64), 'C'), ev('b', frac(15, 64), frac(17, 64), 'D'), ev('c', frac(32, 64), frac(16, 64), 'E')]);
    const q = quantizeEvents(s, OPTIONS);
    expect(out(q).map((e) => [e.onset, e.duration])).toEqual([[frac(0), frac(1, 4)], [frac(1, 4), frac(1, 4)], [frac(1, 2), frac(1, 4)]]);
    expect(q.message).toMatch(/2 Noten ins Raster gerückt/);
    expect(quantizeEvents(q, OPTIONS).message).toMatch(/schon im Raster/);
    expect(validateScore(q.score)).toEqual([]);
  });

  it('only touches the marked passage when one is marked', () => {
    const s = with_([ev('a', frac(1, 64), frac(16, 64), 'C'), ev('b', frac(17, 64), frac(15, 64), 'D'), ev('c', frac(33, 64), frac(16, 64), 'E')]);
    const marked = { ...s, range: { ...VOICE, anchor: 'a', head: 'b' } };
    const q = quantizeEvents(marked, OPTIONS);
    expect(out(q)[2]!.onset).toEqual(frac(33, 64)); // the third note was not marked
    expect(out(q)[0]!.onset).toEqual(frac(0));
  });

  it('writes a loose triplet as a triplet when asked, and not when the triplets are off', () => {
    const third = (i: number) => frac(i * 21, 256); // 0.328 beats apart, close to a third
    const s = with_([ev('a', third(0), frac(1, 12), 'C'), ev('b', third(1), frac(1, 12), 'D'), ev('c', third(2), frac(1, 12), 'E')]);
    const on = quantizeEvents(s, OPTIONS);
    expect(out(on).map((e) => e.onset)).toEqual([frac(0), frac(1, 12), frac(2, 12)]);
    const off = quantizeEvents(s, { subdivision: 16, triplets: false });
    expect(out(off).every((e) => e.onset.d <= 16)).toBe(true);
  });

  it('notes that land on the same place become a chord and no note overlaps the next', () => {
    const s = with_([ev('a', frac(0), frac(1, 4), 'C'), ev('b', frac(1, 64), frac(1, 4), 'E'), ev('c', frac(15, 64), frac(1, 2), 'F')]);
    const q = quantizeEvents(s, OPTIONS);
    expect(out(q)).toHaveLength(2);
    expect(out(q)[0]!.tones).toHaveLength(2);
    expect(out(q)[0]!.duration).toEqual(frac(1, 4));
    expect(validateScore(q.score)).toEqual([]);
  });

  it('asks for a note first', () => {
    const s = { ...newScoreState(), selection: null, caret: null };
    expect(quantizeEvents(s, OPTIONS).message).toMatch(/Erst eine Note/);
  });
});
