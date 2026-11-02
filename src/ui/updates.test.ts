import { beforeEach, describe, expect, it, vi } from 'vitest';

const dialogs = vi.hoisted(() => ({ answer: 'install', asked: [] as string[], informed: [] as string[] }));
vi.mock('./dialog', () => ({
  ask: vi.fn(async (o: { title: string }) => {
    dialogs.asked.push(o.title);
    return dialogs.answer;
  }),
  inform: vi.fn(async (title: string) => {
    dialogs.informed.push(title);
    return 'ok';
  }),
}));

import { UpdateChecker } from './updates';
import type { Updater } from '../platform/updater';

function fake(version: string | null, log: string[]): Updater {
  return {
    check: async () => (version ? { version, notes: 'Wiedergabe!' } : null),
    install: async (progress) => {
      log.push('install');
      progress(0.5);
    },
  };
}

beforeEach(() => {
  dialogs.answer = 'install';
  dialogs.asked = [];
  dialogs.informed = [];
});

describe('UpdateChecker', () => {
  it('quiet check: no dialog, only tells the banner', async () => {
    const seen: (string | null)[] = [];
    const checker = new UpdateChecker(fake('9.9.9', []), async () => undefined, () => undefined);
    checker.onAvailable((u) => seen.push(u?.version ?? null));
    await checker.quietCheck();
    expect(seen).toEqual([null, '9.9.9']);
    expect(dialogs.asked).toEqual([]);
  });

  it('quiet check offline: silent', async () => {
    const offline: Updater = { check: async () => Promise.reject(new Error('offline')), install: async () => undefined };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await new UpdateChecker(offline, async () => undefined, () => undefined).quietCheck();
    expect(dialogs.informed).toEqual([]);
    warn.mockRestore();
  });

  it('saves the open score BEFORE installing', async () => {
    const log: string[] = [];
    const status: string[] = [];
    const checker = new UpdateChecker(fake('9.9.9', log), async () => void log.push('flush'), (t) => status.push(t));
    await checker.checkNow();
    expect(dialogs.asked).toEqual(['Version 9.9.9 installieren?']);
    expect(log).toEqual(['flush', 'install']);
    expect(status).toContain('Update wird geladen … 50 %');
  });

  it('banner click after quiet check asks, then installs', async () => {
    const log: string[] = [];
    const checker = new UpdateChecker(fake('9.9.9', log), async () => void log.push('flush'), () => undefined);
    await checker.quietCheck();
    await checker.confirmAndInstall();
    expect(log).toEqual(['flush', 'install']);
  });

  it('says so when everything is up to date (only when asked)', async () => {
    await new UpdateChecker(fake(null, []), async () => undefined, () => undefined).checkNow();
    expect(dialogs.informed).toEqual(['Icastico ist aktuell']);
  });

  it('"Später" installs nothing', async () => {
    dialogs.answer = 'later';
    const log: string[] = [];
    await new UpdateChecker(fake('9.9.9', log), async () => void log.push('flush'), () => undefined).checkNow();
    expect(log).toEqual([]);
  });

  it('a failed download after "Jetzt aktualisieren" is always reported', async () => {
    const broken: Updater = {
      check: async () => ({ version: '9.9.9', notes: '' }),
      install: async () => Promise.reject(new Error('Signatur ungültig')),
    };
    const status: string[] = [];
    const checker = new UpdateChecker(broken, async () => undefined, (t) => status.push(t));
    await checker.quietCheck();
    await checker.confirmAndInstall();
    expect(dialogs.informed).toEqual(['Update fehlgeschlagen']);
    expect(status.at(-1)).toMatch(/bisherigen Version/);
  });

  it('reports a failed check only when the user asked', async () => {
    const offline: Updater = { check: async () => Promise.reject(new Error('offline')), install: async () => undefined };
    await new UpdateChecker(offline, async () => undefined, () => undefined).checkNow();
    expect(dialogs.informed).toEqual(['Update nicht möglich']);
  });
});
