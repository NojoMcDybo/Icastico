/**
 * Playback plan → timed MIDI messages for a sampled synthesizer (ADR 0015). Pure logic.
 *
 * - Ordinary notes share one channel per instrument.
 * - A sound whose pitch moves (a glide) gets a channel of its own: pitch bend works per
 *   channel, so any other note on it would be dragged along. The bend range is set so the
 *   whole glide fits, the note is struck on its first pitch, and the bend then follows the
 *   pitch curve in small steps (linear in semitones). The channel is reset afterwards.
 * - A sound whose loudness changes over time (a note curve, a crossfade through a glide gap) also
 *   gets a channel of its own: it is struck with its volume as velocity and then follows the
 *   level through expression (CC 11) in small steps; expression is reset afterwards.
 * - If more such sounds play at once than there are free channels, the extra ones play at a
 *   fixed pitch and an even loudness rather than disturbing other notes.
 */
import type { InstrumentId } from '../core/instruments';
import { type PlaybackPlan, type SoundNote, levelAt } from '../core/playback';

export type MidiAction =
  | { readonly t: number; readonly channel: number; readonly type: 'program'; readonly value: number }
  | { readonly t: number; readonly channel: number; readonly type: 'range'; readonly value: number }
  | { readonly t: number; readonly channel: number; readonly type: 'bend'; readonly value: number }
  /** Loudness of the whole channel, 0–127 (CC 11). */
  | { readonly t: number; readonly channel: number; readonly type: 'expression'; readonly value: number }
  | { readonly t: number; readonly channel: number; readonly type: 'on'; readonly key: number; readonly velocity: number }
  | { readonly t: number; readonly channel: number; readonly type: 'off'; readonly key: number };

/** Channel for the ordinary notes of each instrument (channel 10, index 9, is drums). */
export const BASE_CHANNEL: Record<InstrumentId, number> = { voice: 0, guitar: 1, tab: 1, piano: 2 };
/** Channels handed out to sounds that glide or change their loudness. */
export const GLIDE_CHANNELS: readonly number[] = [3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];

export const BEND_CENTER = 8192;
export const BEND_MAX = 16383;
const VELOCITY = 100;
/** Pitch bend is sent this often (seconds) while a glide moves. */
export const BEND_STEP = 0.01;
/** The sound's tail after its note-off; the channel is not reused (or reset) before it has faded. */
const TAIL = 0.8;
const MAX_RANGE = 48;

const hasGlide = (n: SoundNote): boolean => n.path.some((p) => p.midi !== n.path[0]!.midi);
const hasLevels = (n: SoundNote): boolean => (n.gain?.length ?? 0) > 0;
const expression = (level: number): number => Math.max(0, Math.min(127, Math.round(level * 127)));

/** Bend wheel value for a pitch relative to the struck key, with a wheel range in semitones. */
export function bendValue(midi: number, key: number, range: number): number {
  return Math.max(0, Math.min(BEND_MAX, BEND_CENTER + Math.round(((midi - key) / range) * BEND_CENTER)));
}

export function midiActions(plan: PlaybackPlan, programs: Record<InstrumentId, number>): MidiAction[] {
  const actions: MidiAction[] = [];
  const freeAt = new Map<number, number>(GLIDE_CHANNELS.map((c) => [c, 0]));
  const used = new Set<InstrumentId>();

  for (const note of plan.notes) {
    used.add(note.instrument);
    const key = Math.round(note.path[0]!.midi);
    const velocity = note.volume ?? VELOCITY;
    const channel = hasGlide(note) || hasLevels(note) ? [...freeAt].find(([, free]) => free <= note.start)?.[0] : undefined;
    if (channel === undefined) {
      const base = BASE_CHANNEL[note.instrument];
      actions.push({ t: note.start, channel: base, type: 'on', key, velocity }, { t: note.end, channel: base, type: 'off', key });
      continue;
    }

    const deviation = Math.max(...note.path.map((p) => Math.abs(p.midi - key)));
    const range = Math.max(2, Math.min(MAX_RANGE, Math.ceil(deviation)));
    freeAt.set(channel, note.end + TAIL);
    const before = note.start - 0.005;
    actions.push(
      { t: before, channel, type: 'program', value: programs[note.instrument] },
      { t: before, channel, type: 'range', value: range },
      { t: before, channel, type: 'bend', value: BEND_CENTER },
      { t: before, channel, type: 'expression', value: note.gain ? expression(levelAt(note.gain, note.start)) : 127 },
      { t: note.start, channel, type: 'on', key, velocity },
    );
    for (let i = 1; i < note.path.length; i++) {
      const a = note.path[i - 1]!;
      const b = note.path[i]!;
      if (a.midi === b.midi) continue;
      const steps = Math.max(1, Math.ceil((b.t - a.t) / BEND_STEP));
      for (let s = 1; s <= steps; s++) {
        const f = s / steps;
        actions.push({ t: a.t + (b.t - a.t) * f, channel, type: 'bend', value: bendValue(a.midi + (b.midi - a.midi) * f, key, range) });
      }
    }
    let last = note.gain ? expression(levelAt(note.gain, note.start)) : 127;
    const gain = note.gain ?? [];
    for (let i = 1; i < gain.length; i++) {
      const a = gain[i - 1]!;
      const b = gain[i]!;
      const to = expression(b.level);
      const change = Math.abs(to - expression(a.level));
      // A jump (equal times) or a slope: one message per step, but never more than there are values in between.
      const steps = b.t === a.t ? 1 : Math.max(1, Math.min(Math.ceil((b.t - a.t) / BEND_STEP), change));
      for (let k = 1; k <= steps; k++) {
        const value = b.t === a.t ? to : expression(a.level + ((b.level - a.level) * k) / steps);
        if (value === last) continue;
        last = value;
        actions.push({ t: b.t === a.t ? b.t : a.t + ((b.t - a.t) * k) / steps, channel, type: 'expression', value });
      }
    }
    actions.push(
      { t: note.end, channel, type: 'off', key },
      { t: note.end + TAIL, channel, type: 'bend', value: BEND_CENTER },
      ...(note.gain ? [{ t: note.end + TAIL, channel, type: 'expression' as const, value: 127 }] : []),
    );
  }

  // Program of the shared channels, set once at the very start.
  const first = Math.min(0, ...actions.map((a) => a.t));
  for (const instrument of used) actions.push({ t: first - 0.01, channel: BASE_CHANNEL[instrument], type: 'program', value: programs[instrument] });
  // Stable sort: messages with the same time keep the order they were made in (program, range, bend, then the note).
  return actions.map((a, i) => ({ a, i })).sort((x, y) => x.a.t - y.a.t || x.i - y.i).map((x) => x.a);
}
