/**
 * The library as home screen (ADR 0009), modelled on the owner's PDF reader
 * Folio: a large title, collections as pills, a grid of tiles showing the
 * first page of every score, a round "⋯" button and a context menu per tile.
 *
 * Keyboard: type to search, arrow keys move through the grid, Enter opens,
 * Esc goes back to the open score.
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
import { APP_VERSION } from '../version';
import { ask, inform, promptText } from './dialog';
import type { Thumbnails } from './thumbnails';

export type LibraryView = { kind: 'all' } | { kind: 'collection'; name: string } | { kind: 'trash' };

export interface LibraryActions {
  /** Path of the score open in the editor (highlighted; Esc returns to it). */
  currentPath(): string | null;
  /** Saves pending changes before files are moved around. */
  flush(): Promise<void>;
  open(path: string): Promise<void>;
  newScore(collection: string | null): Promise<void>;
  openExternal(): Promise<void>;
  /** Imports a MusicXML file as a new score. */
  importFile(): Promise<void>;
  /** A file or folder moved: `from` → `to` (the editor follows its document). */
  relocated(from: string, to: string): void;
  /** The open document went to the trash. */
  closedByTrash(): void;
  /** "Nach Updates suchen" (desktop only). */
  checkForUpdates?: () => Promise<void>;
}

interface MenuEntry {
  readonly label: string;
  readonly hint?: string;
  readonly danger?: boolean;
  readonly run: () => Promise<void>;
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

const DOTS =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>';
const PLUS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>';
const BACK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export class LibraryHome {
  private view: LibraryView = { kind: 'all' };
  private search = '';
  private highlighted = 0;
  private menu: HTMLElement | null = null;
  private thumbQueue = 0;
  private update: { text: string; install: () => void } | null = null;
  private readonly back = el('button', { type: 'button', className: 'round home__back', title: 'Zurück zur Partitur (Esc)' });
  private readonly subtitle = el('p', { className: 'home__subtitle' });
  private readonly banner = el('div', { className: 'home__update', hidden: true });
  private readonly pills = el('nav', { className: 'home__pills' });
  private readonly searchInput = el('input', { type: 'search', placeholder: 'Suchen …', className: 'home__search' });
  private readonly grid = el('div', { className: 'home__grid' });
  private readonly footer = el('footer', { className: 'home__footer' });

  constructor(
    private readonly root: HTMLElement,
    private readonly store: LibraryStore,
    private readonly thumbnails: Thumbnails,
    private readonly actions: LibraryActions,
  ) {
    root.classList.add('home');
    root.hidden = true;
    root.setAttribute('aria-label', 'Bibliothek');
    this.back.innerHTML = BACK;
    this.back.setAttribute('aria-label', 'Zurück zur Partitur');
    this.back.addEventListener('click', () => this.hide());
    this.searchInput.setAttribute('aria-label', 'Partituren suchen');
    const header = el(
      'header',
      { className: 'home__header' },
      this.back,
      el('div', {}, el('h1', { textContent: 'Bibliothek' }), this.subtitle),
    );
    const bar = el('div', { className: 'home__bar' }, this.pills, this.searchInput);
    root.append(el('div', { className: 'home__inner' }, header, this.banner, bar, this.grid, this.footer));

    this.searchInput.addEventListener('input', () => {
      this.search = this.searchInput.value;
      this.highlighted = 0;
      this.renderGrid();
    });
    root.addEventListener('keydown', (e) => this.onKey(e));
    root.addEventListener('scroll', () => this.closeMenu(), true);
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
    // Every opening starts with an empty search – a leftover filter looks like lost scores.
    this.search = '';
    this.searchInput.value = '';
    this.highlighted = 0;
    this.root.hidden = false;
    this.render();
    this.searchInput.focus();
  }

  /** Back to the score. Without an open score the home screen stays. */
  hide(): void {
    if (!this.actions.currentPath()) return;
    this.closeMenu();
    // Hand the keyboard back to the score (no typing into a hidden search field).
    if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.root.hidden = true;
  }

  async toggle(): Promise<void> {
    if (this.isOpen) this.hide();
    else await this.show();
  }

  /** Shows (or removes) the "new version" banner (Folio style: no dialog). */
  setUpdate(update: { text: string; install: () => void } | null): void {
    this.update = update;
    this.renderBanner();
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  private render(): void {
    const live = this.store.index.items.filter((i) => !i.trashed).length;
    this.subtitle.textContent = `${live === 1 ? 'Eine Partitur' : `${live} Partituren`} in Dokumente › Icastico`;
    this.back.hidden = !this.actions.currentPath();
    this.renderBanner();
    this.renderPills();
    this.renderGrid();
    this.renderFooter();
  }

  private renderBanner(): void {
    this.banner.hidden = !this.update;
    if (!this.update) return;
    const install = el('button', { type: 'button', className: 'pill is-primary', textContent: 'Installieren' });
    const { install: run } = this.update;
    install.addEventListener('click', () => run());
    this.banner.replaceChildren(el('span', { textContent: this.update.text }), install);
  }

  private pill(view: LibraryView, label: string, count: number, badge?: HTMLElement): HTMLElement {
    const active =
      view.kind === this.view.kind && (view.kind !== 'collection' || (this.view.kind === 'collection' && this.view.name === view.name));
    const b = el(
      'button',
      { type: 'button', className: `pill${active ? ' is-active' : ''}` },
      ...(badge ? [badge] : []),
      el('span', { textContent: label }),
      ...(count ? [el('span', { className: 'pill__count', textContent: String(count) })] : []),
    );
    b.dataset.view = view.kind === 'collection' ? `collection:${view.name}` : view.kind;
    b.setAttribute('aria-pressed', String(active));
    b.addEventListener('click', () => {
      this.view = view;
      this.highlighted = 0;
      this.render();
      this.searchInput.focus();
    });
    if (view.kind === 'collection') {
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.openMenu(this.collectionActions(view.name), { x: e.clientX, y: e.clientY });
      });
    }
    return b;
  }

