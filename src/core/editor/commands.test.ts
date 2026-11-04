import { describe, expect, it } from 'vitest';
import { add, eq, frac, fracToString, lt, ZERO } from '../time';
import { pitchToString } from '../pitch';
import { eventEnd, validateScore, type Score } from '../model';
import { emptyScore } from '../templates';
import { parseLine } from '../line';
import { type CommandId, runCommand, spellPitchClass } from './commands';
import { applyRollEdit } from './rollEdits';
import { createEditorState, getVoice, type EditorState, type VoiceRef } from './state';
import { History } from './history';

const VOICE: VoiceRef = { partId: 'voice', voiceId: 'voice-v1' };
const STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 } as const;

/** Voice content as text, gaps written as rests: "C5:1/4 r:1/4 …". */
function dump(score: Score, ref: VoiceRef = VOICE): string {
  const out: string[] = [];
  let cursor = ZERO;
  for (const e of getVoice(score, ref).voice.events) {
    if (lt(cursor, e.onset)) out.push(`r:${fracToString(add(e.onset, { n: -cursor.n, d: cursor.d }))}`);
    const p = e.tones.map((t) => pitchToString(t.pitch)).join(',');
    out.push(`${e.tones.length > 1 ? `[${p}]` : p}:${fracToString(e.duration)}`);
    cursor = eventEnd(e);
  }
  return out.join(' ');
}

/** Plays a little script: "5 C D E" = quarter, then C D E. Tokens map to commands. */
function play(s: EditorState, script: string): EditorState {
  for (const token of script.split(/\s+/).filter(Boolean)) {
    const [id, arg]: [CommandId, number] = /^[1-7]$/.test(token)
      ? ['input.duration', Number(token)]
      : /^alt[1-7]$/.test(token)
        ? ['edit.duration', Number(token.slice(3))]
        : /^[A-G]$/.test(token)
          ? ['input.note', STEP[token as keyof typeof STEP]]
          : /^\+[A-G]$/.test(token)
            ? ['input.chordNote', STEP[token[1] as keyof typeof STEP]]
            : (({
                enter: ['input.toggle', 0],
                esc: ['edit.escape', 0],
                '.': ['input.dot', 0],
                '0': ['input.rest', 0],
                R: ['edit.toRest', 0],
                T: ['edit.tie', 0],
                bs: ['edit.backspace', 0],
                up: ['edit.step', 1],
                down: ['edit.step', -1],
                octup: ['edit.octave', 1],
                octdown: ['edit.octave', -1],
                plus: ['edit.alter', 1],
                minus: ['edit.alter', -1],
                left: ['nav.horizontal', -1],
                right: ['nav.horizontal', 1],
                staffdown: ['nav.staff', 1],
                ins: ['input.insertMode', 0],
              }) as Record<string, [CommandId, number]>)[token] ?? fail(token);
    s = runCommand(s, id, arg);
    expect(validateScore(s.score), `nach "${token}"`).toEqual([]);
  }
  return s;
}

function fail(token: string): never {
  throw new Error(`Unbekanntes Token im Testskript: ${token}`);
}

const fresh = (): EditorState => createEditorState(emptyScore());

