/**
 * The circle of fifths as a key chooser: a glass pane under the key display of the transport bar.
 * Outside the major keys, inside their minor keys (they share the signature); a click picks the key.
 */
import { keyName as germanKeyName } from '../core/templates';

const MAJOR: Record<number, string> = { 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'H', 6: 'Fis', 7: 'Cis', [-1]: 'F', [-2]: 'B', [-3]: 'Es', [-4]: 'As', [-5]: 'Des', [-6]: 'Ges', [-7]: 'Ces' };
const MINOR: Record<number, string> = { 0: 'a', 1: 'e', 2: 'h', 3: 'fis', 4: 'cis', 5: 'gis', 6: 'dis', 7: 'ais', [-1]: 'd', [-2]: 'g', [-3]: 'c', [-4]: 'f', [-5]: 'b', [-6]: 'es', [-7]: 'as' };

/** The twelve places on the circle, clockwise from the top; the bottom one holds two enharmonic keys. */
const PLACES: readonly (readonly number[])[] = [[0], [1], [2], [3], [4], [5], [6, -6], [-5], [-4], [-3], [-2], [-1]];

const SIZE = 300;
const CENTER = SIZE / 2;

const signs = (fifths: number): string => (fifths === 0 ? '' : `${Math.abs(fifths)}${fifths > 0 ? '♯' : '♭'}`);

export interface KeyPickerHost {
  /** The key was chosen. */
  pick(fifths: number): void;
}

/** Opens the chooser below `anchor`; returns a function that closes it. Esc and a click outside close it too. */
export function openKeyPicker(anchor: HTMLElement, current: number, host: KeyPickerHost): () => void {
  document.querySelector('.keypicker')?.remove();
  const pane = document.createElement('div');
  pane.className = 'keypicker';
  pane.setAttribute('role', 'dialog');
  pane.setAttribute('aria-label', 'Tonart wählen (Quintenzirkel)');
  pane.style.width = `${SIZE}px`;
  pane.style.height = `${SIZE + 36}px`;

  const place = (fifths: number, slot: number, parts: number, radius: number, label: string, ring: 'major' | 'minor'): HTMLButtonElement => {
    const angle = (slot / 12) * 2 * Math.PI - Math.PI / 2;
    // The bottom place holds two keys side by side.
    const shift = parts === 2 ? (fifths > 0 ? -22 : 22) : 0;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `keypicker__key keypicker__key--${ring}${fifths === current ? ' is-current' : ''}`;
    b.style.left = `${CENTER + Math.cos(angle) * radius + shift}px`;
    b.style.top = `${CENTER + Math.sin(angle) * radius}px`;
    b.innerHTML = `<span>${label}</span><small>${signs(fifths)}</small>`;
    b.title = germanKeyName(fifths);
    b.setAttribute('aria-label', germanKeyName(fifths));
    b.setAttribute('aria-pressed', String(fifths === current));
    b.addEventListener('click', () => {
      close();
      host.pick(fifths);
    });
    return b;
  };
  PLACES.forEach((keys, slot) => {
    for (const fifths of keys) pane.append(place(fifths, slot, keys.length, 118, MAJOR[fifths]!, 'major'));
    pane.append(place(keys[0]!, slot, 1, 66, MINOR[keys[0]!]!, 'minor'));
  });
  // The rare keys with seven signs sit below the circle.
  const rare = document.createElement('div');
  rare.className = 'keypicker__rare';
  for (const fifths of [-7, 7]) rare.append(place(fifths, 0, 1, 0, MAJOR[fifths]!, 'major'));
  for (const b of rare.querySelectorAll<HTMLElement>('button')) {
    b.style.left = '';
    b.style.top = '';
  }
  pane.append(rare);
  const hint = document.createElement('div');
  hint.className = 'keypicker__hint';
  hint.textContent = 'außen Dur, innen Moll';
  pane.append(hint);

  const box = anchor.getBoundingClientRect();
  pane.style.left = `${Math.max(8, Math.min(window.innerWidth - SIZE - 8, box.left + box.width / 2 - SIZE / 2))}px`;
  pane.style.top = `${box.bottom + 8}px`;
  document.body.append(pane);

  const onDown = (e: PointerEvent) => {
    if (!pane.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  function close(): void {
    pane.remove();
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('keydown', onKey, true);
  }
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('keydown', onKey, true);
  pane.querySelector<HTMLElement>('.is-current')?.focus({ preventScroll: true });
  return close;
}
