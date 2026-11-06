import { describe, expect, it } from 'vitest';
import { midiOf } from '../pitch';
import { frac } from '../time';
import { analyseRecording, audioDefaults, estimateTempo, importRecording } from './audio';
import { findNotes, trackPitch } from './pitch';
import { ImportError } from './musicxml';
import { decodePcm, decodeAiff, decodeWav, type Samples } from './wav';

interface Tone {
  midi: number;
  start: number;
  end: number;
  /** Pitch wobble in semitones (vibrato depth), 5.5 Hz. */
  vibrato?: number;
  /** Loudness dips to this share in the middle 40 ms (a repeated note without a pause). */
  dip?: number;
}

const hz = (midi: number, cents = 0): number => 440 * 2 ** ((midi - 69 + cents / 100) / 12);

/** A sung or played line: three harmonics, soft edges. */
function render(tones: readonly Tone[], seconds: number, rate = 44100, cents = 0): Samples {
  const data = new Float32Array(Math.floor(seconds * rate));
  for (const t of tones) {
    let phase = 0;
    const from = Math.floor(t.start * rate);
    const to = Math.min(data.length, Math.floor(t.end * rate));
    for (let i = from; i < to; i++) {
      const time = i / rate;
      const f = hz(t.midi, cents) * 2 ** (((t.vibrato ?? 0) * Math.sin(2 * Math.PI * 5.5 * time)) / 12);
      phase += (2 * Math.PI * f) / rate;
      const edge = Math.min(1, (time - t.start) / 0.01, (t.end - time) / 0.01);
      const middle = (t.start + t.end) / 2;
      const dip = t.dip !== undefined && Math.abs(time - middle) < 0.02 ? t.dip : 1;
      data[i]! += 0.4 * edge * dip * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase));
    }
  }
  return { rate, data };
}

const pitches = (s: Samples) => findNotes(trackPitch(s)).notes.map((n) => n.midi);

describe('pitch tracking', () => {
  it('finds each note of a melody and when it begins and ends', () => {
    const tones = [60, 62, 64, 65, 67].map((midi, i) => ({ midi, start: 0.2 + i * 0.5, end: 0.2 + i * 0.5 + 0.45 }));
    const { notes } = findNotes(trackPitch(render(tones, 3)));
    expect(notes.map((n) => n.midi)).toEqual([60, 62, 64, 65, 67]);
    notes.forEach((n, i) => {
      expect(n.start).toBeCloseTo(tones[i]!.start, 1);
      expect(n.end).toBeCloseTo(tones[i]!.end, 1);
    });
  });

  it.each([48000, 22050, 16000])('works at %d Hz', (rate) => {
    expect(pitches(render([{ midi: 57, start: 0.1, end: 0.6 }, { midi: 69, start: 0.7, end: 1.2 }], 1.5, rate))).toEqual([57, 69]);
  });

  it('covers the range of singing and guitar', () => {
    const midis = [40, 45, 52, 60, 72, 81];
    expect(pitches(render(midis.map((midi, i) => ({ midi, start: 0.1 + i * 0.4, end: 0.45 + i * 0.4 })), 2.8))).toEqual(midis);
  });

  it('keeps one note through vibrato', () => {
    expect(pitches(render([{ midi: 64, start: 0.1, end: 1.4, vibrato: 0.4 }], 1.6))).toEqual([64]);
  });

  it('takes out a constant detuning', () => {
    const s = render([62, 64, 66].map((midi, i) => ({ midi, start: 0.1 + i * 0.5, end: 0.5 + i * 0.5 })), 2, 44100, -35);
    const { notes, tuning } = findNotes(trackPitch(s));
    expect(notes.map((n) => n.midi)).toEqual([62, 64, 66]);
    expect(tuning).toBeCloseTo(-0.35, 1);
  });

  it('separates the same note played twice, with a gap or only a dip in loudness', () => {
    expect(pitches(render([{ midi: 60, start: 0.1, end: 0.5 }, { midi: 60, start: 0.56, end: 1 }], 1.2))).toEqual([60, 60]);
    expect(pitches(render([{ midi: 60, start: 0.1, end: 1, dip: 0.05 }], 1.2))).toEqual([60, 60]);
  });

  it('gives no notes for silence, noise or a click', () => {
    const noise = new Float32Array(44100);
    let seed = 12345;
    for (let i = 0; i < noise.length; i++) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      noise[i] = (seed / 4294967296 - 0.5) * 0.6;
    }
    expect(pitches({ rate: 44100, data: new Float32Array(44100) })).toEqual([]);
    expect(pitches({ rate: 44100, data: noise })).toEqual([]);
    const click = new Float32Array(44100);
    click[20000] = 1;
    expect(pitches({ rate: 44100, data: click })).toEqual([]);
  });

  it('ignores a blip shorter than a note', () => {
    expect(pitches(render([{ midi: 60, start: 0.1, end: 0.5 }, { midi: 72, start: 0.55, end: 0.565 }], 1))).toEqual([60]);
  });
});

