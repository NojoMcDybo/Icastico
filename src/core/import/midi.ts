/**
 * Standard MIDI File → notes (ADR 0028). Reads format 0, 1 and 2 with ticks per quarter note;
 * running status, meta events and system messages are handled. The notes then go through the
 * quantiser (`quantize.ts`) like every other source.
 */
import { type InstrumentId, instrumentHint } from '../instruments';
import { type MeterChange, type TimeSignature, measureLength } from '../model';
import { ZERO, frac, isZero, sub, type Fraction, lt } from '../time';
import { ImportError, type ImportResult } from './musicxml';
import { DEFAULT_QUANTIZE, type PlayedNote, type QuantizeOptions, buildScore } from './quantize';

export interface MidiTrack {
  /** Position in the list of tracks of the file (a track with several channels is split). */
  readonly index: number;
  readonly name: string;
  readonly channel: number;
  /** General MIDI program (0–127) if the track sets one. */
  readonly program?: number;
  readonly drums: boolean;
  /** Notes in quarter-note beats. */
  readonly notes: readonly PlayedNote[];
}

export interface MidiFile {
  readonly title: string;
  readonly tracks: readonly MidiTrack[];
  /** Quarter notes per minute of the first tempo; absent = none in the file. */
  readonly tempo?: number;
  readonly meter: readonly { readonly beats: number; readonly sig: TimeSignature }[];
  /** Key signature of the file, if it has one. */
  readonly fifths?: number;
  /** Remarks about what was left out. */
  readonly notes: readonly string[];
}

class Bytes {
  pos = 0;
  constructor(readonly data: Uint8Array) {}
  get left(): number {
    return this.data.length - this.pos;
  }
  u8(): number {
    if (this.pos >= this.data.length) throw new ImportError('Die MIDI-Datei ist abgeschnitten.');
    return this.data[this.pos++]!;
  }
  u16(): number {
    return (this.u8() << 8) | this.u8();
  }
  u32(): number {
    return this.u16() * 65536 + this.u16();
  }
  text(n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8());
    return s;
  }
  varLength(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.u8();
      value = value * 128 + (b & 0x7f);
      if ((b & 0x80) === 0) return value;
    }
    throw new ImportError('Die MIDI-Datei ist beschädigt (Zeitangabe).');
  }
}

const latin = (b: Uint8Array): string => [...b].map((c) => String.fromCharCode(c)).join('').replace(/[\u0000-\u001f]/g, '').trim();

interface Raw {
  name: string;
  tempos: { tick: number; bpm: number }[];
  meters: { tick: number; sig: TimeSignature }[];
  keys: number[];
  /** channel → program */
  programs: Map<number, number>;
  /** channel → notes in ticks */
  notes: Map<number, { start: number; end: number; key: number; velocity: number }[]>;
  truncated: boolean;
}

function readTrack(bytes: Bytes, length: number): Raw {
  const end = bytes.pos + length;
  const raw: Raw = { name: '', tempos: [], meters: [], keys: [], programs: new Map(), notes: new Map(), truncated: false };
  const open = new Map<number, { start: number; velocity: number }[]>();
  let tick = 0;
  let running = 0;
  const close = (channel: number, key: number, at: number): void => {
    const list = open.get(channel * 128 + key);
    const started = list?.shift();
    if (!started) return;
    const notes = raw.notes.get(channel) ?? [];
    notes.push({ start: started.start, end: Math.max(at, started.start), key, velocity: started.velocity });
    raw.notes.set(channel, notes);
  };
  try {
    while (bytes.pos < end) {
      tick += bytes.varLength();
      let status = bytes.data[bytes.pos]!;
      if (status & 0x80) {
        bytes.pos++;
        if (status < 0xf0) running = status;
      } else {
        if (running === 0) throw new ImportError('Die MIDI-Datei ist beschädigt (Statusbyte fehlt).');
        status = running;
      }
      if (status === 0xff) {
        const type = bytes.u8();
        const len = bytes.varLength();
        const body = bytes.data.slice(bytes.pos, bytes.pos + len);
        bytes.pos += len;
        if (type === 0x2f) break;
        if (type === 0x03 && raw.name === '') raw.name = latin(body);
        else if (type === 0x51 && len === 3) raw.tempos.push({ tick, bpm: 60_000_000 / ((body[0]! << 16) | (body[1]! << 8) | body[2]!) });
        else if (type === 0x58 && len >= 2) raw.meters.push({ tick, sig: { count: Math.max(1, body[0]!), unit: 2 ** Math.min(body[1]!, 5) } });
        else if (type === 0x59 && len >= 1) raw.keys.push(body[0]! > 127 ? body[0]! - 256 : body[0]!);
      } else if (status === 0xf0 || status === 0xf7) {
        bytes.pos += bytes.varLength();
      } else {
        const kind = status & 0xf0;
        const channel = status & 0x0f;
        const a = bytes.u8();
        const b = kind === 0xc0 || kind === 0xd0 ? 0 : bytes.u8();
        if (kind === 0x90 && b > 0) {
          const list = open.get(channel * 128 + a) ?? [];
          list.push({ start: tick, velocity: b });
          open.set(channel * 128 + a, list);
        } else if (kind === 0x80 || kind === 0x90) {
          close(channel, a, tick);
        } else if (kind === 0xc0 && !raw.programs.has(channel)) {
          raw.programs.set(channel, a);
        }
      }
    }
  } catch (err) {
    if (!(err instanceof ImportError)) throw err;
    raw.truncated = true;
  }
  for (const [id, list] of open) while (list.length > 0) close(Math.floor(id / 128), id % 128, tick);
  bytes.pos = end;
  return raw;
}

