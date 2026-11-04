/**
 * Curves (ADR 0016): a smooth line through a few points that the user pulls into shape.
 *
 * Used twice: as the loudness of a note over its length (`Tone.curve`, y = how loud, 1 = full)
 * and as the course of a glide (`Link.curve`, y = how far the pitch has travelled, 0 = start
 * note, 1 = target note). x always runs from 0 (start) to 1 (end) of the note or of the glide.
 *
 * The line passes through every point and never overshoots between two points
 * (monotone cubic interpolation, Fritsch–Carlson): pulling one point bends the whole line
 * smoothly, but it does not wobble.
 */

export interface CurvePoint {
  readonly x: number;
  readonly y: number;
}

export type Curve = readonly CurvePoint[];

export type CurveKind = 'level' | 'glide';

export const MIN_CURVE_POINTS = 2;
export const MAX_CURVE_POINTS = 16;

/** The straight line a curve starts as: full loudness, or an even glide. */
export const defaultCurve = (kind: CurveKind): Curve =>
  kind === 'level' ? [{ x: 0, y: 1 }, { x: 1, y: 1 }] : [{ x: 0, y: 0 }, { x: 1, y: 1 }];

export const isDefaultCurve = (kind: CurveKind, curve: Curve | undefined): boolean => {
  if (!curve) return true;
  const d = defaultCurve(kind);
  return curve.length === d.length && curve.every((p, i) => p.x === d[i]!.x && p.y === d[i]!.y);
};

