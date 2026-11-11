/**
 * The score model: the single source of truth.
 *
 * Design rules (see docs/architecture.md):
 * - Time-based, not measure-based: events sit on a timeline (onset +
 *   duration). Barlines, ties across barlines and rests are DERIVED from the
 *   meter by the notation layer. Inserting a note shifts the music, it does
 *   not "overflow" a measure.
 * - Gaps in a voice are rests. There are no explicit rest events.
 * - Pitches are sounding pitch.
 * - Immutable: changes produce a new Score (commands, undo = keep old object).
 * - No pixels, no rendering concerns in here.
 */
import { type Fraction, ZERO, add, compare, div, eq, frac, gt, isZero, le, lt, sub } from './time';
import { type Pitch, midiOf } from './pitch';
import { type Curve, MAX_VOLUME, MIN_VOLUME, curveProblem } from './curve';
import { CLEFS, CLEF_IDS, type Clef, type ClefId, getInstrument, type InstrumentId } from './instruments';
import { validTuning } from './tab';
import { MAX_VERSES } from './lyrics';
import { BAR_SIGN_IDS, NOTE_SYMBOL_IDS, type BarSignKind, canSitOnNote } from './symbols';

export interface TimeSignature {
  /** Beats per measure, e.g. 3 in 3/4. */
  readonly count: number;
  /** Beat unit, e.g. 4 in 3/4. */
  readonly unit: number;
}

export interface MeterChange {
  readonly at: Fraction;
  readonly sig: TimeSignature;
}

/** A new tempo from the start of a bar on. */
export interface TempoChange {
  readonly at: Fraction;
  /** Quarter notes per minute. */
  readonly bpm: number;
}

export interface KeyChange {
  readonly at: Fraction;
  /** Circle of fifths: 1 = G major / E minor, -1 = F major / D minor. */
  readonly fifths: number;
}

/**
 * One sounding note of an event. The id is permanent and unique within the
 * score (ADR 0012): editing the pitch, adding or removing other tones of the
 * chord never changes it. Array position or MIDI number are NOT identities.
 */
export interface Tone {
  readonly id: string;
  readonly pitch: Pitch;
  /** Loudness 1–127 (MIDI velocity); absent = DEFAULT_VOLUME. */
  readonly volume?: number;
  /** Loudness over the length of the note (ADR 0016); absent = even. */
  readonly curve?: Curve;
  /** On a tablature line: the string this tone was put on (1 = highest); absent = chosen automatically (ADR 0032). */
  readonly string?: number;
}

/** A note or chord. All tones share onset and duration; sorted by sounding pitch. */
export interface NoteEvent {
  readonly id: string;
  readonly onset: Fraction;
  readonly duration: Fraction;
  readonly tones: readonly Tone[];
  /** Lyric syllable sung on this note (ADR 0019); a trailing "-" means the word goes on. Absent = none. */
  readonly lyric?: string;
  /** Syllables of the further verses (2 … MAX_VERSES, ADR 0036); the first verse is `lyric`. */
  readonly verses?: Readonly<Record<number, string>>;
  /** Special signs on the note (ADR 0024): ids from the sign library, e.g. "mf", "stacc", "fermata". Absent = none. */
  readonly marks?: readonly string[];
  /** Stem direction forced by the user (ADR 0043); absent = the engraver decides. */
  readonly stem?: 'up' | 'down';
}

/** A sign that belongs to a bar (ADR 0024): repeat, ending bracket, segno, coda, jump. `at` is the start of that bar. */
/** A bracket or brace around neighbouring parts. */
export interface StaffGroup {
  readonly parts: readonly string[];
  readonly symbol: 'bracket' | 'brace';
}

export interface BarMark {
  readonly at: Fraction;
  readonly kind: BarSignKind;
  /** Placed on a note: drawn exactly at `at` (segno, coda, jumps and tempo words only). Absent = belongs to the bar that starts at `at`. */
  readonly exact?: boolean;
}

/** A chord symbol such as "Am7" or "C/G", fixed to a point on the timeline (ADR 0019). */
export interface ChordSymbol {
  readonly at: Fraction;
  readonly text: string;
}

