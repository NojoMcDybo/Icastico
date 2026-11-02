/**
 * The workstation: wires keyboard + mouse to commands, renders the score and
 * draws caret and selection on top of Verovio's SVG.
 *
 * Rendering is skipped when only caret/selection changed (decorate only).
 */
import { type CommandId, newScoreState, runCommand } from '../core/editor/commands';
import { History } from '../core/editor/history';
import { type EditorState, createEditorState, getVoice, inputLength } from '../core/editor/state';
import { FILE_EXTENSION, FileFormatError, parseScoreFile, serializeScore } from '../core/file/format';
import { getInstrument } from '../core/instruments';
import { type Score, keyAt, measuresOf, meterAt } from '../core/model';
import { durationName } from '../core/notation/notate';
import { pitchToString } from '../core/pitch';
import { type Fraction, ZERO, eq, le, lt } from '../core/time';
import { applyScoreChanges, createScore } from '../core/templates';
import { type ElementRef, type MeiResult, scoreToMei, staffElementId } from '../render/mei';
import type { Engraver } from '../render/verovio';
import type { Platform } from '../platform/files';
import { APP_VERSION } from '../version';
import { ask, inform, isDialogOpen } from './dialog';
import { loadNewScoreDefaults, saveNewScoreDefaults } from './preferences';
import { scoreDialog } from './scoreDialog';
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
const HINT = 'Enter: Eingabe · Strg+N: neu · Strg+O: öffnen · Strg+S: speichern · F1: alle Tasten';

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** A file name derived from the score title, safe on Windows and macOS. */
const fileNameFor = (title: string): string =>
  `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Partitur'}.${FILE_EXTENSION}`;

export class Workstation {
  private history: History;
  private result: MeiResult | null = null;
  /** Where the current score lives on disk (null = never saved / browser). */
  private filePath: string | null = null;
  private fileName: string | null = null;
  /** The score as last saved or opened – unsaved changes = anything else. */
  private savedScore: Score;
  /** A file dialog is open; ignore shortcuts meanwhile. */
  private busy = false;
  private windowTitle = '';
  private renderedScore: Score | null = null;
  private renderedMeasures = 0;
  private renderedWidth = 0;

