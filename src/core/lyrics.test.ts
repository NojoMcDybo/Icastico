import { describe, expect, it } from 'vitest';
import { splitSyllables } from './lyrics';

describe('splitSyllables', () => {
  it('cuts words at hyphens and marks the syllables where the word goes on', () => {
    expect(splitSyllables('Gu-ten A-bend, gu-te Nacht')).toEqual(['Gu-', 'ten', 'A-', 'bend,', 'gu-', 'te', 'Nacht']);
  });
  it('keeps "_" as a note without syllable and ignores stray hyphens and blanks', () => {
    expect(splitSyllables('  la _ -la--la - ')).toEqual(['la', '_', 'la-', 'la']);
    expect(splitSyllables('')).toEqual([]);
  });
  it('takes the lyrics of the score back in (they already carry the trailing hyphen)', () => {
    expect(splitSyllables('Hel- lo _ world')).toEqual(['Hel-', 'lo', '_', 'world']);
  });
});
