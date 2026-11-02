/**
 * Instrument definitions are DATA. Adding an instrument means adding an
 * entry here, not writing code. Later the same structure will carry the
 * instrument-specific input methods (fretboard, keyboard, microphone) and
 * the default workspace.
 */
import { parsePitch, type Pitch } from './pitch';

export interface Clef {
  readonly shape: 'G' | 'F' | 'C';
  /** Staff line the clef sits on, counted from the bottom (G clef = 2). */
  readonly line: number;
  /** Octave displacement: -1 = "8 below" (guitar, tenor voice). */
  readonly octave: -1 | 0 | 1;
}

export interface StaffDef {
  readonly clef: Clef;
}

export interface InstrumentDef {
  readonly id: InstrumentId;
  /** German UI name. */
  readonly name: string;
  readonly shortName: string;
  readonly staves: readonly StaffDef[];
  /** Brace across staves (piano). */
  readonly brace: boolean;
  /** Sounding range, used for input checks and audio-to-notes filtering. */
  readonly range: { readonly low: Pitch; readonly high: Pitch };
  /** General MIDI program (0-based) for playback. */
  readonly midiProgram: number;
}

export type InstrumentId = 'voice' | 'guitar' | 'piano';

const TREBLE: Clef = { shape: 'G', line: 2, octave: 0 };
const TREBLE_8VB: Clef = { shape: 'G', line: 2, octave: -1 };
const BASS: Clef = { shape: 'F', line: 4, octave: 0 };

export const INSTRUMENTS: Readonly<Record<InstrumentId, InstrumentDef>> = {
  voice: {
    id: 'voice',
    name: 'Gesang',
    shortName: 'Ges.',
    staves: [{ clef: TREBLE }],
    brace: false,
    range: { low: parsePitch('E2'), high: parsePitch('C6') },
    midiProgram: 52, // Choir Aahs
  },
  guitar: {
    id: 'guitar',
    name: 'Gitarre',
    shortName: 'Git.',
    // Guitar is written an octave higher than it sounds: treble clef with "8" below.
    staves: [{ clef: TREBLE_8VB }],
    brace: false,
    range: { low: parsePitch('E2'), high: parsePitch('B5') },
    midiProgram: 24, // Acoustic Guitar (nylon)
  },
  piano: {
    id: 'piano',
    name: 'Klavier',
    shortName: 'Klav.',
    staves: [{ clef: TREBLE }, { clef: BASS }],
    brace: true,
    range: { low: parsePitch('A0'), high: parsePitch('C8') },
    midiProgram: 0, // Acoustic Grand Piano
  },
};

export function getInstrument(id: InstrumentId): InstrumentDef {
  const def = INSTRUMENTS[id];
  if (!def) throw new Error(`Unknown instrument: ${id}`);
  return def;
}
