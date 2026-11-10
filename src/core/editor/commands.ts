/**
 * Every editing function is a Command: a pure function
 *   (state, arg) → new state
 * plus a German title. The keyboard (src/ui/keymaps) only maps keys to
 * command ids – changing the key layout never touches this file.
 *
 * Input model (Finale Simple Entry):
 * - Enter starts input mode: a caret appears where the next note goes.
 * - Number keys choose the value of the NEXT note, letters enter it.
 * - The note just entered stays selected; ↑/↓, +/-, Alt+number, T act on it.
 * - Overwrite by default (insert mode shifts the following music instead).
 */
import { type Fraction, ZERO, add, compare, eq, frac, gt, isDyadic, le, lt, sub } from '../time';
import { STEPS, keyAlteration, midiOf, pitchToString, type Pitch } from '../pitch';
import { type BarSign, BAR_SIGNS, GROUP_SIGNS, NOTE_SYMBOLS, barSign, canSitOnNote, toggleNoteSymbol } from '../symbols';
import { type BarMark, type StaffGroup, type ChordSymbol, type Link, type LinkKind, type NoteEvent, type Score, type Tone, eventEnd, freshToneId, keyAt, measuresOf } from '../model';
import { decomposeNote, writtenValue } from '../notation/notate';
import { lyricOf, withLyric } from '../lyrics';
import { emptyScore } from '../templates';
import {
  type Caret,
  type EditorState,
  type InputSettings,
  type Selection,
  type VoiceRef,
  allVoiceRefs,
  createEditorState,
  freshEventId,
  getVoice,
  inputLength,
  sameVoice,
  staffCenter,
  updateEvents,
  voiceEnd,
} from './state';
import { applyRollEdit } from './rollEdits';
import { deleteRange, extendRange, rangeSpan, selectAllNotes } from './range';
import { toggleTabAnywhere, translateToTab } from './tabOps';
import { moveToString, setFret } from './tabEdit';
import { freshLinkId, linksOf, withLinks, withValidLinks } from './linkOps';
import { clearRange, insertSorted, makeRoom } from './voiceOps';

/** Finale numbering: 1 = 64th, 2 = 32nd, 3 = 16th, 4 = 8th, 5 = quarter, 6 = half, 7 = whole. */
export function finaleDuration(n: number): Fraction | null {
  return Number.isInteger(n) && n >= 1 && n <= 7 ? frac(1, 2 ** (7 - n)) : null;
}

const say = (s: EditorState, message: string): EditorState => ({ ...s, message });

const NO_NOTE = 'Keine Note ausgewählt – erst eine Note eingeben oder anklicken.';

// ── Helpers ────────────────────────────────────────────────────────────────

function findEvent(score: Score, ref: VoiceRef, id: string): NoteEvent | undefined {
  return getVoice(score, ref).voice.events.find((e) => e.id === id);
}

/** The note that ↑/↓/+/-/T/Alt+number act on. */
function target(s: EditorState): { ref: VoiceRef; event: NoteEvent } | null {
  const sel = s.selection;
  if (sel?.kind === 'event') {
    const event = findEvent(s.score, sel, sel.eventId);
    if (event) return { ref: sel, event };
  }
  if (s.caret) {
    const caret = s.caret;
    const event = getVoice(s.score, caret).voice.events.find((e) => eq(eventEnd(e), caret.time));
    if (event) return { ref: caret, event };
  }
  return null;
}

const selectEvent = (ref: VoiceRef, event: NoteEvent): Selection => ({
  kind: 'event',
  partId: ref.partId,
  voiceId: ref.voiceId,
  eventId: event.id,
});

/** Selection at a time in a voice: the note starting or sounding there, else the gap. */
function selectionAt(score: Score, ref: VoiceRef, time: Fraction): Selection {
  const ev = getVoice(score, ref).voice.events.find((e) => le(e.onset, time) && lt(time, eventEnd(e)));
  return ev ? selectEvent(ref, ev) : { kind: 'gap', partId: ref.partId, voiceId: ref.voiceId, time };
}

function selectionTime(score: Score, sel: Selection | null): Fraction | null {
  if (!sel) return null;
  if (sel.kind === 'gap') return sel.time;
  return findEvent(score, sel, sel.eventId)?.onset ?? null;
}

/** Where input starts: at the selection, else after the last note of the first staff. */
function caretStart(s: EditorState): Caret | null {
  const sel = s.selection;
  const time = selectionTime(s.score, sel);
  if (sel && time) return { partId: sel.partId, voiceId: sel.voiceId, time };
  const first = allVoiceRefs(s.score)[0];
  if (!first) return null;
  return { ...first, time: voiceEnd(getVoice(s.score, first).voice) };
}

function ensureCaret(s: EditorState): EditorState {
  if (s.caret) return s;
  const caret = caretStart(s);
  return caret ? { ...s, caret } : s;
}

const samePitch = (a: Pitch, b: Pitch): boolean => a.step === b.step && a.alter === b.alter && a.octave === b.octave;

/** Pitch of the note before the caret, else the staff's middle line. */
function referencePitch(s: EditorState, caret: Caret): Pitch {
  const before = getVoice(s.score, caret).voice.events.filter((e) => le(eventEnd(e), caret.time));
  const last = before[before.length - 1];
  return last ? last.tones[0]!.pitch : staffCenter(s.score, caret);
}

/** Staff position: 7 steps per octave. */
const staffPos = (p: Pitch): number => p.octave * 7 + STEPS.indexOf(p.step);

/**
 * The octave of `step` closest to `ref`, counted in staff steps like a
 * musician reads it (a fourth down beats a fifth up). Never a tie.
 */
function nearestOctave(step: Pitch['step'], alter: number, ref: Pitch): Pitch {
  let best: Pitch | null = null;
  for (let octave = ref.octave - 1; octave <= ref.octave + 1; octave++) {
    const p = { step, alter, octave };
    if (!best || Math.abs(staffPos(p) - staffPos(ref)) < Math.abs(staffPos(best) - staffPos(ref))) best = p;
  }
  return best!;
}

/** Diatonic step within the key: in G major, E ↑ gives F#. */
function stepPitch(p: Pitch, delta: number, fifths: number): Pitch {
  const index = STEPS.indexOf(p.step) + delta;
  const octave = p.octave + Math.floor(index / 7);
  const step = STEPS[((index % 7) + 7) % 7]!;
  return { step, alter: keyAlteration(fifths, step), octave };
}

const sortTones = (ts: readonly Tone[]): Tone[] => [...ts].sort((a, b) => midiOf(a.pitch) - midiOf(b.pitch));

function replacePitches(s: EditorState, fn: (p: Pitch, ev: NoteEvent) => Pitch): EditorState {
  const t = target(s);
  if (!t) return say(s, NO_NOTE);
  // A single notehead of a chord that was clicked is changed alone; otherwise the whole note.
  const clicked = s.selection?.kind === 'event' && s.selection.eventId === t.event.id ? s.selection.toneId : undefined;
  const only = clicked && t.event.tones.length > 1 && t.event.tones.some((x) => x.id === clicked) ? clicked : undefined;
  const tones = t.event.tones.map((tone) => (only === undefined || tone.id === only ? { ...tone, pitch: fn(tone.pitch, t.event) } : tone));
  if (only !== undefined && new Set(tones.map((x) => midiOf(x.pitch))).size < tones.length) return say(s, 'Dort liegt schon ein anderer Ton des Akkords.');
  const score = updateEvents(s.score, t.ref, (events) => events.map((e) => (e.id === t.event.id ? { ...e, tones: sortTones(tones) } : e)));
  return { ...s, score, selection: { ...selectEvent(t.ref, t.event), ...(only !== undefined ? { toneId: only } : {}) }, message: null };
}

