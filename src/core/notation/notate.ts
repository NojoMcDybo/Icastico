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
 * - Tuplets (non power-of-two denominators) are not supported yet.
 */
import {
  type Fraction,
  ZERO,
  add,
  div,
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

export interface NotatedNote {
  readonly kind: 'note';
  readonly id: string;
  readonly eventId: string;
  readonly onset: Fraction;
  readonly duration: WrittenDuration;
  readonly tones: readonly Tone[];
  readonly tiedFromPrevious: boolean;
  readonly tiedToNext: boolean;
}

export interface NotatedRest {
  readonly kind: 'rest';
  readonly id: string;
  readonly onset: Fraction;
  readonly duration: WrittenDuration;
  /** Not drawn (the gap of a glide is time, not a rest). */
  readonly invisible?: boolean;
}

export interface NotatedMeasureRest {
  readonly kind: 'measureRest';
  readonly id: string;
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

function assertNotatable(length: Fraction): void {
  if (!isDyadic(length)) {
    throw new Error(`Dauer ${fracToString(length)} braucht N-Tolen – noch nicht unterstützt.`);
  }
  if (lt(length, frac(1, 64)) && gt(length, ZERO)) {
    throw new Error(`Dauer ${fracToString(length)} ist kürzer als eine 64stel.`);
  }
}

/** Greedy: largest written value that fits, dots allowed. Used for notes. */
export function decomposeNote(length: Fraction): WrittenDuration[] {
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

/**
 * Rests: largest undotted value that fits AND starts on a multiple of its
 * own length (relative to the measure start), so rests show the beat.
 */
export function decomposeRest(posInMeasure: Fraction, length: Fraction): WrittenDuration[] {
  assertNotatable(length);
  const out: WrittenDuration[] = [];
  let pos = posInMeasure;
  let rest = length;
  while (gt(rest, ZERO)) {
    const pick = VALUES.find((x) => x.w.dots === 0 && le(x.v, rest) && div(pos, x.v).d === 1);
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
      for (const w of decomposeRest(sub(from, m.gridStart), sub(to, from))) {
        items.push({ kind: 'rest', id: `${voice.id}-m${m.number}-r${++restCount}`, onset, duration: w, ...(invisible ? { invisible: true } : {}) });
        onset = add(onset, writtenValue(w));
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

      const pieces = decomposeNote(sub(segEnd, segStart));
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
        });
        onset = add(onset, writtenValue(w));
      });
      cursor = segEnd;
    }

    if (lt(cursor, m.end)) pushRests(cursor, m.end);

    const hasNotes = items.some((it) => it.kind === 'note');
    result.push(hasNotes ? items : [{ kind: 'measureRest', id: `${voice.id}-m${m.number}-mr` }]);
  }
  return result;
}

/** Sum of written durations of a measure's items (for tests and sanity checks). */
export function itemsLength(items: readonly NotatedItem[], measureLength: Fraction): Fraction {
  if (items.length === 1 && items[0]!.kind === 'measureRest') return measureLength;
  return items.reduce((acc, it) => (it.kind === 'measureRest' ? acc : add(acc, writtenValue(it.duration))), ZERO);
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
  let start = -1;
  let startBeat = -1;
  const close = (end: number) => {
    if (start >= 0 && end > start) groups.push([start, end]);
    start = -1;
  };
  items.forEach((it, i) => {
    const beamable = it.kind === 'note' && it.duration.base >= 8;
    if (!beamable) return close(i - 1);
    const b = beatOf(it.onset);
    const endsInBeat = beatOf(sub(add(it.onset, writtenValue(it.duration)), frac(1, 1024))) === b;
    if (start >= 0 && b !== startBeat) close(i - 1);
    if (!endsInBeat) return close(i - 1);
    if (start < 0) {
      start = i;
      startBeat = b;
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

/** German musician-readable name: 3/4 → "punktierte Halbe", 5/8 → "Halbe + Achtel". */
export function durationName(length: Fraction): string {
  if (!isDyadic(length)) return `${fracToString(length)} (N-Tole)`;
  return decomposeNote(length)
    .map((w) => `${['', 'punktierte ', 'doppelt punktierte '][w.dots]}${BASE_NAMES[w.base]}`)
    .join(' + ');
}
