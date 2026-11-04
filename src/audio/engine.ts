import type { PlaybackPlan } from '../core/playback';

/** A running playback. */
export interface Playing {
  /** Seconds into the piece right now. */
  position(): number;
  stop(): void;
}

/** Something that can turn a playback plan into sound. */
export interface Engine {
  /** Starts the plan (already cut at `from` seconds). Needs a user gesture the first time. */
  play(plan: PlaybackPlan, from: number): Promise<Playing>;
}
