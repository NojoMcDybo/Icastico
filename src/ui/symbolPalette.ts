/**
 * The menu of special signs (ADR 0024): every sign of the library as a button, in a pane of glass under the "Zeichen"
 * button. A double click puts the sign on the selected note (or on the bar of the selection); a sign can also be dragged
 * onto any note. Signs that are already there are lit. It never takes the keyboard focus, so typing notes goes on.
 */
import { BAR_SIGNS, NOTE_SYMBOLS, type NoteSymbolGroup } from '../core/symbols';

export interface SymbolPaletteHost {
  /** Double click: put a note sign (index into NOTE_SYMBOLS) or a bar sign (index into BAR_SIGNS) on the selection. */
  insert(kind: 'note' | 'bar', index: number): void;
  /** A button was pressed down: the workstation turns it into a drag onto the score once the pointer moves. */
  drag(kind: 'note' | 'bar', index: number, glyph: string, e: PointerEvent): void;
}

const GROUPS: { readonly key: NoteSymbolGroup; readonly title: string }[] = [
  { key: 'dynamic', title: 'Lautstärke' },
  { key: 'hairpin', title: 'Crescendo / Decrescendo' },
  { key: 'articulation', title: 'Artikulation' },
  { key: 'ornament', title: 'Verzierung' },
  { key: 'fermata', title: 'Fermate' },
];

export class SymbolPalette {
  readonly el: HTMLElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();

  constructor(host: SymbolPaletteHost) {
    this.el = document.createElement('div');
    this.el.className = 'symbols';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Zeichen');
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    // Pressing a button must not move the focus away from the score.
    this.el.addEventListener('mousedown', (e) => e.preventDefault());

    const head = document.createElement('div');
    head.className = 'symbols__head';
    const title = document.createElement('strong');
    title.textContent = 'Zeichen';
    const hint = document.createElement('span');
    hint.textContent = 'Doppelklick setzt, ziehen platziert';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'symbols__close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Palette schließen');
    close.addEventListener('click', () => this.toggle(false));
    head.append(title, hint, close);
    head.title = 'Zum Verschieben ziehen';
    this.el.append(head);
    this.makeDraggable(head);

    for (const group of GROUPS) {
      const symbols = NOTE_SYMBOLS.map((s, index) => ({ s, index })).filter((x) => x.s.group === group.key);
      this.section(group.title, symbols.map(({ s, index }) => this.button(host, 'note', index, s.id, s.glyph, s.label, s.group === 'dynamic' || s.group === 'hairpin')));
    }
    this.section('Takt: Wiederholung, Klammer, Sprung', BAR_SIGNS.map((s, index) => this.button(host, 'bar', index, s.id, s.glyph, s.label, false)));
  }

  /** The palette floats over the score: drag it by its head to where it does not cover the music. */
  private makeDraggable(handle: HTMLElement): void {
    handle.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const box = this.el.getBoundingClientRect();
      const dx = e.clientX - box.left;
      const dy = e.clientY - box.top;
      handle.setPointerCapture(e.pointerId);
      const move = (m: PointerEvent) => {
        this.el.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, m.clientX - dx))}px`;
        this.el.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, m.clientY - dy))}px`;
        this.el.style.right = 'auto';
        this.el.style.bottom = 'auto';
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  private section(title: string, buttons: HTMLButtonElement[]): void {
    const wrap = document.createElement('section');
    wrap.className = 'symbols__group';
    const h = document.createElement('h3');
    h.textContent = title;
    const row = document.createElement('div');
    row.className = 'symbols__row';
    row.append(...buttons);
    wrap.append(h, row);
    this.el.append(wrap);
  }

  private button(host: SymbolPaletteHost, kind: 'note' | 'bar', index: number, id: string, glyph: string, label: string, italic: boolean): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `symbols__btn${italic ? ' symbols__btn--italic' : ''}`;
    b.textContent = glyph;
    b.title = `${label} – Doppelklick setzt es an die gewählte Note, oder auf eine Note ziehen`;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('dblclick', () => host.insert(kind, index));
    b.addEventListener('pointerdown', (e) => {
      if (e.button === 0) host.drag(kind, index, glyph, e);
    });
    this.buttons.set(`${kind}:${id}`, b);
    return b;
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  toggle(open = this.el.hidden): void {
    this.el.hidden = !open;
  }

  /** Lights the buttons of the signs that are on the selected note / on the bar. */
  refresh(noteSigns: readonly string[], barSigns: readonly string[]): void {
    for (const [key, button] of this.buttons) {
      const [kind, id] = key.split(':') as ['note' | 'bar', string];
      const on = (kind === 'note' ? noteSigns : barSigns).includes(id);
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', String(on));
    }
  }
}
