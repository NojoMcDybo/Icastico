/**
 * Platform services behind one interface (architecture rule 8):
 * - desktop (Tauri): native open/save dialogs, files via Rust, window title,
 *   close confirmation, files opened by double-click
 * - browser (development and Claude's screenshot tests): upload/download
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { FILE_EXTENSION } from '../core/file/format';
import type { RawScan } from '../library/library';
import { MemoryLibrary } from '../library/memory';
import type { LibraryService } from '../library/service';

export interface OpenedFile {
  readonly name: string;
  /** Null in the browser, where files have no path. */
  readonly path: string | null;
  readonly text: string;
}

export interface SavedFile {
  readonly name: string;
  readonly path: string | null;
}

export interface Platform {
  readonly kind: 'desktop' | 'browser';
  /** The score library (Documents/Icastico). */
  readonly library: LibraryService;
  /** Lets the user pick a file; null if cancelled. */
  pickAndRead(): Promise<OpenedFile | null>;
  read(path: string): Promise<OpenedFile>;
  /** Writes to `path`, or asks where if `path` is null. Null if cancelled. */
  write(text: string, path: string | null, suggestedName: string): Promise<SavedFile | null>;
  setTitle(title: string): void;
  /**
   * Window close: closes right away if nothing is unsaved, otherwise asks
   * `confirm` (true = may close).
   */
  guardClose(isDirty: () => boolean, confirm: () => Promise<boolean>): void;
  /** Files the operating system asks us to open (double-click). */
  onFileOpened(handler: (path: string) => void): void;
}

const FILTERS = [{ name: 'Icastico-Partitur', extensions: [FILE_EXTENSION] }];

export const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

const withExtension = (path: string): string =>
  path.toLowerCase().endsWith(`.${FILE_EXTENSION}`) ? path : `${path}.${FILE_EXTENSION}`;

const desktopLibrary: LibraryService = {
  root: () => invoke<{ path: string; created: boolean }>('library_root'),
  scan: () => invoke<RawScan>('library_scan'),
  read: (path) => invoke<string>('read_score_file', { path }),
  write: (path, contents) => invoke('write_score_file', { path, contents }),
  createFile: (path, contents) => invoke('library_create_file', { path, contents }),
  rename: (from, to) => invoke('library_rename', { from, to }),
  createDir: (path) => invoke('library_create_dir', { path }),
  deleteFile: (path) => invoke('library_delete_file', { path }),
  removeDir: (path) => invoke('library_remove_dir', { path }),
  reveal: (path) => revealItemInDir(path),
};

const desktop: Platform = {
  kind: 'desktop',
  library: desktopLibrary,

  async pickAndRead() {
    const path = await open({ multiple: false, directory: false, filters: FILTERS, title: 'Partitur öffnen' });
    return path ? this.read(path) : null;
  },

  async read(path) {
    const text = await invoke<string>('read_score_file', { path });
    return { name: baseName(path), path, text };
  },

  async write(text, path, suggestedName) {
    const chosen = path ?? (await save({ defaultPath: suggestedName, filters: FILTERS, title: 'Partitur speichern' }));
    if (!chosen) return null;
    const target = withExtension(chosen);
    await invoke('write_score_file', { path: target, contents: text });
    return { name: baseName(target), path: target };
  },

  setTitle(title) {
    getCurrentWindow()
      .setTitle(title)
      .catch(() => undefined);
  },

  guardClose(isDirty, confirm) {
    const win = getCurrentWindow();
    void win.onCloseRequested(async (event) => {
      if (!isDirty()) return; // Tauri closes the window itself
      event.preventDefault();
      if (await confirm()) await win.destroy();
    });
  },

  onFileOpened(handler) {
    const take = async () => {
      const path = await invoke<string | null>('take_pending_file');
      if (path) handler(path);
    };
    void take();
    void listen('open-file', () => void take());
  },
};

/** Browser: the library lives in local storage (development and Claude's tests). */
function browserLibrary(): LibraryService {
  const KEY = 'icastico.browserLibrary';
  return new MemoryLibrary('/Icastico', {
    load: () => {
      try {
        return localStorage.getItem(KEY);
      } catch {
        return null;
      }
    },
    save: (data) => {
      try {
        localStorage.setItem(KEY, data);
      } catch {
        // storage full or blocked: the library still works for this session
      }
    },
  });
}

const browser: Platform = {
  kind: 'browser',
  get library() {
    return (browserLibraryInstance ??= browserLibrary());
  },

  pickAndRead() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = `.${FILE_EXTENSION},application/json`;
      input.addEventListener('cancel', () => resolve(null));
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        file.text().then((text) => resolve({ name: file.name, path: null, text }), reject);
      });
      input.click();
    });
  },

  read() {
    return Promise.reject(new Error('Im Browser können Dateien nur über den Dialog geöffnet werden.'));
  },

  async write(text, _path, suggestedName) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = withExtension(suggestedName);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { name: a.download, path: null };
  },

  setTitle(title) {
    document.title = title;
  },

  guardClose(isDirty) {
    window.addEventListener('beforeunload', (e) => {
      if (isDirty()) e.preventDefault();
    });
  },

  onFileOpened() {
    // Browsers have no "open with".
  },
};

let browserLibraryInstance: LibraryService | undefined;

export function currentPlatform(): Platform {
  return isTauri() ? desktop : browser;
}
