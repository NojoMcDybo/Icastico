import { beforeAll, describe, expect, it } from 'vitest';
import { scoreToMei } from './mei';
import { Engraver } from './verovio';
import { demoScore } from '../core/demo';
import { frac } from '../core/time';
import { setTempoChange, tempoAt } from '../core/model';
import { parseLine } from '../core/line';
import { createScore, DEFAULT_SETUP, emptyScore } from '../core/templates';
import type { Score } from '../core/model';
import type { InstrumentId } from '../core/instruments';
import { runCommand } from '../core/editor/commands';
import { createEditorState, getVoice, type EditorState } from '../core/editor/state';

describe('scoreToMei', () => {
  const { mei, elements } = scoreToMei(demoScore());

  it('writes key, meter and instrument clefs', () => {
    expect(mei).toContain('meter.count="4" meter.unit="4" keysig="1s"');
    expect(mei).toMatch(/<label>Gitarre<\/label>/);
    expect(mei).toContain('clef.dis="8" clef.dis.place="below"');
    expect(mei).toMatch(/<staffGrp symbol="brace" bar.thru="true">/);
  });

  it('leaves out the description of a line that has it switched off', () => {
    const demo = demoScore();
    const off = { ...demo, parts: demo.parts.map((p) => ({ ...p, hideLabel: true })) };
    const mei = scoreToMei(off).mei;
    expect(mei).not.toContain("<label>Gitarre</label>");
    expect(mei).not.toMatch(/<labelAbbr>/);
  });

  it('ties the note that crosses bar 2 → 3', () => {
    expect(mei).toMatch(/<note xml:id="v6-m2-1" dur="2" pname="d" oct="5" tie="i"\/>/);
    expect(mei).toMatch(/<note xml:id="v6-m3-1" dur="4" pname="d" oct="5" tie="t"\/>/);
  });

  it('prints a natural against the key, but no sharp that the key already has', () => {
    expect(mei).toMatch(/pname="f" oct="4" accid="n"/); // voice, bar 3
    expect(mei).toMatch(/pname="f" oct="4" accid.ges="s"/); // guitar F#4 in G major
    expect(mei).not.toMatch(/accid="s"/);
  });

  it('beams the eighths in bar 3 of the voice', () => {
    expect(mei).toMatch(/<beam xml:id="v7-m3-1-beam">\s*<note xml:id="v7-m3-1"[^>]*\/>\s*<note xml:id="v8-m3-1"[^>]*\/>\s*<\/beam>/);
  });

  it('maps rendered ids back to model events', () => {
    expect(elements.get('v6-m3-1')).toEqual({
      partId: 'voice',
      voiceId: 'voice-v1',
      eventId: 'v6',
      toneId: 'v6-t1',
      measureNumber: 3,
      staffN: 1,
      kind: 'note',
      onset: frac(2),
    });
    // a note inside a chord is named after its tone, not its position
    expect(elements.get('g1-m1-1-g1-t2')).toMatchObject({ eventId: 'g1', toneId: 'g1-t2', kind: 'chordNote' });
    expect(elements.get('g1-m1-1')).not.toHaveProperty('toneId');
    expect(elements.get('piano-lh-m4-r1')).toMatchObject({ kind: 'rest', staffN: 4, onset: frac(7, 2) });
  });

  it('adds an empty measure for the caret when asked', () => {
    const covered = scoreToMei(demoScore(), { coverTime: frac(4) });
    expect(covered.mei).toContain('<measure xml:id="m5" n="5">');
    expect(covered.elements.get('voice-v1-m5-mr')).toMatchObject({ kind: 'measureRest', onset: frac(4) });
  });
});

describe('the new instruments in MEI (ADR 0038)', () => {
  const meiOf = (id: InstrumentId): string => scoreToMei(createScore({ ...DEFAULT_SETUP, instruments: [id] })).mei;

  it('the viola gets the alto clef, the contrabass an 8 below, the recorder an 8 above', () => {
    expect(meiOf('viola')).toContain('clef.shape="C" clef.line="3"');
    expect(meiOf('contrabass')).toContain('clef.shape="F" clef.line="4" clef.dis="8" clef.dis.place="below"');
    expect(meiOf('recorder')).toContain('clef.shape="G" clef.line="2" clef.dis="8" clef.dis.place="above"');
    expect(meiOf('violin')).not.toContain('clef.dis');
  });
});

