import { describe, expect, it } from 'vitest';
import { assignFrets } from './tab';
import { parseLine } from './line';

const fingering = (spec: string) => {
  const events = parseLine(spec, 'e');
  const map = assignFrets(events);
  return events.map((e) => e.tones.map((t) => { const f = map.get(t.id); return f ? `${f.string}:${f.fret}` : '-'; }).join(','));
};

describe('guitar fingering', () => {
  it('open strings and low notes land on the expected strings', () => {
    expect(fingering('E2:1/4 A2:1/4 D3:1/4 G3:1/4 B3:1/4 E4:1/4')).toEqual(['6:0', '5:0', '4:0', '3:0', '2:0', '1:0']);
  });

  it('a scale stays in one hand position instead of jumping strings', () => {
    // C major scale from C3: every note within frets 0–5 on neighbouring strings
    const frets = fingering('C3:1/4 D3:1/4 E3:1/4 F3:1/4 G3:1/4 A3:1/4 B3:1/4 C4:1/4').map((f) => Number(f.split(':')[1]));
    expect(Math.max(...frets)).toBeLessThanOrEqual(5);
  });

  it('a chord uses distinct strings (C major open shape)', () => {
    const [chord] = fingering('[C3,E3,G3,C4,E4]:1/2');
    const strings = chord!.split(',').map((f) => f.split(':')[0]);
    expect(new Set(strings).size).toBe(5);
    expect(chord).toBe('5:3,4:2,3:0,2:1,1:0');
  });

  it('tones outside the guitar are left out, not invented', () => {
    expect(fingering('C2:1/4 C7:1/4')).toEqual(['-', '-']);
  });
});

import { newScoreState, runCommand } from './editor/commands';
import { extendRange } from './editor/range';
import { getVoice, type EditorState } from './editor/state';
import { pitchToString } from './pitch';
import { addGuitarPart } from './editor/tabOps';
import { createScore, DEFAULT_SETUP } from './templates';

describe('tablature added later and passages translated (ADR 0022)', () => {
  const melody = (): EditorState => {
    let s = runCommand(newScoreState(), 'input.duration', 5);
    for (const key of [60, 64, 67, 72, 36]) s = runCommand(s, 'input.midi', key); // C4 E4 G4 C5 and a C2 below the guitar
    return s;
  };
  const guitar = (s: EditorState) => s.score.parts.find((p) => p.instrument === 'guitar')!;
  const select = (s: EditorState, i: number): EditorState => ({ ...s, caret: null, selection: { kind: 'event', partId: 'voice', voiceId: 'voice-v1', eventId: getVoice(s.score, { partId: 'voice', voiceId: 'voice-v1' }).voice.events[i]!.id } });

  it('Strg+T on a line that is not a guitar adds a guitar line with tablature; again it switches the tablature', () => {
    const noGuitar = { ...newScoreState(), score: createScore({ ...DEFAULT_SETUP, instruments: ['voice'] }) };
    const added = runCommand({ ...noGuitar, selection: { kind: 'gap', partId: 'voice', voiceId: 'voice-v1', time: { n: 0, d: 1 } } }, 'edit.tab');
    expect(guitar(added).tab).toBe(true);
    expect(added.message).toMatch(/hinzugefügt/);
    expect(runCommand(added, 'edit.tab').score.parts.find((p) => p.instrument === 'guitar')!.tab).toBeUndefined();
    expect(addGuitarPart(added.score).partId).toBe('guitar-2');
  });

  it('translating a marked passage copies it into the guitar line at the same time and shows the tablature', () => {
    const marked = extendRange(select(melody(), 1), 1); // E4 G4
    const t = runCommand(marked, 'edit.tabTranslate');
    const g = getVoice(t.score, { partId: 'guitar', voiceId: 'guitar-v1' }).voice.events;
    expect(g.map((e) => e.tones.map((x) => pitchToString(x.pitch)).join('+'))).toEqual(['E4', 'G4']);
    expect(g[0]!.onset).toEqual({ n: 1, d: 4 });
    expect(guitar(t).tab).toBe(true);
    expect(t.message).toMatch(/2 Töne/);
  });

  it('without a marked passage the whole line goes; tones below the guitar are left out and counted', () => {
    const t = runCommand(select(melody(), 0), 'edit.tabTranslate');
    const g = getVoice(t.score, { partId: 'guitar', voiceId: 'guitar-v1' }).voice.events;
    expect(g).toHaveLength(4);
    expect(t.message).toMatch(/1 außerhalb der Gitarre/);
  });

  it('on the guitar line itself there is nothing to translate', () => {
    const s = melody();
    const guitarState = { ...s, selection: { kind: 'gap' as const, partId: 'guitar', voiceId: 'guitar-v1', time: { n: 0, d: 1 } } };
    expect(runCommand(guitarState, 'edit.tabTranslate').message).toMatch(/schon die Gitarrenzeile/);
  });
});
