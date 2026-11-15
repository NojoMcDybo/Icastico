import { describe, expect, it } from 'vitest';
import { validateScore } from '../model';
import { frac } from '../time';
import { scoreToMei } from '../../render/mei';
import { newScoreState, runCommand } from './commands';
import { layerNumber, layersOf } from './layerOps';
import { type EditorState, getVoice } from './state';

const run = (s: EditorState, id: Parameters<typeof runCommand>[1], arg = 0) => runCommand(s, id, arg);
const voices = (s: EditorState) => s.score.parts.find((p) => p.id === 'voice')!.voices;

function start(): EditorState {
  let s = run(newScoreState(), 'input.duration', 5); // quarter
  s = { ...s, caret: { partId: 'voice', voiceId: 'voice-v1', time: frac(0, 1) } };
  return s;
}

describe('two layers in one staff (ADR 0044)', () => {
  it('Ebene 2 makes the second voice of the staff once and puts the cursor there, at the same time', () => {
    let s = run(start(), 'input.note', 2); // E in layer 1
    s = run(s, 'input.layer', 2);
    expect(voices(s).map((v) => v.id)).toEqual(['voice-v1', 'voice-v2']);
    expect(s.caret).toMatchObject({ voiceId: 'voice-v2', time: frac(1, 4) });
    expect(s.message).toMatch(/Ebene 2/);
    expect(validateScore(s.score)).toEqual([]);
    expect(run(run(s, 'input.layer', 1), 'input.layer', 2).score.parts[0]!.voices.length).toBe(2); // not made again
  });

  it('notes entered after choosing the layer land in that voice; the numbers follow the order on the staff', () => {
    let s = run(run(start(), 'input.layer', 2), 'input.note', 4); // G in layer 2 at the start
    expect(getVoice(s.score, { partId: 'voice', voiceId: 'voice-v2' }).voice.events.map((e) => e.onset)).toEqual([frac(0, 1)]);
    expect(getVoice(s.score, { partId: 'voice', voiceId: 'voice-v1' }).voice.events).toHaveLength(0);
    const part = s.score.parts[0]!;
    expect(layersOf(part, 0).map((v) => layerNumber(part, v))).toEqual([1, 2]);
    s = run(s, 'input.layer', 1);
    expect(s.caret).toMatchObject({ voiceId: 'voice-v1' });
  });

  it('works from a selected note, and says what to do when nothing is chosen', () => {
    let s = run(start(), 'input.note', 2);
    const eventId = voices(s)[0]!.events[0]!.id;
    s = { ...s, caret: null, selection: { kind: 'event', partId: 'voice', voiceId: 'voice-v1', eventId } };
    expect(run(s, 'input.layer', 2).caret).toMatchObject({ voiceId: 'voice-v2', time: frac(0, 1) });
    expect(run({ ...s, selection: null }, 'input.layer', 2).message).toMatch(/Enter/);
  });
});

describe('notes of both layers on the same beat (ADR 0044)', () => {
  const both = (a: [number, number], b: [number, number], pitchA = 'E', pitchB = 'E') => {
    let s = start();
    s = run(s, 'input.duration', a[1] === 2 ? 6 : 5);
    s = run(s, 'input.note', ['C', 'D', 'E', 'F', 'G', 'A', 'B'].indexOf(pitchA));
    s = { ...s, caret: { partId: 'voice', voiceId: 'voice-v1', time: frac(0, 1) } };
    s = run(s, 'input.layer', 2);
    s = run(s, 'input.duration', b[1] === 2 ? 6 : 5);
    s = { ...s, caret: { partId: 'voice', voiceId: 'voice-v2', time: frac(0, 1) } };
    s = run(s, 'input.note', ['C', 'D', 'E', 'F', 'G', 'A', 'B'].indexOf(pitchB));
    return scoreToMei(s.score).mei;
  };
  const hidden = (mei: string) => (mei.match(/head\.visible="false"/g) ?? []).length;

  it('a half note and a quarter note of the same pitch share one hollow head: the quarter draws only its stem', () => {
    const mei = both([1, 2], [1, 4]);
    expect(hidden(mei)).toBe(1);
    expect(mei).toMatch(/<layer n="2">\s*<note [^>]*dur="4"[^>]*stem\.dir="down"[^>]*head\.visible="false"/);
    expect(mei).toMatch(/<layer n="1">\s*<note [^>]*dur="2"[^>]*stem\.dir="up"/);
  });

  it('a quarter note in layer 1 and a half note in layer 2: the half note keeps the head', () => {
    const mei = both([1, 4], [1, 2]);
    expect(mei).toMatch(/<layer n="1">\s*<note [^>]*dur="4"[^>]*stem\.dir="up"[^>]*head\.visible="false"/);
    expect(mei).toMatch(/<layer n="2">\s*<note [^>]*dur="2"[^>]*stem\.dir="down"(?![^>]*head\.visible)/);
  });

  it('the same note in both layers is shown once (one head), with the stem of each layer', () => {
    const mei = both([1, 4], [1, 4]);
    expect(hidden(mei)).toBe(1);
    expect(mei).toContain('stem.dir="up"');
    expect(mei).toContain('stem.dir="down"');
  });

  it('different pitches keep both heads', () => {
    expect(hidden(both([1, 4], [1, 4], 'E', 'G'))).toBe(0);
  });
});
