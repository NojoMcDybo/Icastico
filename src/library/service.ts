import type { RawScan } from './library';

/**
 * File operations of the library. Desktop: Rust commands (only inside the
 * library folder). Browser/tests: MemoryLibrary.
 */
export interface LibraryService {
  /** Finds or creates the library folder; `created` = first start. */
  root(): Promise<{ readonly path: string; readonly created: boolean }>;
  scan(): Promise<RawScan>;
  read(path: string): Promise<string>;
  /** Overwrites (atomically on desktop). */
  write(path: string, contents: string): Promise<void>;
  /** Fails if the file exists. */
  createFile(path: string, contents: string): Promise<void>;
  /** Fails if the target exists. Works for files and folders. */
  rename(from: string, to: string): Promise<void>;
  createDir(path: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  /** Only empty folders. */
  removeDir(path: string): Promise<void>;
  /** Shows the file/folder in Explorer/Finder. */
  reveal(path: string): Promise<void>;
}
