/**
 * "Neue Partitur" and "Partitur-Einstellungen" – one form, two modes.
 * Enter confirms, Esc cancels. Problems are shown inside the dialog.
 */
import { type InstrumentId, INSTRUMENTS } from '../core/instruments';
import type { TimeSignature } from '../core/model';
import { type Fraction, eq, fracToString, parseFrac } from '../core/time';
import { type ScoreChanges, type ScoreSetup, keyName, pickupChoices } from '../core/templates';

export interface EditInitial {
  readonly title: string;
  readonly composer: string;
  readonly pickup: Fraction;
  /** Meter of the first measure (the upbeat belongs to it). */
  readonly firstMeter: TimeSignature;
  /** Measure the key/meter fields refer to, and their values there. */
  readonly fromMeasure: number;
  readonly lastMeasure: number;
  readonly fifths: number;
  readonly meter: TimeSignature;
  /** The lines the score has now (for adding more instruments and switching the guitar tablature). */
  readonly parts: readonly { readonly id: string; readonly name: string; readonly instrument: InstrumentId; readonly tab: boolean }[];
}

type Options =
  | { readonly mode: 'new'; readonly initial: ScoreSetup }
  | {
      readonly mode: 'edit';
      readonly initial: EditInitial;
      /** Returns an error text to keep the dialog open, or null. */
      readonly check: (changes: ScoreChanges) => string | null;
    };

const METER_PRESETS: TimeSignature[] = [
  { count: 4, unit: 4 },
  { count: 3, unit: 4 },
  { count: 2, unit: 4 },
  { count: 2, unit: 2 },
  { count: 6, unit: 8 },
  { count: 3, unit: 8 },
  { count: 12, unit: 8 },
];

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

function row(label: string, control: Node, forId?: string): HTMLElement {
  const l = el('label', { className: 'form__label', textContent: label });
  if (forId) l.htmlFor = forId;
  return el('div', { className: 'form__row' }, l, el('div', { className: 'form__control' }, control));
}

