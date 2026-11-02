/**
 * Small per-user preferences kept in the webview's local storage.
 * Losing them is harmless (defaults apply), so every access is guarded.
 */
import { type InstrumentId, INSTRUMENTS } from '../core/instruments';
import { type ScoreSetup, DEFAULT_SETUP } from '../core/templates';
import { ZERO } from '../core/time';

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
