import { describe, expect, it } from 'vitest';
import { exportMusicXml } from './musicxml';
import { importMusicXml } from '../import/musicxml';
import { demoScore } from '../demo';
import { emptyScore } from '../templates';
import { add, frac, ZERO } from '../time';
import { midiOf, pitchToString } from '../pitch';
import { validateScore, type Score } from '../model';
import { parseLine } from '../line';

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

  it('refuses an invalid score instead of writing a broken file', () => {
    const base = emptyScore();
    expect(() => exportMusicXml({ ...base, meter: [] })).toThrow(/ungültig/);
  });
});