/** Why a curve is not usable (German); null = fine. */
export function curveProblem(kind: CurveKind, curve: Curve): string | null {
  if (curve.length < MIN_CURVE_POINTS || curve.length > MAX_CURVE_POINTS) return `Eine Kurve hat ${MIN_CURVE_POINTS} bis ${MAX_CURVE_POINTS} Punkte.`;
  for (const p of curve) {
    if (!(Number.isFinite(p.x) && Number.isFinite(p.y)) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return 'Die Punkte einer Kurve liegen zwischen 0 und 1.';
  }
  if (curve[0]!.x !== 0 || curve[curve.length - 1]!.x !== 1) return 'Eine Kurve beginnt bei 0 und endet bei 1.';
  for (let i = 1; i < curve.length; i++) if (!(curve[i]!.x > curve[i - 1]!.x)) return 'Die Punkte einer Kurve müssen von links nach rechts folgen.';
  if (kind === 'glide' && (curve[0]!.y !== 0 || curve[curve.length - 1]!.y !== 1)) return 'Ein Übergang beginnt beim ersten Ton (0) und endet beim zweiten (1).';
  return null;
}

/** Rounds to three decimals – enough to draw with, short in the file. */
export const roundCoord = (v: number): number => Math.round(v * 1000) / 1000;

/** A cleaned-up copy: sorted, rounded, clamped, ends fixed in place. Not valid input gives the default curve. */
export function tidyCurve(kind: CurveKind, points: readonly CurvePoint[]): Curve {
  const clamp = (v: number) => Math.max(0, Math.min(1, roundCoord(v)));
  const sorted = [...points].map((p) => ({ x: clamp(p.x), y: clamp(p.y) })).sort((a, b) => a.x - b.x);
  const inner = sorted.filter((p) => p.x > 0 && p.x < 1);
  const first = sorted.find((p) => p.x === 0);
  const last = [...sorted].reverse().find((p) => p.x === 1);
  const d = defaultCurve(kind);
  const result = [
    { x: 0, y: kind === 'glide' ? 0 : (first?.y ?? d[0]!.y) },
    ...inner.filter((p, i) => i === 0 || p.x > inner[i - 1]!.x),
    { x: 1, y: kind === 'glide' ? 1 : (last?.y ?? d[1]!.y) },
  ];
  return result.slice(0, MAX_CURVE_POINTS);
}

/** Value of the curve at x (0…1). The curve must be valid. */
export function curveAt(curve: Curve, x: number): number {
  const n = curve.length;
  if (n === 0) return 1;
  if (x <= curve[0]!.x) return curve[0]!.y;
  if (x >= curve[n - 1]!.x) return curve[n - 1]!.y;
  let i = 0;
  while (curve[i + 1]!.x < x) i++;
  const p0 = curve[i]!;
  const p1 = curve[i + 1]!;
  const h = p1.x - p0.x;
  const t = (x - p0.x) / h;
  const m = slopes(curve);
  const t2 = t * t;
  const t3 = t2 * t;
  const y = (2 * t3 - 3 * t2 + 1) * p0.y + (t3 - 2 * t2 + t) * h * m[i]! + (-2 * t3 + 3 * t2) * p1.y + (t3 - t2) * h * m[i + 1]!;
  return Math.max(0, Math.min(1, y));
}

/** Tangent slopes at the points: weighted harmonic mean of the two neighbouring secants (Fritsch–Butland), zero at a turning point. */
function slopes(curve: Curve): number[] {
  const n = curve.length;
  const width = curve.slice(1).map((p, i) => p.x - curve[i]!.x);
  const secant = curve.slice(1).map((p, i) => (p.y - curve[i]!.y) / width[i]!);
  const m: number[] = [secant[0]!];
  for (let i = 1; i < n - 1; i++) {
    const a = secant[i - 1]!;
    const b = secant[i]!;
    const w1 = 2 * width[i]! + width[i - 1]!;
    const w2 = width[i]! + 2 * width[i - 1]!;
    m.push(a * b <= 0 ? 0 : (w1 + w2) / (w1 / a + w2 / b));
  }
  m.push(secant[n - 2]!);
  return m;
}

/** `count` + 1 evenly spaced values from x = 0 to x = 1. */
export const sampleCurve = (curve: Curve, count: number): number[] => Array.from({ length: count + 1 }, (_, i) => curveAt(curve, i / count));

/** A point on the line at x, added to the curve (the shape stays as it is until the point is moved). */
export function addPointAt(kind: CurveKind, curve: Curve, x: number): Curve {
  const px = roundCoord(Math.max(0.001, Math.min(0.999, x)));
  if (curve.length >= MAX_CURVE_POINTS || curve.some((p) => Math.abs(p.x - px) < 0.01)) return curve;
  return tidyCurve(kind, [...curve, { x: px, y: curveAt(curve, px) }]);
}

/** Named starting shapes offered in the menu. */
export const SHAPES: Record<CurveKind, readonly { readonly name: string; readonly curve: Curve }[]> = {
  level: [
    { name: 'Gerade', curve: defaultCurve('level') },
    { name: 'Einblenden', curve: [{ x: 0, y: 0 }, { x: 0.4, y: 0.8 }, { x: 1, y: 1 }] },
    { name: 'Ausblenden', curve: [{ x: 0, y: 1 }, { x: 0.6, y: 0.8 }, { x: 1, y: 0 }] },
    { name: 'Ein & aus', curve: [{ x: 0, y: 0 }, { x: 0.3, y: 1 }, { x: 0.7, y: 1 }, { x: 1, y: 0 }] },
  ],
  glide: [
    { name: 'Gerade', curve: defaultCurve('glide') },
    { name: 'Erst langsam', curve: [{ x: 0, y: 0 }, { x: 0.5, y: 0.15 }, { x: 1, y: 1 }] },
    { name: 'Erst schnell', curve: [{ x: 0, y: 0 }, { x: 0.5, y: 0.85 }, { x: 1, y: 1 }] },
    { name: 'S-Kurve', curve: [{ x: 0, y: 0 }, { x: 0.25, y: 0.1 }, { x: 0.75, y: 0.9 }, { x: 1, y: 1 }] },
  ],
};

/** Default loudness of a note (MIDI velocity); stored in a file only when different. */
export const DEFAULT_VOLUME = 100;
export const MIN_VOLUME = 1;
export const MAX_VOLUME = 127;

const MARKS: readonly [number, string][] = [[16, 'ppp'], [32, 'pp'], [48, 'p'], [64, 'mp'], [80, 'mf'], [100, 'f'], [116, 'ff'], [127, 'fff']];

/** The dynamic mark a loudness is closest to: "mf", "ff" … */
export const volumeMark = (volume: number): string => MARKS.find(([max]) => volume <= max)![1];