/** Changes a note's length, overwriting what follows; a caret right after the note moves along. */
function setEventDuration(s: EditorState, ref: VoiceRef, ev: NoteEvent, length: Fraction): EditorState {
  const score = updateEvents(s.score, ref, (events) =>
    insertSorted(
      clearRange(
        events.filter((e) => e.id !== ev.id),
        ev.onset,
        add(ev.onset, length),
      ),
      { ...ev, duration: length },
    ),
  );
  const caret =
    s.caret && sameVoice(s.caret, ref) && eq(s.caret.time, eventEnd(ev))
      ? { ...s.caret, time: add(ev.onset, length) }
      : s.caret;
  return { ...s, score, caret, selection: selectEvent(ref, ev), message: null };
}

// ── Commands ───────────────────────────────────────────────────────────────

function inputDuration(s: EditorState, n: number): EditorState {
  const base = finaleDuration(n);
  return base ? { ...s, input: { ...s.input, base, dots: 0 }, message: null } : s;
}

// ── Special signs (ADR 0024) ───────────────────────────────────────────────

/** Puts a sign of the library on the selected note, or takes it off (a second time). Dynamics and the like replace their neighbours. */
function toggleMark(s: EditorState, index: number): EditorState {
  const symbol = NOTE_SYMBOLS[index];
  if (!symbol) return s;
  const t = target(s);
  if (!t) return say(s, NO_NOTE);
  const marks = toggleNoteSymbol(t.event.marks, symbol.id);
  const score = updateEvents(s.score, t.ref, (events) =>
    events.map((e) => {
      if (e.id !== t.event.id) return e;
      const { marks: _old, ...rest } = e;
      return marks.length ? { ...rest, marks } : rest;
    }),
  );
  const on = marks.includes(symbol.id);
  return { ...s, score, selection: selectEvent(t.ref, t.event), message: `${symbol.label}: ${on ? 'gesetzt' : 'entfernt'}` };
}

/** The bar the selected note / the caret is in. */
function focusBar(s: EditorState) {
  const time = selectionTime(s.score, s.selection) ?? s.caret?.time ?? ZERO;
  const measures = measuresOf(s.score, 1, time);
  return measures.find((m) => le(m.start, time) && lt(time, m.end)) ?? measures[0]!;
}

/** The signs on the selected note and on its bar – what the palette lights. */
export function signsAtFocus(s: EditorState): { note: readonly string[]; bar: readonly string[]; group: readonly string[] } {
  const bar = focusBar(s);
  const inBar = (at: Fraction) => le(bar.start, at) && lt(at, bar.end);
  const ref = s.selection ?? s.caret;
  return {
    note: target(s)?.event.marks ?? [],
    bar: (s.score.marks ?? []).filter((m) => inBar(m.at)).map((m) => m.kind),
    group: ref ? (s.score.groups ?? []).filter((g) => g.parts.includes(ref.partId)).map((g) => g.symbol) : [],
  };
}

/**
 * The score with this bar sign put on the bar that contains `at` (replacing its exclusive neighbours) or taken off.
 * With `exact` (segno, coda, jumps, tempo words) it sits exactly at `at`, the time of a note; else `at` is the start of the bar.
 */
function withBarSign(score: Score, sign: BarSign, at: Fraction, on: boolean, exact = false): Score {
  const bar = measuresOf(score, 1, at).find((m) => le(m.start, at) && lt(at, m.end));
  const sameBar = (t: Fraction) => (bar ? le(bar.start, t) && lt(t, bar.end) : eq(t, at));
  const kept = (score.marks ?? []).filter((m) => !(sameBar(m.at) && (m.kind === sign.id || (sign.exclusive && barSign(m.kind)?.exclusive === sign.exclusive))));
  const next: BarMark[] = on ? [...kept, { at, kind: sign.id, ...(exact && canSitOnNote(sign.id) ? { exact: true } : {}) }] : kept;
  next.sort((a, b) => compare(a.at, b.at) || BAR_SIGNS.findIndex((x) => x.id === a.kind) - BAR_SIGNS.findIndex((x) => x.id === b.kind));
  const { marks: _old, ...rest } = score;
  return next.length ? { ...rest, marks: next } : rest;
}

/** Repeat signs, endings, segno, coda and jumps for the bar of the selected note / the caret; a second time takes it away. */
function toggleBarSign(s: EditorState, index: number): EditorState {
  const sign = BAR_SIGNS[index];
  if (!sign) return s;
  const bar = focusBar(s);
  const present = (s.score.marks ?? []).some((m) => m.kind === sign.id && le(bar.start, m.at) && lt(m.at, bar.end));
  const where = bar.number === 0 ? 'Auftakt' : `Takt ${bar.number}`;
  // Segno, coda, jumps and tempo words go exactly where the selected note is.
  const noteTime = canSitOnNote(sign.id) && s.selection?.kind === 'event' ? selectionTime(s.score, s.selection) : null;
  return { ...s, score: withBarSign(s.score, sign, noteTime ?? bar.start, !present, noteTime !== null), message: `${sign.label}, ${where}: ${present ? 'entfernt' : 'gesetzt'}` };
}

/**
 * Drag and drop of a note sign: puts `id` on the note `to` (replacing its exclusive neighbours) and, when it is moved,
 * takes it off the note `from`. A sign the target already has stays as it is.
 */
export function dropNoteSign(s: EditorState, id: string, to: { ref: VoiceRef; eventId: string }, from?: { ref: VoiceRef; eventId: string }): EditorState {
  const symbol = NOTE_SYMBOLS.find((x) => x.id === id);
  const event = symbol && findEvent(s.score, to.ref, to.eventId);
  if (!symbol || !event) return s;
  const withMarks = (score: Score, at: { ref: VoiceRef; eventId: string }, change: (marks: readonly string[]) => string[]): Score =>
    updateEvents(score, at.ref, (events) =>
      events.map((e) => {
        if (e.id !== at.eventId) return e;
        const marks = change(e.marks ?? []);
        const { marks: _old, ...rest } = e;
        return marks.length ? { ...rest, marks } : rest;
      }),
    );
  let score = s.score;
  if (from && !(from.eventId === to.eventId && sameVoice(from.ref, to.ref))) score = withMarks(score, from, (m) => m.filter((x) => x !== id));
  score = withMarks(score, to, (m) => (m.includes(id) ? [...m] : toggleNoteSymbol(m, id)));
  return { ...s, score, selection: selectEvent(to.ref, event), message: `${symbol.label}: ${from ? 'verschoben' : 'gesetzt'}` };
}

/** Takes a note sign off a note (a placed sign selected in the score + Backspace). */
export function eraseNoteSign(s: EditorState, id: string, at: { ref: VoiceRef; eventId: string }): EditorState {
  const symbol = NOTE_SYMBOLS.find((x) => x.id === id);
  const event = symbol && findEvent(s.score, at.ref, at.eventId);
  if (!symbol || !event?.marks?.includes(id)) return s;
  const score = updateEvents(s.score, at.ref, (events) =>
    events.map((e) => {
      if (e.id !== at.eventId) return e;
      const marks = (e.marks ?? []).filter((x) => x !== id);
      const { marks: _old, ...rest } = e;
      return marks.length ? { ...rest, marks } : rest;
    }),
  );
  return { ...s, score, message: `${symbol.label}: entfernt` };
}

