/**
 * The library drawer (ADR 0009), modelled on Folio: collections with colored
 * initials on the left, scores of the chosen collection on the right,
 * search on top, trash at the bottom.
 *
 * Keyboard: type to search, ↑/↓ to choose, Enter to open, Esc to close.
 */
import {
  type LibraryItem,
  checkCollectionName,
  collectionHue,
  initials,
  itemsFor,
  relativeTime,
} from '../library/library';
import type { LibraryStore } from '../library/store';
import { ask, inform, promptText } from './dialog';

export type LibraryView = { kind: 'all' } | { kind: 'collection'; name: string } | { kind: 'trash' };

export interface LibraryActions {
  /** Path of the score open in the editor (to highlight it). */
  currentPath(): string | null;
  /** Saves pending changes before files are moved around. */
  flush(): Promise<void>;
  open(path: string): Promise<void>;
  newScore(collection: string | null): Promise<void>;
  openExternal(): Promise<void>;
  /** A file or folder moved: `from` → `to` (the editor follows its document). */
  relocated(from: string, to: string): void;
  /** The open document went to the trash. */
  closedByTrash(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export class LibraryPanel {
  private view: LibraryView = { kind: 'all' };
  private search = '';
  private highlighted = 0;
  private menu: HTMLElement | null = null;
  private readonly sidebar = el('nav', { className: 'library__collections' });
  private readonly heading = el('h3', { className: 'library__heading' });
  private readonly searchInput = el('input', { type: 'search', placeholder: 'Suchen …', className: 'library__search' });
  private readonly headerActions = el('div', { className: 'library__header-actions' });
  private readonly list = el('ul', { className: 'library__items' });

  constructor(
    private readonly root: HTMLElement,
    private readonly store: LibraryStore,
    private readonly actions: LibraryActions,
  ) {
    root.classList.add('library');
    root.hidden = true;
    root.setAttribute('aria-label', 'Bibliothek');
    const backdrop = el('div', { className: 'library__backdrop' });
    backdrop.addEventListener('click', () => this.hide());
    const header = el('header', { className: 'library__header' }, this.heading, this.headerActions);
    const main = el('section', { className: 'library__main' }, header, this.searchInput, this.list);
    root.append(backdrop, el('div', { className: 'library__drawer' }, this.sidebar, main));

    this.searchInput.addEventListener('input', () => {
      this.search = this.searchInput.value;
      this.highlighted = 0;
      this.renderItems();
    });
    root.addEventListener('keydown', (e) => this.onKey(e));
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** The collection new scores should go into, if one is being viewed. */
  get collection(): string | null {
    return this.view.kind === 'collection' ? this.view.name : null;
  }

  async show(): Promise<void> {
    await this.actions.flush();
    await this.store.refresh();
    if (this.view.kind === 'collection' && !this.store.index.collections.includes(this.view.name)) {
      this.view = { kind: 'all' };
    }
    this.highlighted = 0;
    // Every opening starts with an empty search – a leftover filter looks like lost scores.
    this.search = '';
    this.searchInput.value = '';
    this.root.hidden = false;
    this.render();
    this.searchInput.focus();
    this.searchInput.select();
  }

  hide(): void {
    this.closeMenu();
    // Hand the keyboard back to the score (no typing into a hidden search field).
    if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.root.hidden = true;
  }

  async toggle(): Promise<void> {
    if (this.isOpen) this.hide();
    else await this.show();
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  private render(): void {
    this.renderSidebar();
    this.renderItems();
  }

  private viewButton(view: LibraryView, label: string, badge: HTMLElement, count: number): HTMLElement {
    const active =
      view.kind === this.view.kind && (view.kind !== 'collection' || (this.view.kind === 'collection' && this.view.name === view.name));
    const b = el(
      'button',
      { type: 'button', className: `library__view${active ? ' is-active' : ''}` },
      badge,
      el('span', { className: 'library__view-name', textContent: label }),
      el('span', { className: 'library__count', textContent: count ? String(count) : '' }),
    );
    b.dataset.view = view.kind === 'collection' ? `collection:${view.name}` : view.kind;
    b.addEventListener('click', () => {
      this.view = view;
      this.highlighted = 0;
      this.render();
      this.searchInput.focus();
    });
    return b;
  }

  private renderSidebar(): void {
    const index = this.store.index;
    const live = index.items.filter((i) => !i.trashed);
    const symbol = (text: string, cls = '') => el('span', { className: `library__badge ${cls}`, textContent: text });

    const collections = index.collections.map((name) => {
      const badge = symbol(initials(name));
      badge.style.setProperty('--hue', String(collectionHue(name)));
      return this.viewButton(
        { kind: 'collection', name },
        name,
        badge,
        live.filter((i) => i.collection === name).length,
      );
    });
    const add = el('button', { type: 'button', className: 'library__add', textContent: '+ Neue Sammlung' });
    add.addEventListener('click', () => void this.createCollection());

    const reveal = el('button', { type: 'button', className: 'library__link', textContent: 'Ordner im Explorer zeigen' });
    reveal.title = this.store.root;
    reveal.addEventListener('click', () => {
      this.store.reveal().catch((err: unknown) => void inform('Ordner kann nicht angezeigt werden', errorText(err)));
    });
    const external = el('button', { type: 'button', className: 'library__link', textContent: 'Andere Datei öffnen …' });
    external.addEventListener('click', () => {
      this.hide();
      void this.actions.openExternal();
    });

    this.sidebar.replaceChildren(
      el('h2', { className: 'library__title', textContent: 'Bibliothek' }),
      this.viewButton({ kind: 'all' }, 'Alle Partituren', symbol('♪', 'library__badge--all'), live.length),
      el('div', { className: 'library__section', textContent: 'Sammlungen' }),
      ...collections,
      add,
      el('div', { className: 'library__spacer' }),
      this.viewButton({ kind: 'trash' }, 'Papierkorb', symbol('🗑', 'library__badge--trash'), index.items.length - live.length),
      reveal,
      external,
    );
  }

  private visibleItems(): LibraryItem[] {
    return itemsFor(this.store.index, this.view, this.search);
  }

  private renderItems(): void {
    const items = this.visibleItems();
    const current = this.actions.currentPath();
    this.heading.textContent =
      this.view.kind === 'all' ? 'Alle Partituren' : this.view.kind === 'trash' ? 'Papierkorb' : this.view.name;

    // Header actions depend on the view.
    const buttons: HTMLElement[] = [];
    if (this.view.kind !== 'trash') {
      const create = el('button', { type: 'button', className: 'is-primary', textContent: '+ Neue Partitur' });
      create.addEventListener('click', () => {
        this.hide();
        void this.actions.newScore(this.collection);
      });
      buttons.push(create);
    }
    if (this.view.kind === 'collection') {
      const more = el('button', { type: 'button', className: 'library__more', textContent: '⋯' });
      more.setAttribute('aria-label', 'Sammlung: weitere Aktionen');
      const name = this.view.name;
      more.addEventListener('click', () =>
        this.openMenu(more, [
          ['Umbenennen …', () => this.renameCollection(name)],
          ['Sammlung löschen', () => this.deleteCollection(name)],
        ]),
      );
      buttons.push(more);
    }
    if (this.view.kind === 'trash' && items.length) {
      const empty = el('button', { type: 'button', textContent: 'Papierkorb leeren' });
      empty.addEventListener('click', () => void this.emptyTrash());
      buttons.push(empty);
    }
    this.headerActions.replaceChildren(...buttons);

    this.highlighted = Math.min(this.highlighted, Math.max(0, items.length - 1));
    const now = Date.now();
    this.list.replaceChildren(
      ...items.map((item, i) => {
        const more = el('button', { type: 'button', className: 'library__more', textContent: '⋯' });
        more.setAttribute('aria-label', `${item.title}: weitere Aktionen`);
        more.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openMenu(more, this.itemActions(item));
        });
        const where =
          this.view.kind === 'all' && item.collection ? el('span', { className: 'library__where', textContent: item.collection }) : '';
        const li = el(
          'li',
          {
            className: [
              'library__item',
              i === this.highlighted ? 'is-highlighted' : '',
              item.path === current ? 'is-current' : '',
              item.broken ? 'is-broken' : '',
            ]
              .filter(Boolean)
              .join(' '),
          },
          el(
            'div',
            { className: 'library__item-text' },
            el('div', { className: 'library__item-title', textContent: item.title }, where),
            el('div', { className: 'library__item-meta', textContent: item.composer ? `${item.composer} · ${item.summary}` : item.summary }),
          ),
          el('time', { className: 'library__time', textContent: relativeTime(item.modified, now) }),
          more,
        );
        li.dataset.path = item.path;
        li.title = item.broken ? `Kann nicht geöffnet werden: ${item.broken}` : item.fileName;
        li.addEventListener('click', () => void this.activate(item));
        li.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.openMenu(more, this.itemActions(item));
        });
        return li;
      }),
    );
    if (items.length === 0) {
      const text = this.search
        ? `Nichts gefunden für „${this.search}“.`
        : this.view.kind === 'trash'
          ? 'Der Papierkorb ist leer.'
          : 'Hier ist noch keine Partitur. „+ Neue Partitur“ legt eine an.';
      this.list.append(el('li', { className: 'library__empty', textContent: text }));
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  private itemActions(item: LibraryItem): [string, () => Promise<void>][] {
    if (item.trashed) {
      return [
        ['Wiederherstellen', () => this.restore(item)],
        ['Endgültig löschen …', () => this.deleteForever(item)],
      ];
    }
    const targets: [string, () => Promise<void>][] = [null, ...this.store.index.collections]
      .filter((c) => c !== item.collection)
      .map((c) => [`Verschieben nach: ${c ?? 'Oberste Ebene'}`, () => this.move(item, c)]);
    return [
      ['Öffnen', () => this.activate(item)],
      ['Duplizieren', () => this.run(() => this.store.duplicate(item).then(() => undefined))],
      ...targets,
      ['In den Papierkorb', () => this.trash(item)],
    ];
  }

  private async activate(item: LibraryItem): Promise<void> {
    if (item.trashed) return this.openMenu(this.list.querySelector(`[data-path="${CSS.escape(item.path)}"] .library__more`)!, this.itemActions(item));
    if (item.broken) {
      await inform(`„${item.fileName}“ kann nicht geöffnet werden`, item.broken);
      return;
    }
    this.hide();
    await this.actions.open(item.path);
  }

  /** Runs a library operation: saves pending edits first, shows errors, re-renders. */
  private async run(op: () => Promise<void>): Promise<void> {
    try {
      await this.actions.flush();
      await op();
    } catch (err) {
      await inform('Das hat nicht geklappt', errorText(err));
    }
    await this.store.refresh();
    this.render();
    if (this.isOpen && !document.querySelector('.modal')) this.searchInput.focus();
  }

  private move(item: LibraryItem, collection: string | null): Promise<void> {
    return this.run(async () => {
      const to = await this.store.move(item, collection);
      this.actions.relocated(item.path, to);
    });
  }

  private trash(item: LibraryItem): Promise<void> {
    return this.run(async () => {
      const wasOpen = item.path === this.actions.currentPath();
      await this.store.moveToTrash(item);
      if (wasOpen) this.actions.closedByTrash();
    });
  }

  private restore(item: LibraryItem): Promise<void> {
    return this.run(() => this.store.restore(item).then(() => undefined));
  }

  private async deleteForever(item: LibraryItem): Promise<void> {
    const sure = await ask({
      title: 'Endgültig löschen?',
      text: `„${item.title}“ wird unwiderruflich gelöscht.`,
      buttons: [
        { id: 'cancel', label: 'Abbrechen' },
        { id: 'delete', label: 'Endgültig löschen', primary: true },
      ],
      cancel: 'cancel',
    });
    if (sure === 'delete') await this.run(() => this.store.deleteForever(item));
  }

  private async emptyTrash(): Promise<void> {
    const count = this.store.index.items.filter((i) => i.trashed).length;
    const sure = await ask({
      title: 'Papierkorb leeren?',
      text: `${count === 1 ? 'Eine Partitur wird' : `${count} Partituren werden`} unwiderruflich gelöscht.`,
      buttons: [
        { id: 'cancel', label: 'Abbrechen' },
        { id: 'empty', label: 'Papierkorb leeren', primary: true },
      ],
      cancel: 'cancel',
    });
    if (sure === 'empty') await this.run(() => this.store.emptyTrash());
  }

  private async createCollection(): Promise<void> {
    const name = await promptText({
      title: 'Neue Sammlung',
      label: 'Name',
      confirm: 'Anlegen',
      check: (v) => checkCollectionName(v, this.store.index.collections),
    });
    if (name === null) return this.searchInput.focus();
    await this.run(async () => {
      this.view = { kind: 'collection', name: await this.store.createCollection(name) };
    });
  }

  private async renameCollection(from: string): Promise<void> {
    const name = await promptText({
      title: 'Sammlung umbenennen',
      label: 'Name',
      value: from,
      confirm: 'Umbenennen',
      check: (v) => checkCollectionName(v, this.store.index.collections, from),
    });
    if (name === null) return;
    await this.run(async () => {
      const to = await this.store.renameCollection(from, name);
      this.actions.relocated(this.store.folderOf(from), this.store.folderOf(to));
      this.view = { kind: 'collection', name: to };
    });
  }

  private deleteCollection(name: string): Promise<void> {
    return this.run(async () => {
      await this.store.deleteCollection(name);
      this.view = { kind: 'all' };
    });
  }

  // ── Small popup menu ─────────────────────────────────────────────────────

  private openMenu(anchor: HTMLElement, entries: [string, () => Promise<void>][]): void {
    this.closeMenu();
    const menu = el('div', { className: 'menu' });
    menu.setAttribute('role', 'menu');
    for (const [label, action] of entries) {
      const b = el('button', { type: 'button', textContent: label });
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeMenu();
        void action();
      });
      menu.append(b);
    }
    this.root.append(menu);
    const a = anchor.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(a.right - m.width, window.innerWidth - m.width - 8))}px`;
    menu.style.top = `${a.bottom + m.height + 4 > window.innerHeight ? a.top - m.height - 4 : a.bottom + 4}px`;
    this.menu = menu;
    (menu.querySelector('button') as HTMLButtonElement | null)?.focus();
    setTimeout(() => document.addEventListener('click', this.closeMenuOnOutside, { once: true }));
  }

  private readonly closeMenuOnOutside = (e: MouseEvent) => {
    if (this.menu && !this.menu.contains(e.target as Node)) this.closeMenu();
  };

  private closeMenu(): void {
    const hadFocus = this.menu?.contains(document.activeElement) ?? false;
    this.menu?.remove();
    this.menu = null;
    // Keep the keyboard inside the drawer (Esc, arrows, search).
    if (hadFocus && this.isOpen) this.searchInput.focus();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (this.menu) {
        this.closeMenu();
        this.searchInput.focus();
      } else {
        this.hide();
      }
      return;
    }
    if (this.menu) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const buttons = [...this.menu.querySelectorAll('button')];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }
      return;
    }
    const items = this.visibleItems();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.highlighted = Math.max(0, Math.min(items.length - 1, this.highlighted + (e.key === 'ArrowDown' ? 1 : -1)));
      this.renderItems();
      this.list.querySelector('.is-highlighted')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && document.activeElement === this.searchInput) {
      e.preventDefault();
      const item = items[this.highlighted];
      if (item) void this.activate(item);
    }
  }
}
