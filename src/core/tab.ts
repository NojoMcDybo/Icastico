/**
 * Guitar tablature (ADR 0022, 0032): which string and fret plays each tone.
 *
 * The score stores pitches (and, for a tablature line, the string a tone was put on). The fingering is worked out
 * here: the tuning of the part (standard E A d g h e, or any other), the hand stays near its last position,
 * chords use distinct strings within a hand span, a string that was chosen is kept.
 */
import { type NoteEvent } from './model';
import { midiOf } from './pitch';

/** Sounding pitch (MIDI) of the open strings, string 1 (the highest) first. */
export type Tuning = readonly number[];

/** Standard tuning E A d g h e. */
export const GUITAR_STRINGS: Tuning = [64, 59, 55, 50, 45, 40];
export const MAX_FRET = 22;
/** Frets a hand reaches without moving, counted from the index finger. */
const SPAN = 4;

export interface TuningPreset {
  readonly id: string;
  readonly name: string;
  readonly strings: Tuning;
}

/** Tunings to choose from; every string can also be set by hand. */
export const TUNINGS: readonly TuningPreset[] = [
  { id: 'standard', name: 'Standard (E A d g h e)', strings: GUITAR_STRINGS },
  { id: 'dropD', name: 'Drop D (D A d g h e)', strings: [64, 59, 55, 50, 45, 38] },
  { id: 'halfDown', name: 'Halbton tiefer (Es As des ges b es)', strings: [63, 58, 54, 49, 44, 39] },
  { id: 'dadgad', name: 'DADGAD', strings: [62, 57, 55, 50, 45, 38] },
  { id: 'openG', name: 'Offen G (D G d g h d)', strings: [62, 59, 55, 50, 43, 38] },
  { id: 'openD', name: 'Offen D (D A d fis a d)', strings: [62, 57, 54, 50, 45, 38] },
  { id: 'openE', name: 'Offen E (E H e gis h e)', strings: [64, 59, 56, 52, 47, 40] },
];

/** Whether a tuning is usable: six strings, each a pitch a guitar can have. */
export const validTuning = (t: readonly number[]): boolean => t.length === GUITAR_STRINGS.length && t.every((m) => Number.isInteger(m) && m >= 24 && m <= 88);

/** The preset a tuning equals, if it is one. */
export const presetOf = (t: Tuning): TuningPreset | undefined => TUNINGS.find((p) => p.strings.every((m, i) => m === t[i]));

const NAMES_DE = ['c', 'cis', 'd', 'dis', 'e', 'f', 'fis', 'g', 'gis', 'a', 'b', 'h'];

/** German name of a pitch as guitarists write string names: capital below the d string, small from there on ("E A d g h e"). */
export function noteNameDe(midi: number): string {
  const name = NAMES_DE[((midi % 12) + 12) % 12]!;
  return midi < 50 ? name.charAt(0).toUpperCase() + name.slice(1) : name;
}

/** What the score says about a tuning: the preset's name, else the six string names (lowest string first). Null for standard tuning; short enough to stand above the start of a staff. */
export function tuningLabel(t: Tuning): string | null {
  const preset = presetOf(t);
  if (preset?.id === 'standard') return null;
  return preset ? preset.name.replace(/\s*\(.*\)$/, '') : [...t].reverse().map(noteNameDe).join(' ');
}

/** The tuning a part uses. */
export const tuningOf = (part: { readonly tuning?: Tuning }): Tuning => part.tuning ?? GUITAR_STRINGS;

/** Whether the guitar can play this pitch (MIDI) on some string. */
export const playableOnGuitar = (midi: number, tuning: Tuning = GUITAR_STRINGS): boolean => midi >= Math.min(...tuning) && midi <= Math.max(...tuning) + MAX_FRET;

export interface Fingering {
  /** 1 = highest string … 6 = lowest. */
  readonly string: number;
  readonly fret: number;
}

interface Choice extends Fingering {
  readonly tone: string;
}

function candidates(midi: number, tuning: Tuning): Fingering[] {
  const out: Fingering[] = [];
  tuning.forEach((open, i) => {
    const fret = midi - open;
    if (fret >= 0 && fret <= MAX_FRET) out.push({ string: i + 1, fret });
  });
  return out;
}

/** The fret of a pitch on a string of the tuning, or null if the string cannot play it. */
export function fretOn(midi: number, string: number, tuning: Tuning): number | null {
  const open = tuning[string - 1];
  if (open === undefined) return null;
  const fret = midi - open;
  return fret >= 0 && fret <= MAX_FRET ? fret : null;
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
 * A tone that carries its string keeps it (if that string can play it); tones outside the range get no entry.
 */
export function assignFrets(events: readonly NoteEvent[], tuning: Tuning = GUITAR_STRINGS): Map<string, Fingering> {
  const result = new Map<string, Fingering>();
  let hand = 3;
  for (const ev of events) {
    const tones = ev.tones
      .map((t) => {
        const all = candidates(midiOf(t.pitch), tuning);
        const own = t.string !== undefined ? all.filter((c) => c.string === t.string) : [];
        return { id: t.id, options: own.length > 0 ? own : all };
      })
      .filter((t) => t.options.length > 0);
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
