/**
 * Played notes → a score (ADR 0028). The step that MIDI files and recordings share:
 * times in quarter-note beats (as played, a little uneven) become exact positions and lengths.
 *
 * - Every note start and end is snapped to a grid (eighths, sixteenths or 32nds). A beat whose notes
 *   sit clearly better on triplet positions is written as a triplet.
 * - Ends are rounded a little generously: notes are played slightly short, that must not make rests.
 * - A voice part is a single line; guitar and piano get several voices where notes overlap for real;
 *   the piano is split into two hands at middle C.
 * Pitches are spelled for the key (estimated if not given).
 */
import { type Fraction, ZERO, add, frac, le, lt, sub } from '../time';
import { type Pitch, midiOf, spellMidi } from '../pitch';
import { type InstrumentId, getInstrument } from '../instruments';
import { type MeterChange, type NoteEvent, type Part, type Score, type Voice, DEFAULT_TEMPO, MAX_TEMPO, MIN_TEMPO, validateScore } from '../model';
import { placeable, writable } from './grid';
import { estimateKey } from './key';
import { ImportError, type ImportResult } from './musicxml';

/** A note as played; times in quarter-note beats from the start of the first bar. */
export interface PlayedNote {
  readonly start: number;
  readonly end: number;
  readonly midi: number;
  /** MIDI velocity 1–127; absent = not known. */
  readonly volume?: number;
}

export type Subdivision = 8 | 16 | 32;

export interface QuantizeOptions {
  /** The finest note value: 8 = eighths, 16 = sixteenths, 32 = 32nds. */
  readonly subdivision: Subdivision;
  /** Write beats whose notes sit on triplet positions as triplets. */
  readonly triplets: boolean;
}

export const DEFAULT_QUANTIZE: QuantizeOptions = { subdivision: 16, triplets: true };

export const SUBDIVISION_NAMES: Record<Subdivision, string> = { 8: 'Achtel', 16: 'Sechzehntel', 32: '32tel' };

export interface QuantNote {
  readonly onset: Fraction;
  readonly duration: Fraction;
  readonly midi: number;
  readonly volume?: number;
}

interface Grid {
  /** Steps in beats. */
  readonly bin: number;
  readonly trip: number;
  /** Denominators (in whole notes) of one step. */
  readonly binDen: number;
  readonly tripDen: number;
}

const gridOf = (o: QuantizeOptions): Grid => (o.subdivision >= 32 ? { bin: 0.125, trip: 1 / 6, binDen: 32, tripDen: 24 } : { bin: 4 / o.subdivision, trip: 1 / 3, binDen: o.subdivision, tripDen: 12 });

/** Notes are played slightly short: ends round with this bias (in steps) towards the later grid line. */
const END_BIAS = 0.2;

const windowOf = (beats: number): number => Math.floor(beats + 0.125);

/** The beats (windows) in which the starts fit triplet positions clearly better than the binary grid. */
function tripletWindows(starts: readonly number[], g: Grid): Set<number> {
  const byWindow = new Map<number, number[]>();
  for (const x of starts) {
    const w = windowOf(x);
    const list = byWindow.get(w) ?? [];
    list.push(x);
    byWindow.set(w, list);
  }
  const out = new Set<number>();
  for (const [w, xs] of byWindow) {
    let errBin = 0;
    let errTrip = 0;
    let onlyTrip = 0;
    for (const x of xs) {
      const db = Math.abs(x - Math.round(x / g.bin) * g.bin);
      const mt = Math.round(x / g.trip);
      const dt = Math.abs(x - mt * g.trip);
      errBin += db;
      errTrip += dt;
      const onBinary = Math.abs((mt * g.trip) / g.bin - Math.round((mt * g.trip) / g.bin)) < 1e-6;
      if (!onBinary && dt < db) onlyTrip++;
    }
    if (onlyTrip >= 1 && errBin - errTrip >= 0.04 && errTrip <= 0.5 * errBin) out.add(w);
  }
  return out;
}

const snapTo = (beats: number, trip: boolean, g: Grid, bias = 0): Fraction => {
  const step = trip ? g.trip : g.bin;
  return frac(Math.max(0, Math.round(beats / step + bias)), trip ? g.tripDen : g.binDen);
};

/** Start and end of something played, in quarter-note beats. */
export interface Timed {
  readonly start: number;
  readonly end: number;
}

