/**
 * The .icastico file format (ADR 0007).
 *
 * JSON, human-readable, one note per line, versioned:
 *
 *   { "format": "icastico", "version": 1, "app": "0.2.0", "score": { … } }
 *
 * Times are fraction strings ("3/8"), pitches are spelled names ("F#4"); every
 * tone of a note or chord has a permanent id ({ "id": "v1-t1", "pitch": "F#4" }).
 * Loading is strict: anything unexpected is rejected with a German message
 * instead of producing a half-broken score.
 */
import { type Fraction, compare, fracToString, parseFrac } from '../time';
import { parsePitch, pitchToString } from '../pitch';
import { type InstrumentId, INSTRUMENTS } from '../instruments';
import { type Curve, type CurveKind, DEFAULT_VOLUME, curveProblem } from '../curve';
import { type Link, type NoteEvent, type Part, type Score, type Tone, type Voice, validateScore } from '../model';

export const FILE_EXTENSION = 'icastico';
/**
 * History: 1 = first format (v0.2.0), 2 = optional upbeat "pickup" (v0.3.0),
 * 3 = tones with permanent ids instead of plain pitch names (ADR 0012),
 * 4 = optional `links` (ties and slides between tones, ADR 0014),
 * 5 = optional `tempo` (quarter notes per minute, ADR 0015),
 * 6 = optional loudness `vol` and `curve` per tone, optional `curve` per link (ADR 0016),
 * 7 = optional `lyric` per note, `chords` (chord symbols) per score (ADR 0019), `tab` per part (ADR 0022).
 */
export const FORMAT_VERSION = 7;

/** A file could not be read; `message` is meant for the user (German). */
export class FileFormatError extends Error {
  override readonly name = 'FileFormatError';
}

// ── Writing ────────────────────────────────────────────────────────────────

/** A curve as a list of [x, y] pairs. */
const curveToJson = (curve: Curve): number[][] => curve.map((p) => [p.x, p.y]);

