import { beforeEach, describe, expect, it } from 'vitest';
import { createScore, DEFAULT_SETUP } from '../core/templates';
import { demoScore } from '../core/demo';
import { FORMAT_VERSION, fileVersion } from '../core/file/format';
import version2File from '../core/file/fixtures/version2.icastico?raw';
import version3File from '../core/file/fixtures/version3.icastico?raw';
import { itemsFor } from './library';
import { MemoryLibrary } from './memory';
import { BACKUP_DIR, LibraryStore } from './store';

const song = (title: string) => createScore({ ...DEFAULT_SETUP, title, instruments: ['voice'] });

let lib: MemoryLibrary;
let store: LibraryStore;
let tick = 0;

beforeEach(async () => {
  tick = 0;
  lib = new MemoryLibrary('/Icastico', undefined, () => ++tick * 1000);
  store = new LibraryStore(lib, '0.4.0');
  await store.open(demoScore());
});

const titles = (view: Parameters<typeof itemsFor>[1] = { kind: 'all' }) =>
  itemsFor(store.index, view).map((i) => `${i.collection ?? '-'}/${i.fileName}`);

describe('LibraryStore', () => {
  it('seeds the example on the very first start only', async () => {
    expect(titles()).toEqual(['-/Erste Skizze.icastico']);
    const again = new LibraryStore(lib, '0.4.0');
    await again.open(demoScore());
    expect(itemsFor(again.index, { kind: 'all' })).toHaveLength(1);
  });

  it('creates scores with free names inside collections', async () => {
    await store.createCollection('Lieder');
    await store.createScore(song('Abendlied'), 'Lieder');
    await store.createScore(song('Abendlied'), 'Lieder');
    expect(titles({ kind: 'collection', name: 'Lieder' })).toEqual(['Lieder/Abendlied 2.icastico', 'Lieder/Abendlied.icastico']);
  });

  it('renames the file when the title changes, on save', async () => {
    const path = await store.createScore(song('Entwurf'), null);
    const renamed = await store.saveScore(path, song('Ständchen für Anna'));
    expect(renamed).toBe('/Icastico/Ständchen für Anna.icastico');
    expect((await store.readScore(renamed)).title).toBe('Ständchen für Anna');
    await store.refresh();
    expect(titles()).not.toContain('-/Entwurf.icastico');
  });

  it('keeps the name if only the content changed, and never takes another file’s name', async () => {
    const a = await store.createScore(song('A'), null);
    const b = await store.createScore(song('B'), null);
    expect(await store.saveScore(a, song('A'))).toBe(a);
    expect(await store.saveScore(b, song('A'))).toBe('/Icastico/A 2.icastico');
    expect((await store.readScore(a)).title).toBe('A');
  });

  it('trash: move there, restore to the original collection, delete forever', async () => {
    await store.createCollection('Lieder');
    await store.createScore(song('Abendlied'), 'Lieder');
    const item = store.index.items.find((i) => i.title === 'Abendlied')!;
    await store.moveToTrash(item);
    expect(titles({ kind: 'collection', name: 'Lieder' })).toEqual([]);
    expect(titles({ kind: 'trash' })).toEqual(['-/Abendlied.icastico']);

    const restored = await store.restore(store.index.items.find((i) => i.trashed)!);
    expect(restored).toBe('/Icastico/Lieder/Abendlied.icastico');

    await store.moveToTrash(store.index.items.find((i) => i.title === 'Abendlied')!);
    await store.deleteForever(store.index.items.find((i) => i.trashed)!);
    expect(titles({ kind: 'trash' })).toEqual([]);
  });

  it('refuses to delete forever outside the trash', async () => {
    await expect(store.deleteForever(store.index.items[0]!)).rejects.toThrow(/nur im Papierkorb/);
  });

  it('collections: create, rename (scores move along), delete only when empty', async () => {
    await store.createCollection('Lieder');
    await store.createScore(song('Abendlied'), 'Lieder');
    await expect(store.createCollection('lieder')).rejects.toThrow(/gibt es schon/);
    await store.renameCollection('Lieder', 'Volkslieder');
    expect(store.index.collections).toEqual(['Volkslieder']);
    expect(titles({ kind: 'collection', name: 'Volkslieder' })).toEqual(['Volkslieder/Abendlied.icastico']);
    await expect(store.deleteCollection('Volkslieder')).rejects.toThrow(/enthält noch/);
    await store.move(store.index.items.find((i) => i.title === 'Abendlied')!, null);
    await store.deleteCollection('Volkslieder');
    expect(store.index.collections).toEqual([]);
  });

  it('duplicates next to the original', async () => {
    await store.duplicate(store.index.items[0]!);
    expect(titles()).toContain('-/Erste Skizze (Kopie).icastico');
  });

  it('cannot escape the library folder', async () => {
    await expect(lib.createFile('/Icastico/../böse.icastico', 'x')).rejects.toThrow(/innerhalb/);
    await expect(lib.createFile('/anderswo/x.icastico', 'x')).rejects.toThrow(/innerhalb/);
  });
});

