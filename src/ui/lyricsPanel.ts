/**
 * The lyrics field (ADR 0029): a text box docked at the bottom where the whole text is typed with hyphens;
 * below it the syllables as buttons. Pick a syllable, click notes: every click puts the current syllable on that
 * note and moves on to the next syllable.
 */
import { MAX_VERSES, splitSyllables } from '../core/lyrics';

export interface LyricsHost {
  /** The text of the selected note on, to start from when the field is empty. */
  existingText(verse: number): string;
  /** "Ab gewählter Note alle setzen": the whole text onto the notes from the selected one. */
  applyAll(text: string, verse: number): void;
}

const KEY = 'icastico.lyricsDraft';
/** The draft of verse 1 keeps its old key; verse k has `icastico.lyricsDraft.k`. */
const draftKey = (verse: number): string => (verse === 1 ? KEY : `${KEY}.${verse}`);
const POS_KEY = 'icastico.lyricsPosition';

const read = (verse: number): string => {
  try {
    return localStorage.getItem(draftKey(verse)) ?? '';
  } catch {
    return '';
  }
};
const write = (verse: number, text: string): void => {
  try {
    localStorage.setItem(draftKey(verse), text);
  } catch {
    // not remembered
  }
};

const readPosition = (): { x: number; y: number } | null => {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null') as { x?: unknown; y?: unknown } | null;
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : null;
  } catch {
    return null;
  }
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

export class LyricsPanel {
  readonly el: HTMLElement;
  private readonly text: HTMLTextAreaElement;
  private readonly chipBox: HTMLElement;
  private readonly status: HTMLElement;
  private readonly head: HTMLElement;
  private readonly versePills: HTMLButtonElement[];
  private verseNo = 1;
  private chips: string[] = [];
  private current = 0;
  private done = new Set<number>();

