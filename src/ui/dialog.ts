/**
 * Small in-app dialogs (same look on Windows, macOS and in the browser).
 * While a dialog is open, the workstation ignores its keyboard shortcuts.
 */
export interface DialogButton<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly primary?: boolean;
}

export const isDialogOpen = (): boolean => document.querySelector('.modal') !== null;

export function ask<T extends string>(options: {
  readonly title: string;
  readonly text: string;
  readonly buttons: readonly DialogButton<T>[];
  /** Result for Esc. */
  readonly cancel: T;
}): Promise<T> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const box = document.createElement('div');
    box.className = 'modal__box';
    const title = document.createElement('h2');
    title.textContent = options.title;
    const text = document.createElement('p');
    text.textContent = options.text;
    const row = document.createElement('div');
    row.className = 'modal__buttons';

    const close = (result: T) => {
      overlay.remove();
      window.removeEventListener('keydown', onKey, true);
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(options.cancel);
      }
    };

    let primary: HTMLButtonElement | null = null;
    for (const b of options.buttons) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = b.label;
      button.dataset.id = b.id;
      if (b.primary) {
        button.classList.add('is-primary');
        primary = button;
      }
      button.addEventListener('click', () => close(b.id));
      row.appendChild(button);
    }

    box.append(title, text, row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    window.addEventListener('keydown', onKey, true);
    (primary ?? row.querySelector('button'))?.focus();
  });
}

export function inform(title: string, text: string): Promise<'ok'> {
  return ask({ title, text, buttons: [{ id: 'ok', label: 'OK', primary: true }], cancel: 'ok' });
}
