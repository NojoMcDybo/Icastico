/**
 * Piano-roll geometry: the pure maths between pixels and (time, pitch).
 * No DOM here, so snapping and drag rules can be tested.
 */
import { type Fraction, add, frac, gt, lt, sub, toNumber } from '../core/time';
import { type Score, measuresOf } from '../core/model';
import { getInstrument } from '../core/instruments';
import { midiOf } from '../core/pitch';
import type { VoiceRef } from '../core/editor/state';
import { getVoice } from '../core/editor/state';
import { GRID } from '../core/editor/rollEdits';

export interface RollLayout {
  /** Pixels for a whole note. */
  readonly pxPerWhole: number;
  readonly rowHeight: number;
  /** Width of the key column on the left. */
  readonly labelWidth: number;
  /** Rows from `lowMidi` (bottom) to `highMidi` (top), both included. */
  readonly lowMidi: number;
  readonly highMidi: number;
  /** End of the last measure. */
  readonly totalTime: Fraction;
}

export const DEFAULT_PX_PER_WHOLE = 360;
export const ROW_HEIGHT = 14;
export const LABEL_WIDTH = 44;
/** Width in pixels of the zone at either end of a bar that resizes instead of moving. */
export const EDGE_PX = 6;

/** Height in pixels the pitch rows of a small strip share. */
export const COMPACT_HEIGHT = 28;

export function layoutFor(score: Score, ref: VoiceRef, pxPerWhole = DEFAULT_PX_PER_WHOLE, compact = false): RollLayout {
  const { part, voice } = getVoice(score, ref);
  const range = getInstrument(part.instrument).range;
  let low = midiOf(range.low);
  let high = midiOf(range.high);
  // Every voice written on the same staff shares the rows.
  const staffEvents = part.voices.filter((v) => v.staff === voice.staff).flatMap((v) => v.events);
  for (const e of staffEvents) {
    for (const t of e.tones) {
      low = Math.min(low, midiOf(t.pitch));
      high = Math.max(high, midiOf(t.pitch));
    }
  }
  const measures = measuresOf(score);
  const totalTime = measures[measures.length - 1]!.end;
  if (compact) {
    // A strip shows only the contour of what is played: the rows of the tones, no key column.
    const tones = staffEvents.flatMap((e) => e.tones.map((x) => midiOf(x.pitch)));
    const lowest = tones.length ? Math.min(...tones) : 60;
    const highest = tones.length ? Math.max(...tones) : 60;
    const rows = highest - lowest + 3;
    return {
      pxPerWhole,
      rowHeight: Math.max(2, Math.min(8, Math.floor(COMPACT_HEIGHT / rows))),
      labelWidth: 0,
      lowMidi: lowest - 1,
      highMidi: highest + 1,
      totalTime,
    };
  }
  return {
    pxPerWhole,
    rowHeight: ROW_HEIGHT,
    labelWidth: LABEL_WIDTH,
    lowMidi: Math.max(0, low - 2),
    highMidi: Math.min(127, high + 2),
    totalTime,
  };
}

export const xOfTime = (l: RollLayout, t: Fraction): number => l.labelWidth + toNumber(t) * l.pxPerWhole;
export const timeWidth = (l: RollLayout, d: Fraction): number => toNumber(d) * l.pxPerWhole;
export const yOfMidi = (l: RollLayout, midi: number): number => (l.highMidi - midi) * l.rowHeight;
export const contentWidth = (l: RollLayout): number => xOfTime(l, l.totalTime);
export const contentHeight = (l: RollLayout): number => (l.highMidi - l.lowMidi + 1) * l.rowHeight;

/** The pitch row under a y coordinate (clamped to the visible rows). */
export const midiAtY = (l: RollLayout, y: number): number =>
  Math.max(l.lowMidi, Math.min(l.highMidi, l.highMidi - Math.floor(y / l.rowHeight)));

