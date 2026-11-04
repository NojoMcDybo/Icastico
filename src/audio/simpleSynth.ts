/**
 * The fallback sound (ADR 0015): a small synthesizer on the Web Audio API that needs no files.
 * Used when the instrument sounds cannot be loaded. A glide is a pitch ramp inside one sound.
 */
import type { InstrumentId } from '../core/instruments';
import { type PlaybackPlan, type SoundNote } from '../core/playback';
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
  piano: { harmonics: [1, 0.55, 0.3, 0.18, 0.1, 0.05], attack: 0.004, decay: 0.9, sustain: 0.25, release: 0.25 },
};

const frequency = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export class SimpleSynth implements Engine {
  private ctx: AudioContext | null = null;
  private readonly waves = new Map<InstrumentId, PeriodicWave>();

  /** Starts the plan at `from` seconds (the plan is already cut there). Needs a user gesture the first time. */
  async play(plan: PlaybackPlan, from: number): Promise<Playing> {
    const ctx = (this.ctx ??= new AudioContext());
    if (ctx.state !== 'running') await ctx.resume();
    const out = ctx.createGain();
    out.gain.value = 0.3;
    const limiter = ctx.createDynamicsCompressor();
    out.connect(limiter).connect(ctx.destination);

    const origin = ctx.currentTime + 0.08 - from; // piece time 0 on the audio clock
    const oscillators: OscillatorNode[] = [];
    for (const note of plan.notes) oscillators.push(this.schedule(ctx, out, note, origin));

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

  private wave(ctx: AudioContext, instrument: InstrumentId): PeriodicWave {
    let wave = this.waves.get(instrument);
    if (!wave) {
      const imag = new Float32Array([0, ...TIMBRES[instrument].harmonics]);
      wave = ctx.createPeriodicWave(new Float32Array(imag.length), imag);
      this.waves.set(instrument, wave);
    }
    return wave;
  }

  private schedule(ctx: AudioContext, out: AudioNode, note: SoundNote, origin: number): OscillatorNode {
    const timbre = TIMBRES[note.instrument];
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.wave(ctx, note.instrument));
    // Exponential in Hz is linear in semitones: a glide sounds even.
    const first = note.path[0]!;
    osc.frequency.setValueAtTime(frequency(first.midi), origin + first.t);
    for (const p of note.path.slice(1)) osc.frequency.exponentialRampToValueAtTime(frequency(p.midi), origin + p.t);

    const start = origin + note.start;
    const end = Math.max(origin + note.end, start + timbre.attack);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.5, start + timbre.attack);
    gain.gain.setTargetAtTime(0.5 * timbre.sustain, start + timbre.attack, timbre.decay);
    gain.gain.setTargetAtTime(0, end, timbre.release / 3);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(end + timbre.release + 0.2);
    return osc;
  }
}
