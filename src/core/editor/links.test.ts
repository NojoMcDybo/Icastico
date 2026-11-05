import { describe, expect, it } from 'vitest';
import { frac } from '../time';
import { validateScore } from '../model';
import { emptyScore } from '../templates';
import { runCommand } from './commands';
import { applyRollEdit } from './rollEdits';
import { History } from './history';
import { createEditorState, getVoice, type EditorState, type VoiceRef } from './state';

const VOICE: VoiceRef = { partId: 'voice', voiceId: 'voice-v1' };
const fresh = (): EditorState => createEditorState(emptyScore());
const events = (s: EditorState) => getVoice(s.score, VOICE).voice.events;
const select = (s: EditorState, i: number, toneIndex?: number): EditorState => ({
  ...s,
  selection: { kind: 'event', ...VOICE, eventId: events(s)[i]!.id, ...(toneIndex !== undefined ? { toneId: events(s)[i]!.tones[toneIndex]!.id } : {}) },
});
const cmd = (s: EditorState, id: Parameters<typeof runCommand>[1], arg = 0) => runCommand(s, id, arg);

/** Quarters C5 [0,1/4], C5 [1/4,1/2], then a quarter rest and D5 [3/4,1]. */
function melody(): EditorState {
  let s = fresh();
  s = cmd(s, 'input.duration', 5);
  s = cmd(s, 'input.note', 0);
  s = cmd(s, 'input.note', 0);
  s = cmd(s, 'input.rest');
  s = cmd(s, 'input.note', 1);
  return cmd(s, 'edit.escape');
}