export interface Voice {
  readonly id: string;
  /** Index into the instrument's staves (piano: 0 = right hand, 1 = left hand). */
  readonly staff: number;
  /** Sorted by onset, non-overlapping. */
  readonly events: readonly NoteEvent[];
  /** How single rests are shown, found by the start of the rest (ADR 0043); absent = all shown where the engraver puts them. */
  readonly rests?: readonly RestMark[];
}

/** A rest that is hidden and / or moved up or down (ADR 0043): `at` is where the rest starts, `shift` counts staff steps (half a line distance). */
export interface RestMark {
  readonly at: Fraction;
  readonly hidden?: true;
  readonly shift?: number;
}

/** A text of its own on a staff (ADR 0043): anchored at a time, moved by `dx` / `dy` (staff steps; `dy` up) from its usual place above the staff. */
export interface FreeText {
  readonly id: string;
  readonly partId: string;
  /** Index into the instrument's staves. */
  readonly staff: number;
  readonly at: Fraction;
  readonly text: string;
  /** Size in points. */
  readonly size: number;
  readonly dx: number;
  readonly dy: number;
}

export const MIN_TEXT_SIZE = 6;
export const MAX_TEXT_SIZE = 72;
export const DEFAULT_TEXT_SIZE = 14;
export const MAX_REST_SHIFT = 12;

/** A staff written in another clef from a bar on (ADR 0040). */
export interface ClefChange {
  readonly at: Fraction;
  /** Index of the staff within the part's instrument (piano: 0 = right hand, 1 = left hand). */
  readonly staff: number;
  readonly clef: ClefId;
}

export interface Part {
  readonly id: string;
  readonly name: string;
  readonly instrument: InstrumentId;
  readonly voices: readonly Voice[];
  /** Show a tablature staff under the (guitar) staff (ADR 0022); absent = no. */
  readonly tab?: boolean;
  /** Open strings of a guitar or tablature line, string 1 (highest) first; absent = standard E A d g h e (ADR 0032). */
  readonly tuning?: readonly number[];
  /** Clefs that differ from the instrument's own: from `at` on (a bar start), per staff; an entry at 0 replaces the first clef. Absent = none. */
  readonly clefs?: readonly ClefChange[];
  /** Do not print the line's description (name, "Tab") at the left of the staff (ADR 0041); absent = print it. */
  readonly hideLabel?: boolean;
}

export interface Score {
  readonly title: string;
  readonly composer?: string;
  /** Sorted by `at`; the first entry must be at 0. */
  readonly meter: readonly MeterChange[];
  /** Sorted by `at`; the first entry must be at 0. */
  readonly keys: readonly KeyChange[];
  /**
   * Upbeat (Auftakt): length of the incomplete first measure. Absent = none.
   * Must be shorter than a full measure of the first meter.
   */
  readonly pickup?: Fraction;
  /** Tempo in quarter notes per minute; absent = DEFAULT_TEMPO. */
  readonly tempo?: number;
  /** Tempo changes after the start, each at the beginning of a bar, ascending; the tempo at the start is `tempo` (ADR 0039). Absent = none. */
  readonly tempos?: readonly TempoChange[];
  readonly parts: readonly Part[];
  /** Ties and slides between tones; absent = none. */
  readonly links?: readonly Link[];
  /** Chord symbols above the top staff, sorted by `at`, one per time; absent = none. */
  readonly chords?: readonly ChordSymbol[];
  /** Bar signs, sorted by `at`; one of each kind per bar; absent = none. */
  readonly marks?: readonly BarMark[];
  /** Parts whose staves are tied together by a bracket or brace (in score order, next to each other). */
  readonly groups?: readonly StaffGroup[];
  /** How the music is broken into lines; absent = automatic (as many bars as fit). */
  readonly layout?: ScoreLayout;
  /** Free texts on the staves (ADR 0043); absent = none. */
  readonly texts?: readonly FreeText[];
}

/** Line breaks (ADR 0031): a fixed number of bars per line, or the bars (0-based index) where a new line starts (as taken from a MusicXML file). */
export interface ScoreLayout {
  readonly perSystem?: number;
  readonly breaks?: readonly number[];
  /** How many systems (Akkoladen) stand on a page, then a new page starts (ADR 0042); absent = as many as fit. */
  readonly systemsPerPage?: number;
}

