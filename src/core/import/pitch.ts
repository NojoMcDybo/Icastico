/**
 * Single-voice pitch tracking and note finding (ADR 0028).
 *
 * The pitch of every 10 ms is found with the YIN method (de Cheveigné & Kawahara, 2002): the signal is compared
 * with a delayed copy of itself, the first clear dip tells the period. From the track of pitches, notes are cut:
 * the pitch is rounded to semitones (after taking out a constant detuning), smoothed, short blips are dropped,
 * and a dip in loudness inside a held pitch is read as a new attack.
 * Works for one voice or instrument at a time; chords and noise do not give notes.
 */
import { type Samples } from './wav';

export const HOP_SECONDS = 0.01;

export interface PitchFrame {
  /** Hz, 0 = silence or no clear pitch. */
  readonly hz: number;
  /** Loudness of the frame (RMS). */
  readonly level: number;
}

export interface FoundNote {
  /** Seconds. */
  readonly start: number;
  readonly end: number;
  readonly midi: number;
}

const THRESHOLD = 0.15;
/** Above this the best dip is not clear enough to call the frame pitched. */
const GIVE_UP = 0.4;

/** Reduces the sample rate to about 11 kHz by averaging (enough for pitches up to ~1 kHz, and fast). */
function decimate(samples: Samples): Samples {
  const factor = Math.max(1, Math.floor(samples.rate / 11025));
  if (factor === 1) return samples;
  const out = new Float32Array(Math.floor(samples.data.length / factor));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let k = 0; k < factor; k++) sum += samples.data[i * factor + k]!;
    out[i] = sum / factor;
  }
  return { rate: samples.rate / factor, data: out };
}

export class PitchTracker {
  readonly frames: number;
  private readonly x: Float32Array;
  private readonly rate: number;
  private readonly hop: number;
  private readonly window: number;
  private readonly tauMin: number;
  private readonly tauMax: number;
  private readonly d: Float32Array;
  private readonly cmnd: Float32Array;
  private peak = 0;

  constructor(samples: Samples, minHz = 70, maxHz = 1100) {
    const s = decimate(samples);
    this.x = s.data;
    this.rate = s.rate;
    this.hop = Math.max(1, Math.round(HOP_SECONDS * s.rate));
    this.tauMin = Math.max(2, Math.floor(s.rate / maxHz));
    this.tauMax = Math.ceil(s.rate / minHz);
    this.window = Math.ceil(s.rate * 0.04);
    this.d = new Float32Array(this.tauMax + 1);
    this.cmnd = new Float32Array(this.tauMax + 1);
    this.frames = Math.floor(this.x.length / this.hop);
  }

  /** The pitch and loudness of frame `i` (its centre is at i · 10 ms). */
  frame(i: number): PitchFrame {
    const { x, window: w, tauMax, tauMin, d, cmnd } = this;
    const start = i * this.hop - Math.floor((w + tauMax) / 2);
    const at = (j: number): number => (j >= 0 && j < x.length ? x[j]! : 0);
    let energy = 0;
    for (let j = 0; j < w; j++) energy += at(start + j) ** 2;
    const level = Math.sqrt(energy / w);
    this.peak = Math.max(this.peak, level);
    if (level < 1e-4) return { hz: 0, level };

    // Copy the stretch once so the inner loops need no bounds checks.
    const len = w + tauMax;
    const seg = new Float32Array(len);
    for (let j = 0; j < len; j++) seg[j] = at(start + j);
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let j = 0; j < w; j++) {
        const diff = seg[j]! - seg[j + tau]!;
        sum += diff * diff;
      }
      d[tau] = sum;
    }
    cmnd[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += d[tau]!;
      cmnd[tau] = running === 0 ? 1 : (d[tau]! * tau) / running;
    }
    let best = -1;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cmnd[tau]! < THRESHOLD) {
        while (tau + 1 <= tauMax && cmnd[tau + 1]! < cmnd[tau]!) tau++;
        best = tau;
        break;
      }
    }
    if (best < 0) {
      let low = tauMin;
      for (let tau = tauMin; tau <= tauMax; tau++) if (cmnd[tau]! < cmnd[low]!) low = tau;
      if (cmnd[low]! > GIVE_UP) return { hz: 0, level };
      best = low;
    }
    let tau = best;
    if (best > 1 && best < tauMax) {
      const a = cmnd[best - 1]!;
      const b = cmnd[best]!;
      const c = cmnd[best + 1]!;
      const denominator = a - 2 * b + c;
      if (denominator !== 0) tau = best + (a - c) / (2 * denominator);
    }
    return { hz: this.rate / tau, level };
  }

  /** Loudest frame seen so far (the whole file once every frame has been asked for). */
  get loudest(): number {
    return this.peak;
  }
}

