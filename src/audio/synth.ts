/**
 * The sound the app uses: instrument sounds from the SoundFont (`Sampler`); if they cannot
 * be loaded, the small built-in synthesizer, with a note to the user. See ADR 0015.
 */
import type { InstrumentId } from '../core/instruments';
import type { PlaybackPlan } from '../core/playback';
import type { Engine, Playing } from './engine';
import { Sampler } from './sampler';
import { SimpleSynth } from './simpleSynth';

export class Synth implements Engine {
  private readonly sampler = new Sampler();
  private readonly simple = new SimpleSynth();
  private failed = false;
  /** The piano roll's synthesizer sound: notes are held at full level, nothing dies away. */
  sustained = false;

  /** `notice` shows short German messages (loading, fallback) in the status bar. */
  constructor(private readonly notice: (text: string) => void) {
    // Lets checks and tools read what is sounding (see Sampler.dominantHz).
    (globalThis as { __icasticoHz?: () => number }).__icasticoHz = () => this.sampler.dominantHz();
  }

  /** A short sound of these pitches, for feedback while editing. */
  audition(midis: readonly number[], instrument: InstrumentId): void {
    if (midis.length === 0) return;
    if (this.sustained || this.failed) this.simple.audition(midis, instrument, this.sustained);
    else void this.sampler.audition(midis, instrument).catch(() => undefined);
  }

  async play(plan: PlaybackPlan, from: number): Promise<Playing> {
    if (this.sustained) return this.simple.play(plan, from, true);
    if (!this.failed) {
      try {
        if (!this.sampler.isLoaded) this.notice('Instrumentenklänge werden geladen …');
        return await this.sampler.play(plan, from);
      } catch (err) {
        this.failed = true;
        const why = err instanceof Error ? err.message : String(err);
        this.notice(`Instrumentenklänge nicht verfügbar (${why}) – es klingt einfacher.`);
      }
    }
    return this.simple.play(plan, from);
  }
}
