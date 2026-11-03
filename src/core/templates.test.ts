import { describe, expect, it } from 'vitest';
import { frac, ZERO } from './time';
import { parseLine } from './line';
import { measuresOf, validateScore, type Score } from './model';
import { notateVoice, type NotatedNote } from './notation/notate';
import { applyScoreChanges, createScore, DEFAULT_SETUP, keyName, pickupChoices, UNTITLED } from './templates';

const withMelody = (score: Score, spec: string): Score => ({
  ...score,
  parts: score.parts.map((p, i) => (i === 0 ? { ...p, voices: [{ ...p.voices[0]!, events: parseLine(spec, 'e') }] } : p)),
});

const ok = (r: { score: Score } | { error: string }): Score => {
  if ('error' in r) throw new Error(r.error);
  return r.score;
};

describe('createScore', () => {
  it('builds parts in the chosen order with unique ids and numbered names', () => {
    const score = createScore({ ...DEFAULT_SETUP, instruments: ['voice', 'piano', 'voice'] });
    expect(score.parts.map((p) => [p.id, p.name])).toEqual([
      ['voice', 'Gesang 1'],
      ['piano', 'Klavier'],
      ['voice-2', 'Gesang 2'],
    ]);
    expect(score.parts[1]!.voices.map((v) => [v.id, v.staff])).toEqual([
      ['piano-s1', 0],
      ['piano-s2', 1],
    ]);
    expect(validateScore(score)).toEqual([]);
  });

  it('takes key, meter, upbeat and a default title', () => {
    const score = createScore({
      ...DEFAULT_SETUP,
      fifths: -3,
      meter: { count: 6, unit: 8 },
      pickup: frac(1, 8),
      composer: '  ',
    });
    expect(score.title).toBe(UNTITLED);
    expect(score.composer).toBeUndefined();
    expect(score.keys).toEqual([{ at: ZERO, fifths: -3 }]);
    expect(score.meter).toEqual([{ at: ZERO, sig: { count: 6, unit: 8 } }]);
    expect(score.pickup).toEqual(frac(1, 8));
  });
});

describe('upbeat (Auftakt)', () => {
  const song = (pickup = frac(1, 4)) =>
    withMelody(createScore({ ...DEFAULT_SETUP, instruments: ['voice'], pickup }), 'D4:1/4 | G4:1/2 A4:1/2 | B4:1');

  it('makes a short measure 0 and numbers full measures from 1', () => {
    const ms = measuresOf(song());
    expect(ms.map((m) => [m.number, `${m.start.n}/${m.start.d}`])).toEqual([
      [0, '0/1'],
      [1, '1/4'],
      [2, '5/4'],
    ]);
  });

  it('places rests in the upbeat on the beats of a full measure', () => {
    // 3/4 upbeat with only its last beat sung: two quarter rests (beats 2, 3), then the note.
    const s = withMelody(createScore({ ...DEFAULT_SETUP, instruments: ['voice'], pickup: frac(3, 4) }), 'r:1/2 D4:1/4');
    const [upbeat] = notateVoice(s.parts[0]!.voices[0]!, measuresOf(s));
    expect(upbeat!.map((i) => (i.kind === 'measureRest' ? 'mr' : `${i.kind}:${i.duration.base}`))).toEqual([
      'rest:4',
      'rest:4',
      'note:4',
    ]);
  });

  it('can be added afterwards: the notes stay, the barlines move', () => {
    // Typed without upbeat: the first quarter fills bar 1 with the following notes.
    const typed = withMelody(createScore({ ...DEFAULT_SETUP, instruments: ['voice'] }), 'D4:1/4 G4:1/2 A4:1/2 B4:1');
    const fixed = ok(applyScoreChanges(typed, { pickup: frac(1, 4) }));
    const [upbeat, bar1] = notateVoice(fixed.parts[0]!.voices[0]!, measuresOf(fixed));
    expect(upbeat!.map((i) => (i as NotatedNote).eventId)).toEqual(['e1']);
    expect(bar1!.map((i) => (i as NotatedNote).eventId)).toEqual(['e2', 'e3']);
  });

  it('must be shorter than a measure', () => {
    const r = applyScoreChanges(song(), { pickup: frac(1) });
    expect('error' in r && r.error).toMatch(/Auftakt muss kürzer/);
  });

  it('offers choices in eighths below one measure', () => {
    expect(pickupChoices({ count: 3, unit: 4 }).map((c) => c.label)).toEqual([
      'Achtel',
      'Viertel',
      'punktierte Viertel',
      'Halbe',
      'Halbe + Achtel',
    ]);
    expect(pickupChoices({ count: 3, unit: 16 })).toHaveLength(2);
  });
});

