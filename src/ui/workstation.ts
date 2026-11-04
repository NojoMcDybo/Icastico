/**
 * The workstation: wires keyboard + mouse to commands, renders the score and
 * draws caret and selection on top of Verovio's SVG.
 *
 * Rendering is skipped when only caret/selection changed (decorate only).
 */
import { type CommandId, newScoreState, runCommand } from '../core/editor/commands';
import { demoScore } from '../core/demo';
import { History } from '../core/editor/history';
import { type EditorState, type VoiceRef, createEditorState, getVoice, inputLength } from '../core/editor/state';
import { applyRollEdit } from '../core/editor/rollEdits';
import { FileFormatError, parseScoreFile, serializeScore } from '../core/file/format';
import { musicXmlText } from '../core/import/container';
import { type ImportResult, ImportError, importMusicXml } from '../core/import/musicxml';
import { getInstrument } from '../core/instruments';
import { type Score, keyAt, measuresOf, meterAt, withTempo } from '../core/model';
import { secondsOf, tempoOf, timeAt } from '../core/playback';
import { durationName } from '../core/notation/notate';
import { pitchToString } from '../core/pitch';
import { type Fraction, ZERO, eq, le, lt } from '../core/time';
import { applyScoreChanges, createScore, emptyScore } from '../core/templates';
import { dirOf, fileNameOf, preferredFileName } from '../library/library';
import type { LibraryStore } from '../library/store';
import { type ElementRef, type MeiResult, scoreToMei, staffElementId } from '../render/mei';
import type { Engraver } from '../render/verovio';
import type { Platform } from '../platform/files';
import { APP_VERSION } from '../version';
import { ask, inform, isDialogOpen } from './dialog';
import { LibraryHome } from './libraryHome';
import { CurvePopup, type ShapeHost } from './curvePopup';
import { PianoRoll, type RollHost } from './pianoRoll';
import { Player } from './player';
import { Transport } from './transport';
import { laneControls, type LaneControls } from './laneControls';
import {
  DEFAULT_VIEW,
  NOTATION,
  type LaneId,
  type StaffMode,
  type ViewState,
  activate,
  heightOf,
  isCompact,
  hiddenStaves,
  modeOf,
  nextMode,
  normalize,
  rollLane,
  showsNotation,
  staffKey,
  visibleLanes,
  withMode,
  withHeight,
} from './lanes';
import { Thumbnails } from './thumbnails';
import type { UpdateChecker } from './updates';
import { loadNewScoreDefaults, loadView, saveKeymapPreset, saveLastOpened, saveNewScoreDefaults, saveView } from './preferences';
import { scoreDialog } from './scoreDialog';
import { comboOf, numpadComboOf } from './keys';
import { type Keymap, type PresetId, type UiCommandId, buildKeymap, findBinding, KEY_LIBRARY, PRESETS } from './keymaps/library';

export interface WorkstationElements {
  readonly pages: HTMLElement;
  readonly status: HTMLElement;
  readonly mode: HTMLElement;
  readonly title: HTMLElement;
  readonly help: HTMLElement;
  /** Container for the library home screen. */
  readonly library: HTMLElement;
  readonly libraryButton: HTMLElement;
  /** The piano roll panel below the notation, and its button in the top bar. */
  readonly roll: HTMLElement;
  readonly rollButton: HTMLElement;
  /** The transport bar (play buttons and the bar/beat/tempo display) in the top bar. */
  readonly transport: HTMLElement;
  /** "Update" button in the top bar, shown when a new version is known. */
  readonly updateButton: HTMLElement;
}

/** One piano-roll lane on screen. */
interface RollLane {
  readonly section: HTMLElement;
  readonly roll: PianoRoll;
  readonly controls: LaneControls;
}

interface DocumentLocation {
  readonly path: string;
  /** In the library folder: saved automatically, renamed with the title. */
  readonly inLibrary: boolean;
}

/** Milliseconds after the last change before a library score saves itself. */
const AUTOSAVE_DELAY = 1000;

/** Commands that make sense without an open score. */
const WITHOUT_DOCUMENT = new Set<string>(['file.new', 'file.open', 'library.toggle', 'view.help']);

const isInside = (root: string, path: string): boolean => {
  const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
  return norm(path).startsWith(`${norm(root).replace(/\/$/, '')}/`);
};

/** Notation size in percent of Verovio's default. */
const SCALE = 55;
/** Clicks this close (px) to a symbol still hit it, e.g. inside a hollow notehead. */
const HIT_TOLERANCE = 10;
const HINT = 'Enter: Eingabe · Strg+N: neu · Strg+O: Bibliothek · F1: alle Tasten';
const EMPTY_HINT = 'Strg+N: neue Partitur · Strg+O: Bibliothek · F1: alle Tasten';

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** A note being dragged in the notation: pitch by moving up/down, a chord by dropping it on another note. */
interface NoteDrag {
  readonly pointerId: number;
  readonly startY: number;
  readonly startX: number;
  /** Pixels per staff step (half the distance between two staff lines). */
  readonly stepPx: number;
  /** State before the drag, with the dragged note selected. */
  readonly base: EditorState;
  readonly source: { readonly voice: VoiceRef; readonly eventId: string; readonly toneId?: string };
  /** The other notes of the staff with their places from before the drag changed the layout. */
  readonly targets: readonly { readonly ref: ElementRef; readonly rect: DOMRect }[];
  steps: number;
  /** The note the pointer is over (a drop there makes a chord) as "voice/event", else ''. */
  over: string;
  moved: boolean;
  preview: EditorState | null;
}