export const MAX_PER_SYSTEM = 16;
export const MAX_SYSTEMS_PER_PAGE = 12;

/** The bars (0-based index, not the first) that start a new line, for `count` bars; empty = let the engraver decide. */
export function systemBreaks(score: Score, count: number): number[] {
  const layout = score.layout;
  if (layout?.breaks?.length) return layout.breaks.filter((i) => i > 0 && i < count);
  const n = layout?.perSystem;
  if (!n || n < 1) return [];
  const out: number[] = [];
  for (let i = n; i < count; i += n) out.push(i);
  return out;
}

/**
 * A deliberate connection between two tones (ADR 0014):
 * - `tie`: the same pitch held over from one note into the next (adjacent, same voice);
 * - `slide`: the pitch glides from one tone to a later one on the same staff – not necessarily
 *   the next. The glide takes exactly the time between the two notes; without a gap it is a direct change, but the link is kept.
 * Links name tones, not events, so they survive moving, resizing and re-sorting.
 */
export type LinkKind = 'tie' | 'slide';

export interface Link {
  readonly id: string;
  readonly kind: LinkKind;
  /** Tone id the connection starts at (the earlier note). */
  readonly from: string;
  /** Tone id the connection ends at (the later note). */
  readonly to: string;
  /** Course of the glide through its gap – pitch and loudness change along it (ADR 0016); absent = even. */
  readonly curve?: Curve;
}

export const DEFAULT_TEMPO = 100;
export const MIN_TEMPO = 20;
export const MAX_TEMPO = 400;

/** A score with this tempo (the field is left out for the default). */
export function withTempo(score: Score, bpm: number): Score {
  const { tempo: _old, ...rest } = score;
  const tempo = Math.round(Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, bpm)));
  return tempo === DEFAULT_TEMPO ? rest : { ...rest, tempo };
}

const clampTempo = (bpm: number): number => Math.round(Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, bpm)));

/** The tempo in force at a time. */
export function tempoAt(score: Score, time: Fraction): number {
  let bpm = score.tempo ?? DEFAULT_TEMPO;
  for (const change of score.tempos ?? []) {
    if (le(change.at, time)) bpm = change.bpm;
    else break;
  }
  return bpm;
}

/** Sets (bpm) or removes (null) the change that starts at `at`. A change equal to the tempo before it is dropped; at the very start it is the start tempo. */
export function setTempoChange(score: Score, at: Fraction, bpm: number | null): Score {
  if (le(at, ZERO)) return bpm === null ? score : withTempo(score, bpm);
  const list = (score.tempos ?? []).filter((c) => !eq(c.at, at));
  if (bpm !== null) list.push({ at, bpm: clampTempo(bpm) });
  list.sort((a, b) => compare(a.at, b.at));
  const kept: TempoChange[] = [];
  let before = score.tempo ?? DEFAULT_TEMPO;
  for (const c of list) {
    if (c.bpm === before) continue;
    kept.push(c);
    before = c.bpm;
  }
  const { tempos: _old, ...rest } = score;
  return kept.length > 0 ? { ...rest, tempos: kept } : rest;
}

/** Changes the tempo that is in force at `time`: the start tempo, or the change before that time. */
export function withTempoAt(score: Score, time: Fraction, bpm: number): Score {
  const change = [...(score.tempos ?? [])].reverse().find((c) => le(c.at, time));
  return change ? setTempoChange(score, change.at, bpm) : withTempo(score, bpm);
}

/** The clef and middle-line pitch of a staff of a part at a time: the last change at or before it, else the instrument's own. */
export function clefAt(part: Part, staff: number, time: Fraction): { readonly clef: Clef; readonly center: Pitch } {
  let best: ClefChange | undefined;
  for (const c of part.clefs ?? []) if (c.staff === staff && le(c.at, time) && (!best || le(best.at, c.at))) best = c;
  return best ? CLEFS[best.clef] : getInstrument(part.instrument).staves[staff]!;
}