describe('ties', () => {
  it('join two adjacent notes of the same pitch and are taken away by a second T', () => {
    const tied = cmd(select(melody(), 0), 'edit.tie');
    expect(tied.score.links).toEqual([{ id: 'link-1', kind: 'tie', from: events(tied)[0]!.tones[0]!.id, to: events(tied)[1]!.tones[0]!.id }]);
    expect(events(tied)).toHaveLength(3); // still separate notes
    expect(validateScore(tied.score)).toEqual([]);
    expect(cmd(tied, 'edit.tie').score.links).toBeUndefined();
  });

  it('are refused for other pitches and for notes that do not follow directly', () => {
    const m = select(melody(), 1);
    expect(cmd(m, 'edit.tie').message).toMatch(/Kein Haltebogen möglich/); // gap before D5
    const twoPitches = cmd(cmd(cmd(fresh(), 'input.note', 0), 'input.note', 1), 'edit.escape');
    const other = cmd(select(twoPitches, 0), 'edit.tie');
    expect(other.message).toMatch(/andere Tonhöhe/);
    expect(other.score.links).toBeUndefined();
  });

  it('one undo step sets them, one takes them away', () => {
    const h = new History(select(melody(), 0));
    h.apply(cmd(h.state, 'edit.tie'));
    expect(h.state.score.links).toHaveLength(1);
    h.undo();
    expect(h.state.score.links).toBeUndefined();
  });

  it('tie single chord tones: only the clicked tone', () => {
    let s = cmd(cmd(fresh(), 'input.note', 0), 'input.chordNote', 2); // C+E
    s = cmd(s, 'input.note', 0); // C again
    s = cmd(s, 'edit.escape');
    expect(events(s)[1]!.tones).toHaveLength(1);
    const r = cmd(select(s, 0, 0), 'edit.tie');
    expect(r.score.links).toHaveLength(1);
    expect(r.score.links![0]!.from).toBe(events(s)[0]!.tones[0]!.id);
  });

  it('cannot be pulled apart, made short or re-pitched – and nothing changes', () => {
    const tied = cmd(select(melody(), 0), 'edit.tie');
    const b = events(tied)[1]!;
    const moved = applyRollEdit(tied, { kind: 'change', voice: VOICE, eventId: b.id, onset: frac(3, 8) });
    expect(moved.score).toBe(tied.score);
    expect(moved.message).toMatch(/Haltebogen zerreißen/);
    const shorter = applyRollEdit(tied, { kind: 'change', voice: VOICE, eventId: events(tied)[0]!.id, duration: frac(1, 8) });
    expect(shorter.score).toBe(tied.score);
  });

  it('tied notes change pitch together, from either end, by key, by mouse drag command and in the roll', () => {
    const tied = cmd(select(melody(), 0), 'edit.tie');
    const pitches = (s: EditorState) => events(s).slice(0, 2).map((e) => e.tones[0]!.pitch);
    const up = cmd(select(tied, 0), 'edit.step', 1);
    expect(up.message).toBeNull();
    expect(pitches(up).map((p) => p.step + p.octave)).toEqual(['D5', 'D5']);
    expect(up.score.links).toHaveLength(1);
    expect(validateScore(up.score)).toEqual([]);
    const down = cmd(select(tied, 1), 'edit.octave', -1);
    expect(pitches(down).map((p) => p.step + p.octave)).toEqual(['C4', 'C4']);
    const roll = applyRollEdit(tied, { kind: 'change', voice: VOICE, eventId: events(tied)[1]!.id, tone: { id: events(tied)[1]!.tones[0]!.id, midi: 74 } });
    expect(pitches(roll).map((p) => p.step + p.octave)).toEqual(['D5', 'D5']);
    expect(roll.score.links).toHaveLength(1);
  });

  it('a whole chain of three tied notes follows, even when the middle one is changed', () => {
    let s = fresh();
    s = cmd(s, 'input.duration', 5);
    for (let i = 0; i < 3; i++) s = cmd(s, 'input.note', 0);
    s = cmd(s, 'edit.escape');
    s = cmd(select(s, 0), 'edit.tie');
    s = cmd(select(s, 1), 'edit.tie');
    expect(s.score.links).toHaveLength(2);
    const moved = cmd(select(s, 1), 'edit.step', 2);
    expect(events(moved).slice(0, 3).map((e) => e.tones[0]!.pitch.step)).toEqual(['E', 'E', 'E']);
    expect(moved.score.links).toHaveLength(2);
    expect(validateScore(moved.score)).toEqual([]);
  });

  it('a longer second note keeps the tie', () => {
    const tied = cmd(select(melody(), 0), 'edit.tie');
    const longer = applyRollEdit(tied, { kind: 'change', voice: VOICE, eventId: events(tied)[1]!.id, duration: frac(1, 2) });
    expect(longer.score).not.toBe(tied.score);
    expect(longer.score.links).toHaveLength(1);
  });

  it('deleting an end drops the tie in the same step', () => {
    const tied = cmd(select(melody(), 0), 'edit.tie');
    const gone = cmd(select(tied, 1), 'edit.delete');
    expect(gone.score.links).toBeUndefined();
    expect(validateScore(gone.score)).toEqual([]);
  });

  it('typing a note over a tied note is refused instead of silently breaking the tie', () => {
    const tied = cmd(select(melody(), 0), 'edit.tie');
    // a sixteenth typed at 1/8 cuts the first note short and leaves a gap before its tied partner
    const over = cmd(cmd({ ...tied, caret: { ...VOICE, time: frac(1, 8) } }, 'input.duration', 3), 'input.note', 2);
    expect(over.score).toBe(tied.score);
    expect(over.message).toMatch(/zerreißen/);
  });
});

