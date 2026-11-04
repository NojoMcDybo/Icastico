/**
 * Runs the playback: asks the synth to play a plan, follows the clock and tells the
 * workstation where the music is, until it ends (or loops) or the user stops it.
 */
import type { Score } from '../core/model';
import { type PlaybackPlan, planFrom, planPlayback } from '../core/playback';
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
  private raf = 0;
  /** Guards against a second start while the first is still waiting for the audio device. */
  private starting = false;

  constructor(
    private readonly events: PlayerEvents,
    private readonly synth: Synth = new Synth((message) => events.notice(message)),
  ) {}

  get active(): boolean {
    return this.playing !== null || this.starting;
  }

  async start(score: Score, fromSeconds: number, loop: boolean): Promise<void> {
    if (this.active) return;
    this.starting = true;
    this.loop = loop;
    this.plan = planPlayback(score);
    try {
      if (this.plan.length === 0) throw new Error('Es gibt noch nichts zu hören – erst Noten eingeben.');
      const from = fromSeconds >= this.plan.length ? 0 : fromSeconds;
      this.playing = await this.synth.play(planFrom(this.plan, from), from);
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
    if (!this.playing) return;
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
    if (seconds >= plan.length + TAIL) {
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
    try {
      this.playing = await this.synth.play(plan, 0);
      this.tick();
    } catch (err) {
      this.events.error(err instanceof Error ? err.message : String(err));
      this.events.stopped();
    }
  }
}
