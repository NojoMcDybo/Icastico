/**
 * The start screen (ADR 0034): an E7♯9 builds up while sand on a vibrating plate draws the tones – a Chladni figure
 * that changes with every note that enters. It lasts a few seconds, is never longer than loading takes and can be skipped
 * with a click or any key.
 */
import { CHORD_END, CHORD_NAME, START_CHORD, modeValue, toneLevel } from '../core/chladni';
import type { PlaybackPlan } from '../core/playback';
import { SimpleSynth } from '../audio/simpleSynth';
import type { Playing } from '../audio/engine';

/** The sand rests at least this long, so that the figure is seen before the app appears. */
const MIN_SECONDS = 3.3;
const FADE_MS = 600;
const GRID = 192;
const GRAINS = 14000;
/** Sound and picture start together; this is what the sound needs to get going. */
const LEAD_MS = 80;

export interface Splash {
  /** Resolves when the screen has gone; call it when the app is ready. */
  done(): Promise<void>;
}

const NONE: Splash = { done: async () => undefined };

export function startSplash(): Splash {
  const root = document.getElementById('splash');
  if (!root) return NONE;
  // Not in automated tests (unless asked for with ?splash) and not for people who want less motion.
  const automated = navigator.webdriver && !new URLSearchParams(location.search).has('splash');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = root.querySelector('canvas');
  const ctx2d = canvas?.getContext('2d');
  if (automated || calm || !canvas || !ctx2d) {
    root.remove();
    return NONE;
  }
  const chordLabel = root.querySelector('.splash__chord');
  if (chordLabel) chordLabel.textContent = CHORD_NAME;

  // The plate's modes, looked up from a grid so that thousands of grains cost next to nothing.
  const grids = START_CHORD.map(({ mode }) => {
    const grid = new Float32Array(GRID * GRID);
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) grid[j * GRID + i] = modeValue(mode, (i + 0.5) / GRID, (j + 0.5) / GRID);
    return grid;
  });
  const xs = new Float32Array(GRAINS);
  const ys = new Float32Array(GRAINS);
  for (let g = 0; g < GRAINS; g++) {
    xs[g] = Math.random();
    ys[g] = Math.random();
  }

  // The sound: the small built-in synthesizer, so nothing has to be loaded first.
  const plan: PlaybackPlan = {
    notes: START_CHORD.map((tone) => ({
      instrument: 'piano',
      start: tone.at,
      end: CHORD_END,
      path: [
        { t: tone.at, midi: tone.midi },
        { t: CHORD_END, midi: tone.midi },
      ],
    })),
    length: CHORD_END,
  };
  let playing: Playing | null = null;
  let over = false;
  // Without permission to play (a browser asks for a click first) this never answers: then the picture runs without sound.
  void new SimpleSynth()
    .play(plan, 0)
    .then((p) => {
      playing = p;
      if (over) p.stop();
    })
    .catch(() => undefined);

  const t0 = performance.now() + LEAD_MS;
  let skipped = false;
  let frame = 0;
  const resolveDone: { run: () => void } = { run: () => undefined };
  const finished = new Promise<void>((resolve) => (resolveDone.run = resolve));

  const size = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  };
  size();
  window.addEventListener('resize', size);

  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    const levels = START_CHORD.map((tone) => toneLevel(tone, t));
    // Grains jump the further, the more the plate moves where they lie; on the resting lines they stay.
    for (let pass = 0; pass < 2; pass++) {
      for (let g = 0; g < GRAINS; g++) {
        const cell = Math.min(GRID - 1, (ys[g]! * GRID) | 0) * GRID + Math.min(GRID - 1, (xs[g]! * GRID) | 0);
        let v = 0;
        for (let k = 0; k < grids.length; k++) v += levels[k]! * grids[k]![cell]!;
        const step = 0.04 * Math.min(1, Math.abs(v) / 1.4);
        let x = xs[g]! + (Math.random() - 0.5) * 2 * step;
        let y = ys[g]! + (Math.random() - 0.5) * 2 * step;
        if (x < 0 || x > 1) x = x < 0 ? -x : 2 - x;
        if (y < 0 || y > 1) y = y < 0 ? -y : 2 - y;
        xs[g] = Math.min(1, Math.max(0, x));
        ys[g] = Math.min(1, Math.max(0, y));
      }
    }

    const w = canvas.width;
    const h = canvas.height;
    const side = Math.min(w, h) * 0.56;
    const left = (w - side) / 2;
    const top = (h - side) / 2 - h * 0.04;
    ctx2d.clearRect(0, 0, w, h);
    ctx2d.fillStyle = 'rgb(255 255 255 / 0.04)';
    ctx2d.strokeStyle = 'rgb(255 255 255 / 0.14)';
    ctx2d.lineWidth = Math.max(1, w / 900);
    ctx2d.beginPath();
    ctx2d.roundRect(left - side * 0.03, top - side * 0.03, side * 1.06, side * 1.06, side * 0.04);
    ctx2d.fill();
    ctx2d.stroke();
    ctx2d.fillStyle = 'rgb(245 245 247 / 0.88)';
    const grain = Math.max(1.4, side / 340);
    for (let g = 0; g < GRAINS; g++) ctx2d.fillRect(left + xs[g]! * side, top + ys[g]! * side, grain, grain);
    if (t > 0.9) chordLabel?.classList.add('is-on');
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);

  const skip = (e: Event) => {
    skipped = true;
    e.stopPropagation(); // the key or click that ends the screen is not meant for the app behind it
  };
  window.addEventListener('keydown', skip, true);
  window.addEventListener('pointerdown', skip, true);

  const leave = () => {
    over = true;
    playing?.stop();
    root.classList.add('is-leaving');
    window.setTimeout(() => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', size);
      window.removeEventListener('keydown', skip, true);
      window.removeEventListener('pointerdown', skip, true);
      root.remove();
      resolveDone.run();
    }, FADE_MS);
  };

  return {
    done: () =>
      new Promise<void>((resolve) => {
        const wait = () => {
          if (skipped || (performance.now() - t0) / 1000 >= MIN_SECONDS) leave();
          else window.setTimeout(wait, 50);
        };
        wait();
        void finished.then(resolve);
      }),
  };
}