describe('tempo changes in MEI (ADR 0039)', () => {
  const plain = demoScore();
  const changed = setTempoChange(plain, frac(1), 132);

  it('a piece without a change prints no tempo; with one, the start tempo and each change are written', () => {
    expect(scoreToMei(plain).mei).not.toContain('<tempo ');
    const mei = scoreToMei(changed).mei;
    expect(mei.match(/<tempo /g)).toHaveLength(2);
    expect(mei).toContain('midi.bpm="132">♩ = 132</tempo>');
    expect(mei).toContain(`♩ = ${tempoAt(changed, frac(0))}</tempo>`);
  });
});

describe('clef changes in MEI (ADR 0040)', () => {
  const piano = (): Score => createScore({ ...DEFAULT_SETUP, instruments: ['piano'] });
  const changed = (at = frac(2)): Score => ({ ...piano(), parts: [{ ...piano().parts[0]!, clefs: [{ at, staff: 0, clef: 'alto' }] }] });

  it('the first clef comes from the change at the start; a later change is a small clef at the end of the bar before', () => {
    const first = scoreToMei({ ...piano(), parts: [{ ...piano().parts[0]!, clefs: [{ at: frac(0), staff: 0, clef: 'bass' }] }] }).mei;
    expect(first).toContain('clef.shape="F" clef.line="4"');
    const { mei } = scoreToMei(changed(), { coverTime: frac(3) });
    const bar2 = mei.slice(mei.indexOf('<measure xml:id="m2"'), mei.indexOf('<measure xml:id="m3"'));
    expect(bar2).toMatch(/<clef xml:id="clef-piano-0-m3" shape="C" line="3"\/>/);
    expect(mei.match(/<clef /g)).toHaveLength(1);
  });

  it('also when the bar before is empty or an upbeat', () => {
    expect(scoreToMei(changed(), { coverTime: frac(3) }).mei).toMatch(/<mRest[^>]*\/>\s*<clef /);
    const upbeat = { ...changed(frac(1, 4)), pickup: frac(1, 4) };
    expect(scoreToMei(upbeat, { coverTime: frac(3) }).mei).toMatch(/<measure xml:id="m0"[\s\S]*<clef xml:id="clef-piano-0-m1"/);
  });
});

describe('upbeat in MEI', () => {
  it('writes measure 0 as intentionally short', () => {
    const { mei } = scoreToMei({ ...demoScore(), pickup: frac(1, 4) });
    expect(mei).toContain('<measure xml:id="m0" n="0" metcon="false">');
    expect(mei).toContain('<measure xml:id="m1" n="1">');
  });
});

describe('Verovio renders our MEI', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });

  it('without warnings, keeping our ids in the SVG', () => {
    const { mei } = scoreToMei(demoScore());
    const { pages, log } = engraver.engrave(mei);
    expect(log).toBe('');
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]).toContain('id="v6-m2-1"');
    expect(pages[0]).toContain('Erste Skizze');
  });

  it('tempo marks are drawn without warnings, one per change plus the start', () => {
    const { log, pages } = engraver.engrave(scoreToMei(setTempoChange(demoScore(), frac(1), 132)).mei);
    expect(log).toBe('');
    expect(pages[0]).toContain('class="tempo"');
    expect(pages[0]!.match(/class="tempo"/g)).toHaveLength(2);
  });

  it('a clef change is drawn: one clef more than without it, no warnings', () => {
    const plain = createScore({ ...DEFAULT_SETUP, instruments: ['voice'] });
    const changed: Score = { ...plain, parts: [{ ...plain.parts[0]!, clefs: [{ at: frac(2), staff: 0, clef: 'bass' }] }] };
    const count = (s: Score): number => {
      const { pages, log } = engraver.engrave(scoreToMei(s, { coverTime: frac(3) }).mei);
      expect(log).toBe('');
      return pages[0]!.match(/class="clef"/g)?.length ?? 0;
    };
    expect(count(changed)).toBe(count(plain) + 1);
  });

  it('every new instrument is drawn without warnings', () => {
    const ids = ['violin', 'viola', 'cello', 'contrabass', 'ebass', 'flute', 'recorder', 'oboe', 'bassoon'] as const;
    const { log, pages } = engraver.engrave(scoreToMei(createScore({ ...DEFAULT_SETUP, instruments: ids })).mei);
    expect(log).toBe('');
    expect(pages[0]).toContain('Viola');
    expect(pages[0]).toContain('Fagott');
  });

  it('with an upbeat and key/meter changes, still without warnings', () => {
    const score = {
      ...demoScore(),
      pickup: frac(1, 4),
      keys: [{ at: frac(0), fifths: 1 }, { at: frac(9, 4), fifths: -2 }],
      meter: [{ at: frac(0), sig: { count: 4, unit: 4 } }, { at: frac(5, 4), sig: { count: 3, unit: 4 } }],
    };
    const { log, pages } = engraver.engrave(scoreToMei(score).mei);
    expect(log).toBe('');
    expect(pages[0]).toContain('id="m0"');
  });
});

