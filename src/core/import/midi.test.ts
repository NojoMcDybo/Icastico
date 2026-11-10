import { describe, expect, it } from 'vitest';
import { demoScore } from '../demo';
import { exportMidi, varLength } from '../export/midi';
import { midiOf } from '../pitch';
import { frac } from '../time';
import { ImportError } from './musicxml';
import { guessInstrument, importMidi, midiDefaults, parseMidi } from './midi';

const ascii = (t: string) => [...t].map((c) => c.charCodeAt(0));
const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
/** A track from (delta ticks, bytes) pairs. */
const trk = (events: [number, number[]][]) => {
  const body = [...events.flatMap(([d, b]) => [...varLength(d), ...b]), 0, 0xff, 0x2f, 0];
  return [...ascii('MTrk'), ...u32(body.length), ...body];
};
const smf = (format: number, ppq: number, ...tracks: number[][]) => Uint8Array.from([...ascii('MThd'), ...u32(6), ...u16(format), ...u16(tracks.length), ...u16(ppq), ...tracks.flat()]);
const name = (t: string): number[] => [0xff, 0x03, t.length, ...ascii(t)];

describe('parseMidi', () => {
  it('reads tempo, meter, key, names and notes of a format 1 file', () => {
    const conductor = trk([
      [0, name('Mein Lied')],
      [0, [0xff, 0x51, 3, 0x07, 0xa1, 0x20]], // 120 bpm
      [0, [0xff, 0x58, 4, 3, 2, 24, 8]], // 3/4
      [0, [0xff, 0x59, 2, 0xfe, 0]], // two flats
    ]);
    const melody = trk([
      [0, name('Melodie')],
      [0, [0xc0, 24]],
      [0, [0x90, 62, 100]],
      [480, [0x80, 62, 0]],
      [0, [0x90, 64, 90]],
      [480, [0x90, 64, 0]], // note-on with velocity 0 = off
    ]);
    const file = parseMidi(smf(1, 480, conductor, melody), 'lied.mid');
    expect(file).toMatchObject({ tempo: 120, fifths: -2, title: 'lied', meter: [{ beats: 0, sig: { count: 3, unit: 4 } }] });
    expect(file.tracks).toHaveLength(1);
    expect(file.tracks[0]).toMatchObject({ name: 'Melodie', program: 24, drums: false });
    expect(file.tracks[0]!.notes).toEqual([
      { start: 0, end: 1, midi: 62, volume: 100 },
      { start: 1, end: 2, midi: 64, volume: 90 },
    ]);
  });

  it('understands running status', () => {
    const t = trk([
      [0, [0x90, 60, 80]],
      [0, [62, 80]], // no status byte: still note-on
      [240, [0x80, 60, 0]],
      [0, [62, 0]], // running status: note-off
    ]);
    const notes = parseMidi(smf(0, 240, t)).tracks[0]!.notes;
    expect(notes.map((n) => [n.midi, n.start, n.end])).toEqual([
      [60, 0, 1],
      [62, 0, 1],
    ]);
  });

  it('splits a format 0 file by channel and flags the drums', () => {
    const t = trk([
      [0, [0x90, 60, 80]],
      [0, [0x91, 48, 80]],
      [0, [0x99, 36, 100]],
      [480, [0x80, 60, 0]],
      [0, [0x81, 48, 0]],
      [0, [0x89, 36, 0]],
    ]);
    const file = parseMidi(smf(0, 480, t));
    expect(file.tracks.map((x) => [x.channel, x.drums])).toEqual([
      [0, false],
      [1, false],
      [9, true],
    ]);
    expect(midiDefaults(file).tracks).toHaveLength(2);
    expect(file.notes.join(' ')).toMatch(/Schlagzeug/);
  });

  it('closes notes that are never switched off at the end of the track', () => {
    const t = trk([
      [0, [0x90, 60, 80]],
      [960, [0xb0, 7, 100]],
    ]);
    expect(parseMidi(smf(0, 480, t)).tracks[0]!.notes[0]).toMatchObject({ start: 0, end: 2 });
  });

  it('rejects what is not a usable MIDI file', () => {
    expect(() => parseMidi(Uint8Array.from(ascii('<?xml version="1.0"?> not a midi file at all')))).toThrow(ImportError);
    expect(() => parseMidi(Uint8Array.from([...ascii('MThd'), ...u32(6), ...u16(1), ...u16(0), ...u16(0xe728)]))).toThrow(/SMPTE/);
    expect(() => parseMidi(Uint8Array.from([...ascii('MThd'), ...u32(6), ...u16(1), ...u16(0), ...u16(480)]))).toThrow(/keine Spuren/);
  });

  it('survives a file that is cut off', () => {
    const t = trk([
      [0, [0x90, 60, 80]],
      [480, [0x80, 60, 0]],
      [0, [0x90, 62, 80]],
    ]);
    const cut = smf(0, 480, t).slice(0, -6);
    const file = parseMidi(cut);
    expect(file.tracks[0]!.notes[0]).toMatchObject({ midi: 60, start: 0, end: 1 });
  });
});

