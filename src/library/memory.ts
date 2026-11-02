/**
 * A library that lives in memory (optionally persisted, e.g. to the browser's
 * local storage). Mirrors the rules of the Rust implementation, so the
 * browser version and the tests behave like the desktop app.
 */
import { TRASH, dirOf, fileNameOf, type RawEntry } from './library';
import type { LibraryService } from './service';

interface Snapshot {
  files: Record<string, { contents: string; modified: number }>;
  dirs: string[];
}

const EXT = /\.icastico$/i;

export class MemoryLibrary implements LibraryService {
  private files = new Map<string, { contents: string; modified: number }>();
  private dirs = new Set<string>();
  private exists = false;

  constructor(
    readonly rootPath = '/Icastico',
    private readonly persist?: { load(): string | null; save(data: string): void },
    private readonly clock: () => number = () => Date.now(),
  ) {
    const saved = persist?.load();
    if (saved) {
      try {
        const snap = JSON.parse(saved) as Snapshot;
        this.files = new Map(Object.entries(snap.files));
        this.dirs = new Set(snap.dirs);
        this.exists = true;
      } catch {
        // Corrupt storage: start empty.
      }
    }
  }

  private save(): void {
    this.persist?.save(JSON.stringify({ files: Object.fromEntries(this.files), dirs: [...this.dirs] } satisfies Snapshot));
  }

  private inside(path: string): void {
    if (!path.startsWith(`${this.rootPath}/`) || path.split('/').includes('..')) {
      throw new Error('Das geht nur innerhalb der Icastico-Bibliothek.');
    }
    const parent = dirOf(path);
    if (parent !== this.rootPath && !this.dirs.has(parent)) throw new Error(`Ordner fehlt: ${parent}`);
  }

  private taken(path: string): boolean {
    const lower = path.toLowerCase();
    return [...this.files.keys(), ...this.dirs].some((p) => p.toLowerCase() === lower);
  }

  async root() {
    const created = !this.exists;
    this.exists = true;
    this.save();
    return { path: this.rootPath, created };
  }

  async scan() {
    const collections = [...this.dirs]
      .filter((d) => dirOf(d) === this.rootPath && fileNameOf(d) !== TRASH && !fileNameOf(d).startsWith('.'))
      .map(fileNameOf)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const entries: RawEntry[] = [];
    for (const [path, f] of this.files) {
      const name = fileNameOf(path);
      if (!EXT.test(name) || name.startsWith('.')) continue;
      const dir = dirOf(path);
      const folder = dir === this.rootPath ? null : fileNameOf(dir);
      entries.push({
        path,
        collection: folder === TRASH ? null : folder,
        trashed: folder === TRASH,
        modified: f.modified,
        contents: f.contents,
      });
    }
    return { collections, entries };
  }

  async read(path: string) {
    const f = this.files.get(path);
    if (!f) throw new Error('Datei konnte nicht gelesen werden (nicht gefunden).');
    return f.contents;
  }

  async write(path: string, contents: string) {
    this.inside(path);
    this.files.set(path, { contents, modified: this.clock() });
    this.save();
  }

  async createFile(path: string, contents: string) {
    this.inside(path);
    if (this.taken(path)) throw new Error('Eine Datei mit diesem Namen gibt es schon.');
    await this.write(path, contents);
  }

  async rename(from: string, to: string) {
    this.inside(from);
    this.inside(to);
    if (this.taken(to)) throw new Error('Am Ziel gibt es schon etwas mit diesem Namen.');
    const file = this.files.get(from);
    if (file) {
      this.files.delete(from);
      this.files.set(to, file);
    } else if (this.dirs.has(from)) {
      this.dirs.delete(from);
      this.dirs.add(to);
      for (const [p, f] of [...this.files]) {
        if (dirOf(p) === from) {
          this.files.delete(p);
          this.files.set(`${to}/${fileNameOf(p)}`, f);
        }
      }
    } else {
      throw new Error('Umbenennen/Verschieben fehlgeschlagen (nicht gefunden).');
    }
    this.save();
  }

  async createDir(path: string) {
    this.inside(path);
    if (this.taken(path)) throw new Error('Eine Sammlung mit diesem Namen gibt es schon.');
    this.dirs.add(path);
    this.save();
  }

  async deleteFile(path: string) {
    this.inside(path);
    if (!this.files.delete(path)) throw new Error('Nur einzelne Dateien können gelöscht werden.');
    this.save();
  }

  async removeDir(path: string) {
    this.inside(path);
    if ([...this.files.keys()].some((p) => dirOf(p) === path)) throw new Error('Die Sammlung ist nicht leer.');
    this.dirs.delete(path);
    this.save();
  }

  async reveal() {
    throw new Error('Im Browser gibt es keinen Explorer.');
  }
}
