import { describe, expect, it } from 'vitest';
import { add, frac, fracToString } from '../time';
import { pitchToString } from '../pitch';
import { validateScore } from '../model';
import { DEFAULT_SETUP, createScore, emptyScore } from '../templates';
import { type RollEdit, applyRollEdit } from './rollEdits';
import { createEditorState, getVoice, type EditorState, type VoiceRef } from './state';
import { History } from './history';

const VOICE: VoiceRef = { partId: 'voice', voiceId: 'voice-v1' };
const fresh = (): EditorState => createEditorState(emptyScore());

/** "C5@0:1/4 …" – pitches of every event with onset and length. */
function dump(s: EditorState): string {
  return getVoice(s.score, VOICE)
    .voice.events.map((e) => `${e.tones.map((t) => pitchToString(t.pitch)).join('+')}@${fracToString(e.onset)}:${fracToString(e.duration)}`)
    .join(' ');
}

const create = (s: EditorState, onset: number[], duration: number[], midi: number): EditorState =>
  applyRollEdit(s, { kind: 'create', voice: VOICE, onset: frac(onset[0]!, onset[1]), duration: frac(duration[0]!, duration[1]), midi });

const firstEvent = (s: EditorState) => getVoice(s.score, VOICE).voice.events[0]!;

describe('roll edits: create', () => {
  it('adds a note with a fresh event and tone id and selects it', () => {
    const s = create(fresh(), [0, 1], [1, 4], 72);
    expect(dump(s)).toBe('C5@0:1/4');
    expect(firstEvent(s).tones[0]!.id).toBe(`${firstEvent(s).id}-t1`);
    expect(s.selection).toMatchObject({ kind: 'event', eventId: firstEvent(s).id, toneId: firstEvent(s).tones[0]!.id });
    expect(validateScore(s.score)).toEqual([]);
  });

  it('spells the pitch for the key at that time', () => {
    const g = createEditorState(createScore({ ...DEFAULT_SETUP, fifths: 1 }));
    expect(dump(applyRollEdit(g, { kind: 'create', voice: VOICE, onset: frac(0), duration: frac(1, 4), midi: 66 }))).toBe('F#4@0:1/4');
  });

  it('refuses to run into another note and changes nothing', () => {
    const a = create(fresh(), [0, 1], [1, 4], 72);
    const b = create(a, [1, 8], [1, 4], 74);
    expect(b.score).toBe(a.score);
    expect(b.message).toMatch(/schon eine Note/);
  });

  it('allows a note right behind another one', () => {
    const a = create(fresh(), [0, 1], [1, 4], 72);
    expect(dump(create(a, [1, 4], [1, 4], 74))).toBe('C5@0:1/4 D5@1/4:1/4');
  });

  it('refuses times off the 1/64 grid and a negative start', () => {
    const off = create(fresh(), [1, 128], [1, 4], 72);
    expect(dump(off)).toBe('');
    expect(off.message).toMatch(/Raster/);
    expect(create(fresh(), [-1, 4], [1, 4], 72).message).toMatch(/Raster|Dort/);
  });
});

