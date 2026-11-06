import { describe, expect, it } from 'vitest';
import { FileFormatError, FORMAT_VERSION, fileVersion, parseScoreFile, serializeScore } from './format';
import { pitchToString } from '../pitch';
import { type Score, validateScore, withTempo } from '../model';
import { frac } from '../time';
import { applyScoreChanges } from '../templates';
import version1File from './fixtures/version1.icastico?raw';
import version2File from './fixtures/version2.icastico?raw';
import version3File from './fixtures/version3.icastico?raw';
import version4File from './fixtures/version4.icastico?raw';
import version5File from './fixtures/version5.icastico?raw';
import version6File from './fixtures/version6.icastico?raw';
import version7File from './fixtures/version7.icastico?raw';
import version8File from './fixtures/version8.icastico?raw';
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
    expect(text).toContain('{ "id": "v6", "at": "3/2", "dur": "3/4", "tones": [{ "id": "v6-t1", "pitch": "D5" }] }');
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
    expect(score.parts[0]!.voices[0]!.events[1]!.tones[0]).toEqual({ id: 'voice-v1-n2-t1', pitch: { step: 'B', alter: -1, octave: 4 } });
  });

  it('opens files saved by Icastico 0.6.0 (format version 2): same music, tones get ids', () => {
    const score = parseScoreFile(version2File);
    expect(validateScore(score)).toEqual([]);
    expect(fileVersion(version2File)).toBe(2);
    expect(score.pickup).toEqual(frac(1, 4));
    const [rh, lh] = score.parts[0]!.voices;
    const spelled = (e: { tones: readonly { pitch: Parameters<typeof pitchToString>[0] }[] }) => e.tones.map((t) => pitchToString(t.pitch));
    expect(rh!.events.map(spelled)).toEqual([['Gb4'], ['C4', 'E4', 'G4'], ['F#4', 'A#4']]); // Gb stays Gb, F# stays F#
    expect(rh!.events[1]!.tones.map((t) => t.id)).toEqual(['pr2-t1', 'pr2-t2', 'pr2-t3']);
    expect(lh!.events[0]!.tones.map((t) => t.id)).toEqual(['pl1-t1', 'pl1-t2']);
    const all = score.parts.flatMap((p) => p.voices.flatMap((v) => v.events.flatMap((e) => e.tones.map((t) => t.id))));
    expect(new Set(all).size).toBe(all.length);
  });

  it('a migrated file is saved as the current version and then stays unchanged', () => {
    const saved = serializeScore(parseScoreFile(version2File), '0.0.0');
    expect(fileVersion(saved)).toBe(FORMAT_VERSION);
    expect(saved).not.toContain('"pitches"');
    expect(roundtrip(saved)).toBe(saved);
    expect(parseScoreFile(saved)).toEqual(parseScoreFile(version2File));
  });

  it('opens files saved by Icastico 0.7.0 (format version 3): same music, no links yet', () => {
    const score = parseScoreFile(version3File);
    expect(fileVersion(version3File)).toBe(3);
    expect(validateScore(score)).toEqual([]);
    expect(score.links).toBeUndefined();
    expect(score.parts[0]!.voices[0]!.events[1]!.tones.map((x) => x.id)).toEqual(['pr2-t1', 'pr2-t2', 'pr2-t3']);
    expect(parseScoreFile(serializeScore(score, '0.0.0'))).toEqual(score);
    expect({ ...score, title: '' }).toEqual({ ...parseScoreFile(version2File), title: '' }); // the 0.6.0 file migrates to the same music
  });

  it('stores ties and slides one per line and reads them back', () => {
    const base = parseScoreFile(version3File);
    const voice = base.parts[0]!.voices[0]!;
    const withLinks = {
      ...base,
      links: [
        { id: 'link-1', kind: 'slide' as const, from: voice.events[0]!.tones[0]!.id, to: voice.events[1]!.tones[0]!.id },
      ],
    };
    const text = serializeScore(withLinks, '0.0.0');
    expect(text).toContain('"links": [');
    expect(text).toContain('{ "id": "link-1", "kind": "slide", "from": "pr1-t1", "to": "pr2-t1" }');
    expect(parseScoreFile(text)).toEqual(withLinks);
    expect(serializeScore(base, '0.0.0')).not.toContain('"links"');
  });

  it('rejects broken links with a clear message', () => {
    const doc = JSON.parse(version3File) as { score: Record<string, unknown> };
    const attempt = (links: unknown) => () => parseScoreFile(JSON.stringify({ ...doc, version: 4, score: { ...doc.score, links } }));
    expect(attempt([{ id: 'l1', kind: 'tie', from: 'pr1-t1', to: 'nirgends' }])).toThrow(/Ton, den es nicht gibt/);
    expect(attempt([{ id: 'l1', kind: 'wavy', from: 'pr1-t1', to: 'pr2-t1' }])).toThrow(/unbekannte Art/);
    expect(attempt([{ id: 'l1', kind: 'tie', from: 'pr1-t1', to: 'pr2-t1' }])).toThrow(FileFormatError); // Gb4 vs C4
    expect(attempt('nope')).toThrow(/Liste erwartet/);
  });

  it('opens files saved by Icastico 0.8.0 (format version 4): links kept, default tempo', () => {
    const score = parseScoreFile(version4File);
    expect(fileVersion(version4File)).toBe(4);
    expect(score.links).toEqual([{ id: 'link-1', kind: 'slide', from: 'pr1-t1', to: 'pr2-t1' }]);
    expect(score.tempo).toBeUndefined();
    const saved = serializeScore(score, '0.0.0');
    expect(fileVersion(saved)).toBe(FORMAT_VERSION);
    expect(parseScoreFile(saved)).toEqual(score);
  });

  it('stores the tempo only when it is not the default, and checks it', () => {
    const base = parseScoreFile(version4File);
    expect(serializeScore(withTempo(base, 100), '0.0.0')).not.toContain('"tempo"');
    const fast = serializeScore(withTempo(base, 132), '0.0.0');
    expect(fast).toContain('"tempo": 132');
    expect(parseScoreFile(fast).tempo).toBe(132);
    const doc = JSON.parse(fast) as { score: Record<string, unknown> };
    const attempt = (tempo: unknown) => () => parseScoreFile(JSON.stringify({ ...doc, score: { ...doc.score, tempo } }));
    expect(attempt(5)).toThrow(/Tempo 5 ist ungültig/);
    expect(attempt(120.5)).toThrow(/ganze Zahl/);
    expect(attempt('schnell')).toThrow(FileFormatError);
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
    const score = (d: Record<string, unknown>) =>
      d.score as { parts: { instrument: string; voices: { events: { tones: { id: string; pitch: string }[] }[] }[] }[] };
    expectError(broken((d) => (score(d).parts[0]!.voices[0]!.events[0]!.tones[0]!.pitch = 'X9')), /unbekannte Tonhöhe „X9“/);
    expectError(broken((d) => (score(d).parts[1]!.instrument = 'banjo')), /unbekanntes Instrument „banjo“/);
  });

  it('tone problems: duplicate ids, missing or malformed tones', () => {
    type Doc = { score: { parts: { voices: { events: Record<string, unknown>[] }[] }[] } };
    const events = (d: Record<string, unknown>) => (d as unknown as Doc).score.parts[0]!.voices[0]!.events;
    expectError(broken((d) => (events(d)[1]!.tones = events(d)[0]!.tones)), /Doppelte Ton-ID/);
    expectError(broken((d) => (events(d)[0]!.tones = [])), /hat keine Tonhöhe/);
    expectError(broken((d) => delete events(d)[0]!.tones), /tones: Liste erwartet/);
    expectError(broken((d) => (events(d)[0]!.tones = ['C4'])), /Objekt erwartet/);
    expectError(broken((d) => (events(d)[0]!.tones = [{ pitch: 'C4' }])), /id: Text erwartet/);
    expectError(broken((d) => (events(d)[0]!.tones = [{ id: 'a b', pitch: 'C4' }])), /Ungültige Ton-ID/);
    expectError(broken((d) => ((events(d)[0]!.pitches = ['C4']), delete events(d)[0]!.tones)), /tones: Liste erwartet/);
  });

  it('a damaged old file is rejected cleanly, not with a crash', () => {
    const damaged = (mutate: (e: Record<string, unknown>) => void) => {
      const doc = JSON.parse(version2File) as { score: { parts: { voices: { events: Record<string, unknown>[] }[] }[] } };
      mutate(doc.score.parts[0]!.voices[0]!.events[1]!);
      return JSON.stringify(doc);
    };
    expectError(damaged((e) => (e.pitches = 'C4')), /tones: Liste erwartet/);
    expectError(damaged((e) => (e.pitches = ['X9'])), /unbekannte Tonhöhe „X9“/);
    expectError(damaged((e) => (e.pitches = [])), /hat keine Tonhöhe/);
    expectError(damaged((e) => (e.id = 'pr1')), /Doppelte Event-ID pr1/);
  });

  it('overlapping notes', () => {
    const score = (d: Record<string, unknown>) => d.score as { parts: { voices: { events: { at: string }[] }[] }[] };
    expectError(broken((d) => (score(d).parts[0]!.voices[0]!.events[1]!.at = '1/8')), /überlappt/);
  });
});

