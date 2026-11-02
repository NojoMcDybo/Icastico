import { describe, expect, it } from 'vitest';
import { serializeScore } from '../core/file/format';
import { createScore, DEFAULT_SETUP } from '../core/templates';
import {
  checkCollectionName,
  dirOf,
  fileNameOf,
  indexLibrary,
  initials,
  itemsFor,
  joinPath,
  relativeTime,
  sanitizeName,
  uniqueFileName,
  type RawEntry,
} from './library';

const scoreFile = (title: string, instruments = DEFAULT_SETUP.instruments, fifths = 0) =>
  serializeScore(createScore({ ...DEFAULT_SETUP, title, instruments, fifths, meter: { count: 3, unit: 4 } }), '0');

const entry = (path: string, contents: string | null, extra: Partial<RawEntry> = {}): RawEntry => ({
  path,
  collection: null,
  trashed: false,
  modified: 0,
  contents,
  ...extra,
});

describe('names and paths', () => {
  it('makes titles safe as Windows file names', () => {
    expect(sanitizeName('Lied: "Eins" / Zwei?')).toBe('Lied Eins Zwei');
    expect(sanitizeName('...versteckt.')).toBe('versteckt');
    expect(sanitizeName('CON')).toBe('CON_');
    expect(sanitizeName('   ')).toBe('');
    expect(sanitizeName('Ständchen für Anna')).toBe('Ständchen für Anna');
  });

  it('never reuses a taken name (case-insensitive)', () => {
    expect(uniqueFileName('Lied', [])).toBe('Lied.icastico');
    expect(uniqueFileName('Lied', ['lied.ICASTICO', 'Lied 2.icastico'])).toBe('Lied 3.icastico');
    expect(uniqueFileName('', [])).toBe('Partitur.icastico');
  });

  it('joins paths with the separator of the platform', () => {
    expect(joinPath('C:\\Users\\A\\Documents\\Icastico', 'Lieder', 'X.icastico')).toBe(
      'C:\\Users\\A\\Documents\\Icastico\\Lieder\\X.icastico',
    );
    expect(joinPath('/home/a/Icastico/', 'X.icastico')).toBe('/home/a/Icastico/X.icastico');
    expect(fileNameOf('C:\\a\\b\\Lied.icastico')).toBe('Lied.icastico');
    expect(dirOf('/a/b/Lied.icastico')).toBe('/a/b');
  });

  it('checks collection names', () => {
    expect(checkCollectionName(' ', [])).toMatch(/Namen/);
    expect(checkCollectionName('papierkorb', [])).toMatch(/reserviert/);
    expect(checkCollectionName('lieder', ['Lieder'])).toMatch(/gibt es schon/);
    expect(checkCollectionName('Lieder', ['Lieder'], 'Lieder')).toBeNull(); // renaming to itself
    expect(checkCollectionName('Arrangements', ['Lieder'])).toBeNull();
  });
});

describe('indexLibrary', () => {
  const scan = {
    collections: ['Lieder'],
    entries: [
      entry('/L/Alt.icastico', scoreFile('Alt'), { modified: 1000 }),
      entry('/L/Lieder/Neu.icastico', scoreFile('Neu', ['voice', 'piano'], 2), { collection: 'Lieder', modified: 5000 }),
      entry('/L/Papierkorb/Weg.icastico', scoreFile('Weg'), { trashed: true, modified: 3000 }),
      entry('/L/Kaputt.icastico', '{"format":"icastico","version":1}', { modified: 2000 }),
    ],
  };
  const index = indexLibrary(scan);

  it('reads titles and summaries, newest first', () => {
    expect(index.items.map((i) => i.title)).toEqual(['Neu', 'Weg', 'Kaputt', 'Alt']);
    expect(index.items[0]!.summary).toBe('Gesang · Klavier · D-Dur / h-Moll · 3/4');
  });

  it('keeps unreadable files visible instead of hiding them', () => {
    const broken = index.items.find((i) => i.title === 'Kaputt')!;
    expect(broken.broken).toBeTruthy();
    expect(broken.summary).toBe('Datei kann nicht gelesen werden');
  });

  it('filters by view and search', () => {
    expect(itemsFor(index, { kind: 'all' }).map((i) => i.title)).toEqual(['Neu', 'Kaputt', 'Alt']);
    expect(itemsFor(index, { kind: 'collection', name: 'Lieder' }).map((i) => i.title)).toEqual(['Neu']);
    expect(itemsFor(index, { kind: 'trash' }).map((i) => i.title)).toEqual(['Weg']);
    expect(itemsFor(index, { kind: 'all' }, 'klavier').map((i) => i.title)).toEqual(['Neu', 'Alt']);
    expect(itemsFor(index, { kind: 'all' }, 'D-DUR').map((i) => i.title)).toEqual(['Neu']);
  });
});

describe('display helpers', () => {
  const now = Date.UTC(2026, 10, 2, 12, 0);
  it('speaks German relative time', () => {
    expect(relativeTime(now - 10_000, now)).toBe('gerade eben');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('vor 5 Min.');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('vor 3 Std.');
    expect(relativeTime(now - 30 * 3_600_000, now)).toBe('gestern');
    expect(relativeTime(now - 4 * 86_400_000, now)).toBe('vor 4 Tagen');
    expect(relativeTime(Date.UTC(2026, 0, 5, 12), now)).toBe('05.01.2026');
  });

  it('makes badge initials', () => {
    expect(initials('Weihnachtslieder')).toBe('We');
    expect(initials('Neue Lieder')).toBe('NL');
  });
});