describe('files saved by an older Icastico', () => {
  const OLD = '/Icastico/Alt.icastico';
  const BACKUP = `/Icastico/${BACKUP_DIR}/Alt.icastico.v2.bak`;

  beforeEach(async () => {
    await lib.createFile(OLD, version2File);
    await store.refresh();
  });

  it('are listed and opened like any other', async () => {
    const item = store.index.items.find((i) => i.fileName === 'Alt.icastico')!;
    expect(item.broken).toBeNull();
    expect(item.title).toBe('Gespeichert mit 0.6.0');
    expect((await store.readScore(OLD)).parts[0]!.voices[0]!.events).toHaveLength(3);
  });

  it('are copied untouched before the first save, which then writes the current format', async () => {
    const score = await store.readScore(OLD);
    const saved = await store.saveScore(OLD, score); // the file is renamed after its title
    expect(await lib.read(BACKUP)).toBe(version2File);
    expect(fileVersion(await lib.read(saved))).toBe(FORMAT_VERSION);
    expect(await store.readScore(saved)).toEqual(score);
    // the backup is hidden from the library
    await store.refresh();
    expect(titles().sort()).toEqual(['-/Erste Skizze.icastico', '-/Gespeichert mit 0.6.0.icastico']);
    expect(store.index.collections).toEqual([]);
  });

  it('a version-3 file (0.7.0) is backed up too, as .v3.bak', async () => {
    await lib.createFile('/Icastico/Drei.icastico', version3File);
    await store.refresh();
    await store.saveScore('/Icastico/Drei.icastico', await store.readScore('/Icastico/Drei.icastico'));
    expect(await lib.read(`/Icastico/${BACKUP_DIR}/Drei.icastico.v3.bak`)).toBe(version3File);
  });

  it('are backed up once: the next autosaves leave the backup alone', async () => {
    const score = await store.readScore(OLD);
    const saved = await store.saveScore(OLD, score);
    await store.saveScore(saved, { ...score, composer: 'Neu' });
    await store.saveScore(saved, { ...score, composer: 'Noch neuer' });
    expect(await lib.read(BACKUP)).toBe(version2File);
    const names = [...(lib as unknown as { files: Map<string, unknown> }).files.keys()].filter((p) => p.includes(BACKUP_DIR));
    expect(names).toEqual([BACKUP]);
  });

  it('keep their old name in the backup when the title (and so the file name) changes', async () => {
    const score = await store.readScore(OLD);
    const renamed = await store.saveScore(OLD, { ...score, title: 'Neuer Titel' });
    expect(renamed).toBe('/Icastico/Neuer Titel.icastico');
    expect(await lib.read(BACKUP)).toBe(version2File);
  });

  it('are not overwritten if the backup fails', async () => {
    const score = await store.readScore(OLD);
    const create = lib.createFile.bind(lib);
    lib.createFile = async (path, contents) => {
      if (path.includes(BACKUP_DIR)) throw new Error('Kein Platz mehr.');
      return create(path, contents);
    };
    await expect(store.saveScore(OLD, { ...score, title: 'Anders' })).rejects.toThrow('Kein Platz');
    expect(await lib.read(OLD)).toBe(version2File);
  });

  it('can be duplicated; the original stays as it was', async () => {
    const item = store.index.items.find((i) => i.fileName === 'Alt.icastico')!;
    const copy = await store.duplicate(item);
    expect(fileVersion(await lib.read(copy))).toBe(FORMAT_VERSION);
    expect(await lib.read(OLD)).toBe(version2File);
  });

  it('a file from a newer Icastico is shown as unreadable and never rewritten by the store on its own', async () => {
    const newer = version2File.replace('"version": 2', `"version": ${FORMAT_VERSION + 1}`);
    await lib.createFile('/Icastico/Neu.icastico', newer);
    await store.refresh();
    const item = store.index.items.find((i) => i.fileName === 'Neu.icastico')!;
    expect(item.broken).toMatch(/neueren Icastico-Version/);
    expect(fileVersion(newer)).toBe(FORMAT_VERSION + 1);
  });
});
