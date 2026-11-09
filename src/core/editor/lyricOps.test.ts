import { describe, expect, it } from 'vitest';
import { validateScore } from '../model';
import { newScoreState, runCommand, setLyrics } from './commands';
import { chosenNotes, clearSyllables, copySyllables, moveSyllable, pasteSyllables } from './lyricOps';
import { rangeTo } from './range';
import { type EditorState, type VoiceRef, getVoice } from './state';

const VOICE: VoiceRef = { partId: 'voice', voiceId: 'voice-v1' };
const run = (s: EditorState, id: Parameters<typeof runCommand>[1], arg = 0) => runCommand(s, id, arg);
const events = (s: EditorState) => getVoice(s.score, VOICE).voice.events;
const lyrics = (s: EditorState) => events(s).map((e) => e.lyric ?? '·');
const select = (s: EditorState, i: number): EditorState => ({ ...s, caret: null, range: null, selection: { kind: 'event', ...VOICE, eventId: events(s)[i]!.id } });

/** Six quarter notes with the syllables "Gu- ten A- bend gu- te". */
function sung(): EditorState {
  let s = run(newScoreState(), 'input.duration', 5);
  for (const letter of [0, 1, 2, 3, 4, 5]) s = run(s, 'input.note', letter);
  return setLyrics(select(s, 0), 'Gu- ten A- bend gu- te');
}

describe('syllables as things of their own (ADR 0033)', () => {
  it('chooses the syllable of the selected note, or of the marked passage', () => {
    const s = select(sung(), 1);
    expect(chosenNotes(s)!.events.map((e) => e.lyric)).toEqual(['ten']);
    const marked = rangeTo(s, VOICE, events(s)[3]!.id);
    expect(chosenNotes(marked)!.events.map((e) => e.lyric)).toEqual(['ten', 'A-', 'bend']);
  });

  it('takes the syllable away and keeps the notes', () => {
    const s = clearSyllables(rangeTo(select(sung(), 1), VOICE, events(sung())[2]!.id));
    expect(lyrics(s)).toEqual(['Gu-', '·', '·', 'bend', 'gu-', 'te']);
    expect(events(s)).toHaveLength(6);
    expect(s.message).toMatch(/2 Silben entfernt/);
    expect(validateScore(s.score)).toEqual([]);
  });

  it('says so when there is nothing to take away', () => {
    const s = clearSyllables(clearSyllables(select(sung(), 0)));
    expect(s.message).toMatch(/keine Silbe/);
  });

  it('copies a run of syllables and puts it on other notes, one per note', () => {
    const s = sung();
    const clip = copySyllables(rangeTo(select(s, 0), VOICE, events(s)[1]!.id))!;
    expect(clip).toEqual(['Gu-', 'ten']);
    const pasted = pasteSyllables(select(s, 3), clip);
    expect(lyrics(pasted)).toEqual(['Gu-', 'ten', 'A-', 'Gu-', 'ten', 'te']);
    expect(pasted.message).toMatch(/2 Silben eingefügt/);
  });

  it('a paste that reaches past the last note stops there', () => {
    const s = sung();
    const pasted = pasteSyllables(select(s, 5), ['x', 'y', 'z']);
    expect(lyrics(pasted)).toEqual(['Gu-', 'ten', 'A-', 'bend', 'gu-', 'x']);
  });

  it('a note without syllable in the copied run takes the syllable away where it lands', () => {
    const s = sung();
    expect(lyrics(pasteSyllables(select(s, 0), [null, 'a']))).toEqual(['·', 'a', 'A-', 'bend', 'gu-', 'te']);
  });

  it('moves a syllable onto another note; the old note is left without', () => {
    const s = sung();
    const moved = moveSyllable(s, VOICE, events(s)[1]!.id, events(s)[2]!.id);
    expect(lyrics(moved)).toEqual(['Gu-', '·', 'ten', 'bend', 'gu-', 'te']);
    expect(moved.selection).toMatchObject({ kind: 'event', eventId: events(s)[2]!.id });
    expect(validateScore(moved.score)).toEqual([]);
  });

  it('moving a note without syllable, or onto itself, changes nothing', () => {
    const s = clearSyllables(select(sung(), 2));
    expect(moveSyllable(s, VOICE, events(s)[2]!.id, events(s)[3]!.id)).toBe(s);
    expect(moveSyllable(s, VOICE, events(s)[1]!.id, events(s)[1]!.id)).toBe(s);
  });
});
