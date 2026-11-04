/**
 * Structured edits from the piano roll (and the matching keyboard commands):
 * plain data in, new EditorState out. Like every command they are pure
 * functions, so one drag is just many previews of one edit and one undo step.
 *
 * Rules:
 * - Times lie on the 1/64 grid (the finest supported value); notes of N-tuplets are not moved yet.
 * - A voice never overlaps itself, and nothing is overwritten: a note that lands on another one
 *   joins it as a chord when onset and length are exactly equal, otherwise it takes another voice
 *   of the same staff (a new one if needed, at most MAX_VOICES) – ADR 0016.
 * - A chord keeps its notes together: time edits move the whole event, a pitch edit only one tone.
 *   (Detaching a single tone is a separate step.)
 */
import { type Curve, DEFAULT_VOLUME, MAX_VOLUME, MIN_VOLUME, isDefaultCurve, tidyCurve } from '../curve';
import { type Fraction, ZERO, add, eq, frac, isDyadic, le, lt } from '../time';
import { type NoteEvent, type Score, type Tone, eventEnd, freshToneId, keyAt, locateTones } from '../model';
import { midiOf, spellMidi } from '../pitch';
import {
  type EditorState,
  type Selection,
  type VoiceRef,
  freshEventId,
  getVoice,
  updateEvents,
} from './state';
import { freshLinkId, linksOf, withLinks, withValidLinks } from './linkOps';
import { insertSorted } from './voiceOps';

/** Finest supported note value: 1/64. */
export const GRID = frac(1, 64);

export type RollEdit =
  /** A new single-tone note. */
  | { readonly kind: 'create'; readonly voice: VoiceRef; readonly onset: Fraction; readonly duration: Fraction; readonly midi: number }
  /** Moves/resizes a whole event and/or changes the pitch of one of its tones. */
  | {
      readonly kind: 'change';
      readonly voice: VoiceRef;
      readonly eventId: string;
      readonly onset?: Fraction;
      readonly duration?: Fraction;
      readonly tone?: { readonly id: string; readonly midi: number };
      /** Prefer this voice when the new time is taken in the event's own voice (a drop onto a note of another voice). */
      readonly into?: VoiceRef;
      /** A time change moves only this tone of a chord (it leaves the chord), not the whole event. */
      readonly only?: string;
    }
  /** Glides between two tones (any two on the staff; the earlier one is the start). The same pair again takes the glide away. */
  | { readonly kind: 'connect'; readonly a: string; readonly b: string }
  /** Takes a connection away. */
  | { readonly kind: 'disconnect'; readonly id: string }
  /** Loudness and/or loudness curve of one tone (ADR 0016); a `null` curve takes it away. */
  | { readonly kind: 'shape'; readonly tone: string; readonly volume?: number; readonly curve?: Curve | null }
  /** The course of a glide (pitch and loudness through the gap); a `null` curve makes it even again. */
  | { readonly kind: 'blend'; readonly id: string; readonly curve: Curve | null }
  /** Removes one tone (the whole event if it is the last one). */
  | { readonly kind: 'delete'; readonly voice: VoiceRef; readonly eventId: string; readonly toneId?: string };

const refuse = (s: EditorState, message: string): EditorState => ({ ...s, message });

const onGrid = (t: Fraction): boolean => isDyadic(t) && t.d <= GRID.d;

/** First other event of the voice that overlaps [onset, end). */
function collision(events: readonly NoteEvent[], skipId: string | null, onset: Fraction, end: Fraction): NoteEvent | undefined {
  return events.find((e) => e.id !== skipId && lt(e.onset, end) && lt(onset, eventEnd(e)));
}

const MIDI_LOW = 0;
const MIDI_HIGH = 127;
/** Voices per staff: more are unreadable in print. */
export const MAX_VOICES = 4;

/** Where tones were put: the voice and event they ended up in. */
interface Placed {
  readonly score: Score;
  readonly nextId: number;
  readonly voice: VoiceRef;
  readonly eventId: string;
}

