/**
 * From score to sound: the playback plan (ADR 0015). Pure data – no audio here.
 *
 * Every sounding line is a `SoundNote`: a start, an end and a pitch curve. Ties
 * join the notes they connect into ONE sound (no new attack); a glide with a gap
 * continues the same sound and moves its pitch linearly in semitones through the
 * gap. A glide without a gap is a direct change: the second note is struck anew.
 *
 * Loudness (ADR 0016): `volume` is how hard the sound is struck; `gain` is how loud it is over
 * time relative to that (0–1, linear between the points) – a note's loudness curve, and through a
 * glide's gap the crossfade between the two notes, along the same curve as the pitch.
 */
import { type Fraction, frac, lt, sub, toNumber } from './time';
import { DEFAULT_VOLUME, curveAt } from './curve';
import type { InstrumentId } from './instruments';
import { DEFAULT_TEMPO, type Link, type Score, type ToneSpot, eventEnd, locateTones, measuresOf } from './model';

export interface PitchPoint {
  /** Seconds from the start of the piece. */
  readonly t: number;
  /** MIDI number; between two points the pitch moves linearly (in semitones). */
  readonly midi: number;
}

export interface GainPoint {
  /** Seconds from the start of the piece. */
  readonly t: number;
  readonly level: number;
}

export interface SoundNote {
  readonly instrument: InstrumentId;
  readonly start: number;
  readonly end: number;
  readonly path: readonly PitchPoint[];
  /** How hard it is struck, 1–127; absent = DEFAULT_VOLUME. */
  readonly volume?: number;
  /** Level over time (0–1); absent = full all the way. */
  readonly gain?: readonly GainPoint[];
}

export interface PlaybackPlan {
  readonly notes: readonly SoundNote[];
  /** Seconds until the last note has ended. */
  readonly length: number;
}

/** Seconds between the points a loudness curve is cut into. */
const CURVE_STEP = 0.02;
/** Pieces a shaped glide is cut into. */
const GLIDE_STEPS = 16;

export const tempoOf = (score: Score): number => score.tempo ?? DEFAULT_TEMPO;

/** Seconds for a time on the timeline (a quarter note lasts 60 / tempo seconds). */
export const secondsOf = (score: Score, t: Fraction): number => (toNumber(t) * 240) / tempoOf(score);

/** The time on the timeline for a number of seconds (rounded to 1/960 of a whole note – good for display). */
export const timeAt = (score: Score, seconds: number): Fraction => frac(Math.max(0, Math.round((seconds * tempoOf(score) * 960) / 240)), 960);

export function planPlayback(score: Score): PlaybackPlan {
  const spots = locateTones(score);
  const chained = new Map<string, string>(); // tone → the tone its sound continues into
  const via = new Map<string, Link>(); // the link a sound continues along
  for (const link of score.links ?? []) {
    const a = spots.get(link.from);
    const b = spots.get(link.to);
    if (!a || !b) continue;
    const gap = lt(eventEnd(a.event), b.event.onset);
    if (link.kind === 'tie' || gap) {
      chained.set(link.from, link.to);
      via.set(link.from, link);
    }
  }
  const continued = new Set(chained.values());

  const notes: SoundNote[] = [];
  for (const head of spots.values()) {
    if (continued.has(head.tone.id)) continue;
    const members: ToneSpot[] = [];
    const seen = new Set<string>();
    for (let at: ToneSpot | undefined = head; at && !seen.has(at.tone.id); at = spots.get(chained.get(at.tone.id) ?? '')) {
      seen.add(at.tone.id);
      members.push(at);
    }
    const path: PitchPoint[] = [];
    const gain: GainPoint[] = [];
    const strongest = Math.max(...members.map((m) => m.tone.volume ?? DEFAULT_VOLUME));
    members.forEach((m, i) => {
      const midi = midiNumber(m);
      const t0 = secondsOf(score, m.event.onset);
      const t1 = secondsOf(score, eventEnd(m.event));
      for (const t of [t0, t1]) {
        const last = path[path.length - 1];
        if (!last || last.t !== t || last.midi !== midi) path.push({ t, midi });
      }
      const rel = (m.tone.volume ?? DEFAULT_VOLUME) / strongest;
      if (m.tone.curve) {
        const steps = Math.max(4, Math.min(80, Math.ceil((t1 - t0) / CURVE_STEP)));
        for (let k = 0; k <= steps; k++) gain.push({ t: t0 + ((t1 - t0) * k) / steps, level: rel * curveAt(m.tone.curve, k / steps) });
      } else {
        gain.push({ t: t0, level: rel }, { t: t1, level: rel });
      }
      const next = members[i + 1];
      const link = via.get(m.tone.id);
      if (next && link?.curve && t1 < secondsOf(score, next.event.onset)) {
        // A shaped glide: pitch and loudness travel through the gap along the curve instead of in a straight line.
        const n0 = secondsOf(score, next.event.onset);
        const nextMidi = midiNumber(next);
        const from = rel * (m.tone.curve ? curveAt(m.tone.curve, 1) : 1);
        const to = ((next.tone.volume ?? DEFAULT_VOLUME) / strongest) * (next.tone.curve ? curveAt(next.tone.curve, 0) : 1);
        for (let k = 1; k < GLIDE_STEPS; k++) {
          const f = curveAt(link.curve, k / GLIDE_STEPS);
          const t = t1 + ((n0 - t1) * k) / GLIDE_STEPS;
          path.push({ t, midi: midi + (nextMidi - midi) * f });
          gain.push({ t, level: from + (to - from) * f });
        }
      }
    });
    const volume = strongest === DEFAULT_VOLUME ? {} : { volume: strongest };
    const shaped = gain.some((g) => Math.abs(g.level - 1) > 1e-6) ? { gain } : {};
    notes.push({ instrument: head.part.instrument, start: path[0]!.t, end: path[path.length - 1]!.t, path, ...volume, ...shaped });
  }
  notes.sort((a, b) => a.start - b.start || a.path[0]!.midi - b.path[0]!.midi);
  return { notes, length: notes.reduce((m, n) => Math.max(m, n.end), 0) };
}

