import { describe, expect, it } from 'vitest';
import { comboOf, numpadComboOf, type KeyLike } from './keys';
import {
  buildKeymap,
  displayCombo,
  findBinding,
  KEY_LIBRARY,
  keyPairs,
  MOUSE_COMMANDS,
  renderKeyDoc,
  UI_COMMANDS,
  paletteEntries,
  searchPalette,
} from './keymaps/library';
import { COMMANDS, newScoreState, runCommand, type CommandId } from '../core/editor/commands';
import { validateScore } from '../core/model';

const ev = (key: string, code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('comboOf', () => {
  it('reads digits from the physical key, row or numpad', () => {
    expect(comboOf(ev('5', 'Digit5'))).toBe('5');
    expect(comboOf(ev('5', 'Numpad5'))).toBe('5');
    // Mac German: Option+5 types "[" – still Alt+5
    expect(comboOf(ev('[', 'Digit5', { altKey: true }))).toBe('Alt+5');
  });

  it('reads letters from the typed character (QWERTZ safe)', () => {
    expect(comboOf(ev('g', 'KeyG'))).toBe('G');
    expect(comboOf(ev('G', 'KeyG', { shiftKey: true }))).toBe('Shift+G');
    expect(comboOf(ev('z', 'KeyY', { ctrlKey: true }))).toBe('Mod+Z'); // German Z key
    expect(comboOf(ev('z', 'KeyZ', { metaKey: true }))).toBe('Mod+Z'); // Mac Cmd
  });

  it('the key left of 1 is Backquote on every layout (chord mode)', () => {
    expect(comboOf(ev('^', 'Backquote'))).toBe('Backquote'); // German
    expect(comboOf(ev('`', 'Backquote'))).toBe('Backquote'); // US
    expect(comboOf(ev('~', 'Backquote', { shiftKey: true }))).toBe('Backquote');
  });

  it('treats + - . the same on German and US keyboards', () => {
    expect(comboOf(ev('+', 'BracketRight'))).toBe('Plus'); // German
    expect(comboOf(ev('+', 'Equal', { shiftKey: true }))).toBe('Plus'); // US
    expect(comboOf(ev('+', 'NumpadAdd'))).toBe('Plus');
    expect(comboOf(ev('-', 'Slash'))).toBe('Minus');
    expect(comboOf(ev(',', 'NumpadDecimal'))).toBe('Period'); // German numpad comma
  });

  it('names special keys and ignores unknown ones', () => {
    expect(comboOf(ev('ArrowUp', 'ArrowUp', { ctrlKey: true }))).toBe('Mod+ArrowUp');
    expect(comboOf(ev('Enter', 'NumpadEnter'))).toBe('Enter');
    expect(comboOf(ev(',', 'Comma', { ctrlKey: true }))).toBe('Mod+Comma');
    expect(comboOf(ev(',', 'NumpadDecimal'))).toBe('Period');
    expect(comboOf(ev('Shift', 'ShiftLeft', { shiftKey: true }))).toBeNull();
  });
});

describe('key-binding library', () => {
  const finale = buildKeymap('finale', KEY_LIBRARY, false);
  const logic = buildKeymap('logic', KEY_LIBRARY, false);
  const speedy = buildKeymap('speedy', KEY_LIBRARY, false);

  it.each([finale, logic, speedy])('$name: only existing commands, no key used twice', (km) => {
    const combos = new Set<string>();
    for (const b of km.bindings) {
      expect(b.command in COMMANDS || UI_COMMANDS.has(b.command), b.command).toBe(true);
      expect(combos.has(b.combo), `doppelt: ${b.combo}`).toBe(false);
      combos.add(b.combo);
    }
  });

  it('every listed command exists, ids are unique, keys have the expected form', () => {
    const ids = new Set<string>();
    const valid = /^((Mod|Alt|Shift)\+)*([A-Z0-9?]|Num[0-9]|F1|Plus|Minus|Period|Comma|Space|Backquote|Enter|Escape|Delete|Backspace|Insert|Arrow(Up|Down|Left|Right)|Ziehen|Klick|MIDI)$/;
    for (const g of KEY_LIBRARY.groups) {
      for (const fn of g.functions) {
        expect(ids.has(fn.id), `doppelte id ${fn.id}`).toBe(false);
        ids.add(fn.id);
        if (fn.command) {
          expect(fn.command in COMMANDS || UI_COMMANDS.has(fn.command) || MOUSE_COMMANDS.has(fn.command), fn.command).toBe(true);
        }
        for (const preset of [fn.finale, fn.logic, fn.speedy]) {
          for (const pair of preset ? keyPairs(preset.keys) : []) {
            for (const k of pair.keys) expect(k, `${fn.id}: ${k}`).toMatch(valid);
            if (pair.arg !== undefined) expect(fn.args?.[pair.arg], `${fn.id} arg ${pair.arg}`).toBeDefined();
          }
        }
      }
    }
  });

  it('every function of the program is in the list, and every function without a key says where to find it', () => {
    const listed = new Set(KEY_LIBRARY.groups.flatMap((g) => g.functions.flatMap((f) => (f.command ? [f.command] : []))));
    // Reached through the MIDI keyboard and the voice, listed as "MIDI-Keyboard" / "Sprachbefehle".
    const inside = new Set(['input.midi', 'input.midiAdd', 'input.spelled']);
    const missing = Object.keys(COMMANDS).filter((c) => !listed.has(c) && !inside.has(c));
    expect(missing, 'Befehle ohne Eintrag in library.json').toEqual([]);
    const missingUi = [...UI_COMMANDS].filter((c) => !listed.has(c));
    expect(missingUi, 'UI-Befehle ohne Eintrag in library.json').toEqual([]);
    for (const g of KEY_LIBRARY.groups) {
      for (const fn of g.functions) {
        if (!fn.command || MOUSE_COMMANDS.has(fn.command) && !fn.via) continue;
        const hasKeys = [fn.finale, fn.logic, fn.speedy].some((p) => p && keyPairs(p.keys).some((k) => k.keys.length > 0));
        expect(hasKeys || Boolean(fn.via), `${fn.id}: weder Taste noch "via"`).toBe(true);
      }
    }
  });

  it('functions that have only a button, a menu or the palette show up in the help of every layout', () => {
    for (const km of [finale, logic, speedy]) {
      const text = km.help.flatMap((g) => g.entries).map((e) => e.text);
      expect(text.some((t) => t.startsWith('Einen Takt zurück / vor')), km.name).toBe(true);
      expect(text.some((t) => t.startsWith('Klammer oder Akkolade')), km.name).toBe(true);
      expect(text.some((t) => t.startsWith('Zeichen am Takt der gewählten Note')), km.name).toBe(true);
      expect(text.some((t) => t.startsWith('Exportieren: PDF')), km.name).toBe(true);
    }
  });

  it.each([finale, logic, speedy])('$name: every key runs its command on a score without an error and leaves a valid score', (km) => {
    const fresh = () => {
      let s = newScoreState();
      for (const [c, arg] of [['input.duration', 5], ['input.note', 0], ['input.note', 2], ['input.note', 4], ['input.note', 5]] as const) s = runCommand(s, c, arg);
      return s;
    };
    const selected = () => {
      const s = runCommand(fresh(), 'edit.escape');
      const first = s.score.parts[0]!.voices[0]!.events[1]!;
      return { ...s, selection: { kind: 'event' as const, partId: s.score.parts[0]!.id, voiceId: s.score.parts[0]!.voices[0]!.id, eventId: first.id } };
    };
    for (const b of km.bindings) {
      if (!(b.command in COMMANDS)) continue; // the program's own functions (files, windows) are not run here
      for (const [name, state] of [['mit Eingabe-Cursor', fresh()], ['mit gewählter Note', selected()]] as const) {
        let next;
        expect(() => (next = runCommand(state, b.command as CommandId, b.arg)), `${b.combo} (${b.command}) ${name}`).not.toThrow();
        expect(validateScore(next!.score), `${b.combo} (${b.command}) ${name}`).toEqual([]);
      }
    }
  });

  it('Finale numpad layout: numpad = length, number row = interval, Enter = repeat', () => {
    expect(findBinding(speedy, 'Num5')).toMatchObject({ command: 'input.length', arg: 5 });
    expect(findBinding(speedy, '5')).toMatchObject({ command: 'input.interval', arg: 5 });
    expect(findBinding(speedy, 'Shift+3')).toMatchObject({ command: 'input.interval', arg: -3 });
    expect(findBinding(speedy, 'Enter')).toMatchObject({ command: 'input.repeat' });
    expect(findBinding(speedy, 'Num0')).toMatchObject({ command: 'input.rest' });
    expect(findBinding(speedy, 'Period')).toMatchObject({ command: 'input.dot' });
    // everything else keeps the Finale keys
    expect(findBinding(speedy, 'T')).toMatchObject({ command: 'edit.tie' });
    expect(findBinding(speedy, 'ArrowUp')).toMatchObject({ command: 'ghost.step', arg: 1 });
    expect(findBinding(speedy, 'Plus')).toMatchObject({ command: 'ghost.alter', arg: 1 });
    expect(findBinding(finale, 'Num5')).toBeUndefined();
  });

  it('numpad digits are told apart from the number row only for the keymaps that ask', () => {
    expect(numpadComboOf(ev('5', 'Numpad5'))).toBe('Num5');
    expect(numpadComboOf(ev('5', 'Digit5'))).toBeNull();
    expect(numpadComboOf(ev('5', 'Numpad5', { shiftKey: true }))).toBeNull();
    expect(comboOf(ev('@', 'Digit2', { shiftKey: true }))).toBe('Shift+2');
  });

  it('chord mode is on the key next to 1 in both layouts', () => {
    expect(findBinding(finale, 'Backquote')).toMatchObject({ command: 'input.chordMode' });
    expect(findBinding(logic, 'Backquote')).toMatchObject({ command: 'input.chordMode' });
  });

  it('Finale essentials', () => {
    expect(findBinding(finale, '5')).toMatchObject({ command: 'input.duration', arg: 5 });
    expect(findBinding(finale, 'H')).toMatchObject({ command: 'input.note', arg: 6 });
    expect(findBinding(finale, '0')).toMatchObject({ command: 'input.rest' });
    expect(findBinding(finale, 'T')).toMatchObject({ command: 'edit.tie' });
  });

  it('Logic essentials: piano-key letters, 1 = whole, Alt+arrows = semitone', () => {
    expect(findBinding(logic, '1')).toMatchObject({ command: 'input.duration', arg: 7 });
    expect(findBinding(logic, '3')).toMatchObject({ command: 'input.duration', arg: 5 });
    expect(findBinding(logic, 'A')).toMatchObject({ command: 'input.pitchClass', arg: 0 });
    expect(findBinding(logic, 'W')).toMatchObject({ command: 'input.pitchClass', arg: 1 });
    expect(findBinding(logic, 'Space')).toMatchObject({ command: 'input.rest' });
    expect(findBinding(logic, 'Alt+ArrowUp')).toMatchObject({ command: 'edit.semitone', arg: 1 });
    expect(findBinding(logic, 'Alt+Shift+ArrowDown')).toMatchObject({ command: 'edit.octave', arg: -1 });
    expect(findBinding(logic, 'ArrowDown')).toMatchObject({ command: 'nav.staff', arg: 1 });
  });

  it('shows keys the Windows and the Mac way', () => {
    expect(displayCombo('Mod+Shift+Z')).toBe('Strg+Umschalt+Z');
    expect(displayCombo('Mod+Shift+Z', true)).toBe('⌘⇧Z');
    expect(displayCombo('Alt+ArrowUp', true)).toBe('⌥↑');
  });

  it('help lists the implemented functions with readable keys', () => {
    const input = finale.help.find((g) => g.title === 'Eingabe')!;
    expect(input.entries.find((e) => e.text.startsWith('Notenwert der nächsten Note'))).toEqual({
      keys: '1 … 7',
      text: 'Notenwert der nächsten Note: 1 = 64tel · 2 = 32tel · 3 = 16tel · 4 = Achtel · 5 = Viertel · 6 = Halbe · 7 = Ganze',
    });
    expect(finale.help.flatMap((g) => g.entries).some((e) => e.text.startsWith('Triolen'))).toBe(true);
    expect(logic.help.flatMap((g) => g.entries).find((e) => e.text.startsWith('Triolen'))!.keys).toBe('9');
    const logicInput = logic.help.find((g) => g.title === 'Eingabe')!;
    expect(logicInput.entries.find((e) => e.text.startsWith('Notenwert'))!.text).toMatch(/^Notenwert der nächsten Note: 1 = Ganze · 2 = Halbe/);
  });

  it('docs/tastenbelegung.md is up to date (npm run keys:doc)', async () => {
    await expect(renderKeyDoc()).toMatchFileSnapshot('../../docs/tastenbelegung.md');
  });
});

describe('command palette (Ctrl+K)', () => {
  const entries = paletteEntries('finale', KEY_LIBRARY, false);

  it('lists every function that can be run, with its key in the chosen layout', () => {
    expect(entries.every((e) => e.command in COMMANDS || UI_COMMANDS.has(e.command))).toBe(true);
    const listed = new Set<string>(entries.map((e) => e.command));
    expect([...UI_COMMANDS].filter((c) => c !== 'view.palette' && !listed.has(c))).toEqual([]);
    expect(listed.has('view.palette')).toBe(false); // it does not offer itself
    expect(entries.find((e) => e.command === 'edit.transpose')?.keys).toBe('Strg+Umschalt+T');
  });

  it('a function with variants appears once per variant, each with its argument', () => {
    const lengths = entries.filter((e) => e.command === 'input.duration');
    expect(lengths.length).toBeGreaterThan(4);
    expect(new Set(lengths.map((e) => e.arg)).size).toBe(lengths.length);
    expect(lengths.some((e) => /Viertel/.test(e.title))).toBe(true);
  });

  it('finds by words in any order; a title that starts with the search comes first', () => {
    expect(searchPalette(entries, 'transp')[0]?.command).toBe('edit.transpose');
    expect(searchPalette(entries, 'strg+umschalt+t').some((e) => e.command === 'edit.transpose')).toBe(true);
    expect(searchPalette(entries, 'gibtesnicht')).toEqual([]);
    expect(searchPalette(entries, '  ')).toHaveLength(entries.length);
  });
});
