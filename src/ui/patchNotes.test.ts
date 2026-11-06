import { describe, expect, it } from 'vitest';
import { PATCH_NOTES, isOlder, notesSince } from './patchNotes';

describe('patch notes', () => {
  it('compares versions number by number, not as text', () => {
    expect(isOlder('0.9.0', '0.10.0')).toBe(true);
    expect(isOlder('0.17.0', '0.17.0')).toBe(false);
    expect(isOlder('0.18.0', '0.17.9')).toBe(false);
    expect(isOlder('0.17', '0.17.1')).toBe(true);
  });

  it('lists what is newer than the version last seen, newest first, at most three', () => {
    const all = PATCH_NOTES.map((n) => n.version);
    expect(notesSince('0.0.1', all[0]).map((n) => n.version)).toEqual(all.slice(0, 3));
    expect(notesSince(all[1]!, all[0]).map((n) => n.version)).toEqual([all[0]]);
    expect(notesSince(all[0]!, all[0])).toEqual([]);
  });

  it('never lists a version newer than the running one', () => {
    expect(notesSince('0.0.1', '0.16.0').every((n) => !isOlder('0.16.0', n.version))).toBe(true);
  });

  it('every entry has a version and short sentences', () => {
    for (const n of PATCH_NOTES) {
      expect(n.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(n.items.length).toBeGreaterThan(0);
      for (const item of n.items) expect(item.length).toBeLessThan(240);
    }
  });
});
