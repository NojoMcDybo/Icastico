/**
 * Exact musical time as rational numbers.
 *
 * Unit: one whole note = 1. A quarter note is 1/4, a dotted eighth 3/16,
 * an eighth-note triplet 1/12. Floating point is never used for musical
 * time, because 1/3 + 1/3 + 1/3 must equal exactly 1 (tuplets, quantisation).
 */
export interface Fraction {
  readonly n: number;
  readonly d: number;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export function frac(n: number, d = 1): Fraction {
  if (!Number.isInteger(n) || !Number.isInteger(d)) {
    throw new Error(`frac(): integers required, got ${n}/${d}`);
  }
  if (d === 0) throw new Error('frac(): denominator must not be 0');
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}

/** Parses "3/8", "1", "-1/4". */
export function parseFrac(text: string): Fraction {
  const m = /^\s*(-?\d+)\s*(?:\/\s*(\d+))?\s*$/.exec(text);
  if (!m) throw new Error(`Invalid fraction: "${text}"`);
  return frac(Number(m[1]), m[2] ? Number(m[2]) : 1);
}

export const ZERO: Fraction = frac(0);

export const add = (a: Fraction, b: Fraction): Fraction => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Fraction, b: Fraction): Fraction => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Fraction, b: Fraction): Fraction => frac(a.n * b.n, a.d * b.d);
export const div = (a: Fraction, b: Fraction): Fraction => {
  if (b.n === 0) throw new Error('Division by zero');
  return frac(a.n * b.d, a.d * b.n);
};

/** -1 if a < b, 0 if equal, 1 if a > b. */
export function compare(a: Fraction, b: Fraction): -1 | 0 | 1 {
  const diff = a.n * b.d - b.n * a.d;
  return diff < 0 ? -1 : diff > 0 ? 1 : 0;
}

export const eq = (a: Fraction, b: Fraction): boolean => compare(a, b) === 0;
export const lt = (a: Fraction, b: Fraction): boolean => compare(a, b) < 0;
export const le = (a: Fraction, b: Fraction): boolean => compare(a, b) <= 0;
export const gt = (a: Fraction, b: Fraction): boolean => compare(a, b) > 0;
export const ge = (a: Fraction, b: Fraction): boolean => compare(a, b) >= 0;
export const min = (a: Fraction, b: Fraction): Fraction => (lt(a, b) ? a : b);
export const max = (a: Fraction, b: Fraction): Fraction => (gt(a, b) ? a : b);
export const isZero = (a: Fraction): boolean => a.n === 0;
export const toNumber = (a: Fraction): number => a.n / a.d;
export const fracToString = (a: Fraction): string => (a.d === 1 ? `${a.n}` : `${a.n}/${a.d}`);

/** True if the denominator is a power of two, i.e. notatable without tuplets. */
export function isDyadic(a: Fraction): boolean {
  return (a.d & (a.d - 1)) === 0;
}
