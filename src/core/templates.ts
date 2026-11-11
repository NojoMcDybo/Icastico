/**
 * Creating scores from a setup (the "new score" dialog) and changing their
 * global settings afterwards (title, key, meter, upbeat).
 */
import { type Fraction, ZERO, eq, frac, gt, lt } from './time';
import { presetOf, validTuning } from './tab';
import { type InstrumentId, getInstrument } from './instruments';
import {
  type KeyChange,
  type MeterChange,
  type Part,
  type Score,
  type TimeSignature,
  measureLength,
  measureStart,
  measuresOf,
  validateScore,
} from './model';
import { durationName } from './notation/notate';

export interface ScoreSetup {
  readonly title: string;
  readonly composer: string;
  /** In score order, top to bottom. The same instrument may appear twice. */
  readonly instruments: readonly InstrumentId[];
  readonly fifths: number;
  readonly meter: TimeSignature;
  /** Upbeat length; ZERO = none. */
  readonly pickup: Fraction;
}

export const DEFAULT_SETUP: ScoreSetup = {
  title: '',
  composer: '',
  instruments: ['voice', 'guitar', 'piano'],
  fifths: 0,
  meter: { count: 4, unit: 4 },
  pickup: ZERO,
};

export const UNTITLED = 'Ohne Titel';

export function createScore(setup: ScoreSetup): Score {
  const total = new Map<InstrumentId, number>();
  for (const id of setup.instruments) total.set(id, (total.get(id) ?? 0) + 1);
  const seen = new Map<InstrumentId, number>();

  const parts: Part[] = setup.instruments.map((instrument) => {
    const def = getInstrument(instrument);
    const n = (seen.get(instrument) ?? 0) + 1;
    seen.set(instrument, n);
    const id = n === 1 ? instrument : `${instrument}-${n}`;
    return {
      id,
      name: total.get(instrument)! > 1 ? `${def.name} ${n}` : def.name,
      instrument,
      voices: def.staves.map((_, staff) => ({
        id: def.staves.length === 1 ? `${id}-v1` : `${id}-s${staff + 1}`,
        staff,
        events: [],
      })),
    };
  });

  const composer = setup.composer.trim();
  return {
    title: setup.title.trim() || UNTITLED,
    ...(composer ? { composer } : {}),
    meter: [{ at: ZERO, sig: setup.meter }],
    keys: [{ at: ZERO, fifths: setup.fifths }],
    ...(gt(setup.pickup, ZERO) ? { pickup: setup.pickup } : {}),
    parts,
  };
}

/** A new, empty line for `instrument` at the bottom of the score (ids and names stay unique: "Gitarre 2"). */
export function addInstrument(score: Score, instrument: InstrumentId, tab = false): { score: Score; partId: string } {
  const def = getInstrument(instrument);
  const same = score.parts.filter((p) => p.instrument === instrument).length;
  let n = same + 1;
  const idOf = (k: number) => (k === 1 ? instrument : `${instrument}-${k}`);
  while (score.parts.some((p) => p.id === idOf(n))) n++;
  const id = idOf(n);
  const part: Part = {
    id,
    name: n === 1 ? def.name : `${def.name} ${n}`,
    instrument,
    ...(tab && instrument === 'guitar' ? { tab: true } : {}),
    voices: def.staves.map((_, staff) => ({ id: def.staves.length === 1 ? `${id}-v1` : `${id}-s${staff + 1}`, staff, events: [] })),
  };
  return { score: { ...score, parts: [...score.parts, part] }, partId: id };
}

/** Empty score with the three first-class instruments, C major, 4/4. */
export function emptyScore(title = 'Neue Partitur'): Score {
  return createScore({ ...DEFAULT_SETUP, title });
}

// ── Changing settings of an existing score ─────────────────────────────────