/** Reads a MIDI file. Throws an ImportError if it is not one. */
export function parseMidi(data: Uint8Array, fileName = ''): MidiFile {
  const bytes = new Bytes(data);
  if (data.length < 14 || bytes.text(4) !== 'MThd') throw new ImportError('Das ist keine MIDI-Datei.');
  const headerLength = bytes.u32();
  bytes.u16(); // format 0, 1 or 2: all are read the same way
  bytes.u16(); // announced number of tracks – the real ones are counted
  const division = bytes.u16();
  bytes.pos = 8 + headerLength;
  if (division & 0x8000) throw new ImportError('Diese MIDI-Datei zählt in Zeitcode (SMPTE) statt in Takten. Das wird nicht gelesen – bitte in Logic als „Standard MIDI File“ mit Taktzählung sichern.');
  if (division === 0) throw new ImportError('Die MIDI-Datei ist beschädigt (Auflösung fehlt).');
  const ppq = division;

  const raws: Raw[] = [];
  while (bytes.left >= 8) {
    const id = bytes.text(4);
    const length = bytes.u32();
    if (id === 'MTrk') raws.push(readTrack(bytes, Math.min(length, bytes.left)));
    else bytes.pos += Math.min(length, bytes.left);
  }
  if (raws.length === 0) throw new ImportError('Die MIDI-Datei enthält keine Spuren.');

  const notes: string[] = [];
  if (raws.some((r) => r.truncated)) notes.push('Die Datei war am Ende abgeschnitten; gelesen wurde, was da war.');
  const tracks: MidiTrack[] = [];
  let drumTracks = 0;
  const tempos = raws.flatMap((r) => r.tempos).sort((a, b) => a.tick - b.tick);
  const meters = raws.flatMap((r) => r.meters).sort((a, b) => a.tick - b.tick);
  const keys = raws.flatMap((r) => r.keys);

  raws.forEach((raw) => {
    const channels = [...raw.notes.keys()].sort((a, b) => a - b).filter((c) => (raw.notes.get(c)?.length ?? 0) > 0);
    for (const channel of channels) {
      const drums = channel === 9;
      const track: MidiTrack = {
        index: tracks.length,
        name: raw.name ? (channels.length > 1 ? `${raw.name} (Kanal ${channel + 1})` : raw.name) : `Kanal ${channel + 1}`,
        channel,
        ...(raw.programs.has(channel) ? { program: raw.programs.get(channel)! } : {}),
        drums,
        notes: raw.notes
          .get(channel)!
          .map((n) => ({ start: n.start / ppq, end: n.end / ppq, midi: n.key, volume: n.velocity }))
          .sort((a, b) => a.start - b.start || a.midi - b.midi),
      };
      if (drums) drumTracks++;
      tracks.push(track);
    }
  });
  if (drumTracks > 0) notes.push(`${drumTracks === 1 ? 'Eine Schlagzeugspur ist' : `${drumTracks} Schlagzeugspuren sind`} nicht dabei (Schlagzeug gibt es noch nicht).`);

  const first = raws.find((r) => r.name !== '' && r.notes.size === 0) ?? raws[0]!;
  const title = (first.name || fileName.replace(/\.[^.]+$/, '') || 'Importiert').slice(0, 120);
  if (new Set(tempos.map((t) => Math.round(t.bpm))).size > 1) notes.push('Das Tempo wechselt in der Datei; übernommen ist das erste.');
  return {
    title: fileName ? fileName.replace(/\.[^.]+$/, '') || title : title,
    tracks,
    ...(tempos.length ? { tempo: Math.round(tempos[0]!.bpm) } : {}),
    meter: meters.map((m) => ({ beats: m.tick / ppq, sig: m.sig })),
    ...(keys.length ? { fifths: keys[0]! } : {}),
    notes,
  };
}