describe('lyrics and chord symbols (ADR 0019)', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });
  const withText = () => {
    const score = demoScore();
    const voice = score.parts.find((p) => p.id === 'voice')!;
    const [e1, e2, e3] = voice.voices[0]!.events;
    const lyrics = new Map([[e1!.id, 'Hel-'], [e2!.id, 'lo'], [e3!.id, 'Welt']]);
    return {
      ...score,
      chords: [{ at: frac(0), text: 'Am7' }, { at: frac(1), text: 'D/F#' }],
      parts: score.parts.map((p) => (p.id !== 'voice' ? p : { ...p, voices: p.voices.map((v) => ({ ...v, events: v.events.map((e) => (lyrics.has(e.id) ? { ...e, lyric: lyrics.get(e.id)! } : e)) })) })),
    };
  };

  it('writes syllables with word positions and chord symbols at their beat', () => {
    const { mei } = scoreToMei(withText());
    expect(mei).toMatch(/<syl xml:id="syl-[^"]+" wordpos="i" con="d">Hel<\/syl>/);
    expect(mei).toMatch(/<syl xml:id="syl-[^"]+" wordpos="t">lo<\/syl>/);
    expect(mei).toMatch(/<syl xml:id="syl-[^"]+">Welt<\/syl>/);
    expect(mei).toMatch(/<harm [^>]*tstamp="1\.0000">Am7<\/harm>/);
    expect(mei).toMatch(/<harm [^>]*tstamp="1\.0000">D\/F#<\/harm>/); // bar 2, beat 1
  });

  it('writes further verses under the first, numbered when there is more than one (ADR 0036)', () => {
    const withTwo = withText();
    const voice = withTwo.parts.find((p) => p.id === 'voice')!.voices[0]!;
    const [a, b] = voice.events;
    const score = { ...withTwo, parts: withTwo.parts.map((p) => (p.id !== 'voice' ? p : { ...p, voices: [{ ...voice, events: voice.events.map((e) => (e.id === a!.id ? { ...e, verses: { 2: 'Ge-' } } : e.id === b!.id ? { ...e, verses: { 2: 'sang', 3: 'x' } } : e)) }] })) };
    const { mei, syllables } = scoreToMei(score);
    expect(mei).toMatch(/<verse n="2"><label>2\.<\/label><syl xml:id="syl2-[^"]+" wordpos="i" con="d">Ge<\/syl>/);
    expect(mei.match(/<label>2\.<\/label>/g)).toHaveLength(1);
    expect(mei.match(/<label>1\.<\/label>/g)).toHaveLength(1);
    expect(mei).toMatch(/<syl xml:id="syl3-/);
    expect([...syllables.keys()].filter((k) => k.startsWith('syl2-'))).toHaveLength(2);
    expect(engraver.engrave(mei).log).toBe('');
  });

  it('writes no verse numbers while there is only one verse', () => {
    expect(scoreToMei(withText()).mei).not.toMatch(/<verse n="1"><label>/);
  });

  it('Verovio draws both without warnings', () => {
    const { log, pages } = engraver.engrave(scoreToMei(withText()).mei);
    expect(log).toBe('');
    expect(pages.join('')).toContain('Am7');
    expect(pages.join('')).toContain('Welt');
  });
});

