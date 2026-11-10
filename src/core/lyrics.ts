import type { NoteEvent } from './model';

/**
 * Lyrics typed into the lyrics field (ADR 0029): text with hyphens → the syllables, one per note.
 * "Gu-ten A-bend" → "Gu-", "ten", "A-", "bend". A trailing "-" is what the model keeps for "the word goes on" (ADR 0019).
 * A word that is just "_" stays as it is: a note without syllable.
 */
export function splitSyllables(text: string): string[] {
  const out: string[] = [];
  for (const word of text.split(/\s+/)) {
    if (word === '_') {
      out.push('_');
      continue;
    }
    const pieces = word.split(/[-‐‑–]/).filter((p) => p !== '');
    const goesOn = /[-‐‑–]$/.test(word); // "Hel-" typed (or taken from the score): the word continues
    pieces.forEach((piece, i) => out.push(i < pieces.length - 1 || goesOn ? `${piece}-` : piece));
  }
  return out;
}

/** The most verses a note can carry (ADR 0036). */
export const MAX_VERSES = 4;

/** The syllable of a note in a verse (1 = `lyric`). */
export function lyricOf(e: NoteEvent, verse: number): string | undefined {
  return verse === 1 ? e.lyric : e.verses?.[verse];
}

/** The note with that syllable set, or taken away (null / '' / '_'). An empty `verses` is removed. */
export function withLyric(e: NoteEvent, verse: number, syllable: string | null): NoteEvent {
  const value = syllable && syllable !== '_' ? syllable : null;
  if (verse === 1) {
    const { lyric: _old, ...rest } = e;
    return value ? { ...rest, lyric: value } : rest;
  }
  const { verses, ...rest } = e;
  const next: Record<number, string> = { ...verses };
  if (value) next[verse] = value;
  else delete next[verse];
  return Object.keys(next).length > 0 ? { ...rest, verses: next } : rest;
}

/** Highest verse that has a syllable anywhere in these events (0 = no lyrics). */
export function versesUsed(events: readonly NoteEvent[]): number {
  let top = 0;
  for (const e of events) {
    if (e.lyric !== undefined) top = Math.max(top, 1);
    for (const k of Object.keys(e.verses ?? {})) top = Math.max(top, Number(k));
  }
  return top;
}

/** SVG id of a drawn syllable: "syl-<note>" for the first verse, "syl3-<note>" for the third. */
export const syllableId = (verse: number, eventId: string): string => (verse === 1 ? `syl-${eventId}` : `syl${verse}-${eventId}`);

/** The verse a drawn syllable belongs to, from its id. */
export function verseOfSyllableId(id: string): number {
  const m = /^syl(\d?)-/.exec(id);
  return m && m[1] ? Number(m[1]) : 1;
}
