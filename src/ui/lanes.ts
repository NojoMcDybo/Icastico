/**
 * Which views of the score are shown and how big: pure window state.
 *
 * Every staff ("Notenzeile") has a mode – notation, piano roll or both – and
 * every view is a lane that is small (a strip), normal or maximised. This is
 * not part of the score file: it is remembered per score by the app.
 */

export type StaffMode = 'notation' | 'both' | 'roll';
export type LaneSize = 'small' | 'normal' | 'max';
/** `notation` (all staves that are shown as notes) or `roll:<staffKey>`. */
export type LaneId = string;

export interface ViewState {
  /** staffKey → mode; missing = notation. */
  readonly modes: Readonly<Record<string, StaffMode>>;
  /** lane → size; missing = normal. */
  readonly sizes: Readonly<Record<string, LaneSize>>;
  /** The lane the user worked in last (focus ring). */
  readonly active: LaneId;
}

export const NOTATION: LaneId = 'notation';
export const rollLane = (staffKey: string): LaneId => `roll:${staffKey}`;
export const staffKey = (partId: string, staffIndex: number): string => `${partId}:${staffIndex}`;
export const staffOfLane = (lane: LaneId): string | null => (lane.startsWith('roll:') ? lane.slice(5) : null);

export const DEFAULT_VIEW: ViewState = { modes: {}, sizes: {}, active: NOTATION };

export const modeOf = (v: ViewState, key: string): StaffMode => v.modes[key] ?? 'notation';
export const sizeOf = (v: ViewState, lane: LaneId): LaneSize => v.sizes[lane] ?? 'normal';

/** notation → both → roll → notation: the order of the little switch next to each staff. */
export const nextMode = (m: StaffMode): StaffMode => (m === 'notation' ? 'both' : m === 'both' ? 'roll' : 'notation');

/** Staves shown as notes are in the notation lane; with none left there is no notation lane. */
export const showsNotation = (v: ViewState, keys: readonly string[]): boolean => keys.some((k) => modeOf(v, k) !== 'roll');

/** Staves the notation engraver must leave out. */
export const hiddenStaves = (v: ViewState, keys: readonly string[]): ReadonlySet<string> =>
  new Set(keys.filter((k) => modeOf(v, k) === 'roll'));

/** Lanes on screen, notation first, then one roll per staff in score order. */
export function visibleLanes(v: ViewState, keys: readonly string[]): LaneId[] {
  const rolls = keys.filter((k) => modeOf(v, k) !== 'notation').map(rollLane);
  return showsNotation(v, keys) ? [NOTATION, ...rolls] : rolls;
}

/** Lane that should hold the focus: the active one if it is on screen, else the first. */
function validActive(v: ViewState, keys: readonly string[]): LaneId {
  const lanes = visibleLanes(v, keys);
  return lanes.includes(v.active) ? v.active : (lanes[0] ?? NOTATION);
}

export function withMode(v: ViewState, key: string, mode: StaffMode, keys: readonly string[]): ViewState {
  const modes = { ...v.modes };
  if (mode === 'notation') delete modes[key];
  else modes[key] = mode;
  const next = { ...v, modes };
  // The staff's new home takes the focus: the roll for 'roll', the notation for 'notation'.
  const active = mode === 'notation' ? NOTATION : mode === 'roll' ? rollLane(key) : v.active;
  return { ...next, active: validActive({ ...next, active }, keys) };
}

export function withSize(v: ViewState, lane: LaneId, size: LaneSize): ViewState {
  const sizes = { ...v.sizes };
  if (size === 'normal') delete sizes[lane];
  else sizes[lane] = size;
  return { ...v, sizes, active: lane };
}

export const activate = (v: ViewState, lane: LaneId): ViewState => (v.active === lane ? v : { ...v, active: lane });

/** Sizes as drawn: while one lane is maximised, all others are strips. */
export function effectiveSizes(v: ViewState, keys: readonly string[]): Record<LaneId, LaneSize> {
  const lanes = visibleLanes(v, keys);
  const max = lanes.find((l) => sizeOf(v, l) === 'max');
  return Object.fromEntries(lanes.map((l) => [l, max ? (l === max ? 'max' : 'small') : sizeOf(v, l)]));
}

/** Esc: brings a maximised lane back to normal. Returns null when nothing is maximised. */
export function restoreMaximised(v: ViewState): ViewState | null {
  const max = Object.entries(v.sizes).find(([, s]) => s === 'max');
  return max ? withSize(v, max[0], 'normal') : null;
}

/** Drops what no longer exists (staves removed from the score) and repairs `active`. */
export function normalize(v: ViewState, keys: readonly string[]): ViewState {
  const known = new Set(keys);
  const modes = Object.fromEntries(Object.entries(v.modes).filter(([k, m]) => known.has(k) && m !== 'notation'));
  const base = { ...v, modes };
  const lanes = new Set(visibleLanes(base, keys));
  const sizes = Object.fromEntries(Object.entries(v.sizes).filter(([l, s]) => lanes.has(l) && s !== 'normal'));
  return { modes, sizes, active: validActive({ ...base, sizes }, keys) };
}

// ── Remembering per score ──────────────────────────────────────────────────

const MODES: readonly string[] = ['notation', 'both', 'roll'];
const SIZES: readonly string[] = ['small', 'normal', 'max'];

export const serializeView = (v: ViewState): string => JSON.stringify(v);

/** Reads remembered state; anything unexpected gives the default view. */
export function parseView(text: string | null): ViewState {
  try {
    const raw: unknown = JSON.parse(text ?? 'null');
    if (typeof raw !== 'object' || raw === null) return DEFAULT_VIEW;
    const { modes, sizes, active } = raw as Record<string, unknown>;
    const pick = <T extends string>(obj: unknown, allowed: readonly string[]): Record<string, T> =>
      typeof obj === 'object' && obj !== null
        ? (Object.fromEntries(Object.entries(obj).filter(([, x]) => typeof x === 'string' && allowed.includes(x))) as Record<string, T>)
        : {};
    return { modes: pick<StaffMode>(modes, MODES), sizes: pick<LaneSize>(sizes, SIZES), active: typeof active === 'string' ? active : NOTATION };
  } catch {
    return DEFAULT_VIEW;
  }
}