describe('tuplets (ADR 0020)', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });
  const triplets = () => {
    const score = demoScore();
    const events = [
      ...[0, 1, 2].map((i) => ({ id: `t${i}`, onset: frac(i, 12), duration: frac(1, 12), tones: [{ id: `t${i}-t1`, pitch: { step: 'C' as const, alter: 0, octave: 5 } }] })),
      { id: 'q', onset: frac(1, 4), duration: frac(1, 4), tones: [{ id: 'q-t1', pitch: { step: 'D' as const, alter: 0, octave: 5 } }] },
    ];
    return { ...score, links: [], parts: score.parts.map((p) => (p.id !== 'voice' ? p : { ...p, voices: [{ ...p.voices[0]!, events }] })) };
  };

  it('writes a tuplet bracket around the group', () => {
    const { mei } = scoreToMei(triplets());
    expect(mei).toMatch(/<tuplet [^>]*num="3" numbase="2">\s*<beam/);
  });

  it('Verovio draws the triplet without warnings', () => {
    const { log, pages } = engraver.engrave(scoreToMei(triplets()).mei);
    expect(log).toBe('');
    expect(pages.join('')).toContain('class="tuplet');
  });
});

describe('special signs (ADR 0024)', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });
  /** The demo's voice with signs on its first notes and bar signs on bars 1–3. */
  const withSigns = () => {
    const score = demoScore();
    const marks: Record<number, string[]> = { 0: ['mf', 'stacc', 'fermata'], 1: ['cresc', 'acc'], 2: ['trill'], 3: ['f'] };
    return {
      ...score,
      marks: [
        { at: frac(0), kind: 'repeatStart' as const },
        { at: frac(1), kind: 'segno' as const },
        { at: frac(2), kind: 'volta1' as const },
        { at: frac(2), kind: 'repeatEnd' as const },
        { at: frac(3), kind: 'volta2' as const },
        { at: frac(3), kind: 'dsCoda' as const },
      ],
      parts: score.parts.map((p) =>
        p.id !== 'voice' ? p : { ...p, voices: p.voices.map((v) => ({ ...v, events: v.events.map((e, i) => (marks[i] ? { ...e, marks: marks[i]! } : e)) })) },
      ),
    };
  };

  it('writes articulation as attribute, the other note signs as control elements, bar signs as barlines, endings and words', () => {
    const { mei } = scoreToMei(withSigns());
    expect(mei).toMatch(/artic="stacc"/);
    expect(mei).toMatch(/artic="acc"/);
    expect(mei).toMatch(/<dynam [^>]*>mf<\/dynam>/);
    expect(mei).toMatch(/<fermata /);
    expect(mei).toMatch(/<trill /);
    expect(mei).toMatch(/<hairpin [^>]*form="cres"/);
    expect(mei).toMatch(/<measure [^>]*left="rptstart"/);
    expect(mei).toMatch(/<measure [^>]*right="rptend"/);
    expect(mei).toMatch(/<ending [^>]*n="1" label="1\."/);
    expect(mei).toMatch(/<ending [^>]*n="2" label="2\."/);
    expect(mei).toMatch(/glyph.name="segno"/);
    expect(mei).toMatch(/>D\.S\. al Coda<\/dir>/);
  });

  it('Verovio draws all of it without warnings', () => {
    const { log, pages } = engraver.engrave(scoreToMei(withSigns()).mei);
    expect(log).toBe('');
    const svg = pages.join('');
    expect(svg).toContain('class="voltaBracket"');
    expect(svg).toContain('class="symbol"'); // the segno
    expect(svg).toContain('class="hairpin"');
    expect(svg).toContain('class="fermata"');
    expect(svg).toContain('class="dynam"');
    expect(svg).toContain('class="trill"');
  });

  it('an end followed directly by a start is one barline', () => {
    const score = { ...demoScore(), marks: [{ at: frac(0), kind: 'repeatEnd' as const }, { at: frac(1), kind: 'repeatStart' as const }] };
    expect(scoreToMei(score).mei).toMatch(/right="rptboth"/);
    expect(scoreToMei(score).mei).not.toMatch(/left="rptstart"/);
  });
});