  constructor(private readonly host: LyricsHost) {
    this.text = el('textarea', { className: 'lyrics__text', rows: 2, placeholder: 'Liedtext mit Bindestrichen, z. B. Gu-ten A-bend, gu-te Nacht', spellcheck: false });
    this.text.setAttribute('aria-label', 'Liedtext');
    this.status = el('span', { className: 'lyrics__status' });
    this.chipBox = el('div', { className: 'lyrics__chips' });
    const close = el('button', { type: 'button', className: 'lyrics__close', textContent: '✕', title: 'Schließen (Esc)' });
    close.setAttribute('aria-label', 'Liedtext-Feld schließen');
    const all = el('button', { type: 'button', className: 'pill', textContent: 'Ab gewählter Note alle setzen', title: 'Die Silben ab der gewählten Silbe der Reihe nach auf die Noten ab der gewählten Note legen' });
    const again = el('button', { type: 'button', className: 'pill', textContent: 'Von vorn', title: 'Wieder bei der ersten Silbe anfangen' });
    this.versePills = Array.from({ length: MAX_VERSES }, (_, i) => el('button', { type: 'button', className: 'pill', textContent: `Strophe ${i + 1}`, title: `Die ${i + 1}. Strophe eingeben` }));
    this.versePills.forEach((pill, i) => pill.addEventListener('click', () => this.setVerse(i + 1)));
    this.el = el('section', { className: 'lyrics', hidden: true }, el('div', { className: 'lyrics__head' }, el('strong', { textContent: 'Liedtext' }), this.status, close), el('div', { className: 'lyrics__verses' }, ...this.versePills), this.text, this.chipBox, el('div', { className: 'lyrics__foot' }, all, again));
    this.el.setAttribute('aria-label', 'Liedtext');
    this.head = this.el.querySelector<HTMLElement>('.lyrics__head')!;
    this.head.title = 'Zum Verschieben hier greifen und ziehen';
    this.head.addEventListener('pointerdown', (e) => this.beginMove(e));

    this.text.addEventListener('input', () => {
      write(this.verseNo, this.text.value);
      this.parse(false);
    });
    this.text.addEventListener('keydown', (e) => {
      e.stopPropagation(); // typing is typing: no shortcut of the editor
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
      }
    });
    close.addEventListener('click', () => this.hide());
    again.addEventListener('click', () => {
      this.done.clear();
      this.current = 0;
      this.render();
    });
    all.addEventListener('click', () => this.host.applyAll(this.chips.slice(this.current).join(' '), this.verseNo));
  }

  /** The verse being entered (1 … MAX_VERSES). */
  get verse(): number {
    return this.verseNo;
  }

  /** Switches the verse: the draft of this one is kept, the draft of the other one (or its text in the score) is loaded. */
  private setVerse(verse: number): void {
    if (verse === this.verseNo) return;
    write(this.verseNo, this.text.value);
    this.verseNo = verse;
    this.text.value = read(verse) || this.host.existingText(verse);
    this.parse(true);
    this.text.focus();
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  /** A click on a note puts a syllable on it. */
  get assigning(): boolean {
    return this.isOpen && this.current < this.chips.length;
  }

  show(): void {
    if (!this.text.value) this.text.value = read(this.verseNo) || this.host.existingText(this.verseNo);
    this.el.hidden = false;
    const saved = readPosition();
    if (saved) this.place(saved.x, saved.y);
    this.parse(true);
    this.text.focus();
  }

  hide(): void {
    this.el.hidden = true;
    this.mark();
  }

  toggle(): void {
    if (this.isOpen) this.hide();
    else this.show();
  }

  /** Puts the window at a place, kept inside the screen. */
  private place(x: number, y: number): void {
    const box = this.el.getBoundingClientRect();
    const left = Math.max(0, Math.min(window.innerWidth - Math.min(box.width, window.innerWidth), x));
    const top = Math.max(0, Math.min(window.innerHeight - 60, y));
    Object.assign(this.el.style, { left: `${left}px`, top: `${top}px`, bottom: 'auto', transform: 'none' });
  }

  /** The window is dragged by its head (not by the buttons); where it was left is remembered. */
  private beginMove(e: PointerEvent): void {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    e.preventDefault();
    const box = this.el.getBoundingClientRect();
    const dx = e.clientX - box.left;
    const dy = e.clientY - box.top;
    const move = (m: PointerEvent) => this.place(m.clientX - dx, m.clientY - dy);
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const at = this.el.getBoundingClientRect();
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({ x: at.left, y: at.top }));
      } catch {
        // not remembered
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  /** The syllable for the clicked note; moves on to the next one. */
  take(): string | null {
    if (!this.assigning) return null;
    const syllable = this.chips[this.current]!;
    this.done.add(this.current);
    this.current++;
    this.render();
    return syllable;
  }

  /** The text changed: same syllables stay "done" as far as they are unchanged at the front. */
  private parse(reset: boolean): void {
    const next = splitSyllables(this.text.value);
    if (reset) {
      this.done.clear();
      this.current = 0;
    } else {
      this.done = new Set([...this.done].filter((i) => this.chips[i] === next[i]));
      this.current = Math.min(this.current, next.length);
    }
    this.chips = next;
    this.render();
  }

  /** While a click on a note puts a syllable on it, the notes show it (cursor). */
  private mark(): void {
    document.body.classList.toggle('is-lyric-assign', this.assigning);
  }

  private render(): void {
    this.versePills.forEach((pill, i) => {
      pill.classList.toggle('is-active', i + 1 === this.verseNo);
      pill.setAttribute('aria-pressed', String(i + 1 === this.verseNo));
    });
    this.chipBox.replaceChildren(
      ...this.chips.map((chip, i) => {
        const b = el('button', { type: 'button', className: `lyrics__chip${this.done.has(i) ? ' is-done' : ''}${i === this.current ? ' is-current' : ''}`, textContent: chip });
        b.setAttribute('aria-pressed', String(i === this.current));
        b.addEventListener('click', () => {
          this.current = i;
          this.render();
        });
        return b;
      }),
    );
    this.status.textContent =
      this.chips.length === 0
        ? 'Text eintippen, Silben mit Bindestrich trennen.'
        : this.current < this.chips.length
          ? `Silbe ${this.current + 1} von ${this.chips.length}: „${this.chips[this.current]}“ – jetzt auf eine Note klicken.`
          : 'Alle Silben sind zugeordnet.';
    this.mark();
  }
}
