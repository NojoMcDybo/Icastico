/**
 * A single-voice recording → a score (ADR 0028): pitch track → notes in seconds → (tempo) → beats →
 * the same quantiser as MIDI files.
 */
import { type InstrumentId } from '../instruments';
import { type TimeSignature } from '../model';
import { ZERO } from '../time';
import { type FoundNote, PitchTracker, findNotes } from './pitch';
import { ImportError, type ImportResult } from './musicxml';
import { DEFAULT_QUANTIZE, type QuantizeOptions, buildScore } from './quantize';
import { type Samples } from './wav';

/** Recordings longer than this are cut off (the analysis would take minutes). */
export const MAX_SECONDS = 600;

export interface FoundAudio {
  readonly notes: readonly FoundNote[];
  readonly seconds: number;
  /** Detuning of the recording in cents (negative = flat); already taken out. */
  readonly tuningCents: number;
  readonly cutOff: boolean;
}

/**
 * Analyses a recording. `yieldToUi` is awaited every few hundred frames so the window stays alive
 * during a long file; `progress` gets 0 … 1.
 */
export async function analyseRecording(samples: Samples, yieldToUi: () => Promise<void> = () => Promise.resolve(), progress: (share: number) => void = () => undefined): Promise<FoundAudio> {
  const limit = Math.floor(MAX_SECONDS * samples.rate);
  const cutOff = samples.data.length > limit;
  const tracker = new PitchTracker(cutOff ? { rate: samples.rate, data: samples.data.subarray(0, limit) } : samples);
  const frames = [];
  for (let i = 0; i < tracker.frames; i++) {
    frames.push(tracker.frame(i));
    if (i % 400 === 399) {
      progress(i / tracker.frames);
      await yieldToUi();
    }
  }
  progress(1);
  const { notes, tuning } = findNotes(frames);
  return { notes, seconds: tracker.frames * 0.01, tuningCents: Math.round(tuning * 100), cutOff };
}

/**
 * The tempo (quarter notes per minute, 60 … 160) at which the note starts sit best on an eighth-note grid.
 * Double and half tempo fit just as well, so the choice leans towards the middle (≈ 100).
 */
export function estimateTempo(starts: readonly number[]): number {
  if (starts.length < 3) return 100;
  let best = { bpm: 100, cost: Infinity };
  for (let bpm = 60; bpm <= 160; bpm++) {
    const grid = 0.5; // beats
    let sum = 0;
    for (const s of starts) {
      const beats = (s * bpm) / 60;
      sum += Math.abs(beats - Math.round(beats / grid) * grid) / (grid / 4);
    }
    const cost = sum / starts.length + 0.05 * Math.abs(Math.log(bpm / 100));
    if (cost < best.cost) best = { bpm, cost };
  }
  return best.bpm;
}

export interface AudioChoice {
  readonly instrument: InstrumentId;
  readonly quantize: QuantizeOptions;
  readonly meter: TimeSignature;
  /** Quarter notes per minute: the speed of the recording, and the tempo of the score. */
  readonly tempo: number;
  readonly fifths: number | null;
}

export function audioDefaults(found: FoundAudio): AudioChoice {
  return { instrument: 'voice', quantize: DEFAULT_QUANTIZE, meter: { count: 4, unit: 4 }, tempo: estimateTempo(found.notes.map((n) => n.start)), fifths: null };
}

export function importRecording(found: FoundAudio, choice: AudioChoice, title: string): ImportResult {
  if (found.notes.length === 0) throw new ImportError('In der Aufnahme wurden keine Töne erkannt. Sie sollte eine einzelne Stimme oder ein einzelnes Instrument enthalten, nicht zu leise und nicht verrauscht.');
  const toBeats = (seconds: number): number => (seconds * choice.tempo) / 60;
  const built = buildScore({
    title,
    parts: [{ name: choice.instrument === 'guitar' ? 'Gitarre' : choice.instrument === 'piano' ? 'Klavier' : 'Gesang', instrument: choice.instrument, notes: found.notes.map((n) => ({ start: toBeats(n.start), end: toBeats(n.end), midi: n.midi })) }],
    quantize: choice.quantize,
    meter: [{ at: ZERO, sig: choice.meter }],
    tempo: choice.tempo,
    fifths: choice.fifths,
  });
  const notes = [`${found.notes.length} Töne aus der Aufnahme erkannt – Tonhöhen und Rhythmus bitte durchsehen, besonders bei Vibrato und Tonwiederholungen.`, ...built.notes];
  if (found.cutOff) notes.push(`Die Aufnahme ist länger als ${MAX_SECONDS / 60} Minuten; nur der Anfang wurde ausgewertet.`);
  if (Math.abs(found.tuningCents) >= 15) notes.push(`Die Aufnahme klingt etwa ${Math.abs(found.tuningCents)} Cent ${found.tuningCents < 0 ? 'tiefer' : 'höher'} als gestimmt; das ist ausgeglichen.`);
  return { score: built.score, notes };
}
