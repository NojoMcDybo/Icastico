/**
 * Quantise (Logic: Q): the notes of the marked passage – or of the whole selected voice – are rounded to a grid
 * (ADR 0030). It is for notes that were played in or imported a little loose; notes already on the grid stay.
 * Notes that end up at the same place become a chord, a note that now overlaps the next one is cut short.
 */
import { type NoteEvent, eventEnd } from '../model';
import { compare, le, lt, sub, toNumber } from '../time';
import { type QuantizeOptions, quantizeTimes } from '../import/quantize';
import { midiOf } from '../pitch';
import { type EditorState, type VoiceRef, getVoice, updateEvents } from './state';
import { rangeSpan } from './range';
import { withValidLinks } from './linkOps';

const say = (s: EditorState, message: string): EditorState => ({ ...s, message });

export function quantizeEvents(s: EditorState, options: QuantizeOptions): EditorState {
  const span = rangeSpan(s);
  const ref: VoiceRef | null = span ?? s.selection ?? s.caret;
  if (!ref) return say(s, 'Erst eine Note oder eine Zeile wählen (oder einen Bereich markieren), die ins Raster gerückt werden soll.');
  const events = getVoice(s.score, ref).voice.events;
  const inScope = events.filter((e) => !span || (le(span.from, e.onset) && lt(e.onset, span.to)));
  if (inScope.length === 0) return say(s, 'Hier gibt es keine Noten.');

  const { times } = quantizeTimes(
    inScope.map((e) => ({ start: toNumber(e.onset) * 4, end: toNumber(eventEnd(e)) * 4 })),
    options,
  );
  const moved = new Map(inScope.map((e, i) => [e.id, times[i]!]));
  let changed = 0;
  let list: NoteEvent[] = events
    .map((e) => {
      const t = moved.get(e.id);
      if (!t) return e;
      if (compare(t.onset, e.onset) !== 0 || compare(t.duration, e.duration) !== 0) changed++;
      return { ...e, onset: t.onset, duration: t.duration };
    })
    .sort((a, b) => compare(a.onset, b.onset));

  // Notes that landed on the same place: the later one joins the earlier one as a chord (its tones keep their ids).
  const merged: NoteEvent[] = [];
  let chords = 0;
  for (const e of list) {
    const last = merged[merged.length - 1];
    if (last && compare(last.onset, e.onset) === 0) {
      const have = new Set(last.tones.map((t) => midiOf(t.pitch)));
      const tones = [...last.tones, ...e.tones.filter((t) => !have.has(midiOf(t.pitch)))].sort((a, b) => midiOf(a.pitch) - midiOf(b.pitch));
      merged[merged.length - 1] = { ...last, tones, duration: compare(e.duration, last.duration) < 0 ? e.duration : last.duration };
      chords++;
    } else merged.push(e);
  }
  // No overlaps: a note ends where the next begins.
  list = merged.map((e, i) => {
    const next = merged[i + 1];
    return next && lt(next.onset, eventEnd(e)) ? { ...e, duration: sub(next.onset, e.onset) } : e;
  });

  if (changed === 0 && chords === 0) return say(s, 'Alles liegt schon im Raster.');
  const score = updateEvents(s.score, ref, () => list);
  const first = list.find((e) => moved.has(e.id)) ?? list[0]!;
  const out: EditorState = { ...s, score, range: null, selection: { kind: 'event', partId: ref.partId, voiceId: ref.voiceId, eventId: first.id }, message: `${changed} ${changed === 1 ? 'Note' : 'Noten'} ins Raster gerückt${chords ? `, ${chords} zu Akkorden zusammengefasst` : ''}.` };
  return withValidLinks(s, out);
}
