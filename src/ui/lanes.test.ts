import { describe, expect, it } from 'vitest';
import {
  COMPACT_BELOW,
  DEFAULT_ROLL_HEIGHT,
  DEFAULT_VIEW,
  MAX_ROLL_HEIGHT,
  MIN_ROLL_HEIGHT,
  NOTATION,
  activate,
  heightOf,
  hiddenStaves,
  isCompact,
  modeOf,
  nextMode,
  normalize,
  parseView,
  rollLane,
  serializeView,
  showsNotation,
  visibleLanes,
  withHeight,
  withMode,
} from './lanes';

const KEYS = ['voice:0', 'guitar:0', 'piano:0', 'piano:1'];

describe('staff modes', () => {
  it('start as notation only, with one notation lane', () => {
    expect(modeOf(DEFAULT_VIEW, 'voice:0')).toBe('notation');
    expect(visibleLanes(DEFAULT_VIEW, KEYS)).toEqual([NOTATION]);
    expect(hiddenStaves(DEFAULT_VIEW, KEYS).size).toBe(0);
  });

  it('cycles notation → both → roll → notation', () => {
    expect(nextMode('notation')).toBe('both');
    expect(nextMode('both')).toBe('roll');
    expect(nextMode(nextMode(nextMode('notation')))).toBe('notation');
  });

  it('both keeps the staff in the notation and adds a roll lane in score order', () => {
    let v = withMode(DEFAULT_VIEW, 'guitar:0', 'both', KEYS);
    v = withMode(v, 'piano:1', 'both', KEYS);
    expect(visibleLanes(v, KEYS)).toEqual([NOTATION, rollLane('guitar:0'), rollLane('piano:1')]);
    expect(hiddenStaves(v, KEYS).size).toBe(0);
  });

  it('roll hides the staff from the notation and focuses the new lane', () => {
    const v = withMode(DEFAULT_VIEW, 'voice:0', 'roll', KEYS);
    expect([...hiddenStaves(v, KEYS)]).toEqual(['voice:0']);
    expect(v.active).toBe(rollLane('voice:0'));
    expect(showsNotation(v, KEYS)).toBe(true);
  });

  it('with every staff as roll there is no notation lane; going back brings it again', () => {
    let v = DEFAULT_VIEW;
    for (const k of KEYS) v = withMode(v, k, 'roll', KEYS);
    expect(visibleLanes(v, KEYS)).toEqual(KEYS.map(rollLane));
    expect(showsNotation(v, KEYS)).toBe(false);
    v = withMode(v, 'guitar:0', 'notation', KEYS);
    expect(visibleLanes(v, KEYS)[0]).toBe(NOTATION);
    expect(v.active).toBe(NOTATION);
  });
});

describe('lane heights (dragged, no buttons)', () => {
  const both = withMode(DEFAULT_VIEW, 'voice:0', 'both', KEYS);
  const lane = rollLane('voice:0');

  it('a roll starts at the default height and keeps what the user dragged', () => {
    expect(heightOf(both, lane)).toBe(DEFAULT_ROLL_HEIGHT);
    expect(heightOf(withHeight(both, lane, 400), lane)).toBe(400);
  });

  it('stays within limits and the default is stored as "missing"', () => {
    expect(heightOf(withHeight(both, lane, 1), lane)).toBe(MIN_ROLL_HEIGHT);
    expect(heightOf(withHeight(both, lane, 99999), lane)).toBe(MAX_ROLL_HEIGHT);
    expect(withHeight(withHeight(both, lane, 400), lane, DEFAULT_ROLL_HEIGHT).heights).toEqual({});
  });

  it('a short lane is a strip, a tall one can be edited', () => {
    expect(isCompact(MIN_ROLL_HEIGHT)).toBe(true);
    expect(isCompact(COMPACT_BELOW - 1)).toBe(true);
    expect(isCompact(COMPACT_BELOW)).toBe(false);
  });

  it('dragging a lane makes it the active one; activating changes only the focus', () => {
    expect(withHeight(both, lane, 300).active).toBe(lane);
    const v = activate(both, NOTATION);
    expect(v.modes).toBe(both.modes);
    expect(activate(v, NOTATION)).toBe(v);
  });
});

describe('remembering per score', () => {
  it('round-trips', () => {
    let v = withMode(DEFAULT_VIEW, 'guitar:0', 'both', KEYS);
    v = withHeight(v, rollLane('guitar:0'), 90);
    expect(parseView(serializeView(v))).toEqual(v);
  });

  it('garbage gives the default view; unknown values are dropped; old "sizes" are ignored', () => {
    expect(parseView(null)).toBe(DEFAULT_VIEW);
    expect(parseView('{')).toBe(DEFAULT_VIEW);
    expect(parseView('42')).toBe(DEFAULT_VIEW);
    const v = parseView('{"modes":{"a:0":"roll","b:0":"wild"},"heights":{"roll:a:0":99999,"x":"hoch"},"sizes":{"notation":"max"},"active":7}');
    expect(v.modes).toEqual({ 'a:0': 'roll' });
    expect(v.heights).toEqual({ 'roll:a:0': MAX_ROLL_HEIGHT });
    expect(v.active).toBe(NOTATION);
  });

  it('normalize drops staves that are gone and repairs the focus', () => {
    let v = withMode(DEFAULT_VIEW, 'guitar:0', 'both', KEYS);
    v = withHeight(v, rollLane('guitar:0'), 500);
    const n = normalize(v, ['voice:0', 'piano:0']);
    expect(n.modes).toEqual({});
    expect(n.heights).toEqual({});
    expect(n.active).toBe(NOTATION);
  });
});
