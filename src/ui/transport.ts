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
  /** Record button: starts / stops listening to speech and the MIDI keyboard. */
  toggleRecord(): void;
  /** One bar back (-1) or forward (+1). */
  step(direction: number): void;
  /** Returns whether looping is on now. */
  toggleLoop(): boolean;
  setTempo(bpm: number): void;
  /** Dragging the tempo up and down (like Logic): one undo step for the whole drag. */
  beginTempoDrag(): void;
  endTempoDrag(commit: boolean): void;
  /** The key display was clicked: the circle of fifths opens below it. */
  openKeys(anchor: HTMLElement): void;
  /** The meter lives in the score settings dialog. */
  openSettings(): void;
}

export interface TransportInfo {
  readonly score: Score;
  readonly time: Fraction;
  readonly playing: boolean;
  readonly loop: boolean;
  readonly recording: boolean;
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
  private readonly recordButton = button('record', 'Aufnahme: Sprache und MIDI-Keyboard hören zu (R)', 'transport__record');
  private readonly stopButton = button('stop', 'Anhalten (Strg+Eingabe) – noch einmal: zum Anfang', 'transport__stop');
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
    start.addEventListener('click', () => host.toStart());
    back.addEventListener('click', () => host.step(-1));
    forward.addEventListener('click', () => host.step(1));
    this.playButton.addEventListener('click', () => {
      if (!this.current?.playing) host.play();
    });
    this.stopButton.addEventListener('click', () => host.stop());
    this.recordButton.addEventListener('click', () => host.toggleRecord());
    this.recordButton.setAttribute('aria-pressed', 'false');
    this.loopButton.addEventListener('click', () => this.loopButton.setAttribute('aria-pressed', String(host.toggleLoop())));
    this.loopButton.setAttribute('aria-pressed', 'false');
    this.buttons.push(start, back, forward, this.playButton, this.stopButton, this.recordButton, this.loopButton);

    const group = document.createElement('div');
    group.className = 'transport__buttons';
    group.append(start, back, this.playButton, this.stopButton, forward, this.recordButton, this.loopButton);

    const lcd = document.createElement('div');
    lcd.className = 'lcd';
    this.tempo.el.title = 'Tempo ändern: nach oben ziehen = schneller, nach unten = langsamer; anklicken zum Eintippen (Viertel pro Minute); Mausrad ändert um 1';
    this.meter.el.title = 'Taktart ändern (öffnet die Partitur-Einstellungen)';
    this.key.el.title = 'Tonart wählen (Quintenzirkel)';
    // Logic style: press on the tempo and drag up or down; a plain click types the number.
    let drag: { y: number; bpm: number; moved: boolean } | null = null;
    const endDrag = (e: PointerEvent, commit: boolean) => {
      const d = drag;
      drag = null;
      if (this.tempo.el.hasPointerCapture(e.pointerId)) this.tempo.el.releasePointerCapture(e.pointerId);
      this.tempo.el.classList.remove('is-dragging');
      if (!d) return;
      if (d.moved) host.endTempoDrag(commit);
      else if (commit) this.editTempo();
    };
    this.tempo.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.current || this.editing || e.target instanceof HTMLInputElement) return;
      drag = { y: e.clientY, bpm: tempoOf(this.current.score), moved: false };
      this.tempo.el.setPointerCapture(e.pointerId);
    });
    this.tempo.el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const up = drag.y - e.clientY;
      if (!drag.moved) {
        if (Math.abs(up) < 3) return;
        drag.moved = true;
        this.tempo.el.classList.add('is-dragging');
        host.beginTempoDrag();
      }
      host.setTempo(Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, drag.bpm + Math.round(up))));
    });
    this.tempo.el.addEventListener('pointerup', (e) => endDrag(e, true));
    this.tempo.el.addEventListener('pointercancel', (e) => endDrag(e, false));
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
    this.key.el.addEventListener('click', () => host.openKeys(this.key.el));
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
    this.playButton.setAttribute('aria-pressed', String(info.playing));
    this.recordButton.setAttribute('aria-pressed', String(info.recording));
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