describe('importMidi', () => {
  it('turns a Logic-like recording into a score: quantised, spelled for the key', () => {
    // C D E and B-flat in quarters, played a little loosely, F major signature given
    const events: [number, number[]][] = [[0, [0xff, 0x59, 2, 0xff, 0]]];
    const ticks = [0, 5, -10, 15];
    let t = 0;
    [60, 62, 64, 70].forEach((key, i) => {
      const on = i * 480 + ticks[i]! - 20 * (i % 2);
      events.push([Math.max(0, on - t), [0x90, key, 90]]);
      events.push([440, [0x80, key, 0]]);
      t = on + 440;
    });
    const file = parseMidi(smf(0, 480, trk(events)));
    const result = importMidi(file, midiDefaults(file));
    const evs = result.score.parts[0]!.voices[0]!.events;
    expect(evs.map((e) => e.onset)).toEqual([frac(0), frac(1, 4), frac(1, 2), frac(3, 4)]);
    expect(evs.map((e) => e.duration)).toEqual([frac(1, 4), frac(1, 4), frac(1, 4), frac(1, 4)]);
    expect(evs[3]!.tones[0]!.pitch).toMatchObject({ step: 'B', alter: -1 }); // key of F major
    expect(result.score.keys[0]!.fifths).toBe(-1);
  });

  it('reads back what Icastico writes', () => {
    const original = demoScore();
    const file = parseMidi(exportMidi(original), 'demo.mid');
    const result = importMidi(file, midiDefaults(file));
    const played = (s: typeof original) => s.parts.flatMap((p) => p.voices.flatMap((v) => v.events.flatMap((e) => e.tones.map((t) => midiOf(t.pitch)))));
    // every pitch of the demo comes back (the number of notes can differ where ties were joined)
    expect(new Set(played(result.score))).toEqual(new Set(played(original)));
    expect(result.score.tempo ?? 100).toBe(original.tempo ?? 100);
    expect(result.score.meter[0]!.sig).toEqual(original.meter[0]!.sig);
  });

  it('uses a meter the user chose instead of the one in the file', () => {
    const t = trk([
      [0, [0xff, 0x58, 4, 4, 2, 24, 8]],
      [0, [0x90, 60, 80]],
      [480, [0x80, 60, 0]],
    ]);
    const file = parseMidi(smf(0, 480, t));
    const result = importMidi(file, { ...midiDefaults(file), meter: { count: 6, unit: 8 } });
    expect(result.score.meter).toEqual([{ at: frac(0), sig: { count: 6, unit: 8 } }]);
  });

  it('takes over a meter change that falls on a bar line and drops one in the middle of a bar', () => {
    const t = trk([
      [0, [0xff, 0x58, 4, 4, 2, 24, 8]],
      [1920, [0xff, 0x58, 4, 3, 2, 24, 8]], // after one 4/4 bar: fine
      [480, [0xff, 0x58, 4, 6, 3, 24, 8]], // one beat into a 3/4 bar: not possible
      [0, [0x90, 60, 80]],
      [480, [0x80, 60, 0]],
    ]);
    const file = parseMidi(smf(0, 480, t));
    const result = importMidi(file, midiDefaults(file));
    expect(result.score.meter).toEqual([
      { at: frac(0), sig: { count: 4, unit: 4 } },
      { at: frac(1), sig: { count: 3, unit: 4 } },
    ]);
    expect(result.notes.join(' ')).toMatch(/mitten im Takt/);
  });

  it('refuses a file without usable tracks', () => {
    const file = parseMidi(smf(0, 480, trk([[0, [0xff, 0x51, 3, 0x07, 0xa1, 0x20]]])));
    expect(() => importMidi(file, midiDefaults(file))).toThrow(/keine Töne/);
  });
});

describe('guessInstrument', () => {
  const notes = (midis: number[]) => midis.map((m, i) => ({ start: i, end: i + 1, midi: m }));
  it('goes by the name and the program first', () => {
    expect(guessInstrument({ name: 'Acoustic Guitar', notes: [] })).toBe('guitar');
    expect(guessInstrument({ name: 'Spur 3', program: 25, notes: [] })).toBe('guitar');
    expect(guessInstrument({ name: 'Piano', notes: [] })).toBe('piano');
    expect(guessInstrument({ name: 'Lead Vocal', notes: [] })).toBe('voice');
  });
  it('knows the strings, basses and winds by name and program (ADR 0038)', () => {
    expect(guessInstrument({ name: 'Violin I', notes: [] })).toBe('violin');
    expect(guessInstrument({ name: 'Spur 2', program: 41, notes: [] })).toBe('viola');
    expect(guessInstrument({ name: 'Cello', notes: [] })).toBe('cello');
    expect(guessInstrument({ name: 'Kontrabass', notes: [] })).toBe('contrabass');
    expect(guessInstrument({ name: 'Bass', notes: [] })).toBe('ebass');
    expect(guessInstrument({ name: 'Spur 4', program: 33, notes: [] })).toBe('ebass');
    expect(guessInstrument({ name: 'Blockflöte', notes: [] })).toBe('recorder');
    expect(guessInstrument({ name: 'Flute', notes: [] })).toBe('flute');
    expect(guessInstrument({ name: 'Spur 5', program: 68, notes: [] })).toBe('oboe');
    expect(guessInstrument({ name: 'Fagott', notes: [] })).toBe('bassoon');
  });
  it('then by the notes', () => {
    expect(guessInstrument({ name: 'Spur 1', notes: notes([60, 62, 64, 62, 60]) })).toBe('voice');
    expect(guessInstrument({ name: 'Spur 1', notes: notes([36, 60, 84]) })).toBe('piano');
  });
});
