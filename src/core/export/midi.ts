/**
 * Icastico score → Standard MIDI File (format 1): one track for tempo and meter, one track per instrument.
 * Written from the playback plan, so repeats, jumps, ties, dynamics and staccato sound like they play.
 * Left out: glides are written as the note they start on (no pitch bend), loudness lines.
 */
import { INSTRUMENTS, type InstrumentId } from '../instruments';
import { type Score } from '../model';
import { type SoundNote, planPlayback, tempoOf, wholeNotesAt } from '../playback';
import { ZERO, toNumber } from '../time';
import { playMapOf } from '../playOrder';

const PPQ = 480;
const DEFAULT_VELOCITY = 90;

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));
const u16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

/** MIDI variable-length number: seven bits per byte, the last byte without the high bit. */
export function varLength(n: number): number[] {
  const bytes = [n & 0x7f];
  for (let rest = n >>> 7; rest > 0; rest >>>= 7) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
}

interface TrackEvent {
  readonly tick: number;
  /** Note-offs sort before note-ons at the same tick, so a repeated note is struck anew. */
  readonly order: number;
  readonly bytes: readonly number[];
}

function track(events: readonly TrackEvent[]): number[] {
  const body: number[] = [];
  let last = 0;
  for (const e of [...events].sort((a, b) => a.tick - b.tick || a.order - b.order)) {
    body.push(...varLength(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  body.push(0, 0xff, 0x2f, 0); // end of track
  return [...ascii('MTrk'), ...u32(body.length), ...body];
}

export function exportMidi(score: Score): Uint8Array {
  const playScore = playMapOf(score).score; // repeats laid out: its tempo changes are at play time
  const toTick = (seconds: number): number => Math.round(wholeNotesAt(playScore, seconds) * 4 * PPQ);
  const plan = planPlayback(playScore);
  const tempoEvents: TrackEvent[] = [{ at: ZERO, bpm: tempoOf(playScore) }, ...(playScore.tempos ?? [])].map((c) => ({
    tick: Math.round(toNumber(c.at) * 4 * PPQ),
    order: 0,
    bytes: [0xff, 0x51, 3, ...u32(Math.round(60_000_000 / c.bpm)).slice(1)],
  }));
  const sig = score.meter[0]!.sig;

  const conductor: TrackEvent[] = [
    { tick: 0, order: 0, bytes: [0xff, 0x03, ...varLength(score.title.length), ...ascii(score.title.replace(/[^\x20-\x7e]/g, '?'))] },
    ...tempoEvents,
    { tick: 0, order: 0, bytes: [0xff, 0x58, 4, sig.count, Math.round(Math.log2(sig.unit)), 24, 8] },
  ];

  const byInstrument = new Map<InstrumentId, SoundNote[]>();
  for (const note of plan.notes) byInstrument.set(note.instrument, [...(byInstrument.get(note.instrument) ?? []), note]);
  const tracks = [track(conductor)];
  let channel = 0;
  for (const [instrument, notes] of byInstrument) {
    if (channel === 9) channel++; // channel 10 is drums
    const ch = Math.min(channel++, 15);
    const events: TrackEvent[] = [{ tick: 0, order: 0, bytes: [0xc0 | ch, INSTRUMENTS[instrument].midiProgram] }];
    for (const n of notes) {
      const key = Math.max(0, Math.min(127, Math.round(n.path[0]!.midi)));
      const velocity = Math.max(1, Math.min(127, Math.round(n.volume ?? DEFAULT_VELOCITY)));
      const on = toTick(n.start);
      const off = Math.max(on + 1, toTick(n.end));
      events.push({ tick: on, order: 1, bytes: [0x90 | ch, key, velocity] }, { tick: off, order: 0, bytes: [0x80 | ch, key, 0] });
    }
    tracks.push(track(events));
  }
  return Uint8Array.from([...ascii('MThd'), ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(PPQ), ...tracks.flat()]);
}
