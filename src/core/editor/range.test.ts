import { describe, expect, it } from 'vitest';
import { validateScore } from '../model';
import { pitchToString } from '../pitch';
import { frac } from '../time';
import { addInstrument } from '../templates';
import { newScoreState, runCommand } from './commands';
import { copyClip, cutClip, pasteClip, rangeSpan, rangeTo } from './range';
import { type EditorState, type VoiceRef, getVoice } from './state';

const VOICE: VoiceRef = { partId: 'voice', voiceId: 'voice-v1' };
const run = (s: EditorState, id: Parameters<typeof runCommand>[1], arg = 0) => runCommand(s, id, arg);
const events = (s: EditorState) => getVoice(s.score, VOICE).voice.events;
const names = (s: EditorState) => events(s).map((e) => e.tones.map((t) => pitchToString(t.pitch)).join('+'));
const select = (s: EditorState, i: number): EditorState => ({ ...s, caret: null, selection: { kind: 'event', ...VOICE, eventId: events(s)[i]!.id } });

/** Eight quarter notes C D E F G A B C: two bars of 4/4. */
const ALL = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6'];
function eight(): EditorState {
  let s = run(newScoreState(), 'input.duration', 5);
  for (const letter of [0, 1, 2, 3, 4, 5, 6, 0]) s = run(s, 'input.note', letter);
  return s;
}

describe('marking a passage', () => {
  it('Alt+Shift+→ marks the selected note and the next ones, ← takes them back', () => {
    let s = select(eight(), 2);
    s = run(s, 'range.extend', 1);
    expect(rangeSpan(s)).toMatchObject({ from: frac(2, 4), to: frac(4, 4), notes: 2 });
    s = run(run(s, 'range.extend', 1), 'range.extend', 1);
    expect(rangeSpan(s)!.notes).toBe(4);
    s = run(s, 'range.extend', -1);
    expect(rangeSpan(s)!.notes).toBe(3);
    // past the first note it goes on to the left of the anchor
    s = run(run(run(run(s, 'range.extend', -1), 'range.extend', -1), 'range.extend', -1), 'range.extend', -1);
    expect(rangeSpan(s)).toMatchObject({ from: frac(0, 1), notes: 3 });
  });

  it('stops at the ends and says so', () => {
    const s = run(select(eight(), 7), 'range.extend', 1);
    expect(s.message).toMatch(/letzte Note/);
    expect(rangeSpan(s)).toBeNull();
  });

  it('is gone as soon as another note is selected, and Esc unmarks it first', () => {
    const marked = run(run(select(eight(), 1), 'range.extend', 1), 'range.extend', 1);
    expect(rangeSpan(run(marked, 'nav.horizontal', 1))).toBeNull();
    const esc = run(marked, 'edit.escape');
    expect(rangeSpan(esc)).toBeNull();
    expect(esc.selection).not.toBeNull();
  });

  it('Shift+click marks from the selected note to the clicked one, also backwards; Strg+A marks all', () => {
    const s = select(eight(), 5);
    expect(rangeSpan(rangeTo(s, VOICE, events(s)[2]!.id))).toMatchObject({ from: frac(2, 4), to: frac(6, 4), notes: 4 });
    expect(rangeSpan(run(s, 'range.all'))).toMatchObject({ from: frac(0, 1), to: frac(8, 4), notes: 8 });
  });
});

describe('deleting, cutting, copying and pasting a passage', () => {
  const marked = (from: number, count: number): EditorState => {
    let s = select(eight(), from);
    for (let k = 1; k < count; k++) s = run(s, 'range.extend', 1);
    return s;
  };

  it('Delete turns the marked notes into rests and leaves the others', () => {
    const s = run(marked(2, 3), 'edit.delete');
    expect(names(s)).toEqual(['C5', 'D5', 'A5', 'B5', 'C6']);
    expect(s.message).toMatch(/3 Noten gelöscht/);
    expect(validateScore(s.score)).toEqual([]);
  });

  it('copy + paste: the passage lands at the caret, overwriting what was there', () => {
    const s0 = marked(0, 3); // C D E
    const clip = copyClip(s0)!;
    expect(clip.length).toEqual(frac(3, 4));
    // the caret stands after the last note (time 2): paste there, behind the music
    const pasted = pasteClip({ ...select(eight(), 7), selection: null, caret: { ...VOICE, time: frac(5, 4) } }, clip);
    expect(names(pasted)).toEqual(['C5', 'D5', 'E5', 'F5', 'G5', 'C5', 'D5', 'E5']);
    expect(pasted.caret!.time).toEqual(frac(8, 4));
    expect(validateScore(pasted.score)).toEqual([]);
    expect(new Set(events(pasted).map((e) => e.id)).size).toBe(events(pasted).length); // fresh ids
  });

  it('cut = copy and delete; a single selected note can be copied and cut too', () => {
    const cut = cutClip(marked(1, 2))!;
    expect(names(cut.state)).toEqual(['C5', 'F5', 'G5', 'A5', 'B5', 'C6']);
    expect(cut.clip.voices[0]).toHaveLength(2);
    const one = copyClip(select(eight(), 3))!;
    expect(one.voices[0]).toHaveLength(1);
    expect(names(cutClip(select(eight(), 3))!.state)).toEqual(['C5', 'D5', 'E5', 'G5', 'A5', 'B5', 'C6']);
  });

  it('in insert mode the music behind moves along; pasting needs a place and a copy', () => {
    const clip = copyClip(marked(0, 2))!;
    const s = select(eight(), 4);
    const inserted = pasteClip({ ...s, input: { ...s.input, insert: true } }, clip);
    expect(names(inserted)).toEqual(['C5', 'D5', 'E5', 'F5', 'C5', 'D5', 'G5', 'A5', 'B5', 'C6']);
    expect(ALL.length).toBe(8);
    expect(pasteClip({ ...eight(), selection: null, caret: null }, clip).message).toMatch(/Stelle/);
    expect(copyClip({ ...eight(), selection: null })).toBeNull();
  });
});

