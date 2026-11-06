/**
 * Marking a passage: from the selected note to another note of the same voice (Alt+Shift+←/→, Shift+click,
 * Strg+A). A marked passage can be deleted (it becomes rests), cut, copied and pasted, and played in a loop.
 * Pure functions on the editor state; the clipboard itself lives in the workstation.
 */
import { type Fraction, add, le, lt, sub } from '../time';
import { type NoteEvent, type Part, type Score, eventEnd } from '../model';
import { type Pitch } from '../pitch';
import { type EditorState, type VoiceRef, freshEventId, getVoice, updateEvents } from './state';
import { clearRange, insertSorted, shiftFrom } from './voiceOps';

/** The marked passage: the selected note (the anchor) and the note the other end sits on. */
export interface RangeSel {
  readonly partId: string;
  readonly voiceId: string;
  readonly anchor: string;
  readonly head: string;
}

/** The time the marked passage covers (in every voice of its part). */
export interface Span {
  readonly partId: string;
  readonly voiceId: string;
  readonly from: Fraction;
  readonly to: Fraction;
  /** Number of notes in the voice the passage was marked in. */
  readonly notes: number;
}

const say = (s: EditorState, message: string): EditorState => ({ ...s, message });

/** The passage that is marked right now, or null: it only counts while its anchor note is still the selected one. */
export function rangeSpan(s: EditorState): Span | null {
  const r = s.range;
  const sel = s.selection;
  if (!r || sel?.kind !== 'event' || sel.eventId !== r.anchor || sel.voiceId !== r.voiceId || sel.partId !== r.partId) return null;
  const part = s.score.parts.find((p) => p.id === r.partId);
  const events = part?.voices.find((v) => v.id === r.voiceId)?.events;
  if (!events) return null;
  const a = events.findIndex((e) => e.id === r.anchor);
  const h = events.findIndex((e) => e.id === r.head);
  if (a < 0 || h < 0) return null;
  const [lo, hi] = a <= h ? [a, h] : [h, a];
  return { partId: r.partId, voiceId: r.voiceId, from: events[lo]!.onset, to: eventEnd(events[hi]!), notes: hi - lo + 1 };
}

/** Moves the free end of the marked passage one note to the right (+1) or left (-1); the first press marks two notes. */
export function extendRange(s: EditorState, dir: number): EditorState {
  const sel = s.selection;
  if (sel?.kind !== 'event') return say(s, 'Erst eine Note auswählen, dann den Bereich mit Alt+Umschalt+Pfeil erweitern.');
  const events = getVoice(s.score, sel).voice.events;
  const current = rangeSpan(s) ? s.range! : { partId: sel.partId, voiceId: sel.voiceId, anchor: sel.eventId, head: sel.eventId };
  const i = events.findIndex((e) => e.id === current.head);
  const j = Math.max(0, Math.min(events.length - 1, i + (dir > 0 ? 1 : -1)));
  if (i < 0 || j === i) return say(s, dir > 0 ? 'Das ist die letzte Note.' : 'Das ist die erste Note.');
  const next = { ...s, range: { ...current, head: events[j]!.id } };
  const span = rangeSpan(next);
  return { ...next, message: span ? `${span.notes} Noten markiert` : null };
}

/** Marks from the selected note to the note `eventId` of the same voice (Shift + click). */
export function rangeTo(s: EditorState, ref: VoiceRef, eventId: string): EditorState {
  const sel = s.selection;
  if (sel?.kind !== 'event' || sel.partId !== ref.partId || sel.voiceId !== ref.voiceId) return s;
  const events = getVoice(s.score, sel).voice.events;
  if (!events.some((e) => e.id === eventId)) return s;
  const next = { ...s, range: { partId: ref.partId, voiceId: ref.voiceId, anchor: sel.eventId, head: eventId } };
  const span = rangeSpan(next);
  return { ...next, message: span ? `${span.notes} Noten markiert` : null };
}

/** Marks the whole voice of the selected note (Strg+A). */
export function selectAllNotes(s: EditorState): EditorState {
  const sel = s.selection;
  const voice = sel ? getVoice(s.score, sel).voice : s.caret ? getVoice(s.score, s.caret).voice : undefined;
  const ref = sel ?? s.caret;
  if (!voice || !ref || voice.events.length === 0) return say(s, 'Hier gibt es noch keine Noten zu markieren.');
  const first = voice.events[0]!;
  const last = voice.events[voice.events.length - 1]!;
  const next: EditorState = {
    ...s,
    caret: null,
    selection: { kind: 'event', partId: ref.partId, voiceId: ref.voiceId, eventId: first.id },
    range: { partId: ref.partId, voiceId: ref.voiceId, anchor: first.id, head: last.id },
  };
  return { ...next, message: `${voice.events.length} Noten markiert` };
}

const partOf = (score: Score, id: string): Part => score.parts.find((p) => p.id === id)!;

/** Deletes the marked passage in every voice of its part: the notes become rests. */
export function deleteRange(s: EditorState): EditorState {
  const span = rangeSpan(s);
  if (!span) return s;
  const part = partOf(s.score, span.partId);
  let score = s.score;
  for (const v of part.voices) score = updateEvents(score, { partId: part.id, voiceId: v.id }, (events) => clearRange(events, span.from, span.to));
  return {
    ...s,
    score,
    range: null,
    selection: { kind: 'gap', partId: span.partId, voiceId: span.voiceId, time: span.from },
    message: `${span.notes} ${span.notes === 1 ? 'Note' : 'Noten'} gelöscht`,
  };
}