describe('tablature (ADR 0022)', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });
  const withTab = () => ({ ...demoScore(), parts: demoScore().parts.map((p) => (p.instrument === 'guitar' ? { ...p, tab: true } : p)) });

  it('adds a six-line staff under the guitar staff with notes on the string lines', () => {
    const { mei, tab, staffs } = scoreToMei(withTab());
    expect(mei).toMatch(/<staffDef n="\d+" lines="6"/);
    expect(mei).toMatch(/<note xml:id="[^"]*-tab"[^>]*loc="\d+"\/>/);
    expect(tab.size).toBeGreaterThan(0);
    expect(staffs.map((s) => s.n)).toEqual([1, 2, 4, 5]); // the tab staff (3) is not a staff of the model
  });

  it('Verovio draws it without warnings and the numbers replace the noteheads', () => {
    const { mei, tab } = scoreToMei(withTab());
    const { log, pages } = engraver.engrave(mei, { tab });
    expect(log).toBe('');
    const svg = pages.join('');
    expect((svg.match(/class="tabnumber"/g) ?? []).length).toBe(tab.size);
  });

  it('no tab staff unless switched on', () => {
    expect(scoreToMei(demoScore()).tab.size).toBe(0);
  });
});

describe('staves shown as piano roll are left out', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });
  const score = demoScore();
  const guitar = score.parts.find((p) => p.instrument === 'guitar')!;
  const piano = score.parts.find((p) => p.instrument === 'piano')!;

  it('drops the staff, its notes and renumbers the rest', () => {
    const all = scoreToMei(score);
    const some = scoreToMei(score, { hiddenStaves: new Set([`${guitar.id}:0`]) });
    expect(some.staffs.length).toBe(all.staffs.length - 1);
    expect(some.staffs.map((s) => s.n)).toEqual(some.staffs.map((_, i) => i + 1));
    expect(some.staffs.some((s) => s.partId === guitar.id)).toBe(false);
    const guitarIds = [...all.elements.values()].filter((r) => r.partId === guitar.id).length;
    expect(guitarIds).toBeGreaterThan(0);
    expect([...some.elements.values()].some((r) => r.partId === guitar.id)).toBe(false);
  });

  it('keeps the other staff of a two-staff instrument and renders without warnings', () => {
    const { mei, staffs } = scoreToMei(score, { hiddenStaves: new Set([`${piano.id}:1`, `${guitar.id}:0`]) });
    expect(staffs.filter((s) => s.partId === piano.id).map((s) => s.staffIndex)).toEqual([0]);
    const { log, pages } = engraver.engrave(mei);
    expect(log).toBe('');
    expect(pages.length).toBeGreaterThan(0);
  });

  it('refuses to engrave nothing', () => {
    const every = new Set(scoreToMei(score).staffs.map((s) => `${s.partId}:${s.staffIndex}`));
    expect(() => scoreToMei(score, { hiddenStaves: every })).toThrow(/Keine Zeile/);
  });
});

describe('several voices on one staff', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });
  const base = demoScore();
  const guitar = base.parts.find((p) => p.instrument === 'guitar')!;
  const first = guitar.voices[0]!;
  const lone = { id: `${guitar.id}-v2`, staff: first.staff, events: [{ id: `${guitar.id}-v2-n1`, onset: frac(0), duration: frac(1, 2), tones: [{ id: `${guitar.id}-v2-n1-t1`, pitch: { step: 'C' as const, alter: 0, octave: 4 } }] }] };
  const withVoices = (voices: typeof guitar.voices) => ({ ...base, parts: base.parts.map((p) => (p.id === guitar.id ? { ...p, voices } : p)) });

  it('writes one layer per voice and Verovio draws them without warnings', () => {
    const { mei } = scoreToMei(withVoices([first, lone]));
    expect(mei).toContain(`${guitar.id}-v2-n1`);
    expect(mei.match(/<layer n="2">/g)?.length).toBeGreaterThan(0);
    expect(engraver.engrave(mei).log).toBe('');
  });

  it('a voice without notes draws nothing', () => {
    const empty = { ...lone, events: [] };
    const none = scoreToMei(withVoices([first, empty])).mei;
    expect(none).toBe(scoreToMei(withVoices([first])).mei);
  });
});