/**
 * Puts tones into the time slot [onset, onset + duration) of a staff (ADR 0016):
 * - an event with exactly this slot takes them in as a chord;
 * - else the first voice of the staff with room holds a new event (the preferred voice first);
 * - if every voice is busy a new voice starts, up to `MAX_VOICES`.
 * Returns a German reason when it cannot be done.
 */
function placeTones(
  score: Score,
  nextId: number,
  staff: { readonly partId: string; readonly staff: number },
  preferred: VoiceRef,
  tones: readonly Tone[],
  onset: Fraction,
  duration: Fraction,
): Placed | string {
  const part = score.parts.find((p) => p.id === staff.partId)!;
  const here = part.voices.filter((v) => v.staff === staff.staff);
  const ordered = [...here].sort((a, b) => Number(b.id === preferred.voiceId) - Number(a.id === preferred.voiceId));
  const end = add(onset, duration);
  // First choice: an event with exactly this slot in any voice of the staff – the tones join it as a chord.
  for (const voice of ordered) {
    const ref: VoiceRef = { partId: part.id, voiceId: voice.id };
    const same = voice.events.find((e) => eq(e.onset, onset) && eq(e.duration, duration));
    if (!same) continue;
    if (tones.some((t) => same.tones.some((x) => midiOf(x.pitch) === midiOf(t.pitch)))) return 'Dieser Ton liegt schon im Akkord.';
    const joined: NoteEvent = { ...same, tones: sortTones([...same.tones, ...tones]) };
    return { score: updateEvents(score, ref, (list) => list.map((e) => (e.id === same.id ? joined : e))), nextId, voice: ref, eventId: same.id };
  }
  // Otherwise the first voice with room (the preferred one first).
  for (const voice of ordered) {
    if (voice.events.some((e) => lt(e.onset, end) && lt(onset, eventEnd(e)))) continue;
    const ref: VoiceRef = { partId: part.id, voiceId: voice.id };
    const [id, next] = freshEventId(score, ref, nextId);
    const event: NoteEvent = { id, onset, duration, tones: sortTones(tones) };
    return { score: updateEvents(score, ref, (list) => insertSorted(list, event)), nextId: next, voice: ref, eventId: id };
  }
  if (here.length >= MAX_VOICES) return `Mehr als ${MAX_VOICES} Stimmen pro Zeile gehen nicht.`;
  let n = 2;
  while (part.voices.some((v) => v.id === `${part.id}-v${n}`)) n++;
  const ref: VoiceRef = { partId: part.id, voiceId: `${part.id}-v${n}` };
  const id = `${ref.voiceId}-n${nextId}`; // a brand-new voice: no event ids to clash with
  const event: NoteEvent = { id, onset, duration, tones: sortTones(tones) };
  const lastHere = here[here.length - 1]!;
  const voices = part.voices.flatMap((v) => (v.id === lastHere.id ? [v, { id: ref.voiceId, staff: staff.staff, events: [event] }] : [v]));
  return { score: { ...score, parts: score.parts.map((p) => (p.id === part.id ? { ...p, voices } : p)) }, nextId: nextId + 1, voice: ref, eventId: id };
}

const sortTones = (ts: readonly Tone[]): Tone[] => [...ts].sort((a, b) => midiOf(a.pitch) - midiOf(b.pitch));

/** The score without an event; a secondary voice left empty goes away (the first voice of a staff stays). */
function withoutEvent(score: Score, voice: VoiceRef, eventId: string): Score {
  const part = score.parts.find((p) => p.id === voice.partId)!;
  const home = part.voices.find((v) => v.id === voice.voiceId)!;
  const first = part.voices.find((v) => v.staff === home.staff)!;
  const voices = part.voices
    .map((v) => (v.id === home.id ? { ...v, events: v.events.filter((e) => e.id !== eventId) } : v))
    .filter((v) => !(v.id === home.id && v.events.length === 0 && v.id !== first.id));
  return { ...score, parts: score.parts.map((p) => (p.id === part.id ? { ...p, voices } : p)) };
}

