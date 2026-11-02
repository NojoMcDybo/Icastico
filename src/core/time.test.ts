import { describe, expect, it } from 'vitest';
import { add, compare, frac, isDyadic, parseFrac, sub, toNumber, ZERO } from './time';

describe('Fraction', () => {
  it('normalises', () => {
    expect(frac(2, 4)).toEqual({ n: 1, d: 2 });
    expect(frac(3, -6)).toEqual({ n: -1, d: 2 });
    expect(frac(0, 5)).toEqual({ n: 0, d: 1 });
  });

  it('adds triplets exactly to a whole', () => {
    const third = frac(1, 3);
    expect(add(add(third, third), third)).toEqual(frac(1));
  });

  it('compares and subtracts', () => {
    expect(compare(frac(3, 8), frac(1, 2))).toBe(-1);
    expect(compare(frac(2, 4), frac(1, 2))).toBe(0);
    expect(sub(frac(1), frac(1, 4))).toEqual(frac(3, 4));
    expect(toNumber(frac(3, 4))).toBe(0.75);
  });

  it('parses text', () => {
    expect(parseFrac('3/8')).toEqual(frac(3, 8));
    expect(parseFrac('1')).toEqual(frac(1));
    expect(() => parseFrac('drei Achtel')).toThrow();
  });

  it('detects tuplet durations', () => {
    expect(isDyadic(frac(3, 16))).toBe(true);
    expect(isDyadic(frac(1, 12))).toBe(false);
    expect(isDyadic(ZERO)).toBe(true);
  });

  it('rejects division by zero in construction', () => {
    expect(() => frac(1, 0)).toThrow();
  });
});
