/**
 * "Seitenaufbau" (ADR 0044): one place for how the music is spread over the page – bars per Akkolade for the whole piece
 * or for a range of bars, Akkoladen per page and the page margins. Enter confirms, Esc cancels.
 */
import { MAX_MARGIN_MM, MAX_PER_SYSTEM, MAX_SYSTEMS_PER_PAGE, type PageMargins } from '../core/model';

export interface LayoutInitial {
  /** The range the dialog opens with (bars marked in the score); null = the whole piece. */
  readonly range: { readonly from: number; readonly to: number } | null;
  /** The bars the range fields show when "Bestimmte Takte" is chosen: those of the marked notes, else of the selected note. */
  readonly suggest: { readonly from: number; readonly to: number };
  readonly firstBar: number;
  readonly lastBar: number;
  /** Bars per Akkolade now (0 = automatic or fixed by line breaks) and Akkoladen per page now (0 = as many as fit). */
  readonly perSystem: number;
  readonly systemsPerPage: number;
  readonly margins: PageMargins;
}

export interface LayoutChoice {
  /** The bars the number of bars per Akkolade is for (numbers as shown); null = the whole piece. */
  readonly range: { readonly from: number; readonly to: number } | null;
  /** Bars per Akkolade: null = leave as it is; 0 = automatic (whole piece only). */
  readonly perSystem: number | null;
  /** Akkoladen per page: null = leave as it is; 0 = as many as fit. */
  readonly systemsPerPage: number | null;
  /** Page margins in mm: null = leave as they are. */
  readonly margins: PageMargins | null;
}

function field(label: string, input: HTMLElement, id: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'form__row';
  const l = document.createElement('label');
  l.className = 'form__label';
  l.textContent = label;
  l.htmlFor = id;
  const c = document.createElement('div');
  c.className = 'form__control';
  c.append(input);
  row.append(l, c);
  return row;
}

function numberInput(id: string, value: string, min: number, max: number, placeholder = ''): HTMLInputElement {
  const input = document.createElement('input');
  input.id = id;
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = value;
  input.placeholder = placeholder;
  return input;
}

