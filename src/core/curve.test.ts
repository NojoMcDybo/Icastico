import { describe, expect, it } from 'vitest';
import { type Curve, addPointAt, curveAt, curveProblem, defaultCurve, isDefaultCurve, sampleCurve, tidyCurve, volumeMark } from './curve';

describe('curves', () => {
  it('the default curves are valid and straight', () => {
    expect(curveProblem('level', defaultCurve('level'))).toBeNull();
    expect(curveProblem('glide', defaultCurve('glide'))).toBeNull();
    expect(curveAt(defaultCurve('level'), 0.4)).toBe(1);
    expect(curveAt(defaultCurve('glide'), 0.25)).toBeCloseTo(0.25, 10);
  });

  it('passes through every point and never overshoots between them', () => {
    const c: Curve = [{ x: 0, y: 0 }, { x: 0.2, y: 0.9 }, { x: 0.7, y: 0.95 }, { x: 1, y: 0.1 }];
    for (const p of c) expect(curveAt(c, p.x)).toBeCloseTo(p.y, 10);
    for (const y of sampleCurve(c, 200)) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(0.95 + 1e-9);
    }
    // rising up to the peak and falling afterwards: no dip between 0 and 0.2
    const rising = sampleCurve(c, 200).slice(0, 41);
    expect(rising.every((y, i) => i === 0 || y >= rising[i - 1]! - 1e-12)).toBe(true);
  });

  it('pulling one point changes the line around it, smoothly', () => {
    const a: Curve = [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }];
    const b: Curve = [{ x: 0, y: 0 }, { x: 0.5, y: 0.1 }, { x: 1, y: 1 }];
    expect(curveAt(a, 0.3)).toBeGreaterThan(curveAt(b, 0.3));
    expect(curveAt(a, 0.75)).toBeGreaterThan(curveAt(b, 0.75));
  });

  it('checks curves', () => {
    expect(curveProblem('level', [{ x: 0, y: 1 }])).toMatch(/Punkte/);
    expect(curveProblem('level', [{ x: 0, y: 1 }, { x: 0.5, y: 1 }, { x: 0.5, y: 1 }, { x: 1, y: 1 }])).toMatch(/von links nach rechts/);
    expect(curveProblem('glide', [{ x: 0, y: 0.2 }, { x: 1, y: 1 }])).toMatch(/Übergang/);
    expect(curveProblem('level', [{ x: 0, y: Number.NaN }, { x: 1, y: 1 }])).toMatch(/zwischen 0 und 1/);
  });

  it('adds a point on the line without changing its shape, and tidies input', () => {
    const c: Curve = [{ x: 0, y: 0 }, { x: 0.5, y: 0.9 }, { x: 1, y: 1 }];
    const more = addPointAt('level', c, 0.25);
    expect(more).toHaveLength(4);
    expect(curveAt(more, 0.25)).toBeCloseTo(curveAt(c, 0.25), 2);
    expect(addPointAt('level', c, 0.5)).toBe(c); // there is a point already
    const messy = tidyCurve('glide', [{ x: 1, y: 0.3 }, { x: 0.5004, y: 0.123456 }, { x: -3, y: 9 }]);
    expect(messy).toEqual([{ x: 0, y: 0 }, { x: 0.5, y: 0.123 }, { x: 1, y: 1 }]);
    expect(curveProblem('glide', messy)).toBeNull();
    expect(isDefaultCurve('glide', tidyCurve('glide', []))).toBe(true);
  });

  it('names the loudness like a musician', () => {
    expect(volumeMark(1)).toBe('ppp');
    expect(volumeMark(100)).toBe('f');
    expect(volumeMark(127)).toBe('fff');
  });
});
