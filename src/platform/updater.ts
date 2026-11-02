/**
 * Self-update (ADR 0010): the desktop app asks GitHub Releases for a newer,
 * signed version. Browser: no updater.
 */
import { isTauri } from '@tauri-apps/api/core';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';

export interface UpdateInfo {
  readonly version: string;
  readonly notes: string;
}

export interface Updater {
  /** A newer version, or null if up to date. Throws if offline. */
  check(): Promise<UpdateInfo | null>;
  /** Downloads, installs and restarts. `progress` gets 0…1 (null = unknown size). */
  install(progress: (fraction: number | null) => void): Promise<void>;
}

function desktopUpdater(): Updater {
  let pending: Update | null = null;
  return {
    async check() {
      pending = await check();
      return pending ? { version: pending.version, notes: pending.body ?? '' } : null;
    },
    async install(progress) {
      if (!pending) throw new Error('Kein Update gefunden.');
      let total = 0;
      let done = 0;
      await pending.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        if (event.event === 'Progress') done += event.data.chunkLength;
        progress(total ? Math.min(1, done / total) : null);
      });
      // Windows: the installer restarts Icastico itself; macOS/Linux restart here.
      await relaunch();
    },
  };
}

export function currentUpdater(): Updater | null {
  return isTauri() ? desktopUpdater() : null;
}
