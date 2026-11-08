/**
 * The workstation: wires keyboard + mouse to commands, renders the score and
 * draws caret and selection on top of Verovio's SVG.
 *
 * Rendering is skipped when only caret/selection changed (decorate only).
 */
import { LyricsPanel } from './lyricsPanel';
import { type CommandId, chordSymbolText, dropBarSign, dropNoteSign, eraseBarSign, eraseNoteSign, ghostPitches, signsAtFocus, lyricsText, newScoreState, runCommand, setChordSymbol, setLyricOf, setLyrics } from '../core/editor/commands';
import { demoScore } from '../core/demo';
import { History } from '../core/editor/history';
import { type EditorState, type VoiceRef, allVoiceRefs, createEditorState, getVoice, inputLength, staffCenter } from '../core/editor/state';
import { applyRollEdit } from '../core/editor/rollEdits';
import { transposeScope, transposeSelection } from '../core/editor/transposeState';
import { transposeDialog } from './transposeDialog';
import { latestNotes, showPatchNotes } from './patchNotes';
import { type Clip, copyClip, cutClip, markFromTo, pasteClip, rangeSpan, rangeTo } from '../core/editor/range';
import { FILE_EXTENSION, FileFormatError, parseScoreFile, serializeScore } from '../core/file/format';
import { type ImportResult, ImportError } from '../core/import/musicxml';
import { convertImport } from './importFile';
import { extractPart } from '../core/extract';
import { pdfDialog } from './pdfDialog';
import { type PaletteKind, SymbolPalette } from './symbolPalette';
import { BAR_SIGNS, NOTE_SYMBOLS, barSign, noteSymbol, voltaNumber } from '../core/symbols';
import { type PlayMap, playMapOf } from '../core/playOrder';
import { printPages, scoresToPdf } from './pdfExport';
import { quantizeEvents } from '../core/editor/quantizeOp';
import type { Subdivision } from '../core/import/quantize';
import { exportMusicXml, type ExportResult } from '../core/export/musicxml';
import { exportMidi } from '../core/export/midi';
import type { ExportChoice } from './libraryHome';
import { getInstrument } from '../core/instruments';
import { type Score, keyAt, measuresOf, meterAt, withTempo } from '../core/model';
import { secondsOf, tempoOf, timeAt } from '../core/playback';
import { durationName } from '../core/notation/notate';
import { type Pitch, STEPS, midiOf, pitchToString } from '../core/pitch';
import { type Fraction, ZERO, eq, le, lt, toNumber } from '../core/time';
import { applyScoreChanges, createScore, emptyScore, keyName as germanKeyName } from '../core/templates';
import { openKeyPicker } from './keyPicker';
import { dirOf, fileNameOf, preferredFileName } from '../library/library';
import type { LibraryStore } from '../library/store';
import { type ElementRef, type MeiResult, scoreToMei, staffElementId } from '../render/mei';
import type { Engraver } from '../render/verovio';
import type { Platform } from '../platform/files';
import { APP_VERSION } from '../version';
import { ask, inform, isDialogOpen, promptText } from './dialog';
import { LibraryHome } from './libraryHome';
import { CurvePopup, type ShapeHost } from './curvePopup';
import { PianoRoll, type RollHost } from './pianoRoll';
import { Player } from './player';
import { Synth } from '../audio/synth';
import { Transport } from './transport';
import { currentVoice, voiceTestEnabled } from '../platform/voice';
import { type MidiListener, listenToMidi } from '../platform/midi';
import { VoiceListener } from './voice/listener';
import { VoiceController, mountVoiceField } from './voice/controller';
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
import { loadRollSynth, saveRollSynth, loadNewScoreDefaults, loadPdfSetup, loadView, savePdfSetup, saveKeymapPreset, saveLastOpened, saveNewScoreDefaults, saveView, loadMetronome, saveMetronome, loadZoom, saveZoom, ZOOM_MAX, ZOOM_MIN } from './preferences';
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
  readonly symbolsButton: HTMLElement;
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
const WITHOUT_DOCUMENT = new Set<string>(['file.new', 'file.open', 'library.toggle', 'view.help', 'view.voiceTest']);

const isInside = (root: string, path: string): boolean => {
  const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
  return norm(path).startsWith(`${norm(root).replace(/\/$/, '')}/`);
};

/** Notation size in percent of Verovio's default. */
const SCALE = 55;
/** Clicks this close (px) to a symbol still hit it, e.g. inside a hollow notehead. */
const HIT_TOLERANCE = 10;
/** Lower case without accents, so "Oktave" finds "oktaVe" and "ue" is not needed for "ü". */
const foldForSearch = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ß/g, 'ss').trim();

/** MIDI keys pressed within this time after the first one count as one chord. */
const CHORD_WINDOW_MS = 60;
/** A redraw that takes longer than this (ms) makes the following ones wait (see `update`). */
const SLOW_REDRAW_MS = 60;
/** How close (px) the pointer must be to a placed sign to pick it up. */
const SIGN_TOLERANCE = 6;

