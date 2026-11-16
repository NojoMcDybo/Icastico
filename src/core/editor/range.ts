/**
 * Marking a passage: from the selected note to another note of the same voice (Alt+Shift+←/→, Shift+click,
 * Strg+A). A marked passage can be deleted (it becomes rests), cut, copied and pasted, and played in a loop.
 * Pure functions on the editor state; the clipboard itself lives in the workstation.
 */
import { DEFAULT_VOLUME, MAX_VOLUME, MIN_VOLUME, volumeMark } from '../curve';
import { type Fraction, add, eq, le, lt, sub } from '../time';
import { type NoteEvent, type Part, type Score, eventEnd } from '../model';
import { type Pitch, midiOf } from '../pitch';
import { playableOnGuitar } from '../tab';
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

/** Marks the notes from `firstId` to `lastId` of a voice and selects the first (a frame drawn over the notes, a double click on a bar). */
export function markFromTo(s: EditorState, ref: VoiceRef, firstId: string, lastId: string): EditorState {
  const events = getVoice(s.score, ref).voice.events;
  if (!events.some((e) => e.id === firstId) || !events.some((e) => e.id === lastId)) return s;
  const next: EditorState = {
    ...s,
    caret: null,
    selection: { kind: 'event', partId: ref.partId, voiceId: ref.voiceId, eventId: firstId },
    range: { partId: ref.partId, voiceId: ref.voiceId, anchor: firstId, head: lastId },
  };
  const span = rangeSpan(next);
  return { ...next, message: span ? `${span.notes} ${span.notes === 1 ? 'Note' : 'Noten'} markiert` : null };
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

/** One step of louder/softer: half a dynamic step (the steps of `volumeMark` are 16 apart). */
export const VOLUME_STEP = 8;

/** Makes the marked passage (else the selected note, or the selected chord tone) louder or softer by `steps` × 8. */
export function changeVolume(s: EditorState, steps: number): EditorState {
  const span = rangeSpan(s);
  const sel = s.selection;
  if (!span && sel?.kind !== 'event') return say(s, 'Erst eine Note auswählen oder einen Bereich markieren.');
  const part = span ? partOf(s.score, span.partId) : undefined;
  const refs: { ref: VoiceRef; ids: ReadonlySet<string> | null }[] = [];
  if (span && part) {
    for (const v of part.voices) {
      const inside = v.events.filter((e) => le(span.from, e.onset) && lt(e.onset, span.to)).map((e) => e.id);
      if (inside.length > 0) refs.push({ ref: { partId: part.id, voiceId: v.id }, ids: new Set(inside) });
    }
  } else if (sel?.kind === 'event') refs.push({ ref: sel, ids: new Set([sel.eventId]) });
  // A single clicked chord tone is changed alone, a whole note otherwise.
  const only = !span && sel?.kind === 'event' ? sel.toneId : undefined;
  const clamp = (v: number): number => Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, v));
  let score = s.score;
  let changed = 0;
  let shown: number | null = null;
  for (const { ref, ids } of refs) {
    score = updateEvents(score, ref, (events) =>
      events.map((e) => {
        if (!ids!.has(e.id)) return e;
        const alone = only !== undefined && e.tones.length > 1 && e.tones.some((t) => t.id === only) ? only : undefined;
        const tones = e.tones.map((t) => {
          if (alone !== undefined && t.id !== alone) return t;
          const now = t.volume ?? DEFAULT_VOLUME;
          const next = clamp(now + steps * VOLUME_STEP);
          if (next === now) return t;
          changed++;
          shown ??= next;
          const { volume: _old, ...rest } = t;
          return next === DEFAULT_VOLUME ? rest : { ...rest, volume: next };
        });
        return { ...e, tones };
      }),
    );
  }
  if (changed === 0) return say(s, steps > 0 ? 'Lauter geht es nicht.' : 'Leiser geht es nicht.');
  return { ...s, score, message: `${changed} ${changed === 1 ? 'Ton' : 'Töne'} ${steps > 0 ? 'lauter' : 'leiser'} (${volumeMark(shown!)} · ${shown})` };
}

