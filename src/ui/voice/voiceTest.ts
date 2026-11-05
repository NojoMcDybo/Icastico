/**
 * The "Sprachtest" dialog (plan "Sprachbefehle", package 3): the owner speaks the whole word list, sees what each
 * recogniser understood and saves the result – with the recordings, so other recognisers can be tried on the same
 * voice later without speaking everything again (`node scripts/voice-eval.mjs <file>`).
 */
import type { Platform } from '../../platform/files';
import { APP_VERSION } from '../../version';
import { RECOGNISER_RATE, resample, toBase64, toWav } from './audio';
import { GOALS, type Recognition, type Verdict, judge, summarize, testWords } from './evaluate';
import { type VoiceEngine, createEngines } from './engines';
import { Recorder } from './recorder';

interface WordResult {
  readonly word: string;
  /** The recording, 16 kHz WAV. */
  clip: Uint8Array | null;
  results: Record<string, Recognition & { verdict: Verdict }>;
}

const MIN_SECONDS = 0.15;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

const percent = (x: number) => `${(x * 100).toFixed(0)} %`;

export function voiceTestDialog(platform: Platform): Promise<void> {
  return new Promise((resolve) => {
    const words = testWords();
    const engines: VoiceEngine[] = createEngines();
    const recorder = new Recorder();
    const results: WordResult[] = words.map(({ word }) => ({ word, clip: null, results: {} }));
    let index = 0;
    let ready = false;
    let holding = false;
    let busy = false;

    const overlay = el('div', { className: 'modal' });
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const box = el('div', { className: 'modal__box voicetest' });
    overlay.append(box);

    const close = () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKeyUp, true);
      recorder.close();
      for (const e of engines) e.dispose();
      overlay.remove();
      resolve();
    };

    // ── The test itself ──
    const environment = el('select', { id: 'voice-environment' });
    environment.append(el('option', { value: 'ruhig', textContent: 'Ruhiger Raum' }), el('option', { value: 'instrument', textContent: 'Instrument im Hintergrund' }));
    const status = el('p', { className: 'voicetest__status', textContent: 'Mikrofon und Sprachmodell werden vorbereitet …' });
    const progress = el('p', { className: 'voicetest__progress' });
    const wordLabel = el('div', { className: 'voicetest__word' });
    const meter = el('div', { className: 'voicetest__meter' }, el('div'));
    const hold = el('button', { type: 'button', className: 'voicetest__hold is-primary', textContent: 'Halten und sprechen (Leertaste)', disabled: true });
    const answers = el('div', { className: 'voicetest__answers' });
    const back = el('button', { type: 'button', textContent: 'Zurück' });
    const skip = el('button', { type: 'button', textContent: 'Überspringen' });
    const finish = el('button', { type: 'button', textContent: 'Beenden und auswerten' });
    const cancel = el('button', { type: 'button', textContent: 'Abbrechen' });
    const nav = el('div', { className: 'modal__buttons' }, cancel, back, skip, finish);

    const show = () => {
      const current = results[index]!;
      wordLabel.textContent = `„${current.word}“`;
      progress.textContent = `Wort ${index + 1} von ${words.length}`;
      back.disabled = index === 0;
      answers.replaceChildren(...engines.map((e) => answerLine(e, current)));
    };
    const answerLine = (engine: VoiceEngine, current: WordResult): HTMLElement => {
      const r = current.results[engine.id];
      const line = el('div', { className: 'voicetest__answer' }, el('span', { textContent: engine.name }));
      if (r) {
        line.append(el('span', { textContent: r.text ? `„${r.text}“` : '(nichts gehört)' }), el('b', { className: `is-${r.verdict.replace(' ', '-')}`, textContent: r.verdict }));
      }
      return line;
    };
    const next = () => {
      if (index < words.length - 1) {
        index++;
        show();
      } else {
        summary();
      }
    };

    const startHold = () => {
      if (!ready || holding || busy) return;
      holding = true;
      hold.classList.add('is-holding');
      recorder.begin();
    };
    const endHold = async () => {
      if (!holding) return;
      holding = false;
      hold.classList.remove('is-holding');
      const { samples, rate } = recorder.end();
      if (samples.length / rate < MIN_SECONDS) {
        status.textContent = 'Zu kurz – bitte halten, während du sprichst.';
        return;
      }
      busy = true;
      hold.disabled = true;
      status.textContent = 'Wird erkannt …';
      const current = results[index]!;
      const clip = resample(samples, rate, RECOGNISER_RATE);
      current.clip = toWav(clip, RECOGNISER_RATE);
      const entry = words[index]!.entry;
      try {
        for (const engine of engines) {
          const heard = await engine.recognize(clip, RECOGNISER_RATE);
          current.results[engine.id] = { ...heard, verdict: judge(entry, heard) };
        }
        status.textContent = 'Fertig.';
      } catch (err) {
        status.textContent = `Fehler bei der Erkennung: ${err instanceof Error ? err.message : String(err)}`;
      }
      show();
      busy = false;
      hold.disabled = false;
      window.setTimeout(() => {
        if (!holding && !busy && overlay.isConnected && results[index] === current) next();
      }, 1400);
    };

    hold.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      startHold();
    });
    window.addEventListener('pointerup', () => void endHold());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.code === 'Space' && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLButtonElement && e.target !== hold)) {
        e.preventDefault();
        if (!e.repeat) startHold();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        void endHold();
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp, true);

    back.addEventListener('click', () => {
      if (index > 0) {
        index--;
        show();
      }
    });
    skip.addEventListener('click', next);
    cancel.addEventListener('click', close);
    finish.addEventListener('click', () => summary());

    // ── The evaluation ──
    const summary = () => {
      const heardAny = results.filter((r) => r.clip);
      const table = el('table', { className: 'voicetest__table' });
      table.append(el('tr', {}, ...['Erkenner', 'richtig', 'falsch', 'nicht verstanden', 'Dauer', 'Ziel erreicht?'].map((t) => el('th', { textContent: t }))));
      const perEngine: Record<string, ReturnType<typeof summarize>> = {};
      for (const engine of engines) {
        const rows = heardAny.map((r) => r.results[engine.id]).filter((r): r is NonNullable<typeof r> => !!r);
        const s = summarize(rows);
        perEngine[engine.id] = s;
        const goal = environment.value === 'ruhig' ? GOALS.treffer : GOALS.trefferMitInstrument;
        const ok = s.total > 0 && s.trefferquote >= goal && s.fehlerquote < GOALS.falsch && s.meanMs < GOALS.ms;
        table.append(
          el('tr', {}, el('td', { textContent: engine.name }), el('td', { textContent: `${s.richtig} (${percent(s.trefferquote)})` }), el('td', { textContent: `${s.falsch} (${percent(s.fehlerquote)})` }), el('td', { textContent: String(s.nichtVerstanden) }), el('td', { textContent: `${s.meanMs} ms` }), el('td', { textContent: ok ? 'ja' : 'nein' })),
        );
      }
      const withClips = el('input', { type: 'checkbox', id: 'voice-clips', checked: true });
      const save = el('button', { type: 'button', className: 'is-primary', textContent: 'Ergebnis speichern' });
      const done = el('button', { type: 'button', textContent: 'Schließen' });
      const note = el('p', { className: 'voicetest__hint', textContent: `${heardAny.length} von ${words.length} Wörtern gesprochen. Ziele (Plan): richtig ≥ ${percent(environment.value === 'ruhig' ? GOALS.treffer : GOALS.trefferMitInstrument)}, falsch < ${percent(GOALS.falsch)}, Dauer < ${GOALS.ms} ms.` });
      save.addEventListener('click', async () => {
        const file = {
          format: 'icastico-sprachtest',
          version: 1,
          app: APP_VERSION,
          date: new Date().toISOString(),
          umgebung: environment.value,
          schwellwert: 0.8,
          engines: engines.map((e) => e.id),
          zusammenfassung: perEngine,
          words: results.map((r) => ({ word: r.word, ...(r.clip && withClips.checked ? { clip: toBase64(r.clip) } : {}), results: r.results })),
        };
        const saved = await platform.exportFile(JSON.stringify(file, null, 2), `Sprachtest-${new Date().toISOString().slice(0, 10)}`, { name: 'Sprachtest', extension: 'json', mime: 'application/json' });
        if (saved) status.textContent = `Gespeichert: ${saved.name}`;
      });
      done.addEventListener('click', close);
      box.replaceChildren(
        el('h2', { textContent: 'Sprachtest – Ergebnis' }),
        note,
        table,
        el('p', {}, withClips, el('label', { htmlFor: 'voice-clips', textContent: ' Aufnahmen mitspeichern (empfohlen: dann lassen sich weitere Erkenner an deiner Stimme ausprobieren)' })),
        status,
        el('div', { className: 'modal__buttons' }, done, save),
      );
    };

    box.append(
      el('h2', { textContent: 'Sprachtest' }),
      el('p', { textContent: 'Halte die Leertaste (oder den Knopf) gedrückt, sage das Wort, lass los. Du siehst sofort, was verstanden wurde. Insgesamt sind es ' + words.length + ' kurze Wörter; du kannst jederzeit beenden.' }),
      el('div', { className: 'form__row' }, el('label', { className: 'form__label', htmlFor: 'voice-environment', textContent: 'Umgebung' }), el('div', { className: 'form__control' }, environment)),
      progress,
      wordLabel,
      meter,
      hold,
      answers,
      status,
      nav,
    );
    document.body.append(overlay);
    show();

    recorder.onLevel = (level) => ((meter.firstElementChild as HTMLElement).style.width = `${Math.round(level * 100)}%`);
    void (async () => {
      try {
        await recorder.open();
        status.textContent = 'Sprachmodell wird geladen …';
        for (const engine of engines) await engine.load((m) => (status.textContent = m));
        ready = true;
        hold.disabled = false;
        status.textContent = 'Bereit. Leertaste halten und das Wort sagen.';
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : String(err);
      }
    })();
  });
}