/** A sign of the library being dragged: from the palette (no `from`) or picked up from where it sits in the score. */
type SignDrag =
  | { kind: 'note'; id: string; glyph: string; from?: { ref: VoiceRef; eventId: string }; where?: undefined }
  | { kind: 'bar'; id: string; glyph: string; from?: Fraction; /** The measure (and side of its barline) the sign was seen at. */ where?: { measure: number; side?: 'left' | 'right' } };
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
  /** Space is held: a click in the notation plays from there instead of selecting. */
  private readonly symbols: SymbolPalette;
  /** The record button is on: speech and the MIDI keyboard are being listened to. */
  private recording = false;
  private voiceListener: VoiceListener | null = null;
  private midiListener: MidiListener | null = null;
  /** When the first key of the current MIDI chord was pressed (ms), to tell chords from single notes. */
  private chordStart = -Infinity;
  /** How the music being played maps back onto the written score (repeats, jumps). */
  private playMap: PlayMap = { score: undefined as never, fromScore: (t) => t, toScore: (t) => t };
  private spaceHeld = false;
  /** A click happened while Space was held, so letting go must not also trigger Space's own command. */
  private spaceUsed = false;
  private pendingSpace: { command: CommandId | UiCommandId; arg: number } | null = null;
  /** The click that ends a drag must not select something else. */
  private swallowClick = false;
  private autosaveTimer = 0;
  private readonly player: Player;
  private readonly synth: Synth;
  private readonly transport: Transport;
  /** What was last heard for editing feedback (the score and the preview note), to hear only what changed. */
  private heardScore: Score | null = null;
  private lastAudition = 0;
  /** Events drawn blue because they sound right now, and the page nodes of the events (per engraving). */
  private lastRedrawMs = 0;
  private lastRedrawEnd = 0;
  private redrawTimer = 0;
  /** What Strg+C / Strg+X took (kept here, not in the undo history). */
  private clip: Clip | null = null;
  /** The marked passage is being played in a loop. */
  private loopingRange = false;
  /** A placed sign that was clicked: Backspace takes it away, dragging moves it. */
  private selectedSign: SignDrag | null = null;
  private litEvents = new Set<string>();
  /** The lyrics field: type the text, then click syllable and notes (ADR 0029). */
  private readonly lyrics: LyricsPanel;
  private eventNodes: { readonly result: MeiResult; readonly nodes: Map<string, Element[]> } | null = null;
  private readonly spanCache = new WeakMap<Score, { readonly id: string; readonly a: number; readonly b: number }[]>();
  private loop = false;
  /** The metronome click during playback (remembered). */
  private metronome = loadMetronome();
  /** Size of the notation in percent. */
  private zoom = loadZoom();
  private renderedZoom = 0;
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
          exportPdf: (scores, title) => this.exportPdf(scores, title),
          exportScore: (score, kind) => this.exportScoreAs(score, kind),
          relocated: (from, to) => this.relocated(from, to),
          closedByTrash: () => this.closeDocument(),
          ...(updates ? { checkForUpdates: () => updates.checkNow() } : {}),
        })
      : null;
    this.shape = new CurvePopup(this.gestureHost());
    this.buildNotationBar();
    this.synth = new Synth((message) => this.say(message));
    this.synth.sustained = loadRollSynth();
    this.player = new Player({
      frame: (seconds) => {
        // The music may be played in another order than written (repeats): show the bar that sounds.
        this.playPos = this.playMap.toScore(timeAt(this.state.score, seconds));
        this.renderPlayhead();
      },
      stopped: () => {
        this.loopingRange = false;
        this.update();
      },
      error: (message) => this.history.apply({ ...this.state, message }),
      notice: (message) => {
        this.history.apply({ ...this.state, message });
        this.renderStatus();
      },
    }, this.synth);
    this.player.setMetronome(this.metronome);
    this.symbols = new SymbolPalette({
      insert: (kind, index) => this.insertSign(kind, index),
      drag: (kind, index, glyph, e) => this.beginSignDrag(kind === 'note' ? { kind, glyph, id: NOTE_SYMBOLS[index]!.id } : { kind, glyph, id: BAR_SIGNS[index]!.id }, e),
    });
    document.body.append(this.symbols.el);
    this.lyrics = new LyricsPanel({
      existingText: () => lyricsText(this.state) ?? '',
      applyAll: (text) => {
        if (!text) return;
        this.history.apply(setLyrics(this.state, text));
        this.update();
      },
    });
    document.body.append(this.lyrics.el);
    this.transport = new Transport(el.transport, {
      play: () => this.togglePlay(),
      stop: () => (this.player.active ? this.player.stop() : this.seek(ZERO)),
      toStart: () => this.seek(ZERO),
      toggleRecord: () => void this.toggleRecord(),
      step: (direction) => this.stepBar(direction),
      toggleLoop: () => {
        this.loop = !this.loop;
        this.player.setLoop(this.loop);
        return this.loop;
      },
      toggleMetronome: () => this.flipMetronome(),
      setTempo: (bpm) => this.setTempo(bpm),
      beginTempoDrag: () => this.history.beginGesture(),
      endTempoDrag: (commit) => {
        if (commit) this.history.commitGesture();
        else this.history.cancelGesture();
        this.update();
      },
      openKeys: (anchor) => this.openKeys(anchor),
      openSettings: () => void this.scoreSettings(),
    });
    // Spoken commands (plan "Sprachbefehle"): for now only the stand-in source – text field in test mode, `window.__voiceHear`.
    const voice = currentVoice();
    const voiceController = new VoiceController(
      {
        run: (command, arg) => this.run(command, arg),
        say: (message) => {
          this.history.apply({ ...this.state, message });
          this.renderStatus();
        },
        ready: () => !this.empty && !isDialogOpen() && !this.busy && !this.player.active,
      },
      voice,
    );
    this.voiceListener = new VoiceListener(
      (text, confidence) => voiceController.hear(text, confidence),
      (message) => this.say(message),
      () => this.recording && !this.player.active,
    );
    if (voiceTestEnabled()) mountVoiceField((text) => voice.hear(text, 1));
    el.rollButton.addEventListener('click', () => this.run('view.roll'));
    el.symbolsButton.addEventListener('click', () => this.run('view.symbols'));
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
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => this.releaseSpace());
    el.pages.addEventListener('click', (e) => this.onClick(e));
    el.pages.addEventListener('dblclick', (e) => this.onDoubleClick(e));
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

  /** Space let go: if it was only tapped, its own command (e.g. Logic's rest) happens now. */
  private onKeyUp(e: KeyboardEvent): void {
    if (e.code !== 'Space') return;
    if (this.spaceHeld) e.preventDefault(); // no click on a focused button when Space is let go
    const pending = this.pendingSpace;
    const used = this.spaceUsed;
    this.releaseSpace();
    if (pending && !used) this.run(pending.command, pending.arg);
  }

  private releaseSpace(): void {
    this.spaceHeld = false;
    this.spaceUsed = false;
    this.pendingSpace = null;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.code === 'Space' && !e.repeat && !isDialogOpen() && !this.busy && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
      this.spaceHeld = true;
      this.spaceUsed = false;
      e.preventDefault(); // Space belongs to the editor, not to whichever button has the focus
    }
    if (isDialogOpen() || this.busy) return;
    if (e.code === 'Space' && this.spaceHeld && this.player.active && !e.repeat) {
      // Like in Finale: the space bar stops a running playback right away; letting go then does nothing more.
      this.spaceUsed = true;
      this.pendingSpace = null;
      this.player.stop();
      return;
    }
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
    if (this.selectedSign && !helpOpen && !this.library?.isOpen) {
      if (combo === 'Backspace' || combo === 'Delete') {
        e.preventDefault();
        return this.removeSelectedSign();
      }
      if (combo === 'Escape') {
        e.preventDefault();
        this.selectedSign = null;
        return this.update();
      }
      if (combo) this.selectedSign = null; // any other key lets go of the sign: Backspace then works on notes again
    }
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
      // Typing in the search field (also "?") is not a command.
      if (e.target instanceof HTMLInputElement && combo !== 'Escape' && combo !== 'F1') return;
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
    if (combo === 'Space') {
      // Space can also be held while clicking (play from there), so its command waits until the key is let go.
      if (!e.repeat) this.pendingSpace = { command: binding.command, arg: binding.arg ?? 0 };
      return;
    }
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
        this.el.help.querySelector<HTMLInputElement>('.help__search')?.focus();
        return;
      case 'view.roll':
        this.toggleRoll();
        return;
      case 'play.toggle':
        this.togglePlay();
        return;
      case 'file.exportXml':
        void this.fileExportXml();
        return;
      case 'play.record':
        void this.toggleRecord();
        return;
      case 'play.loopRange':
        this.toggleRangeLoop();
        return;
      case 'play.metronome':
        this.flipMetronome();
        this.renderTransport();
        return;
      case 'play.cycle':
        this.cycle();
        return;
      case 'view.zoom':
        this.zoomBy(arg ?? 0);
        return;
      case 'edit.transpose':
        void this.transpose();
        return;
      case 'edit.copy': {
        const clip = copyClip(this.state);
        if (!clip) return this.say('Erst eine Note oder einen Bereich markieren, dann kopieren.');
        this.clip = clip;
        const notes = clip.voices.reduce((n, v) => n + v.length, 0);
        return this.say(`${notes} ${notes === 1 ? 'Note' : 'Noten'} kopiert – mit Strg+V einfügen.`);
      }
      case 'edit.cut': {
        const cut = cutClip(this.state);
        if (!cut) return this.say('Erst eine Note oder einen Bereich markieren, dann ausschneiden.');
        this.clip = cut.clip;
        this.history.apply({ ...cut.state, message: 'Ausgeschnitten – mit Strg+V einfügen.' });
        this.update();
        return;
      }
      case 'edit.paste':
        if (!this.clip) return this.say('Die Zwischenablage ist leer – erst kopieren oder ausschneiden.');
        this.history.apply(pasteClip(this.state, this.clip));
        this.update();
        return;
      case 'view.voiceTest':
        void import('./voice/voiceTest').then(({ voiceTestDialog }) => voiceTestDialog(this.platform));
        return;
      case 'view.symbols':
        this.symbols.toggle();
        this.update();
        return;
      case 'file.extractPart':
        void this.fileExtractPart();
        return;
      case 'file.exportMidi':
        void this.exportScoreAs(this.history.committed.score, 'midi');
        return;
      case 'file.print':
        this.printScore();
        return;
      case 'edit.quantize':
        void this.quantizeDialog();
        return;
      case 'file.exportPdf':
        void this.exportPdf([this.history.committed.score], this.history.committed.score.title);
        return;
      case 'text.lyrics':
        this.lyrics.toggle();
        return;
      case 'text.chord':
        void this.editChord();
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

  /** MusicXML, MIDI or a recording → a new score in the library (ADR 0017, 0028); what could not be taken over is listed. */
  async fileImport(): Promise<void> {
    if (!(await this.confirmDiscard())) return this.update();
    const file = await this.withBusy(() => this.platform.pickImport(), 'Datei konnte nicht geöffnet werden');
    if (!file) return this.update();
    let result: ImportResult | null;
    try {
      result = await convertImport(file);
    } catch (err) {
      const reason = err instanceof ImportError ? err.message : 'Unerwarteter Fehler: ' + errorText(err);
      await inform('„' + file.name + '“ konnte nicht importiert werden', reason);
      return this.update();
    }
    if (!result) return this.update();
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

  /** One instrument of the open score as a new score in the library (ADR 0023). */
  async fileExtractPart(): Promise<void> {
    if (this.empty) return;
    const score = this.history.committed.score;
    if (score.parts.length < 2) {
      await inform('Nur ein Instrument', 'Diese Partitur hat nur ein Instrument – eine Einzelstimme würde ihr gleichen.');
      return this.update();
    }
    const choice = await ask({
      title: 'Einzelstimme herausziehen',
      text: 'Welches Instrument soll als eigene Partitur angelegt werden? Die ursprüngliche Partitur bleibt unverändert.',
      buttons: [...score.parts.map((p) => ({ id: p.id, label: p.name })), { id: '', label: 'Abbrechen' }],
      cancel: '',
    });
    if (!choice) return this.update();
    const part = extractPart(score, choice);
    if (!(await this.confirmDiscard())) return this.update();
    let location: DocumentLocation | null = null;
    if (this.store) {
      const collection = this.library?.isOpen ? this.library.collection : this.currentCollection;
      const path = await this.withBusy(() => this.store!.createScore(part, collection), 'Partitur konnte nicht angelegt werden');
      if (!path) return this.update();
      saveLastOpened(path);
      location = { path, inLibrary: true };
    }
    this.load({ ...createEditorState(part), message: 'Einzelstimme angelegt: ' + part.title }, location);
  }

  /** One or several scores as a PDF of A4 pages (ADR 0023). */
  async exportPdf(scores: readonly Score[], title: string): Promise<void> {
    const setup = await pdfDialog({ title: scores.length > 1 ? 'Als PDF speichern: ' + title : 'Als PDF speichern', scoreCount: scores.length, initial: loadPdfSetup() });
    if (!setup) return this.update();
    savePdfSetup(setup);
    let pdf: Uint8Array;
    try {
      pdf = await this.withBusy(() => scoresToPdf(this.engraver, scores, setup, title), 'PDF konnte nicht erzeugt werden') ?? new Uint8Array();
    } catch (err) {
      await inform('PDF nicht möglich', errorText(err));
      return this.update();
    }
    if (pdf.length === 0) return this.update();
    const base = preferredFileName(title).replace(/[.][^.]+$/, '');
    const saved = await this.withBusy(() => this.platform.exportFile(pdf, base, { name: 'PDF', extension: 'pdf', mime: 'application/pdf' }), 'PDF konnte nicht gespeichert werden');
    if (saved) this.history.apply({ ...this.state, message: 'PDF gespeichert: ' + saved.name });
    this.update();
  }

  /** One score as a file of the kind chosen in the library's export menu. */
  async exportScoreAs(score: Score, kind: ExportChoice): Promise<void> {
    if (kind === 'pdf') return this.exportPdf([score], score.title);
    if (kind === 'musicxml') return this.exportXmlOf(score);
    const base = preferredFileName(score.title).replace(/[.][^.]+$/, '');
    try {
      const saved =
        kind === 'midi'
          ? await this.withBusy(() => this.platform.exportFile(exportMidi(score), base, { name: 'MIDI', extension: 'mid', mime: 'audio/midi' }), 'MIDI konnte nicht gespeichert werden')
          : await this.withBusy(() => this.platform.exportFile(serializeScore(score, APP_VERSION), base, { name: 'Icastico-Partitur', extension: FILE_EXTENSION, mime: 'application/x-icastico' }), 'Datei konnte nicht gespeichert werden');
      if (saved) this.history.apply({ ...this.state, message: 'Exportiert: ' + saved.name });
    } catch (err) {
      await inform('Export nicht möglich', errorText(err));
    }
    this.update();
  }

  /** The open score as a MusicXML file (ADR 0021). */
  async fileExportXml(): Promise<void> {
    if (this.empty) return;
    return this.exportXmlOf(this.history.committed.score);
  }

  private async exportXmlOf(score: Score): Promise<void> {
    let result: ExportResult;
    try {
      result = exportMusicXml(score, APP_VERSION);
    } catch (err) {
      await inform('Export nicht möglich', errorText(err));
      return this.update();
    }
    const base = preferredFileName(score.title).replace(/[.][^.]+$/, '');
    const saved = await this.withBusy(
      () => this.platform.exportFile(result.xml, base, { name: 'MusicXML', extension: 'musicxml', mime: 'application/vnd.recordare.musicxml+xml' }),
      'Export fehlgeschlagen',
    );
    if (!saved) return this.update();
    this.history.apply({ ...this.state, message: 'Exportiert: ' + saved.name });
    this.update();
    if (result.notes.length > 0) await inform('Export abgeschlossen', '„' + saved.name + '“ ist gespeichert. Nicht alles ließ sich schreiben:\n\n- ' + result.notes.join('\n- '));
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

  /** The chord symbol at the caret / selected note – an undoable change (ADR 0019). */
  private async editChord(): Promise<void> {
    const start = chordSymbolText(this.state);
    if (start === null) {
      this.history.apply({ ...this.state, message: 'Erst eine Note auswählen, dann K drücken.' });
      return this.update();
    }
    const text = await promptText({
      title: 'Akkordsymbol',
      label: 'Zum Beispiel Am7, C/G, Fmaj7. Leer lassen, um es zu löschen.',
      value: start,
      confirm: 'Übernehmen',
    });
    if (text !== null) this.history.apply(setChordSymbol(this.state, text));
    this.update();
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
        parts: score.parts.map((p) => ({ id: p.id, name: p.name, instrument: p.instrument, tab: p.tab === true })),
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

  /** The circle of fifths below the key display: the chosen key counts from the bar of the selection (an undoable change). */
  private openKeys(anchor: HTMLElement): void {
    if (this.empty) return;
    const score = this.state.score;
    const time = this.focusTime();
    const measures = measuresOf(score, 1, time);
    const here = measures.find((m) => le(m.start, time) && lt(time, m.end)) ?? measures[0]!;
    const fromMeasure = Math.max(1, here.number);
    openKeyPicker(anchor, keyAt(score, here.number <= 1 ? ZERO : here.start), {
      transpose: () => void this.transpose(),
      pick: (fifths) => {
        const result = applyScoreChanges(this.state.score, { fifths, fromMeasure });
        if ('error' in result) this.history.apply({ ...this.state, message: result.error });
        else if (result.score !== this.state.score) {
          this.history.apply({ ...this.state, score: result.score, message: `Tonart ${germanKeyName(fifths)}${fromMeasure > 1 ? ` ab Takt ${fromMeasure}` : ''}` });
        }
        this.update();
      },
    });
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
    if (this.spaceHeld) return this.playFromClick(e);
    if (e.shiftKey) return; // Shift + click marks a passage (see onClick), it does not pick a note up
    const sign = this.signUnder(e);
    if (sign) return this.beginSignDrag(sign, e); // a placed sign is picked up, not the note next to it
    const ref = this.hitTest(e);
    if (!ref) return this.beginFrame(e); // empty paper: dragging draws a frame that marks the notes inside
    if (!ref.eventId) return;
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

  // ── Special signs: double click and drag and drop (ADR 0024) ──────────────

  /** Double click in the palette: the sign goes on the selected note / its bar, unless it is there already. */
  private insertSign(kind: PaletteKind, index: number): void {
    if (this.empty) return;
    if (kind === 'group') return this.run('mark.group', index); // the same button again takes the bracket off
    const id = kind === 'note' ? NOTE_SYMBOLS[index]!.id : BAR_SIGNS[index]!.id;
    const at = signsAtFocus(this.state);
    if ((kind === 'note' ? at.note : at.bar).includes(id)) {
      this.history.apply({ ...this.state, message: 'Dieses Zeichen ist schon da. Zum Wegnehmen: Strg+Z oder an eine andere Stelle ziehen.' });
      return this.update();
    }
    this.run(kind === 'note' ? 'mark.toggle' : 'mark.bar', index);
  }

  /** The sign of the library under the pointer in the score, with where it sits (so it can be moved), or null. */
  private signUnder(e: PointerEvent): SignDrag | null {
    const direct = this.signOf(e.target as Element | null, e.clientX);
    if (direct) return direct;
    // Signs are small and mostly hollow (a fermata is an arc): a pointer just beside one still picks it up – unless it is on a note.
    const elements = this.result?.elements;
    for (let n = e.target as Element | null; n && n !== this.el.pages; n = n.parentElement) if (elements?.has(n.id)) return null;
    let best: Element | null = null;
    let bestDistance = SIGN_TOLERANCE;
    for (const candidate of this.el.pages.querySelectorAll('g.dynam, g.hairpin, g.fermata, g.trill, g.mordent, g.turn, g.dir, g.breath, g.caesura, g.arpeg, g.barLine, g.voltaBracket')) {
      const r = candidate.getBoundingClientRect();
      const d = Math.hypot(Math.max(r.left - e.clientX, 0, e.clientX - r.right), Math.max(r.top - e.clientY, 0, e.clientY - r.bottom));
      if (d <= bestDistance) {
        best = candidate;
        bestDistance = d;
      }
    }
    return this.signOf(best, e.clientX);
  }

  /** The bar sign a barline or a volta bracket stands for (only barlines that carry a sign count). */
  private barlineSign(el: Element, clientX: number): SignDrag | null {
    const score = this.state.score;
    const measureEl = el.closest('.measure') ?? [...this.el.pages.querySelectorAll('.measure')].find((m) => {
      const r = m.getBoundingClientRect();
      return clientX >= r.left && clientX <= r.right;
    });
    const number = /^m(\d+)$/.exec(measureEl?.id ?? '')?.[1];
    const bar = number === undefined ? undefined : measuresOf(score, 1).find((b) => b.number === Number(number));
    if (!measureEl || !bar) return null;
    const kinds = (score.marks ?? []).filter((m) => eq(m.at, bar.start)).map((m) => m.kind as string);
    let kind: string | undefined;
    let side: 'left' | 'right' | undefined;
    if (el.classList.contains('voltaBracket')) {
      kind = kinds.find((k) => voltaNumber(k) > 0);
    } else {
      const box = measureEl.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      side = (r.left + r.right) / 2 < (box.left + box.right) / 2 ? 'left' : 'right';
      kind = side === 'left' ? kinds.find((k) => k === 'repeatStart') : kinds.find((k) => barSign(k)?.exclusive === 'rightbar');
    }
    const def = kind ? barSign(kind) : undefined;
    return kind && def ? { kind: 'bar', id: kind, glyph: def.glyph, from: bar.start, where: { measure: bar.number, ...(side ? { side } : {}) } } : null;
  }

  /** The drawn element of a placed sign (after a redraw), so it can be shown as selected. */
  private signNode(sign: SignDrag): Element | null {
    const page = this.el.pages;
    if (sign.kind === 'note') {
      const eventId = sign.from?.eventId;
      const prefix = { dynamic: 'dyn', hairpin: 'hp', fermata: 'fer', trill: 'trl', mord: 'mor', prall: 'pra', turn: 'trn', breath: 'brt', caesura: 'cae', arpeggio: 'arp' } as Record<string, string>;
      const symbol = noteSymbol(sign.id);
      const key = symbol && (symbol.group === 'dynamic' || symbol.group === 'hairpin' ? symbol.group : sign.id);
      if (eventId && key && prefix[key]) return document.getElementById(`${prefix[key]}-${eventId}`);
      if (eventId && symbol?.group === 'articulation') {
        const events = this.state.score.parts.flatMap((p) => p.voices.flatMap((v) => v.events));
        const marks = (events.find((e) => e.id === eventId)?.marks ?? []).filter((m) => noteSymbol(m)?.group === 'articulation');
        const ids = [...(this.result?.elements ?? [])].filter(([, r]) => r.eventId === eventId && r.kind !== 'chordNote').map(([id]) => id);
        const note = ids.map((id) => document.getElementById(id)).find((n) => n?.querySelector('.artic'));
        return note ? (note.querySelectorAll('.artic')[marks.indexOf(sign.id)] ?? null) : null;
      }
      return null;
    }
    const measures = measuresOf(this.state.score, 1);
    const mi = measures.findIndex((m) => sign.from !== undefined && eq(m.start, sign.from as Fraction));
    if (sign.id === 'segno' || sign.id === 'coda') return document.getElementById(`${sign.id}-${mi}`);
    if (barSign(sign.id)?.text) return document.getElementById(`dir-${sign.id}-${mi}`);
    const measure = sign.where ? page.querySelector(`#m${sign.where.measure}`) : null;
    if (!measure) return null;
    if (voltaNumber(sign.id) > 0) {
      const box = measure.getBoundingClientRect();
      return [...page.querySelectorAll('.voltaBracket')].find((v) => { const r = v.getBoundingClientRect(); return r.left <= box.right && r.right >= box.left; }) ?? null;
    }
    const lines = [...measure.querySelectorAll(':scope > .barLine')];
    return sign.where?.side === 'left' ? lines[0] ?? null : lines[lines.length - 1] ?? null;
  }

  /** Backspace / Delete on a selected placed sign. */
  private removeSelectedSign(): void {
    const sign = this.selectedSign;
    if (!sign) return;
    this.selectedSign = null;
    if (sign.kind === 'note' && sign.from) this.history.apply(eraseNoteSign(this.state, sign.id, sign.from));
    else if (sign.kind === 'bar' && sign.from) this.history.apply(eraseBarSign(this.state, sign.id, sign.from as Fraction));
    this.update();
  }

  /** The sign that `start` (an SVG element, or one inside it) draws, if it is one. */
  private signOf(start: Element | null, clientX = 0): SignDrag | null {
    const score = this.state.score;
    const noteSign = (eventId: string, pick: (marks: readonly string[]) => string | undefined): SignDrag | null => {
      for (const ref of allVoiceRefs(score)) {
        const event = getVoice(score, ref).voice.events.find((x) => x.id === eventId);
        const id = event && pick(event.marks ?? []);
        if (event && id) return { kind: 'note', id, glyph: noteSymbol(id)!.glyph, from: { ref, eventId } };
      }
      return null;
    };
    for (let n = start; n && n !== this.el.pages; n = n.parentElement) {
      if (n.classList.contains('barLine') || n.classList.contains('voltaBracket')) {
        const found = this.barlineSign(n, clientX);
        if (found) return found;
      }
      const hit = /^(dyn|fer|trl|mor|pra|trn|hp|brt|cae|arp)-(.+)$/.exec(n.id);
      if (hit) {
        const wanted = { dyn: 'dynamic', hp: 'hairpin', fer: 'fermata', trl: 'trill', mor: 'mord', pra: 'prall', trn: 'turn', brt: 'breath', cae: 'caesura', arp: 'arpeggio' }[hit[1] as 'dyn'];
        return noteSign(hit[2]!, (marks) => marks.find((m) => noteSymbol(m)?.group === wanted || m === wanted));
      }
      const bar = /^(?:(segno|coda)|dir-(\w+))-(\d+)$/.exec(n.id);
      if (bar) {
        const kind = bar[1] ?? bar[2]!;
        const start = measuresOf(score, Number(bar[3]) + 1)[Number(bar[3])]?.start;
        if (start && barSign(kind)) return { kind: 'bar', id: kind, glyph: barSign(kind)!.glyph, from: start };
      }
      if (n.classList.contains('artic')) {
        // Articulations are drawn inside their note, in the order of its marks.
        const note = n.closest('.note, .chord');
        const eventId = note && this.result?.elements.get(note.id)?.eventId;
        const position = note ? [...note.querySelectorAll('.artic')].indexOf(n) : -1;
        if (eventId && position >= 0) return noteSign(eventId, (marks) => marks.filter((m) => noteSymbol(m)?.group === 'articulation')[position]);
      }
    }
    return null;
  }

  /** A sign follows the pointer; where it is let go of on the score, it is put on that note / bar. */
  private beginSignDrag(sign: SignDrag, e: PointerEvent): void {
    if (e.button !== 0 || this.empty) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let ghost: HTMLElement | null = null;
    let lit: Element | null = null;
    const light = (target: Element | null) => {
      if (lit === target) return;
      lit?.classList.remove('is-sign-target');
      target?.classList.add('is-sign-target');
      lit = target;
    };
    const move = (m: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(m.clientX - startX, m.clientY - startY) < 5) return;
        ghost = document.createElement('div');
        ghost.className = 'sign-ghost';
        ghost.textContent = sign.glyph;
        document.body.append(ghost);
      }
      ghost.style.transform = `translate(${m.clientX + 10}px, ${m.clientY + 10}px)`;
      const hit = this.el.pages.contains(m.target as Node) ? this.hitEntry(m) : undefined;
      light(hit && (sign.kind === 'bar' || hit[1].eventId) ? document.getElementById(hit[0]) : null);
    };
    const end = (up: PointerEvent | null) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      light(null);
      if (!ghost) {
        // Never moved: a click on a placed sign selects it (Backspace takes it away) – the note beside it stays as it was.
        if (sign.from !== undefined && up) {
          this.selectedSign = sign;
          this.swallowClick = true;
          window.setTimeout(() => (this.swallowClick = false), 80);
          this.update();
        }
        return;
      }
      this.selectedSign = null;
      ghost.remove();
      this.swallowClick = true;
      window.setTimeout(() => (this.swallowClick = false), 80);
      if (up && this.el.pages.contains(up.target as Node)) this.dropSign(sign, up);
    };
    const cancel = () => end(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
  }

  private dropSign(sign: SignDrag, e: PointerEvent): void {
    const ref = this.hitTest(e);
    if (!ref) return;
    if (sign.kind === 'note') {
      if (!ref.eventId) {
        this.history.apply({ ...this.state, message: 'Dieses Zeichen gehört an eine Note, nicht an eine Pause.' });
        return this.update();
      }
      this.history.apply(dropNoteSign(this.state, sign.id, { ref: { partId: ref.partId, voiceId: ref.voiceId }, eventId: ref.eventId }, sign.from));
    } else {
      const bar = measuresOf(this.state.score, 1, ref.onset).find((m) => m.number === ref.measureNumber);
      if (!bar) return;
      this.history.apply(dropBarSign(this.state, sign.id, bar.start, sign.from));
    }
    this.update();
  }

  /** A drag that starts on empty paper draws a frame; the notes inside it are marked (several notes, whole bars). */
  private beginFrame(e: PointerEvent): void {
    if (e.button !== 0 || this.empty) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let frame: HTMLElement | null = null;
    const rect = (x: number, y: number) => ({ left: Math.min(x, startX), top: Math.min(y, startY), right: Math.max(x, startX), bottom: Math.max(y, startY) });
    const move = (m: PointerEvent) => {
      if (!frame) {
        if (Math.hypot(m.clientX - startX, m.clientY - startY) < 6) return;
        frame = document.createElement('div');
        frame.className = 'frame-select';
        document.body.append(frame);
      }
      const r = rect(m.clientX, m.clientY);
      Object.assign(frame.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px` });
    };
    const end = (up: PointerEvent | null) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      if (!frame) return;
      frame.remove();
      this.swallowClick = true;
      window.setTimeout(() => (this.swallowClick = false), 80);
      if (up) this.markInside(rect(up.clientX, up.clientY));
    };
    const cancel = () => end(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
  }

  /** Marks the notes whose drawing touches the frame: the first one found decides which line (and voice) it is about. */
  private markInside(r: { left: number; top: number; right: number; bottom: number }): void {
    const elements = this.result?.elements;
    if (!elements) return;
    const hits: { id: string; ref: ElementRef }[] = [];
    for (const [id, ref] of elements) {
      if (!ref.eventId || ref.kind === 'chordNote') continue;
      const b = document.getElementById(id)?.getBoundingClientRect();
      if (b && b.right >= r.left && b.left <= r.right && b.bottom >= r.top && b.top <= r.bottom) hits.push({ id, ref });
    }
    if (hits.length === 0) {
      this.history.apply({ ...this.state, range: null, selection: this.state.caret ? this.state.selection : null, message: null });
      return this.update();
    }
    hits.sort((a, b) => (lt(a.ref.onset, b.ref.onset) ? -1 : eq(a.ref.onset, b.ref.onset) ? 0 : 1));
    const first = hits[0]!.ref;
    const same = hits.filter((h) => h.ref.partId === first.partId && h.ref.voiceId === first.voiceId);
    this.history.apply(markFromTo(this.state, { partId: first.partId, voiceId: first.voiceId }, first.eventId!, same[same.length - 1]!.ref.eventId!));
    this.update();
  }

  /** A double click on a bar marks all its notes (on the staff that was clicked). */
  private onDoubleClick(e: MouseEvent): void {
    if (this.empty) return;
    // Blank paper between the staff lines belongs to no drawn shape, so find the bar and the staff by where the pointer is.
    const inside = (el: Element) => {
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12;
    };
    const measureEl = [...this.el.pages.querySelectorAll('.measure')].find(inside);
    const staves = measureEl ? [...measureEl.querySelectorAll(':scope > .staff')] : [];
    const staffEl = staves.find((st) => { const r = st.getBoundingClientRect(); return e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6; });
    const number = /^m([0-9]+)$/.exec(measureEl?.id ?? '')?.[1];
    const bar = number === undefined ? undefined : measuresOf(this.state.score, 1).find((m) => m.number === Number(number));
    const staffN = Number(/^m[0-9]+-s([0-9]+)$/.exec(staffEl?.id ?? '')?.[1] ?? Number.NaN);
    const slot = this.result?.staffs.find((s) => s.n === staffN);
    if (!bar || !slot) return;
    const part = this.state.score.parts.find((p) => p.id === slot.partId);
    const voice = part?.voices.find((v) => v.staff === slot.staffIndex && v.events.some((x) => le(bar.start, x.onset) && lt(x.onset, bar.end)));
    if (!part || !voice) return;
    const inBar = voice.events.filter((x) => le(bar.start, x.onset) && lt(x.onset, bar.end));
    this.history.apply(markFromTo(this.state, { partId: part.id, voiceId: voice.id }, inBar[0]!.id, inBar[inBar.length - 1]!.id));
    this.update();
  }

  /** Space + click: play from the clicked symbol; a click beside the staves plays from the start. */
  private playFromClick(e: PointerEvent): void {
    e.preventDefault();
    this.spaceUsed = true;
    this.pendingSpace = null;
    this.swallowClick = true;
    window.setTimeout(() => (this.swallowClick = false), 80);
    const time = this.hitTest(e)?.onset ?? ZERO;
    if (this.player.active) this.player.stop();
    this.playPos = time;
    this.update();
    this.togglePlay();
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
    if (this.selectedSign) {
      this.selectedSign = null; // a click elsewhere lets go of the sign
    }
    const ref = this.hitTest(e);
    const s = this.state;
    if (!ref) {
      if (!s.caret) this.history.apply({ ...s, selection: null, message: null });
      this.update();
      return;
    }
    const voice = { partId: ref.partId, voiceId: ref.voiceId };
    if (e.shiftKey && ref.eventId && s.selection?.kind === 'event') {
      // Shift + click: mark everything from the selected note to this one.
      this.history.apply(rangeTo(s, voice, ref.eventId));
      this.update();
      return;
    }
    const selection = ref.eventId
      ? { kind: 'event' as const, ...voice, eventId: ref.eventId, ...(ref.toneId ? { toneId: ref.toneId } : {}) }
      : { kind: 'gap' as const, ...voice, time: ref.onset };
    const caret = s.caret ? { ...voice, time: ref.onset } : null;
    const base = { ...s, selection, caret, input: { ...s.input, ghost: null }, message: null };
    // With the lyrics field open and a syllable chosen, the click also puts that syllable on the note.
    const syllable = ref.eventId && this.lyrics.assigning ? this.lyrics.take() : null;
    this.history.apply(syllable !== null && ref.eventId ? { ...setLyricOf(base, voice, ref.eventId, syllable), message: syllable === '_' ? 'Silbe entfernt.' : `Silbe „${syllable}“ gesetzt.` } : base);
    this.update();
  }

  /** Direct hit on an SVG shape, else the nearest symbol within HIT_TOLERANCE. */
  private hitTest(e: MouseEvent): ElementRef | undefined {
    return this.hitEntry(e)?.[1];
  }

  /** Like `hitTest`, with the id of the SVG element. */
  private hitEntry(e: MouseEvent): [string, ElementRef] | undefined {
    const elements = this.result?.elements;
    if (!elements) return undefined;
    for (let n = e.target as Element | null; n && n !== this.el.pages; n = n.parentElement) {
      const ref = n.id ? elements.get(n.id) : undefined;
      if (ref) return [n.id, ref];
    }
    let best: [string, ElementRef] | undefined;
    let bestDistance = HIT_TOLERANCE;
    for (const [id, ref] of elements) {
      const r = document.getElementById(id)?.getBoundingClientRect();
      if (!r) continue;
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      const d = Math.hypot(dx, dy);
      if (d <= bestDistance) {
        best = [id, ref];
        bestDistance = d;
      }
    }
    return best;
  }

  // ── Output ───────────────────────────────────────────────────────────────

  /**
   * Redraws everything for the current state. A score that takes long to engrave must not queue up one redraw per key
   * press (holding an arrow key would lock the window for seconds): keys arriving right after a slow redraw only change
   * the model and the status; one redraw with the newest state follows a moment later.
   */
  private update(): void {
    const slow = this.lastRedrawMs > SLOW_REDRAW_MS;
    if (slow && !this.history.inGesture && performance.now() - this.lastRedrawEnd < this.lastRedrawMs * 1.5) {
      if (!this.redrawTimer) {
        this.redrawTimer = window.setTimeout(() => {
          this.redrawTimer = 0;
          this.refresh();
        }, this.lastRedrawMs);
      }
      this.auditionEdits();
      this.renderTransport();
      this.renderStatus();
      return;
    }
    window.clearTimeout(this.redrawTimer);
    this.redrawTimer = 0;
    this.refresh();
  }

  private refresh(): void {
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
    this.auditionEdits();
    this.decorate();
    this.renderTransport();
    this.renderStatus();
    this.scheduleAutosave();
    this.shape.refresh();
    this.el.symbolsButton.setAttribute('aria-pressed', String(this.symbols.isOpen));
    if (this.symbols.isOpen) {
      const at = signsAtFocus(this.state);
      this.symbols.refresh(at.note, at.bar, at.group);
    }
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
      hearKey: (midi, partId) => {
        const part = this.state.score.parts.find((p) => p.id === partId);
        if (part && !this.player.active) this.hear([midi], part.instrument);
      },
      synthOn: () => this.synth.sustained,
      toggleSynth: () => this.toggleRollSynth(),
      select: (selection, caretTime) => {
        const s = this.state;
        const caret = s.caret && selection && caretTime ? { partId: selection.partId, voiceId: selection.voiceId, time: caretTime } : s.caret;
        if (!selection && s.caret) return;
        this.history.apply({ ...s, selection, caret, input: { ...s.input, ghost: null }, message: null });
        this.update();
      },
      activate: () => this.activateLane(lane),
    };
  }

  // ── Record button: speech and MIDI keyboard ──────────────────────────────

  private say(message: string): void {
    this.history.apply({ ...this.state, message });
    this.renderStatus();
  }

  /** Starts / stops listening to the microphone (spoken commands) and to a MIDI keyboard (played notes). */
  private async toggleRecord(): Promise<void> {
    if (this.recording) return this.stopRecording();
    if (this.empty) return;
    this.recording = true;
    this.renderTransport();
    this.say('● Aufnahme: Sprache und MIDI-Keyboard werden vorbereitet …');
    const problems: string[] = [];
    const started: string[] = [];
    await Promise.all([
      this.voiceListener!.start().then(
        () => started.push('Sprache'),
        (err) => problems.push(err instanceof Error ? err.message : String(err)),
      ),
      listenToMidi((note) => this.midiNote(note.pitch)).then(
        (midi) => {
          this.midiListener = midi;
          started.push(midi.inputs.length ? `MIDI (${midi.inputs.join(', ')})` : 'MIDI (noch kein Keyboard angeschlossen)');
        },
        (err) => problems.push(err instanceof Error ? err.message : String(err)),
      ),
    ]);
    if (!this.recording) return this.stopSources(); // switched off again while it was starting
    if (started.length === 0) {
      this.recording = false;
      this.renderTransport();
    }
    this.say(started.length ? `● Aufnahme: hört zu – ${started.join(' und ')}.${problems.length ? ' Nicht möglich: ' + problems.join(' ') : ''}` : `Aufnahme nicht möglich: ${problems.join(' ')}`);
  }

  private stopRecording(): void {
    this.recording = false;
    this.stopSources();
    this.renderTransport();
    this.say('Aufnahme aus.');
  }

  private stopSources(): void {
    this.voiceListener?.stop();
    this.midiListener?.stop();
    this.midiListener = null;
  }

  /** A key of the MIDI keyboard: a note at the caret; keys pressed within 60 ms of the first join it as a chord. */
  private midiNote(pitch: number): void {
    if (!this.recording || this.empty || isDialogOpen() || this.busy) return;
    const now = performance.now();
    const together = now - this.chordStart < CHORD_WINDOW_MS;
    if (!together) this.chordStart = now;
    this.run(together ? 'input.midiAdd' : 'input.midi', pitch);
  }

  // ── Playback ─────────────────────────────────────────────────────────────

  /** The "Transponieren" dialog: toggle chromatic / diatonic, interval wheel; an undoable change. */
  private async transpose(): Promise<void> {
    if (this.empty) return;
    const scope = transposeScope(this.state);
    const spec = await transposeDialog({ scope: scope.label, wholePiece: scope.wholePiece });
    if (spec) this.history.apply(transposeSelection(this.state, spec));
    this.update();
  }

  /** Metronome on / off; while the music plays it goes on from where it is, with or without the click. */
  private flipMetronome(): boolean {
    this.metronome = !this.metronome;
    saveMetronome(this.metronome);
    this.player.setMetronome(this.metronome);
    this.say(this.metronome ? 'Metronom an: bei der Wiedergabe klickt es auf jedem Schlag.' : 'Metronom aus.');
    if (this.player.active && !this.loopingRange) this.seek(this.playPos);
    return this.metronome;
  }

  /** Prints the score: the pages go into a hidden sheet that only the print layout shows, then the system's print dialog opens. */
  private printScore(): void {
    if (this.empty) return;
    try {
      document.getElementById('print-root')?.remove();
      const root = document.createElement('div');
      root.id = 'print-root';
      for (const svg of printPages(this.engraver, this.history.committed.score, { ...loadPdfSetup(), pack: false })) {
        const page = document.createElement('div');
        page.className = 'print-page';
        page.innerHTML = svg;
        root.append(page);
      }
      document.body.append(root);
      window.addEventListener('afterprint', () => root.remove(), { once: true });
      window.print();
    } catch (err) {
      this.say(`Drucken ging nicht: ${errorText(err)}`);
    }
  }

  /** Quantise (Q): asks for the finest note value, then rounds the marked passage (or the selected voice) to it. */
  private async quantizeDialog(): Promise<void> {
    if (this.empty) return;
    const choice = await ask({
      title: 'Quantisieren',
      text: 'Anfang und Länge der markierten Noten (ohne Markierung: der ganzen gewählten Zeile) auf einen Notenwert runden. Triolen werden erkannt. Wähle den kleinsten Notenwert:',
      buttons: [
        { id: '8', label: 'Achtel' },
        { id: '16', label: 'Sechzehntel', primary: true },
        { id: '32', label: '32tel' },
        { id: 'no', label: 'Abbrechen' },
      ],
      cancel: 'no',
    });
    if (choice !== 'no') this.history.apply(quantizeEvents(this.state, { subdivision: Number(choice) as Subdivision, triplets: true }));
    this.update();
  }

  /** Notation bigger (+1) or smaller (−1) in steps of 10 %; 0 = normal size. */
  private zoomBy(direction: number): void {
    const next = direction === 0 ? 100 : Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoom + Math.sign(direction) * 10));
    if (next === this.zoom) {
      this.say(direction === 0 ? 'Die Notenschrift hat schon die normale Größe.' : `Die Notenschrift ist schon ${this.zoom > 100 ? 'am größten' : 'am kleinsten'} (${this.zoom} %).`);
      return;
    }
    this.zoom = next;
    saveZoom(next);
    this.say(`Notenschrift: ${next} %`);
    this.update();
  }

  /** Cycle (Logic: C): with a marked passage it repeats that, otherwise the whole piece – the same as the repeat button. */
  private cycle(): void {
    if (rangeSpan(this.state)) return this.toggleRangeLoop();
    this.loop = !this.loop;
    this.player.setLoop(this.loop);
    this.say(this.loop ? 'Wiederholen an: die ganze Partitur immer wieder.' : 'Wiederholen aus.');
    this.renderTransport();
  }

  /** Plays the marked passage in a loop; a second press (or Stop) ends it. */
  private toggleRangeLoop(): void {
    if (this.player.active && this.loopingRange) {
      this.player.stop();
      return;
    }
    const span = rangeSpan(this.state);
    if (!span) return this.say('Erst einen Bereich markieren (Alt+Umschalt+Pfeil oder Umschalt + Klick), dann Strg+L.');
    if (this.player.active) this.player.stop();
    const score = this.state.score;
    this.playMap = { score, fromScore: (t) => t, toScore: (t) => t };
    this.loopingRange = true;
    this.playPos = span.from;
    void this.player.start(score, 0, true, { from: secondsOf(score, span.from), to: secondsOf(score, span.to) }).then(() => this.renderTransport());
  }

  private togglePlay(): void {
    if (this.empty) return;
    if (this.player.active) {
      this.player.stop();
      return;
    }
    const score = this.state.score;
    this.playMap = playMapOf(score);
    void this.player.start(this.playMap.score, secondsOf(score, this.playMap.fromScore(this.playPos)), this.loop).then(() => this.renderTransport());
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
    // Without the caret's extra bars: after the last bar there is nothing to step to (it used to jump back to the start).
    const measures = measuresOf(this.state.score, 1);
    const found = measures.findIndex((m) => lt(this.playPos, m.end));
    const index = found < 0 ? measures.length - 1 : found;
    const here = measures[index]!;
    if (direction > 0) {
      const next = measures[index + 1]?.start;
      if (next) return this.seek(next);
      this.history.apply({ ...this.state, message: 'Das ist schon der letzte Takt.' });
      return this.update();
    }
    this.seek(le(this.playPos, here.start) ? (measures[index - 1]?.start ?? ZERO) : here.start);
  }

  private setTempo(bpm: number): void {
    const score = withTempo(this.state.score, bpm);
    if (score === this.state.score || tempoOf(score) === tempoOf(this.state.score)) return;
    this.history.apply({ ...this.state, score, message: `Tempo ${tempoOf(score)}` });
    this.update();
  }

  private renderTransport(): void {
    this.transport.show({ score: this.state.score, time: this.playPos, playing: this.player.active, loop: this.loop, metronome: this.metronome, recording: this.recording, disabled: this.empty });
    this.renderPlayhead();
  }

  private renderPlayhead(): void {
    if (!this.player.active || this.empty) {
      for (const ui of this.rollLanes.values()) ui.roll.setPlayhead(this.empty ? null : this.playPos, false);
    } else {
      for (const ui of this.rollLanes.values()) ui.roll.setPlayhead(this.playPos, true);
      this.lightPlaying();
      this.transport.show({ score: this.state.score, time: this.playPos, playing: true, loop: this.loop, metronome: this.metronome, recording: this.recording, disabled: false });
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
    // The page stays as wide as before when zoomed out (smaller notes, more per line), and grows when zoomed in.
    const width = Math.min(this.el.pages.clientWidth, Math.round((1100 * Math.max(this.zoom, 100)) / 100));
    if (s.score === this.renderedScore && measures === this.renderedMeasures && width === this.renderedWidth && hiddenKey === this.renderedHidden && this.zoom === this.renderedZoom) return;

    const started = performance.now();
    const scale = Math.max(10, Math.round((SCALE * this.zoom) / 100));
    const result = scoreToMei(s.score, { ...(coverTime ? { coverTime } : {}), hiddenStaves: hidden });
    const { pages, log } = this.engraver.engrave(result.mei, {
      pageWidth: Math.round((width * 100) / scale),
      scale,
      tab: result.tab,
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
    this.renderedZoom = this.zoom;
    this.renderedHidden = hiddenKey;
    this.lastRedrawEnd = performance.now();
    this.lastRedrawMs = this.lastRedrawEnd - started;
  }

  private decorate(): void {
    const s = this.state;
    const elements = this.result?.elements;
    this.el.pages.querySelectorAll('.is-selected, .is-range, .is-sign-selected').forEach((n) => n.classList.remove('is-selected', 'is-range', 'is-sign-selected'));
    if (this.selectedSign) this.signNode(this.selectedSign)?.classList.add('is-sign-selected');
    this.el.pages.querySelectorAll('.caret, .ghost').forEach((n) => n.remove());
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
    const span = rangeSpan(s);
    if (span) {
      for (const [id, ref] of elements) {
        if (ref.partId === span.partId && ref.kind !== 'chordNote' && le(span.from, ref.onset) && lt(ref.onset, span.to)) document.getElementById(id)?.classList.add('is-range');
      }
    }
    if (s.caret) this.drawCaret(elements);
    this.drawStaffSwitches();
    this.followSelection();
    this.el.pages.querySelectorAll('.is-playing').forEach((n) => n.classList.remove('is-playing'));
    this.litEvents.clear(); // lit again below, from the playhead
    this.lightPlaying();
  }

  // ── Feedback: the sounding note is blue, an edited note is heard ─────────

  /** Start and end of every event on the timeline (as numbers), kept per score. */
  private spansOf(score: Score): readonly { readonly id: string; readonly a: number; readonly b: number }[] {
    let spans = this.spanCache.get(score);
    if (!spans) {
      spans = score.parts.flatMap((p) => p.voices.flatMap((v) => v.events.map((e) => ({ id: e.id, a: toNumber(e.onset), b: toNumber(e.onset) + toNumber(e.duration) }))));
      this.spanCache.set(score, spans);
    }
    return spans;
  }

  /** While playing, the notes that sound at the playhead are blue on the paper. */
  private lightPlaying(): void {
    const result = this.result;
    const want = new Set<string>();
    if (this.player.active && result && !this.empty) {
      const t = toNumber(this.playPos);
      for (const span of this.spansOf(this.state.score)) if (span.a <= t + 1e-9 && t < span.b - 1e-9) want.add(span.id);
    }
    if (want.size === this.litEvents.size && [...want].every((id) => this.litEvents.has(id))) return;
    if (result && this.eventNodes?.result !== result) {
      const nodes = new Map<string, Element[]>();
      for (const [id, ref] of result.elements) {
        const node = ref.eventId && ref.kind !== 'chordNote' ? document.getElementById(id) : null;
        if (node && ref.eventId) nodes.set(ref.eventId, [...(nodes.get(ref.eventId) ?? []), node]);
      }
      this.eventNodes = { result, nodes };
    }
    const nodes = this.eventNodes?.nodes;
    for (const id of this.litEvents) if (!want.has(id)) nodes?.get(id)?.forEach((n) => n.classList.remove('is-playing'));
    for (const id of want) if (!this.litEvents.has(id)) nodes?.get(id)?.forEach((n) => n.classList.add('is-playing'));
    this.litEvents = want;
  }

  /** Plays the notes the last change touched: a pitch that was changed (also by the arrow keys or while dragging) or a new note – not the preview note. */
  private auditionEdits(): void {
    const s = this.state;
    const before = this.heardScore;
    this.heardScore = s.score;
    if (this.empty || this.player.active || !before || performance.now() - this.lastAudition < 40) return;
    const sel = s.selection;
    // The preview note at the input cursor is silent while its pitch is changed; it sounds when Enter sets it (a new note).
    if (s.score === before || sel?.kind !== 'event') return;
    // A selection may point at a voice that does not exist (yet / any more) in one of the two scores.
    const find = (score: Score) => {
      const part = score.parts.find((p) => p.id === sel.partId);
      return { part, event: part?.voices.find((v) => v.id === sel.voiceId)?.events.find((e) => e.id === sel.eventId) };
    };
    const { part, event } = find(s.score);
    if (!part || !event) return;
    const old = find(before).event;
    const sound = (e: typeof event) => e.tones.map((t) => t.id + ':' + midiOf(t.pitch)).join(' ');
    if (old && sound(old) === sound(event)) return; // the score changed elsewhere: nothing to hear
    const tones = sel.toneId ? event.tones.filter((t) => t.id === sel.toneId) : event.tones;
    this.hear(tones.map((t) => midiOf(t.pitch)), part.instrument);
  }

  private hear(midis: readonly number[], instrument: Parameters<Synth['audition']>[1]): void {
    this.lastAudition = performance.now();
    this.synth.audition(midis, instrument);
  }

  /** The synthesizer sound of the roll on / off (remembered); every roll shows the same state. */
  private toggleRollSynth(): void {
    this.synth.sustained = !this.synth.sustained;
    saveRollSynth(this.synth.sustained);
    for (const ui of this.rollLanes.values()) ui.roll.setSynth(this.synth.sustained);
    this.say(this.synth.sustained ? 'Synthesizer-Klang an: Töne klingen nicht aus.' : 'Synthesizer-Klang aus: die Instrumentenklänge.');
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
    if (this.keymap.id === 'speedy') this.drawGhost(page, pageBox, staff, ref, x);
  }

  /** The preview note of Finale's numpad typing: a notehead (with ledger lines and its name) where Enter will put it. */
  private drawGhost(page: HTMLElement, pageBox: DOMRect, staff: Element, ref: ElementRef, x: number): void {
    const pitches = ghostPitches(this.state);
    const lines = [...staff.children].filter((c) => c.tagName.toLowerCase() === 'path').slice(0, 5);
    if (!pitches || lines.length !== 5) return;
    const top = lines[0]!.getBoundingClientRect();
    const bottom = lines[4]!.getBoundingClientRect();
    const gap = (bottom.top - top.top) / 4;
    const middle = (top.top + top.bottom) / 2 + 2 * gap;
    const centre = staffCenter(this.state.score, { partId: ref.partId, voiceId: ref.voiceId });
    const pos = (p: Pitch) => p.octave * 7 + STEPS.indexOf(p.step);
    const put = (cls: string, left: number, topPx: number, w: number, h: number, text = '') => {
      const el = document.createElement('div');
      el.className = `ghost ${cls}`;
      el.style.left = `${left - pageBox.left}px`;
      el.style.top = `${topPx - pageBox.top}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      if (text) el.textContent = text;
      page.appendChild(el);
    };
    const head = gap * 1.35;
    for (const p of pitches) {
      const steps = pos(p) - pos(centre); // half staff spaces above the middle line
      const y = middle - steps * (gap / 2);
      for (let n = 6; n <= Math.abs(steps); n += 2) {
        put('ghost__ledger', x + 2, middle - Math.sign(steps) * n * (gap / 2) - 0.5, head + 8, 1);
      }
      put('ghost__head', x + 6, y - gap / 2, head, gap);
    }
    const label = [...pitches].sort((a, b) => midiOf(a) - midiOf(b)).map(pitchToString).join(' ');
    put('ghost__label', x + head + 12, middle - gap * 3.4, 80, gap * 1.2, label);
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
      if (this.recording) parts.unshift('● Aufnahme');
      if (s.input.insert) parts.push('Einfügen');
      if (s.input.chord) parts.push('Akkord');
      if (s.input.pendingTie) parts.push('Haltebogen ⌒');
      if (s.input.nextAlter) parts.push(s.input.nextAlter > 0 ? '♯ nächste Note' : '♭ nächste Note');
      if (s.input.octaveShift) parts.push(`Oktave ${s.input.octaveShift > 0 ? '+' : ''}${s.input.octaveShift}`);
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
    const news = document.createElement('button');
    news.type = 'button';
    news.className = 'pill help__news';
    news.textContent = 'Neuigkeiten';
    news.title = 'Was in den letzten Versionen neu ist';
    news.addEventListener('click', () => {
      this.el.help.hidden = true;
      void showPatchNotes(latestNotes());
    });
    head.append(title, switcher, news);
    const desc = document.createElement('p');
    desc.className = 'help__desc';
    desc.textContent = this.keymap.description;
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'help__search';
    search.placeholder = 'Suchen: Taste oder Funktion …';
    search.setAttribute('aria-label', 'Tastenbelegung durchsuchen');
    const none = document.createElement('p');
    none.className = 'help__none';
    none.textContent = 'Dazu gibt es keine Taste.';
    none.hidden = true;
    box.append(head, desc, search);
    const groups: { section: HTMLElement; rows: { dt: HTMLElement; dd: HTMLElement; text: string }[] }[] = [];
    for (const group of this.keymap.help) {
      const section = document.createElement('section');
      section.className = 'help__group';
      const h = document.createElement('h3');
      h.textContent = group.title;
      const dl = document.createElement('dl');
      const rows: { dt: HTMLElement; dd: HTMLElement; text: string }[] = [];
      for (const entry of group.entries) {
        const dt = document.createElement('dt');
        dt.textContent = entry.keys;
        const dd = document.createElement('dd');
        dd.textContent = entry.text;
        dl.append(dt, dd);
        rows.push({ dt, dd, text: foldForSearch(`${entry.keys} ${entry.text} ${group.title}`) });
      }
      section.append(h, dl);
      groups.push({ section, rows });
      box.append(section);
    }
    box.append(none);
    // Every word typed must appear (in the key, the text or the group name); umlauts and case do not matter.
    search.addEventListener('input', () => {
      const words = foldForSearch(search.value).split(' ').filter(Boolean);
      let shown = 0;
      for (const { section, rows } of groups) {
        let any = false;
        for (const row of rows) {
          const hit = words.every((w) => row.text.includes(w));
          row.dt.hidden = row.dd.hidden = !hit;
          any ||= hit;
          if (hit) shown++;
        }
        section.hidden = !any;
      }
      none.hidden = shown > 0;
    });
    const close = document.createElement('p');
    close.className = 'help__close';
    close.textContent = 'Esc schließt';
    box.appendChild(close);
    this.el.help.replaceChildren(box);
  }
}
