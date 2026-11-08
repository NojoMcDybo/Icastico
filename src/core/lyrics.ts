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