/** Takes a bar sign off the bar starting at `at`. */
export function eraseBarSign(s: EditorState, kind: string, at: Fraction): EditorState {
  const sign = barSign(kind);
  if (!sign || !(s.score.marks ?? []).some((m) => m.kind === kind && eq(m.at, at))) return s;
  return { ...s, score: withBarSign(s.score, sign, at, false), message: `${sign.label}: entfernt` };
}

/** Drag and drop of a bar sign onto the bar starting at `to`; `from` is the bar it is moved away from. */
export function dropBarSign(s: EditorState, kind: string, to: Fraction, from?: Fraction, exact = false): EditorState {
  const sign = barSign(kind);
  if (!sign) return s;
  let score = s.score;
  if (from) score = withBarSign(score, sign, from, false);
  score = withBarSign(score, sign, to, true, exact);
  const bar = measuresOf(score, 1, to).find((m) => le(m.start, to) && lt(to, m.end));
  const where = !bar ? '' : bar.number === 0 ? ', Auftakt' : `, Takt ${bar.number}`;
  return { ...s, score, message: `${sign.label}${where}: ${from ? 'verschoben' : 'gesetzt'}` };
}

/** Bracket or brace around the selected part and the one below it; the same sign again takes the lower part out of the group. */
function toggleGroup(s: EditorState, index: number): EditorState {
  const sign = GROUP_SIGNS[index];
  const ref = s.selection ?? s.caret;
  if (!sign || !ref) return say(s, 'Erst eine Note der Zeile wählen, die mit der nächsten zusammengefasst werden soll.');
  const order = s.score.parts.map((p) => p.id);
  const at = order.indexOf(ref.partId);
  const below = order[at + 1];
  if (at < 0 || below === undefined) return say(s, 'Unter dieser Zeile gibt es keine weitere, die dazugehören könnte.');
  const groups = s.score.groups ?? [];
  const mine = groups.find((g) => g.parts.includes(ref.partId));
  let next: StaffGroup[];
  if (mine && mine.parts.includes(below) && mine.symbol === sign.id) {
    // Taking the lower part out (a group of two disappears).
    const rest = mine.parts.filter((id) => id !== below);
    next = groups.flatMap((g) => (g !== mine ? [g] : rest.length >= 2 ? [{ ...g, parts: rest }] : []));
  } else if (mine) {
    // Same group (possibly another symbol) extended by the part below.
    const parts = mine.parts.includes(below) ? mine.parts : [...mine.parts, below].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    next = groups.filter((g) => g === mine || !g.parts.includes(below)).map((g) => (g === mine ? { symbol: sign.id, parts } : g));
  } else {
    const other = groups.find((g) => g.parts.includes(below));
    next = [...groups.filter((g) => g !== other), { symbol: sign.id, parts: other ? [ref.partId, ...other.parts] : [ref.partId, below] }];
  }
  next.sort((a, b) => order.indexOf(a.parts[0]!) - order.indexOf(b.parts[0]!));
  const { groups: _old, ...rest } = s.score;
  const on = next.some((g) => g.parts.includes(ref.partId) && g.parts.includes(below) && g.symbol === sign.id);
  return { ...s, score: next.length ? { ...rest, groups: next } : rest, message: `${sign.id === 'bracket' ? 'Klammer' : 'Akkolade'}: ${on ? 'gesetzt' : 'gelöst'}` };
}

/** Tablature staff on/off for the guitar part of the selected note / caret (ADR 0022). */
function toggleTab(s: EditorState): EditorState {
  return toggleTabAnywhere(s);
}

/** Tuplet mode on/off: the next notes become triplets (3), quintuplets (5) or septuplets (7). */
function toggleTuplet(s: EditorState, n: number): EditorState {
  const next = n === 3 || n === 5 || n === 7 ? n : 0;
  const tuplet = s.input.tuplet === next ? 0 : next;
  const name = { 3: 'Triolen', 5: 'Quintolen', 7: 'Septolen' }[tuplet as 3 | 5 | 7];
  return { ...s, input: { ...s.input, tuplet }, message: tuplet ? `${name}: Die nächsten Noten sind ${name} (Taste noch einmal: aus).` : 'Normale Notenwerte' };
}

/** Numpad length: while typing it is the ghost note's length; with a note selected (no input) it changes that note. */
function inputLengthKey(s: EditorState, n: number): EditorState {
  const next = inputDuration(s, n);
  return !next.caret && target(next) ? editDuration(next, n) : next;
}

function toggleDot(s: EditorState): EditorState {
  if (s.caret || s.selection?.kind !== 'event') {
    return { ...s, input: { ...s.input, dots: s.input.dots === 1 ? 0 : 1 }, message: null };
  }
  return dotNote(s);
}

/** Dots the note itself (also while the caret is waiting right behind it). */
function dotNote(s: EditorState): EditorState {
  const t = target(s);
  if (!t) return say(s, NO_NOTE);
  if (!isDyadic(t.event.duration)) return say(s, 'Punktierung geht bei N-Tolen nicht.');
  const pieces = decomposeNote(t.event.duration);
  if (pieces.length !== 1) return say(s, 'Punktierung geht nur bei einfachen Notenwerten.');
  const w = pieces[0]!;
  const length = w.dots === 0 ? writtenValue({ base: w.base, dots: 1 }) : writtenValue({ base: w.base, dots: 0 });
  return setEventDuration(s, t.ref, t.event, length);
}

/**
 * Spelling of a pitch class (0 = C … 11 = B) in a key: naturals stay natural,
 * black keys follow the key signature (flats in flat keys, sharps in sharp
 * keys). In C major the common choice: C#, Eb, F#, G#, Bb.
 */
export function spellPitchClass(pc: number, fifths: number): { step: Pitch['step']; alter: number } {
  const naturals: Record<number, Pitch['step']> = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
  const p = ((pc % 12) + 12) % 12;
  const natural = naturals[p];
  if (natural) {
    // A natural the key alters away (e.g. F in G major) stays F natural.
    return { step: natural, alter: 0 };
  }
  const sharp = { step: naturals[p - 1]!, alter: 1 };
  const flat = { step: naturals[p + 1]!, alter: -1 };
  if (fifths > 0) return sharp;
  if (fifths < 0) return flat;
  return p === 3 || p === 10 ? flat : sharp;
}

function enterNote(s0: EditorState, stepIndex: number): EditorState {
  const step = STEPS[stepIndex];
  if (!step) return s0;
  return enterPitch(s0, step, null);
}

/** Logic's step input: keys laid out like a piano (A = C, W = C#, …). */
function enterPitchClass(s0: EditorState, pc: number): EditorState {
  const s = ensureCaret(s0);
  if (!s.caret) return say(s, 'Die Partitur hat keine Stimme.');
  // A sharp / flat typed before the key moves the pitch by a semitone.
  const { step, alter } = spellPitchClass((((pc + (s.input.nextAlter ?? 0)) % 12) + 12) % 12, keyAt(s.score, s.caret.time));
  return enterPitch(s, step, alter);
}

/** What was set for "the next note only" is used up. */
function usedUp(input: InputSettings): InputSettings {
  const { nextAlter: _a, octaveShift: _o, ...rest } = input;
  return rest;
}

/** Sharp or flat for the next note (typed before it); the same key again takes it back. */
function nextAccidental(s0: EditorState, delta: 1 | -1): EditorState {
  const s = ensureCaret(s0);
  if (!s.caret) return say(s, 'Die Partitur hat keine Stimme.');
  if (s.input.nextAlter === delta) {
    const { nextAlter: _off, ...rest } = s.input;
    return { ...s, input: rest, message: 'Vorzeichen für die nächste Note aufgehoben.' };
  }
  return { ...s, input: { ...s.input, nextAlter: delta }, message: delta > 0 ? 'Die nächste Note bekommt ein Kreuz.' : 'Die nächste Note bekommt ein B.' };
}