/** A multiple of `grid` as an exact fraction. */
const units = (grid: Fraction, count: number): Fraction => frac(count * grid.n, grid.d);

/** Time at an x coordinate, rounded to the nearest grid line; never before the start. */
export function snapTime(l: RollLayout, x: number, grid: Fraction): Fraction {
  const t = (x - l.labelWidth) / l.pxPerWhole;
  const count = Math.max(0, Math.round(t / toNumber(grid)));
  return units(grid, count);
}

/** A pixel distance as a whole number of grid steps, as an exact time. */
export function snapDelta(l: RollLayout, dx: number, grid: Fraction): Fraction {
  return units(grid, Math.round(dx / l.pxPerWhole / toNumber(grid)));
}

export type Zone = 'start' | 'end' | 'body';

/** Which part of a bar a pointer is on; narrow bars get proportionally narrow edge zones. */
export function zoneOf(x0: number, x1: number, x: number): Zone {
  const edge = Math.min(EDGE_PX, (x1 - x0) / 3);
  if (x - x0 < edge) return 'start';
  if (x1 - x < edge) return 'end';
  return 'body';
}

export interface BarRef {
  readonly voice: VoiceRef;
  readonly eventId: string;
  readonly toneId: string;
  readonly onset: Fraction;
  readonly duration: Fraction;
  readonly midi: number;
}

/** What a gesture wants to change; `undefined` = leave as is. */
export interface RollChange {
  readonly onset?: Fraction;
  readonly duration?: Fraction;
  readonly midi?: number;
}

/** Result of dragging a bar by (dx, dy) pixels from where it was grabbed. */
export function dragChange(l: RollLayout, mode: Zone, bar: BarRef, dx: number, dy: number, grid: Fraction): RollChange {
  const delta = snapDelta(l, dx, grid);
  const end = eventEndOf(bar);
  switch (mode) {
    case 'body': {
      const steps = Math.round(-dy / l.rowHeight);
      return {
        onset: add(bar.onset, delta),
        ...(steps !== 0 ? { midi: bar.midi + steps } : {}),
      };
    }
    case 'end': {
      const newEnd = add(end, delta);
      const duration = sub(newEnd, bar.onset);
      return { duration: lt(duration, minLength(grid)) ? minLength(grid) : duration };
    }
    case 'start': {
      const latest = sub(end, minLength(grid));
      let onset = add(bar.onset, delta);
      if (gt(onset, latest)) onset = latest;
      return { onset, duration: sub(end, onset) };
    }
  }
}

/** A new bar drawn from the pointer-down point to the current x. */
export function drawChange(l: RollLayout, downX: number, downY: number, x: number, grid: Fraction): { onset: Fraction; duration: Fraction; midi: number } {
  const startUnits = Math.max(0, Math.floor((downX - l.labelWidth) / l.pxPerWhole / toNumber(grid)));
  const onset = units(grid, startUnits);
  const end = snapTime(l, x, grid);
  const duration = gt(end, add(onset, grid)) ? sub(end, onset) : grid;
  return { onset, duration, midi: midiAtY(l, downY) };
}

const eventEndOf = (bar: BarRef): Fraction => add(bar.onset, bar.duration);
const minLength = (grid: Fraction): Fraction => (gt(grid, GRID) ? grid : GRID);

/** Where the view must scroll so a bar is fully visible; null if it already is. */
export function scrollTarget(left: number, width: number, barX0: number, barX1: number, margin = 24): number | null {
  if (barX0 - margin < left) return Math.max(0, barX0 - margin);
  if (barX1 + margin > left + width) return barX1 + margin - width;
  return null;
}

export const isBlackKey = (midi: number): boolean => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);

/** "C4", "C#4" for the key column (only whole octaves get a label). */
export const octaveLabel = (midi: number): string | null => (midi % 12 === 0 ? `C${midi / 12 - 1}` : null);