describe('Finale-style note entry', () => {
  it('types a melody: numbers choose the value, letters enter notes', () => {
    const s = play(fresh(), '5 C D E F 6 G A');
    expect(dump(s.score)).toBe('C5:1/4 D5:1/4 E5:1/4 F5:1/4 G5:1/2 A5:1/2');
  });

  it('picks the octave closest to the previous note', () => {
    // From B4 (middle line) C goes up to C5; then B is closest below C5.
    const s = play(fresh(), '5 C B A G');
    expect(dump(s.score)).toBe('C5:1/4 B4:1/4 A4:1/4 G4:1/4');
  });

  it('follows the key signature', () => {
    const base = fresh();
    const s0 = { ...base, score: { ...base.score, keys: [{ at: ZERO, fifths: 2 }] } }; // D major
    // From F#4 the closest C is a fourth down: C#4.
    expect(dump(play(s0, '5 F C').score)).toBe('F#4:1/4 C#4:1/4');
  });

  it('measures closeness in staff steps, so a tritone is never a coin toss', () => {
    // B4 → F: F5 is 4 steps up, F4 is 3 steps down.
    expect(dump(play(fresh(), '5 F').score)).toBe('F4:1/4');
  });

  it('rests with 0 leave a gap', () => {
    expect(dump(play(fresh(), '5 C 0 E').score)).toBe('C5:1/4 r:1/4 E5:1/4');
  });

  it('dot before a note applies to the next note in input mode', () => {
    expect(dump(play(fresh(), '5 . C 4 D').score)).toBe('C5:3/8 D5:1/8');
  });

  it('Alt+number changes the note just entered', () => {
    expect(dump(play(fresh(), '5 C alt6 D').score)).toBe('C5:1/2 D5:1/4');
  });

  it('arrows and +/- change the note just entered', () => {
    expect(dump(play(fresh(), '5 C up up plus').score)).toBe('E#5:1/4');
    expect(dump(play(fresh(), '5 C minus octdown').score)).toBe('Cb4:1/4');
  });

  it('T before the next note ties: two notes joined by an explicit tie, not one longer note', () => {
    const s = play(fresh(), '5 C T C D');
    expect(dump(s.score)).toBe('C5:1/4 C5:1/4 D5:1/4');
    expect(s.score.links).toEqual([{ id: 'link-1', kind: 'tie', from: 'voice-v1-n1-t1', to: 'voice-v1-n2-t1' }]);
    expect(s.message).toBeNull();
  });

  it('T ties two existing neighbours of the same pitch and a second T takes the tie away again', () => {
    let s = play(fresh(), '5 C C esc');
    s = play({ ...s, selection: { kind: 'event', ...VOICE, eventId: 'voice-v1-n1' } }, 'T');
    expect(dump(s.score)).toBe('C5:1/4 C5:1/4');
    expect(s.score.links).toHaveLength(1);
    s = play(s, 'T');
    expect(s.score.links).toBeUndefined();
    expect(s.message).toMatch(/gelöst/);
  });

  it('T refuses different pitches with a message', () => {
    let s = play(fresh(), '5 C D esc');
    s = play({ ...s, selection: { kind: 'event', ...VOICE, eventId: 'voice-v1-n1' } }, 'T');
    expect(s.message).toMatch(/andere Tonhöhe/);
  });

  it('Shift+letter adds a chord note above', () => {
    expect(dump(play(fresh(), '5 C +E +G').score)).toBe('[C5,E5,G5]:1/4');
  });

  it('Backspace removes the last note and steps back', () => {
    const s = play(fresh(), '5 C D E bs bs F');
    expect(dump(s.score)).toBe('C5:1/4 F5:1/4');
  });

  it('R turns the selected note into a rest without moving the rest of the music', () => {
    const s = play(fresh(), '5 C D E left left R');
    expect(dump(s.score)).toBe('C5:1/4 r:1/4 E5:1/4');
  });

  it('overwrites by default …', () => {
    const s = play(fresh(), '5 C D E F left left left 6 G');
    expect(dump(s.score)).toBe('C5:1/4 G4:1/2 F5:1/4');
  });

  it('… and shifts in insert mode', () => {
    const s = play(fresh(), '5 C D E left left ins G');
    expect(dump(s.score)).toBe('C5:1/4 G4:1/4 D5:1/4 E5:1/4');
  });

  it('notes may run over the barline – the notation layer ties them', () => {
    const s = play(fresh(), '6 C D . E');
    expect(dump(s.score)).toBe('C5:1/2 D5:1/2 E5:3/4');
  });

  it('switches staves keeping the time position', () => {
    const s = play(fresh(), '5 C D staffdown 6 G');
    expect(s.caret?.voiceId).toBe('guitar-v1');
    expect(dump(s.score, { partId: 'guitar', voiceId: 'guitar-v1' })).toBe('r:1/2 G3:1/2');
  });
});

describe('caret and selection', () => {
  it('Enter starts input after the last note, Esc leaves it', () => {
    const base = fresh();
    const score: Score = {
      ...base.score,
      parts: base.score.parts.map((p) =>
        p.id === 'voice' ? { ...p, voices: [{ ...p.voices[0]!, events: parseLine('C5:1/4 D5:1/4', 'x') }] } : p,
      ),
    };
    let s = play({ ...base, score }, 'enter');
    expect(s.caret && eq(s.caret.time, frac(1, 2))).toBe(true);
    s = play(s, 'esc');
    expect(s.caret).toBeNull();
  });

  it('right arrow stops at notes and barlines and selects the note under the caret', () => {
    let s = play(fresh(), '5 C D');
    s = play(s, 'left left');
    expect(s.caret && eq(s.caret.time, ZERO)).toBe(true);
    expect(s.selection).toMatchObject({ kind: 'event', eventId: 'voice-v1-n1' });
    s = play(s, 'right right right');
    expect(s.caret && eq(s.caret.time, frac(1))).toBe(true); // end of bar 1 = start of bar 2
    s = play(s, 'right');
    expect(s.caret && eq(s.caret.time, frac(1))).toBe(true); // does not run away into empty bars
  });
});

