import { describe, expect, it } from 'vitest';
import { comboOf, type KeyLike } from './keys';
import {
  buildKeymap,
  displayCombo,
  findBinding,
  KEY_LIBRARY,
  keyPairs,
  MOUSE_COMMANDS,
  renderKeyDoc,
  UI_COMMANDS,
} from './keymaps/library';
import { COMMANDS } from '../core/editor/commands';

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

  it.each([finale, logic])('$name: only existing commands, no key used twice', (km) => {
    const combos = new Set<string>();
    for (const b of km.bindings) {
      expect(b.command in COMMANDS || UI_COMMANDS.has(b.command), b.command).toBe(true);
      expect(combos.has(b.combo), `doppelt: ${b.combo}`).toBe(false);
      combos.add(b.combo);
    }
  });

  it('every listed command exists, ids are unique, keys have the expected form', () => {
    const ids = new Set<string>();
    const valid = /^((Mod|Alt|Shift)\+)*([A-Z0-9?]|F1|Plus|Minus|Period|Comma|Space|Backquote|Enter|Escape|Delete|Backspace|Insert|Arrow(Up|Down|Left|Right)|Ziehen|Klick)$/;
    for (const g of KEY_LIBRARY.groups) {
      for (const fn of g.functions) {
        expect(ids.has(fn.id), `doppelte id ${fn.id}`).toBe(false);
        ids.add(fn.id);
        if (fn.command) {
          expect(fn.command in COMMANDS || UI_COMMANDS.has(fn.command) || MOUSE_COMMANDS.has(fn.command), fn.command).toBe(true);
        }
        for (const preset of [fn.finale, fn.logic]) {
          for (const pair of preset ? keyPairs(preset.keys) : []) {
            for (const k of pair.keys) expect(k, `${fn.id}: ${k}`).toMatch(valid);
            if (pair.arg !== undefined) expect(fn.args?.[pair.arg], `${fn.id} arg ${pair.arg}`).toBeDefined();
          }
        }
      }
    }
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
    expect(finale.help.flatMap((g) => g.entries).some((e) => e.text.startsWith('Triolen'))).toBe(false); // planned only
    const logicInput = logic.help.find((g) => g.title === 'Eingabe')!;
    expect(logicInput.entries.find((e) => e.text.startsWith('Notenwert'))!.text).toMatch(/^Notenwert der nächsten Note: 1 = Ganze · 2 = Halbe/);
  });

  it('docs/tastenbelegung.md is up to date (npm run keys:doc)', async () => {
    await expect(renderKeyDoc()).toMatchFileSnapshot('../../docs/tastenbelegung.md');
  });
});
