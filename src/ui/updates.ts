/**
 * Asks about updates: quietly on start, explicitly via "Nach Updates suchen".
 * The open score is saved before anything is installed.
 */
import type { Updater } from '../platform/updater';
import { APP_VERSION } from '../version';
import { ask, inform } from './dialog';

/** Seconds after start before the quiet check (do not slow down the start). */
const QUIET_DELAY_MS = 4000;

export class UpdateChecker {
  private declined = false;
  private running = false;

  constructor(
    private readonly updater: Updater,
    private readonly flush: () => Promise<void>,
    private readonly status: (text: string) => void,
  ) {}

  /** Quiet check after start: only speaks up if there is something new. */
  scheduleQuietCheck(): void {
    globalThis.setTimeout(() => void this.run(false), QUIET_DELAY_MS);
  }

  /** "Nach Updates suchen": always answers. */
  checkNow(): Promise<void> {
    return this.run(true);
  }

  private async run(explicit: boolean): Promise<void> {
    if (this.running || (!explicit && this.declined)) return;
    this.running = true;
    let agreed = false;
    try {
      if (explicit) this.status('Suche nach Updates …');
      const update = await this.updater.check();
      if (!update) {
        if (explicit) await inform('Icastico ist aktuell', `Du hast die neueste Version (${APP_VERSION}).`);
        return;
      }
      const notes = update.notes.trim();
      const choice = await ask({
        title: `Neue Version ${update.version} verfügbar`,
        text: `Du hast ${APP_VERSION}.${notes ? `\n\n${notes}` : ''}\n\nDeine Arbeit wird vorher gespeichert, danach startet Icastico neu.`,
        buttons: [
          { id: 'later', label: 'Später' },
          { id: 'install', label: 'Jetzt aktualisieren', primary: true },
        ],
        cancel: 'later',
      });
      if (choice !== 'install') {
        this.declined = true;
        return;
      }
      agreed = true;
      await this.flush();
      this.status('Update wird geladen …');
      await this.updater.install((f) =>
        this.status(f === null ? 'Update wird geladen …' : `Update wird geladen … ${Math.round(f * 100)} %`),
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (agreed) {
        this.status('Update fehlgeschlagen – Icastico läuft in der bisherigen Version weiter.');
        await inform('Update fehlgeschlagen', `${reason}\n\nIcastico läuft in der bisherigen Version weiter. Deine Arbeit ist gespeichert.`);
      } else if (explicit) {
        await inform('Update nicht möglich', `${reason}\n\nBist du online?`);
      } else {
        console.warn('[Update]', reason); // quiet check: offline is normal
      }
    } finally {
      this.running = false;
    }
  }
}
