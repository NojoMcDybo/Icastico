import { describe, expect, it } from 'vitest';
import { exportMusicXml } from './musicxml';
import { importMusicXml } from '../import/musicxml';
import { demoScore } from '../demo';
import { createScore, DEFAULT_SETUP, emptyScore } from '../templates';
import { add, frac, ZERO } from '../time';
import { midiOf, pitchToString } from '../pitch';
import { setTempoChange, validateScore, type Score } from '../model';
import { parseLine } from '../line';
import { NOTE_SYMBOL_IDS } from '../symbols';

/**
 * What the music is, independent of ids and voice numbering: per part, every note as "onset dur pitches lyric".
 * MusicXML cannot hold a note across a barline, so a note and its tied continuation count as one.
 */
function flatten(score: Score): string[][] {
  const tiedTo = new Map((score.links ?? []).filter((l) => l.kind === 'tie').map((l) => [l.to, l.from]));
  return score.parts.map((p) =>
    p.voices
      .flatMap((v) => {
        const events = v.events.map((e) => ({ ...e }));
        for (const e of events) {
          const from = e.tones.map((t) => tiedTo.get(t.id)).find((id) => id !== undefined);
          const head = from ? events.find((h) => h.tones.some((t) => t.id === from)) : undefined;
          if (head) {
            (head as { duration: typeof e.duration }).duration = add(head.duration, e.duration);
            e.duration = { n: 0, d: 1 };
          }
        }
        return events.filter((e) => e.duration.n !== 0).map((e) => ({ staff: v.staff, e }));
      })
      .sort((a, b) => a.staff - b.staff || a.e.onset.n * b.e.onset.d - b.e.onset.n * a.e.onset.d || midiOf(a.e.tones[0]!.pitch) - midiOf(b.e.tones[0]!.pitch))
      .map(({ staff, e }) => `${staff}|${e.onset.n}/${e.onset.d}|${e.duration.n}/${e.duration.d}|${e.tones.map((t) => pitchToString(t.pitch)).join(',')}|${e.lyric ?? ''}`),
  );
}

