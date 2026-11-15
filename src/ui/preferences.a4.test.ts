import { afterEach, describe, expect, it } from 'vitest';
import { loadA4, saveA4 } from './preferences';

function stubStorage(): Map<string, string> {
  const data = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
  return data;
}

describe('A4 view setting (ADR 0045)', () => {
  afterEach(() => delete (globalThis as { localStorage?: unknown }).localStorage);

  it('is on until it was switched off, and remembers the choice', () => {
    stubStorage();
    expect(loadA4()).toBe(true);
    saveA4(false);
    expect(loadA4()).toBe(false);
    saveA4(true);
    expect(loadA4()).toBe(true);
  });

  it('is on when the storage is not available', () => {
    expect(loadA4()).toBe(true);
  });
});
