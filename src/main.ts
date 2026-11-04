import './styles.css';
import { demoScore } from './core/demo';
import { LibraryStore } from './library/store';
import { Engraver } from './render/verovio';
import { buildKeymap } from './ui/keymaps/library';
import { loadKeymapPreset } from './ui/preferences';
import { Workstation } from './ui/workstation';
import { currentPlatform } from './platform/files';
import { APP_VERSION } from './version';
import { loadLastOpened } from './ui/preferences';
import { currentUpdater } from './platform/updater';
import { UpdateChecker } from './ui/updates';

const $ = (id: string) => document.getElementById(id)!;

async function start(): Promise<void> {
  $('status').textContent = 'Notensatz wird geladen …';
  const engraver = await Engraver.create();
  $('meta').textContent = `Icastico ${APP_VERSION} · Verovio ${engraver.version.split('-')[0]}`;
  const platform = currentPlatform();

  // The library folder (Documents/Icastico). On the very first start the
  // demo score is saved there as an example.
  let store: LibraryStore | null = new LibraryStore(platform.library, APP_VERSION);
  try {
    await store.open(demoScore());
  } catch (err) {
    console.error('Bibliothek nicht verfügbar:', err);
    store = null;
  }

  // Self-update (desktop only). The workstation is created below; flush waits for it.
  let flush: () => Promise<void> = async () => undefined;
  const updater = currentUpdater();
  const updates = updater
    ? new UpdateChecker(updater, () => flush(), (text) => ($('status').textContent = text))
    : null;

  const workstation = new Workstation(
    {
      pages: $('pages'),
      status: $('status'),
      mode: $('mode'),
      title: $('doc-title'),
      help: $('help'),
      library: $('library'),
      libraryButton: $('library-button'),
      roll: $('roll'),
      transport: $('transport'),
      rollButton: $('roll-button'),
      updateButton: $('update-button'),
    },
    engraver,
    buildKeymap(loadKeymapPreset()),
    platform,
    store,
    updates,
  );
  flush = () => workstation.flush();
  await workstation.openInitial(loadLastOpened());
  updates?.scheduleQuietCheck();
  if (!store) $('status').textContent = 'Bibliothek nicht verfügbar – Speichern nur über „Speichern unter“.';
}

start().catch((err: unknown) => {
  const box = document.createElement('div');
  box.className = 'error';
  box.textContent = `Icastico konnte nicht starten:\n\n${err instanceof Error ? err.message : String(err)}`;
  $('pages').replaceChildren(box);
  $('status').textContent = 'Fehler beim Start';
  console.error(err);
});
