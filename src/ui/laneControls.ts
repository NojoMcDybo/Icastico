/**
 * The little button group in the header of a roll lane: what the staff shows
 * (notation / both / roll). The height of a lane is set by dragging its edge.
 */
import type { StaffMode } from './lanes';

export interface LaneControls {
  readonly el: HTMLElement;
  /** Marks the button that matches the current mode. */
  sync(mode: StaffMode): void;
}

const MODES: readonly { readonly id: StaffMode; readonly label: string; readonly title: string }[] = [
  { id: 'notation', label: 'Noten', title: 'Diese Zeile nur als Notenschrift' },
  { id: 'both', label: 'Beides', title: 'Diese Zeile als Notenschrift und als Piano-Roll' },
  { id: 'roll', label: 'Roll', title: 'Diese Zeile nur als Piano-Roll' },
];

export function laneControls(onMode: (mode: StaffMode) => void): LaneControls {
  const el = document.createElement('div');
  el.className = 'lane__controls';
  const group = document.createElement('div');
  group.className = 'lane__group';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Zeilenart');
  const buttons = new Map<StaffMode, HTMLButtonElement>();
  for (const item of MODES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lane__btn';
    b.textContent = item.label;
    b.title = item.title;
    b.addEventListener('click', () => onMode(item.id));
    buttons.set(item.id, b);
    group.append(b);
  }
  el.append(group);
  return {
    el,
    sync(mode) {
      for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(id === mode));
    },
  };
}
