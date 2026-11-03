/**
 * The score model: the single source of truth.
 *
 * Design rules (see docs/architecture.md):
 * - Time-based, not measure-based: events sit on a timeline (onset +
 *   duration). Barlines, ties across barlines and rests are DERIVED from the
 *   meter by the notation layer. Inserting a note shifts the music, it does
 *   not "overflow" a measure.
 * - Gaps in a voice are rests. There are no explicit rest events.
 * - Pitches are sounding pitch.
 * - Immutable: changes produce a new Score (commands, undo = keep old object).
 * - No pixels, no rendering concerns in here.
 */
import { type Fraction, ZERO, add, compare, div, frac, gt, isZero, le, lt, sub } from './time';
import type { Pitch } from './pitch';
import { getInstrument, type InstrumentId } from './instruments';

export interface TimeSignature {
  /** Beats per measure, e.g. 3 in 3/4. */
  readonly count: number;
  /** Beat unit, e.g. 4 in 3/4. */
  readonly unit: number;
}

export interface MeterChange {
  readonly at: Fraction;
  readonly sig: TimeSignature;
}

export interface KeyChange {
  readonly at: Fraction;
  /** Circle of fifths: 1 = G major / E minor, -1 = F major / D minor. */
  readonly fifths: number;
}

/**
 * One sounding note of an event. The id is permanent and unique within the
 * score (ADR 0011): editing the pitch, adding or removing other tones of the
 * chord never changes it. Array position or MIDI number are NOT identities.
 */
export interface Tone {
  readonly id: string;
  readonly pitch: Pitch;
}

/** A note or chord. All tones share onset and duration; sorted by sounding pitch. */
export interface NoteEvent {
  readonly id: string;
  readonly onset: Fraction;
  readonly duration: Fraction;
  readonly tones: readonly Tone[];
}

export interface Voice {
  readonly id: string;
  /** Index into the instrument's staves (piano: 0 = right hand, 1 = left hand). */
  readonly staff: number;
  /** Sorted by onset, non-overlapping. */
  readonly events: readonly NoteEvent[];
}

export interface Part {
  readonly id: string;
  readonly name: string;
  readonly instrument: InstrumentId;
  readonly voices: readonly Voice[];
}

export interface Score {
  readonly title: string;
  readonly composer?: string;
  /** Sorted by `at`; the first entry must be at 0. */
  readonly meter: readonly MeterChange[];
  /** Sorted by `at`; the first entry must be at 0. */
  readonly keys: readonly KeyChange[];
  /**
   * Upbeat (Auftakt): length of the incomplete first measure. Absent = none.
   * Must be shorter than a full measure of the first meter.
   */
  readonly pickup?: Fraction;
  readonly parts: readonly Part[];
}

export interface Measure {
  /** 0-based index. */
  readonly index: number;
  /** Number as printed: 1 = first full measure, 0 = upbeat (Auftakt). */
  readonly number: number;
  readonly start: Fraction;
  readonly end: Fraction;
  /**
   * Where the beat grid of this measure starts. Equal to `start`, except for
   * an upbeat, which is the END of a full measure: its grid starts earlier.
   */
  readonly gridStart: Fraction;
  readonly sig: TimeSignature;
  /** Key in effect at the start of this measure. */
  readonly fifths: number;
}

export const measureLength = (sig: TimeSignature): Fraction => frac(sig.count, sig.unit);

export const eventEnd = (e: NoteEvent): Fraction => add(e.onset, e.duration);

/** End of the last event in the score (0 for an empty score). */
export function contentEnd(score: Score): Fraction {
  let end = ZERO;
  for (const part of score.parts) {
    for (const voice of part.voices) {
      const last = voice.events[voice.events.length - 1];
      if (last && gt(eventEnd(last), end)) end = eventEnd(last);
    }
  }
  return end;
}

function entryAt<T extends { at: Fraction }>(list: readonly T[], time: Fraction): T {
  let current = list[0]!;
  for (const entry of list) {
    if (le(entry.at, time)) current = entry;
    else break;
  }
  return current;
}

/** Key signature (fifths) in effect at a time. */
export const keyAt = (score: Score, time: Fraction): number => entryAt(score.keys, time).fifths;

/** Time signature in effect at a time. */
export const meterAt = (score: Score, time: Fraction): TimeSignature => entryAt(score.meter, time).sig;

/**
 * Derives the measures from the meter map. Produces at least `minMeasures`
 * measures, always enough to hold all content, and – if given – a measure
 * that contains `coverTime` (so an input caret after the last note has room).
 */
