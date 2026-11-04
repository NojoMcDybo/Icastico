/**
 * The small menu on a clicked piano-roll bar or glide line (ADR 0016):
 * - bar: loudness (slider) and the loudness line over the note;
 * - glide: the course of the transition (pitch and loudness through the gap).
 *
 * The line passes through its points; you set a point on the line (click it, or key P at the
 * mouse position) and pull it – the whole line follows smoothly. Every change is a normal roll
 * edit, a drag is one undo step. The menu only shows what the score says (`refresh`).
 */
import { type Curve, type CurveKind, DEFAULT_VOLUME, MAX_VOLUME, MIN_VOLUME, SHAPES, addPointAt, curveAt, defaultCurve, roundCoord, sampleCurve, volumeMark } from '../core/curve';
import { type EditorState } from '../core/editor/state';
import { type RollEdit } from '../core/editor/rollEdits';
import { locateTones } from '../core/model';
import { pitchToString } from '../core/pitch';

export interface ShapeHost {
  state(): EditorState;
  beginGesture(): void;
  preview(edit: RollEdit): void;
  endGesture(commit: boolean): void;
  edit(edit: RollEdit): void;
}

export type ShapeTarget = { readonly kind: 'tone'; readonly id: string } | { readonly kind: 'link'; readonly id: string };

const NS = 'http://www.w3.org/2000/svg';
const W = 264;
const H = 128;
const PAD = 14;
/** Distance in pixels within which a click counts as "on the line". */
const NEAR = 10;

const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, cls?: string): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (cls) e.setAttribute('class', cls);
  return e;
};

const px = (x: number): number => PAD + x * (W - 2 * PAD);
const py = (y: number): number => H - PAD - y * (H - 2 * PAD);
const fromX = (x: number): number => (x - PAD) / (W - 2 * PAD);
const fromY = (y: number): number => (H - PAD - y) / (H - 2 * PAD);

export class CurvePopup {
  private readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly volumeRow: HTMLElement;
  private readonly slider: HTMLInputElement;
  private readonly volumeText: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly shapes: HTMLElement;
  private readonly label: HTMLElement;
  private target: ShapeTarget | null = null;
  private kind: CurveKind = 'level';
  private curve: Curve = defaultCurve('level');
  private selected: number | null = null;
  /** Where the pointer last was over the line (0–1): key P sets a point there. */
  private hoverX = 0.5;
  private dragging: { readonly pointerId: number; readonly index: number } | null = null;
  private sliding = false;
  private overLine = false;

  constructor(private readonly host: ShapeHost) {
    this.el = document.createElement('div');
    this.el.className = 'shape';
    this.el.hidden = true;
    this.el.tabIndex = -1;
    this.el.setAttribute('role', 'dialog');

    const head = document.createElement('div');
    head.className = 'shape__head';
    this.title = document.createElement('span');
    this.title.className = 'shape__title';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'shape__close';
    close.textContent = '×';
    close.title = 'Schließen (Esc)';
    close.setAttribute('aria-label', 'Schließen');
    close.addEventListener('click', () => this.close());
    head.append(this.title, close);

    this.volumeRow = document.createElement('label');
    this.volumeRow.className = 'shape__volume';
    const volumeName = document.createElement('span');
    volumeName.textContent = 'Lautstärke';
    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.min = String(MIN_VOLUME);
    this.slider.max = String(MAX_VOLUME);
    this.slider.step = '1';
    this.volumeText = document.createElement('output');
    this.volumeRow.append(volumeName, this.slider, this.volumeText);
    this.slider.addEventListener('input', () => {
      if (!this.target || this.target.kind !== 'tone') return;
      if (!this.sliding) {
        this.sliding = true;
        this.host.beginGesture();
      }
      this.host.preview({ kind: 'shape', tone: this.target.id, volume: Number(this.slider.value) });
    });
    this.slider.addEventListener('change', () => {
      if (this.sliding) this.host.endGesture(true);
      this.sliding = false;
    });

    this.label = document.createElement('div');
    this.label.className = 'shape__label';
    this.svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, 'shape__curve');
    this.svg.addEventListener('pointerdown', (e) => this.onDown(e));
    this.svg.addEventListener('pointermove', (e) => this.onMove(e));
    this.svg.addEventListener('pointerup', (e) => this.onUp(e, true));
    this.svg.addEventListener('pointercancel', (e) => this.onUp(e, false));
    this.svg.addEventListener('dblclick', (e) => this.onDouble(e));

    this.shapes = document.createElement('div');
    this.shapes.className = 'shape__shapes';

