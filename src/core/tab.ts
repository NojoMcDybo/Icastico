/**
 * Guitar tablature (ADR 0022): which string and fret plays each tone.
 *
 * The score stores only pitches. For the tab staff the fingering is worked out here: standard tuning,
 * the hand stays near its last position, chords use distinct strings within a hand span.
 */
import { type NoteEvent } from './model';
import { midiOf } from './pitch';

/** Sounding pitch (MIDI) of the open strings, string 1 (high E) first. */
export const GUITAR_STRINGS: readonly number[] = [64, 59, 55, 50, 45, 40];
export const MAX_FRET = 22;
/** Frets a hand reaches without moving, counted from the index finger. */
const SPAN = 4;

export interface Fingering {
  /** 1 = high E … 6 = low E. */
  readonly string: number;
  readonly fret: number;
}

interface Choice extends Fingering {
  readonly tone: string;
}

function candidates(midi: number): Fingering[] {
  const out: Fingering[] = [];
  GUITAR_STRINGS.forEach((open, i) => {
    const fret = midi - open;
    if (fret >= 0 && fret <= MAX_FRET) out.push({ string: i + 1, fret });
  });
  return out;
}

/** Cost of playing `chosen` with the hand at `hand`: distance, hand span, high positions; open strings are cheap. */
function cost(chosen: readonly Choice[], hand: number): number {
  const fretted = chosen.filter((c) => c.fret > 0);
  let total = 0;
  for (const c of fretted) total += Math.abs(c.fret - hand) + c.fret * 0.05;
  if (fretted.length > 1) {
    const span = Math.max(...fretted.map((c) => c.fret)) - Math.min(...fretted.map((c) => c.fret));
    if (span > SPAN) total += (span - SPAN) * 10;
  }
  return total;
}

/**
 * Fingering for every tone of the events (sorted by onset, all voices of the instrument together).
 * Tones outside the guitar's range get no entry.
 */
export function assignFrets(events: readonly NoteEvent[]): Map<string, Fingering> {
  const result = new Map<string, Fingering>();
  let hand = 3;
  for (const ev of events) {
    const tones = ev.tones.map((t) => ({ id: t.id, options: candidates(midiOf(t.pitch)) })).filter((t) => t.options.length > 0);
    // Try every combination of distinct strings (at most six tones, a handful of options each).
    let best: Choice[] | null = null;
    let bestCost = Infinity;
    const pick = (i: number, used: Set<number>, chosen: Choice[]) => {
      if (i === tones.length) {
        const c = cost(chosen, hand);
        if (c < bestCost) {
          bestCost = c;
          best = [...chosen];
        }
        return;
      }
      const t = tones[i]!;
      let any = false;
      for (const o of t.options) {
        if (used.has(o.string)) continue;
        any = true;
        used.add(o.string);
        chosen.push({ ...o, tone: t.id });
        pick(i + 1, used, chosen);
        chosen.pop();
        used.delete(o.string);
      }
      if (!any) pick(i + 1, used, chosen); // no free string left for this tone: leave it out
    };
    pick(0, new Set(), []);
    const chosen: readonly Choice[] = best ?? [];
    for (const c of chosen) result.set(c.tone, { string: c.string, fret: c.fret });
    const fretted = chosen.filter((c) => c.fret > 0);
    if (fretted.length) hand = fretted.reduce((sum, c) => sum + c.fret, 0) / fretted.length;
  }
  return result;
}
