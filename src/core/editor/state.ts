/**
 * Editor state: score + caret + selection + input settings.
 *
 * Everything is immutable. Commands (commands.ts) are pure functions
 * EditorState → EditorState; undo/redo (history.ts) just keeps old states.
 */
import { type Fraction, ZERO, add, frac } from '../time';
import { type NoteEvent, type Part, type Score, type Voice, clefAt, eventEnd } from '../model';
import type { Pitch } from '../pitch';
import type { RangeSel } from './range';

export interface VoiceRef {
  readonly partId: string;
  readonly voiceId: string;
}

/** Where the next entered note goes. `null` in EditorState = not in input mode. */
export interface Caret extends VoiceRef {
  readonly time: Fraction;
}

export type Selection =
  /** `toneId` = one tone of the chord (set by a click on that notehead or piano-roll bar); absent = the whole event. */
  | (VoiceRef & { readonly kind: 'event'; readonly eventId: string; readonly toneId?: string })
  | (VoiceRef & { readonly kind: 'gap'; readonly time: Fraction });

export interface InputSettings {
  /** Undotted value of the next note, e.g. 1/4. */
  readonly base: Fraction;
  readonly dots: 0 | 1;
  /** Insert mode shifts following music instead of overwriting it. */
  readonly insert: boolean;
  /** Tie the next entered note to the previous one (Finale: T). */
  readonly pendingTie: boolean;
  /** Chord mode (Logic: `): the next notes are stacked on one place instead of following each other. */
  readonly chord: boolean;
  /** The chord being built in chord mode (its first note), if any. */
  readonly chordEvent: string | null;
  /** Tuplet mode (ADR 0020): 0 = off, else the number of notes (3 = triplets) squeezed into the time of the next lower power of two. */
  readonly tuplet: 0 | 3 | 5 | 7;
  /**
   * The preview note ("ghost") of Finale's numpad typing: the pitches Enter would put at the caret, changed with
   * the arrow keys and the interval keys. Null = not touched yet: the notes before the caret are repeated.
   */
  readonly ghost: readonly Pitch[] | null;
  /** An accidental for the next note only (Logic: Shift+3 = #): 1 = sharp, −1 = flat; absent = none. */
  readonly nextAlter?: -1 | 1;
  /** Octaves the next note is moved from where it would land (Logic: X / Z); absent = none. */
  readonly octaveShift?: number;
}

export interface EditorState {
  readonly score: Score;
  /** A marked passage (see `rangeSpan`: it only counts while its anchor note is the selected one). */
  readonly range?: RangeSel | null;
  readonly caret: Caret | null;
  readonly selection: Selection | null;
  readonly input: InputSettings;
  /** Short German feedback for the status bar, e.g. why a command did nothing. */
  readonly message: string | null;
  /** Counter for new event ids. */
  readonly nextId: number;
}

export function createEditorState(score: Score): EditorState {
  return {
    score,
    caret: null,
    selection: null,
    input: { base: frac(1, 4), dots: 0, insert: false, pendingTie: false, chord: false, chordEvent: null, tuplet: 0, ghost: null },
    message: null,
    nextId: 1,
  };
}

/** Length of the next note as written: base value with optional dot. */
export const writtenInputLength = (input: InputSettings): Fraction =>
  input.dots === 1 ? add(input.base, frac(input.base.n, input.base.d * 2)) : input.base;

/** Length of the next note: the written value, shortened in tuplet mode (a triplet eighth is 1/12). */
export const inputLength = (input: InputSettings): Fraction => {
  const written = writtenInputLength(input);
  if (input.tuplet === 0) return written;
  const numbase = input.tuplet === 3 ? 2 : 4;
  return frac(written.n * numbase, written.d * input.tuplet);
};

export function getVoice(score: Score, ref: VoiceRef): { part: Part; voice: Voice } {
  const part = score.parts.find((p) => p.id === ref.partId);
  const voice = part?.voices.find((v) => v.id === ref.voiceId);
  if (!part || !voice) throw new Error(`Stimme ${ref.partId}/${ref.voiceId} nicht gefunden`);
  return { part, voice };
}

/** An event id not used in the voice yet: "<voice>-n<counter>"; returns it and the next counter. */
export function freshEventId(score: Score, ref: VoiceRef, counter: number): [string, number] {
  const used = new Set(getVoice(score, ref).voice.events.map((e) => e.id));
  let n = counter;
  while (used.has(`${ref.voiceId}-n${n}`)) n++;
  return [`${ref.voiceId}-n${n}`, n + 1];
}

/** All voices in score order (top staff first). */
export function allVoiceRefs(score: Score): VoiceRef[] {
  return score.parts.flatMap((p) =>
    [...p.voices].sort((a, b) => a.staff - b.staff).map((v) => ({ partId: p.id, voiceId: v.id })),
  );
}

export const sameVoice = (a: VoiceRef, b: VoiceRef): boolean => a.partId === b.partId && a.voiceId === b.voiceId;

/** Returns a new score with one voice's events replaced. */
export function updateEvents(
  score: Score,
  ref: VoiceRef,
  fn: (events: readonly NoteEvent[]) => readonly NoteEvent[],
): Score {
  return {
    ...score,
    parts: score.parts.map((p) =>
      p.id !== ref.partId
        ? p
        : { ...p, voices: p.voices.map((v) => (v.id !== ref.voiceId ? v : { ...v, events: fn(v.events) })) },
    ),
  };
}

/** End of the last event in a voice. */
export function voiceEnd(voice: Voice): Fraction {
  const last = voice.events[voice.events.length - 1];
  return last ? eventEnd(last) : ZERO;
}

/** The sounding middle-line pitch of the staff a voice is written on, in the clef that is in force at `time` (ADR 0040). */
export function staffCenter(score: Score, ref: VoiceRef, time: Fraction = ZERO): Pitch {
  const { part, voice } = getVoice(score, ref);
  return clefAt(part, voice.staff, time).center;
}