describe('MusicXML export (round trip through the importer)', () => {
  it('the demo score comes back with the same notes, key, meter, tempo and ties', () => {
    const demo = demoScore();
    const { xml, notes } = exportMusicXml(demo, '0.11.0');
    const { score, notes: importNotes } = importMusicXml(xml, 'demo.musicxml');
    expect(validateScore(score)).toEqual([]);
    expect(importNotes).toEqual([]);
    expect(flatten(score)).toEqual(flatten(demo));
    expect(score.keys).toEqual(demo.keys);
    expect(score.meter).toEqual(demo.meter);
    expect(score.title).toBe(demo.title);
    expect(notes).toEqual([]);
  });

  it('tuplets, lyrics, chord symbols, an upbeat and a tempo survive', () => {
    const base = emptyScore();
    const voice = base.parts[0]!.voices[0]!;
    const events = parseLine('C5:1/12 D5:1/12 E5:1/12 F5:1/4 [G4,B4]:1/2', 'e').map((e, i) => (i < 3 ? { ...e, lyric: ['Hel-', 'lo', 'ja'][i]! } : e));
    const score: Score = {
      ...base,
      title: 'Rund <um> & "durch"',
      composer: 'N. N.',
      pickup: frac(1, 4),
      tempo: 132,
      chords: [{ at: ZERO, text: 'Am7' }, { at: frac(1, 4), text: 'Bb/D' }, { at: frac(1, 2), text: 'C#sus4' }],
      parts: [{ ...base.parts[0]!, voices: [{ ...voice, events }] }],
    };
    const { xml } = exportMusicXml(score);
    const back = importMusicXml(xml).score;
    expect(back.title).toBe(score.title);
    expect(back.composer).toBe('N. N.');
    expect(back.tempo).toBe(132);
    expect(back.pickup).toEqual(frac(1, 4));
    expect(flatten(back)).toEqual(flatten(score));
    expect(back.chords).toEqual(score.chords);
  });

  it('keeps further verses with their word connections (ADR 0036)', () => {
    const base = emptyScore();
    const voice = base.parts[0]!.voices[0]!;
    const verses = [{ 2: 'Ge-', 3: 'x' }, { 2: 'sang' }, {}];
    const events = parseLine('C5:1/4 D5:1/4 E5:1/4', 'e').map((e, i) => ({ ...e, lyric: ['Hel-', 'lo', 'ja'][i]!, ...(i < 2 ? { verses: verses[i] } : {}) }));
    const score: Score = { ...base, parts: [{ ...base.parts[0]!, voices: [{ ...voice, events }] }] };
    const { xml } = exportMusicXml(score);
    expect(xml).toContain('<lyric number="2"><syllabic>begin</syllabic><text>Ge</text></lyric>');
    expect(xml).toContain('<lyric number="2"><syllabic>end</syllabic><text>sang</text></lyric>');
    const back = importMusicXml(xml);
    expect(back.notes.join('')).not.toMatch(/Strophe/);
    expect(back.score.parts[0]!.voices[0]!.events.map((e) => [e.lyric, e.verses])).toEqual([
      ['Hel-', { 2: 'Ge-', 3: 'x' }],
      ['lo', { 2: 'sang' }],
      ['ja', undefined],
    ]);
  });

  it('writes ties across the barline and a rest-only bar as a measure rest', () => {
    const base = emptyScore();
    const voice = base.parts[0]!.voices[0]!;
    const score: Score = { ...base, parts: [{ ...base.parts[0]!, voices: [{ ...voice, events: parseLine('r:3/4 C5:1/2', 'e') }] }] };
    const { xml } = exportMusicXml(score);
    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain('<tie type="stop"/>');
    expect(flatten(importMusicXml(xml).score)).toEqual(flatten(score));
    const empty = exportMusicXml({ ...base, parts: [{ ...base.parts[0]!, voices: [{ ...voice, events: parseLine('C5:1/4', 'e') }] }] }).xml;
    expect(importMusicXml(empty).score.parts[0]!.voices[0]!.events).toHaveLength(1);
  });

  it('says what it cannot write: glides and loudness', () => {
    const base = emptyScore();
    const voice = base.parts[0]!.voices[0]!;
    const events = parseLine('C5:1/4 r:1/8 E5:1/4', 'e').map((e, i) => (i === 0 ? { ...e, tones: e.tones.map((t) => ({ ...t, volume: 60 })) } : e));
    const score: Score = { ...base, links: [{ id: 'l1', kind: 'slide', from: 'e1-t1', to: 'e2-t1' }], parts: [{ ...base.parts[0]!, voices: [{ ...voice, events }] }] };
    const text = exportMusicXml(score).notes.join(' ');
    expect(text).toMatch(/Gleiten: 1×/);
    expect(text).toMatch(/Lautstärke/);
  });

  it('special signs on notes and bars survive the round trip (ADR 0024)', () => {
    const base = emptyScore();
    const voice = base.parts[0]!.voices[0]!;
    const signs: Record<number, string[]> = { 0: ['mf', 'stacc', 'fermata'], 1: ['cresc', 'acc'], 2: ['trill'], 3: ['f'], 4: ['marc', 'turn'], 5: ['prall'], 6: ['sfz', 'ten'], 7: ['dim'] };
    const events = parseLine('C5:1 D5:1 E5:1 F5:1 G5:1 A5:1 B5:1 C6:1', 'e').map((e, i) => (signs[i] ? { ...e, marks: signs[i]! } : e));
    const score: Score = {
      ...base,
      marks: [
        { at: frac(0), kind: 'repeatStart' },
        { at: frac(1), kind: 'segno' },
        { at: frac(2), kind: 'volta1' },
        { at: frac(3), kind: 'repeatEnd' },
        { at: frac(3), kind: 'volta1' },
        { at: frac(3), kind: 'toCoda' },
        { at: frac(4), kind: 'volta2' },
        { at: frac(5), kind: 'dsCoda' },
        { at: frac(6), kind: 'coda' },
        { at: frac(7), kind: 'fine' },
      ],
      parts: [{ ...base.parts[0]!, voices: [{ ...voice, events }] }],
    };
    const { xml, notes } = exportMusicXml(score);
    expect(notes).toEqual([]);
    expect(xml).toContain('<repeat direction="backward"/>');
    expect(xml).toContain('<ending number="1" type="start"/>');
    expect(xml).toContain('<wedge type="stop"/>');
    const back = importMusicXml(xml);
    expect(back.notes).toEqual([]);
    expect(back.score.marks).toEqual(score.marks);
    expect(back.score.parts[0]!.voices[0]!.events.map((e) => e.marks ?? [])).toEqual(
      events.map((e) => e.marks ?? []).map((m) => [...m].sort((x, y) => NOTE_SYMBOL_IDS.indexOf(x) - NOTE_SYMBOL_IDS.indexOf(y))),
    );
  });

  it('refuses an invalid score instead of writing a broken file', () => {
    const base = emptyScore();
    expect(() => exportMusicXml({ ...base, meter: [] })).toThrow(/ungültig/);
  });
});

