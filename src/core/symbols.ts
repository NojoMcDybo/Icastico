/**
 * The library of special signs (ADR 0024): what can be put on a note or on a bar, as data.
 *
 * Note signs (dynamics, hairpins, articulation, ornaments, fermata) are stored as ids on the note;
 * bar signs (repeats, endings, segno, coda, jumps) are stored on the score at the start time of their bar.
 * Everything the signs mean – drawing, sound, MusicXML – is looked up here or derived from these tables.
 */

export type NoteSymbolGroup = 'dynamic' | 'hairpin' | 'articulation' | 'ornament' | 'fermata';

export interface NoteSymbol {
  /** Stored in the file – never change an id. */
  readonly id: string;
  readonly group: NoteSymbolGroup;
  readonly label: string;
  /** Short text for the palette button. */
  readonly glyph: string;
  /** Signs of the same exclusive set replace each other on a note. */
  readonly exclusive?: string;
  /** Dynamics: how hard the notes from here on are struck (1–127). */
  readonly velocity?: number;
  /** Dynamics: affects only this note, not the notes after it. */
  readonly accentOnly?: boolean;
  /** Articulation: sounding part of the written length, and extra strength. */
  readonly length?: number;
  readonly boost?: number;
}

export const NOTE_SYMBOLS: readonly NoteSymbol[] = [
  { id: 'ppp', group: 'dynamic', label: 'ppp (sehr sehr leise)', glyph: 'ppp', exclusive: 'dynamic', velocity: 20 },
  { id: 'pp', group: 'dynamic', label: 'pp (sehr leise)', glyph: 'pp', exclusive: 'dynamic', velocity: 33 },
  { id: 'p', group: 'dynamic', label: 'p (leise)', glyph: 'p', exclusive: 'dynamic', velocity: 48 },
  { id: 'mp', group: 'dynamic', label: 'mp (halbleise)', glyph: 'mp', exclusive: 'dynamic', velocity: 64 },
  { id: 'mf', group: 'dynamic', label: 'mf (halblaut)', glyph: 'mf', exclusive: 'dynamic', velocity: 80 },
  { id: 'f', group: 'dynamic', label: 'f (laut)', glyph: 'f', exclusive: 'dynamic', velocity: 96 },
  { id: 'ff', group: 'dynamic', label: 'ff (sehr laut)', glyph: 'ff', exclusive: 'dynamic', velocity: 112 },
  { id: 'fff', group: 'dynamic', label: 'fff (sehr sehr laut)', glyph: 'fff', exclusive: 'dynamic', velocity: 124 },
  { id: 'sfz', group: 'dynamic', label: 'sfz (plötzlich stark)', glyph: 'sfz', exclusive: 'dynamic', velocity: 120, accentOnly: true },
  { id: 'cresc', group: 'hairpin', label: 'Crescendo (lauter werden bis zur nächsten Lautstärke)', glyph: '<', exclusive: 'hairpin' },
  { id: 'dim', group: 'hairpin', label: 'Decrescendo (leiser werden bis zur nächsten Lautstärke)', glyph: '>', exclusive: 'hairpin' },
  { id: 'stacc', group: 'articulation', label: 'Staccato (kurz)', glyph: '·', exclusive: 'length', length: 0.5 },
  { id: 'stacciss', group: 'articulation', label: 'Staccatissimo (sehr kurz)', glyph: '▾', exclusive: 'length', length: 0.25 },
  { id: 'ten', group: 'articulation', label: 'Tenuto (ausgehalten)', glyph: '–', exclusive: 'length', length: 1 },
  { id: 'acc', group: 'articulation', label: 'Akzent (betont)', glyph: '>', exclusive: 'accent', boost: 12 },
  { id: 'marc', group: 'articulation', label: 'Marcato (stark betont)', glyph: '^', exclusive: 'accent', boost: 20, length: 0.8 },
  { id: 'trill', group: 'ornament', label: 'Triller', glyph: 'tr', exclusive: 'ornament' },
  { id: 'mord', group: 'ornament', label: 'Mordent', glyph: 'm', exclusive: 'ornament' },
  { id: 'prall', group: 'ornament', label: 'Pralltriller', glyph: 'pr', exclusive: 'ornament' },
  { id: 'turn', group: 'ornament', label: 'Doppelschlag', glyph: '∞', exclusive: 'ornament' },
  { id: 'fermata', group: 'fermata', label: 'Fermate (Halt)', glyph: '𝄐' },
];

