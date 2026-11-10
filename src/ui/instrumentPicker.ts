/**
 * The buttons that add an instrument (new score, score settings): the four basic ones as buttons,
 * all others in one selection field grouped by family (ADR 0038).
 */
import { INSTRUMENTS, type InstrumentId } from '../core/instruments';

export function instrumentPicker(onPick: (id: InstrumentId) => void): HTMLElement {
  const chips = document.createElement('div');
  chips.className = 'chips';
  const families = new Map<string, HTMLOptGroupElement>();
  for (const def of Object.values(INSTRUMENTS)) {
    if (!def.family) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `+ ${def.name}`;
      b.dataset.instrument = def.id;
      b.addEventListener('click', () => onPick(def.id));
      chips.append(b);
      continue;
    }
    let group = families.get(def.family);
    if (!group) {
      group = document.createElement('optgroup');
      group.label = def.family;
      families.set(def.family, group);
    }
    const o = document.createElement('option');
    o.value = def.id;
    o.textContent = def.name;
    group.append(o);
  }
  const select = document.createElement('select');
  select.dataset.moreInstruments = '';
  select.setAttribute('aria-label', 'Weiteres Instrument hinzufügen');
  const first = document.createElement('option');
  first.value = '';
  first.textContent = '+ Weiteres Instrument …';
  select.append(first, ...families.values());
  select.addEventListener('change', () => {
    const id = select.value as InstrumentId | '';
    select.value = '';
    if (id) onPick(id);
  });
  chips.append(select);
  return chips;
}
