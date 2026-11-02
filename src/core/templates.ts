import { ZERO } from './time';
import type { Score } from './model';

/** Empty score with the three first-class instruments, C major, 4/4. */
export function emptyScore(title = 'Neue Partitur'): Score {
  return {
    title,
    meter: [{ at: ZERO, sig: { count: 4, unit: 4 } }],
    keys: [{ at: ZERO, fifths: 0 }],
    parts: [
      { id: 'voice', name: 'Gesang', instrument: 'voice', voices: [{ id: 'voice-v1', staff: 0, events: [] }] },
      { id: 'guitar', name: 'Gitarre', instrument: 'guitar', voices: [{ id: 'guitar-v1', staff: 0, events: [] }] },
      {
        id: 'piano',
        name: 'Klavier',
        instrument: 'piano',
        voices: [
          { id: 'piano-rh', staff: 0, events: [] },
          { id: 'piano-lh', staff: 1, events: [] },
        ],
      },
    ],
  };
}