export function scoreDialog(options: { mode: 'new'; initial: ScoreSetup }): Promise<ScoreSetup | null>;
export function scoreDialog(options: Extract<Options, { mode: 'edit' }>): Promise<ScoreChanges | null>;
export function scoreDialog(options: Options): Promise<ScoreSetup | ScoreChanges | null> {
  const isNew = options.mode === 'new';
  const init = options.initial;

  return new Promise((resolve) => {
    const form = el('form', { className: 'form', noValidate: true });

    // Title & composer
    const title = el('input', { id: 'f-title', type: 'text', value: init.title, placeholder: 'Ohne Titel' });
    const composer = el('input', { id: 'f-composer', type: 'text', value: init.composer, placeholder: 'optional' });
    form.append(row('Titel', title, 'f-title'), row('Komponist', composer, 'f-composer'));

    // Instruments (new score only)
    let instruments: InstrumentId[] = isNew ? [...options.initial.instruments] : [];
    const list = el('ol', { className: 'instruments' });
    const renderInstruments = () => {
      list.replaceChildren(
        ...instruments.map((id, i) => {
          const move = (delta: number) => () => {
            const j = i + delta;
            [instruments[i], instruments[j]] = [instruments[j]!, instruments[i]!];
            renderInstruments();
          };
          const remove = () => {
            instruments = instruments.filter((_, k) => k !== i);
            renderInstruments();
          };
          const button = (text: string, label: string, onClick: () => void, disabled = false) => {
            const b = el('button', { type: 'button', textContent: text, title: label, disabled });
            b.setAttribute('aria-label', `${INSTRUMENTS[id].name}: ${label}`);
            b.addEventListener('click', onClick);
            return b;
          };
          return el(
            'li',
            {},
            el('span', { textContent: INSTRUMENTS[id].name }),
            button('↑', 'nach oben', move(-1), i === 0),
            button('↓', 'nach unten', move(1), i === instruments.length - 1),
            button('✕', 'entfernen', remove),
          );
        }),
      );
      if (instruments.length === 0) list.append(el('li', { className: 'instruments__empty', textContent: 'Noch kein Instrument' }));
    };
    if (isNew) {
      const add = el('div', { className: 'chips' });
      for (const def of Object.values(INSTRUMENTS)) {
        const b = el('button', { type: 'button', textContent: `+ ${def.name}` });
        b.dataset.instrument = def.id;
        b.addEventListener('click', () => {
          instruments.push(def.id);
          renderInstruments();
        });
        add.append(b);
      }
      renderInstruments();
      form.append(row('Instrumente', el('div', {}, list, add)));
    }

    // Instruments of an existing score: the ones it has (guitar: tablature on / off) and more to add
    const addedInstruments: { instrument: InstrumentId; tab: boolean }[] = [];
    const tabBoxes = new Map<string, HTMLInputElement>();
    if (!isNew) {
      const have = el('ol', { className: 'instruments' });
      for (const p of options.initial.parts) {
        const li = el('li', {}, el('span', { textContent: p.name }));
        if (p.instrument === 'guitar') {
          const box = el('input', { type: 'checkbox', checked: p.tab, id: `f-tab-${p.id}` });
          box.setAttribute('aria-label', `${p.name}: Tabulatur`);
          tabBoxes.set(p.id, box);
          li.append(el('label', { className: 'instruments__tab' }, box, ' Tabulatur'));
        }
        have.append(li);
      }
      const adding = el('ol', { className: 'instruments instruments--new' });
      const renderAdded = () => {
        adding.replaceChildren(
          ...addedInstruments.map((a, i) => {
            const li = el('li', {}, el('span', { textContent: `${INSTRUMENTS[a.instrument].name} (neu)` }));
            if (a.instrument === 'guitar') {
              const box = el('input', { type: 'checkbox', checked: a.tab });
              box.setAttribute('aria-label', 'Neue Gitarre: Tabulatur');
              box.addEventListener('change', () => (a.tab = box.checked));
              li.append(el('label', { className: 'instruments__tab' }, box, ' Tabulatur'));
            }
            const remove = el('button', { type: 'button', textContent: '✕', title: 'entfernen' });
            remove.setAttribute('aria-label', `${INSTRUMENTS[a.instrument].name} wieder entfernen`);
            remove.addEventListener('click', () => {
              addedInstruments.splice(i, 1);
              renderAdded();
            });
            li.append(remove);
            return li;
          }),
        );
      };
      const more = el('div', { className: 'chips' });
      for (const def of Object.values(INSTRUMENTS)) {
        const b = el('button', { type: 'button', textContent: `+ ${def.name}` });
        b.dataset.instrument = def.id;
        b.addEventListener('click', () => {
          addedInstruments.push({ instrument: def.id, tab: def.id === 'guitar' });
          renderAdded();
        });
        more.append(b);
      }
      form.append(row('Instrumente', el('div', {}, have, adding, more, el('p', { className: 'form__hint', textContent: 'Neue Zeilen kommen unten dazu. Entfernen geht hier noch nicht.' }))));
    }

    // Key
    const key = el('select', { id: 'f-key' });
    for (let f = -7; f <= 7; f++) key.append(el('option', { value: String(f), textContent: keyName(f) }));
    key.value = String(init.fifths);
    form.append(row('Tonart', key, 'f-key'));

    // Meter: presets + free input
    const count = el('input', { id: 'f-count', type: 'number', min: '1', max: '32', value: String(init.meter.count) });
    const unit = el('select', { id: 'f-unit' });
    for (const u of [2, 4, 8, 16]) unit.append(el('option', { value: String(u), textContent: String(u) }));
    unit.value = String(init.meter.unit);
    const presets = el('div', { className: 'chips' });
    const meterValue = (): TimeSignature => ({ count: Number(count.value), unit: Number(unit.value) });
    const markPreset = () => {
      const m = meterValue();
      presets.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.meter === `${m.count}/${m.unit}`);
      });
    };
    for (const m of METER_PRESETS) {
      const b = el('button', { type: 'button', textContent: `${m.count}/${m.unit}` });
      b.dataset.meter = `${m.count}/${m.unit}`;
      b.addEventListener('click', () => {
        count.value = String(m.count);
        unit.value = String(m.unit);
        onMeterChange();
      });
      presets.append(b);
    }
    const custom = el('span', { className: 'meter-custom' }, count, el('span', { textContent: '/' }), unit);
    form.append(row('Taktart', el('div', {}, presets, custom), 'f-count'));

    // From measure (edit only)
    const from = el('input', {
      id: 'f-from',
      type: 'number',
      min: '1',
      max: String(isNew ? 1 : options.initial.lastMeasure + 1),
      value: String(isNew ? 1 : Math.max(1, options.initial.fromMeasure)),
    });
    if (!isNew) {
      form.append(
        row(
          'Ab Takt',
          el('div', {}, from, el('p', { className: 'form__hint', textContent: 'Tonart und Taktart gelten ab diesem Takt. Die Taktart gilt bis zum Ende.' })),
          'f-from',
        ),
      );
    }

    // Upbeat
    const pickup = el('select', { id: 'f-pickup' });
    const pickupMeter = (): TimeSignature =>
      isNew || Number(from.value) <= 1 ? meterValue() : options.initial.firstMeter;
    const renderPickup = () => {
      const previous = pickup.value || fracToString(init.pickup);
      const choices = pickupChoices(pickupMeter());
      pickup.replaceChildren(
        el('option', { value: '0', textContent: 'kein Auftakt' }),
        ...choices.map((c) => el('option', { value: fracToString(c.value), textContent: c.label })),
      );
      pickup.value = choices.some((c) => fracToString(c.value) === previous) ? previous : '0';
    };
    form.append(row('Auftakt', pickup, 'f-pickup'));

    function onMeterChange() {
      markPreset();
      renderPickup();
    }
    count.addEventListener('input', onMeterChange);
    unit.addEventListener('change', onMeterChange);
    from.addEventListener('input', renderPickup);
    markPreset();
    renderPickup();

    const error = el('p', { className: 'form__error', role: 'alert' });
    const cancel = el('button', { type: 'button', textContent: 'Abbrechen' });
    const submit = el('button', {
      type: 'submit',
      className: 'is-primary',
      textContent: isNew ? 'Partitur anlegen' : 'Übernehmen',
    });
    form.append(error, el('div', { className: 'modal__buttons' }, cancel, submit));

    const overlay = el(
      'div',
      { className: 'modal' },
      el('div', { className: 'modal__box modal__box--form' }, el('h2', { textContent: isNew ? 'Neue Partitur' : 'Partitur-Einstellungen' }), form),
    );
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const close = (result: ScoreSetup | ScoreChanges | null) => {
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
      const meter = meterValue();
      const pickupValue = parseFrac(pickup.value);
      if (!Number.isInteger(meter.count) || meter.count < 1 || meter.count > 32) {
        error.textContent = 'Die Taktart braucht oben eine Zahl von 1 bis 32.';
        return count.focus();
      }
      if (isNew) {
        if (instruments.length === 0) {
          error.textContent = 'Bitte mindestens ein Instrument hinzufügen.';
          return;
        }
        return close({
          title: title.value,
          composer: composer.value,
          instruments,
          fifths: Number(key.value),
          meter,
          pickup: pickupValue,
        });
      }
      const i = options.initial;
      const fromMeasure = Number(from.value);
      const changes: ScoreChanges = {
        fromMeasure,
        ...(title.value !== i.title ? { title: title.value } : {}),
        ...(composer.value !== i.composer ? { composer: composer.value } : {}),
        ...(Number(key.value) !== i.fifths ? { fifths: Number(key.value) } : {}),
        ...(meter.count !== i.meter.count || meter.unit !== i.meter.unit ? { meter } : {}),
        ...(!eq(pickupValue, i.pickup) ? { pickup: pickupValue } : {}),
        ...(addedInstruments.length > 0 ? { addInstruments: addedInstruments.map((a) => ({ instrument: a.instrument, tab: a.tab })) } : {}),
      };
      const tabChanges = Object.fromEntries(i.parts.filter((p) => tabBoxes.get(p.id) && tabBoxes.get(p.id)!.checked !== p.tab).map((p) => [p.id, tabBoxes.get(p.id)!.checked]));
      if (Object.keys(tabChanges).length > 0) (changes as { tab?: Record<string, boolean> }).tab = tabChanges;
      const problem = options.check(changes);
      if (problem) {
        error.textContent = problem;
        return;
      }
      close(changes);
    });

    document.body.append(overlay);
    window.addEventListener('keydown', onKey, true);
    title.focus();
    title.select();
  });
}