describe('slides', () => {
  it('link a note to the next one, even with a gap, and a second press takes it away', () => {
    const s = cmd(select(melody(), 1), 'edit.slide');
    expect(s.score.links).toEqual([{ id: 'link-1', kind: 'slide', from: events(s)[1]!.tones[0]!.id, to: events(s)[2]!.tones[0]!.id }]);
    expect(validateScore(s.score)).toEqual([]);
    expect(cmd(s, 'edit.slide').score.links).toBeUndefined();
  });

  it('the glide takes the gap: closing it keeps the link (direct change), opening it again brings the glide back', () => {
    const s = cmd(select(melody(), 1), 'edit.slide');
    const d = events(s)[2]!;
    const touching = applyRollEdit(s, { kind: 'change', voice: VOICE, eventId: d.id, onset: frac(1, 2) });
    expect(touching.score.links).toHaveLength(1);
    expect(events(touching)[2]!.onset).toEqual(frac(1, 2));
    const apart = applyRollEdit(touching, { kind: 'change', voice: VOICE, eventId: d.id, onset: frac(7, 8) });
    expect(apart.score.links).toEqual(s.score.links);
    expect(events(apart)[2]!.onset).toEqual(frac(7, 8));
  });

  it('a pitch change of either end is fine (a glide has no fixed pitch)', () => {
    const s = cmd(select(melody(), 1), 'edit.slide');
    expect(cmd(select(s, 1), 'edit.step', 1).score.links).toHaveLength(1);
  });

  it('a tie on the same tone is replaced by a glide and the other way round', () => {
    const tied = cmd(select(melody(), 0), 'edit.tie');
    const glided = cmd(select(tied, 0), 'edit.slide');
    expect(glided.score.links).toHaveLength(1);
    expect(glided.score.links![0]!.kind).toBe('slide');
    expect(cmd(select(glided, 0), 'edit.tie').score.links![0]!.kind).toBe('tie');
  });

  it('pair chord tones with the nearest pitch', () => {
    let s = cmd(cmd(fresh(), 'input.note', 0), 'input.chordNote', 4); // C5+G5
    s = cmd(cmd(cmd(s, 'input.rest'), 'input.note', 0), 'input.chordNote', 4);
    s = cmd(s, 'edit.escape');
    const r = cmd(select(s, 0), 'edit.slide');
    expect(r.score.links).toHaveLength(2);
    expect(new Set(r.score.links!.map((l) => l.to)).size).toBe(2);
  });

  it('deleting the target note drops the glide', () => {
    const s = cmd(select(melody(), 1), 'edit.slide');
    expect(cmd(select(s, 2), 'edit.delete').score.links).toBeUndefined();
  });
});

describe('links in validation', () => {
  it('reports dangling, impossible and doubled links', () => {
    const s = cmd(select(melody(), 0), 'edit.tie');
    const [a, b, c] = events(s).map((e) => e.tones[0]!.id) as [string, string, string];
    const bad = (links: NonNullable<typeof s.score.links>) => validateScore({ ...s.score, links });
    expect(bad([{ id: 'x1', kind: 'tie', from: a, to: 'nirgends' }])[0]).toMatch(/Ton, den es nicht gibt/);
    expect(bad([{ id: 'x1', kind: 'tie', from: b, to: c }])[0]).toMatch(/gleich hohe|unmittelbar/);
    expect(bad([{ id: 'x1', kind: 'slide', from: b, to: c }, { id: 'x2', kind: 'slide', from: b, to: c }]).join()).toMatch(/mehr als eine Verbindung/);
    expect(bad([{ id: 'x1', kind: 'slide', from: c, to: b }])[0]).toMatch(/Ausgangstons|unmittelbar/);
    expect(bad([{ id: '1bad', kind: 'slide', from: b, to: c }])[0]).toMatch(/Ungültige Verbindungs-ID/);
  });
});

describe('review fixes', () => {
  it('T before the next note replaces a glide that started on the same tone', () => {
    let s = cmd(select(melody(), 1), 'edit.slide'); // glide from the second C to D
    s = { ...s, caret: { ...VOICE, time: frac(1, 2) } };
    s = cmd(cmd(select(s, 1), 'edit.tie'), 'input.note', 0); // caret at the end of C, tie pending
    expect(validateScore(s.score)).toEqual([]);
  });

  it('a tone never gets two outgoing links', () => {
    const s = cmd(select(melody(), 0), 'edit.tie');
    const [a, b, c] = events(s).map((e) => e.tones[0]!.id) as [string, string, string];
    const two = { ...s, score: { ...s.score, links: [...s.score.links!, { id: 'x', kind: 'slide' as const, from: a, to: c }] } };
    expect(cmd(two, 'edit.step', 0).score).toBe(two.score);
    expect(b).toBeTruthy();
  });

  it('staff navigation skips detached voices', () => {
    let s = cmd(cmd(cmd(fresh(), 'input.note', 0), 'input.chordNote', 4), 'edit.escape');
    s = cmd(select(s, 0, 1), 'edit.detach');
    expect(cmd(s, 'nav.staff', 1).selection).not.toMatchObject({ voiceId: 'voice-v2' });
  });
});

