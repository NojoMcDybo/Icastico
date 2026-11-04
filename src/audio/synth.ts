/**
 * The sound the app uses: instrument sounds from the SoundFont (`Sampler`); if they cannot
 * be loaded, the small built-in synthesizer, with a note to the user. See ADR 0015.
 */
import type { PlaybackPlan } from '../core/playback';
import type { Engine, Playing } from './engine';
import { Sampler } from './sampler';
import { SimpleSynth } from './simpleSynth';

export class Synth implements Engine {
  private readonly sampler = new Sampler();
  private readonly simple = new SimpleSynth();
  private failed = false;

  /** `notice` shows short German messages (loading, fallback) in the status bar. */
  constructor(private readonly notice: (text: string) => void) {
    // Lets checks and tools read what is sounding (see Sampler.dominantHz).
    (globalThis as { __icasticoHz?: () => number }).__icasticoHz = () => this.sampler.dominantHz();
  }

  async play(plan: PlaybackPlan, from: number): Promise<Playing> {
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