const STEP_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;
const midiNumber = (s: ToneSpot): number => (s.tone.pitch.octave + 1) * 12 + STEP_SEMITONES[s.tone.pitch.step] + s.tone.pitch.alter;

/** Pitch of a sound at a moment (linear in semitones between the points). */
export function pitchAt(path: readonly PitchPoint[], t: number): number {
  let prev = path[0]!;
  for (const p of path) {
    if (p.t >= t) {
      if (p.t === prev.t) return p.midi;
      return prev.midi + ((p.midi - prev.midi) * (t - prev.t)) / (p.t - prev.t);
    }
    prev = p;
  }
  return prev.midi;
}

/** Level of a sound at a moment (linear between the points; a jump at equal times takes the later value). */
export function levelAt(gain: readonly GainPoint[], t: number): number {
  let prev = gain[0]!;
  for (const p of gain) {
    if (p.t >= t) return p.t === prev.t ? p.level : prev.level + ((p.level - prev.level) * (t - prev.t)) / (p.t - prev.t);
    prev = p;
  }
  return prev.level;
}

/** The plan as it sounds when started at `seconds`: finished notes drop out, running ones start there anew. */
export function planFrom(plan: PlaybackPlan, seconds: number): PlaybackPlan {
  const notes = plan.notes
    .filter((n) => n.end > seconds)
    .map((n): SoundNote => {
      if (n.start >= seconds) return n;
      const path = [{ t: seconds, midi: pitchAt(n.path, seconds) }, ...n.path.filter((p) => p.t > seconds)];
      const gain = n.gain && [{ t: seconds, level: levelAt(n.gain, seconds) }, ...n.gain.filter((p) => p.t > seconds)];
      return { ...n, start: seconds, path, ...(gain ? { gain } : {}) };
    });
  return { notes, length: plan.length };
}

/** Bar (0 = upbeat) and beat (1-based) shown in the transport display for a time. */
export function barBeat(score: Score, t: Fraction): { bar: number; beat: number } {
  const measures = measuresOf(score, 1, t);
  const m = measures.find((x) => !lt(t, x.start) && lt(t, x.end)) ?? measures[measures.length - 1]!;
  const beats = Math.floor(toNumber(sub(t, m.gridStart)) * m.sig.unit + 1e-9);
  return { bar: m.number, beat: Math.max(1, beats + 1) };
}

const MAJOR_KEYS = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
/** "Cmaj", "Gmaj", "Bbmaj": the key as the display shows it (the score stores only the signature). */
export const keyName = (fifths: number): string => `${MAJOR_KEYS[fifths + 7] ?? 'C'}maj`;

