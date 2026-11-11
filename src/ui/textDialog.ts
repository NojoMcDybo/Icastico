/** The dialog for a free text on the staff (ADR 0043): the words and the size in points. */
import { DEFAULT_TEXT_SIZE, MAX_TEXT_SIZE, MIN_TEXT_SIZE } from '../core/model';

export interface TextChoice {
  readonly text: string;
  readonly size: number;
}

const SIZES = [8, 10, 12, 14, 18, 24, 36, 48];

export function textDialog(options: { readonly title: string; readonly initial?: TextChoice; readonly confirm: string; readonly hint?: string }): Promise<TextChoice | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const form = document.createElement('form');
    form.className = 'modal__box form';
    form.noValidate = true;
    const title = document.createElement('h2');
    title.textContent = options.title;

    const label = document.createElement('label');
    label.className = 'form__label';
    label.textContent = 'Text';
    label.htmlFor = 'text-input';
    const input = document.createElement('input');
    input.id = 'text-input';
    input.type = 'text';
    input.maxLength = 200;
    input.value = options.initial?.text ?? '';
    input.style.width = '100%';

    const sizeLabel = document.createElement('label');
    sizeLabel.className = 'form__label';
    sizeLabel.textContent = `Schriftgröße (Punkt, ${MIN_TEXT_SIZE}–${MAX_TEXT_SIZE})`;
    sizeLabel.htmlFor = 'text-size';
    const size = document.createElement('input');
    size.id = 'text-size';
    size.type = 'number';
    size.min = String(MIN_TEXT_SIZE);
    size.max = String(MAX_TEXT_SIZE);
    size.step = '1';
    size.value = String(options.initial?.size ?? DEFAULT_TEXT_SIZE);
    size.setAttribute('list', 'text-size-list');
    const list = document.createElement('datalist');
    list.id = 'text-size-list';
    for (const s of SIZES) {
      const o = document.createElement('option');
      o.value = String(s);
      list.append(o);
    }

    const hint = document.createElement('p');
    hint.className = 'form__hint';
    hint.textContent = options.hint ?? '';
    const error = document.createElement('p');
    error.className = 'form__error';
    error.setAttribute('role', 'alert');
    const row = document.createElement('div');
    row.className = 'modal__buttons';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Abbrechen';
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'is-primary';
    ok.textContent = options.confirm;
    row.append(cancel, ok);
    form.append(title, label, input, sizeLabel, size, list, ...(options.hint ? [hint] : []), error, row);
    overlay.append(form);

    const close = (result: TextChoice | null) => {
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
      const n = Number(size.value);
      if (!Number.isInteger(n) || n < MIN_TEXT_SIZE || n > MAX_TEXT_SIZE) {
        error.textContent = `Bitte eine ganze Zahl von ${MIN_TEXT_SIZE} bis ${MAX_TEXT_SIZE} eingeben.`;
        size.focus();
        return;
      }
      close({ text: input.value, size: n });
    });
    document.body.append(overlay);
    window.addEventListener('keydown', onKey, true);
    input.focus();
    input.select();
  });
}