export class Workstation {
  private history: History;
  private result: MeiResult | null = null;
  /** Where the current score lives (null = not saved anywhere yet). */
  private location: DocumentLocation | null = null;
  /** Display name of an external file in the browser (no path there). */
  private externalName: string | null = null;
  /** No score open (start without library content, or after trashing it). */
  private empty = true;
  /** The score as last saved or opened – unsaved changes = anything else. */
  private savedScore: Score;
  private saving: Promise<boolean> = Promise.resolve(true);
  /** A note being dragged with the mouse: up/down changes the pitch, onto another note makes a chord. */
  private drag: NoteDrag | null = null;
  /** The click that ends a drag must not select something else. */
  private swallowClick = false;
  private autosaveTimer = 0;
  private readonly player: Player;
  private readonly transport: Transport;
  private loop = false;
  /** Where playback starts and where it is: follows the selection while stopped, the clock while playing. */
  private playPos: Fraction = ZERO;
  /** Which views are shown how (per staff and lane); remembered per score. */
  private view: ViewState = DEFAULT_VIEW;
  private readonly rollLanes = new Map<string, RollLane>();
  private notationBar!: { readonly el: HTMLElement };
  /** What the notation was engraved without, and which selection was last scrolled into view. */
  private renderedHidden = '';
  private shownSelection = '';
  /** State at the start of a piano-roll drag; every preview is computed from it. */
  private rollBase: EditorState | null = null;
  private readonly library: LibraryHome | null;
  /** The loudness / glide-course menu of the piano roll (ADR 0016). */
  private readonly shape: CurvePopup;
  /** A file dialog is open; ignore shortcuts meanwhile. */
  private busy = false;
  private windowTitle = '';
  private renderedScore: Score | null = null;
  private renderedMeasures = 0;
  private renderedWidth = 0;