describe('tone identity', () => {
  const toneIds = (s: EditorState) => getVoice(s.score, VOICE).voice.events.map((e) => e.tones.map((t) => t.id));

  it('every entered note and chord tone gets its own id', () => {
    const s = play(fresh(), '5 C +E +G D');
    expect(toneIds(s)).toEqual([['voice-v1-n1-t1', 'voice-v1-n1-t2', 'voice-v1-n1-t3'], ['voice-v1-n2-t1']]);
    const all = s.score.parts.flatMap((p) => p.voices.flatMap((v) => v.events.flatMap((e) => e.tones.map((t) => t.id))));
    expect(new Set(all).size).toBe(all.length);
  });

  it('changing pitch, octave, spelling or length never changes the ids', () => {
    const before = toneIds(play(fresh(), '5 C +E +G'));
    for (const edit of ['up', 'down', 'octup', 'octdown', 'plus', 'minus', 'alt6', 'alt3']) {
      const s = play(fresh(), `5 C +E +G ${edit}`);
      expect(toneIds(s), edit).toEqual(before);
    }
  });

  it('a chord tone added later gets a new id and the old ones stay', () => {
    const s = play(fresh(), '5 C +E right left +A');
    const [ids] = toneIds(s);
    expect(ids).toContain('voice-v1-n1-t1');
    expect(ids).toContain('voice-v1-n1-t2');
    expect(new Set(ids).size).toBe(3);
  });

  it('tying keeps every tone id (the tie names the tones)', () => {
    const s = play(fresh(), '5 C C left left T');
    expect(toneIds(s)).toEqual([['voice-v1-n1-t1'], ['voice-v1-n2-t1']]);
    expect(s.score.links![0]).toMatchObject({ from: 'voice-v1-n1-t1', to: 'voice-v1-n2-t1' });
  });

  it('undo restores the same tone ids', () => {
    const h = new History(fresh());
    h.apply(play(h.state, '5 C +E'));
    const ids = toneIds(h.state);
    h.apply(play(h.state, 'octup'));
    h.undo();
    expect(toneIds(h.state)).toEqual(ids);
  });
});

describe('History', () => {
  it('undoes and redoes score changes, not caret moves', () => {
    const h = new History(fresh());
    h.apply(play(h.state, '5 C'));
    h.apply(play(h.state, 'D'));
    h.apply(play(h.state, 'left'));
    expect(dump(h.state.score)).toBe('C5:1/4 D5:1/4');
    h.undo();
    expect(dump(h.state.score)).toBe('C5:1/4');
    h.redo();
    expect(dump(h.state.score)).toBe('C5:1/4 D5:1/4');
    h.undo();
    h.undo();
    h.undo();
    expect(h.state.message).toMatch(/Nichts/);
  });
});

describe('Logic-style input (piano-key letters, real semitones)', () => {
  const withKey = (fifths: number): EditorState => {
    const b = fresh();
    return { ...b, score: { ...b.score, keys: [{ at: ZERO, fifths }] } };
  };
  const pcs = (s: EditorState, ...list: number[]) =>
    list.reduce((st, pc) => runCommand(st, 'input.pitchClass', pc), runCommand(s, 'input.duration', 5));

  it('spells black keys after the key signature', () => {
    expect(spellPitchClass(1, 0)).toEqual({ step: 'C', alter: 1 }); // C#
    expect(spellPitchClass(10, 0)).toEqual({ step: 'B', alter: -1 }); // Bb in C major
    expect(spellPitchClass(1, -1)).toEqual({ step: 'D', alter: -1 }); // Db in F major
    expect(spellPitchClass(10, 2)).toEqual({ step: 'A', alter: 1 }); // A# in D major
    expect(spellPitchClass(5, 1)).toEqual({ step: 'F', alter: 0 }); // F natural stays F in G major
  });

  it('enters notes by piano key', () => {
    expect(dump(pcs(withKey(-1), 0, 1, 5).score)).toBe('C5:1/4 Db5:1/4 F5:1/4');
  });

  it('transposes by real semitones (E + 1 = F, not E#)', () => {
    let s = play(fresh(), '5 E');
    s = runCommand(s, 'edit.semitone', 1);
    expect(dump(s.score)).toBe('F5:1/4');
    s = runCommand(s, 'edit.semitone', 1);
    expect(dump(s.score)).toBe('F#5:1/4');
    s = runCommand(runCommand(s, 'edit.semitone', -7), 'edit.semitone', 0);
    expect(dump(s.score)).toBe('B4:1/4');
  });
});