describe('format version 6: loudness and curves (ADR 0016)', () => {
  it('opens files saved by Icastico 0.9.0 (format version 5): tempo kept, no curves', () => {
    const score = parseScoreFile(version5File);
    expect(fileVersion(version5File)).toBe(5);
    expect(score.tempo).toBe(132);
    expect(score.parts[0]!.voices[0]!.events[0]!.tones[0]!.volume).toBeUndefined();
    const saved = serializeScore(score, '0.0.0');
    expect(fileVersion(saved)).toBe(FORMAT_VERSION);
    expect(parseScoreFile(saved)).toEqual(score);
  });

  it('writes loudness only when it is not the default and keeps curves exactly', () => {
    const base = parseScoreFile(version5File);
    const fade = [{ x: 0, y: 0 }, { x: 0.3, y: 1 }, { x: 1, y: 1 }];
    const glide = [{ x: 0, y: 0 }, { x: 0.5, y: 0.2 }, { x: 1, y: 1 }];
    const score: Score = {
      ...base,
      links: base.links!.map((l) => ({ ...l, curve: glide })),
      parts: base.parts.map((p) => ({
        ...p,
        voices: p.voices.map((v, vi) => ({
          ...v,
          events: v.events.map((e, ei) => ({
            ...e,
            tones: e.tones.map((t, ti) => (vi === 0 && ei === 0 ? { ...t, volume: 64, curve: fade } : ti === 0 ? { ...t, volume: 100 } : t)),
          })),
        })),
      })),
    };
    const text = serializeScore(score, '0.0.0');
    expect(text.match(/"vol"/g)).toHaveLength(1); // 100 is the default and stays out of the file
    expect(text).toContain('"curve": [[0, 0], [0.3, 1], [1, 1]]');
    const back = parseScoreFile(text);
    expect(back.links![0]!.curve).toEqual(glide);
    expect(back.parts[0]!.voices[0]!.events[0]!.tones[0]).toMatchObject({ volume: 64, curve: fade });
  });

  it('rejects broken loudness values and curves with a clear message', () => {
    const doc = JSON.parse(serializeScore(parseScoreFile(version5File), '0')) as { score: { parts: { voices: { events: { tones: Record<string, unknown>[] }[] }[] }[]; links: Record<string, unknown>[] } };
    const attempt = (mutate: (d: typeof doc) => void) => () => {
      const copy = JSON.parse(JSON.stringify(doc)) as typeof doc;
      mutate(copy);
      return parseScoreFile(JSON.stringify(copy));
    };
    const tone = (d: typeof doc) => d.score.parts[0]!.voices[0]!.events[0]!.tones[0]!;
    expect(attempt((d) => (tone(d).vol = 0))).toThrow(/Lautstärke 0 ist ungültig/);
    expect(attempt((d) => (tone(d).vol = 64.5))).toThrow(/ganze Zahl/);
    expect(attempt((d) => (tone(d).curve = [[0, 1]]))).toThrow(/2 bis 16 Punkte/);
    expect(attempt((d) => (tone(d).curve = [[0, 1], [0.5, 2], [1, 1]]))).toThrow(/zwischen 0 und 1/);
    expect(attempt((d) => (tone(d).curve = [[0.1, 1], [1, 1]]))).toThrow(/beginnt bei 0/);
    expect(attempt((d) => (tone(d).curve = [[0, 1], [0.6, 1], [0.4, 1], [1, 1]]))).toThrow(/von links nach rechts/);
    expect(attempt((d) => (d.score.links[0]!.curve = [[0, 0.5], [1, 1]]))).toThrow(/beginnt beim ersten Ton/);
    expect(attempt((d) => (tone(d).curve = 'sanft'))).toThrow(/Liste erwartet/);
  });
});