describe('roll edits: change', () => {
  const start = () => create(create(fresh(), [0, 1], [1, 4], 72), [1, 2], [1, 4], 74);
  /** C5+E5 chord at 0, D5 at 1/2. */
  const chordStart = () => {
    const s = start();
    const ev = firstEvent(s);
    return {
      ...s,
      score: {
        ...s.score,
        parts: s.score.parts.map((p) => ({
          ...p,
          voices: p.voices.map((v) => ({
            ...v,
            events: v.events.map((e) => (e.id === ev.id ? { ...e, tones: [e.tones[0]!, { id: `${e.id}-t2`, pitch: { step: 'E' as const, alter: 0, octave: 5 } }] } : e)),
          })),
        })),
      },
    };
  };
  const first = (s: EditorState) => firstEvent(s).id;

  it('moves a note in time and keeps its ids', () => {
    const s = start();
    const ev = firstEvent(s);
    const moved = applyRollEdit(s, { kind: 'change', voice: VOICE, eventId: ev.id, onset: frac(1, 4) });
    expect(dump(moved)).toBe('C5@1/4:1/4 D5@1/2:1/4');
    expect(getVoice(moved.score, VOICE).voice.events[0]!.tones[0]!.id).toBe(ev.tones[0]!.id);
  });

  it('an edit that changes nothing keeps the same score (no undo step)', () => {
    const s = start();
    const ev = firstEvent(s);
    const same = applyRollEdit(s, { kind: 'change', voice: VOICE, eventId: ev.id, onset: ev.onset, duration: ev.duration, tone: { id: ev.tones[0]!.id, midi: 72 } });
    expect(same.score).toBe(s.score);
    expect(same.message).toBeNull();
  });

  it('keeps events sorted when a note jumps over another', () => {
    const s = start();
    const moved = applyRollEdit(s, { kind: 'change', voice: VOICE, eventId: first(s), onset: frac(3, 4) });
    expect(dump(moved)).toBe('D5@1/2:1/4 C5@3/4:1/4');
  });

  it('lengthens the end and shortens the start with the end fixed', () => {
    const s = start();
    const longer = applyRollEdit(s, { kind: 'change', voice: VOICE, eventId: first(s), duration: frac(1, 2) });
    expect(dump(longer)).toBe('C5@0:1/2 D5@1/2:1/4');
    const startLater = applyRollEdit(s, { kind: 'change', voice: VOICE, eventId: first(s), onset: frac(1, 8), duration: frac(1, 8) });
    expect(dump(startLater)).toBe('C5@1/8:1/8 D5@1/2:1/4');
  });

  it('refuses overlaps, too short notes and moves before the start', () => {
    const s = start();
    for (const edit of [
      { onset: frac(3, 8) },
      { duration: frac(5, 8) },
      { duration: frac(0) },
      { duration: frac(1, 128) },
      { onset: frac(-1, 4) },
    ]) {
      const r = applyRollEdit(s, { kind: 'change', voice: VOICE, eventId: first(s), ...edit });
      expect(r.score).toBe(s.score);
      expect(r.message).toBeTruthy();
    }
  });

  it('changes the pitch of one tone and keeps its id', () => {
    const s = start();
    const ev = firstEvent(s);
    const up = applyRollEdit(s, { kind: 'change', voice: VOICE, eventId: ev.id, tone: { id: ev.tones[0]!.id, midi: 76 } });
    expect(dump(up)).toBe('E5@0:1/4 D5@1/2:1/4');
    expect(getVoice(up.score, VOICE).voice.events[0]!.tones[0]!.id).toBe(ev.tones[0]!.id);
  });

  it('moves one tone of a chord, re-sorts the chord and refuses a duplicate pitch', () => {
    const s = chordStart();
    const ev = firstEvent(s);
    const ids = (x: EditorState) => getVoice(x.score, VOICE).voice.events[0]!.tones.map((t) => t.id);
    const over = applyRollEdit(s, { kind: 'change', voice: VOICE, eventId: ev.id, tone: { id: `${ev.id}-t1`, midi: 76 } });
    expect(over.message).toMatch(/schon im Akkord/);
    const high = applyRollEdit(s, { kind: 'change', voice: VOICE, eventId: ev.id, tone: { id: `${ev.id}-t1`, midi: 79 } });
    expect(dump(high).split(' ')[0]).toBe('E5+G5@0:1/4');
    expect(ids(high)).toEqual([`${ev.id}-t2`, `${ev.id}-t1`]);
  });

  it('a time edit moves the whole chord, never a single tone', () => {
    const s = chordStart();
    const ev = firstEvent(s);
    const moved = applyRollEdit(s, { kind: 'change', voice: VOICE, eventId: ev.id, onset: frac(1, 4) });
    expect(dump(moved)).toBe('C5+E5@1/4:1/4 D5@1/2:1/4');
  });

  it('refuses to move N-tuplet notes in time but still allows a pitch change', () => {
    let s = create(fresh(), [0, 1], [1, 4], 72);
    s = {
      ...s,
      score: {
        ...s.score,
        parts: s.score.parts.map((p) => ({
          ...p,
          voices: p.voices.map((v) => ({ ...v, events: v.events.map((e) => ({ ...e, duration: frac(1, 12) })) })),
        })),
      },
    };
    const ev = firstEvent(s);
    expect(applyRollEdit(s, { kind: 'change', voice: VOICE, eventId: ev.id, onset: frac(1, 4) }).message).toMatch(/N-Tolen/);
    expect(dump(applyRollEdit(s, { kind: 'change', voice: VOICE, eventId: ev.id, tone: { id: ev.tones[0]!.id, midi: 74 } }))).toBe('D5@0:1/12');
  });
});

describe('roll edits: delete', () => {
  it('removes the note and selects the gap', () => {
    const s = create(fresh(), [0, 1], [1, 4], 72);
    const r = applyRollEdit(s, { kind: 'delete', voice: VOICE, eventId: firstEvent(s).id });
    expect(dump(r)).toBe('');
    expect(r.selection).toMatchObject({ kind: 'gap', time: frac(0) });
  });
});

describe('roll gestures with the history', () => {
  it('a whole drag (many previews) is one undo step and ESC leaves nothing behind', () => {
    const h = new History(create(fresh(), [0, 1], [1, 4], 72));
    const id = firstEvent(h.state).id;
    h.beginGesture();
    const base = h.state;
    for (let i = 1; i <= 8; i++) {
      h.apply(applyRollEdit(base, { kind: 'change', voice: VOICE, eventId: id, onset: add(frac(0), frac(i, 16)) }));
    }
    h.commitGesture();
    expect(dump(h.state)).toBe('C5@1/2:1/4');
    h.undo();
    expect(dump(h.state)).toBe('C5@0:1/4');

    h.beginGesture();
    h.apply(applyRollEdit(h.state, { kind: 'change', voice: VOICE, eventId: id, onset: frac(1, 4) }));
    h.cancelGesture();
    expect(dump(h.state)).toBe('C5@0:1/4');
    expect(h.committed.score).toBe(h.state.score);
  });

  it('a refused preview keeps the last good one', () => {
    const base = create(create(fresh(), [0, 1], [1, 4], 72), [1, 2], [1, 4], 74);
    const id = firstEvent(base).id;
    let preview = applyRollEdit(base, { kind: 'change', voice: VOICE, eventId: id, onset: frac(1, 8) });
    const bad = applyRollEdit(base, { kind: 'change', voice: VOICE, eventId: id, onset: frac(7, 16) });
    expect(bad.score).toBe(base.score);
    preview = bad.score === base.score ? preview : bad;
    expect(dump(preview)).toBe('C5@1/8:1/4 D5@1/2:1/4');
  });
});

describe('roll edits are valid for every grid position', () => {
  it('any created note keeps the score valid', () => {
    for (let n = 0; n < 64; n += 5) {
      for (const midi of [36, 60, 61, 84]) {
        const s = create(fresh(), [n, 64], [1, 16], midi);
        expect(validateScore(s.score), `${n}/64 ${midi}`).toEqual([]);
      }
    }
  });
});

export type { RollEdit };
