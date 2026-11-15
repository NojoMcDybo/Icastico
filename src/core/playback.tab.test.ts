import { describe, expect, it } from 'vitest';
import { newScoreState, runCommand } from './editor/commands';
import { planPlayback } from './playback';

/** The guitar line and a tablature line of its own play the same note in the same octave (ADR 0044). */
describe('guitar notation and tablature sound alike', () => {
  const played = (instrument: 'guitar' | 'tab') => {
    let s = newScoreState();
    const part = s.score.parts.find((p) => p.instrument === 'guitar')!;
    s = runCommand({ ...s, caret: { partId: part.id, voiceId: part.voices[0]!.id, time: { n: 0, d: 1 } } }, 'input.note', 2);
    const score = { ...s.score, parts: s.score.parts.map((p) => (p.id === part.id ? { ...p, instrument, ...(instrument === 'guitar' ? { tab: true } : {}) } : p)) };
    return planPlayback(score).notes.map((n) => n.path[0]!.midi);
  };

  it('E4 (the open high string) sounds as MIDI 64 on the guitar line with its tab and on a tablature line', () => {
    expect(played('guitar')).toEqual([64]);
    expect(played('tab')).toEqual([64]);
  });
});