export interface Measure {
  /** 0-based index. */
  readonly index: number;
  /** Number as printed: 1 = first full measure, 0 = upbeat (Auftakt). */
  readonly number: number;
  readonly start: Fraction;
  readonly end: Fraction;
  /**
   * Where the beat grid of this measure starts. Equal to `start`, except for
   * an upbeat, which is the END of a full measure: its grid starts earlier.
   */
  readonly gridStart: Fraction;
  readonly sig: TimeSignature;
  /** Key in effect at the start of this measure. */
  readonly fifths: number;
}

export const measureLength = (sig: TimeSignature): Fraction => frac(sig.count, sig.unit);

export const eventEnd = (e: NoteEvent): Fraction => add(e.onset, e.duration);

/** End of the last event in the score (0 for an empty score). */
export function contentEnd(score: Score): Fraction {
  let end = ZERO;
  for (const part of score.parts) {
    for (const voice of part.voices) {
      const last = voice.events[voice.events.length - 1];
      if (last && gt(eventEnd(last), end)) end = eventEnd(last);
    }
  }
  return end;
}

function entryAt<T extends { at: Fraction }>(list: readonly T[], time: Fraction): T {
  let current = list[0]!;
  for (const entry of list) {
    if (le(entry.at, time)) current = entry;
    else break;
  }
  return current;
}

/** Key signature (fifths) in effect at a time. */
export const keyAt = (score: Score, time: Fraction): number => entryAt(score.keys, time).fifths;

/** Time signature in effect at a time. */
export const meterAt = (score: Score, time: Fraction): TimeSignature => entryAt(score.meter, time).sig;

/**
 * Derives the measures from the meter map. Produces at least `minMeasures`
 * measures, always enough to hold all content, and – if given – a measure
 * that contains `coverTime` (so an input caret after the last note has room).
 */
export function measuresOf(score: Score, minMeasures = 1, coverTime?: Fraction): Measure[] {
  const end = contentEnd(score);
  const result: Measure[] = [];
  let start = ZERO;
  let index = 0;
  const pickup = score.pickup && gt(score.pickup, ZERO) ? score.pickup : null;
  if (pickup) {
    const sig = score.meter[0]!.sig;
    const fifths = score.keys[0]!.fifths;
    result.push({ index, number: 0, start, end: pickup, gridStart: sub(pickup, measureLength(sig)), sig, fifths });
    start = pickup;
    index++;
  }
  while (index < minMeasures || lt(start, end) || (coverTime !== undefined && le(start, coverTime))) {
    const sig = entryAt(score.meter, start).sig;
    const fifths = entryAt(score.keys, start).fifths;
    const mEnd = add(start, measureLength(sig));
    result.push({ index, number: pickup ? index : index + 1, start, end: mEnd, gridStart: start, sig, fifths });
    start = mEnd;
    index++;
  }
  return result;
}

/** Start time of the measure with this printed number (0 = upbeat). */
export function measureStart(score: Score, number: number): Fraction | null {
  const ms = measuresOf(score, number + 1);
  return ms.find((m) => m.number === number)?.start ?? null;
}

/** Where a tone lives: its event, voice and part. */
export interface ToneSpot {
  readonly part: Part;
  readonly voice: Voice;
  readonly event: NoteEvent;
  readonly tone: Tone;
}

/** Every tone of the score by id. */
export function locateTones(score: Score): Map<string, ToneSpot> {
  const spots = new Map<string, ToneSpot>();
  for (const part of score.parts) {
    for (const voice of part.voices) {
      for (const event of voice.events) {
        for (const tone of event.tones) spots.set(tone.id, { part, voice, event, tone });
      }
    }
  }
  return spots;
}

/** Why a link between these two tones cannot stand (German); null = it is fine. */
export function linkBreak(kind: LinkKind, a: ToneSpot, b: ToneSpot): string | null {
  if (a.part.id !== b.part.id || a.voice.staff !== b.voice.staff) return 'Die beiden Töne müssen auf derselben Zeile liegen.';
  if (kind === 'tie') {
    if (a.voice.id !== b.voice.id) return 'Die beiden Töne müssen in derselben Stimme liegen.';
    if (midiOf(a.tone.pitch) !== midiOf(b.tone.pitch)) return 'Ein Haltebogen braucht zwei gleich hohe Töne.';
    if (!eq(eventEnd(a.event), b.event.onset)) return 'Ein Haltebogen verbindet nur Noten, die unmittelbar aufeinander folgen.';
  } else if (gt(eventEnd(a.event), b.event.onset)) {
    return 'Beim Gleiten muss der Zielton erst nach dem Ende des Ausgangstons beginnen.';
  }
  return null;
}