export interface ScoreChanges {
  readonly title?: string;
  readonly composer?: string;
  /** Upbeat length; ZERO removes it. */
  readonly pickup?: Fraction;
  /** Printed measure number from which `fifths` / `meter` apply (≤ 1 = whole piece). */
  readonly fromMeasure?: number;
  readonly fifths?: number;
  /** Applies from `fromMeasure` to the end (later meter changes are replaced). */
  readonly meter?: TimeSignature;
  /** Instruments to add at the bottom (a guitar may come with its tablature). */
  readonly addInstruments?: readonly { readonly instrument: InstrumentId; readonly tab?: boolean }[];
  /** Lines to take out, with everything written in them (part ids). One line always stays. */
  readonly removeParts?: readonly string[];
  /** New names of lines (part id → name); an empty name changes nothing. */
  readonly renameParts?: Readonly<Record<string, string>>;
  /** Bars per line: a number (1–16), 0 = automatic; absent = as it is (kept line breaks of an imported file stay). */
  readonly perSystem?: number;
  /** Akkoladen (systems) per page: a number (1–12), 0 = as many as fit; absent = as it is. */
  readonly systemsPerPage?: number;
  /** Tablature on / off per existing guitar line (part id → on). */
  readonly tab?: Readonly<Record<string, boolean>>;
  /** Tuning per guitar or tablature line (part id → six open strings, highest first); the standard tuning is stored as none. */
  readonly tuning?: Readonly<Record<string, readonly number[]>>;
  /** Description at the left of a line shown / hidden (part id → shown), ADR 0041. */
  readonly labels?: Readonly<Record<string, boolean>>;
}

/**
 * Bars per Akkolade for the bars `from` … `to` (0-based indexes) only (ADR 0042): a line starts at `from`, holds `n` bars, and a new line
 * starts after `to`. `starts` are the line starts as they are now (0-based, not the first bar); outside the marked bars they stay.
 */
export function withBarsPerLine(score: Score, starts: readonly number[], from: number, to: number, n: number): Score {
  const count = measuresOf(score).length;
  const breaks = new Set(starts.filter((i) => i < from || i > to + 1));
  if (from > 0) breaks.add(from);
  for (let i = from + n; i <= to; i += n) breaks.add(i);
  if (to + 1 < count) breaks.add(to + 1);
  const sorted = [...breaks].filter((i) => i > 0 && i < count).sort((a, b) => a - b);
  const { layout: old, ...rest } = score;
  return { ...rest, layout: { breaks: sorted, ...(old?.systemsPerPage !== undefined ? { systemsPerPage: old.systemsPerPage } : {}) } };
}

/** Drops entries that repeat the value of the entry before them. */
function dedupe<T extends { at: Fraction }>(list: T[], same: (a: T, b: T) => boolean): T[] {
  return list.filter((e, i) => i === 0 || !same(list[i - 1]!, e));
}

const byTime = <T extends { at: Fraction }>(a: T, b: T) => (lt(a.at, b.at) ? -1 : gt(a.at, b.at) ? 1 : 0);

/**
 * Applies global changes. Notes keep their sounding pitch and their place in
 * time – barlines, accidentals and the upbeat are re-derived around them.
 */