describe('format version 7: lyrics and chord symbols (ADR 0019)', () => {
  it('opens files saved by Icastico 0.10.0 (format version 6): loudness kept, no text', () => {
    const score = parseScoreFile(version6File);
    expect(fileVersion(version6File)).toBe(6);
    expect(score.parts[0]!.voices[0]!.events[0]!.tones[0]!.volume).toBe(64);
    expect(score.chords).toBeUndefined();
    const saved = serializeScore(score, '0.0.0');
    expect(fileVersion(saved)).toBe(FORMAT_VERSION);
    expect(parseScoreFile(saved)).toEqual(score);
  });

  it('keeps lyric syllables and chord symbols exactly', () => {
    const base = parseScoreFile(version6File);
    const score: Score = {
      ...base,
      chords: [{ at: frac(0, 1), text: 'Am7' }, { at: frac(3, 4), text: 'F/C' }],
      parts: base.parts.map((p) => ({ ...p, voices: p.voices.map((v, vi) => ({ ...v, events: v.events.map((e, ei) => (vi === 0 && ei < 2 ? { ...e, lyric: ei === 0 ? 'Hel-' : 'lo' } : e)) })) })),
    };
    const text = serializeScore(score, '0.0.0');
    expect(text).toContain('"lyric": "Hel-"');
    expect(text).toContain('"text": "F/C"');
    expect(parseScoreFile(text)).toEqual(score);
  });

  it('keeps the tablature switch of a guitar part and refuses it elsewhere', () => {
    const base = demoScore();
    const guitar = base.parts.findIndex((p) => p.instrument === 'guitar');
    const on: Score = { ...base, parts: base.parts.map((p, i) => (i === guitar ? { ...p, tab: true } : p)) };
    expect(serializeScore(on, '0')).toContain('"tab": true');
    expect(parseScoreFile(serializeScore(on, '0')).parts[guitar]!.tab).toBe(true);
    const wrong: Score = { ...base, parts: base.parts.map((p, i) => (i === guitar ? p : { ...p, tab: true })) };
    expect(() => parseScoreFile(serializeScore(wrong, '0'))).toThrow(/Tabulatur/);
  });

  it('rejects an empty chord symbol and a lyric with a space', () => {
    const base = parseScoreFile(version6File);
    expect(() => parseScoreFile(serializeScore({ ...base, chords: [{ at: frac(0, 1), text: ' ' }] }, '0'))).toThrow(/Akkordsymbol/);
    const bad = { ...base, parts: base.parts.map((p, pi) => (pi ? p : { ...p, voices: p.voices.map((v, vi) => (vi ? v : { ...v, events: v.events.map((e, i) => (i ? e : { ...e, lyric: 'a b' })) })) })) };
    expect(() => parseScoreFile(serializeScore(bad, '0'))).toThrow(/Liedtext/);
  });
});

