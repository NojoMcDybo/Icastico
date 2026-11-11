/**
 * "Drucken / PDF" (ADR 0033): one dialog for both. Page format, staff size and bars per line can be changed and the
 * pages of the score are shown next to them, redrawn at once; then the pages are saved as PDF or sent to the printer.
 */
import { MAX_PER_SYSTEM } from '../core/model';
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

export interface PrintChoice {
  readonly action: 'pdf' | 'print';
  readonly setup: PdfSetup;
}

export interface PrintDialogOptions {
  readonly title: string;
  readonly scoreCount: number;
  readonly initial: PdfSetup;
  /** Printing goes to the printer of the system; offered for the open score only. */
  readonly canPrint: boolean;
  /** The pages (SVG) of the first score for a setup, to show on the right. */
  readonly preview: (setup: PdfSetup) => string[];
}

/** Asks for the setup and what to do with the pages; null if cancelled. `scoreCount` > 1 offers the shared-pages option. */
export function pdfDialog(options: PrintDialogOptions): Promise<PrintChoice | null> {
  return new Promise((resolve) => {
    const overlay = el('div', { className: 'modal' });
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const form = el('form', { className: 'modal__box modal__box--wide form', noValidate: true });

    const format = el('select', { id: 'pdf-format' });
    format.append(el('option', { value: 'portrait', textContent: 'A4 hoch' }), el('option', { value: 'landscape', textContent: 'A4 quer' }));
    format.value = options.initial.landscape ? 'landscape' : 'portrait';

    const size = el('select', { id: 'pdf-size' });
    for (const s of SIZES) size.append(el('option', { value: String(s.scale), textContent: s.label }));
    size.value = String(options.initial.scale);

    const perLine = el('select', { id: 'pdf-perline' });
    perLine.append(el('option', { value: '', textContent: 'wie in der Partitur' }), el('option', { value: '0', textContent: 'automatisch' }));
    for (let n = 1; n <= MAX_PER_SYSTEM; n++) perLine.append(el('option', { value: String(n), textContent: n === 1 ? '1 Takt' : `${n} Takte` }));
    perLine.value = options.initial.perSystem === undefined ? '' : String(options.initial.perSystem);

    const perPage = el('select', { id: 'pdf-perpage' });
    perPage.append(el('option', { value: '', textContent: 'wie in der Partitur' }), el('option', { value: '0', textContent: 'so viele wie passen' }));
    for (let n = 1; n <= 8; n++) perPage.append(el('option', { value: String(n), textContent: n === 1 ? '1 Akkolade' : `${n} Akkoladen` }));
    perPage.value = options.initial.systemsPerPage === undefined ? '' : String(options.initial.systemsPerPage);

    const pack = el('input', { id: 'pdf-pack', type: 'checkbox', checked: options.initial.pack });

    const setupNow = (): PdfSetup => ({
      landscape: format.value === 'landscape',
      scale: Number(size.value),
      pack: options.scoreCount > 1 && pack.checked,
      ...(perLine.value === '' ? {} : { perSystem: Number(perLine.value) }),
      ...(perPage.value === '' ? {} : { systemsPerPage: Number(perPage.value) }),
    });

    const controls = el('div', { className: 'print__controls' }, el('h2', { textContent: options.title }), row('Seite', format, 'pdf-format'), row('Notengröße', size, 'pdf-size'), row('Takte pro Akkolade', perLine, 'pdf-perline'), row('Akkoladen pro Seite', perPage, 'pdf-perpage'));
    if (options.scoreCount > 1) {
      controls.append(row('Mehrere pro Seite', el('div', {}, pack, el('span', { textContent: ` ${options.scoreCount} Partituren untereinander auf gemeinsamen Seiten (Notenbeispiele)` })), 'pdf-pack'));
    }
    const count = el('p', { className: 'form__hint print__count' });
    controls.append(count);
    const preview = el('div', { className: 'print__preview', id: 'print-preview' });
    preview.setAttribute('aria-label', 'Seitenvorschau');
    form.append(el('div', { className: 'print__body' }, controls, preview));

    const cancel = el('button', { type: 'button', textContent: 'Abbrechen' });
    const save = el('button', { type: 'submit', id: 'pdf-save', className: options.canPrint ? '' : 'is-primary', textContent: 'PDF speichern' });
    const print = el('button', { type: 'button', id: 'pdf-print', className: 'is-primary', textContent: 'Drucken' });
    form.append(el('div', { className: 'modal__buttons' }, cancel, save, ...(options.canPrint ? [print] : [])));
    overlay.append(form);

    // The pages are engraved again a moment after the last change (an engraving of a long score takes a while).
    let timer = 0;
    const draw = () => {
      try {
        // The ids of the drawn shapes belong to the score on the desk: the preview must not repeat them. The glyph definitions
        // (<defs>) keep theirs: every notehead and clef points at one, and they are named anew for each engraving.
        const pages = options.preview(setupNow()).map((svg) => {
          const body = svg.indexOf('</defs>') + 1;
          return svg.slice(0, body) + svg.slice(body).replace(/<g id="[^"]*"/g, '<g');
        });
        preview.replaceChildren(
          ...pages.map((svg, i) => {
            const page = el('div', { className: 'print__page' });
            page.innerHTML = svg;
            page.append(el('span', { className: 'print__number', textContent: `Seite ${i + 1} von ${pages.length}` }));
            return page;
          }),
        );
        count.textContent = pages.length === 1 ? '1 Seite' : `${pages.length} Seiten`;
      } catch (err) {
        preview.replaceChildren(el('p', { className: 'form__error', textContent: `Die Vorschau ließ sich nicht zeichnen: ${err instanceof Error ? err.message : String(err)}` }));
        count.textContent = '';
      }
    };
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(draw, 120);
    };
    for (const control of [format, size, perLine, perPage, pack]) control.addEventListener('change', soon);

    const close = (result: PrintChoice | null) => {
      window.clearTimeout(timer);
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
    print.addEventListener('click', () => close({ action: 'print', setup: setupNow() }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      close({ action: 'pdf', setup: setupNow() });
    });
    window.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    draw();
    (options.canPrint ? print : save).focus();
  });
}