export const NOTE_SYMBOL_IDS: readonly string[] = NOTE_SYMBOLS.map((s) => s.id);
const bySymbol = new Map(NOTE_SYMBOLS.map((s) => [s.id, s]));
export const noteSymbol = (id: string): NoteSymbol | undefined => bySymbol.get(id);

/** The signs of a note after toggling `id`: set if absent (replacing the others of its exclusive set), removed if present. Sorted in library order. */
export function toggleNoteSymbol(current: readonly string[] | undefined, id: string): string[] {
  const symbol = noteSymbol(id);
  if (!symbol) return [...(current ?? [])];
  const list = current ?? [];
  if (list.includes(id)) return list.filter((x) => x !== id);
  const kept = list.filter((x) => !symbol.exclusive || noteSymbol(x)?.exclusive !== symbol.exclusive);
  return [...kept, id].sort((a, b) => NOTE_SYMBOL_IDS.indexOf(a) - NOTE_SYMBOL_IDS.indexOf(b));
}

// ── Bar signs ──────────────────────────────────────────────────────────────

export type BarSignKind =
  | 'repeatStart'
  | 'repeatEnd'
  | 'volta1'
  | 'volta2'
  | 'volta3'
  | 'segno'
  | 'coda'
  | 'toCoda'
  | 'fine'
  | 'dc'
  | 'dcFine'
  | 'dcCoda'
  | 'ds'
  | 'dsFine'
  | 'dsCoda';

export interface BarSign {
  readonly id: BarSignKind;
  readonly label: string;
  readonly glyph: string;
  readonly exclusive?: string;
  /** Text printed above the bar for signs that are words. */
  readonly text?: string;
}

export const BAR_SIGNS: readonly BarSign[] = [
  { id: 'repeatStart', label: 'Wiederholung beginnt (𝄆)', glyph: '𝄆' },
  { id: 'repeatEnd', label: 'Wiederholung endet (𝄇)', glyph: '𝄇' },
  { id: 'volta1', label: '1. Klammer', glyph: '1.', exclusive: 'volta' },
  { id: 'volta2', label: '2. Klammer', glyph: '2.', exclusive: 'volta' },
  { id: 'volta3', label: '3. Klammer', glyph: '3.', exclusive: 'volta' },
  { id: 'segno', label: 'Segno (Zeichen)', glyph: '𝄉' },
  { id: 'coda', label: 'Coda (Schlussteil beginnt)', glyph: '𝄌' },
  { id: 'toCoda', label: 'Zur Coda springen', glyph: 'To Coda', text: 'To Coda' },
  { id: 'fine', label: 'Fine (Ende)', glyph: 'Fine', text: 'Fine' },
  { id: 'dc', label: 'D.C. (zurück zum Anfang)', glyph: 'D.C.', exclusive: 'jump', text: 'D.C.' },
  { id: 'dcFine', label: 'D.C. al Fine', glyph: 'D.C. al Fine', exclusive: 'jump', text: 'D.C. al Fine' },
  { id: 'dcCoda', label: 'D.C. al Coda', glyph: 'D.C. al Coda', exclusive: 'jump', text: 'D.C. al Coda' },
  { id: 'ds', label: 'D.S. (zurück zum Segno)', glyph: 'D.S.', exclusive: 'jump', text: 'D.S.' },
  { id: 'dsFine', label: 'D.S. al Fine', glyph: 'D.S. al Fine', exclusive: 'jump', text: 'D.S. al Fine' },
  { id: 'dsCoda', label: 'D.S. al Coda', glyph: 'D.S. al Coda', exclusive: 'jump', text: 'D.S. al Coda' },
];

export const BAR_SIGN_IDS: readonly string[] = BAR_SIGNS.map((s) => s.id);
const byBarSign = new Map(BAR_SIGNS.map((s) => [s.id as string, s]));
export const barSign = (id: string): BarSign | undefined => byBarSign.get(id);

/** Which volta number (1–3) a bar sign is, else 0. */
export const voltaNumber = (kind: string): number => (kind === 'volta1' ? 1 : kind === 'volta2' ? 2 : kind === 'volta3' ? 3 : 0);
export const isJumpBack = (kind: string): boolean => barSign(kind)?.exclusive === 'jump';
