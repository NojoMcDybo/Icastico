import './styles.css';
import { demoScore } from './core/demo';
import { getInstrument } from './core/instruments';
import type { NoteEvent, Score } from './core/model';
import { pitchToString } from './core/pitch';
import { durationName } from './core/notation/notate';
import { scoreToMei, type ElementRef, type MeiResult } from './render/mei';
import { Engraver } from './render/verovio';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const pagesEl = $<HTMLDivElement>('pages');
const statusEl = $<HTMLSpanElement>('status');
const metaEl = $<HTMLSpanElement>('meta');
const titleEl = $<HTMLSpanElement>('doc-title');

const APP_VERSION = '0.0.1';
/** Notation size in percent of Verovio's default. */
const SCALE = 55;
/** Clicks this close (px) to a symbol still select it, e.g. inside a hollow notehead. */
const HIT_TOLERANCE = 10;
const HINT = 'Klick auf eine Note wählt sie aus · Esc hebt die Auswahl auf';

function findEvent(score: Score, ref: ElementRef): NoteEvent | undefined {
  const part = score.parts.find((p) => p.id === ref.partId);
  const voice = part?.voices.find((v) => v.id === ref.voiceId);
  return voice?.events.find((e) => e.id === ref.eventId);
}

function describe(score: Score, ref: ElementRef): string {
  const part = score.parts.find((p) => p.id === ref.partId)!;
  const where = `${part.name} · Takt ${ref.measureNumber}`;
  if (!ref.eventId) return `${where} · Pause`;
  const ev = findEvent(score, ref);
  if (!ev) return where;
  const pitches = ev.pitches.map(pitchToString).join(' ');
  const voice = part.voices.find((v) => v.id === ref.voiceId)!;
  const staff = getInstrument(part.instrument).staves.length > 1 ? ` · System ${voice.staff + 1}` : '';
  return `${where}${staff} · ${ev.pitches.length > 1 ? 'Akkord' : 'Note'} ${pitches} · ${durationName(ev.duration)}`;
}

function clearSelection(): void {
  pagesEl.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));
  statusEl.textContent = HINT;
}

function select(score: Score, result: MeiResult, ref: ElementRef): void {
  pagesEl.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));
  // Highlight every rendered piece of the same model event (tied pieces).
  for (const [id, other] of result.elements) {
    const same = ref.eventId ? other.eventId === ref.eventId : other === ref;
    if (same) document.getElementById(id)?.classList.add('is-selected');
  }
  statusEl.textContent = describe(score, ref);
}

/**
 * Finds the model element under the pointer. Direct hits walk up from the
 * clicked SVG shape; otherwise the nearest symbol within HIT_TOLERANCE wins
 * (hollow noteheads and thin stems are hard to hit exactly).
 */
function hitTest(result: MeiResult, e: MouseEvent): ElementRef | undefined {
  for (let el = e.target as Element | null; el && el !== pagesEl; el = el.parentElement) {
    const ref = el.id ? result.elements.get(el.id) : undefined;
    if (ref) return ref;
  }
  let best: ElementRef | undefined;
  let bestDistance = HIT_TOLERANCE;
  for (const [id, ref] of result.elements) {
    const r = document.getElementById(id)?.getBoundingClientRect();
    if (!r) continue;
    const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
    const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
    const distance = Math.hypot(dx, dy);
    if (distance <= bestDistance) {
      best = ref;
      bestDistance = distance;
    }
  }
  return best;
}

async function start(): Promise<void> {
  statusEl.textContent = 'Notensatz wird geladen …';
  const engraver = await Engraver.create();
  const score = demoScore();
  const result = scoreToMei(score);
  titleEl.textContent = score.title;
  metaEl.textContent = `Fundament ${APP_VERSION} · Notensatz Verovio ${engraver.version.split('-')[0]}`;

  const render = () => {
    // Verovio lays out for a page width in its own units; match the visible paper.
    const paperPx = Math.min(pagesEl.clientWidth, 1100);
    const { pages, log } = engraver.engrave(result.mei, { pageWidth: Math.round((paperPx * 100) / SCALE), scale: SCALE });
    if (log) console.warn('[Verovio]', log);
    pagesEl.replaceChildren(
      ...pages.map((svg) => {
        const page = document.createElement('div');
        page.className = 'page';
        page.innerHTML = svg;
        return page;
      }),
    );
  };
  render();
  statusEl.textContent = HINT;

  pagesEl.addEventListener('click', (e) => {
    const ref = hitTest(result, e);
    if (ref) select(score, result, ref);
    else clearSelection();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearSelection();
  });

  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(render, 150);
  }).observe(pagesEl);
}

start().catch((err: unknown) => {
  const box = document.createElement('div');
  box.className = 'error';
  box.textContent = `Icastico konnte nicht starten:\n\n${err instanceof Error ? err.message : String(err)}`;
  pagesEl.replaceChildren(box);
  statusEl.textContent = 'Fehler beim Start';
  console.error(err);
});