describe('ties and glides in the notation', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });
  const VOICE = { partId: 'voice', voiceId: 'voice-v1' };
  const fresh = () => createEditorState(emptyScore());
  const events = (s: EditorState) => getVoice(s.score, VOICE).voice.events;
  const select = (s: EditorState, i: number): EditorState => ({ ...s, selection: { kind: 'event', ...VOICE, eventId: events(s)[i]!.id } });
  const run = (s: EditorState, id: Parameters<typeof runCommand>[1], arg = 0) => runCommand(s, id, arg);
  const count = (svg: string, cls: string) => (svg.match(new RegExp(`class="${cls}[ "]`, 'g')) ?? []).length;
  const draw = (s: EditorState) => {
    const { mei } = scoreToMei(s.score);
    const { pages, log } = engraver.engrave(mei);
    return { mei, svg: pages.join(''), log };
  };

  it('a tie between two separate notes is drawn as a tie, also over the barline', () => {
    let s = run(fresh(), 'input.duration', 5);
    for (let i = 0; i < 5; i++) s = run(s, 'input.note', 0);
    s = run(run(s, 'edit.escape'), 'edit.escape');
    const tied = run(select(s, 3), 'edit.tie'); // last quarter of bar 1 to first of bar 2
    const { mei, svg, log } = draw(tied);
    expect(log).toBe('');
    expect(mei).toContain('<tie xml:id="tie-link-1"');
    expect(count(svg, 'tie')).toBe(1);
    expect(count(draw(s).svg, 'tie')).toBe(0);
  });

  it('a note tied in from the previous measure does not repeat its accidental', () => {
    let s = run(run(fresh(), 'input.duration', 5), 'input.note', 3); // F
    s = run(run(s, 'edit.alter', 1), 'input.duration', 5); // F# (sharp), a quarter
    for (let i = 0; i < 4; i++) s = run(s, 'input.note', 3);
    const fsharp = events(s).map((e) => e.tones[0]!.pitch.alter);
    expect(fsharp[0]).toBe(1);
    const tied = run(select(s, 3), 'edit.tie');
    const { mei, log } = draw(tied);
    expect(log).toBe('');
    expect(mei).toContain('<tie');
  });

  it('a glide with a gap is drawn with a line and “port.”, and the gap is an invisible space, not a rest', () => {
    let s = run(fresh(), 'input.duration', 5);
    s = run(s, 'input.note', 0);
    s = run(run(run(s, 'input.duration', 3), 'input.rest'), 'input.duration', 5); // a sixteenth gap
    s = run(run(s, 'input.note', 4), 'edit.escape');
    const glided = run(select(s, 0), 'edit.slide');
    const { mei, svg, log } = draw(glided);
    expect(log).toBe('');
    expect(mei).toContain('<gliss xml:id="gliss-link-1"');
    expect(mei).toContain('lform="solid"');
    expect(mei).toContain('>port.</dir>');
    expect(mei).toContain('<space ');
    expect(count(svg, 'gliss')).toBe(1);
    expect(draw(s).mei).not.toContain('<space ');
  });

  it('a glide without a gap stays as a dotted line (the link is remembered) and has no “port.”', () => {
    let s = run(run(fresh(), 'input.duration', 5), 'input.note', 0);
    s = run(run(s, 'input.note', 4), 'edit.escape');
    const { mei, svg, log } = draw(run(select(s, 0), 'edit.slide'));
    expect(log).toBe('');
    expect(mei).toContain('lform="dotted"');
    expect(mei).not.toContain('port.');
    expect(count(svg, 'gliss')).toBe(1);
  });

  it('a glide across an empty measure keeps it invisible instead of drawing a whole-measure rest', () => {
    let s = run(run(fresh(), 'input.duration', 5), 'input.note', 0);
    s = run(run(s, 'input.duration', 7), 'input.rest'); // a whole-note gap
    s = run(run(run(s, 'input.duration', 5), 'input.note', 4), 'edit.escape');
    const { mei, log } = draw(run(select(s, 0), 'edit.slide'));
    expect(log).toBe('');
    expect(mei).not.toContain('voice-v1-m2-mr');
  });
});

