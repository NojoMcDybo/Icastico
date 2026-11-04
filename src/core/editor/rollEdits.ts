/**
 * Structured edits from the piano roll (and the matching keyboard commands):
 * plain data in, new EditorState out. Like every command they are pure
 * functions, so one drag is just many previews of one edit and one undo step.
 *
 * Rules:
 * - Times lie on the 1/64 grid (the finest supported value); notes of N-tuplets are not moved yet.
 * - A voice never overlaps itself: an edit that would run into another note is refused
 *   with a message and changes nothing (no silent overwriting while dragging).
 * - A chord keeps its notes together: time edits move the whole event, a pitch edit only one tone.
 *   (Detaching a single tone is a separate step.)
 */
import { type Fraction, ZERO, add, eq, frac, isDyadic, le, lt } from '../time';
import { type NoteEvent, type Tone, eventEnd, freshToneId, keyAt } from '../model';
import { midiOf, spellMidi } from '../pitch';
import {
  type EditorState,
  type Selection,
  type VoiceRef,
  freshEventId,
  getVoice,
  updateEvents,
} from './state';
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
    }
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

function create(s: EditorState, edit: Extract<RollEdit, { kind: 'create' }>): EditorState {
  const { voice, onset, duration, midi } = edit;
  if (lt(onset, ZERO) || !onGrid(onset) || !onGrid(duration) || le(duration, ZERO)) return refuse(s, 'Dort kann keine Note stehen (außerhalb des Rasters).');
  if (midi < MIDI_LOW || midi > MIDI_HIGH) return refuse(s, 'Dieser Ton ist zu hoch oder zu tief.');
  const events = getVoice(s.score, voice).voice.events;
  if (collision(events, null, onset, add(onset, duration))) return refuse(s, 'Dort liegt schon eine Note.');
  const [id, nextId] = freshEventId(s.score, voice, s.nextId);
  const pitch = spellMidi(midi, keyAt(s.score, onset));
  const event: NoteEvent = { id, onset, duration, tones: [{ id: freshToneId(s.score, id), pitch }] };
  const score = updateEvents(s.score, voice, (list) => insertSorted(list, event));
  return {
    ...s,
    score,
    nextId,
    selection: { kind: 'event', ...voice, eventId: id, toneId: event.tones[0]!.id },
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
    if (collision(events, old.id, onset, add(onset, duration))) return refuse(s, 'Dort liegt schon eine Note.');
  }

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

/** Applies one roll edit. A refused edit returns the state unchanged except for the message. */
export function applyRollEdit(s: EditorState, edit: RollEdit): EditorState {
  switch (edit.kind) {
    case 'create':
      return create(s, edit);
    case 'change':
      return change(s, edit);
    case 'delete':
      return remove(s, edit);
  }
}