/** Exact start and length for every item, in the order given. The core of `quantize`; the editor uses it on notes that are already in the score. */
export function quantizeTimes(items: readonly Timed[], options: QuantizeOptions = DEFAULT_QUANTIZE): { times: { onset: Fraction; duration: Fraction }[]; tripletBeats: number } {
  const g = gridOf(options);
  const trips = options.triplets ? tripletWindows(items.map((n) => n.start), g) : new Set<number>();
  const times: { onset: Fraction; duration: Fraction }[] = [];
  for (const n of items) {
    const startTrip = trips.has(windowOf(n.start));
    const onset = snapTo(n.start, startTrip, g);
    let duration: Fraction | null = null;
    // The end follows the grid of its own beat; if the two do not add up to a writable length, the start's grid, then the binary one.
    for (const trip of [trips.has(windowOf(n.end)), startTrip, false]) {
      let d = sub(snapTo(n.end, trip, g, END_BIAS), onset);
      if (!lt(ZERO, d)) d = frac(1, trip ? g.tripDen : g.binDen);
      if (writable(d) && placeable(add(onset, d))) {
        duration = d;
        break;
      }
    }
    times.push({ onset, duration: duration ?? frac(1, g.binDen) });
  }
  return { times, tripletBeats: trips.size };
}

/** Quantises notes to exact times. Notes that end up with no length get one step. Sorted by onset, then pitch. */
export function quantize(notes: readonly PlayedNote[], options: QuantizeOptions = DEFAULT_QUANTIZE): { notes: QuantNote[]; tripletBeats: number } {
  const { times, tripletBeats } = quantizeTimes(notes, options);
  const out: QuantNote[] = notes.map((n, i) => ({ ...times[i]!, midi: n.midi, ...(n.volume !== undefined ? { volume: n.volume } : {}) }));
  out.sort((a, b) => a.onset.n * b.onset.d - b.onset.n * a.onset.d || a.midi - b.midi);
  return { notes: out, tripletBeats };
}

interface Ev {
  onset: Fraction;
  duration: Fraction;
  notes: { midi: number; volume?: number }[];
}

const endOf = (e: Ev): Fraction => add(e.onset, e.duration);
const cmp = (a: Fraction, b: Fraction): number => a.n * b.d - b.n * a.d;

/** Notes with the same start and (about) the same length become one chord; a difference of one step is a lazy release. */
function chordsOf(notes: readonly QuantNote[], step: Fraction): Ev[] {
  const byOnset = new Map<string, QuantNote[]>();
  for (const n of notes) {
    const key = `${n.onset.n}/${n.onset.d}`;
    byOnset.set(key, [...(byOnset.get(key) ?? []), n]);
  }
  const evs: Ev[] = [];
  for (const group of byOnset.values()) {
    const sorted = [...group].sort((x, y) => cmp(x.duration, y.duration));
    let current: Ev | null = null;
    for (const n of sorted) {
      if (!current || lt(add(current.duration, step), n.duration)) {
        current = { onset: n.onset, duration: n.duration, notes: [] };
        evs.push(current);
      }
      if (!current.notes.some((x) => x.midi === n.midi)) current.notes.push({ midi: n.midi, ...(n.volume !== undefined ? { volume: n.volume } : {}) });
    }
  }
  return evs.sort((a, b) => cmp(a.onset, b.onset) || Math.max(...b.notes.map((x) => x.midi)) - Math.max(...a.notes.map((x) => x.midi)));
}

/** One line: notes that start together become a chord of the shortest length; every note ends where the next begins. */
function singleLine(notes: readonly QuantNote[]): Ev[] {
  const byOnset = new Map<string, Ev>();
  for (const n of notes) {
    const key = `${n.onset.n}/${n.onset.d}`;
    const ev = byOnset.get(key);
    if (!ev) byOnset.set(key, { onset: n.onset, duration: n.duration, notes: [{ midi: n.midi, ...(n.volume !== undefined ? { volume: n.volume } : {}) }] });
    else {
      if (lt(n.duration, ev.duration)) ev.duration = n.duration;
      if (!ev.notes.some((x) => x.midi === n.midi)) ev.notes.push({ midi: n.midi, ...(n.volume !== undefined ? { volume: n.volume } : {}) });
    }
  }
  const list = [...byOnset.values()].sort((a, b) => cmp(a.onset, b.onset));
  list.forEach((ev, i) => {
    const next = list[i + 1];
    if (next && lt(next.onset, endOf(ev))) ev.duration = sub(next.onset, ev.onset);
  });
  return list;
}