  private renderPills(): void {
    const index = this.store.index;
    const live = index.items.filter((i) => !i.trashed);
    const collections = index.collections.map((name) => {
      const badge = el('span', { className: 'pill__badge', textContent: initials(name) });
      badge.style.setProperty('--hue', String(collectionHue(name)));
      return this.pill({ kind: 'collection', name }, name, live.filter((i) => i.collection === name).length, badge);
    });
    const add = el('button', { type: 'button', className: 'pill pill--ghost', textContent: '+ Sammlung' });
    add.addEventListener('click', () => void this.createCollection());
    const parts: HTMLElement[] = [this.pill({ kind: 'all' }, 'Alle', live.length), ...collections, add];
    if (this.view.kind === 'collection') {
      const name = this.view.name;
      const more = el('button', { type: 'button', className: 'round round--sm' });
      more.innerHTML = DOTS;
      more.title = `Sammlung „${name}“`;
      more.setAttribute('aria-label', `Sammlung ${name}: weitere Aktionen`);
      more.addEventListener('click', () => this.openMenu(this.collectionActions(name), more));
      parts.push(more);
    }
    const trashCount = index.items.length - live.length;
    parts.push(el('span', { className: 'home__pills-spacer' }), this.pill({ kind: 'trash' }, 'Papierkorb', trashCount));
    this.pills.replaceChildren(...parts);
  }

  private visibleItems(): LibraryItem[] {
    return itemsFor(this.store.index, this.view, this.search);
  }

