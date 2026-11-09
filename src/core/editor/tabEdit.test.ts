import { describe, expect, it } from 'vitest';
import { validateScore } from '../model';
import { midiOf } from '../pitch';
import { addInstrument, createScore, DEFAULT_SETUP } from '../templates';
import { assignFrets, tuningOf } from '../tab';
import { parseLine } from '../line';
import { runCommand } from './commands';
import { type EditorState, createEditorState, getVoice } from './state';

/** A score with a tablature line holding E2 (open low string), then A2 and the chord E3 + B3. */
function withTab(line = 'E2:1/4 A2:1/4 [E3,B3]:1/4 G4:1/4'): { s: EditorState; ref: { partId: string; voiceId: string } } {
  const base = createScore(DEFAULT_SETUP);
  const { score, partId } = addInstrument(base, 'tab');
  const events = parseLine(line, 'tab-v1');
  const filled = { ...score, parts: score.parts.map((p) => (p.id === partId ? { ...p, voices: [{ ...p.voices[0]!, events }] } : p)) };
  const ref = { partId, voiceId: filled.parts.find((p) => p.id === partId)!.voices[0]!.id };
  return { s: createEditorState(filled), ref };
}
const select = (s: EditorState, ref: { partId: string; voiceId: string }, index: number, tone?: number): EditorState => {
  const event = getVoice(s.score, ref).voice.events[index]!;
  return { ...s, caret: null, selection: { kind: 'event', ...ref, eventId: event.id, ...(tone !== undefined ? { toneId: event.tones[tone]!.id } : {}) } };
};
const events = (s: EditorState, ref: { partId: string; voiceId: string }) => getVoice(s.score, ref).voice.events;
const fingering = (s: EditorState, ref: { partId: string; voiceId: string }) => assignFrets(events(s, ref), tuningOf(s.score.parts.find((p) => p.id === ref.partId)!));

describe('↑ / ↓ on a number of a tablature line', () => {
  it('moves it to the next string and keeps the sound', () => {
    const { s, ref } = withTab();
    // G4 (67) is played on the highest string (fret 3); one string down it is fret 8, the sound is the same
    const before = events(s, ref)[3]!.tones[0]!;
    expect(fingering(s, ref).get(before.id)).toEqual({ string: 1, fret: 3 });
    let next = runCommand(select(s, ref, 3), 'edit.step', -1);
    const after = events(next, ref)[3]!.tones[0]!;
    expect(midiOf(after.pitch)).toBe(midiOf(before.pitch));
    expect(after.string).toBe(2);
    expect(fingering(next, ref).get(after.id)).toEqual({ string: 2, fret: 8 });
    next = runCommand(next, 'edit.step', 1); // and back up
    expect(fingering(next, ref).get(after.id)).toEqual({ string: 1, fret: 3 });
    expect(validateScore(next.score)).toEqual([]);
  });

  it('refuses a string the note cannot be played on, and says so', () => {
    const { s, ref } = withTab();
    // E2 is the open low string: there is no string below it
    const down = runCommand(select(s, ref, 0), 'edit.step', -1);
    expect(down.message).toMatch(/Auf dieser Saite geht der Ton nicht/);
    expect(events(down, ref)[0]!.tones[0]!.string).toBeUndefined();
  });

  it('moves just the chosen tone of a chord, and writes down where the others are', () => {
    const { s, ref } = withTab();
    const chord = events(s, ref)[2]!;
    const fix = fingering(s, ref);
    const low = chord.tones.findIndex((t) => midiOf(t.pitch) === 52); // E3
    const high = chord.tones.findIndex((t) => midiOf(t.pitch) === 59); // B3
    const stringOfLow = fix.get(chord.tones[low]!.id)!.string;
    const moved = runCommand(select(s, ref, 2, low), 'edit.step', -1);
    const now = events(moved, ref)[2]!;
    expect(now.tones.every((t) => t.string !== undefined)).toBe(true);
    expect(now.tones.find((t) => midiOf(t.pitch) === 52)!.string).toBe(stringOfLow + 1);
    expect(now.tones.find((t) => midiOf(t.pitch) === 59)!.string).toBe(fix.get(chord.tones[high]!.id)!.string);
    expect(new Set(now.tones.map((t) => t.string)).size).toBe(2);
  });
});

describe('typing a number on a note of a tablature line', () => {
  it('sets the fret on the string it is on; the pitch follows', () => {
    const { s, ref } = withTab();
    // G4 sits on the highest string, fret 3; type 5 → A4, the string stays
    const made = runCommand(select(s, ref, 3), 'tab.fret', 5);
    const tone = events(made, ref)[3]!.tones[0]!;
    expect(midiOf(tone.pitch)).toBe(69);
    expect(tone.string).toBe(1);
    expect(made.message).toMatch(/Saite 1, Bund 5/);
    expect(validateScore(made.score)).toEqual([]);
  });

  it('works for the high frets, and says no beyond the neck', () => {
    const { s, ref } = withTab();
    const high = runCommand(select(s, ref, 3), 'tab.fret', 12);
    expect(midiOf(events(high, ref)[3]!.tones[0]!.pitch)).toBe(76); // 12th fret of the high e string
    expect(runCommand(select(s, ref, 3), 'tab.fret', 23).message).toMatch(/zwischen 0 und 22/);
  });

  it('wants a clicked tone in a chord, and a note on a tab line at all', () => {
    const { s, ref } = withTab();
    expect(runCommand(select(s, ref, 2), 'tab.fret', 3).message).toMatch(/Ton anklicken/);
    expect(runCommand({ ...s, selection: null }, 'tab.fret', 3).message).toMatch(/in der Tabulatur anklicken/);
  });

  it('follows another tuning: in Drop D the open low string is a D', () => {
    const { s, ref } = withTab('D2:1/4 A2:1/4');
    const tuned = { ...s, score: { ...s.score, parts: s.score.parts.map((p) => (p.id === ref.partId ? { ...p, tuning: [64, 59, 55, 50, 45, 38] } : p)) } };
    expect(validateScore(tuned.score)).toEqual([]);
    expect(fingering(tuned, ref).get(events(tuned, ref)[0]!.tones[0]!.id)).toEqual({ string: 6, fret: 0 });
    const made = runCommand(select(tuned, ref, 0), 'tab.fret', 2); // E2 on the low string
    expect(midiOf(events(made, ref)[0]!.tones[0]!.pitch)).toBe(40);
  });
});
