import { describe, expect, it } from 'vitest';
import { frac } from '../time';
import { pitchToString } from '../pitch';
import { type CommandId, newScoreState, runCommand } from './commands';
import { getVoice, type EditorState, type VoiceRef } from './state';

const VOICE: VoiceRef = { partId: 'voice', voiceId: 'voice-v1' };
const run = (s: EditorState, ...steps: [CommandId, number?][]): EditorState => steps.reduce((acc, [id, arg]) => runCommand(acc, id, arg ?? 0), s);
const notes = (s: EditorState): string[] =>
  getVoice(s.score, VOICE).voice.events.map((e) => `${e.tones.map((t) => pitchToString(t.pitch)).join(',')}:${e.duration.n}/${e.duration.d}`);

describe('Finale numpad typing (Enter repeats, arrows and numbers change the last note)', () => {
  it('Enter without a note before the caret places the middle-line note, then copies it', () => {
    const s = run(newScoreState(), ['input.repeat'], ['input.repeat']);
    expect(notes(s)).toHaveLength(2);
    expect(notes(s)[0]).toBe(notes(s)[1]);
  });

  it('↑ and a length key change the note just entered; Enter then copies the changed note', () => {
    const s = run(newScoreState(), ['input.repeat'], ['edit.step', 2], ['input.length', 4], ['input.repeat']);
    const [first, second] = notes(s);
    expect(first).toMatch(/:1\/8$/);
    expect(second).toBe(first);
    expect(getVoice(s.score, VOICE).voice.events[1]!.onset).toEqual(frac(1, 8));
  });

  it('the length key also sets the next note when there is nothing before the caret', () => {
    const s = run(newScoreState(), ['input.length', 6], ['input.repeat']);
    expect(notes(s)[0]).toMatch(/:1\/2$/);
  });

  it('number row: interval above and below add tones to the note', () => {
    const s = run(newScoreState(), ['input.repeat'], ['input.interval', 3], ['input.interval', -5]);
    const tones = getVoice(s.score, VOICE).voice.events[0]!.tones;
    expect(tones).toHaveLength(3);
    // third above the middle-line note and a fifth below it
    const [low, mid, high] = tones.map((t) => t.pitch);
    expect(high!.octave * 7 + 'CDEFGAB'.indexOf(high!.step) - (mid!.octave * 7 + 'CDEFGAB'.indexOf(mid!.step))).toBe(2);
    expect(mid!.octave * 7 + 'CDEFGAB'.indexOf(mid!.step) - (low!.octave * 7 + 'CDEFGAB'.indexOf(low!.step))).toBe(4);
  });

  it('Enter copies a whole chord', () => {
    const s = run(newScoreState(), ['input.repeat'], ['input.interval', 5], ['input.repeat']);
    expect(getVoice(s.score, VOICE).voice.events.map((e) => e.tones.length)).toEqual([2, 2]);
  });

  it('the dot key dots the last note while the caret waits behind it', () => {
    const s = run(newScoreState(), ['input.repeat'], ['edit.dot']);
    expect(notes(s)[0]).toMatch(/:3\/8$/);
    expect(s.caret!.time).toEqual(frac(3, 8));
  });
});