function create(s: EditorState, edit: Extract<RollEdit, { kind: 'create' }>): EditorState {
  const { voice, onset, duration, midi } = edit;
  if (lt(onset, ZERO) || !onGrid(onset) || !onGrid(duration) || le(duration, ZERO)) return refuse(s, 'Dort kann keine Note stehen (außerhalb des Rasters).');
  if (midi < MIDI_LOW || midi > MIDI_HIGH) return refuse(s, 'Dieser Ton ist zu hoch oder zu tief.');
  const { voice: home } = getVoice(s.score, voice);
  const id0 = `${voice.voiceId}-n${s.nextId}`;
  const tone: Tone = { id: freshToneId(s.score, id0), pitch: spellMidi(midi, keyAt(s.score, onset)) };
  const placed = placeTones(s.score, s.nextId, { partId: voice.partId, staff: home.staff }, voice, [tone], onset, duration);
  if (typeof placed === 'string') return refuse(s, placed);
  return {
    ...s,
    score: placed.score,
    nextId: placed.nextId,
    selection: { kind: 'event', ...placed.voice, eventId: placed.eventId, toneId: tone.id },
    message: null,
  };
}

function change(s: EditorState, edit: Extract<RollEdit, { kind: 'change' }>): EditorState {
  const { voice } = edit;
  const events = getVoice(s.score, voice).voice.events;
  const old = events.find((e) => e.id === edit.eventId);
  if (!old) return refuse(s, 'Die Note gibt es nicht mehr.');

  const onset = edit.onset ?? old.onset;
  const duration = edit.duration ?? old.duration;
  const timeChanged = !eq(onset, old.onset) || !eq(duration, old.duration);
  if (timeChanged) {
    if (!isDyadic(old.onset) || !isDyadic(old.duration)) return refuse(s, 'N-Tolen lassen sich hier noch nicht verschieben.');
    if (lt(onset, ZERO)) return refuse(s, 'Vor dem Anfang der Partitur ist kein Platz.');
    if (!onGrid(onset) || !onGrid(duration) || le(duration, ZERO)) return refuse(s, 'Kürzer als eine 64tel geht nicht.');
  }
  // Taken in its own voice, or exactly the slot of a note of another voice of the staff (that makes a chord).
  const staffVoices = getVoice(s.score, voice).part.voices.filter((v) => v.staff === getVoice(s.score, voice).voice.staff);
  const busy =
    timeChanged &&
    (collision(events, old.id, onset, add(onset, duration)) !== undefined ||
      staffVoices.some((v) => v.id !== voice.voiceId && v.events.some((e) => eq(e.onset, onset) && eq(e.duration, duration))));
  const elsewhere = edit.into !== undefined && edit.into.voiceId !== voice.voiceId;

  let tones: readonly Tone[] = old.tones;
  if (edit.tone) {
    const target = old.tones.find((t) => t.id === edit.tone!.id);
    if (!target) return refuse(s, 'Den Ton gibt es nicht mehr.');
    if (edit.tone.midi < MIDI_LOW || edit.tone.midi > MIDI_HIGH) return refuse(s, 'Dieser Ton ist zu hoch oder zu tief.');
    if (old.tones.some((t) => t.id !== target.id && midiOf(t.pitch) === edit.tone!.midi)) {
      return refuse(s, 'Dieser Ton liegt schon im Akkord.');
    }
    if (midiOf(target.pitch) !== edit.tone.midi) {
      const pitch = spellMidi(edit.tone.midi, keyAt(s.score, onset));
      tones = old.tones
        .map((t) => (t.id === target.id ? { ...t, pitch } : t))
        .sort((a, b) => midiOf(a.pitch) - midiOf(b.pitch));
    }
  }

  const toneId = edit.tone?.id ?? (s.selection?.kind === 'event' && s.selection.eventId === old.id ? s.selection.toneId : undefined);
  const alone = edit.only !== undefined && old.tones.length > 1 ? old.tones.find((t) => t.id === edit.only) : undefined;
  if (busy || elsewhere || (alone !== undefined && timeChanged)) {
    // The time is taken (or the drop was onto a note of another voice): join that note as a chord, else take another voice.
    const home = getVoice(s.score, voice).voice;
    // One tone of a chord leaves it and the rest stays; otherwise the whole event moves.
    const left = alone ? tones.filter((t) => t.id !== alone.id) : [];
    const base = alone
      ? updateEvents(s.score, voice, (list) => list.map((e) => (e.id === old.id ? { ...e, tones: left } : e)))
      : withoutEvent(s.score, voice, old.id);
    const moving = alone ? tones.filter((t) => t.id === alone.id) : tones;
    const placed = placeTones(base, s.nextId, { partId: voice.partId, staff: home.staff }, edit.into ?? voice, moving, onset, duration);
    if (typeof placed === 'string') return refuse(s, placed);
    const caret = s.caret && placed.score.parts.find((p) => p.id === s.caret!.partId)?.voices.some((v) => v.id === s.caret!.voiceId) ? s.caret : null;
    return {
      ...s,
      score: placed.score,
      nextId: placed.nextId,
      caret,
      selection: { kind: 'event', ...placed.voice, eventId: placed.eventId, ...(toneId ? { toneId } : {}) },
      message: null,
    };
  }
  const selection: Selection = { kind: 'event', ...voice, eventId: old.id, ...(toneId ? { toneId } : {}) };
  // Nothing differs (e.g. a drag back to where it started): same score object, so no undo step.
  if (!timeChanged && tones === old.tones) return { ...s, selection, message: null };
  const next: NoteEvent = { ...old, onset, duration, tones };
  const score = updateEvents(s.score, voice, (list) => insertSorted(list.filter((e) => e.id !== old.id), next));
  return { ...s, score, selection, message: null };
}

