/**
 * Small per-user preferences kept in the webview's local storage.
 * Losing them is harmless (defaults apply), so every access is guarded.
 */
import { type InstrumentId, INSTRUMENTS } from '../core/instruments';
import { type ScoreSetup, DEFAULT_SETUP } from '../core/templates';
import { ZERO } from '../core/time';
import type { PresetId } from './keymaps/library';
import { DEFAULT_VIEW, type ViewState, parseView } from './lanes';

const KEY = 'icastico.newScore';

interface Stored {
  instruments?: unknown;
  fifths?: unknown;
  meter?: { count?: unknown; unit?: unknown };
}

/** Defaults for the "new score" dialog: last choice of instruments, key and meter. */
export function loadNewScoreDefaults(): ScoreSetup {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null;
    if (!raw) return DEFAULT_SETUP;
    const instruments = Array.isArray(raw.instruments)
      ? raw.instruments.filter((i): i is InstrumentId => typeof i === 'string' && i in INSTRUMENTS)
      : [];
    const fifths = Number.isInteger(raw.fifths) && Math.abs(raw.fifths as number) <= 7 ? (raw.fifths as number) : 0;
    const count = Number(raw.meter?.count);
    const unit = Number(raw.meter?.unit);
    const meter = Number.isInteger(count) && count >= 1 && count <= 32 && [2, 4, 8, 16].includes(unit)
      ? { count, unit }
      : DEFAULT_SETUP.meter;
    return {
      ...DEFAULT_SETUP,
      instruments: instruments.length ? instruments : DEFAULT_SETUP.instruments,
      fifths,
      meter,
      pickup: ZERO,
    };
  } catch {
    return DEFAULT_SETUP;
  }
}

export function saveNewScoreDefaults(setup: ScoreSetup): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ instruments: setup.instruments, fifths: setup.fifths, meter: setup.meter }));
  } catch {
    // Storage unavailable – next time the defaults apply.
  }
}

const LAST = 'icastico.lastOpened';

/** Path of the score that was open last (to reopen it on start). */
export function loadLastOpened(): string | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}

export function saveLastOpened(path: string): void {
  try {
    localStorage.setItem(LAST, path);
  } catch {
    // not remembered – the newest score opens instead
  }
}

const PDF = 'icastico.pdf';

/** The page setup of the last PDF export. */
export function loadPdfSetup(): { landscape: boolean; scale: number; pack: boolean } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PDF) ?? 'null');
    if (typeof raw === 'object' && raw !== null) {
      const o = raw as Record<string, unknown>;
      return { landscape: o.landscape === true, scale: [45, 60, 75].includes(Number(o.scale)) ? Number(o.scale) : 60, pack: o.pack === true };
    }
  } catch {
    // fall through to the default
  }
  return { landscape: false, scale: 60, pack: false };
}

export function savePdfSetup(setup: { landscape: boolean; scale: number; pack: boolean }): void {
  try {
    localStorage.setItem(PDF, JSON.stringify(setup));
  } catch {
    // not remembered
  }
}

const KEYMAP = 'icastico.keymap';

/** Chosen key layout ("finale", "logic" or "speedy"); the numpad layout (a preview note that Enter writes, then repeats) by default. */
export function loadKeymapPreset(): PresetId {
  try {
    const id = localStorage.getItem(KEYMAP);
    return id === 'finale' || id === 'logic' ? id : 'speedy';
  } catch {
    return 'speedy';
  }
}

export function saveKeymapPreset(id: PresetId): void {
  try {
    localStorage.setItem(KEYMAP, id);
  } catch {
    // not remembered – the default layout next time
  }
}

const VIEWS_KEY = 'icastico.views';
const MAX_VIEWS = 60;

/** Which views (notation / piano roll per staff) a score was last shown with; keyed by file path. */
const SEEN_VERSION_KEY = 'icastico.seenVersion';

/** The program version that was running when it was last started (null = never). */
export function loadSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}

export function saveSeenVersion(version: string): void {
  try {
    localStorage.setItem(SEEN_VERSION_KEY, version);
  } catch {
    // Storage unavailable – the news may show again next time.
  }
}

const CHORD_SYMBOL_KEY = 'icastico.chordSymbolWithNotes';

/** Whether a chord entered by name also writes its chord symbol above the notes (on unless switched off). */
export function loadChordSymbolWithNotes(): boolean {
  try {
    return localStorage.getItem(CHORD_SYMBOL_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveChordSymbolWithNotes(on: boolean): void {
  try {
    localStorage.setItem(CHORD_SYMBOL_KEY, on ? '1' : '0');
  } catch {
    // Storage unavailable – it starts on next time.
  }
}

const ROLL_SYNTH_KEY = 'icastico.rollSynth';

/** Whether the piano roll's synthesizer sound (nothing dies away) is on. */
export function loadRollSynth(): boolean {
  try {
    return localStorage.getItem(ROLL_SYNTH_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveRollSynth(on: boolean): void {
  try {
    localStorage.setItem(ROLL_SYNTH_KEY, on ? '1' : '0');
  } catch {
    // Storage unavailable – it starts off next time.
  }
}

const ZOOM_KEY = 'icastico.zoom';
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;

/** Size of the notation in percent (remembered); 100 = normal. */
export function loadZoom(): number {
  try {
    const n = Number(localStorage.getItem(ZOOM_KEY));
    return Number.isFinite(n) && n >= ZOOM_MIN && n <= ZOOM_MAX ? Math.round(n) : 100;
  } catch {
    return 100;
  }
}

export function saveZoom(percent: number): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(percent));
  } catch {
    // Storage unavailable – it starts at 100 next time.
  }
}

const METRONOME_KEY = 'icastico.metronome';

/** Whether the metronome click is on (remembered). */
export function loadMetronome(): boolean {
  try {
    return localStorage.getItem(METRONOME_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMetronome(on: boolean): void {
  try {
    localStorage.setItem(METRONOME_KEY, on ? '1' : '0');
  } catch {
    // Storage unavailable – it starts off next time.
  }
}

export function loadView(path: string): ViewState {
  try {
    const all = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '{}') as Record<string, unknown>;
    return parseView(JSON.stringify(all[path] ?? null));
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveView(path: string, view: ViewState): void {
  try {
    const all = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '{}') as Record<string, unknown>;
    delete all[path]; // re-insert last, so the oldest entries are the ones that get pruned
    all[path] = view;
    const keys = Object.keys(all);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_VIEWS))) delete all[old];
    localStorage.setItem(VIEWS_KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable – the next start shows the default view.
  }
}