export function layoutDialog(initial: LayoutInitial): Promise<LayoutChoice | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const form = document.createElement('form');
    form.className = 'modal__box form';
    form.noValidate = true;
    const title = document.createElement('h2');
    title.textContent = 'Seitenaufbau';

    const scope = document.createElement('select');
    scope.id = 'layout-scope';
    for (const [value, text] of [['all', 'Ganzes Stück'], ['bars', 'Bestimmte Takte']] as const) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = text;
      scope.append(o);
    }
    scope.value = initial.range ? 'bars' : 'all';
    const from = numberInput('layout-from', String(initial.range?.from ?? initial.suggest.from), initial.firstBar, initial.lastBar);
    const to = numberInput('layout-to', String(initial.range?.to ?? initial.suggest.to), initial.firstBar, initial.lastBar);
    const rangeRow = document.createElement('div');
    rangeRow.className = 'form__control';
    rangeRow.append('von Takt ', from, ' bis Takt ', to);
    const perSystem = numberInput('layout-persystem', initial.perSystem > 0 ? String(initial.perSystem) : '', 0, MAX_PER_SYSTEM, 'unverändert');
    const perPage = numberInput('layout-perpage', initial.systemsPerPage > 0 ? String(initial.systemsPerPage) : '', 1, MAX_SYSTEMS_PER_PAGE, 'so viele wie passen');
    const m = initial.margins;
    const sides = {
      top: numberInput('layout-m-top', String(m.top), 0, MAX_MARGIN_MM),
      bottom: numberInput('layout-m-bottom', String(m.bottom), 0, MAX_MARGIN_MM),
      left: numberInput('layout-m-left', String(m.left), 0, MAX_MARGIN_MM),
      right: numberInput('layout-m-right', String(m.right), 0, MAX_MARGIN_MM),
    };
    const marginRow = document.createElement('div');
    marginRow.className = 'form__quad';
    for (const [text, input] of [['oben', sides.top], ['unten', sides.bottom], ['links', sides.left], ['rechts', sides.right]] as const) {
      const cell = document.createElement('label');
      cell.append(text, input);
      marginRow.append(cell);
    }
    for (const i of [from, to]) i.style.width = '4.5em';
    for (const i of [perSystem, perPage]) i.style.width = '100%';

    const hint = document.createElement('p');
    hint.className = 'form__hint';
    const error = document.createElement('p');
    error.className = 'form__error';
    error.setAttribute('role', 'alert');
    const setHint = () => {
      const bars = scope.value === 'bars';
      rangeRow.style.display = bars ? '' : 'none';
      hint.textContent = bars
        ? 'Vor dem Bereich und danach beginnt eine neue Akkolade; alles andere bleibt, wie es ist.'
        : 'Leer lassen = so lassen, wie es ist; 0 = der Notensatz entscheidet.';
    };
    scope.addEventListener('change', setHint);

    const buttons = document.createElement('div');
    buttons.className = 'modal__buttons';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Abbrechen';
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'is-primary';
    ok.textContent = 'Übernehmen';
    buttons.append(cancel, ok);

    form.append(
      title,
      field('Bereich', scope, 'layout-scope'),
      rangeRow,
      field('Takte pro Akkolade', perSystem, 'layout-persystem'),
      field('Akkoladen pro Seite', perPage, 'layout-perpage'),
      field('Seitenränder (mm)', marginRow, 'layout-m-top'),
      hint,
      error,
      buttons,
    );
    overlay.append(form);
    setHint();

    const close = (result: LayoutChoice | null) => {
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
    const whole = (input: HTMLInputElement): number | null => {
      if (input.value.trim() === '') return null;
      const n = Number(input.value);
      return Number.isInteger(n) ? n : Number.NaN;
    };
    cancel.addEventListener('click', () => close(null));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const bars = scope.value === 'bars';
      const a = whole(from);
      const b = whole(to);
      if (bars && (a === null || b === null || Number.isNaN(a) || Number.isNaN(b) || a < initial.firstBar || b > initial.lastBar || a > b)) {
        error.textContent = `Bitte Takte von ${initial.firstBar} bis ${initial.lastBar} angeben, der erste nicht nach dem letzten.`;
        from.focus();
        return;
      }
      const per = whole(perSystem);
      if (per !== null && (Number.isNaN(per) || per < 0 || per > MAX_PER_SYSTEM || (bars && per < 1))) {
        error.textContent = bars ? `Takte pro Akkolade: eine ganze Zahl von 1 bis ${MAX_PER_SYSTEM}.` : `Takte pro Akkolade: 0 (automatisch) oder 1 bis ${MAX_PER_SYSTEM}.`;
        perSystem.focus();
        return;
      }
      const pages = whole(perPage);
      if (pages !== null && (Number.isNaN(pages) || pages < 1 || pages > MAX_SYSTEMS_PER_PAGE)) {
        error.textContent = `Akkoladen pro Seite: eine ganze Zahl von 1 bis ${MAX_SYSTEMS_PER_PAGE}, oder leer.`;
        perPage.focus();
        return;
      }
      const side = (input: HTMLInputElement): number => (input.value.trim() === '' ? Number.NaN : Number(input.value));
      const margins: PageMargins = { top: side(sides.top), bottom: side(sides.bottom), left: side(sides.left), right: side(sides.right) };
      if (Object.values(margins).some((v) => !Number.isInteger(v) || v < 0 || v > MAX_MARGIN_MM)) {
        error.textContent = `Seitenränder: ganze Millimeter von 0 bis ${MAX_MARGIN_MM}.`;
        sides.top.focus();
        return;
      }
      const marginsChanged = (Object.keys(margins) as (keyof PageMargins)[]).some((k) => margins[k] !== initial.margins[k]);
      const pagesNow = pages ?? 0;
      close({
        range: bars ? { from: a!, to: b! } : null,
        perSystem: per,
        systemsPerPage: pagesNow === initial.systemsPerPage ? null : pagesNow,
        margins: marginsChanged ? margins : null,
      });
    });
    document.body.append(overlay);
    window.addEventListener('keydown', onKey, true);
    perSystem.focus();
    perSystem.select();
  });
}