// ── Clipboard ──────────────────────────────────────────────────────────────

export interface ClipEvent {
  /** Distance from the start of the passage. */
  readonly at: Fraction;
  readonly duration: Fraction;
  readonly tones: readonly { readonly pitch: Pitch; readonly volume?: number }[];
  readonly marks?: readonly string[];
  readonly lyric?: string;
  readonly verses?: NoteEvent['verses'];
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
  ...(e.verses ? { verses: e.verses } : {}),
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
    // A part with fewer voices (a tablature staff has one) takes the extra copied voices into its last voice, where there is room.
    const overflow = base + i >= part.voices.length;
    const voice = part.voices[Math.min(base + i, part.voices.length - 1)];
    if (!voice) return;
    const ref: VoiceRef = { partId: part.id, voiceId: voice.id };
    let made: NoteEvent[] = events.map((ce) => {
      const [id, next] = freshEventId(score, ref, nextId);
      nextId = next;
      return {
        id,
        onset: add(where.at, ce.at),
        duration: ce.duration,
        tones: ce.tones.map((t, k) => ({ id: `${id}-t${k + 1}`, pitch: t.pitch, ...(t.volume !== undefined ? { volume: t.volume } : {}) })),
        ...(ce.marks ? { marks: ce.marks } : {}),
        ...(ce.lyric ? { lyric: ce.lyric } : {}),
        ...(ce.verses ? { verses: ce.verses } : {}),
      };
    });
    pasted += made.length;
    if (made.length > 0 && !first) first = { ref, id: made[0]!.id };
    score = updateEvents(score, ref, (list) => {
      // Extra copied voices go into the last voice of a part with fewer voices (a tablature staff has one): nothing is lost.
      if (overflow) return foldInto(list, made);
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
    message: `${pasted} ${pasted === 1 ? 'Note' : 'Noten'} eingefügt${pasteRemarks(score, part.id, where.ref)}`,
  };
}

/**
 * Puts notes into a voice that already has notes, without losing any: notes that start together become one chord
 * (the shorter length), a note that overlaps another one cuts the earlier one where the later one starts.
 */
function foldInto(list: readonly NoteEvent[], made: readonly NoteEvent[]): NoteEvent[] {
  let out = [...list];
  for (const ev of made) {
    const same = out.findIndex((x) => eq(x.onset, ev.onset));
    if (same >= 0) {
      const x = out[same]!;
      const have = new Set(x.tones.map((t) => midiOf(t.pitch)));
      out[same] = { ...x, duration: lt(ev.duration, x.duration) ? ev.duration : x.duration, tones: [...x.tones, ...ev.tones.filter((t) => !have.has(midiOf(t.pitch)))] };
      continue;
    }
    const cut = out.map((x) => (lt(x.onset, ev.onset) && lt(ev.onset, eventEnd(x)) ? { ...x, duration: sub(ev.onset, x.onset) } : x));
    const next = cut.find((x) => lt(ev.onset, x.onset));
    out = insertSorted(cut, next && lt(next.onset, eventEnd(ev)) ? { ...ev, duration: sub(next.onset, ev.onset) } : ev);
  }
  return out;
}

/** What the user should know after a paste: tones a guitar or tablature staff cannot play. */
function pasteRemarks(score: Score, partId: string, ref: VoiceRef): string {
  const remarks: string[] = [];
  const part = partOf(score, partId);
  if (part.instrument === 'guitar' || part.instrument === 'tab') {
    const out = getVoice(score, ref).voice.events.flatMap((e) => e.tones).filter((t) => !playableOnGuitar(midiOf(t.pitch))).length;
    if (out > 0) remarks.push(`${out} ${out === 1 ? 'Ton ist' : 'Töne sind'} für die Gitarre zu tief oder zu hoch und ${out === 1 ? 'hat' : 'haben'} keine Bundzahl`);
  }
  return remarks.length ? ' – ' + remarks.join('; ') : '';
}
