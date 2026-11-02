/**
 * The librarian: composite library operations on top of a LibraryService.
 * Every operation that can collide retries with the next free name.
 */
import { parseScoreFile, serializeScore } from '../core/file/format';
import type { Score } from '../core/model';
import {
  ORIGIN_FILE,
  TRASH,
  type LibraryIndex,
  type LibraryItem,
  checkCollectionName,
  dirOf,
  fileNameOf,
  indexLibrary,
  joinPath,
  preferredFileName,
  sanitizeName,
  uniqueFileName,
} from './library';
import type { LibraryService } from './service';

export class LibraryStore {
  private rootPath = '';
  private current: LibraryIndex = { collections: [], items: [] };

  constructor(
    private readonly service: LibraryService,
    private readonly appVersion: string,
  ) {}

  get root(): string {
    return this.rootPath;
  }

  get index(): LibraryIndex {
    return this.current;
  }

  /** Finds/creates the folder. On the very first start `seed` is saved as an example. */
  async open(seed?: Score): Promise<void> {
    const { path, created } = await this.service.root();
    this.rootPath = path;
    if (created && seed) await this.createScore(seed, null);
    await this.refresh();
  }

  async refresh(): Promise<LibraryIndex> {
    this.current = indexLibrary(await this.service.scan());
    return this.current;
  }

  folderOf(collection: string | null): string {
    return collection ? joinPath(this.rootPath, collection) : this.rootPath;
  }

  private async namesIn(folder: string): Promise<string[]> {
    const scan = await this.service.scan();
    return [
      ...scan.entries.filter((e) => dirOf(e.path) === folder).map((e) => fileNameOf(e.path)),
      ...scan.collections.filter(() => folder === this.rootPath),
      ...(folder === this.rootPath ? [TRASH] : []),
    ];
  }

  /** Runs `attempt` with a free file name in `folder`, retrying if it was taken meanwhile. */
  private async withFreeName(folder: string, base: string, attempt: (path: string) => Promise<void>): Promise<string> {
    const taken = await this.namesIn(folder);
    for (let tries = 0; tries < 5; tries++) {
      const path = joinPath(folder, uniqueFileName(base, taken));
      try {
        await attempt(path);
        return path;
      } catch (err) {
        if (!/gibt es schon/.test(String(err))) throw err;
        taken.push(fileNameOf(path));
      }
    }
    throw new Error('Kein freier Dateiname gefunden.');
  }

  /** Saves a new score into a collection (null = top level). Returns its path. */
  async createScore(score: Score, collection: string | null): Promise<string> {
    const text = serializeScore(score, this.appVersion);
    const path = await this.withFreeName(this.folderOf(collection), score.title, (p) => this.service.createFile(p, text));
    await this.refresh();
    return path;
  }

  /**
   * Saves a library score. If the title changed, the file is renamed to match
   * (a free name in the same folder). Returns the (possibly new) path.
   */
  async saveScore(path: string, score: Score): Promise<string> {
    let target = path;
    if (fileNameOf(path).toLowerCase() !== preferredFileName(score.title).toLowerCase()) {
      const folder = dirOf(path);
      const others = (await this.namesIn(folder)).filter((n) => n !== fileNameOf(path));
      const wanted = uniqueFileName(score.title, others);
      if (wanted.toLowerCase() !== fileNameOf(path).toLowerCase()) {
        try {
          target = joinPath(folder, wanted);
          await this.service.rename(path, target);
        } catch {
          target = path; // keep the old name rather than fail the save
        }
      }
    }
    await this.service.write(target, serializeScore(score, this.appVersion));
    return target;
  }

  async readScore(path: string): Promise<Score> {
    return parseScoreFile(await this.service.read(path));
  }

  async duplicate(item: LibraryItem): Promise<string> {
    const score = await this.readScore(item.path);
    return this.createScore({ ...score, title: `${score.title} (Kopie)` }, item.collection);
  }

  async move(item: LibraryItem, collection: string | null): Promise<string> {
    const path = await this.withFreeName(this.folderOf(collection), item.title, (p) => this.service.rename(item.path, p));
    await this.refresh();
    return path;
  }

  // ── Trash ────────────────────────────────────────────────────────────────

  private get trashFolder(): string {
    return joinPath(this.rootPath, TRASH);
  }

  private async origins(): Promise<Record<string, string | null>> {
    try {
      return JSON.parse(await this.service.read(joinPath(this.trashFolder, ORIGIN_FILE))) as Record<string, string | null>;
    } catch {
      return {};
    }
  }

  private async saveOrigins(map: Record<string, string | null>): Promise<void> {
    await this.service.write(joinPath(this.trashFolder, ORIGIN_FILE), JSON.stringify(map, null, 2));
  }

  async moveToTrash(item: LibraryItem): Promise<void> {
    try {
      await this.service.createDir(this.trashFolder);
    } catch {
      // already there
    }
    const path = await this.withFreeName(this.trashFolder, item.title, (p) => this.service.rename(item.path, p));
    const map = await this.origins();
    map[fileNameOf(path)] = item.collection;
    await this.saveOrigins(map);
    await this.refresh();
  }

  /** Back to the collection it came from (or the top level if that is gone). Returns the new path. */
  async restore(item: LibraryItem): Promise<string> {
    const map = await this.origins();
    const origin = map[item.fileName] ?? null;
    const collection = origin && this.current.collections.includes(origin) ? origin : null;
    const path = await this.withFreeName(this.folderOf(collection), item.title, (p) => this.service.rename(item.path, p));
    delete map[item.fileName];
    await this.saveOrigins(map);
    await this.refresh();
    return path;
  }

  async deleteForever(item: LibraryItem): Promise<void> {
    if (!item.trashed) throw new Error('Endgültig löschen geht nur im Papierkorb.');
    await this.service.deleteFile(item.path);
    const map = await this.origins();
    delete map[item.fileName];
    await this.saveOrigins(map);
    await this.refresh();
  }

  async emptyTrash(): Promise<void> {
    for (const item of this.current.items.filter((i) => i.trashed)) await this.service.deleteFile(item.path);
    await this.saveOrigins({});
    await this.refresh();
  }

  // ── Collections ──────────────────────────────────────────────────────────

  async createCollection(name: string): Promise<string> {
    const problem = checkCollectionName(name, this.current.collections);
    if (problem) throw new Error(problem);
    const clean = sanitizeName(name);
    await this.service.createDir(joinPath(this.rootPath, clean));
    await this.refresh();
    return clean;
  }

  async renameCollection(from: string, to: string): Promise<string> {
    const problem = checkCollectionName(to, this.current.collections, from);
    if (problem) throw new Error(problem);
    const clean = sanitizeName(to);
    if (clean !== from) await this.service.rename(joinPath(this.rootPath, from), joinPath(this.rootPath, clean));
    await this.refresh();
    return clean;
  }

  async deleteCollection(name: string): Promise<void> {
    if (this.current.items.some((i) => i.collection === name && !i.trashed)) {
      throw new Error(`„${name}“ enthält noch Partituren. Erst verschieben oder in den Papierkorb legen.`);
    }
    await this.service.removeDir(joinPath(this.rootPath, name));
    await this.refresh();
  }

  reveal(path = this.rootPath): Promise<void> {
    return this.service.reveal(path);
  }
}
