import { describe, expect, it } from 'vitest';
import { type Pitch, midiOf, parsePitch, pitchToString } from './pitch';
import { CHROMATIC_CHOICES, DIATONIC_CHOICES, type Interval, transposeChromatic, transposeDiatonic, transposeKey, unisonIndex } from './transpose';
import { newScoreState, runCommand } from './editor/commands';
import { copyClip, extendRange } from './editor/range';
import { transposeScope, transposeSelection } from './editor/transposeState';
import { getVoice, type EditorState } from './editor/state';
import { germanName } from '../ui/transposeDialog';

const MAJOR_THIRD: Interval = { steps: 2, semitones: 4 };
const FIFTH: Interval = { steps: 4, semitones: 7 };
const up = (text: string, i: Interval): string => pitchToString(transposeChromatic(parsePitch(text), i)!);

describe('chromatic transposition spells the interval correctly', () => {
  it('a major third: C → E, F → A, Bb → D, F# → A#, E → G#', () => {
    expect([up('C4', MAJOR_THIRD), up('F4', MAJOR_THIRD), up('Bb4', MAJOR_THIRD), up('F#4', MAJOR_THIRD), up('E4', MAJOR_THIRD)]).toEqual(['E4', 'A4', 'D5', 'A#4', 'G#4']);
  });

  it('a fifth up and down, the octave and the tritone spellings', () => {
    expect([up('C4', FIFTH), up('B4', FIFTH), up('C4', { steps: -4, semitones: -7 }), up('C4', { steps: 7, semitones: 12 })]).toEqual(['G4', 'F#5', 'F3', 'C5']);
    expect(up('C4', { steps: 3, semitones: 6 })).toBe('F#4'); // augmented fourth
    expect(up('C4', { steps: 4, semitones: 6 })).toBe('Gb4'); // diminished fifth
  });

  it('every note moves by exactly the semitones of the interval', () => {
    for (const choice of CHROMATIC_CHOICES) {
      for (const text of ['C4', 'F#3', 'Bb4', 'E5', 'Db4']) {
        const p = parsePitch(text);
        const q = transposeChromatic(p, choice.interval);
        if (q) expect(midiOf(q) - midiOf(p)).toBe(choice.interval.semitones);
      }
    }
  });
});

describe('diatonic transposition stays in the key', () => {
  const d = (text: string, steps: number, fifths: number): string => pitchToString(transposeDiatonic(parsePitch(text), steps, fifths));

  it('in C major a third up is the third of the scale; in G major F# up a third is A', () => {
    expect([d('C4', 2, 0), d('D4', 2, 0), d('E4', 2, 0), d('B4', 2, 0)]).toEqual(['E4', 'F4', 'G4', 'D5']);
    expect(d('F#4', 2, 1)).toBe('A4');
    expect(d('E4', -2, 1)).toBe('C4');
  });

  it('a note raised against the key stays raised', () => {
    expect(d('F#4', 2, 0)).toBe('A#4'); // F# in C major is an accidental
    expect(d('C4', 7, 0)).toBe('C5');
  });
});

describe('the key signature moves with the music', () => {
  it('C major up a fifth is G major, A major down a major third is F major', () => {
    expect(transposeKey(0, FIFTH)).toBe(1);
    expect(transposeKey(3, { steps: -2, semitones: -4 })).toBe(-1);
    expect(transposeKey(0, { steps: 0, semitones: 0 })).toBe(0);
    expect(transposeKey(2, { steps: 7, semitones: 12 })).toBe(2);
  });
});

describe('the choices of the wheel', () => {
  it('start at an octave down and end at an octave up, the unison in the middle', () => {
    expect(CHROMATIC_CHOICES[0]!.label).toBe('Oktave abwärts');
    expect(CHROMATIC_CHOICES[CHROMATIC_CHOICES.length - 1]!.label).toBe('Oktave aufwärts');
    expect(CHROMATIC_CHOICES[unisonIndex(CHROMATIC_CHOICES)]!.label).toBe('Prim');
    expect(DIATONIC_CHOICES).toHaveLength(15);
    expect(DIATONIC_CHOICES[unisonIndex(DIATONIC_CHOICES)]!.interval.steps).toBe(0);
  });
});

describe('transposing in the editor', () => {
  const eight = (): EditorState => {
    let s = runCommand(newScoreState(), 'input.duration', 5);
    for (const letter of [0, 1, 2, 3]) s = runCommand(s, 'input.note', letter);
    return s;
  };
  const names = (s: EditorState) => getVoice(s.score, { partId: 'voice', voiceId: 'voice-v1' }).voice.events.map((e) => e.tones.map((t) => pitchToString(t.pitch as Pitch)).join('+'));
  const select = (s: EditorState, i: number): EditorState => ({ ...s, caret: null, selection: { kind: 'event', partId: 'voice', voiceId: 'voice-v1', eventId: getVoice(s.score, { partId: 'voice', voiceId: 'voice-v1' }).voice.events[i]!.id } });

  it('with nothing selected the whole piece moves, and the key moves with it; a selected line moves alone', () => {
    const line = transposeSelection(eight(), { mode: 'chromatic', interval: FIFTH, adjustKey: true });
    expect(transposeScope(eight()).label).toMatch(/Ganze Zeile/);
    expect(line.score.keys[0]!.fifths).toBe(0);
    const s = transposeSelection({ ...eight(), caret: null, selection: null }, { mode: 'chromatic', interval: FIFTH, adjustKey: true });
    expect(names(s)).toEqual(['G5', 'A5', 'B5', 'C6']);
    expect(s.score.keys[0]!.fifths).toBe(1);
    expect(s.message).toMatch(/4 Töne transponiert/);
  });

  it('a marked passage moves alone, the key stays', () => {
    const marked = extendRange(select(eight(), 1), 1); // D E
    expect(transposeScope(marked).label).toMatch(/Markierter Bereich \(2 Noten\)/);
    const s = transposeSelection(marked, { mode: 'chromatic', interval: MAJOR_THIRD, adjustKey: true });
    expect(names(s)).toEqual(['C5', 'F#5', 'G#5', 'F5']);
    expect(s.score.keys[0]!.fifths).toBe(0);
    expect(copyClip(marked)).not.toBeNull();
  });

  it('diatonic by a third in C major', () => {
    expect(names(transposeSelection(eight(), { mode: 'diatonic', interval: { steps: 2, semitones: 0 } }))).toEqual(['E5', 'F5', 'G5', 'A5']);
  });
});

describe('German note names for the example line', () => {
  it('H is B natural, B is B flat; As and Es lose the e', () => {
    const n = (text: string) => germanName(parsePitch(text));
    expect([n('C4'), n('B4'), n('Bb4'), n('F#4'), n('Eb4'), n('Ab4'), n('Db4'), n('Ebb4'), n('Bx4'), n('Bbb4'), n('Cbb4')]).toEqual(['C', 'H', 'B', 'Fis', 'Es', 'As', 'Des', 'Eses', 'Hisis', 'Heses', 'Ceses']);
  });
});
