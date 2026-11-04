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
import { BEND_CENTER, type MidiAction, midiActions } from './midiPlan';

/** MuseScore_General (MIT license), fetched by `npm run sounds` into public/sounds. */
const SOUNDBANK_URL = `${import.meta.env.BASE_URL}sounds/MuseScore_General.sf3`;
/** How far ahead (seconds) messages are handed to the synthesizer. */
const LOOKAHEAD = 1.2;
const PUMP_INTERVAL = 100;
/** The music starts this much after "play" so the first messages arrive in time. */
const LEAD_IN = 0.15;

const PROGRAMS = Object.fromEntries(Object.values(INSTRUMENTS).map((i) => [i.id, i.midiProgram])) as Record<InstrumentId, number>;

interface Loaded {
  readonly ctx: AudioContext;
  readonly synth: WorkletSynthesizer;
  readonly meter: AnalyserNode;
}

export class Sampler implements Engine {
  private loading: Promise<Loaded> | null = null;
  private loaded: Loaded | null = null;

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
      synth.connect(meter);
      meter.connect(ctx.destination);
      this.loaded = { ctx, synth, meter };
      return this.loaded;
    })().catch((err: unknown) => {
      this.loading = null;
      throw err;
    });
    return this.loading;
  }

  async play(plan: PlaybackPlan, from: number): Promise<Playing> {
    const { ctx, synth } = await this.load();
    if (ctx.state !== 'running') await ctx.resume();
    const actions = midiActions(plan, PROGRAMS);
    const origin = ctx.currentTime + LEAD_IN - from; // piece time 0 on the audio clock

    const send = (a: MidiAction): void => {
      const at = { time: Math.max(ctx.currentTime, origin + a.t) };
      switch (a.type) {
        case 'program':
          return synth.programChange(a.channel, a.value, at);
        case 'range':
          return synth.pitchWheelRange(a.channel, a.value, at);
        case 'bend':
          return synth.pitchWheel(a.channel, a.value, at);
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
        synth.stopAll(true);
        for (let channel = 0; channel < 16; channel++) synth.pitchWheel(channel, BEND_CENTER);
      },
    };
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
