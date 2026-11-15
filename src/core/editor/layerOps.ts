/**
 * Two layers (Ebenen) in one staff (ADR 0044): layer 1 is the first voice of the staff, layer 2 the second. Choosing a layer
 * puts the input cursor there, at the same time; the second voice is made when it is chosen the first time.
 */
import type { Part, Voice } from '../model';
import { type Fraction, ZERO } from '../time';
import { type EditorState, type VoiceRef, getVoice } from './state';

/** The voices of one staff of a part, in score order: the first is layer 1, the second layer 2. */
export const layersOf = (part: Part, staff: number): readonly Voice[] => part.voices.filter((v) => v.staff === staff);

/** The layer (1 or 2 …) a voice is drawn in. */
export function layerNumber(part: Part, voice: Voice): number {
  return layersOf(part, voice.staff).findIndex((v) => v.id === voice.id) + 1;
}

function whereNow(s: EditorState): { ref: VoiceRef; time: Fraction } | null {
  if (s.caret) return { ref: s.caret, time: s.caret.time };
  const sel = s.selection;
  if (!sel) return null;
  if (sel.kind === 'gap') return { ref: sel, time: sel.time };
  const event = getVoice(s.score, sel).voice.events.find((e) => e.id === sel.eventId);
  return { ref: sel, time: event?.onset ?? ZERO };
}

/** Layer 1 or 2 of the staff the cursor / selection is on: the input cursor moves there, at the same time. */
export function chooseLayer(s: EditorState, n: number): EditorState {
  const here = whereNow(s);
  if (!here) return { ...s, message: 'Erst eine Note wählen oder die Eingabe starten (Enter), dann die Ebene.' };
  const { part, voice } = getVoice(s.score, here.ref);
  const layers = layersOf(part, voice.staff);
  if (n !== 1 && n !== 2) return s;
  if (s.caret && layers[n - 1]?.id === voice.id) return { ...s, message: `Du schreibst schon in Ebene ${n}.` };

  let score = s.score;
  let target = layers[n - 1];
  if (!target) {
    let k = 2;
    while (part.voices.some((v) => v.id === `${part.id}-v${k}`)) k++;
    const made: Voice = { id: `${part.id}-v${k}`, staff: voice.staff, events: [] };
    const last = layers[layers.length - 1]!;
    score = { ...s.score, parts: s.score.parts.map((p) => (p.id !== part.id ? p : { ...p, voices: p.voices.flatMap((v) => (v.id === last.id ? [v, made] : [v])) })) };
    target = made;
  }
  return {
    ...s,
    score,
    caret: { partId: part.id, voiceId: target.id, time: here.time },
    selection: null,
    input: { ...s.input, chord: false, chordEvent: null, pendingTie: false, ghost: null },
    message: `Ebene ${n}: Notenhälse zeigen nach ${n === 1 ? 'oben' : 'unten'}.`,
  };
}
