import { describe, expect, it } from 'vitest';
import { COMMANDS } from '../../core/editor/commands';
import { UI_COMMANDS } from '../keymaps/library';
import { StandInVoice } from '../../platform/voice';
import { MAX_COMMANDS, MIN_CONFIDENCE, indexOf, matchVoice, matchVoiceSequence, normalize } from './matcher';
import { VoiceController, type VoiceHost } from './controller';
import { VOCABULARY_DE } from './vocabulary.de';

const hears = (text: string, confidence = 0.95) => matchVoice(text, confidence);

describe('vocabulary', () => {
  it('only names commands that exist', () => {
    for (const entry of VOCABULARY_DE) {
      expect(entry.command in COMMANDS || UI_COMMANDS.has(entry.command), entry.label).toBe(true);
    }
  });

  it('is unambiguous: no phrase belongs to two commands', () => {
    expect(() => indexOf(VOCABULARY_DE)).not.toThrow();
    const twice = [{ words: ['eins'], command: 'input.dot' as const, label: 'a' }, { words: ['Eins'], command: 'input.rest' as const, label: 'b' }];
    expect(() => indexOf(twice)).toThrow(/zwei Befehlen/);
  });
});

describe('matching what was heard', () => {
  it('every trigger word runs its command', () => {
    for (const entry of VOCABULARY_DE) {
      for (const word of entry.words) {
        expect(hears(word), word).toMatchObject({ command: entry.command, arg: entry.arg ?? 0, label: entry.label });
      }
    }
  });

  it('number words and digits are the same, so are the duration names', () => {
    expect(hears('fünf')).toMatchObject({ command: 'input.duration', arg: 5 });
    expect(hears('5')).toMatchObject({ command: 'input.duration', arg: 5 });
    expect(hears('Viertel')).toMatchObject({ command: 'input.duration', arg: 5 });
    expect(hears('0')).toMatchObject({ command: 'input.rest' });
  });

  it('ignores case, punctuation, spelled-out umlauts and extra spaces', () => {
    expect(normalize('  Zweiunddreißigstel. ')).toBe('zweiunddreissigstel');
    expect(hears('FÜNF!')).toMatchObject({ arg: 5 });
    expect(hears('fuenf')).toMatchObject({ arg: 5 });
    expect(hears('Zweiunddreissigstel')).toMatchObject({ arg: 2 });
    expect(hears(' Oktave   hoch ')).toMatchObject({ command: 'edit.octave', arg: 1 });
  });

  it('keeps look-alikes apart: Sechzehntel is never Achtel, "zurück" is not undo, "zur Pause" is not "Pause"', () => {
    expect(hears('Sechzehntel')).toMatchObject({ arg: 3 });
    expect(hears('Achtel')).toMatchObject({ arg: 4 });
    expect(hears('zurück')).toMatchObject({ command: 'nav.horizontal', arg: -1 });
    expect(hears('rückgängig')).toMatchObject({ command: 'history.undo' });
    expect(hears('zur Pause')).toMatchObject({ command: 'edit.toRest' });
    expect(hears('Pause')).toMatchObject({ command: 'input.rest' });
  });

  it('a word that is only part of a phrase or merely similar is not understood', () => {
    expect(hears('Oktave')).toBeNull();
    expect(hears('Sechzehn')).toBeNull();
    expect(hears('fünfte')).toBeNull();
    expect(hears('fünf Punkt')).toBeNull(); // several commands in one breath come later (v1.1)
    expect(hears('Blumenkohl')).toBeNull();
    expect(hears('')).toBeNull();
    expect(hears('8')).toBeNull();
  });

  it('does nothing when the recogniser is not sure', () => {
    expect(matchVoice('fünf', MIN_CONFIDENCE - 0.01)).toBeNull();
    expect(matchVoice('fünf', MIN_CONFIDENCE)).not.toBeNull();
    expect(matchVoice('fünf', Number.NaN)).toBeNull();
    expect(matchVoice('fünf', 0.5, VOCABULARY_DE, 0.4)).not.toBeNull();
  });
});

describe('several commands in one breath (dictation)', () => {
  const run = (text: string, confidence = 0.95) => matchVoiceSequence(text, confidence)?.map((m) => `${m.command} ${m.arg}`);

  it('a row of note names is one command each, in the order spoken', () => {
    expect(run('c d e')).toEqual(['input.note 0', 'input.note 1', 'input.note 2']);
    expect(run('fünf c fis')).toEqual(['input.duration 5', 'input.note 0', 'input.spelled 18']);
    expect(run('Oktave hoch')).toEqual(['edit.octave 1']); // a two-word command stays one command
    expect(run('c Oktave hoch d')).toEqual(['input.note 0', 'edit.octave 1', 'input.note 1']);
    expect(run('zur Pause')).toEqual(['edit.toRest 0']);
  });

  it('names notes with their accidental: fis is F sharp, es is E flat, b is B flat, h is B', () => {
    expect(run('fis es b h as')).toEqual(['input.spelled 18', 'input.spelled 11', 'input.spelled 31', 'input.note 6', 'input.spelled 26']);
  });

  it('one word that is not understood stops the whole sentence – nothing is run', () => {
    expect(run('c d Blumenkohl e')).toBeUndefined();
    expect(run('c d', 0.5)).toBeUndefined();
    expect(run('')).toBeUndefined();
    expect(run(Array(MAX_COMMANDS + 1).fill('c').join(' '))).toBeUndefined();
    expect(run(Array(MAX_COMMANDS).fill('c').join(' '))).toHaveLength(MAX_COMMANDS);
  });

  it('a single word still means the same as before', () => {
    expect(run('fünf')).toEqual(['input.duration 5']);
    expect(matchVoice('c d', 0.95)).toBeNull(); // the single-word matcher (voice test) stays strict
  });
});

describe('the voice controller', () => {
  function setup(ready = true) {
    const log: string[] = [];
    const host: VoiceHost = { run: (c, a) => log.push(`run ${c} ${a}`), say: (m) => log.push(`say ${m}`), ready: () => ready };
    const source = new StandInVoice();
    new VoiceController(host, source);
    return { log, source };
  }

  it('runs the command and says what it understood', () => {
    const { log, source } = setup();
    source.hear('fünf', 0.9);
    expect(log).toEqual(['run input.duration 5', 'say verstanden: fünf → Viertel']);
  });

  it('runs a dictated row of commands one after the other and names them all', () => {
    const { log, source } = setup();
    source.hear('fünf c fis', 0.9);
    expect(log).toEqual(['run input.duration 5', 'run input.note 0', 'run input.spelled 18', 'say verstanden: fünf c fis → Viertel, C, Fis']);
  });

  it('runs nothing of a row with an unknown word in it', () => {
    const { log, source } = setup();
    source.hear('c Blumenkohl d', 0.9);
    expect(log).toEqual(['say nicht verstanden: „c Blumenkohl d“']);
  });

  it('says "nicht verstanden" and runs nothing for unknown or unsure words', () => {
    const { log, source } = setup();
    source.hear('Blumenkohl', 0.99);
    source.hear('fünf', 0.3);
    expect(log).toEqual(['say nicht verstanden: „Blumenkohl“', 'say nicht verstanden: „fünf“']);
  });

  it('is silent while a dialog is open or there is no score', () => {
    const { log, source } = setup(false);
    source.hear('fünf', 0.9);
    expect(log).toEqual([]);
  });
});
