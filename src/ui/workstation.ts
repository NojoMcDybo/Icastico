/**
 * The workstation: wires keyboard + mouse to commands, renders the score and
 * draws caret and selection on top of Verovio's SVG.
 *
 * Rendering is skipped when only caret/selection changed (decorate only).
 */
import { type CommandId, runCommand } from '../core/editor/commands';
import { History } from '../core/editor/history';
import { type EditorState, getVoice, inputLength } from '../core/editor/state';
import { getInstrument } from '../core/instruments';
import { type Score, measuresOf } from '../core/model';
import { durationName } from '../core/notation/notate';
import { pitchToString } from '../core/pitch';
import { eq, lt } from '../core/time';
import { type ElementRef, type MeiResult, scoreToMei, staffElementId } from '../render/mei';
import type { Engraver } from '../render/verovio';
import { comboOf } from './keys';
import { type Keymap, type UiCommandId, findBinding } from './keymaps/finale';

export interface WorkstationElements {
  readonly pages: HTMLElement;
  readonly status: HTMLElement;
  readonly mode: HTMLElement;
  readonly title: HTMLElement;
  readonly help: HTMLElement;
}

/** Notation size in percent of Verovio's default. */
const SCALE = 55;
/** Clicks this close (px) to a symbol still hit it, e.g. inside a hollow notehead. */
const HIT_TOLERANCE = 10;
const HINT = 'Enter: Eingabe starten · Strg+N: neue Partitur · F1: alle Tasten';

export class Workstation {
  private readonly history: History;
  private result: MeiResult | null = null;
  private renderedScore: Score | null = null;
  private renderedMeasures = 0;
  private renderedWidth = 0;

