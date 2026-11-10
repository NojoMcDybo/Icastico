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

describe('adding instruments to an existing score', () => {
  it('appends empty lines with fresh ids and names, a guitar can come with its tablature', () => {
    const base = createScore({ ...DEFAULT_SETUP, instruments: ['voice'] });
    const r = applyScoreChanges(base, { addInstruments: [{ instrument: 'guitar', tab: true }, { instrument: 'guitar' }, { instrument: 'piano' }] });
    if ('error' in r) throw new Error(r.error);
    expect(r.score.parts.map((p) => [p.id, p.name, p.tab === true])).toEqual([
      ['voice', 'Gesang', false],
      ['guitar', 'Gitarre', true],
      ['guitar-2', 'Gitarre 2', false],
      ['piano', 'Klavier', false],
    ]);
    expect(r.score.parts[3]!.voices.map((v) => v.id)).toEqual(['piano-s1', 'piano-s2']);
    expect(r.score.parts.every((p) => p.voices.every((v) => v.events.length === 0))).toBe(true);
  });

  it('switches the tablature of a guitar line later, and ignores it for other instruments', () => {
    const base = createScore({ ...DEFAULT_SETUP, instruments: ['voice', 'guitar'] });
    const on = applyScoreChanges(base, { tab: { guitar: true, voice: true } });
    if ('error' in on) throw new Error(on.error);
    expect(on.score.parts.map((p) => p.tab === true)).toEqual([false, true]);
    const off = applyScoreChanges(on.score, { tab: { guitar: false } });
    if ('error' in off) throw new Error(off.error);
    expect(off.score.parts[1]!.tab).toBeUndefined();
  });
});

describe('removing and renaming instruments of an existing score', () => {
  const three = (): Score => {
    const base = createScore({ ...DEFAULT_SETUP, instruments: ['voice', 'guitar', 'piano'] });
    const tone = (id: string) => ({ id: `${id}-t`, pitch: { step: 'C', alter: 0, octave: 4 } as const });
    const note = (id: string, at: number) => ({ id, onset: frac(at, 4), duration: frac(1, 4), tones: [tone(id)] });
    const fill = (partId: string, events: ReturnType<typeof note>[]) => (p: Score['parts'][number]) => (p.id === partId ? { ...p, voices: p.voices.map((v, i) => (i === 0 ? { ...v, events } : v)) } : p);
    return {
      ...base,
      parts: base.parts.map(fill('voice', [note('a', 0), note('b', 1)])).map(fill('guitar', [note('c', 0), note('d', 1)])),
      links: [
        { id: 'l1', kind: 'tie', from: 'a-t', to: 'b-t' },
        { id: 'l2', kind: 'tie', from: 'c-t', to: 'd-t' },
      ],
      groups: [{ parts: ['voice', 'guitar', 'piano'], symbol: 'bracket' }],
    };
  };

  it('takes a line out with its notes, its ties and its place in a bracket', () => {
    const s = ok(applyScoreChanges(three(), { removeParts: ['guitar'] }));
    expect(s.parts.map((p) => p.id)).toEqual(['voice', 'piano']);
    expect(s.links).toEqual([{ id: 'l1', kind: 'tie', from: 'a-t', to: 'b-t' }]);
    expect(s.groups).toEqual([{ parts: ['voice', 'piano'], symbol: 'bracket' }]);
  });

  it('drops a bracket that would hold a single line, and the list of ties when none is left', () => {
    const s = ok(applyScoreChanges(three(), { removeParts: ['voice', 'guitar'] }));
    expect(s.parts.map((p) => p.id)).toEqual(['piano']);
    expect(s.links).toBeUndefined();
    expect(s.groups).toBeUndefined();
  });

  it('keeps at least one line – unless a new one comes in the same step', () => {
    expect(applyScoreChanges(three(), { removeParts: ['voice', 'guitar', 'piano'] })).toEqual({ error: 'Mindestens ein Instrument muss bleiben.' });
    const swapped = ok(applyScoreChanges(three(), { removeParts: ['voice', 'guitar', 'piano'], addInstruments: [{ instrument: 'voice' }] }));
    expect(swapped.parts.map((p) => p.name)).toEqual(['Gesang']);
  });

  it('renames a line; an empty name leaves it as it is', () => {
    const s = ok(applyScoreChanges(three(), { renameParts: { voice: '  Sopran ', piano: '   ' } }));
    expect(s.parts.map((p) => p.name)).toEqual(['Sopran', 'Gitarre', 'Klavier']);
  });
});

describe('bars per line in the score settings', () => {
  it('sets, changes and clears the bars per line (0 = automatic), also over imported breaks', () => {
    const base = createScore(DEFAULT_SETUP);
    const set = ok(applyScoreChanges({ ...base, layout: { breaks: [3, 6] } }, { perSystem: 4 }));
    expect(set.layout).toEqual({ perSystem: 4 });
    expect(ok(applyScoreChanges(set, { perSystem: 0 })).layout).toBeUndefined();
    expect(ok(applyScoreChanges({ ...base, layout: { breaks: [3] } }, {})).layout).toEqual({ breaks: [3] });
  });
});