/** The next note is moved up or down by octaves from where it would land (the nearest one to the note before). */
function nextOctave(s0: EditorState, delta: number): EditorState {
  const s = ensureCaret(s0);
  if (!s.caret) return say(s, 'Die Partitur hat keine Stimme.');
  const shift = Math.max(-3, Math.min(3, (s.input.octaveShift ?? 0) + delta));
  const text = shift === 0 ? 'Die nächste Note kommt in der gewohnten Oktave.' : `Die nächste Note kommt ${Math.abs(shift)} ${Math.abs(shift) === 1 ? 'Oktave' : 'Oktaven'} ${shift > 0 ? 'höher' : 'tiefer'}.`;
  const { octaveShift: _old, ...rest } = s.input;
  return { ...s, input: shift === 0 ? rest : { ...rest, octaveShift: shift }, message: text };
}

const validMidi = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 127;

/** A note named with its accidental ("fis", "es"): `arg` = letter index (C = 0 … B = 6) × 5 + alteration + 2. Spoken dictation. */
function enterSpelled(s0: EditorState, arg: number): EditorState {
  const step = STEPS[Math.floor(arg / 5)];
  const alter = (arg % 5) - 2;
  if (!Number.isInteger(arg) || arg < 0 || !step) return s0;
  return enterPitch(s0, step, alter);
}

/** A key of a MIDI keyboard: the note at exactly that pitch, spelled in the key like a black piano key. */
function enterMidi(s0: EditorState, midi: number): EditorState {
  if (!validMidi(midi)) return s0;
  const s = ensureCaret(s0);
  if (!s.caret) return say(s, 'Die Partitur hat keine Stimme.');
  const { step, alter } = spellPitchClass(midi % 12, keyAt(s.score, s.caret.time));
  return enterPitch(s, step, alter, midi);
}

/** A second key pressed together with the one just entered: its tone joins that note. */
function addMidi(s: EditorState, midi: number): EditorState {
  if (!validMidi(midi)) return s;
  const t = target(s);
  if (!t) return enterMidi(s, midi);
  if (t.event.tones.some((tone) => midiOf(tone.pitch) === midi)) return s;
  const { step, alter } = spellPitchClass(midi % 12, keyAt(s.score, t.event.onset));
  const pitch: Pitch = { step, alter, octave: Math.floor(midi / 12) - 1 };
  const score = updateEvents(s.score, t.ref, (events) =>
    events.map((e) => (e.id === t.event.id ? { ...e, tones: sortTones([...e.tones, { id: freshToneId(s.score, e.id), pitch }]) } : e)),
  );
  return { ...s, score, selection: selectEvent(t.ref, t.event), message: null };
}

/** The lowest pitch of a letter (with accidental) above a sounding pitch: how chord notes are stacked. */
function pitchAbove(step: Pitch['step'], alter: number, topMidi: number): Pitch {
  let pitch: Pitch = { step, alter, octave: -1 };
  while (midiOf(pitch) <= topMidi) pitch = { ...pitch, octave: pitch.octave + 1 };
  return pitch;
}

/** Chord mode: a note joins the chord under construction at the caret (which stays put), or starts it. */
function enterChordPitch(s: EditorState, caret: Caret, step: Pitch['step'], alterOverride: number | null): EditorState {
  const alter = alterOverride ?? keyAlteration(keyAt(s.score, caret.time), step);
  const building = s.input.chordEvent ? getVoice(s.score, caret).voice.events.find((e) => e.id === s.input.chordEvent && eq(e.onset, caret.time)) : undefined;
  if (building) {
    const pitch = pitchAbove(step, alter, Math.max(...building.tones.map((t) => midiOf(t.pitch))));
    const score = updateEvents(s.score, caret, (events) =>
      events.map((e) => (e.id === building.id ? { ...e, tones: sortTones([...e.tones, { id: freshToneId(s.score, e.id), pitch }]) } : e)),
    );
    return { ...s, score, selection: selectEvent(caret, building), message: null };
  }
  const pitch = nearestOctave(step, alter, referencePitch(s, caret));
  const [id, nextId] = freshEventId(s.score, caret, s.nextId);
  const ev: NoteEvent = { id, onset: caret.time, duration: inputLength(s.input), tones: [{ id: freshToneId(s.score, id), pitch }] };
  const score = updateEvents(s.score, caret, (events) => insertSorted(makeRoom(events, caret.time, ev.duration, s.input.insert), ev));
  return { ...s, score, nextId, selection: selectEvent(caret, ev), input: { ...s.input, chordEvent: id, pendingTie: false }, message: null };
}

/** Leaves chord mode: the caret moves behind the finished chord. */
function endChord(s: EditorState): EditorState {
  const input = { ...s.input, chord: false, chordEvent: null };
  const chord = s.caret && s.input.chordEvent ? getVoice(s.score, s.caret).voice.events.find((e) => e.id === s.input.chordEvent) : undefined;
  return { ...s, input, caret: s.caret && chord ? { ...s.caret, time: eventEnd(chord) } : s.caret };
}

/** Logic's chord mode key: the next notes you enter stack up into one chord; press again to move on. */
function toggleChordMode(s0: EditorState): EditorState {
  if (s0.input.chord) return { ...endChord(s0), message: 'Akkordmodus aus' };
  const s = ensureCaret(s0);
  if (!s.caret) return say(s, 'Die Partitur hat keine Stimme.');
  return { ...s, input: { ...s.input, chord: true, chordEvent: null }, message: 'Akkordmodus: Die nächsten Töne klingen zusammen (Taste noch einmal: weiter).' };
}

/** Enters a note at the caret; `alter` null = as the key signature says. */
function enterPitch(s0: EditorState, step: Pitch['step'], alterOverride: number | null, exactMidi?: number): EditorState {
  const s = ensureCaret(s0);
  const caret = s.caret;
  if (!caret) return say(s, 'Die Partitur hat keine Stimme.');
  const typed = alterOverride ?? s.input.nextAlter ?? null; // a sharp / flat typed before the letter
  if (s.input.chord) return enterChordPitch(s, caret, step, typed);
  const alter = typed ?? keyAlteration(keyAt(s.score, caret.time), step);
  // A MIDI key names its octave; letter keys take the nearest one (moved by the octaves asked for).
  const near = exactMidi !== undefined ? { step, alter, octave: Math.floor(exactMidi / 12) - 1 } : nearestOctave(step, alter, referencePitch(s, caret));
  const pitch = exactMidi !== undefined ? near : { ...near, octave: near.octave + (s.input.octaveShift ?? 0) };
  const length = inputLength(s.input);
  const insert = s.input.insert;
  const prev = getVoice(s.score, caret).voice.events.find((e) => eq(eventEnd(e), caret.time));

  let score: Score;
  let selection: Selection;
  let nextId = s.nextId;
  const [id, next] = freshEventId(s.score, caret, s.nextId);
  nextId = next;
  const ev: NoteEvent = { id, onset: caret.time, duration: length, tones: [{ id: freshToneId(s.score, id), pitch }] };
  score = updateEvents(s.score, caret, (events) => insertSorted(makeRoom(events, caret.time, length, insert), ev));
  selection = selectEvent(caret, ev);
  // Tie pending (T before the note): a separate note joined to the previous one by an explicit tie.
  if (s.input.pendingTie && prev && prev.tones.length === 1 && samePitch(prev.tones[0]!.pitch, pitch)) {
    // A tone has one connection going out: the tie replaces e.g. a glide that started there.
    const kept = linksOf(score).filter((l) => l.from !== prev.tones[0]!.id);
    const links = [...kept, { id: freshLinkId(score, kept), kind: 'tie' as const, from: prev.tones[0]!.id, to: ev.tones[0]!.id }];
    score = withLinks(score, links);
  }
  return {
    ...s,
    score,
    selection,
    nextId,
    caret: { ...caret, time: add(caret.time, length) },
    input: { ...usedUp(s.input), pendingTie: false },
    message: null,
  };
}

