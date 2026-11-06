import { describe, expect, it } from 'vitest';
import { COMMANDS } from '../../core/editor/commands';
import { UI_COMMANDS } from '../keymaps/library';
import { StandInVoice } from '../../platform/voice';
import { MIN_CONFIDENCE, indexOf, matchVoice, normalize } from './matcher';
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
    expect(hears('ZWEI')).toMatchObject({ arg: 2 });
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

describe('dictated notes', () => {
  const one = (text: string, confidence = 0.95) => {
    const m = matchVoice(text, confidence);
    return m && `${m.command} ${m.arg}`;
  };

  it('note names are one command each: fis is F sharp, es is E flat, b is B flat, h is B', () => {
    expect(one('c')).toBe('input.note 0');
    expect(one('fis')).toBe('input.spelled 18');
    expect(one('es')).toBe('input.spelled 11');
    expect(one('b')).toBe('input.spelled 31');
    expect(one('h')).toBe('input.note 6');
    expect(one('as')).toBe('input.spelled 26');
  });

  it('a row of words in one breath is not understood – a split compound word must not run two commands', () => {
    expect(one('c d e')).toBeNull();
    expect(one('halbe bogen')).toBeNull(); // what "Haltebogen" sounded like to the recogniser
    expect(one('b null')).toBeNull(); // and "Bemol"
    expect(one('vier sechzehntel')).toBeNull();
  });

  it('letters the recogniser reports with about 0.5 are understood, everything else still needs 0.8', () => {
    expect(one('zeh', 0.5)).toBe('input.note 0');
    expect(one('geh', 0.5)).toBe('input.note 4');
    expect(one('fis', 0.53)).toBe('input.spelled 18');
    expect(one('zeh', 0.39)).toBeNull();
    expect(one('dis', 0.59)).toBeNull(); // heard "des" in the test; a wrong accidental is worse than none
    expect(one('des', 0.59)).toBeNull();
    expect(one('fünf', 0.5)).toBeNull();
    expect(one('des', 0.85)).toBe('input.spelled 6');
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

  it('runs one note per breath and names it', () => {
    const { log, source } = setup();
    source.hear('zeh', 0.5);
    expect(log).toEqual(['run input.note 0', 'say verstanden: zeh → C']);
  });

  it('runs nothing of a row of words', () => {
    const { log, source } = setup();
    source.hear('c Blumenkohl d', 0.9);
    source.hear('c d', 0.9);
    expect(log).toEqual(['say nicht verstanden: „c Blumenkohl d“', 'say nicht verstanden: „c d“']);
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