  private renderGrid(): void {
    const items = this.visibleItems();
    const current = this.actions.currentPath();
    const now = Date.now();
    this.highlighted = Math.min(this.highlighted, Math.max(0, items.length - 1));
    const tiles: HTMLElement[] = [];

    if (this.view.kind !== 'trash' && !this.search) {
      const create = el('button', { type: 'button', className: 'tile tile--new' });
      create.innerHTML = `<span class="tile__cover">${PLUS}</span><span class="tile__name">Neue Partitur</span><span class="tile__meta">Strg+N</span>`;
      create.addEventListener('click', () => {
        this.root.hidden = true;
        void this.actions.newScore(this.collection);
      });
      tiles.push(create);
    } else if (this.view.kind === 'trash' && items.length) {
      const empty = el('button', { type: 'button', className: 'tile tile--new' });
      empty.innerHTML = '<span class="tile__cover tile__cover--text">Papierkorb leeren</span><span class="tile__name">Alles endgültig löschen</span>';
      empty.addEventListener('click', () => void this.emptyTrash());
      tiles.push(empty);
    }

    items.forEach((item, i) => {
      const cover = el('span', { className: 'tile__cover' });
      if (item.broken) cover.append(el('span', { className: 'tile__broken', textContent: 'Kann nicht gelesen werden' }));
      const meta = [item.composer, item.summary.split(' · ').slice(-2).join(' · '), relativeTime(item.modified, now)]
        .filter(Boolean)
        .join(' · ');
      const where =
        this.view.kind === 'all' && item.collection ? el('span', { className: 'tile__where', textContent: item.collection }) : '';
      const open = el(
        'button',
        { type: 'button', className: 'tile', title: item.broken ? `Kann nicht geöffnet werden: ${item.broken}` : item.summary },
        cover,
        el('span', { className: 'tile__name' }, item.title, where),
        el('span', { className: 'tile__meta', textContent: meta }),
      );
      open.style.animationDelay = `${Math.min(i * 22, 260)}ms`;
      open.addEventListener('click', () => void this.activate(item));
      const more = el('button', { type: 'button', className: 'round round--sm tile__more' });
      more.innerHTML = DOTS;
      more.setAttribute('aria-label', `${item.title}: weitere Aktionen`);
      more.setAttribute('aria-haspopup', 'menu');
      more.addEventListener('click', () => this.openMenu(this.itemActions(item), more));
      const article = el(
        'article',
        {
          className: [
            'tile-item',
            i === this.highlighted ? 'is-highlighted' : '',
            item.path === current ? 'is-current' : '',
            item.trashed ? 'is-trashed' : '',
          ]
            .filter(Boolean)
            .join(' '),
        },
        open,
        more,
      );
      article.dataset.path = item.path;
      article.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.openMenu(this.itemActions(item), { x: e.clientX, y: e.clientY });
      });
      tiles.push(article);
    });

    if (items.length === 0 && (this.search || this.view.kind === 'trash')) {
      const text = this.search ? `Nichts gefunden für „${this.search}“.` : 'Der Papierkorb ist leer.';
      tiles.push(el('p', { className: 'home__empty', textContent: text }));
    }
    this.grid.replaceChildren(...tiles);
    this.fillThumbnails(items);
  }

  /** Engraves the preview pictures one per frame, so the grid appears at once. */
  private fillThumbnails(items: LibraryItem[]): void {
    const run = ++this.thumbQueue;
    const pending = items.filter((i) => i.score);
    const next = () => {
      if (run !== this.thumbQueue || !this.isOpen) return;
      const item = pending.shift();
      if (!item) return;
      const cover = this.grid.querySelector(`[data-path="${CSS.escape(item.path)}"] .tile__cover`);
      const url = this.thumbnails.url(item);
      if (cover && url && !cover.querySelector('img')) {
        const img = el('img', { src: url, alt: '' });
        img.decoding = 'async';
        cover.append(img);
      }
      if (pending.length) requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }

  private renderFooter(): void {
    const link = (text: string, title: string, onClick: () => void) => {
      const b = el('button', { type: 'button', className: 'home__link', textContent: text, title });
      b.addEventListener('click', onClick);
      return b;
    };
    const parts = [
      link('Ordner im Explorer zeigen', this.store.root, () => {
        this.store.reveal().catch((err: unknown) => void inform('Ordner kann nicht angezeigt werden', errorText(err)));
      }),
      link('Andere Datei öffnen …', 'Eine .icastico-Datei von außerhalb der Bibliothek', () => {
        this.root.hidden = true;
        void this.actions.openExternal();
      }),
      link('MusicXML importieren …', 'Eine MusicXML-Datei (z. B. aus Finale exportiert) als neue Partitur', () => {
        this.root.hidden = true;
        void this.actions.importFile();
      }),
    ];
    if (this.actions.checkForUpdates) {
      parts.push(link(`Nach Updates suchen · Version ${APP_VERSION}`, '', () => void this.actions.checkForUpdates?.()));
    }
    this.footer.replaceChildren(...parts);
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  private itemActions(item: LibraryItem): MenuEntry[] {
    if (item.trashed) {
      return [
        { label: 'Wiederherstellen', hint: 'Zurück in ihre Sammlung', run: () => this.restore(item) },
        { label: 'Endgültig löschen …', hint: 'Lässt sich nicht rückgängig machen', danger: true, run: () => this.deleteForever(item) },
      ];
    }
    const targets: MenuEntry[] = [null, ...this.store.index.collections]
      .filter((c) => c !== item.collection)
      .map((c) => ({
        label: `Verschieben nach: ${c ?? 'Oberste Ebene'}`,
        run: () => this.move(item, c),
      }));
    return [
      { label: 'Öffnen', run: () => this.activate(item) },
      { label: 'Duplizieren', hint: 'Kopie in derselben Sammlung', run: () => this.run(() => this.store.duplicate(item).then(() => undefined)) },
      ...targets,
      {
        label: 'Speicherort öffnen',
        hint: 'Datei im Explorer anzeigen',
        run: () => this.store.reveal(item.path).catch((err: unknown) => void inform('Ordner kann nicht angezeigt werden', errorText(err))),
      },
      { label: 'In den Papierkorb', hint: 'Lässt sich wiederherstellen', danger: true, run: () => this.trash(item) },
    ];
  }

  private collectionActions(name: string): MenuEntry[] {
    return [
      { label: 'Umbenennen …', run: () => this.renameCollection(name) },
      { label: 'Sammlung löschen', hint: 'Nur wenn sie leer ist', danger: true, run: () => this.deleteCollection(name) },
    ];
  }

  private async activate(item: LibraryItem): Promise<void> {
    if (item.trashed) {
      const anchor = this.grid.querySelector<HTMLElement>(`[data-path="${CSS.escape(item.path)}"] .tile__more`);
      if (anchor) this.openMenu(this.itemActions(item), anchor);
      return;
    }
    if (item.broken) {
      await inform(`„${item.fileName}“ kann nicht geöffnet werden`, item.broken);
      return;
    }
    this.root.hidden = true;
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
    if (this.isOpen) {
      this.render();
      if (!document.querySelector('.modal')) this.searchInput.focus();
    }
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
        { id: 'cancel', label: 'Abbrechen', primary: true },
        { id: 'delete', label: 'Endgültig löschen' },
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
        { id: 'cancel', label: 'Abbrechen', primary: true },
        { id: 'empty', label: 'Papierkorb leeren' },
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

  // ── Popup menu (Folio style: label + explanation, danger in red) ─────────

  private openMenu(entries: MenuEntry[], at: HTMLElement | { x: number; y: number }): void {
    this.closeMenu();
    const menu = el('div', { className: 'menu' });
    menu.setAttribute('role', 'menu');
    for (const entry of entries) {
      const b = el(
        'button',
        { type: 'button', className: entry.danger ? 'is-danger' : '' },
        entry.label,
        ...(entry.hint ? [el('span', { textContent: entry.hint })] : []),
      );
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeMenu();
        void entry.run();
      });
      menu.append(b);
    }
    document.body.append(menu);
    const m = menu.getBoundingClientRect();
    const a = at instanceof HTMLElement ? at.getBoundingClientRect() : { left: at.x, right: at.x, top: at.y, bottom: at.y };
    const left = at instanceof HTMLElement ? a.right - m.width : a.left;
    menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - m.width - 8))}px`;
    menu.style.top = `${a.bottom + m.height + 6 > window.innerHeight ? Math.max(8, a.top - m.height - 6) : a.bottom + 6}px`;
    this.menu = menu;
    if (at instanceof HTMLElement) at.setAttribute('aria-expanded', 'true');
    menu.querySelector('button')?.focus();
    setTimeout(() => document.addEventListener('click', this.closeMenuOnOutside, { once: true }));
    menu.addEventListener('keydown', (e) => this.onMenuKey(e));
  }

  private readonly closeMenuOnOutside = (e: MouseEvent) => {
    if (this.menu && !this.menu.contains(e.target as Node)) this.closeMenu();
  };

  private closeMenu(): void {
    const hadFocus = this.menu?.contains(document.activeElement) ?? false;
    this.menu?.remove();
    this.menu = null;
    this.root.querySelectorAll('[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    // Keep the keyboard on the home screen (Esc, arrows, search).
    if (hadFocus && this.isOpen) this.searchInput.focus();
  }

  private onMenuKey(e: KeyboardEvent): void {
    if (!this.menu) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.closeMenu();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const buttons = [...this.menu.querySelectorAll('button')];
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
    }
  }

  /** Tiles per row, measured from the rendered grid. */
  private columns(): number {
    const tiles = [...this.grid.querySelectorAll<HTMLElement>('.tile-item, .tile--new')];
    if (tiles.length < 2) return 1;
    const top = tiles[0]!.offsetTop;
    const perRow = tiles.findIndex((t) => t.offsetTop !== top);
    return perRow === -1 ? tiles.length : perRow;
  }

  private onKey(e: KeyboardEvent): void {
    if (this.menu) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      return;
    }
    const items = this.visibleItems();
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: this.columns(), ArrowUp: -this.columns() }[e.key];
    const inSearch = document.activeElement === this.searchInput;
    if (step !== undefined && !(inSearch && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && this.searchInput.value)) {
      e.preventDefault();
      this.highlighted = Math.max(0, Math.min(items.length - 1, this.highlighted + step));
      this.grid.querySelectorAll('.tile-item').forEach((t, i) => t.classList.toggle('is-highlighted', i === this.highlighted));
      this.grid.querySelector('.is-highlighted')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && inSearch) {
      e.preventDefault();
      const item = items[this.highlighted];
      if (item) void this.activate(item);
    }
  }
}