describe('marking by frame or by bar', () => {
  it('markFromTo marks the notes between two notes of a voice and selects the first', async () => {
    const { markFromTo } = await import('./range');
    const s = eight();
    const ev = events(s);
    const marked = markFromTo(s, VOICE, ev[2]!.id, ev[4]!.id);
    expect(rangeSpan(marked)).toMatchObject({ from: frac(2, 4), to: frac(5, 4), notes: 3 });
    expect(marked.selection).toMatchObject({ eventId: ev[2]!.id });
    expect(markFromTo(s, VOICE, 'nope', ev[1]!.id)).toBe(s);
  });
});

describe('pasting into a tablature staff (ADR 0030)', () => {
  const withTab = (s: EditorState): EditorState => {
    const { score, partId } = addInstrument(s.score, 'tab');
    return { ...s, score, partId } as EditorState;
  };
  const tabRef = (s: EditorState): VoiceRef => {
    const part = s.score.parts.find((p) => p.instrument === 'tab')!;
    return { partId: part.id, voiceId: part.voices[0]!.id };
  };

  it('puts copied notes into the tablature staff at the chosen place', () => {
    const s0 = withTab(eight());
    const clip = copyClip(run(run(select(s0, 1), 'range.extend', 1), 'range.extend', 1))!;
    const ref = tabRef(s0);
    const pasted = pasteClip({ ...s0, range: null, caret: null, selection: { kind: 'gap', ...ref, time: frac(1, 4) } }, clip);
    const got = getVoice(pasted.score, ref).voice.events;
    expect(got.map((e) => [e.onset, e.tones[0]!.pitch.step + e.tones[0]!.pitch.octave])).toEqual([[frac(1, 4), 'D5'], [frac(2, 4), 'E5'], [frac(3, 4), 'F5']]);
    expect(validateScore(pasted.score)).toEqual([]);
  });

  it('a clip of two voices (piano) goes into the one voice of the tab staff, notes that do not fit are counted', () => {
    const base = withTab(newScoreState());
    const piano = base.score.parts.find((p) => p.id === 'piano')!;
    const hand = (id: string, midiOctave: number, staff: number) => ({
      ...piano.voices[staff]!,
      events: [{ id, onset: frac(0), duration: frac(1, 4), tones: [{ id: id + '-t1', pitch: { step: 'C' as const, alter: 0, octave: midiOctave } }] }],
    });
    const score = { ...base.score, parts: base.score.parts.map((p) => (p.id === 'piano' ? { ...p, voices: [hand('r1', 4, 0), hand('l1', 3, 1)] } : p)) };
    const s = { ...base, score, selection: { kind: 'event' as const, partId: 'piano', voiceId: piano.voices[0]!.id, eventId: 'r1' } };
    const clip = copyClip(run({ ...s, range: null } as EditorState, 'range.all'))!;
    const ref = tabRef(s);
    const pasted = pasteClip({ ...s, range: null, caret: null, selection: { kind: 'gap', ...ref, time: frac(0) } }, clip);
    expect(getVoice(pasted.score, ref).voice.events).toHaveLength(1);
    expect(pasted.message).toMatch(/1 Note fand keinen Platz/);
  });

  it('says which tones a guitar cannot play', () => {
    const s0 = withTab(eight());
    const clip = { length: frac(1, 4), voices: [[{ at: frac(0), duration: frac(1, 4), tones: [{ pitch: { step: 'C' as const, alter: 0, octave: 1 } }] }]] };
    const ref = tabRef(s0);
    const pasted = pasteClip({ ...s0, caret: null, selection: { kind: 'gap', ...ref, time: frac(0) } }, clip);
    expect(pasted.message).toMatch(/zu tief oder zu hoch/);
  });
});