/** The pitches Enter would put at the caret: the ghost, else the notes before the caret, else the staff's middle line. */
function ghostOf(s: EditorState, caret: Caret): readonly Pitch[] {
  if (s.input.ghost) return s.input.ghost;
  const before = getVoice(s.score, caret).voice.events.filter((e) => le(eventEnd(e), caret.time));
  const last = before[before.length - 1];
  return last ? last.tones.map((t) => t.pitch) : [staffCenter(s.score, caret)];
}

/** The ghost note for the display; null outside input mode. */
export function ghostPitches(s: EditorState): readonly Pitch[] | null {
  return s.caret ? ghostOf(s, s.caret) : null;
}

const sortPitches = (ps: readonly Pitch[]): Pitch[] => [...ps].sort((a, b) => midiOf(a) - midiOf(b));

/**
 * Finale's numpad typing: Enter puts the ghost note (pitches, length) at the caret and moves on; the ghost
 * stays, so Enter again repeats it. Without a caret, Enter starts input.
 */
function commitGhost(s: EditorState): EditorState {
  const caret = s.caret;
  if (!caret) return toggleInput(s);
  if (s.input.chord) return endChord(s);
  const pitches = ghostOf(s, caret);
  const length = inputLength(s.input);
  const prev = getVoice(s.score, caret).voice.events.find((e) => eq(eventEnd(e), caret.time));
  const [id, nextId] = freshEventId(s.score, caret, s.nextId);
  const ev: NoteEvent = { id, onset: caret.time, duration: length, tones: pitches.map((pitch, i) => ({ id: `${id}-t${i + 1}`, pitch })) };
  let score = updateEvents(s.score, caret, (events) => insertSorted(makeRoom(events, caret.time, length, s.input.insert), ev));
  if (s.input.pendingTie && prev && prev.tones.length === 1 && ev.tones.length === 1 && samePitch(prev.tones[0]!.pitch, pitches[0]!)) {
    const kept = linksOf(score).filter((l) => l.from !== prev.tones[0]!.id);
    score = withLinks(score, [...kept, { id: freshLinkId(score, kept), kind: 'tie' as const, from: prev.tones[0]!.id, to: ev.tones[0]!.id }]);
  }
  return {
    ...s,
    score,
    nextId,
    selection: selectEvent(caret, ev),
    caret: { ...caret, time: add(caret.time, length) },
    input: { ...s.input, pendingTie: false, ghost: pitches },
    message: null,
  };
}

/** ↑/↓ in Finale's numpad typing: the ghost note moves a step (in the key); outside input mode the selected note does. */
function ghostStep(s: EditorState, delta: number): EditorState {
  const caret = s.caret;
  if (!caret) return step(s, delta);
  const key = keyAt(s.score, caret.time);
  return { ...s, input: { ...s.input, ghost: ghostOf(s, caret).map((p) => stepPitch(p, delta, key)) }, message: null };
}

/** +/− in Finale's numpad typing: the ghost note gets a sharp or flat; outside input mode the selected note does. */
function ghostAlter(s: EditorState, delta: number): EditorState {
  const caret = s.caret;
  if (!caret) return alter(s, delta);
  return { ...s, input: { ...s.input, ghost: ghostOf(s, caret).map((p) => ({ ...p, alter: Math.max(-2, Math.min(2, p.alter + delta)) })) }, message: null };
}

/**
 * Finale's number row: adds the tone an interval (2 = second … 8 = octave) above (n > 0) or below (n < 0)
 * the ghost note while typing, else to the selected note.
 */
function addInterval(s: EditorState, n: number): EditorState {
  const caret = s.caret;
  const key = (time: Fraction) => keyAt(s.score, time);
  if (caret) {
    const ghost = sortPitches(ghostOf(s, caret));
    const pitch = n > 0 ? stepPitch(ghost[ghost.length - 1]!, n - 1, key(caret.time)) : stepPitch(ghost[0]!, n + 1, key(caret.time));
    if (ghost.some((p) => samePitch(p, pitch))) return s;
    return { ...s, input: { ...s.input, ghost: sortPitches([...ghost, pitch]) }, message: null };
  }
  const t = target(s);
  if (!t) return say(s, NO_NOTE);
  const sorted = sortTones(t.event.tones);
  const pitch = n > 0 ? stepPitch(sorted[sorted.length - 1]!.pitch, n - 1, key(t.event.onset)) : stepPitch(sorted[0]!.pitch, n + 1, key(t.event.onset));
  if (t.event.tones.some((tone) => samePitch(tone.pitch, pitch))) return s;
  const score = updateEvents(s.score, t.ref, (events) =>
    events.map((e) => (e.id === t.event.id ? { ...e, tones: sortTones([...e.tones, { id: freshToneId(s.score, e.id), pitch }]) } : e)),
  );
  return { ...s, score, selection: selectEvent(t.ref, t.event), message: null };
}

function addChordNote(s: EditorState, stepIndex: number): EditorState {
  const step = STEPS[stepIndex];
  const t = target(s);
  if (!step) return s;
  if (!t) return say(s, NO_NOTE);
  const top = Math.max(...t.event.tones.map((tone) => midiOf(tone.pitch)));
  const pitch = pitchAbove(step, keyAlteration(keyAt(s.score, t.event.onset), step), top);
  const score = updateEvents(s.score, t.ref, (events) =>
    events.map((e) =>
      e.id === t.event.id ? { ...e, tones: sortTones([...e.tones, { id: freshToneId(s.score, e.id), pitch }]) } : e,
    ),
  );
  return { ...s, score, selection: selectEvent(t.ref, t.event), message: null };
}

function enterRest(s00: EditorState): EditorState {
  const s0 = s00.input.chord ? endChord(s00) : s00; // a rest ends a chord
  const s = ensureCaret(s0);
  const caret = s.caret;
  if (!caret) return say(s, 'Die Partitur hat keine Stimme.');
  const length = inputLength(s.input);
  const score = updateEvents(s.score, caret, (events) => makeRoom(events, caret.time, length, s.input.insert));
  return {
    ...s,
    score,
    selection: { kind: 'gap', partId: caret.partId, voiceId: caret.voiceId, time: caret.time },
    caret: { ...caret, time: add(caret.time, length) },
    input: { ...s.input, pendingTie: false },
    message: null,
  };
}

function toggleInput(s: EditorState): EditorState {
  if (s.caret) return { ...s, caret: null, input: { ...s.input, pendingTie: false, chord: false, chordEvent: null, tuplet: 0, ghost: null }, message: null };
  const next = ensureCaret(s);
  return next.caret ? { ...next, message: null } : say(s, 'Die Partitur hat keine Stimme.');
}

function escape(s: EditorState): EditorState {
  if (s.caret) return { ...s, caret: null, input: { ...s.input, pendingTie: false, chord: false, chordEvent: null, tuplet: 0, ghost: null }, message: null };
  if (rangeSpan(s)) return { ...s, range: null, message: null }; // the first Esc only unmarks the passage
  return { ...s, selection: null, message: null };
}