export function measuresOf(score: Score, minMeasures = 1, coverTime?: Fraction): Measure[] {
  const end = contentEnd(score);
  const result: Measure[] = [];
  let start = ZERO;
  let index = 0;
  const pickup = score.pickup && gt(score.pickup, ZERO) ? score.pickup : null;
  if (pickup) {
    const sig = score.meter[0]!.sig;
    const fifths = score.keys[0]!.fifths;
    result.push({ index, number: 0, start, end: pickup, gridStart: sub(pickup, measureLength(sig)), sig, fifths });
    start = pickup;
    index++;
  }
  while (index < minMeasures || lt(start, end) || (coverTime !== undefined && le(start, coverTime))) {
    const sig = entryAt(score.meter, start).sig;
    const fifths = entryAt(score.keys, start).fifths;
    const mEnd = add(start, measureLength(sig));
    result.push({ index, number: pickup ? index : index + 1, start, end: mEnd, gridStart: start, sig, fifths });
    start = mEnd;
    index++;
  }
  return result;
}

/** Start time of the measure with this printed number (0 = upbeat). */
export function measureStart(score: Score, number: number): Fraction | null {
  const ms = measuresOf(score, number + 1);
  return ms.find((m) => m.number === number)?.start ?? null;
}

/** A tone id not used by any tone of the score yet, derived from its event: "<event>-t1", "-t2" … */
export function freshToneId(score: Score, eventId: string): string {
  const used = new Set(score.parts.flatMap((p) => p.voices.flatMap((v) => v.events.flatMap((e) => e.tones.map((t) => t.id)))));
  let n = 1;
  while (used.has(`${eventId}-t${n}`)) n++;
  return `${eventId}-t${n}`;
}

/** IDs end up as XML ids in MEI/SVG, so they must be XML-safe. */
const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Returns human-readable problems (German, shown to the user). Empty = valid. */
export function validateScore(score: Score): string[] {
  const problems: string[] = [];
  if (score.meter.length === 0 || !isZero(score.meter[0]!.at)) {
    problems.push('Taktart fehlt am Anfang.');
  }
  if (score.keys.length === 0 || !isZero(score.keys[0]!.at)) {
    problems.push('Tonart fehlt am Anfang.');
  }
  if (problems.length > 0) return problems;

  const pickup = score.pickup;
  if (pickup && (lt(pickup, ZERO) || !lt(pickup, measureLength(score.meter[0]!.sig)))) {
    problems.push('Der Auftakt muss kürzer als ein ganzer Takt sein.');
  }

  // Meter changes must fall on barlines of the preceding meter
  // (with an upbeat, the first barline is at the end of the upbeat).
  for (let i = 1; i < score.meter.length; i++) {
    const prev = score.meter[i - 1]!;
    const here = score.meter[i]!;
    const from = i === 1 && pickup && gt(pickup, ZERO) ? pickup : prev.at;
    const measures = div(sub(here.at, from), measureLength(prev.sig));
    const minimum = from === prev.at ? 1 : 0;
    if (measures.d !== 1 || measures.n < minimum) {
      problems.push(`Taktwechsel bei ${here.at.n}/${here.at.d} liegt nicht auf einem Taktstrich.`);
    }
  }

  const ids = new Set<string>();
  const toneIds = new Set<string>();
  for (const part of score.parts) {
    const instrument = getInstrument(part.instrument);
    if (!ID_PATTERN.test(part.id)) problems.push(`Ungültige Part-ID "${part.id}".`);
    for (const voice of part.voices) {
      if (!ID_PATTERN.test(voice.id)) problems.push(`${part.name}: ungültige Stimm-ID "${voice.id}".`);
      if (voice.staff < 0 || voice.staff >= instrument.staves.length) {
        problems.push(`${part.name}: Stimme ${voice.id} verweist auf nicht vorhandenes System ${voice.staff}.`);
      }
      let cursor = ZERO;
      for (const ev of voice.events) {
        if (ids.has(ev.id)) problems.push(`Doppelte Event-ID ${ev.id}.`);
        if (!ID_PATTERN.test(ev.id)) problems.push(`Ungültige Event-ID "${ev.id}" (erlaubt: Buchstabe, dann Buchstaben/Ziffern/_/-).`);
        ids.add(ev.id);
        if (!gt(ev.duration, ZERO)) problems.push(`${part.name}: Event ${ev.id} hat keine positive Dauer.`);
        if (compare(ev.onset, ZERO) < 0) problems.push(`${part.name}: Event ${ev.id} beginnt vor dem Anfang.`);
        if (lt(ev.onset, cursor)) {
          problems.push(`${part.name}: Event ${ev.id} überlappt mit dem vorherigen Event derselben Stimme.`);
        }
        if (ev.tones.length === 0) problems.push(`${part.name}: Event ${ev.id} hat keine Tonhöhe.`);
        for (const tone of ev.tones) {
          if (toneIds.has(tone.id)) problems.push(`Doppelte Ton-ID ${tone.id}.`);
          if (!ID_PATTERN.test(tone.id)) problems.push(`Ungültige Ton-ID "${tone.id}" (erlaubt: Buchstabe, dann Buchstaben/Ziffern/_/-).`);
          toneIds.add(tone.id);
        }
        cursor = eventEnd(ev);
      }
    }
  }
  return problems;
}