/** Problems with the links of a score (German). Empty = all links are valid. */
export function linkProblems(score: Score): string[] {
  const links = score.links ?? [];
  if (links.length === 0) return [];
  const problems: string[] = [];
  const spots = locateTones(score);
  const ids = new Set<string>();
  const outgoing = new Set<string>();
  /** What arrives in each tone: several glides may (a chord resolving into one note), a tie only alone. */
  const incoming = new Map<string, LinkKind[]>();
  for (const link of links) {
    if (ids.has(link.id)) problems.push(`Doppelte Verbindungs-ID ${link.id}.`);
    ids.add(link.id);
    if (!ID_PATTERN.test(link.id)) problems.push(`Ungültige Verbindungs-ID "${link.id}".`);
    const a = spots.get(link.from);
    const b = spots.get(link.to);
    if (!a || !b) {
      problems.push(`Verbindung ${link.id} verweist auf einen Ton, den es nicht gibt.`);
      continue;
    }
    const badCurve = link.curve ? (link.kind === 'slide' ? curveProblem('glide', link.curve) : 'Ein Haltebogen hat keine Kurve.') : null;
    if (badCurve) problems.push(`Verbindung ${link.id}: ${badCurve}`);
    const why = linkBreak(link.kind, a, b);
    if (why) problems.push(`Verbindung ${link.id}: ${why}`);
    if (outgoing.has(link.from)) problems.push(`Von Ton ${link.from} geht mehr als eine Verbindung aus.`);
    const arriving = incoming.get(link.to) ?? [];
    if (arriving.length > 0 && (link.kind === 'tie' || arriving.includes('tie'))) problems.push(`In Ton ${link.to} kommt mehr als eine Verbindung an (ein Haltebogen kommt allein).`);
    outgoing.add(link.from);
    incoming.set(link.to, [...arriving, link.kind]);
  }
  return problems;
}

/** A tone id not used by any tone of the score yet, derived from its event: "<event>-t1", "-t2" … */
export function freshToneId(score: Score, eventId: string): string {
  const used = new Set(score.parts.flatMap((p) => p.voices.flatMap((v) => v.events.flatMap((e) => e.tones.map((t) => t.id)))));
  let n = 1;
  while (used.has(`${eventId}-t${n}`)) n++;
  return `${eventId}-t${n}`;
}