describe('estimateTempo', () => {
  // Half and double tempo fit the same starts equally well; the estimate may be either, the user can change it.
  const near = (found: number, bpm: number) => [bpm, bpm * 2, bpm / 2].some((c) => Math.abs(found - c) <= 2);
  it('finds the speed from the note starts', () => {
    for (const bpm of [80, 100, 120, 132]) {
      const starts = Array.from({ length: 24 }, (_, i) => ((i + Math.floor(i / 3)) * 0.5 * 60) / bpm + Math.sin(i * 7) * 0.008);
      expect(near(estimateTempo(starts), bpm), `${bpm}`).toBe(true);
    }
  });
  it('falls back to 100 with too little to go on', () => {
    expect(estimateTempo([0.3])).toBe(100);
  });
});

describe('importRecording', () => {
  it('turns a sung melody at 100 bpm into notes in bars', async () => {
    const midis = [60, 64, 67, 71, 72, 71, 67, 64];
    const beat = 0.6;
    const tones = midis.map((midi, i) => ({ midi, start: 0.05 + i * beat, end: 0.05 + i * beat + beat * 0.9 }));
    const found = await analyseRecording(render(tones, 5.5));
    expect(found.notes).toHaveLength(8);
    const choice = { ...audioDefaults(found), tempo: 100 };
    const { score, notes } = importRecording(found, choice, 'Aufnahme');
    const events = score.parts[0]!.voices[0]!.events;
    expect(events.map((e) => midiOf(e.tones[0]!.pitch))).toEqual(midis);
    expect(events.map((e) => e.onset)).toEqual(midis.map((_, i) => frac(i, 4)));
    expect(events.every((e) => e.duration.n === 1 && e.duration.d === 4)).toBe(true);
    expect(notes[0]).toMatch(/8 Töne/);
    expect(Math.abs(score.keys[0]!.fifths)).toBeLessThanOrEqual(1); // an arpeggio fits C and G major alike
  });

  it('refuses a recording without notes', async () => {
    const found = await analyseRecording({ rate: 44100, data: new Float32Array(44100) });
    expect(() => importRecording(found, audioDefaults(found), 'x')).toThrow(ImportError);
  });

  it('estimates the tempo itself when none is given', async () => {
    const tones = Array.from({ length: 12 }, (_, i) => ({ midi: 60 + (i % 4) * 2, start: 0.1 + i * 0.4, end: 0.1 + i * 0.4 + 0.34 }));
    const found = await analyseRecording(render(tones, 5.2));
    const bpm = audioDefaults(found).tempo;
    expect([75, 150].some((c) => Math.abs(bpm - c) <= 3)).toBe(true); // 0.4 s per note: quarters at 150 or eighths at 75
  });
});

// ── WAV and AIFF ──
const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u32le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const ascii = (t: string) => [...t].map((c) => c.charCodeAt(0));