  constructor(
    private readonly el: WorkstationElements,
    private readonly engraver: Engraver,
    private keymap: Keymap,
    private readonly platform: Platform,
    private readonly store: LibraryStore | null,
    updates: UpdateChecker | null = null,
  ) {
    const blank = createEditorState(emptyScore());
    this.history = new History(blank);
    this.savedScore = blank.score;
    this.buildHelp();
    this.el.help.addEventListener('click', (e) => {
      if (e.target === this.el.help) this.el.help.hidden = true;
    });
    this.library = store
      ? new LibraryHome(el.library, store, new Thumbnails(engraver), {
          currentPath: () => (this.empty ? null : (this.location?.path ?? null)),
          flush: () => this.flush(),
          open: (path) => this.openLibraryItem(path),
          newScore: (collection) => this.fileNew(collection),
          openExternal: () => this.fileOpen(),
          importFile: () => this.fileImport(),
          relocated: (from, to) => this.relocated(from, to),
          closedByTrash: () => this.closeDocument(),
          ...(updates ? { checkForUpdates: () => updates.checkNow() } : {}),
        })
      : null;
    this.shape = new CurvePopup(this.gestureHost());
    this.buildNotationBar();
    this.player = new Player({
      frame: (seconds) => {
        this.playPos = timeAt(this.state.score, seconds);
        this.renderPlayhead();
      },
      stopped: () => this.update(),
      error: (message) => this.history.apply({ ...this.state, message }),
      notice: (message) => {
        this.history.apply({ ...this.state, message });
        this.renderStatus();
      },
    });
    this.transport = new Transport(el.transport, {
      play: () => this.togglePlay(),
      stop: () => this.player.stop(),
      toStart: () => this.seek(ZERO),
      step: (direction) => this.stepBar(direction),
      toggleLoop: () => {
        this.loop = !this.loop;
        this.player.setLoop(this.loop);
        return this.loop;
      },
      setTempo: (bpm) => this.setTempo(bpm),
      openSettings: () => void this.scoreSettings(),
    });
    el.rollButton.addEventListener('click', () => this.run('view.roll'));
    el.libraryButton.hidden = !this.library;
    el.updateButton.hidden = true;
    if (updates) {
      el.updateButton.addEventListener('click', () => void updates.confirmAndInstall());
      updates.onAvailable((u) => {
        el.updateButton.hidden = !u;
        el.updateButton.title = u ? `Version ${u.version} installieren` : '';
        this.library?.setUpdate(
          u ? { text: `Version ${u.version} ist verfügbar.`, install: () => void updates.confirmAndInstall() } : null,
        );
      });
    }
    el.libraryButton.addEventListener('click', () => this.run('library.toggle'));
    platform.guardClose(
      () => this.dirty,
      () => this.confirmDiscard(),
    );
    window.addEventListener('keydown', (e) => this.onKey(e));
    el.pages.addEventListener('click', (e) => this.onClick(e));
    el.pages.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    el.pages.addEventListener('pointermove', (e) => this.onPointerMove(e));
    el.pages.addEventListener('pointerup', (e) => this.onPointerUp(e));
    el.pages.addEventListener('pointercancel', (e) => this.onPointerUp(e, true));
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

  /** While a note is dragged, the live preview; otherwise the real state. */
  private get state(): EditorState {
    return this.drag?.preview ?? this.history.state;
  }

  /** Unsaved changes? Undoing back to the saved state counts as clean. */
  get dirty(): boolean {
    return !this.empty && this.history.committed.score !== this.savedScore;
  }

  // ── Input ────────────────────────────────────────────────────────────────

  private onKey(e: KeyboardEvent): void {
    if (isDialogOpen() || this.busy) return;
    if (this.history.inGesture) {
      // A piano-roll drag is running: Escape throws it away completely, nothing else works meanwhile.
      if (comboOf(e) === 'Escape') {
        e.preventDefault();
        for (const l of this.rollLanes.values()) l.roll.cancel();
        this.history.cancelGesture();
        this.rollBase = null;
        this.update();
      }
      return;
    }
    const helpOpen = !this.el.help.hidden;
    const combo = comboOf(e);
    if (this.library?.isOpen) {
      // The drawer handles its own keys (search, arrows, Enter, Esc).
      if (combo === 'Escape') {
        // Focus got lost somewhere (e.g. after a menu action): still close.
        e.preventDefault();
        this.library.hide();
        return;
      }
      const binding = combo ? findBinding(this.keymap, combo) : undefined;
      if (binding && (binding.command === 'library.toggle' || binding.command === 'file.new')) {
        e.preventDefault();
        this.run(binding.command);
      }
      return;
    }
    if (helpOpen) {
      if (combo === 'Escape' || combo === 'F1' || combo === '?') {
        e.preventDefault();
        this.el.help.hidden = true;
      }
      return;
    }
    if (!combo) return;
    const numpad = numpadComboOf(e);
    const binding = (numpad ? findBinding(this.keymap, numpad) : undefined) ?? findBinding(this.keymap, combo);
    if (!binding) return;
    e.preventDefault();
    this.run(binding.command, binding.arg ?? 0);
  }

  run(command: CommandId | UiCommandId, arg = 0): void {
    if (this.empty && !WITHOUT_DOCUMENT.has(command)) return;
    switch (command) {
      case 'library.toggle':
        void this.library?.toggle();
        return;
      case 'history.undo':
        this.history.undo();
        break;
      case 'history.redo':
        this.history.redo();
        break;
      case 'view.help':
        this.el.help.hidden = false;
        return;
      case 'view.roll':
        this.toggleRoll();
        return;
      case 'play.toggle':
        this.togglePlay();
        return;
      case 'file.new':
        void this.fileNew();
        return;
      case 'file.open':
        void this.fileOpen();
        return;
      case 'file.import':
        void this.fileImport();
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

  // ── Documents: library, external files, autosave ─────────────────────────

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

  /**
   * Start like Folio: the library is the first screen. The last edited score
   * is already open behind it (Esc goes there). Then listen for files that
   * were double-clicked in Explorer/Finder.
   */
  async openInitial(lastOpened: string | null): Promise<void> {
    if (this.store) {
      const items = this.store.index.items.filter((i) => !i.trashed && !i.broken);
      const item = items.find((i) => i.path === lastOpened) ?? items[0];
      if (item) await this.openLibraryItem(item.path);
      await this.library?.show();
    } else {
      this.load(createEditorState(demoScore()), null);
    }
    this.platform.onFileOpened((path) => void this.fileOpen(path));
  }

  /** Collection (sub-folder) of the open library score; null = top level. */
  private get currentCollection(): string | null {
    if (!this.store || !this.location?.inLibrary) return null;
    const dir = dirOf(this.location.path);
    return dir === this.store.root ? null : fileNameOf(dir);
  }

  /** Ctrl+S: library scores save in place (they also save automatically). */
  async fileSave(saveAs: boolean): Promise<boolean> {
    if (this.empty) return false;
    if (!saveAs && this.location?.inLibrary) return this.saveLibrary(true);
    if (!saveAs && !this.location && this.store) {
      // A score without a home (e.g. the demo without library) moves into the library.
      const path = await this.withBusy(() => this.store!.createScore(this.history.committed.score, null), 'Speichern fehlgeschlagen');
      if (!path) return false;
      this.location = { path, inLibrary: true };
      this.savedScore = this.history.committed.score;
      this.history.apply({ ...this.state, message: 'In der Bibliothek gespeichert' });
      this.update();
      return true;
    }
    // External file, or "save a copy as" for library scores.
    const score = this.history.committed.score;
    const external = this.location && !this.location.inLibrary ? this.location.path : null;
    const saved = await this.withBusy(
      () =>
        this.platform.write(
          serializeScore(score, APP_VERSION),
          saveAs ? null : external,
          preferredFileName(score.title),
        ),
      'Speichern fehlgeschlagen',
    );
    if (!saved) {
      this.update();
      return false;
    }
    if (this.location?.inLibrary) {
      this.history.apply({ ...this.state, message: `Kopie gespeichert: ${saved.name}` });
    } else {
      this.location = saved.path ? { path: saved.path, inLibrary: false } : null;
      this.savedScore = score;
      this.history.apply({ ...this.state, message: `Gespeichert: ${saved.name}` });
    }
    this.update();
    return true;
  }

  /** Saves the open library score (queued, so saves never overlap). */
  private saveLibrary(explicit: boolean): Promise<boolean> {
    clearTimeout(this.autosaveTimer);
    this.saving = this.saving.then(async () => {
      const location = this.location;
      const score = this.history.committed.score;
      if (!this.store || !location?.inLibrary) return false;
      if (score === this.savedScore) {
        if (explicit) this.history.apply({ ...this.state, message: 'Gespeichert' });
        return true;
      }
      try {
        const path = await this.store.saveScore(location.path, score);
        if (this.location === location) {
          this.location = { path, inLibrary: true };
          this.persistView(); // the file may have been renamed with the title
        }
        this.savedScore = score;
        saveLastOpened(path);
        if (explicit) this.history.apply({ ...this.state, message: 'Gespeichert' });
        return true;
      } catch (err) {
        this.history.apply({ ...this.state, message: `Automatisches Speichern fehlgeschlagen: ${errorText(err)}` });
        if (explicit) await inform('Speichern fehlgeschlagen', errorText(err));
        return false;
      } finally {
        this.renderStatus();
      }
    });
    return this.saving;
  }

  private scheduleAutosave(): void {
    clearTimeout(this.autosaveTimer);
    if (this.location?.inLibrary && this.dirty && !this.empty && !this.drag) {
      this.autosaveTimer = window.setTimeout(() => void this.saveLibrary(false), AUTOSAVE_DELAY);
    }
  }

  /** Writes pending changes of a library score now. */
  async flush(): Promise<void> {
    if (this.location?.inLibrary && this.dirty) await this.saveLibrary(false);
    await this.saving;
  }

  /** True if the current score may be replaced. Library scores just save; others ask. */
  private async confirmDiscard(): Promise<boolean> {
    if (this.empty) return true;
    if (this.location?.inLibrary) {
      await this.flush();
      if (!this.dirty) return true;
    }
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

  /** Asks for title, instruments, key, meter and upbeat; the new score lands in the library. */
  async fileNew(collection: string | null = this.library?.isOpen ? this.library.collection : this.currentCollection): Promise<void> {
    if (!(await this.confirmDiscard())) return;
    this.library?.hide();
    const setup = await scoreDialog({ mode: 'new', initial: loadNewScoreDefaults() });
    if (!setup) return this.update();
    saveNewScoreDefaults(setup);
    const score = createScore(setup);
    if (!this.store) return this.load(newScoreState(score), null);
    const path = await this.withBusy(() => this.store!.createScore(score, collection), 'Partitur konnte nicht angelegt werden');
    if (!path) return this.update();
    saveLastOpened(path);
    this.load(newScoreState(score), { path, inLibrary: true });
  }

  async openLibraryItem(path: string): Promise<void> {
    if (!this.store) return;
    if (this.location?.path === path && !this.empty) return this.update();
    if (!(await this.confirmDiscard())) return;
    const score = await this.withBusy(() => this.store!.readScore(path), 'Partitur konnte nicht geöffnet werden');
    if (!score) return;
    saveLastOpened(path);
    this.load(createEditorState(score), { path, inLibrary: true });
  }

  /** Opens a file from anywhere (Ctrl+Shift+O, double-click). Library files open as library scores. */
  async fileOpen(path?: string): Promise<void> {
    if (path && this.store && isInside(this.store.root, path)) {
      await this.store.refresh();
      return this.openLibraryItem(path);
    }
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
    this.externalName = file.name;
    this.load(
      { ...createEditorState(score), message: `Geöffnet: ${file.name}` },
      file.path ? { path: file.path, inLibrary: false } : null,
    );
  }

  /** MusicXML → a new score in the library (ADR 0017); what could not be taken over is listed. */
  async fileImport(): Promise<void> {
    if (!(await this.confirmDiscard())) return this.update();
    const file = await this.withBusy(() => this.platform.pickImport(), 'Datei konnte nicht geöffnet werden');
    if (!file) return this.update();
    let result: ImportResult;
    try {
      result = importMusicXml(musicXmlText(file.bytes), file.name);
    } catch (err) {
      const reason = err instanceof ImportError ? err.message : 'Unerwarteter Fehler: ' + errorText(err);
      await inform('„' + file.name + '“ konnte nicht importiert werden', reason);
      return this.update();
    }
    this.library?.hide();
    const collection = this.library?.isOpen ? this.library.collection : this.currentCollection;
    let location: DocumentLocation | null = null;
    if (this.store) {
      const path = await this.withBusy(() => this.store!.createScore(result.score, collection), 'Partitur konnte nicht angelegt werden');
      if (!path) return this.update();
      saveLastOpened(path);
      location = { path, inLibrary: true };
    }
    const hints = result.notes.length ? ' (' + result.notes.length + ' Hinweise)' : '';
    this.load({ ...createEditorState(result.score), message: 'Importiert: ' + file.name + hints }, location);
    if (result.notes.length > 0) {
      await inform('Import abgeschlossen', '„' + result.score.title + '“ ist importiert. Nicht alles ließ sich übernehmen:\n\n- ' + result.notes.join('\n- '));
    }
  }

  /** Replaces the document; undo history starts fresh. */
  private load(state: EditorState, location: DocumentLocation | null): void {
    clearTimeout(this.autosaveTimer);
    this.history = new History(state);
    this.savedScore = state.score;
    this.location = location;
    this.empty = false;
    this.player.stop();
    this.playPos = ZERO;
    this.view = location?.path ? loadView(location.path) : DEFAULT_VIEW;
    for (const ui of this.rollLanes.values()) ui.section.remove();
    this.rollLanes.clear();
    this.renderedHidden = '';
    this.shownSelection = '';
    if (location?.inLibrary) this.externalName = null;
    this.renderedScore = null;
    this.update();
  }

  /** No document open (e.g. the open score went to the trash). */
  private closeDocument(): void {
    clearTimeout(this.autosaveTimer);
    const blank = createEditorState(emptyScore());
    this.history = new History(blank);
    this.savedScore = blank.score;
    this.location = null;
    this.empty = true;
    this.update();
  }

  /** A file or folder was moved/renamed in the library: follow the open document. */
  private relocated(from: string, to: string): void {
    const path = this.location?.path;
    if (!path) return;
    const sep = path.includes('\\') ? '\\' : '/';
    const next = path === from ? to : path.startsWith(from + sep) ? to + path.slice(from.length) : null;
    if (next && this.location) {
      this.location = { ...this.location, path: next };
      this.persistView();
      saveLastOpened(next);
      this.renderStatus();
    }
  }

  private get displayName(): string {
    if (this.location && !this.location.inLibrary) return this.externalName ?? fileNameOf(this.location.path);
    return this.state.score.title;
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
    if (this.empty) return;
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

  // ── Dragging notes up/down ───────────────────────────────────────────────

  /** Half the distance between two staff lines of the staff a symbol sits on, in pixels. */
  private stepPixels(ref: ElementRef): number {
    const staff = document.getElementById(staffElementId(ref.measureNumber, ref.staffN));
    const lines = staff ? [...staff.children].filter((c) => c.tagName.toLowerCase() === 'path').slice(0, 5) : [];
    if (lines.length === 5) {
      const top = lines[0]!.getBoundingClientRect();
      const bottom = lines[4]!.getBoundingClientRect();
      const gap = (bottom.top + bottom.height / 2 - (top.top + top.height / 2)) / 4;
      if (gap > 1) return gap / 2;
    }
    return 5;
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || this.empty || this.drag) return;
    const ref = this.hitTest(e);
    if (!ref?.eventId) return;
    const s = this.history.state;
    const voice = { partId: ref.partId, voiceId: ref.voiceId };
    const targets: { ref: ElementRef; rect: DOMRect }[] = [];
    for (const [id, other] of this.result?.elements ?? []) {
      if (!other.eventId || other.eventId === ref.eventId || other.partId !== ref.partId || other.staffN !== ref.staffN) continue;
      if (other.kind === 'rest' || other.kind === 'measureRest') continue;
      const rect = document.getElementById(id)?.getBoundingClientRect();
      if (rect) targets.push({ ref: other, rect });
    }
    this.drag = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startX: e.clientX,
      stepPx: this.stepPixels(ref),
      base: { ...s, selection: { kind: 'event', ...voice, eventId: ref.eventId, ...(ref.toneId ? { toneId: ref.toneId } : {}) }, message: null },
      source: { voice, eventId: ref.eventId, ...(ref.toneId ? { toneId: ref.toneId } : {}) },
      targets,
      steps: 0,
      over: '',
      moved: false,
      preview: null,
    };
    this.el.pages.setPointerCapture(e.pointerId);
  }

  /** The note of the same staff under the pointer (with a little tolerance), if any. */
  private noteUnder(d: NoteDrag, e: PointerEvent): ElementRef | null {
    const near = (r: DOMRect) => e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6;
    return d.targets.find((t) => near(t.rect))?.ref ?? null;
  }

  private onPointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const dy = d.startY - e.clientY;
    if (!d.moved && Math.abs(dy) < 4 && Math.abs(d.startX - e.clientX) < 10) return;
    d.moved = true;
    document.body.classList.add('is-dragging-note');
    const steps = Math.round(dy / d.stepPx);
    const over = this.noteUnder(d, e);
    const overKey = over ? `${over.voiceId}/${over.eventId}` : '';
    if (steps === d.steps && overKey === d.over && d.preview) return;
    d.steps = steps;
    d.over = overKey;
    // Alt = semitones (like Logic), otherwise staff steps in the key (like Finale).
    const command = e.altKey ? 'edit.semitone' : 'edit.step';
    // Over another note the pitch stays as it is (a drop there makes a chord); elsewhere the height sets the pitch.
    let next = steps === 0 || over ? d.base : runCommand(d.base, command, steps);
    const target = over && getVoice(next.score, { partId: over.partId, voiceId: over.voiceId }).voice.events.find((x) => x.id === over.eventId);
    if (over && target) {
      // Dropped on another note: the dragged one joins it as a chord (same time, same length).
      next = applyRollEdit(next, {
        kind: 'change',
        voice: d.source.voice,
        eventId: d.source.eventId,
        onset: target.onset,
        duration: target.duration,
        into: { partId: over.partId, voiceId: over.voiceId },
        ...(d.source.toneId ? { only: d.source.toneId } : {}),
      });
    }
    d.preview = next;
    this.update();
  }

  private onPointerUp(e: PointerEvent, cancelled = false): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.drag = null;
    document.body.classList.remove('is-dragging-note');
    if (this.el.pages.hasPointerCapture(e.pointerId)) this.el.pages.releasePointerCapture(e.pointerId);
    if (!d.moved) return; // a plain click: handled by onClick
    this.swallowClick = true;
    window.setTimeout(() => (this.swallowClick = false), 80);
    const final = cancelled ? d.base : (d.preview ?? d.base);
    // One undo step for the whole drag.
    this.history.apply(final.score === d.base.score ? d.base : { ...final, message: null });
    this.update();
  }

  private onClick(e: MouseEvent): void {
    this.activateLane(NOTATION);
    if (this.swallowClick) {
      this.swallowClick = false;
      return;
    }
    const ref = this.hitTest(e);
    const s = this.state;
    if (!ref) {
      if (!s.caret) this.history.apply({ ...s, selection: null, message: null });
      this.update();
      return;
    }
    const voice = { partId: ref.partId, voiceId: ref.voiceId };
    const selection = ref.eventId
      ? { kind: 'event' as const, ...voice, eventId: ref.eventId, ...(ref.toneId ? { toneId: ref.toneId } : {}) }
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
    this.renderLanes(); // first: a lane that just appeared needs its size before the notation is engraved
    try {
      if (!this.history.inGesture) this.renderIfNeeded();
    } catch (err) {
      // Never leave the user with a broken score: take back the last change (and only that one).
      if (this.drag?.preview) this.drag.preview = this.drag.base; // only the drag preview was faulty
      else this.history.rollback();
      this.history.apply({
        ...this.state,
        message: `Interner Fehler, Änderung rückgängig gemacht: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.renderIfNeeded();
    }
    this.decorate();
    this.renderTransport();
    this.renderStatus();
    this.scheduleAutosave();
    this.shape.refresh();
  }

  // ── Lanes: notation and piano rolls, one roll per staff ────────────────────

  /** All staves of the score in order, as `<partId>:<staffIndex>`. */
  private staffKeys(): string[] {
    return this.state.score.parts.flatMap((p) => getInstrument(p.instrument).staves.map((_, i) => staffKey(p.id, i)));
  }

  private setView(next: ViewState): void {
    this.view = next;
    this.persistView();
    this.update();
  }

  private persistView(): void {
    if (this.location?.path) saveView(this.location.path, this.view);
  }

  /** The user worked in this lane: it gets the focus ring (no redraw needed). */
  private activateLane(lane: LaneId): void {
    if (this.view.active === lane) return;
    this.view = activate(this.view, lane);
    this.markActive();
  }

  private markActive(): void {
    this.notationBar.el.classList.toggle('is-active', this.view.active === NOTATION);
    for (const [key, ui] of this.rollLanes) ui.section.classList.toggle('is-active', this.view.active === rollLane(key));
  }

  /** Strg+Umschalt+P: closes all rolls, or opens one for the staff of the selection. */
  private toggleRoll(): void {
    const keys = this.staffKeys();
    if (keys.some((k) => modeOf(this.view, k) !== 'notation')) {
      this.setView(keys.reduce((v, k) => withMode(v, k, 'notation', keys), this.view));
      return;
    }
    const s = this.state;
    const at = s.selection ?? s.caret;
    let key = keys[0];
    if (at) {
      const { part, voice } = getVoice(s.score, at);
      key = staffKey(part.id, voice.staff);
    }
    if (key) this.setView(withMode(this.view, key, 'both', keys));
  }

  private buildNotationBar(): void {
    const bar = document.createElement('div');
    bar.className = 'lane__bar';
    const title = document.createElement('span');
    title.className = 'lane__title';
    title.textContent = 'Notenschrift';
    bar.append(title);
    bar.addEventListener('click', () => this.activateLane(NOTATION));
    this.el.pages.parentElement!.before(bar);
    this.notationBar = { el: bar };
  }

  private createRollLane(key: string): RollLane {
    const cut = key.lastIndexOf(':');
    const staff = { partId: key.slice(0, cut), staffIndex: Number(key.slice(cut + 1)) };
    const lane = rollLane(key);
    const section = document.createElement('section');
    section.className = 'roll';
    section.setAttribute('aria-label', 'Piano-Roll');
    const controls = laneControls((mode) => this.setView(withMode(this.view, key, mode, this.staffKeys())));
    const roll = new PianoRoll(section, this.rollHost(lane), staff, controls.el);
    section.querySelector('.roll__head')!.addEventListener('click', () => this.activateLane(lane));
    section.prepend(this.resizeHandle(section, lane, roll));
    return { section, roll, controls };
  }

  /**
   * The top edge of a roll lane: drag it to change how much room the roll gets (the notation takes the rest);
   * ↑/↓ does the same from the keyboard, a double click gives it back its default height.
   */
  private resizeHandle(section: HTMLElement, lane: LaneId, roll: PianoRoll): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'roll__resize';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'horizontal');
    handle.setAttribute('aria-label', 'Höhe der Piano-Roll (Ziehen oder Pfeil hoch/runter)');
    handle.tabIndex = 0;
    const apply = (px: number, final: boolean) => {
      const next = withHeight(this.view, lane, px);
      section.style.flexBasis = `${heightOf(next, lane)}px`;
      roll.setCompact(isCompact(heightOf(next, lane)));
      roll.render();
      this.fitNotation();
      if (final) this.setView(next);
    };
    let drag: { id: number; y: number; height: number } | null = null;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, y: e.clientY, height: section.getBoundingClientRect().height };
      handle.setPointerCapture(e.pointerId);
      this.activateLane(lane);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (drag && e.pointerId === drag.id) apply(drag.height + (drag.y - e.clientY), false);
    });
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      apply(drag.height + (drag.y - e.clientY), true);
      drag = null;
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', () => (drag = null));
    handle.addEventListener('dblclick', () => this.setView(withHeight(this.view, lane, 260)));
    handle.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowUp' ? 40 : e.key === 'ArrowDown' ? -40 : 0;
      if (!step) return;
      e.preventDefault();
      e.stopPropagation(); // the arrows must not move the selection
      apply(heightOf(this.view, lane) + step, true);
    });
    return handle;
  }

  /** The notation becomes a small overview strip when the rolls leave it little room. */
  private fitNotation(): void {
    const canvas = this.el.pages.parentElement!;
    canvas.classList.remove('is-small');
    canvas.dataset.size = 'normal';
    if (!canvas.hidden && canvas.clientHeight < 130) {
      canvas.classList.add('is-small');
      canvas.dataset.size = 'small';
    }
  }

  /** Gesture editing for a roll or the loudness menu: previews while dragging, one undo step at the end. */
  private gestureHost(): ShapeHost {
    return {
      state: () => this.state,
      beginGesture: () => {
        this.rollBase = this.state;
        this.history.beginGesture();
      },
      preview: (edit) => {
        const base = this.rollBase;
        if (!base) return;
        const next = applyRollEdit(base, edit);
        // A refused edit keeps the last valid preview; only the message changes.
        this.history.apply(next.message && next.score === base.score ? { ...this.state, message: next.message } : next);
        this.update();
      },
      endGesture: (commit) => {
        if (commit) this.history.commitGesture();
        else this.history.cancelGesture();
        this.rollBase = null;
        this.update();
      },
      edit: (edit) => {
        this.history.apply(applyRollEdit(this.state, edit));
        this.update();
      },
    };
  }

  /** What one roll lane needs from the workstation. */
  private rollHost(lane: LaneId): RollHost {
    return {
      ...this.gestureHost(),
      openShape: (target, anchor) => this.shape.open(target, anchor),
      select: (selection, caretTime) => {
        const s = this.state;
        const caret = s.caret && selection && caretTime ? { partId: selection.partId, voiceId: selection.voiceId, time: caretTime } : s.caret;
        if (!selection && s.caret) return;
        this.history.apply({ ...s, selection, caret, message: null });
        this.update();
      },
      activate: () => this.activateLane(lane),
    };
  }

  // ── Playback ─────────────────────────────────────────────────────────────

  private togglePlay(): void {
    if (this.empty) return;
    if (this.player.active) {
      this.player.stop();
      return;
    }
    const score = this.state.score;
    void this.player.start(score, secondsOf(score, this.playPos), this.loop).then(() => this.renderTransport());
  }

  /** Moves the playhead; if the music is playing it continues from there. */
  private seek(time: Fraction): void {
    const wasPlaying = this.player.active;
    if (wasPlaying) this.player.stop();
    this.playPos = time;
    this.update();
    if (wasPlaying) this.togglePlay();
  }

  private stepBar(direction: number): void {
    const measures = measuresOf(this.state.score, 1, this.playPos);
    const index = measures.findIndex((m) => lt(this.playPos, m.end));
    const here = measures[Math.max(0, index)]!;
    const target = direction > 0 ? measures[index + 1]?.start : le(this.playPos, here.start) ? measures[index - 1]?.start : here.start;
    this.seek(target ?? ZERO);
  }

  private setTempo(bpm: number): void {
    const score = withTempo(this.state.score, bpm);
    if (score === this.state.score || tempoOf(score) === tempoOf(this.state.score)) return;
    this.history.apply({ ...this.state, score, message: `Tempo ${tempoOf(score)}` });
    this.update();
  }

  private renderTransport(): void {
    this.transport.show({ score: this.state.score, time: this.playPos, playing: this.player.active, loop: this.loop, disabled: this.empty });
    this.renderPlayhead();
  }

  private renderPlayhead(): void {
    if (!this.player.active || this.empty) {
      for (const ui of this.rollLanes.values()) ui.roll.setPlayhead(this.empty ? null : this.playPos, false);
    } else {
      for (const ui of this.rollLanes.values()) ui.roll.setPlayhead(this.playPos, true);
      this.transport.show({ score: this.state.score, time: this.playPos, playing: true, loop: this.loop, disabled: false });
    }
  }

  /** Brings the lanes in line with the view state: creates, removes, sizes and redraws them. */
  private renderLanes(): void {
    const canvas = this.el.pages.parentElement!;
    const dock = this.el.roll;
    const lanesBox = dock.parentElement!;
    if (this.empty) {
      this.notationBar.el.hidden = true;
      canvas.hidden = false;
      canvas.dataset.size = 'normal';
      canvas.classList.remove('is-small');
      dock.hidden = true;
      return;
    }
    const keys = this.staffKeys();
    const normalized = normalize(this.view, keys);
    if (JSON.stringify(normalized) !== JSON.stringify(this.view)) {
      this.view = normalized;
      this.persistView();
    }
    const lanes = visibleLanes(this.view, keys);
    const notation = lanes.includes(NOTATION);
    canvas.hidden = !notation;
    this.notationBar.el.hidden = !notation;
    lanesBox.classList.toggle('no-notation', !notation);

    const wanted = keys.filter((k) => modeOf(this.view, k) !== 'notation');
    for (const [key, ui] of this.rollLanes) {
      if (!wanted.includes(key)) {
        ui.section.remove();
        this.rollLanes.delete(key);
      }
    }
    wanted.forEach((key, i) => {
      let ui = this.rollLanes.get(key);
      if (!ui) {
        ui = this.createRollLane(key);
        this.rollLanes.set(key, ui);
      }
      // Moving a node resets its scroll position, so only touch the order when it is wrong.
      if (dock.children[i] !== ui.section) dock.insertBefore(ui.section, dock.children[i] ?? null);
      const height = heightOf(this.view, rollLane(key));
      ui.section.style.flexBasis = `${height}px`;
      ui.controls.sync(modeOf(this.view, key));
      ui.roll.setCompact(isCompact(height));
      ui.roll.setPlayhead(this.playPos, false);
      ui.roll.render();
    });
    this.fitNotation();
    dock.hidden = wanted.length === 0;
    this.el.rollButton.setAttribute('aria-pressed', String(wanted.length > 0));
    this.markActive();
  }

  /** Small round switch left of each staff: notation → both → roll. */
  private drawStaffSwitches(): void {
    this.el.pages.querySelectorAll('.staff-mode').forEach((n) => n.remove());
    const result = this.result;
    if (!result || this.el.pages.parentElement!.classList.contains('is-small')) return;
    const keys = this.staffKeys();
    const first = measuresOf(this.state.score)[0]!.number;
    for (const staff of result.staffs) {
      const staffEl = document.getElementById(staffElementId(first, staff.n));
      const page = staffEl?.closest('.page');
      if (!staffEl || !(page instanceof HTMLElement)) continue;
      const key = staffKey(staff.partId, staff.staffIndex);
      const mode: StaffMode = modeOf(this.view, key);
      const box = staffEl.getBoundingClientRect();
      const pageBox = page.getBoundingClientRect();
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'staff-mode';
      b.setAttribute('aria-pressed', String(mode === 'both'));
      b.title = mode === 'notation' ? 'Diese Zeile auch als Piano-Roll zeigen' : 'Zeilenart weiterschalten: Noten → Beides → Roll';
      b.setAttribute('aria-label', b.title);
      b.innerHTML =
        '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="9" width="6" height="2.4" rx="1.2"/><rect x="6" y="5" width="8" height="2.4" rx="1.2"/></svg>';
      b.style.left = '10px';
      b.style.top = `${box.top - pageBox.top + box.height / 2 - 11}px`;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setView(withMode(this.view, key, nextMode(mode), keys));
      });
      page.append(b);
    }
  }

  /** Shown in the canvas when no score is open. */
  private renderEmpty(): void {
    const box = document.createElement('div');
    box.className = 'empty-state';
    const title = document.createElement('h2');
    title.textContent = 'Keine Partitur geöffnet';
    const text = document.createElement('p');
    text.textContent = 'Lege eine neue Partitur an oder öffne eine aus der Bibliothek.';
    const row = document.createElement('div');
    row.className = 'modal__buttons';
    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'is-primary';
    create.textContent = 'Neue Partitur (Strg+N)';
    create.addEventListener('click', () => this.run('file.new'));
    row.append(create);
    if (this.library) {
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Bibliothek (Strg+O)';
      open.addEventListener('click', () => this.run('library.toggle'));
      row.append(open);
    }
    box.append(title, text, row);
    this.el.pages.replaceChildren(box);
    this.result = null;
    this.renderedScore = null;
  }

  private renderIfNeeded(): void {
    if (this.empty) return this.renderEmpty();
    const s = this.state;
    const keys = this.staffKeys();
    const view = normalize(this.view, keys);
    if (!showsNotation(view, keys)) {
      // Every staff is a piano roll: nothing to engrave.
      this.el.pages.replaceChildren();
      this.result = null;
      this.renderedScore = null;
      return;
    }
    const hidden = hiddenStaves(view, keys);
    const hiddenKey = [...hidden].join();
    const coverTime = s.caret?.time;
    const measures = measuresOf(s.score, 1, coverTime).length;
    const width = Math.min(this.el.pages.clientWidth, 1100);
    if (s.score === this.renderedScore && measures === this.renderedMeasures && width === this.renderedWidth && hiddenKey === this.renderedHidden) return;

    const result = scoreToMei(s.score, { ...(coverTime ? { coverTime } : {}), hiddenStaves: hidden });
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
    this.renderedHidden = hiddenKey;
  }

  private decorate(): void {
    const s = this.state;
    const elements = this.result?.elements;
    this.el.pages.querySelectorAll('.is-selected').forEach((n) => n.classList.remove('is-selected'));
    this.el.pages.querySelectorAll('.caret').forEach((n) => n.remove());
    if (!elements) {
      this.el.pages.querySelectorAll('.staff-mode').forEach((n) => n.remove());
      return;
    }

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
    this.drawStaffSwitches();
    this.followSelection();
  }

  /** A selection made in another view scrolls into sight here – only when the selection changed. */
  private followSelection(): void {
    const sel = this.state.selection;
    const key = sel ? (sel.kind === 'event' ? `${sel.voiceId}/${sel.eventId}` : `${sel.voiceId}@${sel.time.n}/${sel.time.d}`) : '';
    if (key === this.shownSelection) return;
    this.shownSelection = key;
    if (!this.player.active) this.playPos = this.focusTime(); // the playhead waits where the selection is
    this.el.pages.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
    const name = this.empty ? 'Keine Partitur' : this.displayName;
    this.el.title.textContent = `${name}${dirty ? ' •' : ''}`;
    this.el.title.title = this.empty
      ? ''
      : `${this.location?.path ?? 'Noch nicht gespeichert'}${this.location?.inLibrary ? ' (speichert automatisch)' : ''}\nKlick: Partitur-Einstellungen`;
    const windowTitle = `${name}${dirty ? ' •' : ''} – Icastico`;
    if (windowTitle !== this.windowTitle) {
      this.windowTitle = windowTitle;
      this.platform.setTitle(windowTitle);
    }
    this.el.status.textContent = this.empty ? EMPTY_HINT : (s.message ?? this.describeSelection() ?? HINT);
    if (s.caret) {
      const parts = [`Eingabe · ${durationName(inputLength(s.input))}`];
      if (s.input.insert) parts.push('Einfügen');
      if (s.input.chord) parts.push('Akkord');
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
    const what = ev.tones.length > 1 ? 'Akkord' : 'Note';
    const chord = ev.tones.map((t) => pitchToString(t.pitch)).join(' ');
    const one = ev.tones.length > 1 ? ev.tones.find((t) => t.id === sel.toneId) : undefined;
    const label = one ? `Ton ${pitchToString(one.pitch)} im Akkord ${chord}` : `${what} ${chord}`;
    return `${part.name}${staff} · ${barName(ev.onset)} · ${label} · ${durationName(ev.duration)}`;
  }

  /** Switches between the Finale and the Logic key layout (remembered). */
  setKeymap(id: PresetId): void {
    this.keymap = buildKeymap(id);
    saveKeymapPreset(id);
    this.buildHelp();
    this.el.help.querySelector<HTMLButtonElement>(`[data-preset="${id}"]`)?.focus();
  }

  private buildHelp(): void {
    const box = document.createElement('div');
    box.className = 'help__box';
    const head = document.createElement('div');
    head.className = 'help__head';
    const title = document.createElement('h2');
    title.textContent = 'Tastenbelegung';
    const switcher = document.createElement('div');
    switcher.className = 'help__presets';
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', 'Tastenbelegung wählen');
    for (const id of PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pill${id === this.keymap.id ? ' is-active' : ''}`;
      b.textContent = KEY_LIBRARY.presets[id].name;
      b.dataset.preset = id;
      b.setAttribute('aria-pressed', String(id === this.keymap.id));
      b.addEventListener('click', () => this.setKeymap(id));
      switcher.append(b);
    }
    head.append(title, switcher);
    const desc = document.createElement('p');
    desc.className = 'help__desc';
    desc.textContent = this.keymap.description;
    box.append(head, desc);
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
  }
}