describe('slurs (Bindebogen, ADR 0029)', () => {
  it('are written as start and stop on the two notes and read back as the sign', () => {
    const base = emptyScore();
    const voice = base.parts[0]!.voices[0]!;
    const events = parseLine('C5:1/4 D5:1/4 E5:1/4 F5:1/4', 'e').map((e, i) => (i === 0 || i === 1 ? { ...e, marks: ['slur'] } : e));
    const score: Score = { ...base, parts: base.parts.map((p, i) => (i === 0 ? { ...p, voices: [{ ...voice, events }] } : p)) };
    const { xml, notes } = exportMusicXml(score);
    expect(notes).toEqual([]);
    expect(xml.match(/<slur type="start" number="1"\/>/g)).toHaveLength(2);
    expect(xml.match(/<slur type="stop" number="1"\/>/g)).toHaveLength(2);
    const back = importMusicXml(xml);
    expect(back.notes).toEqual([]);
    expect(back.score.parts[0]!.voices[0]!.events.map((e) => e.marks ?? [])).toEqual([['slur'], ['slur'], [], []]);
    expect(validateScore(back.score)).toEqual([]);
  });

  it('a longer slur from another program is reported, not drawn wrongly', () => {
    const xml = exportMusicXml(emptyScore()).xml;
    expect(xml).not.toContain('<slur');
    const long = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Gesang</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><notations><slur type="start" number="1"/></notations></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><notations><slur type="stop" number="1"/></notations></note>
      <note><rest/><duration>1</duration></note></measure></part></score-partwise>`;
    const back = importMusicXml(long);
    expect(back.notes.join(' ')).toMatch(/Bögen über mehrere Noten/);
    expect(back.score.parts[0]!.voices[0]!.events.some((e) => e.marks?.includes('slur'))).toBe(false);
  });
});

describe('barlines, breath signs and groups survive the MusicXML round trip (ADR 0027)', () => {
  it('double bar, final bar, tempo words, breath, caesura, arpeggio and a bracket', () => {
    const base = emptyScore();
    const voice = base.parts[0]!.voices[0]!;
    const events = parseLine('C5:1/4 D5:1/4 E5:1/4 [C4,E4,G4]:1/4 F5:1/4 G5:1/4 A5:1/4 B5:1/4', 'e').map((e, i) => (i === 1 ? { ...e, marks: ['breath'] } : i === 2 ? { ...e, marks: ['caesura'] } : i === 3 ? { ...e, marks: ['arpeggio'] } : e));
    const score: Score = {
      ...base,
      marks: [{ at: frac(0), kind: 'doubleBar' }, { at: frac(1), kind: 'finalBar' }, { at: frac(1), kind: 'ritard' }],
      groups: [{ symbol: 'bracket', parts: [base.parts[0]!.id, base.parts[1]!.id] }],
      parts: base.parts.map((p, i) => (i === 0 ? { ...p, voices: [{ ...voice, events }] } : p)),
    };
    const { xml, notes } = exportMusicXml(score);
    expect(notes).toEqual([]);
    expect(xml).toContain('<bar-style>light-light</bar-style>');
    expect(xml).toContain('<bar-style>light-heavy</bar-style>');
    expect(xml).toContain('<group-symbol>bracket</group-symbol>');
    expect(xml).toContain('<breath-mark/>');
    expect(xml).toContain('<arpeggiate/>');
    const back = importMusicXml(xml);
    expect(back.notes).toEqual([]);
    expect(back.score.marks).toEqual(score.marks);
    expect(back.score.groups).toEqual([{ symbol: 'bracket', parts: back.score.parts.slice(0, 2).map((p) => p.id) }]);
    expect(back.score.parts[0]!.voices[0]!.events.map((e) => e.marks ?? [])).toEqual(events.map((e) => e.marks ?? []));
    expect(validateScore(back.score)).toEqual([]);
  });
});

describe('line breaks (ADR 0031)', () => {
  const eight = () => {
    const base = emptyScore();
    const voice = base.parts[0]!.voices[0]!;
    const events = parseLine('C5:1/1 D5:1/1 E5:1/1 F5:1/1 G5:1/1 A5:1/1 B5:1/1 C6:1/1', 'e');
    return { ...base, parts: base.parts.map((p, i) => (i === 0 ? { ...p, voices: [{ ...voice, events }] } : p)) } as Score;
  };

  it('bars per line are written as new-system and come back as the breaks', () => {
    const { xml } = exportMusicXml({ ...eight(), layout: { perSystem: 3 } });
    expect(xml.match(/<print new-system="yes"\/>/g)).toHaveLength(2); // before bar 4 and bar 7
    const back = importMusicXml(xml);
    expect(back.score.layout).toEqual({ breaks: [3, 6] });
    expect(validateScore(back.score)).toEqual([]);
  });

  it('a file without line breaks gets none, and new-page counts as a break too', () => {
    expect(importMusicXml(exportMusicXml(eight()).xml).score.layout).toBeUndefined();
    const xml = exportMusicXml({ ...eight(), layout: { breaks: [2] } }).xml.replace('<print new-system="yes"/>', '<print new-page="yes"/>');
    expect(importMusicXml(xml).score.layout).toEqual({ breaks: [2] });
  });
});

describe('the tuning of a guitar (ADR 0033)', () => {
  const guitar = (tuning?: readonly number[]) => {
    const base = emptyScore();
    const events = parseLine('D2:1/4 A2:1/4 D3:1/4 G3:1/4', 'g');
    return { ...base, parts: base.parts.map((p) => (p.instrument === 'guitar' ? { ...p, ...(tuning ? { tuning } : {}), voices: [{ ...p.voices[0]!, events }] } : p)) } as Score;
  };

  it('Drop D is written as staff details and read back', () => {
    const drop = [64, 59, 55, 50, 45, 38];
    const { xml } = exportMusicXml(guitar(drop));
    expect(xml).toMatch(/<staff-lines>6<\/staff-lines>/);
    expect(xml).toMatch(/<staff-tuning line="1"><tuning-step>D<\/tuning-step><tuning-octave>3<\/tuning-octave>/); // the lowest string, written like the notes (an octave up)
    const back = importMusicXml(xml).score;
    expect(back.parts.find((p) => p.instrument === 'guitar')!.tuning).toEqual(drop);
    expect(validateScore(back)).toEqual([]);
  });

  it('standard tuning writes nothing and reads back as no tuning', () => {
    expect(exportMusicXml(guitar()).xml).not.toMatch(/staff-tuning/);
    expect(importMusicXml(exportMusicXml(guitar()).xml).score.parts.find((p) => p.instrument === 'guitar')!.tuning).toBeUndefined();
  });

  it('an explicit standard tuning is not kept as a custom one', () => {
    const back = importMusicXml(exportMusicXml(guitar([64, 59, 55, 50, 45, 40])).xml).score;
    expect(back.parts.find((p) => p.instrument === 'guitar')!.tuning).toBeUndefined();
  });

  it('a file with a tuning of its own (Open G with a flat) comes through', () => {
    const open = [62, 59, 55, 50, 43, 38]; // D G d g h d
    const back = importMusicXml(exportMusicXml(guitar(open)).xml).score;
    expect(back.parts.find((p) => p.instrument === 'guitar')!.tuning).toEqual(open);
  });
});

describe('the new instruments (ADR 0038)', () => {
  const ids = ['violin', 'viola', 'cello', 'contrabass', 'ebass', 'flute', 'recorder', 'oboe', 'bassoon'] as const;
  const score = createScore({ ...DEFAULT_SETUP, instruments: ids });

  it('the viola is written with the alto clef, the contrabass with an octave change', () => {
    const { xml } = exportMusicXml(score);
    expect(xml).toContain('<sign>C</sign><line>3</line>');
    expect(xml).toContain('<sign>F</sign><line>4</line><clef-octave-change>-1</clef-octave-change>');
    expect(xml).toContain('<sign>G</sign><line>2</line><clef-octave-change>1</clef-octave-change>');
  });

  it('comes back as the same instruments', () => {
    const back = importMusicXml(exportMusicXml(score).xml).score;
    expect(back.parts.map((p) => p.instrument)).toEqual(ids);
  });
});

describe('tempo changes (ADR 0039)', () => {
  const score = setTempoChange(setTempoChange({ ...demoScore(), tempo: 100 }, frac(1), 132), frac(2), 60);

  it('every change is written at its bar and comes back at the same bar', () => {
    const { xml } = exportMusicXml(score);
    expect(xml.match(/<sound tempo="/g)).toHaveLength(3);
    const back = importMusicXml(xml).score;
    expect(back.tempo).toBeUndefined(); // 100 is the default and is not stored
    expect(back.tempos).toEqual([{ at: frac(1), bpm: 132 }, { at: frac(2), bpm: 60 }]);
  });

  it('a tempo in the middle of a bar is not taken over, and says so', () => {
    const { xml } = exportMusicXml(score);
    const result = importMusicXml(xml.replace(/(<measure number="2"[^>]*>)([\s\S]*?)(<note>)/, '$1$2<note><rest/><duration>1</duration></note><direction><sound tempo="77"/></direction>$3'));
    expect(result.notes.join(' ')).toMatch(/Tempowechsel mitten im Takt/);
  });
});

describe('clef changes and octave clefs (ADR 0040)', () => {
  const voice = (): Score => {
    const base = emptyScore();
    const v = base.parts[0]!.voices[0]!;
    return { ...base, parts: [{ ...base.parts[0]!, voices: [{ ...v, events: parseLine('C4:1 D4:1 E4:1 F4:1', 'e') }] }] };
  };
  const withClefs = (s: Score, clefs: NonNullable<Score['parts'][number]['clefs']>): Score => ({ ...s, parts: [{ ...s.parts[0]!, clefs }, ...s.parts.slice(1)] });

  it('a clef at the start and a change later are written and come back', () => {
    const score = withClefs(voice(), [{ at: ZERO, staff: 0, clef: 'bass' }, { at: frac(2), staff: 0, clef: 'alto' }]);
    const { xml } = exportMusicXml(score);
    expect(xml).toContain('<sign>F</sign><line>4</line>');
    expect(xml.match(/<sign>C<\/sign><line>3<\/line>/g)).toHaveLength(1);
    const back = importMusicXml(xml).score;
    expect(back.parts[0]!.clefs).toEqual(score.parts[0]!.clefs);
    expect(validateScore(back)).toEqual([]);
  });

  it('a clef change in the middle of a bar is not taken over, and says so', () => {
    const { xml } = exportMusicXml(voice());
    const mid = xml.replace(/(<measure number="1"[^>]*>[\s\S]*?<\/note>)/, '$1<attributes><clef><sign>F</sign><line>4</line></clef></attributes>');
    const result = importMusicXml(mid);
    expect(result.notes.join(' ')).toMatch(/Schlüsselwechsel mitten im Takt/);
    expect(result.score.parts[0]!.clefs).toBeUndefined();
  });

  it('an instrument written with an octave clef keeps its sounding pitches through export and import', () => {
    for (const id of ['contrabass', 'ebass', 'recorder'] as const) {
      const base = createScore({ ...DEFAULT_SETUP, instruments: [id] });
      const v = base.parts[0]!.voices[0]!;
      const score: Score = { ...base, parts: [{ ...base.parts[0]!, voices: [{ ...v, events: parseLine('E2:1 A2:1', 'e') }] }] };
      const back = importMusicXml(exportMusicXml(score).xml).score;
      expect(flatten(back)).toEqual(flatten(score));
      expect(back.parts[0]!.instrument).toBe(id);
    }
  });
});
