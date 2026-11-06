/**
 * Which positions and lengths the notation can write (shared by every importer).
 */
import { type Fraction, ZERO, lt } from '../time';
import { decomposeTuplet } from '../notation/notate';

/** Positions Icastico can place: a 1/64 grid, or the same with a factor 3, 5 or 7 (triplets, quintuplets, septuplets; ADR 0020). */
export function placeable(t: Fraction): boolean {
  let d = t.d;
  let twos = 0;
  while (d % 2 === 0) {
    d /= 2;
    twos++;
  }
  return (d === 1 || d === 3 || d === 5 || d === 7) && 2 ** twos <= 256;
}

/** A length the notation can write (power of two ≥ 1/64, or a supported tuplet). */
export function writable(length: Fraction): boolean {
  if (!lt(ZERO, length)) return false;
  try {
    decomposeTuplet(length);
    return true;
  } catch {
    return false;
  }
}