describe('applyScoreChanges', () => {
  const base = () => withMelody(createScore({ ...DEFAULT_SETUP, instruments: ['voice'] }), 'C5:1 | D5:1 | E5:1 | F5:1');

  it('changes title and composer, empty composer removes it', () => {
    const s = ok(applyScoreChanges({ ...base(), composer: 'X' }, { title: ' Mein Lied ', composer: '' }));
    expect(s.title).toBe('Mein Lied');
    expect('composer' in s).toBe(false);
  });

  it('changes the key from a measure on, keeping the sounding notes', () => {
    const s = ok(applyScoreChanges(base(), { fromMeasure: 3, fifths: 2 }));
    expect(s.keys).toEqual([
      { at: ZERO, fifths: 0 },
      { at: frac(2), fifths: 2 },
    ]);
    expect(s.parts[0]!.voices[0]!.events.map((e) => e.tones[0]!.pitch.alter)).toEqual([0, 0, 0, 0]);
  });

  it('setting a key equal to the one before removes the change again', () => {
    const changed = ok(applyScoreChanges(base(), { fromMeasure: 3, fifths: 2 }));
    expect(ok(applyScoreChanges(changed, { fromMeasure: 3, fifths: 0 })).keys).toEqual([{ at: ZERO, fifths: 0 }]);
  });

  it('changes the meter from a measure to the end – notes stay in time', () => {
    const s = ok(applyScoreChanges(base(), { fromMeasure: 2, meter: { count: 3, unit: 4 } }));
    expect(s.meter).toEqual([
      { at: ZERO, sig: { count: 4, unit: 4 } },
      { at: frac(1), sig: { count: 3, unit: 4 } },
    ]);
    expect(s.parts[0]!.voices[0]!.events).toEqual(base().parts[0]!.voices[0]!.events);
    // 3 whole notes after bar 1 in 3/4 = 4 bars of 3/4
    expect(measuresOf(s).length).toBe(5);
  });

  it('measure 1 means the whole piece, also with an upbeat', () => {
    const withUpbeat = ok(applyScoreChanges(base(), { pickup: frac(1, 4) }));
    const s = ok(applyScoreChanges(withUpbeat, { fromMeasure: 1, fifths: -1, meter: { count: 3, unit: 4 } }));
    expect(s.keys).toEqual([{ at: ZERO, fifths: -1 }]);
    expect(s.meter).toEqual([{ at: ZERO, sig: { count: 3, unit: 4 } }]);
  });

  it('rejects measures that do not exist', () => {
    expect(applyScoreChanges(base(), { fromMeasure: 99, fifths: 1 })).toEqual({
      error: 'Takt 99 gibt es nicht – die Partitur hat 4 Takte.',
    });
    expect('score' in applyScoreChanges(base(), { fromMeasure: 5, fifths: 1 })).toBe(true); // next empty bar
  });
});

describe('keyName', () => {
  it('names keys the German way', () => {
    expect(keyName(0)).toBe('C-Dur / a-Moll (keine Vorzeichen)');
    expect(keyName(5)).toBe('H-Dur / gis-Moll (5 ♯)');
    expect(keyName(-2)).toBe('B-Dur / g-Moll (2 ♭)');
    expect(keyName(-6)).toBe('Ges-Dur / es-Moll (6 ♭)');
  });
});
