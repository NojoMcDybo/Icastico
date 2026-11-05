import { describe, expect, it } from 'vitest';
import { fromBase64, fromWav, resample, toBase64, toWav } from './audio';
import { GOALS, judge, summarize, testWords } from './evaluate';
import { VOCABULARY_DE } from './vocabulary.de';
import { voskGrammar } from './engines';

const entry = (word: string) => testWords().find((t) => t.word === word)!.entry;
const heard = (text: string, confidence = 1) => ({ text, confidence, ms: 100 });

describe('audio helpers', () => {
  it('WAV out and in again keeps the samples (16-bit precision) and the rate', () => {
    const samples = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7) * 0.8);
    const back = fromWav(toWav(samples, 16000));
    expect(back.rate).toBe(16000);
    expect(back.samples).toHaveLength(1000);
    for (let i = 0; i < 1000; i++) expect(back.samples[i]).toBeCloseTo(samples[i]!, 3);
  });

  it('refuses what is not a 16-bit WAV', () => {
    expect(() => fromWav(new Uint8Array(10))).toThrow(/WAV/);
    const bad = toWav(new Float32Array(10), 16000);
    bad[34] = 8; // 8 bits per sample
    expect(() => fromWav(bad)).toThrow(/16-Bit/);
  });

  it('base64 round-trips, also for long recordings', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 251);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('resampling keeps the length ratio and the pitch of a slow tone', () => {
    const rate = 48000;
    const tone = Float32Array.from({ length: rate }, (_, i) => Math.sin((2 * Math.PI * 200 * i) / rate));
    const out = resample(tone, rate, 16000);
    expect(out.length).toBe(16000);
    const crossings = out.reduce((n, v, i) => (i > 0 && out[i - 1]! < 0 && v >= 0 ? n + 1 : n), 0);
    expect(crossings).toBeGreaterThanOrEqual(199);
    expect(crossings).toBeLessThanOrEqual(201);
    expect(resample(tone, rate, rate)).toBe(tone);
  });
});

describe('scoring', () => {
  it('right, wrong and not understood are told apart', () => {
    expect(judge(entry('fünf'), heard('fünf'))).toBe('richtig');
    expect(judge(entry('fünf'), heard('Viertel'))).toBe('richtig'); // a synonym is the same command
    expect(judge(entry('fünf'), heard('vier'))).toBe('falsch');
    expect(judge(entry('fünf'), heard('Blumenkohl'))).toBe('nicht verstanden');
    expect(judge(entry('fünf'), heard('fünf', 0.3))).toBe('nicht verstanden');
    expect(judge(entry('höher'), heard('Oktave hoch'))).toBe('falsch');
  });

  it('summarises shares and the mean time', () => {
    const s = summarize([
      { verdict: 'richtig', ms: 100 },
      { verdict: 'richtig', ms: 300 },
      { verdict: 'falsch', ms: 200 },
      { verdict: 'nicht verstanden', ms: 400 },
    ]);
    expect(s).toMatchObject({ total: 4, richtig: 2, falsch: 1, nichtVerstanden: 1, trefferquote: 0.5, fehlerquote: 0.25, meanMs: 250 });
    expect(summarize([])).toMatchObject({ total: 0, trefferquote: 0, meanMs: 0 });
    expect(GOALS.treffer).toBeGreaterThan(GOALS.trefferMitInstrument);
  });

  it('the test asks for every trigger word, and the Vosk word list holds them all in lower case', () => {
    expect(testWords()).toHaveLength(VOCABULARY_DE.reduce((n, e) => n + e.words.length, 0));
    const grammar = JSON.parse(voskGrammar()) as string[];
    expect(grammar).toContain('oktave hoch');
    expect(grammar).toContain('zweiunddreißigstel');
    expect(grammar).toContain('[unk]');
    expect(grammar.every((g) => g === g.toLowerCase() || g === '[unk]')).toBe(true);
  });
});
