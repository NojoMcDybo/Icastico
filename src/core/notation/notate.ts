/**
 * Notation layer: turns the timeline model into notatable symbols.
 *
 *   timeline events  ──►  per measure: notes / rests with written durations,
 *                          ties across barlines, whole-measure rests
 *
 * This is where "musical time" becomes "notation". Audio-to-notes and MIDI
 * recording will feed the same model, so all spelling of rhythm lives here.
 *
 * Current rules (deliberately simple, refine in roadmap step 1):
 * - Notes: greedy decomposition into the largest written value (dots allowed),
 *   tied together. Notes crossing a barline are split and tied.
 * - Rests: decomposed into values aligned to their position in the measure,
 *   no dots (a rest on beat 2 of 4/4 lasting 3 beats = quarter + half).
 * - An empty measure becomes a whole-measure rest.
 * - Beams: consecutive eighths (and shorter) within the same beat are beamed;
 *   rests break beams. Beat = 3/8 in compound meters (6/8, 9/8, 12/8),
 *   otherwise the meter's unit.
 * - Tuplets (ADR 0020): a length whose written value is a power of two after scaling by 3:2, 5:4 or
 *   7:4 is a triplet / quintuplet / septuplet. Neighbouring tuplet items of one ratio are grouped
 *   until their real lengths add up to a power of two; MEI draws each group with its number.
 */
import {
  type Fraction,
  ZERO,
  add,
  div,
  eq,
  frac,
  gt,
  isDyadic,
  le,
  lt,
  max,
  min,
  sub,
  fracToString,
} from '../time';
import { type Measure, type NoteEvent, type TimeSignature, type Tone, type Voice, eventEnd } from '../model';

export interface WrittenDuration {
  /** 1 = whole, 2 = half, 4 = quarter … 64 (MEI @dur). */
  readonly base: number;
  readonly dots: number;
}

/** "num notes in the time of numbase": 3:2 = triplet. */
export interface TupletRatio {
  readonly num: number;
  readonly numbase: number;
}

/** A tuplet ratio plus the group (per voice and measure) an item belongs to. */
export interface TupletMark extends TupletRatio {
  readonly group: number;
}

export interface NotatedNote {
  readonly kind: 'note';
  readonly id: string;
  readonly eventId: string;
  readonly onset: Fraction;
  readonly duration: WrittenDuration;
  readonly tones: readonly Tone[];
  readonly tiedFromPrevious: boolean;
  readonly tiedToNext: boolean;
  /** Stem direction forced by the user (ADR 0043). */
  readonly stem?: 'up' | 'down';
  readonly tuplet?: TupletMark;
}

/** How the user wants the rest that starts at `at` (hidden, moved), from the marks of the voice. */
function restLook(voice: Voice, at: Fraction): { hidden?: true; shift?: number } {
  const mark = voice.rests?.find((r) => eq(r.at, at));
  return mark ? { ...(mark.hidden ? { hidden: true as const } : {}), ...(mark.shift ? { shift: mark.shift } : {}) } : {};
}

export interface NotatedRest {
  readonly kind: 'rest';
  readonly id: string;
  readonly onset: Fraction;
  readonly duration: WrittenDuration;
  /** Not drawn (the gap of a glide is time, not a rest). */
  readonly invisible?: boolean;
  /** The user hid it (ADR 0043): not printed, but still there for selecting. */
  readonly hidden?: boolean;
  /** Moved up (+) or down (−) by this many staff steps. */
  readonly shift?: number;
  readonly tuplet?: TupletMark;
}

export interface NotatedMeasureRest {
  readonly kind: 'measureRest';
  readonly id: string;
  readonly hidden?: boolean;
  readonly shift?: number;
}

export type NotatedItem = NotatedNote | NotatedRest | NotatedMeasureRest;

const BASES = [1, 2, 4, 8, 16, 32, 64] as const;

export function writtenValue(w: WrittenDuration): Fraction {
  // base value * (2 - 1/2^dots)
  const dotFactor = frac(2 ** (w.dots + 1) - 1, 2 ** w.dots);
  return frac(dotFactor.n, dotFactor.d * w.base);
}