function remove(s: EditorState, edit: Extract<RollEdit, { kind: 'delete' }>): EditorState {
  const { voice } = edit;
  const old = getVoice(s.score, voice).voice.events.find((e) => e.id === edit.eventId);
  if (!old) return refuse(s, 'Die Note gibt es nicht mehr.');
  const only = edit.toneId !== undefined && old.tones.length > 1;
  if (only && !old.tones.some((t) => t.id === edit.toneId)) return refuse(s, 'Den Ton gibt es nicht mehr.');
  const score = updateEvents(s.score, voice, (list) =>
    only
      ? list.map((e) => (e.id === old.id ? { ...e, tones: e.tones.filter((t) => t.id !== edit.toneId) } : e))
      : list.filter((e) => e.id !== old.id),
  );
  const selection: Selection = only
    ? { kind: 'event', ...voice, eventId: old.id }
    : { kind: 'gap', ...voice, time: old.onset };
  return { ...s, score, selection, message: null };
}

function connect(s: EditorState, edit: Extract<RollEdit, { kind: 'connect' }>): EditorState {
  const spots = locateTones(s.score);
  const x = spots.get(edit.a);
  const y = spots.get(edit.b);
  if (!x || !y || edit.a === edit.b) return refuse(s, 'Diese zwei Balken lassen sich nicht verbinden.');
  const [from, to] = lt(x.event.onset, y.event.onset) ? [x, y] : [y, x];
  if (eq(from.event.onset, to.event.onset)) return refuse(s, 'Gleichzeitige Töne lassen sich nicht durch Gleiten verbinden.');
  const links = linksOf(s.score);
  const same = links.find((l) => l.from === from.tone.id && l.to === to.tone.id);
  if (same) return { ...s, score: withLinks(s.score, links.filter((l) => l !== same)), message: 'Verbindung gelöst.' };
  if (links.some((l) => l.to === to.tone.id)) return refuse(s, 'In diesen Ton kommt schon eine Verbindung an. Erst die andere lösen.');
  const kept = links.filter((l) => l.from !== from.tone.id); // one connection leaves a tone; the new glide replaces it
  const link = { id: freshLinkId(s.score, kept), kind: 'slide' as const, from: from.tone.id, to: to.tone.id };
  return { ...s, score: withLinks(s.score, [...kept, link]), message: 'Gleiten gesetzt – die Zeit dazwischen ist die Gleitdauer.' };
}