  constructor(
    private readonly el: WorkstationElements,
    private readonly engraver: Engraver,
    private readonly keymap: Keymap,
    initial: EditorState,
  ) {
    this.history = new History(initial);
    this.buildHelp();
    window.addEventListener('keydown', (e) => this.onKey(e));
    el.pages.addEventListener('click', (e) => this.onClick(e));
    let timer = 0;
    new ResizeObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(() => this.update(), 120);
    }).observe(el.pages);
    this.update();
  }

  private get state(): EditorState {
    return this.history.state;
  }

  // ── Input ────────────────────────────────────────────────────────────────

  private onKey(e: KeyboardEvent): void {
    const helpOpen = !this.el.help.hidden;
    const combo = comboOf(e);
    if (helpOpen) {
      if (combo === 'Escape' || combo === 'F1' || combo === '?') {
        e.preventDefault();
        this.el.help.hidden = true;
      }
      return;
    }
    if (!combo) return;
    const binding = findBinding(this.keymap, combo);
    if (!binding) return;
    e.preventDefault();
    this.run(binding.command, binding.arg ?? 0);
  }

  run(command: CommandId | UiCommandId, arg = 0): void {
    switch (command) {
      case 'history.undo':
        this.history.undo();
        break;
      case 'history.redo':
        this.history.redo();
        break;
      case 'view.help':
        this.el.help.hidden = false;
        return;
      default:
        try {
          this.history.apply(runCommand(this.state, command, arg));
        } catch (err) {
          this.history.apply({ ...this.state, message: `Fehler: ${err instanceof Error ? err.message : String(err)}` });
        }
    }
    this.update();
  }

  private onClick(e: MouseEvent): void {
    const ref = this.hitTest(e);
    const s = this.state;
    if (!ref) {
      if (!s.caret) this.history.apply({ ...s, selection: null, message: null });
      this.update();
      return;
    }
    const voice = { partId: ref.partId, voiceId: ref.voiceId };
    const selection = ref.eventId
      ? { kind: 'event' as const, ...voice, eventId: ref.eventId }
      : { kind: 'gap' as const, ...voice, time: ref.onset };
    const caret = s.caret ? { ...voice, time: ref.onset } : null;
    this.history.apply({ ...s, selection, caret, message: null });
    this.update();
  }

  /** Direct hit on an SVG shape, else the nearest symbol within HIT_TOLERANCE. */
  private hitTest(e: MouseEvent): ElementRef | undefined {
    const elements = this.result?.elements;
    if (!elements) return undefined;
    for (let n = e.target as Element | null; n && n !== this.el.pages; n = n.parentElement) {
      const ref = n.id ? elements.get(n.id) : undefined;
      if (ref) return ref;
    }
    let best: ElementRef | undefined;
    let bestDistance = HIT_TOLERANCE;
    for (const [id, ref] of elements) {
      const r = document.getElementById(id)?.getBoundingClientRect();
      if (!r) continue;
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      const d = Math.hypot(dx, dy);
      if (d <= bestDistance) {
        best = ref;
        bestDistance = d;
      }
    }
    return best;
  }

  // ── Output ───────────────────────────────────────────────────────────────

  private update(): void {
    try {
      this.renderIfNeeded();
    } catch (err) {
      // Never leave the user with a broken score: revert the last change.
      this.history.undo();
      this.history.apply({
        ...this.state,
        message: `Interner Fehler, Änderung rückgängig gemacht: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.renderIfNeeded();
    }
    this.decorate();
    this.renderStatus();
  }

  private renderIfNeeded(): void {
    const s = this.state;
    const coverTime = s.caret?.time;
    const measures = measuresOf(s.score, 1, coverTime).length;
    const width = Math.min(this.el.pages.clientWidth, 1100);
    if (s.score === this.renderedScore && measures === this.renderedMeasures && width === this.renderedWidth) return;

    const result = scoreToMei(s.score, coverTime ? { coverTime } : {});
    const { pages, log } = this.engraver.engrave(result.mei, {
      pageWidth: Math.round((width * 100) / SCALE),
      scale: SCALE,
    });
    if (log) console.warn('[Verovio]', log);
    this.el.pages.replaceChildren(
      ...pages.map((svg) => {
        const page = document.createElement('div');
        page.className = 'page';
        page.innerHTML = svg;
        return page;
      }),
    );
    this.result = result;
    this.renderedScore = s.score;
    this.renderedMeasures = measures;
    this.renderedWidth = width;
    this.el.title.textContent = s.score.title;
  }

  private decorate(): void {
    const s = this.state;
    const elements = this.result?.elements;
    this.el.pages.querySelectorAll('.is-selected').forEach((n) => n.classList.remove('is-selected'));
    this.el.pages.querySelectorAll('.caret').forEach((n) => n.remove());
    if (!elements) return;

    const sel = s.selection;
    if (sel) {
      for (const [id, ref] of elements) {
        if (ref.voiceId !== sel.voiceId || ref.kind === 'chordNote') continue;
        const hit =
          sel.kind === 'event' ? ref.eventId === sel.eventId : ref.kind !== 'note' && eq(ref.onset, sel.time);
        if (hit) document.getElementById(id)?.classList.add('is-selected');
        if (hit && sel.kind === 'gap') break;
      }
    }
    if (s.caret) this.drawCaret(elements);
  }

  private drawCaret(elements: ReadonlyMap<string, ElementRef>): void {
    const caret = this.state.caret!;
    let found: [string, ElementRef] | undefined;
    for (const entry of elements) {
      const ref = entry[1];
      if (ref.voiceId !== caret.voiceId || ref.kind === 'chordNote') continue;
      if (eq(ref.onset, caret.time)) {
        found = entry;
        break;
      }
      if (lt(ref.onset, caret.time) && (!found || lt(found[1].onset, ref.onset))) found = entry;
    }
    if (!found) return;
    const [id, ref] = found;
    const symbol = document.getElementById(id);
    const staff = document.getElementById(staffElementId(ref.measureNumber, ref.staffN));
    const page = symbol?.closest('.page');
    if (!symbol || !staff || !(page instanceof HTMLElement)) return;

    const pageBox = page.getBoundingClientRect();
    const staffBox = staff.getBoundingClientRect();
    const symbolBox = symbol.getBoundingClientRect();
    const exact = eq(ref.onset, caret.time);
    // A whole-measure rest sits mid-bar; the caret belongs at the bar's start,
    // behind clef / key / time signature if the bar opens a system.
    const barStart = () => {
      let left = staffBox.left;
      staff.querySelectorAll('.clef, .keySig, .meterSig').forEach((n) => {
        left = Math.max(left, n.getBoundingClientRect().right);
      });
      return left + 12;
    };
    const x = !exact ? symbolBox.right + 4 : ref.kind === 'measureRest' ? barStart() : symbolBox.left - 5;

    const line = document.createElement('div');
    line.className = 'caret';
    if (this.state.input.insert) line.classList.add('caret--insert');
    line.style.left = `${x - pageBox.left}px`;
    line.style.top = `${staffBox.top - pageBox.top - 10}px`;
    line.style.height = `${staffBox.height + 20}px`;
    page.appendChild(line);
    line.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private renderStatus(): void {
    const s = this.state;
    this.el.status.textContent = s.message ?? this.describeSelection() ?? HINT;
    if (s.caret) {
      const parts = [`Eingabe · ${durationName(inputLength(s.input))}`];
      if (s.input.insert) parts.push('Einfügen');
      if (s.input.pendingTie) parts.push('Haltebogen ⌒');
      this.el.mode.textContent = parts.join(' · ');
      this.el.mode.classList.add('mode--input');
    } else {
      this.el.mode.textContent = 'Auswahl';
      this.el.mode.classList.remove('mode--input');
    }
  }

  private describeSelection(): string | null {
    const s = this.state;
    const sel = s.selection;
    if (!sel) return null;
    const { part, voice } = getVoice(s.score, sel);
    const staff = getInstrument(part.instrument).staves.length > 1 ? ` · System ${voice.staff + 1}` : '';
    const measures = measuresOf(s.score, 1, s.caret?.time);
    const bar = (t: Parameters<typeof eq>[0]) =>
      measures.find((m) => !lt(t, m.start) && lt(t, m.end))?.number ?? measures.length;
    if (sel.kind === 'gap') return `${part.name}${staff} · Takt ${bar(sel.time)} · Pause`;
    const ev = voice.events.find((e) => e.id === sel.eventId);
    if (!ev) return null;
    const what = ev.pitches.length > 1 ? 'Akkord' : 'Note';
    return `${part.name}${staff} · Takt ${bar(ev.onset)} · ${what} ${ev.pitches.map(pitchToString).join(' ')} · ${durationName(ev.duration)}`;
  }

  private buildHelp(): void {
    const box = document.createElement('div');
    box.className = 'help__box';
    const title = document.createElement('h2');
    title.textContent = `Tastenbelegung: ${this.keymap.name}`;
    box.appendChild(title);
    for (const group of this.keymap.help) {
      const h = document.createElement('h3');
      h.textContent = group.title;
      const dl = document.createElement('dl');
      for (const entry of group.entries) {
        const dt = document.createElement('dt');
        dt.textContent = entry.keys;
        const dd = document.createElement('dd');
        dd.textContent = entry.text;
        dl.append(dt, dd);
      }
      box.append(h, dl);
    }
    const close = document.createElement('p');
    close.className = 'help__close';
    close.textContent = 'Esc schließt';
    box.appendChild(close);
    this.el.help.replaceChildren(box);
    this.el.help.addEventListener('click', (e) => {
      if (e.target === this.el.help) this.el.help.hidden = true;
    });
  }
}