/** Removes the note; the time it took becomes a rest (other staves stay aligned). */
function toRest(s: EditorState): EditorState {
  const t = target(s);
  if (!t) return say(s, NO_NOTE);
  const score = updateEvents(s.score, t.ref, (events) => events.filter((e) => e.id !== t.event.id));
  return {
    ...s,
    score,
    selection: { kind: 'gap', partId: t.ref.partId, voiceId: t.ref.voiceId, time: t.event.onset },
    message: null,
  };
}

/** Delete: a selected single tone of a chord goes alone, otherwise the whole note becomes a rest. */
function deleteNote(s: EditorState): EditorState {
  if (rangeSpan(s)) return deleteRange(s); // a marked passage goes as a whole
  const t = target(s);
  const toneId = s.selection?.kind === 'event' ? s.selection.toneId : undefined;
  if (t && toneId && t.event.tones.length > 1) {
    return applyRollEdit(s, { kind: 'delete', voice: t.ref, eventId: t.event.id, toneId });
  }
  return toRest(s);
}

/** Moves the selected note in time by the chosen note value – the keyboard twin of dragging a bar. */
function moveNote(s: EditorState, dir: number): EditorState {
  const t = target(s);
  if (!t) return say(s, NO_NOTE);
  const onset = dir > 0 ? add(t.event.onset, s.input.base) : sub(t.event.onset, s.input.base);
  return applyRollEdit(s, { kind: 'change', voice: t.ref, eventId: t.event.id, onset });
}

/** Lengthens or shortens the selected note by the chosen note value – the keyboard twin of pulling a bar's end. */
function resizeNote(s: EditorState, dir: number): EditorState {
  const t = target(s);
  if (!t) return say(s, NO_NOTE);
  const duration = dir > 0 ? add(t.event.duration, s.input.base) : sub(t.event.duration, s.input.base);
  return applyRollEdit(s, { kind: 'change', voice: t.ref, eventId: t.event.id, duration });
}

/**
 * Detaches the selected tone of a chord into a voice of its own on the same staff:
 * same tone id, onset and length, so the music sounds the same, but its length can
 * now change without touching the other chord tones. Undo restores the chord.
 */
function detachTone(s: EditorState): EditorState {
  const sel = s.selection;
  if (sel?.kind !== 'event' || !sel.toneId) return say(s, 'Erst einen einzelnen Akkordton anklicken, den ich lösen soll.');
  const { part, voice } = getVoice(s.score, sel);
  const event = voice.events.find((e) => e.id === sel.eventId);
  const tone = event?.tones.find((x) => x.id === sel.toneId);
  if (!event || !tone) return say(s, NO_NOTE);
  if (event.tones.length < 2) return say(s, 'Der Ton steht schon allein – nichts zu lösen.');

  let n = 2;
  while (part.voices.some((v) => v.id === `${part.id}-v${n}`)) n++;
  const ref: VoiceRef = { partId: part.id, voiceId: `${part.id}-v${n}` };
  const id = `${ref.voiceId}-n${s.nextId}`; // a brand-new voice: no event ids to clash with
  const nextId = s.nextId + 1;
  const lone: NoteEvent = { id, onset: event.onset, duration: event.duration, tones: [tone] };
  const score: Score = {
    ...s.score,
    parts: s.score.parts.map((p) =>
      p.id !== part.id
        ? p
        : {
            ...p,
            // The new voice goes right behind the one it came from.
            voices: p.voices.flatMap((v) =>
              v.id !== voice.id
                ? [v]
                : [
                    { ...v, events: v.events.map((e) => (e.id === event.id ? { ...e, tones: e.tones.filter((x) => x.id !== tone.id) } : e)) },
                    { id: ref.voiceId, staff: voice.staff, events: [lone] },
                  ],
            ),
          },
    ),
  };
  return {
    ...s,
    score,
    nextId,
    selection: { kind: 'event', ...ref, eventId: id, toneId: tone.id },
    message: 'Ton in eigene Stimme gelöst (Strg+Z holt ihn zurück).',
  };
}

function backspace(s: EditorState): EditorState {
  if (rangeSpan(s)) return deleteRange(s);
  const caret = s.caret;
  if (!caret) return toRest(s);
  const prev = getVoice(s.score, caret).voice.events.find((e) => eq(eventEnd(e), caret.time));
  if (!prev) return navHorizontal(s, -1);
  const score = updateEvents(s.score, caret, (events) => events.filter((e) => e.id !== prev.id));
  const before = getVoice(score, caret).voice.events.find((e) => eq(eventEnd(e), prev.onset));
  return {
    ...s,
    score,
    caret: { ...caret, time: prev.onset },
    selection: before ? selectEvent(caret, before) : null,
    message: null,
  };
}

function step(s: EditorState, delta: number): EditorState {
  // On a tablature line a number moves to the next string instead (the sound stays).
  const onString = moveToString(s, delta);
  if (onString) return onString;
  return replacePitches(s, (p, ev) => stepPitch(p, delta, keyAt(s.score, ev.onset)));
}

function octave(s: EditorState, delta: number): EditorState {
  return replacePitches(s, (p) => ({ ...p, octave: p.octave + delta }));
}

function alter(s: EditorState, delta: number): EditorState {
  return replacePitches(s, (p) => ({ ...p, alter: Math.max(-2, Math.min(2, p.alter + delta)) }));
}

/** Real semitone transposition (Logic: Alt+↑/↓): E + 1 = F, respelled in the key. */
function semitone(s: EditorState, delta: number): EditorState {
  return replacePitches(s, (p, ev) => {
    const midi = midiOf(p) + delta;
    const { step, alter } = spellPitchClass(midi % 12, keyAt(s.score, ev.onset));
    // Octave from the MIDI number; B#/Cb cannot occur from spellPitchClass.
    return { step, alter, octave: Math.floor(midi / 12) - 1 };
  });
}

function editDuration(s: EditorState, n: number): EditorState {
  const length = finaleDuration(n);
  const t = target(s);
  if (!length) return s;
  if (!t) return say(s, NO_NOTE);
  return setEventDuration(s, t.ref, t.event, length);
}

/** Tones a link command works on: the clicked tone, or every tone of the selected note. */
function linkSources(s: EditorState, event: NoteEvent): Tone[] {
  const toneId = s.selection?.kind === 'event' ? s.selection.toneId : undefined;
  const one = toneId ? event.tones.filter((x) => x.id === toneId) : [];
  return one.length > 0 ? one : [...event.tones];
}

/**
 * Ties or glides the selected tone(s) to the next note of the voice – or takes the connection
 * away again if it is already there. Ties need the next note to start right at the end and pair
 * equal pitches; a glide pairs each tone with the nearest pitch of the next note.
 */
