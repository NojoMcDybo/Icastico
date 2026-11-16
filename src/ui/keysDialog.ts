/**
 * "Tasten anpassen" (ADR 0049): every function of the current key layout can get a key of its own, lose its key or go back to the
 * standard. Only the differences are stored (`preferences.ts`); `changed` tells the workstation to rebuild its keys at once.
 */
import { type PaletteEntry, type PresetId, KEY_LIBRARY, holderOf, keysOfFunction, overrideKey, paletteEntries, searchPalette, withOverrides } from './keymaps/library';
import { ask } from './dialog';
import { comboOf, numpadComboOf } from './keys';
import { loadKeyOverrides, saveKeyOverrides } from './preferences';

const SHOWN = 80;

export function keysDialog(options: { readonly preset: PresetId; readonly changed: () => void }): Promise<void> {
  return new Promise((resolve) => {
    const preset = options.preset;
    let overrides = loadKeyOverrides(preset);
    const library = () => withOverrides(KEY_LIBRARY, preset, overrides);
    const argOf = (e: PaletteEntry): string | undefined => (e.arg === undefined ? undefined : String(e.arg));
    const entryKey = (e: PaletteEntry) => overrideKey(e.id, argOf(e));

    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Tasten anpassen');
    const box = document.createElement('div');
    box.className = 'modal__box keys';
    const title = document.createElement('h2');
    title.textContent = 'Tasten anpassen';
    const hint = document.createElement('p');
    hint.className = 'form__hint';
    hint.textContent = `Belegung „${KEY_LIBRARY.presets[preset].name}“. „Ändern“, dann die neue Taste drücken. Esc bricht ab.`;
    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'keys__search';
    search.placeholder = 'Funktion suchen …';
    search.autocomplete = 'off';
    search.spellcheck = false;
    search.setAttribute('aria-label', 'Funktion suchen');
    const list = document.createElement('ul');
    list.className = 'keys__list';
    const row = document.createElement('div');
    row.className = 'modal__buttons';
    const resetAll = document.createElement('button');
    resetAll.type = 'button';
    resetAll.textContent = 'Alle zurücksetzen';
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'is-primary';
    done.textContent = 'Fertig';
    row.append(resetAll, done);
    box.append(title, hint, search, list, row);
    overlay.append(box);

    /** The row waiting for a key, and the one asking whether another function may lose its key. */
    let capturing: PaletteEntry | null = null;
    let pending: { entry: PaletteEntry; combo: string; holderTitle: string; holderId: string; holderArg?: string } | null = null;

    const commit = (next: typeof overrides) => {
      overrides = next;
      saveKeyOverrides(preset, overrides);
      options.changed();
      draw();
    };
    const assign = (entry: PaletteEntry, combo: string, takeFrom?: { id: string; arg?: string }) => {
      const next: Record<string, readonly string[]> = { ...overrides, [entryKey(entry)]: [combo] };
      if (takeFrom) next[overrideKey(takeFrom.id, takeFrom.arg)] = keysOfFunction(library(), preset, takeFrom.id, takeFrom.arg).filter((k) => k !== combo);
      commit(next);
    };

    function draw(): void {
      const entries = paletteEntries(preset, library());
      const hits = searchPalette(entries, search.value);
      const items = hits.slice(0, SHOWN).map((entry) => {
        const li = document.createElement('li');
        li.className = 'keys__row';
        const key = entryKey(entry);
        const changed = key in overrides;
        if (changed) li.classList.add('is-changed');
        const name = document.createElement('span');
        name.className = 'keys__name';
        name.textContent = entry.title;
        const keys = document.createElement('span');
        keys.className = 'keys__keys';
        li.append(name, keys);
        if (pending && entryKey(pending.entry) === key) {
          keys.textContent = `Liegt auf „${pending.holderTitle}“. Dort wegnehmen?`;
          li.append(
            button('Ja', () => {
              const p = pending!;
              pending = null;
              assign(p.entry, p.combo, { id: p.holderId, ...(p.holderArg !== undefined ? { arg: p.holderArg } : {}) });
            }),
            button('Abbrechen', () => {
              pending = null;
              draw();
            }),
          );
        } else if (capturing && entryKey(capturing) === key) {
          keys.textContent = 'Neue Taste drücken … (Esc bricht ab)';
          li.classList.add('is-capturing');
        } else {
          keys.textContent = entry.keys || '–';
          li.append(
            button('Ändern', () => {
              capturing = entry;
              pending = null;
              draw();
            }),
            button('✕', () => commit({ ...overrides, [key]: [] }), 'Taste wegnehmen'),
            ...(changed
              ? [
                  button(
                    '↺',
                    () => {
                      const rest = { ...overrides };
                      delete rest[key];
                      commit(rest);
                    },
                    'Standardtaste wiederherstellen',
                  ),
                ]
              : []),
          );
        }
        return li;
      });
      if (hits.length > SHOWN) {
        const more = document.createElement('li');
        more.className = 'keys__more';
        more.textContent = `${hits.length - SHOWN} weitere – oben weiter eingrenzen.`;
        items.push(more);
      }
      if (hits.length === 0) {
        const none = document.createElement('li');
        none.className = 'keys__more';
        none.textContent = 'Dazu gibt es keine Funktion.';
        items.push(none);
      }
      list.replaceChildren(...items);
      resetAll.disabled = Object.keys(overrides).length === 0;
    }

    const close = () => {
      window.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (capturing) {
        e.preventDefault();
        e.stopPropagation();
        const entry = capturing;
        if (e.key === 'Escape') {
          capturing = null;
          draw();
          return;
        }
        const combo = (preset === 'speedy' ? numpadComboOf(e) : null) ?? comboOf(e);
        if (!combo) return; // a modifier key on its own
        capturing = null;
        const holder = holderOf(library(), preset, combo);
        if (holder && !(holder.functionId === entry.id && holder.arg === argOf(entry))) {
          pending = { entry, combo, holderTitle: holder.title, holderId: holder.functionId, ...(holder.arg !== undefined ? { holderArg: holder.arg } : {}) };
          draw();
          return;
        }
        assign(entry, combo);
        return;
      }
      if (e.key === 'Escape' && document.querySelectorAll('.modal').length === 1) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    search.addEventListener('input', draw);
    done.addEventListener('click', close);
    resetAll.addEventListener('click', () => {
      void ask({
        title: 'Alle Tasten zurücksetzen?',
        text: `Alle eigenen Tasten der Belegung „${KEY_LIBRARY.presets[preset].name}“ werden durch die Standardtasten ersetzt.`,
        buttons: [
          { id: 'no', label: 'Abbrechen' },
          { id: 'yes', label: 'Zurücksetzen', primary: true },
        ],
        cancel: 'no',
      }).then((answer) => {
        if (answer === 'yes') commit({});
      });
    });
    document.body.append(overlay);
    window.addEventListener('keydown', onKey, true);
    draw();
    search.focus();
  });
}

function button(label: string, run: () => void, title?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'keys__button';
  b.textContent = label;
  if (title) {
    b.title = title;
    b.setAttribute('aria-label', title);
  }
  b.addEventListener('click', run);
  return b;
}
