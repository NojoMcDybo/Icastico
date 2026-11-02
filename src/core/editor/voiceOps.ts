/**
 * Low-level timeline operations on one voice's event list. Pure functions;
 * they keep the invariant "sorted by onset, non-overlapping".
 */
import { type Fraction, add, compare, ge, gt, le, lt, sub } from '../time';
import { type NoteEvent, eventEnd } from '../model';

/**
 * Overwrite semantics (Finale/MuseScore): clears [start, end).
 * An event starting before `start` is shortened to end at `start`;
 * everything of other overlapping events is removed (becomes a rest).
 */
export function clearRange(events: readonly NoteEvent[], start: Fraction, end: Fraction): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (const ev of events) {
    if (le(eventEnd(ev), start) || ge(ev.onset, end)) out.push(ev);
    else if (lt(ev.onset, start)) out.push({ ...ev, duration: sub(start, ev.onset) });
  }
  return out;
}

/**
 * Insert semantics: everything from `at` on moves later by `by`.
 * An event straddling `at` is shortened to end at `at`.
 */
export function shiftFrom(events: readonly NoteEvent[], at: Fraction, by: Fraction): NoteEvent[] {
  return events.map((ev) => {
    if (ge(ev.onset, at)) return { ...ev, onset: add(ev.onset, by) };
    if (gt(eventEnd(ev), at)) return { ...ev, duration: sub(at, ev.onset) };
    return ev;
  });
}

/** Makes room for `length` at `at`, by overwriting or by shifting. */
export function makeRoom(
  events: readonly NoteEvent[],
  at: Fraction,
  length: Fraction,
  insert: boolean,
): NoteEvent[] {
  return insert ? shiftFrom(events, at, length) : clearRange(events, at, add(at, length));
}

export function insertSorted(events: readonly NoteEvent[], ev: NoteEvent): NoteEvent[] {
  const out = [...events, ev];
  out.sort((a, b) => compare(a.onset, b.onset));
  return out;
}