    const hint = document.createElement('p');
    hint.className = 'shape__hint';
    hint.textContent = 'Auf die Linie klicken oder Taste P: Punkt setzen. Punkt ziehen: die ganze Linie folgt. Doppelklick auf einen Punkt oder Entf: Punkt weg.';

    this.el.append(head, this.volumeRow, this.label, this.svg, this.shapes, hint);
    document.body.append(this.el);

    // Keys: the menu never takes the focus (the notes' own keys keep working after a click on a bar); it only
    // answers Esc, and P / Entf while the mouse is over the line. Capture phase: it comes before the workstation.
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    this.svg.addEventListener('pointerenter', () => (this.overLine = true));
    this.svg.addEventListener('pointerleave', () => (this.overLine = false));
    // A click anywhere else closes the menu (the roll opens it again for the next bar).
    // (Capture phase: it closes before the roll opens the menu for what was clicked.)
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.el.hidden && !this.el.contains(e.target as Node) && !this.dragging) this.close();
      },
      true,
    );
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(target: ShapeTarget, anchor: DOMRect): void {
    this.target = target;
    this.selected = null;
    this.el.hidden = false;
    if (!this.read()) return this.close();
    this.draw();
    const box = this.el.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - box.width - 8, anchor.left));
    const below = anchor.bottom + 8;
    const top = below + box.height > window.innerHeight - 8 ? Math.max(8, anchor.top - box.height - 8) : below;
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  close(): void {
    if (this.dragging || this.sliding) {
      this.host.endGesture(true);
      this.dragging = null;
      this.sliding = false;
    }
    this.target = null;
    this.el.hidden = true;
  }

  /** The score changed (undo, a drag elsewhere …): show what it says now, or close if the thing is gone. */
  refresh(): void {
    if (!this.target || this.el.hidden) return;
    if (!this.read()) return this.close();
    this.draw();
  }

  /** Reads the target from the score; false when it no longer exists. */
  private read(): boolean {
    const t = this.target;
    if (!t) return false;
    const s: EditorState = this.host.state();
    if (t.kind === 'tone') {
      const spot = locateTones(s.score).get(t.id);
      if (!spot) return false;
      this.kind = 'level';
      this.curve = spot.tone.curve ?? defaultCurve('level');
      this.title.textContent = `Lautstärke · ${pitchToString(spot.tone.pitch)}`;
      this.volumeRow.hidden = false;
      const volume = spot.tone.volume ?? DEFAULT_VOLUME;
      if (!this.sliding) this.slider.value = String(volume);
      this.volumeText.textContent = `${volumeMark(Number(this.slider.value))} · ${this.slider.value}`;
      this.label.textContent = 'Lautstärke über die Länge der Note';
    } else {
      const link = (s.score.links ?? []).find((l) => l.id === t.id);
      const spots = locateTones(s.score);
      const a = link ? spots.get(link.from) : undefined;
      const b = link ? spots.get(link.to) : undefined;
      if (!link || !a || !b) return false;
      this.kind = 'glide';
      this.curve = link.curve ?? defaultCurve('glide');
      this.title.textContent = `Übergang · ${pitchToString(a.tone.pitch)} → ${pitchToString(b.tone.pitch)}`;
      this.volumeRow.hidden = true;
      this.label.textContent = 'Weg der Tonhöhe (und der Lautstärke) durch die Lücke';
    }
    return true;
  }

  private draw(): void {
    this.svg.replaceChildren();
    for (const f of [0, 0.5, 1]) {
      this.svg.append(svgEl('line', { x1: PAD, x2: W - PAD, y1: py(f), y2: py(f) }, 'shape__grid'));
      this.svg.append(svgEl('line', { x1: px(f), x2: px(f), y1: PAD, y2: H - PAD }, 'shape__grid'));
    }
    const dense = sampleCurve(this.curve, 96);
    const d = dense.map((y, i) => `${i === 0 ? 'M' : 'L'} ${px(i / 96).toFixed(1)} ${py(y).toFixed(1)}`).join(' ');
    this.svg.append(svgEl('path', { d }, 'shape__line'));
    this.curve.forEach((p, i) => {
      const dot = svgEl('circle', { cx: px(p.x), cy: py(p.y), r: 6 }, `shape__point${this.selected === i ? ' is-selected' : ''}${this.fixedX(i) ? ' is-end' : ''}`);
      dot.dataset.index = String(i);
      this.svg.append(dot);
    });
    this.shapes.replaceChildren(
      ...SHAPES[this.kind].map((shape) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'shape__preset';
        b.textContent = shape.name;
        b.addEventListener('click', () => {
          this.selected = null;
          this.emit(shape.curve);
        });
        return b;
      }),
    );
  }

  /** The first and last point stay at the ends of the line (they only move up and down, glides not even that). */
  private fixedX = (i: number): boolean => i === 0 || i === this.curve.length - 1;

  private editFor(curve: Curve): RollEdit | null {
    const t = this.target;
    if (!t) return null;
    return t.kind === 'tone' ? { kind: 'shape', tone: t.id, curve } : { kind: 'blend', id: t.id, curve };
  }

  /** A finished edit (a point set or removed, a preset). */
  private emit(curve: Curve): void {
    const edit = this.editFor(curve);
    if (edit) this.host.edit(edit);
  }

  private local(e: PointerEvent | MouseEvent): { x: number; y: number } {
    const box = this.svg.getBoundingClientRect();
    return { x: ((e.clientX - box.left) / box.width) * W, y: ((e.clientY - box.top) / box.height) * H };
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0 || this.dragging) return;
    const { x, y } = this.local(e);
    const hit = e.target instanceof Element ? e.target.closest<SVGCircleElement>('.shape__point') : null;
    let index = hit ? Number(hit.dataset.index) : -1;
    let start: Curve | null = null;
    if (index < 0) {
      // On the line (not on a point): a new point appears there and can be pulled at once.
      const ax = fromX(x);
      if (ax < 0 || ax > 1 || Math.abs(py(curveAt(this.curve, ax)) - y) > NEAR) return;
      const more = addPointAt(this.kind, this.curve, ax);
      if (more === this.curve) return;
      index = more.findIndex((p) => Math.abs(p.x - roundCoord(ax)) < 0.002);
      start = more;
    }
    this.selected = index;
    this.dragging = { pointerId: e.pointerId, index };
    this.svg.setPointerCapture(e.pointerId);
    this.host.beginGesture();
    if (start) {
      this.curve = start;
      this.preview();
    }
    this.draw();
    e.preventDefault();
  }

  private onMove(e: PointerEvent): void {
    const { x, y } = this.local(e);
    this.hoverX = Math.max(0, Math.min(1, fromX(x)));
    const d = this.dragging;
    if (!d || e.pointerId !== d.pointerId) return;
    const i = d.index;
    const last = this.curve.length - 1;
    const prev = this.curve[i - 1];
    const next = this.curve[i + 1];
    const nx = i === 0 ? 0 : i === last ? 1 : Math.max(prev!.x + 0.01, Math.min(next!.x - 0.01, fromX(x)));
    // The ends of a glide stay where they are (first note / second note); a loudness curve's ends move up and down.
    const ny = this.kind === 'glide' && (i === 0 || i === last) ? this.curve[i]!.y : Math.max(0, Math.min(1, fromY(y)));
    this.curve = this.curve.map((p, k) => (k === i ? { x: roundCoord(nx), y: roundCoord(ny) } : p));
    this.preview();
    this.draw();
  }

  private preview(): void {
    const edit = this.editFor(this.curve);
    if (edit) this.host.preview(edit);
  }

  private onUp(e: PointerEvent, commit: boolean): void {
    const d = this.dragging;
    if (!d || e.pointerId !== d.pointerId) return;
    this.dragging = null;
    if (this.svg.hasPointerCapture(e.pointerId)) this.svg.releasePointerCapture(e.pointerId);
    this.host.endGesture(commit);
  }

  private onDouble(e: MouseEvent): void {
    const hit = e.target instanceof Element ? e.target.closest<SVGCircleElement>('.shape__point') : null;
    if (hit) this.removePoint(Number(hit.dataset.index));
  }

  private removePoint(index: number): void {
    if (this.fixedX(index)) return;
    this.selected = null;
    this.emit(this.curve.filter((_, i) => i !== index));
  }

  private onKey(e: KeyboardEvent): void {
    if (this.el.hidden || e.ctrlKey || e.metaKey || e.altKey) return; // undo and friends reach the workstation
    const inside = e.target instanceof Node && this.el.contains(e.target); // the slider has the focus: its own keys
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      this.close();
    } else if (!this.overLine) {
      if (inside) e.stopPropagation();
    } else if (e.key === 'p' || e.key === 'P') {
      e.stopPropagation();
      e.preventDefault();
      const more = addPointAt(this.kind, this.curve, this.hoverX);
      if (more !== this.curve) {
        this.selected = more.findIndex((p) => !this.curve.some((q) => q.x === p.x));
        this.emit(more);
      }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected !== null) {
      e.stopPropagation();
      e.preventDefault();
      this.removePoint(this.selected);
    } else if (inside) {
      e.stopPropagation();
    }
  }
}