  constructor(
    private readonly el: WorkstationElements,
    private readonly engraver: Engraver,
    private readonly keymap: Keymap,
    private readonly platform: Platform,
    initial: EditorState,
  ) {
    this.history = new History(initial);
    this.savedScore = initial.score;
    this.buildHelp();
    platform.guardClose(
      () => this.dirty,
      () => this.confirmDiscard(),
    );
    platform.onFileOpened((path) => void this.fileOpen(path));
    window.addEventListener('keydown', (e) => this.onKey(e));
    el.pages.addEventListener('click', (e) => this.onClick(e));
    el.title.addEventListener('click', () => {
      if (!isDialogOpen() && !this.busy) void this.scoreSettings();
    });
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

  /** Unsaved changes? Undoing back to the saved state counts as clean. */
  get dirty(): boolean {
    return this.state.score !== this.savedScore;
  }

  // ── Input ────────────────────────────────────────────────────────────────

  private onKey(e: KeyboardEvent): void {
    if (isDialogOpen() || this.busy) return;
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
      case 'file.new':
        void this.fileNew();
        return;
      case 'file.open':
        void this.fileOpen();
        return;
      case 'file.save':
        void this.fileSave(false);
        return;
      case 'file.saveAs':
        void this.fileSave(true);
        return;
      case 'score.settings':
        void this.scoreSettings();
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

  // ── Files ────────────────────────────────────────────────────────────────

  /** Runs a file action with shortcuts blocked; errors become a dialog. */
  private async withBusy<T>(action: () => Promise<T>, errorTitle: string): Promise<T | null> {
    this.busy = true;
    try {
      return await action();
    } catch (err) {
      await inform(errorTitle, errorText(err));
      return null;
    } finally {
      this.busy = false;
    }
  }

  /** Saves; asks for a place if never saved or `saveAs`. False if cancelled or failed. */
  async fileSave(saveAs: boolean): Promise<boolean> {
    const score = this.state.score;
    const saved = await this.withBusy(
      () =>
        this.platform.write(
          serializeScore(score, APP_VERSION),
          saveAs ? null : this.filePath,
          this.fileName ?? fileNameFor(score.title),
        ),
      'Speichern fehlgeschlagen',
    );
    if (!saved) {
      this.update();
      return false;
    }
    this.filePath = saved.path;
    this.fileName = saved.name;
    this.savedScore = score;
    this.history.apply({ ...this.state, message: `Gespeichert: ${saved.name}` });
    this.update();
    return true;
  }

  /** True if the current score may be replaced (saved, discarded or clean). */
  private async confirmDiscard(): Promise<boolean> {
    if (!this.dirty) return true;
    const choice = await ask({
      title: 'Ungespeicherte Änderungen',
      text: `„${this.displayName}“ wurde geändert. Änderungen speichern?`,
      buttons: [
        { id: 'save', label: 'Speichern', primary: true },
        { id: 'discard', label: 'Nicht speichern' },
        { id: 'cancel', label: 'Abbrechen' },
      ],
      cancel: 'cancel',
    });
    if (choice === 'save') return this.fileSave(false);
    return choice === 'discard';
  }

  /** Asks for title, instruments, key, meter and upbeat, then starts a new score. */
  async fileNew(): Promise<void> {
    if (!(await this.confirmDiscard())) return;
    const setup = await scoreDialog({ mode: 'new', initial: loadNewScoreDefaults() });
    if (!setup) return this.update();
    saveNewScoreDefaults(setup);
    this.load(newScoreState(createScore(setup)), null, null);
  }

  /** Time the user is looking at: caret, else selection, else the start. */
  private focusTime(): Fraction {
    const s = this.state;
    if (s.caret) return s.caret.time;
    const sel = s.selection;
    if (sel?.kind === 'gap') return sel.time;
    if (sel?.kind === 'event') {
      return getVoice(s.score, sel).voice.events.find((e) => e.id === sel.eventId)?.onset ?? ZERO;
    }
    return ZERO;
  }

  /** Title, key, meter, upbeat of the open score – an undoable change. */
  async scoreSettings(): Promise<void> {
    const score = this.state.score;
    const time = this.focusTime();
    const measures = measuresOf(score, 1, time);
    const here = measures.find((m) => le(m.start, time) && lt(time, m.end)) ?? measures[0]!;
    const at = here.number <= 1 ? ZERO : here.start;
    const content = measuresOf(score);
    const changes = await scoreDialog({
      mode: 'edit',
      initial: {
        title: score.title,
        composer: score.composer ?? '',
        pickup: score.pickup ?? ZERO,
        firstMeter: score.meter[0]!.sig,
        fromMeasure: Math.max(1, here.number),
        lastMeasure: content[content.length - 1]!.number,
        fifths: keyAt(score, at),
        meter: meterAt(score, at),
      },
      check: (c) => {
        const r = applyScoreChanges(this.state.score, c);
        return 'error' in r ? r.error : null;
      },
    });
    if (!changes) return this.update();
    const result = applyScoreChanges(this.state.score, changes);
    if ('score' in result && result.score !== this.state.score) {
      this.history.apply({ ...this.state, score: result.score, message: 'Partitur-Einstellungen übernommen' });
    }
    this.update();
  }

  /** Opens `path`, or lets the user pick a file. */
  async fileOpen(path?: string): Promise<void> {
    if (!(await this.confirmDiscard())) return;
    const file = await this.withBusy(
      () => (path ? this.platform.read(path) : this.platform.pickAndRead()),
      'Datei konnte nicht geöffnet werden',
    );
    if (!file) return;
    let score: Score;
    try {
      score = parseScoreFile(file.text);
    } catch (err) {
      const reason = err instanceof FileFormatError ? err.message : `Unerwarteter Fehler: ${errorText(err)}`;
      await inform(`„${file.name}“ konnte nicht geöffnet werden`, reason);
      return;
    }
    this.load({ ...createEditorState(score), message: `Geöffnet: ${file.name}` }, file.path, file.name);
  }

  /** Replaces the document; undo history starts fresh. */
  private load(state: EditorState, path: string | null, name: string | null): void {
    this.history = new History(state);
    this.savedScore = state.score;
    this.filePath = path;
    this.fileName = name;
    this.update();
  }

  private get displayName(): string {
    return this.fileName ?? this.state.score.title;
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
    const dirty = this.dirty;
    this.el.title.textContent = `${this.displayName}${dirty ? ' •' : ''}`;
    this.el.title.title = this.filePath ?? (dirty ? 'Nicht gespeichert' : '');
    const windowTitle = `${this.displayName}${dirty ? ' •' : ''} – Icastico`;
    if (windowTitle !== this.windowTitle) {
      this.windowTitle = windowTitle;
      this.platform.setTitle(windowTitle);
    }
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
    const barName = (t: Fraction) => (bar(t) === 0 ? 'Auftakt' : `Takt ${bar(t)}`);
    if (sel.kind === 'gap') return `${part.name}${staff} · ${barName(sel.time)} · Pause`;
    const ev = voice.events.find((e) => e.id === sel.eventId);
    if (!ev) return null;
    const what = ev.pitches.length > 1 ? 'Akkord' : 'Note';
    return `${part.name}${staff} · ${barName(ev.onset)} · ${what} ${ev.pitches.map(pitchToString).join(' ')} · ${durationName(ev.duration)}`;
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
