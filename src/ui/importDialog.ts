/**
 * The window before a MIDI file or a recording becomes a score (ADR 0028): which tracks, which instrument,
 * meter, tempo, key and how finely the rhythm is rounded.
 */
import { INSTRUMENTS, type InstrumentId } from '../core/instruments';
import { MAX_TEMPO, MIN_TEMPO, type TimeSignature } from '../core/model';
import { SUBDIVISION_NAMES, type QuantizeOptions, type Subdivision } from '../core/import/quantize';
import { keyName } from '../core/templates';

export interface ImportDialogTrack {
  readonly id: number;
  readonly name: string;
  readonly detail: string;
  readonly instrument: InstrumentId;
  readonly selected: boolean;
}

export interface ImportDialogOptions {
  readonly title: string;
  readonly intro: string;
  readonly confirm: string;
  /** With one track the checkbox is left out. */
  readonly tracks: readonly ImportDialogTrack[];
  readonly meter: TimeSignature;
  readonly tempo: number;
  /** Where the tempo comes from ("aus der Datei", "geschätzt – bitte prüfen"). */
  readonly tempoHint: string;
  /** Null = estimate from the notes. */
  readonly fifths: number | null;
  readonly quantize: QuantizeOptions;
}

export interface ImportDialogResult {
  readonly tracks: readonly { readonly id: number; readonly instrument: InstrumentId }[];
  readonly meter: TimeSignature;
  readonly tempo: number;
  readonly fifths: number | null;
  readonly quantize: QuantizeOptions;
}

const METERS: TimeSignature[] = [
  { count: 4, unit: 4 },
  { count: 3, unit: 4 },
  { count: 2, unit: 4 },
  { count: 2, unit: 2 },
  { count: 6, unit: 8 },
  { count: 3, unit: 8 },
  { count: 12, unit: 8 },
  { count: 5, unit: 4 },
  { count: 7, unit: 8 },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function row(label: string, control: Node, forId?: string, hint?: string): HTMLElement {
  const l = el('label', { className: 'form__label', textContent: label });
  if (forId) l.htmlFor = forId;
  return el('div', { className: 'form__row' }, l, el('div', { className: 'form__control' }, control, ...(hint ? [el('p', { className: 'form__hint', textContent: hint })] : [])));
}

const meterText = (m: TimeSignature): string => `${m.count}/${m.unit}`;

/** Resolves with the choices, or null if cancelled. */
export function importDialog(options: ImportDialogOptions): Promise<ImportDialogResult | null> {
  return new Promise((resolve) => {
    const overlay = el('div', { className: 'modal' });
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const form = el('form', { className: 'modal__box modal__box--form form import', noValidate: true });
    form.append(el('h2', { textContent: options.title }), el('p', { className: 'form__hint', textContent: options.intro }));

    // Tracks
    const rows: { track: ImportDialogTrack; box: HTMLInputElement | null; instrument: HTMLSelectElement }[] = [];
    const list = el('ol', { className: 'instruments import__tracks' });
    for (const track of options.tracks) {
      const box = options.tracks.length > 1 ? el('input', { type: 'checkbox', checked: track.selected }) : null;
      box?.setAttribute('aria-label', `${track.name} übernehmen`);
      const select = el('select');
      select.setAttribute('aria-label', `Instrument für ${track.name}`);
      const groups = new Map<string, HTMLOptGroupElement>();
      for (const def of Object.values(INSTRUMENTS)) {
        const option = el('option', { value: def.id, textContent: def.name });
        if (!def.family) {
          select.append(option);
          continue;
        }
        if (!groups.has(def.family)) groups.set(def.family, el('optgroup', { label: def.family }));
        groups.get(def.family)!.append(option);
      }
      select.append(...groups.values());
      select.value = track.instrument;
      const label = el('span', { className: 'import__name' }, el('strong', { textContent: track.name }), el('small', { textContent: ` ${track.detail}` }));
      list.append(el('li', {}, ...(box ? [box] : []), label, select));
      rows.push({ track, box, instrument: select });
    }
    form.append(row(options.tracks.length > 1 ? 'Spuren' : 'Instrument', list));

    // Meter
    const meter = el('select', { id: 'imp-meter' });
    const meters = METERS.some((m) => meterText(m) === meterText(options.meter)) ? METERS : [options.meter, ...METERS];
    for (const m of meters) meter.append(el('option', { value: meterText(m), textContent: meterText(m) }));
    meter.value = meterText(options.meter);
    form.append(row('Taktart', meter, 'imp-meter'));

    // Tempo
    const tempo = el('input', { id: 'imp-tempo', type: 'number', min: String(MIN_TEMPO), max: String(MAX_TEMPO), value: String(options.tempo) });
    form.append(row('Tempo', tempo, 'imp-tempo', options.tempoHint));

    // Key
    const key = el('select', { id: 'imp-key' });
    key.append(el('option', { value: 'auto', textContent: 'automatisch erkennen' }));
    for (let f = -7; f <= 7; f++) key.append(el('option', { value: String(f), textContent: keyName(f) }));
    key.value = options.fifths === null ? 'auto' : String(options.fifths);
    form.append(row('Tonart', key, 'imp-key'));

    // Rounding
    const grid = el('select', { id: 'imp-grid' });
    for (const s of [8, 16, 32] as const) grid.append(el('option', { value: String(s), textContent: SUBDIVISION_NAMES[s] }));
    grid.value = String(options.quantize.subdivision);
    const triplets = el('input', { id: 'imp-triplets', type: 'checkbox', checked: options.quantize.triplets });
    form.append(
      row('Kleinster Notenwert', grid, 'imp-grid', 'Alles Kürzere wird auf diesen Wert gerundet.'),
      row('Triolen', el('label', {}, triplets, ' erkennen und als Triolen schreiben'), 'imp-triplets'),
    );

    const error = el('p', { className: 'form__error' });
    error.setAttribute('role', 'alert');
    const cancel = el('button', { type: 'button', textContent: 'Abbrechen' });
    const ok = el('button', { type: 'submit', className: 'is-primary', textContent: options.confirm });
    form.append(error, el('div', { className: 'modal__buttons' }, cancel, ok));
    overlay.append(form);

    const close = (result: ImportDialogResult | null) => {
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
      const chosen = rows.filter((r) => !r.box || r.box.checked).map((r) => ({ id: r.track.id, instrument: r.instrument.value as InstrumentId }));
      const bpm = Number(tempo.value);
      if (chosen.length === 0) return void (error.textContent = 'Bitte mindestens eine Spur auswählen.');
      if (!Number.isFinite(bpm) || bpm < MIN_TEMPO || bpm > MAX_TEMPO) return void (error.textContent = `Das Tempo muss zwischen ${MIN_TEMPO} und ${MAX_TEMPO} liegen.`);
      const [count, unit] = meter.value.split('/').map(Number) as [number, number];
      close({
        tracks: chosen,
        meter: { count, unit },
        tempo: Math.round(bpm),
        fifths: key.value === 'auto' ? null : Number(key.value),
        quantize: { subdivision: Number(grid.value) as Subdivision, triplets: triplets.checked },
      });
    });
    document.body.append(overlay);
    window.addEventListener('keydown', onKey, true);
    ok.focus();
  });
}
