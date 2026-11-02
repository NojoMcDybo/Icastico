/**
 * The score library (ADR 0009): Documents/Icastico, one sub-folder per
 * collection, a trash folder. This module is pure logic (names, index,
 * paths); file access goes through the platform's LibraryService.
 */
import { FILE_EXTENSION, parseScoreFile } from '../core/file/format';
import { getInstrument } from '../core/instruments';
import type { Score } from '../core/model';

export const TRASH = 'Papierkorb';
/** In the trash folder: which collection each trashed file came from. */
export const ORIGIN_FILE = '.herkunft.json';

export interface RawEntry {
  readonly path: string;
  readonly collection: string | null;
  readonly trashed: boolean;
  /** Milliseconds since 1970. */
  readonly modified: number;
  readonly contents: string | null;
}

export interface RawScan {
  readonly collections: readonly string[];
  readonly entries: readonly RawEntry[];
}

export interface LibraryItem {
  readonly path: string;
  readonly fileName: string;
  readonly collection: string | null;
  readonly trashed: boolean;
  readonly modified: number;
  readonly title: string;
  readonly composer: string;
  /** "Gesang · Klavier · D-Dur · 3/4" */
  readonly summary: string;
  /** Set when the file could not be read. */
  readonly broken: string | null;
}

export interface LibraryIndex {
  readonly collections: readonly string[];
  /** Newest first. */
  readonly items: readonly LibraryItem[];
}

// ── Paths ──────────────────────────────────────────────────────────────────

const separatorOf = (path: string): string => (path.includes('\\') && !path.includes('/') ? '\\' : '/');

export function joinPath(base: string, ...parts: string[]): string {
  const sep = separatorOf(base);
  return [base.replace(/[\\/]+$/, ''), ...parts].join(sep);
}

export const fileNameOf = (path: string): string => path.split(/[\\/]/).pop() ?? path;

export function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i > 0 ? path.slice(0, i) : path;
}

const stem = (fileName: string): string => fileName.replace(new RegExp(`\\.${FILE_EXTENSION}$`, 'i'), '');

// ── Names ──────────────────────────────────────────────────────────────────

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** A file/folder name safe on Windows and macOS ('' if nothing usable is left). */
export function sanitizeName(name: string): string {
  let clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, 80)
    .trim();
  if (RESERVED.test(clean)) clean = `${clean}_`;
  return clean;
}

/** "Lied.icastico", or "Lied 2.icastico" … if taken (case-insensitive, like Windows). */
export function uniqueFileName(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  const name = sanitizeName(base) || 'Partitur';
  for (let n = 1; ; n++) {
    const candidate = `${n === 1 ? name : `${name} ${n}`}.${FILE_EXTENSION}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** File name a score would get from its title (before de-duplication). */
export const preferredFileName = (title: string): string => `${sanitizeName(title) || 'Partitur'}.${FILE_EXTENSION}`;

/** Error text for a new/renamed collection, or null if fine. */
export function checkCollectionName(name: string, existing: readonly string[], current?: string): string | null {
  const clean = sanitizeName(name);
  if (!clean) return 'Bitte einen Namen eingeben.';
  if (clean.toLowerCase() === TRASH.toLowerCase()) return `„${TRASH}“ ist reserviert.`;
  if (existing.some((c) => c.toLowerCase() === clean.toLowerCase() && c !== current)) {
    return `Eine Sammlung „${clean}“ gibt es schon.`;
  }
  return null;
}

// ── Index ──────────────────────────────────────────────────────────────────

const MAJOR = ['Ces', 'Ges', 'Des', 'As', 'Es', 'B', 'F', 'C', 'G', 'D', 'A', 'E', 'H', 'Fis', 'Cis'];
const MINOR = ['as', 'es', 'b', 'f', 'c', 'g', 'd', 'a', 'e', 'h', 'fis', 'cis', 'gis', 'dis', 'ais'];

export function scoreSummary(score: Score): string {
  const instruments = score.parts.map((p) => p.name || getInstrument(p.instrument).name);
  const f = score.keys[0]!.fifths + 7;
  const m = score.meter[0]!.sig;
  return [...instruments, `${MAJOR[f]}-Dur / ${MINOR[f]}-Moll`, `${m.count}/${m.unit}`].join(' · ');
}

export function indexLibrary(scan: RawScan): LibraryIndex {
  const items = scan.entries.map((e): LibraryItem => {
    const fileName = fileNameOf(e.path);
    const base = { path: e.path, fileName, collection: e.collection, trashed: e.trashed, modified: e.modified };
    try {
      if (e.contents === null) throw new Error('zu groß');
      const score = parseScoreFile(e.contents);
      return { ...base, title: score.title, composer: score.composer ?? '', summary: scoreSummary(score), broken: null };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { ...base, title: stem(fileName), composer: '', summary: 'Datei kann nicht gelesen werden', broken: reason };
    }
  });
  items.sort((a, b) => b.modified - a.modified || a.title.localeCompare(b.title, 'de'));
  return { collections: [...scan.collections], items };
}

/** Items shown for a view: a collection, all (not trashed), or the trash; filtered by search text. */
export function itemsFor(
  index: LibraryIndex,
  view: { kind: 'all' } | { kind: 'collection'; name: string } | { kind: 'trash' },
  search = '',
): LibraryItem[] {
  const q = search.trim().toLowerCase();
  return index.items.filter((i) => {
    if (view.kind === 'trash' ? !i.trashed : i.trashed) return false;
    if (view.kind === 'collection' && i.collection !== view.name) return false;
    if (!q) return true;
    return `${i.title} ${i.composer} ${i.summary}`.toLowerCase().includes(q);
  });
}

// ── Display helpers ────────────────────────────────────────────────────────

/** "gerade eben", "vor 5 Min.", "vor 3 Std.", "gestern", "vor 4 Tagen", "02.11.2026". */
export function relativeTime(ms: number, now: number): string {
  const minutes = Math.floor((now - ms) / 60_000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'gestern';
  if (days < 7) return `vor ${days} Tagen`;
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/** Stable color hue for a collection badge (like Folio's colored notebooks). */
export function collectionHue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

/** Initials for a collection badge: "Weihnachtslieder" → "We", "Neue Lieder" → "NL". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  const w = words[0] ?? '?';
  return w.slice(0, 1).toUpperCase() + w.slice(1, 2).toLowerCase();
}