describe('connecting two bars by dragging', () => {
  const tone = (s: EditorState, i: number) => events(s)[i]!.tones[0]!.id;
  const connect = (s: EditorState, a: string, b: string) => applyRollEdit(s, { kind: 'connect', a, b });

  it('glides between any two notes – not only neighbours – with the time between them as glide time', () => {
    const s = melody(); // C [0,1/4], C [1/4,1/2], D [3/4,1]
    const r = connect(s, tone(s, 0), tone(s, 2));
    expect(r.score.links).toEqual([{ id: 'link-1', kind: 'slide', from: tone(s, 0), to: tone(s, 2) }]);
    expect(validateScore(r.score)).toEqual([]);
  });

  it('does not matter which end the drag started at', () => {
    const s = melody();
    expect(connect(s, tone(s, 2), tone(s, 0)).score.links).toEqual(connect(s, tone(s, 0), tone(s, 2)).score.links);
  });

  it('the same pair again takes the glide away; one undo step each way', () => {
    const h = new History(melody());
    h.apply(connect(h.state, tone(h.state, 0), tone(h.state, 2)));
    expect(h.state.score.links).toHaveLength(1);
    h.apply(connect(h.state, tone(h.state, 0), tone(h.state, 2)));
    expect(h.state.score.links).toBeUndefined();
    h.undo();
    expect(h.state.score.links).toHaveLength(1);
  });

  it('a new glide from a tone replaces its old one; a second one into the same tone is refused', () => {
    const s = melody();
    const first = connect(s, tone(s, 0), tone(s, 1));
    const moved = connect(first, tone(s, 0), tone(s, 2));
    expect(moved.score.links).toHaveLength(1);
    expect(moved.score.links![0]!.to).toBe(tone(s, 2));
    const blocked = connect(moved, tone(s, 1), tone(s, 2)); // the D already receives a glide
    expect(blocked.score).toBe(moved.score);
    expect(blocked.message).toMatch(/schon eine Verbindung/);
  });

  it('glides between two voices of the same staff, but not between overlapping notes', () => {
    let s = cmd(cmd(cmd(fresh(), 'input.note', 0), 'input.chordNote', 4), 'input.rest'); // C+G, then a gap
    s = cmd(cmd(s, 'input.note', 1), 'edit.escape'); // D after the quarter rest
    const chord = events(s)[0]!;
    const lone = cmd(select(s, 0, 1), 'edit.detach');
    const voice2 = lone.score.parts.find((p) => p.id === 'voice')!.voices[1]!;
    const d = lone.score.parts.find((p) => p.id === 'voice')!.voices[0]!.events.find((e) => e.id !== chord.id)!;
    const across = connect(lone, voice2.events[0]!.tones[0]!.id, d.tones[0]!.id);
    expect(across.score.links).toHaveLength(1);
    const overlapping = connect(lone, chord.tones[0]!.id, voice2.events[0]!.tones[0]!.id);
    expect(overlapping.score).toBe(lone.score);
  });

  it('disconnect removes a link by id', () => {
    const s = connect(melody(), tone(melody(), 0), tone(melody(), 2));
    expect(applyRollEdit(s, { kind: 'disconnect', id: 'link-1' }).score.links).toBeUndefined();
    expect(applyRollEdit(s, { kind: 'disconnect', id: 'nope' }).message).toMatch(/nicht mehr/);
  });
});