function scoreToJson(score: Score): unknown {
  return {
    title: score.title,
    ...(score.composer !== undefined ? { composer: score.composer } : {}),
    meter: score.meter.map((m) => ({ at: fracToString(m.at), count: m.sig.count, unit: m.sig.unit })),
    keys: score.keys.map((k) => ({ at: fracToString(k.at), fifths: k.fifths })),
    ...(score.pickup ? { pickup: fracToString(score.pickup) } : {}),
    ...(score.tempo !== undefined ? { tempo: score.tempo } : {}),
    ...(score.chords?.length ? { chords: score.chords.map((c) => ({ at: fracToString(c.at), text: c.text })) } : {}),
    ...(score.links?.length ? { links: score.links.map((l) => ({ id: l.id, kind: l.kind, from: l.from, to: l.to, ...(l.curve ? { curve: curveToJson(l.curve) } : {}) })) } : {}),
    parts: score.parts.map((p) => ({
      id: p.id,
      name: p.name,
      instrument: p.instrument,
      ...(p.tab ? { tab: true } : {}),
      voices: p.voices.map((v) => ({
        id: v.id,
        staff: v.staff,
        events: v.events.map((e) => ({
          id: e.id,
          at: fracToString(e.onset),
          dur: fracToString(e.duration),
          ...(e.lyric !== undefined ? { lyric: e.lyric } : {}),
          tones: e.tones.map((t) => ({
            id: t.id,
            pitch: pitchToString(t.pitch),
            ...(t.volume !== undefined && t.volume !== DEFAULT_VOLUME ? { vol: t.volume } : {}),
            ...(t.curve ? { curve: curveToJson(t.curve) } : {}),
          })),
        })),
      })),
    })),
  };
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const isPrimitive = (v: Json): v is null | boolean | number | string => v === null || typeof v !== 'object';

const depth = (v: Json): number =>
  isPrimitive(v) ? 0 : 1 + Math.max(0, ...(Array.isArray(v) ? v : Object.values(v)).map(depth));

/** "Flat" values fit on one line: primitive arrays and small objects (a note with its tones, a meter entry). */
function isFlat(v: Json): boolean {
  if (isPrimitive(v)) return true;
  return Array.isArray(v) ? v.every(isPrimitive) : depth(v) <= 3;
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

function num(v: unknown, where: string): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fail(`${where}: Zahl erwartet.`);
}

function readCurve(v: unknown, kind: CurveKind, where: string): Curve {
  const curve = arr(v, where).map((p, i) => {
    const pair = arr(p, `${where}[${i}]`);
    if (pair.length !== 2) fail(`${where}[${i}]: ein Punkt hat x und y.`);
    return { x: num(pair[0], `${where}[${i}].x`), y: num(pair[1], `${where}[${i}].y`) };
  });
  const bad = curveProblem(kind, curve);
  return bad ? fail(`${where}: ${bad}`) : curve;
}

function readEvent(v: unknown, where: string): NoteEvent {
  const o = obj(v, where);
  const id = str(o.id, `${where}.id`);
  const tones = arr(o.tones, `${where} (${id}).tones`).map((t, i): Tone => {
    const tone = obj(t, `${where} (${id}).tones[${i}]`);
    const name = str(tone.pitch, `${where} (${id}).tones[${i}].pitch`);
    try {
      const at = `${where} (${id}).tones[${i}]`;
      return {
        id: str(tone.id, `${at}.id`),
        pitch: parsePitch(name),
        ...(tone.vol !== undefined ? { volume: int(tone.vol, `${at}.vol`) } : {}),
        ...(tone.curve !== undefined ? { curve: readCurve(tone.curve, 'level', `${at}.curve`) } : {}),
      };
    } catch (e) {
      if (e instanceof FileFormatError) throw e;
      return fail(`${where} (${id}): unbekannte Tonhöhe „${name}“.`);
    }
  });
  return {
    id,
    onset: time(o.at, `${where} (${id}).at`),
    duration: time(o.dur, `${where} (${id}).dur`),
    tones,
    ...(o.lyric !== undefined ? { lyric: str(o.lyric, `${where} (${id}).lyric`) } : {}),
  };
}

const LINK_KINDS: readonly string[] = ['tie', 'slide'];

function readLink(v: unknown, i: number): Link {
  const where = `Verbindung ${i + 1}`;
  const o = obj(v, where);
  const kind = str(o.kind, `${where}.kind`);
  if (!LINK_KINDS.includes(kind)) fail(`${where}: unbekannte Art „${kind}“.`);
  return {
    id: str(o.id, `${where}.id`),
    kind: kind as Link['kind'],
    from: str(o.from, `${where}.from`),
    to: str(o.to, `${where}.to`),
    ...(o.curve !== undefined ? { curve: readCurve(o.curve, 'glide', `${where}.curve`) } : {}),
  };
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
    ...(o.tab !== undefined ? { tab: o.tab === true } : {}),
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
    ...(o.tempo !== undefined ? { tempo: int(o.tempo, 'Tempo') } : {}),
    ...(o.links !== undefined && arr(o.links, 'Verbindungen').length > 0 ? { links: arr(o.links, 'Verbindungen').map(readLink) } : {}),
    ...(o.chords !== undefined && arr(o.chords, 'Akkordsymbole').length > 0
      ? {
          chords: arr(o.chords, 'Akkordsymbole')
            .map((c, i) => {
              const e = obj(c, `Akkordsymbol ${i + 1}`);
              return { at: time(e.at, `Akkordsymbol ${i + 1}`), text: str(e.text, `Akkordsymbol ${i + 1}`) };
            })
            .sort((a, b) => compare(a.at, b.at)),
        }
      : {}),
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
  // 2 → 3: "pitches": ["C4","E4"] becomes "tones" with ids "<event>-t1", "-t2" …. Event ids are
  // unique, so these ids are too; the music itself is untouched.
  2: (doc) => ({ ...doc, version: 3, score: mapEvents(doc.score, upgradePitches) }),
  // 3 → 4: adds the optional "links". Version-3 files have none.
  3: (doc) => ({ ...doc, version: 4 }),
  // 4 → 5: adds the optional "tempo". Version-4 files have none (the default applies).
  4: (doc) => ({ ...doc, version: 5 }),
  // 5 → 6: adds the optional "vol" and "curve" of tones and "curve" of links. Version-5 files have none.
  5: (doc) => ({ ...doc, version: 6 }),
  // 6 → 7: adds the optional "lyric" of notes and "chords" of the score. Version-6 files have none.
  6: (doc) => ({ ...doc, version: 7 }),
};

/** Applies `fn` to every event object of a (still unvalidated) score; anything unexpected is left for the reader to reject. */
function mapEvents(score: unknown, fn: (event: Obj) => Obj): unknown {
  const each = (v: unknown, f: (o: Obj) => Obj): unknown => (Array.isArray(v) ? v.map((x) => (isObj(x) ? f(x) : x)) : v);
  if (!isObj(score)) return score;
  return {
    ...score,
    parts: each(score.parts, (part) => ({
      ...part,
      voices: each(part.voices, (voice) => ({ ...voice, events: each(voice.events, fn) })),
    })),
  };
}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function upgradePitches(event: Obj): Obj {
  const { pitches, ...rest } = event;
  if (!Array.isArray(pitches)) return event;
  return { ...rest, tones: pitches.map((pitch, i) => ({ id: `${String(event.id)}-t${i + 1}`, pitch })) };
}

/** Upgrades older file versions step by step to FORMAT_VERSION. */
function migrate(doc: Obj, version: number): Obj {
  let current = doc;
  for (let v = version; v < FORMAT_VERSION; v++) current = MIGRATIONS[v]!(current);
  return current;
}

/** Format version a file was saved with, or null if it is not an Icastico file. */
export function fileVersion(text: string): number | null {
  try {
    const doc: unknown = JSON.parse(text);
    return isObj(doc) && doc.format === 'icastico' && typeof doc.version === 'number' ? doc.version : null;
  } catch {
    return null;
  }
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
