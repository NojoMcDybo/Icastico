import { describe, expect, it } from 'vitest';
import { comboOf, type KeyLike } from './keys';
import { FINALE_KEYMAP, findBinding } from './keymaps/finale';
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

describe('Finale keymap', () => {
  it('only points at existing commands and has no duplicate keys', () => {
    const ui = new Set(['history.undo', 'history.redo', 'view.help', 'file.new', 'file.open', 'file.save', 'file.saveAs', 'score.settings', 'library.toggle']);
    const combos = new Set<string>();
    for (const b of FINALE_KEYMAP.bindings) {
      expect(b.command in COMMANDS || ui.has(b.command), b.command).toBe(true);
      expect(combos.has(b.combo), `doppelt: ${b.combo}`).toBe(false);
      combos.add(b.combo);
    }
  });

  it('maps the Finale essentials', () => {
    expect(findBinding(FINALE_KEYMAP, '5')).toMatchObject({ command: 'input.duration', arg: 5 });
    expect(findBinding(FINALE_KEYMAP, 'H')).toMatchObject({ command: 'input.note', arg: 6 });
    expect(findBinding(FINALE_KEYMAP, '0')).toMatchObject({ command: 'input.rest' });
    expect(findBinding(FINALE_KEYMAP, 'T')).toMatchObject({ command: 'edit.tie' });
  });
});