/** All written values, largest first. */
const VALUES: { w: WrittenDuration; v: Fraction }[] = BASES.flatMap((base) =>
  [2, 1, 0].map((dots) => ({ w: { base, dots }, v: writtenValue({ base, dots }) })),
).sort((a, b) => (gt(a.v, b.v) ? -1 : 1));

const RATIOS: readonly TupletRatio[] = [
  { num: 3, numbase: 2 },
  { num: 5, numbase: 4 },
  { num: 7, numbase: 4 },
];

/** The value written for a length inside a tuplet (a triplet eighth, 1/12, is written as an eighth, 1/8). */
const writtenFor = (length: Fraction, r: TupletRatio | null): Fraction => (r ? frac(length.n * r.num, length.d * r.numbase) : length);

/** Which tuplet a non-dyadic length belongs to; null for ordinary lengths and for lengths no supported tuplet explains. */
export function tupletOf(length: Fraction): TupletRatio | null {
  if (isDyadic(length)) return null;
  return RATIOS.find((r) => isDyadic(writtenFor(length, r))) ?? null;
}

/** Real length of a written value inside a tuplet (null = no tuplet). */
export function realValue(w: WrittenDuration, r: TupletRatio | null | undefined): Fraction {
  const v = writtenValue(w);
  return r ? frac(v.n * r.numbase, v.d * r.num) : v;
}

const realOf = (it: NotatedItem): Fraction => (it.kind === 'measureRest' ? ZERO : realValue(it.duration, it.tuplet));

function assertNotatable(length: Fraction): void {
  if (!isDyadic(length) && !tupletOf(length)) {
    throw new Error(`Dauer ${fracToString(length)} lässt sich nicht schreiben (möglich sind Triolen, Quintolen und Septolen).`);
  }
  if (lt(writtenFor(length, tupletOf(length)), frac(1, 64)) && gt(length, ZERO)) {
    throw new Error(`Dauer ${fracToString(length)} ist kürzer als eine 64stel.`);
  }
}

/** Greedy: largest written value that fits, dots allowed. Used for notes. Tuplet lengths: see `decomposeTuplet`. */
export function decomposeNote(length: Fraction): WrittenDuration[] {
  if (!isDyadic(length)) throw new Error(`Dauer ${fracToString(length)} ist eine N-Tole.`);
  assertNotatable(length);
  const out: WrittenDuration[] = [];
  let rest = length;
  while (gt(rest, ZERO)) {
    const pick = VALUES.find((x) => le(x.v, rest));
    if (!pick) throw new Error(`Dauer ${fracToString(length)} nicht darstellbar.`);
    out.push(pick.w);
    rest = sub(rest, pick.v);
  }
  return out;
}

/** A length as written values: ordinary lengths as they are, tuplet lengths scaled (the ratio says which tuplet). */
export function decomposeTuplet(length: Fraction): { pieces: WrittenDuration[]; tuplet: TupletRatio | null } {
  assertNotatable(length);
  const tuplet = tupletOf(length);
  return { pieces: decomposeNote(writtenFor(length, tuplet)), tuplet };
}

/**
 * Rests: largest undotted value that fits AND starts on a multiple of its
 * own length (relative to the measure start), so rests show the beat.
 */
export function decomposeRest(posInMeasure: Fraction, length: Fraction): WrittenDuration[] {
  if (!isDyadic(length)) throw new Error(`Pause ${fracToString(length)} ist eine N-Tole.`);
  assertNotatable(length);
  const out: WrittenDuration[] = [];
  let pos = posInMeasure;
  let rest = length;
  while (gt(rest, ZERO)) {
    // Aligned to the beat if possible; after a tuplet the position may not be a multiple of anything: then just the largest value.
    const pick = VALUES.find((x) => x.w.dots === 0 && le(x.v, rest) && div(pos, x.v).d === 1) ?? VALUES.find((x) => x.w.dots === 0 && le(x.v, rest));
    if (!pick) throw new Error(`Pause ${fracToString(length)} nicht darstellbar.`);
    out.push(pick.w);
    pos = add(pos, pick.v);
    rest = sub(rest, pick.v);
  }
  return out;
}