/** General MIDI programs and track names → the instrument a track most likely is. */
export function guessInstrument(track: Pick<MidiTrack, 'name' | 'program' | 'notes'>): InstrumentId {
  const hinted = instrumentHint(track.name, track.program);
  if (hinted) return hinted;
  if (/bass/i.test(track.name)) return 'ebass'; // in a MIDI file a track called "Bass" is the instrument, not a choir part
  if (/guit|gitar|laute|lute|ukulele|banjo/i.test(track.name) || (track.program !== undefined && track.program >= 24 && track.program <= 31)) return 'guitar';
  if (/piano|klavier|keys|keyboard|cembalo|organ|orgel|flügel|rhodes|synth/i.test(track.name) || (track.program !== undefined && track.program < 24)) return 'piano';
  if (/voc|sing|gesang|stimme|lead|chor|melod/i.test(track.name)) return 'voice';
  // Without a hint: a wide range or thick chords need the piano, a line is a voice.
  const midis = track.notes.map((n) => n.midi);
  const span = midis.length ? Math.max(...midis) - Math.min(...midis) : 0;
  const starts = new Map<number, number>();
  for (const n of track.notes) starts.set(Math.round(n.start * 8), (starts.get(Math.round(n.start * 8)) ?? 0) + 1);
  const chordy = [...starts.values()].filter((c) => c > 1).length > starts.size * 0.2;
  return span > 24 || chordy ? 'piano' : 'voice';
}

export interface MidiChoice {
  readonly tracks: readonly { readonly index: number; readonly instrument: InstrumentId }[];
  readonly quantize: QuantizeOptions;
  readonly meter: TimeSignature;
  /** Quarter notes per minute for the score. */
  readonly tempo: number;
  /** Key signature; null = estimate. */
  readonly fifths: number | null;
}

/** What the import offers first: every pitched track, the file's meter, tempo and key. */
export function midiDefaults(file: MidiFile): MidiChoice {
  return {
    tracks: file.tracks.filter((t) => !t.drums).map((t) => ({ index: t.index, instrument: guessInstrument(t) })),
    quantize: DEFAULT_QUANTIZE,
    meter: file.meter[0]?.sig ?? { count: 4, unit: 4 },
    tempo: file.tempo ?? 100,
    fifths: file.fifths ?? null,
  };
}

/** Meter changes that fall on a bar line of the meter before them; the others cannot be taken over. */
function meterChanges(file: MidiFile, first: TimeSignature, dropped: string[]): MeterChange[] {
  const out: MeterChange[] = [{ at: ZERO, sig: first }];
  for (const m of file.meter) {
    const last = out[out.length - 1]!;
    const at = frac(Math.round(m.beats * 64), 256); // quarter-note beats → whole notes (1/256 is finer than any note we write)
    if (isZero(at) || (m.sig.count === last.sig.count && m.sig.unit === last.sig.unit)) continue;
    const sincePrev: Fraction = sub(at, last.at);
    const bar = measureLength(last.sig);
    if (lt(sincePrev, bar) || (sincePrev.n * bar.d) % (bar.n * sincePrev.d) !== 0) {
      dropped.push('Eine Taktart-Änderung mitten im Takt ist nicht übernommen.');
      continue;
    }
    out.push({ at, sig: m.sig });
  }
  return out;
}

/** The score for the chosen tracks. */
export function importMidi(file: MidiFile, choice: MidiChoice): ImportResult {
  const notes = [...file.notes];
  const parts = choice.tracks.flatMap((c) => {
    const t = file.tracks.find((x) => x.index === c.index);
    return t ? [{ name: t.name, instrument: c.instrument, notes: t.notes }] : [];
  });
  const sameMeter = !file.meter[0] || (file.meter[0].sig.count === choice.meter.count && file.meter[0].sig.unit === choice.meter.unit);
  const meter = sameMeter ? meterChanges(file, choice.meter, notes) : [{ at: ZERO, sig: choice.meter }];
  const built = buildScore({ title: file.title, parts, quantize: choice.quantize, meter, tempo: choice.tempo, fifths: choice.fifths });
  return { score: built.score, notes: [...new Set([...notes, ...built.notes])] };
}
