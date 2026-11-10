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
  /**
   * Sounding pitch of the middle staff line. The first note typed into an
   * empty staff lands in the octave closest to it.
   */
  readonly center: Pitch;
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
  /** Drawn as a tablature staff (six string lines with fret numbers) instead of notes on a staff (ADR 0030). */
  readonly tab?: boolean;
  /** Heading in the instrument choice (strings, woodwinds …); the four first instruments have none and keep their own buttons. */
  readonly family?: string;
}

export type InstrumentId = 'voice' | 'guitar' | 'tab' | 'piano' | 'violin' | 'viola' | 'cello' | 'contrabass' | 'ebass' | 'flute' | 'recorder' | 'oboe' | 'bassoon';

const TREBLE: Clef = { shape: 'G', line: 2, octave: 0 };
const TREBLE_8VB: Clef = { shape: 'G', line: 2, octave: -1 };
const BASS: Clef = { shape: 'F', line: 4, octave: 0 };
const ALTO: Clef = { shape: 'C', line: 3, octave: 0 };
const TREBLE_8VA: Clef = { shape: 'G', line: 2, octave: 1 };
const BASS_8VB: Clef = { shape: 'F', line: 4, octave: -1 };

export const INSTRUMENTS: Readonly<Record<InstrumentId, InstrumentDef>> = {
  voice: {
    id: 'voice',
    name: 'Gesang',
    shortName: 'Ges.',
    staves: [{ clef: TREBLE, center: parsePitch('B4') }],
    brace: false,
    range: { low: parsePitch('E2'), high: parsePitch('C6') },
    midiProgram: 52, // Choir Aahs
  },
  guitar: {
    id: 'guitar',
    name: 'Gitarre',
    shortName: 'Git.',
    // Guitar is written an octave higher than it sounds: treble clef with "8" below.
    staves: [{ clef: TREBLE_8VB, center: parsePitch('B3') }],
    brace: false,
    range: { low: parsePitch('E2'), high: parsePitch('B5') },
    midiProgram: 24, // Acoustic Guitar (nylon)
  },
  tab: {
    id: 'tab',
    name: 'Tabulatur',
    shortName: 'Tab',
    // Notes are kept as pitches like those of the guitar; only the drawing differs.
    staves: [{ clef: TREBLE_8VB, center: parsePitch('B3') }],
    brace: false,
    range: { low: parsePitch('E2'), high: parsePitch('B5') },
    midiProgram: 24,
    tab: true,
  },
  piano: {
    id: 'piano',
    name: 'Klavier',
    shortName: 'Klav.',
    staves: [
      { clef: TREBLE, center: parsePitch('B4') },
      { clef: BASS, center: parsePitch('D3') },
    ],
    brace: true,
    range: { low: parsePitch('A0'), high: parsePitch('C8') },
    midiProgram: 0, // Acoustic Grand Piano
  },
  // Pitches are the sounding ones. Double bass, bass guitar and soprano recorder sound an octave away from the written note,
  // so their clef carries the "8" (like the guitar's) – the same honest way, without the technique for transposing winds.
  violin: { id: 'violin', name: 'Violine', shortName: 'Vl.', staves: [{ clef: TREBLE, center: parsePitch('B4') }], brace: false, range: { low: parsePitch('G3'), high: parsePitch('E7') }, midiProgram: 40, family: 'Streicher' },
  viola: { id: 'viola', name: 'Viola', shortName: 'Va.', staves: [{ clef: ALTO, center: parsePitch('C4') }], brace: false, range: { low: parsePitch('C3'), high: parsePitch('E6') }, midiProgram: 41, family: 'Streicher' },
  cello: { id: 'cello', name: 'Violoncello', shortName: 'Vc.', staves: [{ clef: BASS, center: parsePitch('D3') }], brace: false, range: { low: parsePitch('C2'), high: parsePitch('A5') }, midiProgram: 42, family: 'Streicher' },
  contrabass: { id: 'contrabass', name: 'Kontrabass', shortName: 'Kb.', staves: [{ clef: BASS_8VB, center: parsePitch('D2') }], brace: false, range: { low: parsePitch('E1'), high: parsePitch('G4') }, midiProgram: 43, family: 'Streicher' },
  ebass: { id: 'ebass', name: 'E-Bass', shortName: 'Bass', staves: [{ clef: BASS_8VB, center: parsePitch('D2') }], brace: false, range: { low: parsePitch('E1'), high: parsePitch('G4') }, midiProgram: 33, family: 'Bass' },
  flute: { id: 'flute', name: 'Querflöte', shortName: 'Fl.', staves: [{ clef: TREBLE, center: parsePitch('B4') }], brace: false, range: { low: parsePitch('C4'), high: parsePitch('C7') }, midiProgram: 73, family: 'Holzbläser' },
  recorder: { id: 'recorder', name: 'Blockflöte', shortName: 'Blfl.', staves: [{ clef: TREBLE_8VA, center: parsePitch('B5') }], brace: false, range: { low: parsePitch('C5'), high: parsePitch('D7') }, midiProgram: 74, family: 'Holzbläser' },
  oboe: { id: 'oboe', name: 'Oboe', shortName: 'Ob.', staves: [{ clef: TREBLE, center: parsePitch('B4') }], brace: false, range: { low: parsePitch('Bb3'), high: parsePitch('A6') }, midiProgram: 68, family: 'Holzbläser' },
  bassoon: { id: 'bassoon', name: 'Fagott', shortName: 'Fg.', staves: [{ clef: BASS, center: parsePitch('D3') }], brace: false, range: { low: parsePitch('Bb1'), high: parsePitch('E5') }, midiProgram: 70, family: 'Holzbläser' },
};

export function getInstrument(id: InstrumentId): InstrumentDef {
  const def = INSTRUMENTS[id];
  if (!def) throw new Error(`Unknown instrument: ${id}`);
  return def;
}

/** Track or part name and General MIDI program (0–127) → one of the string, bass and wind instruments, if they point to one. */
export function instrumentHint(name: string, program: number | undefined): InstrumentId | undefined {
  if (/kontrab|contrab|double ?bass|upright/i.test(name) || program === 32 || program === 43) return 'contrabass';
  if (/e-?bass|electric ?bass|bass ?guit|bassgit|fingered|picked/i.test(name) || (program !== undefined && program >= 33 && program <= 39)) return 'ebass';
  if (/violoncell|cello/i.test(name) || program === 42) return 'cello';
  if (/viola|bratsche/i.test(name) || program === 41) return 'viola';
  if (/violin|geige|fiddle/i.test(name) || program === 40) return 'violin';
  if (/blockfl|recorder/i.test(name) || program === 74) return 'recorder';
  if (/flute|flöte|floete|querfl/i.test(name) || program === 73) return 'flute';
  if (/oboe/i.test(name) || program === 68) return 'oboe';
  if (/fagott|bassoon/i.test(name) || program === 70) return 'bassoon';
  return undefined;
}