function disconnect(s: EditorState, edit: Extract<RollEdit, { kind: 'disconnect' }>): EditorState {
  const links = linksOf(s.score);
  if (!links.some((l) => l.id === edit.id)) return refuse(s, 'Die Verbindung gibt es nicht mehr.');
  return { ...s, score: withLinks(s.score, links.filter((l) => l.id !== edit.id)), message: 'Verbindung gelöst.' };
}

const sameCurve = (a: Curve | undefined, b: Curve | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && a.length === b.length && a.every((p, i) => p.x === b[i]!.x && p.y === b[i]!.y));

function shape(s: EditorState, edit: Extract<RollEdit, { kind: 'shape' }>): EditorState {
  const spot = locateTones(s.score).get(edit.tone);
  if (!spot) return refuse(s, 'Den Ton gibt es nicht mehr.');
  const { volume: _v, curve: _c, ...plain } = spot.tone;
  const volume = edit.volume === undefined ? spot.tone.volume : Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, Math.round(edit.volume)));
  const curve = edit.curve === undefined ? spot.tone.curve : edit.curve === null ? undefined : tidyCurve('level', edit.curve);
  const tone: Tone = {
    ...plain,
    ...(volume !== undefined && volume !== DEFAULT_VOLUME ? { volume } : {}),
    ...(curve && !isDefaultCurve('level', curve) ? { curve } : {}),
  };
  if (tone.volume === spot.tone.volume && sameCurve(tone.curve, spot.tone.curve)) return { ...s, message: null }; // nothing differs: no undo step
  const ref: VoiceRef = { partId: spot.part.id, voiceId: spot.voice.id };
  const score = updateEvents(s.score, ref, (list) =>
    list.map((e) => (e.id === spot.event.id ? { ...e, tones: e.tones.map((t) => (t.id === tone.id ? tone : t)) } : e)),
  );
  return { ...s, score, message: null };
}

function blend(s: EditorState, edit: Extract<RollEdit, { kind: 'blend' }>): EditorState {
  const links = linksOf(s.score);
  const link = links.find((l) => l.id === edit.id);
  if (!link) return refuse(s, 'Die Verbindung gibt es nicht mehr.');
  if (link.kind !== 'slide') return refuse(s, 'Nur ein Gleiten hat einen Verlauf.');
  const curve = edit.curve === null ? undefined : tidyCurve('glide', edit.curve);
  const next = curve && !isDefaultCurve('glide', curve) ? curve : undefined;
  if (sameCurve(next, link.curve)) return { ...s, message: null };
  const { curve: _old, ...plain } = link;
  return { ...s, score: withLinks(s.score, links.map((l) => (l.id === link.id ? { ...plain, ...(next ? { curve: next } : {}) } : l))), message: null };
}

/** Applies one roll edit. A refused edit returns the state unchanged except for the message. */
export function applyRollEdit(s: EditorState, edit: RollEdit): EditorState {
  const next = ((): EditorState => {
    switch (edit.kind) {
      case 'create':
        return create(s, edit);
      case 'change':
        return change(s, edit);
      case 'delete':
        return remove(s, edit);
      case 'connect':
        return connect(s, edit);
      case 'disconnect':
        return disconnect(s, edit);
      case 'shape':
        return shape(s, edit);
      case 'blend':
        return blend(s, edit);
    }
  })();
  return withValidLinks(s, next); // tied or glided notes may not be pulled apart; deleted tones take their links along
}