/** Several lines: a note that runs only a hair into the next one is shortened; real overlaps go to another voice. */
function lanesOf(notes: readonly QuantNote[], step: Fraction): Ev[][] {
  const evs = chordsOf(notes, step);
  evs.forEach((ev, i) => {
    for (const next of evs.slice(i + 1)) {
      if (!lt(ev.onset, next.onset)) continue;
      if (le(endOf(ev), next.onset)) break;
      if (le(sub(endOf(ev), next.onset), step)) ev.duration = sub(next.onset, ev.onset);
    }
  });
  const lanes: { events: Ev[]; end: Fraction }[] = [];
  for (const ev of evs) {
    let lane = lanes.find((l) => le(l.end, ev.onset));
    if (!lane) {
      lane = { events: [], end: ZERO };
      lanes.push(lane);
    }
    lane.events.push(ev);
    lane.end = endOf(ev);
  }
  return lanes.map((l) => l.events);
}

export interface PartInput {
  readonly name: string;
  readonly instrument: InstrumentId;
  readonly notes: readonly PlayedNote[];
}

export interface BuildOptions {
  readonly title: string;
  readonly parts: readonly PartInput[];
  readonly quantize: QuantizeOptions;
  readonly meter: readonly MeterChange[];
  /** Quarter notes per minute; absent = default. */
  readonly tempo?: number;
  /** Key signature; null = estimate from the notes. */
  readonly fifths: number | null;
}

const MIDDLE_C = 60;

/** The score for notes as played. Throws an ImportError if nothing playable is left. */
export function buildScore(o: BuildOptions): ImportResult {
  const notes: string[] = [];
  const all = o.parts.flatMap((p) => p.notes);
  if (all.length === 0) throw new ImportError('Es wurden keine Töne gefunden, die sich übernehmen lassen.');
  const fifths = o.fifths ?? estimateKey(all.map((n) => ({ midi: n.midi, weight: Math.max(0.1, n.end - n.start) })));
  const step = frac(1, gridOf(o.quantize).binDen);

  let tripletBeats = 0;
  let extraVoices = 0;
  const parts: Part[] = [];
  for (const input of o.parts) {
    const def = getInstrument(input.instrument);
    const same = parts.filter((p) => p.instrument === input.instrument).length;
    const id = same === 0 ? input.instrument : `${input.instrument}-${same + 1}`;
    const q = quantize(input.notes, o.quantize);
    tripletBeats += q.tripletBeats;
    const voices: Voice[] = [];
    for (let staff = 0; staff < def.staves.length; staff++) {
      const mine = def.staves.length === 2 ? q.notes.filter((n) => (staff === 0 ? n.midi >= MIDDLE_C : n.midi < MIDDLE_C)) : q.notes;
      const lines = input.instrument === 'voice' ? [singleLine(mine)] : lanesOf(mine, step);
      if (lines.length > 1) extraVoices += lines.length - 1;
      lines.forEach((events, i) => {
        const voiceId = `${id}-s${staff + 1}v${i + 1}`;
        voices.push({ id: voiceId, staff, events: events.map((ev, k): NoteEvent => toEvent(`${voiceId}-n${k + 1}`, ev, fifths)) });
      });
      if (lines.length === 0) voices.push({ id: `${id}-s${staff + 1}v1`, staff, events: [] });
    }
    parts.push({ id, name: same === 0 ? input.name : `${input.name} ${same + 1}`, instrument: input.instrument, voices });
  }
  if (extraVoices > 0) notes.push(`Wo Töne sich überlappen, liegen sie in zusätzlichen Stimmen (${extraVoices}).`);
  if (tripletBeats > 0) notes.push(`${tripletBeats} Schläge sind als Triolen geschrieben.`);

  const tempo = o.tempo === undefined ? undefined : Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, Math.round(o.tempo)));
  const score: Score = {
    title: o.title,
    meter: o.meter,
    keys: [{ at: ZERO, fifths }],
    ...(tempo !== undefined && tempo !== DEFAULT_TEMPO ? { tempo } : {}),
    parts,
  };
  const problems = validateScore(score);
  if (problems.length > 0) throw new ImportError(`Die Partitur lässt sich nicht übernehmen:\n- ${problems.slice(0, 5).join('\n- ')}`);
  return { score, notes };
}

function toEvent(id: string, ev: Ev, fifths: number): NoteEvent {
  const tones = [...ev.notes]
    .sort((a, b) => a.midi - b.midi)
    .map((n, i) => {
      const pitch: Pitch = spellMidi(n.midi, fifths);
      return { id: `${id}-t${i + 1}`, pitch, ...(n.volume !== undefined ? { volume: n.volume } : {}) };
    });
  // Spelling must keep the sounding pitch.
  if (tones.some((t, i) => midiOf(t.pitch) !== [...ev.notes].sort((a, b) => a.midi - b.midi)[i]!.midi)) throw new ImportError('Tonhöhe konnte nicht geschrieben werden.');
  return { id, onset: ev.onset, duration: ev.duration, tones };
}