/** All frames of a recording. For long recordings the UI asks `frame` piece by piece instead and stays responsive. */
export function trackPitch(samples: Samples): PitchFrame[] {
  const tracker = new PitchTracker(samples);
  return Array.from({ length: tracker.frames }, (_, i) => tracker.frame(i));
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

const MIN_NOTE_FRAMES = 5;
const MAX_GAP_FRAMES = 3;
/** Frames below this share of the loudest one count as silence. */
const SILENCE = 0.03;

/** Cuts the pitch track into notes. `tuning` (semitones, −0.5 … 0.5) is the detuning that was taken out. */
export function findNotes(frames: readonly PitchFrame[]): { notes: FoundNote[]; tuning: number } {
  const loudest = frames.reduce((m, f) => Math.max(m, f.level), 0);
  const raw = frames.map((f) => (f.hz > 0 && f.level >= SILENCE * loudest ? 69 + 12 * Math.log2(f.hz / 440) : Number.NaN));

  // Median of five voiced neighbours takes out single wrong frames.
  const smooth = raw.map((v, i) => {
    if (Number.isNaN(v)) return v;
    const near: number[] = [];
    for (let k = Math.max(0, i - 2); k <= Math.min(raw.length - 1, i + 2); k++) if (!Number.isNaN(raw[k]!)) near.push(raw[k]!);
    return median(near);
  });

  // A constant detuning (a singer a quarter tone flat all evening) is taken out before rounding.
  const offsets = smooth.filter((v) => !Number.isNaN(v)).map((v) => v - Math.round(v));
  const tuning = Math.max(-0.5, Math.min(0.5, median(offsets)));
  const label = smooth.map((v) => (Number.isNaN(v) ? Number.NaN : Math.round(v - tuning)));

  // Mode filter (nine frames) calms a pitch that wobbles around a boundary (vibrato).
  const calm = label.map((current, i) => {
    if (Number.isNaN(current)) return current;
    const counts = new Map<number, number>();
    for (let k = Math.max(0, i - 4); k <= Math.min(label.length - 1, i + 4); k++) if (!Number.isNaN(label[k]!)) counts.set(label[k]!, (counts.get(label[k]!) ?? 0) + 1);
    let pick = current;
    let most = counts.get(current) ?? 0;
    for (const [value, n] of counts) if (n > most) [pick, most] = [value, n];
    return pick;
  });

  // Runs of one pitch; a short unvoiced gap inside does not end a note.
  type Run = { from: number; to: number; midi: number };
  const runs: Run[] = [];
  for (let i = 0; i < calm.length; i++) {
    const v = calm[i]!;
    if (Number.isNaN(v)) continue;
    const last = runs[runs.length - 1];
    if (last && last.midi === v && i - last.to - 1 <= MAX_GAP_FRAMES) last.to = i;
    else runs.push({ from: i, to: i, midi: v });
  }

  // A held pitch with a clear dip in loudness is two notes.
  const split: Run[] = [];
  for (const run of runs) {
    let from = run.from;
    for (let i = run.from + 4; i <= run.to - 4; i++) {
      const level = frames[i]!.level;
      let left = 0;
      for (let k = from; k < i; k++) left = Math.max(left, frames[k]!.level);
      let right = 0;
      for (let k = i + 1; k <= run.to; k++) right = Math.max(right, frames[k]!.level);
      const isLow = level < 0.45 * Math.min(left, right) && level <= frames[i - 1]!.level && level <= frames[i + 1]!.level;
      if (isLow && i - from >= MIN_NOTE_FRAMES && run.to - i >= MIN_NOTE_FRAMES) {
        split.push({ from, to: i - 1, midi: run.midi });
        from = i;
      }
    }
    split.push({ from, to: run.to, midi: run.midi });
  }

  const notes = split
    .filter((r) => r.to - r.from + 1 >= MIN_NOTE_FRAMES)
    .map((r) => ({ start: Math.max(0, (r.from - 0.5) * HOP_SECONDS), end: (r.to + 0.5) * HOP_SECONDS, midi: r.midi }));
  return { notes, tuning };
}
