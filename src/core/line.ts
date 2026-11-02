/**
 * Tiny text notation for writing music in code and tests:
 *
 *   "G4:1/4 A4:1/4 r:1/4 [G2,B2,D3]:1/2"
 *
 * Tokens are separated by whitespace; "|" is allowed as a visual barline and
 * ignored (barlines are derived from the meter anyway). "r" is a rest, which
 * simply leaves a gap on the timeline.
 */
import { type Fraction, ZERO, add, parseFrac } from './time';
import { parsePitch } from './pitch';
import type { NoteEvent } from './model';

export function parseLine(spec: string, idPrefix: string, start: Fraction = ZERO): NoteEvent[] {
  const events: NoteEvent[] = [];
  let cursor = start;
  let counter = 0;
  for (const token of spec.split(/\s+/).filter((t) => t && t !== '|')) {
    const colon = token.lastIndexOf(':');
    if (colon < 0) throw new Error(`Token without duration: "${token}"`);
    const head = token.slice(0, colon);
    const duration = parseFrac(token.slice(colon + 1));
    if (head !== 'r') {
      const names = head.startsWith('[') && head.endsWith(']') ? head.slice(1, -1).split(',') : [head];
      events.push({
        id: `${idPrefix}${++counter}`,
        onset: cursor,
        duration,
        pitches: names.map(parsePitch),
      });
    }
    cursor = add(cursor, duration);
  }
  return events;
}