function toggleLink(s: EditorState, kind: LinkKind): EditorState {
  const t = target(s);
  if (!t) return say(s, NO_NOTE);
  const events = getVoice(s.score, t.ref).voice.events;
  const next = events[events.findIndex((e) => e.id === t.event.id) + 1];
  const name = kind === 'tie' ? 'Haltebogen' : 'Gleiten';
  if (!next || (kind === 'tie' && !eq(eventEnd(t.event), next.onset))) {
    return say(s, `Kein ${name} möglich: ${kind === 'tie' ? 'Es folgt keine Note direkt danach.' : 'Danach folgt keine Note.'}`);
  }
  const pairs: [Tone, Tone][] = [];
  const taken = new Set<string>();
  for (const from of linkSources(s, t.event)) {
    const free = next.tones.filter((x) => !taken.has(x.id));
    const to =
      kind === 'tie'
        ? free.find((x) => midiOf(x.pitch) === midiOf(from.pitch))
        : [...free].sort((a, b) => Math.abs(midiOf(a.pitch) - midiOf(from.pitch)) - Math.abs(midiOf(b.pitch) - midiOf(from.pitch)))[0];
    if (to) {
      pairs.push([from, to]);
      taken.add(to.id);
    }
  }
  if (pairs.length === 0) return say(s, 'Kein Haltebogen möglich: Die folgende Note hat eine andere Tonhöhe.');

  const existing = linksOf(s.score);
  const same = (l: Link, from: Tone, to: Tone) => l.from === from.id && l.to === to.id && l.kind === kind;
  if (pairs.every(([from, to]) => existing.some((l) => same(l, from, to)))) {
    const links = existing.filter((l) => !pairs.some(([from, to]) => same(l, from, to)));
    return { ...s, score: withLinks(s.score, links), message: `${name} gelöst.` };
  }
  let links = [...existing];
  for (const [from, to] of pairs) {
    if (links.some((l) => l.to === to.id && l.from !== from.id)) return say(s, 'Dort kommt schon eine andere Verbindung an.');
    links = links.filter((l) => l.from !== from.id); // a tone has one connection going out; a tie replaces a glide and vice versa
    links.push({ id: freshLinkId(s.score, links), kind, from: from.id, to: to.id });
  }
  return { ...s, score: withLinks(s.score, links), message: `${name} gesetzt.` };
}

/**
 * T: a bow to the next note. Equal pitches right after each other make a tie (one held note);
 * anything else makes a slur (Bindebogen, legato) – the sign "slur" on the first note.
 */
function tie(s: EditorState): EditorState {
  const t = target(s);
  if (!t) return say(s, NO_NOTE);
  const end = eventEnd(t.event);
  const events = getVoice(s.score, t.ref).voice.events;
  const next = events[events.findIndex((e) => e.id === t.event.id) + 1];
  const adjacent = next !== undefined && eq(next.onset, end);
  if (adjacent && linkSources(s, t.event).some((from) => next.tones.some((to) => midiOf(to.pitch) === midiOf(from.pitch)))) return toggleLink(s, 'tie');
  if (next && (adjacent || !(s.caret && eq(s.caret.time, end)))) return toggleMark(s, NOTE_SYMBOLS.findIndex((x) => x.id === 'slur'));
  if (s.caret && eq(s.caret.time, end)) {
    const pendingTie = !s.input.pendingTie;
    return {
      ...s,
      input: { ...s.input, pendingTie },
      message: pendingTie ? 'Haltebogen: Die nächste Note gleicher Tonhöhe wird angebunden.' : 'Haltebogen aufgehoben.',
    };
  }
  return say(s, 'Kein Bogen möglich: Es folgt keine Note.');
}

const slide = (s: EditorState): EditorState => toggleLink(s, 'slide');

/** Caret stops: note starts/ends and barlines, up to the end of the last measure with music. */
function caretStops(score: Score, ref: VoiceRef): Fraction[] {
  const measures = measuresOf(score);
  const limit = measures[measures.length - 1]!.end;
  const stops: Fraction[] = [ZERO, limit];
  for (const m of measures) stops.push(m.start);
  for (const e of getVoice(score, ref).voice.events) stops.push(e.onset, eventEnd(e));
  return stops.filter((t) => le(t, limit));
}

function navHorizontal(s0: EditorState, dir: number): EditorState {
  const s = s0.input.chord || s0.input.ghost ? { ...s0, input: { ...s0.input, chord: false, chordEvent: null, ghost: null } } : s0; // moving on ends chord mode and the ghost note
  const caret = s.caret;
  if (caret) {
    const stops = caretStops(s.score, caret);
    let best: Fraction | null = null;
    for (const t of stops) {
      const ahead = dir > 0 ? gt(t, caret.time) : lt(t, caret.time);
      if (ahead && (!best || (dir > 0 ? lt(t, best) : gt(t, best)))) best = t;
    }
    if (!best) return s;
    return { ...s, caret: { ...caret, time: best }, selection: selectionAt(s.score, caret, best), message: null };
  }
  const sel = s.selection;
  const ref = sel ?? allVoiceRefs(s.score)[0];
  if (!ref) return s;
  const events = getVoice(s.score, ref).voice.events;
  if (!sel) return events[0] ? { ...s, selection: selectEvent(ref, events[0]), message: null } : s;
  const time = selectionTime(s.score, sel) ?? ZERO;
  const candidates = dir > 0 ? events.filter((e) => gt(e.onset, time)) : events.filter((e) => lt(e.onset, time));
  const pick = dir > 0 ? candidates[0] : candidates[candidates.length - 1];
  return pick ? { ...s, selection: selectEvent(ref, pick), message: null } : s;
}

/**
 * Alt+↑/↓ on a chord first walks through its tones (like in Finale): the first press selects the top (↑) or bottom (↓) tone,
 * the next ones the neighbours; ↑ / ↓ alone then changes just that tone. Beyond the last tone the key switches the staff.
 */
function stepChordTone(s: EditorState, dir: number): EditorState | null {
  const sel = s.selection;
  if (s.caret || sel?.kind !== 'event') return null;
  const event = findEvent(s.score, sel, sel.eventId);
  if (!event || event.tones.length < 2) return null;
  const tones = [...event.tones].sort((a, b) => midiOf(a.pitch) - midiOf(b.pitch));
  const up = dir < 0;
  const at = sel.toneId ? tones.findIndex((t) => t.id === sel.toneId) : -1;
  const pick = at < 0 ? (up ? tones.length - 1 : 0) : at + (up ? 1 : -1);
  const tone = tones[pick];
  if (!tone) return null; // past the top / bottom tone: on to the next staff
  return { ...s, selection: { ...sel, toneId: tone.id }, message: `Akkordton ${pitchToString(tone.pitch)} gewählt – ↑ / ↓ ändert nur diesen Ton, Alt+↑ / ↓ wählt den nächsten.` };
}

function navStaff(s: EditorState, dir: number): EditorState {
  const inChord = stepChordTone(s, dir);
  if (inChord) return inChord;
  // One stop per staff (its first voice): detached voices are reached by clicking, not by walking through them.
  const staffOf = (r: VoiceRef) => `${r.partId}:${getVoice(s.score, r).voice.staff}`;
  const all = allVoiceRefs(s.score);
  const refs = all.filter((r, i) => all.findIndex((o) => staffOf(o) === staffOf(r)) === i);
  const current = s.caret ?? s.selection ?? refs[0];
  if (!current) return s;
  const index = refs.findIndex((r) => staffOf(r) === staffOf(current));
  const next = refs[index + dir];
  if (!next) return s;
  const time = s.caret?.time ?? selectionTime(s.score, s.selection) ?? ZERO;
  return {
    ...s,
    caret: s.caret ? { ...next, time } : null,
    selection: selectionAt(s.score, next, time),
    message: null,
  };
}

function toggleInsert(s: EditorState): EditorState {
  const insert = !s.input.insert;
  return {
    ...s,
    input: { ...s.input, insert },
    message: insert ? 'Einfügen: Folgende Musik wird nach hinten verschoben.' : 'Überschreiben',
  };
}

// ── Text: lyrics and chord symbols (ADR 0019) ───────────────────────────────

/** The voice's notes from the target note on, as the text the lyrics dialog starts with ("Hel- lo _ world"). */
export function lyricsText(s: EditorState, verse = 1): string | null {
  const t = target(s);
  if (!t) return null;
  const events = getVoice(s.score, t.ref).voice.events.filter((e) => !lt(e.onset, t.event.onset));
  const words = events.map((e) => lyricOf(e, verse) ?? '_');
  while (words.length && words[words.length - 1] === '_') words.pop();
  return words.join(' ');
}

