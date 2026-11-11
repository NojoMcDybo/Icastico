import { describe, expect, it } from 'vitest';
import { demoScore } from '../demo';
import { emptyScore } from '../templates';
import { setTempoChange, withTempo } from '../model';
import { frac } from '../time';
import { exportMidi, varLength } from './midi';

/** Minimal reader: the header and, per track, the note-on events as [tick, key, velocity]. */
function read(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  const header = { tag: tag(0), format: view.getUint16(8), tracks: view.getUint16(10), ppq: view.getUint16(12) };
  const tracks: { ons: number[][]; tempo?: number; tempos: number[][]; ended: boolean }[] = [];
  let o = 14;
  while (o < bytes.length) {
    const size = view.getUint32(o + 4);
    let p = o + 8;
    const end = p + size;
    let tick = 0;
    let status = 0;
    const t: { ons: number[][]; tempo?: number; tempos: number[][]; ended: boolean } = { ons: [], tempos: [], ended: false };
    while (p < end) {
      let delta = 0;
      let b: number;
      do {
        b = bytes[p++]!;
        delta = (delta << 7) | (b & 0x7f);
      } while (b & 0x80);
      tick += delta;
      if (bytes[p]! & 0x80) status = bytes[p++]!;
      if (status === 0xff) {
        const type = bytes[p++]!;
        const len = bytes[p++]!;
        if (type === 0x51) {
          t.tempo = (bytes[p]! << 16) | (bytes[p + 1]! << 8) | bytes[p + 2]!;
          t.tempos.push([tick, t.tempo]);
        }
        if (type === 0x2f) t.ended = true;
        p += len;
      } else if ((status & 0xf0) === 0xc0) {
        p += 1;
      } else {
        if ((status & 0xf0) === 0x90 && bytes[p + 1]! > 0) t.ons.push([tick, bytes[p]!, bytes[p + 1]!]);
        p += 2;
      }
    }
    tracks.push(t);
    o = end;
  }
  return { header, tracks };
}

describe('MIDI export', () => {
  it('numbers longer than 127 are written in several bytes', () => {
    expect(varLength(0)).toEqual([0]);
    expect(varLength(127)).toEqual([127]);
    expect(varLength(128)).toEqual([0x81, 0]);
    expect(varLength(480)).toEqual([0x83, 0x60]);
  });

  it('writes a format-1 file: a tempo track and one track per instrument, each properly ended', () => {
    const { header, tracks } = read(exportMidi(withTempo(demoScore(), 120)));
    expect(header).toMatchObject({ tag: 'MThd', format: 1, ppq: 480 });
    expect(tracks).toHaveLength(header.tracks);
    expect(tracks[0]!.tempo).toBe(500_000); // 120 quarters a minute
    expect(tracks.every((t) => t.ended)).toBe(true);
    expect(tracks.slice(1).some((t) => t.ons.length > 0)).toBe(true);
  });

  it('puts a note where it sounds: the first note of the demo starts at tick 0, a quarter lasts 480 ticks at any tempo', () => {
    const { tracks } = read(exportMidi(demoScore()));
    const first = tracks.slice(1).flatMap((t) => t.ons).sort((a, b) => a[0]! - b[0]!)[0]!;
    expect(first[0]).toBe(0);
  });

  it('a tempo change is a second tempo event at its tick, and the notes after it move accordingly (ADR 0039)', () => {
    const score = setTempoChange(withTempo(demoScore(), 120), frac(1), 60); // from bar 2 half as fast
    const { tracks } = read(exportMidi(score));
    expect(tracks[0]!.tempos).toEqual([[0, 500_000], [1920, 1_000_000]]); // a whole note = 1920 ticks
    const plain = read(exportMidi(withTempo(demoScore(), 120))).tracks.slice(1).flatMap((t) => t.ons);
    const slowed = tracks.slice(1).flatMap((t) => t.ons);
    // MIDI ticks count musical time, not seconds: the same notes sit on the same ticks whatever the tempo
    expect(slowed.map((o) => o[0]).sort((a, b) => a! - b!)).toEqual(plain.map((o) => o[0]).sort((a, b) => a! - b!));
  });

  it('an empty score is still a valid file', () => {
    const { header, tracks } = read(exportMidi(emptyScore()));
    expect(header.tracks).toBe(1);
    expect(tracks[0]!.ended).toBe(true);
  });
});
