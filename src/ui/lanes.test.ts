import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW,
  NOTATION,
  activate,
  effectiveSizes,
  hiddenStaves,
  modeOf,
  nextMode,
  normalize,
  parseView,
  restoreMaximised,
  rollLane,
  serializeView,
  showsNotation,
  sizeOf,
  visibleLanes,
  withMode,
  withSize,
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

  it('switching a staff back to notation moves the focus off its vanished lane', () => {
    let v = withMode(DEFAULT_VIEW, 'voice:0', 'both', KEYS);
    v = withSize(v, rollLane('voice:0'), 'normal');
    expect(v.active).toBe(rollLane('voice:0'));
    v = withMode(v, 'voice:0', 'notation', KEYS);
    expect(v.active).toBe(NOTATION);
  });
});

describe('lane sizes', () => {
  const two = withMode(DEFAULT_VIEW, 'voice:0', 'both', KEYS);

  it('are normal by default; sizes are per lane', () => {
    expect(sizeOf(two, NOTATION)).toBe('normal');
    expect(effectiveSizes(two, KEYS)).toEqual({ [NOTATION]: 'normal', [rollLane('voice:0')]: 'normal' });
    const small = withSize(two, rollLane('voice:0'), 'small');
    expect(effectiveSizes(small, KEYS)[rollLane('voice:0')]).toBe('small');
    expect(effectiveSizes(small, KEYS)[NOTATION]).toBe('normal');
  });

  it('while one lane is maximised all others are strips', () => {
    const max = withSize(two, rollLane('voice:0'), 'max');
    expect(effectiveSizes(max, KEYS)).toEqual({ [NOTATION]: 'small', [rollLane('voice:0')]: 'max' });
    expect(max.active).toBe(rollLane('voice:0'));
  });

  it('Esc brings the maximised lane back to normal and only then', () => {
    expect(restoreMaximised(two)).toBeNull();
    const max = withSize(two, NOTATION, 'max');
    const back = restoreMaximised(max)!;
    expect(sizeOf(back, NOTATION)).toBe('normal');
    expect(effectiveSizes(back, KEYS)[rollLane('voice:0')]).toBe('normal');
  });

  it('the size a strip had before is remembered when the maximised lane returns', () => {
    let v = withSize(two, rollLane('voice:0'), 'small');
    v = withSize(v, NOTATION, 'max');
    v = restoreMaximised(v)!;
    expect(sizeOf(v, rollLane('voice:0'))).toBe('small');
  });

  it('activating a lane changes only the focus', () => {
    const v = activate(two, rollLane('voice:0'));
    expect(v.active).toBe(rollLane('voice:0'));
    expect(v.modes).toBe(two.modes);
    expect(activate(v, rollLane('voice:0'))).toBe(v);
  });
});

describe('remembering per score', () => {
  it('round-trips', () => {
    let v = withMode(DEFAULT_VIEW, 'guitar:0', 'both', KEYS);
    v = withSize(v, rollLane('guitar:0'), 'small');
    expect(parseView(serializeView(v))).toEqual(v);
  });

  it('garbage gives the default view and unknown values are dropped', () => {
    expect(parseView(null)).toBe(DEFAULT_VIEW);
    expect(parseView('{')).toBe(DEFAULT_VIEW);
    expect(parseView('42')).toBe(DEFAULT_VIEW);
    const v = parseView('{"modes":{"a:0":"roll","b:0":"wild"},"sizes":{"notation":"huge"},"active":7}');
    expect(v.modes).toEqual({ 'a:0': 'roll' });
    expect(v.sizes).toEqual({});
    expect(v.active).toBe(NOTATION);
  });

  it('normalize drops staves that are gone and repairs the focus', () => {
    let v = withMode(DEFAULT_VIEW, 'guitar:0', 'both', KEYS);
    v = withSize(v, rollLane('guitar:0'), 'max');
    const n = normalize(v, ['voice:0', 'piano:0']);
    expect(n.modes).toEqual({});
    expect(n.sizes).toEqual({});
    expect(n.active).toBe(NOTATION);
  });
});
