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

const KEYMAP = 'icastico.keymap';

/** Chosen key layout ("finale" or "logic"); Finale by default. */
export function loadKeymapPreset(): PresetId {
  try {
    return localStorage.getItem(KEYMAP) === 'logic' ? 'logic' : 'finale';
  } catch {
    return 'finale';
  }
}

export function saveKeymapPreset(id: PresetId): void {
  try {
    localStorage.setItem(KEYMAP, id);
  } catch {
    // not remembered – Finale next time
  }
}

const VIEWS_KEY = 'icastico.views';
const MAX_VIEWS = 60;

/** Which views (notation / piano roll per staff) a score was last shown with; keyed by file path. */
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