function wav(rate: number, channels: number, frames: number[][], bits = 16, format = 1): Uint8Array {
  const body: number[] = [];
  for (const f of frames) {
    for (const v of f) {
      if (bits === 16) body.push(...u16le(Math.round(v * 32767) & 0xffff));
      else if (bits === 24) body.push(...u32le(Math.round(v * 8388607) & 0xffffff).slice(0, 3));
      else if (bits === 8) body.push(Math.round(v * 127) + 128);
    }
  }
  const fmt = [...u16le(format), ...u16le(channels), ...u32le(rate), ...u32le(rate * channels * (bits / 8)), ...u16le(channels * (bits / 8)), ...u16le(bits)];
  return Uint8Array.from([...ascii('RIFF'), ...u32le(4 + 8 + fmt.length + 8 + body.length), ...ascii('WAVE'), ...ascii('fmt '), ...u32le(fmt.length), ...fmt, ...ascii('data'), ...u32le(body.length), ...body]);
}

/** 80-bit extended float of an integer rate. */
function extended(rate: number): number[] {
  const exponent = Math.floor(Math.log2(rate));
  const mantissa = BigInt(rate) << BigInt(63 - exponent);
  const bytes: number[] = [];
  for (let i = 7; i >= 0; i--) bytes.push(Number((mantissa >> BigInt(i * 8)) & 0xffn));
  return [...u16be(16383 + exponent), ...bytes];
}

function aiff(rate: number, channels: number, frames: number[][]): Uint8Array {
  const body: number[] = [];
  for (const f of frames) for (const v of f) body.push(...u16be(Math.round(v * 32767) & 0xffff));
  const comm = [...u16be(channels), ...u32be(frames.length), ...u16be(16), ...extended(rate)];
  const ssnd = [...u32be(0), ...u32be(0), ...body];
  return Uint8Array.from([...ascii('FORM'), ...u32be(4 + 8 + comm.length + 8 + ssnd.length), ...ascii('AIFF'), ...ascii('COMM'), ...u32be(comm.length), ...comm, ...ascii('SSND'), ...u32be(ssnd.length), ...ssnd]);
}

describe('WAV and AIFF', () => {
  const frames = [[0.5, -0.5], [0.25, 0.25], [-1, 1], [0, 0]];
  const mono = [0, 0.25, 0, 0];

  it('reads 16-bit stereo WAV and mixes it down', () => {
    const s = decodeWav(wav(44100, 2, frames));
    expect(s.rate).toBe(44100);
    expect(Array.from(s.data).map((v) => Math.round(v * 100) / 100 + 0)).toEqual(mono);
  });

  it('reads 24-bit and 8-bit WAV', () => {
    expect(decodeWav(wav(48000, 1, [[0.5], [-0.25]], 24)).data[0]).toBeCloseTo(0.5, 3);
    expect(decodeWav(wav(8000, 1, [[0.5], [-0.5]], 8)).data[1]).toBeCloseTo(-0.5, 1);
  });

  it('reads 16-bit stereo AIFF with the rate in the 80-bit field', () => {
    const s = decodeAiff(aiff(44100, 2, frames));
    expect(s.rate).toBe(44100);
    expect(Array.from(s.data).map((v) => Math.round(v * 100) / 100 + 0)).toEqual(mono);
    expect(decodeAiff(aiff(48000, 1, [[0.1]])).rate).toBe(48000);
  });

  it('finds the format by the header and returns null for the rest', () => {
    expect(decodePcm(wav(44100, 1, [[0.1]]))?.rate).toBe(44100);
    expect(decodePcm(aiff(22050, 1, [[0.1]]))?.rate).toBe(22050);
    expect(decodePcm(Uint8Array.from(ascii('ID3\u0004 not a wav, rather an mp3 file')))).toBeNull();
  });

  it('refuses compressed or damaged files in plain words', () => {
    expect(() => decodeWav(wav(44100, 1, [[0.1]], 16, 85))).toThrow(/komprimiert/);
    expect(() => decodeWav(Uint8Array.from([...ascii('RIFF'), ...u32le(4), ...ascii('WAVE')]))).toThrow(/beschädigt/);
  });

  it('analyses a recording that comes from a WAV file', async () => {
    const synth = render([{ midi: 67, start: 0.1, end: 0.7 }, { midi: 71, start: 0.8, end: 1.4 }], 1.6);
    const file = wav(synth.rate, 1, Array.from(synth.data, (v) => [v]));
    const found = await analyseRecording(decodePcm(file)!);
    expect(found.notes.map((n) => n.midi)).toEqual([67, 71]);
  });
});