describe('detaching a chord tone into its own voice', () => {
  const chord = () => play(fresh(), '5 C +E +G');
  const select = (s: EditorState, toneIndex: number): EditorState => {
    const ev = getVoice(s.score, VOICE).voice.events[0]!;
    return { ...s, selection: { kind: 'event', ...VOICE, eventId: ev.id, toneId: ev.tones[toneIndex]!.id } };
  };
  const voices = (s: EditorState) => s.score.parts.find((p) => p.id === 'voice')!.voices;

  it('moves exactly that tone to a new voice of the same staff, keeping its id, onset and length', () => {
    const s = select(chord(), 1);
    const before = getVoice(s.score, VOICE).voice.events[0]!;
    const r = runCommand(s, 'edit.detach');
    expect(voices(r).map((v) => v.id)).toEqual(['voice-v1', 'voice-v2']);
    expect(voices(r)[1]!.staff).toBe(voices(r)[0]!.staff);
    const chordLeft = voices(r)[0]!.events[0]!;
    const lone = voices(r)[1]!.events[0]!;
    expect(chordLeft.tones.map((t) => t.id)).toEqual([before.tones[0]!.id, before.tones[2]!.id]);
    expect(lone.tones.map((t) => t.id)).toEqual([before.tones[1]!.id]);
    expect(eq(lone.onset, before.onset) && eq(lone.duration, before.duration)).toBe(true);
    expect(r.selection).toMatchObject({ voiceId: 'voice-v2', eventId: lone.id, toneId: before.tones[1]!.id });
    expect(validateScore(r.score)).toEqual([]);
  });

  it('undo brings the chord back as it was', () => {
    const h = new History(select(chord(), 1));
    const original = h.state.score;
    h.apply(runCommand(h.state, 'edit.detach'));
    expect(voices(h.state)).toHaveLength(2);
    h.undo();
    expect(h.state.score).toBe(original);
  });

  it('a second detach makes a third voice', () => {
    let s = runCommand(select(chord(), 1), 'edit.detach');
    s = runCommand(select({ ...s, selection: { kind: 'event', ...VOICE, eventId: getVoice(s.score, VOICE).voice.events[0]!.id, toneId: getVoice(s.score, VOICE).voice.events[0]!.tones[1]!.id } }, 0), 'edit.detach');
    expect(voices(s).map((v) => v.id)).toEqual(['voice-v1', 'voice-v3', 'voice-v2']);
  });

  it('refuses without a selected tone or for a single note', () => {
    expect(runCommand(chord(), 'edit.detach').message).toMatch(/einzelnen Akkordton/);
    const single = play(fresh(), '5 C');
    const one = getVoice(single.score, VOICE).voice.events[0]!;
    const r = runCommand({ ...single, selection: { kind: 'event', ...VOICE, eventId: one.id, toneId: one.tones[0]!.id } }, 'edit.detach');
    expect(r.message).toMatch(/schon allein/);
    expect(r.score).toBe(single.score);
  });

  it('afterwards the lone tone can be lengthened without touching the chord', () => {
    const r = runCommand(select(chord(), 2), 'edit.detach');
    const lone = voices(r)[1]!.events[0]!;
    const longer = applyRollEdit(r, { kind: 'change', voice: { partId: 'voice', voiceId: 'voice-v2' }, eventId: lone.id, duration: frac(1, 2) });
    expect(voices(longer)[1]!.events[0]!.duration).toEqual(frac(1, 2));
    expect(voices(longer)[0]!.events[0]!.duration).toEqual(frac(1, 4));
  });
});