export function applyScoreChanges(score: Score, changes: ScoreChanges): { score: Score } | { error: string } {
  let next: Score = score;

  if (changes.title !== undefined) next = { ...next, title: changes.title.trim() || UNTITLED };
  if (changes.composer !== undefined) {
    const { composer: _old, ...rest } = next;
    const composer = changes.composer.trim();
    next = composer ? { ...rest, composer } : rest;
  }
  if (changes.pickup !== undefined) {
    const { pickup: _old, ...rest } = next;
    next = gt(changes.pickup, ZERO) ? { ...rest, pickup: changes.pickup } : rest;
  }

  for (const [partId, on] of Object.entries(changes.tab ?? {})) {
    next = {
      ...next,
      parts: next.parts.map((p) => {
        if (p.id !== partId || p.instrument !== 'guitar') return p;
        const { tab: _old, ...rest } = p;
        return on ? { ...rest, tab: true } : rest;
      }),
    };
  }
  for (const [partId, tuning] of Object.entries(changes.tuning ?? {})) {
    if (!validTuning(tuning)) return { error: 'Die Stimmung braucht sechs Saiten mit Tönen zwischen C1 und E6.' };
    next = {
      ...next,
      parts: next.parts.map((p) => {
        if (p.id !== partId || (p.instrument !== 'guitar' && p.instrument !== 'tab')) return p;
        const { tuning: _old, ...rest } = p;
        return presetOf(tuning)?.id === 'standard' ? rest : { ...rest, tuning: [...tuning] };
      }),
    };
  }
  for (const [partId, name] of Object.entries(changes.renameParts ?? {})) {
    if (name.trim()) next = { ...next, parts: next.parts.map((p) => (p.id === partId ? { ...p, name: name.trim() } : p)) };
  }
  for (const [partId, shown] of Object.entries(changes.labels ?? {})) {
    next = {
      ...next,
      parts: next.parts.map((p) => {
        if (p.id !== partId) return p;
        const { hideLabel: _old, ...rest } = p;
        return shown ? rest : { ...rest, hideLabel: true };
      }),
    };
  }
  const gone = new Set(changes.removeParts ?? []);
  if (gone.size > 0) {
    const parts = next.parts.filter((p) => !gone.has(p.id));
    // What pointed into a removed line goes with it: ties and glides, and a bracket that would hold fewer than two lines.
    const tones = new Set(parts.flatMap((p) => p.voices.flatMap((v) => v.events.flatMap((e) => e.tones.map((t) => t.id)))));
    const links = (next.links ?? []).filter((l) => tones.has(l.from) && tones.has(l.to));
    const groups = (next.groups ?? []).map((g) => ({ ...g, parts: g.parts.filter((id) => !gone.has(id)) })).filter((g) => g.parts.length >= 2);
    const { links: _links, groups: _groups, ...rest } = next;
    next = { ...rest, parts, ...(links.length > 0 ? { links } : {}), ...(groups.length > 0 ? { groups } : {}) };
  }
  for (const add of changes.addInstruments ?? []) next = addInstrument(next, add.instrument, add.tab ?? false).score;
  if (next.parts.length === 0) return { error: 'Mindestens ein Instrument muss bleiben.' };
  if (changes.perSystem !== undefined || changes.systemsPerPage !== undefined) {
    const old = next.layout;
    const perSystem = changes.perSystem !== undefined ? (changes.perSystem >= 1 ? changes.perSystem : undefined) : old?.perSystem;
    const breaks = changes.perSystem !== undefined ? undefined : old?.breaks;
    const systemsPerPage = changes.systemsPerPage !== undefined ? (changes.systemsPerPage >= 1 ? changes.systemsPerPage : undefined) : old?.systemsPerPage;
    const { layout: _old, ...rest } = next;
    next = perSystem !== undefined || breaks?.length || systemsPerPage !== undefined
      ? { ...rest, layout: { ...(perSystem !== undefined ? { perSystem } : {}), ...(breaks?.length ? { breaks } : {}), ...(systemsPerPage !== undefined ? { systemsPerPage } : {}) } }
      : rest;
  }

  const from = changes.fromMeasure ?? 1;
  const measures = measuresOf(next);
  const last = measures[measures.length - 1]!.number;
  // Allowed: existing measures and the next (empty) one, where input continues.
  const at = from <= 1 ? ZERO : from <= last + 1 ? measureStart(next, from) : null;
  if (at === null) return { error: `Takt ${from} gibt es nicht – die Partitur hat ${last} Takte.` };

  if (changes.fifths !== undefined) {
    const keys: KeyChange[] = [...next.keys.filter((k) => !eq(k.at, at)), { at, fifths: changes.fifths }].sort(byTime);
    next = { ...next, keys: dedupe(keys, (a, b) => a.fifths === b.fifths) };
  }
  if (changes.meter !== undefined) {
    const meter: MeterChange[] = [...next.meter.filter((m) => lt(m.at, at)), { at, sig: changes.meter }];
    next = {
      ...next,
      meter: dedupe(meter, (a, b) => a.sig.count === b.sig.count && a.sig.unit === b.sig.unit),
    };
  }

  const problems = validateScore(next);
  return problems.length ? { error: problems.join('\n') } : { score: next };
}

// ── Names for the UI ───────────────────────────────────────────────────────

const MAJOR = ['Ces', 'Ges', 'Des', 'As', 'Es', 'B', 'F', 'C', 'G', 'D', 'A', 'E', 'H', 'Fis', 'Cis'];
const MINOR = ['as', 'es', 'b', 'f', 'c', 'g', 'd', 'a', 'e', 'h', 'fis', 'cis', 'gis', 'dis', 'ais'];

/** "G-Dur / e-Moll (1 ♯)" */
export function keyName(fifths: number): string {
  const i = fifths + 7;
  const signs = fifths === 0 ? 'keine Vorzeichen' : `${Math.abs(fifths)} ${fifths > 0 ? '♯' : '♭'}`;
  return `${MAJOR[i]}-Dur / ${MINOR[i]}-Moll (${signs})`;
}

/** Possible upbeat lengths for a meter, in eighths (sixteenths for x/16). */
export function pickupChoices(sig: TimeSignature): { value: Fraction; label: string }[] {
  const grid = frac(1, sig.unit >= 16 ? 16 : 8);
  const full = measureLength(sig);
  const choices: { value: Fraction; label: string }[] = [];
  for (let k = 1; lt(frac(k * grid.n, grid.d), full); k++) {
    const value = frac(k * grid.n, grid.d);
    choices.push({ value, label: durationName(value) });
  }
  return choices;
}