/** IDs end up as XML ids in MEI/SVG, so they must be XML-safe. */
const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Returns human-readable problems (German, shown to the user). Empty = valid. */
export function validateScore(score: Score): string[] {
  const problems: string[] = [];
  if (score.meter.length === 0 || !isZero(score.meter[0]!.at)) {
    problems.push('Taktart fehlt am Anfang.');
  }
  if (score.keys.length === 0 || !isZero(score.keys[0]!.at)) {
    problems.push('Tonart fehlt am Anfang.');
  }
  if (problems.length > 0) return problems;

  for (const part of score.parts) {
    if (part.tuning && (!validTuning(part.tuning) || (part.instrument !== 'guitar' && part.instrument !== 'tab'))) problems.push(`${part.name}: Die Stimmung gibt es nur für Gitarre und Tabulatur, mit sechs Saiten zwischen C1 und E6.`);
    for (const v of part.voices) for (const e of v.events) for (const t of e.tones) if (t.string !== undefined && !(Number.isInteger(t.string) && t.string >= 1 && t.string <= 6)) problems.push(`${part.name}: Ton ${t.id} liegt auf einer Saite, die es nicht gibt.`);
  }
  for (const part of score.parts) {
    for (const v of part.voices) {
      const seen = new Set<string>();
      for (const r of v.rests ?? []) {
        const key = `${r.at.n}/${r.at.d}`;
        if (r.at.n < 0 || seen.has(key)) problems.push(`${part.name}: Pause bei ${key} ist doppelt oder liegt vor dem Anfang.`);
        seen.add(key);
        if (r.shift !== undefined && !(Number.isInteger(r.shift) && Math.abs(r.shift) <= MAX_REST_SHIFT)) problems.push(`${part.name}: Eine Pause lässt sich höchstens um ${MAX_REST_SHIFT} Stufen verschieben.`);
        if (!r.hidden && !r.shift) problems.push(`${part.name}: Pause bei ${key} hat weder Verschiebung noch ist sie unsichtbar.`);
      }
      for (const e of v.events) if (e.stem !== undefined && e.stem !== 'up' && e.stem !== 'down') problems.push(`${part.name}: Notenhals „${String(e.stem)}“ gibt es nicht.`);
    }
  }
  const textIds = new Set<string>();
  for (const t of score.texts ?? []) {
    const part = score.parts.find((p) => p.id === t.partId);
    if (!part || t.staff < 0 || t.staff >= getInstrument(part.instrument).staves.length) problems.push(`Text „${t.text}“ gehört zu keiner Zeile.`);
    if (textIds.has(t.id)) problems.push(`Der Text ${t.id} kommt doppelt vor.`);
    textIds.add(t.id);
    if (t.text.trim() === '' || t.text.length > 200) problems.push('Ein Text darf nicht leer und höchstens 200 Zeichen lang sein.');
    if (!(Number.isInteger(t.size) && t.size >= MIN_TEXT_SIZE && t.size <= MAX_TEXT_SIZE)) problems.push(`Textgröße: erlaubt sind ${MIN_TEXT_SIZE} bis ${MAX_TEXT_SIZE} Punkt.`);
    if (!Number.isFinite(t.dx) || !Number.isFinite(t.dy) || t.at.n < 0) problems.push(`Text „${t.text}“ steht an einer ungültigen Stelle.`);
  }
  if (score.tempo !== undefined && !(Number.isInteger(score.tempo) && score.tempo >= MIN_TEMPO && score.tempo <= MAX_TEMPO)) {
    problems.push(`Tempo ${score.tempo} ist ungültig (erlaubt: ${MIN_TEMPO}–${MAX_TEMPO}).`);
  }
  const tempos = score.tempos ?? [];
  // Tempo and clef changes must start a bar: look the bars up once, as far as the last change.
  const changeTimes = [...tempos.map((c) => c.at), ...score.parts.flatMap((p) => (p.clefs ?? []).map((c) => c.at))];
  const barStarts = new Set(changeTimes.length > 0 ? measuresOf(score, 1, changeTimes.reduce((m, t) => (gt(t, m) ? t : m), ZERO)).map((m) => `${m.start.n}/${m.start.d}`) : []);
  let lastTempo: Fraction | null = null;
  for (const change of tempos) {
    if (!(Number.isInteger(change.bpm) && change.bpm >= MIN_TEMPO && change.bpm <= MAX_TEMPO)) problems.push(`Tempo ${change.bpm} ist ungültig (erlaubt: ${MIN_TEMPO}–${MAX_TEMPO}).`);
    if (!gt(change.at, ZERO) || (lastTempo && !gt(change.at, lastTempo))) problems.push(`Tempowechsel bei ${change.at.n}/${change.at.d}: Die Wechsel müssen hinter dem Anfang stehen und aufsteigen.`);
    else if (!barStarts.has(`${change.at.n}/${change.at.d}`)) problems.push(`Tempowechsel bei ${change.at.n}/${change.at.d} liegt nicht auf einem Taktanfang.`);
    lastTempo = change.at;
  }
  for (const part of score.parts) {
    const instrument = getInstrument(part.instrument);
    const last = new Map<number, Fraction>();
    for (const change of part.clefs ?? []) {
      const where = `${part.name}: Schlüsselwechsel bei ${change.at.n}/${change.at.d}`;
      if (!Number.isInteger(change.staff) || change.staff < 0 || change.staff >= instrument.staves.length) problems.push(`${where}: Dieses System gibt es nicht.`);
      else if (instrument.tab) problems.push(`${where}: Die Tabulatur hat keinen Schlüssel.`);
      if (!CLEF_IDS.includes(change.clef)) problems.push(`${where}: Den Schlüssel „${change.clef}“ gibt es nicht.`);
      const before = last.get(change.staff);
      if (lt(change.at, ZERO) || (before && !gt(change.at, before))) problems.push(`${where}: Die Wechsel müssen aufsteigen.`);
      else if (!barStarts.has(`${change.at.n}/${change.at.d}`)) problems.push(`${where} liegt nicht auf einem Taktanfang.`);
      last.set(change.staff, change.at);
    }
  }
  const pickup = score.pickup;
  if (pickup && (lt(pickup, ZERO) || !lt(pickup, measureLength(score.meter[0]!.sig)))) {
    problems.push('Der Auftakt muss kürzer als ein ganzer Takt sein.');
  }

  // Meter changes must fall on barlines of the preceding meter
  // (with an upbeat, the first barline is at the end of the upbeat).
  for (let i = 1; i < score.meter.length; i++) {
    const prev = score.meter[i - 1]!;
    const here = score.meter[i]!;
    const from = i === 1 && pickup && gt(pickup, ZERO) ? pickup : prev.at;
    const measures = div(sub(here.at, from), measureLength(prev.sig));
    const minimum = from === prev.at ? 1 : 0;
    if (measures.d !== 1 || measures.n < minimum) {
      problems.push(`Taktwechsel bei ${here.at.n}/${here.at.d} liegt nicht auf einem Taktstrich.`);
    }
  }

  const ids = new Set<string>();
  const toneIds = new Set<string>();
  for (const part of score.parts) {
    const instrument = getInstrument(part.instrument);
    if (!ID_PATTERN.test(part.id)) problems.push(`Ungültige Part-ID "${part.id}".`);
    if (part.tab && part.instrument !== 'guitar') problems.push(`${part.name}: Tabulatur gibt es nur für Gitarre.`);
    const voiceIds = new Set<string>();
    for (const voice of part.voices) {
      if (voiceIds.has(voice.id)) problems.push(`${part.name}: doppelte Stimm-ID ${voice.id}.`);
      voiceIds.add(voice.id);
      if (!ID_PATTERN.test(voice.id)) problems.push(`${part.name}: ungültige Stimm-ID "${voice.id}".`);
      if (voice.staff < 0 || voice.staff >= instrument.staves.length) {
        problems.push(`${part.name}: Stimme ${voice.id} verweist auf nicht vorhandenes System ${voice.staff}.`);
      }
      let cursor = ZERO;
      for (const ev of voice.events) {
        if (ids.has(ev.id)) problems.push(`Doppelte Event-ID ${ev.id}.`);
        if (!ID_PATTERN.test(ev.id)) problems.push(`Ungültige Event-ID "${ev.id}" (erlaubt: Buchstabe, dann Buchstaben/Ziffern/_/-).`);
        ids.add(ev.id);
        if (!gt(ev.duration, ZERO)) problems.push(`${part.name}: Event ${ev.id} hat keine positive Dauer.`);
        if (compare(ev.onset, ZERO) < 0) problems.push(`${part.name}: Event ${ev.id} beginnt vor dem Anfang.`);
        if (lt(ev.onset, cursor)) {
          problems.push(`${part.name}: Event ${ev.id} überlappt mit dem vorherigen Event derselben Stimme.`);
        }
        if (ev.tones.length === 0) problems.push(`${part.name}: Event ${ev.id} hat keine Tonhöhe.`);
        for (const mark of ev.marks ?? []) if (!NOTE_SYMBOL_IDS.includes(mark)) problems.push(`${part.name}: Das Zeichen "${mark}" an ${ev.id} gibt es nicht.`);
        if (ev.lyric !== undefined && (ev.lyric === '' || /\s/.test(ev.lyric))) problems.push(`${part.name}: Der Liedtext von ${ev.id} ist ungültig.`);
        for (const [key, syllable] of Object.entries(ev.verses ?? {})) {
          const verse = Number(key);
          if (!Number.isInteger(verse) || verse < 2 || verse > MAX_VERSES) problems.push(`${part.name}: Die Strophe ${key} von ${ev.id} gibt es nicht.`);
          else if (syllable === '' || /\s/.test(syllable)) problems.push(`${part.name}: Der Liedtext (Strophe ${verse}) von ${ev.id} ist ungültig.`);
        }
        for (const tone of ev.tones) {
          if (toneIds.has(tone.id)) problems.push(`Doppelte Ton-ID ${tone.id}.`);
          if (!ID_PATTERN.test(tone.id)) problems.push(`Ungültige Ton-ID "${tone.id}" (erlaubt: Buchstabe, dann Buchstaben/Ziffern/_/-).`);
          toneIds.add(tone.id);
          if (tone.volume !== undefined && !(Number.isInteger(tone.volume) && tone.volume >= MIN_VOLUME && tone.volume <= MAX_VOLUME)) {
            problems.push(`Ton ${tone.id}: Lautstärke ${tone.volume} ist ungültig (erlaubt: ${MIN_VOLUME}–${MAX_VOLUME}).`);
          }
          const bad = tone.curve ? curveProblem('level', tone.curve) : null;
          if (bad) problems.push(`Ton ${tone.id}: ${bad}`);
        }
        cursor = eventEnd(ev);
      }
    }
  }
  problems.push(...linkProblems(score));
  const layout = score.layout;
  if (layout?.perSystem !== undefined && !(Number.isInteger(layout.perSystem) && layout.perSystem >= 1 && layout.perSystem <= MAX_PER_SYSTEM)) problems.push(`Takte pro Zeile: erlaubt sind 1 bis ${MAX_PER_SYSTEM}.`);
  if (layout?.systemsPerPage !== undefined && !(Number.isInteger(layout.systemsPerPage) && layout.systemsPerPage >= 1 && layout.systemsPerPage <= MAX_SYSTEMS_PER_PAGE)) problems.push(`Akkoladen pro Seite: erlaubt sind 1 bis ${MAX_SYSTEMS_PER_PAGE}.`);
  if (layout?.breaks?.some((b, i) => !Number.isInteger(b) || b < 1 || (i > 0 && b <= layout.breaks![i - 1]!))) problems.push('Die Zeilenumbrüche müssen aufsteigende Taktnummern sein.');
  const seenMarks = new Set<string>();
  for (const m of score.marks ?? []) {
    const key = `${m.kind}@${m.at.n}/${m.at.d}`;
    if (!BAR_SIGN_IDS.includes(m.kind)) problems.push(`Das Taktzeichen "${m.kind}" gibt es nicht.`);
    if (lt(m.at, ZERO)) problems.push(`Das Taktzeichen "${m.kind}" beginnt vor dem Anfang.`);
    if (m.exact && !canSitOnNote(m.kind)) problems.push(`Das Taktzeichen "${m.kind}" gehört an einen Takt, nicht an eine Note.`);
    if (seenMarks.has(key)) problems.push(`Das Taktzeichen "${m.kind}" steht doppelt.`);
    seenMarks.add(key);
  }
  const grouped = new Set<string>();
  for (const g of score.groups ?? []) {
    const at = g.parts.map((id) => score.parts.findIndex((p) => p.id === id));
    if (g.symbol !== 'bracket' && g.symbol !== 'brace') problems.push(`Die Gruppierung "${String(g.symbol)}" gibt es nicht.`);
    if (g.parts.length < 2 || at.some((i) => i < 0) || at.some((i, k) => k > 0 && i !== at[k - 1]! + 1)) problems.push('Eine Klammer fasst mindestens zwei Zeilen zusammen, die direkt untereinander stehen.');
    for (const id of g.parts) {
      if (grouped.has(id)) problems.push(`Die Zeile ${id} steht in zwei Klammern.`);
      grouped.add(id);
    }
  }
  let lastChord: Fraction | null = null;
  for (const c of score.chords ?? []) {
    if (c.text.trim() === '') problems.push('Ein Akkordsymbol ist leer.');
    if (lt(c.at, ZERO) || (lastChord && !gt(c.at, lastChord))) problems.push(`Akkordsymbol ${c.text}: Zeitpunkt doppelt oder nicht geordnet.`);
    lastChord = c.at;
  }
  return problems;
}
