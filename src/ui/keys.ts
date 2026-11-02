/**
 * Turns a keyboard event into a layout-independent combo string such as
 * "5", "Alt+5", "Shift+G", "Mod+Z", "Plus", "ArrowUp".
 *
 * - Mod = Ctrl on Windows/Linux, Cmd on macOS.
 * - Digits come from the physical key (row or numpad), so Alt/Option+5
 *   still reads as "5" on a Mac or a German keyboard.
 * - Letters come from the typed character (QWERTZ/QWERTY both work).
 * - + - . ignore Shift (on US keyboards "+" needs Shift, on German not).
 */
export interface KeyLike {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

const NAMED = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
  'Escape',
  'Delete',
  'Backspace',
  'Insert',
  'Tab',
  'Home',
  'End',
  'F1',
]);

function baseKey(e: KeyLike): { base: string; symbol: boolean } | null {
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  if (digit) return { base: digit[1]!, symbol: true };
  if (e.code === 'NumpadAdd' || e.key === '+') return { base: 'Plus', symbol: true };
  if (e.code === 'NumpadSubtract' || e.key === '-') return { base: 'Minus', symbol: true };
  if (e.code === 'NumpadDecimal' || e.key === '.') return { base: 'Period', symbol: true };
  if (e.key === '?') return { base: '?', symbol: true };
  if (e.code === 'NumpadEnter') return { base: 'Enter', symbol: false };
  if (/^[a-z]$/i.test(e.key) && !e.altKey) return { base: e.key.toUpperCase(), symbol: false };
  const letter = /^Key([A-Z])$/.exec(e.code);
  if (letter) return { base: letter[1]!, symbol: false };
  if (NAMED.has(e.key)) return { base: e.key, symbol: false };
  return null;
}

export function comboOf(e: KeyLike): string | null {
  const k = baseKey(e);
  if (!k) return null;
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push('Mod');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey && !k.symbol) mods.push('Shift');
  return [...mods, k.base].join('+');
}
