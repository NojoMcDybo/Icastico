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
import { type Fraction, ZERO, add, eq, frac, gt, isDyadic, le, lt } from '../time';
import { STEPS, keyAlteration, midiOf, type Pitch } from '../pitch';
import { type NoteEvent, type Score, eventEnd, keyAt, measuresOf } from '../model';
import { decomposeNote, writtenValue } from '../notation/notate';
import { emptyScore } from '../templates';
import {
  type Caret,
  type EditorState,
  type Selection,
  type VoiceRef,
  allVoiceRefs,
  createEditorState,
  getVoice,
  inputLength,
  sameVoice,
  staffCenter,
  updateEvents,
  voiceEnd,
} from './state';
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

function freshId(score: Score, ref: VoiceRef, counter: number): [string, number] {
  const used = new Set(getVoice(score, ref).voice.events.map((e) => e.id));
  let n = counter;
  while (used.has(`${ref.voiceId}-n${n}`)) n++;
  return [`${ref.voiceId}-n${n}`, n + 1];
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

const samePitches = (a: readonly Pitch[], b: readonly Pitch[]): boolean =>
  a.length === b.length && a.every((p, i) => samePitch(p, b[i]!));

/** Pitch of the note before the caret, else the staff's middle line. */
function referencePitch(s: EditorState, caret: Caret): Pitch {
  const before = getVoice(s.score, caret).voice.events.filter((e) => le(eventEnd(e), caret.time));
  const last = before[before.length - 1];
  return last ? last.pitches[0]! : staffCenter(s.score, caret);
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

const sortPitches = (ps: readonly Pitch[]): Pitch[] => [...ps].sort((a, b) => midiOf(a) - midiOf(b));

function replacePitches(s: EditorState, fn: (p: Pitch, ev: NoteEvent) => Pitch): EditorState {
  const t = target(s);
  if (!t) return say(s, NO_NOTE);
  const score = updateEvents(s.score, t.ref, (events) =>
    events.map((e) => (e.id === t.event.id ? { ...e, pitches: sortPitches(e.pitches.map((p) => fn(p, e))) } : e)),
  );
  return { ...s, score, selection: selectEvent(t.ref, t.event), message: null };
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

function toggleDot(s: EditorState): EditorState {
  if (s.caret || s.selection?.kind !== 'event') {
    return { ...s, input: { ...s.input, dots: s.input.dots === 1 ? 0 : 1 }, message: null };
  }
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
  const { step, alter } = spellPitchClass(pc, keyAt(s.score, s.caret.time));
  return enterPitch(s, step, alter);
}

/** Enters a note at the caret; `alter` null = as the key signature says. */
function enterPitch(s0: EditorState, step: Pitch['step'], alterOverride: number | null): EditorState {
  const s = ensureCaret(s0);
  const caret = s.caret;
  if (!caret) return say(s, 'Die Partitur hat keine Stimme.');
  const alter = alterOverride ?? keyAlteration(keyAt(s.score, caret.time), step);
  const pitch = nearestOctave(step, alter, referencePitch(s, caret));
  const length = inputLength(s.input);
  const insert = s.input.insert;
  const prev = getVoice(s.score, caret).voice.events.find((e) => eq(eventEnd(e), caret.time));

  let score: Score;
  let selection: Selection;
  let nextId = s.nextId;
  if (s.input.pendingTie && prev && prev.pitches.length === 1 && samePitch(prev.pitches[0]!, pitch)) {
    // Tie = one longer event on the timeline.
    score = updateEvents(s.score, caret, (events) =>
      insertSorted(
        makeRoom(
          events.filter((e) => e.id !== prev.id),
          caret.time,
          length,
          insert,
        ),
        { ...prev, duration: add(prev.duration, length) },
      ),
    );
    selection = selectEvent(caret, prev);
  } else {
    const [id, next] = freshId(s.score, caret, s.nextId);
    nextId = next;
    const ev: NoteEvent = { id, onset: caret.time, duration: length, pitches: [pitch] };
    score = updateEvents(s.score, caret, (events) => insertSorted(makeRoom(events, caret.time, length, insert), ev));
    selection = selectEvent(caret, ev);
  }
  return {
    ...s,
    score,
    selection,
    nextId,
    caret: { ...caret, time: add(caret.time, length) },
    input: { ...s.input, pendingTie: false },
    message: null,
  };
}

function addChordNote(s: EditorState, stepIndex: number): EditorState {
  const step = STEPS[stepIndex];
  const t = target(s);
  if (!step) return s;
  if (!t) return say(s, NO_NOTE);
  const top = Math.max(...t.event.pitches.map(midiOf));
  const alter = keyAlteration(keyAt(s.score, t.event.onset), step);
  let pitch: Pitch = { step, alter, octave: -1 };
  while (midiOf(pitch) <= top) pitch = { ...pitch, octave: pitch.octave + 1 };
  const score = updateEvents(s.score, t.ref, (events) =>
    events.map((e) => (e.id === t.event.id ? { ...e, pitches: sortPitches([...e.pitches, pitch]) } : e)),
  );
  return { ...s, score, selection: selectEvent(t.ref, t.event), message: null };
}

function enterRest(s0: EditorState): EditorState {
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
  if (s.caret) return { ...s, caret: null, input: { ...s.input, pendingTie: false }, message: null };
  const next = ensureCaret(s);
  return next.caret ? { ...next, message: null } : say(s, 'Die Partitur hat keine Stimme.');
}

function escape(s: EditorState): EditorState {
  if (s.caret) return { ...s, caret: null, input: { ...s.input, pendingTie: false }, message: null };
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

function backspace(s: EditorState): EditorState {
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

function tie(s: EditorState): EditorState {
  const t = target(s);
  if (!t) return say(s, NO_NOTE);
  const end = eventEnd(t.event);
  const next = getVoice(s.score, t.ref).voice.events.find((e) => eq(e.onset, end));
  if (next && samePitches(next.pitches, t.event.pitches)) {
    const merged = { ...t.event, duration: add(t.event.duration, next.duration) };
    const score = updateEvents(s.score, t.ref, (events) =>
      events.filter((e) => e.id !== next.id).map((e) => (e.id === t.event.id ? merged : e)),
    );
    const caret = s.caret && sameVoice(s.caret, t.ref) && eq(s.caret.time, end) ? { ...s.caret, time: eventEnd(merged) } : s.caret;
    return { ...s, score, caret, selection: selectEvent(t.ref, merged), message: null };
  }
  if (next) return say(s, 'Kein Haltebogen möglich: Die folgende Note hat eine andere Tonhöhe.');
  if (s.caret && eq(s.caret.time, end)) {
    const pendingTie = !s.input.pendingTie;
    return {
      ...s,
      input: { ...s.input, pendingTie },
      message: pendingTie ? 'Haltebogen: Die nächste Note gleicher Tonhöhe wird angebunden.' : 'Haltebogen aufgehoben.',
    };
  }
  return say(s, 'Kein Haltebogen möglich: Es folgt keine Note.');
}

/** Caret stops: note starts/ends and barlines, up to the end of the last measure with music. */
function caretStops(score: Score, ref: VoiceRef): Fraction[] {
  const measures = measuresOf(score);
  const limit = measures[measures.length - 1]!.end;
  const stops: Fraction[] = [ZERO, limit];
  for (const m of measures) stops.push(m.start);
  for (const e of getVoice(score, ref).voice.events) stops.push(e.onset, eventEnd(e));
  return stops.filter((t) => le(t, limit));
}

function navHorizontal(s: EditorState, dir: number): EditorState {
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

function navStaff(s: EditorState, dir: number): EditorState {
  const refs = allVoiceRefs(s.score);
  const current = s.caret ?? s.selection ?? refs[0];
  if (!current) return s;
  const index = refs.findIndex((r) => sameVoice(r, current));
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
  'input.chordNote': { title: 'Ton zum Akkord hinzufügen', run: addChordNote },
  'input.rest': { title: 'Pause eingeben', run: enterRest },
  'input.insertMode': { title: 'Einfügen / Überschreiben', run: toggleInsert },
  'edit.escape': { title: 'Eingabe beenden / Auswahl aufheben', run: escape },
  'edit.toRest': { title: 'Note in Pause umwandeln', run: toRest },
  'edit.delete': { title: 'Note löschen', run: toRest },
  'edit.backspace': { title: 'Zurück löschen', run: backspace },
  'edit.step': { title: 'Tonhöhe um eine Stufe', run: step },
  'edit.octave': { title: 'Tonhöhe um eine Oktave', run: octave },
  'edit.alter': { title: 'Vorzeichen: Halbton höher/tiefer', run: alter },
  'edit.semitone': { title: 'Um einen Halbton transponieren', run: semitone },
  'edit.duration': { title: 'Notenwert der Note ändern', run: editDuration },
  'edit.tie': { title: 'Haltebogen', run: tie },
  'nav.horizontal': { title: 'Vor / zurück', run: navHorizontal },
  'nav.staff': { title: 'System wechseln', run: navStaff },
} satisfies Record<string, CommandDef>;

export type CommandId = keyof typeof COMMANDS;

export function runCommand(s: EditorState, id: CommandId, arg = 0): EditorState {
  return (COMMANDS[id] as CommandDef).run(s, arg);
}
