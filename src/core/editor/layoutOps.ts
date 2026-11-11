/**
 * Things the user places by hand (ADR 0043): the direction of stems, hidden and moved rests, free texts on the staves.
 * All are pure changes of the score; the commands in `commands.ts` and the workstation call them.
 */
import { type FreeText, type NoteEvent, type RestMark, type Score, type Voice, DEFAULT_TEXT_SIZE, MAX_REST_SHIFT, MAX_TEXT_SIZE, MIN_TEXT_SIZE, clefAt, measuresOf } from '../model';
import { STEPS, type Pitch } from '../pitch';
import { notateVoice } from '../notation/notate';
import { type Fraction, compare, eq, le, lt } from '../time';
import { rangeSpan } from './range';
import { type EditorState, type VoiceRef, getVoice, updateEvents } from './state';

const say = (s: EditorState, message: string): EditorState => ({ ...s, message });

const stepNumber = (p: Pitch): number => p.octave * 7 + STEPS.indexOf(p.step);

/** Which way the engraver turns the stem of this note when nobody forces it: away from the middle line; the first of several voices up, the others down. */
export function defaultStem(score: Score, ref: VoiceRef, event: NoteEvent): 'up' | 'down' {
  const { part, voice } = getVoice(score, ref);
  const together = part.voices.filter((v) => v.staff === voice.staff);
  if (together.length > 1) return together[0]!.id === voice.id ? 'up' : 'down';
  const center = stepNumber(clefAt(part, voice.staff, event.onset).center);
  const steps = event.tones.map((t) => stepNumber(t.pitch));
  const above = Math.max(...steps) - center;
  const below = center - Math.min(...steps);
  return below > above ? 'up' : 'down';
}

/** The notes the command works on: a marked passage, else the selected note. */
function chosenEvents(s: EditorState): { ref: VoiceRef; ids: Set<string> } | null {
  const span = rangeSpan(s);
  if (span) {
    const voice = getVoice(s.score, span).voice;
    return { ref: span, ids: new Set(voice.events.filter((e) => le(span.from, e.onset) && lt(e.onset, span.to)).map((e) => e.id)) };
  }
  const sel = s.selection;
  return sel?.kind === 'event' ? { ref: sel, ids: new Set([sel.eventId]) } : null;
}

const NO_STEM_NOTE = 'Erst eine oder mehrere Noten markieren, deren Hals umgedreht werden soll.';

/** Turns the stems of the selected / marked notes the other way round; a stem that ends up as the engraver would draw it is left to the engraver again. */
export function flipStems(s: EditorState): EditorState {
  const chosen = chosenEvents(s);
  if (!chosen) return say(s, NO_STEM_NOTE);
  let last: 'up' | 'down' | undefined;
  const score = updateEvents(s.score, chosen.ref, (events) =>
    events.map((e) => {
      if (!chosen.ids.has(e.id)) return e;
      const auto = defaultStem(s.score, chosen.ref, e);
      const next = (e.stem ?? auto) === 'up' ? 'down' : 'up';
      last = next;
      const { stem: _old, ...rest } = e;
      return next === auto ? rest : { ...rest, stem: next };
    }),
  );
  if (!last) return say(s, NO_STEM_NOTE);
  const many = chosen.ids.size > 1;
  return { ...s, score, message: many ? 'Hälse umgedreht' : last === 'up' ? 'Hals nach oben' : 'Hals nach unten' };
}

// ── Rests ───────────────────────────────────────────────────────────────────

/** Where the rests of a voice start (as they are drawn), optionally only those inside `from` … `to`. */
export function restStarts(score: Score, voice: Voice, from?: Fraction, to?: Fraction): Fraction[] {
  const bars = measuresOf(score, 1, to);
  const starts: Fraction[] = [];
  notateVoice(voice, bars).forEach((items, mi) => {
    for (const it of items) {
      if (it.kind === 'rest' && !it.invisible) starts.push(it.onset);
      else if (it.kind === 'measureRest') starts.push(bars[mi]!.start);
    }
  });
  return starts.filter((t) => (from === undefined || le(from, t)) && (to === undefined || lt(t, to)));
}

/** The rests a rest command works on: the one that is selected, or those between the notes of a marked passage. */
function chosenRests(s: EditorState): { ref: VoiceRef; at: Fraction[] } | null {
  const span = rangeSpan(s);
  if (span) {
    const at = restStarts(s.score, getVoice(s.score, span).voice, span.from, span.to);
    return at.length > 0 ? { ref: span, at } : null;
  }
  const sel = s.selection;
  if (sel?.kind !== 'gap') return null;
  const voice = getVoice(s.score, sel).voice;
  const at = restStarts(s.score, voice).filter((t) => eq(t, sel.time));
  return at.length > 0 ? { ref: sel, at } : null;
}

function withRestMarks(score: Score, ref: VoiceRef, at: readonly Fraction[], patch: (mark: RestMark | undefined) => { hidden?: true; shift?: number }): Score {
  return {
    ...score,
    parts: score.parts.map((p) =>
      p.id !== ref.partId
        ? p
        : {
            ...p,
            voices: p.voices.map((v) => {
              if (v.id !== ref.voiceId) return v;
              const marks = new Map<string, RestMark>((v.rests ?? []).map((r) => [`${r.at.n}/${r.at.d}`, r]));
              for (const time of at) {
                const key = `${time.n}/${time.d}`;
                const next = patch(marks.get(key));
                if (next.hidden || next.shift) marks.set(key, { at: time, ...next });
                else marks.delete(key);
              }
              const rests = [...marks.values()].sort((a, b) => compare(a.at, b.at));
              const { rests: _old, ...rest } = v;
              return rests.length > 0 ? { ...rest, rests } : rest;
            }),
          },
    ),
  };
}

