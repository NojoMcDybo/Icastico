/**
 * Instrument sounds from a SoundFont, played by SpessaSynth in an AudioWorklet (ADR 0015).
 *
 * The score's playback plan becomes timed MIDI messages (`midiPlan.ts`); they are sent a
 * little ahead of time with exact audio-clock stamps, so stopping simply stops sending.
 * Glides use pitch bend on a channel of their own – the sampled instrument bends smoothly.
 */
import { WorkletSynthesizer } from 'spessasynth_lib';
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url';
import { INSTRUMENTS, type InstrumentId } from '../core/instruments';
import type { PlaybackPlan } from '../core/playback';
import type { Engine, Playing } from './engine';
import { AUDITION_CHANNEL, BEND_CENTER, type MidiAction, midiActions } from './midiPlan';

const AUDITION_VELOCITY = 100;
const AUDITION_MS = 700;

/** MuseScore_General (MIT license), fetched by `npm run sounds` into public/sounds. */
const SOUNDBANK_URL = `${import.meta.env.BASE_URL}sounds/MuseScore_General.sf3`;
/** How far ahead (seconds) messages are handed to the synthesizer. */
const LOOKAHEAD = 1.2;
const PUMP_INTERVAL = 100;
/** MIDI controller 11: the loudness of a channel. */
const EXPRESSION = 11 as Parameters<WorkletSynthesizer['controllerChange']>[1];
/** The music starts this much after "play" so the first messages arrive in time. */
const LEAD_IN = 0.15;

const PROGRAMS = Object.fromEntries(Object.values(INSTRUMENTS).map((i) => [i.id, i.midiProgram])) as Record<InstrumentId, number>;

interface Loaded {
  readonly ctx: AudioContext;
  readonly synth: WorkletSynthesizer;
  readonly meter: AnalyserNode;
  /** Everything the synthesizer plays goes through here; muted while old, already queued notes run out after a stop. */
  readonly master: GainNode;
}

/** MIDI controller 120: all sound off. */
const ALL_SOUND_OFF = 120 as Parameters<WorkletSynthesizer['controllerChange']>[1];

export class Sampler implements Engine {
  private loading: Promise<Loaded> | null = null;
  private loaded: Loaded | null = null;
  /** Audio-clock time until which messages of a stopped playback may still arrive in the synthesizer. */
  private drainUntil = 0;

  get isLoaded(): boolean {
    return this.loaded !== null;
  }

  /** Loads the synthesizer and the SoundFont once; a failure can be retried. */
  private load(): Promise<Loaded> {
    this.loading ??= (async () => {
      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule(processorUrl);
      const response = await fetch(SOUNDBANK_URL);
      if (!response.ok) throw new Error(`Die Klangdatei fehlt (${response.status}).`);
      const bank = await response.arrayBuffer();
      const synth = new WorkletSynthesizer(ctx);
      await synth.soundBankManager.addSoundBank(bank, 'main');
      await synth.isReady;
      const meter = ctx.createAnalyser();
      meter.fftSize = 4096;
      const master = ctx.createGain();
      synth.connect(master);
      master.connect(meter);
      meter.connect(ctx.destination);
      this.loaded = { ctx, synth, meter, master };
      return this.loaded;
    })().catch((err: unknown) => {
      this.loading = null;
      throw err;
    });
    return this.loading;
  }

  async play(plan: PlaybackPlan, from: number): Promise<Playing> {
    const { ctx, synth, master } = await this.load();
    if (ctx.state !== 'running') await ctx.resume();
    const actions = midiActions(plan, PROGRAMS);
    // A playback stopped a moment ago may still have messages on their way: start only after they are through.
    const origin = Math.max(ctx.currentTime + LEAD_IN, this.drainUntil) - from; // piece time 0 on the audio clock

    const send = (a: MidiAction): void => {
      const at = { time: Math.max(ctx.currentTime, origin + a.t) };
      switch (a.type) {
        case 'program':
          return synth.programChange(a.channel, a.value, at);
        case 'range':
          return synth.pitchWheelRange(a.channel, a.value, at);
        case 'bend':
          return synth.pitchWheel(a.channel, a.value, at);
        case 'expression':
          return synth.controllerChange(a.channel, EXPRESSION, a.value, at);
        case 'on':
          return synth.noteOn(a.channel, a.key, a.velocity, at);
        case 'off':
          return synth.noteOff(a.channel, a.key, at);
      }
    };
    let next = 0;
    const pump = (): void => {
      const horizon = ctx.currentTime - origin + LOOKAHEAD;
      while (next < actions.length && actions[next]!.t <= horizon) send(actions[next++]!);
    };
    pump();
    const timer = window.setInterval(pump, PUMP_INTERVAL);

    return {
      position: () => Math.max(0, ctx.currentTime - origin),
      stop: () => {
        window.clearInterval(timer);
        // The synthesizer cannot drop messages it already holds for the future (up to LOOKAHEAD seconds of notes):
        // silence it now, and when the last of them has arrived, switch everything off and reset the channels.
        const now = ctx.currentTime;
        const sent = next > 0 ? origin + actions[next - 1]!.t : now;
        const quiet = Math.max(now, sent) + 0.05;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(0, now);
        synth.stopAll(true);
        const at = { time: quiet };
        for (let channel = 0; channel < 16; channel++) {
          synth.controllerChange(channel, ALL_SOUND_OFF, 0, at);
          synth.pitchWheel(channel, BEND_CENTER, at);
          synth.controllerChange(channel, EXPRESSION, 127, at);
        }
        master.gain.setValueAtTime(1, quiet + 0.02);
        this.drainUntil = quiet + 0.05;
      },
    };
  }

  /** A short sound of these pitches – feedback while editing. Silent (but starts loading) while the sounds are not loaded yet. */
  async audition(midis: readonly number[], instrument: InstrumentId): Promise<void> {
    if (!this.loaded) {
      void this.load().catch(() => undefined);
      return;
    }
    const { ctx, synth } = this.loaded;
    if (ctx.state !== 'running') await ctx.resume();
    const channel = AUDITION_CHANNEL;
    // After a stop the synthesizer is silenced until its queued notes have run out: wait for that.
    const start = { time: Math.max(ctx.currentTime, this.drainUntil + 0.03) };
    synth.programChange(channel, PROGRAMS[instrument], start);
    for (const key of midis) synth.noteOn(channel, key, AUDITION_VELOCITY, start);
    const stop = { time: start.time + AUDITION_MS / 1000 };
    for (const key of midis) synth.noteOff(channel, key, stop);
  }

  /** The strongest frequency (Hz) the speakers are getting right now, 0 when silent. For checks and level display. */
  dominantHz(): number {
    const meter = this.loaded?.meter;
    if (!meter) return 0;
    const bins = new Float32Array(meter.frequencyBinCount);
    meter.getFloatFrequencyData(bins);
    let best = 0;
    for (let i = 1; i < bins.length; i++) if (bins[i]! > bins[best]!) best = i;
    return bins[best]! > -70 ? (best * this.loaded!.ctx.sampleRate) / meter.fftSize : 0;
  }
}