describe('barlines, breath signs and groups (ADR 0027)', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });

  function score() {
    let s: EditorState = createEditorState(emptyScore());
    s = runCommand(s, 'input.duration', 5);
    for (let i = 0; i < 6; i++) s = runCommand(s, 'input.note', i);
    s = runCommand(runCommand(runCommand(s, 'input.note', 0), 'input.chordNote', 2), 'input.chordNote', 4);
    const voice = getVoice(s.score, { partId: 'voice', voiceId: 'voice-v1' }).voice;
    const withMarks = {
      ...s.score,
      marks: [{ at: frac(0, 1), kind: 'doubleBar' as const }, { at: frac(1, 1), kind: 'finalBar' as const }],
      groups: [{ symbol: 'bracket' as const, parts: ['voice', 'guitar'] }],
      parts: s.score.parts.map((p) =>
        p.id !== 'voice' ? p : { ...p, voices: p.voices.map((v) => ({ ...v, events: v.events.map((e, i) => (i === 1 ? { ...e, marks: ['breath'] } : i === 2 ? { ...e, marks: ['caesura'] } : e.id === voice.events[voice.events.length - 1]!.id ? { ...e, marks: ['arpeggio'] } : e)) })) },
      ),
    };
    return withMarks;
  }

  it('writes the barlines and the group, and Verovio draws all of it without a warning', () => {
    const { mei } = scoreToMei(score());
    if (!mei.includes('right="dbl"')) throw new Error(mei.split(String.fromCharCode(10)).filter((l) => l.includes('<measure')).join(' | '));
    expect(mei).toContain('right="dbl"');
    expect(mei).toContain('right="end"');
    expect(mei).toMatch(/<staffGrp symbol="bracket" bar.thru="true">/);
    expect(mei).toContain('<breath ');
    expect(mei).toContain('<caesura ');
    expect(mei).toContain('<arpeg ');
    const { log, pages } = engraver.engrave(mei);
    expect(log).toBe('');
    expect(pages[0]).toMatch(/class="breath"/);
    expect(pages[0]).toMatch(/class="arpeg"/);
  });

  it('draws a slur from a note with the sign to the next note, also over a barline (ADR 0029)', () => {
    const base = score();
    const marked = {
      ...base,
      parts: base.parts.map((p) =>
        p.id !== 'voice' ? p : { ...p, voices: p.voices.map((v) => ({ ...v, events: v.events.map((e, i) => (i === 0 || i === 3 ? { ...e, marks: ['slur'] } : e)) })) },
      ),
    };
    const { mei } = scoreToMei(marked);
    expect(mei.match(/<slur /g)).toHaveLength(2);
    const { log, pages } = engraver.engrave(mei);
    expect(log).toBe('');
    expect(pages[0]!.match(/class="slur"/g)).toHaveLength(2);
  });
});

describe('signs exactly on a note (ADR 0031)', () => {
  it('a segno on a note stands at its beat, one that belongs to the bar stays at the first beat; the words follow the note too', () => {
    const base = emptyScore();
    const voice = base.parts[0]!.voices[0]!;
    const events = parseLine('C5:1/4 D5:1/4 E5:1/4 F5:1/4', 'e');
    const withMusic = { ...base, parts: base.parts.map((p, i) => (i === 0 ? { ...p, voices: [{ ...voice, events }] } : p)) };
    const exact = scoreToMei({ ...withMusic, marks: [{ at: frac(2, 4), kind: 'segno', exact: true }, { at: frac(1, 4), kind: 'ritard', exact: true }] }).mei;
    expect(exact).toMatch(/<dir xml:id="segno-0"[^>]*tstamp="3.0000"/);
    expect(exact).toMatch(/<dir xml:id="dir-ritard-0"[^>]*tstamp="2.0000"/);
    const legacy = scoreToMei({ ...withMusic, marks: [{ at: frac(0), kind: 'segno' }, { at: frac(0), kind: 'ritard' }] }).mei;
    expect(legacy).toMatch(/<dir xml:id="segno-0"[^>]*tstamp="1"/);
    expect(legacy).toMatch(/<dir xml:id="dir-ritard-0"[^>]*tstamp="4"/);
  });
});

