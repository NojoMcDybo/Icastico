/**
 * The "Transponieren" dialog: a toggle between chromatic and diatonic, and a scroll wheel (like the iPhone timer)
 * with the intervals. Resolves with what to do, or null when cancelled.
 */
import { type Pitch, parsePitch } from '../core/pitch';
import { CHROMATIC_CHOICES, DIATONIC_CHOICES, type IntervalChoice, type TransposeMode, type TransposeSpec, transposeDiatonic, transposePitch, unisonIndex } from '../core/transpose';
import { Wheel } from './wheel';

export interface TransposeOptions {
  /** What will be moved, e.g. "Markierter Bereich (3 Noten)". */
  readonly scope: string;
  /** The whole piece moves: the key can move along. */
  readonly wholePiece: boolean;
}

const KEY = 'icastico.transpose';

/** German note name: H is B natural, B is B flat, As and Es lose the e. */
export function germanName(p: Pitch): string {
  if (p.step === 'B') return ({ [-2]: 'Heses', [-1]: 'B', 0: 'H', 1: 'His', 2: 'Hisis' } as Record<number, string>)[p.alter] ?? 'H';
  if (p.alter >= 0) return p.step + 'is'.repeat(p.alter);
  const short = p.step === 'E' || p.step === 'A'; // Es, As: the e is dropped
  return p.step + (p.alter === -1 ? (short ? 's' : 'es') : short ? 'ses' : 'eses');
}

const choicesOf = (mode: TransposeMode): readonly IntervalChoice[] => (mode === 'chromatic' ? CHROMATIC_CHOICES : DIATONIC_CHOICES);

function remembered(): { mode: TransposeMode; index: Record<TransposeMode, number> } {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { mode?: string; index?: Record<string, number> } | null;
    return {
      mode: saved?.mode === 'diatonic' ? 'diatonic' : 'chromatic',
      index: { chromatic: saved?.index?.chromatic ?? unisonIndex(CHROMATIC_CHOICES), diatonic: saved?.index?.diatonic ?? unisonIndex(DIATONIC_CHOICES) },
    };
  } catch {
    return { mode: 'chromatic', index: { chromatic: unisonIndex(CHROMATIC_CHOICES), diatonic: unisonIndex(DIATONIC_CHOICES) } };
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

export function transposeDialog(options: TransposeOptions): Promise<TransposeSpec | null> {
  return new Promise((resolve) => {
    const state = remembered();
    const overlay = el('div', { className: 'modal' });
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const box = el('div', { className: 'modal__box transpose' });
    overlay.append(box);

    const toggle = el('div', { className: 'transpose__toggle' });
    toggle.setAttribute('role', 'group');
    toggle.setAttribute('aria-label', 'Art des Transponierens');
    const modes: [TransposeMode, string, string][] = [
      ['chromatic', 'Chromatisch', 'Um genau dieses Intervall, die Töne werden dazu passend geschrieben (mit der Tonart)'],
      ['diatonic', 'Diatonisch', 'Um Stufen der Tonleiter, die Töne bleiben in der Tonart'],
    ];
    const buttons = new Map<TransposeMode, HTMLButtonElement>();
    for (const [mode, label, title] of modes) {
      const b = el('button', { type: 'button', textContent: label, title });
      b.addEventListener('click', () => chooseMode(mode));
      buttons.set(mode, b);
      toggle.append(b);
    }

    const example = el('p', { className: 'transpose__example' });
    const keyBox = el('input', { type: 'checkbox', id: 'transpose-key', checked: true });
    const keyRow = el('p', { className: 'transpose__key' }, keyBox, el('label', { htmlFor: 'transpose-key', textContent: ' Tonart mitändern' }));
    const ok = el('button', { type: 'button', className: 'is-primary', textContent: 'Transponieren' });
    const cancel = el('button', { type: 'button', textContent: 'Abbrechen' });

    let mode = state.mode;
    const wheel = new Wheel(choicesOf(mode).map((c) => c.label), state.index[mode], () => refresh(), 'Intervall');

    const current = (): IntervalChoice => choicesOf(mode)[wheel.index]!;
    function refresh(): void {
      const { interval } = current();
      const c = parsePitch('C4');
      const to = mode === 'chromatic' ? transposePitch(c, interval, 0) : transposeDiatonic(c, interval.steps, 0);
      example.textContent = interval.steps === 0 && interval.semitones === 0 ? 'Wähle ein Intervall – das Rad lässt sich drehen.' : `Beispiel: ${germanName(c)} → ${germanName(to)}`;
      ok.disabled = interval.steps === 0 && interval.semitones === 0;
      keyRow.hidden = !(options.wholePiece && mode === 'chromatic');
      for (const [m, b] of buttons) b.setAttribute('aria-pressed', String(m === mode));
      state.index[mode] = wheel.index;
    }
    function chooseMode(next: TransposeMode): void {
      if (next === mode) return;
      state.index[mode] = wheel.index;
      mode = next;
      wheel.setItems(choicesOf(mode).map((c) => c.label), state.index[mode]);
      refresh();
    }

    const close = (spec: TransposeSpec | null) => {
      window.removeEventListener('keydown', onKey, true);
      try {
        localStorage.setItem(KEY, JSON.stringify({ mode, index: state.index }));
      } catch {
        // not remembered
      }
      overlay.remove();
      resolve(spec);
    };
    const confirm = () => {
      if (ok.disabled) return;
      close({ mode, interval: current().interval, adjustKey: options.wholePiece && mode === 'chromatic' && keyBox.checked });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(null);
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        e.stopPropagation();
        confirm();
      }
    };
    ok.addEventListener('click', confirm);
    cancel.addEventListener('click', () => close(null));
    window.addEventListener('keydown', onKey, true);

    box.append(
      el('h2', { textContent: 'Transponieren' }),
      el('p', { className: 'transpose__scope', textContent: options.scope }),
      toggle,
      wheel.el,
      example,
      keyRow,
      el('div', { className: 'modal__buttons' }, cancel, ok),
    );
    document.body.append(overlay);
    refresh();
    wheel.focus();
  });
}
