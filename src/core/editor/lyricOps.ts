/**
 * Syllables as things of their own (ADR 0033): choose the syllable of a note or of a marked passage, then take them
 * away, copy, cut, paste or move one onto another note. Pure functions on the editor state; the clipboard lives in
 * the workstation. The syllable is `NoteEvent.lyric`; nothing else of the notes changes.
 */
import { le, lt } from '../time';
import type { NoteEvent } from '../model';
import { rangeSpan } from './range';
import { type EditorState, type VoiceRef, getVoice, updateEvents } from './state';

/** What a copied run of syllables holds: one entry per note, null = a note without syllable. */
export type SyllableClip = readonly (string | null)[];

const say = (s: EditorState, message: string): EditorState => ({ ...s, message });

const withLyric = (e: NoteEvent, syllable: string | null): NoteEvent => {
  const { lyric: _old, ...rest } = e;
  return syllable ? { ...rest, lyric: syllable } : rest;
};

/** The notes whose syllables are chosen: the marked passage, else the selected note. */
export function chosenNotes(s: EditorState): { ref: VoiceRef; events: readonly NoteEvent[] } | null {
  const sel = s.selection;
  if (sel?.kind !== 'event') return null;
  const ref = { partId: sel.partId, voiceId: sel.voiceId };
  const events = getVoice(s.score, ref).voice.events;
  const span = rangeSpan(s);
  const picked = span && span.voiceId === sel.voiceId ? events.filter((e) => le(span.from, e.onset) && lt(e.onset, span.to)) : events.filter((e) => e.id === sel.eventId);
  return picked.length > 0 ? { ref, events: picked } : null;
}

const count = (n: number): string => `${n} ${n === 1 ? 'Silbe' : 'Silben'}`;

/** Takes the chosen syllables away (the notes stay). */
export function clearSyllables(s: EditorState): EditorState {
  const chosen = chosenNotes(s);
  if (!chosen) return say(s, 'Erst eine Silbe anklicken.');
  const ids = new Set(chosen.events.filter((e) => e.lyric !== undefined).map((e) => e.id));
  if (ids.size === 0) return say(s, 'Hier steht keine Silbe.');
  return { ...s, score: updateEvents(s.score, chosen.ref, (events) => events.map((e) => (ids.has(e.id) ? withLyric(e, null) : e))), message: `${count(ids.size)} entfernt` };
}

/** The chosen syllables as something that can be pasted; null if there is nothing chosen. */
export function copySyllables(s: EditorState): SyllableClip | null {
  const chosen = chosenNotes(s);
  return chosen ? chosen.events.map((e) => e.lyric ?? null) : null;
}

/** Puts the syllables on the notes from the selected one on, one per note; notes beyond the end of the voice get none. */
export function pasteSyllables(s: EditorState, clip: SyllableClip): EditorState {
  const sel = s.selection;
  if (sel?.kind !== 'event') return say(s, 'Erst die Note anklicken, bei der die Silben beginnen sollen.');
  const ref = { partId: sel.partId, voiceId: sel.voiceId };
  const events = getVoice(s.score, ref).voice.events;
  const start = events.findIndex((e) => e.id === sel.eventId);
  if (start < 0) return s;
  const put = new Map<string, string | null>();
  clip.forEach((syllable, i) => {
    const target = events[start + i];
    if (target) put.set(target.id, syllable);
  });
  return { ...s, score: updateEvents(s.score, ref, (list) => list.map((e) => (put.has(e.id) ? withLyric(e, put.get(e.id)!) : e))), message: `${count(put.size)} eingefügt` };
}

/** Moves the syllable of one note onto another note of the voice (what was there is replaced); the old note is left without. */
export function moveSyllable(s: EditorState, ref: VoiceRef, from: string, to: string): EditorState {
  const events = getVoice(s.score, ref).voice.events;
  const source = events.find((e) => e.id === from);
  if (!source || source.lyric === undefined || !events.some((e) => e.id === to) || from === to) return s;
  const syllable = source.lyric;
  return {
    ...s,
    score: updateEvents(s.score, ref, (list) => list.map((e) => (e.id === from ? withLyric(e, null) : e.id === to ? withLyric(e, syllable) : e))),
    selection: { kind: 'event', ...ref, eventId: to },
    range: null,
    message: `Silbe „${syllable}“ verschoben`,
  };
}