/** Notates one voice into a list of items per measure. */
/** A stretch of time that is not shown as rests, e.g. the gap a glide travels through. */
export interface UnshownGap {
  readonly from: Fraction;
  readonly to: Fraction;
}

export function notateVoice(voice: Voice, measures: readonly Measure[], unshown: readonly UnshownGap[] = []): NotatedItem[][] {
  const result: NotatedItem[][] = [];
  let next = 0; // index of the first event that may still overlap upcoming measures

  for (const m of measures) {
    const items: NotatedItem[] = [];
    let cursor = m.start;
    let restCount = 0;

    const pushRests = (from: Fraction, to: Fraction) => {
      let onset = from;
      const invisible = unshown.some((g) => le(g.from, from) && le(to, g.to));
      const length = sub(to, from);
      const tuplet = tupletOf(length);
      const pieces = tuplet ? decomposeRest(ZERO, writtenFor(length, tuplet)) : decomposeRest(sub(from, m.gridStart), length);
      for (const w of pieces) {
        items.push({
          kind: 'rest',
          id: `${voice.id}-m${m.number}-r${++restCount}`,
          onset,
          duration: w,
          ...(invisible ? { invisible: true } : {}),
          ...restLook(voice, onset),
          ...(tuplet ? { tuplet: { ...tuplet, group: 0 } } : {}),
        });
        onset = add(onset, realValue(w, tuplet));
      }
    };

    // Skip events that ended before this measure.
    while (next < voice.events.length && le(eventEnd(voice.events[next]!), m.start)) next++;

    for (let i = next; i < voice.events.length; i++) {
      const ev: NoteEvent = voice.events[i]!;
      if (!lt(ev.onset, m.end)) break;
      const segStart = max(ev.onset, m.start);
      const segEnd = min(eventEnd(ev), m.end);
      if (lt(cursor, segStart)) pushRests(cursor, segStart);

      const { pieces, tuplet } = decomposeTuplet(sub(segEnd, segStart));
      const continuesIntoNextMeasure = gt(eventEnd(ev), m.end);
      let onset = segStart;
      pieces.forEach((w, k) => {
        items.push({
          kind: 'note',
          id: `${ev.id}-m${m.number}-${k + 1}`,
          eventId: ev.id,
          onset,
          duration: w,
          tones: ev.tones,
          tiedFromPrevious: k > 0 || gt(segStart, ev.onset),
          tiedToNext: k < pieces.length - 1 || continuesIntoNextMeasure,
          ...(ev.stem ? { stem: ev.stem } : {}),
          ...(tuplet ? { tuplet: { ...tuplet, group: 0 } } : {}),
        });
        onset = add(onset, realValue(w, tuplet));
      });
      cursor = segEnd;
    }

    if (lt(cursor, m.end)) pushRests(cursor, m.end);

    groupTuplets(items);
    const hasNotes = items.some((it) => it.kind === 'note');
    // A measure inside a glide gap stays invisible time instead of turning into a whole-measure rest.
    const hidden = items.some((it) => it.kind === 'rest' && it.invisible);
    result.push(hasNotes || hidden ? items : [{ kind: 'measureRest', id: `${voice.id}-m${m.number}-mr`, ...restLook(voice, m.start) }]);
  }
  return result;
}

/**
 * Numbers the tuplet groups of one measure in place: neighbouring items of the same ratio form a group
 * until their real lengths add up to a power of two (three triplet eighths = one quarter).
 */
function groupTuplets(items: NotatedItem[]): void {
  let group = 0;
  let open: TupletRatio | null = null;
  let sum = ZERO;
  items.forEach((it, i) => {
    const t = it.kind === 'measureRest' ? undefined : it.tuplet;
    if (!t) {
      open = null;
      return;
    }
    if (!open || open.num !== t.num || open.numbase !== t.numbase) {
      group++;
      open = t;
      sum = ZERO;
    }
    sum = add(sum, realOf(it));
    items[i] = { ...it, tuplet: { num: t.num, numbase: t.numbase, group } } as NotatedItem;
    if (isDyadic(sum)) open = null; // the group is complete; a following tuplet item starts the next one
  });
}

