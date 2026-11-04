/**
 * The piano roll: a second view of the same voice. Every bar is one tone and
 * keeps the tone's id, so a click here selects the same tone as a click on the
 * notehead – the selection lives in the editor state, not in the view.
 *
 * The view only draws and turns pointer movement into structured edits
 * (`RollEdit`); the edits themselves are pure commands (core/editor/rollEdits.ts).
 * A drag is one gesture: previews while dragging, one undo step at the end.
 */
import { type EditorState, type Selection, type VoiceRef, getVoice, inputLength } from '../core/editor/state';
import { type RollEdit } from '../core/editor/rollEdits';
import { getInstrument } from '../core/instruments';
import { measuresOf } from '../core/model';
import { durationName } from '../core/notation/notate';
import { midiOf, pitchToString } from '../core/pitch';
import { type Fraction, frac, le, lt } from '../core/time';
import {
  type BarRef,
  type RollChange,
  type RollLayout,
  type Zone,
  contentHeight,
  contentWidth,
  dragChange,
  drawChange,
  isBlackKey,
  layoutFor,
  octaveLabel,
  scrollTarget,
  timeWidth,
  xOfTime,
  yOfMidi,
  zoneOf,
  DEFAULT_PX_PER_WHOLE,
} from './pianoRollGeometry';

export interface RollHost {
  state(): EditorState;
  /** Click on a tone (or on empty space: null). Never changes the score. */
  select(selection: Selection | null, caretTime: Fraction | null): void;
  /** The user worked in this lane (it becomes the active one). */
  activate(): void;
  beginGesture(): void;
  /** Shows what the edit would do. Refused edits keep the last valid preview. */
  preview(edit: RollEdit): void;
  endGesture(commit: boolean): void;
  /** A single finished edit (double-click creates a note). */
  edit(edit: RollEdit): void;
}

const NS = 'http://www.w3.org/2000/svg';
const MIN_ZOOM = 120;
const MAX_ZOOM = 1440;
/** Pointer movement in pixels before a click turns into a drag. */
const DRAG_THRESHOLD = 3;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, cls?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (cls) e.setAttribute('class', cls);
  return e;
}

interface Gesture {
  /** `link`: a glide is being dragged from a dot at the end of a bar to another bar. */
  readonly mode: Zone | 'draw' | 'link';
  readonly linkTone?: string;
  readonly dotX?: number;
  readonly dotY?: number;
  readonly voice: VoiceRef;
  readonly bar: BarRef | null;
  readonly downX: number;
  readonly downY: number;
  readonly pointerId: number;
  started: boolean;
}

export class PianoRoll {
  private readonly head: HTMLElement;
  private readonly title: HTMLElement;
  private readonly info: HTMLElement;
  private readonly scroller: HTMLElement;
  private svg: SVGSVGElement | null = null;
  private body: SVGGElement | null = null;
  /** The line drawn while a glide is being dragged. */
  private rubber: SVGLineElement | null = null;
  private layout: RollLayout | null = null;
  private gesture: Gesture | null = null;
  private pxPerWhole = DEFAULT_PX_PER_WHOLE;
  private zoomButtons: HTMLButtonElement[] = [];
  /** Last selection scrolled into view / voice centred vertically, so rendering never fights the user's scrolling. */
  private shownSelection = '';
  private centredVoice = '';

  /** A strip: only the contour, no editing; clicking a bar still selects it. */
  private compact = false;