/** V: hides the selected rest(s) – all hidden already: shows them again. A hidden rest stays selectable (drawn faintly on screen only). */
export function hideRests(s: EditorState): EditorState {
  const chosen = chosenRests(s);
  if (!chosen) return say(s, 'Erst eine Pause anklicken (oder Noten markieren), die unsichtbar werden soll.');
  const voice = getVoice(s.score, chosen.ref).voice;
  const allHidden = chosen.at.every((t) => voice.rests?.some((r) => r.hidden && eq(r.at, t)));
  const score = withRestMarks(s.score, chosen.ref, chosen.at, (m) => ({ ...(allHidden ? {} : { hidden: true as const }), ...(m?.shift ? { shift: m.shift } : {}) }));
  const many = chosen.at.length > 1;
  return { ...s, score, message: allHidden ? (many ? 'Pausen wieder sichtbar' : 'Pause wieder sichtbar') : many ? 'Pausen unsichtbar' : 'Pause unsichtbar' };
}

/** ↑ / ↓ on selected rest(s): up or down by one staff step (half a line distance). Null if no rest is chosen. */
export function shiftRests(s: EditorState, delta: number): EditorState | null {
  const chosen = chosenRests(s);
  if (!chosen) return null;
  const voice = getVoice(s.score, chosen.ref).voice;
  const first = voice.rests?.find((r) => eq(r.at, chosen.at[0]!))?.shift ?? 0;
  const next = Math.max(-MAX_REST_SHIFT, Math.min(MAX_REST_SHIFT, first + Math.sign(delta)));
  if (next === first) return say(s, `Weiter lässt sich die Pause nicht verschieben (höchstens ${MAX_REST_SHIFT} Stufen).`);
  const score = withRestMarks(s.score, chosen.ref, chosen.at, (m) => ({ ...(m?.hidden ? { hidden: true as const } : {}), ...(next !== 0 ? { shift: next } : {}) }));
  return { ...s, score, message: next === 0 ? 'Pause wieder an ihrem Platz' : `Pause ${next > 0 ? 'höher' : 'tiefer'} (${Math.abs(next)} ${Math.abs(next) === 1 ? 'Stufe' : 'Stufen'})` };
}

/** Backspace / Delete on a selected rest: the rest cannot go (the time stays), so it is hidden. Null if no rest is chosen. */
export function eraseRests(s: EditorState): EditorState | null {
  const sel = s.selection;
  if (sel?.kind !== 'gap' || !chosenRests(s)) return null;
  const voice = getVoice(s.score, sel).voice;
  if (voice.rests?.some((r) => r.hidden && eq(r.at, sel.time))) return say(s, 'Die Pause ist schon unsichtbar (V zeigt sie wieder).');
  return hideRests(s);
}

// ── Free texts ──────────────────────────────────────────────────────────────

export const clampTextSize = (size: number): number => Math.max(MIN_TEXT_SIZE, Math.min(MAX_TEXT_SIZE, Math.round(size)));

function freshTextId(score: Score): string {
  const used = new Set((score.texts ?? []).map((t) => t.id));
  let n = 1;
  while (used.has(`text-${n}`)) n++;
  return `text-${n}`;
}

const withTexts = (score: Score, texts: readonly FreeText[]): Score => {
  const { texts: _old, ...rest } = score;
  return texts.length > 0 ? { ...rest, texts } : rest;
};

/** A new text on the staff of `ref` at `at`, a little above it. Returns the state and the id of the text. */
export function addText(s: EditorState, ref: VoiceRef, at: Fraction, text: string, size = DEFAULT_TEXT_SIZE): { state: EditorState; id: string } | null {
  const clean = text.trim();
  if (clean === '') return null;
  const staff = getVoice(s.score, ref).voice.staff;
  const id = freshTextId(s.score);
  const entry: FreeText = { id, partId: ref.partId, staff, at, text: clean, size: clampTextSize(size), dx: 0, dy: 4 };
  return { state: { ...s, score: withTexts(s.score, [...(s.score.texts ?? []), entry]), message: 'Text gesetzt' }, id };
}

/** Another wording and / or size; an empty text removes it. */
export function changeText(s: EditorState, id: string, text: string, size: number): EditorState {
  const clean = text.trim();
  const texts = (s.score.texts ?? []).flatMap((t) => (t.id !== id ? [t] : clean === '' ? [] : [{ ...t, text: clean, size: clampTextSize(size) }]));
  return { ...s, score: withTexts(s.score, texts), message: clean === '' ? 'Text entfernt' : 'Text geändert' };
}

/** Puts a text somewhere else: another staff and time, and an offset from there (staff steps). */
export function moveText(s: EditorState, id: string, place: { partId: string; staff: number; at: Fraction; dx: number; dy: number }): EditorState {
  const round = (n: number) => Math.round(n * 10) / 10;
  const texts = (s.score.texts ?? []).map((t) => (t.id === id ? { ...t, ...place, dx: round(place.dx), dy: round(place.dy) } : t));
  return { ...s, score: withTexts(s.score, texts), message: 'Text verschoben' };
}

export function eraseText(s: EditorState, id: string): EditorState {
  if (!(s.score.texts ?? []).some((t) => t.id === id)) return s;
  return { ...s, score: withTexts(s.score, (s.score.texts ?? []).filter((t) => t.id !== id)), message: 'Text entfernt' };
}
