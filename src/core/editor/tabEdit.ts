/**
 * Editing a tablature line of its own (ADR 0032): a selected number moves to another string with ↑ / ↓ (the sound stays),
 * and typing a number sets the fret (the pitch follows, the string stays).
 * Tones carry the string they were put on (`Tone.string`); where it is not set, the fingering is worked out as for drawing.
 */
import { type NoteEvent, type Part, type Tone, keyAt } from '../model';
import { MAX_FRET, assignFrets, fretOn, tuningOf } from '../tab';
import { midiOf, spellMidi } from '../pitch';
import { compare } from '../time';
import { type EditorState, type Selection, getVoice, updateEvents } from './state';

const say = (s: EditorState, message: string): EditorState => ({ ...s, message });

interface Target {
  readonly part: Part;
  readonly sel: Extract<Selection, { kind: 'event' }>;
  readonly event: NoteEvent;
}

/** The selected note, when it sits on a tablature line of its own. */
export function tabTarget(s: EditorState): Target | null {
  const sel = s.selection;
  if (s.caret || sel?.kind !== 'event') return null;
  const part = s.score.parts.find((p) => p.id === sel.partId);
  if (part?.instrument !== 'tab') return null;
  const event = getVoice(s.score, sel).voice.events.find((e) => e.id === sel.eventId);
  return event ? { part, sel, event } : null;
}

/** The string every tone of the part is on right now (the one it carries, else the one the fingering picks). */
function stringsOf(part: Part): Map<string, number> {
  const events = part.voices.flatMap((v) => v.events).sort((a, b) => compare(a.onset, b.onset));
  const fingering = assignFrets(events, tuningOf(part));
  return new Map([...fingering].map(([id, f]) => [id, f.string]));
}

const withTones = (s: EditorState, t: Target, tones: readonly Tone[]): EditorState['score'] =>
  updateEvents(s.score, t.sel, (events) => events.map((e) => (e.id === t.event.id ? { ...e, tones: [...tones].sort((a, b) => midiOf(a.pitch) - midiOf(b.pitch)) } : e)));

/**
 * ↑ / ↓ on a number: to the next higher (`direction` +1) or lower string, keeping the pitch. The chosen tone alone,
 * else every tone of the note. The strings of the whole note are written down so they stay as they are.
 */
export function moveToString(s: EditorState, direction: number): EditorState | null {
  const t = tabTarget(s);
  if (!t) return null;
  const tuning = tuningOf(t.part);
  const now = stringsOf(t.part);
  const only = t.sel.toneId && t.event.tones.some((x) => x.id === t.sel.toneId) ? t.sel.toneId : undefined;
  const target = (tone: Tone): number | null => {
    const from = now.get(tone.id);
    if (from === undefined) return null;
    const to = from - Math.sign(direction); // string 1 is the highest: up means a smaller number
    return fretOn(midiOf(tone.pitch), to, tuning) === null ? null : to;
  };
  const moved = new Map<string, number>();
  for (const tone of t.event.tones) {
    if (only !== undefined && tone.id !== only) continue;
    const to = target(tone);
    if (to === null) return say(s, only !== undefined || t.event.tones.length === 1 ? `Auf dieser Saite geht der Ton nicht (Bund 0 bis ${MAX_FRET}).` : 'Nicht alle Töne lassen sich auf die nächste Saite legen (Bund 0 bis ' + MAX_FRET + ').');
    moved.set(tone.id, to);
  }
  const strings = t.event.tones.map((tone) => moved.get(tone.id) ?? now.get(tone.id));
  if (new Set(strings).size !== strings.length) return say(s, 'Dort liegt schon ein anderer Ton des Akkords.');
  const tones = t.event.tones.map((tone) => ({ ...tone, string: moved.get(tone.id) ?? now.get(tone.id)! }));
  const to = moved.get(only ?? t.event.tones[0]!.id)!;
  return { ...s, score: withTones(s, t, tones), message: `Saite ${to}, Bund ${fretOn(midiOf(t.event.tones.find((x) => x.id === (only ?? t.event.tones[0]!.id))!.pitch), to, tuning)}` };
}

/** A number typed on a selected note: that fret, on the string the tone is on; the pitch changes with it. */
export function setFret(s: EditorState, fret: number): EditorState {
  const t = tabTarget(s);
  if (!t) return say(s, 'Erst eine Note in der Tabulatur anklicken, dann die Zahl tippen.');
  if (!Number.isInteger(fret) || fret < 0) return say(s, 'Der Bund muss eine ganze Zahl ab 0 sein.');
  const tone = t.sel.toneId ? t.event.tones.find((x) => x.id === t.sel.toneId) : t.event.tones.length === 1 ? t.event.tones[0] : undefined;
  if (!tone) return say(s, 'Bei einem Akkord erst den Ton anklicken (oder mit Alt+↑ / ↓ wählen), dessen Zahl sich ändern soll.');
  const tuning = tuningOf(t.part);
  const string = stringsOf(t.part).get(tone.id) ?? tone.string;
  if (string === undefined) return say(s, 'Dieser Ton hat auf der Gitarre keinen Platz; erst eine spielbare Tonhöhe wählen.');
  const midi = tuning[string - 1]! + fret;
  if (midi > 127) return say(s, 'Dieser Bund ergäbe einen Ton über dem höchsten darstellbaren (MIDI 127).');
  if (t.event.tones.some((x) => x.id !== tone.id && midiOf(x.pitch) === midi)) return say(s, 'Dieser Ton liegt im Akkord schon.');
  const pitch = spellMidi(midi, keyAt(s.score, t.event.onset));
  const tones = t.event.tones.map((x) => (x.id === tone.id ? { ...x, pitch, string } : x));
  return { ...s, score: withTones(s, t, tones), message: `Saite ${string}, Bund ${fret}${fret > MAX_FRET ? ` (die Gitarre hat nur ${MAX_FRET} Bünde)` : ''}` };
}
