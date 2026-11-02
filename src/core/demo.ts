/**
 * Demo score shown on startup until file handling exists.
 * Deliberately exercises the notation layer: a note tied across a barline
 * (voice, bar 2→3), an explicit natural against the key (F in G major),
 * automatic rests (bar 4), chords, guitar octave clef, piano grand staff.
 */
import { ZERO } from './time';
import { parseLine } from './line';
import type { Score } from './model';

export function demoScore(): Score {
  return {
    title: 'Erste Skizze',
    composer: 'Icastico',
    meter: [{ at: ZERO, sig: { count: 4, unit: 4 } }],
    keys: [{ at: ZERO, fifths: 1 }],
    parts: [
      {
        id: 'voice',
        name: 'Gesang',
        instrument: 'voice',
        voices: [
          {
            id: 'voice-v1',
            staff: 0,
            events: parseLine(
              'G4:1/4 A4:1/4 B4:1/4 C5:1/4 | B4:1/2 D5:3/4 | C5:1/8 B4:1/8 A4:1/4 F4:1/4 | G4:1/2',
              'v',
            ),
          },
        ],
      },
      {
        id: 'guitar',
        name: 'Gitarre',
        instrument: 'guitar',
        voices: [
          {
            id: 'guitar-v1',
            staff: 0,
            events: parseLine(
              '[G2,D3,G3,B3]:1 | [G2,D3,G3,B3]:1/2 [D3,A3,D4,F#4]:1/2 | ' +
                '[C3,G3,C4,E4]:1/2 [D3,A3,D4,F#4]:1/2 | [G2,D3,G3,B3]:1/2',
              'g',
            ),
          },
        ],
      },
      {
        id: 'piano',
        name: 'Klavier',
        instrument: 'piano',
        voices: [
          {
            id: 'piano-rh',
            staff: 0,
            events: parseLine(
              '[B3,D4,G4]:1 | [B3,D4,G4]:1/2 [A3,D4,F#4]:1/2 | [G3,C4,E4]:1/2 [A3,D4,F#4]:1/2 | [B3,D4,G4]:1/2',
              'pr',
            ),
          },
          {
            id: 'piano-lh',
            staff: 1,
            events: parseLine('G2:1/2 D3:1/2 | G2:1/2 D3:1/2 | C3:1/2 D3:1/2 | G2:1/2', 'pl'),
          },
        ],
      },
    ],
  };
}
