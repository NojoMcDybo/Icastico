import { describe, expect, it } from 'vitest';
import { extractPart } from './extract';
import { demoScore } from './demo';
import { validateScore } from './model';

describe('extractPart', () => {
  const demo = demoScore();

  it('keeps one instrument with the structure of the score and a valid result', () => {
    const guitar = demo.parts.find((p) => p.instrument === 'guitar')!;
    const out = extractPart(demo, guitar.id);
    expect(out.parts).toEqual([guitar]);
    expect(out.title).toBe(`${demo.title} – ${guitar.name}`);
    expect(out.meter).toEqual(demo.meter);
    expect(out.keys).toEqual(demo.keys);
    expect(validateScore(out)).toEqual([]);
  });

  it('drops links that reach into other instruments', () => {
    const voice = demo.parts[0]!;
    const guitar = demo.parts.find((p) => p.instrument === 'guitar')!;
    const from = voice.voices[0]!.events[0]!.tones[0]!.id;
    const to = guitar.voices[0]!.events[0]!.tones[0]!.id;
    const withLink = { ...demo, links: [{ id: 'l1', kind: 'slide' as const, from, to }] };
    expect(extractPart(withLink, guitar.id).links).toBeUndefined();
    expect(validateScore(extractPart(withLink, voice.id))).toEqual([]);
  });

  it('refuses an unknown part', () => {
    expect(() => extractPart(demo, 'gibt-es-nicht')).toThrow(/gibt es nicht/);
  });
});