/**
 * Sets the lyrics from the target note on: one syllable per note, "_" = a note without syllable,
 * a trailing "-" continues the word. Notes after the last syllable lose their lyric.
 */
export function setLyrics(s: EditorState, text: string, verse = 1): EditorState {
  const t = target(s);
  if (!t) return say(s, NO_NOTE);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const from = t.event.onset;
  const events = getVoice(s.score, t.ref).voice.events;
  const later = events.filter((e) => !lt(e.onset, from));
  const used = Math.min(words.length, later.length);
  const score = updateEvents(s.score, t.ref, (all) =>
    all.map((e) => {
      const i = later.findIndex((x) => x.id === e.id);
      if (i < 0) return e;
      return withLyric(e, verse, words[i] ?? null);
    }),
  );
  const extra = words.length - used;
  return {
    ...s,
    score,
    selection: selectEvent(t.ref, t.event),
    message: extra > 0 ? `${extra} Silbe(n) passen nicht mehr: Es gibt keine weiteren Noten.` : null,
  };
}

/** Puts one syllable on one note ("_" or empty takes the syllable away) – the lyrics field's click on a note. */
export function setLyricOf(s: EditorState, ref: VoiceRef, eventId: string, syllable: string, verse = 1): EditorState {
  const score = updateEvents(s.score, ref, (events) => events.map((e) => (e.id === eventId ? withLyric(e, verse, syllable) : e)));
  return { ...s, score };
}

/** Time a chord symbol typed now belongs to: where the next note goes, else the selected note. */
function chordTime(s: EditorState): Fraction | null {
  return s.caret?.time ?? selectionTime(s.score, s.selection);
}

export function chordSymbolText(s: EditorState): string | null {
  const time = chordTime(s);
  return time ? (s.score.chords ?? []).find((c) => eq(c.at, time))?.text ?? '' : null;
}

/** Sets (or, with empty text, removes) the chord symbol at the caret / selected note. */
export function setChordSymbol(s: EditorState, text: string): EditorState {
  const time = chordTime(s);
  if (!time) return say(s, NO_NOTE);
  const symbol = text.trim();
  const others = (s.score.chords ?? []).filter((c) => !eq(c.at, time));
  const chords: ChordSymbol[] = symbol ? [...others, { at: time, text: symbol }].sort((a, b) => compare(a.at, b.at)) : others;
  const { chords: _old, ...rest } = s.score;
  return { ...s, score: chords.length ? { ...rest, chords } : rest, message: null };
}

/** Fresh editor on a (by default empty) score, caret ready in the first staff. */
export function newScoreState(score: Score = emptyScore()): EditorState {
  const s = createEditorState(score);
  const first = allVoiceRefs(s.score)[0]!;
  return { ...s, caret: { ...first, time: ZERO }, message: 'Neue Partitur – einfach lostippen.' };
}

// ── Registry ───────────────────────────────────────────────────────────────

export interface CommandDef {
  readonly title: string;
  readonly run: (s: EditorState, arg: number) => EditorState;
}

export const COMMANDS = {
  'input.toggle': { title: 'Eingabe starten / beenden', run: toggleInput },
  'input.duration': { title: 'Notenwert für die nächste Note', run: inputDuration },
  'input.dot': { title: 'Punktierung', run: toggleDot },
  'input.note': { title: 'Note eingeben', run: enterNote },
  'input.pitchClass': { title: 'Note nach Klaviertaste eingeben', run: enterPitchClass },
  'input.spelled': { title: 'Note mit Vorzeichen eingeben (diktiert: fis, es …)', run: enterSpelled },
  'input.midi': { title: 'Note vom MIDI-Keyboard eingeben', run: enterMidi },
  'input.midiAdd': { title: 'Weiteren Ton vom MIDI-Keyboard zum Akkord', run: addMidi },
  'mark.toggle': { title: 'Zeichen an der Note (Dynamik, Artikulation, Verzierung)', run: toggleMark },
  'edit.tabTranslate': { title: 'Auswahl in Gitarren-Tabulatur übersetzen', run: translateToTab },
  'mark.group': { title: 'Klammer / Akkolade um Zeilen', run: toggleGroup },
  'mark.bar': { title: 'Zeichen am Takt (Wiederholung, Klammer, Segno, Coda, Sprung)', run: toggleBarSign },
  'edit.tab': { title: 'Tabulatur an/aus', run: toggleTab },
  'input.tuplet': { title: 'Triolen / Quintolen / Septolen', run: toggleTuplet },
  'tab.fret': { title: 'Bundzahl in der Tabulatur setzen', run: (s, arg) => setFret(s, arg ?? 0) },
  'input.nextSharp': { title: 'Kreuz für die nächste Note', run: (s) => nextAccidental(s, 1) },
  'input.nextFlat': { title: 'B für die nächste Note', run: (s) => nextAccidental(s, -1) },
  'input.octave': { title: 'Oktave für die nächste Note', run: nextOctave },
  'input.length': { title: 'Notenwert (Ziffernblock)', run: inputLengthKey },
  'input.repeat': { title: 'Vorschau-Note setzen (Finale-Ziffernblock)', run: commitGhost },
  'ghost.step': { title: 'Vorschau-Note eine Stufe höher/tiefer', run: ghostStep },
  'ghost.alter': { title: 'Vorschau-Note: Vorzeichen', run: ghostAlter },
  'input.interval': { title: 'Ton im Intervall darüber/darunter', run: addInterval },
  'input.chordNote': { title: 'Ton zum Akkord hinzufügen', run: addChordNote },
  'input.chordMode': { title: 'Akkordmodus an/aus', run: toggleChordMode },
  'input.rest': { title: 'Pause eingeben', run: enterRest },
  'input.insertMode': { title: 'Einfügen / Überschreiben', run: toggleInsert },
  'range.extend': { title: 'Bereich markieren: um eine Note erweitern', run: extendRange },
  'range.all': { title: 'Alle Noten der Stimme markieren', run: selectAllNotes },
  'edit.escape': { title: 'Eingabe beenden / Auswahl aufheben', run: escape },
  'edit.toRest': { title: 'Note in Pause umwandeln', run: toRest },
  'edit.delete': { title: 'Note löschen', run: deleteNote },
  'edit.backspace': { title: 'Zurück löschen', run: backspace },
  'edit.step': { title: 'Tonhöhe um eine Stufe', run: step },
  'edit.octave': { title: 'Tonhöhe um eine Oktave', run: octave },
  'edit.alter': { title: 'Vorzeichen: Halbton höher/tiefer', run: alter },
  'edit.semitone': { title: 'Um einen Halbton transponieren', run: semitone },
  'edit.duration': { title: 'Notenwert der Note ändern', run: editDuration },
  'edit.tie': { title: 'Haltebogen', run: tie },
  'edit.slide': { title: 'Gleiten zur nächsten Note', run: slide },
  'edit.detach': { title: 'Akkordton in eigene Stimme lösen', run: detachTone },
  'edit.move': { title: 'Note in der Zeit verschieben', run: moveNote },
  'edit.resize': { title: 'Note verlängern / verkürzen', run: resizeNote },
  'nav.horizontal': { title: 'Vor / zurück', run: navHorizontal },
  'nav.staff': { title: 'System wechseln', run: navStaff },
} satisfies Record<string, CommandDef>;

export type CommandId = keyof typeof COMMANDS;

export function runCommand(s: EditorState, id: CommandId, arg = 0): EditorState {
  return withValidLinks(s, (COMMANDS[id] as CommandDef).run(s, arg));
}
