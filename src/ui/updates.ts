/**
 * Updates (ADR 0010), Folio style: the quiet check after start only shows a
 * banner in the library and an "Update" button in the top bar – no dialog
 * interrupts the work. Clicking it (or "Nach Updates suchen") asks once,
 * saves the open score and installs.
 */
import type { UpdateInfo, Updater } from '../platform/updater';
import { APP_VERSION } from '../version';
import { ask, inform } from './dialog';

/** Delay after start before the quiet check (do not slow down the start). */
const QUIET_DELAY_MS = 4000;

export class UpdateChecker {
  private available: UpdateInfo | null = null;
  private listener: ((update: UpdateInfo | null) => void) | null = null;
  private running = false;

  constructor(
    private readonly updater: Updater,
    private readonly flush: () => Promise<void>,
    private readonly status: (text: string) => void,
  ) {}

  /** Called with the newer version once known (and with null when none). */
  onAvailable(listener: (update: UpdateInfo | null) => void): void {
    this.listener = listener;
    listener(this.available);
  }

  private announce(update: UpdateInfo | null): void {
    this.available = update;
    this.listener?.(update);
  }

  /** Quiet check after start: never a dialog, offline is normal. */
  scheduleQuietCheck(): void {
    globalThis.setTimeout(() => void this.quietCheck(), QUIET_DELAY_MS);
  }

  async quietCheck(): Promise<void> {
    try {
      this.announce(await this.updater.check());
    } catch (err) {
      console.warn('[Update]', err instanceof Error ? err.message : err);
    }
  }

  /** "Nach Updates suchen": always answers. */
  async checkNow(): Promise<void> {
    if (this.running) return;
    this.status('Suche nach Updates …');
    let update: UpdateInfo | null;
    try {
      update = await this.updater.check();
    } catch (err) {
      this.status('');
      await inform('Update nicht möglich', `${err instanceof Error ? err.message : String(err)}\n\nBist du online?`);
      return;
    }
    this.announce(update);
    if (!update) {
      this.status('');
      await inform('Icastico ist aktuell', `Du hast die neueste Version (${APP_VERSION}).`);
      return;
    }
    await this.confirmAndInstall();
  }

  /** Asks once, saves the open score, installs, restarts. Failures after "yes" are always reported. */
  async confirmAndInstall(): Promise<void> {
    const update = this.available;
    if (!update || this.running) return;
    const notes = update.notes.trim();
    const choice = await ask({
      title: `Version ${update.version} installieren?`,
      text: `Du hast ${APP_VERSION}.${notes ? `\n\n${notes}` : ''}\n\nDeine Arbeit wird vorher gespeichert, danach startet Icastico neu.`,
      buttons: [
        { id: 'later', label: 'Später' },
        { id: 'install', label: 'Jetzt aktualisieren', primary: true },
      ],
      cancel: 'later',
    });
    if (choice !== 'install') return;
    this.running = true;
    try {
      await this.flush();
      this.status('Update wird geladen …');
      await this.updater.install((f) =>
        this.status(f === null ? 'Update wird geladen …' : `Update wird geladen … ${Math.round(f * 100)} %`),
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.status('Update fehlgeschlagen – Icastico läuft in der bisherigen Version weiter.');
      await inform(
        'Update fehlgeschlagen',
        `${reason}\n\nIcastico läuft in der bisherigen Version weiter. Deine Arbeit ist gespeichert.`,
      );
    } finally {
      this.running = false;
    }
  }
}