/** Tuplet groups of a measure as inclusive index ranges into `items`. */
export function tupletGroups(items: readonly NotatedItem[]): { start: number; end: number; ratio: TupletRatio }[] {
  const out: { start: number; end: number; ratio: TupletRatio }[] = [];
  items.forEach((it, i) => {
    const t = it.kind === 'measureRest' ? undefined : it.tuplet;
    if (!t) return;
    const last = out[out.length - 1];
    if (last && items[last.end]!.kind !== 'measureRest' && (items[last.end] as NotatedNote).tuplet?.group === t.group) last.end = i;
    else out.push({ start: i, end: i, ratio: { num: t.num, numbase: t.numbase } });
  });
  return out;
}

/** Sum of real durations of a measure's items (for tests and sanity checks). */
export function itemsLength(items: readonly NotatedItem[], measureLength: Fraction): Fraction {
  if (items.length === 1 && items[0]!.kind === 'measureRest') return measureLength;
  return items.reduce((acc, it) => add(acc, realOf(it)), ZERO);
}

/** Length of one beaming beat for a meter. */
export function beatLength(sig: TimeSignature): Fraction {
  return sig.unit === 8 && sig.count % 3 === 0 ? frac(3, 8) : frac(1, sig.unit);
}

/**
 * Beam groups within one measure: [firstIndex, lastIndex] ranges into
 * `items` (inclusive), each with at least two notes.
 */
export function beamGroups(items: readonly NotatedItem[], measure: Measure): [number, number][] {
  const beat = beatLength(measure.sig);
  const beatOf = (t: Fraction) => {
    const q = div(sub(t, measure.gridStart), beat);
    return Math.floor(q.n / q.d);
  };
  const groups: [number, number][] = [];
  const tupletOfItem = (it: NotatedItem): number => (it.kind === 'measureRest' ? 0 : (it.tuplet?.group ?? 0));
  let start = -1;
  let startBeat = -1;
  let startTuplet = 0;
  const close = (end: number) => {
    if (start >= 0 && end > start) groups.push([start, end]);
    start = -1;
  };
  items.forEach((it, i) => {
    const beamable = it.kind === 'note' && it.duration.base >= 8;
    if (!beamable) return close(i - 1);
    const b = beatOf(it.onset);
    const endsInBeat = beatOf(sub(add(it.onset, realOf(it)), frac(1, 1024))) === b;
    if (start >= 0 && (b !== startBeat || tupletOfItem(it) !== startTuplet)) close(i - 1); // a beam never crosses a tuplet bracket
    if (!endsInBeat) return close(i - 1);
    if (start < 0) {
      start = i;
      startBeat = b;
      startTuplet = tupletOfItem(it);
    }
  });
  close(items.length - 1);
  return groups;
}

const BASE_NAMES: Record<number, string> = {
  1: 'Ganze',
  2: 'Halbe',
  4: 'Viertel',
  8: 'Achtel',
  16: 'Sechzehntel',
  32: 'Zweiunddreißigstel',
  64: 'Vierundsechzigstel',
};

const TUPLET_NAMES: Record<number, string> = { 3: 'Triole', 5: 'Quintole', 7: 'Septole' };

/** German musician-readable name: 3/4 → "punktierte Halbe", 5/8 → "Halbe + Achtel". */
export function durationName(length: Fraction): string {
  const tuplet = tupletOf(length);
  if (tuplet) {
    const name = TUPLET_NAMES[tuplet.num] ?? 'N-Tole';
    return `${decomposeNote(writtenFor(length, tuplet)).map((w) => `${['', 'punktierte ', 'doppelt punktierte '][w.dots]}${BASE_NAMES[w.base]}`).join(' + ')} (${name})`;
  }
  if (!isDyadic(length)) return `${fracToString(length)} (N-Tole)`;
  return decomposeNote(length)
    .map((w) => `${['', 'punktierte ', 'doppelt punktierte '][w.dots]}${BASE_NAMES[w.base]}`)
    .join(' + ');
}
