/**
 * The fallback sound (ADR 0015): a small synthesizer on the Web Audio API that needs no files.
 * Used when the instrument sounds cannot be loaded. A glide is a pitch ramp inside one sound.
 */
import type { InstrumentId } from '../core/instruments';
import { DEFAULT_VOLUME } from '../core/curve';
import { type PlaybackPlan, type SoundNote, levelAt } from '../core/playback';
import type { Engine, Playing } from './engine';

interface Timbre {
  /** Strength of the harmonics 1, 2, 3 … */
  readonly harmonics: readonly number[];
  readonly attack: number;
  /** Time constant of the fall towards `sustain` (plucked sounds fall quickly). */
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
}

const TIMBRES: Record<InstrumentId, Timbre> = {
  voice: { harmonics: [1, 0.4, 0.25, 0.1], attack: 0.06, decay: 0.3, sustain: 0.8, release: 0.18 },
  guitar: { harmonics: [1, 0.7, 0.5, 0.3, 0.15, 0.08], attack: 0.004, decay: 0.5, sustain: 0.15, release: 0.12 },
  tab: { harmonics: [1, 0.7, 0.5, 0.3, 0.15, 0.08], attack: 0.004, decay: 0.5, sustain: 0.15, release: 0.12 },
  piano: { harmonics: [1, 0.55, 0.3, 0.18, 0.1, 0.05], attack: 0.004, decay: 0.9, sustain: 0.25, release: 0.25 },
};

/** The synthesizer sound of the piano roll: organ-like, the tone stays as loud as it started until the key is let go. */
const SUSTAINED: Timbre = { harmonics: [1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.12], attack: 0.008, decay: 1, sustain: 1, release: 0.06 };

const frequency = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export class SimpleSynth implements Engine {
  private ctx: AudioContext | null = null;
  private readonly waves = new Map<string, PeriodicWave>();

  /** A short sound of these pitches – feedback while editing. */
  audition(midis: readonly number[], instrument: InstrumentId, sustained: boolean): void {
    const notes = midis.map((midi): SoundNote => ({ instrument, start: 0, end: 0.4, path: [{ t: 0, midi }, { t: 0.4, midi }] }));
    void this.play({ notes, length: 0.4 }, 0, sustained);
  }

  /** Starts the plan at `from` seconds (the plan is already cut there). Needs a user gesture the first time. `sustained`: the roll's synth sound. */
  async play(plan: PlaybackPlan, from: number, sustained = false): Promise<Playing> {
    const ctx = (this.ctx ??= new AudioContext());
    if (ctx.state !== 'running') await ctx.resume();
    const out = ctx.createGain();
    out.gain.value = 0.3;
    const limiter = ctx.createDynamicsCompressor();
    out.connect(limiter).connect(ctx.destination);

    const origin = ctx.currentTime + 0.08 - from; // piece time 0 on the audio clock
    const oscillators: OscillatorNode[] = [];
    for (const note of plan.notes) oscillators.push(this.schedule(ctx, out, note, origin, sustained));

    return {
      position: () => Math.max(0, ctx.currentTime - origin),
      stop: () => {
        const now = ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setTargetAtTime(0, now, 0.01);
        for (const o of oscillators) {
          try {
            o.stop(now + 0.1);
          } catch {
            // already finished
          }
        }
        window.setTimeout(() => out.disconnect(), 200);
      },
    };
  }

  private wave(ctx: AudioContext, instrument: InstrumentId, sustained: boolean): PeriodicWave {
    const key = sustained ? 'synth' : instrument;
    let wave = this.waves.get(key);
    if (!wave) {
      const imag = new Float32Array([0, ...(sustained ? SUSTAINED : TIMBRES[instrument]).harmonics]);
      wave = ctx.createPeriodicWave(new Float32Array(imag.length), imag);
      this.waves.set(key, wave);
    }
    return wave;
  }

  private schedule(ctx: AudioContext, out: AudioNode, note: SoundNote, origin: number, sustained: boolean): OscillatorNode {
    const timbre = sustained ? SUSTAINED : TIMBRES[note.instrument];
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.wave(ctx, note.instrument, sustained));
    // Exponential in Hz is linear in semitones: a glide sounds even.
    const first = note.path[0]!;
    osc.frequency.setValueAtTime(frequency(first.midi), origin + first.t);
    for (const p of note.path.slice(1)) osc.frequency.exponentialRampToValueAtTime(frequency(p.midi), origin + p.t);

    const start = origin + note.start;
    const end = Math.max(origin + note.end, start + timbre.attack);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    const peak = 0.5 * ((note.volume ?? DEFAULT_VOLUME) / DEFAULT_VOLUME);
    gain.gain.linearRampToValueAtTime(peak, start + timbre.attack);
    gain.gain.setTargetAtTime(peak * timbre.sustain, start + timbre.attack, timbre.decay);
    gain.gain.setTargetAtTime(0, end, timbre.release / 3);
    // The loudness curve of the sound (fades, crossfade through a glide) runs on a gain of its own.
    const levels = ctx.createGain();
    if (note.gain) {
      levels.gain.setValueAtTime(levelAt(note.gain, note.start), start);
      for (const p of note.gain) if (p.t > note.start) levels.gain.linearRampToValueAtTime(p.level, origin + p.t);
    }
    osc.connect(gain).connect(levels).connect(out);
    osc.start(start);
    osc.stop(end + timbre.release + 0.2);
    return osc;
  }
}
