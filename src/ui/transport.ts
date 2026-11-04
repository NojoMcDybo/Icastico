/**
 * The transport bar at the top: playback buttons and a display with bar, beat,
 * tempo, meter and key – like the display of a DAW. Tempo, meter and key can be
 * changed by clicking them; the buttons move the playhead and play.
 */
import { type Score, MAX_TEMPO, MIN_TEMPO, keyAt, meterAt } from '../core/model';
import { barBeat, keyName, tempoOf } from '../core/playback';
import type { Fraction } from '../core/time';

export interface TransportHost {
  play(): void;
  stop(): void;
  toStart(): void;
  /** One bar back (-1) or forward (+1). */
  step(direction: number): void;
  /** Returns whether looping is on now. */
  toggleLoop(): boolean;
  setTempo(bpm: number): void;
  /** Meter and key live in the score settings dialog. */
  openSettings(): void;
}

export interface TransportInfo {
  readonly score: Score;
  readonly time: Fraction;
  readonly playing: boolean;
  readonly loop: boolean;
  readonly disabled: boolean;
}

const ICONS = {
  start: '<path d="M6 5v14M18 6v12l-9-6z" />',
  back: '<path d="M11 6v12l-8-6zM21 6v12l-8-6z" />',
  forward: '<path d="M13 6v12l8-6zM3 6v12l8-6z" />',
  play: '<path d="M7 5v14l12-7z" />',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" />',
  record: '<circle cx="12" cy="12" r="6" />',
  loop: '<path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4" fill="none" />',
} as const;

function button(icon: keyof typeof ICONS, label: string, cls: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `transport__btn ${cls}`.trim();
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
  return b;
}

function cell(label: string, tag: 'span' | 'button'): { el: HTMLElement; value: HTMLElement } {
  const el = document.createElement(tag);
  el.className = 'lcd__cell';
  if (el instanceof HTMLButtonElement) el.type = 'button';
  const value = document.createElement('span');
  value.className = 'lcd__value';
  const name = document.createElement('span');
  name.className = 'lcd__label';
  name.textContent = label;
  el.append(value, name);
  return { el, value };
}

export class Transport {
  private readonly playButton = button('play', 'Wiedergabe starten (Strg+Eingabe)', 'transport__play');
  private readonly loopButton = button('loop', 'Wiederholen: die ganze Partitur immer wieder', 'transport__loop');
  private readonly bar = cell('TAKT', 'span');
  private readonly beat = cell('SCHLAG', 'span');
  private readonly tempo = cell('TEMPO', 'button');
  private readonly meter = cell('TAKTART', 'button');
  private readonly key = cell('TONART', 'button');
  private readonly buttons: HTMLButtonElement[] = [];
  private editing = false;
  private current: TransportInfo | null = null;

  constructor(el: HTMLElement, private readonly host: TransportHost) {
    const start = button('start', 'Zum Anfang', '');
    const back = button('back', 'Einen Takt zurück', '');
    const forward = button('forward', 'Einen Takt vor', '');
    const record = button('record', 'Aufnehmen – kommt später (Noten diktieren oder einspielen)', 'transport__record');
    record.disabled = true;
    start.addEventListener('click', () => host.toStart());
    back.addEventListener('click', () => host.step(-1));
    forward.addEventListener('click', () => host.step(1));
    this.playButton.addEventListener('click', () => (this.current?.playing ? host.stop() : host.play()));
    this.loopButton.addEventListener('click', () => this.loopButton.setAttribute('aria-pressed', String(host.toggleLoop())));
    this.loopButton.setAttribute('aria-pressed', 'false');
    this.buttons.push(start, back, forward, this.playButton, this.loopButton);

    const group = document.createElement('div');
    group.className = 'transport__buttons';
    group.append(back, forward, start, this.playButton, record, this.loopButton);

    const lcd = document.createElement('div');
    lcd.className = 'lcd';
    this.tempo.el.title = 'Tempo ändern: anklicken und eintippen (Viertel pro Minute), Mausrad ändert um 1';
    this.meter.el.title = 'Taktart ändern (öffnet die Partitur-Einstellungen)';
    this.key.el.title = 'Tonart ändern (öffnet die Partitur-Einstellungen)';
    this.tempo.el.addEventListener('click', () => this.editTempo());
    this.tempo.el.addEventListener(
      'wheel',
      (e) => {
        if (!this.current || this.editing) return;
        e.preventDefault();
        host.setTempo(tempoOf(this.current.score) + (e.deltaY < 0 ? 1 : -1));
      },
      { passive: false },
    );
    this.meter.el.addEventListener('click', () => host.openSettings());
    this.key.el.addEventListener('click', () => host.openSettings());
    lcd.append(this.bar.el, this.beat.el, this.tempo.el, this.meter.el, this.key.el);
    el.append(group, lcd);
  }

  show(info: TransportInfo): void {
    this.current = info;
    const { bar, beat } = barBeat(info.score, info.time);
    this.bar.value.textContent = String(bar);
    this.beat.value.textContent = String(beat);
    if (!this.editing) this.tempo.value.textContent = String(tempoOf(info.score));
    const sig = meterAt(info.score, info.time);
    this.meter.value.textContent = `${sig.count}/${sig.unit}`;
    this.key.value.textContent = keyName(keyAt(info.score, info.time));
    this.playButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${info.playing ? ICONS.stop : ICONS.play}</svg>`;
    const label = info.playing ? 'Wiedergabe anhalten (Strg+Eingabe)' : 'Wiedergabe starten (Strg+Eingabe)';
    this.playButton.title = label;
    this.playButton.setAttribute('aria-label', label);
    this.playButton.setAttribute('aria-pressed', String(info.playing));
    for (const b of this.buttons) b.disabled = info.disabled;
    for (const c of [this.tempo.el, this.meter.el, this.key.el]) (c as HTMLButtonElement).disabled = info.disabled;
    this.loopButton.setAttribute('aria-pressed', String(info.loop));
  }

  /** The tempo number turns into a little input; Enter keeps it, Esc leaves it as it was. */
  private editTempo(): void {
    if (this.editing || !this.current) return;
    this.editing = true;
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'lcd__input';
    input.min = String(MIN_TEMPO);
    input.max = String(MAX_TEMPO);
    input.value = String(tempoOf(this.current.score));
    input.setAttribute('aria-label', 'Tempo in Vierteln pro Minute');
    this.tempo.value.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (keep: boolean) => {
      if (done) return;
      done = true;
      this.editing = false;
      const bpm = Number(input.value);
      if (keep && Number.isFinite(bpm) && input.value !== '') this.host.setTempo(bpm);
      if (this.current) this.show(this.current);
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // typing digits must not enter notes
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }
}