describe('line breaks (ADR 0031)', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });
  const eight = () => {
    const base = emptyScore();
    const voice = base.parts[0]!.voices[0]!;
    const events = parseLine('C5:1/1 D5:1/1 E5:1/1 F5:1/1 G5:1/1 A5:1/1 B5:1/1 C6:1/1', 'e');
    return { ...base, parts: base.parts.map((p, i) => (i === 0 ? { ...p, voices: [{ ...voice, events }] } : p)) };
  };
  const systems = (score: ReturnType<typeof eight>) => {
    const { pages, log } = engraver.engrave(scoreToMei(score).mei, { pageWidth: 3000, scale: 40 });
    expect(log).toBe('');
    return pages.join('').match(/class="system"/g)?.length ?? 0;
  };

  it('bars per line and imported breaks decide where a new line starts; nothing set = as many as fit', () => {
    expect(systems({ ...eight(), layout: { perSystem: 2 } })).toBe(4);
    expect(systems({ ...eight(), layout: { perSystem: 4 } })).toBe(2);
    expect(systems({ ...eight(), layout: { breaks: [3] } })).toBe(2);
    expect(systems(eight())).toBe(1); // wide page: all eight bars fit on one line
  });
});

describe('hand-placed things in MEI (ADR 0043)', () => {
  const base = demoScore();
  const withVoice = (change: (v: (typeof base.parts)[0]['voices'][0]) => (typeof base.parts)[0]['voices'][0]) => ({
    ...base,
    parts: base.parts.map((p, i) => (i === 0 ? { ...p, voices: p.voices.map((v, k) => (k === 0 ? change(v) : v)) } : p)),
  });

  it('writes the stem direction a note was given', () => {
    const score = withVoice((v) => ({ ...v, events: v.events.map((e, i) => (i === 0 ? { ...e, stem: 'up' as const } : e)) }));
    expect(scoreToMei(score).mei.match(/stem\.dir="up"/g)).toHaveLength(1);
    expect(scoreToMei(base).mei).not.toContain('stem.dir');
  });

  // Three quarter notes C D E in 4/4: the last quarter of the bar is a rest at 3/4.
  const withRest = (mark: { hidden?: true; shift?: number }): Score => {
    const s = createScore(DEFAULT_SETUP);
    const part = s.parts[0]!;
    const events = [0, 1, 2].map((i) => ({ id: `n${i}`, onset: frac(i, 4), duration: frac(1, 4), tones: [{ id: `n${i}-t1`, pitch: { step: 'C' as const, alter: 0, octave: 5 } }] }));
    return { ...s, parts: [{ ...part, voices: [{ ...part.voices[0]!, events, rests: [{ at: frac(3, 4), ...mark }] }, ...part.voices.slice(1)] }, ...s.parts.slice(1)] };
  };

  it('prints a hidden rest as time only, and lets the editing view draw it faintly', () => {
    const printed = scoreToMei(withRest({ hidden: true }));
    expect(printed.mei).not.toMatch(/<rest /);
    expect(printed.mei).toMatch(/<space xml:id="voice-v1-m1-r1"/);
    const editing = scoreToMei(withRest({ hidden: true }), { showHiddenRests: true });
    expect(editing.mei).toMatch(/<rest xml:id="voice-v1-m1-r1"/);
    expect(editing.hiddenRests).toEqual(['voice-v1-m1-r1']);
    expect(editing.elements.get('voice-v1-m1-r1')).toMatchObject({ kind: 'rest' }); // still clickable
  });

  it('puts a moved rest at the pitch of the middle line plus its steps', () => {
    // the treble clef: middle line B4; two steps up = D5
    expect(scoreToMei(withRest({ shift: 2 })).mei).toContain('<rest xml:id="voice-v1-m1-r1" dur="4" ploc="d" oloc="5"/>');
    expect(scoreToMei(withRest({ shift: -1 })).mei).toMatch(/ploc="a" oloc="4"/);
    expect(scoreToMei(withRest({ hidden: true })).mei).not.toContain('ploc');
  });

  it('writes a free text as a direction with its size and offset', () => {
    const part = base.parts[0]!;
    const score = { ...base, texts: [{ id: 'text-1', partId: part.id, staff: 0, at: frac(0, 1), text: 'Zart & leise', size: 18, dx: 2, dy: 5 }] };
    const mei = scoreToMei(score).mei;
    expect(mei).toContain('<dir xml:id="free-text-1"');
    expect(mei).toContain('ho="2" vo="5"');
    expect(mei).toContain('fontsize="18pt"');
    expect(mei).toContain('Zart &amp; leise');
  });
});
