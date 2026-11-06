/**
 * A scroll wheel like the iPhone timer: a list that snaps to its middle row; the row in the band is the choice.
 * Scroll with the mouse wheel, drag with the mouse or finger, click a row, or use ↑ ↓ PageUp PageDown.
 */
export const WHEEL_ROW = 38;
const VISIBLE_ROWS = 5;

export class Wheel {
  /** The wheel with its band; put it into a dialog. */
  readonly el: HTMLElement;
  private readonly scroller: HTMLElement;
  private readonly list: HTMLElement;
  private items: HTMLElement[] = [];
  private frame = 0;
  private dragging = false;
  /** Where a key press is taking the wheel (it is still turning): the next press goes on from there. */
  private wanted: number | null = null;
  private wantedTimer = 0;

  constructor(
    items: readonly string[],
    index: number,
    private readonly onChange: (index: number) => void,
    label: string,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'wheel';
    this.el.style.height = `${WHEEL_ROW * VISIBLE_ROWS}px`;
    const band = document.createElement('div');
    band.className = 'wheel__band';
    band.style.height = `${WHEEL_ROW}px`;
    this.scroller = document.createElement('div');
    this.scroller.className = 'wheel__scroll';
    this.scroller.tabIndex = 0;
    this.scroller.setAttribute('role', 'listbox');
    this.scroller.setAttribute('aria-label', label);
    this.el.append(band, this.scroller);
    this.list = document.createElement('div');
    this.list.className = 'wheel__list';
    this.list.style.padding = `${WHEEL_ROW * 2}px 0`;
    this.scroller.append(this.list);
    this.scroller.addEventListener('scroll', () => this.onScroll());
    this.scroller.addEventListener('keydown', (e) => this.onKey(e));
    this.scroller.addEventListener('pointerdown', (e) => this.onDown(e));
    this.setItems(items, index);
  }

  /** The row in the middle band. */
  focus(): void {
    this.scroller.focus();
    // Scrolling before the wheel is on screen has no effect: put the band on its row again now that it is.
    if (this.at !== null && this.scroller.scrollTop !== this.at * WHEEL_ROW) this.goTo(this.at, false);
  }

  get index(): number {
    return Math.max(0, Math.min(this.items.length - 1, Math.round(this.scroller.scrollTop / WHEEL_ROW)));
  }

  /** Replaces the rows (e.g. when the kind of interval changes) and puts the band on `index`. */
  setItems(items: readonly string[], index: number): void {
    this.items = items.map((text, i) => {
      const row = document.createElement('div');
      row.className = 'wheel__item';
      row.style.height = `${WHEEL_ROW}px`;
      row.textContent = text;
      row.setAttribute('role', 'option');
      row.addEventListener('click', () => {
        if (!this.dragging) this.goTo(i, true);
      });
      return row;
    });
    this.list.replaceChildren(...this.items);
    this.goTo(index, false);
  }

  goTo(index: number, smooth: boolean): void {
    const i = Math.max(0, Math.min(this.items.length - 1, index));
    this.wanted = i;
    this.at = i;
    window.clearTimeout(this.wantedTimer);
    this.wantedTimer = window.setTimeout(() => (this.wanted = null), 450);
    this.scroller.scrollTo({ top: i * WHEEL_ROW, behavior: smooth ? 'smooth' : 'instant' });
    this.paint(i * WHEEL_ROW);
  }

  /** Rows fade and shrink with their distance from the band. */
  private paint(top: number): void {
    const centre = top / WHEEL_ROW;
    this.items.forEach((row, i) => {
      const d = Math.abs(i - centre);
      row.style.opacity = String(Math.max(0.12, 1 - d * 0.3));
      row.style.transform = `scale(${Math.max(0.72, 1 - d * 0.1)})`;
      row.classList.toggle('is-chosen', d < 0.5);
      row.setAttribute('aria-selected', String(d < 0.5));
    });
  }

  private at: number | null = null;
  private lastIndex = -1;
  private onScroll(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.paint(this.scroller.scrollTop);
      const i = this.index;
      if (i !== this.lastIndex) {
        this.lastIndex = i;
        this.onChange(i);
      }
    });
  }

  private onKey(e: KeyboardEvent): void {
    const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5, Home: -999, End: 999 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    this.goTo((this.wanted ?? this.index) + step, true);
  }

  /** A mouse drags the list (a finger scrolls it natively); letting go snaps to the nearest row. */
  private onDown(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const startY = e.clientY;
    const startTop = this.scroller.scrollTop;
    this.scroller.style.scrollSnapType = 'none';
    this.scroller.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      if (Math.abs(m.clientY - startY) > 3) this.dragging = true;
      this.scroller.scrollTop = startTop - (m.clientY - startY);
    };
    const up = () => {
      this.scroller.removeEventListener('pointermove', move);
      this.scroller.removeEventListener('pointerup', up);
      this.scroller.removeEventListener('pointercancel', up);
      this.scroller.style.scrollSnapType = '';
      this.goTo(this.index, true);
      window.setTimeout(() => (this.dragging = false), 0);
    };
    this.scroller.addEventListener('pointermove', move);
    this.scroller.addEventListener('pointerup', up);
    this.scroller.addEventListener('pointercancel', up);
  }
}
