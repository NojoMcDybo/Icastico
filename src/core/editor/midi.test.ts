import { describe, expect, it } from 'vitest';
import { pitchToString } from '../pitch';
import { validateScore } from '../model';
import { newScoreState, runCommand } from './commands';
import { type EditorState, type VoiceRef, getVoice } from './state';

const VOICE: VoiceRef = { partId: 'voice', voiceId: 'voice-v1' };
const notes = (s: EditorState) => getVoice(s.score, VOICE).voice.events.map((e) => e.tones.map((t) => pitchToString(t.pitch)).join('+'));

describe('notes dictated with their accidental', () => {
  const spelled = (letter: number, alter: number) => letter * 5 + alter + 2;
  it('fis is F sharp whatever the key, es is E flat, and the caret moves on', () => {
    let s = runCommand(newScoreState(), 'input.duration', 5);
    for (const [letter, alter] of [[3, 1], [2, -1], [6, -1], [0, 1], [1, -1]] as const) s = runCommand(s, 'input.spelled', spelled(letter, alter));
    expect(notes(s)).toEqual(['F#4', 'Eb4', 'Bb3', 'C#4', 'Db4']);
    expect(validateScore(s.score)).toEqual([]);
  });

  it('a number that names no note changes nothing', () => {
    const s = newScoreState();
    for (const bad of [-1, 35, 2.5, Number.NaN]) expect(runCommand(s, 'input.spelled', bad)).toBe(s);
  });
});

describe('notes from a MIDI keyboard', () => {
  it('a key gives exactly that pitch, in every octave, and the caret moves on', () => {
    let s = runCommand(newScoreState(), 'input.duration', 5);
    for (const key of [60, 72, 48, 67, 61, 70]) s = runCommand(s, 'input.midi', key);
    expect(notes(s)).toEqual(['C4', 'C5', 'C3', 'G4', 'C#4', 'Bb4']);
    expect(validateScore(s.score)).toEqual([]);
  });

  it('keys pressed together become a chord on the note just entered', () => {
    let s = runCommand(newScoreState(), 'input.duration', 5);
    s = runCommand(runCommand(runCommand(s, 'input.midi', 60), 'input.midiAdd', 64), 'input.midiAdd', 67);
    s = runCommand(s, 'input.midi', 62);
    expect(notes(s)).toEqual(['C4+E4+G4', 'D4']);
    // the same key twice does not double a tone
    expect(notes(runCommand(runCommand(runCommand(newScoreState(), 'input.midi', 60), 'input.midiAdd', 60), 'input.midiAdd', 64))).toEqual(['C4+E4']);
  });

  it('a second key with nothing entered yet is a normal note', () => {
    expect(notes(runCommand(newScoreState(), 'input.midiAdd', 65))).toEqual(['F4']);
  });

  it('numbers that are no MIDI keys change nothing', () => {
    const s = newScoreState();
    for (const bad of [-1, 128, 60.5, Number.NaN]) {
      expect(runCommand(s, 'input.midi', bad)).toBe(s);
      expect(runCommand(s, 'input.midiAdd', bad)).toBe(s);
    }
  });
});

describe('a single notehead of a chord', () => {
  const chord = (): EditorState => {
    let s = runCommand(newScoreState(), 'input.duration', 5);
    s = runCommand(runCommand(runCommand(s, 'input.midi', 60), 'input.midiAdd', 64), 'input.midiAdd', 67); // C E G
    return s;
  };
  const pick = (s: EditorState, index: number): EditorState => {
    const e = getVoice(s.score, VOICE).voice.events[0]!;
    return { ...s, selection: { kind: 'event', ...VOICE, eventId: e.id, toneId: e.tones[index]!.id } };
  };

  it('moves alone with the arrow keys, stays selected, and the others stay where they are', () => {
    let s = pick(chord(), 1); // E
    s = runCommand(s, 'edit.step', 1); // F
    expect(notes(s)).toEqual(['C4+F4+G4']);
    expect(s.selection).toMatchObject({ toneId: getVoice(s.score, VOICE).voice.events[0]!.tones[1]!.id });
    s = runCommand(s, 'edit.octave', 1);
    expect(notes(s)).toEqual(['C4+G4+F5']);
    s = runCommand(s, 'edit.alter', 1);
    expect(notes(s)).toEqual(['C4+G4+F#5']);
  });

  it('refuses to land on a tone the chord already has, and without a clicked tone the whole chord moves', () => {
    const s = pick(chord(), 1);
    const stepped = runCommand(runCommand(s, 'edit.step', 1), 'edit.step', 1); // E → F → G: taken
    expect(notes(stepped)).toEqual(['C4+F4+G4']);
    expect(stepped.message).toMatch(/schon ein anderer Ton/);
    const whole = runCommand({ ...chord(), selection: { ...pick(chord(), 0).selection!, toneId: undefined } as never }, 'edit.step', 1);
    expect(notes(whole)).toEqual(['D4+F4+A4']);
  });
});
