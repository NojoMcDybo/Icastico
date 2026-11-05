/**
 * The recognisers under test (plan "Sprachbefehle", package 3, ADR 0025). Each one takes a finished recording
 * (the user holds the key while speaking) and answers with the text it understood.
 * Today: Vosk (WebAssembly, runs in the web view, offline) with and without a fixed word list.
 */
import type { Recognition } from './evaluate';
import { RECOGNISER_RATE, resample } from './audio';
import { VOCABULARY_DE } from './vocabulary.de';

export interface VoiceEngine {
  readonly id: string;
  readonly name: string;
  /** Loads the model (big, once). */
  load(status: (message: string) => void): Promise<void>;
  recognize(samples: Float32Array, rate: number): Promise<Recognition>;
  dispose(): void;
}

/** Where the model lives: next to the app, fetched by `npm run voice`. */
export const VOSK_MODEL_URL = `${import.meta.env.BASE_URL}voice/vosk-model-small-de-0.15.tar.gz`;

type VoskModule = typeof import('vosk-browser');
type VoskModel = Awaited<ReturnType<VoskModule['createModel']>>;

/** One loaded model shared by the Vosk variants (a second copy would double the memory). */
class VoskModelHolder {
  private model: Promise<VoskModel> | null = null;
  private users = 0;

  acquire(status: (message: string) => void): Promise<VoskModel> {
    this.users++;
    this.model ??= import('vosk-browser').then(({ createModel }) => {
      status('Sprachmodell wird geladen (46 MB) …');
      return createModel(VOSK_MODEL_URL, -1);
    });
    return this.model;
  }

  release(): void {
    if (--this.users > 0) return;
    void this.model?.then((m) => m.terminate());
    this.model = null;
  }
}

/** Vosk, either free or held to the words of the vocabulary (a grammar: it can only answer with those words). */
class VoskEngine implements VoiceEngine {
  private model: VoskModel | null = null;

  constructor(
    private readonly holder: VoskModelHolder,
    readonly id: string,
    readonly name: string,
    private readonly grammar: string | undefined,
  ) {}

  async load(status: (message: string) => void): Promise<void> {
    this.model = await this.holder.acquire(status);
  }

  recognize(samples: Float32Array, rate: number): Promise<Recognition> {
    const model = this.model;
    if (!model) return Promise.reject(new Error('Das Sprachmodell ist nicht geladen'));
    const started = performance.now();
    return new Promise((resolve) => {
      const recognizer = new model.KaldiRecognizer(RECOGNISER_RATE, this.grammar);
      recognizer.setWords(true);
      const texts: string[] = [];
      const confidences: number[] = [];
      let timer = 0;
      const done = () => {
        recognizer.remove();
        resolve({
          text: texts.join(' ').trim(),
          confidence: confidences.length ? Math.min(...confidences) : 0,
          ms: Math.round(performance.now() - started) - SETTLE_MS,
        });
      };
      recognizer.on('result', (message) => {
        if (message.event !== 'result') return;
        const { text, result } = message.result;
        if (text) texts.push(text);
        for (const word of result ?? []) confidences.push(word.conf);
        // The final answer is the last one; wait a moment for stragglers before closing.
        clearTimeout(timer);
        timer = window.setTimeout(done, SETTLE_MS);
      });
      const clip = resample(samples, rate, RECOGNISER_RATE);
      const padded = new Float32Array(clip.length + RECOGNISER_RATE * 0.6); // silence at the end lets the recogniser close the phrase
      padded.set(clip);
      recognizer.acceptWaveformFloat(padded, RECOGNISER_RATE);
      recognizer.retrieveFinalResult();
      // Nothing heard at all would never produce a result event: do not wait for ever.
      timer = window.setTimeout(done, 4000);
    });
  }

  dispose(): void {
    if (this.model) this.holder.release();
    this.model = null;
  }
}

/** How long to wait after a result for another one (see `recognize`). */
const SETTLE_MS = 150;

/** The words of the vocabulary as a Vosk grammar (lower case, "[unk]" = anything else, so noise has somewhere to go). */
export function voskGrammar(): string {
  const phrases = new Set(VOCABULARY_DE.flatMap((entry) => entry.words.map((w) => w.toLowerCase())));
  return JSON.stringify([...phrases, '[unk]']);
}

export function createEngines(): VoiceEngine[] {
  const holder = new VoskModelHolder();
  return [
    new VoskEngine(holder, 'vosk-wortliste', 'Vosk mit Wortliste', voskGrammar()),
    new VoskEngine(holder, 'vosk-frei', 'Vosk frei', undefined),
  ];
}
