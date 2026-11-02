import './styles.css';
import { demoScore } from './core/demo';
import { createEditorState } from './core/editor/state';
import { Engraver } from './render/verovio';
import { FINALE_KEYMAP } from './ui/keymaps/finale';
import { Workstation } from './ui/workstation';
import { currentPlatform } from './platform/files';
import { APP_VERSION } from './version';

const $ = (id: string) => document.getElementById(id)!;

async function start(): Promise<void> {
  $('status').textContent = 'Notensatz wird geladen …';
  const engraver = await Engraver.create();
  $('meta').textContent = `Icastico ${APP_VERSION} · Verovio ${engraver.version.split('-')[0]}`;
  new Workstation(
    { pages: $('pages'), status: $('status'), mode: $('mode'), title: $('doc-title'), help: $('help') },
    engraver,
    FINALE_KEYMAP,
    currentPlatform(),
    createEditorState(demoScore()),
  );
}

start().catch((err: unknown) => {
  const box = document.createElement('div');
  box.className = 'error';
  box.textContent = `Icastico konnte nicht starten:\n\n${err instanceof Error ? err.message : String(err)}`;
  $('pages').replaceChildren(box);
  $('status').textContent = 'Fehler beim Start';
  console.error(err);
});
