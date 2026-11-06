/**
 * Random tests (seeded, so a failure can be repeated): whatever notes or bytes come in, the importers either
 * give a valid score or a clear ImportError – never a crash, never a score the rest of the program cannot handle.
 */
import { describe, expect, it } from 'vitest';
import { exportMidi } from '../export/midi';
import { demoScore } from '../demo';
import { validateScore } from '../model';
import { writable } from './grid';
import { parseMidi } from './midi';
import { ImportError } from './musicxml';
import { type PlayedNote, buildScore } from './quantize';
import { decodePcm } from './wav';
import { lt, add, le } from '../time';

function random(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('buildScore with random notes', () => {
  it('always gives a valid score with writable, non-overlapping events', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = random(seed);
      const count = 1 + Math.floor(r() * 40);
      const notes: PlayedNote[] = Array.from({ length: count }, () => {
        const start = r() * 16;
        return { start, end: start + 0.02 + r() * 3, midi: 30 + Math.floor(r() * 70) };
      });
      const instrument = (['voice', 'guitar', 'piano'] as const)[seed % 3]!;
      const subdivision = ([8, 16, 32] as const)[seed % 3]!;
      const { score } = buildScore({ title: 'Zufall', parts: [{ name: 'x', instrument, notes }], quantize: { subdivision, triplets: seed % 2 === 0 }, meter: [{ at: { n: 0, d: 1 }, sig: { count: 4, unit: 4 } }], fifths: null });
      expect(validateScore(score), `seed ${seed}`).toEqual([]);
      for (const v of score.parts[0]!.voices) {
        v.events.forEach((e, i) => {
          expect(writable(e.duration), `seed ${seed}: duration ${e.duration.n}/${e.duration.d}`).toBe(true);
          if (i > 0) expect(le(add(v.events[i - 1]!.onset, v.events[i - 1]!.duration), e.onset), `seed ${seed}: overlap`).toBe(true);
          expect(lt({ n: -1, d: 1 }, e.onset)).toBe(true);
        });
      }
    }
  });
});

describe('readers with random bytes', () => {
  const outcome = (read: () => unknown): 'ok' | 'import-error' => {
    try {
      read();
      return 'ok';
    } catch (err) {
      if (err instanceof ImportError) return 'import-error';
      throw err;
    }
  };

  it('parseMidi: damaged versions of a real file give notes or an ImportError, nothing else', () => {
    const good = exportMidi(demoScore());
    for (let seed = 1; seed <= 300; seed++) {
      const r = random(seed);
      const bytes = good.slice(0, r() < 0.3 ? Math.floor(r() * good.length) : good.length);
      for (let k = 0; k < 1 + Math.floor(r() * 6); k++) bytes[Math.floor(r() * bytes.length)] = Math.floor(r() * 256);
      expect(['ok', 'import-error']).toContain(outcome(() => parseMidi(bytes, 'x.mid')));
    }
  });

  it('parseMidi: pure noise gives an ImportError', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = random(seed);
      const bytes = Uint8Array.from({ length: Math.floor(r() * 200) }, () => Math.floor(r() * 256));
      expect(outcome(() => parseMidi(bytes))).toBe('import-error');
    }
  });

  it('decodePcm: noise after a WAV or AIFF header gives samples, an ImportError or null', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = random(seed);
      const head = [...(seed % 2 ? 'RIFF....WAVE' : 'FORM....AIFF')].map((c) => c.charCodeAt(0));
      const bytes = Uint8Array.from([...head, ...Array.from({ length: Math.floor(r() * 120) }, () => Math.floor(r() * 256))]);
      expect(['ok', 'import-error']).toContain(outcome(() => decodePcm(bytes)));
    }
  });
});

describe('readers with plausible but wrong headers', () => {
  const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u32le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
  const u32be = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  const ascii = (t: string) => [...t].map((c) => c.charCodeAt(0));

  it('decodePcm never throws anything but an ImportError', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const r = random(seed);
      const pick = <T,>(list: T[]): T => list[Math.floor(r() * list.length)]!;
      const body = Array.from({ length: Math.floor(r() * 64) }, () => Math.floor(r() * 256));
      const bits = pick([0, 8, 12, 16, 24, 32, 64]);
      const channels = pick([0, 1, 2, 3]);
      const claimed = pick([0, 4, body.length, body.length + 1000, 0xffffffff]);
      const bytes =
        seed % 2
          ? Uint8Array.from([...ascii('RIFF'), ...u32le(0), ...ascii('WAVE'), ...ascii('fmt '), ...u32le(16), ...u16le(pick([0, 1, 3, 85, 0xfffe])), ...u16le(channels), ...u32le(pick([0, 8000, 44100])), ...u32le(0), ...u16le(0), ...u16le(bits), ...ascii('data'), ...u32le(claimed), ...body])
          : Uint8Array.from([...ascii('FORM'), ...u32be(0), ...ascii(pick(['AIFF', 'AIFC'])), ...ascii('COMM'), ...u32be(18), ...u16be(channels), ...u32be(pick([0, 3, 1000])), ...u16be(bits), ...u16be(pick([0, 0x400e, 0x7fff])), ...u32be(r() * 0xffffffff), ...u32be(r() * 0xffffffff), ...ascii('SSND'), ...u32be(claimed), ...u32be(pick([0, 4, 5000])), ...u32be(0), ...body]);
      try {
        const s = decodePcm(bytes);
        expect(s === null || Number.isFinite(s.rate)).toBe(true);
      } catch (err) {
        expect(err, `seed ${seed}`).toBeInstanceOf(ImportError);
      }
    }
  });
});
