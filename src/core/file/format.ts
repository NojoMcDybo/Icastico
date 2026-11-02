/**
 * The .icastico file format (ADR 0007).
 *
 * JSON, human-readable, one note per line, versioned:
 *
 *   { "format": "icastico", "version": 1, "app": "0.2.0", "score": { … } }
 *
 * Times are fraction strings ("3/8"), pitches are spelled names ("F#4").
 * Loading is strict: anything unexpected is rejected with a German message
 * instead of producing a half-broken score.
 */
import { type Fraction, compare, fracToString, parseFrac } from '../time';
import { parsePitch, pitchToString } from '../pitch';
import { type InstrumentId, INSTRUMENTS } from '../instruments';
import { type NoteEvent, type Part, type Score, type Voice, validateScore } from '../model';

export const FILE_EXTENSION = 'icastico';
/** History: 1 = first format (v0.2.0), 2 = optional upbeat "pickup" (v0.3.0). */
export const FORMAT_VERSION = 2;

/** A file could not be read; `message` is meant for the user (German). */
export class FileFormatError extends Error {
  override readonly name = 'FileFormatError';
}

// ── Writing ────────────────────────────────────────────────────────────────

function scoreToJson(score: Score): unknown {
  return {
    title: score.title,
    ...(score.composer !== undefined ? { composer: score.composer } : {}),
    meter: score.meter.map((m) => ({ at: fracToString(m.at), count: m.sig.count, unit: m.sig.unit })),
    keys: score.keys.map((k) => ({ at: fracToString(k.at), fifths: k.fifths })),
    ...(score.pickup ? { pickup: fracToString(score.pickup) } : {}),
    parts: score.parts.map((p) => ({
      id: p.id,
      name: p.name,
      instrument: p.instrument,
      voices: p.voices.map((v) => ({
        id: v.id,
        staff: v.staff,
        events: v.events.map((e) => ({
          id: e.id,
          at: fracToString(e.onset),
          dur: fracToString(e.duration),
          pitches: e.pitches.map(pitchToString),
        })),
      })),
    })),
  };
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const isPrimitive = (v: Json): v is null | boolean | number | string => v === null || typeof v !== 'object';

/** "Flat" values fit on one line: primitives, primitive arrays, objects of those (e.g. a note). */
function isFlat(v: Json): boolean {
  if (isPrimitive(v)) return true;
  const children = Array.isArray(v) ? v : Object.values(v);
  return children.every((c) => isPrimitive(c) || (Array.isArray(c) && c.every(isPrimitive)));
}

function oneLine(v: Json): string {
  if (isPrimitive(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(oneLine).join(', ')}]`;
  const entries = Object.entries(v);
  return entries.length ? `{ ${entries.map(([k, c]) => `${JSON.stringify(k)}: ${oneLine(c)}`).join(', ')} }` : '{}';
}

/** Pretty-prints JSON, keeping flat values (notes, meter entries) on one line. */
function pretty(v: Json, indent = ''): string {
  if (isPrimitive(v) || isFlat(v)) return oneLine(v);
  const inner = `${indent}  `;
  if (Array.isArray(v)) return `[\n${v.map((c) => inner + pretty(c, inner)).join(',\n')}\n${indent}]`;
  const entries = Object.entries(v).map(([k, c]) => `${inner}${JSON.stringify(k)}: ${pretty(c, inner)}`);
  return `{\n${entries.join(',\n')}\n${indent}}`;
}

export function serializeScore(score: Score, appVersion: string): string {
  const doc = { format: 'icastico', version: FORMAT_VERSION, app: appVersion, score: scoreToJson(score) };
  return `${pretty(doc as Json)}\n`;
}

// ── Reading ────────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

const fail = (message: string): never => {
  throw new FileFormatError(message);
};

function obj(v: unknown, where: string): Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : fail(`${where}: Objekt erwartet.`);
}

function arr(v: unknown, where: string): unknown[] {
  return Array.isArray(v) ? v : fail(`${where}: Liste erwartet.`);
}

function str(v: unknown, where: string): string {
  return typeof v === 'string' ? v : fail(`${where}: Text erwartet.`);
}

function int(v: unknown, where: string): number {
  return typeof v === 'number' && Number.isInteger(v) ? v : fail(`${where}: ganze Zahl erwartet.`);
}

function time(v: unknown, where: string): Fraction {
  try {
    return parseFrac(str(v, where));
  } catch (e) {
    if (e instanceof FileFormatError) throw e;
    return fail(`${where}: ungültige Zeitangabe „${String(v)}“.`);
  }
}

function readEvent(v: unknown, where: string): NoteEvent {
  const o = obj(v, where);
  const id = str(o.id, `${where}.id`);
  const pitches = arr(o.pitches, `${where} (${id}).pitches`).map((p, i) => {
    const name = str(p, `${where} (${id}).pitches[${i}]`);
    try {
      return parsePitch(name);
    } catch {
      return fail(`${where} (${id}): unbekannte Tonhöhe „${name}“.`);
    }
  });
  return { id, onset: time(o.at, `${where} (${id}).at`), duration: time(o.dur, `${where} (${id}).dur`), pitches };
}

function readVoice(v: unknown, where: string): Voice {
  const o = obj(v, where);
  const id = str(o.id, `${where}.id`);
  const events = arr(o.events, `${where} (${id}).events`).map((e, i) => readEvent(e, `Note ${i + 1} in ${id}`));
  events.sort((a, b) => compare(a.onset, b.onset));
  return { id, staff: int(o.staff, `${where} (${id}).staff`), events };
}

function readPart(v: unknown, where: string): Part {
  const o = obj(v, where);
  const instrument = str(o.instrument, `${where}.instrument`);
  if (!(instrument in INSTRUMENTS)) fail(`${where}: unbekanntes Instrument „${instrument}“.`);
  return {
    id: str(o.id, `${where}.id`),
    name: str(o.name, `${where}.name`),
    instrument: instrument as InstrumentId,
    voices: arr(o.voices, `${where}.voices`).map((voice, i) => readVoice(voice, `${where}, Stimme ${i + 1}`)),
  };
}

function readScore(v: unknown): Score {
  const o = obj(v, 'Partitur');
  const score: Score = {
    title: str(o.title, 'Titel'),
    ...(o.composer !== undefined ? { composer: str(o.composer, 'Komponist') } : {}),
    meter: arr(o.meter, 'Taktarten').map((m, i) => {
      const e = obj(m, `Taktart ${i + 1}`);
      const sig = { count: int(e.count, `Taktart ${i + 1}`), unit: int(e.unit, `Taktart ${i + 1}`) };
      if (sig.count < 1 || ![1, 2, 4, 8, 16, 32].includes(sig.unit)) fail(`Taktart ${sig.count}/${sig.unit} ist ungültig.`);
      return { at: time(e.at, `Taktart ${i + 1}`), sig };
    }),
    keys: arr(o.keys, 'Tonarten').map((k, i) => {
      const e = obj(k, `Tonart ${i + 1}`);
      const fifths = int(e.fifths, `Tonart ${i + 1}`);
      if (fifths < -7 || fifths > 7) fail(`Tonart mit ${fifths} Vorzeichen ist ungültig.`);
      return { at: time(e.at, `Tonart ${i + 1}`), fifths };
    }),
    ...(o.pickup !== undefined ? { pickup: time(o.pickup, 'Auftakt') } : {}),
    parts: arr(o.parts, 'Instrumente').map((p, i) => readPart(p, `Instrument ${i + 1}`)),
  };
  const problems = validateScore(score);
  if (problems.length > 0) fail(`Die Partitur ist fehlerhaft:\n- ${problems.join('\n- ')}`);
  return score;
}

/** Upgrades a document from version `n` to `n + 1`. */
const MIGRATIONS: Record<number, (doc: Obj) => Obj> = {
  // 1 → 2: adds the optional "pickup" (Auftakt). Version-1 files have none.
  1: (doc) => ({ ...doc, version: 2 }),
};

/** Upgrades older file versions step by step to FORMAT_VERSION. */
function migrate(doc: Obj, version: number): Obj {
  let current = doc;
  for (let v = version; v < FORMAT_VERSION; v++) current = MIGRATIONS[v]!(current);
  return current;
}

export function parseScoreFile(text: string): Score {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('Das ist keine Icastico-Datei (kein gültiges Dateiformat).');
  }
  const doc = obj(raw, 'Datei');
  if (doc.format !== 'icastico') fail('Das ist keine Icastico-Datei.');
  const version = int(doc.version, 'Dateiversion');
  if (version > FORMAT_VERSION) {
    fail('Diese Datei wurde mit einer neueren Icastico-Version gespeichert. Bitte Icastico aktualisieren.');
  }
  if (version < 1) fail(`Unbekannte Dateiversion ${version}.`);
  return readScore(migrate(doc, version).score);
}
