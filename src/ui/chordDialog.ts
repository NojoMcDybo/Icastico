/**
 * The window for a chord by name (ADR 0037): type "Cm7", see the notes in German names right away, pick an inversion,
 * choose whether the chord symbol is written above the notes.
 */
import { CHORD_QUALITIES, chordPitches, parseChordName } from '../core/chordNames';
import { germanName } from './transposeDialog';

export interface ChordDialogResult {
  readonly text: string;
  readonly inversion: number;
  readonly symbol: boolean;
}

export interface ChordDialogOptions {
  readonly symbol: boolean;
}

const INVERSIONS = ['Grundstellung', '1. Umkehrung', '2. Umkehrung', '3. Umkehrung'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

export function chordDialog(options: ChordDialogOptions): Promise<ChordDialogResult | null> {
  return new Promise((resolve) => {
    const overlay = el('div', { className: 'modal' });
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const form = el('form', { className: 'modal__box form', noValidate: true });

    const input = el('input', { id: 'chord-name', type: 'text', placeholder: 'z. B. Cm7, G7, Fmaj7, C/G', autocomplete: 'off', spellcheck: false });
    input.style.width = '100%';
    const label = el('label', { className: 'form__label', htmlFor: 'chord-name', textContent: 'Name des Akkords (B = deutsches H, Bb = deutsches B)' });
    const chips = el('div', { className: 'chips' });
    const inversions = el('div', { className: 'chips' });
    const preview = el('p', { id: 'chord-preview' });
    preview.setAttribute('aria-live', 'polite');
    const symbol = el('input', { id: 'chord-symbol', type: 'checkbox', checked: options.symbol });
    const error = el('p', { className: 'form__error' });
    const cancel = el('button', { type: 'button', textContent: 'Abbrechen' });
    const ok = el('button', { type: 'submit', className: 'is-primary', textContent: 'Übernehmen' });

    let inversion = 0;
    const inversionButtons = INVERSIONS.map((name, i) => {
      const b = el('button', { type: 'button', textContent: name });
      b.addEventListener('click', () => {
        inversion = i;
        refresh();
      });
      return b;
    });
    inversions.append(...inversionButtons);

    // A click on a kind of chord replaces the ending behind the root ("Cm7" + "maj7" → "Cmaj7"); the bass after a slash stays.
    for (const quality of CHORD_QUALITIES) {
      const b = el('button', { type: 'button', textContent: quality.suffix || 'Dur', title: quality.label });
      b.addEventListener('click', () => {
        const m = /^\s*([A-Ha-h][#b]?)([^/]*)(\/.*)?$/.exec(input.value);
        input.value = `${m?.[1] ?? 'C'}${quality.suffix}${m?.[3] ?? ''}`;
        refresh();
        input.focus();
      });
      chips.append(b);
    }

    const refresh = () => {
      const name = parseChordName(input.value);
      if (!name) {
        preview.textContent = input.value.trim() === '' ? 'Einen Akkordnamen eintippen.' : 'Diesen Akkord kenne ich nicht.';
        ok.disabled = true;
        inversionButtons.forEach((b) => (b.disabled = true));
        return;
      }
      const most = name.intervals.length; // a chord of n tones can be turned n − 1 times
      inversion = Math.min(inversion, most);
      preview.textContent = `${name.label} → ${chordPitches(name, { ...name.root, octave: 4 }, inversion).map(germanName).join(' ')}`;
      ok.disabled = false;
      inversionButtons.forEach((b, i) => {
        b.disabled = i > most;
        b.classList.toggle('is-active', i === inversion);
        b.setAttribute('aria-pressed', String(i === inversion));
      });
    };
    input.addEventListener('input', refresh);

    form.append(
      el('h2', { textContent: 'Akkord nach Namen' }),
      label,
      input,
      chips,
      el('p', { className: 'form__label', textContent: 'Umkehrung' }),
      inversions,
      preview,
      el('label', {}, symbol, ' Akkordsymbol über die Noten schreiben'),
      error,
      el('div', { className: 'modal__buttons' }, cancel, ok),
    );
    overlay.append(form);

    const close = (result: ChordDialogResult | null) => {
      overlay.remove();
      window.removeEventListener('keydown', onKey, true);
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(null);
      }
    };
    cancel.addEventListener('click', () => close(null));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!parseChordName(input.value)) {
        error.textContent = 'Diesen Akkord kenne ich nicht. Beispiele: C, Am, G7, Fmaj7, Dm7b5, C/G.';
        input.focus();
        return;
      }
      close({ text: input.value.trim(), inversion, symbol: symbol.checked });
    });
    document.body.append(overlay);
    window.addEventListener('keydown', onKey, true);
    refresh();
    input.focus();
  });
}