describe('format version 8: special signs (ADR 0024)', () => {
  it('opens files saved by Icastico 0.12.0 (format version 7): lyrics and chord symbols kept, no signs', () => {
    const score = parseScoreFile(version7File);
    expect(fileVersion(version7File)).toBe(7);
    expect(score.chords).toEqual([{ at: frac(0, 1), text: 'Am7' }]);
    expect(score.marks).toBeUndefined();
    const saved = serializeScore(score, '0.0.0');
    expect(fileVersion(saved)).toBe(FORMAT_VERSION);
    expect(parseScoreFile(saved)).toEqual(score);
  });

  it('keeps note signs and bar signs exactly and rejects unknown ones', () => {
    const base = parseScoreFile(version7File);
    const score: Score = {
      ...base,
      marks: [{ at: frac(0, 1), kind: 'repeatStart' }, { at: frac(1, 1), kind: 'volta1' }, { at: frac(1, 1), kind: 'repeatEnd' }],
      parts: base.parts.map((p) => ({ ...p, voices: p.voices.map((v, vi) => ({ ...v, events: v.events.map((e, ei) => (vi === 0 && ei === 0 ? { ...e, marks: ['mf', 'stacc', 'fermata'] } : e)) })) })),
    };
    const text = serializeScore(score, '0.0.0');
    expect(text).toContain('"marks": ["mf", "stacc", "fermata"]');
    expect(parseScoreFile(text)).toEqual(score);
    expect(() => parseScoreFile(serializeScore({ ...score, marks: [{ at: frac(0, 1), kind: 'nonsense' as never }] }, '0'))).toThrow(/Taktzeichen/);
    const bad = { ...score, parts: score.parts.map((p) => ({ ...p, voices: p.voices.map((v) => ({ ...v, events: v.events.map((e) => (e.marks ? { ...e, marks: ['zzz'] } : e)) })) })) };
    expect(() => parseScoreFile(serializeScore(bad, '0'))).toThrow(/Zeichen/);
  });
});

describe('format version 9: several glides into one tone', () => {
  it('opens files saved by Icastico 0.13.0 (format version 8) and saves them as the current version', () => {
    const score = parseScoreFile(version8File);
    expect(fileVersion(version8File)).toBe(8);
    expect(score.parts[0]!.voices[0]!.events[0]!.marks).toEqual(['mf']);
    const saved = serializeScore(score, '0.0.0');
    expect(fileVersion(saved)).toBe(FORMAT_VERSION);
    expect(parseScoreFile(saved)).toEqual(score);
  });

  it('keeps two glides that end in the same tone, and still refuses a tie that does not arrive alone', () => {
    const base = parseScoreFile(version8File);
    const tones = base.parts[0]!.voices[0]!.events.flatMap((e) => e.tones.map((t) => t.id));
    const target = tones[tones.length - 1]!;
    const slides = tones.slice(0, 2).map((from, i) => ({ id: `link-${i + 1}`, kind: 'slide' as const, from, to: target }));
    const score: Score = { ...base, links: slides };
    expect(parseScoreFile(serializeScore(score, '0')).links).toEqual(slides);
    const bad = { ...score, links: [...slides, { id: 'link-3', kind: 'tie' as const, from: tones[2]!, to: target }] };
    expect(() => parseScoreFile(serializeScore(bad, '0'))).toThrow();
  });
});
