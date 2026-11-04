/**
 * Which views of the score are shown and how tall: pure window state.
 *
 * Every staff ("Notenzeile") has a mode – notation, piano roll or both. A piano
 * roll lane has a height the user sets by dragging its top edge; the notation takes
 * what is left. Dragging a lane down to a strip makes it a small overview, dragging
 * it up makes it big – there are no size buttons. This is not part of the score
 * file: it is remembered per score by the app.
 */

export type StaffMode = 'notation' | 'both' | 'roll';
/** `notation` (all staves that are shown as notes) or `roll:<staffKey>`. */
export type LaneId = string;

export interface ViewState {
  /** staffKey → mode; missing = notation. */
  readonly modes: Readonly<Record<string, StaffMode>>;
  /** roll lane → height in pixels; missing = default. */
  readonly heights: Readonly<Record<string, number>>;
  /** The lane the user worked in last (focus ring). */
  readonly active: LaneId;
}

export const NOTATION: LaneId = 'notation';
export const rollLane = (staffKey: string): LaneId => `roll:${staffKey}`;
export const staffKey = (partId: string, staffIndex: number): string => `${partId}:${staffIndex}`;

export const DEFAULT_VIEW: ViewState = { modes: {}, heights: {}, active: NOTATION };

/** Heights of a roll lane: the default, the smallest (just the header + a thin strip), the largest. */
export const DEFAULT_ROLL_HEIGHT = 260;
export const MIN_ROLL_HEIGHT = 64;
export const MAX_ROLL_HEIGHT = 1200;
/** Below this a roll shows only the contour of the notes (a strip); above it it can be edited. */
export const COMPACT_BELOW = 120;

export const modeOf = (v: ViewState, key: string): StaffMode => v.modes[key] ?? 'notation';
export const heightOf = (v: ViewState, lane: LaneId): number => v.heights[lane] ?? DEFAULT_ROLL_HEIGHT;
export const isCompact = (height: number): boolean => height < COMPACT_BELOW;

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

/** Sets a roll lane's height (clamped); the default height is stored as "missing". */
export function withHeight(v: ViewState, lane: LaneId, height: number): ViewState {
  const px = Math.round(Math.max(MIN_ROLL_HEIGHT, Math.min(MAX_ROLL_HEIGHT, height)));
  const heights = { ...v.heights };
  if (px === DEFAULT_ROLL_HEIGHT) delete heights[lane];
  else heights[lane] = px;
  return { ...v, heights, active: lane };
}

export const activate = (v: ViewState, lane: LaneId): ViewState => (v.active === lane ? v : { ...v, active: lane });

/** Drops what no longer exists (staves removed from the score) and repairs `active`. */
export function normalize(v: ViewState, keys: readonly string[]): ViewState {
  const known = new Set(keys);
  const modes = Object.fromEntries(Object.entries(v.modes).filter(([k, m]) => known.has(k) && m !== 'notation'));
  const lanes = new Set(visibleLanes({ ...v, modes }, keys));
  const heights = Object.fromEntries(Object.entries(v.heights).filter(([l]) => lanes.has(l)));
  return { modes, heights, active: validActive({ modes, heights, active: v.active }, keys) };
}

// ── Remembering per score ──────────────────────────────────────────────────

const MODES: readonly string[] = ['notation', 'both', 'roll'];

export const serializeView = (v: ViewState): string => JSON.stringify(v);

/** Reads remembered state; anything unexpected gives the default view (older "sizes" are ignored). */
export function parseView(text: string | null): ViewState {
  try {
    const raw: unknown = JSON.parse(text ?? 'null');
    if (typeof raw !== 'object' || raw === null) return DEFAULT_VIEW;
    const { modes, heights, active } = raw as Record<string, unknown>;
    const entries = (obj: unknown): [string, unknown][] => (typeof obj === 'object' && obj !== null ? Object.entries(obj) : []);
    return {
      modes: Object.fromEntries(entries(modes).filter(([, m]) => typeof m === 'string' && MODES.includes(m))) as Record<string, StaffMode>,
      heights: Object.fromEntries(
        entries(heights)
          .filter(([, h]) => typeof h === 'number' && Number.isFinite(h))
          .map(([l, h]) => [l, Math.max(MIN_ROLL_HEIGHT, Math.min(MAX_ROLL_HEIGHT, h as number))]),
      ),
      active: typeof active === 'string' ? active : NOTATION,
    };
  } catch {
    return DEFAULT_VIEW;
  }
}