// ── Clipboard ──────────────────────────────────────────────────────────────

export interface ClipEvent {
  /** Distance from the start of the passage. */
  readonly at: Fraction;
  readonly duration: Fraction;
  readonly tones: readonly { readonly pitch: Pitch; readonly volume?: number }[];
  readonly marks?: readonly string[];
  readonly lyric?: string;
}

/** What was copied: the length of the passage and, per voice of the part (in order), its notes. */
export interface Clip {
  readonly length: Fraction;
  readonly voices: readonly (readonly ClipEvent[])[];
}

const clipOf = (e: NoteEvent, from: Fraction, to: Fraction): ClipEvent => ({
  at: sub(e.onset, from),
  duration: le(eventEnd(e), to) ? e.duration : sub(to, e.onset),
  tones: e.tones.map((t) => ({ pitch: t.pitch, ...(t.volume !== undefined ? { volume: t.volume } : {}) })),
  ...(e.marks ? { marks: e.marks } : {}),
  ...(e.lyric ? { lyric: e.lyric } : {}),
});

/** The marked passage – or the one selected note – as something that can be pasted; null if nothing is selected. */
export function copyClip(s: EditorState): Clip | null {
  let span = rangeSpan(s);
  if (!span && s.selection?.kind === 'event') {
    const sel = s.selection;
    const e = getVoice(s.score, sel).voice.events.find((x) => x.id === sel.eventId);
    if (e) span = { partId: sel.partId, voiceId: sel.voiceId, from: e.onset, to: eventEnd(e), notes: 1 };
  }
  if (!span) return null;
  const { from, to } = span;
  const part = partOf(s.score, span.partId);
  return {
    length: sub(to, from),
    voices: part.voices.map((v) => v.events.filter((e) => le(from, e.onset) && lt(e.onset, to)).map((e) => clipOf(e, from, to))),
  };
}

/** Cut = copy, then delete. */
export function cutClip(s: EditorState): { clip: Clip; state: EditorState } | null {
  const clip = copyClip(s);
  if (!clip) return null;
  return { clip, state: rangeSpan(s) ? deleteRange(s) : deleteRange({ ...s, range: selectedOnly(s) }) };
}

/** A range of just the selected note, so cut can delete it the same way. */
function selectedOnly(s: EditorState): RangeSel | null {
  const sel = s.selection;
  return sel?.kind === 'event' ? { partId: sel.partId, voiceId: sel.voiceId, anchor: sel.eventId, head: sel.eventId } : null;
}

/** Puts the clip at the caret (or the selected note); what is there is overwritten, or pushed aside in insert mode. */
export function pasteClip(s: EditorState, clip: Clip): EditorState {
  const where: { ref: VoiceRef; at: Fraction } | null = s.caret
    ? { ref: s.caret, at: s.caret.time }
    : s.selection?.kind === 'event'
      ? (() => {
          const sel = s.selection;
          const e = getVoice(s.score, sel).voice.events.find((x) => x.id === sel.eventId);
          return e ? { ref: sel, at: e.onset } : null;
        })()
      : s.selection?.kind === 'gap'
        ? { ref: s.selection, at: s.selection.time }
        : null;
  if (!where) return say(s, 'Erst eine Stelle wählen, an der eingefügt werden soll.');
  const part = partOf(s.score, where.ref.partId);
  // One copied voice goes into the voice that is selected, several into the voices of the part from the top.
  const base = clip.voices.length === 1 ? Math.max(0, part.voices.findIndex((v) => v.id === where.ref.voiceId)) : 0;
  const end = add(where.at, clip.length);
  let score = s.score;
  let nextId = s.nextId;
  let first: { ref: VoiceRef; id: string } | null = null;
  let pasted = 0;
  clip.voices.forEach((events, i) => {
    const voice = part.voices[base + i];
    if (!voice) return;
    const ref: VoiceRef = { partId: part.id, voiceId: voice.id };
    const made: NoteEvent[] = events.map((ce) => {
      const [id, next] = freshEventId(score, ref, nextId);
      nextId = next;
      pasted++;
      return {
        id,
        onset: add(where.at, ce.at),
        duration: ce.duration,
        tones: ce.tones.map((t, k) => ({ id: `${id}-t${k + 1}`, pitch: t.pitch, ...(t.volume !== undefined ? { volume: t.volume } : {}) })),
        ...(ce.marks ? { marks: ce.marks } : {}),
        ...(ce.lyric ? { lyric: ce.lyric } : {}),
      };
    });
    if (made.length > 0 && !first) first = { ref, id: made[0]!.id };
    score = updateEvents(score, ref, (list) => {
      const room = s.input.insert ? shiftFrom(list, where.at, clip.length) : clearRange(list, where.at, end);
      return made.reduce<NoteEvent[]>((acc, ev) => insertSorted(acc, ev), [...room]);
    });
  });
  if (pasted === 0) return say(s, 'Es gibt nichts einzufügen.');
  const selection = first ? ({ kind: 'event', ...(first as { ref: VoiceRef; id: string }).ref, eventId: (first as { ref: VoiceRef; id: string }).id } as const) : s.selection;
  return {
    ...s,
    score,
    nextId,
    range: null,
    caret: s.caret ? { ...s.caret, time: end } : s.caret,
    selection,
    message: `${pasted} ${pasted === 1 ? 'Note' : 'Noten'} eingefügt`,
  };
}
