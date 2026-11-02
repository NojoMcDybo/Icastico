import { describe, expect, it } from 'vitest';
import { FileFormatError, FORMAT_VERSION, parseScoreFile, serializeScore } from './format';
import { frac } from '../time';
import { applyScoreChanges } from '../templates';
import version1File from './fixtures/version1.icastico?raw';
import { demoScore } from '../demo';
import { emptyScore } from '../templates';

const roundtrip = (text: string) => serializeScore(parseScoreFile(text), '0.0.0');

describe('.icastico format', () => {
  it('saves and reopens the demo exactly', () => {
    const score = demoScore();
    expect(parseScoreFile(serializeScore(score, '0.2.0'))).toEqual(score);
  });

  it('round-trips an empty score and is stable', () => {
    const text = serializeScore(emptyScore(), '0.0.0');
    expect(parseScoreFile(text)).toEqual(emptyScore());
    expect(roundtrip(text)).toBe(text);
  });

  it('is readable: header first, one note per line', () => {
    const text = serializeScore(demoScore(), '0.2.0');
    expect(text.startsWith(`{\n  "format": "icastico",\n  "version": ${FORMAT_VERSION},\n  "app": "0.2.0",`)).toBe(true);
    expect(text).toContain('{ "id": "v6", "at": "3/2", "dur": "3/4", "pitches": ["D5"] }');
    expect(text).toContain('{ "at": "0", "count": 4, "unit": 4 }');
  });

  it('keeps titles with quotes and commas intact', () => {
    const score = { ...emptyScore(), title: 'Lied "eins", zwei', composer: 'Ä. Ö' };
    expect(parseScoreFile(serializeScore(score, '0')).title).toBe('Lied "eins", zwei');
  });

  it('opens files saved by Icastico 0.2.0 (format version 1)', () => {
    const score = parseScoreFile(version1File);
    expect(score.title).toBe('Gespeichert mit 0.2.0');
    expect(score.keys[0]!.fifths).toBe(-1);
    expect(score.pickup).toBeUndefined();
    expect(score.parts[0]!.voices[0]!.events[1]!.pitches[0]).toEqual({ step: 'B', alter: -1, octave: 4 });
  });

  it('stores the upbeat', () => {
    const r = applyScoreChanges(demoScore(), { pickup: frac(1, 4) });
    if ('error' in r) throw new Error(r.error);
    const text = serializeScore(r.score, '0');
    expect(text).toContain('"pickup": "1/4"');
    expect(parseScoreFile(text)).toEqual(r.score);
  });

  it('accepts notes in any order in the file', () => {
    const doc = JSON.parse(serializeScore(demoScore(), '0')) as {
      score: { parts: { voices: { events: unknown[] }[] }[] };
    };
    doc.score.parts[0]!.voices[0]!.events.reverse();
    expect(parseScoreFile(JSON.stringify(doc))).toEqual(demoScore());
  });
});

describe('.icastico rejects broken files with a clear message', () => {
  const broken = (mutate: (doc: Record<string, unknown>) => void): string => {
    const doc = JSON.parse(serializeScore(demoScore(), '0')) as Record<string, unknown>;
    mutate(doc);
    return JSON.stringify(doc);
  };
  const expectError = (text: string, pattern: RegExp) => {
    expect(() => parseScoreFile(text)).toThrow(FileFormatError);
    expect(() => parseScoreFile(text)).toThrow(pattern);
  };

  it('not JSON / not ours', () => {
    expectError('<score/>', /keine Icastico-Datei/);
    expectError('{"format":"musescore"}', /keine Icastico-Datei/);
  });

  it('from a newer version', () => {
    expectError(broken((d) => (d.version = FORMAT_VERSION + 1)), /neueren Icastico-Version/);
  });

  it('unknown pitch or instrument', () => {
    const score = (d: Record<string, unknown>) => d.score as { parts: { instrument: string; voices: { events: { pitches: string[] }[] }[] }[] };
    expectError(broken((d) => (score(d).parts[0]!.voices[0]!.events[0]!.pitches = ['X9'])), /unbekannte Tonhöhe „X9“/);
    expectError(broken((d) => (score(d).parts[1]!.instrument = 'banjo')), /unbekanntes Instrument „banjo“/);
  });

  it('overlapping notes', () => {
    const score = (d: Record<string, unknown>) => d.score as { parts: { voices: { events: { at: string }[] }[] }[] };
    expectError(broken((d) => (score(d).parts[0]!.voices[0]!.events[1]!.at = '1/8')), /überlappt/);
  });
});
