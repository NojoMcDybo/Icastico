/**
 * Runs the playback: asks the synth to play a plan, follows the clock and tells the
 * workstation where the music is, until it ends (or loops) or the user stops it.
 */
import type { Score } from '../core/model';
import { type PlaybackPlan, planFrom, planPlayback, planUntil } from '../core/playback';
import type { Playing } from '../audio/engine';
import { Synth } from '../audio/synth';

export interface PlayerEvents {
  /** Called every animation frame while playing, with the seconds into the piece. */
  frame(seconds: number): void;
  /** Playback ended or was stopped. */
  stopped(): void;
  error(message: string): void;
  /** Short status messages, e.g. while the instrument sounds load. */
  notice(message: string): void;
}

/** A little silence after the last note before the piece counts as finished (lets the release ring out). */
const TAIL = 0.3;

export class Player {
  private playing: Playing | null = null;
  private plan: PlaybackPlan | null = null;
  private loop = false;
  /** Looping just a passage: from / to in seconds. */
  private range: { readonly from: number; readonly to: number } | null = null;
  private raf = 0;
  /** Guards against a second start while the first is still waiting for the audio device. */
  private starting = false;
  /** A stop that arrived while the sound was still being started. */
  private cancelled = false;

  constructor(
    private readonly events: PlayerEvents,
    private readonly synth: Synth = new Synth((message) => events.notice(message)),
  ) {}

  get active(): boolean {
    return this.playing !== null || this.starting;
  }

  /** `range`: only this passage (seconds) is played – over and over if `loop`. */
  async start(score: Score, fromSeconds: number, loop: boolean, range?: { readonly from: number; readonly to: number }): Promise<void> {
    if (this.active) return;
    this.starting = true;
    this.cancelled = false;
    this.loop = loop;
    this.range = range ?? null;
    this.plan = range ? planUntil(planPlayback(score), range.to) : planPlayback(score);
    try {
      if (this.plan.length === 0) throw new Error('Es gibt noch nichts zu hören – erst Noten eingeben.');
      const from = range ? range.from : fromSeconds >= this.plan.length ? 0 : fromSeconds;
      const playing = await this.synth.play(planFrom(this.plan, from), from);
      if (this.cancelled) return playing.stop(); // stopped while the sounds were loading
      this.playing = playing;
      this.tick();
    } catch (err) {
      this.events.error(err instanceof Error ? err.message : String(err));
      this.events.stopped();
    } finally {
      this.starting = false;
    }
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  stop(): void {
    if (!this.playing) {
      if (this.starting) {
        this.cancelled = true;
        this.events.stopped();
      }
      return;
    }
    this.playing.stop();
    this.playing = null;
    cancelAnimationFrame(this.raf);
    this.events.stopped();
  }

  private tick = (): void => {
    const playing = this.playing;
    const plan = this.plan;
    if (!playing || !plan) return;
    const seconds = playing.position();
    if (seconds >= plan.length + (this.range ? 0.05 : TAIL)) {
      if (this.loop) {
        playing.stop();
        void this.restart(plan);
        return;
      }
      this.stop();
      return;
    }
    this.events.frame(seconds);
    this.raf = requestAnimationFrame(this.tick);
  };

  private async restart(plan: PlaybackPlan): Promise<void> {
    this.playing = null;
    this.starting = true;
    this.cancelled = false;
    try {
      const startAt = this.range?.from ?? 0;
      const playing = await this.synth.play(planFrom(plan, startAt), startAt);
      if (this.cancelled) return playing.stop();
      this.playing = playing;
      this.tick();
    } catch (err) {
      this.events.error(err instanceof Error ? err.message : String(err));
      this.events.stopped();
    } finally {
      this.starting = false;
    }
  }
}
