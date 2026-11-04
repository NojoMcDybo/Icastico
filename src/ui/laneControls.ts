/**
 * The two little button groups in the header of a lane: what the staff shows
 * (notation / both / roll) and how big the lane is (small / normal / maximised).
 */
import type { LaneSize, StaffMode } from './lanes';

export interface LaneControls {
  readonly el: HTMLElement;
  /** Marks the buttons that match the current state (`mode` is null for the notation lane). */
  sync(mode: StaffMode | null, size: LaneSize): void;
}

const MODES: readonly { readonly id: StaffMode; readonly label: string; readonly title: string }[] = [
  { id: 'notation', label: 'Noten', title: 'Diese Zeile nur als Notenschrift' },
  { id: 'both', label: 'Beides', title: 'Diese Zeile als Notenschrift und als Piano-Roll' },
  { id: 'roll', label: 'Roll', title: 'Diese Zeile nur als Piano-Roll' },
];

const SIZES: readonly { readonly id: LaneSize; readonly label: string; readonly title: string }[] = [
  { id: 'small', label: 'Klein', title: 'Als schmale Leiste (Klick darauf öffnet sie wieder)' },
  { id: 'normal', label: 'Normal', title: 'Normale Größe' },
  { id: 'max', label: 'Voll', title: 'Maximieren (Esc kehrt zurück)' },
];

function group<T extends string>(
  label: string,
  items: readonly { readonly id: T; readonly label: string; readonly title: string }[],
  onPick: (id: T) => void,
): { el: HTMLElement; buttons: Map<T, HTMLButtonElement> } {
  const el = document.createElement('div');
  el.className = 'lane__group';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', label);
  const buttons = new Map<T, HTMLButtonElement>();
  for (const item of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lane__btn';
    b.textContent = item.label;
    b.title = item.title;
    b.addEventListener('click', () => onPick(item.id));
    buttons.set(item.id, b);
    el.append(b);
  }
  return { el, buttons };
}

export function laneControls(opts: {
  /** Show the notation/both/roll switch (a roll lane); the notation lane has only the sizes. */
  readonly staff: boolean;
  readonly onMode: (mode: StaffMode) => void;
  readonly onSize: (size: LaneSize) => void;
}): LaneControls {
  const el = document.createElement('div');
  el.className = 'lane__controls';
  const modes = opts.staff ? group('Zeilenart', MODES, opts.onMode) : null;
  const sizes = group('Größe', SIZES, opts.onSize);
  if (modes) el.append(modes.el);
  el.append(sizes.el);
  return {
    el,
    sync(mode, size) {
      for (const [id, b] of modes?.buttons ?? []) b.setAttribute('aria-pressed', String(id === mode));
      for (const [id, b] of sizes.buttons) b.setAttribute('aria-pressed', String(id === size));
    },
  };
}
