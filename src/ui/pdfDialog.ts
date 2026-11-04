/** "Als PDF speichern": page format, staff size and – for several scores – whether they share pages. */
import { type PdfSetup, SIZES } from './pdfExport';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

const row = (label: string, control: Node, forId: string): HTMLElement =>
  el('div', { className: 'form__row' }, el('label', { className: 'form__label', textContent: label, htmlFor: forId }), el('div', { className: 'form__control' }, control));

/** Asks for the setup; null if cancelled. `scoreCount` > 1 offers the shared-pages option. */
export function pdfDialog(options: { title: string; scoreCount: number; initial: PdfSetup }): Promise<PdfSetup | null> {
  return new Promise((resolve) => {
    const overlay = el('div', { className: 'modal' });
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const form = el('form', { className: 'modal__box modal__box--form form', noValidate: true });

    const format = el('select', { id: 'pdf-format' });
    format.append(el('option', { value: 'portrait', textContent: 'A4 hoch' }), el('option', { value: 'landscape', textContent: 'A4 quer' }));
    format.value = options.initial.landscape ? 'landscape' : 'portrait';

    const size = el('select', { id: 'pdf-size' });
    for (const s of SIZES) size.append(el('option', { value: String(s.scale), textContent: s.label }));
    size.value = String(options.initial.scale);

    const pack = el('input', { id: 'pdf-pack', type: 'checkbox', checked: options.initial.pack });

    form.append(el('h2', { textContent: options.title }), row('Seite', format, 'pdf-format'), row('Notengröße', size, 'pdf-size'));
    if (options.scoreCount > 1) {
      form.append(
        row('Mehrere pro Seite', el('div', {}, pack, el('span', { textContent: ` ${options.scoreCount} Partituren untereinander auf gemeinsamen Seiten (Notenbeispiele)` })), 'pdf-pack'),
      );
    }

    const cancel = el('button', { type: 'button', textContent: 'Abbrechen' });
    const ok = el('button', { type: 'submit', className: 'is-primary', textContent: 'PDF speichern' });
    form.append(el('div', { className: 'modal__buttons' }, cancel, ok));
    overlay.append(form);

    const close = (result: PdfSetup | null) => {
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
      close({ landscape: format.value === 'landscape', scale: Number(size.value), pack: options.scoreCount > 1 && pack.checked });
    });
    window.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    ok.focus();
  });
}
