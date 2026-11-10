import { describe, expect, it } from 'vitest';
import { type NoteEvent } from './model';
import { frac } from './time';
import { lyricOf, splitSyllables, syllableId, verseOfSyllableId, versesUsed, withLyric } from './lyrics';

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

describe('verses (ADR 0036)', () => {
  const note = (extra: object = {}): NoteEvent => ({ id: 'n1', onset: frac(0), duration: frac(1, 4), tones: [{ id: 'n1-t1', pitch: { step: 'C', alter: 0, octave: 4 } }], ...extra });

  it('verse 1 is `lyric`, the further verses are in `verses`', () => {
    const e = withLyric(withLyric(note(), 1, 'la'), 3, 'lu');
    expect(e.lyric).toBe('la');
    expect(e.verses).toEqual({ 3: 'lu' });
    expect(lyricOf(e, 1)).toBe('la');
    expect(lyricOf(e, 3)).toBe('lu');
    expect(lyricOf(e, 2)).toBeUndefined();
  });

  it('takes a syllable away and removes an empty `verses`', () => {
    const e = withLyric(withLyric(note(), 2, 'li'), 2, null);
    expect('verses' in e).toBe(false);
    expect(withLyric(note({ lyric: 'a' }), 1, '_').lyric).toBeUndefined();
  });

  it('knows the highest verse in use', () => {
    expect(versesUsed([note()])).toBe(0);
    expect(versesUsed([note({ lyric: 'a' })])).toBe(1);
    expect(versesUsed([note({ lyric: 'a' }), note({ verses: { 3: 'x' } })])).toBe(3);
  });

  it('reads the verse from the id of a drawn syllable', () => {
    expect(verseOfSyllableId(syllableId(1, 'e5'))).toBe(1);
    expect(verseOfSyllableId(syllableId(4, 'e5'))).toBe(4);
    expect(syllableId(2, 'e5')).toBe('syl2-e5');
  });
});
