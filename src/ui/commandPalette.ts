/**
 * The command palette (Ctrl+K, ADR 0004): a search field that finds every function of the program and runs it –
 * nothing has to be visible to be reachable. The list comes from the key library (`paletteEntries`).
 * It counts as a dialog: while it is open the workstation ignores its keys.
 */
import { type PaletteEntry, searchPalette } from './keymaps/library';

export function commandPalette(entries: readonly PaletteEntry[]): Promise<PaletteEntry | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal palette';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Befehlspalette');
    const box = document.createElement('div');
    box.className = 'palette__box';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'palette__input';
    input.placeholder = 'Funktion suchen …';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', 'palette-list');
    input.setAttribute('aria-label', 'Funktion suchen');
    const list = document.createElement('ul');
    list.className = 'palette__list';
    list.id = 'palette-list';
    list.setAttribute('role', 'listbox');
    box.append(input, list);
    overlay.append(box);

    let hits: PaletteEntry[] = [];
    let active = 0;
    const close = (pick: PaletteEntry | null) => {
      overlay.remove();
      resolve(pick);
    };
    const mark = () => {
      [...list.children].forEach((li, i) => {
        li.classList.toggle('is-active', i === active);
        li.setAttribute('aria-selected', String(i === active));
        if (i === active) li.scrollIntoView({ block: 'nearest' });
      });
      const current = list.children[active];
      if (current?.id) input.setAttribute('aria-activedescendant', current.id);
      else input.removeAttribute('aria-activedescendant');
    };
    const draw = () => {
      hits = searchPalette(entries, input.value);
      active = 0;
      if (hits.length === 0) {
        const none = document.createElement('li');
        none.className = 'palette__none';
        none.textContent = 'Dazu gibt es keine Funktion.';
        list.replaceChildren(none);
        return mark();
      }
      list.replaceChildren(
        ...hits.map((entry, i) => {
          const li = document.createElement('li');
          li.className = 'palette__item';
          li.id = `palette-item-${i}`;
          li.setAttribute('role', 'option');
          const title = document.createElement('span');
          title.className = 'palette__title';
          title.textContent = entry.title;
          const keys = document.createElement('span');
          keys.className = 'palette__keys';
          keys.textContent = entry.keys;
          li.title = entry.group; // the heading it has in the key help
          li.append(title, keys);
          li.addEventListener('click', () => close(entry));
          return li;
        }),
      );
      mark();
    };

    input.addEventListener('input', draw);
    input.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (step !== 0 && hits.length > 0) {
        e.preventDefault();
        active = (active + step + hits.length) % hits.length;
        mark();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (hits[active]) close(hits[active]!);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close(null);
      }
      e.stopPropagation();
    });
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) close(null);
    });
    // Clicking in the list must not take the caret out of the search field.
    list.addEventListener('pointerdown', (e) => e.preventDefault());

    document.body.append(overlay);
    draw();
    input.focus();
  });
}