  /** `staff` is the notation line this roll stands for; `controls` (mode and size buttons) go into its header. */
  constructor(
    private readonly el: HTMLElement,
    private readonly host: RollHost,
    private readonly staff: { readonly partId: string; readonly staffIndex: number },
    controls: HTMLElement,
  ) {
    this.head = document.createElement('div');
    this.head.className = 'roll__head';
    this.title = document.createElement('span');
    this.title.className = 'roll__title';
    this.info = document.createElement('span');
    this.info.className = 'roll__info';
    const zoomOut = this.zoomButton('−', 'Verkleinern (Strg + Mausrad)', 1 / 1.25);
    const zoomIn = this.zoomButton('+', 'Vergrößern (Strg + Mausrad)', 1.25);
    this.head.append(this.title, this.info, zoomOut, zoomIn, controls);
    this.zoomButtons = [zoomOut, zoomIn];
    this.scroller = document.createElement('div');
    this.scroller.className = 'roll__scroll';
    el.replaceChildren(this.head, this.scroller);

    this.scroller.addEventListener('scroll', () => this.syncKeys());
    this.scroller.addEventListener('pointerdown', (e) => this.onDown(e));
    this.scroller.addEventListener('pointermove', (e) => this.onMove(e));
    this.scroller.addEventListener('pointerup', (e) => this.onUp(e, true));
    this.scroller.addEventListener('pointercancel', (e) => this.onUp(e, false));
    this.scroller.addEventListener('dblclick', (e) => this.onDouble(e));
    this.scroller.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
      },
      { passive: false },
    );
  }

  private zoomButton(label: string, title: string, factor: number): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'round round--sm roll__zoom';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', () => this.zoom(factor));
    return b;
  }

  private zoom(factor: number): void {
    this.pxPerWhole = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.pxPerWhole * factor));
    this.render();
  }

  /** The voice shown: the first one written on this staff. */
  private currentVoice(s: EditorState): VoiceRef | null {
    const part = s.score.parts.find((p) => p.id === this.staff.partId);
    const voice = part?.voices.find((v) => v.staff === this.staff.staffIndex);
    return part && voice ? { partId: part.id, voiceId: voice.id } : null;
  }

  /** The snap grid: the chosen note value, but never coarser than a sixteenth (a quarter is too clumsy to draw with). */
  private gridOf(s: EditorState): Fraction {
    return le(s.input.base, frac(1, 16)) ? s.input.base : frac(1, 16);
  }

  /** Every voice written on this staff, first one first. */
  private staffVoices(s: EditorState): VoiceRef[] {
    const part = s.score.parts.find((p) => p.id === this.staff.partId);
    return (part?.voices ?? []).filter((v) => v.staff === this.staff.staffIndex).map((v) => ({ partId: this.staff.partId, voiceId: v.id }));
  }

  /** Small strip or full view; takes effect at the next `render`. */
  setCompact(compact: boolean): void {
    this.compact = compact;
    this.el.classList.toggle('is-compact', compact);
    for (const b of this.zoomButtons) b.hidden = compact;
  }

  /** True while a drag is running (the workstation must not redraw over it). */
  get dragging(): boolean {
    return this.gesture?.started === true;
  }

  /** Forgets a running gesture, e.g. after Escape. */
  cancel(): void {
    const g = this.gesture;
    this.gesture = null;
    if (g && this.scroller.hasPointerCapture(g.pointerId)) this.scroller.releasePointerCapture(g.pointerId);
    this.scroller.classList.remove('is-dragging');
    this.rubber?.remove();
    this.rubber = null;
  }

  render(): void {
    const s = this.host.state();
    const ref = this.currentVoice(s);
    if (!ref) {
      this.title.textContent = 'Piano-Roll';
      this.scroller.replaceChildren();
      return;
    }
    const { part, voice } = getVoice(s.score, ref);
    const instrument = getInstrument(part.instrument);
    const layout = layoutFor(s.score, ref, this.pxPerWhole, this.compact);
    this.layout = layout;

    const written = instrument.staves[voice.staff]?.clef.octave ?? 0;
    const several = instrument.staves.length > 1 ? ` · System ${voice.staff + 1}` : '';
    this.title.textContent = `Piano-Roll · ${part.name}${several}`;
    this.info.hidden = this.compact;
    this.info.textContent = `Raster ${durationName(this.gridOf(s))}${written !== 0 ? ' · klingende Tonhöhe, in der Notenschrift eine Oktave höher notiert' : ''}`;

    const width = contentWidth(layout);
    const height = contentHeight(layout);
    const svg = svgEl('svg', { width, height: height + 22, viewBox: `0 0 ${width} ${height + 22}` }, 'roll__svg');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', `Piano-Roll ${part.name}`);
    const body = svgEl('g', { transform: 'translate(0 22)' });
    svg.append(body);

    for (let m = layout.highMidi; m >= layout.lowMidi; m--) {
      body.append(
        svgEl('rect', { x: 0, y: yOfMidi(layout, m), width, height: layout.rowHeight }, isBlackKey(m) ? 'roll__row roll__row--black' : 'roll__row'),
      );
    }
    this.drawGrid(svg, body, s, layout, height);

    const measures = measuresOf(s.score);
    const measureNo = (t: Fraction) => measures.find((m) => !lt(t, m.start) && lt(t, m.end))?.number ?? measures[measures.length - 1]!.number;
    const sel = s.selection?.kind === 'event' && s.selection.partId === ref.partId ? s.selection : null;
    let selected: SVGRectElement | null = null;
    const allMidis: number[] = [];
    /** Where each tone's bar starts, ends and sits vertically – the ends of ties and glides. */
    const spots = new Map<string, { x0: number; x1: number; y: number }>();
    this.staffVoices(s).forEach((vref, voiceIndex) => {
      for (const ev of getVoice(s.score, vref).voice.events) {
        const inEvent = sel?.voiceId === vref.voiceId && sel.eventId === ev.id;
        for (const tone of ev.tones) {
          const midi = midiOf(tone.pitch);
          allMidis.push(midi);
          const x = xOfTime(layout, ev.onset);
          const w = Math.max(2, timeWidth(layout, ev.duration) - 1);
          const cls = [
            'roll__bar',
            ev.tones.length > 1 ? 'is-chord' : '',
            voiceIndex > 0 ? 'is-secondary' : '',
            inEvent ? 'is-event-selected' : '',
            inEvent && sel?.toneId === tone.id ? 'is-selected' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const bar = svgEl('rect', { x, y: yOfMidi(layout, midi) + 1, width: w, height: layout.rowHeight - 2, rx: 3, id: `bar-${tone.id}` }, cls);
          spots.set(tone.id, { x0: x, x1: x + w + 1, y: yOfMidi(layout, midi) + layout.rowHeight / 2 });
          bar.dataset.voice = vref.voiceId;
          bar.dataset.event = ev.id;
          bar.dataset.tone = tone.id;
          bar.dataset.midi = String(midi);
          const tip = svgEl('title', {});
          tip.textContent = `${pitchToString(tone.pitch)} · ${measureNo(ev.onset) === 0 ? 'Auftakt' : `Takt ${measureNo(ev.onset)}`} · ${durationName(ev.duration)}${voiceIndex > 0 ? ' · Stimme ' + (voiceIndex + 1) : ''}`;
          bar.append(tip);
          body.append(bar);
          if (inEvent && (sel?.toneId === tone.id || !sel?.toneId)) selected = bar;
        }
      }
    });
    this.drawLinks(body, s, spots);
    if (!this.compact) this.drawDots(body, spots);
    if (s.caret && s.caret.partId === ref.partId && this.staffVoices(s).some((v) => v.voiceId === s.caret!.voiceId)) {
      const x = xOfTime(layout, s.caret.time);
      body.append(svgEl('line', { x1: x, x2: x, y1: 0, y2: height }, 'roll__caret'));
    }

    if (!this.compact) this.drawKeys(body, layout); // on top of the bars: they slide under the key column
    this.svg = svg;
    this.body = body;
    this.rubber = null;
    this.scroller.replaceChildren(svg);
    this.syncKeys();
    this.keepInView(ref, allMidis, selected, sel ? `${sel.voiceId}/${sel.eventId}/${sel.toneId ?? ''}` : '');
  }

  /**
   * Ties and glides between bars: a tie is a small arc over the join; a glide is a line from the end of
   * the first bar to the start of the second – its length in time is the gap, i.e. the glide time.
   * Without a gap the line is dotted: the link is kept, the pitch just changes.
   */
  private drawLinks(body: SVGGElement, s: EditorState, spots: ReadonlyMap<string, { x0: number; x1: number; y: number }>): void {
    for (const link of s.score.links ?? []) {
      const a = spots.get(link.from);
      const b = spots.get(link.to);
      if (!a || !b) continue;
      const title = svgEl('title', {});
      if (link.kind === 'tie') {
        const mid = (a.x1 + b.x0) / 2;
        const path = svgEl('path', { d: `M ${a.x1 - 5} ${a.y - 5} Q ${mid} ${a.y - 15} ${b.x0 + 5} ${b.y - 5}` }, 'roll__link roll__link--tie');
        title.textContent = 'Haltebogen';
        path.dataset.link = link.id;
        path.append(title);
        body.append(path);
      } else {
        const gap = b.x0 - a.x1 > 0.5;
        const line = svgEl('line', { x1: a.x1, y1: a.y, x2: b.x0, y2: b.y }, `roll__link roll__link--slide${gap ? '' : ' is-direct'}`);
        title.textContent = gap ? 'Gleiten (die Lücke ist die Gleitdauer)' : 'Gleiten gemerkt – ohne Lücke nur direkter Wechsel';
        line.dataset.link = link.id;
        line.append(title);
        body.append(line);
      }
    }
  }

  /** A dot just outside both ends of every bar: drag one onto another bar to glide between the two. */
  private drawDots(body: SVGGElement, spots: ReadonlyMap<string, { x0: number; x1: number; y: number }>): void {
    for (const [toneId, spot] of spots) {
      for (const [end, x] of [['start', spot.x0 - 7], ['end', spot.x1 + 7]] as const) {
        const dot = svgEl('circle', { cx: x, cy: spot.y, r: 3.5 }, 'roll__dot');
        dot.dataset.tone = toneId;
        dot.dataset.end = end;
        const tip = svgEl('title', {});
        tip.textContent = 'Ziehen und auf einen anderen Balken loslassen: Gleiten (die Zeit dazwischen ist die Gleitdauer)';
        dot.append(tip);
        body.append(dot);
      }
    }
  }

  /** Measure and grid lines with measure numbers on top. */
  private drawGrid(svg: SVGSVGElement, body: SVGGElement, s: EditorState, layout: RollLayout, height: number): void {
    const measures = measuresOf(s.score);
    const grid = this.gridOf(s);
    const step = timeWidth(layout, grid);
    if (step >= 5 && !this.compact) {
      for (let i = 1; lt(frac(i * grid.n, grid.d), layout.totalTime); i++) {
        const x = xOfTime(layout, frac(i * grid.n, grid.d));
        body.append(svgEl('line', { x1: x, x2: x, y1: 0, y2: height }, 'roll__line'));
      }
    }
    for (const m of measures) {
      const x = xOfTime(layout, m.start);
      body.append(svgEl('line', { x1: x, x2: x, y1: 0, y2: height }, 'roll__line roll__line--measure'));
      const label = svgEl('text', { x: x + 4, y: 14 }, 'roll__measure');
      label.textContent = m.number === 0 ? 'Auftakt' : String(m.number);
      svg.append(label);
    }
  }

  private drawKeys(body: SVGGElement, layout: RollLayout): void {
    const group = svgEl('g', {}, 'roll__keycol');
    body.append(group);
    group.append(svgEl('rect', { x: 0, y: 0, width: layout.labelWidth, height: contentHeight(layout) }, 'roll__keys'));
    for (let m = layout.highMidi; m >= layout.lowMidi; m--) {
      const label = octaveLabel(m);
      if (!label) continue;
      const t = svgEl('text', { x: 6, y: yOfMidi(layout, m) + layout.rowHeight - 3 }, 'roll__key');
      t.textContent = label;
      group.append(t);
    }
  }

  /** The key column stays at the left edge while the roll scrolls sideways. */
  private syncKeys(): void {
    this.svg?.querySelector('.roll__keycol')?.setAttribute('transform', `translate(${this.scroller.scrollLeft} 0)`);
  }

  /** Centres a new voice vertically once; scrolls a newly selected bar into view horizontally. */
  private keepInView(ref: VoiceRef, midis: number[], selected: SVGRectElement | null, selectionKey: string): void {
    const layout = this.layout!;
    const voiceKey = `${ref.partId}/${ref.voiceId}`;
    if (this.centredVoice !== voiceKey) {
      this.centredVoice = voiceKey;
      const mid = midis.length ? (Math.min(...midis) + Math.max(...midis)) / 2 : (layout.lowMidi + layout.highMidi) / 2;
      this.scroller.scrollTop = Math.max(0, yOfMidi(layout, mid) - this.scroller.clientHeight / 2);
    }
    if (selected && selectionKey !== this.shownSelection) {
      const x0 = Number(selected.getAttribute('x'));
      const to = scrollTarget(this.scroller.scrollLeft, this.scroller.clientWidth, x0, x0 + Number(selected.getAttribute('width')));
      if (to !== null) this.scroller.scrollLeft = to;
      const y = Number(selected.getAttribute('y')) + 22;
      if (y < this.scroller.scrollTop + 22 || y > this.scroller.scrollTop + this.scroller.clientHeight - 30) {
        this.scroller.scrollTop = Math.max(0, y - this.scroller.clientHeight / 2);
      }
    }
    this.shownSelection = selectionKey;
  }

  // ── Pointer ──────────────────────────────────────────────────────────────

  /** Pointer position inside the drawing (below the measure-number strip). */
  private point(e: PointerEvent | MouseEvent): { x: number; y: number } | null {
    if (!this.svg) return null;
    const box = this.svg.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top - 22 };
  }

  private barAt(target: EventTarget | null): BarRef | null {
    const el = target instanceof Element ? target.closest<SVGRectElement>('.roll__bar') : null;
    const s = this.host.state();
    const primary = this.currentVoice(s);
    if (!el || !primary) return null;
    const voice = this.staffVoices(s).find((v) => v.voiceId === el.dataset.voice);
    if (!voice) return null;
    const ev = getVoice(s.score, voice).voice.events.find((x) => x.id === el.dataset.event);
    const tone = ev?.tones.find((x) => x.id === el.dataset.tone);
    return ev && tone ? { voice, eventId: ev.id, toneId: tone.id, onset: ev.onset, duration: ev.duration, midi: midiOf(tone.pitch) } : null;
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0 || this.gesture || !this.layout || this.onKeyColumn(e)) return;
    const p = this.point(e);
    const s = this.host.state();
    const primary = this.currentVoice(s);
    if (!p || !primary) return;
    this.host.activate();
    const dot = e.target instanceof Element ? e.target.closest<SVGCircleElement>('.roll__dot') : null;
    if (dot && !this.compact) {
      this.gesture = {
        mode: 'link',
        linkTone: dot.dataset.tone!,
        dotX: Number(dot.getAttribute('cx')),
        dotY: Number(dot.getAttribute('cy')),
        voice: primary,
        bar: null,
        downX: p.x,
        downY: p.y,
        pointerId: e.pointerId,
        started: false,
      };
      this.scroller.setPointerCapture(e.pointerId);
      return;
    }
    const bar = this.barAt(e.target);
    const voice = bar?.voice ?? primary;
    if (this.compact) {
      // A strip only selects; a click on the empty strip is handled by the lane (opens it).
      if (bar) this.host.select({ kind: 'event', ...voice, eventId: bar.eventId, toneId: bar.toneId }, bar.onset);
      return;
    }
    if (bar) {
      const x0 = xOfTime(this.layout, bar.onset);
      const mode = zoneOf(x0, x0 + timeWidth(this.layout, bar.duration), p.x);
      this.host.select({ kind: 'event', ...voice, eventId: bar.eventId, toneId: bar.toneId }, bar.onset);
      this.gesture = { mode, voice, bar, downX: p.x, downY: p.y, pointerId: e.pointerId, started: false };
    } else {
      if (p.x < this.layout.labelWidth) return;
      this.gesture = { mode: 'draw', voice, bar: null, downX: p.x, downY: p.y, pointerId: e.pointerId, started: false };
    }
    this.scroller.setPointerCapture(e.pointerId);
  }

  private onKeyColumn(e: Event): boolean {
    return e.target instanceof Element && e.target.closest('.roll__keycol') !== null;
  }

  private onMove(e: PointerEvent): void {
    const p = this.point(e);
    const g = this.gesture;
    if (!p || !this.layout) return;
    if (!g) {
      const bar = this.barAt(e.target);
      const x0 = bar ? xOfTime(this.layout, bar.onset) : 0;
      const zone = bar ? zoneOf(x0, x0 + timeWidth(this.layout, bar.duration), p.x) : null;
      this.scroller.style.cursor = zone === 'body' ? 'grab' : zone ? 'ew-resize' : 'crosshair';
      return;
    }
    if (e.pointerId !== g.pointerId) return;
    if (!g.started) {
      if (Math.hypot(p.x - g.downX, p.y - g.downY) < DRAG_THRESHOLD) return;
      g.started = true;
      this.scroller.classList.add('is-dragging');
      if (g.mode !== 'link') this.host.beginGesture();
    }
    if (g.mode === 'link') {
      if (!this.rubber && this.body) {
        this.rubber = svgEl('line', { x1: g.dotX!, y1: g.dotY!, x2: p.x, y2: p.y }, 'roll__rubber');
        this.body.append(this.rubber);
      }
      this.rubber?.setAttribute('x2', String(p.x));
      this.rubber?.setAttribute('y2', String(p.y));
      return;
    }
    const grid = this.gridOf(this.host.state());
    const edit = this.editFor(g, p.x, p.y, grid);
    if (edit) this.host.preview(edit);
  }

  private editFor(g: Gesture, x: number, y: number, grid: Fraction): RollEdit | null {
    const layout = this.layout!;
    if (g.mode === 'draw') {
      const c = drawChange(layout, g.downX, g.downY, x, grid);
      return { kind: 'create', voice: g.voice, onset: c.onset, duration: c.duration, midi: c.midi };
    }
    if (g.mode === 'link') return null;
    const bar = g.bar!;
    const c: RollChange = dragChange(layout, g.mode, bar, x - g.downX, y - g.downY, grid);
    return {
      kind: 'change',
      voice: g.voice,
      eventId: bar.eventId,
      ...(c.onset ? { onset: c.onset } : {}),
      ...(c.duration ? { duration: c.duration } : {}),
      ...(c.midi !== undefined ? { tone: { id: bar.toneId, midi: c.midi } } : {}),
    };
  }

  private onUp(e: PointerEvent, commit: boolean): void {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    this.cancel();
    if (g.mode === 'link') {
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const target = hit?.closest<SVGElement>('.roll__bar, .roll__dot')?.dataset.tone;
      if (g.started && commit && target && target !== g.linkTone) this.host.edit({ kind: 'connect', a: g.linkTone!, b: target });
      return;
    }
    if (g.started) {
      this.host.endGesture(commit);
    } else if (g.mode === 'draw') {
      this.host.select(null, null); // a plain click on empty space deselects
    }
  }

  private onDouble(e: MouseEvent): void {
    const link = e.target instanceof Element ? e.target.closest<SVGElement>('.roll__link') : null;
    if (link?.dataset.link) return this.host.edit({ kind: 'disconnect', id: link.dataset.link });
    const p = this.point(e);
    const layout = this.layout;
    const s = this.host.state();
    const voice = this.currentVoice(s);
    if (this.compact || !p || !layout || !voice || p.x < layout.labelWidth || this.onKeyColumn(e) || this.barAt(e.target)) return;
    const c = drawChange(layout, p.x, p.y, p.x, this.gridOf(s));
    const onset = c.onset;
    this.host.edit({ kind: 'create', voice, onset, duration: inputLength(s.input), midi: c.midi });
  }
}
