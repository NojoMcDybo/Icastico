import { beforeEach, describe, expect, it } from 'vitest';
import { createScore, DEFAULT_SETUP } from '../core/templates';
import { demoScore } from '../core/demo';
import { itemsFor } from './library';
import { MemoryLibrary } from './memory';
import { LibraryStore } from './store';

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
