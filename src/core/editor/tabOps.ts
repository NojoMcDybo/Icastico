/**
 * Tablature from the editor: add a guitar line later (with its tab), and translate a passage of another line into
 * the guitar line so it shows as notes and as tablature (ADR 0022).
 */
import { getInstrument } from '../instruments';
import { type NoteEvent, type Part, type Score } from '../model';
import { GUITAR_STRINGS, MAX_FRET } from '../tab';
import { midiOf } from '../pitch';
import { type Fraction, ZERO, add, le, lt } from '../time';
import { type EditorState, type VoiceRef, freshEventId, getVoice, updateEvents } from './state';
import { rangeSpan } from './range';
import { clearRange, insertSorted } from './voiceOps';

const LOWEST = Math.min(...GUITAR_STRINGS);
const HIGHEST = Math.max(...GUITAR_STRINGS) + MAX_FRET;

const say = (s: EditorState, message: string): EditorState => ({ ...s, message });

/** A new, empty guitar line at the bottom of the score (with the tablature on). */
export function addGuitarPart(score: Score): { score: Score; partId: string } {
  const def = getInstrument('guitar');
  let n = 1;
  while (score.parts.some((p) => p.id === (n === 1 ? 'guitar' : `guitar-${n}`))) n++;
  const id = n === 1 ? 'guitar' : `guitar-${n}`;
  const part: Part = { id, name: n === 1 ? def.name : `${def.name} ${n}`, instrument: 'guitar', tab: true, voices: [{ id: `${id}-v1`, staff: 0, events: [] }] };
  return { score: { ...score, parts: [...score.parts, part] }, partId: id };
}

/** Tab on / off for the guitar line; with no guitar line yet, one is added – the tablature can be put in at any time. */
export function toggleTabAnywhere(s: EditorState): EditorState {
  const ref: VoiceRef | null = s.caret ?? s.selection;
  const selected = ref && s.score.parts.find((p) => p.id === ref.partId);
  const guitar = selected?.instrument === 'guitar' ? selected : s.score.parts.find((p) => p.instrument === 'guitar');
  if (!guitar) {
    const added = addGuitarPart(s.score);
    return { ...s, score: added.score, message: 'Gitarrenzeile mit Tabulatur hinzugefügt – mit „Auswahl in Tabulatur übersetzen“ (Strg+Umschalt+B) füllst du sie aus einer anderen Zeile.' };
  }
  const on = !guitar.tab;
  const parts = s.score.parts.map((p) => {
    if (p.id !== guitar.id) return p;
    const { tab: _old, ...rest } = p;
    return on ? { ...rest, tab: true } : rest;
  });
  return { ...s, score: { ...s.score, parts }, message: on ? 'Tabulatur eingeschaltet' : 'Tabulatur ausgeschaltet' };
}

/**
 * Copies the marked passage (or, with nothing marked, the whole selected line) into the guitar line at the same
 * time, keeping the tones the guitar can play, and turns the tablature on. Overwrites what the guitar line had there.
 */
export function translateToTab(s: EditorState): EditorState {
  const ref: VoiceRef | null = s.selection ?? s.caret;
  if (!ref) return say(s, 'Erst eine Note der Zeile wählen (oder einen Bereich markieren), die in Tabulatur übersetzt werden soll.');
  const source = s.score.parts.find((p) => p.id === ref.partId);
  if (!source) return s;
  if (source.instrument === 'guitar') return say(s, 'Das ist schon die Gitarrenzeile – ihre Tabulatur schaltest du mit Strg+T ein.');
  const span = rangeSpan(s);
  const voice = getVoice(s.score, span ?? ref).voice;
  const from: Fraction = span ? span.from : ZERO;
  const to: Fraction | null = span ? span.to : null;
  const events = voice.events.filter((e) => le(from, e.onset) && (to === null || lt(e.onset, to)));
  if (events.length === 0) return say(s, 'In diesem Bereich gibt es keine Noten.');

  let score = s.score;
  let guitar = score.parts.find((p) => p.instrument === 'guitar');
  if (!guitar) {
    const added = addGuitarPart(score);
    score = added.score;
    guitar = score.parts.find((p) => p.id === added.partId)!;
  }
  const target: VoiceRef = { partId: guitar.id, voiceId: guitar.voices[0]!.id };
  let nextId = s.nextId;
  let copied = 0;
  let dropped = 0;
  const made: NoteEvent[] = [];
  for (const e of events) {
    const tones = e.tones.filter((t) => midiOf(t.pitch) >= LOWEST && midiOf(t.pitch) <= HIGHEST);
    dropped += e.tones.length - tones.length;
    if (tones.length === 0) continue;
    const [id, next] = freshEventId(score, target, nextId);
    nextId = next;
    copied += tones.length;
    made.push({ id, onset: e.onset, duration: e.duration, tones: tones.map((t, k) => ({ id: `${id}-t${k + 1}`, pitch: t.pitch })) });
  }
  if (made.length === 0) return say(s, 'Keiner der Töne liegt im Bereich der Gitarre (E2 bis D6).');
  const end = to ?? add(events[events.length - 1]!.onset, events[events.length - 1]!.duration);
  score = updateEvents(score, target, (list) => made.reduce<NoteEvent[]>((acc, ev) => insertSorted(acc, ev), clearRange(list, from, end)));
  score = { ...score, parts: score.parts.map((p) => (p.id === guitar!.id ? { ...p, tab: true } : p)) };
  return {
    ...s,
    score,
    nextId,
    message: `${copied} ${copied === 1 ? 'Ton' : 'Töne'} in die Gitarrenzeile übersetzt, die Tabulatur zeigt sie${dropped ? ` (${dropped} außerhalb der Gitarre ausgelassen)` : ''}.`,
  };
}
