/**
 * The circle of fifths as a key chooser: a glass pane under the key display of the transport bar.
 * Two rings whose edges touch: outside the major keys, inside their minor keys (they share the signature).
 */
import { keyName as germanKeyName } from '../core/templates';

const MAJOR: Record<number, string> = { 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'H', 6: 'Fis', 7: 'Cis', [-1]: 'F', [-2]: 'B', [-3]: 'Es', [-4]: 'As', [-5]: 'Des', [-6]: 'Ges', [-7]: 'Ces' };
const MINOR: Record<number, string> = { 0: 'a', 1: 'e', 2: 'h', 3: 'fis', 4: 'cis', 5: 'gis', 6: 'dis', 7: 'ais', [-1]: 'd', [-2]: 'g', [-3]: 'c', [-4]: 'f', [-5]: 'b', [-6]: 'es', [-7]: 'as' };

/** The twelve places on the circle, clockwise from the top; the bottom one holds two enharmonic keys. */
const PLACES: readonly (readonly number[])[] = [[0], [1], [2], [3], [4], [5], [6, -6], [-5], [-4], [-3], [-2], [-1]];

const SIZE = 300;
const CENTER = SIZE / 2;
/** Outer edge, the line where the two rings touch, inner edge (the hub in the middle). */
const R_OUT = 142;
const R_MID = 98;
const R_IN = 54;
const NS = 'http://www.w3.org/2000/svg';

const signs = (fifths: number): string => (fifths === 0 ? '' : `${Math.abs(fifths)}${fifths > 0 ? '♯' : '♭'}`);
const point = (angle: number, radius: number): string => `${(CENTER + Math.cos(angle) * radius).toFixed(2)} ${(CENTER + Math.sin(angle) * radius).toFixed(2)}`;

/** The outline of a ring segment between two angles (radians) and two radii. */
export function segmentPath(a0: number, a1: number, r0: number, r1: number): string {
  return `M ${point(a0, r1)} A ${r1} ${r1} 0 0 1 ${point(a1, r1)} L ${point(a1, r0)} A ${r0} ${r0} 0 0 0 ${point(a0, r0)} Z`;
}

export interface KeyPickerHost {
  /** The key was chosen. */
  pick(fifths: number): void;
  /** "Transponieren …": the transpose dialog (the music moves by an interval, not just the key signature). */
  transpose(): void;
}

const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, cls?: string): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (cls) e.setAttribute('class', cls);
  return e;
};

/** Opens the chooser below `anchor`; returns a function that closes it. Esc and a click outside close it too. */
export function openKeyPicker(anchor: HTMLElement, current: number, host: KeyPickerHost): () => void {
  document.querySelector('.keypicker')?.remove();
  const pane = document.createElement('div');
  pane.className = 'keypicker';
  pane.setAttribute('role', 'dialog');
  pane.setAttribute('aria-label', 'Tonart wählen (Quintenzirkel)');
  pane.style.width = `${SIZE}px`;

  const svg = svgEl('svg', { width: SIZE, height: SIZE, viewBox: `0 0 ${SIZE} ${SIZE}` }, 'keypicker__svg');
  const segment = (fifths: number, a0: number, a1: number, r0: number, r1: number, label: string, ring: 'major' | 'minor'): SVGGElement => {
    const g = svgEl('g', { tabindex: 0, role: 'button', 'aria-label': germanKeyName(fifths), 'aria-pressed': String(fifths === current) }, `keypicker__seg keypicker__seg--${ring}${fifths === current ? ' is-current' : ''}`);
    g.dataset.fifths = String(fifths);
    const title = svgEl('title', {});
    title.textContent = germanKeyName(fifths);
    g.append(title, svgEl('path', { d: segmentPath(a0, a1, r0, r1) }));
    const mid = (a0 + a1) / 2;
    const [x, y] = point(mid, (r0 + r1) / 2).split(' ');
    const name = svgEl('text', { x: x!, y: Number(y) - 1, 'text-anchor': 'middle' }, 'keypicker__name');
    name.textContent = label;
    const count = svgEl('text', { x: x!, y: Number(y) + 11, 'text-anchor': 'middle' }, 'keypicker__count');
    count.textContent = signs(fifths);
    g.append(name, count);
    const choose = () => {
      close();
      host.pick(fifths);
    };
    g.addEventListener('click', choose);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        choose();
      }
    });
    return g;
  };
  PLACES.forEach((keys, slot) => {
    const centre = (slot / 12) * 2 * Math.PI - Math.PI / 2;
    const half = Math.PI / 12;
    keys.forEach((fifths, i) => {
      // Two keys share a place: the sharp one takes the first half, the flat one the second.
      const a0 = keys.length === 1 ? centre - half : centre - half + i * half;
      const a1 = keys.length === 1 ? centre + half : a0 + half;
      svg.append(segment(fifths, a0, a1, R_MID, R_OUT, MAJOR[fifths]!, 'major'));
      svg.append(segment(fifths, a0, a1, R_IN, R_MID, MINOR[fifths]!, 'minor'));
    });
  });
  // The hub shows the key that is set now.
  svg.append(svgEl('circle', { cx: CENTER, cy: CENTER, r: R_IN }, 'keypicker__hub'));
  const hubName = svgEl('text', { x: CENTER, y: CENTER - 2, 'text-anchor': 'middle' }, 'keypicker__hubname');
  hubName.textContent = MAJOR[current] ?? 'C';
  const hubCount = svgEl('text', { x: CENTER, y: CENTER + 16, 'text-anchor': 'middle' }, 'keypicker__count');
  hubCount.textContent = signs(current) || 'keine Vorzeichen';
  svg.append(hubName, hubCount);
  pane.append(svg);

  // The rare keys with seven signs sit below the circle.
  const foot = document.createElement('div');
  foot.className = 'keypicker__foot';
  const hint = document.createElement('span');
  hint.textContent = 'außen Dur, innen Moll';
  foot.append(hint);
  for (const fifths of [-7, 7]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `keypicker__rare${fifths === current ? ' is-current' : ''}`;
    b.textContent = `${MAJOR[fifths]} ${signs(fifths)}`;
    b.title = germanKeyName(fifths);
    b.setAttribute('aria-label', germanKeyName(fifths));
    b.addEventListener('click', () => {
      close();
      host.pick(fifths);
    });
    foot.append(b);
  }
  const transpose = document.createElement('button');
  transpose.type = 'button';
  transpose.className = 'keypicker__transpose';
  transpose.textContent = 'Transponieren …';
  transpose.title = 'Die Noten um ein Intervall verschieben, chromatisch oder diatonisch (Strg+Umschalt+T)';
  transpose.addEventListener('click', () => {
    close();
    host.transpose();
  });
  pane.append(foot, transpose);

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
  pane.querySelector<SVGElement>('.keypicker__seg--major.is-current')?.focus({ preventScroll: true });
  return close;
}
